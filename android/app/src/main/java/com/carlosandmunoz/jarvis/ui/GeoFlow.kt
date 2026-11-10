package com.carlosandmunoz.jarvis.ui

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.bool
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
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The Map tab's campaign timeline and channel flow (#3114), twin of js/admin-jarvis-geo-flow.js: the geo source's
 *  `timeline` and `flow` (functions/jarvis-geo-flow.js) on Compose Canvas. Both follow the picked country; the flow also
 *  follows the channel. The sections start folded the first time, so their charts draw only once opened. */
object GeoFlow {
    data class Status(val key: String, val label: String, val color: Color)
    val STATUSES = listOf(
        Status("draft", "Draft", Color(0xFF5D7A8C)), Status("scheduled", "Scheduled", Color(0xFFA98BFF)), Status("active", "Active", Color(0xFF3DFFA8)),
        Status("paused", "Paused", Color(0xFFFFB547)), Status("done", "Done", Color(0xFF2FB0D4))
    )
    val PAUSE = Color(0xFFFFB547)
    data class Channel(val key: String, val label: String, val short: String, val color: Color)
    val CHANNELS = listOf(
        Channel("email", "Cold email", "Email", Color(0xFF38E1FF)), Channel("sweep", "Sweep · Live Reports", "Sweep", Color(0xFFA98BFF)),
        Channel("social", "Social replies", "Social", Color(0xFF4ADE80)), Channel("web", "Visitors · links", "Visits", Color(0xFFFFB547))
    )
    /** Each stage takes the colour of the light level it reaches on the map. */
    data class Stage(val key: String, val label: String, val short: String, val light: Int)
    val STAGES = listOf(
        Stage("prospect", "Prospect", "Prosp.", 1), Stage("sent", "Sent", "Sent", 2), Stage("opened", "Opened", "Opened", 3),
        Stage("replied", "Replied", "Replied", 4), Stage("viewed", "Report viewed", "Viewed", 3), Stage("paid", "Paid", "Paid", 5)
    )
    private val LANGS = mapOf("en" to "English", "es" to "Spanish", "pt" to "Portuguese", "de" to "German", "fr" to "French", "it" to "Italian")
    val GROUPS = listOf("lang" to "Language", "region" to "Region")

    fun status(key: String?) = STATUSES.firstOrNull { it.key == key } ?: STATUSES[0]
    fun strs(o: JsonObject, key: String) = o.arr(key).mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    fun dayLabel(d: String?): String = d?.takeIf { it.length >= 10 }?.let { runCatching { LocalDate.parse(it.take(10)).format(DateTimeFormatter.ofPattern("MMM d", Locale.US)) }.getOrNull() } ?: ""
    fun epoch(d: String): Long = LocalDate.parse(d.take(10)).toEpochDay()
    fun kindColor(kind: String?): Color = if (kind == "pause") PAUSE else Geo.DATE_KINDS[kind]?.second ?: Color(0xFF7AA2FF)

    /** The campaigns that reach a country (all of them with none picked), and the markers for it. */
    fun rowsFor(tl: JsonObject, cc: String?) = tl.objs("rows").filter { cc == null || cc in strs(it, "ccs") }
    fun markersFor(tl: JsonObject, cc: String?) = tl.objs("markers").filter { cc == null || it.bool("all") == true || cc in strs(it, "ccs") }

    data class Group(val label: String, val rows: List<JsonObject>)
    /** Dated bars grouped by language or region, groups in order of their first start. */
    fun groups(rows: List<JsonObject>, by: String): List<Group> {
        val out = LinkedHashMap<String, MutableList<JsonObject>>()
        rows.filter { !it.str("start").isNullOrEmpty() }.forEach { r ->
            val lang = r.str("lang").orEmpty()
            val k = if (by == "region") r.str("region")?.takeIf { it.isNotEmpty() } ?: "Other" else if (lang.isNotEmpty()) "${LANGS[lang] ?: lang} · $lang" else "Other"
            out.getOrPut(k) { mutableListOf() }.add(r)
        }
        return out.map { Group(it.key, it.value) }
    }

    /** Week ticks (Mondays) between from and to, one every 2 or 4 weeks when they would crowd px. */
    fun weeks(from: String, to: String, px: Float, minGap: Float = 46f): List<String> {
        val a = LocalDate.parse(from)
        val first = a.plusDays(((8 - a.dayOfWeek.value % 7) % 7).toLong())
        val end = LocalDate.parse(to)
        val all = generateSequence(first) { it.plusDays(7) }.takeWhile { !it.isAfter(end) }.map { it.toString() }.toList()
        val span = maxOf(1L, epoch(to) - epoch(from)).toFloat()
        val perWeek = px * 7 / span
        val step = if (perWeek >= minGap) 1 else if (perWeek >= minGap / 2) 2 else 4
        return all.filterIndexed { n, _ -> n % step == 0 }
    }

