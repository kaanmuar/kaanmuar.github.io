package com.carlosandmunoz.jarvis.ui

import android.content.Context
import android.graphics.Region
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sqrt

/** The Map tab (#2976), twin of js/admin-jarvis-geo.js: the snapshot's `geo` source on the world map in assets/world.json. */
object Geo {
    val CHANNELS = listOf("all" to "All", "email" to "Cold email", "sweep" to "Prospects", "social" to "Social", "web" to "Visitors")
    data class Metric(val key: String, val label: String, val channel: String, val unit: String = "")
    val METRICS = listOf(
        Metric("activity", "Activity", "all"), Metric("gaps", "Missing zones", "all"), Metric("dates", "Dates ahead", "all"),
        Metric("sent", "Emails sent", "email"), Metric("replies", "Replies", "email"), Metric("replyRate", "Reply rate", "email", "%"),
        Metric("positive", "Positive replies", "email"), Metric("openRate", "Open rate", "email", "%"), Metric("bounceRate", "Bounce rate", "email", "%"), Metric("campaigns", "Campaigns", "email"),
        Metric("prospects", "Prospects queued", "sweep"), Metric("left", "Prospects left", "sweep"), Metric("saturation", "Saturation", "sweep", "%"),
        Metric("reviewed", "Reviewed sites", "sweep"), Metric("score", "Average site score", "sweep"),
        Metric("social", "Social replies", "social"),
        Metric("visitors", "Site visitors (GA4)", "web"), Metric("visits", "Short-link visits", "web"), Metric("reviews", "Reviews from links", "web"), Metric("paid", "Paid unlocks", "web"), Metric("usd", "Revenue (USD)", "web")
    )
    val GAPS = linkedMapOf(
        "no-prospects-left" to ("Out of prospects" to Color(0xFFFF4D8D)), "bouncing" to ("Bouncing" to Color(0xFFFF8F5A)), "low-reply" to ("Low replies" to Color(0xFFFFB547)),
        "no-campaign" to ("No campaign yet" to Color(0xFFA98BFF)), "visitors-no-outreach" to ("Visitors, no outreach" to Color(0xFF7AA2FF)), "silent" to ("Target, silent" to Color(0xFF5D7A8C))
    )
    val BASE = Color(0xFF14222C)
    val TARGET = Color(0xFF1D3340)

    fun metricsFor(channel: String) = METRICS.filter { channel == "all" || it.channel == channel || it.key == "gaps" }
    fun metric(key: String) = METRICS.firstOrNull { it.key == key } ?: METRICS[0]

