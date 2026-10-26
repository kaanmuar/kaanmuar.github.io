package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.text
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** What to do next, by impact: the snapshot's rule proposals at once, then Gemini's ranking from the proposals op. Done and Dismiss are saved on the server, like on the web. */
@Composable
fun Proposals(s: UiState, open: (String) -> Unit) {
    val app = LocalContext.current.applicationContext as JarvisApp
    val scope = rememberCoroutineScope()
    var ranked by remember { mutableStateOf<JsonObject?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var gone by remember { mutableStateOf(setOf<String>()) }
    var round by remember { mutableStateOf(0) }

    LaunchedEffect(s.days, s.savedAt, round) {
        if (!s.signedIn || s.email == "fixture") return@LaunchedEffect
        busy = true
        error = null
        runCatching { app.api.call("proposals", s.days) }
            .onSuccess { ranked = it; gone = emptySet() }
            .onFailure { error = it.message ?: "Jarvis could not rank." }
        busy = false
    }

    fun mark(p: JsonObject, status: String) {
        val key = p.str("key") ?: return
        gone = gone + key
        scope.launch {
            runCatching { app.api.call("proposal-mark", s.days, mapOf("key" to JsonPrimitive(key), "status" to JsonPrimitive(status), "title" to JsonPrimitive(p.str("title") ?: ""))) }
                .onFailure { gone = gone - key; error = it.message ?: "Not saved." }
        }
    }

    val r = ranked
    val list = (r?.objs("proposals") ?: s.snapshot.objs("proposals")).filter { it.str("key") !in gone }
    val note = when {
        busy -> "Gemini is ranking…"
        error != null -> "Rules only. $error"
        r?.bool("gemini") == true -> "Ranked by Gemini"
        r != null -> "Rules only" + (r.str("error")?.takeIf { it.isNotBlank() }?.let { ". Gemini: $it" } ?: "")
        else -> "From the rules"
    }
    Panel("Proposals", trailing = { TextButton(onClick = { round++ }, enabled = !busy) { Text(if (busy) "Ranking…" else "Rank again") } }) {
        Muted(note)
        if (list.isEmpty()) Muted(if (busy) "Reading the sources…" else "Nothing to propose right now.")
        list.forEachIndexed { i, p -> ProposalRow(i + 1, p, open) { status -> mark(p, status) } }
    }
}

@Composable
private fun ProposalRow(rank: Int, p: JsonObject, open: (String) -> Unit, mark: (String) -> Unit) {
    val uri = LocalUriHandler.current
    Row(verticalAlignment = Alignment.Top) {
        Text("$rank", fontFamily = Mono, fontSize = 18.sp, color = J.level(p.str("level")), modifier = Modifier.width(26.dp))
        Column(Modifier.weight(1f)) {
            Text(p.str("title") ?: "", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            val tags = listOfNotNull("impact " + fmt(p.num("impact")) + "/5", p.str("effort"), if (p.str("source") == "gemini") "from Gemini" else null, p.str("action")?.let { "safe action" })
            Text(tags.joinToString(" · "), fontFamily = Mono, fontSize = 11.sp, color = J.dim)
            p.str("why")?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 13.sp, color = J.muted) }
            p.arr("evidence").forEach { Text("• " + it.text(), fontSize = 12.sp, color = J.muted) }
            Row {
                val tab = p.str("tab")
                if (tab != null && tab in CHIPS.toMap()) TextButton(onClick = { open(tab) }) { Text("Open") }
                p.str("link")?.let { link -> TextButton(onClick = { runCatching { uri.openUri(link) } }) { Text("Open ↗") } }
                TextButton(onClick = { mark("done") }) { Text("Done") }
                TextButton(onClick = { mark("dismissed") }) { Text("Dismiss", color = J.muted) }
            }
        }
    }
}
