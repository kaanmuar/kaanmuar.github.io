package com.carlosandmunoz.jarvis.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.delay

// ---------------------------------------------------------------- Backdrop

private typealias V3 = Triple<Float, Float, Float>

private val CUBE = listOf(-1f, 1f).flatMap { x -> listOf(-1f, 1f).flatMap { y -> listOf(-1f, 1f).map { z -> V3(x, y, z) } } }
private val CUBE_EDGES = CUBE.indices.flatMap { a -> CUBE.indices.filter { b -> b > a && listOf(CUBE[a].first != CUBE[b].first, CUBE[a].second != CUBE[b].second, CUBE[a].third != CUBE[b].third).count { it } == 1 }.map { a to it } }
private val OCTA = listOf(V3(1f, 0f, 0f), V3(-1f, 0f, 0f), V3(0f, 1f, 0f), V3(0f, -1f, 0f), V3(0f, 0f, 1f), V3(0f, 0f, -1f))
private val OCTA_EDGES = OCTA.indices.flatMap { a -> OCTA.indices.filter { b -> b > a && b != (a xor 1) }.map { a to it } }

/** Wireframe solid, rotated and drawn in perspective, edges fading with depth. */
private fun DrawScope.solid(points: List<V3>, edges: List<Pair<Int, Int>>, center: Offset, radius: Float, ax: Float, ay: Float, color: Color, alpha: Float) {
    val cx = cos(ax); val sx = sin(ax); val cy = cos(ay); val sy = sin(ay)
    val p = points.map { (x, y, z) ->
        val x1 = x * cy + z * sy; val z1 = -x * sy + z * cy
        val y2 = y * cx - z1 * sx; val z2 = y * sx + z1 * cx
        val k = 3.2f / (3.2f + z2)
        Triple(center.x + x1 * radius * k, center.y + y2 * radius * k, z2)
    }
    edges.forEach { (a, b) ->
        val depth = ((p[a].third + p[b].third) / 2 + 1.5f) / 3f
        drawLine(color.copy(alpha = alpha * (1f - depth * 0.75f)), Offset(p[a].first, p[a].second), Offset(p[b].first, p[b].second), strokeWidth = 2f, cap = StrokeCap.Round)
    }
    p.forEach { (x, y, z) -> drawCircle(color.copy(alpha = alpha * (0.9f - (z + 1) * 0.3f)), 3.5f, Offset(x, y)) }
}

