package com.carlosandmunoz.jarvis.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** The listening orb: a glowing core that swells with the voice, orbit rings and a waveform halo. */
@Composable
fun VoiceOrb(level: Float, active: Boolean, size: Dp = 64.dp, color: Color = J.cyan) {
    val t = rememberInfiniteTransition(label = "orb")
    val spin by t.animateFloat(0f, 360f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "spin")
    val idle by t.animateFloat(0.25f, 0.45f, infiniteRepeatable(tween(1400), RepeatMode.Reverse), label = "idle")
    val lvl by animateFloatAsState(if (active) level else 0f, spring(stiffness = 300f), label = "level")
    val swell = if (active) 0.35f + lvl * 0.65f else idle
    Canvas(Modifier.size(size)) {
        val c = center
        val r = this.size.minDimension / 2
        drawCircle(Brush.radialGradient(listOf(color.copy(alpha = 0.55f * swell + 0.1f), color.copy(alpha = 0f)), c, r), r, c)
        drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.9f), color, color.copy(alpha = 0.2f)), c, r * (0.22f + 0.14f * swell)), r * (0.22f + 0.14f * swell), c)
        drawArc(color.copy(alpha = 0.7f), spin, 110f, false, Offset(c.x - r * 0.62f, c.y - r * 0.62f), androidx.compose.ui.geometry.Size(r * 1.24f, r * 1.24f), style = Stroke(r * 0.04f))
        drawArc(J.violet.copy(alpha = 0.55f), -spin * 1.4f, 80f, false, Offset(c.x - r * 0.78f, c.y - r * 0.78f), androidx.compose.ui.geometry.Size(r * 1.56f, r * 1.56f), style = Stroke(r * 0.03f))
        val bars = 36
        for (i in 0 until bars) {
            val a = (i * 360f / bars + spin / 3) * PI.toFloat() / 180f
            val wave = (sin(i * 1.7f + spin / 20f) + 1f) / 2f
            val len = r * (0.06f + 0.16f * swell * wave)
            val inner = r * 0.84f
            drawLine(color.copy(alpha = 0.35f + 0.5f * swell), Offset(c.x + inner * cos(a), c.y + inner * sin(a)), Offset(c.x + (inner + len) * cos(a), c.y + (inner + len) * sin(a)), r * 0.025f)
        }
    }
}
