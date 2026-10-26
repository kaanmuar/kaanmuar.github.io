package com.carlosandmunoz.jarvis.wear

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.remote.interactions.RemoteActivityHelper
import androidx.concurrent.futures.await
import androidx.compose.runtime.remember
import kotlinx.coroutines.launch

/** The watch app: the same summary as the tile, plus the top alert and a button that opens Jarvis on the phone. */
class WatchActivity : ComponentActivity() {
    private var note by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent.getBooleanExtra(EXTRA_OPEN, false)) openOnPhone()
        setContent { MaterialTheme { Screen(note, ::openOnPhone) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN, false)) openOnPhone()
    }

    private fun openOnPhone() {
        val target = Intent(Intent.ACTION_VIEW, Uri.parse("jarvis://open/overview"))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(packageName)
        note = "Opening on your phone…"
        lifecycleScope.launch {
            note = runCatching { RemoteActivityHelper(this@WatchActivity).startRemoteActivity(target).await() }
                .fold({ "Opened on your phone" }, { "Phone not reachable" })
        }
    }

    companion object { const val EXTRA_OPEN = "jarvis.open" }
}

private fun Int.c() = Color(this)

@Composable
private fun Screen(note: String?, open: () -> Unit) {
    val context = LocalContext.current
    var s by remember { mutableStateOf(Store.read(context)) }
    LaunchedEffect(Unit) { Store.pull(context) }
    DisposableEffect(Unit) {
        val prefs = context.getSharedPreferences("jarvis-watch", Context.MODE_PRIVATE)
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> s = Store.read(context) }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    val status = s
    val accent = status?.color ?: Store.CYAN
    Box(
        Modifier.fillMaxSize()
            .background(Brush.radialGradient(listOf(accent.c().copy(alpha = 0.22f), Color(0xFF030B12)), radius = 420f)),
    ) {
        ScalingLazyColumn(
            Modifier.fillMaxSize(),
            state = rememberScalingLazyListState(initialCenterItemIndex = 0),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item { Text("JARVIS", color = Store.CYAN.c(), fontSize = 11.sp, letterSpacing = 3.sp, fontWeight = FontWeight.Bold) }
            item { Ring(status) }
            if (status == null) item {
                Text("Open Jarvis on your phone and sign in. The watch fills in after its next refresh.",
                    color = Store.MUTED.c(), fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 16.dp))
            } else {
                item { Text(status.today, color = Store.TEXT.c(), fontSize = 14.sp, fontWeight = FontWeight.Medium) }
                item { Text(status.headline, color = status.color.c(), fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                status.top?.let { top -> item {
                    Text(top, color = Store.MUTED.c(), fontSize = 12.sp, textAlign = TextAlign.Center, maxLines = 3,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp))
                } }
                item { Text("Updated " + Store.ago(status.at), color = Store.MUTED.c().copy(alpha = 0.7f), fontSize = 11.sp) }
            }
            item {
                Chip(
                    onClick = open,
                    label = { Text("Open on phone", fontWeight = FontWeight.Bold) },
                    secondaryLabel = note?.let { { Text(it) } },
                    colors = ChipDefaults.primaryChipColors(backgroundColor = Store.CYAN.c().copy(alpha = 0.18f), contentColor = Store.CYAN.c()),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun Ring(s: Store.Status?) {
    val color = (s?.color ?: Store.CYAN).c()
    val pct = ((s?.readiness ?: 0.0) / 100).toFloat().coerceIn(0f, 1f)
    Box(Modifier.size(92.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = 7.dp.toPx()
            val box = Size(size.width - w, size.height - w)
            val at = Offset(w / 2, w / 2)
            drawArc(Store.TRACK.c(), 0f, 360f, false, at, box, style = Stroke(w))
            drawArc(color.copy(alpha = 0.35f), -90f, 360f * pct, false, at, box, style = Stroke(w * 2.2f, cap = StrokeCap.Round))
            drawArc(color, -90f, 360f * pct, false, at, box, style = Stroke(w, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(s?.percent ?: "—", color = Store.TEXT.c(), fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text("READY", color = Store.MUTED.c(), fontSize = 9.sp, letterSpacing = 2.sp)
        }
    }
}
