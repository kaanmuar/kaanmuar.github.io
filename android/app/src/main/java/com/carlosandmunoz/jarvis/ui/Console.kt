package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.str
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Jarvis > Console (#2810): the log op's lines from jarvis_log, the same sources, levels and filter as the web console. */
object Console {
    val SOURCES = listOf("jarvis", "function", "actions", "mac", "board", "github", "gemini", "push", "countdown")
    val LEVELS = listOf("debug", "info", "warn", "error")
    const val KEEP = 2000
    const val EVERY_MS = 5000L
    private val ZONE: ZoneId = ZoneId.of("America/Bogota")
    private val CLOCK = DateTimeFormatter.ofPattern("HH:mm:ss", Locale.US)
    private val DAY = DateTimeFormatter.ofPattern("MMM d", Locale.US)

    /** sources empty = every source; level = the lowest shown; every word of q must be in the text, source or ref. */
    fun filter(rows: List<JsonObject>, sources: Set<String>, level: String, q: String): List<JsonObject> {
        val min = LEVELS.indexOf(level).coerceAtLeast(0)
        val words = q.lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }
        return rows.filter { r ->
            val hay = ((r.str("text") ?: "") + " " + (r.str("source") ?: "") + " " + (r.str("ref") ?: "")).lowercase()
            (sources.isEmpty() || r.str("source") in sources) && LEVELS.indexOf(r.str("level")).coerceAtLeast(0) >= min && words.all { it in hay }
        }
    }

    /** New lines into the kept ones: none twice (by id), newest first, at most [keep]. */
    fun merge(old: List<JsonObject>, fresh: List<JsonObject>, keep: Int = KEEP): List<JsonObject> {
        val seen = old.mapNotNull { it.str("id") }.toHashSet()
        val add = fresh.filter { r -> r.str("id")?.let { seen.add(it) } == true }
        if (add.isEmpty()) return old
        return (add + old).sortedByDescending { it.str("at") ?: "" }.take(keep)
    }

    /** Bogotá clock time; another day's line also says its day. */
    fun time(iso: String?, now: Long = System.currentTimeMillis()): String {
        val at = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
        val t = at.atZone(ZONE)
        val today = Instant.ofEpochMilli(now).atZone(ZONE).toLocalDate()
        return (if (t.toLocalDate() == today) "" else DAY.format(t) + " ") + CLOCK.format(t)
    }

    fun levelColor(level: String?): Color = when (level) { "error" -> J.pink; "warn" -> J.amber; "info" -> J.cyan; else -> J.dim }

    fun sourceColor(source: String?): Color = when (source) {
        "actions" -> J.green; "board" -> J.amber; "gemini" -> Color(0xFFFF9BE0); "function" -> J.cyan; "mac" -> Color(0xFFB8F1FF)
        "push" -> Color(0xFFFFD88A); "countdown" -> Color(0xFFFF8A65); "github" -> Color(0xFF9FB8FF); else -> J.violet
    }
}

@Composable
private fun Pill(label: String, on: Boolean, color: Color = J.cyan, click: () -> Unit) {
    Text(label, fontFamily = Mono, fontSize = 12.sp, color = if (on) J.bg else color, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
        modifier = Modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) J.cyan else Color.Transparent)
            .border(1.dp, if (on) J.cyan else J.line, RoundedCornerShape(18.dp)).clickable(onClick = click).padding(horizontal = 12.dp, vertical = 9.dp))
}

