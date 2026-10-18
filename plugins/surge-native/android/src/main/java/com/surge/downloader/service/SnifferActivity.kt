package com.surge.downloader.service

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * The Browser tab's real WebView.
 *
 * A WebView cannot (safely) nest inside the Capacitor WebView, so the Browser
 * tab is a native activity. Its only job beyond rendering is SNIFFING: every
 * response that is a media/archive type, or that arrives with a
 * Content-Disposition, is reported to the Capacitor bridge as a `sniffed`
 * entry, which is what paints the "N downloads detected" banner.
 *
 * Two detection paths, because the WebView only exposes one kind of data at
 * each stage:
 *
 *   REQUEST time  (`shouldInterceptRequest` / `shouldOverrideUrlLoading`)
 *     only the request is known, so the honest signal is the URL itself. This
 *     is what catches a page full of direct .mp4/.zip links.
 *
 *   RESPONSE time (`DownloadListener`)
 *     the WebView calls this exactly when it will NOT render the response, and
 *     hands over the real Content-Type, Content-Disposition and byte length.
 *     This is the only place a server-signalled download is visible, and it is
 *     why the previous version (which read the request's `Accept` header and
 *     expected `Content-Length` on the *request*) could never detect anything.
 */
class SnifferActivity : AppCompatActivity() {

    companion object {
        /** Response MIME families worth grabbing. */
        private val MEDIA_MIME = Regex("^(video|audio)/", RegexOption.IGNORE_CASE)

        /** Types the WebView cannot render, so the response is a download. */
        private val BINARY_MIME = setOf(
            "application/x-bittorrent", "application/zip", "application/x-rar",
            "application/x-7z-compressed", "application/gzip", "application/x-tar",
            "application/x-iso9660-image", "application/octet-stream",
            "application/vnd.android.package-archive",
        )

        /** URL patterns that are downloadable whatever the server claims. */
        private val ASSET_URL = Regex(
            "\\.(mp4|m4v|mkv|webm|mov|avi|3gp|mp3|m4a|aac|flac|ogg|opus|wav|zip|rar|7z|tar|gz|iso|apk|torrent)([?#]|$)",
            RegexOption.IGNORE_CASE,
        )
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
                    val u = req.url.toString()
                    if (ASSET_URL.containsMatchIn(u)) report(u, 0)
                    return super.shouldInterceptRequest(view, req)
                }

                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    val u = req.url.toString()
                    if (ASSET_URL.containsMatchIn(u)) report(u, 0)
                    return false
                }
            }

            // Response-time sniffing: real MIME, disposition and length.
            setDownloadListener(DownloadListener { dlUrl, _userAgent, _disposition, mimeType, contentLength ->
                if (isGrabbable(mimeType) || ASSET_URL.containsMatchIn(dlUrl)) {
                    report(dlUrl, if (contentLength > 0) contentLength else 0)
                }
            })
        }
        setContentView(web)
        web.loadUrl(url)

        // Proper back: walk the page history and only leave at the first page.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
    }

    private fun isGrabbable(mime: String?): Boolean {
        val m = mime?.lowercase()?.substringBefore(';')?.trim() ?: return false
        if (m.isEmpty()) return false
        return MEDIA_MIME.containsMatchIn(m) || m in BINARY_MIME
    }

    /** Publish onto the in-process bus the DownloaderPlugin drains per tick. */
    private fun report(url: String, size: Long) {
        SniffBus.publish(url, size)
        android.util.Log.i("Sniffer", "sniffed: $url ($size)")
    }
}

/**
 * Tiny in-process event bus between the native sniffer and the Capacitor
 * plugin. The plugin drains [pending] on its poll tick and re-emits each entry
 * as a `sniffed` payload, so the WebView never polls the WebView.
 */
object SniffBus {
    private val lock = Any()
    private val pending = ArrayDeque<Pair<String, Long>>()

    fun publish(url: String, size: Long) {
        synchronized(lock) {
            // Keep the largest known size if we see the same URL twice (the
            // request-time path reports 0; the response-time path knows the real
            // length).
            val idx = pending.indexOfFirst { it.first == url }
            if (idx >= 0) {
                if (size > pending[idx].second) pending[idx] = url to size
            } else {
                pending.addLast(url to size)
            }
            while (pending.size > 64) pending.removeFirst()
        }
    }

    fun drain(): List<Pair<String, Long>> = synchronized(lock) {
        val out = pending.toList()
        pending.clear()
        out
    }
}
