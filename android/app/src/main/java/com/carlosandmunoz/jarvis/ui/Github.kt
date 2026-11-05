package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.pairs
import com.carlosandmunoz.jarvis.data.pct
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.strings
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.max

/** Jarvis > GitHub in the app (#2526): the web tab's grades, process map, CI, PRs, board, branches and fixes, from the github-work source. */
object Github {
    val COLUMNS = listOf("Backlog", "Next", "Design", "Dev", "QA", "Stg", "Prod", "Done")
    val WIP = setOf("Dev", "QA", "Stg")
    const val PROMPT_MAX = 600

    /** Panel columns for the width the tab gets: one on a folded cover screen, two on an unfolded inner screen (~600-880 dp less the rail). */
    fun columnsFor(widthDp: Int): Int = when { widthDp >= 1100 -> 3; widthDp >= 560 -> 2; else -> 1 }

    const val STAGE_MIN_DP = 50
    const val ARROW_DP = 16

    /** Whether every board column fits across [contentDp] without scrolling. */
    fun mapFits(contentDp: Int, stages: Int = COLUMNS.size): Boolean = contentDp >= stages * STAGE_MIN_DP + (stages - 1) * ARROW_DP

    const val RING_MIN_DP = 60
    const val RING_MAX_DP = 84
    const val RING_GAP_DP = 10

    /** Rings per row and their size in [contentDp]: all in one row when they fit, else rows as even as they can be (5 and 5, not 7 and 3). */
    fun ringGrid(contentDp: Int, count: Int = 10): Pair<Int, Int> {
        val fit = (count downTo 1).firstOrNull { (contentDp - (it - 1) * RING_GAP_DP) / it >= RING_MIN_DP } ?: 1
        val rows = (count + fit - 1) / fit
        val per = (count + rows - 1) / rows
        return per to ((contentDp - (per - 1) * RING_GAP_DP) / per).coerceIn(RING_MIN_DP, RING_MAX_DP)
    }

    fun grade(v: Double?): String = when { v == null -> "—"; v >= 90 -> "A"; v >= 80 -> "B"; v >= 70 -> "C"; v >= 60 -> "D"; else -> "F" }

    /** A grade or DORA level as a dot level (good, info, warn, alert). */
    fun tone(g: String?): String = when (g?.lowercase()) {
        "a", "elite" -> "good"
        "b", "high" -> "info"
        "c", "d", "medium" -> "warn"
        "f", "low" -> "alert"
        else -> "info"
    }

    data class Stage(val name: String, val count: Int, val ageMedD: Double?, val over: Boolean, val into: Int)

    /** The board columns in Scrum order with the moves into each from the one before; WIP columns are lit when WIP is over the limit. */
    fun stages(board: JsonObject?, flow: List<JsonObject>): List<Stage> {
        val cols = board.objs("columns").associateBy { it.str("name").orEmpty() }
        if (cols.isEmpty()) return emptyList()
        val names = COLUMNS + cols.keys.filter { it !in COLUMNS }
        val over = (board.num("wip") ?: 0.0) > (board.num("wipLimit") ?: 15.0)
        return names.mapIndexed { i, n ->
            val c = cols[n]
            Stage(n, c.num("count")?.toInt() ?: 0, c.num("ageMedD"), over && n in WIP, if (i == 0) 0 else flowInto(flow, names[i - 1], n))
        }
    }

    fun flowInto(flow: List<JsonObject>, from: String, to: String): Int =
        flow.filter { it.str("from").equals(from, true) && it.str("to").equals(to, true) }.sumOf { it.num("count")?.toInt() ?: 0 }

    /** A PR's merge state in words, with its dot level. */
    fun prState(state: String?, checks: String?): Pair<String, String> = when (state) {
        "clean" -> (if (checks == "pass") "ready to merge" else "clean") to "good"
        "dirty" -> "conflicts" to "alert"
        "behind" -> "behind main" to "warn"
        "blocked" -> "blocked" to "warn"
        "unstable" -> "checks failing" to "alert"
        "draft" -> "draft" to "info"
        else -> (state ?: "unknown") to "info"
    }

    fun canUpdate(pr: JsonObject) = pr.str("state") == "behind"
    fun canMerge(pr: JsonObject) = pr.str("state") == "clean" && pr.str("checks") == "pass"
    fun hasConflicts(pr: JsonObject) = pr.str("state") == "dirty"

    fun clip(text: String, max: Int = PROMPT_MAX): String = if (text.length <= max) text else text.take(max - 1).trimEnd() + "…"

    /** The fix agent's prompt for a failing run: Gemini's draft, else one built from the run. */
    fun runPrompt(run: JsonObject): String = run.obj("diag").str("prompt")?.takeIf { it.isNotBlank() } ?: listOfNotNull(
        "Fix the failing \"${run.str("name").orEmpty()}\" run on ${run.str("branch") ?: "main"}" + (run.num("pr")?.let { " (PR #${it.toInt()})" } ?: "") + ".",
        run.str("url")?.let { "Run: $it" },
        run.obj("diag").str("cause")?.let { "Likely cause: $it" },
        run.obj("diag").str("fix")?.let { "Suggested fix: $it" },
        "Reproduce it locally, fix the root cause, run the tests and push to the same branch."
    ).joinToString("\n")

