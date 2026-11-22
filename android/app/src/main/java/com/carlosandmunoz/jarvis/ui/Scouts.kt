package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str

/** Jarvis > Scouts (#4242): tool, engagement, field and trending scouts from snapshot external.scouts. */
@Composable
fun ScoutsScreen(s: UiState, vm: JarvisViewModel, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth()) {
        val ext = s.snapshot.obj("external")
        val raw = ext.obj("scouts")
        val data = raw?.takeIf { it.isOk() }
        if (data == null) {
            ExtTabWait("Scouts", "scouts-wait", raw, "Pull down to load scout health and digests.")
            Needs(raw)
            return@Column
        }

        ExtSectionPanel("scouts-health", "Scout health", data.obj("health"), "Scout health not loaded.") { block ->
            ExtKpiBlock(block)
            ExtRowList(block.objs("rows"), "Cadence and last run per scout.")
        }

        ExtSectionPanel("scouts-engagement", "Engagement scout", data.obj("engagement"), "Engagement scout idle.") { block ->
            KpiPairs(listOf(
                KpiData("Runs", fmt(block.num("runs"))),
                KpiData("Drafts", fmt(block.num("drafts"))),
                KpiData("Last run", ago(block.str("at")) ?: "—", alert = block.str("stale") == "true"),
            ))
            ExtRowList(block.objs("rows"), "Meta scout and reply field.")
        }

        ExtSectionPanel("scouts-tools", "Tool scout", data.obj("tools"), "Tool scout idle.") { block ->
            ExtRowList(block.objs("rows"), "Arsenal reviews and tool-scout drafts.")
        }

        ExtSectionPanel("scouts-trending", "Trending", data.obj("trending"), "Trending scout idle.") { block ->
            ExtRowList(block.objs("rows"), "Trending drafts queue (#3814).")
        }

        ExtSectionPanel("scouts-handoff", "Handoffs", data.obj("handoff"), "No handoffs queued.") { block ->
            ExtRowList(block.objs("rows"), "Scout → Jarvis handoff notes.")
        }

        ExtSectionPanel("scouts-digest", "Digest", data.obj("digest"), "No digest yet.") { block ->
            block.str("summary")?.let { Muted(it) }
            ExtRowList(block.objs("rows"), "Latest scout digest across runs.")
        }

        ExtLinksPanel("scouts-links", data.obj("links"))
        ExtActionsPanel("scouts", "scouts-actions", data.obj("actions"), s.running) { key, op, body, note ->
            vm.act(key, op, body, note)
        }
        Needs(raw)
    }
}
