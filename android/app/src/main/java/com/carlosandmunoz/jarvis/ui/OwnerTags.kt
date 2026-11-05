package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.strings
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.Normalizer

/** Owner tags (#2633, #2660): the same panel as the web Engagement tab, from the engagement source's ownerTags. */
object OwnerTags {
    val ORDER = listOf("suggested", "approved", "rejected", "blocked")
    val NETWORKS = listOf("x", "instagram", "threads", "bluesky", "mastodon", "youtube")
    val SCOPES = listOf("report", "city", "sector", "country")
    private val ACT = mapOf("approved" to "Approve", "rejected" to "Reject", "blocked" to "Block")

    fun state(o: JsonObject?): String = o.obj("settings").let { if (it.bool("paused") == true) "paused" else if (it.bool("live") == true) "live" else "dry run" }

    /** The buttons an account gets: every status but its own. */
    fun acts(status: String?): List<Pair<String, String>> = ACT.filterKeys { it != status }.toList()

    fun profile(network: String?, handle: String?): String? {
        val h = handle.orEmpty()
        if (h.isEmpty()) return null
        return when (network) {
            "x" -> "https://x.com/$h"
            "instagram" -> "https://www.instagram.com/$h/"
            "threads" -> "https://www.threads.net/@$h"
            "tiktok" -> "https://www.tiktok.com/@$h"
            "bluesky" -> "https://bsky.app/profile/$h"
            "youtube" -> if (h.startsWith("channel/")) "https://www.youtube.com/$h" else "https://www.youtube.com/@$h"
            "mastodon" -> h.split("@").takeIf { it.size == 2 }?.let { (user, host) -> "https://$host/@$user" }
            "facebook" -> "https://www.facebook.com/$h"
            "linkedin" -> "https://www.linkedin.com/$h"
            else -> null
        }
    }

    /** "city transit agency · city:bogota · batch metrobogota · from gemini · verified". */
    fun accountLine(a: JsonObject): String = listOfNotNull(
        a.str("why")?.ifEmpty { null }, a["scopes"].strings().joinToString(", ").ifEmpty { null },
        a.str("batch")?.ifEmpty { null }?.let { "batch $it" }, a.str("source")?.ifEmpty { null }?.let { "from $it" },
        a.str("kind"), if (a.bool("verified") == true) "verified" else null
    ).joinToString(" · ")

    /** "tags (2 mentions) · posted" or "owner reply · failed: 422 rate limited". */
    fun commentLine(c: JsonObject): String =
        (if (c.str("kind") == "reply") "owner reply" else "tags (${fmt(c.num("mentions") ?: 0.0)} mentions)") + " · " + c.str("status").orEmpty() +
            (c.str("error")?.ifEmpty { null }?.let { ": $it" } ?: "")

    /** "Bluesky 3 · X 1", the posts of the last 7 days per network. */
    fun week(o: JsonObject?, names: Map<String, String>): String =
        o.obj("week")?.entries?.joinToString(" · ") { (k, v) -> "${names[k]?.ifEmpty { null } ?: k} ${fmt((v as? JsonPrimitive)?.content?.toDoubleOrNull())}" }.orEmpty()

