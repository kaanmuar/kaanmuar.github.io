package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Owner notices waiting for Send or Drop (#1420): the same list and decision as the review desk and web Jarvis. */
@Composable
fun Approvals(s: UiState, vm: JarvisViewModel) {
    LaunchedEffect(Unit) { if (s.notices == null) vm.loadNotices() }
    val list = s.notices.objs("notices")
    var confirm by remember { mutableStateOf<Pair<String, String>?>(null) }
    Panel("Approvals" + if (list.isNotEmpty()) " (${list.size})" else "") {
        when {
            s.notices == null -> Muted(if ("notices" in s.running) "Reading the owner notices waiting for you…" else "Pull down to load the owner notices.")
            list.isEmpty() -> Muted("No owner notices are waiting.")
            else -> {
                Muted(if (s.notices.bool("auto") == true) "Auto-send is on: a notice goes out by itself once its Live Report is public. Decide one here to act now."
                    else "Auto-send is off: each notice waits for you.")
                list.forEach { n -> Notice(n, s, vm) { email -> confirm = n.str("domain").orEmpty() to email } }
            }
        }
    }
    confirm?.let { (domain, email) ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Send the owner notice?") },
            text = { Text("$domain will get the notice at $email, with a link to its Live Report.") },
            confirmButton = { TextButton({ vm.decideNotice(domain, true, email); confirm = null }) { Text("Send", color = J.cyan) } },
            dismissButton = { TextButton({ confirm = null }) { Text("Cancel", color = J.muted) } },
            containerColor = J.bg,
        )
    }
}

@Composable
private fun Notice(n: JsonObject, s: UiState, vm: JarvisViewModel, send: (String) -> Unit) {
    val domain = n.str("domain").orEmpty()
    val host = n.str("host") ?: domain
    val critical = n.bool("critical") == true
    val accent = if (critical) J.pink else J.cyan
    val candidates = n.objs("candidates").ifEmpty { listOf(JsonObject(mapOf("email" to JsonPrimitive(n.str("email").orEmpty()), "sources" to JsonArray(emptyList())))) }
    var email by rememberSaveable(domain) { mutableStateOf(n.str("email") ?: candidates.first().str("email").orEmpty()) }
    val busy = "notice:$domain" in s.running
    val error = s.noticeErrors[domain] ?: n.str("lastError")?.takeIf { it.isNotBlank() }
    val uri = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().padding(top = 10.dp).height(IntrinsicSize.Min).clip(RoundedCornerShape(10.dp))
            .background(J.bg.copy(alpha = 0.55f)).border(1.dp, accent.copy(alpha = 0.25f), RoundedCornerShape(10.dp)),
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(accent))
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(host, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f, fill = false))
                if (critical) Text("CRITICAL", color = J.pink, fontSize = 10.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold)
            }
            ago(n.str("createdAt"))?.let { Muted("Queued $it") }
            candidates.take(4).forEach { c ->
                val e = c.str("email").orEmpty()
                val how = (c["sources"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty().joinToString(", ") + if (c.bool("onDomain") == true) " · on the site" else ""
                Row(Modifier.fillMaxWidth().clickable(!busy) { email = e }, verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(email == e, { email = e }, enabled = !busy, colors = RadioButtonDefaults.colors(selectedColor = J.cyan))
                    Column { Text(e, fontSize = 13.sp); if (how.isNotBlank()) Text(how, color = J.dim, fontSize = 11.sp) }
                }
            }
            error?.let { Text("Last try: $it", color = J.amber, fontSize = 12.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton({ send(email) }, enabled = !busy && email.isNotBlank()) { Text(if (busy) "Working…" else "Send", color = J.cyan, fontWeight = FontWeight.Bold) }
                TextButton({ vm.decideNotice(domain, false, email) }, enabled = !busy) { Text("Drop", color = J.muted) }
                n.str("report")?.takeIf { it.startsWith("https://") }?.let { link -> TextButton({ uri.openUri(link) }) { Text("Review →", color = J.cyan) } }
                TextButton({ uri.openUri("https://$host") }) { Text("Site →", color = J.dim) }
            }
        }
    }
}
