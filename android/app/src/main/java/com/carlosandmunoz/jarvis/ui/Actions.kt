package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlin.math.roundToInt
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

val ACTION_LABELS = mapOf("rerun-held" to "Send held re-runs", "resend-notices" to "Re-send failed notices", "publish-hub" to "Publish the hub", "run-job" to "Run a job again", "rerun-ci" to "Re-run failed CI jobs",
    "rerun-job" to "Re-run failed jobs", "refresh-stale" to "Refresh stale data", "rerun-reviews" to "Re-run reviews after a fix", "pause-outreach" to "Pause an outreach mailbox",
    "resume-outreach" to "Resume outreach mailboxes", "retry-social" to "Retry failed social posts", "ai-ask" to "Ask the AI what to fix", "ai-fix" to "Run fixes the AI picked",
    "pagespeed-merge" to "Merge PageSpeed fixes", "pagespeed-close" to "Close PageSpeed fixes", "pagespeed-run" to "Start the PageSpeed run", "merge-pr" to "Merge a green PR")
private val CAPS = listOf("rerun-held", "resend-notices", "publish-hub")
/** Every action with a daily cap, for the used-today rows (#1977). */
private val AUTO_CAPS = CAPS + listOf("rerun-job", "rerun-ci", "refresh-stale", "rerun-reviews", "ai-fix", "retry-social", "resume-outreach", "merge-pr")

/** The countdown (#1977): risky actions Jarvis queued, which run when their time ends unless cancelled. */
object Countdowns {
    const val HOURS = 2.0

    /** The pending rows, from the actions op when it answered, else from the snapshot. */
    fun pending(view: JsonObject?, snapshot: JsonObject?): List<JsonObject> =
        (view.obj("countdowns") ?: snapshot.obj("countdowns")).objs("pending")

    fun hoursText(h: Double): String = if (h >= 1) (if (h % 1.0 == 0.0) "${h.toInt()} h" else "$h h") else "${(h * 60).toInt()} min"

    fun title(r: JsonObject): String = (r.str("label") ?: r.str("action") ?: "") + (r.str("target")?.takeIf { it.isNotBlank() }?.let { ": $it" } ?: "")

    fun detail(r: JsonObject): String = listOfNotNull(
        r.str("kindLabel") ?: r.str("kind"),
        if (r.str("by") == "gemini") r.num("confidence")?.let { "Gemini $it" } else null,
        if (r.str("status") == "running") "running now" else r.str("runsAt")?.takeIf { it.isNotBlank() }?.let { "runs " + (ago(it) ?: it).replaceFirstChar { c -> c.lowercase() } },
        r.str("hold")?.takeIf { it.isNotBlank() },
        r.str("why")?.takeIf { it.isNotBlank() }
    ).joinToString(" · ")
}

/** Do it now or Cancel on one countdown, through the jarvis "countdown" op. */
fun decideCountdown(vm: JarvisViewModel, id: String, act: String) {
    vm.act("countdown:$id", "countdown", mapOf("id" to JsonPrimitive(id), "act" to JsonPrimitive(act))) { out -> out.str("message") ?: "Done." }
}

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
fun runAction(vm: JarvisViewModel, action: String, job: String? = null, proposal: String? = null, workflow: String? = null, pr: Int? = null) {
    val extra = buildMap {
        put("action", JsonPrimitive(action))
        job?.let { put("job", JsonPrimitive(it)) }
        proposal?.let { put("proposal", JsonPrimitive(it)) }
        workflow?.let { put("workflow", JsonPrimitive(it)) }
        pr?.let { put("pr", JsonPrimitive(it)) }
    }
    vm.act(actionKey(action, job ?: workflow ?: pr?.toString()), "action-run", extra) { out ->
        if (action.startsWith("pagespeed-")) return@act out.str("note") ?: "Done."
        if (action == "rerun-ci") out.str("note")?.let { return@act it }
        (ACTION_LABELS[action] ?: action) + ": " + (out.str("ran")?.let { "$it started" } ?: (fmt(out.num("done")) + " done")) +
            (out.num("failed")?.takeIf { it > 0 }?.let { ", ${fmt(it)} failed" } ?: "") + (out.num("left")?.takeIf { it > 0 }?.let { ", ${fmt(it)} left" } ?: "") + "."
    }
}

fun actionKey(action: String, target: String?) = "action:$action:${target ?: ""}"

/** The confirm text of a briefing sheet's rerun-ci button (#2245): main red re-runs its jobs, main green refreshes the PRs. */
fun rerunCiAsk(workflow: String?) = "re-run the failed jobs of \"$workflow\" on main, or, when main is green, close and reopen the PRs that failed it on the old main (3 seconds apart, at most 20, conflicting PRs skipped)"

/** The PR number of a PageSpeed proposal or briefing line ("pagespeed:pr:<n>"), else null. */
fun pageSpeedPr(key: String?): Int? = key?.let { Regex("^pagespeed:pr:(\\d+)$").find(it)?.groupValues?.get(1)?.toIntOrNull() }

