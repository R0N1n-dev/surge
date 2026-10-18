package com.surge.downloader

import android.os.Bundle
import com.getcapacitor.BridgeActivity

/**
 * Restored by tools/android-overlay.mjs after EVERY cap sync / cap add.
 *
 * Belt one of two: manual plugin registration. The bridge also auto-registers
 * from assets/capacitor.plugins.json (belt two, merged by the same overlay), so
 * even if one mechanism regresses the plugins still load.
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        android.util.Log.i("SurgeBoot", "MainActivity.onCreate")
        registerPlugin(com.surge.downloader.plugins.DownloaderPlugin::class.java)
        registerPlugin(com.surge.downloader.plugins.TorrentPlugin::class.java)
        registerPlugin(com.surge.downloader.plugins.MediaPlugin::class.java)
        registerPlugin(com.surge.downloader.plugins.StoragePlugin::class.java)
        registerPlugin(com.surge.downloader.plugins.WidgetPlugin::class.java)
        registerPlugin(com.surge.downloader.plugins.NotifierPlugin::class.java)
        registerPlugin(com.surge.downloader.plugins.SafeAreaPlugin::class.java)
        super.onCreate(savedInstanceState)
        android.util.Log.i("SurgeBoot", "plugins registered; WebView loading")
    }
}
