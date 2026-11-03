package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Jarvis > Engagement (#1988): the scout's posts in our field, its plan, and the replies waiting for Carlos. */
object Engagement {
    val LIMIT = mapOf("bluesky" to 300, "mastodon" to 500, "youtube" to 500, "x" to 280, "linkedin" to 1200, "facebook" to 1000, "instagram" to 1000, "threads" to 500, "tiktok" to 150)
    val ACTIONS = listOf("like", "repost", "follow", "reply")

    fun limit(network: String?) = LIMIT[network] ?: 300

    /** The decision a tap sends: an Approve with changed text goes as an edit. */
    fun decision(draft: String, typed: String, approve: Boolean) = when {
        !approve -> "dismiss"
        typed.trim() != draft.trim() -> "edit"
        else -> "approve"
    }

    /** "like: planned · reply: waiting", or why the post was left alone. */
    fun plan(post: JsonObject): String {
        val acts = post.obj("actions")?.entries?.mapNotNull { (k, v) -> (v as? JsonObject)?.str("status")?.let { "$k: $it" } } ?: emptyList()
        val skip = post.str("skip")?.takeIf { it.isNotEmpty() }?.let { "left alone: $it" }
        return (acts + listOfNotNull(skip, if (post.str("verdict") == "trend") "trend only" else null)).joinToString(" · ").ifEmpty { "watch" }
    }

    /** Today's use against the cap per action on one network, as "like 3/60 · reply 1/15". */
    fun usage(g: JsonObject?, network: String): String =
        ACTIONS.joinToString(" · ") { a -> "$a ${fmt(g.obj("used").obj(network).num(a) ?: 0.0)}/${fmt(g.obj("caps").num(a))}" }

    fun metrics(post: JsonObject): String {
        val m = post.obj("metrics")
        return listOfNotNull("♥ ${fmt(m.num("likes") ?: 0.0)}", "↩ ${fmt(m.num("replies") ?: 0.0)}", "⟳ ${fmt(m.num("reposts") ?: 0.0)}",
            m.num("views")?.takeIf { it > 0 }?.let { "▶ ${fmt(it)}" }, "score ${fmt(post.num("score"))}").joinToString(" · ")
    }

    fun author(post: JsonObject): String = post.obj("author").let { it.str("name")?.ifEmpty { null } ?: it.str("handle").orEmpty() }

    /** The card title: the post's title or text, without the links Mastodon and Bluesky posts end on. */
    fun headline(post: JsonObject, max: Int = 160): String =
        (post.str("title")?.ifEmpty { null } ?: post.str("text").orEmpty()).replace(Regex("https?://\\S+"), "").replace(Regex("\\s+"), " ").trim().take(max)

    /** Likes, reposts and follows the poster carried out (#1990): done when live, dry in a dry run. */
    fun carried(t: JsonObject?, kind: String): Double = listOf("like", "repost", "follow").sumOf { t.num("${it}_$kind") ?: 0.0 }

    /** One account row: "connected as qalaburlreview · bot flag on", "not connected", plus the last error. */
    fun account(a: JsonObject): String = listOfNotNull(
        if (a.bool("connected") == true) "connected as ${a.str("account").orEmpty()}" else "not connected",
        if (a.bool("bot") == true) "bot flag on" else null,
        a.str("error")?.ifEmpty { null }?.let { "last error: $it" }
    ).joinToString(" · ")

    val APP_PASSWORD = Regex("^[a-z0-9]{4}(-[a-z0-9]{4}){3}$", RegexOption.IGNORE_CASE)
    const val SHOWN = 5
}

private fun json(v: Any): JsonElement = when (v) { is Boolean -> JsonPrimitive(v); is Number -> JsonPrimitive(v); else -> JsonPrimitive(v.toString()) }

@Composable
fun EngagementScreen(s: UiState, vm: JarvisViewModel) {
    val ext = s.snapshot.obj("external")
    val g = ext.obj("engagement")?.takeIf { it.isOk() }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    var all by rememberSaveable { mutableStateOf(false) }
    fun ask(text: String, run: () -> Unit) { confirm = PendingAction(text, run) }
    if (g == null) { Panel("Engagement") { Muted(ext.obj("engagement").str("error") ?: "Pull down to read the engagement scout.") }; return }
    val r = g.obj("report")
    val t = r.obj("totals")
    val waiting = g.objs("waiting")
    val paused = g.bool("paused") == true
    val live = g.bool("live") == true
    val last = g.obj("lastRun")
    val names = g.objs("networks").associate { (it.str("network") ?: "") to (it.str("name") ?: "") }
    val uri = LocalUriHandler.current

    Panel("Engagement") {
        KpiPairs(listOf(
            KpiData("In our field", fmt(t.num("candidates"))),
            KpiData("Likes planned", fmt(t.num("like"))),
            KpiData("Reposts planned", fmt(t.num("repost"))),
            KpiData("Follows planned", fmt(t.num("follow"))),
            KpiData(if (live) "Done" else "Done (dry run)", fmt(Engagement.carried(t, if (live) "done" else "dry")),
                delta = Engagement.carried(t, "dry").takeIf { live && it > 0 }?.let { "${fmt(it)} in the dry run" }),
            KpiData("Replies waiting", waiting.size.toString(), alert = waiting.isNotEmpty()),
            KpiData("Replies posted", fmt(t.num("posted")), delta = "${fmt((t.num("approved") ?: 0.0) + (t.num("edited") ?: 0.0))} approved"),
            KpiData("Approval rate", r.num("approvalRate")?.let { "${fmt(it)}%" } ?: "—"),
            KpiData("Scout", if (paused) "paused" else if (g.bool("stale") == true) "stale" else if (last == null) "never ran" else "running",
                delta = ago(last.str("at")), alert = paused || g.bool("stale") == true)
        ))
    }

    Panel("Replies waiting for you" + if (waiting.isNotEmpty()) " · ${waiting.size}" else "") {
        if (waiting.isEmpty()) { Muted(if (paused) "Paused: no replies are drafted." else "No reply is waiting. Drafts arrive here and as a push when the scout finds a post worth answering."); return@Panel }
        (if (all) waiting else waiting.take(Engagement.SHOWN)).forEach { p -> Draft(p, names, s, vm, ::ask) }
        if (waiting.size > Engagement.SHOWN) TextButton({ all = !all }) { Text(if (all) "Show fewer" else "Show all ${waiting.size}", color = J.cyan, fontSize = 13.sp) }
        Muted("Approve sends your edit when you changed the text. An approved reply posts at once on Bluesky, Mastodon and YouTube; on X, LinkedIn, Meta and TikTok it waits for the Mac's browser agent (#1991).")
    }

    Panel("Scout") {
        KeyRow("State", if (paused) "paused" else "running", if (paused) J.pink else J.green)
        KeyRow("Likes, reposts, follows", if (live) "live" else "dry run", if (live) J.green else J.amber)
        last?.let { KeyRow("Done last run", if (live) "${fmt(it.num("done"))} done · ${fmt(it.num("posted"))} replies posted" else "${fmt(it.num("dry"))} dry · ${fmt(it.num("posted"))} replies posted") }
        KeyRow("Last run", ago(last.str("at")) ?: "never", if (g.bool("stale") == true) J.pink else J.text)
        KeyRow("New in field last run", fmt(last.num("fresh")))
        KeyRow("Replies drafted last run", fmt(last.num("drafted")))
        last.str("aiError")?.takeIf { it.isNotEmpty() }?.let { KeyRow("Gemini", it, J.pink) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton(if (paused) "Resume" else "Pause everything", "eg:pause" in s.running) {
                ask(if (paused) "resume engagement" else "pause every engagement action, draft and push") {
                    vm.market("eg:pause", "engagement-settings", mapOf("settings" to JsonObject(mapOf("paused" to JsonPrimitive(!paused))))) { if (paused) "Engagement is running again." else "Engagement is paused." }
                }
            }
            ActionButton(if (live) "Back to a dry run" else "Go live", "eg:live" in s.running) {
                ask(if (live) "go back to a dry run, where planned actions are only logged" else "go live: planned likes, reposts and follows go out on the connected networks, within the daily caps") {
                    vm.market("eg:live", "engagement-settings", mapOf("settings" to JsonObject(mapOf("live" to JsonPrimitive(!live))))) { if (live) "Back to a dry run." else "Live: the next scout run carries out the plan." }
                }
            }
        }
        ActionButton("Run the scout now", "run:engagementScout" in s.running) {
            vm.act("run:engagementScout", "run-job", mapOf("job" to JsonPrimitive("engagementScout"))) { "The scout is running; pull down in a minute." }
        }
    }

    Accounts(g, s, vm, ::ask)

    Panel("Networks") {
        g.objs("networks").forEach { n ->
            val net = n.str("network").orEmpty()
            val reads = n.str("reads").orEmpty()
            StatusRow(if (reads == "API") "good" else if (reads.startsWith("needs")) "alert" else "info", n.str("name").orEmpty(),
                listOfNotNull(reads, n.num("lastRead")?.takeIf { it > 0 }?.let { "${fmt(it)} read last run" }, n.str("error")?.ifEmpty { null },
                    if (Engagement.LIMIT.containsKey(net)) Engagement.usage(g, net) else null, n.str("acts")).joinToString(" · "))
        }
    }

    val daily = g.objs("daily")
    if (daily.isNotEmpty()) Panel("Per day") {
        Muted("Posts in our field")
        BarChart(daily.map { it.num("candidates") ?: 0.0 }, daily.map { it.str("day").orEmpty().takeLast(5) }, J.cyan)
        Muted("Replies drafted")
        BarChart(daily.map { it.num("drafted") ?: 0.0 }, daily.map { it.str("day").orEmpty().takeLast(5) }, J.amber)
        Muted(if (live) "Likes, reposts and follows done" else "Likes, reposts and follows in the dry run")
        BarChart(daily.map { it.num(if (live) "done" else "dry") ?: 0.0 }, daily.map { it.str("day").orEmpty().takeLast(5) }, J.pink)
    }

    Panel("Top posts in our field") {
        val posts = g.objs("posts")
        if (posts.isEmpty()) { Muted("No posts from our field in this range yet."); return@Panel }
        posts.take(15).forEach { p ->
            Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(Engagement.headline(p, 140), fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Muted(listOfNotNull(names[p.str("network")], Engagement.author(p).ifEmpty { null }, p.str("topic")).joinToString(" · ") + " · " + Engagement.metrics(p))
                p.str("about")?.takeIf { it.isNotEmpty() }?.let { Text(it, color = J.dim, fontSize = 12.sp) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(Engagement.plan(p), color = if (p.str("verdict") == "engage") J.green else J.muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    p.str("url")?.takeIf { it.startsWith("https://") }?.let { url -> TextButton({ uri.openUri(url) }) { Text("Open", color = J.cyan, fontSize = 13.sp) } }
                }
            }
        }
    }

    Panel("Reply funnel") {
        KeyRow("Drafted", fmt(t.num("drafted")))
        KeyRow("Approved", fmt(t.num("approved")), J.green)
        KeyRow("Edited and approved", fmt(t.num("edited")), J.green)
        KeyRow("Dismissed", fmt(t.num("dismissed")))
        KeyRow("Expired unanswered", fmt(t.num("expired")), if ((t.num("expired") ?: 0.0) > 0) J.amber else J.text)
        KeyRow("Posted", fmt(t.num("posted")))
        KeyRow("Average time to decide", r.num("avgDecideMin")?.let { "${fmt(it)} min" } ?: "—")
    }
    TopList("Topics", r.pairs("topics"))
    TopList("Languages", r.pairs("langs"))
    TopList("Trending keywords", r.pairs("tags").map { it.first.replace('_', ' ') to it.second })
    TopList("Left alone, and why", r.pairs("skips").map { it.first.replace('_', ' ') to it.second })
    TopList("Authors seen most", r.pairs("authors"))

    val approved = g.objs("approved")
    if (approved.isNotEmpty()) Panel("Approved replies") {
        approved.take(10).forEach { p ->
            val reply = p.obj("actions").obj("reply")
            val status = reply.str("status").orEmpty()
            StatusRow(when (status) { "posted" -> "good"; "failed" -> "alert"; else -> "info" }, "$status · " + (names[p.str("network")] ?: "") + " · " + Engagement.headline(p, 70),
                listOfNotNull(reply.str("draft"), reply.str("error")?.ifEmpty { null }).joinToString("\n"), url = reply.str("url")?.takeIf { it.startsWith("https://") })
        }
    }

    Panel("Reports") {
        g.objs("reports").forEach { x ->
            val tot = x.obj("totals")
            KeyRow("${x.str("period")} · ${x.str("to")}", "${fmt(tot.num("candidates"))} posts · ${fmt(tot.num("drafted"))} drafts · ${x.num("approvalRate")?.let { "${fmt(it)}%" } ?: "—"}")
        }
        if (g.objs("reports").isEmpty()) Muted("No report sent yet. The daily one goes out at 20:30.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("daily" to "Today", "weekly" to "Week", "monthly" to "Month").forEach { (period, label) ->
                ActionButton(label, "eg:report:$period" in s.running) {
                    ask("mail and push the $period engagement report now") {
                        vm.market("eg:report:$period", "engagement-report", mapOf("period" to json(period))) { out -> if (out.bool("sent") == true) "Sent: ${out.str("subject")}" else "Built, but the mail did not go out." }
                    }
                }
            }
        }
        Muted("Daily at 20:30, weekly on Sunday at 20:40, monthly on the 1st at 08:10, by email and push.")
    }

    Settings(g, s, vm, ::ask)
    Needs(g)
    ConfirmAction(confirm) { confirm = null }
}

@Composable
private fun Draft(p: JsonObject, names: Map<String, String>, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    val key = p.str("key").orEmpty()
    val reply = p.obj("actions").obj("reply")
    val draft = reply.str("draft").orEmpty()
    val limit = Engagement.limit(p.str("network"))
    var text by rememberSaveable(key) { mutableStateOf(draft) }
    var open by rememberSaveable("open:$key") { mutableStateOf(false) }
    val uri = LocalUriHandler.current
    val busy = "eg:$key" in s.running
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(Engagement.headline(p), fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(names[p.str("network")] ?: "", color = J.cyan, fontSize = 12.sp)
        }
        Muted(listOfNotNull(Engagement.author(p).ifEmpty { null }, p.str("topic"), p.str("lang")).joinToString(" · ") + " · " + Engagement.metrics(p))
        p.str("about")?.takeIf { it.isNotEmpty() }?.let { Text(it, fontSize = 13.sp) }
        val chain = p.obj("chain")
        val ours = chain.str("ours")
        if (chain != null) Text("${Engagement.author(p)} commented on our ${if (chain.str("on") == "post") "post" else "reply"}" + (ours?.takeIf { it.isNotEmpty() }?.let { ": “$it”" } ?: ""), color = J.muted, fontSize = 12.sp)
        val what = if (chain != null) "comment" else "post"
        TextButton({ open = !open }) { Text(if (open) "Hide the $what" else "Show the $what", color = J.cyan, fontSize = 12.sp) }
        if (open) Text(p.str("text").orEmpty(), color = J.muted, fontSize = 12.sp)
        OutlinedTextField(text, { text = it.take(limit) }, label = { Text("Reply · ${text.length}/$limit") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            ActionButton("Approve", busy) {
                val decision = Engagement.decision(draft, text, true)
                vm.market("eg:$key", "engagement-decide", mapOf("key" to json(key), "decision" to json(decision), "text" to json(text.trim()))) { out -> out.str("message") ?: "Approved." }
            }
            TextButton({ ask("dismiss this reply draft") { vm.market("eg:$key", "engagement-decide", mapOf("key" to json(key), "decision" to json("dismiss"))) { "Dismissed." } } }, enabled = !busy) {
                Text("Dismiss", color = J.muted, fontSize = 13.sp)
            }
            p.str("url")?.takeIf { it.startsWith("https://") }?.let { url -> TextButton({ uri.openUri(url) }) { Text("Open", color = J.cyan, fontSize = 13.sp) } }
        }
        Muted("Expires ${ago(reply.str("expiresAt"))?.replaceFirstChar { it.lowercase() } ?: reply.str("expiresAt").orEmpty()}")
    }
}

/** The accounts the poster acts as (#1990): Connect opens YouTube's or Mastodon's sign-in; Bluesky takes an app password. */
@Composable
private fun Accounts(g: JsonObject, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    val uri = LocalUriHandler.current
    val accounts = g.objs("accounts")
    if (accounts.isEmpty()) return
    Panel("Accounts") {
        accounts.forEach { a ->
            val net = a.str("network").orEmpty()
            val name = a.str("name").orEmpty()
            val connected = a.bool("connected") == true
            StatusRow(if (!connected) "alert" else if (a.str("error").isNullOrEmpty()) "good" else "warn", name, Engagement.account(a))
            if (net == "bluesky") {
                var handle by rememberSaveable { mutableStateOf(a.str("account")?.ifEmpty { null } ?: "qalaburlreview.bsky.social") }
                var password by remember { mutableStateOf("") }
                OutlinedTextField(handle, { handle = it.trim() }, label = { Text("Bluesky handle") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(password, { password = it.trim() }, label = { Text("App password (xxxx-xxxx-xxxx-xxxx)") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                ActionButton(if (connected) "Replace" else "Connect Bluesky", "eg:connect:bluesky" in s.running || !Engagement.APP_PASSWORD.matches(password)) {
                    val sent = password
                    password = ""
                    vm.market("eg:connect:bluesky", "engagement-connect", mapOf("network" to json("bluesky"), "handle" to json(handle), "password" to json(sent))) { out -> out.str("message") ?: "Bluesky is connected." }
                }
                Muted("bsky.app > Settings > Privacy and security > App passwords. Never the account password.")
            } else {
                ActionButton(if (connected) "Reconnect $name" else "Connect $name", "eg:connect:$net" in s.running) {
                    vm.connectEngagement(net) { url -> runCatching { uri.openUri(url) } }
                }
            }
            if (connected) TextButton({ ask("disconnect $name, so nothing goes out there") { vm.market("eg:connect:$net", "engagement-connect", mapOf("network" to json(net), "disconnect" to json(true))) { out -> out.str("message") ?: "Disconnected." } } }) {
                Text("Disconnect", color = J.muted, fontSize = 13.sp)
            }
        }
        Muted("X, LinkedIn, Facebook, Instagram, Threads and TikTok act through the Mac's browser agent (#1991). Mastodon is marked as a bot when it connects.")
    }
}

@Composable
private fun Settings(g: JsonObject, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    val c = g.obj("settings")
    val caps = remember(c) { Engagement.ACTIONS.associateWith { a -> mutableStateOf(fmt(c.obj("caps").num(a))) } }
    var competitors by rememberSaveable(c.toString()) { mutableStateOf((c?.get("competitors") as? JsonArray)?.joinToString("\n") { (it as? JsonPrimitive)?.content.orEmpty() }.orEmpty()) }
    Panel("Settings") {
        Muted("Daily caps per network")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Engagement.ACTIONS.forEach { a ->
                val v = caps.getValue(a)
                OutlinedTextField(v.value, { v.value = it.filter(Char::isDigit).take(3) }, label = { Text(a, fontSize = 11.sp) }, singleLine = true, modifier = Modifier.weight(1f))
            }
        }
        OutlinedTextField(competitors, { competitors = it }, label = { Text("Competitors, never answered under") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        ActionButton("Save settings", "eg:settings" in s.running) {
            ask("save the engagement caps and competitors") {
                val capsJson = JsonObject(caps.mapValues { (_, v) -> JsonPrimitive(v.value.toIntOrNull() ?: 0) })
                val list = JsonArray(competitors.split('\n').map { it.trim() }.filter { it.isNotEmpty() }.map { JsonPrimitive(it) })
                vm.market("eg:settings", "engagement-settings", mapOf("settings" to JsonObject(mapOf("caps" to capsJson, "competitors" to list)))) { "Settings saved." }
            }
        }
        Muted("Score thresholds, Gemini's bar and our own handles are on the web tab.")
    }
}
