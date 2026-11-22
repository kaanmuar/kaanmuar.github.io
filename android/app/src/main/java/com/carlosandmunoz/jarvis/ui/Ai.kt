package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.pct
import com.carlosandmunoz.jarvis.data.str

private val SHORTCUTS = listOf(
    "Legal clause review" to "Which legal clauses in qa-review-legal still need sign-off before the next publish, and what changed since the last apply?",
    "Scout triage" to "Which open scout-learn questions should I answer first, and what is each scout waiting on?",
    "Growth-lock check" to "Against our growth locks (#3475), what must we refuse or build next — soft gate, Slide 3, MCP, white-label PDF?",
    "URL review ambiguity" to "When a URL review is ambiguous or inconclusive, what do we promise in email and what should rescue do?",
)

private val AI_LINKS = listOf(
    "Vertex console" to "https://console.cloud.google.com/vertex-ai",
    "Systems tab" to "https://carlosandmunoz.com/admin.html#stats/systems/1",
)

/** Jarvis > AI (#4242): Gemini consult first; platform KPIs + proposals/playbooks from snapshot. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AiScreen(s: UiState, vm: JarvisViewModel) {
    ConsultPanel(s, vm)
    PlatformPanel(s)

    val raw = s.snapshot.obj("external").obj("ai")
    val data = raw?.takeIf { it.isOk() }
    if (data == null) {
        Needs(raw)
        return
    }

    ExtSectionPanel("ai-proposals", "Proposals", data.obj("proposals"), "No open proposals.") { block ->
        KpiPairs(listOf(KpiData("Open", fmt(block.num("open") ?: block.objs("rows").size.toDouble()), alert = (block.num("open") ?: 0.0) > 0)))
        ExtRowList(block.objs("rows"), "Gemini-tagged proposals waiting on you.")
    }

    ExtSectionPanel("ai-playbooks", "Playbooks", data.obj("playbooks"), "No playbooks on file.") { block ->
        ExtRowList(block.objs("rows"), "Documented consult recipes.")
    }

    ExtSectionPanel("ai-cost", "Cost", data.obj("cost"), "No cost breakdown yet.") { block ->
        KpiPairs(listOf(
            KpiData("Runs (7d mirror)", fmt(block.num("runs"))),
            KpiData("Note", block.str("note") ?: "—"),
        ))
        Muted("Infra KPIs stay on Systems › Google Cloud.")
    }

    ExtSectionPanel("ai-recent", "Recent", data.obj("recent"), "No recent AI calls.") { block ->
        ExtRowList(block.objs("rows"), "Latest Gemini-tagged countdowns.")
    }

    ExtLinksPanel("ai-links", data.obj("links"), AI_LINKS)
    ExtActionsPanel("ai", "ai-actions", data.obj("actions"), s, vm)
    Needs(raw)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ConsultPanel(s: UiState, vm: JarvisViewModel) {
    var q by rememberSaveable { mutableStateOf("") }
    val turn = s.chat.lastOrNull()
    Panel("Gemini consult", id = "ai-consult") {
        Muted("Ask Jarvis about the numbers. Answers use functions/gemini.js (Vertex → Studio). user-gemini-web MCP is not wired into production.")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 6.dp)) {
            SHORTCUTS.forEach { (label, prompt) ->
                TextButton(onClick = { q = prompt }) { Text(label, fontSize = 12.sp) }
            }
        }
        OutlinedTextField(
            q,
            { q = it },
            modifier = Modifier.fillMaxWidth(),
            minLines = 4,
            maxLines = 8,
            placeholder = { Text("Ask Jarvis: legal clause risk, scout triage, growth locks, URL review ambiguity…") },
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = {
                val question = q.trim()
                if (question.isNotEmpty()) {
                    vm.ask(question)
                    q = ""
                }
            }, enabled = q.isNotBlank()) {
                Icon(Icons.AutoMirrored.Filled.Send, "Ask")
            }
        }
        turn?.let { c ->
            if (c.answer == null) Muted("Thinking…")
            else Text(c.answer, fontSize = 14.sp, color = if (c.error) J.pink else J.text)
        }
    }
}

@Composable
private fun PlatformPanel(s: UiState) {
    val pl = s.snapshot.obj("external").obj("platform")
    if (!pl.isOk()) {
        Panel("Gemini on Google Cloud", id = "ai-platform") {
            Muted(pl?.str("error") ?: "Pull down to load Gemini usage from Monitoring.")
        }
        return
    }
    val g = pl.obj("gemini")
    val thGemini = s.snapshot.obj("thresholds").num("geminiErrorPct") ?: 5.0
    val requests = g.num("requests")
    val ok = g.num("ok")
    val err = g.num("errorRate")
    Panel("Gemini on Google Cloud, last 7 days", id = "ai-platform") {
        KpiPairs(
            listOf(
                KpiData("Requests", fmt(requests)),
                KpiData("Ok", if (requests != null && ok != null) "${fmt(ok)} / ${fmt(requests)}" else "—"),
                KpiData(
                    "Error rate",
                    if (err == null) "—" else pct(err),
                    alert = (requests ?: 0.0) >= 10 && (err ?: 0.0) >= thGemini,
                ),
            ),
        )
        g.objs("failedMethods").take(6).forEach { m ->
            KeyRow(m.str("label") ?: "method", fmt(m.num("value")))
        }
        Muted("From external.platform.gemini — same source as Systems › Google Cloud.")
    }
}
