package com.carlosandmunoz.jarvis.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private val ISO = Regex("^\\d{4}-\\d{2}-\\d{2}T")
private val TABS = mapOf("overview" to "Overview", "business" to "Business", "traffic" to "Traffic", "systems" to "Systems")

/** A briefing line's sheet (#1695): what it is about, the numbers behind it, what can be done, Gemini, snooze and share.
 *  The detail comes with the line from the snapshot (jarvis-core briefDetail); hidden lines carry status and until. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun BriefSheet(item: JsonObject, s: UiState, vm: JarvisViewModel, open: (String) -> Unit, close: () -> Unit) {
    val app = LocalContext.current.applicationContext as JarvisApp
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val key = item.str("key") ?: ""
    val text = item.str("text") ?: ""
    val level = item.str("level")
    val d = item.obj("detail")
    val list = d.str("list")
    val hiddenUntil = item.str("until")
    var rows by remember(key) { mutableStateOf<JsonObject?>(null) }
    var rowsError by remember(key) { mutableStateOf<String?>(null) }
    var ai by remember(key) { mutableStateOf<String?>(null) }
    var busy by remember(key) { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    val facts = d.objs("facts")
    val links = d.objs("links")
    val actions = d.objs("actions")
    val tab = d.str("tab")
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    suspend fun call(op: String, extra: Map<String, JsonElement>) = app.api.call(op, s.days, extra)
    fun loadRows() = scope.launch {
        runCatching { call("brief-items", mapOf("list" to JsonPrimitive(list))) }.onSuccess { rows = it; rowsError = null }.onFailure { rowsError = it.message }
    }
    LaunchedEffect(key) { if (list != null && s.email != "fixture") loadRows() }

    val shareText = (listOf("[$level] $text") + facts.map { "- " + it.str("label") + ": " + it.str("value") } + links.map { (it.str("label") ?: "").removeSuffix(" ↗") + ": " + it.str("url") }).joinToString("\n")

    fun mark(status: String) = scope.launch {
        busy = true
        runCatching { call("brief-mark", mapOf("key" to JsonPrimitive(key), "status" to JsonPrimitive(status), "text" to JsonPrimitive(text))) }
            .onSuccess { vm.refresh(); close() }
            .onFailure { vm.say("Not saved: " + (it.message ?: "failed")) }
        busy = false
    }

    fun decide(ids: List<String>, decision: String) = scope.launch {
        runCatching { call("rating-decide", mapOf("ids" to JsonArray(ids.map { JsonPrimitive(it) }), "decision" to JsonPrimitive(decision))) }
            .onSuccess { out ->
                val done = (out.num("done") ?: 0.0).toInt()
                vm.say("$done rating${if (done == 1) "" else "s"} " + if (decision == "rejected") "rejected." else "approved.")
                loadRows()
            }
            .onFailure { vm.say("Not saved: " + (it.message ?: "failed")) }
    }

    ConfirmAction(confirm) { confirm = null }
    ModalBottomSheet(onDismissRequest = close, sheetState = sheet, containerColor = J.bg) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).navigationBarsPadding()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Dot(J.level(level))
                Spacer(Modifier.width(8.dp))
                Text(d.str("title") ?: text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = J.text)
            }
            Spacer(Modifier.height(6.dp))
            Text(text, fontSize = 14.sp, color = J.muted)
            if (facts.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { facts.forEach { f -> val v = f.str("value") ?: ""; KeyRow(f.str("label") ?: "", if (ISO.containsMatchIn(v)) ago(v) ?: v else v) } }
            }

            if (list != null) {
                Spacer(Modifier.height(12.dp))
                val r = rows
                when {
                    rowsError != null -> Muted("Could not load: $rowsError")
                    r == null -> Muted("Loading…")
                    r.objs("rows").isEmpty() -> Muted("Nothing waiting now.")
                    else -> {
                        val shown = r.objs("rows")
                        val total = (r.num("total") ?: 0.0).toInt()
                        Muted("$total waiting" + if (total > shown.size) ", newest ${shown.size} shown." else ".")
                        if (list == "ratings") TextButton(onClick = {
                            confirm = PendingAction("approve ${shown.size} rating${if (shown.size == 1) "" else "s"} and show them on the CV") { decide(shown.mapNotNull { it.str("id") }, "approved") }
                        }) { Text("Approve the ${shown.size} shown", fontSize = 12.sp) }
                        shown.forEach { row -> SheetRow(row, list) { ids, decision -> decide(ids, decision) } }
                    }
                }
            }

            if (actions.isNotEmpty() || tab != null || links.isNotEmpty()) {
                Spacer(Modifier.height(14.dp))
                Text("WHAT YOU CAN DO", fontFamily = Mono, fontSize = 11.sp, color = J.amber)
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    actions.forEach { a ->
                        val id = a.str("id") ?: return@forEach
                        val job = a.str("job")
                        val workflow = a.str("workflow")
                        val runKey = "action:$id:${job ?: workflow ?: ""}"
                        ActionButton(a.str("label") ?: id, runKey in s.running) {
                            val ask = if (id == "rerun-ci") "re-run the failed jobs of \"$workflow\" on main" else askFor(id, job, null)
                            confirm = PendingAction(ask) { runAction(vm, id, job, key, workflow) }
                        }
                    }
                    val tabName = tab?.let { t -> CHIPS.toMap()[t] ?: TABS[t] }
                    if (tab != null && tab != "overview" && tabName != null) ActionButton("Open $tabName →", false) { close(); open(tab) }
                    links.forEach { l -> ActionButton((l.str("label") ?: "Open").let { if (it.endsWith("↗")) it else "$it ↗" }, false) { l.str("url")?.let { u -> runCatching { uri.openUri(u) } } } }
                }
            }

            ai?.let {
                Spacer(Modifier.height(14.dp))
                Panel("Gemini") { Text(it, fontSize = 14.sp) }
            }

            Spacer(Modifier.height(14.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = {
                    ai = "Thinking…"
                    scope.launch {
                        val q = "Explain this Jarvis briefing line in 3 to 5 sentences: what it means, why it matters, and the first thing to do. Quote the numbers.\n$shareText"
                        ai = runCatching { call("ask", mapOf("question" to JsonPrimitive(q))).str("text") ?: "No answer." }.getOrElse { "Gemini: " + (it.message ?: "failed") }
                    }
                }) { Text("Explain with Gemini") }
                if (hiddenUntil != null) TextButton(onClick = { mark("open") }, enabled = !busy) { Text("Show it again (hidden until " + (ago(hiddenUntil) ?: hiddenUntil) + ")") }
                else {
                    TextButton(onClick = { mark("snoozed") }, enabled = !busy) { Text("Snooze 1 day") }
                    TextButton(onClick = { mark("week") }, enabled = !busy) { Text("Snooze 1 week") }
                    TextButton(onClick = { mark("dismissed") }, enabled = !busy) { Text("Dismiss 30 days") }
                }
                TextButton(onClick = { copyText(context, shareText); vm.say("Copied.") }) { Text("Copy") }
                TextButton(onClick = {
                    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, "Jarvis: " + (d.str("title") ?: text)).putExtra(Intent.EXTRA_TEXT, shareText), "Share"))
                }) { Text("Share") }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

/** A briefing line that opens its sheet; snoozed and dismissed lines show dimmed. */
@Composable
fun BriefRow(b: JsonObject, dim: Boolean = false, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().alpha(if (dim) 0.55f else 1f).clickable(onClickLabel = "Open details", onClick = onClick).padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { StatusRow(b.str("level"), b.str("text") ?: "", b.str("product")?.let { p -> CHIPS.toMap()[p] ?: TABS[p] ?: p.replaceFirstChar { it.uppercase() } }) }
        Text("›", color = J.dim, fontSize = 20.sp, modifier = Modifier.padding(start = 8.dp))
    }
}