    /** Where a bar runs: start to today while it sends, or to when it stopped when known; a point while scheduled or draft. */
    fun span(r: JsonObject, today: String): Pair<String, String>? {
        val start = r.str("start")?.takeIf { it.isNotEmpty() } ?: return null
        val st = r.str("status")
        val end = r.str("end").orEmpty()
        val open = st == "active" || ((st == "paused" || st == "done") && end.isEmpty())
        return start to if (open) today else end.ifEmpty { start }
    }

    data class Link(val ch: String, val from: String, val to: String, val value: Double)
    data class Model(val shown: List<Link>, val empty: List<Link>)
    /** The flow in scope: the channel's links with the country's values (all countries with none picked). */
    fun model(flow: JsonObject, cc: String?, channel: String): Model {
        val values = (if (cc == null) flow["all"] else flow.obj("by")?.get(cc)) as? JsonArray
        val links = flow.arr("links").mapIndexedNotNull { n, l ->
            val a = (l as? JsonArray)?.map { (it as? JsonPrimitive)?.contentOrNull.orEmpty() } ?: return@mapIndexedNotNull null
            Link(a.getOrElse(0) { "" }, a.getOrElse(1) { "" }, a.getOrElse(2) { "" }, (values?.getOrNull(n) as? JsonPrimitive)?.doubleOrNull ?: 0.0)
        }.filter { channel == "all" || it.ch == channel }
        return Model(links.filter { it.value > 0 }, links.filter { it.value <= 0 })
    }
    fun linkLabel(l: Link) = "${CHANNELS.firstOrNull { it.key == l.ch }?.label ?: l.ch}: ${if (l.from.isEmpty()) "start" else STAGES.firstOrNull { it.key == l.from }?.label?.lowercase() ?: l.from} → ${STAGES.firstOrNull { it.key == l.to }?.label?.lowercase() ?: l.to}"
    /** The structural needs lines for the channel: the server lists them in CHANNELS order. */
    fun needs(flow: JsonObject, channel: String) = strs(flow, "needs").filterIndexed { n, _ -> channel == "all" || CHANNELS.getOrNull(n)?.key == channel }

    data class Node(val id: String, val x: Float, val y: Float, val h: Float, val inV: Double, val outV: Double)
    data class Band(val link: Link, val x0: Float, val y0: Float, val x1: Float, val y1: Float, val width: Float)
    data class Layout(val nodes: Map<String, Node>, val bands: List<Band>, val h: Float, val step: Float, val left: Float)

    /** Sankey layout in px, as flowLayout in js/admin-jarvis-geo-flow.js: channels first, then the six stages; bands at least minBand. */
    fun layout(shown: List<Link>, w: Float, maxH: Float, left: Float, node: Float, gap: Float, minBand: Float): Layout {
        val cols = listOf(CHANNELS.map { "ch:" + it.key }) + STAGES.map { listOf("st:" + it.key) }
        fun from(l: Link) = if (l.from.isEmpty()) "ch:" + l.ch else "st:" + l.from
        fun to(l: Link) = "st:" + l.to
        val used = shown.flatMap { listOf(from(it), to(it)) }.toSet()
        val inV = shown.groupBy(::to).mapValues { e -> e.value.sumOf { it.value } }
        val outV = shown.groupBy(::from).mapValues { e -> e.value.sumOf { it.value } }
        val k = cols.mapNotNull { c ->
            val live = c.filter { it in used }
            val sum = live.sumOf { maxOf(inV[it] ?: 0.0, outV[it] ?: 0.0) }
            if (sum > 0) ((maxH - maxOf(0, live.size - 1) * gap) / sum).toFloat() else null
        }.minOrNull() ?: 1f
        fun bw(v: Double) = maxOf(minBand, (v * k).toFloat())
        val step = (w - left - node - 4f) / (cols.size - 1)
        val nodes = LinkedHashMap<String, Node>()
        var h = 0f
        cols.forEachIndexed { i, c ->
            var y = 0f
            c.filter { it in used }.forEach { n ->
                val ins = shown.filter { to(it) == n }.sumOf { bw(it.value).toDouble() }.toFloat()
                val outs = shown.filter { from(it) == n }.sumOf { bw(it.value).toDouble() }.toFloat()
                val nh = maxOf(ins, outs)
                nodes[n] = Node(n, left - node + i * step, y, nh, inV[n] ?: 0.0, outV[n] ?: 0.0)
                y += nh + gap
            }
            h = maxOf(h, y - gap)
        }
        val outY = nodes.mapValues { it.value.y }.toMutableMap()
        val inY = nodes.mapValues { it.value.y }.toMutableMap()
        val bands = shown.sortedBy { l -> CHANNELS.indexOfFirst { it.key == l.ch } }.map { l ->
            val a = nodes.getValue(from(l))
            val b = nodes.getValue(to(l))
            val width = bw(l.value)
            val y0 = outY.getValue(a.id) + width / 2
            val y1 = inY.getValue(b.id) + width / 2
            outY[a.id] = outY.getValue(a.id) + width
            inY[b.id] = inY.getValue(b.id) + width
            Band(l, a.x + node, y0, b.x, y1, width)
        }
        return Layout(nodes, bands, maxOf(h, 20f), step, left)
    }