    fun conflictPrompt(pr: JsonObject): String =
        "Resolve the merge conflicts of PR #${pr.num("number")?.toInt()} (${pr.str("branch").orEmpty()}) with main: \"${pr.str("title").orEmpty()}\". " +
            "Keep both sides' intent, run the tests and push to the same branch."

    /** Where the XP sits between this level's start (50·(level−1)²) and the next. */
    fun xpProgress(streaks: JsonObject?): Float? {
        val xp = streaks.num("xp") ?: return null
        val level = streaks.num("level")?.toInt() ?: return null
        val next = streaks.num("nextAt") ?: return null
        val start = 50.0 * (level - 1) * (level - 1)
        return if (next <= start) null else ((xp - start) / (next - start)).toFloat().coerceIn(0f, 1f)
    }

    /** A rate as 0-100, whether the server sent 0.93 or 93. */
    fun rate(v: Double?): Double? = v?.let { if (it <= 1.0) it * 100 else it }

    fun dur(sec: Double?): String = when {
        sec == null -> "—"
        sec < 60 -> "${sec.toInt()} s"
        sec < 3600 -> "${(sec / 60).toInt()} min"
        else -> fmt(sec / 3600) + " h"
    }

    /** Percent of a {used, limit} budget still left. */
    fun left(b: JsonObject?): Double? {
        val limit = b.num("limit")?.takeIf { it > 0 } ?: return null
        return max(0.0, (limit - (b.num("used") ?: 0.0)) / limit * 100)
    }

    /** The briefing lines for this tab: product github, or the gh: keys. */
    fun briefing(snap: JsonObject?): List<JsonObject> = snap.objs("briefing").filter { it.str("product") == "github" || it.str("key")?.startsWith("gh:") == true }

    fun proposals(snap: JsonObject?): List<JsonObject> = snap.objs("proposals").filter { it.str("product") == "github" || it.str("key")?.startsWith("gh:") == true }

    /** A degraded part's reason: its error and the permission it needs. */
    fun down(part: JsonObject?): String? = when {
        part == null -> "No data yet."
        part.bool("ok") == false -> listOfNotNull(part.str("error"), part.str("need")?.let { "needs $it" }).joinToString(" · ").ifEmpty { "Not available." }
        else -> null
    }
}

private data class AgentDraft(val key: String, val title: String, val prompt: String, val branch: String? = null, val pr: Int? = null)

/** One block across the parent's columns that flows its own panels by the width it gets, so folding or unfolding just recomposes. */
@Composable
fun GithubScreen(s: UiState, vm: JarvisViewModel) {
    BoxWithConstraints(Modifier.layoutId(WIDE).fillMaxWidth()) {
        Masonry(Github.columnsFor(maxWidth.value.toInt()), Modifier.fillMaxWidth()) { GithubPanels(s, vm) }
    }
}

