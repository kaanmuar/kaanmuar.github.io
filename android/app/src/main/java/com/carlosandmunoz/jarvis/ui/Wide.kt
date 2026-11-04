package com.carlosandmunoz.jarvis.ui

import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInWindow
import kotlinx.coroutines.delay
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.prim
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.text
import kotlinx.serialization.json.JsonObject
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** Smaller cards when a foldable's inner screen or a tablet holds three columns (#2139). */
val LocalDense = compositionLocalOf { false }

/** How many panel columns the tabs have; two or more gets the command deck and list-detail Products. */
val LocalColumns = compositionLocalOf { 1 }

/** The web's SLICES, so a series has the same colour on both. */
val SLICES = listOf(J.cyan, J.violet, J.amber, J.green, J.pink, Color(0xFF7AA2FF), Color(0xFFFF8F5A), J.dim)

/** The deck: readiness, revenue, visits, alerts and uptime from snapshot.wide.deck, in one row when five fit. */
@Composable
fun DeckStrip(deck: List<JsonObject>) {
    if (deck.isEmpty()) return
    val items = deck.map { k -> KpiData(k.str("label") ?: "", k.prim("value").text(), k.str("delta"), k.num("dir")?.toInt() ?: 0, k.prim("alert")?.content == "true") }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (maxWidth >= 520.dp) Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items.forEach { Kpi(it.label, it.value, it.delta, it.dir, it.alert, Modifier.weight(1f).fillMaxHeight(), labelLines = 2) }
        } else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { KpiPairs(items) }
    }
}

/** True when the system turned animations off (Remove animations). */
@Composable
fun stillMotion(): Boolean {
    val context = LocalContext.current
    return remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/**
 * A wireframe globe with a reactor core, turning while it is on screen and the app is in front.
 * Off screen, in the background or with animations off it draws one still frame.
 */
@Composable
fun Hologram(ready: Double?, visits: String, size: Dp = 180.dp) {
    val still = stillMotion()
    var t by remember { mutableFloatStateOf(0.6f) }
    var shown by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(still, shown) {
        if (still || !shown) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            var last = 0L
            while (true) {
                withFrameNanos { n -> if (last != 0L) t += (n - last) / 1e9f; last = n }
                delay(30)
            }
        }
    }
    val c = if ((ready ?: 0.0) >= 90) J.cyan else if ((ready ?: 0.0) >= 70) J.amber else J.pink
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // Its own layer, so a turning frame redraws the globe and not the whole tab.
        Canvas(Modifier.size(size).graphicsLayer().onGloballyPositioned { val b = it.boundsInWindow(); shown = b.width > 0f && b.height > 0f }) {
            val r = this.size.minDimension * 0.36f
            val cx = center.x; val cy = center.y
            val spin = t * 0.5f
            val tiltX = 0.42f
            fun project(lat: Float, lon: Float): Pair<Offset, Float> {
                val x = cos(lat) * sin(lon + spin)
                val y = sin(lat)
                val z = cos(lat) * cos(lon + spin)
                val y2 = y * cos(tiltX) - z * sin(tiltX)
                val z2 = y * sin(tiltX) + z * cos(tiltX)
                return Offset(cx + x * r, cy - y2 * r) to z2
            }
            drawCircle(Brush.radialGradient(listOf(c.copy(alpha = 0.22f), Color.Transparent), center, r * 1.5f), r * 1.5f)
            // Two paths, the far side dim and the near side bright, so a frame is a handful of draw calls.
            val back = Path(); val front = Path()
            fun segment(a: Pair<Offset, Float>, b: Pair<Offset, Float>) {
                val p = if (a.second + b.second > 0) front else back
                p.moveTo(a.first.x, a.first.y); p.lineTo(b.first.x, b.first.y)
            }
            val steps = 36
            val step = 2 * PI.toFloat() / steps
            listOf(-60f, -30f, 0f, 30f, 60f).forEach { d ->
                val lat = d * PI.toFloat() / 180f
                for (i in 0 until steps) segment(project(lat, i * step), project(lat, (i + 1) * step))
            }
            for (m in 0 until 8) {
                val lon = m * PI.toFloat() / 4f
                for (i in 0 until steps / 2) segment(project(-PI.toFloat() / 2 + i * step, lon), project(-PI.toFloat() / 2 + (i + 1) * step, lon))
            }
            drawPath(back, J.cyan.copy(alpha = 0.18f), style = Stroke(1.2f))
            drawPath(front, J.cyan.copy(alpha = 0.75f), style = Stroke(1.6f))
            val orbit = Path().apply {
                for (i in 0..60) {
                    val a = i * 2 * PI.toFloat() / 60
                    val p = Offset(cx + cos(a) * r * 1.35f, cy + sin(a) * r * 0.32f)
                    if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                }
            }
            drawPath(orbit, J.violet.copy(alpha = 0.55f), style = Stroke(1.6f))
            val core = r * 0.34f
            val deg = t * 70f
            drawArc(J.cyan, deg, 110f, false, Offset(cx - core, cy - core), Size(core * 2, core * 2), style = Stroke(3.5f, cap = StrokeCap.Round))
            drawArc(J.amber, -deg * 1.4f + 180f, 80f, false, Offset(cx - core * 0.72f, cy - core * 0.72f), Size(core * 1.44f, core * 1.44f), style = Stroke(3f, cap = StrokeCap.Round))
            drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.9f), c.copy(alpha = 0.6f), Color.Transparent), center, core * 0.55f), core * 0.55f)
            val moon = Offset(cx + cos(t * 0.9f) * r * 1.35f, cy + sin(t * 0.9f) * r * 0.32f)
            drawCircle(J.violet, 3.5f, moon)
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(ready?.let { "${it.toInt()}%" } ?: "—", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = J.text)
            Text(" READY  ", fontFamily = Mono, fontSize = 9.sp, letterSpacing = 1.5.sp, color = J.cyan)
            Text(visits, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = J.text)
            Text(" VISITS", fontFamily = Mono, fontSize = 9.sp, letterSpacing = 1.5.sp, color = J.cyan)
        }
    }
}

