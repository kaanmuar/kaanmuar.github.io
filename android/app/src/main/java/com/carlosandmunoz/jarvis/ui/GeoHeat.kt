package com.carlosandmunoz.jarvis.ui

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.floor
import kotlin.math.round
import kotlin.math.sqrt

/** The Map's heatmap and sector grid (#3112), twin of js/admin-jarvis-geo-heat.js, from the geo source's `heat` and `sectors`. */
object GeoHeat {
    val DAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    val KINDS = listOf("replies" to "Replies", "sends" to "Sends")
    val SECTOR_METRICS = listOf("prospects" to "Prospects", "sent" to "Sent", "replies" to "Replies", "replyRate" to "Reply rate")
    val WINDOW = Color(0xFFFFB547)
    private val TIMED = setOf("all", "email")

    /** A value's light level against the largest: 0 for none, else 1 to 5 on a square-root scale. Twin: levelOf on the web. */
    fun levelOf(v: Double?, max: Double): Int {
        if (v == null || v <= 0 || max <= 0) return 0
        return (1 + floor(sqrt(minOf(1.0, v / max)) * 5 - 1e-9).toInt()).coerceIn(1, 5)
    }

    /** Whether the window mask (42 hex digits, six per day from Monday, bit 23 - hour) has a campaign sending then. */
    fun windowOn(hex: String, d: Int, h: Int): Boolean {
        if (hex.length < (d + 1) * 6) return false
        val v = hex.substring(d * 6, d * 6 + 6).toIntOrNull(16) ?: return false
        return (v shr (23 - h)) and 1 == 1
    }

    fun timed(channel: String) = channel in TIMED

    data class Cell(val n: Int, val positive: Int)
    data class View(val grid: List<Cell>, val window: String, val total: Int, val max: Int, val best: Int?, val inWindow: Int?, val zone: String)

    private fun nums(e: Any?) = (e as? JsonArray)?.map { (it as? JsonPrimitive)?.doubleOrNull?.toInt() ?: 0 } ?: emptyList()

    /** The 168 cells (day * 24 + hour) of sparse [day, hour, n, positive] rows. */
    fun cells(rows: List<Any?>): List<Cell> {
        val out = MutableList(168) { Cell(0, 0) }
        rows.forEach { r -> val c = nums(r); if (c.size >= 3) { val k = c[0] * 24 + c[1]; if (k in 0 until 168) out[k] = Cell(c[2], c.getOrElse(3) { 0 }) } }
        return out
    }

    /** What the heatmap draws for the country (or every country) and kind. */
    fun view(heat: JsonObject, cc: String?, kind: String): View {
        val one = cc?.let { heat.obj("countries").obj(it) }
        val src = one ?: heat.obj("all")
        val grid = cells(src.arr(if (kind == "sends") "s" else "r"))
        val w = one?.str("w").orEmpty()
        val total = grid.sumOf { it.n }
        val max = grid.maxOf { it.n }
        val best = if (max > 0) grid.indexOfFirst { it.n == max } else null
        val inWindow = if (w.isNotEmpty()) grid.indices.sumOf { k -> if (windowOn(w, k / 24, k % 24)) grid[k].n else 0 } else null
        return View(grid, w, total, max, best, inWindow, if (one != null) heat.obj("zones").str(cc!!).orEmpty() else "")
    }

    fun hh(h: Int) = h.toString().padStart(2, '0') + ":00"

    fun tip(v: View, k: Int, kind: String): String {
        val c = v.grid[k]
        val noun = if (kind == "sends") (if (c.n == 1) "send" else "sends") else if (c.n == 1) "reply" else "replies"
        return "${DAYS[k / 24]} ${hh(k % 24)}–${hh((k % 24 + 1) % 24)}: ${c.n} $noun" + (if (c.positive > 0) ", ${c.positive} positive" else "") + (if (windowOn(v.window, k / 24, k % 24)) " · sending window" else "")
    }

    /** A sector cell's number for a metric, or null (no emails sent has no reply rate). */
    fun sectorValue(row: JsonObject, n: Int, key: String): Double? {
        val p = nums(row["p"]).getOrElse(n) { 0 }.toDouble()
        val s = nums(row["s"]).getOrElse(n) { 0 }.toDouble()
        val r = nums(row["r"]).getOrElse(n) { 0 }.toDouble()
        return when (key) {
            "prospects" -> p
            "sent" -> s
            "replies" -> r
            else -> if (s > 0) round(r / s * 1000) / 10 else null
        }
    }
    fun showValue(v: Double?, key: String) = if (v == null) "—" else fmt(v) + if (key == "replyRate") "%" else ""
    fun sectorLabel(s: String) = when (s) { "?" -> "No sector"; "tvet" -> "TVET"; else -> s.replaceFirstChar { it.uppercase() } }
    fun sectors(grid: JsonObject) = grid.arr("list").map { (it as? JsonPrimitive)?.contentOrNull.orEmpty() }

    /** The metric the grid shows: the one picked, else Sent on Cold email and Prospects elsewhere. */
    fun metric(picked: String?, channel: String) = picked?.takeIf { p -> SECTOR_METRICS.any { it.first == p } } ?: if (channel == "email") "sent" else "prospects"

