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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawscope.Stroke
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
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sqrt

/** The Map tab (#2976), twin of js/admin-jarvis-geo.js: the snapshot's `geo` source on the world map in assets/world.json. */
object Geo {
    val CHANNELS = listOf("all" to "All", "email" to "Cold email", "sweep" to "Prospects", "social" to "Social", "web" to "Visitors")
    data class Metric(val key: String, val label: String, val channel: String, val unit: String = "")
    val METRICS = listOf(
        Metric("activity", "Activity", "all"), Metric("gaps", "Missing zones", "all"),
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
        "bounceRate" -> if (n(r, "sent") > 0) Math.round(n(r, "bounced") / n(r, "sent") * 1000) / 10.0 else null
        "saturation" -> if (n(r, "prospects") > 0) Math.round(n(r, "swept") / n(r, "prospects") * 100).toDouble() else null
        "replyRate", "openRate", "score" -> r.num(key)
        else -> n(r, key)
    }

    fun show(v: Double?, key: String) = if (v == null) "—" else (if (key == "usd") "$" else "") + fmt(v) + metric(key).unit

    /** A typed country for the confirm queue (#3009): two letters, or WW for worldwide; the function checks it is a country. */
    fun confirmCode(typed: String): String? = typed.trim().uppercase().takeIf { Regex("[A-Z]{2}").matches(it) }

    /** The finder's guess for a queued site, as the web panel shows it. */
    fun guess(r: JsonObject): String {
        val cc = r.str("cc").orEmpty()
        if (cc.isEmpty()) return "no guess"
        return (r.str("name") ?: cc) + (if (cc == "WW") "" else " · $cc") + " · ${Math.round((r.num("confidence") ?: 0.0) * 100)}% sure"
    }

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
        } else Muted("Brighter is more, up to ${Geo.show(rows.maxOfOrNull { Geo.value(it, key) ?: 0.0 }, key)}. Tap a country for its campaigns, prospects and replies; est. numbers are split from campaigns that cover several countries.")
    }

    if (sel != null) GeoCountry(sel, s, vm, close = { picked = null }) { text, run -> confirm = PendingAction(text, run) }

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
