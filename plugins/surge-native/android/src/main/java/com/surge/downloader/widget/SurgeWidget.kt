package com.surge.downloader.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.surge.downloader.R

/**
 * 4×2 home-screen widget: live aggregate speed, the top download's name and
 * progress, plus two shortcuts (pause-all and quick-add).
 *
 * RemoteViews (not Glance/Compose) on purpose: it is a few KB, has zero Compose
 * runtime cost in a WebView-hosting app, and updates cheaply from the service
 * poll loop without waking the WebView at all.
 */
class SurgeWidget : AppWidgetProvider() {

    companion object {
        const val ACTION_PAUSE = "com.surge.downloader.WIDGET_PAUSE"
        const val ACTION_ADD = "com.surge.downloader.WIDGET_ADD"

        /** Called by DownloadService on every poll tick. */
        fun refresh(context: Context, active: Int, down: Long, up: Long, topName: String?, pct: Float = 0f) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, SurgeWidget::class.java))
            if (ids.isEmpty()) return
            val views = build(context, active, down, up, topName, pct)
            mgr.updateAppWidget(ids, views)
        }

        private fun build(context: Context, active: Int, down: Long, up: Long, topName: String?, pct: Float): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_surge)

            val headline = if (active > 0) "$active active · ${human(down)}/s" else "All downloads complete"
            views.setTextViewText(R.id.widget_title, headline)
            views.setTextViewText(R.id.widget_speed, "↓${human(down)} ↑${human(up)}")
            views.setTextViewText(
                R.id.widget_name,
                topName?.substringAfterLast('/') ?: "Tap to open Library",
            )
            // The bar is the whole point of the widget. It was never driven, so
            // it sat empty forever even mid-transfer.
            views.setProgressBar(
                R.id.widget_progress,
                100,
                (pct.coerceIn(0f, 1f) * 100).toInt(),
                active == 0,
            )

            // Tap the body -> Downloads tab.
            views.setOnClickPendingIntent(
                R.id.widget_root,
                PendingIntent.getActivity(
                    context, 0,
                    launch(context, "/"),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            // Pause-all action.
            views.setOnClickPendingIntent(
                R.id.widget_pause,
                PendingIntent.getBroadcast(
                    context, 1,
                    Intent(context, SurgeWidget::class.java).setAction(ACTION_PAUSE),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            // Quick-add action.
            views.setOnClickPendingIntent(
                R.id.widget_add,
                PendingIntent.getActivity(
                    context, 2,
                    launch(context, "/add"),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            return views
        }

        /** Launcher activity via package manager - no app-module dependency. */
        private fun launch(context: Context, route: String): Intent =
            context.packageManager.getLaunchIntentForPackage(context.packageName)!!
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("route", route)

        private fun human(bytes: Long): String = when {
            bytes >= 1L shl 20 -> String.format("%.1f MB", bytes / 1024.0 / 1024)
            bytes >= 1024 -> String.format("%.0f KB", bytes / 1024.0)
            else -> "$bytes B"
        }
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        // Initial paint; the service overwrites with live numbers shortly.
        mgr.updateAppWidget(ids, build(context, 0, 0, 0, null, 0f))
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_PAUSE -> {
                // Forward to the notification-action receiver so there is one
                // code path for "pause everything".
                context.sendBroadcast(
                    Intent(context, com.surge.downloader.receiver.NotificationActionReceiver::class.java)
                        .setAction(com.surge.downloader.receiver.NotificationActionReceiver.ACTION_PAUSE_ALL),
                )
            }
            else -> super.onReceive(context, intent)
        }
    }
}
