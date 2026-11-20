package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** The modes a kind can render in, as (mode, label). A skit keeps its actors' voices, so it has no re-voice. */
fun studioModes(kind: String): List<Pair<String, String>> =
    if (kind == "skit") listOf("render" to "Render", "captions" to "Captions only")
    else listOf("render" to "Render", "rotate" to "Re-voice", "captions" to "Captions only")

/** The sources or skits the studio op lists for a kind, as (id, label); a skit shows the languages it has takes for. */
fun studioNames(studio: JsonObject?, kind: String): List<Pair<String, String>> =
    if (kind == "skit") studio.objs("skits").map { s ->
        val takes = (s["takes"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        s.str("id").orEmpty() to s.str("id").orEmpty() + if (takes.isEmpty()) " (no takes yet)" else " (${takes.joinToString(", ")})"
    }
    else (studio?.get("sources") as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.map { it to it }

/** The studio-render request: blanks dropped, and posts or languages only where the kind takes them. */
fun studioRequest(kind: String, name: String, mode: String, start: String, picks: String, ticket: String): Map<String, String> =
    linkedMapOf("kind" to kind, "name" to name, "mode" to mode, "start" to start, (if (kind == "skit") "langs" else "tips") to picks, "ticket" to ticket.removePrefix("#"))
        .mapValues { it.value.trim() }.filterValues { it.isNotEmpty() }

/** Studio (#1981): clip and skit renders run in GitHub Actions; review links land in a PR and on the ticket. */
@Composable
fun StudioPanel(s: UiState, vm: JarvisViewModel) {
    val uri = LocalUriHandler.current
    var kind by rememberSaveable { mutableStateOf("tips") }
    var name by rememberSaveable { mutableStateOf("") }
    var mode by rememberSaveable { mutableStateOf("render") }
    var start by rememberSaveable { mutableStateOf("") }
    var picks by rememberSaveable { mutableStateOf("") }
    var ticket by rememberSaveable { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf(false) }
    val names = studioNames(s.studio, kind)
    Panel("Studio renders", id = "hub-studio") {
        Muted("Renders in GitHub Actions, then opens a PR with clip links; merging it makes the clips live and queues the batch in Buffer. Skit takes go in the ${s.studio?.str("takes") ?: "skit-takes"} release as <skit>-<lang>.mp4.")
        Row(verticalAlignment = Alignment.CenterVertically) {
            listOf("tips" to "Tips source", "skit" to "Skit").forEach { (k, label) ->
                TextButton({ if (kind != k) { kind = k; name = ""; mode = "render"; picks = "" } }) {
                    Text(label, color = if (kind == k) J.cyan else J.muted, fontWeight = if (kind == k) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
        Box {
            TextButton({ open = true }) { Text(names.firstOrNull { it.first == name }?.second ?: if (kind == "skit") "Pick a skit" else "Pick a source", color = J.cyan) }
            DropdownMenu(open, { open = false }) {
                if (names.isEmpty()) DropdownMenuItem({ Text(if ("social" in s.running) "Reading…" else "Nothing to render") }, { open = false })
                names.forEach { (id, label) -> DropdownMenuItem({ Text(label) }, { name = id; open = false }) }
            }
        }
        Row {
            studioModes(kind).forEach { (m, label) ->
                TextButton({ mode = m }) { Text(label, color = if (mode == m) J.cyan else J.muted, fontSize = 13.sp, fontWeight = if (mode == m) FontWeight.Bold else FontWeight.Normal) }
            }
        }
        OutlinedTextField(start, { start = it }, label = { Text("First day (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(picks, { picks = it }, label = { Text(if (kind == "skit") "Languages, e.g. en,es" else "Posts (ids, comma-separated)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(ticket, { ticket = it }, label = { Text("Ticket for the review links") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        ActionButton("Render", "studio-render" in s.running) { if (name.isNotEmpty()) vm.startRender(studioRequest(kind, name, mode, start, picks, ticket)) }
        s.studio.objs("runs").forEach { r ->
            val running = r.str("status").let { it != null && it != "completed" && it.isNotEmpty() }
            val result = r.str("conclusion").orEmpty()
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(r.str("name").orEmpty(), fontWeight = FontWeight.Medium, fontSize = 13.sp)
                    Muted(listOfNotNull(ago(r.str("at")), r.str("event")).joinToString(" · "))
                }
                TextButton({ r.str("url")?.takeIf { it.startsWith("https://") }?.let(uri::openUri) }) {
                    Text(if (running) "running" else result.replace('_', ' ').ifEmpty { "—" }, color = when { running -> J.amber; result == "success" -> J.green; else -> J.pink }, fontSize = 13.sp)
                }
            }
        }
    }
}
