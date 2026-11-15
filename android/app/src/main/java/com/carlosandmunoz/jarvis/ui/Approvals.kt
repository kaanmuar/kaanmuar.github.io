package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
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
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The badges an owner notice carries, as (label, J.level level): where it stands, critical, a failed last try, its language. */
internal fun noticeBadges(n: JsonObject, maxTries: Int): List<Pair<String, String>> = listOfNotNull(
    when (n.str("state")) {
        "ready" -> "Ready to send" to "good"
        "waiting" -> "Waiting for Live Report" to "warn"
        "unlisted" -> "Off Live Reports" to "alert"
        "stopped" -> "Asked for no notices" to "alert"
        else -> null
    },
    ("Critical security" to "alert").takeIf { n.bool("critical") == true },
    n.str("lastError")?.takeIf { it.isNotBlank() }?.let {
        val tries = n.num("tries")?.toInt() ?: 0
        ("Last try failed" + if (tries > 0) " · $tries/$maxTries auto tries" else "") to "warn"
    },
    (n.str("lang") ?: "en").uppercase() to "info",
)

/** Why Send is closed for a notice in this state, or null when it can go out. */
internal fun noticeHeld(state: String?): String? = when (state) {
    "waiting" -> "Send opens once its Live Report is public."
    "unlisted" -> "The site is off Live Reports, so this cannot be sent. Drop it."
    "stopped" -> "Every address, or the whole domain, asked for no notices. Drop it."
    else -> null
}

/** Owner notices waiting for Send or Drop (#1420), ready ones first, one email to each address picked (#1975). */
@Composable
fun Approvals(s: UiState, vm: JarvisViewModel, id: String) {
    LaunchedEffect(Unit) { if (s.notices == null) vm.loadNotices() }
    val list = s.notices.objs("notices")
    val maxTries = s.notices.num("tries")?.toInt() ?: 3
    var confirm by remember { mutableStateOf<Pair<String, List<String>>?>(null) }
    Panel("Approvals" + if (list.isNotEmpty()) " (${list.size})" else "", id = id) {
        when {
            s.notices == null -> Muted(if ("notices" in s.running) "Reading the owner notices waiting for you…" else "Pull down to load the owner notices.")
            list.isEmpty() -> Muted("No owner notices are waiting.")
            else -> {
                Muted(if (s.notices.bool("auto") == true) "Auto-send is on: a notice goes out by itself to its top address once its Live Report is public. Decide one here to act now."
                    else "Auto-send is off: each notice waits for you.")
                list.forEach { n -> Notice(n, maxTries, s, vm) { emails -> confirm = n.str("domain").orEmpty() to emails } }
            }
        }
    }
    confirm?.let { (domain, emails) ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Send the owner notice?") },
            text = { Text("$domain will get the notice at ${emails.joinToString(", ")}" + (if (emails.size > 1) ", one email to each" else "") + ", with a link to its Live Report.") },
            confirmButton = { TextButton({ vm.decideNotice(domain, true, emails); confirm = null }) { Text(if (emails.size > 1) "Send ${emails.size}" else "Send", color = J.cyan) } },
            dismissButton = { TextButton({ confirm = null }) { Text("Cancel", color = J.muted) } },
            containerColor = J.bg,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Notice(n: JsonObject, maxTries: Int, s: UiState, vm: JarvisViewModel, send: (List<String>) -> Unit) {
    val domain = n.str("domain").orEmpty()
    val host = n.str("host") ?: domain
    val state = n.str("state")
    val held = noticeHeld(state)
    val accent = when {
        n.bool("critical") == true -> J.pink
        state == "ready" -> J.green
        held != null -> J.dim
        else -> J.cyan
    }
    val candidates = n.objs("candidates").ifEmpty { listOf(JsonObject(mapOf("email" to JsonPrimitive(n.str("email").orEmpty()), "sources" to JsonArray(emptyList())))) }
    val open = candidates.filter { it.bool("stopped") != true }.mapNotNull { it.str("email")?.takeIf(String::isNotBlank) }
    val top = n.str("email")?.takeIf { it in open } ?: open.firstOrNull()
    var picked by rememberSaveable(domain) { mutableStateOf(listOfNotNull(top)) }
    val emails = open.filter { it in picked }
    val busy = "notice:$domain" in s.running
    val error = s.noticeErrors[domain] ?: n.str("lastError")?.takeIf { it.isNotBlank() }
    val uri = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().padding(top = 10.dp).height(IntrinsicSize.Min).clip(RoundedCornerShape(10.dp))
            .background(J.bg.copy(alpha = 0.55f)).border(1.dp, accent.copy(alpha = 0.25f), RoundedCornerShape(10.dp)),
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(accent))
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(host, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                noticeBadges(n, maxTries).forEach { (label, level) ->
                    val tint = J.level(level)
                    Text(label, color = tint, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.border(1.dp, tint.copy(alpha = 0.55f), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp))
                }
            }
            ago(n.str("createdAt"))?.let { Muted("Queued $it") }
            Text("Send to" + if (emails.size > 1) " ${emails.size} addresses, one email each" else "", color = J.muted, fontSize = 12.sp)
            val canPick = !busy && held == null
            if (open.size > 1 && held == null) {
                val all = emails.size == open.size
                Row(Modifier.fillMaxWidth().clickable(canPick) { picked = if (all) emptyList() else open }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(all, { picked = if (it) open else emptyList() }, enabled = canPick, colors = CheckboxDefaults.colors(checkedColor = J.cyan))
                    Text("All ${open.size}", color = J.muted, fontSize = 13.sp)
                }
            }
            candidates.forEach { c ->
                val e = c.str("email").orEmpty()
                val stopped = c.bool("stopped") == true
                val how = listOfNotNull(
                    (c["sources"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }?.joinToString(", ")?.takeIf { it.isNotBlank() },
                    "on the site".takeIf { c.bool("onDomain") == true },
                    "asked for no notices".takeIf { stopped },
                ).joinToString(" · ")
                val toggle = { on: Boolean -> picked = if (on) picked + e else picked - e }
                Row(Modifier.fillMaxWidth().clickable(canPick && !stopped) { toggle(e !in picked) }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(e in emails, { toggle(it) }, enabled = canPick && !stopped, colors = CheckboxDefaults.colors(checkedColor = J.cyan))
                    Column { Text(e, fontSize = 13.sp, color = if (stopped) J.dim else J.text); if (how.isNotBlank()) Text(how, color = J.dim, fontSize = 11.sp) }
                }
            }
            held?.let { Muted(it) }
            error?.let { Text("Last try: $it", color = J.amber, fontSize = 12.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton({ send(emails) }, enabled = !busy && held == null && emails.isNotEmpty()) {
                    Text(if (busy) "Working…" else if (emails.size > 1) "Send to ${emails.size}" else "Send", color = if (held == null) J.cyan else J.dim, fontWeight = FontWeight.Bold)
                }
                TextButton({ vm.decideNotice(domain, false, emptyList()) }, enabled = !busy) { Text("Drop", color = J.muted) }
                n.str("report")?.takeIf { it.startsWith("https://") }?.let { link -> TextButton({ uri.openUri(link) }) { Text("Review →", color = J.cyan) } }
                TextButton({ uri.openUri("https://$host") }) { Text("Site →", color = J.dim) }
            }
        }
    }
}
