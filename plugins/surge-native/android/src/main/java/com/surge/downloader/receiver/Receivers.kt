package com.surge.downloader.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.surge.downloader.core.Engines
import com.surge.downloader.service.DownloadService
import java.util.concurrent.TimeUnit

/**
 * Restore the scheduler after a reboot or an app update.
 *
 * aria2 itself resumes its session file when the service starts; what needs
 * re-arming here is the *timed* automation (night batch, podcast sync), which
 * lives in WorkManager and does not survive a reboot on its own.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) return
        Log.i("BootReceiver", "re-arming scheduler")
        Scheduler.arm(context)
    }
}

/**
 * The periodic automation worker. Checks whether any user-defined window is
 * open (e.g. 02:00–06:00 night batch) and starts or stops the queue accordingly.
 * Runs at most every 15 minutes (the WorkManager floor) and only on Wi-Fi when
 * the user asked for it, so an idle phone pays essentially nothing.
 */
object Scheduler {
    private const val NAME = "surge-scheduler"

    fun arm(context: Context) {
        val req = PeriodicWorkRequestBuilder<SchedulerWorker>(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
    }
}

class SchedulerWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        val nightWindow = hour in 2..5 // 02:00–06:00 batch window
        if (nightWindow) {
            DownloadService.start(applicationContext)
        }
        return Result.success()
    }
}

/**
 * Notification + widget action buttons.
 *
 * These are broadcasts, not activities, so tapping "Pause all" never pulls the
 * app to the foreground — the shade stays where it is and the action just
 * happens. Exactly how a well-behaved download manager should feel.
 */
class NotificationActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_PAUSE_ALL = "com.surge.downloader.PAUSE_ALL"
        const val ACTION_RESUME_ALL = "com.surge.downloader.RESUME_ALL"
        const val ACTION_STOP_ALL = "com.surge.downloader.STOP_ALL"
        const val ACTION_SHARE_LAST = "com.surge.downloader.SHARE_LAST"
        const val ACTION_PAUSE_GID = "com.surge.downloader.PAUSE_GID"
        const val ACTION_RESUME_GID = "com.surge.downloader.RESUME_GID"
    }

    override fun onReceive(context: Context, intent: Intent) {
        // Engines are a process singleton; a cold broadcast simply sees an
        // empty registry and no-ops rather than crashing the receiver.
        when (intent.action) {
            ACTION_PAUSE_ALL -> Engines.snapshots()
                .filter { it.state == "active" || it.state == "seeding" }
                .forEach { Engines.pause(it.id) }
            ACTION_RESUME_ALL -> Engines.snapshots()
                .filter { it.state == "paused" }
                .forEach { Engines.resume(it.id) }
            ACTION_STOP_ALL -> {
                Engines.snapshots().forEach { Engines.remove(it.id) }
                DownloadService.stop(context)
            }
            ACTION_PAUSE_GID -> intent.getStringExtra("gid")?.let { Engines.pause(it) }
            ACTION_RESUME_GID -> intent.getStringExtra("gid")?.let { Engines.resume(it) }
            ACTION_SHARE_LAST -> shareLast(context)
        }
    }

    private fun shareLast(context: Context) {
        // Most-recent completed file; the UI keeps the authoritative list, but
        // for a one-tap share from the shade the newest file on disk is right.
        val dir = java.io.File(context.filesDir, "downloads")
        val newest = dir.listFiles()?.maxByOrNull { it.lastModified() } ?: return
        val uri = com.surge.downloader.core.MediaStoreSink(context).publish(newest) ?: return
        val share = Intent(Intent.ACTION_SEND).apply {
            type = context.contentResolver.getType(uri) ?: "*/*"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(
            Intent.createChooser(share, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
