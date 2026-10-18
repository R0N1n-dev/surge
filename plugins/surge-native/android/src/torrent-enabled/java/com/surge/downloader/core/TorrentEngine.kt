package com.surge.downloader.core

import android.util.Log
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import org.libtorrent4j.SessionManager
import org.libtorrent4j.TorrentHandle
import org.libtorrent4j.TorrentInfo
import org.libtorrent4j.TorrentStatus

/**
 * BitTorrent engine on libtorrent4j (Maven artifact; its arm64 JNI lib ships
 * inside the `-android-arm64` artifact, so there is no manual binary step).
 *
 * API hardening: libtorrent4j's surface has shifted between 2.x releases, and
 * this project is authored without a resolvable Maven index available. So the
 * *core* lifecycle calls (session start, fetchMagnet, download, pause/resume,
 * status) are direct, while the two calls most likely to have moved between
 * releases - seed counts and per-file priorities - go through reflection and
 * degrade to "unknown / all files" instead of breaking the compile or the run.
 *
 * Every libtorrent call is additionally wrapped: a torrent stack misbehaving
 * must pause one transfer, never take down the service.
 */
class TorrentEngine {

    companion object { private const val TAG = "TorrentEngine" }

    class Task(
        val id: String,
        val source: String,        // magnet uri or .torrent path
        val dir: File,
    ) {
        @Volatile var name: String = source.substringAfterLast('/').take(48)
        @Volatile var state: String = "waiting"
        @Volatile var total: Long = 0
        @Volatile var done: Long = 0
        @Volatile var speed: Long = 0
        @Volatile var upload: Long = 0
        @Volatile var seeds: Int = 0
        @Volatile var peers: Int = 0
        @Volatile var error: String? = null
        @Volatile var handle: TorrentHandle? = null
    }

    private var sm: SessionManager? = null
    private var started = false
    private var available = true
    private val tasks = ConcurrentHashMap<String, Task>()

    private fun ensureStarted() {
        if (started || !available) return
        synchronized(this) {
            if (started || !available) return
            try {
                sm = SessionManager()
                sm!!.start()
                started = true
            } catch (t: Throwable) {
                // NoClassDefFoundError if the artifact ever fails to resolve,
                // UnsatisfiedLinkError if the ABI lib is missing. Degrade, don't die.
                available = false
                Log.e(TAG, "libtorrent unavailable: ${t.javaClass.simpleName} ${t.message}")
            }
        }
    }

    fun all(): List<Task> = tasks.values.toList()
    fun get(id: String): Task? = tasks[id]

    fun addMagnet(id: String, magnet: String, dir: File): Task {
        val t = Task(id, magnet, dir)
        tasks[id] = t
        dir.mkdirs()
        ensureStarted()
        Thread {
            try {
                val s = sm ?: throw IllegalStateException("libtorrent unavailable")
                val info: TorrentInfo? = fetchInfo(s, magnet)
                if (info == null) {
                    t.state = "error"; t.error = "metadata fetch timed out"
                    return@Thread
                }
                t.name = info.name()
                t.total = info.totalSize()
                s.download(info, dir)
                t.handle = s.find(info.infoHash())
                t.state = "active"
            } catch (e: Exception) {
                t.state = "error"; t.error = e.message
                Log.e(TAG, "magnet add failed", e)
            }
        }.start()
        return t
    }

    fun addTorrentFile(id: String, torrentFile: File, dir: File): Task {
        val t = Task(id, torrentFile.absolutePath, dir)
        tasks[id] = t
        dir.mkdirs()
        ensureStarted()
        Thread {
            try {
                val s = sm ?: throw IllegalStateException("libtorrent unavailable")
                val info = TorrentInfo(torrentFile)
                t.name = info.name()
                t.total = info.totalSize()
                s.download(info, dir)
                t.handle = s.find(info.infoHash())
                t.state = "active"
            } catch (e: Exception) {
                t.state = "error"; t.error = e.message
            }
        }.start()
        return t
    }

