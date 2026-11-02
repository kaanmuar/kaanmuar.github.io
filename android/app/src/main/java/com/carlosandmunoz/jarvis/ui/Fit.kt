package com.carlosandmunoz.jarvis.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.device.Device
import com.carlosandmunoz.jarvis.device.Form
import com.carlosandmunoz.jarvis.device.Posture
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

val LocalForm = compositionLocalOf { Form() }

private tailrec fun Context.activity(): Activity? = when (this) { is Activity -> this; is ContextWrapper -> baseContext.activity(); else -> null }

/** Reads the window and the fold, and hands the form to the API, so every call says what Jarvis runs on (#2068). */
@Composable
fun ProvideForm(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val activity = remember(context) { context.activity() }
    val config = LocalConfiguration.current
    val flow: Flow<WindowLayoutInfo?> = remember(activity) { activity?.let { WindowInfoTracker.getOrCreate(it).windowLayoutInfo(it) } ?: flowOf(null) }
    val layout by flow.collectAsState(null)
    val app = context.applicationContext as? JarvisApp
    val form = remember(activity, config, layout) {
        if (activity == null || app == null) Form()
        else Device.read(activity, layout, { app.vault.flag(it, false) }) { app.vault.setFlag(it, true) }
    }
    SideEffect { app?.api?.device = form.json(app.installId) }
    CompositionLocalProvider(LocalForm provides form, content = content)
}

const val WIDE = "wide"

/**
 * Panels in [columns] columns, each into the shortest so far. A child with Modifier.layoutId(WIDE) spans every column
 * and starts a new band below the tallest one. One column is the same layout, so opening Ask or unfolding keeps each panel's state.
 */
@Composable
fun Masonry(columns: Int, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Layout(content, modifier) { items, constraints ->
        val width = constraints.maxWidth
        val colW = width / columns.coerceAtLeast(1)
        val heights = IntArray(columns.coerceAtLeast(1))
        val placed = items.map { m ->
            if (m.layoutId == WIDE) {
                val top = heights.max()
                val p = m.measure(Constraints(maxWidth = width))
                heights.fill(top + p.height)
                Triple(p, 0, top)
            } else {
                val i = heights.indices.minBy { heights[it] }
                val p = m.measure(Constraints(maxWidth = colW))
                Triple(p, i * colW, heights[i]).also { heights[i] += p.height }
            }
        }
        layout(width, heights.max()) { placed.forEach { (p, x, y) -> p.place(x, y) } }
    }
}

/** Keeps a centred screen off the fold: the upper half in tabletop, the right half when half open like a book. */
@Composable
fun OffTheFold(content: @Composable BoxScope.() -> Unit) {
    val f = LocalForm.current
    val h = f.hinge
    when {
        h != null && f.tabletop -> Box(Modifier.fillMaxWidth().height(h.top.dp), contentAlignment = Alignment.Center, content = content)
        h != null && f.posture == Posture.Book -> Box(Modifier.fillMaxSize().padding(start = h.right.dp), contentAlignment = Alignment.Center, content = content)
        else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center, content = content)
    }
}

/** A bottom sheet stays card-sized on big screens, and right of the fold in book posture. In tabletop it already sits on the lower half. */
@Composable
fun Modifier.sheetFit(): Modifier {
    val f = LocalForm.current
    val h = f.hinge
    return when {
        h != null && f.posture == Posture.Book -> padding(start = h.right.dp).widthIn(max = 560.dp)
        f.tabletop -> widthIn(max = 640.dp)
        else -> widthIn(max = 560.dp)
    }
}

/** Sign-in and lock cards stay phone-sized on wide screens. */
fun Modifier.cardWidth() = widthIn(max = 480.dp)