fun askFor(action: String, job: String?, pending: JsonObject?, pr: Int? = null): String = when (action) {
    "rerun-held" -> {
        val held = pending.num("held")
        val clean = pending.num("clean") ?: 0.0
        "send ${held?.let { fmt(it) } ?: "every"} held re-run${if (held == 1.0) "" else "s"} to the askers by email" + (if (held != null && held > clean) " (${fmt(held - clean)} not clean)" else "")
    }
    "resend-notices" -> "re-send the failed owner notices (Monday-Saturday 08:00-19:00, inside today's notice budget)"
    "publish-hub" -> "publish the Social hub (run refreshSocialHubStats)"
    "retry-social" -> "start the social posting workflows again (Buffer re-queues the failed posts)"
    "resume-outreach" -> "resume the outreach mailboxes Jarvis paused that have been healthy for two hourly checks"
    "pagespeed-merge" -> "merge PageSpeed fixes #$pr into main now (it goes to production)"
    "pagespeed-close" -> "close PageSpeed fixes #$pr without merging"
    "pagespeed-run" -> "start the daily PageSpeed run now (about two hours)"
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
    Panel(if (off) "Jarvis actions (automatic off)" else "Jarvis actions", key = "Jarvis actions") {
        val hours = (v.obj("settings") ?: s.snapshot.obj("settings").obj("actions")).num("countdownHours") ?: Countdowns.HOURS
        val pending = Countdowns.pending(v, s.snapshot)
        Text("On the countdown (${Countdowns.hoursText(hours)})", color = J.text, fontSize = 14.sp)
        if (pending.isEmpty()) Muted("Nothing waits on the countdown.")
        pending.forEach { r ->
            val id = r.str("id") ?: return@forEach
            StatusRow("warn", Countdowns.title(r), Countdowns.detail(r))
            if (r.str("status") == "waiting") Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { confirm = PendingAction("do it now: " + Countdowns.title(r).replaceFirstChar { it.lowercase() }) { decideCountdown(vm, id, "now") } }, enabled = "countdown:$id" !in s.running) { Text("Do it now", fontSize = 12.sp) }
                TextButton(onClick = { decideCountdown(vm, id, "cancel") }, enabled = "countdown:$id" !in s.running) { Text("Cancel", fontSize = 12.sp, color = J.pink) }
            }
        }
        if (v == null) { Muted(error ?: "Reading the actions log…"); return@Panel }
        val caps = v.obj("settings").obj("caps")
        AUTO_CAPS.forEach { k -> KeyRow(ACTION_LABELS[k] ?: k, fmt(v.obj("used").num(k)) + " of " + fmt(caps.num(k)) + " today", if ((v.obj("used").num(k) ?: 0.0) >= (caps.num(k) ?: 0.0)) J.amber else J.text) }
        Muted("The AI acts alone at confidence " + "%.2f".format(java.util.Locale.ROOT, v.obj("settings").num("confidence") ?: 0.8) + " or more; other picks become proposals.")
        Muted("Risky ones wait ${Countdowns.hoursText(hours)} on the countdown, at any hour: mail to third parties, posts off schedule, merging a green PR or deploying, resuming outreach. At night, mail and posts then wait for 08:00-21:00 Bogotá. Refunds and deletes always wait for your tap.")
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProposalActions(p: JsonObject, vm: JarvisViewModel, ask: (PendingAction) -> Unit, open: (String) -> Unit, mark: (String) -> Unit) {
    val uri = LocalUriHandler.current
    val key = p.str("key")
    FlowRow {
        ProposalButtons.of(p).forEach { b ->
            val label = b.str("label")!!
            val pr = b.num("pr")?.toInt()
            when (b.str("act")) {
                "run", "close" -> TextButton(onClick = {
                    ask(PendingAction(ProposalButtons.ask(b)) { if (pr != null) runAction(vm, b.str("action")!!, proposal = key, pr = pr) else runProposal(vm, b, key) })
                }) { Text(label, fontSize = 12.sp) }
                "open" -> {
                    val link = b.str("link")
                    val tab = b.str("tab")?.takeIf { it in CHIPS.toMap() || it in TABS }
                    if (link != null || tab != null) TextButton(onClick = { if (link != null) runCatching { uri.openUri(link) } else open(tab!!) }) { Text(label, fontSize = 12.sp) }
                }
                "dismissed" -> TextButton(onClick = { mark("dismissed") }) { Text(label, fontSize = 12.sp, color = J.muted) }
                else -> TextButton(onClick = { mark("done") }) { Text(label, fontSize = 12.sp) }
            }
        }
    }
}

/** A proposal's buttons (#1977) as the server built them (core.proposalButtons): its run, Open, then Dismiss, or Done without a run. */
object ProposalButtons {
    private val FALLBACK = listOf(JsonObject(mapOf("act" to JsonPrimitive("done"), "label" to JsonPrimitive("Done"))), JsonObject(mapOf("act" to JsonPrimitive("dismissed"), "label" to JsonPrimitive("Dismiss"))))

