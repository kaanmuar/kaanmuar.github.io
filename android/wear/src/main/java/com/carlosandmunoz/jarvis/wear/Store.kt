package com.carlosandmunoz.jarvis.wear

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await

/** The last summary the phone sent (#1419). The watch never signs in; everything it shows comes through here. */
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
    ) {
        val color get() = when { alerts > 0 -> PINK; warns > 0 -> AMBER; else -> GREEN }
        val percent get() = readiness?.let { "${it.toInt()}%" } ?: "—"
        val today get() = "$revenue today" + if (sales > 0) " · $sales sale" + (if (sales == 1) "" else "s") else ""
    }

    private fun prefs(context: Context) = context.getSharedPreferences("jarvis-watch", Context.MODE_PRIVATE)

    fun read(context: Context): Status? {
        val p = prefs(context)
        if (!p.contains("at")) return null
        return Status(
            p.getFloat("readiness", -1f).takeIf { it >= 0 }?.toDouble(), p.getInt("alerts", 0), p.getInt("warns", 0),
            p.getString("headline", "") ?: "", p.getString("revenue", "—") ?: "—", p.getInt("sales", 0),
            p.getString("top", null)?.takeIf { it.isNotBlank() }, p.getLong("at", 0),
        )
    }

    /** Writes what the phone sent and redraws the tile and complication; "empty" means the phone is signed out. */
    fun write(caller: Context, map: DataMap) {
        val context = caller.applicationContext
        prefs(context).edit().apply {
            clear()
            if (!map.getBoolean("empty", false)) {
                putFloat("readiness", map.getDouble("readiness", -1.0).toFloat())
                putInt("alerts", map.getInt("alerts"))
                putInt("warns", map.getInt("warns"))
                putString("headline", map.getString("headline"))
                putString("revenue", map.getString("revenue"))
                putInt("sales", map.getInt("sales"))
                putString("top", map.getString("top"))
                putLong("at", map.getLong("at"))
            }
        }.apply()
        TileService.getUpdater(context).requestUpdate(JarvisTile::class.java)
        ComplicationDataSourceUpdateRequester.create(context, ComponentName(context, ReadinessComplication::class.java)).requestUpdateAll()
    }

    /** Reads the summary already in the Data Layer, then asks the phone for a fresh one. */
    suspend fun pull(context: Context) {
        val app = context.applicationContext
        runCatching {
            val items = Wearable.getDataClient(app).dataItems.await()
            try {
                items.firstOrNull { it.uri.path == PATH }?.let { write(app, DataMapItem.fromDataItem(it).dataMap) }
            } finally {
                items.release()
            }
        }
        runCatching {
            Wearable.getNodeClient(app).connectedNodes.await().forEach {
                Wearable.getMessageClient(app).sendMessage(it.id, SYNC, null).await()
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
