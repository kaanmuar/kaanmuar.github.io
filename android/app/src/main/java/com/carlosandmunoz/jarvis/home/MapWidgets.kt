package com.carlosandmunoz.jarvis.home

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.currentState
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.Geo
import com.carlosandmunoz.jarvis.ui.ReviewRescue
import kotlinx.serialization.json.JsonObject

/** The three maps a home-screen widget can show (#3977): the live cyber-attack map, the outreach map and the marketing map. [modes] is what the header chip cycles through. */
enum class MapKind(val id: String, val title: String, val tab: String, val modes: List<Pair<String, String>>) {
    CYBER("cyber", "Cyber-attack map", "products:review", listOf("live" to "Live", "7d" to "7 days", "30d" to "30 days", "90d" to "90 days")),
    OUTREACH("outreach", "Outreach map", "products:geo", listOf("light" to "Light", "replies" to "Replies", "sent" to "Sent", "replyRate" to "Reply rate", "prospects" to "Prospects")),
    MARKETING("marketing", "Marketing map", "products:geo", listOf("visitors" to "Visitors", "clicks" to "Link clicks", "social" to "Social replies", "usd" to "Revenue", "activity" to "Activity"));

    companion object { fun of(id: String?) = entries.firstOrNull { it.id == id } }
}

/** What a map widget draws, from the snapshot's `checks` source (cyber) or `geo` source (outreach and marketing): twins of CyberMapPanel and GeoScreen. */
object MapData {
    data class Stat(val label: String, val value: String, val alert: Boolean = false)
    data class Line(val label: String, val value: String, val alert: Boolean = false)
    data class View(
        val kind: MapKind, val mode: String, val modeLabel: String, val fills: Map<String, Int>, val pins: Set<String>,
        val stats: List<Stat>, val lines: List<Line>, val headline: String?, val legend: String
    )

    /** How the widget lays out at its current size: the size classes of 2x2, 4x2, 5x3, 4x3 and 4x4 and up. */
    enum class Layout { COMPACT, SIDE, WIDE, STACK, FULL }

    fun layout(widthDp: Float, heightDp: Float): Layout = when {
        widthDp < 200f -> Layout.COMPACT
        heightDp < 150f -> Layout.SIDE
        heightDp >= 250f -> Layout.FULL
        widthDp >= 380f -> Layout.WIDE
        else -> Layout.STACK
    }

    fun mode(kind: MapKind, saved: String?) = saved?.takeIf { s -> kind.modes.any { it.first == s } } ?: kind.modes.first().first
    fun next(kind: MapKind, saved: String?): String {
        val keys = kind.modes.map { it.first }
        return keys[(keys.indexOf(mode(kind, saved)) + 1) % keys.size]
    }

    fun view(kind: MapKind, snap: JsonObject, saved: String?): View? {
        val mode = mode(kind, saved)
        return if (kind == MapKind.CYBER) cyber(snap, mode) else geo(kind, snap, mode)
    }

    private fun label(kind: MapKind, mode: String) = kind.modes.first { it.first == mode }.second

    fun cyber(snap: JsonObject, mode: String): View? {
        val c = snap.obj("external").obj("checks")
        val ranges = c.obj("map").obj("ranges")
        if (c == null || !c.isOk() || ranges == null || ranges.isEmpty()) return null
        val cur = ranges.obj(mode) ?: ranges.obj("live") ?: return null
        val rows = cur.objs("countries")
        val max = rows.maxOfOrNull { it.num("count") ?: 0.0 } ?: 0.0
        val ex = c.obj("exposure")
        val t = ex.obj("totals")
        val direct = ex.objs("direct")
        val exposed = direct.mapNotNull { it.str("country")?.ifEmpty { null } }
        val reports = t.num("directReports") ?: 0.0
        val mp = c.obj("map")
        val lines = rows.take(8).map { x ->
            val cc = x.str("cc").orEmpty()
            Line(Geo.flagOf(cc) + " " + ReviewRescue.countryName(cc), fmt(x.num("count")), cc in exposed)
        }
        val headline = mp.objs("events").firstOrNull()?.let { e ->
            listOfNotNull(e.str("source"), e.arr("countries").joinToString("/") { it.toString().trim('"') }.ifEmpty { null }).joinToString(" · ")
        }?.ifEmpty { null }
        return View(
            MapKind.CYBER, mode, label(MapKind.CYBER, mode), rows.associate { it.str("cc").orEmpty() to ReviewRescue.cyberFill(it.num("count") ?: 0.0, max).toArgb() }, exposed.toSet(),
            listOf(
                Stat("Cited events", fmt(cur.num("total"))), Stat("Countries", fmt(rows.size.toDouble())),
                Stat("Reports exposed", fmt(reports), reports > 0), Stat("Botnet online", fmt(mp.obj("botnetNow")?.num("online") ?: 0.0))
            ),
            lines, headline, "Pink: cited events, brighter is more. Cyan dot: a report of ours has a threat finding."
        )
    }

