package com.carlosandmunoz.urlreview.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SpearheadBackground = Color(0xFF0E151C)
private val SpearheadSurface = Color(0xFF141D26)
private val SpearheadCyan = Color(0xFF7EF6FB)
private val SpearheadMint = Color(0xFF5DFF9A)
private val SpearheadText = Color(0xFFE8F3F4)
private val SpearheadMuted = Color(0xFF8EA8AE)

private val UrlReviewColorScheme = darkColorScheme(
    primary = SpearheadCyan,
    onPrimary = Color(0xFF041014),
    secondary = SpearheadMint,
    onSecondary = Color(0xFF041014),
    background = SpearheadBackground,
    onBackground = SpearheadText,
    surface = SpearheadSurface,
    onSurface = SpearheadText,
    surfaceVariant = Color(0xFF1A2730),
    onSurfaceVariant = SpearheadMuted,
    outline = Color(0x297ED6E0),
)

@Composable
fun UrlReviewTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = UrlReviewColorScheme,
        content = content,
    )
}