    /** The heavy sections start folded the first time they show, so their charts draw only once opened. */
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

@Composable
private fun FlowSwatch(color: Color) = Box(Modifier.size(10.dp).background(color, RoundedCornerShape(3.dp)))

@Composable
private fun FlowChips(items: List<Pair<String, String>>, on: String, pick: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        items.forEach { (k, label) ->
            TextButton({ pick(k) }) { Text(label, color = if (k == on) J.cyan else J.muted, fontSize = 13.sp, fontWeight = if (k == on) FontWeight.Bold else FontWeight.Normal) }
        }
    }
}

private fun DrawScope.label(text: String, x: Float, y: Float, px: Float, color: Color, align: android.graphics.Paint.Align = android.graphics.Paint.Align.LEFT, bold: Boolean = false) {
    drawIntoCanvas { c ->
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            textSize = px; this.color = color.toArgb(); textAlign = align
            typeface = if (bold) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
        }
        c.nativeCanvas.drawText(text, x, y, p)
    }
}

private fun cut(s: String, n: Int) = if (s.length > n) s.take(maxOf(1, n - 1)) + "…" else s

/** The campaign timeline and the channel flow under the ranking; both follow the picked country, the flow also the channel. */
@Composable
fun GeoFlowPanels(g: JsonObject, picked: String?, channel: String, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    val context = LocalContext.current
    remember { GeoFlow.foldFirstTime(context, listOf("geo-timeline", "geo-flow")) }
    val sel = g.objs("countries").firstOrNull { it.str("cc") == picked }
    val cc = sel?.str("cc")
    val name = sel?.str("name")
    GeoTimeline(g.obj("timeline"), cc, name, s, vm, ask)
    GeoFlowDiagram(g.obj("flow"), cc, name, channel)
}

@Composable
private fun GeoTimeline(tl: JsonObject?, cc: String?, name: String?, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    var group by rememberSaveable { mutableStateOf("lang") }
    var camp by rememberSaveable { mutableStateOf<String?>(null) }
    val rows = tl?.let { GeoFlow.rowsFor(it, cc) }.orEmpty()
    Panel("Campaign timeline" + (name?.let { " · $it" } ?: "") + " · ${rows.size}", key = "geo-timeline", id = "geo-timeline") {
        if (tl == null) { Muted("The geo source has no timeline yet; it comes with the next refresh."); return@Panel }
        FlowChips(GeoFlow.GROUPS, group) { group = it }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GeoFlow.STATUSES.forEach { st -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { FlowSwatch(st.color); Muted("${st.label} · ${rows.count { it.str("status") == st.key }}") } }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { FlowSwatch(GeoFlow.PAUSE.copy(alpha = 0.5f)); Muted("Holiday pause") }
        }
        val groups = remember(tl, cc, group) { GeoFlow.groups(rows, group) }
        val markers = remember(tl, cc) { GeoFlow.markersFor(tl, cc) }
        if (groups.isEmpty()) Muted(if (name != null) "No campaign with a start date reaches $name yet." else "No campaign has a start date yet.")
        else TimelineChart(tl, groups, markers, camp) { id -> camp = if (camp == id) null else id }
        val undated = rows.filter { it.str("start").isNullOrEmpty() }
        if (undated.isNotEmpty()) Text("No start date: " + undated.joinToString(", ") { "${it.str("name")} (${it.str("raw") ?: it.str("status")})" }, color = J.muted, fontSize = 13.sp,
            modifier = Modifier.clickable { camp = undated.first().str("id") })
        rows.firstOrNull { it.str("id") == camp }?.let { r -> CampaignSheet(r, s, vm, ask) }
        Muted("Bars run from each campaign's start to today, or to when it stopped when Jarvis knows: a holiday pause, else Instantly's last change. " +
            (if (cc != null) "Only the campaigns with leads in this country. " else "") + "Triangles are the calendar's dates. Tap a bar for Pause or Activate.")
    }
}

