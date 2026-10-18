package com.surge.downloader.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.surge.downloader.R
import com.surge.downloader.core.Classifier
import com.surge.downloader.core.Engines
import com.surge.downloader.core.MediaStoreSink
import com.surge.downloader.receiver.NotificationActionReceiver
import com.surge.downloader.widget.SurgeWidget
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Process-level home of every transfer.
 *
 * Rules it obeys:
 *  1. FOREGROUND, type dataSync — the only sanctioned way to keep sockets open
 *     after the user swipes the app away.
 *  2. The WebView is a VIEW, not the owner of state. This service polls the
 *     engine registry on a scheduler and fans results out three ways: bridge
 *     poll, notification shade, home widget. Kill any one, transfers continue.
 *  3. Wake lock held only while bytes are actually moving.
 *  4. Shade + widget updates are throttled to ~2s (NotificationManager
 *     rate-limits chatty posts; RemoteViews updates wake the launcher).
 */
class DownloadService : Service() {

    companion object {
        const val CHANNEL_ONGOING = "surge_ongoing"
        const val CHANNEL_DONE = "surge_done"
        const val CHANNEL_ERROR = "surge_error"
        const val NOTIF_ID_ONGOING = 1001

        fun start(context: Context) {
            val i = Intent(context, DownloadService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i)
                else context.startService(i)
            } catch (e: Exception) {
                // Android 12+ forbids FGS starts from background (widget tap
                // during Doze, boot restore). Degrade instead of crashing.
                android.util.Log.w("DownloadService", "FGS start blocked: ${e.message}")
                try { context.startService(i) } catch (_: Exception) { }
            }
        }

