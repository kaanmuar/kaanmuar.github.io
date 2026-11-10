package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlin.math.sqrt

/** The Map tab over time (#3109), twin of js/admin-jarvis-geo-time.js: 7, 30 or 90 days against the span before and the
 *  last 13 weeks played week by week, from the geo source's `time` (functions/jarvis-geo-time.js). Rows built here have
 *  the geo rows' fields, so Geo.value, Geo.fills and the map draw them as they draw today's. */
object GeoTime {
    val SPANS = listOf(0 to "Now", 7 to "7 days", 30 to "30 days", 90 to "90 days")
    /** The history's fields, FIELDS in functions/jarvis-geo-time.js. */
    val FIELDS = listOf("sent", "opened", "replies", "interested", "bounced", "answered", "positive", "prospects", "swept", "left", "reviewed", "social", "visitors", "visits", "reviews", "paid", "usd")
    private val KEYS = setOf("light", "activity", "sent", "replies", "replyRate", "positive", "openRate", "bounceRate", "prospects", "left", "saturation", "reviewed", "social", "visitors", "visits", "reviews", "paid", "usd")
    private val WORSE_UP = setOf("bounceRate")
    val UP = Color(0xFF38E1FF)
    val DOWN = Color(0xFFFF4D8D)
    const val STEP_MS = 1400L
    private val DAY = DateTimeFormatter.ofPattern("MMM d", Locale.US)

    fun short(day: String?): String = day?.let { runCatching { LocalDate.parse(it).format(DAY) }.getOrNull() } ?: ""
    private fun plus(day: String, n: Long) = runCatching { LocalDate.parse(day).plusDays(n).toString() }.getOrDefault(day)
    private fun round1(n: Double) = Math.round(n * 10) / 10.0

    fun weeks(g: JsonObject?): Int = (g.obj("time").obj("weeks")?.get("start") as? JsonArray)?.size ?: 0

    /** Whether the history can draw this metric; bounce rate only once Instantly sends bounces per day. */
    fun canShow(time: JsonObject?, key: String): Boolean {
        if (time == null || key !in KEYS) return false
        if (key != "bounceRate") return true
        return time.obj("ranges").obj("7").obj("c")?.values?.any { (it as? JsonObject)?.containsKey("bounced") == true } == true
    }

    // A row with the geo row's fields: name and target from today's row, numbers from get(field), rounded as geoRows rounds.
    private fun rowOf(base: Map<String, JsonObject>, cc: String, get: (String) -> Double?): JsonObject {
        val b = base[cc]
        val m = linkedMapOf<String, JsonElement>(
            "cc" to JsonPrimitive(cc), "name" to JsonPrimitive(b?.str("name") ?: Locale("", cc).getDisplayCountry(Locale.ENGLISH).ifBlank { cc }),
            "target" to JsonPrimitive(b?.get("target")?.let { (it as? JsonPrimitive)?.content == "true" } ?: false),
            "langs" to (b?.get("langs") ?: JsonArray(emptyList())), "gaps" to JsonArray(emptyList()), "camps" to JsonArray(emptyList()), "sectors" to JsonArray(emptyList())
        )
        val nums = FIELDS.associateWith { f -> get(f)?.let { if (f == "usd") Math.round(it * 100) / 100.0 else it.roundToLong().toDouble() } }
        nums.forEach { (f, v) -> m[f] = if (v == null) JsonNull else JsonPrimitive(v) }
        val sent = nums["sent"] ?: 0.0
        m["replyRate"] = if (sent > 0) JsonPrimitive(round1((nums["replies"] ?: 0.0) / sent * 100)) else JsonNull
        m["openRate"] = if (sent > 0) JsonPrimitive(round1((nums["opened"] ?: 0.0) / sent * 100)) else JsonNull
        if (nums["bounced"] == null) m["bounced"] = JsonPrimitive(0)
        val row = JsonObject(m)
        return JsonObject(m + ("light" to JsonPrimitive(Geo.lightOf(row))))
    }

