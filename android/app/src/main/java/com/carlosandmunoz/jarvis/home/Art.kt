package com.carlosandmunoz.jarvis.home

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import kotlin.math.max

/** Widgets cannot draw, so the reactor, sparklines and glow bars are painted into bitmaps in the app's palette. */
object Art {
    const val CYAN = 0xFF38E1FF.toInt()
    const val AMBER = 0xFFFFB547.toInt()
    const val PINK = 0xFFFF4D8D.toInt()
    const val GREEN = 0xFF3DFFA8.toInt()
    const val VIOLET = 0xFFA98BFF.toInt()
    const val TEXT = 0xFFE6F7FF.toInt()
    const val MUTED = 0xFF8FB3C7.toInt()
    const val DIM = 0xFF5D7A8C.toInt()

    fun readinessColor(p: Double?) = when { (p ?: 0.0) >= 90 -> CYAN; (p ?: 0.0) >= 70 -> AMBER; else -> PINK }

    fun level(status: String?) = when (status) {
        "alert", "down", "far-behind", "error" -> PINK
        "warn", "partial", "behind" -> AMBER
        "good", "live", "done", "on-track", "success" -> GREEN
        else -> CYAN
    }

    private fun alpha(color: Int, a: Float) = (color and 0x00FFFFFF) or ((a * 255).toInt().coerceIn(0, 255) shl 24)

    /** The arc reactor: a faint track, the readiness arc with a glow, tick marks and the number in the middle. */
    fun reactor(px: Int, percent: Double?, label: String): Bitmap {
        val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val color = readinessColor(percent)
        val cx = px / 2f
        val r = px * 0.40f
        val stroke = px * 0.055f
        val ring = RectF(cx - r, cx - r, cx + r, cx + r)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
        p.color = alpha(color, 0.07f); p.strokeWidth = px * 0.22f; c.drawCircle(cx, cx, r * 0.9f, p)
        p.color = alpha(color, 0.16f); p.strokeWidth = stroke; c.drawArc(ring, 0f, 360f, false, p)
        val sweep = 360f * ((percent ?: 0.0) / 100).toFloat().coerceIn(0f, 1f)
        p.color = alpha(color, 0.55f); p.strokeWidth = stroke * 2.2f; p.maskFilter = BlurMaskFilter(px * 0.05f, BlurMaskFilter.Blur.NORMAL)
        c.drawArc(ring, -90f, sweep, false, p)
        p.maskFilter = null; p.color = color; p.strokeWidth = stroke; c.drawArc(ring, -90f, sweep, false, p)
        p.strokeWidth = max(1f, px * 0.008f); p.color = alpha(color, 0.45f)
        val inner = r * 0.74f
        for (i in 0 until 36) {
            val a = Math.toRadians(i * 10.0)
            val l = if (i % 3 == 0) inner * 0.86f else inner * 0.92f
            c.drawLine(cx + (inner * Math.cos(a)).toFloat(), cx + (inner * Math.sin(a)).toFloat(), cx + (l * Math.cos(a)).toFloat(), cx + (l * Math.sin(a)).toFloat(), p)
        }
        val t = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        t.color = TEXT; t.textSize = px * 0.21f; t.setShadowLayer(px * 0.04f, 0f, 0f, alpha(color, 0.8f))
        c.drawText(if (percent == null) "—" else "${percent.toInt()}%", cx, cx + px * 0.06f, t)
        t.clearShadowLayer(); t.typeface = Typeface.MONOSPACE; t.color = alpha(color, 0.85f); t.textSize = px * 0.075f; t.letterSpacing = 0.2f
        c.drawText(label, cx, cx + px * 0.18f, t)
        return bmp
    }

    /** A sparkline with a glow line and a fading area under it. */
    fun sparkline(w: Int, h: Int, values: List<Double>, color: Int = CYAN): Bitmap {
        val bmp = Bitmap.createBitmap(max(1, w), max(1, h), Bitmap.Config.ARGB_8888)
        if (values.size < 2) return bmp
        val c = Canvas(bmp)
        val lo = values.min()
        val hi = values.max().let { if (it == lo) lo + 1 else it }
        val pad = h * 0.15f
        val pts = values.mapIndexed { i, v -> (i.toFloat() / (values.size - 1)) * w to (h - pad - ((v - lo) / (hi - lo)).toFloat() * (h - 2 * pad)) }
        val line = Path().apply { pts.forEachIndexed { i, (x, y) -> if (i == 0) moveTo(x, y) else lineTo(x, y) } }
        val area = Path(line).apply { lineTo(w.toFloat(), h.toFloat()); lineTo(0f, h.toFloat()); close() }
        c.drawPath(area, Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = LinearGradient(0f, 0f, 0f, h.toFloat(), alpha(color, 0.35f), alpha(color, 0f), Shader.TileMode.CLAMP) })
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND; strokeCap = Paint.Cap.ROUND }
        p.color = alpha(color, 0.5f); p.strokeWidth = h * 0.09f; p.maskFilter = BlurMaskFilter(h * 0.08f, BlurMaskFilter.Blur.NORMAL); c.drawPath(line, p)
        p.maskFilter = null; p.color = color; p.strokeWidth = max(2f, h * 0.05f); c.drawPath(line, p)
        val (lx, ly) = pts.last()
        c.drawCircle(lx - h * 0.04f, ly, h * 0.07f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
        return bmp
    }

    /** A rounded progress bar with a gradient fill and a soft glow at its head. */
    fun glowBar(w: Int, h: Int, fraction: Double, color: Int): Bitmap {
        val bmp = Bitmap.createBitmap(max(1, w), max(1, h), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val bar = h * 0.5f
        val top = (h - bar) / 2
        val rad = bar / 2
        c.drawRoundRect(RectF(0f, top, w.toFloat(), top + bar), rad, rad, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = alpha(TEXT, 0.08f) })
        val end = (w * fraction.toFloat().coerceIn(0f, 1f)).coerceAtLeast(bar)
        if (fraction > 0) {
            c.drawRoundRect(RectF(0f, top, end, top + bar), rad, rad, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = alpha(color, 0.6f); maskFilter = BlurMaskFilter(h * 0.25f, BlurMaskFilter.Blur.NORMAL)
            })
            c.drawRoundRect(RectF(0f, top, end, top + bar), rad, rad, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = LinearGradient(0f, 0f, end, 0f, alpha(color, 0.45f), color, Shader.TileMode.CLAMP)
            })
        }
        return bmp
    }
}