private val TAP = Modifier.heightIn(min = 48.dp)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Buttons(content: @Composable FlowRowScope.() -> Unit) = FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), content = content)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GithubPanels(s: UiState, vm: JarvisViewModel) {
    val span = Modifier.layoutId(WIDE)
    val snap = s.snapshot
    val raw = snap.obj("external").obj("github-work")
    val gh = raw?.takeIf { it.isOk() }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    var agent by remember { mutableStateOf<AgentDraft?>(null) }
    var sheet by remember { mutableStateOf<JsonObject?>(null) }
    fun ask(text: String, run: () -> Unit) { confirm = PendingAction(text, run) }
    fun running(action: String, key: String) = "gh:$action:$key" in s.running
    fun ghAct(action: String, key: String, target: JsonElement, ask: String, extra: Map<String, JsonElement> = emptyMap()) = ask(ask) {
        vm.market("gh:$action:$key", "github-act", mapOf("action" to JsonPrimitive(action), "target" to target) + extra) { out -> out.str("message") ?: ((ACTION_LABELS[action] ?: action) + ": done.") }
    }
    fun diagnose(id: String) = vm.market("gh:diagnose:$id", "github-diagnose", mapOf("run" to JsonPrimitive(id.toLongOrNull() ?: 0L))) { out ->
        out.obj("diag").str("cause")?.let { "Gemini: $it" } ?: "Diagnosed."
    }

    // Human steps first: permissions, installs, the uploader.
    val needs = gh?.get("needs").strings().filter { it.isNotBlank() }
    if (raw == null || gh == null || needs.isNotEmpty()) Panel("Needs you", span) {
        if (gh == null) Muted(raw?.str("error") ?: "Pull down to read GitHub.")
        needs.forEach { Text("• $it", color = J.amber, fontSize = 13.sp) }
        gh.obj("access").objs("missing").take(5).forEach { KeyRow(it.str("repo").orEmpty(), it.str("why").orEmpty(), J.amber) }
    }

    val brief = Github.briefing(snap)
    if (brief.isNotEmpty()) Panel("Briefing") { brief.forEach { b -> BriefRow(b) { sheet = b } } }
    sheet?.let { BriefSheet(it, s, vm, {}) { sheet = null } }
    val props = Github.proposals(snap)
    if (props.isNotEmpty()) Panel("Proposals", key = "GitHub proposals") {
        props.forEach { p ->
            StatusRow(p.str("level"), p.str("title").orEmpty(), p.str("why"))
            ProposalActions(p, vm, { confirm = it }, {}) { status ->
                vm.act("gh:mark:${p.str("key")}", "proposal-mark", mapOf("key" to JsonPrimitive(p.str("key").orEmpty()), "status" to JsonPrimitive(status), "title" to JsonPrimitive(p.str("title").orEmpty()))) { "Saved." }
            }
        }
    }
    if (gh == null) { ConfirmAction(confirm) { confirm = null }; return }

    val score = gh.obj("score")
    val areas = score.obj("areas")
    val ci = gh.obj("ci")
    val prs = gh.obj("prs")
    val board = gh.obj("board")
    val issues = gh.obj("issues")
    val branches = gh.obj("branches")
    val dora = gh.obj("dora")
    val streaks = gh.obj("streaks")

    Panel("GitHub health" + (score.obj("overall").str("grade")?.let { " · $it" } ?: ""), span) {
        val rings = listOf("overall" to score.obj("overall")) + listOf("ci", "prs", "board", "issues", "branches", "deploys", "security", "budget", "agents").mapNotNull { k -> areas.obj(k)?.let { k to it } }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val (per, size) = Github.ringGrid(maxWidth.value.toInt(), rings.size)
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Github.RING_GAP_DP.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(6.dp), maxItemsInEachRow = per) {
                rings.forEach { (k, a) ->
                    Column(Modifier.width(size.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Ring(a.num("value"), a.str("grade") ?: Github.grade(a.num("value")), size)
                        Text(k.uppercase(), fontFamily = Mono, fontSize = 9.sp, letterSpacing = 1.sp, color = J.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        areas?.entries?.mapNotNull { (k, v) -> (v as? JsonObject)?.takeIf { (it.str("grade") ?: Github.grade(it.num("value"))) !in setOf("A", "B") }?.let { k to it } }
            ?.forEach { (k, a) -> StatusRow(Github.tone(a.str("grade") ?: Github.grade(a.num("value"))), "$k · ${a.str("grade") ?: Github.grade(a.num("value"))}", a.str("why")) }
        Muted("Repos: " + gh.obj("access")?.get("repos").strings().joinToString(", ").ifEmpty { "—" } + " · read " + (ago(gh.str("at")) ?: "—"))
    }

    // Every column across when it fits; on a cover screen a row that scrolls and stops on a column.
    val stages = Github.stages(board, gh.objs("flow"))
    if (stages.isNotEmpty()) Panel("Process map", span) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            if (Github.mapFits(maxWidth.value.toInt(), stages.size)) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                stages.forEachIndexed { i, st ->
                    if (i > 0) StageArrow(st, Modifier.width(Github.ARROW_DP.dp))
                    StageChip(st, Modifier.weight(1f), tight = true)
                }
            } else {
                val row = rememberLazyListState()
                LazyRow(state = row, flingBehavior = rememberSnapFlingBehavior(row, SnapPosition.Start), verticalAlignment = Alignment.CenterVertically) {
                    itemsIndexed(stages) { i, st ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (i > 0) StageArrow(st, Modifier.width(24.dp))
                            StageChip(st)
                        }
                    }
                }
            }
        }
        Muted("Count and median age per column; arrows are the moves in the range." + if (stages.any { it.over }) " WIP is over the limit." else "")
    }

    Panel("GitHub") {
        KpiPairs(listOf(
            KpiData("CI pass rate", pct(ci.num("passRate")), alert = (Github.rate(ci.num("passRate")) ?: 100.0) < 80),
            KpiData("Open PRs", fmt(prs.num("open"))),
            KpiData("Conflicts", fmt(prs.num("conflicts")), alert = (prs.num("conflicts") ?: 0.0) > 0),
            KpiData("WIP", fmt(board.num("wip")) + " / " + fmt(board.num("wipLimit") ?: 15.0), alert = (board.num("wip") ?: 0.0) > (board.num("wipLimit") ?: 15.0)),
            KpiData("Open bugs", fmt(issues.num("openBugs")), alert = (issues.num("openBugs") ?: 0.0) > 0),
            KpiData("Merged", fmt(prs.num("merged"))),
            KpiData("DORA level", dora.str("level") ?: "—", alert = dora.str("level") == "low"),
            KpiData("XP level", streaks.num("level")?.let { "L${it.toInt()}" } ?: "—", streaks.num("xp")?.let { fmt(it) + " / " + fmt(streaks.num("nextAt")) + " XP" })
        ))
        Github.xpProgress(streaks)?.let { GlowBar(it, J.violet) }
        val badges = streaks?.get("badges").strings()
        Muted(listOfNotNull(streaks.num("greenMainDays")?.let { "${fmt(it)} green days on main" }, streaks.num("mergeDays")?.let { "${fmt(it)} days merging in a row" }).joinToString(" · ") +
            if (badges.isNotEmpty()) " · " + badges.joinToString(" · ") else "")
    }

    if (dora != null) Panel("DORA" + (dora.str("level")?.let { " · $it" } ?: "")) {
        DoraRow("Deploys per day", fmt(dora.obj("deployFreq").num("perDay"), 2), dora.obj("deployFreq").str("level"))
        DoraRow("Lead time", fmt(dora.obj("leadTimeH").num("median")) + " h", dora.obj("leadTimeH").str("level"))
        DoraRow("Change fail rate", pct(dora.obj("changeFail").num("pct")), dora.obj("changeFail").str("level"))
        DoraRow("Time to restore", fmt(dora.obj("mttrH").num("median")) + " h", dora.obj("mttrH").str("level"))
    }

    Panel("CI" + (ci.num("runs")?.let { " · ${fmt(it)} runs" } ?: "")) {
        Github.down(ci)?.let { Muted(it); return@Panel }
        KpiPairs(listOf(
            KpiData("Runs", fmt(ci.num("runs"))), KpiData("Failed", fmt(ci.num("failed")), alert = (ci.num("failed") ?: 0.0) > 0),
            KpiData("Minutes", fmt(ci.num("minutes"))), KpiData("Flaky", pct(ci.obj("flaky").num("pct"))),
            KpiData("Queue (median)", Github.dur(ci.num("queueMedS"))), KpiData("Duration (median)", Github.dur(ci.num("durMedS")))
        ))
        val daily = ci.objs("daily")
        BarChart(daily.map { it.num("runs") ?: 0.0 }, daily.map { it.str("day").orEmpty() })
        if (daily.size >= 2) { Muted("Failed per day"); Sparkline(daily.map { it.num("failed") ?: 0.0 }, J.pink) }
    }
    TopList("Workflows by pass rate", ci.objs("workflows").sortedBy { Github.rate(it.num("passRate")) ?: 0.0 }.map { (it.str("name").orEmpty() + if (it.bool("mainRed") == true) " · main red" else "") to (Github.rate(it.num("passRate")) ?: 0.0) }, 10) { "%.0f%%".format(it) }
    TopList("Flaky workflows", ci.obj("flaky").objs("workflows").map { it.str("name").orEmpty() to (Github.rate(it.num("pct")) ?: 0.0) }, 6) { "%.0f%%".format(it) }

    val failing = ci.objs("failing")
    if (failing.isNotEmpty()) Panel("Failing runs · ${failing.size}") {
        failing.take(12).forEach { r ->
            val id = r.num("id")?.toLong()?.toString() ?: r.str("id").orEmpty()
            val name = r.str("name").orEmpty()
            val diag = r.obj("diag")
            GhRow("alert", name, listOfNotNull(ago(r.str("at")), r.num("attempt")?.takeIf { it > 1 }?.let { "attempt ${it.toInt()}" }, r.num("pr")?.let { "PR #${it.toInt()}" }, r.str("event")).joinToString(" · "), r.str("url"), r.str("branch") ?: "main")
            diag?.let { d ->
                Text("Gemini: " + d.str("cause").orEmpty() + (d.str("category")?.let { " ($it)" } ?: "") + (d.num("confidence")?.let { " · ${fmt(it, 2)}" } ?: ""), color = J.amber, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                d.str("fix")?.takeIf { it.isNotBlank() }?.let { Muted("Fix: $it", maxLines = 3) }
            }
            Buttons {
                TextButton({ ask("re-run the failed jobs of \"$name\"") { runAction(vm, "rerun-ci", workflow = name) } }, TAP, enabled = actionKey("rerun-ci", name) !in s.running) { Text("Re-run", color = J.cyan, fontSize = 13.sp) }
                TextButton({ diagnose(id) }, TAP, enabled = !running("diagnose", id)) { Text(if (diag == null) "Diagnose" else "Diagnose again", color = J.cyan, fontSize = 13.sp) }
                TextButton({ agent = AgentDraft("run:$id", "Fix the failing $name run", Github.runPrompt(r), r.str("branch"), r.num("pr")?.toInt()) }, TAP, enabled = !running("agent", "run:$id")) { Text("Launch fix agent", color = J.amber, fontSize = 13.sp) }
            }
        }
    }

    Panel("Pull requests" + (prs.num("open")?.let { " · ${fmt(it)} open" } ?: "")) {
        Github.down(prs)?.let { Muted(it); return@Panel }
        KpiPairs(listOf(
            KpiData("Merge-ready", fmt(prs.num("mergeReady"))), KpiData("Behind main", fmt(prs.num("behind"))),
            KpiData("Red checks", fmt(prs.num("red")), alert = (prs.num("red") ?: 0.0) > 0), KpiData("Stale", fmt(prs.num("stale")), alert = (prs.num("stale") ?: 0.0) > 0),
            KpiData("No ticket", fmt(prs.num("orphan")), alert = (prs.num("orphan") ?: 0.0) > 0), KpiData("Lead time", fmt(prs.num("leadMedH")) + " h", "p90 " + fmt(prs.num("leadP90H")) + " h")
        ))
        prs.objs("items").take(20).forEach { pr ->
            val n = pr.num("number")?.toInt() ?: return@forEach
            val (label, level) = Github.prState(pr.str("state"), pr.str("checks"))
            GhRow(level, "#$n ${pr.str("title").orEmpty()}", listOfNotNull(label, "checks " + (pr.str("checks") ?: "—"), pr.str("author"), pr.num("ageH")?.let { "${fmt(it / 24)} d old" },
                pr.str("ticket")?.let { "#$it" } ?: "no ticket", "+${fmt(pr.num("additions"))} −${fmt(pr.num("deletions"))}").joinToString(" · "), pr.str("url"), pr.str("branch"))
            if (Github.canUpdate(pr) || Github.canMerge(pr) || Github.hasConflicts(pr)) Buttons {
                if (Github.canUpdate(pr)) TextButton({ ghAct("gh-update-pr", "$n", JsonPrimitive(n), askFor("gh-update-pr", null, null, n)) }, TAP, enabled = !running("gh-update-pr", "$n")) { Text("Update", color = J.cyan, fontSize = 13.sp) }
                if (Github.canMerge(pr)) TextButton({ ghAct("gh-merge-pr", "$n", JsonPrimitive(n), askFor("gh-merge-pr", null, null, n)) }, TAP, enabled = !running("gh-merge-pr", "$n")) { Text("Merge", color = J.green, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                if (Github.hasConflicts(pr)) TextButton({ agent = AgentDraft("pr:$n", "Resolve the conflicts of #$n", Github.conflictPrompt(pr), pr.str("branch"), n) }, TAP, enabled = !running("agent", "pr:$n")) { Text("Fix conflicts (agent)", color = J.amber, fontSize = 13.sp) }
            }
        }
        val daily = prs.objs("daily")
        if (daily.size >= 2) { Muted("Merged per day"); Sparkline(daily.map { it.num("merged") ?: 0.0 }, J.green) }
    }
    TopList("PR sizes", prs.pairs("sizes"))

    Panel("Board" + (board.num("cycleMedD")?.let { " · cycle ${fmt(it)} d" } ?: "")) {
        Github.down(board)?.let { Muted(it); return@Panel }
        val cols = board.objs("columns")
        val top = (cols.maxOfOrNull { it.num("count") ?: 0.0 } ?: 0.0).coerceAtLeast(1.0)
        cols.forEach { c ->
            val name = c.str("name").orEmpty()
            KeyRow(name, fmt(c.num("count")) + (c.num("ageMedD")?.let { " · ${fmt(it)} d" } ?: ""), if (name in Github.WIP && (board.num("wip") ?: 0.0) > (board.num("wipLimit") ?: 15.0)) J.pink else J.text)
            GlowBar(((c.num("count") ?: 0.0) / top).toFloat())
        }
        val tp = board.objs("throughput")
        if (tp.isNotEmpty()) { Muted("Done per week"); BarChart(tp.map { it.num("done") ?: 0.0 }, tp.map { it.str("week").orEmpty() }, J.green, 80) }
        board.objs("aging").take(8).forEach { a -> StatusRow("warn", "#${a.num("number")?.toInt()} ${a.str("title").orEmpty()}", "${a.str("column")} · ${fmt(a.num("days"))} d", a.str("url")) }
        val drift = board.objs("drift")
        if (drift.isNotEmpty()) {
            Text("Drift · ${drift.size}", color = J.amber, fontSize = 13.sp)
            drift.take(8).forEach { d -> StatusRow("warn", "#${d.num("number")?.toInt()} ${d.str("title").orEmpty()}", "${d.str("column")} → ${d.str("should")} · ${d.str("why").orEmpty()}", d.str("url")) }
        }
        ActionButton("Sync the board", running("gh-board-sync", "all")) { ghAct("gh-board-sync", "all", JsonPrimitive("all"), askFor("gh-board-sync", null, null)) }
    }

    Panel("Issues" + (issues.num("open")?.let { " · ${fmt(it)} open" } ?: "")) {
        Github.down(issues)?.let { Muted(it); return@Panel }
        val sub = issues.obj("subIssues")
        KpiPairs(listOf(KpiData("Opened", fmt(issues.num("opened"))), KpiData("Closed", fmt(issues.num("closed"))),
            KpiData("Open bugs", fmt(issues.num("openBugs")), alert = (issues.num("openBugs") ?: 0.0) > 0), KpiData("Sub-issues done", fmt(sub.num("done")) + " / " + fmt(sub.num("total")))))
        val daily = issues.objs("daily")
        if (daily.size >= 2) {
            Muted("Opened per day"); Sparkline(daily.map { it.num("opened") ?: 0.0 }, J.amber)
            Muted("Closed per day"); Sparkline(daily.map { it.num("closed") ?: 0.0 }, J.green)
        }
        issues.objs("oldest").take(5).forEach { KeyRow("#${it.num("number")?.toInt()} ${it.str("title").orEmpty()}", "${fmt(it.num("days"))} d", J.muted, it.str("url")) }
    }
    TopList("Open bugs by area", issues.pairs("bugsByArea"))
    TopList("Issues by kind", issues.pairs("byKind"))

    Panel("Branches" + (branches.num("total")?.let { " · ${fmt(it)}" } ?: "")) {
        Github.down(branches)?.let { Muted(it); return@Panel }
        KeyRow("Stale", fmt(branches.num("stale")), if ((branches.num("stale") ?: 0.0) > 0) J.amber else J.text)
        val merged = branches.objs("merged")
        if (merged.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Merged · ${merged.size}", fontSize = 13.sp, modifier = Modifier.weight(1f))
                ActionButton("Delete merged", running("gh-delete-branch", "merged")) {
                    ghAct("gh-delete-branch", "merged", JsonPrimitive("merged"), askFor("gh-delete-branch", null, null) + " (${merged.size})", mapOf("branches" to JsonArray(merged.map { JsonPrimitive(it.str("name").orEmpty()) })))
                }
            }
            merged.take(10).forEach { b ->
                val name = b.str("name").orEmpty()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(name, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis); Muted(listOfNotNull(b.num("pr")?.let { "PR #${it.toInt()}" }, b.num("days")?.let { "${fmt(it)} d" }).joinToString(" · ")) }
                    TextButton({ ghAct("gh-delete-branch", name, JsonPrimitive(name), askFor("gh-delete-branch", name, null)) }, enabled = !running("gh-delete-branch", name)) { Text("Delete", color = J.pink, fontSize = 13.sp) }
                }
            }
        }
        branches.objs("ahead").take(6).forEach { b -> KeyRow(b.str("name").orEmpty(), "+${fmt(b.num("ahead"))} −${fmt(b.num("behind"))} · ${fmt(b.num("days"))} d", J.muted) }
        val trees = branches.objs("worktrees")
        if (trees.isNotEmpty()) Text("Worktrees · ${trees.size}", fontSize = 13.sp)
        trees.forEach { w ->
            val path = w.str("path").orEmpty()
            val dir = path.substringAfterLast('/')
            val done = w.str("prState") == "merged" || w.str("prState") == "closed"
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(dir, fontSize = 13.sp, color = if (w.bool("alive") == true) J.green else J.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Muted(listOfNotNull(w.str("branch"), w.str("ticket")?.let { "#$it" }, w.num("pr")?.let { "PR #${it.toInt()} ${w.str("prState").orEmpty()}" }, if (w.bool("alive") == true) "chat live" else null, if (w.bool("dirty") == true) "uncommitted" else null).joinToString(" · "))
                }
                if (done && w.bool("alive") != true) TextButton({ ghAct("gh-remove-worktree", dir, JsonPrimitive(path), askFor("gh-remove-worktree", dir, null), mapOf("dir" to JsonPrimitive(dir))) }, enabled = !running("gh-remove-worktree", dir)) { Text("Remove", color = J.pink, fontSize = 13.sp) }
            }
        }
        gh.obj("local")?.let { Muted("Mac upload " + (ago(it.str("at")) ?: "—")) } ?: Muted("The Mac uploader has not reported yet, so worktrees are unknown.")
    }

    val deploys = gh.obj("deploys")
    Panel("Deploys") {
        Github.down(deploys)?.let { Muted(it); return@Panel }
        deploys.objs("last").take(6).forEach { d -> StatusRow(if (d.str("conclusion") == "success") "good" else "alert", d.str("name").orEmpty(), listOfNotNull(d.str("conclusion"), ago(d.str("at")), d.str("sha")?.take(7)).joinToString(" · "), d.str("url")) }
        val daily = deploys.objs("daily")
        if (daily.isNotEmpty()) BarChart(daily.map { (it.num("ok") ?: 0.0) + (it.num("failed") ?: 0.0) }, daily.map { it.str("day").orEmpty() }, J.green, 80)
        deploys.objs("environments").forEach { e -> KeyRow(e.str("name").orEmpty(), listOfNotNull(e.str("state"), ago(e.str("at"))).joinToString(" · ")) }
    }

    val sec = gh.obj("security")
    Panel("Security") {
        listOf("dependabot" to "Dependabot alerts", "codeScanning" to "Code scanning", "secrets" to "Secret scanning").forEach { (k, label) ->
            val x = sec.obj(k)
            val why = Github.down(x)
            if (why != null) KeyRow(label, why, J.amber)
            else KeyRow(label, fmt(x.num("open")) + (x.num("critical")?.let { " · ${fmt(it)} critical" } ?: "") + (x.num("high")?.let { " · ${fmt(it)} high" } ?: ""),
                if ((x.num("open") ?: 0.0) > 0) J.pink else J.green)
            x.objs("items").take(4).forEach { i -> StatusRow(if (i.str("severity") in setOf("critical", "high")) "alert" else "warn", listOfNotNull(i.str("package"), i.str("severity")).joinToString(" · "), i.str("repo"), i.str("url")) }
        }
    }

    val budget = gh.obj("budget")
    Panel("API budget") {
        val gql = budget.obj("kaanmuar").obj("graphql")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Ring(Github.left(gql), "GRAPHQL LEFT")
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                KeyRow("kaanmuar GraphQL", if (gql == null) "—" else fmt(gql.num("used")) + " / " + fmt(gql.num("limit")), when { (Github.left(gql) ?: 100.0) < 5 -> J.pink; (Github.left(gql) ?: 100.0) < 20 -> J.amber; else -> J.text })
                KeyRow("kaanmuar REST", budget.obj("kaanmuar").obj("core")?.let { fmt(it.num("used")) + " / " + fmt(it.num("limit")) } ?: "—")
                KeyRow("App REST", budget.obj("app").obj("core")?.let { fmt(it.num("used")) + " / " + fmt(it.num("limit")) } ?: "—")
                gql.str("resetAt")?.let { Muted("Resets " + (ago(it) ?: it)) }
            }
        }
        val hourly = budget.objs("hourly")
        if (hourly.isNotEmpty()) BarChart(hourly.map { it.num("graphql") ?: 0.0 }, hourly.map { it.str("hour").orEmpty() }, J.violet, 70)
    }

    val agents = gh.obj("agents")
    Panel("Agent work") {
        val cost = agents.obj("cost")
        KpiPairs(listOf(KpiData("Hours", fmt(agents.objs("tickets").sumOf { it.num("hours") ?: 0.0 })), KpiData("On-demand", "$" + fmt(cost.num("onDemandUsd"), 2), cost.num("limitUsd")?.let { "of $" + fmt(it, 0) },
            alert = (cost.num("onDemandUsd") ?: 0.0) > (cost.num("limitUsd") ?: Double.MAX_VALUE) * 0.8)))
        agents.objs("tickets").sortedByDescending { it.num("hours") ?: 0.0 }.take(10).forEach { t ->
            KeyRow("#${t.str("ticket") ?: fmt(t.num("ticket"))} ${t.str("title").orEmpty()}", fmt(t.num("hours")) + " h · " + fmt(t.num("chats")) + " chats" + (t.num("costUsd")?.let { " · $" + fmt(it, 2) } ?: ""))
        }
        agents.objs("open").forEach { o -> StatusRow("info", "#${o.str("ticket") ?: fmt(o.num("ticket"))} ${o.str("title").orEmpty()}", "working since " + (ago(o.str("since")) ?: "—")) }
        val daily = agents.objs("daily")
        if (daily.size >= 2) { Muted("Hours per day"); Sparkline(daily.map { it.num("hours") ?: 0.0 }, J.violet) }
    }

    val android = gh.obj("android")
    Panel("Android builds") {
        Github.down(android)?.let { Muted(it); return@Panel }
        KeyRow("Last build", listOfNotNull(android.obj("last").str("conclusion"), ago(android.obj("last").str("at"))).joinToString(" · ").ifEmpty { "—" }, if (android.obj("last").str("conclusion") == "success") J.green else J.pink, android.obj("last").str("url"))
        KeyRow("Builds · failed", fmt(android.num("builds")) + " · " + fmt(android.num("failed")))
        android.objs("releases").take(3).forEach { KeyRow(it.str("tag").orEmpty(), ago(it.str("at")) ?: "", J.muted, it.str("url")) }
    }

    val repos = gh.objs("repos")
    if (repos.isNotEmpty()) Panel("Repos · ${repos.size}") {
        repos.forEach { r ->
            val red = r.obj("ci").str("conclusion").let { it != null && it != "success" }
            StatusRow(if (red) "alert" else "good", r.str("name").orEmpty() + if (r.bool("private") == true) " · private" else "",
                listOfNotNull(r.str("language"), "${fmt(r.num("openPrs"))} PRs", "${fmt(r.num("openIssues"))} issues", r.obj("ci").str("conclusion")?.let { "CI $it" }, r.obj("security").num("open")?.let { "${fmt(it)} alerts" }, ago(r.str("pushedAt"))).joinToString(" · "))
        }
    }

    val history = gh.objs("history")
    if (history.size >= 2) Panel("Trend · ${history.size} days") {
        Muted("Score"); Sparkline(history.map { it.num("score") ?: 0.0 }, J.cyan)
        Muted("CI pass rate"); Sparkline(history.map { Github.rate(it.num("passRate")) ?: 0.0 }, J.green)
        Muted("Open PRs"); Sparkline(history.map { it.num("openPrs") ?: 0.0 }, J.amber)
    }

    val ai = gh.obj("ai")
    val diags = ai.objs("diagnoses")
    if (diags.isNotEmpty() || ai.obj("retro") != null) Panel("Jarvis diagnoses") {
        diags.take(8).forEach { d -> StatusRow(Github.tone(if ((d.num("confidence") ?: 0.0) >= 0.8) "B" else "C"), "${d.str("workflow").orEmpty()} · ${d.str("category").orEmpty()}", listOfNotNull(d.str("cause"), d.str("fix")?.let { "Fix: $it" }, ago(d.str("at"))).joinToString(" · ")) }
        ai.obj("retro")?.let { r ->
            Text("Weekly retro · ${r.str("week").orEmpty()}", color = J.cyan, fontSize = 13.sp)
            Text(r.str("text").orEmpty(), fontSize = 13.sp)
        }
    }

    Deck(s, vm, span, { agent = it }, ::ask) { ghAct("gh-board-sync", "all", JsonPrimitive("all"), askFor("gh-board-sync", null, null)) }
    Needs(raw)
    ConfirmAction(confirm) { confirm = null }
    AgentDialog(agent, vm) { agent = null }
}