    private fun rowsFrom(g: JsonObject, byCc: JsonObject?, pick: (JsonArray) -> JsonElement?): List<JsonObject> {
        val base = g.objs("countries").associateBy { it.str("cc").orEmpty() }
        val ccs = LinkedHashSet(base.keys + (byCc?.keys ?: emptySet()))
        return ccs.map { cc ->
            val fields = byCc?.get(cc) as? JsonObject
            rowOf(base, cc) { f -> (fields?.get(f) as? JsonArray)?.let { list -> (pick(list) as? JsonPrimitive)?.doubleOrNull } }
        }
    }

    /** Every country over a range: which 0 is the last n days to yesterday, 1 the n days before. */
    fun spanRows(g: JsonObject, n: Int, which: Int) = rowsFrom(g, g.obj("time").obj("ranges").obj("$n").obj("c")) { it.getOrNull(which) }
    /** Every country in week k of the 13 (0 the oldest). */
    fun weekRows(g: JsonObject, k: Int) = rowsFrom(g, g.obj("time").obj("weeks").obj("c")) { it.getOrNull(k) }

    /** A row's number for a metric, null where the history has none (Geo.value reads a missing count as 0). */
    fun valueOf(r: JsonObject?, key: String): Double? = if (r == null || (key in FIELDS && r[key] is JsonNull)) null else Geo.value(r, key)

    /** The change in a metric between two rows, null when either has no number. */
    fun deltaOf(now: JsonObject?, before: JsonObject?, key: String): Double? {
        val a = valueOf(now, key) ?: return null
        val b = valueOf(before, key) ?: return null
        return round1(a - b)
    }

    data class View(val mode: String, val rows: List<JsonObject>, val delta: Map<String, Double?>? = null, val before: Map<String, JsonObject> = emptyMap(),
                    val fills: Map<String, Color>? = null, val label: String = "", val note: String = "", val span: Int = 0, val week: Int? = null)

    /** What the map shows for the time controls, as view() in js/admin-jarvis-geo-time.js. */
    fun view(g: JsonObject, span: Int, week: Int?, shade: Boolean, key: String): View {
        val now = View("now", g.objs("countries"))
        val time = g.obj("time")
        if (time?.obj("ranges") == null) {
            return if (span > 0 || week != null) now.copy(note = "No history yet: the daily briefing run records the countries each morning, and backfills 13 weeks of Instantly email the first time.") else now
        }
        if (!canShow(time, key) && (span > 0 || week != null)) return now.copy(note = "${Geo.metric(key).label} has no history; the map shows it now. Pick another metric to compare.")
        var out: View
        val before: List<JsonObject>?
        if (week != null) {
            val k = week.coerceIn(0, maxOf(0, weeks(g) - 1))
            val start = time.obj("weeks")?.get("start")?.jsonArray?.getOrNull(k)?.jsonPrimitive?.content.orEmpty()
            val recorded = (time.obj("weeks")?.get("days") as? JsonArray)?.getOrNull(k)?.jsonPrimitive?.doubleOrNull ?: 0.0
            out = View("week", weekRows(g, k), label = "Week of ${short(start)} – ${short(plus(start, 6))}", week = k, note = if (recorded > 0) "" else "Nothing recorded that week.")
            before = if (k > 0) weekRows(g, k - 1) else null
        } else if (span > 0 && time.obj("ranges").obj("$span") != null) {
            val r = time.obj("ranges").obj("$span")
            val prevDays = r.num("prevDays")?.toInt() ?: 0
            val note = when { prevDays >= span -> ""; prevDays == 0 -> "The $span days before are not recorded yet, so there is no change to show."
                else -> "Only $prevDays of the $span days before ${if (prevDays == 1) "is" else "are"} recorded, so the change is partial." }
            out = View("span", spanRows(g, span, 0), label = "${short(r.str("from"))} – ${short(r.str("to"))} against ${short(r.str("prevFrom"))} – ${short(r.str("prevTo"))}", span = span, note = note)
            before = spanRows(g, span, 1)
        } else return now
        if (before != null) {
            val prev = before.associateBy { it.str("cc").orEmpty() }
            val delta = out.rows.associate { (it.str("cc").orEmpty()) to deltaOf(it, prev[it.str("cc")], key) }
            out = out.copy(delta = delta, before = prev, fills = if (shade) changeFills(delta, key) else null)
        }
        return out
    }

