package com.carlosandmunoz.jarvis.ui

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.UnfoldLess
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.prim
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.text
import kotlinx.serialization.json.JsonObject

val Mono = FontFamily.Monospace

/** Which panels are folded, kept on this phone across launches. */
object Folds {
    private var prefs: SharedPreferences? = null
    private val shut = mutableStateMapOf<String, Boolean>()
    private val seen = mutableSetOf<String>()

    fun load(context: Context) {
        if (prefs != null) return
        prefs = context.applicationContext.getSharedPreferences("jarvis_ui", Context.MODE_PRIVATE).also { p ->
            p.getStringSet("folded", emptySet())?.forEach { shut[it] = true }
        }
    }

    fun seen(key: String) { seen += key }
    fun isShut(key: String) = shut[key] == true
    fun any() = shut.isNotEmpty()
    fun set(key: String, folded: Boolean) { if (folded) shut[key] = true else shut.remove(key); save() }
    fun all(folded: Boolean) { if (folded) seen.forEach { shut[it] = true } else shut.clear(); save() }
    private fun save() { prefs?.edit()?.putStringSet("folded", shut.keys.toSet())?.apply() }
}

/** An icon, so the Briefing header keeps room for its own action in a phone-wide column. */
@Composable
fun FoldAllButton() {
    val open = !Folds.any()
    IconButton(onClick = { Folds.all(open) }, modifier = Modifier.size(36.dp)) {
        Icon(if (open) Icons.Filled.UnfoldLess else Icons.Filled.UnfoldMore, if (open) "Collapse all" else "Expand all", tint = J.cyan, modifier = Modifier.size(20.dp))
    }
}

@Composable
fun Panel(title: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null, key: String = title, content: @Composable ColumnScope.() -> Unit) {
    val context = LocalContext.current
    remember { Folds.load(context) }
    Folds.seen(key)
    val folded = Folds.isShut(key)
    val turn by animateFloatAsState(if (folded) -90f else 0f, tween(200), label = "fold")
    val dense = LocalDense.current
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = if (dense) 7.dp else 14.dp, vertical = if (dense) 5.dp else 8.dp)
            .reveal()
            .glass()
            .animateContentSize(tween(320, easing = FastOutSlowInEasing))
            .padding(horizontal = if (dense) 11.dp else 16.dp, vertical = if (dense) 10.dp else 14.dp),
        verticalArrangement = Arrangement.spacedBy(if (dense) 8.dp else 10.dp)
    ) {
        Row(
            Modifier.clickable(onClickLabel = if (folded) "Expand" else "Collapse") { Folds.set(key, !folded) },
            verticalAlignment = Alignment.CenterVertically
        ) {
            CubeGlyph()
            Spacer(Modifier.width(8.dp))
            Text(title.uppercase(), color = J.cyan, fontFamily = Mono, fontSize = 12.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.SemiBold,
                style = LocalTextStyle.current.copy(shadow = Shadow(J.cyan.copy(alpha = 0.6f), blurRadius = 12f)))
            Spacer(Modifier.width(6.dp))
            Text("▾", color = J.cyan, fontSize = 13.sp, modifier = Modifier.rotate(turn))
            Spacer(Modifier.width(8.dp))
            Box(Modifier.weight(1f).height(1.dp).background(Brush.horizontalGradient(listOf(J.cyan.copy(alpha = 0.45f), Color.Transparent))))
            trailing?.let { Spacer(Modifier.width(8.dp)); it() }
        }
        if (!folded) content()
    }
}

@Composable
fun Muted(text: String, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) = Text(text, color = J.muted, fontSize = 13.sp, modifier = modifier, maxLines = maxLines, overflow = TextOverflow.Ellipsis)

