package com.surge.downloader.plugins

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.surge.downloader.core.Classifier
import com.surge.downloader.core.Engines
import com.surge.downloader.core.Ffmpeg
import com.surge.downloader.core.MediaStoreSink
import com.surge.downloader.core.YtDlp
import com.surge.downloader.service.DownloadService
import com.surge.downloader.widget.SurgeWidget
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The Capacitor plugin surface — seven plugins auto-registered by the bridge
 * from these @CapacitorPlugin annotations (cap sync writes them into
 * assets/capacitor.plugins.json; the stock BridgeActivity does the rest).
 *
 * Every method here is a thin adapter over `Engines` (http / torrent / yt-dlp).
 * The JS contract in src/lib/native.js is unchanged from the aria2 era: the
 * same names, the same aria2-shaped status objects, so the Vue app never had to
 * learn that the engine underneath was replaced.
 */

@CapacitorPlugin(name = "Downloader")
class DownloaderPlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.IO)

    @PluginMethod
    fun start(call: PluginCall) {
        DownloadService.start(context)
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun restore(call: PluginCall) {
        // Engines are session-scoped; the queue re-populates as the user adds
        // work. Returning immediately keeps boot off any I/O path.
        call.resolve(JSObject().put("items", JSArray()))
    }

    @PluginMethod
    fun add(call: PluginCall) {
        // JS posts the item's fields at the TOP level of the call object, so
        // PluginCall's own typed accessors are the correct (and only) way in.
        val url = call.getString("url") ?: return call.reject("url required")
        val engine = call.getString("engine", "http")
        val kind = call.getString("kind", "http")
        val name = call.getString("name") ?: url.substringAfterLast('/').take(64)
        val override = call.getString("category")
        val id = UUID.randomUUID().toString()

        val category = Classifier.classify(
            name = name,
            url = url,
            kind = kind,
            override = override,
            disabled = Classifier.disabledBlocking(context),
        )
        val dir = Classifier.absoluteDir(context, category).apply { mkdirs() }
        Engines.categories[id] = category
        Engines.init(scope, context.applicationContext)

        scope.launch {
            try {
                when {
                    engine == "ytdlp" -> {
                        val res = call.getObject("selectedFormat")?.optString("res")
                            ?.removeSuffix("p")?.ifBlank { "1080" } ?: "1080"
                        val convert = call.getBoolean("convertToMp3", false) ?: false
                        val kbps = call.getInt("mp3Bitrate", 320) ?: 320
                        val audioOnly = call.getBoolean("audioOnly", false) ?: false
                        val file = File(dir, sanitise(name) + ".mp4")
                        Engines.addYt(id, url, file, res, if (audioOnly) kbps else null, convert, category)
                    }
                    kind == "magnet" || url.startsWith("magnet:") -> {
                        Engines.kinds[id] = Engines.Kind.TORRENT
                        Engines.torrent.addMagnet(id, url, dir)
                    }
                    kind == "torrent" || url.endsWith(".torrent") -> {
                        Engines.kinds[id] = Engines.Kind.TORRENT
                        val local = if (url.startsWith("/")) File(url) else null
                        if (local != null && local.exists()) Engines.torrent.addTorrentFile(id, local, dir)
                        else Engines.torrent.addMagnet(id, url, dir)
                    }
                    else -> {
                        Engines.kinds[id] = Engines.Kind.HTTP
                        val file = File(dir, sanitise(name))
                        Engines.http.add(id, url, file, call.getInt("connections", 16) ?: 16)
                        Engines.http.resume(id)
                    }
                }
                withContext(Dispatchers.Main) { call.resolve(JSObject().put("gid", id)) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject(e.message ?: "add failed") }
            }
        }
        DownloadService.start(context)
    }

    @PluginMethod fun pause(call: PluginCall) = byId(call) { Engines.pause(it) }
    @PluginMethod fun resume(call: PluginCall) = byId(call) { Engines.resume(it) }
    @PluginMethod fun cancel(call: PluginCall) = byId(call) { Engines.remove(it) }

    @PluginMethod
    fun remove(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        val delete = call.getBoolean("deleteFile", false) == true
        if (delete) {
            Engines.snapshots().firstOrNull { it.id == id }?.file?.let { runCatching { it.delete() } }
        }
        Engines.remove(id)
        call.resolve()
    }

    /**
     * The 1 Hz batched poll: global rates + every item + browser sniffs.
     * One round-trip instead of a storm of bridge messages.
     */
    @PluginMethod
    fun poll(call: PluginCall) {
        scope.launch {
            Engines.sample()
            val (down, up, _) = Engines.totals()
            val out = JSObject()
            out.put("down", down); out.put("up", up)
            val items = JSArray()
            Engines.snapshots().forEach { items.put(snapToJs(it)) }
            out.put("items", items)
            val sniffs = JSArray()
            com.surge.downloader.service.SniffBus.drain().forEach { (u, size) ->
                sniffs.put(JSObject().apply { put("url", u); put("size", size) })
            }
            out.put("sniffed", sniffs)
            withContext(Dispatchers.Main) { call.resolve(out) }
        }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        val s = Engines.snapshots().firstOrNull { it.id == id }
        if (s == null) call.reject("unknown gid") else call.resolve(snapToJs(s))
    }

    @PluginMethod
    fun setSpeedLimit(call: PluginCall) {
        val down = call.getInt("down", -1) ?: -1
        val up = call.getInt("up", -1) ?: -1
        Engines.http.globalLimitBytesPerSec = if (down > 0) down * 1024L else 0
        call.resolve()
        void(up)
    }

    /** Launch the native sniffing WebView (the Capacitor WebView can't nest). */
    @PluginMethod
    fun openSniffer(call: PluginCall) {
        val url = call.getString("url") ?: "about:blank"
        context.startActivity(
            Intent(context, com.surge.downloader.service.SnifferActivity::class.java)
                .putExtra("url", url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        call.resolve()
    }

    @PluginMethod
    fun wallpaperColors(call: PluginCall) {
        val out = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            runCatching {
                val wm = context.getSystemService(Context.WALLPAPER_SERVICE) as android.app.WallpaperManager
                val d = wm.drawable
                if (d != null) {
                    val w = d.intrinsicWidth.coerceIn(1, 64)
                    val h = d.intrinsicHeight.coerceIn(1, 64)
                    val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
                    val c = android.graphics.Canvas(bmp)
                    d.setBounds(0, 0, w, h)
                    d.draw(c)
                    val palette = androidx.palette.graphics.Palette.from(bmp).generate()
                    out.put("p", hex(palette.getVibrantColor(palette.getDarkMutedColor(0xFF2D3047.toInt()))))
                    out.put("s", hex(palette.getMutedColor(0xFF2EC4B6.toInt())))
                    out.put("t", hex(palette.getLightVibrantColor(0xFFFF7A59.toInt())))
                    bmp.recycle()
                }
            }
        }
        call.resolve(out)
    }

    /* ------------------------------------------------------------- helpers -- */

    private fun byId(call: PluginCall, block: (String) -> Unit) {
        val id = call.getString("id") ?: return call.reject("id required")
        block(id)
        call.resolve()
    }

    private fun snapToJs(s: Engines.Snap): JSObject = JSObject().apply {
        put("id", s.id)
        put("name", s.name)
        put("state", mapState(s.state))
        put("totalBytes", s.total)
        put("doneBytes", s.done)
        put("speed", s.speed)
        put("uploadSpeed", s.upload)
        put("connections", s.connections)
        put("seeds", s.seeds)
        put("peers", s.peers)
        put("category", s.category)
        put("error", s.error)
    }

    private fun mapState(s: String) = when (s) {
        "active", "seeding" -> "active"
        "waiting" -> "queued"
        "paused" -> "paused"
        "complete" -> "complete"
        else -> "error"
    }

    private fun sanitise(n: String): String =
        n.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(120).ifBlank { "download" }

    private fun hex(c: Int) = String.format("#%06X", 0xFFFFFF and c)
    private fun void(a: Any?) = Unit
}

/* ======================================================================= */

@CapacitorPlugin(name = "Torrent")
class TorrentPlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.IO)

    /** Pre-download inspection: file tree, peer counts. Runs on a worker. */
    @PluginMethod
    fun inspect(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        scope.launch {
            val id = "inspect-" + UUID.randomUUID()
            val dir = File(context.cacheDir, "torrent-inspect").apply { mkdirs() }
            val t = Engines.torrent.addMagnet(id, url, dir)
            // give DHT/trackers a beat, then read the tree and drop the task
            Thread.sleep(2500)
            val files = JSArray()
            Engines.torrent.files(id).forEachIndexed { i, (path, size, selected) ->
                files.put(JSObject().apply {
                    put("path", path); put("size", size); put("selected", selected); put("index", i + 1)
                })
            }
            val seeds = t.seeds; val peers = t.peers; val total = t.total; val name = t.name
            Engines.torrent.remove(id)
            withContext(Dispatchers.Main) {
                call.resolve(JSObject().apply {
                    put("files", files); put("seeds", seeds); put("peers", peers)
                    put("totalBytes", total); put("name", name)
                    put("trackers", JSArray().put("dht").put("peer exchange"))
                })
            }
        }
    }
}

