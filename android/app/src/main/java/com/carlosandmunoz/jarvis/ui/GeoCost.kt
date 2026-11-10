package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale
import kotlin.math.min

/** The Map's cost and return (#3283), twin of js/admin-jarvis-geo-cost.js: monthly outreach costs from Settings spread over
 *  the countries by the geo source's `cost` (functions/jarvis-geo-cost.js), as cost per email, reply and positive reply, and return. */
object GeoCost {
    val CHANNEL = "cost" to "Cost and return"
    val METRICS = listOf(
        Geo.Metric("cost", "Outreach cost", "cost", "$"), Geo.Metric("costPerSent", "USD per email sent", "cost", "$"), Geo.Metric("costPerReply", "USD per reply", "cost", "$"),
        Geo.Metric("costPerPositive", "USD per positive reply", "cost", "$"), Geo.Metric("roi", "Return on cost", "cost", "×")
    )
    val KEYS = METRICS.map { it.key }.toSet()
    /** Cheaper is better for these; Return is better higher. Outreach cost is plain spend, shaded like the counts. */
    val LOWER = setOf("costPerSent", "costPerReply", "costPerPositive")
    val SCALED = LOWER + "roi"
    /** The geo source's per-country fields, in its order. */
    private val FIELDS = listOf("cost", "costPerSent", "costPerReply", "costPerPositive", "revenue", "roi")
    const val NEEDS = "Add monthly outreach costs in Settings to see cost and return."
    val COST_CHANNELS = listOf("email" to "Cold email", "social" to "Social", "links" to "Short links", "all" to "All outreach")
    val SPREAD = mapOf("email" to "emails sent", "social" to "social replies", "links" to "link visits", "all" to "emails sent")
    val GOOD = Color(0xFF3DFFA8)
    val MID = Color(0xFFFFB547)
    val BAD = Color(0xFFFF4D8D)
    private const val MAX_ITEMS = 30
    private val MONTH = Regex("^\\d{4}-(0[1-9]|1[0-2])$")

    fun label(key: String) = METRICS.firstOrNull { it.key == key }?.label ?: key

    /** A country's number for a cost metric, null where it has none (no cost, or nothing to divide by). */
    fun value(r: JsonObject?, key: String): Double? = r.num(key)

    /** "$0.012" under a dollar, "$14.50" above, "1.25×" for Return. */
    fun show(v: Double?, key: String): String {
        if (v == null) return "—"
        if (key == "roi") return BigDecimal(v).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + "×"
        if (v == 0.0) return "$0"
        return "$" + (if (v < 1) "%,.3f" else "%,.2f").format(Locale.US, v)
    }

    private fun counts(v: Double?, key: String) = v != null && (key == "roi" || v > 0)

    /** Best first: the cheapest per email, reply or positive reply, the highest return, the most spent. */
    fun ranked(rows: List<JsonObject>, key: String): List<JsonObject> {
        val list = rows.filter { counts(value(it, key), key) }
        val by = compareBy<JsonObject> { value(it, key) ?: 0.0 }
        return list.sortedWith((if (key in LOWER) by else by.reversed()).thenBy { it.str("cc") })
    }

    /** How good each number is, 0 to 1: Return against 1× (pays back); a cost per reply by its rank, cheapest 1, costliest 0. */
    fun goodness(rows: List<JsonObject>, key: String): Map<String, Double> {
        val list = rows.mapNotNull { r -> value(r, key)?.takeIf { counts(it, key) }?.let { (r.str("cc") ?: "") to it } }
        if (key == "roi") return list.associate { (cc, v) -> cc to min(1.0, v) }
        val sorted = list.map { it.second }.sorted()
        return list.associate { (cc, v) ->
            val at = (sorted.indexOf(v) + sorted.lastIndexOf(v)) / 2.0
            cc to (if (sorted.size > 1) 1 - at / (sorted.size - 1) else 1.0)
        }
    }

    /** Pink through amber to green. */
    fun colour(good: Double): Color {
        val t = good.coerceIn(0.0, 1.0).toFloat()
        return if (t < 0.5f) lerp(BAD, MID, t * 2) else lerp(MID, GOOD, (t - 0.5f) * 2)
    }