    private fun n(r: JsonObject, key: String) = r.num(key) ?: 0.0
    fun gaps(r: JsonObject): List<String> = (r["gaps"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()

    /** A country's number for a metric, or null when it has none. */
    fun value(r: JsonObject, key: String): Double? = when (key) {
        "activity" -> n(r, "sent") + n(r, "prospects") + n(r, "social") + n(r, "visits") + n(r, "visitors") + n(r, "reviewed")
        "gaps" -> gaps(r).size.toDouble()
        "dates" -> r.num("daysToDate")?.let { maxOf(1.0, DATES_SPAN + 1 - it) }
        "bounceRate" -> if (n(r, "sent") > 0) Math.round(n(r, "bounced") / n(r, "sent") * 1000) / 10.0 else null
        "saturation" -> if (n(r, "prospects") > 0) Math.round(n(r, "swept") / n(r, "prospects") * 100).toDouble() else null
        "replyRate", "openRate", "score" -> r.num(key)
        else -> n(r, key)
    }

    fun show(v: Double?, key: String) = if (v == null) "—" else if (key == "dates") inDays((DATES_SPAN + 1 - v).toInt())
        else (if (key == "usd") "$" else "") + fmt(v) + metric(key).unit

    /** Dates ahead (#2989) is higher the sooner a country's next date, over the calendar's 60 days. */
    const val DATES_SPAN = 60
    fun inDays(d: Int) = when { d <= 0 -> "today"; d == 1 -> "tomorrow"; else -> "in $d days" }

    fun ranked(rows: List<JsonObject>, key: String) = rows.filter { (value(it, key) ?: 0.0) > 0 }
        .sortedWith(compareByDescending<JsonObject> { value(it, key) ?: 0.0 }.thenBy { it.str("cc") })

    /** Each country's fill: the first gap's colour on Missing zones, else cyan by the square root of its share of the max. */
    fun fills(rows: List<JsonObject>, key: String): Map<String, Color> {
        if (key == "gaps") return rows.mapNotNull { r -> gaps(r).firstOrNull()?.let { (r.str("cc") ?: "") to (GAPS[it]?.second ?: J.dim) } }.toMap()
        val max = rows.maxOfOrNull { value(it, key) ?: 0.0 } ?: 0.0
        if (max <= 0) return emptyMap()
        return rows.mapNotNull { r ->
            val v = value(r, key) ?: 0.0
            if (v <= 0) null else (r.str("cc") ?: "") to J.cyan.copy(alpha = (0.18 + 0.82 * sqrt(min(1.0, v / max))).toFloat())
        }.toMap()
    }

    class World(val w: Float, val h: Float, val shapes: Map<String, Path>, val dots: Map<String, Offset>) {
        private val regions = HashMap<String, Region>()
        private fun region(cc: String): Region = regions.getOrPut(cc) { Region().apply { setPath(shapes.getValue(cc).asAndroidPath(), Region(0, 0, w.toInt() + 1, h.toInt() + 1)) } }

        /** The country under a point in map units: the shape that holds it, else the nearest dot within 14 units. */
        fun hit(x: Float, y: Float, has: Set<String>): String? =
            shapes.keys.firstOrNull { region(it).contains(x.toInt(), y.toInt()) }
                ?: dots.filter { it.key in has && it.key !in shapes }.minByOrNull { hypot(it.value.x - x, it.value.y - y) }?.takeIf { hypot(it.value.x - x, it.value.y - y) < 14 }?.key
    }

    @Volatile private var world: World? = null

    /** The calendar's kinds of date: label and chip colour, as DATE_KINDS in js/admin-jarvis-geo.js. */
    val DATE_KINDS = linkedMapOf(
        "holiday" to ("Holiday" to Color(0xFFFF8F5A)), "commerce" to ("Commerce" to Color(0xFF38E1FF)), "academic" to ("Academic" to Color(0xFFA98BFF)), "fiscal" to ("Fiscal year" to Color(0xFFFFB547)),
        "regulation" to ("Regulation" to Color(0xFFFF4D8D)), "awareness" to ("Awareness" to Color(0xFF4ADE80)), "religious" to ("Religious" to Color(0xFFF0D77A)), "event" to ("Event" to Color(0xFF7AA2FF))
    )

    /** assets/world.json (scripts/build-world-map.js), parsed once off the main thread. */
    suspend fun world(context: Context): World? = world ?: withContext(Dispatchers.Default) {
        runCatching {
            val o = Json.parseToJsonElement(context.assets.open("world.json").bufferedReader().use { it.readText() }).jsonObject
            val shapes = o["shapes"]!!.jsonObject.mapValues { (_, d) -> PathParser().parsePathString(d.jsonPrimitive.content).toPath() }
            val dots = o["dots"]!!.jsonObject.mapValues { (_, xy) -> xy.jsonArray.let { Offset(it[0].jsonPrimitive.doubleOrNull!!.toFloat(), it[1].jsonPrimitive.doubleOrNull!!.toFloat()) } }
            World(o["w"]!!.jsonPrimitive.doubleOrNull!!.toFloat(), o["h"]!!.jsonPrimitive.doubleOrNull!!.toFloat(), shapes, dots)
        }.getOrNull()?.also { world = it }
    }
}

/** Country dates (#2989), twin of calendarDays and the holiday buttons in js/admin-jarvis.js: the `calendar` source's days. */
object CountryDates {
    private const val SHARE = 50.0
    fun today(): LocalDate = LocalDate.now(ZoneId.of("America/Bogota"))
    fun daysFrom(today: LocalDate, date: String?): Int? = date?.let { runCatching { ChronoUnit.DAYS.between(today, LocalDate.parse(it)).toInt() }.getOrNull() }

    /** The days still ahead or on now, each with daysAway counted from [today] (the source is cached for hours). */
    fun days(cal: JsonObject?, today: LocalDate): List<JsonObject> = cal.objs("days").mapNotNull { d ->
        val away = daysFrom(today, d.str("date")) ?: return@mapNotNull null
        if ((daysFrom(today, d.str("end")) ?: away) < 0) null else JsonObject(d + ("daysAway" to JsonPrimitive(away)))
    }

    fun groups(days: List<JsonObject>): List<Pair<String, List<JsonObject>>> = days.groupBy { it.str("date").orEmpty() }.toList()

    fun label(date: String?): String = date?.let { runCatching { LocalDate.parse(it).format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US)) }.getOrNull() } ?: ""