@Composable
private fun TimelineChart(tl: JsonObject, groups: List<GeoFlow.Group>, markers: List<JsonObject>, selected: String?, tap: (String) -> Unit) {
    val density = LocalDensity.current
    val today = tl.str("today").orEmpty()
    val from = tl.str("from") ?: today
    val to = tl.str("to") ?: today
    val rowDp = 26.dp
    val headDp = 22.dp
    val topDp = 42.dp
    val heightDp = topDp + headDp * groups.size + rowDp * groups.sumOf { it.rows.size } + 8.dp
    // Which bar a y (px) falls on, for taps.
    val hits = remember(groups, density) {
        with(density) {
            var y = topDp.toPx()
            buildList {
                groups.forEach { g -> y += headDp.toPx(); g.rows.forEach { r -> add(Triple(y, y + rowDp.toPx(), r.str("id").orEmpty())); y += rowDp.toPx() } }
            }
        }
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val widthPx = with(density) { maxWidth.toPx() }
        Canvas(
            Modifier.fillMaxWidth().height(heightDp).background(Color(0xFF0A141B), RoundedCornerShape(10.dp))
                .pointerInput(hits) { detectTapGestures { p -> hits.firstOrNull { p.y >= it.first && p.y < it.second }?.let { tap(it.third) } } }
        ) {
            val px = { v: Float -> v * density.density }
            val labelW = minOf(px(150f), widthPx * 0.3f)
            val x0 = labelW + px(6f)
            val x1 = size.width - px(10f)
            val spanDays = maxOf(1L, GeoFlow.epoch(to) - GeoFlow.epoch(from)).toFloat()
            fun x(d: String) = x0 + (GeoFlow.epoch(d) - GeoFlow.epoch(from)) / spanDays * (x1 - x0)
            val top = topDp.toPx()
            val bottom = size.height - px(4f)
            val small = 10.sp.toPx()
            GeoFlow.weeks(from, to, x1 - x0, px(46f)).forEach { d ->
                drawLine(Color(0xFF1D3340), Offset(x(d), px(16f)), Offset(x(d), bottom), strokeWidth = px(1f))
                label(GeoFlow.dayLabel(d), x(d), px(11f), small, J.dim, android.graphics.Paint.Align.CENTER)
            }
            markers.forEach { m ->
                val d = m.str("date") ?: return@forEach
                val c = GeoFlow.kindColor(m.str("kind"))
                val left = x(d)
                m.str("end")?.takeIf { it > d }?.let { e -> drawRect(c.copy(alpha = 0.05f), Offset(left, top), Size(maxOf(px(2f), x(e) - left), bottom - top)) }
                drawLine(c.copy(alpha = 0.45f), Offset(left, px(28f)), Offset(left, bottom), strokeWidth = px(1f),
                    pathEffect = PathEffect.dashPathEffect(if (m.str("kind") == "pause") floatArrayOf(px(4f), px(2f)) else floatArrayOf(px(1f), px(3f))))
                drawPath(Path().apply { moveTo(left - px(5f), px(20f)); lineTo(left + px(5f), px(20f)); lineTo(left, px(27f)); close() }, c)
            }
            val now = x(today)
            drawLine(J.cyan, Offset(now, px(16f)), Offset(now, bottom), strokeWidth = px(1.4f), pathEffect = PathEffect.dashPathEffect(floatArrayOf(px(3f), px(2f))))
            label("Today", now + px(3f), top - px(3f), small, J.cyan, bold = true)
            var y = top
            val chars = (labelW / px(6.4f)).toInt()
            groups.forEach { g ->
                label("${cut(g.label, chars + 4).uppercase()} · ${g.rows.size}", 0f, y + px(15f), small, J.amber, bold = true)
                drawLine(Color(0xFF1D3340), Offset(0f, y + headDp.toPx() - px(1f)), Offset(x1, y + headDp.toPx() - px(1f)))
                y += headDp.toPx()
                g.rows.forEach { r ->
                    val st = GeoFlow.status(r.str("status"))
                    val on = r.str("id") == selected
                    if (on) drawRect(J.cyan.copy(alpha = 0.08f), Offset(0f, y), Size(x1, rowDp.toPx()))
                    label(cut(r.str("name").orEmpty(), chars), 0f, y + px(17f), 11.sp.toPx(), if (on) Color(0xFFFFE7A8) else J.text, bold = on)
                    GeoFlow.span(r, today)?.let { (a, b) ->
                        val xa = x(a)
                        val xb = x(b)
                        val mid = y + rowDp.toPx() / 2
                        if (xb - xa < px(4f)) {
                            val d = Path().apply { moveTo(xa, mid - px(7f)); lineTo(xa + px(6f), mid); lineTo(xa, mid + px(7f)); lineTo(xa - px(6f), mid); close() }
                            drawPath(d, st.color.copy(alpha = if (st.key == "draft") 0.35f else 0.85f))
                            if (on) drawPath(d, Color.White, style = Stroke(px(1.6f)))
                        } else {
                            drawRoundRect(st.color.copy(alpha = if (st.key == "done") 0.55f else 0.85f), Offset(xa, mid - px(6f)), Size(xb - xa, px(12f)), CornerRadius(px(3f)))
                            if (on) drawRoundRect(Color.White, Offset(xa, mid - px(6f)), Size(xb - xa, px(12f)), CornerRadius(px(3f)), style = Stroke(px(1.6f)))
                        }
                        r.objs("pauses").forEach { p ->
                            val pd = p.str("date")?.takeIf { it.isNotEmpty() } ?: return@forEach
                            val pa = x(pd)
                            val pw = maxOf(px(4f), x(p.str("until")?.takeIf { it.isNotEmpty() } ?: pd) - pa)
                            clipRect(pa, mid - px(8f), pa + pw, mid + px(8f)) {
                                var sx = pa - px(16f)
                                while (sx < pa + pw) { drawLine(GeoFlow.PAUSE, Offset(sx, mid + px(8f)), Offset(sx + px(16f), mid - px(8f)), strokeWidth = px(2f)); sx += px(5f) }
                            }
                            drawRect(GeoFlow.PAUSE, Offset(pa, mid - px(8f)), Size(pw, px(16f)), style = Stroke(px(0.8f)))
                        }
                    }
                    y += rowDp.toPx()
                }
            }
        }
    }
}