/** Polls the log op every 5 s while it is on screen and the app is in front; Pause holds the lines it shows. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ConsoleScreen(s: UiState, vm: JarvisViewModel) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(Unit) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { while (true) { vm.pullLog(); delay(Console.EVERY_MS) } } }
    var picked by rememberSaveable { mutableStateOf("") }
    var level by rememberSaveable { mutableStateOf("debug") }
    var q by rememberSaveable { mutableStateOf("") }
    var paused by rememberSaveable { mutableStateOf(false) }
    var held by remember { mutableStateOf<List<JsonObject>?>(null) }
    val sources = picked.split(',').filter { it.isNotEmpty() }.toSet()
    val rows = if (paused) held ?: s.log else s.log
    val shown = remember(rows, picked, level, q) { Console.filter(rows, sources, level, q).take(600).reversed() }
    val waiting = if (paused) (s.log.size - rows.size).coerceAtLeast(0) else 0
    val list = rememberLazyListState()
    val open = LocalUriHandler.current
    val tall = (LocalConfiguration.current.screenHeightDp * 0.62f).coerceIn(320f, 900f)
    LaunchedEffect(shown.size, paused) { if (!paused && shown.isNotEmpty()) list.scrollToItem(shown.lastIndex) }

    Panel("Console", Modifier.layoutId(WIDE), trailing = {
        Text(if (paused) "paused" + (if (waiting > 0) " · $waiting new" else "") else "live · 5 s", fontFamily = Mono, fontSize = 11.sp, color = if (paused) J.amber else J.green)
    }) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val wide = maxWidth.value >= 600f
            val chips = @Composable {
                Pill("all", sources.isEmpty()) { picked = "" }
                Console.SOURCES.forEach { src -> Pill(src, src in sources, Console.sourceColor(src)) { picked = (if (src in sources) sources - src else sources + src).joinToString(",") } }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (wide) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { chips() }
                else Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) { chips() }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Console.LEVELS.forEachIndexed { i, l -> Pill(l + if (i < Console.LEVELS.lastIndex) "+" else "", level == l, Console.levelColor(l)) { level = l } }
                    Spacer(Modifier.width(4.dp))
                    Pill(if (paused) "Resume" else "Pause", paused, J.amber) { if (paused) { paused = false; held = null } else { held = s.log; paused = true } }
                }
                OutlinedTextField(q, { q = it }, label = { Text("Search the log") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                LazyColumn(Modifier.fillMaxWidth().height(tall.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFF01070C)).border(1.dp, J.line, RoundedCornerShape(10.dp)), state = list) {
                    if (shown.isEmpty()) item {
                        Text(when { s.logError != null && s.log.isEmpty() -> "The log did not load: " + s.logError; s.log.isEmpty() -> "Reading the log…"; else -> "No line matches these filters." },
                            fontFamily = Mono, fontSize = 12.sp, color = J.dim, modifier = Modifier.padding(12.dp))
                    }
                    items(shown, key = { it.str("id") ?: it.hashCode().toString() }) { r -> LogLine(r, wide) { u -> runCatching { open.openUri(u) } } }
                }
                Text((s.logError?.let { "Last read failed: $it · " } ?: "") + "${shown.size} of ${s.log.size} lines · Bogotá time · 7 days kept", fontFamily = Mono, fontSize = 11.sp, color = J.dim)
            }
        }
    }
}

@Composable
private fun LogLine(r: JsonObject, wide: Boolean, open: (String) -> Unit) {
    val level = r.str("level")
    val url = r.str("url")
    val tone = when (level) { "error" -> J.pink; "warn" -> J.amber; "debug" -> Color(0xFF7F9CAD); else -> Color(0xFFC9E4F2) }
    val head = @Composable {
        Text(Console.time(r.str("at")), fontFamily = Mono, fontSize = 12.sp, color = J.dim)
        Spacer(Modifier.width(8.dp))
        Text(r.str("source") ?: "", fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Console.sourceColor(r.str("source")), modifier = if (wide) Modifier.width(78.dp) else Modifier)
        Spacer(Modifier.width(8.dp))
        Text((level ?: "").uppercase(), fontFamily = Mono, fontSize = 12.sp, color = Console.levelColor(level), modifier = if (wide) Modifier.width(48.dp) else Modifier)
    }
    val body = Modifier.fillMaxWidth().background(if (level == "error") J.pink.copy(alpha = 0.06f) else Color.Transparent)
        .let { if (url != null) it.clickable(onClickLabel = "Open") { open(url) } else it }.padding(horizontal = 10.dp, vertical = 4.dp)
    if (wide) Row(body) { head(); Spacer(Modifier.width(8.dp)); Text(r.str("text") ?: "", fontFamily = Mono, fontSize = 12.sp, color = tone, modifier = Modifier.weight(1f)) }
    else Column(body) { Row(verticalAlignment = Alignment.CenterVertically) { head() }; Text(r.str("text") ?: "", fontFamily = Mono, fontSize = 12.sp, color = tone) }
}