@Composable
fun Kpi(label: String, value: String, delta: String? = null, dir: Int = 0, alert: Boolean = false, modifier: Modifier = Modifier, labelLines: Int = 1,
        open: Boolean = false, onClick: (() -> Unit)? = null) {
    val edge = if (alert) J.pink else J.cyan
    Column(
        modifier
            .let { m -> onClick?.let { m.heightIn(min = 48.dp).clickable(onClickLabel = if (open) "Hide the list" else "List them", onClick = it) } ?: m }
            .tilt()
            .clip(RoundedCornerShape(8.dp))
            .background(Brush.verticalGradient(listOf(edge.copy(alpha = 0.10f), Color(0x66020A10))))
            .border(if (open) 2.dp else 1.dp, if (open) Brush.linearGradient(listOf(J.cyan, J.cyan)) else Brush.linearGradient(listOf(edge.copy(alpha = if (alert) 0.9f else 0.45f), J.line.copy(alpha = 0.15f))), RoundedCornerShape(8.dp))
            .drawBehind {
                drawRect(edge.copy(alpha = 0.22f), Offset.Zero, Size(9.dp.toPx(), size.height))
                drawRect(edge, Offset.Zero, Size(3.dp.toPx(), size.height))
            }
            .padding(start = 14.dp, end = 10.dp, top = 10.dp, bottom = 10.dp)
    ) {
        Text(label.uppercase() + if (onClick == null) "" else if (open) " ▾" else " ▸", color = J.muted, fontFamily = Mono, fontSize = 10.sp, letterSpacing = 0.8.sp, maxLines = labelLines, overflow = TextOverflow.Ellipsis)
        CountUp(value) {
            Text(it, color = if (alert) J.pink else J.text, fontSize = if (LocalDense.current) 19.sp else 24.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = LocalTextStyle.current.copy(shadow = Shadow(edge.copy(alpha = 0.45f), blurRadius = 16f)))
        }
        if (!delta.isNullOrBlank()) Text(delta, color = when { dir > 0 -> J.green; dir < 0 -> J.pink; else -> J.muted }, fontFamily = Mono, fontSize = 12.sp)
    }
}

/** KPIs in two columns, from the {label, value, delta, dir, alert} objects jarvis-core builds. */
@Composable
fun KpiGrid(kpis: List<JsonObject>) {
    KpiPairs(kpis.map(::kpiOf))
}

/** A KPI the snapshot built (label, value, delta, dir, alert). */
fun kpiOf(k: JsonObject) = KpiData(k.str("label") ?: "", k.prim("value").text(), k.str("delta"), k.num("dir")?.toInt() ?: 0, k.prim("alert")?.content == "true")

/** [drill] (#2807): the key a tap on this KPI opens in its panel's drill-down. */
data class KpiData(val label: String, val value: String, val delta: String? = null, val dir: Int = 0, val alert: Boolean = false, val drill: String? = null)