        fun stop(context: Context) = context.stopService(Intent(context, DownloadService::class.java))
    }

    private lateinit var sink: MediaStoreSink
    private lateinit var nm: NotificationManager
    private var wake: PowerManager.WakeLock? = null
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "surge-poll") }
    private var poll: ScheduledFuture<*>? = null
    private var lastFanout = 0L
    private var wasIdle = false
    private val seenState = mutableMapOf<String, String>()

    override fun onCreate() {
        android.util.Log.i("SurgeBoot", "DownloadService.onCreate")
        super.onCreate()
        nm = getSystemService(NotificationManager::class.java)
        createChannels()
        sink = MediaStoreSink(this)

        Engines.init(
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO),
            applicationContext,
        )
        Classifier.ensureFolders(this)

        promote()
        poll = scheduler.scheduleWithFixedDelay(::tick, 800, 900, TimeUnit.MILLISECONDS)
        android.util.Log.i("SurgeBoot", "DownloadService ready (engines: http+torrent+ytdlp)")
    }

    private fun promote() {
        val n = buildOngoing(emptyList(), 0, 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID_ONGOING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID_ONGOING, n)
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ONGOING, "Active downloads", NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
                setSound(null, null)
                description = "Live progress while files are transferring"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_DONE, "Completed", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "A download finished and is ready to open"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ERROR, "Problems", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Failures and retries that need your attention"
            },
        )
    }

    /* ------------------------------------------------------------- tick ---- */

    private fun tick() {
        Engines.sample()
        val snaps = Engines.snapshots()
        val (down, up, active) = Engines.totals()

        for (s in snaps) {
            val prev = seenState[s.id]
            seenState[s.id] = s.state
            if (prev != s.state) {
                if (s.state == "complete") onFinished(s)
                if (s.state == "error") onFailed(s)
            }
        }

        if (down > 0 || up > 0) acquireWake() else releaseWake()

        val now = System.currentTimeMillis()
        val idle = snaps.none { it.state == "active" || it.state == "seeding" || it.state == "waiting" }
        if (idle != wasIdle || now - lastFanout > 2000) {
            lastFanout = now
            wasIdle = idle
            nm.notify(NOTIF_ID_ONGOING, if (idle) buildIdle() else buildOngoing(snaps.filter { it.state == "active" || it.state == "seeding" }, down, up))
            SurgeWidget.refresh(this, active, down, up, snaps.firstOrNull { it.state == "active" }?.name)
        }
    }

    private fun onFinished(s: Engines.Snap) {
        if (!Engines.published.add(s.id)) return
        val file = s.file
        when {
            file == null -> {}
            file.isFile -> sink.publish(file, s.category)
            // Torrents finish as a DIRECTORY: publish every payload file, each
            // re-classified into its own category folder (iso -> compressed,
            // mkv -> videos, ...), which is what the auto-filing promise means
            // for multi-file torrents.
            file.isDirectory -> file.listFiles()?.forEach { f ->
                if (f.isFile) sink.publish(f, Classifier.classify(name = f.name))
            }
        }
        notifyResult(CHANNEL_DONE, "Download complete", "${s.name} · filed to ${s.category}/", R.drawable.ic_stat_surge)
    }

    private fun onFailed(s: Engines.Snap) {
        notifyResult(CHANNEL_ERROR, "Download failed", "${s.name} · ${s.error ?: "connection error"}", R.drawable.ic_stat_surge)
    }

    /* ------------------------------------------------------ notifications -- */

    /**
     * Intent for the app's launcher activity, resolved through the package
     * manager: a library module must not reference app-module classes.
     */
    private fun openAppIntent(route: String): PendingIntent =
        PendingIntent.getActivity(
            this, route.hashCode(),
            launchIntent(route),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun launchIntent(route: String): Intent =
        packageManager.getLaunchIntentForPackage(packageName)!!
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("route", route)

    private fun actionIntent(action: String): PendingIntent =
        PendingIntent.getBroadcast(
            this, action.hashCode(),
            Intent(this, NotificationActionReceiver::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun buildOngoing(active: List<Engines.Snap>, down: Long, up: Long): Notification {
        val top = active.maxByOrNull { it.speed }
        val pct = if (top != null && top.total > 0) (top.done * 100 / top.total).toInt() else 0
        return NotificationCompat.Builder(this, CHANNEL_ONGOING)
            .setSmallIcon(R.drawable.ic_stat_surge)
            .setContentTitle("Downloading ${active.size} file${if (active.size == 1) "" else "s"} · ${human(down)}/s")
            .setContentText(top?.let { "${it.name} — $pct%" } ?: "Surge")
            .setProgress(100, pct, top == null || top.total == 0L)
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true).setGroup("surge")
            .setContentIntent(openAppIntent("/"))
            .addAction(0, "Pause all", actionIntent(NotificationActionReceiver.ACTION_PAUSE_ALL))
            .addAction(0, "Queue", openAppIntent("/queue"))
            .addAction(0, "Stop", actionIntent(NotificationActionReceiver.ACTION_STOP_ALL))
            .build()
    }

    private fun buildIdle(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ONGOING)
            .setSmallIcon(R.drawable.ic_stat_surge)
            .setContentTitle("Surge").setContentText("All downloads complete")
            .setOngoing(false).setSilent(true).setGroup("surge")
            .setContentIntent(openAppIntent("/library"))
            .build()

    private fun notifyResult(channel: String, title: String, body: String, icon: Int) {
        nm.notify(
            System.currentTimeMillis().toInt(),
            NotificationCompat.Builder(this, channel)
                .setSmallIcon(icon).setContentTitle(title).setContentText(body)
                .setAutoCancel(true).setContentIntent(openAppIntent("/library"))
                .addAction(0, "Open", openAppIntent("/library"))
                .addAction(0, "Share", actionIntent(NotificationActionReceiver.ACTION_SHARE_LAST))
                .build(),
        )
    }

    private fun human(bytes: Long): String = when {
        bytes >= 1L shl 30 -> String.format("%.1f GB", bytes / 1024.0 / 1024 / 1024)
        bytes >= 1L shl 20 -> String.format("%.1f MB", bytes / 1024.0 / 1024)
        bytes >= 1024 -> String.format("%.0f KB", bytes / 1024.0)
        else -> "$bytes B"
    }

    /* --------------------------------------------------------- wake lock --- */

    private fun acquireWake() {
        if (wake?.isHeld == true) return
        wake = (getSystemService(PowerManager::class.java) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "surge:transfer")
            .apply { setReferenceCounted(false); acquire(10 * 60 * 1000) }
    }

    private fun releaseWake() {
        if (wake?.isHeld == true) wake?.release()
        wake = null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        poll?.cancel(true)
        scheduler.shutdown()
        releaseWake()
        Engines.shutdown()
        super.onDestroy()
    }
}