@Composable
private fun SheetRow(row: JsonObject, list: String, decide: (List<String>, String) -> Unit) {
    val uri = LocalUriHandler.current
    val id = row.str("id") ?: return
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        val stars = (row.num("rating") ?: 0.0).toInt().coerceIn(0, 5)
        val head = if (list == "ratings") "★".repeat(stars) + "☆".repeat(5 - stars) + " " + (row.str("name") ?: "") else (row.str("name") ?: "") + (row.str("topic")?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
        Text(head, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = J.text)
        ago(row.str("at"))?.let { Text(it, fontSize = 11.sp, color = J.dim) }
        row.str("text")?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 13.sp, color = J.muted) }
        Row {
            if (list == "ratings") {
                TextButton(onClick = { decide(listOf(id), "approved") }) { Text("Approve", fontSize = 12.sp) }
                TextButton(onClick = { decide(listOf(id), "approved-anon") }) { Text("Without name", fontSize = 12.sp) }
                TextButton(onClick = { decide(listOf(id), "rejected") }) { Text("Reject", fontSize = 12.sp, color = J.pink) }
            } else row.str("email")?.takeIf { it.isNotBlank() }?.let { email ->
                TextButton(onClick = { runCatching { uri.openUri("mailto:$email?subject=" + android.net.Uri.encode("Re: " + (row.str("topic")?.takeIf { it.isNotBlank() } ?: "your message"))) } }) { Text("Reply by email", fontSize = 12.sp) }
            }
        }
    }
}

private fun copyText(context: Context, text: String) {
    (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Jarvis", text))
}
