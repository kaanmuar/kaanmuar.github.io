package com.carlosandmunoz.jarvis.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Jarvis's 90-day targets in the app (#2649): the count since the plan start, the verdict, the rows behind it and the buttons, as on the web. */
object Targets {
    fun word(status: String?) = when (status) { "done" -> "Done"; "on-pace" -> "On pace"; "behind" -> "Behind"; "missed" -> "Missed"; "waiting" -> "Not started"; else -> status.orEmpty() }

    fun tone(status: String?): Color = when (status) { "done" -> J.green; "behind", "missed" -> J.pink; "on-pace" -> J.amber; else -> J.muted }

    /** "On pace · 2.1 a week to go" while the plan runs, else the verdict alone. */
    fun verdict(t: JsonObject?): String {
        val status = t.str("status")
        val pace = if (status == "on-pace" || status == "behind") " · ${fmt(t.num("perWeek"))} a week to go" else ""
        return word(status) + pace + if (t.bool("stale") == true) " · nothing logged in 14 days" else ""
    }

    /** What the toast says after an action; a logged link says whether its page links to us. */
    fun toast(out: JsonObject): String {
        val check = out.obj("check")?.let { c -> if (c.bool("ok") == true) " " + c.str("detail").orEmpty() else " Not counted yet: " + c.str("detail").orEmpty() } ?: ""
        return (out.str("label") ?: "Done") + "." + check
    }

    /** The request body for one action, or null when the text it needs is missing. */
    fun body(action: String, key: String, text: String = "", extra: String = ""): Map<String, Any>? = when (action) {
        "log" -> if (key == "links") (if (text.isBlank()) null else mapOf("action" to "log", "key" to key, "url" to text.trim(), "note" to extra.trim())) else mapOf("action" to "log", "key" to key, "note" to text.trim())
        "correct" -> text.trim().toIntOrNull()?.takeIf { it >= 0 }?.let { mapOf("action" to "correct", "key" to key, "value" to it) }
        "done" -> mapOf("action" to "done", "key" to key, "proof" to text.trim())
        else -> mapOf("action" to action, "key" to key)
    }
}

private fun copyText(context: Context, text: String) {
    (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("link", text))
}

private fun prim(v: Any) = when (v) { is Int -> JsonPrimitive(v); is Boolean -> JsonPrimitive(v); else -> JsonPrimitive(v.toString()) }

