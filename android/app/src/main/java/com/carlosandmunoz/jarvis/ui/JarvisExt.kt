package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
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
import com.carlosandmunoz.jarvis.data.pairs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Shared helpers for external.* product tabs (#4242): KPIs, row lists, links and actions. */
internal fun JsonObject?.section(key: String): JsonObject? = this?.obj(key)?.takeIf { it.isOk() || it.objs("rows").isNotEmpty() || it.objs("kpis").isNotEmpty() || it.objs("items").isNotEmpty() }

internal fun JsonObject?.sectionRows(key: String) = section(key)?.objs("rows")?.ifEmpty { section(key)?.objs("items") } ?: emptyList()

@Composable
internal fun ExtTabWait(tab: String, waitId: String, raw: JsonObject?, message: String) {
    Panel(tab, id = waitId) { Muted(raw?.str("error") ?: message) }
}

@Composable
internal fun ExtKpiBlock(block: JsonObject?) {
    val kpis = block?.objs("kpis")?.map(::kpiOf) ?: emptyList()
    if (kpis.isNotEmpty()) KpiPairs(kpis)
}

@Composable
internal fun ExtRowList(rows: List<JsonObject>, empty: String) {
    if (rows.isEmpty()) Muted(empty)
    else rows.take(40).forEach { r -> ExtRow(r) }
}

@Composable
private fun ExtRow(r: JsonObject) {
    val uri = LocalUriHandler.current
    val left = r.str("label") ?: r.str("title") ?: r.str("name") ?: r.str("id") ?: ""
    val right = r.str("value") ?: r.num("value")?.let { fmt(it) } ?: r.str("status") ?: r.str("count") ?: ""
    val tone = when (r.str("level") ?: r.str("status")) {
        "alert", "failed", "overdue" -> J.pink
        "warn", "stale", "pending" -> J.amber
        "good", "ok", "done", "signed" -> J.green
        else -> J.text
    }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
            KeyRow(left, right, tone)
            val sub = listOfNotNull(r.str("note"), r.str("summary"), ago(r.str("at"))).joinToString(" · ").ifEmpty { null }
            sub?.let { Muted(it) }
        }
        r.str("url")?.takeIf { it.startsWith("http") }?.let { url -> TextButton({ uri.openUri(url) }) { Text("Open", color = J.cyan, fontSize = 13.sp) } }
    }
}

@Composable
internal fun ExtSectionPanel(id: String, title: String, block: JsonObject?, empty: String, body: @Composable (JsonObject) -> Unit) {
    Panel(title, id = id) {
        val data = block?.takeIf { it.isOk() || it.objs("rows").isNotEmpty() || it.objs("items").isNotEmpty() || it.objs("kpis").isNotEmpty() }
        if (data == null) Muted(block?.str("error") ?: empty)
        else body(data)
    }
}

@Composable
internal fun ExtTopListPanel(id: String, title: String, block: JsonObject?, pairKey: String = "pairs", empty: String = "Nothing to list yet.") {
    Panel(title, id = id) {
        val data = block?.takeIf { it.isOk() }
        val pairs = data?.pairs(pairKey)?.ifEmpty { data.pairs("top") } ?: emptyList()
        if (pairs.isEmpty()) Muted(block?.str("error") ?: empty)
        else pairs.take(12).forEach { (k, v) -> KeyRow(k, fmt(v)) }
    }
}

@Composable
internal fun ExtLinksPanel(id: String, block: JsonObject?, defaults: List<Pair<String, String>> = emptyList()) {
    val uri = LocalUriHandler.current
    Panel("Links", id = id) {
        val rows = block?.objs("rows")?.ifEmpty { block.objs("items") } ?: emptyList()
        val links = if (rows.isNotEmpty()) rows.mapNotNull { r ->
            val url = r.str("url") ?: return@mapNotNull null
            (r.str("label") ?: url) to url
        } else defaults
        if (links.isEmpty()) Muted("No links yet.")
        else Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            links.forEach { (label, url) ->
                TextButton({ uri.openUri(url) }) { Text(label, color = J.cyan, fontSize = 13.sp, fontWeight = FontWeight.Medium) }
            }
        }
    }
}

@Composable
internal fun ExtActionsPanel(prefix: String, id: String, block: JsonObject?, s: UiState, vm: JarvisViewModel, defaults: List<Pair<String, String>> = emptyList()) {
    val uri = LocalUriHandler.current
    Panel("Actions", id = id) {
        val rows = block?.objs("rows")?.ifEmpty { block.objs("items") } ?: emptyList()
        if (rows.isEmpty() && defaults.isEmpty()) Muted("No actions yet.")
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            rows.forEach { a ->
                val label = a.str("label") ?: a.str("action") ?: return@forEach
                val key = a.str("key") ?: "$prefix:${a.str("action") ?: label}"
                val op = a.str("op") ?: "run-job"
                val job = a.str("job")
                ActionButton(label, key in s.running) {
                    when {
                        a.str("url")?.startsWith("http") == true -> uri.openUri(a.str("url")!!)
                        job != null -> vm.act(key, op, mapOf("job" to JsonPrimitive(job))) { it.str("note") ?: "Started $label." }
                        a.str("op") != null -> vm.act(key, op, emptyMap()) { it.str("label") ?: "Done." }
                        else -> vm.act(key, op, emptyMap()) { it.str("note") ?: "Done." }
                    }
                }
            }
            defaults.forEach { (label, url) ->
                TextButton({ uri.openUri(url) }) { Text(label, color = J.cyan, fontSize = 13.sp) }
            }
        }
    }
}