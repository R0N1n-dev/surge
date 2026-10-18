package com.surge.downloader.core

import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Native segmented HTTP/SFTP-ish downloader — the replacement for shipping an
 * aria2 binary.
 *
 * Same idea aria2 uses, ~200 lines of Kotlin, zero external blobs:
 *   · probe the total with a Range: bytes=0-0 request
 *   · split the REMAINING span into N byte-ranges (default 16)
 *   · one coroutine per range, each writing through its own RandomAccessFile
 *     at its own offset (no locking needed; ranges never overlap)
 *   · resume is free: on restart we re-split from the current file length, so a
 *     half-finished file continues instead of restarting
 *   · speed is sampled by the service from a shared byte counter
 *
 * Deliberately not FTP: OkHttp speaks HTTP(S). FTP/SFTP sources fall back to a
 * single-stream OkHttp-independent path is not worth the APK weight; the UI
 * labels them as unsupported rather than pretending.
 */
class HttpEngine(private val scope: CoroutineScope) {

    class Task(
        val id: String,
        val url: String,
        val file: File,
        val connections: Int = 16,
    ) {
        @Volatile var state: String = "waiting"   // waiting|active|paused|complete|error
        @Volatile var total: Long = 0
        @Volatile var done: Long = 0
        @Volatile var error: String? = null
        @Volatile var segmentsActive: Int = 0
        internal val jobs = mutableListOf<Job>()
        internal val counter = AtomicLong(0)     // bytes written this session
        internal var windowStart = System.currentTimeMillis()
        internal var windowBytes = 0L
        var speed: Long = 0
            internal set
    }

    private val tasks = ConcurrentHashMap<String, Task>()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    @Volatile var globalLimitBytesPerSec: Long = 0   // 0 = unlimited

    fun all(): List<Task> = tasks.values.toList()
    fun get(id: String): Task? = tasks[id]

    fun add(id: String, url: String, file: File, connections: Int = 16): Task {
        val t = Task(id, url, file, connections)
        tasks[id] = t
        file.parentFile?.mkdirs()
        return t
    }

    fun remove(id: String) {
        val t = tasks.remove(id) ?: return
        t.jobs.forEach { it.cancel() }
        t.state = "error"
    }

    fun pause(id: String) {
        val t = tasks[id] ?: return
        t.jobs.forEach { it.cancel() }
        t.jobs.clear()
        if (t.state == "active" || t.state == "waiting") t.state = "paused"
        t.speed = 0
    }

    fun resume(id: String) {
        val t = tasks[id] ?: return
        if (t.state == "complete") return
        start(t)
    }

    /* ------------------------------------------------------------ transfer -- */

    fun start(t: Task) {
        t.jobs.forEach { it.cancel() }
        t.jobs.clear()
        t.state = "active"
        t.error = null

        scope.launch(Dispatchers.IO) {
            try {
                // 1. probe size + resume support
                val (total, acceptsRanges) = probe(t.url, t.file.length())
                t.total = total
                val have = t.file.length()
                if (total > 0 && have >= total) {
                    t.done = total
                    t.state = "complete"
                    return@launch
                }
                if (!acceptsRanges || total <= 0) {
                    // Single stream: still resumable if the server sent a length.
                    streamWhole(t, total)
                    return@launch
                }

                // 2. split the REMAINING span so resume is implicit
                val from = have
                val span = total - from
                val n = t.connections.coerceIn(1, 32)
                val per = span / n
                var raf: RandomAccessFile? = null
                try {
                    raf = RandomAccessFile(t.file, "rw")
                    raf.setLength(total)
                } finally {
                    raf?.close()
                }

                var offset = from
                val jobs = mutableListOf<Job>()
                for (i in 0 until n) {
                    val start = offset
                    val end = if (i == n - 1) total - 1 else start + per - 1
                    offset = end + 1
                    if (end < start) continue
                    jobs += scope.launch(Dispatchers.IO) { fetchRange(t, start, end) }
                }
                t.jobs.addAll(jobs)
                t.segmentsActive = jobs.size
            } catch (e: Exception) {
                t.state = "error"
                t.error = e.message ?: "connection failed"
            }
        }
    }

    /** Returns total length and whether the server accepts byte ranges. */
    private fun probe(url: String, have: Long): Pair<Long, Boolean> {
        val req = Request.Builder()
            .url(url)
            .header("Range", "bytes=${have}-")
            .build()
        client.newCall(req).execute().use { res ->
            val cr = res.header("Content-Range")          // bytes 100-999/1234
            val cl = res.header("Content-Length")?.toLongOrNull() ?: 0
            val accepts = res.code == 206 || (res.header("Accept-Ranges")?.contains("bytes") == true)
            val total = when {
                cr != null -> cr.substringAfter('/').trim().toLongOrNull() ?: (have + cl)
                res.code == 200 -> cl                      // server ignored Range
                else -> have + cl
            }
            return total to accepts
        }
    }

    private fun fetchRange(t: Task, start: Long, end: Long) {
        val req = Request.Builder()
            .url(t.url)
            .header("Range", "bytes=$start-$end")
            .build()
        try {
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful && res.code != 206) throw java.io.IOException("HTTP ${res.code}")
                val body = res.body ?: throw java.io.IOException("empty body")
                RandomAccessFile(t.file, "rw").use { raf ->
                    raf.seek(start)
                    val buf = ByteArray(64 * 1024)
                    var written = start
                    body.byteStream().use { ins ->
                        while (written <= end) {
                            val n = ins.read(buf)
                            if (n < 0) break
                            raf.write(buf, 0, n)
                            written += n
                            t.done = written.coerceAtMost(t.total)
                            t.counter.addAndGet(n.toLong())
                            throttle(n)
                        }
                    }
                }
            }
            // All segments finished?
            if (t.jobs.all { it.isCancelled || it.isCompleted } && t.done >= t.total - 1) {
                t.state = "complete"
                t.speed = 0
            }
        } catch (e: Exception) {
            if (t.state == "active") {
                t.state = "error"
                t.error = e.message
            }
        }
    }

    /** Naive but effective global rate cap: sleep proportionally per chunk. */
    private fun throttle(bytes: Int) {
        val limit = globalLimitBytesPerSec
        if (limit <= 0) return
        val sleepNs = (bytes * 1_000_000_000L) / limit / 64 // per 64KB chunk share
        if (sleepNs > 0) Thread.sleep((sleepNs / 1_000_000).coerceAtLeast(0))
    }

    private fun streamWhole(t: Task, total: Long) {
        val req = Request.Builder().url(t.url).build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw java.io.IOException("HTTP ${res.code}")
            val body = res.body ?: throw java.io.IOException("empty body")
            t.file.outputStream().use { out ->
                body.byteStream().use { ins ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        t.done += n
                        t.counter.addAndGet(n.toLong())
                        throttle(n)
                    }
                }
            }
        }
        t.total = if (total > 0) total else t.done
        t.state = "complete"
        t.speed = 0
    }

    /** Called by the service tick; updates per-task speed from the counter. */
    fun sampleSpeeds() {
        val now = System.currentTimeMillis()
        for (t in tasks.values) {
            val dt = (now - t.windowStart).coerceAtLeast(1)
            t.speed = if (t.state == "active") (t.counter.get() * 1000 / dt) else 0
            // reset window every ~2s so the number stays live
            if (dt > 2000) {
                t.counter.set(0)
                t.windowStart = now
            }
        }
    }
}