    fun geo(kind: MapKind, snap: JsonObject, mode: String): View? {
        val g = snap.obj("external").obj("geo")?.takeIf { it.isOk() } ?: return null
        val rows = g.objs("countries")
        val t = g.obj("totals")
        fun sum(key: String) = rows.sumOf { it.num(key) ?: 0.0 }
        val ranked = Geo.ranked(rows, mode)
        val lines = ranked.take(8).map { r ->
            val cc = r.str("cc").orEmpty()
            Line(Geo.flagOf(cc) + " " + Geo.shortName(cc, r.str("name")), Geo.show(Geo.value(r, mode), mode))
        }
        val stats = if (kind == MapKind.OUTREACH) listOf(
            Stat("Emails sent", fmt(t.num("sent"))), Stat("Reply rate", t.num("avgReply")?.let { fmt(it) + "%" } ?: "—"),
            Stat("Prospects", fmt(t.num("prospects"))), Stat("Need attention", fmt(t.num("missing")), (t.num("missing") ?: 0.0) > 0)
        ) else listOf(
            Stat("Visitors", fmt(sum("visitors"))), Stat("Link clicks", fmt(sum("clicks"))),
            Stat("Social replies", fmt(sum("social"))), Stat("Revenue", "$" + fmt(sum("usd")))
        )
        val legend = if (mode == "light") Geo.LIGHTS.joinToString(" · ") { it.name } else "Cyan: ${label(kind, mode).lowercase()}, brighter is more."
        return View(kind, mode, label(kind, mode), Geo.fills(rows, mode).mapValues { it.value.toArgb() }, emptySet(), stats, lines, null, legend)
    }
}

// ---------------------------------------------------------------- Widgets

/** One widget class per map, so `updateAll` redraws exactly that map's widgets whatever their size. The mode is the widget's own
 *  Glance state, read inside the composition: a running session recomposes on update and never calls provideGlance again. */
abstract class MapWidget(private val kind: MapKind) : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        val world = if (saved != null) Geo.world(context) else null
        provideContent {
            val view = saved?.let { MapData.view(kind, it.first, currentState(MODE)) }
            MapBody(kind, saved, view, world)
        }
    }
}

private val MODE = stringPreferencesKey("mode")

class CyberMapWidget : MapWidget(MapKind.CYBER)
class OutreachMapWidget : MapWidget(MapKind.OUTREACH)
class MarketingMapWidget : MapWidget(MapKind.MARKETING)

fun mapWidget(kind: MapKind): GlanceAppWidget = when (kind) {
    MapKind.CYBER -> CyberMapWidget()
    MapKind.OUTREACH -> OutreachMapWidget()
    MapKind.MARKETING -> MarketingMapWidget()
}

/** The chip in the header: each tap moves a map widget to its next range or metric, kept per widget so two cyber maps can show Live and 30 days. */
class CycleMapMode : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val kind = MapKind.of(parameters[KIND]) ?: return
        updateAppWidgetState(context, glanceId) { it[MODE] = MapData.next(kind, it[MODE]) }
        mapWidget(kind).update(context, glanceId)
    }

    companion object { val KIND = ActionParameters.Key<String>("kind") }
}