    fun weekTotal(o: JsonObject?): Double = o.obj("week")?.values?.sumOf { (it as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0 } ?: 0.0

    /** A scope value as the server keeps it: lower case, no accents, dashes for spaces ("Bogotá" is "bogota"). */
    fun slug(v: String): String = Normalizer.normalize(v.trim().lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        .replace(Regex("[^a-z0-9._-]+"), "-").trim('-')

    /** The owner-tags-account body for Add account, or null when the link or handle, network or scope is missing. */
    fun addBody(who: String, network: String, scopeKind: String, scopeValue: String, kind: String): Map<String, JsonElement>? {
        val w = who.trim()
        val value = slug(scopeValue)
        val link = w.startsWith("http://", true) || w.startsWith("https://", true)
        if (w.isEmpty() || value.isEmpty() || (!link && network.isEmpty())) return null
        val target = if (link) mapOf("url" to JsonPrimitive(w)) else mapOf("network" to JsonPrimitive(network), "handle" to JsonPrimitive(w.removePrefix("@")))
        return target + mapOf("scope" to JsonPrimitive("$scopeKind:$value"), "kind" to JsonPrimitive(kind), "status" to JsonPrimitive("approved"))
    }
}

private fun body(vararg pairs: Pair<String, Any>): Map<String, JsonElement> =
    pairs.associate { (k, v) -> k to (if (v is Boolean) JsonPrimitive(v) else JsonPrimitive(v.toString())) }

@Composable
@OptIn(ExperimentalLayoutApi::class)
fun OwnerTagsPanel(g: JsonObject, s: UiState, vm: JarvisViewModel, names: Map<String, String>, ask: (String, () -> Unit) -> Unit) {
    val o = g.obj("ownerTags")
    if (o == null) { Panel("Owner tags") { Muted("Owner tags did not answer; pull down in a minute.") }; return }
    val state = OwnerTags.state(o)
    val paused = state == "paused"
    val live = state == "live"
    val last = o.obj("last")
    val counts = o.obj("accounts")
    val net = { k: String? -> names[k]?.ifEmpty { null } ?: k.orEmpty() }

    Panel("Owner tags · $state") {
        KeyRow("State", state, if (paused) J.pink else if (live) J.green else J.amber)
        KeyRow("Last run", ago(last.str("at")) ?: "never")
        if (last != null) {
            KeyRow(if (last.bool("live") == true) "Comments last run" else "Would post last run", fmt(last.num(if (last.bool("live") == true) "comments" else "dry")))
            KeyRow("Owner replies last run", fmt(last.num("replies")))
        }
        KeyRow("Suggestions waiting", fmt(counts.num("suggested") ?: 0.0), if ((counts.num("suggested") ?: 0.0) > 0) J.amber else J.text)
        KeyRow("Approved accounts", fmt(counts.num("approved") ?: 0.0))
        KeyRow("Posted, last 7 days", fmt(OwnerTags.weekTotal(o)))
        OwnerTags.week(o, names).takeIf { it.isNotEmpty() }?.let { Muted("Posted in the last 7 days: $it") }
        o.str("note")?.takeIf { it.isNotEmpty() }?.let { Muted("Last run: $it") }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton(if (paused) "Resume" else "Pause", "ot:pause" in s.running) {
                ask(if (paused) "resume owner tags" else "pause owner tags: no comment, reply or suggestion until you resume") {
                    vm.market("ot:pause", "owner-tags-settings", mapOf("settings" to JsonObject(mapOf("paused" to JsonPrimitive(!paused))))) { out -> out.str("message") ?: "Saved." }
                }
            }
            ActionButton(if (live) "Back to a dry run" else "Go live", "ot:live" in s.running) {
                ask(if (live) "go back to a dry run, where owner tags only count what they would post" else "go live: the next run queues the tag comments and owner replies, within the daily caps") {
                    vm.market("ot:live", "owner-tags-settings", mapOf("settings" to JsonObject(mapOf("live" to JsonPrimitive(!live))))) { out -> out.str("message") ?: "Saved." }
                }
            }
        }
        ActionButton("Run now", "ot:run" in s.running) {
            ask("run owner tags now (a dry run only counts; live queues the comments)") {
                vm.market("ot:run", "owner-tags-run", emptyMap()) { out -> "Owner tags ran: " + out.str("note").orEmpty() }
            }
        }
        Muted("Daily at 10:15. Comments tag each reviewed site's owners and the approved accounts around them under our posts; owners also get one reply under their latest Bluesky, Mastodon or YouTube post. Jarvis approves alone the suggestions whose handle resolves or matches an owner's, and blocks anyone who answers asking us to stop.")
    }

    Panel("Owner tag accounts") {
        val list = o.objs("list")
        if (list.isEmpty()) Muted("No accounts yet. The daily run reads each reviewed site's profile links and asks Gemini for the accounts around it.")
        OwnerTags.ORDER.forEach { status ->
            val group = list.filter { it.str("status") == status }
            if (group.isEmpty()) return@forEach
            var open by rememberSaveable("ot:open:$status") { mutableStateOf(status == "suggested") }
            TextButton({ open = !open }) {
                Text("${status.replaceFirstChar { it.uppercase() }} · ${fmt(counts.num(status) ?: group.size.toDouble())}" + if (open) "" else " ›", color = J.cyan, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
            if (!open) return@forEach
            group.forEach { a ->
                val id = a.str("id").orEmpty()
                val handle = a.str("handle").orEmpty()
                StatusRow(when (status) { "approved" -> "good"; "blocked" -> "alert"; "suggested" -> "warn"; else -> "info" },
                    "@$handle · ${net(a.str("network"))}" + (a.str("name")?.ifEmpty { null }?.let { " · $it" } ?: ""), OwnerTags.accountLine(a), OwnerTags.profile(a.str("network"), handle))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    OwnerTags.acts(status).forEach { (next, label) ->
                        TextButton({
                            val run = { vm.market("ot:$id", "owner-tags-account", body("network" to a.str("network").orEmpty(), "handle" to handle, "status" to next)) { out -> out.str("message") ?: "Saved." } }
                            if (next == "approved") run() else ask(if (next == "blocked") "block @$handle: never tagged again, and its queued comments are dismissed" else "reject @$handle") { run() }
                        }, enabled = "ot:$id" !in s.running) { Text(label, color = if (next == "blocked") J.pink else J.cyan, fontSize = 13.sp) }
                    }
                }
            }
        }

        var who by rememberSaveable { mutableStateOf("") }
        var network by rememberSaveable { mutableStateOf("") }
        var scopeKind by rememberSaveable { mutableStateOf("report") }
        var scopeValue by rememberSaveable { mutableStateOf("") }
        var owner by rememberSaveable { mutableStateOf(false) }
        Text("Add account", fontWeight = FontWeight.Medium, fontSize = 14.sp)
        OutlinedTextField(who, { who = it }, label = { Text("Profile link or handle") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        FlowRow(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            (listOf("") + OwnerTags.NETWORKS).forEach { k ->
                TextButton({ network = k }) { Text(if (k.isEmpty()) "link" else net(k), color = if (network == k) J.cyan else J.muted, fontSize = 12.sp) }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            OwnerTags.SCOPES.forEach { k -> TextButton({ scopeKind = k }) { Text(k, color = if (scopeKind == k) J.cyan else J.muted, fontSize = 12.sp) } }
            TextButton({ owner = !owner }) { Text(if (owner) "owner" else "related", color = J.cyan, fontSize = 12.sp) }
        }
        OutlinedTextField(scopeValue, { scopeValue = it }, label = { Text("Scope value (metrobogota, bogota, transit, co)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        val add = OwnerTags.addBody(who, network, scopeKind, scopeValue, if (owner) "owner" else "related")
        ActionButton("Add account", "ot:add" in s.running || add == null) {
            if (add != null) vm.market("ot:add", "owner-tags-account", add) { out -> who = ""; scopeValue = ""; out.str("message") ?: "Added." }
        }
    }

    Panel("Owner tags comments") {
        val comments = o.objs("comments")
        if (comments.isEmpty()) Muted("No owner-tags comment yet. In a dry run nothing is queued; Go live queues them on the next run.")
        comments.take(20).forEach { c ->
            StatusRow(when (c.str("status")) { "posted" -> "good"; "failed" -> "alert"; else -> "info" }, "${net(c.str("network"))} · ${OwnerTags.commentLine(c)}",
                listOfNotNull(c.str("draft"), ago(c.str("at"))).joinToString("\n"), url = (c.str("url")?.ifEmpty { null } ?: c.str("post"))?.takeIf { it.startsWith("https://") })
        }
    }
}
