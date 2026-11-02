package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
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
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Jarvis > Marketing in the app (#1729): the web tab's numbers and buttons, including the outreach sync's leads, replies and LinkedIn (#1730). */
object Marketing {
    data class Week(val week: String, val total: Int, val complete: Int, val missing: Int, val approved: Int, val uploaded: Int, val ready: Int)

    fun weeks(sync: JsonObject?): List<Week> = sync.obj("leads").objs("weeks").map {
        fun n(k: String) = it.num(k)?.toInt() ?: 0
        Week(it.str("week").orEmpty(), n("total"), n("complete"), n("missing"), n("approved"), n("uploaded"), n("ready"))
    }

    /** The week the tab opens on: the latest one with leads still to upload, else the latest. */
    fun openWeek(weeks: List<Week>, picked: String?): Week? = weeks.firstOrNull { it.week == picked } ?: weeks.lastOrNull { it.uploaded < it.total } ?: weeks.lastOrNull()

    /** True while a command for this key (an email, a week, a name or a job) waits for the outreach sync. */
    fun waiting(sync: JsonObject?, action: String, key: String) =
        sync.obj("commands").objs("items").any { it.str("status") == "pending" && (action.isEmpty() || it.str("action") == action) && it.str("label").orEmpty().contains(key) }

    fun repliesToAnswer(sync: JsonObject?) = sync.objs("replies").filter { it.str("sent").isNullOrEmpty() && !it.str("draft").isNullOrEmpty() }

    data class Countdown(val label: String, val date: String, val days: Long)

    /** First send, the plan's next milestone and deadlines, and the plan's end, soonest first; past ones drop. */
    fun countdowns(mk: JsonObject?, plan: JsonObject?, today: LocalDate): List<Countdown> {
        fun of(label: String, date: String?) = date?.takeIf { it.length >= 10 }?.let { d ->
            runCatching { Countdown(label, d.take(10), ChronoUnit.DAYS.between(today, LocalDate.parse(d.take(10)))) }.getOrNull()
        }
        return listOfNotNull(
            of("First cold emails go out", mk.obj("campaigns").str("firstStart")),
            plan.obj("next")?.let { of("Next: " + it.str("label").orEmpty(), it.str("date")) },
            *plan.objs("deadlines").map { of(it.str("label").orEmpty(), it.str("date")) }.toTypedArray(),
            of("90-day plan ends", plan.str("end"))
        ).filter { it.days >= 0 }.distinctBy { it.label }.sortedBy { it.days }
    }

    fun inDays(n: Long) = when (n) { 0L -> "today"; 1L -> "tomorrow"; else -> "in $n days" }
}

@Composable
fun MarketingScreen(s: UiState, vm: JarvisViewModel) {
    val snap = s.snapshot
    val ext = snap.obj("external")
    val mk = ext.obj("marketing")?.takeIf { it.isOk() }
    val sy = ext.obj("marketing-sync")?.takeIf { it.isOk() }
    val ou = ext.obj("outreach")?.takeIf { it.isOk() }
    val camps = mk.obj("campaigns")?.takeIf { it.isOk() }
    val pros = mk.obj("prospects")?.takeIf { it.isOk() }
    val notes = mk.obj("notes")?.takeIf { it.isOk() }
    val pipe = ou.obj("pipeline")?.takeIf { it.isOk() }
    val mail = ou.obj("instantly")?.takeIf { it.isOk() }
    val plan = ou.obj("plan")?.takeIf { it.isOk() && it.str("start") != null }
    val so = ext.obj("social")?.takeIf { it.isOk() }
    val gsc = ext.obj("search").obj("console")?.takeIf { it.isOk() }
    val money = ext.obj("money")?.takeIf { it.isOk() }
    val email = ext.obj("email")?.takeIf { it.isOk() }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    fun ask(text: String, run: () -> Unit) { confirm = PendingAction(text, run) }
    fun command(key: String, extra: Map<String, Any>, done: (JsonObject) -> String = { out -> (out.str("label") ?: "Queued") + if (out.bool("syncing") == true) ": the outreach Action does it in a few minutes." else ": the outreach Action does it on its next sync, within 3 hours." }) =
        vm.market(key, "marketing-command", extra.mapValues { (_, v) -> json(v) }, done)

    val weeks = Marketing.weeks(sy)
    val li = sy.obj("linkedin")
    val liItems = li.objs("items")
    val liSent = liItems.count { it.bool("sent") == true }
    val todo = Marketing.repliesToAnswer(sy)

    Approvals(s, vm)

    val counts = Marketing.countdowns(mk, plan, LocalDate.now())
    if (counts.isNotEmpty()) Panel("Countdowns") {
        counts.take(5).forEach { c -> KeyRow("${c.label} · ${c.date}", Marketing.inDays(c.days), if (c.days <= 7) J.pink else if (c.days <= 14) J.amber else J.cyan) }
    }

    Panel("Marketing") {
        KpiPairs(listOf(
            KpiData("Social posts", fmt(so.num("sent")), alert = (so.num("failed") ?: 0.0) > 0),
            snap.obj("products").obj("hub").objs("kpis").firstOrNull()?.let(::kpiOf) ?: KpiData("Hub + post views", "—"),
            KpiData("YouTube views", fmt(so.obj("youtube").num("views"))),
            kpiVs("Prospects reviewed", pipe.num("reviews"), pipe.num("priorReviews")),
            KpiData("Cold emails sent", fmt(mail.num("sent"))),
            KpiData("Replies", fmt(mail.num("replies"))),
            KpiData("Meetings", fmt(mail.num("meetings"))),
            KpiData("Follow-up notes", fmt(notes.num("sent"))),
            KpiData("Google clicks", fmt(gsc.num("clicks"))),
            KpiData("Revenue (USD)", fmt(money.obj("revenue").num("usd"))),
            KpiData("Leads approved", if (weeks.isEmpty()) "—" else weeks.sumOf { it.approved }.toString()),
            KpiData("Ready to upload", if (weeks.isEmpty()) "—" else weeks.sumOf { it.ready }.toString()),
            KpiData("Replies to answer", if (sy == null) "—" else todo.size.toString(), alert = todo.isNotEmpty()),
            KpiData("LinkedIn today", if (sy == null) "—" else "$liSent / ${liItems.size}"),
            KpiData("Outreach synced", ago(sy.str("at")) ?: "—", alert = sy?.bool("stale") == true)
        ))
    }

    Panel("Marketing health") {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            fun ratio(a: Double?, b: Double?) = if (a == null || b == null || b == 0.0) null else a / b * 100
            val accounts = mail.objs("accounts")
            Ring(plan?.let { p -> ratio(p.num("day")?.coerceAtLeast(0.0)?.coerceAtMost(p.num("length") ?: 0.0), p.num("length")) }, "PLAN")
            Ring(ratio(pipe.num("withLiveReport"), pipe.num("queued")), "REPORTS")
            Ring(if (accounts.isEmpty()) null else accounts.minOf { it.num("score") ?: 0.0 }, "WARM-UP")
            Ring(so?.let { ratio(it.num("sent"), (it.num("sent") ?: 0.0) + (it.num("failed") ?: 0.0)) }, "SOCIAL")
            Ring(email.obj("rates").num("delivered"), "DELIVERED")
            Ring(if (liItems.isEmpty()) null else liSent * 100.0 / liItems.size, "LINKEDIN")
        }
    }

    // --- The outreach sync (#1730, #1980)
    Panel("Outreach sync") {
        if (sy == null) { Muted(ext.obj("marketing-sync").str("error") ?: "Pull down to read the outreach folder."); return@Panel }
        KeyRow("Last sync", ago(sy.str("at")) ?: "never", if (sy.bool("stale") == true) J.pink else J.green)
        KeyRow("Waiting for the sync", fmt(sy.obj("commands").num("pending")))
        KeyRow("Job", if (sy.bool("running") == true) "running" else "idle", if (sy.bool("running") == true) J.amber else J.muted)
        sy.obj("commands").objs("items").take(6).forEach { c ->
            StatusRow(when (c.str("status")) { "done" -> "good"; "failed" -> "alert"; else -> "warn" }, c.str("label").orEmpty(), listOfNotNull(c.str("status"), ago(c.str("createdAt")), c.str("result")?.takeIf { it.isNotEmpty() }).joinToString(" · "))
        }
        Muted("The qa-lab-outreach Action runs what you ask here within a few minutes, and uploads the outreach folder after each job and every 3 hours. Replies and blocks go to Instantly at once.")
    }

    if (sy != null) {
        var picked by rememberSaveable { mutableStateOf<String?>(null) }
        val week = Marketing.openWeek(weeks, picked)
        Panel("Leads to approve" + (week?.let { " · ${it.week}" } ?: "")) {
            if (week == null) { Muted("No leads files yet; the Monday leads job writes them."); return@Panel }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                weeks.forEach { w -> GlassChip("${w.week} · ${w.uploaded}/${w.total}", w.week == week.week) { picked = w.week } }
            }
            KpiPairs(listOf(KpiData("Complete", week.complete.toString()), KpiData("Missing", week.missing.toString(), alert = week.missing > 0),
                KpiData("Approved", week.approved.toString()), KpiData("Uploaded", week.uploaded.toString()), KpiData("Ready", week.ready.toString())))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (week.complete > week.approved + week.uploaded) ActionButton("Approve all complete", "mk:approve-week" in s.running) {
                    ask("approve every complete lead in ${week.week}") { command("mk:approve-week", mapOf("action" to "approve-week", "week" to week.week)) }
                }
                if (week.ready > 0 && !Marketing.waiting(sy, "upload", week.week)) ActionButton("Upload ${week.ready} to Instantly", "mk:upload" in s.running) {
                    ask("upload ${week.week}'s ${week.ready} approved leads to their Instantly campaigns") { command("mk:upload", mapOf("action" to "upload", "week" to week.week)) }
                }
            }
            sy.obj("leads").objs("rows").filter { it.str("week") == week.week }.sortedBy { leadOrder(it) }.forEach { r -> Lead(r, sy, s, vm, ::ask, ::command) }
            Muted("With each outreach sync (at most once an hour) Jarvis translates top findings, re-runs the review of a site with no Live Report (twice at most) and approves complete leads. \"Needs you\" rows are the ones it cannot settle. Upload stays with you.")
        }

        Panel("Replies" + if (todo.isNotEmpty()) " · ${todo.size} to answer" else "") {
            val replies = sy.objs("replies")
            if (replies.isEmpty()) { Muted("No replies in the last 14 days" + (camps.str("firstStart")?.let { "; the first emails go out $it" } ?: "") + "."); return@Panel }
            replies.groupingBy { it.str("category")?.ifEmpty { null } ?: "not sorted" }.eachCount().entries.sortedByDescending { it.value }.forEach { (k, v) -> KeyRow(k, v.toString(), categoryColor(k)) }
            replies.forEach { r -> Reply(r, s, ::ask, vm) }
        }

        Panel("LinkedIn" + (li.str("date")?.takeIf { it.isNotEmpty() }?.let { " · $it" } ?: "")) {
            if (liItems.isEmpty()) { Muted("No LinkedIn list yet; the outreach sync writes one each working day from 07:00 Bogotá time, with up to 15 prospects never listed before."); return@Panel }
            val uri = LocalUriHandler.current
            GlowBar(liSent.toFloat() / liItems.size)
            Muted("$liSent of ${liItems.size} requests sent")
            liItems.forEach { p ->
                val name = p.str("name").orEmpty()
                val sent = p.bool("sent") == true
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(name, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                        Muted(listOfNotNull(p.str("title"), p.str("org"), p.str("cc")).joinToString(" · "))
                    }
                    p.str("profile")?.takeIf { it.startsWith("https://") }?.let { url -> TextButton({ uri.openUri(url) }) { Text("Profile", color = J.cyan, fontSize = 13.sp) } }
                    if (Marketing.waiting(sy, "linkedin", name)) Text("waiting", color = J.amber, fontSize = 12.sp)
                    else TextButton({ ask("mark the LinkedIn request to $name as " + if (sent) "not sent" else "sent") { command("mk:li:$name", mapOf("action" to "linkedin", "date" to li.str("date").orEmpty(), "name" to name, "sent" to !sent)) } }, enabled = "mk:li:$name" !in s.running) {
                        Text(if (sent) "Sent ✓" else "Mark sent", color = if (sent) J.green else J.cyan, fontSize = 13.sp)
                    }
                }
            }
        }

        Panel("Outreach jobs") {
            sy.objs("jobs").forEach { j ->
                val mode = j.str("mode").orEmpty()
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(mode, fontWeight = FontWeight.Medium, color = if (j.bool("failed") == true) J.pink else J.text)
                        Muted(listOfNotNull(ago(j.str("at")) ?: "never", j.str("notify")?.takeIf { it.isNotEmpty() }).joinToString(" · "))
                    }
                    if (Marketing.waiting(sy, "run", mode)) Text("waiting", color = J.amber, fontSize = 12.sp)
                    else TextButton({ ask("run the $mode job now (it can take half an hour)") { command("mk:run:$mode", mapOf("action" to "run", "job" to mode)) } }, enabled = sy.bool("running") != true) { Text("Run now", color = J.cyan, fontSize = 13.sp) }
                }
            }
            sy.objs("paused").takeIf { it.isNotEmpty() }?.let { p -> Muted("Paused for public holidays: " + p.joinToString(", ") { it.str("name").orEmpty() }) }
        }

        Panel("Do not contact") {
            val list = sy.objs("dnc")
            KeyRow("Never contact", list.size.toString())
            list.takeLast(5).reversed().forEach { KeyRow(it.str("value").orEmpty(), it.str("at").orEmpty(), J.muted) }
            var value by rememberSaveable { mutableStateOf("") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value, { value = it }, label = { Text("Email or domain") }, singleLine = true, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                ActionButton("Add", "mk:dnc" in s.running) {
                    val v = value.trim()
                    if (v.contains('.')) ask("never contact $v again and block it in Instantly") {
                        command("mk:dnc", mapOf("action" to "dnc", "value" to v)) { out -> "Never contact $v" + if (out.str("blocked") != null) "; blocked in Instantly." else "." }
                        value = ""
                    }
                }
            }
        }
    }

    val sent = mk.obj("sent")?.takeIf { it.isOk() }
    Panel("Cold emails sent" + (sent?.num("total")?.let { " · ${fmt(it)}" } ?: "")) {
        if (sent == null) { Muted(mk.obj("sent").str("error") ?: ext.obj("marketing").str("error") ?: "Pull down to read what Instantly sent."); return@Panel }
        KpiPairs(listOf(KpiData("Sent", fmt(sent.num("total"))), KpiData("Opened", fmt(sent.num("opened"))), KpiData("Replied", fmt(sent.num("replied"))),
            KpiData("Bounced", fmt(sent.num("bounced")), alert = (sent.num("bounced") ?: 0.0) > 0)))
        val rows = sent.objs("rows")
        if (rows.isEmpty()) Muted("No cold email has gone out yet" + (camps.str("firstStart")?.let { "; the first goes out $it" } ?: "") + ".")
        rows.take(60).forEach { r -> SentEmail(r, s, ::ask, vm) }
        Muted("Send again forwards the same email, with its original text, from the mailbox that sent it: to the same address, or to another contact at the organisation.")
    }

    Panel("Campaigns (Instantly)" + (camps?.objs("rows")?.size?.let { " · $it" } ?: "")) {
        if (camps == null) { Muted(mk.obj("campaigns").str("error") ?: ext.obj("marketing").str("error") ?: "Pull down to read the campaigns."); return@Panel }
        CampaignRows(camps, s, vm, ::ask)
    }
    if (camps != null) {
        TopList("Campaigns by language", camps.pairs("byLang"))
        TopList("Campaigns by region", camps.pairs("byRegion"))
        TopList("Campaigns by status", camps.pairs("byStatus"))
    }
    if (pros != null) {
        TopList("Prospects by country", pros.pairs("byCountry"))
        TopList("Prospects by segment", pros.pairs("bySegment"))
    }
    if (notes != null) Panel("Follow-up notes to askers") {
        KpiPairs(listOf(KpiData("Sent", fmt(notes.num("sent"))), KpiData("People", fmt(notes.num("people"))),
            KpiData("Stopped", fmt(notes.num("stopped")), alert = (notes.num("sent") ?: 0.0) >= 10 && (notes.num("stopped") ?: 0.0) / (notes.num("sent") ?: 1.0) > 0.2)))
        BarChart(notes.objs("daily").map { it.num("sent") ?: 0.0 }, notes.objs("daily").map { it.str("date").orEmpty() }, J.amber)
    }
    if (so != null) TopList("Posts by network", so.pairs("channels"))
    if (gsc != null) Panel("Search (Google)") {
        KpiPairs(listOf(KpiData("Clicks", fmt(gsc.num("clicks"))), KpiData("Impressions", fmt(gsc.num("impressions"))), KpiData("Avg position", fmt(gsc.num("position")))))
        gsc.objs("queries").filter { (it.num("clicks") ?: 0.0) > 0 }.take(6).forEach { KeyRow(it.str("query").orEmpty(), fmt(it.num("clicks"))) }
    }
    val kpis = sy.objs("kpis")
    if (kpis.isNotEmpty()) Panel("Weekly KPI tracker") {
        kpis.takeLast(6).reversed().forEach { w ->
            KeyRow(w.str("week_start").orEmpty(), listOf("new_prospects" to "prospects", "emails_sent" to "emails", "positive_replies" to "positive", "calls" to "calls")
                .mapNotNull { (k, label) -> w.str(k)?.takeIf { it.isNotEmpty() }?.let { "$it $label" } }.joinToString(" · ").ifEmpty { w.str("notes") ?: "—" })
        }
    }

    Deck(s, vm, ::ask)
    Needs(ext.obj("marketing"))
    Needs(ext.obj("marketing-sync"))
    ConfirmAction(confirm) { confirm = null }
}