/* ======================================================================= */

@CapacitorPlugin(name = "Media")
class MediaPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO)

    @PluginMethod
    fun probe(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        scope.launch {
            YtDlp.init(context)
            val meta = YtDlp.probe(url)
            withContext(Dispatchers.Main) {
                if (meta == null) call.reject("extraction failed")
                else call.resolve(JSObject().apply {
                    put("title", meta["title"]); put("channel", meta["uploader"])
                    put("duration", meta["duration"]); put("thumb", meta["thumbnail"])
                    put("views", meta["view_count"])
                    put("formats", org.json.JSONArray(meta["formats"] ?: emptyList<Any>()))
                    put("subtitles", org.json.JSONArray(meta["subtitles"] ?: emptyList<Any>()))
                    put("playlist", meta["playlist_count"] ?: 0)
                })
            }
        }
    }

    @PluginMethod
    fun convertToMp3(call: PluginCall) {
        val src = call.getString("src") ?: return call.reject("src required")
        val dst = call.getString("dst") ?: return call.reject("dst required")
        val kbps = call.getInt("kbps", 320) ?: 320
        scope.launch {
            val ok = Ffmpeg.toMp3(context, File(src), File(dst), kbps)
            withContext(Dispatchers.Main) {
                if (ok) MediaStoreSink(context).publish(File(dst), "music")
                call.resolve(JSObject().put("ok", ok))
            }
        }
    }
}