    fun fills(rows: List<JsonObject>, key: String): Map<String, Color> = goodness(rows, key).mapValues { colour(it.value) }

    /** The cost view behind what the map shows: a range's last n days, a played week, or Now's basis. */
    fun viewFor(g: JsonObject?, mode: String, span: Int, week: Int?): JsonObject? {
        val c = g.obj("cost") ?: return null
        return when (mode) {
            "span" -> range(g, span, 0)
            "week" -> week?.let { (c["weeks"] as? JsonArray)?.getOrNull(it) as? JsonObject }
            else -> c.obj("now")
        }
    }
    /** A range's cost view: which 0 the last n days, 1 the n days before. */
    fun range(g: JsonObject?, n: Int, which: Int) = ((g.obj("cost").obj("ranges")?.get("$n") as? JsonArray)?.getOrNull(which)) as? JsonObject
    fun week(g: JsonObject?, k: Int) = (g.obj("cost")?.get("weeks") as? JsonArray)?.getOrNull(k) as? JsonObject

    /** One country's fields from a view, null where it has none. */
    fun fieldsOf(view: JsonObject?, cc: String): Map<String, JsonElement> {
        val row = view.obj("c")?.get(cc) as? JsonArray
        return FIELDS.mapIndexed { n, k -> k to (row?.getOrNull(n)?.takeIf { it is JsonPrimitive } ?: JsonNull) }.toMap()
    }

    /** Puts a view's cost fields on rows built from the history (GeoTime). */
    fun join(rows: List<JsonObject>, view: JsonObject?): List<JsonObject> = rows.map { JsonObject(it + fieldsOf(view, it.str("cc").orEmpty())) }

    fun hasItems(g: JsonObject?) = (g.obj("cost")?.get("items") as? JsonArray)?.isNotEmpty() == true

    /** What the numbers cover, in words. */
    fun basisText(g: JsonObject?, mode: String, span: Int, label: String = ""): String {
        val c = g.obj("cost") ?: return ""
        if (mode == "span") return range(g, span, 0)?.let { "last $span days, ${GeoTime.short(it.str("from"))} – ${GeoTime.short(it.str("to"))}" } ?: ""
        if (mode == "week") return label
        val b = c.obj("basis") ?: return ""
        return if (b.str("kind") == "span") "last ${fmt(b.num("span"))} days, ${GeoTime.short(b.str("from"))} – ${GeoTime.short(b.str("to"))}" else "since the first campaign, ${GeoTime.short(b.str("from"))}"
    }

    /** The scale's words under the map: cheapest to costliest, or no return to pays back; null when there is no scale to draw. */
    fun legend(rows: List<JsonObject>, key: String): Pair<List<String>?, String> {
        val vals = rows.mapNotNull { value(it, key) }.filter { counts(it, key) }
        if (vals.isEmpty()) return null to "No country has ${label(key).lowercase()} yet."
        if (key == "roi") return listOf("0× no return", "1× pays back") to "${vals.count { it >= 1 }} of ${vals.size} pay back · best ${show(vals.max(), key)}"
        if (vals.min() == vals.max()) return null to "${show(vals[0], key)} in each of ${vals.size} countries" + if (key == "costPerSent") ": email costs are spread by emails sent, so only social and link costs make it differ." else "."
        return listOf("${show(vals.min(), key)} cheapest", "${show(vals.max(), key)} costliest") to "by rank, ${vals.size} countries"
    }

    /** The line under the legend: the ask while no cost is saved, else what the numbers cover. */
    fun note(g: JsonObject?, mode: String, span: Int, week: Int?, label: String): String {
        if (!hasItems(g)) return NEEDS
        val t = viewFor(g, mode, span, week).obj("totals") ?: return "No cost basis yet: the daily run records the history, or a campaign has to start."
        val unspread = t.num("unspread") ?: 0.0
        return "Cost and return over the ${basisText(g, mode, span, label)}: ${show(t.num("cost"), "cost")} spent" +
            (if (unspread > 0) ", ${show(unspread, "cost")} not spread (no country had the activity it is spread by)" else "") + ". Revenue is paid unlocks from short links."
    }