    fun whenText(d: JsonObject): String {
        val n = d.num("daysAway")?.toInt() ?: 0
        val span = label(d.str("date")) + (d.str("end")?.let { " to " + label(it) } ?: "")
        return "$span · " + if (n <= 0 && d.str("end") != null) "on now" else Geo.inDays(n)
    }

    fun countries(d: JsonObject): List<String> = d.arr("ccs").mapNotNull { (it as? JsonPrimitive)?.contentOrNull }

    /** A country's sending campaigns with at least half their leads there; statuses from Marketing when it has them. */
    fun held(camps: List<JsonObject>): List<JsonObject> = camps.filter { c ->
        (c.num("share") ?: 0.0) >= SHARE && Regex("^(active|running subsequences)$", RegexOption.IGNORE_CASE).matches(c.str("status").orEmpty())
    }

    /** The open pause for a country's holiday, planned or running. */
    fun pause(cal: JsonObject?, cc: String, date: String?): JsonObject? =
        cal.objs("pauses").firstOrNull { it.str("cc") == cc && it.str("date") == date && it.str("status") in setOf("planned", "paused") }

    fun key(act: String, cc: String, date: String?) = "calendar:$act:$cc:$date"
}

@Composable
private fun DateKind(kind: String?) {
    val k = Geo.DATE_KINDS[kind]
    Text(k?.first ?: kind.orEmpty(), color = k?.second ?: J.muted, fontSize = 11.sp, modifier = Modifier.border(1.dp, k?.second ?: J.muted, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp))
}

@Composable
private fun WorldMap(world: Geo.World, rows: List<JsonObject>, key: String, selected: String?, onPick: (String) -> Unit) {
    val fill = remember(rows, key) { Geo.fills(rows, key) }
    val by = remember(rows) { rows.associateBy { it.str("cc") ?: "" } }
    Canvas(
        Modifier.fillMaxWidth().aspectRatio(world.w / world.h).background(Color(0xFF0A141B), RoundedCornerShape(10.dp))
            .pointerInput(world, rows) { detectTapGestures { p -> val k = world.w / size.width; world.hit(p.x * k, p.y * k, by.keys)?.let(onPick) } }
    ) {
        val k = size.width / world.w
        scale(k, k, pivot = Offset.Zero) {
            world.shapes.forEach { (cc, path) ->
                val r = by[cc]
                drawPath(path, fill[cc] ?: if (r?.get("target")?.jsonPrimitive?.booleanOrNull == true) Geo.TARGET else Geo.BASE)
                drawPath(path, if (cc == selected) J.amber else Color(0xFF0A141B), style = Stroke(width = if (cc == selected) 2.5f else 0.6f))
            }
            world.dots.forEach { (cc, at) ->
                if (cc in world.shapes || cc !in by) return@forEach
                drawCircle(fill[cc] ?: Geo.TARGET, radius = 5f, center = at)
                drawCircle(if (cc == selected) J.amber else Color.White, radius = 5f, center = at, style = Stroke(width = 1f))
            }
        }
    }
}

@Composable
private fun Chips(items: List<Pair<String, String>>, on: String, pick: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        items.forEach { (k, label) -> TextButton({ pick(k) }) { Text(label, color = if (k == on) J.cyan else J.muted, fontWeight = if (k == on) FontWeight.Bold else FontWeight.Normal, fontSize = 13.sp) } }
    }
}

private val SEGMENTS = listOf("university", "tvet", "agency", "startup", "company", "other")

@Composable
private fun Swatch(color: Color) = Box(Modifier.size(10.dp).background(color, RoundedCornerShape(3.dp)))