/** Several series over the same days, one glowing line each, with a legend. */
@Composable
fun LineChart(series: List<Pair<String, List<Double>>>, labels: List<String> = emptyList(), colors: List<Color> = SLICES, height: Int = 150) {
    val shown = series.filter { it.second.isNotEmpty() }
    if (shown.isEmpty()) { Muted("No data in this range."); return }
    val max = shown.maxOf { s -> s.second.maxOrNull() ?: 0.0 }.coerceAtLeast(1.0)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(fmt(max), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
        Canvas(Modifier.fillMaxWidth().height(height.dp)) {
            listOf(0.25f, 0.5f, 0.75f).forEach { f -> drawLine(J.line.copy(alpha = 0.25f), Offset(0f, size.height * f), Offset(size.width, size.height * f), 1f) }
            shown.forEachIndexed { i, (_, values) ->
                if (values.size < 2) return@forEachIndexed
                val color = colors[i % colors.size]
                val step = size.width / (values.size - 1)
                val line = Path().apply { values.forEachIndexed { k, v -> val p = Offset(k * step, (size.height - 2f - v / max * (size.height - 4f)).toFloat()); if (k == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
                drawPath(line, color.copy(alpha = 0.25f), style = Stroke(6f, cap = StrokeCap.Round))
                drawPath(line, color, style = Stroke(2.2f, cap = StrokeCap.Round))
            }
        }
        if (labels.size >= 2) Row(Modifier.fillMaxWidth()) {
            Text(labels.first(), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
            Spacer(Modifier.weight(1f))
            Text(labels.last(), color = J.dim, fontFamily = Mono, fontSize = 10.sp)
        }
        Legend(shown.mapIndexed { i, (name, values) -> Triple(name, fmt(values.sum()), colors[i % colors.size]) })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Legend(items: List<Triple<String, String, Color>>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        items.forEach { (name, value, color) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(color))
                Spacer(Modifier.width(5.dp))
                Text("$name $value", fontSize = 12.sp, color = J.muted)
            }
        }
    }
}

/** A donut with the total in the middle and a legend with each share. */
@Composable
fun Donut(rows: List<Pair<String, Double>>, unit: String = "") {
    val total = rows.sumOf { it.second }
    if (rows.isEmpty() || total <= 0) { Muted("No data in this range."); return }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (maxWidth < 300.dp) Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) { DonutRing(rows, total, unit); DonutLegend(rows, total) }
        else Row(verticalAlignment = Alignment.CenterVertically) { DonutRing(rows, total, unit); Spacer(Modifier.width(14.dp)); Box(Modifier.weight(1f)) { DonutLegend(rows, total) } }
    }
}

@Composable
private fun DonutRing(rows: List<Pair<String, Double>>, total: Double, unit: String) {
        Box(Modifier.size(96.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(96.dp)) {
                val stroke = 14.dp.toPx()
                val d = size.minDimension - stroke
                var start = -90f
                rows.forEachIndexed { i, (_, v) ->
                    val sweep = (v / total * 360).toFloat()
                    drawArc(SLICES[i % SLICES.size], start, (sweep - 1.5f).coerceAtLeast(0.5f), false, Offset(stroke / 2, stroke / 2), Size(d, d), style = Stroke(stroke))
                    start += sweep
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(fmt(total), fontWeight = FontWeight.Bold, fontSize = 18.sp, color = J.text)
                if (unit.isNotEmpty()) Text(unit, fontFamily = Mono, fontSize = 9.sp, color = J.muted)
            }
        }
}

@Composable
private fun DonutLegend(rows: List<Pair<String, Double>>, total: Double) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            rows.take(8).forEachIndexed { i, (label, v) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(SLICES[i % SLICES.size]))
                    Spacer(Modifier.width(6.dp))
                    Text(label, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(fmt(v), fontFamily = Mono, fontSize = 12.sp, color = J.text)
                    Text("  ${(v / total * 100).toInt()}%", fontFamily = Mono, fontSize = 11.sp, color = J.dim, modifier = Modifier.width(40.dp))
                }
            }
        }
}

