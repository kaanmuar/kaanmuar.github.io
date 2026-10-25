package com.carlosandmunoz.jarvis.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object J {
    val bg = Color(0xFF030B12)
    val panel = Color(0xB8091E2C)
    val line = Color(0x3838E1FF)
    val text = Color(0xFFE6F7FF)
    val muted = Color(0xFF8FB3C7)
    val dim = Color(0xFF5D7A8C)
    val cyan = Color(0xFF38E1FF)
    val amber = Color(0xFFFFB547)
    val pink = Color(0xFFFF4D8D)
    val green = Color(0xFF3DFFA8)
    val violet = Color(0xFFA98BFF)

    fun level(level: String?) = when (level) {
        "alert", "down", "far-behind", "error" -> pink
        "warn", "partial", "behind" -> amber
        "good", "live", "done", "on-track", "success" -> green
        else -> cyan
    }
}

@Composable
fun JarvisTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = J.cyan, onPrimary = J.bg, secondary = J.amber, tertiary = J.violet,
            background = J.bg, onBackground = J.text, surface = Color(0xFF071824), onSurface = J.text,
            surfaceVariant = Color(0xFF0C2433), onSurfaceVariant = J.muted, surfaceContainer = Color(0xFF071824),
            outline = J.line, error = J.pink
        ),
        content = content
    )
}