    /** The heavy sections start folded on a phone the first time they show, so their charts draw only once opened. */
    fun foldFirstTime(context: Context, keys: List<String>) {
        Folds.load(context)
        val p = context.applicationContext.getSharedPreferences("jarvis_ui", Context.MODE_PRIVATE)
        val done = p.getStringSet("folded_once", emptySet()) ?: emptySet()
        val fresh = keys.filter { it !in done }
        if (fresh.isEmpty()) return
        fresh.forEach { Folds.set(it, true) }
        p.edit().putStringSet("folded_once", done + fresh).apply()
    }
}

/** The Heatmap and Sector grid panels under the ranking; they follow the picked country and the channel. */
@Composable
fun GeoHeatPanels(g: JsonObject, picked: String?, channel: String, pick: (String) -> Unit) {
    val context = LocalContext.current
    remember { GeoHeat.foldFirstTime(context, listOf("geo-heat", "geo-sectors")) }
    val heat = g.obj("heat")
    val grid = g.obj("sectors")
    val sel = g.objs("countries").firstOrNull { it.str("cc") == picked }
    var kind by rememberSaveable { mutableStateOf("replies") }
    var metricPick by rememberSaveable { mutableStateOf<String?>(null) }
    val name = sel?.str("name")

    Panel("Heatmap · ${if (kind == "sends") "sends" else "replies"}" + (name?.let { " · $it" } ?: ""), key = "geo-heat", id = "geo-heat") {
        if (heat == null) { Muted("The geo source has no heatmap yet; it comes with the next refresh."); return@Panel }
        if (!GeoHeat.timed(channel)) { Muted("Only cold email has hours: pick All or Cold email for replies and sends by hour."); return@Panel }
        HeatChips(GeoHeat.KINDS, kind) { kind = it }
        val v = remember(heat, picked, kind) { GeoHeat.view(heat, sel?.str("cc"), kind) }
        val noun = if (kind == "sends") "sends" else "replies"
        val where = if (sel == null) "each country's local time" else if (v.zone.isNotEmpty()) "$name's local time (${v.zone})" else "$name: no time zone known"
        Muted(if (v.total > 0) "${v.total} $noun in $where. Busiest: ${GeoHeat.DAYS[v.best!! / 24]} ${GeoHeat.hh(v.best % 24)} (${v.max})." + (v.inWindow?.let { " $it of ${v.total} inside the sending window." } ?: "")
              else "No $noun ${if (sel != null) "from $name" else "yet"} in $where.")
        HeatGrid(v, kind)
        LightKey()
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(11.dp).border(1.5.dp, GeoHeat.WINDOW, RoundedCornerShape(3.dp)))
            Muted(if (sel == null) "Pick a country to see its campaigns' sending window." else if (v.window.isNotEmpty()) "Sending window of its campaigns, in its local time." else "No campaign with a sending window reaches it.")
        }
        val multi = heat.arr("multi").mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.map { "$it ${heat.obj("zones").str(it).orEmpty()}" }
        val unzoned = heat.num("unzoned") ?: 0.0
        Muted("Replies are the outreach sync's last 80; sends are Instantly's last 200 sent emails" + (if (unzoned > 0) "; ${fmt(unzoned)} have no known country or time zone" else "") + "." +
            (if (multi.isNotEmpty()) " Countries with several zones use their most populous one: ${multi.joinToString(", ")}." else ""))
    }

    val metric = GeoHeat.metric(metricPick, channel)
    Panel("Sector grid · ${GeoHeat.SECTOR_METRICS.first { it.first == metric }.second}", key = "geo-sectors", id = "geo-sectors") {
        if (grid == null) { Muted("The geo source has no sector grid yet; it comes with the next refresh."); return@Panel }
        grid.arr("needs").mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.forEach { Text(it, color = J.amber, fontSize = 13.sp) }
        HeatChips(GeoHeat.SECTOR_METRICS, metric) { metricPick = it }
        val rows = grid.objs("rows")
        if (rows.isEmpty()) Muted("No country has prospects or emails by sector yet.")
        else SectorTable(grid, rows, metric, picked, pick)
        LightKey()
        val more = grid.num("more") ?: 0.0
        Muted("Sectors from the prospect queue. Sent and replies are est.: each campaign split across its synced leads, a lead taking its site's sector from the queue." +
            (if (more > 0) " ${fmt(more)} smaller countries left out." else "") + " Tap a cell for the country.")
    }
}

@Composable
private fun HeatChips(items: List<Pair<String, String>>, on: String, pick: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        items.forEach { (k, label) -> TextButton({ pick(k) }) { Text(label, color = if (k == on) J.cyan else J.muted, fontWeight = if (k == on) FontWeight.Bold else FontWeight.Normal, fontSize = 13.sp) } }
    }
}

@Composable
private fun LightKey() {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Geo.LIGHTS.forEachIndexed { n, l ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(10.dp).background(l.color, RoundedCornerShape(3.dp)))
                Muted(if (n == 0) "None" else l.name)
            }
        }
    }
}