    fun good(d: Double, key: String) = (d > 0) != (key in WORSE_UP)

    /** Cyan where the metric rose, pink where it fell (flipped for bounce rate), by the square root of the largest change. */
    fun changeFills(delta: Map<String, Double?>, key: String): Map<String, Color> {
        val max = delta.values.maxOfOrNull { abs(it ?: 0.0) } ?: 0.0
        if (max <= 0) return emptyMap()
        return delta.mapNotNull { (cc, d) -> if (d == null || d == 0.0) null else cc to (if (good(d, key)) UP else DOWN).copy(alpha = (0.18 + 0.82 * sqrt(abs(d) / max)).toFloat()) }.toMap()
    }

    /** "▲ +12", "▼ −3.5 pts" or "= 0"; "—" without a number. */
    fun arrow(d: Double?, key: String): String {
        if (d == null) return "—"
        if (d == 0.0) return "= 0"
        val unit = if (key != "light" && Geo.metric(key).unit == "%") " pts" else ""
        return (if (d > 0) "▲ +" else "▼ −") + (if (key == "usd") "$" else "") + fmt(abs(d)) + unit
    }
    fun arrowColor(d: Double?, key: String): Color = if (d == null || d == 0.0) J.muted else if (good(d, key)) UP else DOWN
}

/** The controls' state: a range to compare, a week to play, and value or change shading. */
@Stable
class GeoTimeState(span: Int, week: Int, shade: Boolean) {
    var span by mutableStateOf(span)
    /** -1 is now; 0 to 12 a week. */
    var weekAt by mutableStateOf(week)
    var shade by mutableStateOf(shade)
    var playing by mutableStateOf(false)
    val week: Int? get() = weekAt.takeIf { it >= 0 }
}

@Composable
fun rememberGeoTime(): GeoTimeState {
    var span by rememberSaveable { mutableStateOf(0) }
    var week by rememberSaveable { mutableStateOf(-1) }
    var shade by rememberSaveable { mutableStateOf(false) }
    val st = remember { GeoTimeState(span, week, shade) }
    LaunchedEffect(st.span, st.weekAt, st.shade) { span = st.span; week = st.weekAt; shade = st.shade }
    return st
}