// The sizes the launcher's picker offers; every one resizes freely, and the layout follows the size it ends up (MapData.layout).
class CyberMap2x2Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = CyberMapWidget() }
class CyberMap4x2Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = CyberMapWidget() }
class CyberMap4x3Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = CyberMapWidget() }
class CyberMap4x4Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = CyberMapWidget() }
class OutreachMap2x2Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = OutreachMapWidget() }
class OutreachMap4x2Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = OutreachMapWidget() }
class OutreachMap4x3Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = OutreachMapWidget() }
class OutreachMap4x4Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = OutreachMapWidget() }
class MarketingMap2x2Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = MarketingMapWidget() }
class MarketingMap4x2Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = MarketingMapWidget() }
class MarketingMap4x3Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = MarketingMapWidget() }
class MarketingMap4x4Receiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = MarketingMapWidget() }

/** The receiver class for a map widget of a size in the picker ("2x2", "4x2", "4x3", "4x4"). */
fun mapReceiver(kind: MapKind, size: String): Class<*> = when (kind) {
    MapKind.CYBER -> when (size) { "2x2" -> CyberMap2x2Receiver::class.java; "4x3" -> CyberMap4x3Receiver::class.java; "4x4" -> CyberMap4x4Receiver::class.java; else -> CyberMap4x2Receiver::class.java }
    MapKind.OUTREACH -> when (size) { "2x2" -> OutreachMap2x2Receiver::class.java; "4x3" -> OutreachMap4x3Receiver::class.java; "4x4" -> OutreachMap4x4Receiver::class.java; else -> OutreachMap4x2Receiver::class.java }
    MapKind.MARKETING -> when (size) { "2x2" -> MarketingMap2x2Receiver::class.java; "4x3" -> MarketingMap4x3Receiver::class.java; "4x4" -> MarketingMap4x4Receiver::class.java; else -> MarketingMap4x2Receiver::class.java }
}

// ---------------------------------------------------------------- Drawing

@Composable
private fun MapBody(kind: MapKind, saved: Pair<JsonObject, Long>?, view: MapData.View?, world: Geo.World?) {
    val context = LocalContext.current
    val open = Home.open(context, kind.tab)
    if (saved == null) return SignedOut(open, kind.title)
    if (view == null) return Glass(open, kind.title) {
        Text(if (kind == MapKind.CYBER) "The cyber feed is not read yet." else "No country numbers in the last snapshot.", style = TextStyle(color = color(Art.TEXT), fontSize = 13.sp, fontWeight = FontWeight.Medium), maxLines = 2)
        Text("Open Jarvis and pull down to refresh.", style = Muted, maxLines = 2)
    }
    val size = LocalSize.current
    val layout = MapData.layout(size.width.value, size.height.value)
    val iw = size.width - 28.dp
    val ih = size.height - 44.dp
    val chip = @Composable {
        Text(view.modeLabel.uppercase() + " ›", style = TextStyle(color = color(Art.AMBER), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium), maxLines = 1,
            modifier = GlanceModifier.padding(start = 8.dp, bottom = 2.dp).clickable(actionRunCallback<CycleMapMode>(actionParametersOf(CycleMapKind to kind.id))))
    }
    Glass(open, if (layout == MapData.Layout.COMPACT) kind.title.substringBefore(' ') else kind.title, chip) {
        when (layout) {
            MapData.Layout.COMPACT -> {
                val h = minOf(iw / 2, ih - 28.dp).coerceAtLeast(30.dp)
                MapImage(world, view, minOf(iw, h * 2), h)
                Spacer(GlanceModifier.height(4.dp))
                view.stats.firstOrNull()?.let { StatCell(it, iw) }
                Lines(view.lines, ((ih - h - 40.dp).value / 18).toInt().coerceIn(0, 6), iw)
            }
            MapData.Layout.SIDE -> {
                val mw = minOf(iw * 0.55f, ih * 2)
                Row(GlanceModifier.fillMaxWidth()) {
                    MapImage(world, view, mw, mw / 2)
                    Spacer(GlanceModifier.width(10.dp))
                    Column { view.stats.take(2).forEach { StatCell(it, iw - mw - 10.dp) } }
                }
            }
            MapData.Layout.WIDE -> {
                val mw = minOf(iw * 0.55f, ih * 2)
                val rw = iw - mw - 12.dp
                Row(GlanceModifier.fillMaxWidth()) {
                    Column(GlanceModifier.width(mw)) {
                        MapImage(world, view, mw, mw / 2)
                        Spacer(GlanceModifier.height(4.dp))
                        StatRow(view.stats.drop(2).take(2), mw)
                        view.headline?.let { Text(it, style = Muted, maxLines = 1, modifier = GlanceModifier.padding(top = 2.dp)) }
                    }
                    Spacer(GlanceModifier.width(12.dp))
                    Column(GlanceModifier.width(rw)) {
                        StatRow(view.stats.take(2), rw)
                        Lines(view.lines, ((ih.value - 36) / 18).toInt().coerceIn(1, 8), rw)
                    }
                }
            }
            MapData.Layout.STACK -> {
                val h = minOf(iw / 2, ih - 34.dp).coerceAtLeast(40.dp)
                MapImage(world, view, minOf(iw, h * 2), h)
                Spacer(GlanceModifier.height(4.dp))
                StatRow(view.stats.take(3), iw)
            }
            MapData.Layout.FULL -> {
                val h = minOf(iw / 2, ih - 120.dp).coerceAtLeast(60.dp)
                MapImage(world, view, minOf(iw, h * 2), h)
                Spacer(GlanceModifier.height(4.dp))
                StatRow(view.stats.take(2), iw)
                StatRow(view.stats.drop(2).take(2), iw)
                val rows = ((ih - h - 120.dp).value / 18).toInt().coerceIn(1, 6)
                Lines(view.lines, rows, iw)
                val spare = ih.value - h.value - 96 - rows * 18
                if (spare >= 14) view.headline?.let { Text(it, style = Muted, maxLines = 1, modifier = GlanceModifier.padding(top = 3.dp)) }
                if (spare >= 40) Text(view.legend, style = TextStyle(color = color(Art.DIM), fontSize = 9.sp), maxLines = 2, modifier = GlanceModifier.padding(top = 3.dp))
            }
        }
    }
}

