package com.surge.downloader.core

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log
import java.io.File

/**
 * Getting finished files *seen* by the rest of Android.
 *
 * Two regimes:
 *
 *  API 29+ (scoped storage): we insert a row into MediaStore ourselves and copy
 *  the bytes through the resulting content URI. That is the supported path and
 *  it makes the file appear in Gallery / Music / Files instantly, with the right
 *  MIME and owner, without any storage permission.
 *
 *  API 24-28: we write to public external storage and ask MediaScannerConnection
 *  to index it, which is the pre-scoped-storage equivalent.
 *
 * Custom folders chosen through the Storage Access Framework are handled by
 * [writeViaSaf]: we keep a persisted URI permission and write through
 * DocumentFile, so a user who picks "SD card/MyStuff" gets their files there.
 */
class MediaStoreSink(private val context: Context) {

    companion object {
        private const val TAG = "MediaStoreSink"

        /** Legacy sub-folder name, pre category-tree. Kept for migration. */
        const val SUBDIR = "Surge"
    }

    /**
     * Publish a completed file into the system collections.
     * Returns the content:// URI, or null if the file type isn't media
     * (documents/archives live in Downloads instead).
     */
    fun publish(file: File, category: String? = null): Uri? {
        if (!file.exists()) return null
        val cat = category ?: Classifier.classify(name = file.name)
        return insertDownloads(file, cat)
    }

    /**
     * Every category lives in ONE root tree (the 1DM-style layout), inserted
     * through the Downloads collection with a RELATIVE_PATH sub-folder. The
     * MIME on the row is what still makes Gallery / Music / Files index it, so
     * we keep the tidy folder structure without losing media integration.
     */
    private fun insertDownloads(file: File, category: String): Uri? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return legacyScan(file, category)
        val root = Classifier.rootBlocking(context)
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeFor(file.name))
            put(MediaStore.MediaColumns.SIZE, file.length())
            put(MediaStore.MediaColumns.IS_PENDING, 1)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Classifier.folderFor(category, root) + "/")
        }
        val resolver = context.contentResolver
        // The Downloads collection URI is a stable platform string; referencing
        // it literally avoids any SDK-symbol availability quirks.
        val downloads = Uri.parse("content://media/external/downloads")
        val uri = resolver.insert(downloads, values) ?: return legacyScan(file, category)
        return try {
            resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            file.delete()
            uri
        } catch (e: Exception) {
            Log.e(TAG, "downloads publish failed", e)
            null
        }
    }

    private fun legacyScan(file: File, category: String): Uri? {
        // Pre-scoped-storage: move into <Downloads>/<root>/<category> then scan.
        val target = File(Classifier.absoluteDir(context, category), file.name)
        try {
            target.parentFile?.mkdirs()
            if (file.absolutePath != target.absolutePath) file.renameTo(target)
        } catch (_: Exception) { /* keep it where it is */ }
        var out: Uri? = null
        MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), null) { _, uri -> out = uri }
        return out ?: Uri.fromFile(target)
    }

    /**
     * Write through a SAF tree the user picked earlier (persisted permission).
     * Used when the user sets a custom folder instead of a system collection.
     */
    fun writeViaSaf(treeUri: Uri, file: File): Uri? = try {
        val doc = androidx.documentfile.provider.DocumentFile.fromTreeUri(context, treeUri) ?: return null
        val target = doc.createFile(mimeFor(file.name), file.name) ?: return null
        context.contentResolver.openOutputStream(target.uri)?.use { out ->
            file.inputStream().use { it.copyTo(out) }
        }
        target.uri
    } catch (e: Exception) {
        Log.e(TAG, "SAF write failed", e)
        null
    }

    private fun mimeFor(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "mp4", "m4v" -> "video/mp4"
        "mkv" -> "video/x-matroska"
        "webm" -> "video/webm"
        "mov" -> "video/quicktime"
        "mp3" -> "audio/mpeg"
        "m4a" -> "audio/mp4"
        "aac" -> "audio/aac"
        "flac" -> "audio/flac"
        "ogg", "opus" -> "audio/ogg"
        "wav" -> "audio/wav"
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        "zip" -> "application/zip"
        "apk" -> "application/vnd.android.package-archive"
        "torrent" -> "application/x-bittorrent"
        "pdf" -> "application/pdf"
        else -> "application/octet-stream"
    }
}
