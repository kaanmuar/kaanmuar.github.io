package com.carlosandmunoz.jarvis.ui

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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
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
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(J.panel)
            .border(1.dp, J.line, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title.uppercase(), color = J.cyan, fontFamily = Mono, fontSize = 12.sp, letterSpacing = 1.sp, modifier = Modifier.weight(1f))
            trailing?.invoke()
        }
        content()
    }
}

@Composable
fun Muted(text: String, modifier: Modifier = Modifier) = Text(text, color = J.muted, fontSize = 13.sp, modifier = modifier)

@Composable
fun Kpi(label: String, value: String, delta: String? = null, dir: Int = 0, alert: Boolean = false, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(10.dp)).background(Color(0x22000000)).border(1.dp, if (alert) J.pink else J.line, RoundedCornerShape(10.dp)).padding(10.dp)) {
        Text(label.uppercase(), color = J.muted, fontFamily = Mono, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(value, color = if (alert) J.pink else J.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
        Canvas(Modifier.fillMaxWidth().height(height.dp)) {
            val gap = if (values.size > 60) 1f else 3f
            val w = (size.width - gap * (values.size - 1)) / values.size
            values.forEachIndexed { i, v ->
                val h = (v / max * size.height).toFloat().coerceAtLeast(if (v > 0) 2f else 0f)
                drawRoundRect(color, Offset(i * (w + gap), size.height - h), Size(w, h), CornerRadius(2f, 2f))
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
    Canvas(modifier.height(28.dp).fillMaxWidth()) {
        if (values.size < 2) return@Canvas
        val max = (values.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
        val step = size.width / (values.size - 1)
        val path = Path()
        values.forEachIndexed { i, v ->
            val p = Offset(i * step, (size.height - v / max * size.height).toFloat())
            if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y)
        }
        drawPath(path, color, style = Stroke(width = 3f, cap = StrokeCap.Round))
    }
}

@Composable
fun Ring(percent: Double?, label: String, size: Int = 84) {
    Box(Modifier.size(size.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size.dp)) {
            drawArc(J.line, 0f, 360f, false, style = Stroke(10f))
            val p = ((percent ?: 0.0) / 100).coerceIn(0.0, 1.0)
            drawArc(if ((percent ?: 0.0) >= 90) J.green else if ((percent ?: 0.0) >= 70) J.amber else J.pink, -90f, (p * 360).toFloat(), false, style = Stroke(10f, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(percent?.let { "${it.toInt()}%" } ?: "—", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(label, color = J.muted, fontFamily = Mono, fontSize = 9.sp)
        }
    }
}

@Composable
fun Dot(color: Color) = Box(Modifier.size(9.dp).clip(CircleShape).background(color))

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
                LinearProgressIndicator(progress = { (value / max).toFloat() }, modifier = Modifier.fillMaxWidth().height(3.dp), color = J.cyan, trackColor = Color(0x1438E1FF), drawStopIndicator = {})
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
        Box(Modifier.padding(top = 5.dp)) { Dot(J.level(level)) }
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
                    Box(Modifier.weight(1f).height(12.dp).padding(0.5.dp).background(J.cyan.copy(alpha = (0.06 + 0.94 * v / max).toFloat())))
                }
            }
        }
        if (!peak.isNullOrBlank()) Muted("Peak: $peak (Bogotá time)")
    }
}

@Composable
fun ActionButton(label: String, running: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = !running) { Text(if (running) "$label…" else label) }
}

@Composable
fun Needs(x: JsonObject?) {
    val needs = (x?.get("needs") as? kotlinx.serialization.json.JsonArray)?.map { it.text() } ?: emptyList()
    if (x?.prim("ok")?.content == "false") Text("Down: " + (x.str("error") ?: "failed"), color = J.pink, fontSize = 12.sp)
    needs.forEach { Text("Needs: $it", color = J.amber, fontSize = 12.sp) }
}

@Composable
fun Title(text: String) = Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
