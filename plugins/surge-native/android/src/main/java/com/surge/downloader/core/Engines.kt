package com.surge.downloader.core

import android.content.Context
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * The single registry every part of the app asks "what is transferring?".
 *
 * Three engines behind one shape:
 *   HTTP   → HttpEngine   (segmented OkHttp, replaces the aria2 binary)
 *   TORRENT→ TorrentEngine (libtorrent4j, Maven natives)
 *   YTDLP  → Chaquopy yt-dlp (extractors + MP3 pipeline)
 *
 * Keeping the union here means the notification shade, the widget, the poll
 * endpoint and the MediaStore publisher all agree by construction, and adding a
 * fourth engine later is one more branch in snapshot().
 */
object Engines {

    enum class Kind { HTTP, TORRENT, YTDLP }

    class YtTask(
        val id: String,
        val url: String,
        val file: File,
    ) {
        @Volatile var name: String = file.name
        @Volatile var state: String = "waiting"
        @Volatile var total: Long = 0
        @Volatile var done: Long = 0
        @Volatile var speed: Long = 0
        @Volatile var error: String? = null
    }

    lateinit var scope: CoroutineScope
    lateinit var context: Context
    val http = HttpEngine(CoroutineScope(Dispatchers.IO))
    val torrent = TorrentEngine()
    val yt = ConcurrentHashMap<String, YtTask>()
    val kinds = ConcurrentHashMap<String, Kind>()
    val categories = ConcurrentHashMap<String, String>()
    val published = ConcurrentHashMap.newKeySet<String>()

    fun init(scope: CoroutineScope, context: Context) {
        this.scope = scope
        this.context = context
    }

    /** Run a yt-dlp download off-thread, tracking it like the other engines. */
    fun addYt(
        id: String,
        url: String,
        file: File,
        formatSpec: String?,
        audioKbps: Int?,
        thenMp3: Boolean,
        category: String,
    ): YtTask {
        val t = YtTask(id, url, file)
        yt[id] = t
        kinds[id] = Kind.YTDLP
        categories[id] = category
        scope.launch(Dispatchers.IO) {
            try {
                t.state = "active"
                YtDlp.init(context)
                val dir = file.parentFile ?: file
                val out: File? = if (audioKbps != null) {
                    YtDlp.extractAudio(url, dir, audioKbps)
                } else {
                    YtDlp.download(url, formatSpec ?: "1080", dir)
                }
                // Optional video -> MP3 sidecar, once the video itself landed.
                if (out != null && out.exists() && thenMp3 && audioKbps == null) {
                    val mp3 = File(dir, out.nameWithoutExtension + ".mp3")
                    if (Ffmpeg.toMp3(context, out, mp3, 320)) t.name = mp3.name
                }
                if (out != null && out.exists()) {
                    t.state = "complete"
                    t.total = out.length(); t.done = t.total
                } else {
                    t.state = "error"; t.error = "extraction failed"
                }
            } catch (e: Exception) {
                t.state = "error"; t.error = e.message
            }
        }
        return t
    }

    fun kind(id: String): Kind? = kinds[id]

    fun pause(id: String) = when (kinds[id]) {
        Kind.HTTP -> http.pause(id)
        Kind.TORRENT -> torrent.pause(id)
        Kind.YTDLP -> { yt[id]?.state = "paused" }   // yt-dlp has no live pause; resume re-runs
        null -> {}
    }

    fun resume(id: String) = when (kinds[id]) {
        Kind.HTTP -> http.resume(id)
        Kind.TORRENT -> torrent.resume(id)
        Kind.YTDLP -> { yt[id]?.let { if (it.state != "complete") it.state = "waiting" } }
        null -> {}
    }

    fun remove(id: String) = when (kinds[id]) {
        Kind.HTTP -> http.remove(id)
        Kind.TORRENT -> torrent.remove(id)
        Kind.YTDLP -> { yt.remove(id); Unit }
        null -> {}
    }

    /** Pull live counters from whichever engines have them. */
    fun sample() {
        http.sampleSpeeds()
        torrent.sample()
    }

    /* ------------------------------------------------------ unified view --- */

    class Snap(
        val id: String,
        val name: String,
        val state: String,
        val total: Long,
        val done: Long,
        val speed: Long,
        val upload: Long,
        val connections: Int,
        val seeds: Int,
        val peers: Int,
        val file: File?,
        val category: String,
        val error: String? = null,
    )

    fun snapshots(): List<Snap> {
        val out = mutableListOf<Snap>()
        for (t in http.all()) {
            out += Snap(t.id, t.file.name, t.state, t.total, t.done, t.speed, 0, t.segmentsActive, 0, 0, t.file, categories[t.id] ?: "general", t.error)
        }
        for (t in torrent.all()) {
            out += Snap(t.id, t.name, t.state, t.total, t.done, t.speed, t.upload, 0, t.seeds, t.peers, t.dir, categories[t.id] ?: "torrents", t.error)
        }
        for (t in yt.values) {
            out += Snap(t.id, t.name, t.state, t.total, t.done, t.speed, 0, 0, 0, 0, t.file, categories[t.id] ?: "videos", t.error)
        }
        return out
    }

    fun totals(): Triple<Long, Long, Int> {
        var down = 0L; var up = 0L; var active = 0
        for (s in snapshots()) {
            down += s.speed; up += s.upload
            if (s.state == "active" || s.state == "seeding") active++
        }
        return Triple(down, up, active)
    }

    fun shutdown() {
        torrent.shutdown()
    }
}
