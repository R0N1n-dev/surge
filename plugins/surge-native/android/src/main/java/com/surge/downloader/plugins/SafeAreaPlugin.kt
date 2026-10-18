package com.surge.downloader.plugins

import android.app.Activity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * System-bar insets for the WebView.
 *
 * WHY THIS EXISTS
 * ---------------
 * `env(safe-area-inset-*)` is an iOS/WebKit feature. On Android the WebView
 * reports all four insets as 0, so a CSS-only edge-to-edge layout silently draws
 * its app bar *under* the status bar (the pull-down notification area) and its
 * bottom nav under the gesture pill — exactly the "content escaping the screen"
 * bug. Capacitor's StatusBar plugin can colour the bar but cannot tell JS how
 * tall it is.
 *
 * So we measure with WindowInsetsCompat and hand JS device-pixel-free CSS
 * pixels. JS stamps them on :root as --sat/--sab/--sal/--sar and every fixed
 * surface (shell padding, nav, FAB, snackbars, sheets, sticky footers) consumes
 * them. Result: content always sits *between* the system bars, the background
 * still runs edge-to-edge behind them, and pulling the notification shade never
 * reveals UI crammed underneath it.
 */
@CapacitorPlugin(name = "SafeArea")
class SafeAreaPlugin : Plugin() {

    private fun insets(): JSObject {
        val act: Activity = bridge.activity
        val density = act.resources.displayMetrics.density
        val root = act.window.decorView
        val wi = ViewCompat.getRootWindowInsets(root)
        val bars = wi?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val ime = wi?.getInsets(WindowInsetsCompat.Type.ime())
        return JSObject().apply {
            put("top", px2dp(bars?.top ?: 0, density))
            put("bottom", px2dp(bars?.bottom ?: 0, density))
            put("left", px2dp(bars?.left ?: 0, density))
            put("right", px2dp(bars?.right ?: 0, density))
            put("keyboard", px2dp(ime?.bottom ?: 0, density))
            put("landscape", act.resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE)
        }
    }

    private fun px2dp(px: Int, density: Float): Int = Math.round(px / density)

    @PluginMethod
    fun getInsets(call: PluginCall) = call.resolve(insets())

    /**
     * Re-measure. Called from JS on orientation change and on keyboard
     * show/hide (visualViewport resize), because both move the bars.
     */
    @PluginMethod
    fun refresh(call: PluginCall) = call.resolve(insets())
}