/** The tapped bar: status, window, countries and holiday pauses, with the Marketing tab's Pause or Activate. */
@Composable
private fun CampaignSheet(r: JsonObject, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    val id = r.str("id").orEmpty()
    val mk = s.snapshot.obj("external").obj("marketing").obj("campaigns")?.objs("rows").orEmpty().firstOrNull { it.str("id") == id }
    val base = JsonObject(mapOf("id" to JsonPrimitive(id), "name" to JsonPrimitive(r.str("name").orEmpty()), "status" to JsonPrimitive(r.str("raw")?.takeIf { it.isNotEmpty() } ?: r.str("status").orEmpty()),
        "start" to JsonPrimitive(r.str("start").orEmpty())))
    val row = mk?.let { JsonObject(base + it) } ?: base
    val st = r.str("status")
    val facts = listOfNotNull(
        r.str("start")?.takeIf { it.isNotEmpty() }?.let { (if (st == "scheduled" || st == "draft") "Starts " else "Started ") + GeoFlow.dayLabel(it) } ?: "No start date",
        r.str("window")?.takeIf { it.isNotEmpty() },
        when (r.str("endBy")) { "pause" -> "paused ${GeoFlow.dayLabel(r.str("end"))} for a holiday"; "update" -> "stopped about ${GeoFlow.dayLabel(r.str("end"))}"; else -> null },
        GeoFlow.strs(r, "ccs").takeIf { it.isNotEmpty() }?.let { l -> "reaches " + l.joinToString(", ") { "${Geo.flagOf(it)} $it" } } ?: "no country matched yet"
    )
    Column(Modifier.fillMaxWidth().background(Color(0x99081218), RoundedCornerShape(10.dp)).padding(10.dp)) {
        CampaignRows(JsonObject(mapOf("rows" to JsonArray(listOf(row)))), s, vm, ask)
        Muted(facts.joinToString(" · "))
        r.objs("pauses").forEach { p -> Muted("${if (p.str("status") == "planned") "Pauses" else "Paused"} ${GeoFlow.dayLabel(p.str("date"))} for ${p.str("name")} (${p.str("cc")}), back ${GeoFlow.dayLabel(p.str("until"))}") }
    }
}

