package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.abs

/** Short-link clicks by visitor country (#3281), twin of js/admin-jarvis-geo-clicks.js: the country sheet's
 *  "Visitors from here vs prospects here" block and the Map's note when Clicks is on. */
object GeoClicks {
    data class Line(val label: String, val visitors: Double, val prospects: Double, val usd: Boolean = false)
    private val KIND_LABELS = mapOf("outreach" to "outreach email", "social" to "social replies", "channel" to "channels", "call" to "call links", "landing" to "landing", "unknown" to "other")

    /** The block's lines, or null when no link reached or came from this country. */
    fun rows(r: JsonObject?): List<Line>? {
        if (r == null) return null
        fun n(k: String) = r.num(k) ?: 0.0
        val list = listOf(
            Line("Short-link clicks", n("clicks"), n("prospectClicks")), Line("Review page opens", n("visitorVisits"), n("visits")),
            Line("Reviews", n("visitorReviews"), n("reviews")), Line("Paid unlocks", n("visitorPaid"), n("paid")), Line("Revenue (USD)", n("visitorUsd"), n("usd"), usd = true)
        )
        return list.takeIf { l -> l.any { it.visitors > 0 || it.prospects > 0 } }
    }

    /** "outreach email 8, social replies 3", largest first. */
    fun kindsText(kinds: JsonObject?): String = kinds.orEmpty().mapNotNull { (k, v) -> (v as? JsonPrimitive)?.doubleOrNull?.takeIf { it > 0 }?.let { k to it } }
        .sortedWith(compareByDescending<Pair<String, Double>> { it.second }.thenBy { it.first })
        .joinToString(", ") { (k, v) -> "${KIND_LABELS[k] ?: k} ${fmt(v)}" }

    /** The clicks against the span before, "" when neither has any. */
    fun changeText(r: JsonObject?): String {
        val now = r?.num("clicks") ?: 0.0
        val was = r?.num("clicksPrior") ?: 0.0
        if (now == 0.0 && was == 0.0) return ""
        val d = now - was
        return if (d == 0.0) "same as the span before" else "${if (d > 0) "+" else "−"}${fmt(abs(d))} on the span before"
    }

    /** The Map's note on Clicks: the range's total, the span before and how many had no country; "" before the first read. */
    fun note(g: JsonObject?): String {
        val t = g.obj("totals") ?: return ""
        val clicks = t.num("clicks") ?: return ""
        val before = t.num("clicksPrior")?.let { ", ${fmt(it)} the span before" }.orEmpty()
        val unknown = (t.num("clicksUnknown") ?: 0.0).takeIf { it > 0 }?.let { "; ${fmt(it)} with no country" }.orEmpty()
        return "${fmt(clicks)} short-link clicks$before$unknown. Bots and link previews are left out."
    }
}

@Composable
fun GeoClicksSheet(r: JsonObject) {
    val lines = GeoClicks.rows(r) ?: return
    val name = r.str("name") ?: r.str("cc").orEmpty()
    Text("VISITORS FROM HERE VS PROSPECTS HERE", color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
    Column {
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Text("", modifier = Modifier.weight(1f))
            Text("From $name", fontSize = 11.sp, color = J.muted, textAlign = TextAlign.End, modifier = Modifier.width(96.dp))
            Text("Prospects here", fontSize = 11.sp, color = J.muted, textAlign = TextAlign.End, modifier = Modifier.width(96.dp))
        }
        lines.forEach { l ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(l.label, fontSize = 13.sp, color = J.text, modifier = Modifier.weight(1f))
                Text((if (l.usd) "$" else "") + fmt(l.visitors), fontSize = 13.sp, color = J.text, textAlign = TextAlign.End, modifier = Modifier.width(96.dp))
                Text((if (l.usd) "$" else "") + fmt(l.prospects), fontSize = 13.sp, color = J.muted, textAlign = TextAlign.End, modifier = Modifier.width(96.dp))
            }
        }
    }
    val note = listOf(GeoClicks.kindsText(r.obj("clickKinds")).takeIf { it.isNotEmpty() }?.let { "Clicks: $it" }, GeoClicks.changeText(r).takeIf { it.isNotEmpty() }).filterNotNull().joinToString(" · ")
    Muted((if (note.isNotEmpty()) "$note. " else "") + "From: where the person who clicked was. Prospects here: the sites we wrote to in $name, wherever their clicks came from.")
}