/** The page behind every screen: grid lines, drifting glow pools, slow 3D wireframes and the scan line of the web Jarvis. */
@Composable
fun Backdrop(content: @Composable BoxScope.() -> Unit) {
    val t = rememberInfiniteTransition(label = "backdrop")
    val drift by t.animateFloat(0f, 1f, infiniteRepeatable(tween(16000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "drift")
    val spin by t.animateFloat(0f, (2 * Math.PI).toFloat(), infiniteRepeatable(tween(36000, easing = LinearEasing)), label = "spin")
    val scan by t.animateFloat(-0.2f, 1.2f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "scan")
    Box(Modifier.fillMaxSize().background(J.bg)) {
        Canvas(Modifier.fillMaxSize().blur(48.dp)) {
            val w = size.width; val h = size.height
            fun pool(c: Color, x: Float, y: Float, r: Float) = drawCircle(Brush.radialGradient(listOf(c, Color.Transparent), Offset(x, y), r), r, Offset(x, y))
            pool(J.cyan.copy(alpha = 0.30f), w * (0.05f + 0.15f * drift), h * (0.02f + 0.06f * drift), w * 0.85f)
            pool(J.amber.copy(alpha = 0.14f), w * (1.05f - 0.12f * drift), h * (0.30f + 0.08f * drift), w * 0.65f)
            pool(J.violet.copy(alpha = 0.18f), w * (0.25f + 0.2f * drift), h * (0.92f - 0.05f * drift), w * 0.75f)
        }
        Canvas(Modifier.fillMaxSize()) {
            val step = 34.dp.toPx()
            val grid = J.cyan.copy(alpha = 0.045f)
            var x = 0f; while (x < size.width) { drawLine(grid, Offset(x, 0f), Offset(x, size.height)); x += step }
            var y = 0f; while (y < size.height) { drawLine(grid, Offset(0f, y), Offset(size.width, y)); y += step }
            solid(CUBE, CUBE_EDGES, Offset(size.width * 0.84f, size.height * (0.27f + 0.03f * drift)), 30.dp.toPx(), spin * 0.7f + 0.5f, spin, J.cyan, 0.42f)
            solid(OCTA, OCTA_EDGES, Offset(size.width * 0.12f, size.height * (0.62f - 0.04f * drift)), 26.dp.toPx(), -spin, spin * 1.3f, J.violet, 0.45f)
            solid(CUBE, CUBE_EDGES, Offset(size.width * 0.78f, size.height * (0.86f + 0.02f * drift)), 16.dp.toPx(), spin * 1.6f, -spin * 0.8f, J.amber, 0.40f)
            val band = 140.dp.toPx(); val top = scan * size.height
            drawRect(Brush.verticalGradient(listOf(Color.Transparent, J.cyan.copy(alpha = 0.06f), Color.Transparent), top, top + band), Offset(0f, top), Size(size.width, band))
        }
        CompositionLocalProvider(LocalContentColor provides J.text) { content() }
    }
}

// ---------------------------------------------------------------- Glass surfaces

val GlassShape = RoundedCornerShape(12.dp)

/**
 * Frosted panel over the backdrop: outer glow, a lit top-left edge, corner brackets and the
 * short accent bar the web panels carry on their top edge.
 */
fun Modifier.glass(accent: Color = J.cyan, radius: Dp = 12.dp, brackets: Boolean = true, glow: Float = 1f): Modifier = this
    .drawBehind {
        val r = radius.toPx()
        for (i in 1..5) {
            val g = i * 3.dp.toPx()
            drawRoundRect(accent.copy(alpha = 0.014f * glow * (6 - i)), Offset(-g / 2, -g / 2 + i * 1.5f), Size(size.width + g, size.height + g), CornerRadius(r + g / 2), style = Stroke(g))
        }
    }
    .clip(RoundedCornerShape(radius))
    .background(Brush.verticalGradient(listOf(Color(0xC20E2B3D), Color(0xAD061722))))
    .background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.07f), Color.Transparent), Offset.Zero, Offset(600f, 600f)))
    .border(1.dp, Brush.linearGradient(listOf(accent.copy(alpha = 0.65f), J.line, accent.copy(alpha = 0.10f))), RoundedCornerShape(radius))
    .drawWithContent {
        drawContent()
        val a = accent
        drawRoundRect(a, Offset(18.dp.toPx(), 0f), Size(46.dp.toPx(), 2.dp.toPx()), CornerRadius(2f))
        drawRoundRect(a.copy(alpha = 0.25f), Offset(14.dp.toPx(), 0f), Size(54.dp.toPx(), 5.dp.toPx()), CornerRadius(4f))
        if (brackets) {
            val l = 10.dp.toPx(); val i = 4.dp.toPx(); val sw = 1.5.dp.toPx(); val c = a.copy(alpha = 0.7f)
            listOf(Offset(i, i) to Offset(1f, 1f), Offset(size.width - i, i) to Offset(-1f, 1f), Offset(i, size.height - i) to Offset(1f, -1f), Offset(size.width - i, size.height - i) to Offset(-1f, -1f))
                .forEach { (o, d) ->
                    drawLine(c, o, Offset(o.x + l * d.x, o.y), sw, StrokeCap.Square)
                    drawLine(c, o, Offset(o.x, o.y + l * d.y), sw, StrokeCap.Square)
                }
        }
    }

/** Leans toward the finger in 3D while pressed and springs back; never consumes the touch. */
fun Modifier.tilt(max: Float = 7f): Modifier = composed {
    var rx by remember { mutableFloatStateOf(0f) }
    var ry by remember { mutableFloatStateOf(0f) }
    var down by remember { mutableStateOf(false) }
    val ax by animateFloatAsState(rx, spring(0.55f, Spring.StiffnessLow), label = "rx")
    val ay by animateFloatAsState(ry, spring(0.55f, Spring.StiffnessLow), label = "ry")
    val s by animateFloatAsState(if (down) 0.97f else 1f, spring(0.5f, Spring.StiffnessMediumLow), label = "press")
    pointerInput(Unit) {
        awaitEachGesture {
            val first = awaitFirstDown(requireUnconsumed = false)
            fun lean(p: Offset) { ry = ((p.x / size.width) - 0.5f) * 2 * max; rx = -((p.y / size.height) - 0.5f) * 2 * max }
            lean(first.position); down = true
            while (true) {
                val e = awaitPointerEvent()
                val c = e.changes.firstOrNull() ?: break
                if (!c.pressed || c.isConsumed) break
                lean(c.position)
            }
            rx = 0f; ry = 0f; down = false
        }
    }.graphicsLayer { rotationX = ax; rotationY = ay; scaleX = s; scaleY = s; cameraDistance = 16f * density }
}

