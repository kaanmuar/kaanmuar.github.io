package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

private val SCOUT_LABEL = mapOf(
    "tool" to "Tool scout",
    "engagement" to "Engagement",
    "field-sweep" to "Field sweep",
    "trending" to "Trending",
)

/** Jarvis > Learn (#4237 / #4240): private scout lessons, decide options, study board and charts. */
@Composable
fun LearnScreen(s: UiState, vm: JarvisViewModel, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        val g = s.snapshot.obj("external").obj("scout-learn")?.takeIf { it.isOk() || it.str("at") != null }
        if (g == null) {
            Panel("Learn", id = "learn-wait") {
                Muted(s.snapshot.obj("external").obj("scout-learn").str("error") ?: "Pull down to load scout learning (private, Firestore).")
            }
            return@Column
        }
        val open = g.objs("openQuestions")
        val scouts = g.objs("scouts")
        val asked = g.objs("asked")
        val waiting = (g.num("waiting") ?: open.size.toDouble()).toInt()
        val byId = scouts.associateBy { it.str("scout") ?: "" }
        val board = g.obj("board")
        val tot = board.obj("totals")

        Panel("Learn", id = "learn-summary") {
            KpiPairs(
                listOf(
                    KpiData("Open asks", fmt(tot.num("open") ?: waiting.toDouble()), alert = (tot.num("open") ?: waiting.toDouble()) > 0),
                    KpiData("Scouts", fmt(tot.num("scouts") ?: scouts.size.toDouble())),
                    KpiData("Learn runs", fmt(tot.num("runs"))),
                    KpiData("Lessons", fmt(tot.num("lessons"))),
                    KpiData("Knowledge", fmt(tot.num("knowledge"))),
                    KpiData("Decisions", fmt(tot.num("answered"))),
                    KpiData("Exceptions", fmt(tot.num("exceptions"))),
                    KpiData("Updated", ago(g.str("at")) ?: "—"),
                )
            )
        }

        if (scouts.isEmpty() && open.isEmpty()) {
            Panel("Learn", id = "learn-empty") {
                Muted("No scout has learned yet. After the next tool, engagement, field-sweep or trending run, lessons and questions land here (Firestore, private).")
            }
            LearnCharts(board)
            LearnGuidesAppend(s, vm)
            Muted("Learning is for you and the scouts only — never public posts or tool-scout PR bodies. Cadence: tool 7d · engagement 2d · field & trending 3d.")
            return@Column
        }

        Panel("Decide" + if (waiting > 0) " · $waiting" else "", id = "learn-decide") {
            if (open.isEmpty()) {
                Muted("No open questions. Scouts ask on their cadence when something needs a decision.")
            } else {
                open.forEach { q -> LearnQuestion(s, q, vm) }
            }
            Muted("Private (#4237). Pick an option; the scout stores your answer as a lesson. Ask later leaves it open.")
        }

        Panel("Recent decisions", id = "learn-asked") {
            if (asked.isEmpty()) Muted("Decisions you make here become lessons for that scout.")
            else asked.take(8).forEach { a ->
                KeyRow(
                    SCOUT_LABEL[a.str("scout")] ?: a.str("scout") ?: "scout",
                    listOfNotNull(a.str("note") ?: a.str("option"), ago(a.str("at"))).joinToString(" · "),
                )
                a.str("text")?.takeIf { it.isNotBlank() }?.let { Muted(it.take(160)) }
            }
        }

        LearnCharts(board)

        LearnScoutPanel("tool", byId["tool"])
        LearnScoutPanel("engagement", byId["engagement"])
        LearnScoutPanel("field-sweep", byId["field-sweep"])
        LearnScoutPanel("trending", byId["trending"])

        LearnGuidesAppend(s, vm)
        Muted("Learning is for you and the scouts only — never public posts or tool-scout PR bodies. Cadence: tool 7d · engagement 2d · field & trending 3d. Charts (#4240) read the same private Firestore state.")
    }
}

private val LEARN_GUIDE_LINKS = listOf("Review guide" to "https://carlosandmunoz.com/qa-review-guide.html")

/** When external.learn is loaded (#4242), append hub guides without replacing scout-learn (#4237). */
@Composable
private fun LearnGuidesAppend(s: UiState, vm: JarvisViewModel) {
    val learn = s.snapshot.obj("external").obj("learn")?.takeIf { it.isOk() } ?: return
    ExtSectionPanel("learn-guides", "Guides", learn.obj("guides"), "No guides in the learn source yet.") { block ->
        ExtKpiBlock(block)
        ExtRowList(block.objs("rows"), "Site and hub guides from the learn snapshot.")
    }
    learn.obj("locks")?.takeIf { it.isOk() || it.objs("rows").isNotEmpty() }?.let { locks ->
        ExtSectionPanel("learn-locks", "Growth locks", locks, "No locks listed.") { block -> ExtRowList(block.objs("rows"), "") }
    }
    ExtSectionPanel("learn-videos", "Explainer videos", learn.obj("videos"), "No explainer video ticket yet.") { block ->
        ExtRowList(block.objs("rows").ifEmpty { learn.objs("videos") }, "Track #3714 for explainer videos.")
    }
    ExtLinksPanel("learn-links", learn.obj("links"), LEARN_GUIDE_LINKS)
    learn.obj("actions")?.objs("rows")?.takeIf { it.isNotEmpty() }?.let {
        ExtActionsPanel("learn", "learn-actions", learn.obj("actions"), s.running) { key, op, body, note ->
            vm.act(key, op, body, note)
        }
    }
}