/** Funnel stages as bars against the biggest stage; a stage whose source is down says so instead of counting 0. */
@Composable
fun Funnel(steps: List<Pair<String, Double?>>) {
    val top = steps.maxOf { it.second ?: 0.0 }.coerceAtLeast(1.0)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        steps.forEachIndexed { i, (label, v) ->
            val prev = steps.getOrNull(i - 1)?.second
            Column {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(label, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Text(v?.let { fmt(it) } ?: "source down", fontFamily = Mono, fontSize = 13.sp, color = if (v == null) J.amber else J.text)
                    if (v != null && prev != null && prev > 0 && v <= prev) Text("  ${(v / prev * 100).toInt()}%", fontFamily = Mono, fontSize = 11.sp, color = J.dim)
                }
                GlowBar(((v ?: 0.0) / top).toFloat(), SLICES[i % SLICES.size])
            }
        }
    }
}

/** Connections, jobs and CI as small lit tiles, grouped, from snapshot.wide.matrix. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TileMatrix(tiles: List<JsonObject>) {
    tiles.groupBy { it.str("group") ?: "" }.forEach { (group, list) ->
        val good = list.count { it.str("level") == "good" }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(group.uppercase(), fontFamily = Mono, fontSize = 11.sp, letterSpacing = 1.2.sp, color = J.amber, fontWeight = FontWeight.SemiBold)
            Text("  $good of ${list.size} good", fontFamily = Mono, fontSize = 10.sp, color = J.dim)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            list.forEach { t ->
                val level = t.str("level")
                val color = if (level == "off") J.dim else J.level(level)
                Row(Modifier.clip(RoundedCornerShape(8.dp)).background(color.copy(alpha = if (level == "alert") 0.12f else 0.05f))
                    .border(1.dp, color.copy(alpha = if (level == "good" || level == "off") 0.25f else 0.6f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    GlowDot(color, pulse = level == "alert")
                    Spacer(Modifier.width(5.dp))
                    Text(t.str("name") ?: "", fontSize = 12.sp, color = if (level == "off") J.dim else J.text, maxLines = 1)
                }
            }
        }
    }
}

/** 90 days of hourly uptime checks, one cell a day; a day without checks stays empty instead of counting as up. */
@Composable
fun UptimeStrip(days: List<Double?>) {
    if (days.isEmpty()) return
    Canvas(Modifier.fillMaxWidth().height(30.dp)) {
        val gap = 2f
        val w = (size.width - gap * (days.size - 1)) / days.size
        days.forEachIndexed { i, pct ->
            val color = when { pct == null -> J.dim.copy(alpha = 0.25f); pct >= 99.5 -> J.green; pct >= 95 -> J.amber; else -> J.pink }
            drawRoundRect(color, Offset(i * (w + gap), 0f), Size(w, size.height), androidx.compose.ui.geometry.CornerRadius(2f, 2f))
        }
    }
}

