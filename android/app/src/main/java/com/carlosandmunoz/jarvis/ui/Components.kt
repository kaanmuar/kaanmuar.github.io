package com.carlosandmunoz.jarvis.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
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

@Composable
fun Panel(title: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .reveal()
            .glass()
            .animateContentSize(tween(320, easing = FastOutSlowInEasing))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CubeGlyph()
            Spacer(Modifier.width(8.dp))
            Text(title.uppercase(), color = J.cyan, fontFamily = Mono, fontSize = 12.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.SemiBold,
                style = LocalTextStyle.current.copy(shadow = Shadow(J.cyan.copy(alpha = 0.6f), blurRadius = 12f)))
            Spacer(Modifier.width(10.dp))
            Box(Modifier.weight(1f).height(1.dp).background(Brush.horizontalGradient(listOf(J.cyan.copy(alpha = 0.45f), Color.Transparent))))
            trailing?.let { Spacer(Modifier.width(8.dp)); it() }
        }
        content()
    }
}

@Composable
fun Muted(text: String, modifier: Modifier = Modifier) = Text(text, color = J.muted, fontSize = 13.sp, modifier = modifier)

@Composable
fun Kpi(label: String, value: String, delta: String? = null, dir: Int = 0, alert: Boolean = false, modifier: Modifier = Modifier) {
    val edge = if (alert) J.pink else J.cyan
    Column(
        modifier
            .tilt()
            .clip(RoundedCornerShape(8.dp))
            .background(Brush.verticalGradient(listOf(edge.copy(alpha = 0.10f), Color(0x66020A10))))
            .border(1.dp, Brush.linearGradient(listOf(edge.copy(alpha = if (alert) 0.9f else 0.45f), J.line.copy(alpha = 0.15f))), RoundedCornerShape(8.dp))
            .drawBehind {
                drawRect(edge.copy(alpha = 0.22f), Offset.Zero, Size(9.dp.toPx(), size.height))
                drawRect(edge, Offset.Zero, Size(3.dp.toPx(), size.height))
            }
            .padding(start = 14.dp, end = 10.dp, top = 10.dp, bottom = 10.dp)
    ) {
        Text(label.uppercase(), color = J.muted, fontFamily = Mono, fontSize = 10.sp, letterSpacing = 0.8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        CountUp(value) {
            Text(it, color = if (alert) J.pink else J.text, fontSize = 24.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = LocalTextStyle.current.copy(shadow = Shadow(edge.copy(alpha = 0.45f), blurRadius = 16f)))
        }
        if (!delta.isNullOrBlank()) Text(delta, color = when { dir > 0 -> J.green; dir < 0 -> J.pink; else -> J.muted }, fontFamily = Mono, fontSize = 12.sp)
    }
}

/** KPIs in two columns, from the {label, value, delta, dir, alert} objects jarvis-core builds. */
@Composable
fun KpiGrid(kpis: List<JsonObject>) {
    KpiPairs(kpis.map { k -> KpiData(k.str("label") ?: "", k.prim("value").text(), k.str("delta"), k.num("dir")?.toInt() ?: 0, k.prim("alert")?.content == "true") })
}

data class KpiData(val label: String, val value: String, val delta: String? = null, val dir: Int = 0, val alert: Boolean = false)

@Composable
fun KpiPairs(items: List<KpiData>) {
    items.chunked(2).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { Kpi(it.label, it.value, it.delta, it.dir, it.alert, Modifier.weight(1f)) }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
fun BarChart(values: List<Double>, labels: List<String> = emptyList(), color: Color = J.cyan, height: Int = 120) {
    if (values.isEmpty()) { Muted("No data in this range."); return }
    val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
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
fun Sparkline(values: List<Double>, color: Color = J.cyan, modifier: Modifier = Modifier) {
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
fun Ring(percent: Double?, label: String, size: Int = 84) = Reactor(percent, label, size.dp)

@Composable
fun Dot(color: Color) = GlowDot(color, pulse = color == J.pink)

/** A ranked list with proportional bars. */
@Composable
fun TopList(title: String, rows: List<Pair<String, Double>>, limit: Int = 8, format: (Double) -> String = { fmt(it) }) {
    if (rows.isEmpty()) return
    Panel(title) {
        val max = rows.maxOf { it.second }.coerceAtLeast(1.0)
        rows.take(limit).forEach { (label, value) ->
            Column {
                Row {
                    Text(label.ifBlank { "(none)" }, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(format(value), fontFamily = Mono, fontSize = 13.sp, color = J.muted)
                }
                GlowBar((value / max).toFloat())
            }
        }
        if (rows.size > limit) Muted("+${rows.size - limit} more")
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
fun StatusRow(level: String?, title: String, detail: String? = null, url: String? = null) {
    val uri = LocalUriHandler.current
    Row(Modifier.fillMaxWidth().let { if (url != null) it.clickable { runCatching { uri.openUri(url) } } else it }, verticalAlignment = Alignment.Top) {
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
fun Heatmap(grid: List<List<Double>>, peak: String?) {
    if (grid.isEmpty()) return
    val max = grid.flatten().maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
    val days = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    Panel("When people come") {
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