@Composable
private fun LearnCharts(board: JsonObject?) {
    val study = board.arr("study").mapNotNull { el ->
        when (el) {
            is JsonPrimitive -> el.contentOrNull
            is JsonObject -> el.str("text")
            else -> null
        }
    }.filter { !it.isNullOrBlank() }
    Panel("Study board", id = "learn-study") {
        if (study.isEmpty()) Muted("Study notes appear after scouts have run and learned.")
        else study.take(8).forEach { Text("· $it", fontSize = 13.sp, color = J.text) }
        Muted("Private analysis (#4240). Built from Firestore learn state — not public posts.")
    }

    val runs = board.objs("runsByScout")
    Panel("Runs by scout", id = "learn-runs") {
        if (runs.isEmpty()) Muted("No learn runs yet.")
        else BarChart(
            runs.map { it.num("value") ?: 0.0 },
            runs.map { it.str("label").orEmpty() },
            J.cyan,
            title = "Learn runs stored per scout",
            yLabel = "runs",
            unit = "runs",
            legend = "Runs",
        )
    }

    val lessons = board.objs("lessonsByScout")
    Panel("Lessons by scout", id = "learn-lessons") {
        if (lessons.isEmpty()) Muted("No lessons yet.")
        else BarChart(
            lessons.map { it.num("value") ?: 0.0 },
            lessons.map { it.str("label").orEmpty() },
            J.amber,
            title = "Lessons on file",
            yLabel = "lessons",
            unit = "lessons",
            legend = "Lessons",
        )
    }

    val openAsks = board.objs("openByScout")
    Panel("Open asks by scout", id = "learn-open") {
        if (openAsks.isEmpty()) Muted("No open asks.")
        else BarChart(
            openAsks.map { it.num("value") ?: 0.0 },
            openAsks.map { it.str("label").orEmpty() },
            J.pink,
            title = "Questions waiting",
            yLabel = "asks",
            unit = "asks",
            legend = "Open",
        )
    }

    val odds = board.objs("odds")
    Panel("Odds board", id = "learn-odds-chart") {
        if (odds.isEmpty()) Muted("No odds yet — they appear after a scout run with findings.")
        else BarChart(
            odds.map { it.num("value") ?: 0.0 },
            odds.map { (it.str("label") ?: "").take(18) },
            J.violet,
            title = "Top odds (percent)",
            yLabel = "p × 100",
            unit = "%",
            legend = "Odds",
        )
    }

    val decisions = board.objs("decisions")
    Panel("Decisions", id = "learn-decisions") {
        if (decisions.isEmpty()) Muted("No decisions yet. Pick options on Decide.")
        else BarChart(
            decisions.map { it.num("value") ?: 0.0 },
            decisions.map { it.str("label").orEmpty() },
            J.green,
            title = "Decisions by option",
            yLabel = "count",
            unit = "decisions",
            legend = "Decisions",
        )
    }

    val daily = board.objs("daily")
    if (daily.isNotEmpty()) Panel("Learn runs · last days", id = "learn-trend") {
        BarChart(
            daily.map { it.num("runs") ?: 0.0 },
            daily.map { it.str("day").orEmpty().takeLast(5) },
            J.green,
            title = "Scout learn envelopes per day",
            yLabel = "runs",
            unit = "runs",
            legend = "Runs",
        )
        if (daily.any { (it.num("questions") ?: 0.0) > 0 }) {
            BarChart(
                daily.map { it.num("questions") ?: 0.0 },
                daily.map { it.str("day").orEmpty().takeLast(5) },
                J.amber,
                title = "Questions opened per day",
                yLabel = "asks",
                unit = "asks",
                legend = "Asks",
            )
        }
    }
}

@Composable
private fun LearnScoutPanel(scoutId: String, scout: JsonObject?) {
    if (scout == null) return
    Panel(
        (SCOUT_LABEL[scoutId] ?: scoutId) + (scout.num("runs")?.let { " · ${fmt(it)} runs" } ?: ""),
        id = when (scoutId) {
            "tool" -> "learn-tool"
            "engagement" -> "learn-engagement"
            "field-sweep" -> "learn-field-sweep"
            "trending" -> "learn-trending"
            else -> return
        },
    ) {
        Muted("Private · updated ${ago(scout.str("at")) ?: "—"}")
        scout.arr("lessons").take(4).forEach { el ->
            val t = when (el) {
                is JsonPrimitive -> el.contentOrNull
                is JsonObject -> el.str("text")
                else -> null
            }
            if (!t.isNullOrBlank()) Text("· $t", fontSize = 12.sp, color = J.dim)
        }
        scout.objs("odds").take(3).forEach { o ->
            KeyRow("${((o.num("p") ?: 0.0) * 100).toInt()}%", o.str("claim") ?: o.str("id") ?: "")
        }
        scout.objs("exceptions").take(2).forEach { e ->
            Muted(e.str("reason") ?: e.str("id") ?: "")
        }
    }
}

@Composable
private fun LearnQuestion(s: UiState, q: JsonObject, vm: JarvisViewModel) {
    val id = q.str("id") ?: return
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(SCOUT_LABEL[q.str("scout")] ?: q.str("scout") ?: "", fontSize = 12.sp, color = J.amber)
        Text(q.str("text") ?: id, fontSize = 14.sp)
        q.str("why")?.takeIf { it.isNotBlank() }?.let { Muted(it) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            q.objs("options").forEach { opt ->
                val oid = opt.str("id") ?: return@forEach
                val label = opt.str("label") ?: oid
                val key = "learn:$id:$oid"
                ActionButton(label, key in s.running) {
                    vm.act(key, "scout-learn-decide", mapOf("id" to JsonPrimitive(id), "option" to JsonPrimitive(oid))) {
                        if (oid == "later") "Left open." else "Saved for the scout."
                    }
                }
            }
        }
    }
}