@Composable
fun KpiPairs(items: List<KpiData>, open: String? = null, onDrill: ((String) -> Unit)? = null) {
    items.chunked(2).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { k -> Kpi(k.label, k.value, k.delta, k.dir, k.alert, Modifier.weight(1f), open = k.drill != null && k.drill == open, onClick = if (k.drill != null && onDrill != null) ({ onDrill(k.drill) }) else null) }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

/** Pure arithmetic behind the charts' opt-in titles, axes, legends and tap values (#2807). */
object Charts {
    private val HOUR = Regex("""^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}""")
    private val DAY = Regex("""^\d{4}-\d{2}-\d{2}$""")

    fun withUnit(v: Double, unit: String?): String = fmt(v) + if (unit.isNullOrBlank()) "" else " $unit"

    /** A date or hour as short as an axis needs: 2026-11-03 → 11-03, 2026-11-03T14:00:00Z → 14:00. */
    fun short(label: String): String = when {
        HOUR.containsMatchIn(label) -> label.substring(11, 16)
        DAY.matches(label) -> label.substring(5)
        else -> label
    }

    /** First, middle and last labels, so the x axis never crowds a cover screen. */
    fun ticks(labels: List<String>): List<String> = (if (labels.size <= 2) labels else listOf(labels.first(), labels[labels.size / 2], labels.last())).map(::short)

    /** The value under [x] in a chart [width] wide with [n] values: bars share the width evenly, a line's points sit at i·width/(n−1). */
    fun indexAt(x: Float, width: Float, n: Int, bars: Boolean): Int {
        if (n <= 1 || width <= 0f) return 0
        val i = if (bars) (x / width * n).toInt() else Math.round(x / width * (n - 1))
        return i.coerceIn(0, n - 1)
    }

    fun tip(label: String?, value: Double, unit: String?): String = (label?.takeIf { it.isNotBlank() }?.let { "$it: " } ?: "") + withUnit(value, unit)
}

@Composable
private fun ChartTitle(title: String, color: Color? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        color?.let { Box(Modifier.size(9.dp).clip(RoundedCornerShape(3.dp)).background(it)); Spacer(Modifier.width(6.dp)) }
        Text(title.uppercase(), color = J.muted, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 0.6.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** A colour swatch per series with its name, so a chart says what each colour is. */
@Composable
fun Legend(items: List<Pair<String, Color>>) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        items.forEach { (name, c) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(c))
                Spacer(Modifier.width(5.dp))
                Text(name, color = J.muted, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun ChartTip(text: String?, hint: String) {
    Text(text ?: hint, color = if (text != null) J.text else J.dim, fontFamily = Mono, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite })
}

@Composable
private fun XTicks(labels: List<String>) {
    val ticks = Charts.ticks(labels)
    if (ticks.size < 2) return
    Row(Modifier.fillMaxWidth()) {
        ticks.forEachIndexed { i, t ->
            if (i > 0) Spacer(Modifier.weight(1f))
            Text(t, color = J.dim, fontFamily = Mono, fontSize = 10.sp)
        }
    }
}

/**
 * Bars per day (or hour, or week). #2807, all optional: [title], [yLabel] (the y axis, with its unit), [unit] (after each value),
 * [legend] (the series name, in its colour). With any of them the chart gets a y axis, three x labels and a tap that shows the bar's value;
 * without them it is the chart it always was.
 */
@Composable
fun BarChart(values: List<Double>, labels: List<String> = emptyList(), color: Color = J.cyan, height: Int = 120,
             title: String? = null, yLabel: String? = null, unit: String? = null, legend: String? = null) {
    if (values.isEmpty()) { Muted("No data in this range."); return }
    val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    if (title != null || yLabel != null || unit != null || legend != null) { FramedBars(values, labels, color, height, max, title, yLabel, unit, legend); return }
    Column {
        Row(Modifier.fillMaxWidth()) {
            Text(fmt(max), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
            Spacer(Modifier.weight(1f))
            Text("total " + fmt(values.sum()), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
        }
        val grow = remember(values) { Animatable(0f) }
        LaunchedEffect(values) { grow.animateTo(1f, tween(1000, easing = FastOutSlowInEasing)) }
        Canvas(Modifier.fillMaxWidth().height(height.dp)) {
            listOf(0.25f, 0.5f, 0.75f).forEach { f -> drawLine(J.line.copy(alpha = 0.25f), Offset(0f, size.height * f), Offset(size.width, size.height * f), 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f))) }
            val gap = if (values.size > 60) 1f else 4f
            val w = (size.width - gap * (values.size - 1)) / values.size
            values.forEachIndexed { i, v ->
                val stagger = ((grow.value * 1.5f) - i.toFloat() / values.size * 0.5f).coerceIn(0f, 1f)
                val h = (v / max * size.height).toFloat().coerceAtLeast(if (v > 0) 2f else 0f) * stagger
                if (h <= 0f) return@forEachIndexed
                val x = i * (w + gap)
                drawRoundRect(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.18f)), size.height - h, size.height), Offset(x, size.height - h), Size(w, h), CornerRadius(3f, 3f))
                drawRect(color.copy(alpha = 0.35f), Offset(x - 1f, size.height - h - 3f), Size(w + 2f, 6f))
                drawRect(Color.White.copy(alpha = 0.8f), Offset(x, size.height - h), Size(w, 1.5f))
            }
        }
        if (labels.size >= 2) Row(Modifier.fillMaxWidth()) {
            Text(labels.first(), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
            Spacer(Modifier.weight(1f))
            Text(labels.last(), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
        }
    }
}

@Composable
private fun FramedBars(values: List<Double>, labels: List<String>, color: Color, height: Int, max: Double, title: String?, yLabel: String?, unit: String?, legend: String?) {
    var sel by remember(values) { mutableStateOf<Int?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        title?.let { ChartTitle(it) }
        yLabel?.let { Text("↑ $it", color = J.muted, fontFamily = Mono, fontSize = 10.sp) }
        ChartTip(sel?.let { Charts.tip(labels.getOrNull(it), values[it], unit) }, "Tap a bar for its value")
        Row {
            Column(Modifier.height(height.dp).widthIn(min = 28.dp).padding(end = 4.dp), horizontalAlignment = Alignment.End) {
                Text(fmt(max), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                Text(fmt(max / 2), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
                Spacer(Modifier.weight(1f))
                Text("0", color = J.dim, fontFamily = Mono, fontSize = 10.sp)
            }
            Canvas(Modifier.weight(1f).height(height.dp).pointerInput(values) { detectTapGestures { o -> sel = Charts.indexAt(o.x, size.width.toFloat(), values.size, true) } }) {
                listOf(0f, 0.5f, 1f).forEach { f -> drawLine(J.line.copy(alpha = 0.3f), Offset(0f, size.height * f), Offset(size.width, size.height * f), 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f))) }
                val gap = if (values.size > 60) 1f else 4f
                val w = (size.width - gap * (values.size - 1)) / values.size
                values.forEachIndexed { i, v ->
                    val h = (v / max * size.height).toFloat().coerceAtLeast(if (v > 0) 2f else 0f)
                    val x = i * (w + gap)
                    if (i == sel) drawRect(Color.White.copy(alpha = 0.08f), Offset(x - gap / 2, 0f), Size(w + gap, size.height))
                    if (h > 0f) drawRoundRect(Brush.verticalGradient(listOf(color, color.copy(alpha = if (sel == null || i == sel) 0.25f else 0.1f)), size.height - h, size.height), Offset(x, size.height - h), Size(w, h), CornerRadius(3f, 3f))
                }
            }
        }
        Row { Spacer(Modifier.width(32.dp)); Column(Modifier.weight(1f)) { XTicks(labels) } }
        legend?.let { Legend(listOf("$it · ${Charts.withUnit(values.sum(), unit)} in all" to color)) }
    }
}

/**
 * A small line. #2807, all optional: [title] (shown with the line's colour), [unit], [labels] (one per value: first and last show under it,
 * a tap names the day), [legend]. With any of them a tap shows that point's value; without them it is the bare line it always was.
 */
@Composable
fun Sparkline(values: List<Double>, color: Color = J.cyan, modifier: Modifier = Modifier,
              title: String? = null, unit: String? = null, labels: List<String> = emptyList(), legend: String? = null) {
    if (title != null || unit != null || labels.isNotEmpty() || legend != null) { FramedSpark(values, color, modifier, title, unit, labels, legend); return }
    val draw = remember(values) { Animatable(0f) }
    LaunchedEffect(values) { draw.animateTo(1f, tween(1100, easing = FastOutSlowInEasing)) }
    Canvas(modifier.height(30.dp).fillMaxWidth()) {
        if (values.size < 2) return@Canvas
        val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
        val step = size.width / (values.size - 1)
        val points = values.mapIndexed { i, v -> Offset(i * step, (size.height - 3f - v / max * (size.height - 6f)).toFloat()) }
        val line = Path().apply { points.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
        val area = Path().apply { addPath(line); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
        clipRect(right = size.width * draw.value) {
            drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = 0.30f), Color.Transparent)))
            drawPath(line, color.copy(alpha = 0.3f), style = Stroke(width = 7f, cap = StrokeCap.Round))
            drawPath(line, color, style = Stroke(width = 2.5f, cap = StrokeCap.Round))
        }
        if (draw.value >= 1f) { drawCircle(color.copy(alpha = 0.3f), 7f, points.last()); drawCircle(color, 3.5f, points.last()) }
    }
}