@Composable
private fun GeoFlowDiagram(flow: JsonObject?, cc: String?, name: String?, channel: String) {
    val scope = GeoFlow.CHANNELS.firstOrNull { it.key == channel }?.label
    Panel("Channel flow" + (name?.let { " · $it" } ?: "") + (scope?.let { " · $it" } ?: ""), key = "geo-flow", id = "geo-flow") {
        if (flow == null) { Muted("The geo source has no flow yet; it comes with the next refresh."); return@Panel }
        val m = remember(flow, cc, channel) { GeoFlow.model(flow, cc, channel) }
        if (m.shown.isEmpty()) Muted("No channel has numbers" + (name?.let { " for $it" } ?: "") + " yet.") else FlowChart(m.shown)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GeoFlow.CHANNELS.filter { channel == "all" || it.key == channel }.forEach { c -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { FlowSwatch(c.color); Muted(c.label) } }
        }
        if (m.empty.isNotEmpty()) Text("Left out, no data" + (name?.let { " in $it" } ?: "") + " yet: " + m.empty.joinToString("; ") { GeoFlow.linkLabel(it) } + ".", color = J.amber, fontSize = 13.sp)
        GeoFlow.needs(flow, channel).forEach { Text(it, color = J.amber, fontSize = 13.sp) }
        Muted("Each band is one channel, as wide as its count: leads, people contacted, unique opens and replies for cold email; prospects queued for the sweep; social replies drafted and posted; short-link visits and paid unlocks.")
    }
}

@Composable
private fun FlowChart(shown: List<GeoFlow.Link>) {
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val w = with(density) { maxWidth.toPx() }
        val narrow = maxWidth < 560.dp
        val top = with(density) { 36.dp.toPx() }
        val lay = remember(shown, w) {
            with(density) { GeoFlow.layout(shown, w, 240.dp.toPx(), if (narrow) 46.dp.toPx() else minOf(120.dp.toPx(), w * 0.2f), 8.dp.toPx(), 10.dp.toPx(), 2.dp.toPx()) }
        }
        val heightDp = with(density) { (top + lay.h).toDp() } + 8.dp
        Canvas(Modifier.fillMaxWidth().height(heightDp).background(Color(0xFF0A141B), RoundedCornerShape(10.dp))) {
            val node = 8.dp.toPx()
            val small = 10.sp.toPx()
            GeoFlow.STAGES.forEachIndexed { i, st ->
                val n = lay.nodes["st:" + st.key]
                val last = i == GeoFlow.STAGES.size - 1
                val hx = if (last) size.width - 2.dp.toPx() else lay.left - node / 2 + (i + 1) * lay.step
                val align = if (last) android.graphics.Paint.Align.RIGHT else android.graphics.Paint.Align.CENTER
                label(if (narrow) st.short else st.label, hx, 11.dp.toPx(), small, J.muted, align, bold = true)
                label(n?.let { fmt(if (it.inV > 0) it.inV else it.outV) } ?: "—", hx, 25.dp.toPx(), 11.sp.toPx(), Color.White, align)
            }
            lay.bands.forEach { b ->
                val c = GeoFlow.CHANNELS.firstOrNull { it.key == b.link.ch }?.color ?: J.cyan
                val mx = (b.x0 + b.x1) / 2
                val p = Path().apply { moveTo(b.x0, top + b.y0); cubicTo(mx, top + b.y0, mx, top + b.y1, b.x1, top + b.y1) }
                drawPath(p, c.copy(alpha = 0.4f), style = Stroke(b.width))
            }
            lay.nodes.values.forEach { n ->
                val ch = GeoFlow.CHANNELS.firstOrNull { "ch:" + it.key == n.id }
                val st = GeoFlow.STAGES.firstOrNull { "st:" + it.key == n.id }
                val fill = ch?.color ?: Geo.LIGHTS[st?.light ?: 0].color
                drawRoundRect(fill, Offset(n.x, top + n.y), Size(node, maxOf(2.dp.toPx(), n.h)), CornerRadius(2.dp.toPx()))
                if (ch != null) label(if (narrow) ch.short else ch.label, n.x - 5.dp.toPx(), top + n.y + n.h / 2 + small / 3, small, J.text, android.graphics.Paint.Align.RIGHT)
            }
        }
    }
}