    fun of(p: JsonObject): List<JsonObject> = p.objs("buttons").filter { it.str("act") != null && it.str("label") != null }.take(3).ifEmpty { FALLBACK }

    /** What the confirm dialog asks before a run: the actions' own words, else the label and its jobs or workflows. */
    fun ask(b: JsonObject): String {
        val action = b.str("action") ?: ""
        val list = (b.arr("jobs").ifEmpty { b.arr("workflows") }).mapNotNull { (it as? JsonPrimitive)?.content }
        if (action != "run-job" && action != "rerun-ci") return askFor(action, null, null, b.num("pr")?.toInt())
        return (b.str("label") ?: action).replaceFirstChar { it.lowercase() } + if (list.size > 1) " (" + list.joinToString(", ") + ")" else ""
    }

    fun extra(b: JsonObject, proposal: String?): Map<String, JsonElement> = buildMap {
        put("action", JsonPrimitive(b.str("action") ?: ""))
        proposal?.let { put("proposal", JsonPrimitive(it)) }
        b["jobs"]?.let { put("jobs", it) }
        b["workflows"]?.let { put("workflows", it) }
    }
}

/** A proposal's run button through the action-run op, with its jobs or workflows; a tap runs it at once. */
fun runProposal(vm: JarvisViewModel, b: JsonObject, proposal: String?) {
    vm.act("proposal-run:$proposal", "action-run", ProposalButtons.extra(b, proposal)) { out ->
        out.str("note")?.let { return@act (b.str("label") ?: "Done") + ": " + it }
        (b.str("label") ?: "Done") + ": " + (out.str("ran")?.trimEnd('.') ?: (fmt(out.num("done")) + " done")) +
            (out.num("failed")?.takeIf { it > 0 }?.let { ", ${fmt(it)} failed" } ?: "") + "."
    }
}

/** Merge and Close on a PageSpeed PR (#1978), from Proposals and Systems. */
@Composable
fun PageSpeedButtons(pr: Int, vm: JarvisViewModel, proposal: String?, ask: (PendingAction) -> Unit) {
    Row {
        listOf("pagespeed-merge" to "Merge #$pr", "pagespeed-close" to "Close #$pr").forEach { (action, label) ->
            TextButton(onClick = { ask(PendingAction(askFor(action, null, null, pr)) { runAction(vm, action, proposal = proposal ?: "pagespeed:pr:$pr", pr = pr) }) }) { Text(label, fontSize = 12.sp) }
        }
    }
}

/** Settings › Jarvis actions (#2145): the on-its-own switch, the daily caps and the Gemini confidence, as in Admin › Statistics › Settings. */
@Composable
fun ActionSettings(actions: JsonObject?, save: (JsonObject) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text("Run the safe actions on their own"); Muted("Every hour, within the daily caps below. Your own taps are not capped.") }
        Switch(actions.bool("auto") ?: true, { save(actions.with("auto", JsonPrimitive(it))) })
    }
    AUTO_CAPS.forEach { k ->
        val cap = actions.obj("caps").num(k)?.toInt() ?: return@forEach
        CapRow((ACTION_LABELS[k] ?: k) + " per day", cap) { n -> save(actions.with("caps", actions.obj("caps").with(k, JsonPrimitive(n)))) }
    }
    val saved = actions.num("confidence")?.toFloat() ?: 0.8f
    var confidence by remember(saved) { mutableFloatStateOf(saved) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Gemini confidence needed to act alone", Modifier.weight(1f))
        Muted("%.2f".format(Locale.ROOT, confidence))
    }
    Slider(confidence, { confidence = (it * 20).roundToInt() / 20f }, onValueChangeFinished = { if (confidence != saved) save(actions.with("confidence", JsonPrimitive((confidence * 100).roundToInt() / 100.0))) },
        valueRange = 0.5f..1f, steps = 9, colors = SliderDefaults.colors(thumbColor = J.cyan, activeTrackColor = J.cyan, inactiveTrackColor = J.line))
    Muted("Gemini's picks under this become proposals for you.")
}

// Saved when the field loses focus or on Done, so a half-typed number is never sent.
@Composable
private fun CapRow(label: String, value: Int, save: (Int) -> Unit) {
    var text by remember(value) { mutableStateOf(value.toString()) }
    val focus = LocalFocusManager.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        OutlinedTextField(text, { t -> text = t.filter(Char::isDigit).take(3) }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }),
            modifier = Modifier.width(76.dp).onFocusChanged { f ->
                if (f.isFocused) return@onFocusChanged
                val n = text.toIntOrNull()?.coerceIn(0, 100)
                text = (n ?: value).toString()
                if (n != null && n != value) save(n)
            })
    }
}

private fun JsonObject?.with(key: String, value: JsonElement) = JsonObject((this ?: JsonObject(emptyMap())) + (key to value))