/* ======================================================================= */

@CapacitorPlugin(name = "Storage")
class StoragePlugin : Plugin() {

    /** WebView pushes root/disabled config down; recreates the folder tree. */
    @PluginMethod
    fun configureStorage(call: PluginCall) {
        val root = call.getString("root")
        val arr = call.getArray("disabled")
        val disabled = if (arr == null) null else
            (0 until arr.length()).mapNotNull { arr.optString(it) }.toSet()
        CoroutineScope(Dispatchers.IO).launch {
            Classifier.configure(context, root, disabled)
            Classifier.ensureFolders(context)
            withContext(Dispatchers.Main) { call.resolve() }
        }
    }

    @PluginMethod
    fun ensureFolders(call: PluginCall) {
        Classifier.ensureFolders(context)
        val folders = JSArray()
        Classifier.CATEGORY_IDS.forEach { id ->
            val d = Classifier.absoluteDir(context, id)
            folders.put(JSObject().apply {
                put("id", id); put("path", d.absolutePath); put("exists", d.exists())
            })
        }
        call.resolve(JSObject().put("folders", folders))
    }

    @PluginMethod
    fun open(call: PluginCall) {
        val id = call.getString("id")
        val file = Engines.snapshots().firstOrNull { it.id == id }?.file
            ?: return call.reject("file not found")
        val uri = MediaStoreSink(context).publish(file, Classifier.classify(name = file.name))
            ?: return call.reject("index failed")
        val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, context.contentResolver.getType(uri))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(view, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun share(call: PluginCall) {
        val id = call.getString("id")
        val file = Engines.snapshots().firstOrNull { it.id == id }?.file
            ?: return call.reject("file not found")
        val uri = MediaStoreSink(context).publish(file, Classifier.classify(name = file.name))
            ?: return call.reject("index failed")
        val share = Intent(Intent.ACTION_SEND).apply {
            type = context.contentResolver.getType(uri)
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(share, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }
}

/* ======================================================================= */

@CapacitorPlugin(name = "Widget")
class WidgetPlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        // Snapshot fields arrive at the top level of the call object.
        SurgeWidget.refresh(
            context,
            call.getInt("active", 0) ?: 0,
            (call.getInt("down", 0) ?: 0).toLong(),
            (call.getInt("up", 0) ?: 0).toLong(),
            call.getString("title"),
        )
        call.resolve()
    }
}

/* ======================================================================= */

@CapacitorPlugin(name = "Notifier")
class NotifierPlugin : Plugin() {
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val nm = context.getSystemService(NotificationManager::class.java)
        call.resolve(JSObject().put("granted", nm.areNotificationsEnabled()))
    }

    @PluginMethod
    fun channels(call: PluginCall) {
        val nm = context.getSystemService(NotificationManager::class.java)
        val arr = JSArray()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.notificationChannels.forEach { c ->
                arr.put(JSObject().apply {
                    put("id", c.id); put("name", c.name.toString())
                    put("enabled", c.importance != NotificationManager.IMPORTANCE_NONE)
                })
            }
        }
        call.resolve(JSObject().put("channels", arr))
    }
}
