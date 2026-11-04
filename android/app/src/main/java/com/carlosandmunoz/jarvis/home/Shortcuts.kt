package com.carlosandmunoz.jarvis.home

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

/** Long-press shortcuts. Published at runtime rather than in XML, so debug builds (".debug" package) get them too. */
object Shortcuts {
    private data class Item(val id: String, val short: String, val long: String, val icon: Int, val tab: String, val action: String?)

    private val ITEMS = listOf(
        Item("brief", "Briefing", "Today's briefing", com.carlosandmunoz.jarvis.R.drawable.sc_brief, "overview", "brief"),
        Item("systems", "Systems", "Systems", com.carlosandmunoz.jarvis.R.drawable.sc_systems, "systems", null),
        Item("sweep", "Sweep", "Sweep reviews", com.carlosandmunoz.jarvis.R.drawable.sc_sweep, "systems", "sweep"),
        Item("outreach", "Outreach", "Outreach", com.carlosandmunoz.jarvis.R.drawable.sc_outreach, "products:outreach", null)
    )

    fun publish(context: Context) {
        val list = ITEMS.mapIndexed { rank, it ->
            ShortcutInfoCompat.Builder(context, it.id)
                .setShortLabel(it.short)
                .setLongLabel(it.long)
                .setIcon(IconCompat.createWithAdaptiveBitmap(badge(context, it.icon)))
                .setIntent(Home.open(context, it.tab, it.action))
                .setRank(rank)
                .build()
        }
        runCatching { ShortcutManagerCompat.setDynamicShortcuts(context, list) }
    }

    fun clear(context: Context) = runCatching { ShortcutManagerCompat.removeAllDynamicShortcuts(context) }

    /** An adaptive icon: the app's deep glass with a cyan glow pool and the glyph in the safe zone. */
    private fun badge(context: Context, res: Int): Bitmap {
        val px = (108 * context.resources.displayMetrics.density).toInt()
        val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(0xFF06141E.toInt())
        c.drawCircle(px / 2f, px / 2f, px * 0.5f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(px / 2f, px * 0.4f, px * 0.5f, 0x5538E1FF, 0x0038E1FF, Shader.TileMode.CLAMP)
        })
        val glyph = ContextCompat.getDrawable(context, res) ?: return bmp
        val g = (px * 0.36f).toInt()
        val o = (px - g) / 2
        glyph.setBounds(o, o, o + g, o + g)
        glyph.draw(c)
        return bmp
    }
}