/** The range picker, change shading and week player, under the channel and metric chips; Play steps a week every 1.4 s. */
@Composable
fun GeoTimeControls(g: JsonObject, st: GeoTimeState, v: GeoTime.View) {
    val weeks = GeoTime.weeks(g)
    LaunchedEffect(st.playing) {
        while (st.playing && weeks > 0) {
            delay(GeoTime.STEP_MS)
            val next = if (st.weekAt < 0 || st.weekAt >= weeks - 1) 0 else st.weekAt + 1
            st.weekAt = next
            if (next >= weeks - 1) st.playing = false
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        GeoTime.SPANS.forEach { (n, label) ->
            val on = st.week == null && st.span == n
            TextButton({ st.playing = false; st.weekAt = -1; st.span = n }) { Text(label, color = if (on) J.cyan else J.muted, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal, fontSize = 13.sp) }
        }
    }
    if (v.delta != null) Row(Modifier.clickable { st.shade = !st.shade }, verticalAlignment = Alignment.CenterVertically) {
        Checkbox(st.shade, { st.shade = it }, colors = CheckboxDefaults.colors(checkedColor = J.cyan))
        Text("Shade the change", fontSize = 13.sp, color = J.muted)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        TextButton({
            if (st.playing) st.playing = false
            else if (weeks > 0) { if (st.weekAt < 0 || st.weekAt >= weeks - 1) st.weekAt = 0; st.playing = true }
        }, enabled = weeks > 0) { Text(if (st.playing) "❚❚ Pause" else "▶ Play 13 weeks", color = J.cyan, fontSize = 13.sp) }
        Slider(if (st.weekAt < 0) weeks.toFloat() else st.weekAt.toFloat(), { st.playing = false; val k = Math.round(it); st.weekAt = if (k >= weeks) -1 else k },
            valueRange = 0f..maxOf(1, weeks).toFloat(), steps = maxOf(0, weeks - 1), enabled = weeks > 0, modifier = Modifier.weight(1f),
            colors = SliderDefaults.colors(thumbColor = J.cyan, activeTrackColor = J.cyan, inactiveTrackColor = J.line))
    }
    Text(if (v.mode == "now") "Now" else v.label, color = J.amber, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    if (v.note.isNotEmpty()) Muted(v.note)
}

/** The tap card's change line: the metric in the range or week, before it, and the arrow. */
@Composable
fun GeoChangeLine(v: GeoTime.View, cc: String, key: String) {
    val r = v.rows.firstOrNull { it.str("cc") == cc } ?: return
    val d = v.delta?.get(cc)
    Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("${Geo.metric(key).label} ${Geo.show(GeoTime.valueOf(r, key), key)} · before ${Geo.show(GeoTime.valueOf(v.before[cc], key), key)} ", fontSize = 11.sp, color = J.text, modifier = Modifier.weight(1f, fill = false))
        Text(GeoTime.arrow(d, key), fontSize = 11.sp, color = GeoTime.arrowColor(d, key), fontWeight = FontWeight.Bold)
    }
}

/** The change legend: pink to cyan, the largest change each way, how many rose and fell. */
@Composable
fun GeoChangeLegend(v: GeoTime.View, key: String) {
    val ds = v.delta.orEmpty().values.filterNotNull().filter { it != 0.0 }
    val max = ds.maxOfOrNull { abs(it) } ?: 0.0
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
        Muted(if (max > 0) "−" + fmt(max) else "0")
        Box(Modifier.width(120.dp).height(8.dp).background(Brush.horizontalGradient(listOf(GeoTime.DOWN, GeoTime.DOWN.copy(alpha = 0.18f), Geo.TARGET, GeoTime.UP.copy(alpha = 0.18f), GeoTime.UP)), RoundedCornerShape(4.dp)))
        Muted(if (max > 0) "+" + fmt(max) else "0")
    }
    Muted("${ds.count { it > 0 }} up · ${ds.count { it < 0 }} down · against the ${if (v.mode == "week") "week" else "span"} before")
}

/** The country sheet's changes over the picked range (30 days when none): sent, replies, positive, reply rate, visitors, prospects left and reviewed. */
@Composable
fun GeoTimeSheet(g: JsonObject, cc: String, span: Int) {
    val n = if (span > 0) span else 30
    if (g.obj("time").obj("ranges").obj("$n") == null) return
    val now = GeoTime.spanRows(g, n, 0).firstOrNull { it.str("cc") == cc } ?: return
    val was = GeoTime.spanRows(g, n, 1).firstOrNull { it.str("cc") == cc }
    Text("LAST $n DAYS AGAINST THE $n BEFORE", color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
    Column {
        listOf("sent", "replies", "positive", "replyRate", "visitors", "left", "reviewed").forEach { k ->
            val d = GeoTime.deltaOf(now, was, k)
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(Geo.metric(k).label, fontSize = 13.sp, color = J.text, modifier = Modifier.weight(1f))
                Text("${Geo.show(GeoTime.valueOf(now, k), k)} · before ${Geo.show(GeoTime.valueOf(was, k), k)}", fontSize = 12.sp, color = J.muted)
                Text(GeoTime.arrow(d, k), fontSize = 12.sp, color = GeoTime.arrowColor(d, k), fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}
