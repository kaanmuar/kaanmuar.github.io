package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

val ACTION_LABELS = mapOf("rerun-held" to "Send held re-runs", "resend-notices" to "Re-send failed notices", "publish-hub" to "Publish the hub", "run-job" to "Run a job again")
private val CAPS = listOf("rerun-held", "resend-notices", "publish-hub")

/** One action waiting for a yes: what it does, in words, and the call. Shown by [ConfirmAction]. */
data class PendingAction(val ask: String, val run: () -> Unit)

@Composable
fun ConfirmAction(pending: PendingAction?, close: () -> Unit) {
    if (pending == null) return
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Jarvis") },
        text = { Text(pending.ask.replaceFirstChar { it.uppercase() } + "?") },
        confirmButton = { TextButton(onClick = { pending.run(); close() }) { Text("Run") } },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } }
    )
}

/** Runs one action through the jarvis function's action-run op, which logs it to jarvis_actions. */
fun runAction(vm: JarvisViewModel, action: String, job: String? = null, proposal: String? = null) {
    val extra = buildMap {
        put("action", JsonPrimitive(action))
        job?.let { put("job", JsonPrimitive(it)) }
        proposal?.let { put("proposal", JsonPrimitive(it)) }
    }
    vm.act("action:$action:${job ?: ""}", "action-run", extra) { out ->
        (ACTION_LABELS[action] ?: action) + ": " + (out.str("ran")?.let { "$it started" } ?: (fmt(out.num("done")) + " done")) +
            (out.num("failed")?.takeIf { it > 0 }?.let { ", ${fmt(it)} failed" } ?: "") + (out.num("left")?.takeIf { it > 0 }?.let { ", ${fmt(it)} left" } ?: "") + "."
    }
}

fun askFor(action: String, job: String?, pending: JsonObject?): String = when (action) {
    "rerun-held" -> {
        val held = pending.num("held")
        val clean = pending.num("clean") ?: 0.0
        "send ${held?.let { fmt(it) } ?: "every"} held re-run${if (held == 1.0) "" else "s"} to the askers by email" + (if (held != null && held > clean) " (${fmt(held - clean)} not clean)" else "")
    }
    "resend-notices" -> "re-send the failed owner notices (Monday-Saturday 08:00-19:00, inside today's notice budget)"
    "publish-hub" -> "publish the Social hub (run refreshSocialHubStats)"
    else -> "run ${job ?: "the job"} again"
}

/** Systems: what Jarvis did on its own or by a click, today's use of each cap, what waits, and Run now. */
@Composable
fun JarvisActions(s: UiState, vm: JarvisViewModel) {
    val app = LocalContext.current.applicationContext as JarvisApp
    var view by remember { mutableStateOf<JsonObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    LaunchedEffect(s.savedAt, s.running.isEmpty()) {
        if (!s.signedIn || s.email == "fixture" || s.running.isNotEmpty()) return@LaunchedEffect
        runCatching { app.api.call("actions", s.days) }.onSuccess { view = it; error = null }.onFailure { error = it.message }
    }
    ConfirmAction(confirm) { confirm = null }
    val v = view
    val off = v.obj("settings")?.bool("auto") == false
    Panel(if (off) "Jarvis actions (automatic off)" else "Jarvis actions") {
        if (v == null) { Muted(error ?: "Reading the actions log…"); return@Panel }
        val caps = v.obj("settings").obj("caps")
        CAPS.forEach { k -> KeyRow(ACTION_LABELS[k] ?: k, fmt(v.obj("used").num(k)) + " of " + fmt(caps.num(k)) + " today", if ((v.obj("used").num(k) ?: 0.0) >= (caps.num(k) ?: 0.0)) J.amber else J.text) }
        val p = v.obj("pending")
        Muted("Held re-runs: ${fmt(p.num("held"))} (${fmt(p.num("clean"))} clean) · failed notices: ${fmt(p.num("notices"))}" +
            (if (v.bool("noticesLive") != true) " · notices off" else if (v.bool("noticeHours") != true) " · outside notice hours" else ""))
        Row(verticalAlignment = Alignment.CenterVertically) {
            CAPS.forEach { k -> TextButton(onClick = { confirm = PendingAction(askFor(k, null, p)) { runAction(vm, k) } }, enabled = "action:$k:" !in s.running) { Text(ACTION_LABELS[k]!!.substringBefore(' '), fontSize = 12.sp) } }
        }
        v.objs("actions").take(15).forEach { r ->
            val level = when (r.str("status")) { "done" -> "good"; "failed" -> "alert"; else -> "warn" }
            StatusRow(level, (ACTION_LABELS[r.str("action")] ?: r.str("action") ?: "") + (r.str("target")?.takeIf { it.isNotBlank() }?.let { ": $it" } ?: ""),
                listOfNotNull(if (r.str("mode") == "auto") "on its own" else "clicked", r.str("status"), ago(r.str("at")), r.str("detail")?.takeIf { it.isNotBlank() }).joinToString(" · "))
        }
        if (v.objs("actions").isEmpty()) Muted("Nothing yet.")
    }
}

@Composable
fun ProposalActions(p: JsonObject, vm: JarvisViewModel, ask: (PendingAction) -> Unit) {
    val key = p.str("key")
    Column {
        p.str("action")?.let { action -> TextButton(onClick = { ask(PendingAction(askFor(action, null, null)) { runAction(vm, action, proposal = key) }) }) { Text("Run now: " + (ACTION_LABELS[action] ?: action).lowercase(), fontSize = 12.sp) } }
        (p["jobs"] as? kotlinx.serialization.json.JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }?.forEach { job ->
            TextButton(onClick = { ask(PendingAction(askFor("run-job", job, null)) { runAction(vm, "run-job", job, key) }) }) { Text("Run $job again", fontSize = 12.sp) }
        }
    }
}
