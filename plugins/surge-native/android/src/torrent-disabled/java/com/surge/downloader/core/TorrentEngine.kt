package com.surge.downloader.core

import android.util.Log
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Compile-safe stand-in used when org.libtorrent4j could not be resolved at
 * configure time (offline mirror, artifact rename, ...). Same public API as the
 * real engine so the rest of the module compiles unchanged; every operation
 * reports a clear, actionable error instead of crashing or silently no-opping.
 *
 * The real implementation lives in src/torrent-enabled/ and is swapped in by
 * build.gradle the moment the dependency resolves.
 */
class TorrentEngine {

    companion object { private const val TAG = "TorrentEngine" }

    class Task(val id: String, val source: String, val dir: File) {
        @Volatile var name: String = source.substringAfterLast('/').take(48)
        @Volatile var state: String = "error"
        @Volatile var total: Long = 0
        @Volatile var done: Long = 0
        @Volatile var speed: Long = 0
        @Volatile var upload: Long = 0
        @Volatile var seeds: Int = 0
        @Volatile var peers: Int = 0
        @Volatile var error: String? =
            "BitTorrent support not compiled in (libtorrent4j unresolved)"
        @Volatile var handle: Any? = null
    }

    private val tasks = ConcurrentHashMap<String, Task>()

    init {
        Log.w(TAG, "libtorrent4j unresolved - torrents disabled in this build")
    }

    fun all(): List<Task> = tasks.values.toList()
    fun get(id: String): Task? = tasks[id]

    fun addMagnet(id: String, magnet: String, dir: File): Task =
        Task(id, magnet, dir).also { tasks[id] = it }

    fun addTorrentFile(id: String, torrentFile: File, dir: File): Task =
        Task(id, torrentFile.absolutePath, dir).also { tasks[id] = it }

    fun pause(id: String) = Unit
    fun resume(id: String) = Unit
    fun remove(id: String) { tasks.remove(id) }
    fun selectFiles(id: String, indices: Set<Int>) = Unit
    fun files(id: String): List<Triple<String, Long, Boolean>> = emptyList()
    fun sample() = Unit
    fun shutdown() = Unit
}
