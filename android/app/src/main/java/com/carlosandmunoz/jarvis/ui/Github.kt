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
        Muted("Repos: " + Github.shownRepos(gh).joinToString(", ") + " · read " + (ago(gh.str("at")) ?: "—"))
    }

    // Every column across when it fits; on a cover screen a row that scrolls and stops on a column. A tap lists the column's cards.
    val stages = Github.stages(board, gh.objs("flow"))
    var flowOpen by rememberSaveable { mutableStateOf<String?>(null) }
    if (stages.isNotEmpty()) Panel("Process map", span) {
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
        val days = daily.map { it.str("day").orEmpty() }
        BarChart(daily.map { it.num("runs") ?: 0.0 }, days, title = "Workflow runs per day", yLabel = "runs per day", unit = "runs", legend = "Runs")
        if (daily.size >= 2) Sparkline(daily.map { it.num("failed") ?: 0.0 }, J.pink, title = "Failed runs per day", unit = "runs", labels = days, legend = "Failed")
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
        if (daily.size >= 2) {
            val days = daily.map { it.str("day").orEmpty() }
            Sparkline(daily.map { it.num("opened") ?: 0.0 }, J.violet, title = "PRs opened per day", unit = "PRs", labels = days, legend = "Opened")
            Sparkline(daily.map { it.num("merged") ?: 0.0 }, J.green, title = "PRs merged per day", unit = "PRs", labels = days, legend = "Merged")
        }
    }
    TopList("PR sizes", prs.pairs("sizes"), yLabel = "Size (lines: XS <10, S <50, M <250, L <1000)", unit = "open PRs")

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
        if (tp.isNotEmpty()) BarChart(tp.map { it.num("done") ?: 0.0 }, tp.map { it.str("week").orEmpty() }, J.green, 80, title = "Cards done per week", yLabel = "cards per ISO week", unit = "cards", legend = "Reached Done")
        board.objs("aging").take(8).forEach { a -> StatusRow("warn", "#${a.num("number")?.toInt()} ${a.str("title").orEmpty()}", "${a.str("column")} · ${fmt(a.num("days"))} d", a.str("url")) }
        val drift = board.objs("drift")
        if (drift.isNotEmpty()) {
            Text("Drift · ${drift.size}", color = J.amber, fontSize = 13.sp)
            drift.take(8).forEach { d -> StatusRow("warn", "#${d.num("number")?.toInt()} ${d.str("title").orEmpty()}", "${d.str("column")} → ${d.str("should")} · ${d.str("why").orEmpty()}", d.str("url")) }
        }
        ActionButton("Sync the board", running("gh-board-sync", "all")) { ghAct("gh-board-sync", "all", JsonPrimitive("all"), askFor("gh-board-sync", null, null)) }
    }

    var issOpen by rememberSaveable { mutableStateOf<String?>(null) }
    Panel("Issues" + (issues.num("open")?.let { " · ${fmt(it)} open" } ?: "")) {
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
    TopList("Open bugs by area", issues.pairs("bugsByArea"), yLabel = "Area", unit = "open bugs", legend = "Open bugs", open = areaOpen, onRow = { areaOpen = Github.toggle(areaOpen, it) }, footer = {
        areaOpen?.let { k -> DrillBody(Github.areaDrills(issues).firstOrNull { it.key == k }) { areaOpen = null } }
        Muted("Tap an area to list its bugs.")
    })
    TopList("Issues by kind", issues.pairs("byKind"), yLabel = "Kind", unit = "open issues")

    var brOpen by rememberSaveable { mutableStateOf<String?>(null) }
    Panel("Branches" + (branches.num("total")?.let { " · ${fmt(it)}" } ?: "")) {
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
    Panel("Deploys") {
        Github.down(deploys)?.let { Muted(it); return@Panel }
        deploys.objs("last").take(6).forEach { d -> StatusRow(if (d.str("conclusion") == "success") "good" else "alert", d.str("name").orEmpty(), listOfNotNull(d.str("conclusion"), ago(d.str("at")), d.str("sha")?.take(7)).joinToString(" · "), d.str("url")) }
        val daily = deploys.objs("daily")
        if (daily.isNotEmpty()) BarChart(daily.map { (it.num("ok") ?: 0.0) + (it.num("failed") ?: 0.0) }, daily.map { it.str("day").orEmpty() }, J.green, 80,
            title = "Deploys per day", yLabel = "deploys per day", unit = "deploys", legend = "Deploy runs on main")
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
        if (hourly.isNotEmpty()) BarChart(hourly.map { it.num("graphql") ?: 0.0 }, hourly.map { it.str("hour").orEmpty() }, J.violet, 70,
            title = "GraphQL points used per hour", yLabel = "points per hour (UTC)", unit = "points", legend = "kaanmuar GraphQL")
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
        if (daily.size >= 2) {
            val days = daily.map { it.str("day").orEmpty() }
            Sparkline(daily.map { it.num("hours") ?: 0.0 }, J.amber, title = "Agent hours per day", unit = "h", labels = days, legend = "Agent hours")
            Sparkline(daily.map { it.num("tickets") ?: 0.0 }, J.cyan, title = "Tickets worked per day", unit = "tickets", labels = days, legend = "Tickets")
        }
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
        Muted("Showing " + Github.shownRepos(gh).joinToString(", ") + ". Edit the list in Settings › GitHub repos.")
        repos.forEach { r ->
            val red = r.obj("ci").str("conclusion").let { it != null && it != "success" }
            StatusRow(if (red) "alert" else "good", r.str("name").orEmpty() + if (r.bool("private") == true) " · private" else "",
                listOfNotNull(r.str("language"), "${fmt(r.num("openPrs"))} PRs", "${fmt(r.num("openIssues"))} issues", r.obj("ci").str("conclusion")?.let { "CI $it" }, r.obj("security").num("open")?.let { "${fmt(it)} alerts" }, ago(r.str("pushedAt"))).joinToString(" · "))
        }
    }

    val history = gh.objs("history")
    if (history.size >= 2) Panel("Trend · ${history.size} days") {
        val days = history.map { it.str("day").orEmpty() }
        Sparkline(history.map { it.num("score") ?: 0.0 }, J.cyan, title = "Health score", unit = "of 100", labels = days, legend = "Score")
        Sparkline(history.map { Github.rate(it.num("passRate")) ?: 0.0 }, J.green, title = "CI pass rate", unit = "%", labels = days, legend = "Pass rate")
        Sparkline(history.map { it.num("openPrs") ?: 0.0 }, J.violet, title = "Open PRs", unit = "PRs", labels = days, legend = "Open PRs")
        Sparkline(history.map { it.num("openBugs") ?: 0.0 }, J.pink, title = "Open bugs", unit = "bugs", labels = days, legend = "Open bugs")
        Muted("One point per day (UTC); tap a line for that day's value.")
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