/** The 7 × 24 grid on a Canvas: a light-level fill per hour, a gold dot for positive replies, the window outlined. Tap a cell for its numbers. */
@Composable
private fun HeatGrid(v: GeoHeat.View, kind: String) {
    var tapped by remember(v) { mutableStateOf<Int?>(null) }
    val label = remember { android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF5D7A8C.toInt() } }
    val left = 30f
    val top = 14f
    val cols = 24
    Canvas(
        Modifier.fillMaxWidth().aspectRatio((left + cols * 16f + 2f) / (top + 7 * 16f + 2f)).pointerInput(v) {
            detectTapGestures { at ->
                val k = size.width / (left + cols * 16f + 2f)
                val h = ((at.x / k - left) / 16f).toInt()
                val d = ((at.y / k - top) / 16f).toInt()
                tapped = if (at.x / k >= left && at.y / k >= top && h in 0 until 24 && d in 0 until 7) d * 24 + h else null
            }
        }
    ) {
        val k = size.width / (left + cols * 16f + 2f)
        val cw = 16f * k
        label.textSize = 7.5f * k
        label.textAlign = android.graphics.Paint.Align.CENTER
        for (h in 0 until 24 step 3) drawContext.canvas.nativeCanvas.drawText("$h", (left + h * 16f + 8f) * k, (top - 4f) * k, label)
        label.textAlign = android.graphics.Paint.Align.RIGHT
        GeoHeat.DAYS.forEachIndexed { d, day ->
            drawContext.canvas.nativeCanvas.drawText(day, (left - 5f) * k, (top + d * 16f + 16f * 0.68f) * k, label)
            for (h in 0 until 24) {
                val c = v.grid[d * 24 + h]
                val l = GeoHeat.levelOf(c.n.toDouble(), v.max.toDouble())
                val x = (left + h * 16f) * k
                val y = (top + d * 16f) * k
                drawRoundRect(Geo.LIGHTS[l].color, Offset(x + k, y + k), Size(cw - 2 * k, cw - 2 * k), CornerRadius(2.5f * k))
                if (l == 0) drawRoundRect(Color(0xFF1D3340), Offset(x + k, y + k), Size(cw - 2 * k, cw - 2 * k), CornerRadius(2.5f * k), style = Stroke(0.5f * k))
                if (GeoHeat.windowOn(v.window, d, h)) drawRoundRect(GeoHeat.WINDOW, Offset(x + 0.5f * k, y + 0.5f * k), Size(cw - k, cw - k), CornerRadius(3f * k), style = Stroke(1.2f * k))
                if (c.positive > 0) drawCircle(Geo.LIGHTS[5].color, 2.2f * k, Offset(x + cw / 2, y + cw / 2))
                if (tapped == d * 24 + h) drawRoundRect(Color.White, Offset(x, y), Size(cw, cw), CornerRadius(3f * k), style = Stroke(1.5f * k))
            }
        }
    }
    tapped?.let { Text(GeoHeat.tip(v, it, kind), color = J.text, fontSize = 13.sp) }
}

/** Countries by sector: each cell a tappable box shaded by its light level that opens the country sheet. */
@Composable
private fun SectorTable(grid: JsonObject, rows: List<JsonObject>, key: String, picked: String?, pick: (String) -> Unit) {
    val list = GeoHeat.sectors(grid)
    val max = rows.maxOf { r -> list.indices.maxOfOrNull { GeoHeat.sectorValue(r, it, key) ?: 0.0 } ?: 0.0 }
    Column(Modifier.horizontalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Box(Modifier.width(96.dp))
            list.forEach { Text(GeoHeat.sectorLabel(it), color = J.dim, fontSize = 11.sp, maxLines = 1, modifier = Modifier.width(58.dp).padding(horizontal = 2.dp)) }
        }
        rows.forEach { r ->
            val cc = r.str("cc").orEmpty()
            val on = cc == picked
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(r.str("name").orEmpty(), color = if (on) J.amber else J.cyan, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1,
                    modifier = Modifier.width(96.dp).clickable { pick(cc) })
                list.indices.forEach { n ->
                    val v = GeoHeat.sectorValue(r, n, key)
                    val l = GeoHeat.levelOf(v, max)
                    Box(
                        Modifier.width(58.dp).height(30.dp).background(Geo.LIGHTS[l].color, RoundedCornerShape(5.dp))
                            .border(1.dp, if (on) J.amber else if (l == 0) Color(0xFF1D3340) else Color.Transparent, RoundedCornerShape(5.dp))
                            .clickable(onClickLabel = "Open ${r.str("name")}") { pick(cc) },
                        contentAlignment = Alignment.Center
                    ) {
                        if ((v ?: 0.0) > 0) Text(GeoHeat.showValue(v, key), color = if (l >= 4) Color(0xFF04131A) else Color.White, fontSize = 12.sp, fontWeight = if (l >= 4) FontWeight.SemiBold else FontWeight.Normal)
                    }
                }
            }
        }
    }
}
