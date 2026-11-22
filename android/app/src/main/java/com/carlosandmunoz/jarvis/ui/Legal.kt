package com.carlosandmunoz.jarvis.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject

private val LEGAL_LINKS = listOf(
    "Legal page" to "https://carlosandmunoz.com/qa-review-legal.html",
    "How reviews work" to "https://carlosandmunoz.com/qa-review-guide.html",
)

/** Jarvis > Legal (#4242): clauses, sign-off, watch and cited sources from snapshot external.legal. */
@Composable
fun LegalScreen(s: UiState, vm: JarvisViewModel) {
    val ext = s.snapshot.obj("external")
    val raw = ext.obj("legal")
    val data = raw?.takeIf { it.isOk() }
    if (data == null) {
        ExtTabWait("Legal", "legal-wait", raw, "Pull down to load legal clauses and watch.")
        Needs(raw)
        return
    }

    ExtSectionPanel("legal-clauses", "Clauses", data.obj("clauses"), "No clauses loaded.") { block ->
        ExtKpiBlock(block)
        block.str("at")?.let { Muted("Updated ${ago(it) ?: it}") }
        ExtRowList(block.objs("rows"), "No clauses in legal/clauses.json yet.")
    }

    ExtSectionPanel("legal-signoff", "Sign-off", data.obj("signoff"), "Sign-off not loaded.") { block ->
        KpiPairs(listOf(
            KpiData("Signed", fmt(block.num("signed") ?: block.objs("rows").count { it.str("status") == "signed" }.toDouble())),
            KpiData("Pending", fmt(block.num("pending")), alert = (block.num("pending") ?: 0.0) > 0),
            KpiData("Version", block.str("version") ?: "—"),
        ))
        ExtRowList(block.objs("rows"), "Run node scripts/legal-signoff.js after clause edits.")
    }

    ExtSectionPanel("legal-watch", "Source watch", data.obj("watch"), "Legal watch has not run yet.") { block ->
        KpiPairs(listOf(
            KpiData("Checked", fmt(block.num("checked"))),
            KpiData("Changed", fmt(block.num("changed")), alert = (block.num("changed") ?: 0.0) > 0),
            KpiData("Last run", ago(block.str("at")) ?: "—"),
        ))
        ExtRowList(block.objs("rows"), "Weekly watch reads cited law pages (functions/legal-watch.js).")
    }

    ExtSectionPanel("legal-changes", "Changes", data.obj("changes"), "No source changes on file.") { block ->
        ExtRowList(block.objs("rows"), "When a cited page changes, rows land here for your review.")
    }

    ExtSectionPanel("legal-cites", "Citations", data.obj("cites"), "No citations yet.") { block ->
        ExtRowList(block.objs("rows"), "Each clause lists official cites in legal/clauses.json.")
    }

    ExtSectionPanel("legal-issues", "Open issues", data.obj("issues"), "No open legal issues.") { block ->
        val rows = block.objs("rows")
        if (rows.isEmpty()) Muted("No GitHub issues from legal watch.")
        else rows.take(20).forEach { r ->
            Text(r.str("title") ?: r.str("label") ?: "#${r.num("number")?.toInt()}", fontSize = 14.sp, color = if (r.bool("open") == false) J.muted else J.text)
            Muted(listOfNotNull(r.str("state"), ago(r.str("at"))).joinToString(" · "))
        }
    }

    ExtSectionPanel("legal-jurisdictions", "Jurisdictions", data.obj("jurisdictions"), "No jurisdictions listed.") { block ->
        val pairs = block.pairs("byPack").ifEmpty { block.pairs("pairs") }
        if (pairs.isNotEmpty()) TopList("By compliance pack", pairs, id = "legal-jurisdictions")
        else ExtRowList(block.objs("rows"), "Compliance packs list jurisdictions per product.")
    }

    ExtLinksPanel("legal-links", data.obj("links"), LEGAL_LINKS)
    ExtActionsPanel("legal", "legal-actions", data.obj("actions"), s, vm, listOf("Open legal page" to "https://carlosandmunoz.com/qa-review-legal.html"))
    Needs(raw)
}
