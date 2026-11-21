package com.carlosandmunoz.jarvis.wear

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import kotlinx.coroutines.tasks.await
import java.io.ByteArrayInputStream

/** The last summary the phone sent (#1419 / #3836). The watch never signs in; everything it shows comes through Horologist's Data Layer. */
object Store {
    const val PATH = "/jarvis/status"
    const val SYNC = "/jarvis/sync"
    const val STALE_MS = 35 * 60_000L

    const val CYAN = 0xFF38E1FF.toInt()
    const val AMBER = 0xFFFFB547.toInt()
    const val PINK = 0xFFFF4D8D.toInt()
    const val GREEN = 0xFF3DFFA8.toInt()
    const val TEXT = 0xFFE6F7FF.toInt()
    const val MUTED = 0xFF8FB3C7.toInt()
    const val TRACK = 0x2638E1FF

    data class Status(
        val readiness: Double?, val alerts: Int, val warns: Int, val headline: String,
        val revenue: String, val sales: Int, val top: String?, val at: Long,
        val running: Int = 0, val needsYou: Int = 0,
    ) {
        val color get() = when { alerts > 0 -> PINK; warns > 0 -> AMBER; else -> GREEN }
        val percent get() = readiness?.let { "${it.toInt()}%" } ?: "—"
        val today get() = "$revenue today" + if (sales > 0) " · $sales sale" + (if (sales == 1) "" else "s") else ""
        /** Live processes (#2548): "2 running · 1 needs you", or null when nothing runs or waits. */
        val processes get() = listOfNotNull("$running running".takeIf { running > 0 }, "$needsYou needs you".takeIf { needsYou > 0 }).joinToString(" · ").ifEmpty { null }
        val processColor get() = if (needsYou > 0) AMBER else CYAN
    }

    private fun prefs(context: Context) = context.getSharedPreferences("jarvis-watch", Context.MODE_PRIVATE)

    fun read(context: Context): Status? {
        val p = prefs(context)
        if (!p.contains("at")) return null
        return Status(
            p.getFloat("readiness", -1f).takeIf { it >= 0 }?.toDouble(), p.getInt("alerts", 0), p.getInt("warns", 0),
            p.getString("headline", "") ?: "", p.getString("revenue", "—") ?: "—", p.getInt("sales", 0),
            p.getString("top", null)?.takeIf { it.isNotBlank() }, p.getLong("at", 0),
            p.getInt("running", 0), p.getInt("needsYou", 0),
        )
    }

    /** Writes what the phone sent and redraws the tile and complication; null / empty means the phone is signed out. */
    fun apply(caller: Context, payload: WatchPayload) {
        write(caller, payload.toStatus())
    }

    fun write(caller: Context, status: Status?) {
        val context = caller.applicationContext
        prefs(context).edit().apply {
            clear()
            if (status != null) {
                putFloat("readiness", (status.readiness ?: -1.0).toFloat())
                putInt("alerts", status.alerts)
                putInt("warns", status.warns)
                putString("headline", status.headline)
                putString("revenue", status.revenue)
                putInt("sales", status.sales)
                putString("top", status.top)
                putLong("at", status.at)
                putInt("running", status.running)
                putInt("needsYou", status.needsYou)
            }
        }.apply()
        TileService.getUpdater(context).requestUpdate(JarvisTile::class.java)
        ComplicationDataSourceUpdateRequester.create(context, ComponentName(context, ReadinessComplication::class.java)).requestUpdateAll()
    }

    /** Reads the summary already in the Data Layer, then asks the phone for a fresh one. */
    suspend fun pull(context: Context) {
        val app = context.applicationContext
        val registry = DataLayer.registry(app)
        runCatching {
            val items = registry.dataClient.dataItems.await()
            try {
                items.firstOrNull { it.uri.path == PATH }?.data?.let { bytes ->
                    val payload = WatchPayloadSerializer.readFrom(ByteArrayInputStream(bytes))
                    apply(app, payload)
                }
            } finally {
                items.release()
            }
        }
        runCatching {
            registry.nodeClient.connectedNodes.await().forEach {
                registry.messageClient.sendMessage(it.id, SYNC, null).await()
            }
        }
    }

    fun ago(at: Long, now: Long = System.currentTimeMillis()): String {
        val min = ((now - at) / 60_000).coerceAtLeast(0)
        return when {
            min < 1 -> "just now"
            min < 60 -> "${min}m ago"
            min < 48 * 60 -> "${min / 60}h ago"
            else -> "${min / 1440}d ago"
        }
    }
}