@Composable
private fun StageChip(st: Github.Stage, modifier: Modifier = Modifier, tight: Boolean = false) {
    val edge = when { st.over -> J.pink; st.count > 0 -> J.cyan; else -> J.line }
    Column(
        modifier.clip(RoundedCornerShape(10.dp)).background(edge.copy(alpha = 0.10f))
            .border(1.dp, edge.copy(alpha = if (st.over) 0.9f else 0.5f), RoundedCornerShape(10.dp))
            .padding(horizontal = if (tight) 3.dp else 10.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(st.name.uppercase(), fontFamily = Mono, fontSize = 10.sp, color = J.muted, maxLines = 1, softWrap = false, overflow = TextOverflow.Clip)
        Text(st.count.toString(), fontSize = 20.sp, fontWeight = FontWeight.Bold, color = if (st.over) J.pink else J.text, maxLines = 1)
        Text(st.ageMedD?.let { fmt(it) + " d" } ?: "—", fontFamily = Mono, fontSize = 10.sp, color = J.dim, maxLines = 1, softWrap = false)
    }
}

@Composable
private fun StageArrow(st: Github.Stage, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("→", color = if (st.into > 0) J.cyan else J.dim, fontSize = 16.sp)
        Text(if (st.into > 0) st.into.toString() else "", color = J.dim, fontFamily = Mono, fontSize = 10.sp, maxLines = 1, softWrap = false)
    }
}