private fun json(v: Any): JsonElement = when (v) { is Boolean -> JsonPrimitive(v); is Number -> JsonPrimitive(v); else -> JsonPrimitive(v.toString()) }

private val LEAD_EDITABLE = listOf("first_name", "last_name", "title", "top_finding", "best_point", "peer_1", "peer_2", "regulation_line", "course_or_programme", "month", "one_line_from_lecture_kit")

/** Needs you first, then ready, then what Jarvis is still filling, approved, dropped and uploaded. */
internal fun leadOrder(r: JsonObject): Int = when {
    !r.str("uploaded").isNullOrEmpty() -> 5
    r.bool("dropped") == true -> 4
    r.bool("approved") == true -> 3
    !r.str("ask").isNullOrEmpty() -> 0
    !r.str("missing").isNullOrEmpty() -> 2
    else -> 1
}

/** The fields Carlos can set for a row's missing items; report fields come with the Live Report. */
internal fun leadFields(missing: String): List<String> {
    val items = missing.split(";").map { it.trim() }.filter { it.isNotEmpty() }
    val noReport = items.any { it.startsWith("report") }
    return items.map { if (it == "top_finding (translate)") "top_finding" else it }
        .filter { it in LEAD_EDITABLE && !(noReport && it in setOf("top_finding", "best_point")) }
}

