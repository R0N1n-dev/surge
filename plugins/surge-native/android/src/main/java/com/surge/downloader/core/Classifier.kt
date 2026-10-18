package com.surge.downloader.core

import android.content.Context
import android.os.Environment
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

/**
 * The native half of the download classifier.
 *
 * MUST stay in lock-step with `src/lib/classify.js`. aria2 needs the destination
 * directory at add-time (before any JS round-trip is guaranteed), and the
 * MediaStore insert needs the same category to compute RELATIVE_PATH, so the
 * table is duplicated here rather than fetched from the WebView. The two copies
 * are diffed by `tools/verify-classify.mjs` in CI — if you edit one, edit both.
 *
 * Folder names are the user-visible contract (they show up in any file manager
 * and match the 1DM layout): lowercase, unlocalised, stable.
 */
object Classifier {

    /** Category id + the extensions that route into it. Order = priority. */
    val TABLE: List<Pair<String, List<String>>> = listOf(
        "videos" to listOf("mp4", "m4v", "mkv", "webm", "mov", "avi", "wmv", "flv", "f4v", "3gp", "3g2", "ts", "m2ts", "mts", "vob", "ogv", "divx"),
        "music" to listOf("mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "wav", "wma", "alac", "aiff", "aif", "ape", "mka"),
        "photos" to listOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "avif", "tiff", "tif", "svg", "dng", "raw"),
        "documents" to listOf("pdf", "doc", "docx", "odt", "rtf", "txt", "md", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp", "epub", "mobi", "azw3", "fb2", "djvu"),
        "compressed" to listOf("zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "tbz2", "xz", "txz", "zst", "lz4", "cab", "iso", "img", "dmg", "wim"),
        "programs" to listOf("apk", "xapk", "apks", "apkm", "aab", "exe", "msi", "deb", "rpm", "dmg", "jar", "bin"),
        "subtitles" to listOf("srt", "ass", "ssa", "sub", "vtt", "sbv", "smi", "idx"),
        "torrents" to listOf("torrent"),
        "general" to listOf("html", "htm", "xhtml", "css", "js", "mjs", "json", "xml", "yml", "yaml", "ttf", "otf", "woff", "woff2", "ics", "vcf", "key", "pub", "apkx"),
    )

    /** Safety nets, in fallback order. Mirrors the JS `others` / `general`. */
    const val OTHERS = "others"
    const val GENERAL = "general"
    const val TORRENTS = "torrents"

    /** yt-dlp source kinds — always video payloads. Mirrors classify.js. */
    private val MEDIA_KINDS = setOf("youtube", "instagram", "tiktok", "twitter")

    private val EXT_INDEX: Map<String, String> = buildMap {
        for ((cat, exts) in TABLE) for (e in exts) if (!containsKey(e)) put(e, cat)
    }

    val CATEGORY_IDS: List<String> = TABLE.map { it.first } + OTHERS

    fun extensionOf(nameOrUrl: String?): String {
        val clean = (nameOrUrl ?: "").substringBefore('?').substringBefore('#')
        val base = clean.substringAfterLast('/')
        val dot = base.lastIndexOf('.')
        if (dot < 0 || dot == base.length - 1) return ""
        val ext = base.substring(dot + 1).lowercase()
        return if (ext.length in 1..8) ext else ""
    }

    /**
     * Classify. Same precedence as the JS side:
     * override → extension → mime → source kind → others/general.
     */
    fun classify(
        name: String? = null,
        url: String? = null,
        mime: String? = null,
        kind: String? = null,
        override: String? = null,
        disabled: Set<String> = emptySet(),
        customRules: Map<String, String> = emptyMap(),
    ): String {
        if (override != null && CATEGORY_IDS.contains(override) && !disabled.contains(override)) return override

        val ext = extensionOf(name).ifEmpty { extensionOf(url) }
        if (ext.isNotEmpty()) {
            customRules[ext]?.let { if (!disabled.contains(it)) return it }
            EXT_INDEX[ext]?.let { if (!disabled.contains(it)) return it }
        }

        mime?.lowercase()?.let { m ->
            val prefix = when {
                m.startsWith("video/") -> "videos"
                m.startsWith("audio/") -> "music"
                m.startsWith("image/") -> "photos"
                m.startsWith("text/") -> "documents"
                m.startsWith("application/pdf") -> "documents"
                m.startsWith("application/rtf") -> "documents"
                m.startsWith("application/msword") -> "documents"
                m.startsWith("application/vnd.ms-excel") -> "documents"
                m.startsWith("application/vnd.ms-powerpoint") -> "documents"
                m.startsWith("application/vnd.openxmlformats") -> "documents"
                m.startsWith("application/vnd.oasis") -> "documents"
                m.startsWith("application/epub") -> "documents"
                m.startsWith("application/x-mobipocket") -> "documents"
                m.startsWith("application/zip") || m.startsWith("application/x-rar") ||
                    m.startsWith("application/x-7z") || m.startsWith("application/gzip") ||
                    m.startsWith("application/x-tar") || m.startsWith("application/x-iso") -> "compressed"
                m.startsWith("application/vnd.android.package-archive") -> "programs"
                m.startsWith("application/x-bittorrent") -> "torrents"
                m.startsWith("application/x-subrip") || m.startsWith("text/vtt") -> "subtitles"
                else -> null
            }
            if (prefix != null && !disabled.contains(prefix)) return prefix
        }

        if (kind == "torrent" || kind == "magnet") return TORRENTS
        // Media extractors hand us a title, not a filename (see classify.js).
        if (kind != null && kind in MEDIA_KINDS) return "videos"
        if (ext.isEmpty()) return OTHERS
        return GENERAL
    }

    /** Relative path under internal storage, e.g. `Download/Surge/videos`. */
    fun folderFor(category: String, root: String): String =
        "${root.trimEnd('/')}/${if (CATEGORY_IDS.contains(category)) category else OTHERS}"

    /* ------------------------------------------------------- preferences --- */

    private val Context.dataStore by preferencesDataStore(name = "surge_storage")
    private val KEY_ROOT = stringPreferencesKey("root")
    private val KEY_DISABLED = stringSetPreferencesKey("disabled")

    const val DEFAULT_ROOT = "Download/Surge"

    fun rootBlocking(context: Context): String = runBlocking {
        context.dataStore.data.first()[KEY_ROOT] ?: DEFAULT_ROOT
    }

    fun disabledBlocking(context: Context): Set<String> = runBlocking {
        context.dataStore.data.first()[KEY_DISABLED] ?: emptySet()
    }

    suspend fun configure(context: Context, root: String?, disabled: Set<String>?) {
        context.dataStore.edit { p ->
            root?.takeIf { it.isNotBlank() }?.let { p[KEY_ROOT] = it.trim('/').trim() }
            disabled?.let { p[KEY_DISABLED] = it }
        }
    }

    /* ----------------------------------------------------------- folders --- */

    /**
     * Make sure the whole category tree physically exists. Called on service
     * start and whenever the root changes, so a file manager always shows the
     * full 1DM-style layout even before anything has downloaded.
     */
    fun ensureFolders(context: Context, root: String = rootBlocking(context)) {
        val base = publicBase()
        for (cat in CATEGORY_IDS) {
            File(base, folderFor(cat, root)).mkdirs()
        }
    }

    /** Absolute base dir for the relative root (internal storage's public Downloads). */
    fun publicBase(): File =
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).parentFile
            ?: Environment.getExternalStorageDirectory()

    /** Absolute directory for a category — what aria2's `dir` option gets. */
    fun absoluteDir(context: Context, category: String): File {
        val root = rootBlocking(context)
        // root is expressed relative to internal storage, e.g. Download/Surge
        return File(publicBase(), folderFor(category, root))
    }
}