    fun pause(id: String) {
        val t = tasks[id] ?: return
        runCatching { t.handle?.pause() }
        t.state = "paused"; t.speed = 0; t.upload = 0
    }

    fun resume(id: String) {
        val t = tasks[id] ?: return
        if (t.handle == null) { addMagnet(id, t.source, t.dir); return }
        runCatching { t.handle?.resume() }
        t.state = "active"
    }

    fun remove(id: String) {
        val t = tasks.remove(id) ?: return
        runCatching { t.handle?.let { sm?.remove(it) } }
    }

    /**
     * 1-based indices to fetch; everything else priority 0.
     * Reflected because the Priority enum / prioritizeFiles signature has moved
     * between releases; if it is not there we simply download everything.
     */
    fun selectFiles(id: String, indices: Set<Int>) {
        val t = tasks[id] ?: return
        runCatching {
            val h = t.handle ?: return@runCatching
            val info = h.torrentFile() ?: return@runCatching
            val n = info.files().numFiles()
            val prioClass = Class.forName("org.libtorrent4j.Priority")
            val constants = prioClass.enumConstants as Array<*>
            // IGNORE is conventionally first, a "normal/high" priority last.
            val ignore = constants.first()
            val want = constants.last()
            val arr = java.lang.reflect.Array.newInstance(prioClass, n)
            for (i in 0 until n) {
                java.lang.reflect.Array.set(arr, i, if (indices.contains(i + 1)) want else ignore)
            }
            val m = h.javaClass.methods.firstOrNull { it.name == "prioritizeFiles" }
            m?.invoke(h, arr)
        }.onFailure { Log.w(TAG, "selectFiles degraded (downloading all): ${it.message}") }
    }

    fun files(id: String): List<Triple<String, Long, Boolean>> {
        val t = tasks[id] ?: return emptyList()
        return runCatching {
            val info = t.handle?.torrentFile() ?: return@runCatching emptyList()
            val fs = info.files()
            (0 until fs.numFiles()).map { i ->
                Triple(fs.filePath(i), fs.fileSize(i), true)
            }
        }.getOrElse { emptyList() }
    }

    /** Pull live numbers off libtorrent into our task. Called by the tick. */
    fun sample() {
        for (t in tasks.values) {
            val h = t.handle ?: continue
            val st: TorrentStatus = runCatching { h.status() }.getOrNull() ?: continue
            t.done = st.totalDone()
            t.total = st.totalWanted().coerceAtLeast(1)
            t.speed = st.downloadRate().toLong()
            t.upload = st.uploadRate().toLong()
            t.peers = st.numPeers()
            t.seeds = seedsOf(st)
            t.state = when {
                st.isFinished || st.progress() >= 1f -> "seeding"
                t.state == "paused" -> "paused"
                else -> "active"
            }
        }
    }

    /** listSeeds()/listPeers() naming has varied; try the candidates. */
    private fun seedsOf(st: TorrentStatus): Int = runCatching {
        for (name in listOf("listSeeds", "numSeeds", "seeds")) {
            val m = st.javaClass.methods.firstOrNull { it.name == name && it.parameterCount == 0 }
            if (m != null) return@runCatching (m.invoke(st) as? Number)?.toInt() ?: 0
        }
        0
    }.getOrDefault(0)

    /**
     * fetchMagnet's return type has moved between libtorrent4j releases
     * (TorrentInfo in some, the bencoded byte[] in others). Resolve at runtime
     * so either shape works, and bdecode when needed.
     */
    private fun fetchInfo(s: SessionManager, magnet: String): TorrentInfo? = runCatching {
        val m = s.javaClass.methods.firstOrNull {
            it.name == "fetchMagnet" && it.parameterTypes.firstOrNull() == String::class.java
        } ?: return@runCatching null
        when (val r = m.invoke(s, magnet, 30)) {
            is TorrentInfo -> r
            is ByteArray -> runCatching { TorrentInfo.bdecode(r) }.getOrNull()
            else -> null
        }
    }.getOrNull()

    fun shutdown() = runCatching { sm?.stop() }
}