@Composable
private fun Lead(r: JsonObject, sy: JsonObject, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit, command: (String, Map<String, Any>, (JsonObject) -> String) -> Unit) {
    val email = r.str("email").orEmpty()
    val week = r.str("week").orEmpty()
    val uri = LocalUriHandler.current
    val missing = r.str("missing").orEmpty()
    val approved = r.bool("approved") == true
    val dropped = r.bool("dropped") == true
    val uploaded = r.str("uploaded").orEmpty()
    val why = r.str("ask").orEmpty()
    val busy = "mk:lead:$email" in s.running
    val queued: (JsonObject) -> String = { out -> (out.str("label") ?: "Queued") + if (out.bool("syncing") == true) ": the outreach Action does it in a few minutes." else ": the outreach Action does it on its next sync, within 3 hours." }
    var editing by remember(email) { mutableStateOf<String?>(null) }
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(listOfNotNull(r.str("first_name"), r.str("last_name")).joinToString(" ").ifBlank { email }, fontWeight = FontWeight.Medium, fontSize = 14.sp)
            Muted(listOfNotNull(r.str("org"), r.str("cc")?.uppercase(), r.str("score")?.takeIf { it.isNotEmpty() }?.let { "score $it" }).joinToString(" · "))
            when {
                uploaded.isNotEmpty() || approved || dropped -> {}
                why.isNotEmpty() -> Text("Needs you: $why", color = J.pink, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                missing.isNotEmpty() -> Text("Jarvis: " + (r.str("wait")?.ifEmpty { null } ?: "on it") + " ($missing)", color = J.amber, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (missing.isEmpty()) (r.str("top_finding")?.ifEmpty { null } ?: r.str("top_finding_en"))?.takeIf { it.isNotEmpty() }?.let { Text(it, color = J.dim, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
        r.str("live_report_url")?.takeIf { it.startsWith("https://") }?.let { url -> TextButton({ uri.openUri(url) }) { Text("Report", color = J.cyan, fontSize = 13.sp) } }
        when {
            uploaded.isNotEmpty() -> Text("uploaded", color = J.green, fontSize = 12.sp)
            Marketing.waiting(sy, "", email) -> Text("waiting", color = J.amber, fontSize = 12.sp)
            dropped -> TextButton({ ask("bring $email back to the leads") { command("mk:lead:$email", mapOf("action" to "lead-drop", "week" to week, "email" to email, "on" to false), queued) } }, enabled = !busy) { Text("Dropped · undo", color = J.muted, fontSize = 13.sp) }
            approved -> TextButton({ ask("unapprove $email") { command("mk:lead:$email", mapOf("action" to "approve", "week" to week, "email" to email, "on" to false), queued) } }, enabled = !busy) { Text("Approved ✓", color = J.green, fontSize = 13.sp) }
            missing.isEmpty() -> TextButton({ ask("approve $email for upload") { command("mk:lead:$email", mapOf("action" to "approve", "week" to week, "email" to email, "on" to true), queued) } }, enabled = !busy) { Text("Approve", color = J.cyan, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
        }
    }
    if (uploaded.isEmpty() && !approved && !dropped && missing.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        val host = r.str("host").orEmpty()
        if (missing.contains("report (") && host.isNotEmpty()) TextButton({
            ask("review $host again now, so its Live Report can be published") {
                vm.act("review:$host", "review", mapOf("url" to JsonPrimitive("https://$host/"), "lang" to JsonPrimitive(r.str("language") ?: "en"))) { "Reviewing $host. Jarvis fills the lead once its Live Report is published." }
            }
        }, enabled = "review:$host" !in s.running) { Text("Review again", color = J.cyan, fontSize = 13.sp) }
        if (missing.contains("email (personal address)")) TextButton({ ask("allow the personal address $email for outreach") { command("mk:lead:$email", mapOf("action" to "allow-personal", "week" to week, "email" to email), queued) } }, enabled = !busy) { Text("Allow address", color = J.cyan, fontSize = 13.sp) }
        leadFields(missing).forEach { f -> TextButton({ editing = f }, enabled = !busy) { Text("Set " + f.replace('_', ' '), color = J.cyan, fontSize = 13.sp) } }
        TextButton({ ask("drop $email: it is never approved or uploaded") { command("mk:lead:$email", mapOf("action" to "lead-drop", "week" to week, "email" to email, "on" to true), queued) } }, enabled = !busy) { Text("Drop", color = J.pink, fontSize = 13.sp) }
    }
    editing?.let { field ->
        var value by remember(field) { mutableStateOf(if (field == "top_finding") r.str("top_finding")?.ifEmpty { null } ?: r.str("top_finding_en").orEmpty() else "") }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text("${field.replace('_', ' ')} for $email") },
            text = { OutlinedTextField(value, { value = it }, singleLine = false, modifier = Modifier.fillMaxWidth()) },
            confirmButton = { TextButton({ val v = value.trim(); editing = null; if (v.isNotEmpty()) command("mk:lead:$email", mapOf("action" to "lead-set", "week" to week, "email" to email, "field" to field, "value" to v), queued) }) { Text("Set", color = J.cyan) } },
            dismissButton = { TextButton({ editing = null }) { Text("Cancel", color = J.muted) } }
        )
    }
}

@Composable
private fun Reply(r: JsonObject, s: UiState, ask: (String, () -> Unit) -> Unit, vm: JarvisViewModel) {
    val id = r.str("id").orEmpty()
    val from = r.str("from").orEmpty()
    val category = r.str("category").orEmpty()
    var open by rememberSaveable(id) { mutableStateOf(false) }
    var text by rememberSaveable(id) { mutableStateOf(r.str("draft").orEmpty()) }
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(from, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (category.isNotEmpty()) Text(category, color = categoryColor(category), fontSize = 12.sp)
        }
        Muted(listOfNotNull(r.str("campaign"), ago(r.str("at"))).joinToString(" · "))
        r.str("summary")?.takeIf { it.isNotEmpty() }?.let { Text(it, fontSize = 13.sp) }
        TextButton({ open = !open }) { Text(if (open) "Hide their email" else "Their email: " + r.str("subject").orEmpty(), color = J.cyan, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        if (open) Text(r.str("text").orEmpty(), color = J.muted, fontSize = 12.sp)
        val sent = r.str("sent").orEmpty()
        if (sent.isNotEmpty()) Muted("Answered ${ago(sent) ?: sent}.")
        else {
            OutlinedTextField(text, { text = it }, label = { Text("Answer") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton("Send in the same thread", "mk:reply:$id" in s.running) {
                    if (text.isNotBlank()) ask("send this answer to $from from the campaign's mailbox, in the same thread") {
                        vm.market("mk:reply:$id", "marketing-command", mapOf("action" to JsonPrimitive("reply"), "id" to JsonPrimitive(id), "text" to JsonPrimitive(text.trim()))) { out -> "Sent to ${out.obj("sent").str("to") ?: from}." }
                    }
                }
                TextButton({ ask("never contact $from again and block it in Instantly") {
                    vm.market("mk:dnc:$id", "marketing-command", mapOf("action" to JsonPrimitive("dnc"), "value" to JsonPrimitive(from), "reason" to JsonPrimitive("asked from a reply"))) { "Never contact $from." }
                } }) { Text("Do not contact", color = J.pink, fontSize = 13.sp) }
            }
        }
    }
}

@Composable
private fun SentEmail(r: JsonObject, s: UiState, ask: (String, () -> Unit) -> Unit, vm: JarvisViewModel) {
    val id = r.str("id").orEmpty()
    val to = r.str("to").orEmpty()
    val org = r.str("org").orEmpty()
    val bounced = r.bool("bounced") == true
    val replied = (r.num("replied") ?: 0.0) > 0
    val unsubscribed = r.bool("unsubscribed") == true
    var other by rememberSaveable(id) { mutableStateOf<String?>(null) }
    fun send(target: String) = ask("send the email to $to again" + (if (target != to) ", this time to $target" else "") + " (forwarded with its original text)") {
        vm.market("mk:resend:$id", "marketing-resend", mapOf("id" to JsonPrimitive(id), "to" to JsonPrimitive(target))) { out -> "Sent again to ${out.str("to") ?: target} from ${out.str("from").orEmpty()}." }
    }
    Column(Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(r.str("name")?.ifEmpty { null } ?: to, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            val (label, color) = when {
                replied -> "replied" to J.green
                bounced -> "bounced" to J.pink
                unsubscribed -> "unsubscribed" to J.pink
                (r.num("opened") ?: 0.0) > 0 -> "opened ${fmt(r.num("opened"))}×" to J.amber
                else -> "no open yet" to J.muted
            }
            Text(label, color = color, fontSize = 12.sp)
        }
        Muted(listOfNotNull(to.takeIf { r.str("name")?.isNotEmpty() == true }, org.ifEmpty { null }, ago(r.str("at"))).joinToString(" · "))
        Muted((if (r.str("kind") == "resend") "sent again from Jarvis" else listOfNotNull(r.str("campaign"), r.num("step")?.takeIf { it > 0 }?.let { "step ${it.toInt()}" }).joinToString(" · ")) + " · from " + r.str("from").orEmpty())
        r.str("subject")?.takeIf { it.isNotEmpty() }?.let { Text(it, color = J.dim, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        r.objs("resent").forEach { x -> Muted("Sent again to ${x.str("to").orEmpty()} ${ago(x.str("at")) ?: ""}") }
        if (!replied && !unsubscribed) {
            if (other != null) {
                OutlinedTextField(other.orEmpty(), { other = it }, label = { Text("Another contact at ${org.ifEmpty { "the organisation" }}") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (other == null) {
                    if (!bounced) ActionButton("Send again", "mk:resend:$id" in s.running) { send(to) }
                    TextButton({ other = "" }) { Text("To someone else", color = J.cyan, fontSize = 13.sp) }
                } else {
                    ActionButton("Send to them", "mk:resend:$id" in s.running) { other?.trim()?.takeIf { it.contains("@") }?.let { send(it) } }
                    TextButton({ other = null }) { Text("Cancel", color = J.muted, fontSize = 13.sp) }
                }
            }
        }
    }
}

private fun categoryColor(c: String): Color = when {
    c.contains("interest") -> J.green
    c.contains("opt") || c.contains("bounce") -> J.pink
    else -> J.amber
}

private val SEGMENTS = listOf("university", "tvet", "agency", "startup", "company", "other")

@Composable
private fun Deck(s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    Panel("Command deck") {
        var hosts by rememberSaveable { mutableStateOf("") }
        var cc by rememberSaveable { mutableStateOf("") }
        var segment by rememberSaveable { mutableStateOf(SEGMENTS[0]) }
        OutlinedTextField(hosts, { hosts = it }, label = { Text("Prospects: host, country, segment (one per line)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(cc, { cc = it.take(2).lowercase() }, label = { Text("cc") }, singleLine = true, modifier = Modifier.width(76.dp))
            Spacer(Modifier.width(8.dp))
            Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SEGMENTS.forEach { seg -> GlassChip(seg, seg == segment) { segment = seg } }
            }
        }
        ActionButton("Queue for the sweep", "mk:queue" in s.running) {
            val n = hosts.split('\n', ';').count { it.isNotBlank() }
            if (n > 0) ask("queue $n prospect site(s) for the nightly sweep") {
                vm.market("mk:queue", "marketing-queue", mapOf("hosts" to JsonPrimitive(hosts.trim()), "cc" to JsonPrimitive(cc), "sector" to JsonPrimitive(segment))) { out ->
                    "Queued ${fmt(out.num("added"))}" + (out.num("already")?.takeIf { it > 0 }?.let { ", ${fmt(it)} already on the list" } ?: "") + "."
                }
                hosts = ""
            }
        }
        var url by rememberSaveable { mutableStateOf("") }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(url, { url = it }, label = { Text("Review a URL now") }, singleLine = true, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            ActionButton("Review", "mk:review" in s.running) {
                val u = url.trim()
                if (u.contains('.')) ask("review $u now") {
                    vm.act("mk:review", "review", mapOf("url" to JsonPrimitive(u), "lang" to JsonPrimitive("en"))) { out -> "Reviewing ${out.str("host") ?: u}. It shows in URL Review when it is done." }
                    url = ""
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RunJob(s, vm, "sweepReviews", "Run the sweep")
            RunJob(s, vm, "refreshSocialHubStats", "Hub stats")
        }
        Muted("Every button asks first. Queued prospects join the nightly sweep (up to 48 a night).")
    }
}

/** Instantly campaigns, each with Activate or Pause; on Marketing and Outreach. */
@Composable
fun CampaignRows(camps: JsonObject, s: UiState, vm: JarvisViewModel, ask: (String, () -> Unit) -> Unit) {
    camps.objs("rows").forEach { c ->
        val id = c.str("id").orEmpty()
        val name = c.str("name").orEmpty()
        val status = c.str("status").orEmpty()
        val leads = c.num("leads")?.toInt() ?: 0
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(name, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                Muted(listOfNotNull(status, c.str("start")?.let { "starts $it" }, "$leads leads", "${fmt(c.num("sent"))} sent", "${fmt(c.num("replies"))} replies").joinToString(" · "))
            }
            val action = when (status) { "active" -> "pause"; "draft", "paused" -> "activate"; else -> null }
            if (action != null) TextButton({
                ask(if (action == "pause") "pause $name now" else "activate $name" + (if (leads == 0) " (it has no leads yet, so nothing sends until leads are uploaded)" else "") + (c.str("start")?.let { ", sending from $it" } ?: "")) {
                    vm.market("mk:camp:$id", "marketing-campaign", mapOf("id" to JsonPrimitive(id), "action" to JsonPrimitive(action), "name" to JsonPrimitive(name))) { out -> "${out.str("name") ?: name} is ${out.str("status")}." }
                }
            }, enabled = "mk:camp:$id" !in s.running) { Text(action.replaceFirstChar { it.uppercase() }, color = if (action == "pause") J.amber else J.cyan, fontSize = 13.sp) }
        }
    }
}