/** A status row whose long title and branch stop at an ellipsis instead of pushing the panel taller. */
@Composable
private fun GhRow(level: String?, title: String, detail: String?, url: String?, ref: String? = null) {
    val uri = LocalUriHandler.current
    Row(Modifier.fillMaxWidth().let { if (url != null) it.clickable { runCatching { uri.openUri(url) } } else it }, verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 4.dp)) { Dot(J.level(level)) }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, color = if (url != null) J.cyan else J.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!ref.isNullOrBlank()) Text(ref, fontFamily = Mono, fontSize = 11.sp, color = J.amber, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!detail.isNullOrBlank()) Text(detail, fontSize = 12.sp, color = J.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun DoraRow(label: String, value: String, level: String?) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text(value, fontFamily = Mono, fontSize = 13.sp)
        Spacer(Modifier.width(8.dp))
        val c = J.level(Github.tone(level))
        Text((level ?: "—").uppercase(), fontFamily = Mono, fontSize = 10.sp, color = c,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, c.copy(alpha = 0.7f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
    }
}

/** Every agent launch asks, with the drafted prompt shown and editable. */
@Composable
private fun AgentDialog(d: AgentDraft?, vm: JarvisViewModel, close: () -> Unit) {
    if (d == null) return
    var text by remember(d) { mutableStateOf(d.prompt) }
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Launch a Cursor fix agent?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Muted(listOfNotNull(d.title, d.branch?.let { "branch $it" }, d.pr?.let { "PR #$it" }).joinToString(" · "))
                OutlinedTextField(text, { text = it }, label = { Text("Prompt") }, minLines = 4, maxLines = 10, modifier = Modifier.fillMaxWidth())
                Muted("The agent works in the cloud and opens a PR; nothing merges without you.")
            }
        },
        confirmButton = {
            TextButton({
                val p = text.trim()
                if (p.isNotEmpty()) {
                    vm.market("gh:agent:${d.key}", "github-agent", buildMap {
                        put("prompt", JsonPrimitive(p))
                        d.branch?.let { put("branch", JsonPrimitive(it)) }
                        d.pr?.let { put("pr", JsonPrimitive(it)) }
                    }) { out -> "Cursor agent launched" + (out.str("url")?.let { ": $it" } ?: ".") }
                    close()
                }
            }) { Text("Launch", color = J.cyan) }
        },
        dismissButton = { TextButton(close) { Text("Cancel", color = J.muted) } }
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Deck(s: UiState, vm: JarvisViewModel, modifier: Modifier, launch: (AgentDraft) -> Unit, ask: (String, () -> Unit) -> Unit, sync: () -> Unit) {
    Panel("Command deck", modifier) {
        var task by rememberSaveable { mutableStateOf("") }
        var branch by rememberSaveable { mutableStateOf("") }
        OutlinedTextField(task, { task = it }, label = { Text("Task for a Cursor agent") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(branch, { branch = it.trim() }, label = { Text("Branch (optional)") }, singleLine = true, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            ActionButton("Draft", "gh:agent:deck" in s.running) {
                if (task.isNotBlank()) { launch(AgentDraft("deck", "From the deck", task.trim(), branch.ifBlank { null })); task = "" }
            }
        }
        Buttons {
            ActionButton("Sync the board", "gh:gh-board-sync:all" in s.running, sync)
            ActionButton("Re-run failed main CI", actionKey("rerun-ci", null) in s.running) { ask("re-run the failed CI jobs on main") { runAction(vm, "rerun-ci") } }
            ActionButton("Refresh", s.loading) { vm.refresh() }
        }
        Muted("Every button asks first. Agent launches always ask, with the prompt shown.")
    }
}
