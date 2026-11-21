package com.carlosandmunoz.jarvis.home

import android.content.Context
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.data.Processes
import com.carlosandmunoz.jarvis.data.at
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.horologist.data.WearDataLayerRegistry
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.JsonObject
import java.io.ByteArrayOutputStream

/** Wear OS watch (#1419 / #3836): after each refresh the phone hands a small summary to the paired watch over Horologist's Data Layer, so the watch never signs in. */
object Watch {
    const val PATH = "/jarvis/status"

    data class Summary(
        val readiness: Double?, val alerts: Int, val warns: Int, val headline: String,
        val revenue: String, val sales: Int, val top: String?, val at: Long,
        val running: Int = 0, val needsYou: Int = 0,
    )

    fun summary(snap: JsonObject, today: JsonObject?, at: Long): Summary {
        val s = Home.status(snap)
        val money = (today ?: snap).obj("external").obj("money")?.takeIf { it.isOk() }
        val usd = money.at("revenue").num("usd")
        val top = snap.objs("briefing").sortedBy { if (it.str("level") == "alert") 0 else 1 }
            .firstOrNull { it.str("level") == "alert" || it.str("level") == "warn" }?.str("text")
        return Summary(s.readiness, s.alerts, s.warns, s.headline, if (usd == null) "—" else "$" + fmt(usd, 0),
            money.at("revenue").num("count")?.toInt() ?: 0, top, at, Processes.running(snap.obj("processes")), Processes.needsYou(snap.obj("processes")))
    }

    fun registry(app: JarvisApp): WearDataLayerRegistry = app.dataLayer

    /** No-op without a connected watch, so phones without one never pay for the extra one-day snapshot. */
    suspend fun sync(context: Context, today: suspend () -> JsonObject?) {
        val app = context.applicationContext as JarvisApp
        val registry = registry(app)
        val nodes = runCatching { registry.nodeClient.connectedNodes.await() }.getOrNull().orEmpty()
        if (nodes.isEmpty()) return
        val saved = Home.snapshot(app)
        val payload = if (saved == null) {
            WatchPayload(empty = true, sent = System.currentTimeMillis())
        } else {
            val (snap, at) = saved
            val s = summary(snap, today(), at)
            WatchPayload(
                readiness = s.readiness,
                alerts = s.alerts,
                warns = s.warns,
                headline = s.headline,
                revenue = s.revenue,
                sales = s.sales,
                top = s.top.orEmpty(),
                at = s.at,
                running = s.running,
                needsYou = s.needsYou,
                sent = System.currentTimeMillis(),
            )
        }
        val bytes = ByteArrayOutputStream().also { WatchPayloadSerializer.writeTo(payload, it) }.toByteArray()
        val req = PutDataRequest.create(PATH).setUrgent().apply { data = bytes }
        runCatching { registry.dataClient.putDataItem(req).await() }
    }
}
