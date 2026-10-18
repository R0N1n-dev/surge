package com.surge.downloader.service

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * The Browser tab's real WebView.
 *
 * A WebView cannot (safely) nest inside the Capacitor WebView, so the Browser
 * tab is a native fragment/activity. Its only job beyond rendering is SNIFFING:
 * every response whose MIME is a media/archive type, or that carries a
 * Content-Disposition, is reported to the Capacitor bridge as a
 * `surge:sniffed` event, which is what paints the "N downloads detected" banner.
 */
class SnifferActivity : AppCompatActivity() {

    companion object {
        private val SNIFF_MIME = Regex("^(video|audio)/|/(x-bittorrent|zip|rar|7z|x-7z|gzip|tar|octet-stream|apk|vnd\\.android\\.package-archive)$")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.dataString ?: intent.getStringExtra("url") ?: "about:blank"

        val web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            CookieManager.getInstance().setAcceptCookie(true)
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                    val mime = req.requestHeaders?.get("Accept").orEmpty()
                    val u = req.url.toString()
                    if (SNIFF_MIME.containsMatchIn(mime) || looksLikeAsset(u)) {
                        report(u, req.requestHeaders?.get("Content-Length")?.toLongOrNull() ?: 0)
                    }
                    return super.shouldInterceptRequest(view, req)
                }
            }
        }
        setContentView(web)
        web.loadUrl(url)
    }

    private fun looksLikeAsset(u: String): Boolean =
        Regex("\\.(mp4|mkv|webm|mov|mp3|m4a|flac|zip|rar|7z|iso|torrent|apk)(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(u)

    /** Publish onto the in-process bus the DownloaderPlugin drains per tick. */
    private fun report(url: String, size: Long) {
        SniffBus.publish(url, size)
        android.util.Log.i("Sniffer", "sniffed: $url")
    }
}

/**
 * Tiny in-process event bus between the native sniffer and the Capacitor
 * plugin. The plugin drains [pending] on its poll tick and re-emits each entry
 * as a `sniffed` JS event, so the WebView never polls the WebView.
 */
object SniffBus {
    private val lock = Any()
    private val pending = ArrayDeque<Pair<String, Long>>()

    fun publish(url: String, size: Long) {
        synchronized(lock) {
            if (pending.none { it.first == url }) pending.addLast(url to size)
            while (pending.size > 64) pending.removeFirst()
        }
    }

    fun drain(): List<Pair<String, Long>> = synchronized(lock) {
        val out = pending.toList()
        pending.clear()
        out
    }
}