/** Flips in from below when first laid out, later the lower it sits on screen, so sections cascade in. */
fun Modifier.reveal(): Modifier = composed {
    val p = remember { Animatable(0f) }
    var wait by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(wait) { wait?.let { delay(it); p.animateTo(1f, tween(560, easing = FastOutSlowInEasing)) } }
    onGloballyPositioned { if (wait == null) wait = (it.positionInRoot().y / 7f).toLong().coerceIn(0L, 380L) }
        .graphicsLayer {
            alpha = p.value
            translationY = (1f - p.value) * 48.dp.toPx()
            rotationX = (1f - p.value) * 14f
            transformOrigin = TransformOrigin(0.5f, 0f)
            cameraDistance = 14f * density
        }
}

// ---------------------------------------------------------------- Pieces

private val NUMBER = Regex("""^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$""")

/** Counts a number up from zero the first time it shows, keeping its prefix, suffix, decimals and grouping. */
@Composable
fun CountUp(value: String, content: @Composable (String) -> Unit) {
    val m = NUMBER.find(value)
    val target = m?.groupValues?.get(2)?.replace(",", "")?.toDoubleOrNull()
    if (m == null || target == null) { content(value); return }
    val p = remember(value) { Animatable(0f) }
    LaunchedEffect(value) { p.animateTo(1f, tween(900, easing = FastOutSlowInEasing)) }
    val raw = m.groupValues[2]
    val decimals = raw.substringAfter('.', "").length
    val n = target * p.value
    val body = if (raw.contains(',')) "%,.${decimals}f".format(Locale.US, n) else "%.${decimals}f".format(Locale.US, n)
    content(m.groupValues[1] + body + m.groupValues[3])
}

/** A glowing progress bar that grows in. */
@Composable
fun GlowBar(fraction: Float, color: Color = J.cyan, modifier: Modifier = Modifier) {
    val f = remember { Animatable(0f) }
    LaunchedEffect(fraction) { f.animateTo(fraction.coerceIn(0f, 1f), tween(800, easing = FastOutSlowInEasing)) }
    Canvas(modifier.fillMaxWidth().height(6.dp)) {
        val h = 4.dp.toPx(); val y = (size.height - h) / 2
        drawRoundRect(color.copy(alpha = 0.10f), Offset(0f, y), Size(size.width, h), CornerRadius(h))
        val w = size.width * f.value
        if (w <= 0f) return@Canvas
        drawRoundRect(color.copy(alpha = 0.25f), Offset(0f, 0f), Size(w, size.height), CornerRadius(size.height))
        drawRoundRect(Brush.horizontalGradient(listOf(color.copy(alpha = 0.45f), color), 0f, w), Offset(0f, y), Size(w, h), CornerRadius(h))
    }
}