    data class Draft(val label: String = "", val usd: String = "", val channel: String = "email", val from: String = "", val to: String = "")
    data class Clean(val items: List<JsonObject>, val error: String? = null)

    fun draftsOf(items: List<JsonObject>) = items.map { Draft(it.str("label").orEmpty(), it.num("usd")?.let { u -> BigDecimal(u).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() }.orEmpty(), it.str("channel") ?: "all", it.str("from").orEmpty(), it.str("to").orEmpty()) }

    /** The list as typed, checked like the server does; error names the first problem. */
    fun clean(list: List<Draft>): Clean {
        if (list.size > MAX_ITEMS) return Clean(emptyList(), "At most $MAX_ITEMS costs.")
        val out = mutableListOf<JsonObject>()
        list.forEachIndexed { i, d ->
            val label = d.label.replace(Regex("\\s+"), " ").trim().take(60)
            if (label.isEmpty() && d.usd.isBlank()) return@forEachIndexed
            if (label.isEmpty()) return Clean(emptyList(), "Cost ${i + 1} needs a name.")
            val usd = d.usd.trim().replace(",", ".").toDoubleOrNull()
            if (usd == null || usd.isNaN() || usd <= 0 || usd > 100000) return Clean(emptyList(), "$label: give the USD a month, above 0.")
            val from = d.from.trim()
            val to = d.to.trim()
            if ((from.isNotEmpty() && !MONTH.matches(from)) || (to.isNotEmpty() && !MONTH.matches(to))) return Clean(emptyList(), "$label: months are YYYY-MM.")
            if (from.isNotEmpty() && to.isNotEmpty() && to < from) return Clean(emptyList(), "$label: the end month is before the start.")
            out += JsonObject(mapOf("label" to JsonPrimitive(label), "usd" to JsonPrimitive(Math.round(usd * 100) / 100.0),
                "channel" to JsonPrimitive(if (COST_CHANNELS.any { it.first == d.channel }) d.channel else "all"), "from" to JsonPrimitive(from), "to" to JsonPrimitive(to)))
        }
        return Clean(out)
    }
}

/** The scale under the map on a cost metric, and what the numbers cover. */
@Composable
fun GeoCostLegend(g: JsonObject, tv: GeoTime.View, key: String) {
    if (key in GeoCost.SCALED && GeoCost.hasItems(g)) {
        val (ends, line) = GeoCost.legend(tv.rows, key)
        if (ends != null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
            Muted(ends[0])
            Box(Modifier.width(110.dp).height(8.dp).background(Brush.horizontalGradient(if (key == "roi") listOf(GeoCost.BAD, GeoCost.MID, GeoCost.GOOD) else listOf(GeoCost.GOOD, GeoCost.MID, GeoCost.BAD)), RoundedCornerShape(4.dp)))
            Muted(ends[1])
        }
        Muted(line)
    } else if (key == "cost") Muted("Brighter is more, up to ${GeoCost.show(tv.rows.maxOfOrNull { GeoCost.value(it, key) ?: 0.0 }, key)}.")
    Text(GeoCost.note(g, tv.mode, tv.span, tv.week, tv.label), color = if (GeoCost.hasItems(g)) J.muted else J.amber, fontSize = 13.sp)
}