/** Panels with nothing to show yet, folded into one row of chips; a tap says why. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NoDataRow(items: List<Pair<String, String>>) {
    if (items.isEmpty()) return
    var open by remember { mutableStateOf<String?>(null) }
    Column(Modifier.layoutId(WIDE).fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)
        .border(1.dp, J.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("NO DATA YET", fontFamily = Mono, fontSize = 10.sp, letterSpacing = 1.5.sp, color = J.dim, modifier = Modifier.align(Alignment.CenterVertically))
            items.forEach { (title, _) ->
                Text(title, fontSize = 12.sp, color = if (open == title) J.text else J.muted, modifier = Modifier.clip(RoundedCornerShape(50))
                    .border(1.dp, if (open == title) J.cyan else J.line, RoundedCornerShape(50)).clickable { open = if (open == title) null else title }
                    .padding(horizontal = 10.dp, vertical = 4.dp))
            }
        }
        items.firstOrNull { it.first == open }?.let { (title, why) -> Text("$title: $why", fontSize = 12.sp, color = J.amber) }
    }
}

/** Collects the panels a screen leaves out for lack of data, for [NoDataRow]. */
class Empties { val items = mutableListOf<Pair<String, String>>(); fun add(title: String, why: String?) { items += title to (why?.takeIf { it.isNotBlank() } ?: "no data in this range") } }

/**
 * A list beside its detail across every column. On a vertical fold the list ends at the crease and the detail starts past it,
 * so nothing sits on the hinge; elsewhere the list takes about a third.
 */
@Composable
fun ListDetail(list: @Composable ColumnScope.() -> Unit, detail: @Composable ColumnScope.() -> Unit) {
    val hinge = LocalForm.current.hinge?.takeIf { it.vertical }
    val density = LocalDensity.current
    var left by remember { mutableFloatStateOf(0f) }
    BoxWithConstraints(Modifier.layoutId(WIDE).fillMaxWidth().onGloballyPositioned { left = with(density) { it.positionInWindow().x.toDp().value } }) {
        val total = maxWidth.value
        val split = hinge?.let { it.left - left }?.takeIf { it in 220f..(total - 280f) }
        val listW = split ?: minOf(300f, total * 0.36f)
        val gap = if (split != null && hinge != null) hinge.right - hinge.left else 0f
        Row {
            Column(Modifier.width(listW.dp), content = list)
            Spacer(Modifier.width(gap.dp))
            Column(Modifier.weight(1f), content = detail)
        }
    }
}