/** Range and product selector: glass pill that lights up when picked. */
@Composable
fun GlassChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val border by animateColorAsState(if (selected) J.cyan else J.line, tween(250), label = "chip")
    val glow by animateFloatAsState(if (selected) 1f else 0f, tween(300), label = "chipGlow")
    Box(
        Modifier
            .tilt(5f)
            .drawBehind { if (glow > 0f) drawRoundRect(J.cyan.copy(alpha = 0.22f * glow), Offset(-3f, -3f), Size(size.width + 6f, size.height + 6f), CornerRadius(14.dp.toPx())) }
            .clip(RoundedCornerShape(10.dp))
            .background(Brush.verticalGradient(listOf(J.cyan.copy(alpha = 0.06f + 0.18f * glow), J.cyan.copy(alpha = 0.02f + 0.06f * glow))))
            .border(1.dp, border, RoundedCornerShape(10.dp))
            .clickable(remember { MutableInteractionSource() }, null, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Text(label, color = if (selected) J.text else J.muted, fontFamily = Mono, fontSize = 12.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
    }
}

/** Small spinning wireframe cube that marks a section title. */
@Composable
fun CubeGlyph(color: Color = J.cyan, size: Dp = 14.dp) {
    val t = rememberInfiniteTransition(label = "glyph")
    val a by t.animateFloat(0f, (2 * Math.PI).toFloat(), infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "a")
    Canvas(Modifier.size(size)) { solid(CUBE, CUBE_EDGES, center, this.size.minDimension * 0.30f, a * 0.6f + 0.6f, a, color, 1f) }
}

/** The web page's arc reactor: segmented outer ring and a counter-spinning inner ring around a breathing core, filled to the readiness. */
@Composable
fun Reactor(percent: Double?, label: String, size: Dp = 92.dp) {
    val t = rememberInfiniteTransition(label = "reactor")
    val spin by t.animateFloat(0f, 360f, infiniteRepeatable(tween(14000, easing = LinearEasing)), label = "spin")
    val breathe by t.animateFloat(0.55f, 1f, infiniteRepeatable(tween(2200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breathe")
    val fill = remember { Animatable(0f) }
    LaunchedEffect(percent) { fill.animateTo(((percent ?: 0.0) / 100).toFloat().coerceIn(0f, 1f), tween(1200, easing = FastOutSlowInEasing)) }
    val c = if ((percent ?: 0.0) >= 90) J.cyan else if ((percent ?: 0.0) >= 70) J.amber else J.pink
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val r = this.size.minDimension / 2
            drawCircle(Brush.radialGradient(listOf(c.copy(alpha = 0.35f * breathe), Color.Transparent), center, r * 1.15f), r * 1.15f)
            rotate(spin) {
                for (i in 0 until 24) drawArc(c.copy(alpha = if (i % 3 == 0) 0.9f else 0.35f), i * 15f, 9f, false, Offset(center.x - r + 3f, center.y - r + 3f), Size(2 * r - 6f, 2 * r - 6f), style = Stroke(4f))
            }
            val ring = r * 0.82f
            drawCircle(c.copy(alpha = 0.12f), ring, style = Stroke(9f))
            drawArc(c.copy(alpha = 0.30f), -90f, 360f * fill.value, false, Offset(center.x - ring, center.y - ring), Size(2 * ring, 2 * ring), style = Stroke(18f, cap = StrokeCap.Round))
            drawArc(c, -90f, 360f * fill.value, false, Offset(center.x - ring, center.y - ring), Size(2 * ring, 2 * ring), style = Stroke(7f, cap = StrokeCap.Round))
            rotate(-spin * 1.6f) {
                val inner = r * 0.68f
                for (i in 0 until 3) drawArc(c.copy(alpha = 0.6f), i * 120f, 70f, false, Offset(center.x - inner, center.y - inner), Size(2 * inner, 2 * inner), style = Stroke(2.5f, cap = StrokeCap.Round))
            }
            drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.55f * breathe), c.copy(alpha = 0.35f * breathe), Color.Transparent), center, r * 0.42f), r * 0.42f)
        }
        androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CountUp(percent?.let { "${it.toInt()}%" } ?: "—") { Text(it, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = J.text) }
            Text(label, color = J.muted, fontFamily = Mono, fontSize = 9.sp, letterSpacing = 2.sp)
        }
    }
}

/** Glowing status dot; alerts pulse. */
@Composable
fun GlowDot(color: Color, pulse: Boolean = false) {
    val t = rememberInfiniteTransition(label = "dot")
    val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "p")
    Canvas(Modifier.size(12.dp).padding(1.dp)) {
        val r = size.minDimension / 2
        if (pulse) drawCircle(color.copy(alpha = 0.5f * (1 - p)), r * (0.6f + p * 1.1f))
        drawCircle(color.copy(alpha = 0.25f), r)
        drawCircle(color, r * 0.55f)
    }
}

/** Top bars fade into the page so content scrolls under them instead of colliding with the title. */
fun Modifier.topFade(): Modifier = background(Brush.verticalGradient(listOf(J.bg.copy(alpha = 0.96f), J.bg.copy(alpha = 0.82f), Color.Transparent)))
