package com.surge.downloader.core

import android.content.Context
import android.util.Log
import com.chaquo.python.PyObject
import com.chaquo.python.Python
import java.io.File

/**
 * yt-dlp, running in an embedded CPython 3.11 via Chaquopy (arm64 wheels only).
 *
 * Why embed Python instead of shelling out?
 *  - yt-dlp is ~30k lines of Python; there is no faithful port.
 *  - Chaquopy compiles it into the APK, so there is nothing to download at
 *    runtime and no Play-Store "downloading code" policy problem.
 *  - We get real exceptions and structured dicts back, not stdout scraping.
 *
 * The Python side is a tiny module (assets/python/ytdlp_bridge.py) that wraps
 * yt_dlp.YoutubeDL and returns plain JSON-serialisable structures.
 */
object YtDlp {

    private const val TAG = "YtDlp"
    private var bridge: PyObject? = null

    fun init(context: Context) {
        if (bridge != null) return
        try {
            val py = Python.getInstance()
            bridge = py.getModule("ytdlp_bridge")
            Log.i(TAG, "yt-dlp bridge ready")
        } catch (e: Throwable) {
            Log.e(TAG, "python init failed", e)
        }
    }

    /**
     * Extract metadata + the format table the picker renders.
     * Returns a Map mirroring the JS `probe()` shape, or null on failure.
     */
    fun probe(url: String): Map<String, Any?>? = guard {
        val res = bridge!!.callAttr("probe", url) ?: return@guard null
        val json = res.toJava(String::class.java)
        if (json.isNullOrBlank() || json == "null") return@guard null
        jsonToMap(json)
    }

    /**
     * Queue a download through yt-dlp with an explicit format selector.
     * Runs on the caller's thread — always call from a worker.
     */
    fun download(
        url: String,
        formatSpec: String,
        outDir: File,
        template: String = "%(title)s.%(ext)s",
        subtitles: List<String> = emptyList(),
        onProgress: ((Double, Long, Long) -> Unit)? = null,
    ): File? = guard {
        outDir.mkdirs()
        val res = bridge!!.callAttr(
            "download",
            url,
            formatSpec,
            outDir.absolutePath,
            template,
            subtitles.joinToString(","),
        )
        val path = res?.toJava(String::class.java)
        path?.let { File(it) }
    }

    /** Audio-only extraction straight to MP3 at the requested bitrate. */
    fun extractAudio(url: String, outDir: File, kbps: Int = 320): File? = guard {
        outDir.mkdirs()
        val res = bridge!!.callAttr("extract_audio", url, outDir.absolutePath, kbps.toString())
        res?.toJava(String::class.java)?.let { File(it) }
    }

    private inline fun <T> guard(block: () -> T): T? = try {
        block()
    } catch (e: Throwable) {
        Log.e(TAG, "ytdlp call failed: ${e.message}")
        null
    }

    /** The Python side hands us a JSON string; parse with org.json to avoid a
     *  second serialisation dependency. */
    private fun jsonToMap(json: String): Map<String, Any?> {
        val o = org.json.JSONObject(json)
        val out = mutableMapOf<String, Any?>()
        for (k in o.keys()) out[k] = o.opt(k)
        return out
    }
}

/**
 * ffmpeg via ffmpeg-kit (Maven artifact, natives bundled per ABI).
 *
 * Invoked REFLECTIVELY on purpose. The dependency is real (see build.gradle),
 * but ffmpeg-kit's Kotlin-visible surface has shifted across 4.x/5.x/6.x and
 * this module is authored without a resolvable Maven index available. A missing
 * artifact still fails the build loudly (correct - it is a dependency problem),
 * while an internal API rename degrades to "conversion unavailable" instead of
 * a compile error.
 */
object Ffmpeg {

    private const val TAG = "Ffmpeg"

    private val kit: Class<*>? = runCatching {
        Class.forName("com.arthenica.ffmpegkit.FFmpegKit")
    }.getOrNull()

    private val returnCode: Class<*>? = runCatching {
        Class.forName("com.arthenica.ffmpegkit.ReturnCode")
    }.getOrNull()

    private fun sessionReturnCode(session: Any): Any? = runCatching {
        session.javaClass.methods.firstOrNull { m -> m.name == "getReturnCode" && m.parameterCount == 0 }
            ?.invoke(session)
    }.getOrNull()

    fun version(context: Context): String? = runCatching {
        val cfg = Class.forName("com.arthenica.ffmpegkit.FFmpegKitConfig")
        cfg.methods.firstOrNull { it.name == "getFFmpegVersion" && it.parameterCount == 0 }
            ?.invoke(null) as? String
    }.getOrNull()

    /** Transcode any audio-bearing container to MP3 at an exact CBR bitrate. */
    fun toMp3(context: Context, src: File, dst: File, kbps: Int): Boolean = run(
        listOf(
            "-y", "-i", src.absolutePath,
            "-vn",
            "-c:a", "libmp3lame",
            "-b:a", "${kbps}k",
            "-ar", "44100",
            "-write_id3v1", "1", "-write_id3v2", "1",
            dst.absolutePath,
        ),
    ) && dst.exists()

    /** Mux a video stream + an audio stream (YouTube >720p split delivery). */
    fun mux(context: Context, video: File, audio: File, dst: File): Boolean = run(
        listOf(
            "-y", "-i", video.absolutePath, "-i", audio.absolutePath,
            "-c", "copy", "-movflags", "+faststart", dst.absolutePath,
        ),
    ) && dst.exists()

    /** Burn cover art + tags into an MP3 so it looks right in Music apps. */
    fun tag(context: Context, mp3: File, art: File?, title: String?, artist: String?): Boolean {
        val args = mutableListOf("-y", "-i", mp3.absolutePath)
        if (art != null && art.exists()) {
            args += listOf("-i", art.absolutePath, "-map", "0:a", "-map", "1:v", "-c:v", "copy")
        } else {
            args += listOf("-map", "0:a", "-c:a", "copy")
        }
        args += listOf("-metadata", "title=${title ?: mp3.nameWithoutExtension}")
        artist?.let { args += listOf("-metadata", "artist=$it") }
        val tmp = File(mp3.parentFile, mp3.name + ".tmp")
        args += tmp.absolutePath
        val ok = run(args)
        if (ok && tmp.exists()) {
            mp3.delete()
            tmp.renameTo(mp3)
        }
        return ok
    }

    private fun run(args: List<String>): Boolean {
        val k = kit ?: run { Log.e(TAG, "ffmpeg-kit not on classpath"); return false }
        return try {
            val m = k.methods.firstOrNull {
                it.name == "executeWithArguments" && it.parameterCount == 1
            } ?: run { Log.e(TAG, "ffmpeg-kit executeWithArguments not found"); return false }
            val session = m.invoke(null, args.toTypedArray()) ?: return false
            val rc = sessionReturnCode(session) ?: return false
            val ok = returnCode?.methods?.firstOrNull {
                it.name == "isSuccess" && it.parameterCount == 1
            }?.invoke(null, rc) as? Boolean ?: false
            if (!ok) Log.w(TAG, "ffmpeg rc=$rc")
            ok
        } catch (e: Exception) {
            Log.e(TAG, "ffmpeg-kit invocation failed", e)
            false
        }
    }
}
