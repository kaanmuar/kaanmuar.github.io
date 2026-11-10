package com.carlosandmunoz.jarvis.ui

import android.content.Context
import android.graphics.Region
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
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
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
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

/** The Map tab (#2976), twin of js/admin-jarvis-geo.js: the snapshot's `geo` source on the world map in assets/world.json.
 *  #2988: six light levels, name labels for every lit country and the tap card. */
object Geo {
    val CHANNELS = listOf("all" to "All", "email" to "Cold email", "sweep" to "Prospects", "social" to "Social", "web" to "Visitors")
    data class Metric(val key: String, val label: String, val channel: String, val unit: String = "")
    val METRICS = listOf(
        Metric("light", "Light", "all"), Metric("activity", "Activity", "all"), Metric("gaps", "Missing zones", "all"), Metric("dates", "Dates ahead", "all"),
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
    data class Light(val name: String, val color: Color, val what: String)
    val LIGHTS = listOf(
        Light("Dark", Color(0xFF14222C), "nothing yet"), Light("Spark", Color(0xFF1F4C5C), "prospects or reviewed sites"), Light("Ember", Color(0xFF24728B), "contacted"),
        Light("Lit", Color(0xFF2FB0D4), "opens, visits or social replies"), Light("Bright", Color(0xFF86ECFF), "email replies"), Light("Blazing", Color(0xFFFFD76E), "positive replies or money")
    )
    val BASE = Color(0xFF14222C)
    val TARGET = Color(0xFF1D3340)

    /** A country's light level, 0 to 5, the twin of lightOf in functions/jarvis-geo.js (the server sends it as `light`). */
    fun lightOf(r: JsonObject): Int {
        fun on(k: String) = (r.num(k) ?: 0.0) > 0
        return when {
            on("positive") || on("interested") || on("paid") || on("usd") -> 5
            on("replies") || on("answered") -> 4
            on("opened") || on("visits") || on("visitors") || on("socialApproved") -> 3
            on("contacted") || on("sent") || on("social") -> 2
            on("prospects") || on("reviewed") || on("leads") -> 1
            else -> 0
        }
    }
    fun light(r: JsonObject): Int = r.num("light")?.toInt()?.coerceIn(0, 5) ?: lightOf(r)

    private val SHORT = mapOf(
        "US" to "USA", "GB" to "UK", "AE" to "UAE", "CD" to "DR Congo", "CG" to "Congo", "CF" to "C. African Rep.", "DO" to "Dominican Rep.", "GQ" to "Eq. Guinea",
        "BA" to "Bosnia", "TT" to "Trinidad", "KN" to "St Kitts", "VC" to "St Vincent", "LC" to "St Lucia", "AG" to "Antigua", "ST" to "São Tomé", "PG" to "Papua NG",
        "MK" to "N. Macedonia", "VA" to "Vatican", "PS" to "Palestine", "TC" to "Turks & Caicos", "VI" to "US Virgin Is.", "VG" to "BVI", "SB" to "Solomon Is.",
        "MH" to "Marshall Is.", "UM" to "US Outlying Is.", "IO" to "Chagos", "TF" to "Fr. South. Lands", "HM" to "Heard Is.", "GS" to "S. Georgia", "PM" to "St Pierre",
        "SH" to "St Helena", "WF" to "Wallis", "BQ" to "Caribbean NL", "FK" to "Falklands", "EH" to "W. Sahara", "SJ" to "Svalbard", "KR" to "S. Korea", "KP" to "N. Korea"
    )
    /** The name a map label shows: a short form for the long ones ("Congo - Kinshasa" is DR Congo). */
    fun shortName(cc: String, name: String?): String = SHORT[cc]
        ?: (name ?: cc).replace(Regex("""\s*\(.*\)$"""), "").removeSuffix(" SAR China").replace(Regex("^Saint "), "St ")
    /** The flag emoji for a two-letter country code. */
    fun flagOf(cc: String): String = if (Regex("^[A-Z]{2}$").matches(cc)) cc.map { String(Character.toChars(0x1F1E6 + (it - 'A'))) }.joinToString("") else ""

    data class Box(val x0: Float, val y0: Float, val x1: Float, val y1: Float) {
        val w get() = x1 - x0
        val h get() = y1 - y0
        fun hits(o: Box) = x0 < o.x1 && o.x0 < x1 && y0 < o.y1 && o.y0 < y1
    }
    /** A country's main outline box from its M/L path: the ring holding its dot, else its largest (France without Guiana). */
    fun mainBox(d: String, dot: Offset?): Box? = d.split('M').filter { it.isNotBlank() }.mapNotNull { ring ->
        val n = Regex("""-?\d+(?:\.\d+)?""").findAll(ring).map { it.value.toFloat() }.toList()
        if (n.size < 2) return@mapNotNull null
        val xs = n.filterIndexed { i, _ -> i % 2 == 0 }
        val ys = n.filterIndexed { i, _ -> i % 2 == 1 }
        Box(xs.min(), ys.min(), xs.max(), ys.max())
    }.maxByOrNull { b -> (if (dot != null && dot.x in b.x0..b.x1 && dot.y in b.y0..b.y1) 1e7f else 0f) + b.w * b.h }

    /** anchor: -1 ends at x, 0 centres on x, 1 starts at x; y is the text's middle. */
    data class Label(val cc: String, val text: String, val x: Float, val y: Float, val size: Float, val anchor: Int, val inside: Boolean, val dot: Offset, val light: Int)

    /**
     * Name labels in map units for every lit country and the selected one, the twin of labels() in js/admin-jarvis-geo.js.
     * Font size follows the country's box between min and max; a country too small for its name gets the label beside
     * its dot. Greedy: the selected first, then the brightest and biggest; a label overlapping one already placed is
     * dropped, except the selected one.
     */
    fun labels(rows: List<JsonObject>, world: World, selected: String?, min: Float, max: Float,
               width: (String, Float) -> Float = { t, s -> t.length * s * 0.56f }): List<Label> {
        val area = { cc: String -> world.boxes[cc]?.let { it.w * it.h } ?: 0f }
        val placed = mutableListOf<Box>()
        val out = mutableListOf<Label>()
        rows.filter { val cc = it.str("cc") ?: ""; cc in world.dots && (light(it) > 0 || cc == selected) }
            .sortedWith(compareByDescending<JsonObject> { it.str("cc") == selected }.thenByDescending { light(it) }.thenByDescending { area(it.str("cc") ?: "") }.thenBy { it.str("cc") })
            .forEach { r ->
                val cc = r.str("cc") ?: ""
                val text = shortName(cc, r.str("name"))
                val dot = world.dots.getValue(cc)
                val b = world.boxes[cc]
                val pad = min * 0.15f
                val sized = if (b != null) sqrt(b.w * b.h) / 4.5f else min
                val size = sized.coerceIn(min, max)
                val gap = min * 0.55f
                val up = min * 2
                val tries = mutableListOf<Label>()
                fun t(x: Float, y: Float, anchor: Int, s: Float = min, inside: Boolean = false) { tries += Label(cc, text, x, y, s, anchor, inside, dot, light(r)) }
                if (b != null && width(text, size) <= b.w * 1.6f && size <= b.h * 1.1f) t(dot.x, dot.y, 0, size, true)
                t(dot.x + gap, dot.y, 1); t(dot.x - gap, dot.y, -1); t(dot.x, dot.y - min, 0); t(dot.x, dot.y + min, 0)
                t(dot.x - gap, dot.y - up, -1); t(dot.x + gap, dot.y - up, 1); t(dot.x - gap, dot.y + up, -1); t(dot.x + gap, dot.y + up, 1)
                val boxed = tries.map { l ->
                    val w = width(text, l.size)
                    val x0 = when (l.anchor) { 1 -> l.x; -1 -> l.x - w; else -> l.x - w / 2 }
                    l to Box(x0 - pad, l.y - l.size * 0.55f - pad, x0 + w + pad, l.y + l.size * 0.55f + pad)
                }.filter { (_, bx) -> bx.x0 >= 0 && bx.x1 <= world.w && bx.y0 >= 0 && bx.y1 <= world.h }
                val pick = boxed.firstOrNull { (_, bx) -> placed.none { it.hits(bx) } } ?: if (cc == selected) boxed.firstOrNull() ?: (tries[0] to Box(dot.x, dot.y, dot.x, dot.y)) else null
                if (pick != null) { placed += pick.second; out += pick.first }
            }
        return out
    }

    fun metricsFor(channel: String) = METRICS.filter { channel == "all" || it.channel == channel || it.key == "gaps" }
    fun metric(key: String) = METRICS.firstOrNull { it.key == key } ?: METRICS[0]

    private fun n(r: JsonObject, key: String) = r.num(key) ?: 0.0
    fun gaps(r: JsonObject): List<String> = (r["gaps"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()

    /** A country's number for a metric, or null when it has none. */
    fun value(r: JsonObject, key: String): Double? = when (key) {
        "light" -> light(r).toDouble()
        "activity" -> n(r, "sent") + n(r, "prospects") + n(r, "social") + n(r, "visits") + n(r, "visitors") + n(r, "reviewed")
        "gaps" -> gaps(r).size.toDouble()
        "dates" -> r.num("daysToDate")?.let { maxOf(1.0, DATES_SPAN + 1 - it) }
        "bounceRate" -> if (n(r, "sent") > 0) Math.round(n(r, "bounced") / n(r, "sent") * 1000) / 10.0 else null
        "saturation" -> if (n(r, "prospects") > 0) Math.round(n(r, "swept") / n(r, "prospects") * 100).toDouble() else null
        "replyRate", "openRate", "score" -> r.num(key)
        else -> n(r, key)
    }

    fun show(v: Double?, key: String) = if (v == null) "—" else if (key == "light") LIGHTS[v.toInt().coerceIn(0, 5)].name else if (key == "dates") inDays((DATES_SPAN + 1 - v).toInt())
        else (if (key == "usd") "$" else "") + fmt(v) + metric(key).unit

    /** Dates ahead (#2989) is higher the sooner a country's next date, over the calendar's 60 days. */
    const val DATES_SPAN = 60
    fun inDays(d: Int) = when { d <= 0 -> "today"; d == 1 -> "tomorrow"; else -> "in $d days" }

    /** A typed country for the confirm queue (#3009): two letters, or WW for worldwide; the function checks it is a country. */
    fun confirmCode(typed: String): String? = typed.trim().uppercase().takeIf { Regex("[A-Z]{2}").matches(it) }

    /** The finder's guess for a queued site, as the web panel shows it. */
    fun guess(r: JsonObject): String {
        val cc = r.str("cc").orEmpty()
        if (cc.isEmpty()) return "no guess"
        return (r.str("name") ?: cc) + (if (cc == "WW") "" else " · $cc") + " · ${Math.round((r.num("confidence") ?: 0.0) * 100)}% sure"
    }

    fun ranked(rows: List<JsonObject>, key: String) = rows.filter { (value(it, key) ?: 0.0) > 0 }
        .sortedWith(compareByDescending<JsonObject> { value(it, key) ?: 0.0 }.thenByDescending { if (key == "light") value(it, "activity") ?: 0.0 else 0.0 }.thenBy { it.str("cc") })

    /** Each country's fill: the first gap's colour on Missing zones, the level colour on Light, else cyan by the square root of its share of the max. */
    fun fills(rows: List<JsonObject>, key: String): Map<String, Color> {
        if (key == "gaps") return rows.mapNotNull { r -> gaps(r).firstOrNull()?.let { (r.str("cc") ?: "") to (GAPS[it]?.second ?: J.dim) } }.toMap()
        if (key == "light") return rows.mapNotNull { r -> light(r).takeIf { it > 0 }?.let { (r.str("cc") ?: "") to LIGHTS[it].color } }.toMap()
        val max = rows.maxOfOrNull { value(it, key) ?: 0.0 } ?: 0.0
        if (max <= 0) return emptyMap()
        return rows.mapNotNull { r ->
            val v = value(r, key) ?: 0.0
            if (v <= 0) null else (r.str("cc") ?: "") to J.cyan.copy(alpha = (0.18 + 0.82 * sqrt(min(1.0, v / max))).toFloat())
        }.toMap()
    }

    class World(val w: Float, val h: Float, val shapes: Map<String, Path>, val dots: Map<String, Offset>, val boxes: Map<String, Box> = emptyMap()) {
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
            val paths = o["shapes"]!!.jsonObject.mapValues { (_, d) -> d.jsonPrimitive.content }
            val shapes = paths.mapValues { (_, d) -> PathParser().parsePathString(d).toPath() }
            val dots = o["dots"]!!.jsonObject.mapValues { (_, xy) -> xy.jsonArray.let { Offset(it[0].jsonPrimitive.doubleOrNull!!.toFloat(), it[1].jsonPrimitive.doubleOrNull!!.toFloat()) } }
            val boxes = paths.mapNotNull { (cc, d) -> mainBox(d, dots[cc])?.let { cc to it } }.toMap()
            World(o["w"]!!.jsonPrimitive.doubleOrNull!!.toFloat(), o["h"]!!.jsonPrimitive.doubleOrNull!!.toFloat(), shapes, dots, boxes)
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
private fun WorldMap(world: Geo.World, rows: List<JsonObject>, key: String, selected: String?, onTap: (String?, Offset) -> Unit) {
    val fill = remember(rows, key) { Geo.fills(rows, key) }
    val by = remember(rows) { rows.associateBy { it.str("cc") ?: "" } }
    val lit = key == "light"
    val order = remember(rows, key, selected) {
        world.shapes.keys.sortedBy { cc -> if (cc == selected) 9 else if (lit) by[cc]?.let(Geo::light) ?: 0 else 0 }
    }
    val text = remember { android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD } }
    val halo = remember { android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD; style = android.graphics.Paint.Style.STROKE; strokeJoin = android.graphics.Paint.Join.ROUND; color = 0xE0040A0E.toInt() } }
    Canvas(
        Modifier.fillMaxWidth().aspectRatio(world.w / world.h).background(Color(0xFF0A141B), RoundedCornerShape(10.dp))
            .pointerInput(world, rows) { detectTapGestures { p -> val k = world.w / size.width; onTap(world.hit(p.x * k, p.y * k, by.keys), Offset(p.x / size.width, p.y / size.height)) } }
    ) {
        val k = size.width / world.w
        scale(k, k, pivot = Offset.Zero) {
            order.forEach { cc ->
                val path = world.shapes.getValue(cc)
                val r = by[cc]
                val level = if (lit && r != null) Geo.light(r) else 0
                // The glow: one wide translucent stroke behind the fill, wider and stronger for each level from Lit up.
                if (level >= 3) drawPath(path, Geo.LIGHTS[level].color.copy(alpha = 0.16f + 0.06f * (level - 3)), style = Stroke(width = 3f + 2.5f * (level - 3), join = StrokeJoin.Round))
                drawPath(path, fill[cc] ?: if (r?.get("target")?.jsonPrimitive?.booleanOrNull == true) Geo.TARGET else Geo.BASE)
                drawPath(path, if (cc == selected) J.amber else if (level >= 3) Color.White.copy(alpha = 0.35f) else Color(0xFF0A141B), style = Stroke(width = if (cc == selected) 2.5f else 0.6f))
            }
            world.dots.forEach { (cc, at) ->
                if (cc in world.shapes || cc !in by) return@forEach
                drawCircle(fill[cc] ?: Geo.TARGET, radius = 5f, center = at)
                drawCircle(if (cc == selected) J.amber else Color.White, radius = 5f, center = at, style = Stroke(width = 1f))
            }
        }
        // Labels in screen pixels, 9 to 12sp whatever the map's width, so a phone shows fewer rather than unreadable ones.
        val min = 9.sp.toPx()
        val max = 12.sp.toPx()
        val measure = { t: String, s: Float -> text.textSize = s * k; text.measureText(t) / k }
        val labels = Geo.labels(rows, world, selected, min / k, max / k, measure)
        drawIntoCanvas { c ->
            labels.forEach { l ->
                val x = l.x * k
                val y = l.y * k
                val px = l.size * k
                if (!l.inside && l.cc in world.shapes) drawCircle(Color.White, radius = px * 0.16f, center = Offset(l.dot.x * k, l.dot.y * k))
                if (!l.inside && kotlin.math.abs(l.y - l.dot.y) > l.size * 1.5f)
                    drawLine(Color.White.copy(alpha = 0.7f), Offset(l.dot.x * k, l.dot.y * k), Offset(x, y + if (l.y < l.dot.y) px * 0.45f else -px * 0.45f), strokeWidth = px * 0.08f)
                val align = when (l.anchor) { 1 -> android.graphics.Paint.Align.LEFT; -1 -> android.graphics.Paint.Align.RIGHT; else -> android.graphics.Paint.Align.CENTER }
                listOf(halo, text).forEach { p -> p.textSize = px; p.textAlign = align }
                halo.strokeWidth = px * 0.28f
                text.color = if (l.cc == selected) 0xFFFFE7A8.toInt() else android.graphics.Color.WHITE
                val base = y - (text.descent() + text.ascent()) / 2
                c.nativeCanvas.drawText(l.text, x, base, halo)
                c.nativeCanvas.drawText(l.text, x, base, text)
            }
        }
    }
}

/** The tapped country's card over the map (phones have no hover): flag, name, light level, key numbers and Open. */
@Composable
private fun GeoCard(cc: String, r: JsonObject?, modifier: Modifier, open: () -> Unit, close: () -> Unit) {
    val level = r?.let(Geo::light) ?: 0
    val name = r?.str("name") ?: java.util.Locale("", cc).getDisplayCountry(java.util.Locale.ENGLISH).ifBlank { cc }
    Column(modifier.width(196.dp).background(Color(0xF0081218), RoundedCornerShape(8.dp)).border(1.dp, Color(0xFF2D5366), RoundedCornerShape(8.dp)).padding(horizontal = 10.dp, vertical = 6.dp)) {
        Text("${Geo.flagOf(cc)} $name", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = J.text)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(Modifier.size(8.dp).background(Geo.LIGHTS[level].color, RoundedCornerShape(4.dp)))
            Text("${Geo.LIGHTS[level].name} · ${Geo.LIGHTS[level].what}", fontSize = 11.sp, color = J.muted)
        }
        if (r != null) {
            listOf("Sent" to fmt(r.num("sent")), "Reply rate" to (r.num("replyRate")?.let { "${fmt(it)}%" } ?: "—"), "Prospects left" to fmt(r.num("left")), "Visitors" to fmt(r.num("visitors")),
                "Gaps" to (Geo.gaps(r).joinToString(", ") { Geo.GAPS[it]?.first ?: it }.ifEmpty { "none" })).forEach { (k, v) ->
                Row(Modifier.fillMaxWidth()) { Text(k, fontSize = 11.sp, color = J.muted, modifier = Modifier.weight(1f)); Text(v, fontSize = 11.sp, color = J.text) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            if (r != null) TextButton(open, contentPadding = PaddingValues(horizontal = 6.dp)) { Text("Open", color = J.cyan, fontSize = 13.sp) }
            TextButton(close, contentPadding = PaddingValues(horizontal = 6.dp)) { Text("Close", color = J.muted, fontSize = 13.sp) }
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
    var metric by rememberSaveable { mutableStateOf("light") }
    var picked by rememberSaveable { mutableStateOf<String?>(null) }
    var tapped by rememberSaveable { mutableStateOf<String?>(null) }
    var tapAt by remember { mutableStateOf(Offset.Zero) }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    val rows = g.objs("countries")
    val metrics = Geo.metricsFor(channel)
    val key = if (metrics.any { it.key == metric }) metric else metrics[0].key
    val t = g.obj("totals")
    val sel = rows.firstOrNull { it.str("cc") == picked }
    val rankKey = if (key == "gaps") "activity" else key
    val byName = rows.associate { (it.str("name") ?: "") to (it.str("cc") ?: "") }

    Needs(g)
    // Wide screens: the map spans every column right under the product chips, its numbers three to a row above it.
    val wide = LocalColumns.current >= 2
    Panel("World map · ${Geo.metric(key).label}", if (wide) Modifier.layoutId(WIDE) else Modifier, id = "geo-map") {
        val kpis = listOf(
            KpiData("Countries we act in", fmt(t?.num("countries"))), KpiData("Target markets reached", "${fmt(t?.num("targetsActive"))} of ${fmt(t?.num("targets"))}", t?.num("silent")?.takeIf { it > 0 }?.let { "${fmt(it)} silent" }),
            KpiData("Need attention", fmt(t?.num("missing")), alert = (t?.num("missing") ?: 0.0) > 0), KpiData("Average reply rate", t?.num("avgReply")?.let { "$it%" } ?: "—"),
            KpiData("Emails sent", fmt(t?.num("sent"))), KpiData("Prospects queued", fmt(t?.num("prospects")))
        )
        if (wide) kpis.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { row.forEach { k -> Kpi(k.label, k.value, k.delta, k.dir, k.alert, Modifier.weight(1f)) } }
        } else KpiPairs(kpis)
        Chips(Geo.CHANNELS, channel) { channel = it }
        Chips(metrics.map { it.key to it.label }, key) { metric = it }
        world?.let { w ->
            Box {
                WorldMap(w, rows, key, tapped ?: picked) { cc, at -> tapped = cc; tapAt = at }
                tapped?.let { cc ->
                    GeoCard(cc, rows.firstOrNull { it.str("cc") == cc }, Modifier.align(if (tapAt.x < 0.5f) Alignment.TopEnd else Alignment.TopStart).padding(6.dp),
                        open = { picked = cc; tapped = null }, close = { tapped = null })
                }
            }
        } ?: Muted("Drawing the map…")
        if (key == "light") Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Geo.LIGHTS.forEachIndexed { n, l -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { Swatch(l.color); Muted("${l.name} · ${rows.count { Geo.light(it) == n }}") } }
        } else if (key == "gaps") Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Geo.GAPS.forEach { (k, v) -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { Swatch(v.second); Muted("${v.first} · ${rows.count { Geo.gaps(it).firstOrNull() == k }}") } }
        }
        if (key == "light") Muted("Tap a country for its numbers, then Open for its campaigns, prospects and replies. Spark: prospects or reviewed sites; Ember: contacted; Lit: opens, visits or social replies; Bright: email replies; Blazing: positive replies or money.")
        else if (key == "dates") Muted("Brighter is sooner: the country's next holiday, season, deadline or event within ${Geo.DATES_SPAN} days. ${rows.count { Geo.value(it, key) != null }} countries have one; tap one for its numbers and Open for its dates.")
        else if (key != "gaps") Muted("Brighter is more, up to ${Geo.show(rows.maxOfOrNull { Geo.value(it, key) ?: 0.0 }, key)}. Tap a country for its numbers, then Open for its campaigns, prospects and replies; est. numbers are split from campaigns that cover several countries.")
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
    GeoFlowPanels(g, picked, channel, s, vm) { text, run -> confirm = PendingAction(text, run) }
    GeoConfirm(g, s, vm) { text, run -> confirm = PendingAction(text, run) }
    ConfirmAction(confirm) { confirm = null }
}

/** Live Reports the country finder was unsure of (#3009): Confirm its guess, Change it, Worldwide or Skip. */
@Composable
private fun GeoConfirm(g: JsonObject, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    val rows = g.objs("confirm")
    val t = g.obj("totals")
    val total = t?.num("confirm") ?: rows.size.toDouble()
    val confirmed = t?.num("confirmed") ?: 0.0
    val uri = LocalUriHandler.current
    Panel("Live Report countries to confirm · ${fmt(total)}" + (if (confirmed > 0) " · ${fmt(confirmed)} confirmed" else ""), key = "geo-confirm", id = "geo-confirm") {
        if (rows.isEmpty()) Muted("No Live Report is waiting for a country.")
        rows.forEach { r ->
            val host = r.str("host").orEmpty()
            val cc = r.str("cc").orEmpty()
            val url = r.str("url")?.takeIf { it.isNotEmpty() }
            val key = "geo:confirm:$host"
            val idle = key !in s.running
            var typed by rememberSaveable(host) { mutableStateOf("") }
            val send = { code: String ->
                vm.market(key, "geo-country-confirm", mapOf("host" to JsonPrimitive(host), "cc" to JsonPrimitive(code))) { out -> "$host: ${out.str("name") ?: code}. The next daily Live Reports run updates its pages." }
            }
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text(host, color = if (url != null) J.cyan else J.text, fontSize = 14.sp, fontWeight = FontWeight.Medium,
                    modifier = url?.let { u -> Modifier.clickable { runCatching { uri.openUri(u) } } } ?: Modifier)
                Muted("${fmt(r.num("reports"))} report${if (r.num("reports") == 1.0) "" else "s"} · guess: ${Geo.guess(r)}")
                val evidence = (r["evidence"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
                if (evidence.isNotEmpty()) Muted(evidence.joinToString(" · "), maxLines = 3)
                Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                    if (cc.isNotEmpty()) TextButton({ send(cc) }, enabled = idle) { Text("Confirm", color = J.cyan, fontSize = 13.sp) }
                    OutlinedTextField(typed, { typed = it.filter(Char::isLetter).take(2).uppercase() }, Modifier.width(76.dp), singleLine = true, placeholder = { Text("CC") })
                    TextButton({ Geo.confirmCode(typed)?.let(send) }, enabled = idle && Geo.confirmCode(typed) != null) { Text("Change", color = J.cyan, fontSize = 13.sp) }
                    if (cc != "WW") TextButton({ send("WW") }, enabled = idle) { Text("Worldwide", color = J.cyan, fontSize = 13.sp) }
                    TextButton({
                        ask("skip $host: it stays without a country and leaves this list") {
                            vm.market(key, "geo-country-confirm", mapOf("host" to JsonPrimitive(host), "skip" to JsonPrimitive(true))) { "$host skipped." }
                        }
                    }, enabled = idle) { Text("Skip", color = J.muted, fontSize = 13.sp) }
                }
            }
        }
        if (rows.size < total) Muted("The ${rows.size} with the most reports. Change takes a two-letter code, or WW for worldwide.")
    }
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