@Composable
private fun FramedSpark(values: List<Double>, color: Color, modifier: Modifier, title: String?, unit: String?, labels: List<String>, legend: String?) {
    var sel by remember(values) { mutableStateOf<Int?>(null) }
    val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        title?.let { ChartTitle(it, color) }
        ChartTip(sel?.let { Charts.tip(labels.getOrNull(it), values[it], unit) }, "0–${Charts.withUnit(max, unit)} · tap for a day's value")
        Canvas(Modifier.fillMaxWidth().height(48.dp).pointerInput(values) { detectTapGestures { o -> sel = Charts.indexAt(o.x, size.width.toFloat(), values.size, false) } }) {
            if (values.size < 2) return@Canvas
            val step = size.width / (values.size - 1)
            val points = values.mapIndexed { i, v -> Offset(i * step, (size.height - 3f - v / max * (size.height - 6f)).toFloat()) }
            val line = Path().apply { points.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
            val area = Path().apply { addPath(line); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
            drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = 0.30f), Color.Transparent)))
            drawPath(line, color, style = Stroke(width = 2.5f, cap = StrokeCap.Round))
            sel?.let { i ->
                drawLine(Color.White.copy(alpha = 0.5f), Offset(points[i].x, 0f), Offset(points[i].x, size.height), 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f)))
                drawCircle(color, 5f, points[i])
            }
        }
        XTicks(labels)
        legend?.let { Legend(listOf((if (unit.isNullOrBlank()) it else "$it ($unit)") to color)) }
    }
}