@Composable
fun GeoScreen(s: UiState, vm: JarvisViewModel) {
    val g = s.snapshot.obj("external").obj("geo")?.takeIf { it.isOk() }
    if (g == null) { Panel("World map", id = "geo-map") { Muted("Pull down to load the countries.") }; return }
    val context = LocalContext.current
    val world by produceState<Geo.World?>(null) { value = Geo.world(context) }
    var channel by rememberSaveable { mutableStateOf("all") }
    var metric by rememberSaveable { mutableStateOf("activity") }
    var picked by rememberSaveable { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    val rows = g.objs("countries")
    val metrics = Geo.metricsFor(channel)
    val key = if (metrics.any { it.key == metric }) metric else metrics[0].key
    val t = g.obj("totals")
    val sel = rows.firstOrNull { it.str("cc") == picked }
    val rankKey = if (key == "gaps") "activity" else key
    val byName = rows.associate { (it.str("name") ?: "") to (it.str("cc") ?: "") }

    Needs(g)
    Panel("World map · ${Geo.metric(key).label}", id = "geo-map") {
        KpiPairs(listOf(
            KpiData("Countries we act in", fmt(t?.num("countries"))), KpiData("Target markets reached", "${fmt(t?.num("targetsActive"))} of ${fmt(t?.num("targets"))}", t?.num("silent")?.takeIf { it > 0 }?.let { "${fmt(it)} silent" }),
            KpiData("Need attention", fmt(t?.num("missing")), alert = (t?.num("missing") ?: 0.0) > 0), KpiData("Average reply rate", t?.num("avgReply")?.let { "$it%" } ?: "—"),
            KpiData("Emails sent", fmt(t?.num("sent"))), KpiData("Prospects queued", fmt(t?.num("prospects")))
        ))
        Chips(Geo.CHANNELS, channel) { channel = it }
        Chips(metrics.map { it.key to it.label }, key) { metric = it }
        world?.let { WorldMap(it, rows, key, picked) { cc -> picked = cc } } ?: Muted("Drawing the map…")
        if (key == "gaps") Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Geo.GAPS.forEach { (k, v) -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { Swatch(v.second); Muted("${v.first} · ${rows.count { Geo.gaps(it).firstOrNull() == k }}") } }
        } else if (key == "dates") Muted("Brighter is sooner: the country's next holiday, season, deadline or event within ${Geo.DATES_SPAN} days. ${rows.count { Geo.value(it, key) != null }} countries have one; tap one for its dates.")
        else Muted("Brighter is more, up to ${Geo.show(rows.maxOfOrNull { Geo.value(it, key) ?: 0.0 }, key)}. Tap a country for its campaigns, prospects and replies; est. numbers are split from campaigns that cover several countries.")
    }

    if (sel != null) GeoCountry(sel, s, vm, close = { picked = null }) { text, run -> confirm = PendingAction(text, run) }

    val cal = s.snapshot.obj("external").obj("calendar")?.takeIf { it.isOk() }
    val days = remember(cal) { CountryDates.days(cal, CountryDates.today()) }
    val names = rows.associate { (it.str("cc") ?: "") to (it.str("name") ?: "") }
    Panel(if (cal == null) "Upcoming dates" else "Upcoming dates · ${days.size}", id = "geo-dates") {
        if (cal == null) { Muted("Pull down to load the calendar."); return@Panel }
        cal.arr("notes").mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.forEach { Text(it, color = J.amber, fontSize = 13.sp) }
        if (days.isEmpty()) Muted("No dates in the next ${Geo.DATES_SPAN} days.")
        CountryDates.groups(days).forEach { (date, list) ->
            Text(CountryDates.label(date).uppercase() + " · " + Geo.inDays(list[0].num("daysAway")?.toInt() ?: 0).uppercase(), color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
            list.forEach { d ->
                val ccs = CountryDates.countries(d)
                val where = if (d.bool("all") == true) "All target markets" else ccs.joinToString(", ") { names[it] ?: it }
                Column(Modifier.fillMaxWidth().clickable(enabled = ccs.size == 1) { picked = ccs.firstOrNull() }.padding(vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        DateKind(d.str("kind"))
                        Text(d.str("name").orEmpty() + (d.str("end")?.let { " to " + CountryDates.label(it) } ?: ""), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                    Muted(where)
                    Muted(listOfNotNull(d.str("why"), d.str("action")).joinToString(" "))
                }
            }
        }
        val st = cal.obj("settings")
        Muted("Public holidays from Nager.Date; seasons, academic terms, fiscal years, rules and events from Jarvis's list. Warns ${fmt(st?.num("warnDays") ?: 14.0)} days ahead, reminds ${fmt(st?.num("remindDays") ?: 3.0)}; auto-pause over holidays is ${if (st?.bool("autoPause") == true) "on" else "off"} (Settings).")
    }

    val gapRows = g.objs("gaps")
    Panel("Missing zones · ${gapRows.size}", id = "geo-gaps") {
        if (gapRows.isEmpty()) Muted("No country needs attention.")
        gapRows.take(30).forEach { x ->
            Row(Modifier.fillMaxWidth().clickable { picked = x.str("cc") }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Swatch(Geo.GAPS[x.str("kind")]?.second ?: J.dim)
                Column(Modifier.weight(1f)) {
                    Text(x.str("name").orEmpty(), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Muted("${Geo.GAPS[x.str("kind")]?.first ?: x.str("kind")}: ${x.str("text").orEmpty()}")
                }
            }
        }
    }
    TopList("Ranking · ${Geo.metric(rankKey).label}", Geo.ranked(rows, rankKey).map { (it.str("name") ?: "") to (Geo.value(it, rankKey) ?: 0.0) }, limit = 15,
        onRow = { name -> picked = byName[name] }, id = "geo-ranking", format = { Geo.show(it, rankKey) })
    TopList("Weakest reply rates", rows.filter { (it.num("sent") ?: 0.0) >= 50 }.sortedBy { it.num("replyRate") ?: 0.0 }.take(8).map { (it.str("name") ?: "") to (it.num("replyRate") ?: 0.0) },
        onRow = { name -> picked = byName[name] }, id = "geo-bottom", format = { "${fmt(it)}%" })
    ConfirmAction(confirm) { confirm = null }
}

/** The tapped country: its numbers, funnel, segments, campaigns with Pause or Activate, a queue form and the target toggle. */
@Composable
private fun GeoCountry(r: JsonObject, s: UiState, vm: JarvisViewModel, close: () -> Unit, ask: (String, () -> Unit) -> Unit) {
    val cc = r.str("cc").orEmpty()
    val name = r.str("name") ?: cc
    val target = r["target"]?.jsonPrimitive?.booleanOrNull == true
    val mk = s.snapshot.obj("external").obj("marketing").obj("campaigns")?.objs("rows").orEmpty()
    var hosts by rememberSaveable(cc) { mutableStateOf("") }
    var sector by rememberSaveable(cc) { mutableStateOf(SEGMENTS[0]) }
    Panel(name, id = "geo-country") {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton({ ask(if (target) "drop $cc as a target market" else "make $cc a target market") { vm.market("geo:target:$cc", "geo-target", mapOf("cc" to JsonPrimitive(cc), "on" to JsonPrimitive(!target))) { out -> "$cc is ${if (target) "no longer" else "now"} a target market (${fmt(out.num("targets"))} in all)." } } },
                enabled = "geo:target:$cc" !in s.running) { Text(if (target) "Drop as target" else "Make a target", color = J.cyan, fontSize = 13.sp) }
            TextButton(close) { Text("Close", color = J.muted, fontSize = 13.sp) }
        }
        val langs = (r["langs"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
        Muted(listOfNotNull(if (target) "Target market" else "Not a target market", langs.takeIf { it.isNotEmpty() }?.let { "speaks " + it.joinToString(", ") },
            Geo.gaps(r).takeIf { it.isNotEmpty() }?.joinToString(", ") { Geo.GAPS[it]?.first ?: it }).joinToString(" · "))
        KpiPairs(listOf(
            KpiData("Emails sent · opened", "${fmt(r.num("sent"))} · ${fmt(r.num("opened"))}"), KpiData("Reply rate", r.num("replyRate")?.let { "$it%" } ?: "—"),
            KpiData("Answered · positive", "${fmt(r.num("answered"))} · ${fmt(r.num("positive"))}"), KpiData("Prospects · left", "${fmt(r.num("prospects"))} · ${fmt(r.num("left"))}"),
            KpiData("Reviewed · score", fmt(r.num("reviewed")) + (r.num("score")?.let { " · ${fmt(it)}" } ?: "")), KpiData("Social replies", fmt(r.num("social"))),
            KpiData("Visitors (GA4)", fmt(r.num("visitors"))), KpiData("Link visits · paid", "${fmt(r.num("visits"))} · $${fmt(r.num("usd"))}")
        ))
        if ((r.num("sent") ?: 0.0) > 0 || (r.num("prospects") ?: 0.0) > 0)
            Funnel(listOf("Prospects" to r.num("prospects"), "Leads" to r.num("leads"), "Contacted" to (r.num("contacted") ?: 0.0), "Replied" to r.num("replies"), "Interested" to r.num("interested")))
        r.objs("sectors").forEach { x -> KeyRow(x.str("label").orEmpty(), "${fmt(x.num("value"))} prospects") }
        val camps = r.objs("camps").map { c -> mk.firstOrNull { it.str("id") == c.str("id") }?.let { JsonObject(c + it) } ?: c }
        if (camps.isEmpty()) Muted("No campaign reaches this country yet.") else CampaignRows(JsonObject(mapOf("rows" to JsonArray(camps))), s, vm, ask)
        val cal = s.snapshot.obj("external").obj("calendar")?.takeIf { it.isOk() }
        if (cal != null) {
            val dates = CountryDates.days(cal, CountryDates.today()).filter { cc in CountryDates.countries(it) }.take(8)
            Text("UPCOMING DATES", color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
            if (dates.isEmpty()) Muted("No dates for $name in the next ${Geo.DATES_SPAN} days.")
            val held = CountryDates.held(camps)
            dates.forEach { d ->
                val date = d.str("date")
                val local = d.obj("local")?.str(cc) ?: d.str("name").orEmpty()
                val open = CountryDates.pause(cal, cc, date)
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) { DateKind(d.str("kind")); Text(local, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
                    Muted(CountryDates.whenText(d) + (d.obj("after")?.str(cc)?.let { " · resume " + CountryDates.label(it) } ?: ""))
                    Muted(d.str("action") ?: d.str("why").orEmpty())
                    val k = "action:calendar:$cc:$date"
                    when {
                        open != null -> TextButton({
                            ask(if (open.str("status") == "paused") "resume the campaigns paused in $cc for $local now" else "cancel the planned pause in $cc for $local") {
                                vm.act(k, "action-run", mapOf("action" to JsonPrimitive("calendar-resume"), "proposal" to JsonPrimitive(CountryDates.key("resume", cc, date)))) { out -> out.str("note") ?: out.str("ran") ?: "Done." }
                            }
                        }, enabled = k !in s.running) { Text(if (open.str("status") == "paused") "Resume now" else "Paused on the day · cancel", color = J.cyan, fontSize = 13.sp) }
                        d.str("kind") == "holiday" && d.bool("weekend") != true && held.isNotEmpty() -> TextButton({
                            ask("pause the campaigns that mostly reach $cc on ${CountryDates.label(date)} for $local, and resume them the next business day") {
                                vm.act(k, "action-run", mapOf("action" to JsonPrimitive("calendar-pause"), "proposal" to JsonPrimitive(CountryDates.key("pause", cc, date)))) { out -> out.str("note") ?: out.str("ran") ?: "Done." }
                            }
                        }, enabled = k !in s.running) { Text(if (held.size == 1) "Pause ${held[0].str("name")} that day" else "Pause ${held.size} campaigns that day", color = J.cyan, fontSize = 13.sp) }
                    }
                }
            }
        }
        OutlinedTextField(hosts, { hosts = it }, label = { Text("Prospect sites for $name, one per line") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), minLines = 2)
        Chips(SEGMENTS.map { it to it }, sector) { sector = it }
        TextButton({
            val n = hosts.split(Regex("[\\n;]+")).count { it.isNotBlank() }
            ask("queue $n prospect site(s) in $cc for the nightly sweep") {
                vm.market("geo:queue:$cc", "marketing-queue", mapOf("hosts" to JsonPrimitive(hosts.trim()), "cc" to JsonPrimitive(cc.lowercase()), "sector" to JsonPrimitive(sector))) { out -> "Queued ${fmt(out.num("added"))}." }
                hosts = ""
            }
        }, enabled = hosts.isNotBlank() && "geo:queue:$cc" !in s.running) { Text("Queue for the sweep", color = J.cyan, fontSize = 13.sp) }
    }
}
