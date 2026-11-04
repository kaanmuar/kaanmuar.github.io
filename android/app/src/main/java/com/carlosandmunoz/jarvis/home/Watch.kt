package com.carlosandmunoz.jarvis.home

import android.content.Context
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.data.at
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.JsonObject

/** Wear OS watch (#1419): after each refresh the phone hands a small summary to the paired watch over the Data Layer, so the watch never signs in. */
object Watch {
    const val PATH = "/jarvis/status"

    data class Summary(
        val readiness: Double?, val alerts: Int, val warns: Int, val headline: String,
        val revenue: String, val sales: Int, val top: String?, val at: Long,
    )

    fun summary(snap: JsonObject, today: JsonObject?, at: Long): Summary {
        val s = Home.status(snap)
        val money = (today ?: snap).obj("external").obj("money")?.takeIf { it.isOk() }
        val usd = money.at("revenue").num("usd")
        val top = snap.objs("briefing").sortedBy { if (it.str("level") == "alert") 0 else 1 }
            .firstOrNull { it.str("level") == "alert" || it.str("level") == "warn" }?.str("text")
        return Summary(s.readiness, s.alerts, s.warns, s.headline, if (usd == null) "—" else "$" + fmt(usd, 0),
            money.at("revenue").num("count")?.toInt() ?: 0, top, at)
    }

    /** No-op without a connected watch, so phones without one never pay for the extra one-day snapshot. */
    suspend fun sync(context: Context, today: suspend () -> JsonObject?) {
        val app = context.applicationContext as JarvisApp
        val nodes = runCatching { Wearable.getNodeClient(app).connectedNodes.await() }.getOrNull().orEmpty()
        if (nodes.isEmpty()) return
        val req = PutDataMapRequest.create(PATH)
        val saved = Home.snapshot(app)
        if (saved == null) req.dataMap.putBoolean("empty", true)
        else {
            val (snap, at) = saved
            val s = summary(snap, today(), at)
            req.dataMap.apply {
                putDouble("readiness", s.readiness ?: -1.0)
                putInt("alerts", s.alerts)
                putInt("warns", s.warns)
                putString("headline", s.headline)
                putString("revenue", s.revenue)
                putInt("sales", s.sales)
                putString("top", s.top ?: "")
                putLong("at", s.at)
            }
        }
        req.dataMap.putLong("sent", System.currentTimeMillis())
        runCatching { Wearable.getDataClient(app).putDataItem(req.asPutDataRequest().setUrgent()).await() }
    }
}
