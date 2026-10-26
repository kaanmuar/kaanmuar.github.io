package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject

/** Social hub (#1420): the queue per channel, the posting workflows with Post now, and field-sweep proposals. */
@Composable
fun SocialHub(s: UiState, vm: JarvisViewModel) {
    LaunchedEffect(Unit) { if (s.proposals == null) vm.loadSocial() }
    val uri = LocalUriHandler.current
    val queue = s.snapshot.obj("external").obj("social").objs("queue")
    Panel("Queue by channel") {
        if (queue.isEmpty()) Muted("Pull down to read the Buffer and Facebook ledgers.")
        queue.forEach { c -> Channel(c) }
    }

    var confirm by remember { mutableStateOf(false) }
    Panel("Posting") {
        val runs = s.runs.orEmpty()
        if (runs.isEmpty()) Muted(if ("social" in s.running) "Reading the workflow runs…" else "No runs to show.")
        runs.forEach { r ->
            val running = r.str("status").let { it != null && it != "completed" && it.isNotEmpty() }
            val result = r.str("conclusion").orEmpty()
            val color = when { running -> J.amber; result == "success" -> J.green; result.isEmpty() -> J.muted; else -> J.pink }
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(r.str("name").orEmpty(), fontWeight = FontWeight.Medium)
                    Muted(listOfNotNull(ago(r.str("at")), r.str("event")).joinToString(" · ").ifEmpty { "never ran" })
                }
                TextButton({ r.str("url")?.takeIf { it.startsWith("https://") }?.let(uri::openUri) }) {
                    Text(if (running) "running" else result.replace('_', ' ').ifEmpty { "—" }, color = color, fontSize = 13.sp)
                }
            }
        }
        Muted("Post now runs the Buffer queue (batches a spent daily limit held back) and the Facebook Page queue instead of waiting for tonight.")
        ActionButton("Post now", "post-now" in s.running) { confirm = true }
    }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text("Run the posting queues now?") },
        text = { Text("Starts the Buffer and Facebook Page workflows on GitHub.") },
        confirmButton = { TextButton({ vm.postNow(); confirm = false }) { Text("Run", color = J.cyan) } },
        dismissButton = { TextButton({ confirm = false }) { Text("Cancel", color = J.muted) } },
        containerColor = J.bg,
    )

    val proposals = s.proposals.orEmpty()
    Panel("Post proposals" + if (proposals.isNotEmpty()) " (${proposals.size})" else "") {
        if (s.proposals == null) Muted("Reading the field sweep proposals…")
        else if (proposals.isEmpty()) Muted("No proposals are waiting.")
        else Muted("Approve adds it to the hub as a pick; the next daily build publishes it.")
        proposals.forEach { p -> Proposal(p, "social:${p.str("id")}" in s.running, vm) }
    }
}

@Composable
private fun Channel(c: JsonObject) {
    val next = c.objs("next")
    val failed = c.num("failed")?.toInt() ?: 0
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.width(92.dp)) {
            Text(c.str("name").orEmpty(), fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("${c.num("scheduled")?.toInt() ?: 0} queued", color = J.cyan, fontSize = 11.sp)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (next.isEmpty()) Text("Nothing scheduled", color = J.dim, fontSize = 12.sp)
            next.take(2).forEach { n ->
                Text((ago(n.str("at")) ?: "") + " · " + n.str("post").orEmpty().substringAfterLast('/'), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            val sent = c.num("sent")?.toInt() ?: 0
            Text("$sent sent" + (if (failed > 0) " · $failed failed" else "") + (c.obj("last")?.str("at")?.let { " · last " + (ago(it) ?: "").lowercase() } ?: ""),
                color = if (failed > 0) J.amber else J.muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun Proposal(p: JsonObject, busy: Boolean, vm: JarvisViewModel) {
    val uri = LocalUriHandler.current
    val id = p.str("id").orEmpty()
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(p.str("title").orEmpty(), fontWeight = FontWeight.Bold, fontSize = 14.sp)
        Text(listOfNotNull(p.str("source"), p.str("author")?.takeIf { it.isNotBlank() }?.let { "by $it" }, p.str("topic")?.takeIf { it.isNotBlank() }, p.str("lang")).joinToString(" · "), color = J.dim, fontSize = 11.sp)
        p.str("summary")?.takeIf { it.isNotBlank() }?.let { Text(it, color = J.muted, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis) }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton({ vm.decideSocial(id, "approved") }, enabled = !busy) { Text("Approve", color = J.cyan, fontWeight = FontWeight.Bold) }
            TextButton({ vm.decideSocial(id, "dismissed") }, enabled = !busy) { Text("Dismiss", color = J.muted) }
            p.str("url")?.takeIf { it.startsWith("https://") }?.let { link -> TextButton({ uri.openUri(link) }) { Text("Read →", color = J.cyan) } }
        }
    }
}
