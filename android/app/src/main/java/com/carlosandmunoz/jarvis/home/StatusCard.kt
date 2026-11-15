package com.carlosandmunoz.jarvis.home

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import com.carlosandmunoz.jarvis.R
import kotlin.math.roundToInt

/**
 * The status notification as a card (#2691), like One UI's Device info: up to two ring gauges beside labelled bars.
 * Collapsed shows the rings and two bars, or one bar and the [Card.note] when there is one; expanded stacks the rings
 * and adds a third bar and the footer lines.
 */
object StatusCard {
    data class Bar(val label: String, val value: String, val pct: Int, val color: Int)
    data class Ring(val pct: Int, val label: String, val color: Int)
    /** [note]: what must not hide in the collapsed card, such as a process that needs Carlos. */
    data class Card(val rings: List<Ring>, val bars: List<Bar>, val footer: List<String>, val note: String? = null)

    private val RING_BOXES = intArrayOf(R.id.card_ring_box, R.id.card_ring_box2)
    private val RINGS = intArrayOf(R.id.card_ring, R.id.card_ring2)
    private val RING_VALUES = intArrayOf(R.id.card_ring_value, R.id.card_ring_value2)
    private val RING_LABELS = intArrayOf(R.id.card_ring_label, R.id.card_ring_label2)

    private val ROWS = intArrayOf(R.id.card_row1, R.id.card_row2, R.id.card_row3)
    private val LABELS = intArrayOf(R.id.card_label1, R.id.card_label2, R.id.card_label3)
    private val VALUES = intArrayOf(R.id.card_value1, R.id.card_value2, R.id.card_value3)
    private val BARS = intArrayOf(R.id.card_bar1, R.id.card_bar2, R.id.card_bar3)

    fun views(context: Context, card: Card, big: Boolean): RemoteViews {
        val v = RemoteViews(context.packageName, if (big) R.layout.notification_card_big else R.layout.notification_card)
        val note = card.note.takeIf { !big }
        val slots = if (big) 3 else 2
        val rows = if (note != null) 1 else slots
        val px = ((if (big) 64 else 44) * context.resources.displayMetrics.density).roundToInt()
        for (i in RINGS.indices) {
            val r = card.rings.getOrNull(i)
            v.setViewVisibility(RING_BOXES[i], if (r == null) View.GONE else View.VISIBLE)
            if (r == null) continue
            v.setImageViewBitmap(RINGS[i], gauge(r.pct, r.color, px))
            v.setTextViewText(RING_VALUES[i], "${r.pct}%")
            if (big) v.setTextViewText(RING_LABELS[i], r.label)
        }
        for (i in 0 until slots) {
            val b = card.bars.getOrNull(i)?.takeIf { i < rows }
            v.setViewVisibility(ROWS[i], if (b == null) View.GONE else View.VISIBLE)
            if (b == null) continue
            v.setTextViewText(LABELS[i], b.label)
            v.setTextViewText(VALUES[i], b.value)
            v.setProgressBar(BARS[i], 100, b.pct.coerceIn(0, 100), false)
            if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(BARS[i], "setProgressTintList", ColorStateList.valueOf(b.color))
        }
        // Collapsed has room for a footer line only in place of the second bar.
        val footer = note ?: if (big || card.bars.isEmpty()) card.footer.joinToString("\n") else ""
        v.setViewVisibility(R.id.card_footer, if (footer.isEmpty()) View.GONE else View.VISIBLE)
        v.setTextViewText(R.id.card_footer, footer)
        return v
    }

    /** The ring only; the number sits on top as text so it follows the shade's light or dark theme. */
    fun gauge(pct: Int, tint: Int, size: Int): Bitmap {
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val g = Canvas(bmp)
        val stroke = size * 0.08f
        val box = RectF(stroke / 2, stroke / 2, size - stroke / 2, size - stroke / 2)
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; strokeCap = Paint.Cap.ROUND }
        g.drawArc(box, 0f, 360f, false, Paint(line).apply { color = 0x40808080 })
        if (pct > 0) g.drawArc(box, -90f, 360f * pct.coerceIn(0, 100) / 100f, false, line.apply { color = tint })
        return bmp
    }
}
