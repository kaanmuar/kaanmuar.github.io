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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.GhResult
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
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.net.URLEncoder
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

    /** Jarvis's worker (#2958): the month's AI spend from the worker op, as the web meter shows it. */
    data class Spend(val month: String, val usd: Double, val cap: Double, val warn: Double, val left: Double, val level: String, val runs: Int, val input: Long, val output: Long) {
        val fraction: Float get() = if (cap > 0) (usd / cap).coerceIn(0.0, 1.0).toFloat() else 0f
        val warnAt: Float get() = if (cap > 0) (warn / cap).coerceIn(0.0, 1.0).toFloat() else 0f
    }

    fun spend(worker: JsonObject?): Spend? {
        val s = worker.obj("spend") ?: return null
        val usd = s.num("usd") ?: return null
        val cap = s.num("cap") ?: 40.0
        val warn = s.num("warn") ?: 20.0
        return Spend(s.str("month").orEmpty(), usd, cap, warn, s.num("left") ?: (cap - usd).coerceAtLeast(0.0),
            s.str("level") ?: if (usd >= cap) "over" else if (usd >= warn) "warn" else "ok", s.num("runs")?.toInt() ?: 0, s.num("input")?.toLong() ?: 0, s.num("output")?.toLong() ?: 0)
    }

    fun usd(v: Double) = "$" + String.format(java.util.Locale.US, "%.2f", v)

    /** The level J.level colours: green under the warning, amber past it, pink at the cap. */
    fun spendTone(sp: Spend) = when (sp.level) { "over" -> "alert"; "warn" -> "warn"; else -> "good" }

    fun spendLine(sp: Spend) = when (sp.level) {
        "over" -> "The worker is stopped until next month. Fixes go to a Cursor agent on tap."
        "warn" -> "Past the ${usd(sp.warn)} warning; the worker stops at ${usd(sp.cap)}."
        else -> "${usd(sp.left)} left before the worker stops at ${usd(sp.cap)}."
    }

    /** A task row's model: Flash or Pro, and whether Pro took over from a failed Flash run. */
    fun workerModel(t: JsonObject) = (if (t.str("tier") == "flash") "Flash" else "Pro") + (if (t.str("escalatedFrom") != null) " after Flash" else "")

    /** A task row's state; a run that stopped on Gemini's request quota reads apart from a code failure (#3064). */
    fun workerState(t: JsonObject) = (if (t.str("reason") == "quota") "Gemini quota" else if (t.str("state") == "nochange") "no change" else t.str("state") ?: "—") +
        (if (t.str("escalatedTo") != null) " → Pro" else "")

    fun workerLevel(state: String?, reason: String? = null) = when {
        reason == "quota" -> "warn"
        else -> when (state) { "done" -> "good"; "failed" -> "alert"; "queued", "running" -> "warn"; else -> null }
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

    const val REPO_URL = "https://github.com/kaanmuar/kaanmuar.github.io"
    const val BOARD_URL = "https://github.com/orgs/carlosandmunoz-hq/projects/1"
    const val COLUMN_ROWS = 8
    const val DRILL_ROWS = 10

    /** The repos the tab shows when jarvis_settings/main github.repos is empty, as jarvis-core GITHUB_REPOS (#2807). */
    val REPOS = listOf("kaanmuar/kaanmuar.github.io", "kaanmuar/qa-lab-outreach", "kaanmuar/cursor-quota", "kaanmuar/cursor-quota-releases")
    private val REPO_NAME = Regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$")

    /** The repo list as jarvis-core githubRepos() cleans it: owner/name each, a github.com link trimmed, at most 20, the defaults when none is left. */
    fun cleanRepos(lines: List<String>): List<String> =
        lines.map { it.trim().removePrefix("https://github.com/").trimEnd('/') }.filter { REPO_NAME.matches(it) }.distinct().take(20).ifEmpty { REPOS }

    fun reposJson(repos: List<String>) = JsonObject(mapOf("repos" to JsonArray(repos.map(::JsonPrimitive))))

    fun shownRepos(gh: JsonObject?): List<String> = gh.obj("access")?.get("shown").strings().ifEmpty { REPOS }

    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")
    private fun ref(name: String) = name.split('/').joinToString("/", transform = ::enc)

    fun boardColumnUrl(name: String) = "$BOARD_URL/views/1?filterQuery=" + enc("status:\"$name\"")
    fun issueSearch(q: String) = "$REPO_URL/issues?q=" + enc(q)
    fun areaQuery(area: String) = if (area == "none") "is:issue is:open label:bug" else "is:issue is:open label:area:$area label:bug"
    fun days(n: Double?) = n?.let { fmt(it) + " d" } ?: "—"
    private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"
    private fun newest(shown: Int, of: Double?) = of?.takeIf { it > shown }?.let { "Newest $shown of ${fmt(it)}." }

    private fun issueRow(i: JsonObject, meta: String): DrillRow {
        val n = i.num("number")?.toInt()
        return DrillRow("#$n", i.str("title").orEmpty(), meta, i.str("url") ?: "$REPO_URL/issues/$n")
    }

    private fun branchRow(b: JsonObject, meta: String): DrillRow {
        val name = b.str("name").orEmpty()
        return DrillRow(name, "", meta, "$REPO_URL/tree/${ref(name)}", "compare" to "$REPO_URL/compare/main...${ref(name)}")
    }

    /** A board column's drill-down: its first cards (oldest first; Done newest first, as the source sends them) and the board filtered to it. */
    fun columnDrill(board: JsonObject?, name: String): Drill {
        val c = board.objs("columns").firstOrNull { it.str("name") == name }
        val count = c.num("count")?.toInt() ?: 0
        val items = c.objs("items").take(COLUMN_ROWS)
        return Drill(name, "$name · ${plural(count, "card", "cards")}", items.map { issueRow(it, "${days(it.num("days"))} in $name") },
            listOf("Open $name on the board" to boardColumnUrl(name), "All issues" to "$REPO_URL/issues"), "No cards in $name.",
            if (count > items.size) "${if (name == "Done") "Newest" else "Oldest"} ${items.size} of $count." else null)
    }

    /** The Issues panel's drill-downs, one per number: open, open bugs, opened, closed, parent tickets, oldest. */
    fun issueDrills(iss: JsonObject?): List<Drill> {
        val lists = iss.obj("lists")
        val since = iss.str("since") ?: ""
        val sub = iss.obj("subIssues")
        fun age(i: JsonObject) = days(i.num("days")) + " open"
        val open = lists.objs("open")
        val bugs = lists.objs("openBugs")
        val opened = lists.objs("opened")
        val closed = lists.objs("closed")
        val parents = sub.objs("items")
        return listOf(
            Drill("open", "Open issues · ${fmt(iss.num("open"))}", open.map { issueRow(it, age(it)) }, listOf("All open issues" to issueSearch("is:issue is:open")), "No open issue changed in this range.", newest(open.size, iss.num("open"))),
            Drill("bugs", "Open bugs · ${fmt(iss.num("openBugs"))}", bugs.map { issueRow(it, age(it)) }, listOf("Open bugs on GitHub" to issueSearch("is:issue is:open label:bug")), "No open bugs.", newest(bugs.size, iss.num("openBugs"))),
            Drill("opened", "Opened since $since · ${fmt(iss.num("opened"))}", opened.map { issueRow(it, "opened ${days(it.num("days"))} ago") }, listOf("Opened in range" to issueSearch("is:issue created:>=$since")), "No issue opened in this range.", newest(opened.size, iss.num("opened"))),
            Drill("closed", "Closed since $since · ${fmt(iss.num("closed"))}", closed.map { issueRow(it, "closed ${days(it.num("days"))} ago") }, listOf("Closed in range" to issueSearch("is:issue is:closed closed:>=$since")), "No issue closed in this range.", newest(closed.size, iss.num("closed"))),
            Drill("sub", "Parent tickets · ${fmt(sub.num("parents") ?: 0.0)}", parents.map { issueRow(it, "${fmt(it.num("done"))} of ${fmt(it.num("total"))} sub-issues done") }, listOf("All issues" to "$REPO_URL/issues"), "No sub-issues yet.",
                sub.num("parents")?.takeIf { it > parents.size }?.let { "Most left to do first: ${parents.size} of ${fmt(it)}." }),
            Drill("oldest", "Oldest open issues", iss.objs("oldest").take(DRILL_ROWS).map { issueRow(it, age(it)) }, listOf("Oldest first on GitHub" to issueSearch("is:issue is:open sort:created-asc")), "No open issues.")
        )
    }

    /** Open bugs by area: each area's bugs and its label:area:<x> label:bug search. */
    fun areaDrills(iss: JsonObject?): List<Drill> = iss.objs("bugsByArea").map { a ->
        val label = a.str("label").orEmpty()
        val items = a.objs("items")
        Drill(label, "${if (label == "none") "No area label" else "area:$label"} · ${plural(a.num("value")?.toInt() ?: 0, "open bug", "open bugs")}",
            items.map { issueRow(it, days(it.num("days")) + " open") }, listOf((if (label == "none") "All open bugs" else "area:$label bugs on GitHub") to issueSearch(areaQuery(label))),
            "No bugs listed.", newest(items.size, a.num("value")))
    }

    /** The Branches panel's drill-downs (all, stale, merged not deleted, ahead/behind), each branch with its tree and compare links. */
    fun branchDrills(br: JsonObject?): List<Drill> {
        val ahead = br.objs("ahead")
        val merged = br.objs("merged")
        val total = br.num("total")?.toInt() ?: 0
        fun meta(b: JsonObject) = "last commit ${days(b.num("days"))} ago · ${fmt(b.num("ahead"))} ahead, ${fmt(b.num("behind"))} behind" + (b.num("pr")?.let { " · PR #${it.toInt()}" } ?: "")
        return listOf(
            Drill("all", "Branches · $total", ahead.sortedBy { it.num("days") ?: 1e9 }.take(DRILL_ROWS).map { branchRow(it, meta(it)) }, listOf("All branches" to "$REPO_URL/branches/all"), "No branches besides main.",
                if (total > DRILL_ROWS) "Newest $DRILL_ROWS of $total read; the rest are on GitHub." else null),
            Drill("stale", "Stale branches · ${fmt(br.num("stale"))}", ahead.filter { (it.num("days") ?: 0.0) > 14 }.sortedByDescending { it.num("days") }.take(DRILL_ROWS).map { branchRow(it, meta(it)) },
                listOf("Stale branches" to "$REPO_URL/branches/stale"), "No branch has gone two weeks without a commit."),
            Drill("merged", "Merged, not deleted · ${merged.size}", merged.take(DRILL_ROWS).map { branchRow(it, "PR #${it.num("pr")?.toInt()} merged ${days(it.num("days"))} ago") },
                listOf("All branches" to "$REPO_URL/branches/all", "Merged PRs" to "$REPO_URL/pulls?q=is%3Apr+is%3Amerged"), "No merged branches left behind.",
                if (merged.size > DRILL_ROWS) "${merged.size - DRILL_ROWS} more on GitHub." else null),
            Drill("ahead", "Ahead of and behind main", ahead.sortedByDescending { it.num("behind") ?: 0.0 }.take(DRILL_ROWS).map { branchRow(it, meta(it)) }, listOf("Active branches" to "$REPO_URL/branches/active"), "No open branches ahead of main.")
        )
    }

    /** One open drill-down per panel: a tap on the open one closes it, a tap on another switches. */
    fun toggle(open: String?, key: String): String? = if (open == key) null else key

    /** A degraded part's reason: its error and the permission it needs. */
    fun down(part: JsonObject?): String? = when {
        part == null -> "No data yet."
        part.bool("ok") == false -> listOfNotNull(part.str("error"), part.str("need")?.let { "needs $it" }).joinToString(" · ").ifEmpty { "Not available." }
        else -> null
    }

    const val POLL_MS = 10_000L
    const val POLL_TRIES = 90

    /** A re-run's github-run answer as its row's state (#2808). */
    fun runResult(out: JsonObject): GhResult {
        val attempt = out.num("attempt")?.toInt() ?: 1
        val url = out.str("url")?.ifBlank { null }
        return when {
            out.bool("done") == true && out.str("conclusion") == "success" -> GhResult("done", "Passed on attempt $attempt.", url, "Open the run")
            out.bool("done") == true -> GhResult("failed", "Ended ${out.str("conclusion")?.ifBlank { null } ?: "without a result"} on attempt $attempt.", url, "Open the run")
            else -> GhResult(if (out.str("status") == "in_progress") "running" else "queued", "Attempt $attempt: ${(out.str("status") ?: "queued").replace('_', ' ')}…", url, "Watch the run")
        }
    }

    /** The Fix button a diagnosis gets: its own action when Jarvis can run it; gh-agent and none leave only the agent. */
    fun fixLabel(diag: JsonObject?, pr: Int?): String? = when (diag.str("action")) {
        "rerun-ci" -> "Fix: re-run"
        "gh-update-pr" -> if (pr != null) "Fix: update with main" else null
        else -> null
    }

    /** A Jarvis diagnoses row in a failing run's shape, so [runPrompt] drafts its agent prompt. */
    fun diagRun(d: JsonObject): JsonObject = JsonObject(listOf("id" to "run", "name" to "workflow", "branch" to "branch", "pr" to "pr", "url" to "url")
        .mapNotNull { (to, from) -> d[from]?.takeIf { it !is JsonNull }?.let { to to it } }.toMap() + ("diag" to d))

    fun quarantineTitle(w: JsonObject) = "CI: ${w.str("name").orEmpty()} is flaky (${fmt(w.num("pct"))}% of ${fmt(w.num("runs"))} runs)"

    val SEVERITIES = listOf("critical", "high", "medium", "low")
    val ALERT_KINDS = listOf("dependabot" to "Dependabot", "codeScanning" to "Code scanning", "secrets" to "Secret scanning")

    /** GitHub's own dismissal reasons per alert kind; secret scanning alerts cannot be dismissed from Jarvis. */
    val DISMISS_REASONS = mapOf(
        "dependabot" to listOf("tolerable_risk" to "Tolerable risk", "fix_started" to "A fix has started", "inaccurate" to "Inaccurate", "no_bandwidth" to "No bandwidth to fix", "not_used" to "Code not used"),
        "codeScanning" to listOf("false positive" to "False positive", "won't fix" to "Won't fix", "used in tests" to "Used in tests"))

    fun alertName(kind: String, i: JsonObject): String = when (kind) { "dependabot" -> i.str("package"); "codeScanning" -> i.str("rule"); else -> i.str("type") } ?: "alert"
    fun alertKey(kind: String, i: JsonObject) = "$kind:${i.str("repo").orEmpty()}#${i.num("number")?.toInt()}"

    /** The github-act body of a dismissal, as the web's dismiss form sends it. */
    fun dismissArgs(kind: String, i: JsonObject, reason: String, comment: String): Map<String, JsonElement> = mapOf(
        "action" to JsonPrimitive("gh-dismiss-alert"), "kind" to JsonPrimitive(kind), "repo" to JsonPrimitive(i.str("repo").orEmpty()), "number" to JsonPrimitive(i.num("number")?.toInt() ?: 0),
        "reason" to JsonPrimitive(reason), "comment" to JsonPrimitive(comment.trim().take(280)), "target" to JsonPrimitive("${alertName(kind, i)} #${i.num("number")?.toInt()}"))

    /** A security alert's fields for gh-security-ticket, without its Dependabot PR. */
    fun alertArgs(kind: String, i: JsonObject): Map<String, JsonElement> = i.filterKeys { it != "pr" } + ("kind" to JsonPrimitive(kind))

    fun securityPrompt(i: JsonObject) = "Upgrade ${i.str("package")} to ${i.str("patched") ?: "the first patched version"} or later in ${i.str("manifest") ?: "its manifest"} " +
        "(Dependabot alert #${i.num("number")?.toInt()} in ${i.str("repo")}" + (i.str("summary")?.let { ": $it" } ?: "") + "). Update the lockfile, run the affected tests, and open a PR against main."

    /** Open alerts per readable kind, by severity (critical, high, medium, low), kinds with none left out. */
    fun severityRows(sec: JsonObject?): List<Pair<String, List<Int>>> = ALERT_KINDS.mapNotNull { (k, label) ->
        sec.obj(k)?.takeIf { it.bool("ok") == true }?.let { x -> label to SEVERITIES.map { s -> x.obj("bySeverity").num(s)?.toInt() ?: 0 } }
    }.filter { it.second.sum() > 0 }

    fun severityText(counts: List<Int>): String = SEVERITIES.zip(counts).filter { it.second > 0 }.joinToString(", ") { (s, n) -> s.replaceFirstChar { it.uppercase() } + " $n" }

    /** Open alerts per repo across the kinds, most first. */
    fun alertsByRepo(sec: JsonObject?): List<Pair<String, Double>> = ALERT_KINDS.flatMap { (k, _) -> sec.obj(k).pairs("byRepo") }
        .groupBy { it.first }.map { (r, l) -> r to l.sumOf { it.second } }.sortedByDescending { it.second }

    /** The low alerts the bulk dismissal sends: Dependabot and code scanning, never secrets. */
    fun lowAlerts(sec: JsonObject?): List<JsonObject> = listOf("dependabot", "codeScanning").flatMap { k ->
        sec.obj(k).objs("items").filter { it.str("severity") == "low" }
            .map { JsonObject(mapOf("kind" to JsonPrimitive(k), "repo" to JsonPrimitive(it.str("repo").orEmpty()), "number" to JsonPrimitive(it.num("number")?.toInt() ?: 0))) }
    }
}