/** One row of an inline drill-down (#2807): a lead link (#number or branch), its title, a detail, and an optional second link. */
data class DrillRow(val lead: String, val title: String, val meta: String, val url: String?, val extra: Pair<String, String>? = null)

/** What a tapped number, bar or board column opens under itself: its first rows and the GitHub links for the rest. */
data class Drill(val key: String, val title: String, val rows: List<DrillRow>, val links: List<Pair<String, String>>, val empty: String, val more: String? = null)

/** The one inline expander every drill-down uses: shown under its trigger, closed by its × or a second tap on the trigger. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DrillBody(d: Drill?, close: () -> Unit) {
    if (d == null) return
    val uri = LocalUriHandler.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(J.cyan.copy(alpha = 0.05f)).border(1.dp, J.cyan.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .padding(start = 12.dp, end = 4.dp, bottom = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(d.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            IconButton(close, Modifier.size(48.dp)) { Text("×", color = J.muted, fontSize = 20.sp) }
        }
        if (d.rows.isEmpty()) Muted(d.empty)
        d.rows.forEach { r ->
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).let { m -> r.url?.let { u -> m.clickable { runCatching { uri.openUri(u) } } } ?: m }, verticalAlignment = Alignment.CenterVertically) {
                Text(r.lead, color = J.cyan, fontFamily = Mono, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f).padding(vertical = 4.dp)) {
                    if (r.title.isNotBlank()) Text(r.title, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(r.meta, fontSize = 11.sp, color = J.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                r.extra?.let { (label, u) -> TextButton({ runCatching { uri.openUri(u) } }, Modifier.heightIn(min = 48.dp)) { Text(label, color = J.cyan, fontSize = 12.sp) } }
            }
        }
        d.more?.let { Muted(it) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            d.links.forEach { (label, u) -> TextButton({ runCatching { uri.openUri(u) } }, Modifier.heightIn(min = 48.dp)) { Text("$label ↗", color = J.cyan, fontSize = 13.sp) } }
        }
    }
}

@Composable
fun Ring(percent: Double?, label: String, size: Int = 84) = Reactor(percent, label, size.dp)

@Composable
fun Dot(color: Color) = GlowDot(color, pulse = color == J.pink)

/**
 * A ranked list with proportional bars. #2807, all optional: [yLabel] and [unit] head the rows and values, [legend] names the bars in
 * their colour, [onRow] makes each row tappable ([open] is the tapped one) and [footer] shows under the rows, for its drill-down.
 */
