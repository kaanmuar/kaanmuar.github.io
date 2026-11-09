package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.Processes
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.str
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject

private fun stateColor(row: JsonObject): Color = when {
    row.bool("needsYou") == true -> J.amber
    row.str("state") == "running" -> J.cyan
    row.str("state") == "waiting" || row.str("state") == "queued" -> J.amber
    row.str("state") == "done" -> J.green
    row.str("state") == "failed" -> J.pink
    else -> J.dim
}

/** Live processes (#2548): running first with their step, progress and a ticking clock; what needs Carlos in amber
    with its link; then what ended in the last day. A processes push redraws it within seconds; while something runs
    and no push comes, [poll] asks again every minute. */
@Composable
fun ProcessesPanel(p: JsonObject?, modifier: Modifier = Modifier, compact: Boolean = false, poll: (() -> Unit)? = null) {
    val active = Processes.active(p)
    val recent = Processes.recent(p)
    if (compact && active.isEmpty()) return
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val live = active.isNotEmpty()
    LaunchedEffect(live) { while (live) { now = System.currentTimeMillis(); delay(1000) } }
    LaunchedEffect(live, poll) { while (live && poll != null) { delay(60_000); poll() } }
    var all by remember { mutableStateOf(false) }
    val summary = Processes.summary(p)
    Panel("Processes", modifier, key = if (compact) "Processes now" else "Processes", trailing = {
        if (summary != null) Text(summary, fontFamily = Mono, fontSize = 12.sp, color = if (Processes.needsYou(p) > 0) J.amber else J.cyan, maxLines = 1)
    }) {
        if (p == null) { Muted("Waiting for the first processes from Jarvis…"); return@Panel }
        if (active.isEmpty()) Muted("Nothing running now. Jobs, workflows, deploys, reviews, Cube runs and agents show here as they start.")
        active.take(if (compact) 3 else 40).forEach { ProcessRow(it, now) }
        if (compact) {
            if (active.size > 3) Muted("${active.size - 3} more on Systems")
            return@Panel
        }
        if (recent.isNotEmpty()) {
            Text("LAST 24 HOURS", fontFamily = Mono, fontSize = 11.sp, color = J.dim, letterSpacing = 1.2.sp, modifier = Modifier.padding(top = 4.dp))
            recent.take(if (all) recent.size else 8).forEach { ProcessRow(it, now) }
            if (recent.size > 8) TextButton(onClick = { all = !all }) { Text(if (all) "Fewer" else "All ${recent.size}", fontSize = 12.sp) }
        }
    }
}

@Composable
private fun ProcessRow(row: JsonObject, now: Long) {
    val uri = LocalUriHandler.current
    val url = row.str("url")?.takeIf { it.startsWith("https://") }
    val needs = row.bool("needsYou") == true
    val color = stateColor(row)
    val kind = Processes.KINDS[row.str("kind")] ?: row.str("kind").orEmpty()
    val state = Processes.STATES[row.str("state")] ?: row.str("state").orEmpty()
    Row(
        Modifier.fillMaxWidth()
            .let { if (needs) it.background(J.amber.copy(alpha = 0.08f), RoundedCornerShape(10.dp)).border(1.dp, J.amber.copy(alpha = 0.55f), RoundedCornerShape(10.dp)).padding(8.dp) else it }
            .let { if (url != null && !needs) it.clickable { runCatching { uri.openUri(url) } } else it },
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.padding(top = 4.dp)) { GlowDot(color, pulse = row.str("state") == "running" || needs) }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(row.str("name").orEmpty(), fontSize = 14.sp, color = if (url != null) J.cyan else J.text, fontWeight = if (needs) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(listOf(if (needs) "Needs you" else state, kind, row.str("step").orEmpty(), Processes.took(row).orEmpty()).filter { it.isNotBlank() }.joinToString(" · "),
                fontSize = 12.sp, color = if (needs) J.amber else J.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            row.num("progress")?.let { LinearProgressIndicator(progress = { it.toFloat() }, modifier = Modifier.fillMaxWidth().height(3.dp).padding(top = 2.dp), color = color, trackColor = J.line) }
            if (needs && url != null) OutlinedButton(onClick = { runCatching { uri.openUri(url) } }, border = BorderStroke(1.dp, J.amber), shape = RoundedCornerShape(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                Text("Open", fontFamily = Mono, fontSize = 12.sp, color = J.amber)
            }
        }
        Spacer(Modifier.width(8.dp))
        Text(Processes.clock(row, now), fontFamily = Mono, fontSize = 12.sp, color = if (row.str("state") in Processes.ACTIVE) color else J.dim, maxLines = 1)
    }
}