private data class AgentDraft(val key: String, val title: String, val prompt: String, val branch: String? = null, val pr: Int? = null, val repo: String? = null, val name: String? = null)

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
    // The cards on screen, as the web sends them: without them the server reads its own, possibly older, drift.
    fun syncBoard() {
        val items = gh.obj("board").objs("drift").mapNotNull { d ->
            val n = d.num("number")?.toInt() ?: return@mapNotNull null
            val should = d.str("should") ?: return@mapNotNull null
            JsonObject(mapOf("number" to JsonPrimitive(n), "should" to JsonPrimitive(should)))
        }
        ghAct("gh-board-sync", "all", JsonPrimitive("all"), askFor("gh-board-sync", null, null), if (items.isEmpty()) emptyMap() else mapOf("items" to JsonArray(items)))
    }
    val uri = LocalUriHandler.current
    fun open(url: String?) { url?.let { runCatching { uri.openUri(it) } } }
    fun busy(key: String) = s.ghRows[key]?.state.let { it == "running" || it == "queued" }
    fun diagnose(id: String) = vm.ghRow("run:$id", "github-diagnose", mapOf("run" to JsonPrimitive(id.toLongOrNull() ?: 0L)), "Diagnosing: Gemini is reading the run log…") { out ->
        GhResult("done", "Diagnosed: " + (out.obj("diag").str("cause") ?: "done."))
    }
    fun actRow(key: String, action: String, target: String, question: String, extra: Map<String, JsonElement>, link: String = "Open on GitHub") = ask(question) {
        val label = ACTION_LABELS[action] ?: action
        vm.ghRow(key, "github-act", mapOf("action" to JsonPrimitive(action), "target" to JsonPrimitive(target)) + extra, "$label…") { out -> GhResult("done", out.str("message") ?: "$label: done.", out.str("url"), link) }
    }
    val pinned = remember { mutableStateMapOf<String, JsonObject>() }
    fun rerun(id: String, name: String, branch: String?, row: JsonObject? = null) = ask("re-run the failed jobs of \"$name\" #$id on ${branch ?: "its branch"}") {
        row?.let { pinned[id] = it }
        val run = id.toLongOrNull() ?: 0L
        vm.ghRerun("run:$id", run, mapOf("action" to JsonPrimitive("rerun-ci"), "run" to JsonPrimitive(run), "workflow" to JsonPrimitive(name), "branch" to JsonPrimitive(branch.orEmpty()), "target" to JsonPrimitive("$name #$id")))
    }
    fun fix(id: String, name: String, branch: String?, pr: Int?, diag: JsonObject?) = when (diag.str("action")) {
        "rerun-ci" -> rerun(id, name, branch)
        "gh-update-pr" -> if (pr != null) actRow("run:$id", "gh-update-pr", "#$pr", askFor("gh-update-pr", null, null, pr) + " (Gemini: ${diag.str("cause").orEmpty()})", mapOf("pr" to JsonPrimitive(pr)), "Open the PR") else Unit
        else -> Unit
    }

    // Human steps first: permissions, installs, the uploader.
    val needs = gh?.get("needs").strings().filter { it.isNotBlank() }
    if (raw == null || gh == null || needs.isNotEmpty()) Panel("Needs you", span, id = "github-needs") {
        if (gh == null) Muted(raw?.str("error") ?: "Pull down to read GitHub.")
        needs.forEach { Text("• $it", color = J.amber, fontSize = 13.sp) }
        gh.obj("access").objs("missing").take(5).forEach { KeyRow(it.str("repo").orEmpty(), it.str("why").orEmpty(), J.amber) }
    }

    val brief = Github.briefing(snap)
    if (brief.isNotEmpty()) Panel("Briefing", id = "briefing") { brief.forEach { b -> BriefRow(b) { sheet = b } } }
    sheet?.let { BriefSheet(it, s, vm, {}) { sheet = null } }
    val props = Github.proposals(snap)
    if (props.isNotEmpty()) Panel("Proposals", key = "GitHub proposals", id = "github-proposals") {
        props.forEach { p ->
            StatusRow(p.str("level"), p.str("title").orEmpty(), p.str("why"))
            ProposalActions(p, vm, { confirm = it }, {}) { status ->
                vm.act("gh:mark:${p.str("key")}", "proposal-mark", mapOf("key" to JsonPrimitive(p.str("key").orEmpty()), "status" to JsonPrimitive(status), "title" to JsonPrimitive(p.str("title").orEmpty()))) { "Saved." }
            }
        }
    }
    LaunchedEffect(Unit) { if (s.worker == null) vm.loadWorker() }
    WorkerPanel(s, vm, span, ::ask, ::open)
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

    Panel("GitHub health" + (score.obj("overall").str("grade")?.let { " · $it" } ?: ""), span, id = "github-health") {
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
        Muted("Repos: " + Github.shownRepos(gh).joinToString(", ") + " · read " + (ago(gh.str("at")) ?: "—"))
    }

    // Every column across when it fits; on a cover screen a row that scrolls and stops on a column. A tap lists the column's cards.
    val stages = Github.stages(board, gh.objs("flow"))
    var flowOpen by rememberSaveable { mutableStateOf<String?>(null) }
    if (stages.isNotEmpty()) Panel("Process map", span, id = "github-flow") {
        val tap = { name: String -> flowOpen = Github.toggle(flowOpen, name) }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            if (Github.mapFits(maxWidth.value.toInt(), stages.size)) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                stages.forEachIndexed { i, st ->
                    if (i > 0) StageArrow(st, Modifier.width(Github.ARROW_DP.dp))
                    StageChip(st, Modifier.weight(1f), tight = true, open = flowOpen == st.name) { tap(st.name) }
                }
            } else {
                val row = rememberLazyListState()
                LazyRow(state = row, flingBehavior = rememberSnapFlingBehavior(row, SnapPosition.Start), verticalAlignment = Alignment.CenterVertically) {
                    itemsIndexed(stages) { i, st ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (i > 0) StageArrow(st, Modifier.width(24.dp))
                            StageChip(st, open = flowOpen == st.name) { tap(st.name) }
                        }
                    }
                }
            }
        }
        flowOpen?.let { DrillBody(Github.columnDrill(board, it)) { flowOpen = null } }
        Muted("Tap a column to list its cards. Count and median age per column; arrows are the moves in the range." + if (stages.any { it.over }) " WIP is over the limit." else "")
    }

    Panel("GitHub", id = "github-summary") {
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

    if (dora != null) Panel("DORA" + (dora.str("level")?.let { " · $it" } ?: ""), id = "github-dora") {
        DoraRow("Deploys per day", fmt(dora.obj("deployFreq").num("perDay"), 2), dora.obj("deployFreq").str("level"))
        DoraRow("Lead time", fmt(dora.obj("leadTimeH").num("median")) + " h", dora.obj("leadTimeH").str("level"))
        DoraRow("Change fail rate", pct(dora.obj("changeFail").num("pct")), dora.obj("changeFail").str("level"))
        DoraRow("Time to restore", fmt(dora.obj("mttrH").num("median")) + " h", dora.obj("mttrH").str("level"))
    }

    Panel("CI" + (ci.num("runs")?.let { " · ${fmt(it)} runs" } ?: ""), id = "github-ci") {
        Github.down(ci)?.let { Muted(it); return@Panel }
        KpiPairs(listOf(
            KpiData("Runs", fmt(ci.num("runs"))), KpiData("Failed", fmt(ci.num("failed")), alert = (ci.num("failed") ?: 0.0) > 0),
            KpiData("Minutes", fmt(ci.num("minutes"))), KpiData("Flaky", pct(ci.obj("flaky").num("pct"))),
            KpiData("Queue (median)", Github.dur(ci.num("queueMedS"))), KpiData("Duration (median)", Github.dur(ci.num("durMedS")))
        ))
        val daily = ci.objs("daily")
        val days = daily.map { it.str("day").orEmpty() }
        BarChart(daily.map { it.num("runs") ?: 0.0 }, days, title = "Workflow runs per day", yLabel = "runs per day", unit = "runs", legend = "Runs")
        if (daily.size >= 2) Sparkline(daily.map { it.num("failed") ?: 0.0 }, J.pink, title = "Failed runs per day", unit = "runs", labels = days, legend = "Failed")
    }
    TopList("Workflows by pass rate", ci.objs("workflows").sortedBy { Github.rate(it.num("passRate")) ?: 0.0 }.map { (it.str("name").orEmpty() + if (it.bool("mainRed") == true) " · main red" else "") to (Github.rate(it.num("passRate")) ?: 0.0) }, 10, id = "github-workflows") { "%.0f%%".format(it) }
    val flaky = ci.obj("flaky").objs("workflows")
    if (flaky.isNotEmpty()) Panel("Flaky workflows · ${flaky.size}", id = "github-flaky") {
        flaky.take(8).forEach { w ->
            val name = w.str("name").orEmpty()
            val n = w.obj("newest")
            val nid = n.num("id")?.toLong()?.toString()
            GhRow(if ((w.num("pct") ?: 0.0) >= 10) "alert" else "warn", "$name · ${fmt(w.num("pct"))}% flaky",
                listOfNotNull("${fmt(w.num("runs"))} runs", nid?.let { "newest failure #$it " + (ago(n.str("at")) ?: "") }, if (n != null && n.bool("failed") != true) "passed on a re-run" else null).joinToString(" · "), n.str("url"), w.str("path"))
            n.obj("diag").str("cause")?.let { Text("Gemini: $it", color = J.amber, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis) }
            Buttons {
                if (nid != null && n.bool("failed") == true) TextButton({ rerun(nid, name, n.str("branch")) }, TAP, enabled = !busy("run:$nid")) { Text("Re-run failed jobs", color = J.cyan, fontSize = 13.sp) }
                if (nid != null) TextButton({ diagnose(nid) }, TAP, enabled = !busy("run:$nid")) { Text(if (n.obj("diag") == null) "Diagnose" else "Diagnose again", color = J.cyan, fontSize = 13.sp) }
                TextButton({
                    actRow("flaky:$name", "gh-quarantine", name, askFor("gh-quarantine", Github.quarantineTitle(w), null), mapOf("workflow" to JsonPrimitive(name), "pct" to (w["pct"] ?: JsonPrimitive(0)),
                        "runs" to (w["runs"] ?: JsonPrimitive(0)), "path" to JsonPrimitive(w.str("path").orEmpty()), "links" to (w["links"] ?: JsonArray(emptyList()))), "Open the ticket")
                }, TAP, enabled = !busy("flaky:$name")) { Text("Quarantine", color = J.pink, fontSize = 13.sp) }
                w.str("url")?.let { u -> TextButton({ open(u) }, TAP) { Text("Open runs", color = J.cyan, fontSize = 13.sp) } }
                TextButton({
                    vm.ghDraft("flaky:$name", buildMap {
                        nid?.toLongOrNull()?.let { put("run", JsonPrimitive(it)) }
                        put("workflow", JsonPrimitive(name)); w["pct"]?.let { put("pct", it) }; w["runs"]?.let { put("runs", it) }
                    }) { p -> agent = AgentDraft("flaky:$name", "Fix the flaky $name workflow", p, "main", name = "Jarvis fix: flaky $name") }
                }, TAP, enabled = !busy("flaky:$name")) { Text("Fix with an agent", color = J.amber, fontSize = 13.sp) }
            }
            nid?.let { RowResult(s.ghRows["run:$it"]) }
            RowResult(s.ghRows["flaky:$name"])
        }
        Muted("Flaky: failed, then passed on a re-run of the same commit. Quarantine files a Backlog bug with the run links.")
    }

    val failing = ci.objs("failing")
    val idOf = { r: JsonObject -> r.num("id")?.toLong()?.toString() ?: r.str("id").orEmpty() }
    val failRows = failing + pinned.filterKeys { k -> failing.none { idOf(it) == k } }.values
    if (failRows.isNotEmpty()) Panel("Failing runs · ${failing.size}", id = "github-failing") {
        failRows.take(12).forEach { r ->
            val id = idOf(r)
            val name = r.str("name").orEmpty()
            val diag = r.obj("diag")
            val pr = r.num("pr")?.toInt()
            GhRow("alert", name, listOfNotNull(ago(r.str("at")), r.num("attempt")?.takeIf { it > 1 }?.let { "attempt ${it.toInt()}" }, pr?.let { "PR #$it" }, r.str("event")).joinToString(" · "), r.str("url"), r.str("branch") ?: "main")
            diag?.let { d ->
                Text("Gemini: " + d.str("cause").orEmpty() + (d.str("category")?.let { " ($it)" } ?: "") + (d.num("confidence")?.let { " · ${fmt(it, 2)}" } ?: ""), color = J.amber, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                d.str("fix")?.takeIf { it.isNotBlank() }?.let { Muted("Fix: $it", maxLines = 3) }
            }
            Buttons {
                TextButton({ rerun(id, name, r.str("branch"), r) }, TAP, enabled = !busy("run:$id")) { Text("Re-run", color = J.cyan, fontSize = 13.sp) }
                TextButton({ diagnose(id) }, TAP, enabled = !busy("run:$id")) { Text(if (diag == null) "Diagnose" else "Diagnose again", color = J.cyan, fontSize = 13.sp) }
                FixButtons(Github.fixLabel(diag, pr), busy("run:$id"), { fix(id, name, r.str("branch"), pr, diag) }) { agent = AgentDraft("run:$id", "Fix the failing $name run", Github.runPrompt(r), r.str("branch"), pr) }
            }
            RowResult(s.ghRows["run:$id"])
        }
        Muted("Fix runs what the diagnosis suggests: a re-run or an update with main. A re-run shows its state here until it finishes; an agent always asks first.")
    }

    Panel("Pull requests" + (prs.num("open")?.let { " · ${fmt(it)} open" } ?: ""), id = "github-prs") {
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
                if (Github.hasConflicts(pr)) TextButton({ agent = AgentDraft("pr:$n", "Resolve the conflicts of #$n", Github.conflictPrompt(pr), pr.str("branch"), n) }, TAP, enabled = !busy("pr:$n")) { Text("Fix conflicts (agent)", color = J.amber, fontSize = 13.sp) }
            }
            RowResult(s.ghRows["pr:$n"])
        }
        val daily = prs.objs("daily")
        if (daily.size >= 2) {
            val days = daily.map { it.str("day").orEmpty() }
            Sparkline(daily.map { it.num("opened") ?: 0.0 }, J.violet, title = "PRs opened per day", unit = "PRs", labels = days, legend = "Opened")
            Sparkline(daily.map { it.num("merged") ?: 0.0 }, J.green, title = "PRs merged per day", unit = "PRs", labels = days, legend = "Merged")
        }
    }
    TopList("PR sizes", prs.pairs("sizes"), yLabel = "Size (lines: XS <10, S <50, M <250, L <1000)", unit = "open PRs", id = "github-pr-sizes")

    Panel("Board" + (board.num("cycleMedD")?.let { " · cycle ${fmt(it)} d" } ?: ""), id = "github-board") {
        Github.down(board)?.let { Muted(it); return@Panel }
        val cols = board.objs("columns")
        val top = (cols.maxOfOrNull { it.num("count") ?: 0.0 } ?: 0.0).coerceAtLeast(1.0)
        cols.forEach { c ->
            val name = c.str("name").orEmpty()
            KeyRow(name, fmt(c.num("count")) + (c.num("ageMedD")?.let { " · ${fmt(it)} d" } ?: ""), if (name in Github.WIP && (board.num("wip") ?: 0.0) > (board.num("wipLimit") ?: 15.0)) J.pink else J.text)
            GlowBar(((c.num("count") ?: 0.0) / top).toFloat())
        }
        val tp = board.objs("throughput")
        if (tp.isNotEmpty()) BarChart(tp.map { it.num("done") ?: 0.0 }, tp.map { it.str("week").orEmpty() }, J.green, 80, title = "Cards done per week", yLabel = "cards per ISO week", unit = "cards", legend = "Reached Done")
        board.objs("aging").take(8).forEach { a -> StatusRow("warn", "#${a.num("number")?.toInt()} ${a.str("title").orEmpty()}", "${a.str("column")} · ${fmt(a.num("days"))} d", a.str("url")) }
        val drift = board.objs("drift")
        if (drift.isNotEmpty()) {
            Text("Drift · ${drift.size}", color = J.amber, fontSize = 13.sp)
            drift.take(8).forEach { d -> StatusRow("warn", "#${d.num("number")?.toInt()} ${d.str("title").orEmpty()}", "${d.str("column")} → ${d.str("should")} · ${d.str("why").orEmpty()}", d.str("url")) }
        }
        ActionButton("Sync the board", running("gh-board-sync", "all")) { syncBoard() }
    }

    var issOpen by rememberSaveable { mutableStateOf<String?>(null) }
    Panel("Issues" + (issues.num("open")?.let { " · ${fmt(it)} open" } ?: ""), id = "github-issues") {
        Github.down(issues)?.let { Muted(it); return@Panel }
        val sub = issues.obj("subIssues")
        val oldest = issues.objs("oldest")
        KpiPairs(listOf(KpiData("Open", fmt(issues.num("open")), drill = "open"), KpiData("Open bugs", fmt(issues.num("openBugs")), alert = (issues.num("openBugs") ?: 0.0) > 0, drill = "bugs"),
            KpiData("Opened", fmt(issues.num("opened")), drill = "opened"), KpiData("Closed", fmt(issues.num("closed")), drill = "closed"),
            KpiData("Sub-issues done", fmt(sub.num("done")) + " / " + fmt(sub.num("total")), drill = "sub"), KpiData("Oldest open", oldest.firstOrNull()?.let { Github.days(it.num("days")) } ?: "—", drill = "oldest")),
            issOpen) { issOpen = Github.toggle(issOpen, it) }
        issOpen?.let { k -> DrillBody(Github.issueDrills(issues).firstOrNull { it.key == k }) { issOpen = null } }
        val daily = issues.objs("daily")
        if (daily.size >= 2) {
            val days = daily.map { it.str("day").orEmpty() }
            Sparkline(daily.map { it.num("opened") ?: 0.0 }, J.amber, title = "Issues opened per day", unit = "issues", labels = days, legend = "Opened")
            Sparkline(daily.map { it.num("closed") ?: 0.0 }, J.green, title = "Issues closed per day", unit = "issues", labels = days, legend = "Closed")
        }
        Muted("Tap a number to list its issues.")
    }
    var areaOpen by rememberSaveable { mutableStateOf<String?>(null) }
    TopList("Open bugs by area", issues.pairs("bugsByArea"), yLabel = "Area", unit = "open bugs", legend = "Open bugs", open = areaOpen, onRow = { areaOpen = Github.toggle(areaOpen, it) }, id = "github-bug-areas", footer = {
        areaOpen?.let { k -> DrillBody(Github.areaDrills(issues).firstOrNull { it.key == k }) { areaOpen = null } }
        Muted("Tap an area to list its bugs.")
    })
    TopList("Issues by kind", issues.pairs("byKind"), yLabel = "Kind", unit = "open issues", id = "github-kinds")

    var brOpen by rememberSaveable { mutableStateOf<String?>(null) }
    Panel("Branches" + (branches.num("total")?.let { " · ${fmt(it)}" } ?: ""), id = "github-branches") {
        Github.down(branches)?.let { Muted(it); return@Panel }
        val ahead = branches.objs("ahead")
        KpiPairs(listOf(KpiData("Branches", fmt(branches.num("total")), drill = "all"), KpiData("Stale", fmt(branches.num("stale")), alert = (branches.num("stale") ?: 0.0) > 0, drill = "stale"),
            KpiData("Merged, not deleted", fmt(branches.objs("merged").size.toDouble()), alert = branches.objs("merged").isNotEmpty(), drill = "merged"),
            KpiData("Ahead of main", fmt(ahead.count { (it.num("ahead") ?: 0.0) > 0 }.toDouble()), drill = "ahead")), brOpen) { brOpen = Github.toggle(brOpen, it) }
        brOpen?.let { k -> DrillBody(Github.branchDrills(branches).firstOrNull { it.key == k }) { brOpen = null } }
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
    Panel("Deploys", id = "github-deploys") {
        Github.down(deploys)?.let { Muted(it); return@Panel }
        deploys.objs("last").take(6).forEach { d -> StatusRow(if (d.str("conclusion") == "success") "good" else "alert", d.str("name").orEmpty(), listOfNotNull(d.str("conclusion"), ago(d.str("at")), d.str("sha")?.take(7)).joinToString(" · "), d.str("url")) }
        val daily = deploys.objs("daily")
        if (daily.isNotEmpty()) BarChart(daily.map { (it.num("ok") ?: 0.0) + (it.num("failed") ?: 0.0) }, daily.map { it.str("day").orEmpty() }, J.green, 80,
            title = "Deploys per day", yLabel = "deploys per day", unit = "deploys", legend = "Deploy runs on main")
        deploys.objs("environments").forEach { e -> KeyRow(e.str("name").orEmpty(), listOfNotNull(e.str("state"), ago(e.str("at"))).joinToString(" · ")) }
    }

    val sec = gh.obj("security")
    val secScore = areas.obj("security")
    var dismiss by remember { mutableStateOf<Pair<String, JsonObject>?>(null) }
    Panel("Security", span, id = "github-security") {
        val rows = Github.severityRows(sec)
        val open = Github.ALERT_KINDS.sumOf { sec.obj(it.first)?.takeIf { x -> x.bool("ok") == true }.num("open") ?: 0.0 }
        KpiPairs(listOf(KpiData("Open alerts", fmt(open), alert = open > 0), KpiData("Critical", "${rows.sumOf { it.second[0] }}", alert = rows.any { it.second[0] > 0 }), KpiData("High", "${rows.sumOf { it.second[1] }}"),
            KpiData("Oldest", Github.days(Github.ALERT_KINDS.mapNotNull { sec.obj(it.first).num("oldestD") }.maxOrNull())),
            KpiData("Security score", secScore.num("value")?.let { fmt(it) } ?: "—", secScore.str("grade"), alert = (secScore.num("value") ?: 100.0) < 70)))
        Github.ALERT_KINDS.forEach { (k, label) -> Github.down(sec.obj(k))?.let { KeyRow(label, it, J.amber) } }
        if (rows.isEmpty()) Muted("No open security alerts in the project repos.") else SeverityBars(rows)
        val byRepo = Github.alertsByRepo(sec)
        if (byRepo.isNotEmpty()) {
            Caption("Open alerts by repo")
            val top = byRepo.first().second.coerceAtLeast(1.0)
            byRepo.forEach { (r, v) -> KeyRow(r, fmt(v)); GlowBar((v / top).toFloat(), J.pink) }
        }
        val weeks = sec.objs("weeks")
        if (weeks.size >= 2) {
            val labels = weeks.map { it.str("week").orEmpty() }
            Sparkline(weeks.map { it.num("opened") ?: 0.0 }, J.pink, title = "Alerts opened per week", unit = "alerts", labels = labels, legend = "Opened")
            Sparkline(weeks.map { it.num("fixed") ?: 0.0 }, J.green, title = "Alerts fixed per week", unit = "alerts", labels = labels, legend = "Fixed")
            Sparkline(weeks.map { it.num("dismissed") ?: 0.0 }, J.dim, title = "Alerts dismissed per week", unit = "alerts", labels = labels, legend = "Dismissed")
        }
        secScore?.let { a ->
            Caption("Security score ${fmt(a.num("value"))}" + (a.str("grade")?.let { " ($it)" } ?: "") + ": 100 minus")
            val parts = a.objs("parts")
            if (parts.isEmpty()) Muted("Nothing open, nothing taken off.")
            parts.forEach { p -> KeyRow("${p.str("label").orEmpty()} · ${fmt(p.num("count"))} × ${fmt(p.num("each"))}", "−" + fmt(p.num("penalty")), J.pink) }
        }
        val lows = Github.lowAlerts(sec)
        if (lows.isNotEmpty()) ActionButton("Dismiss all low as tolerable risk", busy("sec:low")) {
            actRow("sec:low", "gh-dismiss-low", "${lows.size} low alerts", askFor("gh-dismiss-low", null, null, lows.size), mapOf("alerts" to JsonArray(lows)))
        }
        RowResult(s.ghRows["sec:low"])
        Muted("Project repos only. Dismiss and the bulk dismissal run only when you tap them; Jarvis never dismisses on its own.")
    }
    Github.ALERT_KINDS.forEach { (kind, label) ->
        val x = sec.obj(kind)?.takeIf { it.bool("ok") == true } ?: return@forEach
        val items = x.objs("items")
        Panel("$label · ${fmt(x.num("open"))}", id = when (kind) { "dependabot" -> "github-dependabot"; "codeScanning" -> "github-code-scanning"; else -> "github-secrets" }) {
            KpiPairs(listOf(KpiData("Open", fmt(x.num("open")), alert = (x.num("open") ?: 0.0) > 0)) + Github.SEVERITIES.map { sv ->
                val n = x.obj("bySeverity").num(sv) ?: 0.0
                KpiData(sv.replaceFirstChar { it.uppercase() }, fmt(n), alert = sv in setOf("critical", "high") && n > 0)
            } + listOf(KpiData("Oldest", Github.days(x.num("oldestD"))), KpiData("Median age", Github.days(x.num("medianD")))))
            if (kind == "dependabot" && items.isNotEmpty()) listOf("byEcosystem" to "Open alerts by ecosystem", "byPackage" to "Open alerts by package").forEach { (k, title) ->
                val list = x.pairs(k).take(10)
                if (list.isNotEmpty()) {
                    Caption(title)
                    val top = list.maxOf { it.second }.coerceAtLeast(1.0)
                    list.forEach { (l, v) -> KeyRow(l, fmt(v)); GlowBar((v / top).toFloat(), if (k == "byEcosystem") J.violet else J.amber) }
                }
            }
            if (items.isEmpty()) Muted("No open alerts.")
            items.take(10).forEach { i ->
                val key = Github.alertKey(kind, i)
                val n = i.num("number")?.toInt()
                val name = Github.alertName(kind, i)
                GhRow(when (i.str("severity")) { "critical", "high" -> "alert"; "medium" -> "warn"; else -> "info" }, "$name #$n",
                    listOfNotNull(i.str("severity"), i.str("repo"), i.str("manifest") ?: i.str("path"), i.str("patched")?.let { "patched in $it" }, ago(i.str("created"))).joinToString(" · "), i.str("url"))
                Buttons {
                    i.str("url")?.let { u -> TextButton({ open(u) }, TAP) { Text("Open on GitHub", color = J.cyan, fontSize = 13.sp) } }
                    if (kind != "secrets") TextButton({ dismiss = kind to i }, TAP, enabled = !busy(key)) { Text("Dismiss…", color = J.pink, fontSize = 13.sp) }
                    if (kind == "dependabot") {
                        val bump = i.obj("pr")
                        val bn = bump.num("number")?.toInt()
                        if (bn != null) {
                            TextButton({ open(bump.str("url")) }, TAP) { Text("Dependabot PR #$bn", color = J.cyan, fontSize = 13.sp) }
                            if (prs.objs("items").any { it.num("number")?.toInt() == bn && Github.canMerge(it) }) TextButton({
                                actRow(key, "gh-merge-pr", "#$bn", askFor("gh-merge-pr", null, null, bn), mapOf("pr" to JsonPrimitive(bn)), "Open the PR")
                            }, TAP, enabled = !busy(key)) { Text("Merge", color = J.green, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                        } else TextButton({ agent = AgentDraft(key, "Fix $name #$n", Github.securityPrompt(i), "main", repo = i.str("repo"), name = "Jarvis fix: $name") }, TAP, enabled = !busy(key)) {
                            Text("Fix with an agent", color = J.amber, fontSize = 13.sp)
                        }
                    }
                    TextButton({ actRow(key, "gh-security-ticket", "$name #$n", askFor("gh-security-ticket", "$label alert #$n in ${i.str("repo").orEmpty()}", null), Github.alertArgs(kind, i), "Open the ticket") }, TAP, enabled = !busy(key)) {
                        Text("File a ticket", color = J.cyan, fontSize = 13.sp)
                    }
                }
                RowResult(s.ghRows[key])
            }
            if (kind == "secrets" && items.isNotEmpty()) Muted("Revoke and rotate: revoke the secret where it was issued, make a new one, store it in GitHub Actions or Firebase secrets, then close the alert on GitHub as revoked. Jarvis cannot close secret alerts.")
            if (kind == "dependabot") Muted("Fix merges the Dependabot PR when it is green, or drafts an upgrade prompt for an agent.")
        }
    }

    val budget = gh.obj("budget")
    Panel("API budget", id = "github-budget") {
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
        if (hourly.isNotEmpty()) BarChart(hourly.map { it.num("graphql") ?: 0.0 }, hourly.map { it.str("hour").orEmpty() }, J.violet, 70,
            title = "GraphQL points used per hour", yLabel = "points per hour (UTC)", unit = "points", legend = "kaanmuar GraphQL")
    }

    val agents = gh.obj("agents")
    Panel("Agent work", id = "github-agents") {
        val cost = agents.obj("cost")
        KpiPairs(listOf(KpiData("Hours", fmt(agents.objs("tickets").sumOf { it.num("hours") ?: 0.0 })), KpiData("On-demand", "$" + fmt(cost.num("onDemandUsd"), 2), cost.num("limitUsd")?.let { "of $" + fmt(it, 0) },
            alert = (cost.num("onDemandUsd") ?: 0.0) > (cost.num("limitUsd") ?: Double.MAX_VALUE) * 0.8)))
        agents.objs("tickets").sortedByDescending { it.num("hours") ?: 0.0 }.take(10).forEach { t ->
            KeyRow("#${t.str("ticket") ?: fmt(t.num("ticket"))} ${t.str("title").orEmpty()}", fmt(t.num("hours")) + " h · " + fmt(t.num("chats")) + " chats" + (t.num("costUsd")?.let { " · $" + fmt(it, 2) } ?: ""))
        }
        agents.objs("open").forEach { o -> StatusRow("info", "#${o.str("ticket") ?: fmt(o.num("ticket"))} ${o.str("title").orEmpty()}", "working since " + (ago(o.str("since")) ?: "—")) }
        val daily = agents.objs("daily")
        if (daily.size >= 2) {
            val days = daily.map { it.str("day").orEmpty() }
            Sparkline(daily.map { it.num("hours") ?: 0.0 }, J.amber, title = "Agent hours per day", unit = "h", labels = days, legend = "Agent hours")
            Sparkline(daily.map { it.num("tickets") ?: 0.0 }, J.cyan, title = "Tickets worked per day", unit = "tickets", labels = days, legend = "Tickets")
        }
    }

    val android = gh.obj("android")
    Panel("Android builds", id = "github-android") {
        Github.down(android)?.let { Muted(it); return@Panel }
        KeyRow("Last build", listOfNotNull(android.obj("last").str("conclusion"), ago(android.obj("last").str("at"))).joinToString(" · ").ifEmpty { "—" }, if (android.obj("last").str("conclusion") == "success") J.green else J.pink, android.obj("last").str("url"))
        KeyRow("Builds · failed", fmt(android.num("builds")) + " · " + fmt(android.num("failed")))
        android.objs("releases").take(3).forEach { KeyRow(it.str("tag").orEmpty(), ago(it.str("at")) ?: "", J.muted, it.str("url")) }
    }

    val repos = gh.objs("repos")
    if (repos.isNotEmpty()) Panel("Repos · ${repos.size}", id = "github-repos") {
        Muted("Showing " + Github.shownRepos(gh).joinToString(", ") + ". Edit the list in Settings › GitHub repos.")
        repos.forEach { r ->
            val red = r.obj("ci").str("conclusion").let { it != null && it != "success" }
            StatusRow(if (red) "alert" else "good", r.str("name").orEmpty() + if (r.bool("private") == true) " · private" else "",
                listOfNotNull(r.str("language"), "${fmt(r.num("openPrs"))} PRs", "${fmt(r.num("openIssues"))} issues", r.obj("ci").str("conclusion")?.let { "CI $it" }, r.obj("security").num("open")?.let { "${fmt(it)} alerts" }, ago(r.str("pushedAt"))).joinToString(" · "))
        }
    }

    val history = gh.objs("history")
    if (history.size >= 2) Panel("Trend · ${history.size} days", id = "github-trend") {
        val days = history.map { it.str("day").orEmpty() }
        Sparkline(history.map { it.num("score") ?: 0.0 }, J.cyan, title = "Health score", unit = "of 100", labels = days, legend = "Score")
        Sparkline(history.map { Github.rate(it.num("passRate")) ?: 0.0 }, J.green, title = "CI pass rate", unit = "%", labels = days, legend = "Pass rate")
        Sparkline(history.map { it.num("openPrs") ?: 0.0 }, J.violet, title = "Open PRs", unit = "PRs", labels = days, legend = "Open PRs")
        Sparkline(history.map { it.num("openBugs") ?: 0.0 }, J.pink, title = "Open bugs", unit = "bugs", labels = days, legend = "Open bugs")
        Muted("One point per day (UTC); tap a line for that day's value.")
    }

    val ai = gh.obj("ai")
    val diags = ai.objs("diagnoses")
    if (diags.isNotEmpty() || ai.obj("retro") != null) Panel("Jarvis diagnoses", id = "github-ai") {
        diags.take(8).forEach { d ->
            val id = d.num("run")?.toLong()?.toString() ?: return@forEach
            val name = d.str("workflow").orEmpty()
            val pr = d.num("pr")?.toInt()
            StatusRow(Github.tone(if ((d.num("confidence") ?: 0.0) >= 0.8) "B" else "C"), "$name · ${d.str("category").orEmpty()}", listOfNotNull(d.str("cause"), d.str("fix")?.let { "Fix: $it" }, ago(d.str("at"))).joinToString(" · "), d.str("url"))
            Buttons { FixButtons(Github.fixLabel(d, pr), busy("run:$id"), { fix(id, name, d.str("branch"), pr, d) }) { agent = AgentDraft("run:$id", "Fix the failing $name run", Github.runPrompt(Github.diagRun(d)), d.str("branch"), pr) } }
            RowResult(s.ghRows["run:$id"])
        }
        ai.obj("retro")?.let { r ->
            Text("Weekly retro · ${r.str("week").orEmpty()}", color = J.cyan, fontSize = 13.sp)
            Text(r.str("text").orEmpty(), fontSize = 13.sp)
        }
    }

    Deck(s, vm, span, { agent = it }, ::ask) { syncBoard() }
    Needs(raw)
    ConfirmAction(confirm) { confirm = null }
    AgentDialog(agent, vm, Github.spend(s.worker)) { agent = null }
    DismissDialog(dismiss, vm) { dismiss = null }
}

@Composable
private fun FixButtons(label: String?, busy: Boolean, onFix: () -> Unit, onAgent: () -> Unit) {
    label?.let { TextButton(onFix, TAP, enabled = !busy) { Text(it, color = J.green, fontSize = 13.sp, fontWeight = FontWeight.Bold) } }
    TextButton(onAgent, TAP, enabled = !busy) { Text("Fix with an agent", color = J.amber, fontSize = 13.sp) }
}

/** A row's action state under its buttons; a tap opens the run, PR, issue or agent it links. */
@Composable
private fun RowResult(r: GhResult?) {
    if (r == null) return
    val uri = LocalUriHandler.current
    val c = when (r.state) { "done", "launched" -> J.green; "failed" -> J.pink; else -> J.amber }
    val link = r.url?.takeIf { it.isNotBlank() }
    Row(Modifier.fillMaxWidth().let { m -> if (link != null) m.heightIn(min = 48.dp).clickable { runCatching { uri.openUri(link) } } else m }, verticalAlignment = Alignment.CenterVertically) {
        Text(r.state.uppercase(), fontFamily = Mono, fontSize = 10.sp, color = c,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, c.copy(alpha = 0.7f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
        Spacer(Modifier.width(8.dp))
        Text(r.text + if (link != null) " · ${r.link ?: "Open"} ↗" else "", fontSize = 12.sp, color = if (link != null) J.cyan else J.text, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun Caption(text: String) = Text(text.uppercase(), fontFamily = Mono, fontSize = 10.sp, letterSpacing = 1.sp, color = J.muted, modifier = Modifier.padding(top = 6.dp))

private val SEVERITY_COLORS = listOf(J.pink, Color(0xFFFF8F5A), J.amber, J.dim)

/** Open alerts per kind as one bar split by severity, the longest kind full width, with a legend of totals. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeverityBars(rows: List<Pair<String, List<Int>>>) {
    val top = rows.maxOf { it.second.sum() }.coerceAtLeast(1)
    Caption("Open alerts by severity")
    rows.forEach { (label, counts) ->
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(0.45f)) {
                Text(label, fontSize = 13.sp)
                Text(Github.severityText(counts), fontSize = 11.sp, color = J.dim)
            }
            Row(Modifier.weight(0.45f).height(8.dp).clip(RoundedCornerShape(6.dp)).background(J.line)) {
                counts.forEachIndexed { k, n -> if (n > 0) Box(Modifier.fillMaxHeight().weight(n.toFloat()).background(SEVERITY_COLORS[k])) }
                (top - counts.sum()).takeIf { it > 0 }?.let { Spacer(Modifier.weight(it.toFloat())) }
            }
            Text("${counts.sum()}", fontFamily = Mono, fontSize = 13.sp, modifier = Modifier.weight(0.1f).padding(start = 6.dp))
        }
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Github.SEVERITIES.forEachIndexed { k, sv ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(SEVERITY_COLORS[k]))
                Text(" ${sv.replaceFirstChar { it.uppercase() }} ${rows.sumOf { it.second[k] }}", fontSize = 12.sp, color = J.muted)
            }
        }
    }
}

/** Dismissing closes the alert on GitHub, so it runs only from this dialog: a reason GitHub accepts and an optional comment. */
@Composable
private fun DismissDialog(target: Pair<String, JsonObject>?, vm: JarvisViewModel, close: () -> Unit) {
    val (kind, i) = target ?: return
    val reasons = Github.DISMISS_REASONS[kind] ?: return
    var reason by remember(target) { mutableStateOf(reasons.first().first) }
    var comment by remember(target) { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Dismiss ${Github.alertName(kind, i)} #${i.num("number")?.toInt()}?") },
        text = {
            Column {
                Muted(listOfNotNull(i.str("repo"), i.str("severity")).joinToString(" · "))
                reasons.forEach { (v, label) ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { reason = v }, verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(reason == v, { reason = v })
                        Text(label, fontSize = 14.sp)
                    }
                }
                OutlinedTextField(comment, { comment = it.take(280) }, label = { Text("Comment, optional") }, maxLines = 3, modifier = Modifier.fillMaxWidth())
                Muted("Closes the alert on GitHub; it can be reopened there.")
            }
        },
        confirmButton = {
            TextButton({
                vm.ghRow(Github.alertKey(kind, i), "github-act", Github.dismissArgs(kind, i, reason, comment), "Dismissing on GitHub…") { out -> GhResult("done", out.str("message") ?: "Dismissed.", out.str("url"), "Open on GitHub") }
                close()
            }) { Text("Dismiss on GitHub", color = J.pink) }
        },
        dismissButton = { TextButton(close) { Text("Cancel", color = J.muted) } }
    )
}

@Composable
private fun StageChip(st: Github.Stage, modifier: Modifier = Modifier, tight: Boolean = false, open: Boolean = false, onClick: () -> Unit) {
    val edge = when { st.over -> J.pink; st.count > 0 -> J.cyan; else -> J.line }
    Column(
        modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(10.dp)).clickable(onClickLabel = if (open) "Hide ${st.name}'s cards" else "List ${st.name}'s cards", onClick = onClick)
            .background(edge.copy(alpha = if (open) 0.22f else 0.10f))
            .border(if (open) 2.dp else 1.dp, if (open) J.cyan else edge.copy(alpha = if (st.over) 0.9f else 0.5f), RoundedCornerShape(10.dp))
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

/** Every agent launch asks, with the drafted prompt shown and editable: Jarvis's own worker (#2957), or a Cursor agent. */
/** Jarvis's worker (#2958): the month's AI spend against its cap with the warning tick, and the last tasks; a stuck one goes to Cursor on tap. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WorkerPanel(s: UiState, vm: JarvisViewModel, modifier: Modifier, ask: (String, () -> Unit) -> Unit, open: (String?) -> Unit) {
    val w = s.worker
    val sp = Github.spend(w)
    Panel(if (sp == null) "Jarvis's worker" else "Jarvis's worker · ${Github.usd(sp.usd)} of ${Github.usd(sp.cap)}", modifier, id = "github-worker") {
        if (sp == null) { Muted(if (w == null || "worker" in s.running) "Reading the worker's spend…" else w.str("error") ?: "The worker op sent no spend."); return@Panel }
        val tone = J.level(Github.spendTone(sp))
        BoxWithConstraints(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Box(Modifier.padding(top = 3.dp).fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)).background(J.dim.copy(alpha = 0.22f))) {
                Box(Modifier.fillMaxWidth(sp.fraction).fillMaxHeight().clip(RoundedCornerShape(6.dp)).background(tone))
            }
            Box(Modifier.padding(start = maxWidth * sp.warnAt - 1.dp).width(2.dp).height(18.dp).background(J.text))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            listOf("$0", "warn ${Github.usd(sp.warn)}", "cap ${Github.usd(sp.cap)}").forEach { Text(it.uppercase(), fontFamily = Mono, fontSize = 9.sp, letterSpacing = 1.sp, color = J.muted) }
        }
        Text(Github.spendLine(sp), fontSize = 13.sp, color = if (sp.level == "ok") J.muted else J.amber)
        KeyRow("Spent · ${sp.month}", Github.usd(sp.usd), if (sp.level == "ok") J.text else tone)
        KeyRow("Runs", sp.runs.toString())
        KeyRow("Tokens in · out", "${fmt(sp.input.toDouble())} · ${fmt(sp.output.toDouble())}")
        Caption("Last tasks")
        val tasks = w.objs("tasks")
        if (tasks.isEmpty()) Muted("No worker runs yet.")
        tasks.take(10).forEach { t ->
            val id = t.str("id").orEmpty()
            val pr = t.num("pr")?.toInt()
            StatusRow(Github.workerLevel(t.str("state"), t.str("reason")), t.str("title").orEmpty() + (pr?.let { " · #$it" } ?: ""),
                listOfNotNull(Github.workerModel(t), Github.workerState(t), Github.usd(t.num("usd") ?: 0.0), ago(t.str("at")), t.str("error")?.takeIf { it.isNotBlank() }).joinToString(" · "), t.str("url"))
            t.obj("cursor")?.let { c ->
                Buttons {
                    ActionButton("Hand to Cursor", s.ghRows["worker:$id"]?.state == "running") {
                        ask("hand \"${t.str("title").orEmpty()}\" to a Cursor cloud agent; it uses Cursor credit") {
                            vm.ghRow("worker:$id", "github-agent", buildMap {
                                put("engine", JsonPrimitive("cursor"))
                                c.str("prompt")?.let { put("prompt", JsonPrimitive(it)) }
                                c.str("branch")?.let { put("branch", JsonPrimitive(it)) }
                                c.num("pr")?.let { put("pr", JsonPrimitive(it.toInt())) }
                                c.str("name")?.let { put("name", JsonPrimitive(it)) }
                            }, "Launching the Cursor agent…") { out -> GhResult("launched", "Cursor agent launched; it opens a PR when it is done.", out.str("url"), "Open the agent") }
                        }
                    }
                }
                RowResult(s.ghRows["worker:$id"])
            }
        }
        Muted("Flash takes test and config fixes and Pro takes code; a failed Flash run tries once more on Pro. Prices are rounded up, so the meter overstates.")
    }
}

@Composable
private fun AgentDialog(d: AgentDraft?, vm: JarvisViewModel, sp: Github.Spend?, close: () -> Unit) {
    if (d == null) return
    var text by remember(d) { mutableStateOf(d.prompt) }
    val ownRepo = d.repo == null || d.repo == "kaanmuar/kaanmuar.github.io"
    val capped = sp?.level == "over"
    val launch = { engine: String ->
        val p = text.trim()
        if (p.isNotEmpty()) {
            vm.ghRow(d.key, "github-agent", buildMap {
                put("prompt", JsonPrimitive(p))
                put("engine", JsonPrimitive(engine))
                d.branch?.let { put("branch", JsonPrimitive(it)) }
                d.pr?.let { put("pr", JsonPrimitive(it)) }
                d.repo?.let { put("repo", JsonPrimitive(it)) }
                d.name?.let { put("name", JsonPrimitive(it)) }
            }, "Launching the agent…") { out ->
                if (engine == "worker") vm.loadWorker()
                GhResult("launched", "Agent launched; it opens a PR when it is done.", out.str("url"), if (engine == "worker") "Open the worker runs" else "Open the agent")
            }
            close()
        }
    }
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Launch a fix agent?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Muted(listOfNotNull(d.title, d.branch?.let { "branch $it" }, d.pr?.let { "PR #$it" }).joinToString(" · "))
                OutlinedTextField(text, { text = it }, label = { Text("Prompt") }, minLines = 4, maxLines = 10, modifier = Modifier.fillMaxWidth())
                Muted(when {
                    !ownRepo -> "A Cursor agent works in the cloud and opens a PR."
                    capped -> "Jarvis's worker is stopped: its AI budget for ${sp?.month} is used (${Github.usd(sp?.usd ?: 0.0)} of ${Github.usd(sp?.cap ?: 0.0)}). Cursor uses Cursor credit."
                    else -> "Jarvis's worker runs on GitHub Actions and opens a PR when the tests pass." + (sp?.let { " This month: ${Github.usd(it.usd)} of ${Github.usd(it.cap)}." } ?: "") + " Cursor uses Cursor credit."
                })
            }
        },
        confirmButton = {
            Row {
                TextButton({ launch("cursor") }) { Text("Cursor", color = if (capped) J.cyan else J.muted) }
                if (ownRepo && !capped) TextButton({ launch("worker") }) { Text("Jarvis worker", color = J.cyan) }
            }
        },
        dismissButton = { TextButton(close) { Text("Cancel", color = J.muted) } }
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Deck(s: UiState, vm: JarvisViewModel, modifier: Modifier, launch: (AgentDraft) -> Unit, ask: (String, () -> Unit) -> Unit, sync: () -> Unit) {
    Panel("Command deck", modifier, id = "github-deck") {
        var task by rememberSaveable { mutableStateOf("") }
        var branch by rememberSaveable { mutableStateOf("") }
        OutlinedTextField(task, { task = it }, label = { Text("Task for an agent") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(branch, { branch = it.trim() }, label = { Text("Branch (optional)") }, singleLine = true, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            ActionButton("Draft", s.ghRows["deck"]?.state == "running") {
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