@Composable
fun TopList(title: String, rows: List<Pair<String, Double>>, limit: Int = 8,
            yLabel: String? = null, unit: String? = null, legend: String? = null, open: String? = null, onRow: ((String) -> Unit)? = null,
            footer: @Composable ColumnScope.() -> Unit = {}, format: (Double) -> String = { fmt(it) }) {
    if (rows.isEmpty()) return
    Panel(title) {
        val max = rows.maxOf { it.second }.coerceAtLeast(1.0)
        if (yLabel != null || unit != null) Row {
            Text((yLabel ?: "").uppercase(), color = J.muted, fontFamily = Mono, fontSize = 10.sp, modifier = Modifier.weight(1f))
            Text((unit ?: "").uppercase(), color = J.muted, fontFamily = Mono, fontSize = 10.sp)
        }
        rows.take(limit).forEach { (label, value) ->
            val on = onRow != null && open == label
            Column(
                Modifier.let { m -> onRow?.let { m.clip(RoundedCornerShape(8.dp)).heightIn(min = 48.dp).clickable(onClickLabel = if (on) "Hide the list" else "List them") { it(label) } } ?: m }
                    .let { if (on) it.background(J.cyan.copy(alpha = 0.08f)).border(1.dp, J.cyan.copy(alpha = 0.6f), RoundedCornerShape(8.dp)).padding(horizontal = 6.dp) else it },
                verticalArrangement = Arrangement.Center
            ) {
                Row {
                    Text(label.ifBlank { "(none)" } + if (onRow == null) "" else if (on) " ▾" else " ▸", fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(format(value), fontFamily = Mono, fontSize = 13.sp, color = J.muted)
                }
                GlowBar((value / max).toFloat())
            }
        }
        if (rows.size > limit) Muted("+${rows.size - limit} more")
        legend?.let { Legend(listOf("$it · ${Charts.withUnit(rows.sumOf { r -> r.second }, unit)} in all" to J.cyan)) }
        footer()
    }
}

@Composable
fun KeyRow(label: String, value: String, color: Color = J.text, url: String? = null) {
    val uri = LocalUriHandler.current
    Row(Modifier.fillMaxWidth().let { if (url != null) it.clickable { runCatching { uri.openUri(url) } } else it }, verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 13.sp, color = if (url != null) J.cyan else J.text, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.width(8.dp))
        Text(value, fontSize = 13.sp, fontFamily = Mono, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 190.dp))
    }
}

@Composable
fun StatusRow(level: String?, title: String, detail: String? = null, url: String? = null, onClick: (() -> Unit)? = null) {
    val uri = LocalUriHandler.current
    Row(Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else if (url != null) it.clickable { runCatching { uri.openUri(url) } } else it }, verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 4.dp)) { Dot(J.level(level)) }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, color = if (url != null) J.cyan else J.text)
            if (!detail.isNullOrBlank()) Text(detail, fontSize = 12.sp, color = J.muted)
        }
    }
}

/** Weekday × hour grid of visits. */
@Composable
fun Heatmap(grid: List<List<Double>>, peak: String?, title: String = "When people come") {
    if (grid.isEmpty()) return
    val max = grid.flatten().maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
    val days = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    Panel(title) {
        grid.forEachIndexed { d, row ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(days.getOrElse(d) { "" }, fontFamily = Mono, fontSize = 9.sp, color = J.dim, modifier = Modifier.width(30.dp))
                row.forEach { v ->
                    Box(Modifier.weight(1f).height(13.dp).padding(1.dp).clip(RoundedCornerShape(2.dp)).background(J.cyan.copy(alpha = (0.06 + 0.94 * v / max).toFloat())))
                }
            }
        }
        if (!peak.isNullOrBlank()) Muted("Peak: $peak (Bogotá time)")
    }
}

@Composable
fun ActionButton(label: String, running: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = !running, modifier = Modifier.tilt(5f), shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, Brush.linearGradient(listOf(J.cyan.copy(alpha = 0.8f), J.line))),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = J.cyan.copy(alpha = 0.08f), contentColor = J.text)) {
        Text(if (running) "$label…" else label, fontFamily = Mono, fontSize = 12.sp)
    }
}

@Composable
fun Needs(x: JsonObject?) {
    val needs = (x?.get("needs") as? kotlinx.serialization.json.JsonArray)?.map { it.text() } ?: emptyList()
    if (x?.prim("ok")?.content == "false") Text("Down: " + (x.str("error") ?: "failed"), color = J.pink, fontSize = 12.sp)
    needs.forEach { Text("Needs: $it", color = J.amber, fontSize = 12.sp) }
}

@Composable
fun Title(text: String) = Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
