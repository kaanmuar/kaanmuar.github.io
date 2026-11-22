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

/** Jarvis > Learn (#4237): private scout lessons, odds and decision options for Carlos. */
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

        Panel("Learn", id = "learn-summary") {
            KpiPairs(
                listOf(
                    KpiData("Open asks", waiting.toString(), alert = waiting > 0),
                    KpiData("Scouts", scouts.size.toString()),
                    KpiData("Updated", ago(g.str("at")) ?: "—"),
                )
            )
        }

        if (scouts.isEmpty() && open.isEmpty()) {
            Panel("Learn", id = "learn-empty") {
                Muted("No scout has learned yet. After the next tool, engagement, field-sweep or trending run, lessons and questions land here (Firestore, private).")
            }
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

        // Literal panel ids (parity with web learn-<scout>); $id templates are not allowed.
        LearnScoutPanel("tool", byId["tool"])
        LearnScoutPanel("engagement", byId["engagement"])
        LearnScoutPanel("field-sweep", byId["field-sweep"])
        LearnScoutPanel("trending", byId["trending"])

        Muted("Learning is for you and the scouts only — never public posts or tool-scout PR bodies. Cadence: tool 7d · engagement 2d · field & trending 3d.")
    }
}

@Composable
private fun LearnScoutPanel(scoutId: String, scout: JsonObject?) {
    if (scout == null) return
    // id= when-branches must be string literals for jarvis-panel-ids parity.
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