@Composable
fun TargetsPanel(s: UiState, vm: JarvisViewModel, id: String) {
    val tg = s.snapshot.obj("external").obj("targets")
    Panel("90-day targets", id = id) {
        if (tg == null || !tg.isOk()) { Muted(tg.str("error") ?: "Pull down to count the 90-day targets."); return@Panel }
        val day = tg.num("day") ?: 0.0
        val length = maxOf(1.0, tg.num("length") ?: 1.0)
        if (day > 0) Muted("Day ${fmt(minOf(day, length))} of ${fmt(length)}: about ${fmt(Math.round(minOf(day, length) / length * 100).toDouble())}% of the 90 days has gone.")
        tg.objs("targets").forEach { t -> TargetRow(t, s, vm) }
        Muted("Jarvis counts from the plan start and judges the pace. Log what he cannot see.")
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TargetRow(t: JsonObject, s: UiState, vm: JarvisViewModel) {
    val key = t.str("key").orEmpty()
    val label = t.str("label").orEmpty()
    val actual = t.num("actual") ?: 0.0
    val target = maxOf(1.0, t.num("target") ?: 1.0)
    val busy = "tg:$key" in s.running
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    var asking by remember(key) { mutableStateOf<String?>(null) }
    var open by rememberSaveable(key) { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    fun send(body: Map<String, Any>) = vm.market("tg:$key", "outreach-target", body.mapValues { (_, v) -> prim(v) }) { Targets.toast(it) }

    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row { Text(label, fontSize = 13.sp, modifier = Modifier.weight(1f)); Text("${fmt(actual)} / ${fmt(t.num("target"))}", fontFamily = Mono, fontSize = 12.sp) }
        GlowBar((actual / target).toFloat().coerceIn(0f, 1f), Targets.tone(t.str("status")))
        Text(Targets.verdict(t), color = Targets.tone(t.str("status")), fontSize = 12.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton({ asking = if (key == "links") "link" else "log" }, enabled = !busy) { Text(if (key == "links") "Log a link" else "Log +1", color = J.cyan, fontSize = 13.sp) }
            TextButton({ asking = "correct" }, enabled = !busy) { Text("Correct", color = J.cyan, fontSize = 13.sp) }
            if (t.obj("done") != null) TextButton({ confirm = PendingAction("stop holding \"$label\" done") { send(Targets.body("undone", key)!!) } }, enabled = !busy) { Text("Undo done", color = J.muted, fontSize = 13.sp) }
            else TextButton({ asking = "done" }, enabled = !busy) { Text("Mark done", color = J.green, fontSize = 13.sp) }
            if (key == "links") TextButton({ send(Targets.body("recheck", key)!!) }, enabled = !busy) { Text("Recheck", color = J.cyan, fontSize = 13.sp) }
            t.objs("next").forEach { n ->
                val copy = n.str("copy")
                TextButton({ if (copy != null) { copyText(context, copy); vm.say("Copied $copy") } else n.str("open")?.let { uri.openUri(it) } }) { Text(n.str("label").orEmpty(), color = J.muted, fontSize = 13.sp) }
            }
            TextButton({ open = !open }) { Text(if (open) "Hide details" else "Details", color = J.muted, fontSize = 13.sp) }
        }
        if (open) {
            Muted(t.str("how").orEmpty() + (t.obj("fix")?.let { " Set to ${fmt(it.num("value"))} on ${it.str("at").orEmpty().take(10)}." } ?: "") +
                (t.obj("done")?.let { " Marked done ${it.str("at").orEmpty().take(10)}" + (it.str("proof")?.takeIf { p -> p.isNotBlank() }?.let { p -> ": $p" } ?: "") + "." } ?: ""))
            val items = t.objs("items")
            if (items.isEmpty()) Muted("Nothing counted yet.")
            items.forEach { i ->
                val id = i.str("id").orEmpty()
                val n = i.num("n") ?: 1.0
                Row {
                    KeyRow(i.str("at").orEmpty().take(10) + " · " + i.str("text").orEmpty() + if (n > 1) " ×${fmt(n)}" else "", "", if (i.str("source") == "failing") J.pink else J.muted, i.str("url")?.takeIf { it.isNotEmpty() })
                }
                if (id.isNotEmpty()) TextButton({ confirm = PendingAction("remove this entry from the count") { send(mapOf("action" to "remove", "key" to key, "id" to id)) } }, enabled = !busy) { Text("Remove", color = J.pink, fontSize = 12.sp) }
            }
        }
    }

    asking?.let { kind ->
        var text by remember(kind) { mutableStateOf(if (kind == "correct") fmt(actual) else "") }
        var extra by remember(kind) { mutableStateOf("") }
        val title = when (kind) { "link" -> "Page that links to us"; "correct" -> "Real count for $label today"; "done" -> "Mark $label done"; else -> "Log one for $label" }
        val hint = when (kind) { "link" -> "https://…"; "correct" -> "New ones add to it"; "done" -> "Proof: a link or a note"; else -> "Who or what was it? (optional)" }
        AlertDialog(
            onDismissRequest = { asking = null },
            title = { Text(title) },
            text = {
                Column {
                    OutlinedTextField(text, { text = it }, label = { Text(hint) }, singleLine = kind != "done", modifier = Modifier.fillMaxWidth())
                    if (kind == "link") OutlinedTextField(extra, { extra = it }, label = { Text("Who is it? (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = { TextButton({ val body = Targets.body(if (kind == "link") "log" else kind, key, text, extra); asking = null; if (body != null) send(body) }) { Text("Save", color = J.cyan) } },
            dismissButton = { TextButton({ asking = null }) { Text("Cancel", color = J.muted) } }
        )
    }
    ConfirmAction(confirm) { confirm = null }
}