private val CycleMapKind = CycleMapMode.KIND

@Composable
private fun MapImage(world: Geo.World?, view: MapData.View, w: Dp, h: Dp) {
    val context = LocalContext.current
    if (world == null) { Text("Drawing the map…", style = Muted, modifier = GlanceModifier.width(w).height(h)); return }
    // Cap the bitmap so a large widget stays inside the RemoteViews memory budget.
    val scale = minOf(1f, 1100f / context.px(w))
    Image(ImageProvider(Art.worldMap(world, (context.px(w) * scale).toInt(), (context.px(h) * scale).toInt(), view.fills, view.pins, Geo.BASE.toArgb())),
        "${view.kind.title}, ${view.modeLabel}", GlanceModifier.width(w).height(h))
}

@Composable
private fun StatCell(stat: MapData.Stat, w: Dp) = Column(GlanceModifier.width(w)) {
    Text(stat.label, style = TextStyle(color = color(Art.MUTED), fontSize = 10.sp), maxLines = 1)
    Text(stat.value, style = TextStyle(color = color(if (stat.alert) Art.PINK else Art.TEXT), fontSize = 16.sp, fontWeight = FontWeight.Bold), maxLines = 1)
}

@Composable
private fun StatRow(stats: List<MapData.Stat>, w: Dp) {
    if (stats.isEmpty()) return
    val cell = (w - 8.dp * (stats.size - 1)) / stats.size
    Row(GlanceModifier.fillMaxWidth().padding(bottom = 2.dp)) {
        stats.forEachIndexed { i, s -> if (i > 0) Spacer(GlanceModifier.width(8.dp)); StatCell(s, cell) }
    }
}

@Composable
private fun Lines(lines: List<MapData.Line>, count: Int, w: Dp) {
    if (count <= 0 || lines.isEmpty()) return
    Column(GlanceModifier.width(w)) {
        lines.take(count).forEach { l ->
            Row(GlanceModifier.fillMaxWidth().height(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(l.label, style = TextStyle(color = color(Art.TEXT), fontSize = 11.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                Text(l.value, style = TextStyle(color = color(if (l.alert) Art.PINK else Art.CYAN), fontSize = 11.sp, fontFamily = FontFamily.Monospace), maxLines = 1)
            }
        }
    }
}