/** The Cost and return panel: totals, the channels, and the best and worst countries for the picked cost metric. */
@Composable
fun GeoCostPanel(g: JsonObject, tv: GeoTime.View, key: String, channel: String, pick: (String) -> Unit) {
    if (!(channel == "all" || channel == GeoCost.CHANNEL.first || key in GeoCost.KEYS)) return
    if (!GeoCost.hasItems(g)) { Panel("Cost and return", id = "geo-cost") { Text(GeoCost.NEEDS, color = J.amber, fontSize = 13.sp) }; return }
    val v = GeoCost.viewFor(g, tv.mode, tv.span, tv.week)
    val t = v.obj("totals")
    Panel("Cost and return · ${GeoCost.basisText(g, tv.mode, tv.span, tv.label).substringBefore(",")}", id = "geo-cost") {
        if (t == null) { Muted("No cost basis yet: the daily run records the history, or a campaign has to start."); return@Panel }
        KpiPairs(listOf(
            KpiData("Spent", GeoCost.show(t.num("cost"), "cost")), KpiData("USD per email", GeoCost.show(t.num("costPerSent"), "costPerSent")),
            KpiData("USD per reply", GeoCost.show(t.num("costPerReply"), "costPerReply")), KpiData("USD per positive reply", GeoCost.show(t.num("costPerPositive"), "costPerPositive")),
            KpiData("Revenue", GeoCost.show(t.num("revenue"), "cost")), KpiData("Return", GeoCost.show(t.num("roi"), "roi"))
        ))
        val monthly = g.obj("cost").obj("monthly")
        GeoCost.COST_CHANNELS.forEach { (k, name) ->
            val x = t.obj("channels").obj(k)
            val a = monthly.num(k) ?: 0.0
            if (a <= 0 && (x.num("usd") ?: 0.0) <= 0) return@forEach
            val unspread = x.num("unspread") ?: 0.0
            KeyRow(name, "${GeoCost.show(a, "cost")} a month · ${GeoCost.show(x.num("usd") ?: 0.0, "cost")} here")
            Muted("Spread by ${GeoCost.SPREAD[k]} · ${fmt(x.num("over") ?: 0.0)} countries" +
                if (unspread > 0) " · ${GeoCost.show(unspread, "cost")} not spread" else "")
        }
        val m = if (key in GeoCost.SCALED) key else "costPerReply"
        val list = GeoCost.ranked(tv.rows, m)
        if (list.isEmpty()) Muted("No country has ${GeoCost.label(m).lowercase()} over this span.")
        else listOf("BEST" to list.take(5), "WORST" to list.takeLast(5).reversed()).forEach { (head, rows) ->
            Text("$head · ${GeoCost.label(m).uppercase()}", color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
            rows.forEach { r ->
                Row(Modifier.fillMaxWidth().clickable { pick(r.str("cc").orEmpty()) }.padding(vertical = 3.dp)) {
                    Text(r.str("name").orEmpty(), color = J.cyan, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Text(GeoCost.show(GeoCost.value(r, m), m), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Muted("Monthly costs from Settings, prorated to the days shown. Email and All outreach costs are spread by each country's share of emails sent, social by social replies, short links by link visits. Revenue is paid unlocks from short links; Return is revenue over cost.")
    }
}

/** The country sheet's block: its cost and return over the picked range (Now's basis without one), and the span before. */
@Composable
fun GeoCostSheet(g: JsonObject, cc: String, span: Int) {
    if (!GeoCost.hasItems(g)) { Text(GeoCost.NEEDS, color = J.amber, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp)); return }
    val mode = if (span > 0 && GeoCost.range(g, span, 0) != null) "span" else "now"
    val v = GeoCost.viewFor(g, mode, span, null) ?: return
    val a = GeoCost.fieldsOf(v, cc)
    val b = if (mode == "span") GeoCost.fieldsOf(GeoCost.range(g, span, 1), cc) else null
    Text("COST AND RETURN · ${GeoCost.basisText(g, mode, span).uppercase()}", color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
    listOf("cost" to "Outreach cost", "costPerSent" to "USD per email sent", "costPerReply" to "USD per reply", "costPerPositive" to "USD per positive reply", "revenue" to "Revenue (links)", "roi" to "Return on cost").forEach { (k, name) ->
        val unit = if (k == "revenue") "cost" else k
        val num = { m: Map<String, JsonElement>? -> (m?.get(k) as? JsonPrimitive)?.doubleOrNull }
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Text(name, fontSize = 13.sp, color = J.text, modifier = Modifier.weight(1f))
            Text(GeoCost.show(num(a), unit) + (b?.let { " · before ${GeoCost.show(num(it), unit)}" } ?: ""), fontSize = 12.sp, color = J.muted)
        }
    }
}

/** Settings' Outreach costs panel: the monthly costs, saved apart from the rest by geo-costs-save; the web edits the same list. */
@Composable
fun GeoCostSettings(s: UiState, vm: JarvisViewModel) {
    val cost = s.snapshot.obj("external").obj("geo")?.obj("cost")
    Column {
        if (cost == null) { Muted("Open the Map and pull down to read the saved costs."); return@Column }
        val saved = cost.objs("items")
        var items by remember(saved) { mutableStateOf(GeoCost.draftsOf(saved)) }
        var suggestions by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
        var error by remember { mutableStateOf<String?>(null) }
        val idle = "geo-costs" !in s.running
        Muted("What outreach costs a month, in USD: the Instantly plan, mailbox seats, sending domains, anything else. The Map spreads it over the countries for cost per email, per reply and return.")
        items.forEachIndexed { i, d ->
            fun set(x: GeoCost.Draft) { items = items.toMutableList().also { it[i] = x } }
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(d.label, { set(d.copy(label = it.take(60))) }, Modifier.weight(1f), singleLine = true, label = { Text("Name") })
                    OutlinedTextField(d.usd, { set(d.copy(usd = it.filter { c -> c.isDigit() || c == '.' || c == ',' })) }, Modifier.width(96.dp), singleLine = true, label = { Text("$ a month") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                }
                Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                    GeoCost.COST_CHANNELS.forEach { (k, name) ->
                        TextButton({ set(d.copy(channel = k)) }) { Text(name, color = if (d.channel == k) J.cyan else J.muted, fontWeight = if (d.channel == k) FontWeight.Bold else FontWeight.Normal, fontSize = 13.sp) }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(d.from, { set(d.copy(from = it.take(7))) }, Modifier.weight(1f), singleLine = true, label = { Text("From") }, placeholder = { Text("YYYY-MM") })
                    OutlinedTextField(d.to, { set(d.copy(to = it.take(7))) }, Modifier.weight(1f), singleLine = true, label = { Text("To") }, placeholder = { Text("YYYY-MM") })
                    TextButton({ items = items.filterIndexed { n, _ -> n != i } }) { Text("Remove", color = J.muted, fontSize = 13.sp) }
                }
            }
        }
        if (items.isEmpty()) Muted("No cost yet.")
        val checked = GeoCost.clean(items)
        Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
            TextButton({ items = items + GeoCost.Draft() }) { Text("Add a cost", color = J.cyan, fontSize = 13.sp) }
            TextButton({
                vm.market("geo-costs:suggest", "geo-costs", mapOf("suggest" to JsonPrimitive(true))) { out ->
                    suggestions = out.objs("suggestions")
                    out.str("note") ?: if (suggestions.isEmpty()) "Nothing to suggest." else "${suggestions.size} suggestion${if (suggestions.size == 1) "" else "s"} under Outreach costs."
                }
            }, enabled = "geo-costs:suggest" !in s.running) { Text("Suggest from Cloudflare", color = J.cyan, fontSize = 13.sp) }
            TextButton({
                error = checked.error
                if (checked.error == null) vm.market("geo-costs", "geo-costs-save", mapOf("items" to JsonArray(checked.items))) { out ->
                    val n = out.objs("items").size
                    if (n > 0) "Saved $n monthly cost${if (n == 1) "" else "s"}. The Map recounts cost and return." else "Costs cleared."
                }
            }, enabled = idle) { Text(if (idle) "Save costs" else "Saving…", color = J.cyan, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            Muted("${GeoCost.show(checked.items.sumOf { it.num("usd") ?: 0.0 }, "cost")} a month")
        }
        error?.let { Text(it, color = J.amber, fontSize = 13.sp) }
        suggestions.forEachIndexed { i, x ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${x.str("label").orEmpty()} · ${GeoCost.show(x.num("usd"), "cost")} a month", fontSize = 13.sp)
                    Muted("${x.str("source").orEmpty()}: ${x.str("why").orEmpty()}", maxLines = 3)
                }
                TextButton({ items = items + GeoCost.draftsOf(listOf(x)); suggestions = suggestions.filterIndexed { n, _ -> n != i } }) { Text("Add", color = J.cyan, fontSize = 13.sp) }
            }
        }
        Muted("Cold email and All outreach are spread by emails sent, Social by social replies, Short links by link visits. Leave the months empty for a cost that runs every month. Save costs saves only this list.")
    }
}
