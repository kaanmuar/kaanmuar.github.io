package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import com.carlosandmunoz.jarvis.device.Device
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.push.CodeCopy
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.at
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.bytes
import com.carlosandmunoz.jarvis.data.doubles
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.pairs
import com.carlosandmunoz.jarvis.data.pct
import com.carlosandmunoz.jarvis.data.prim
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.strings
import com.carlosandmunoz.jarvis.data.text
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

val PRODUCTS = listOf("inbox" to "Inbox", "cv" to "CV", "studio" to "QA Studio", "lab" to "QA Lab", "review" to "URL Review", "hub" to "Social hub")

/** Products-tab chips: the site products plus Outreach, Marketing, Engagement and GitHub (#2526), which the snapshot keeps under external. */
val CHIPS = PRODUCTS + ("outreach" to "Outreach") + ("marketing" to "Marketing") + ("engagement" to "Engagement") + ("github" to "GitHub")

private fun humanize(key: String) = key.replace(Regex("([a-z])([A-Z])"), "$1 $2").replaceFirstChar { it.uppercase() }

private fun JsonObject?.ext(key: String): JsonObject? = this.obj("external").obj(key)

// ---------------------------------------------------------------- Overview

@Composable
fun OverviewScreen(s: UiState, vm: JarvisViewModel, open: (String) -> Unit) {
    val snap = s.snapshot
    var sheet by remember { mutableStateOf<JsonObject?>(null) }
    var showHidden by remember { mutableStateOf(false) }
    val wide = snap.obj("wide")
    val deck = wide.objs("deck")
    val roomy = LocalColumns.current >= 2
    Row(Modifier.layoutId(WIDE).fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (roomy) Hologram(snap.num("readiness"), deck.firstOrNull { it.str("key") == "visits" }?.prim("value").text(), 164.dp)
        else Ring(snap.num("readiness"), "READY")
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val st = snap?.let { Home.status(it) } ?: Home.Status(null, 0, 0)
            Text(st.headline, fontSize = 20.sp, fontWeight = FontWeight.SemiBold,
                color = when (st.level) { "alert" -> J.pink; "warn" -> J.amber; else -> J.green })
            val down = snap.objs("connections").filter { it.str("state") != "live" }
            Muted(if (down.isEmpty()) "Every connection is live" else down.joinToString { (it.str("name") ?: "") + " " + (it.str("state") ?: "") }, maxLines = if (roomy) 2 else Int.MAX_VALUE)
            if (roomy) { Spacer(Modifier.height(4.dp)); DeckStrip(deck) }
        }
    }

    val trend = wide.obj("trend")
    val lines = trend.objs("series").map { (it.str("name") ?: "") to it["values"].doubles() }
    if (lines.any { l -> l.second.any { it > 0 } }) Panel("Every product per day", Modifier.layoutId(WIDE)) {
        LineChart(lines, trend.at("labels").strings(), height = if (roomy) 170 else 130)
        Muted("Visits for the sites, opens for URL Review, messages for the inbox, events for the hub.")
    }

    Panel("Briefing", Modifier.layoutId(WIDE), trailing = { FoldAllButton(); TextButton(onClick = vm::brief, enabled = !s.briefBusy) { Text(if (s.briefBusy) "Thinking…" else if (s.brief == null) "Ask Gemini" else "Again", maxLines = 1, softWrap = false) } }) {
        s.brief?.let { text ->
            Text(text, fontSize = 14.sp)
            Row { ActionButton("Email it to me", "email-briefing" in s.running) { vm.act("email-briefing", "email-briefing", mapOf("text" to JsonPrimitive(text))) { if (it.bool("sent") == true) "Briefing sent." else "Mail is off." } } }
        }
        val items = snap.objs("briefing")
        val hidden = snap.objs("briefHidden")
        if (items.isEmpty()) Muted("Nothing to flag.")
        items.forEach { b -> BriefRow(b) { sheet = b } }
        if (hidden.isNotEmpty()) TextButton(onClick = { showHidden = !showHidden }) { Text((if (showHidden) "Hide " else "Show ") + "${hidden.size} snoozed or dismissed", fontSize = 12.sp) }
        if (showHidden) hidden.forEach { b -> BriefRow(b, dim = true) { sheet = b } }
    }
    sheet?.let { BriefSheet(it, s, vm, open) { sheet = null } }

    Proposals(s, vm, open)

    Panel("Products") {
        PRODUCTS.forEach { (key, name) ->
            val p = snap.obj("products").obj(key)
            val k = p.objs("kpis").firstOrNull()
            ProductRow(name, (k?.str("label") ?: "") + " " + k?.prim("value").text(), p.obj("series").at("values").doubles(), k?.str("delta"), (k?.num("dir") ?: 0.0).toInt()) { open(key) }
        }
        val pipe = snap.ext("outreach").obj("pipeline")?.takeIf { it.isOk() }
        val reviewed = delta(pipe.num("reviews"), pipe.num("priorReviews"))
        ProductRow("Outreach", "Reviewed " + (pipe?.prim("reviews")).text(), pipe.objs("daily").map { it.num("reviews") ?: 0.0 }, reviewed, dirOf(reviewed)) { open("outreach") }
    }

    Goals(snap.objs("goals"))

    val money = snap.ext("money")
    if (money != null) Panel("Money") {
        KpiPairs(listOf(
            KpiData("Revenue", "$" + fmt(money.at("revenue").num("usd"), 2), delta(money.at("revenue").num("usd"), money.at("prior").num("usd"))),
            KpiData("Sales", fmt(money.at("revenue").num("count")), delta(money.at("revenue").num("count"), money.at("prior").num("count")))
        ).map { it.copy(dir = dirOf(it.delta)) })
    }
}

@Composable
private fun ProductRow(name: String, kpi: String, series: List<Double>, delta: String?, dir: Int, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().tilt(4f).clickable(onClick = onClick).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(110.dp)) {
            Text(name, fontSize = 14.sp)
            Text(kpi, color = J.muted, fontSize = 12.sp)
        }
        Sparkline(series, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(8.dp))
        Text(delta ?: "", color = when (dir) { 1 -> J.green; -1 -> J.pink; else -> J.muted }, fontSize = 12.sp, modifier = Modifier.width(48.dp))
    }
}

fun delta(now: Double?, prior: Double?): String? {
    if (now == null || prior == null) return null
    if (prior == 0.0) return if (now == 0.0) "±0" else "new"
    val p = ((now - prior) / prior * 100).toInt()
    return (if (p > 0) "+" else "") + p + "%"
}

fun dirOf(delta: String?) = when { delta == null -> 0; delta.startsWith("+") || delta == "new" -> 1; delta.startsWith("-") -> -1; else -> 0 }

/** A KPI with its change against the period before; no change when either number is missing. */
fun kpiVs(label: String, now: Double?, prior: Double?, alert: Boolean = false, shown: (Double?) -> String = { fmt(it) }): KpiData {
    val d = delta(now, prior)
    return KpiData(label, shown(now), d, dirOf(d), alert)
}

@Composable
fun Goals(goals: List<JsonObject>) {
    if (goals.isEmpty()) return
    Panel("Goals") {
        goals.forEach { g ->
            Column {
                Row {
                    Text(g.str("label") ?: "", fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Text(fmt(g.num("value")) + " / " + fmt(g.num("target")), fontFamily = Mono, fontSize = 12.sp, color = J.level(g.str("status")))
                }
                GlowBar(((g.num("pct") ?: 0.0) / 100).toFloat(), J.level(g.str("status")))
                Text((g.str("status") ?: "").replace('-', ' ') + (g.num("projected")?.let { " · on pace for " + fmt(it) } ?: ""), color = J.dim, fontSize = 11.sp)
            }
        }
    }
}

// ---------------------------------------------------------------- Products

@Composable
fun ProductsScreen(s: UiState, vm: JarvisViewModel, product: String, pick: (String) -> Unit) {
    if (LocalColumns.current >= 2) {
        ListDetail(
            list = { ProductList(s.snapshot.obj("wide").objs("products"), product, pick) },
            detail = {
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    Masonry(Device.columns(maxWidth.value.toInt()), Modifier.fillMaxWidth()) { key(product) { ProductBody(s, vm, product) } }
                }
            }
        )
        return
    }
    val chips = rememberScrollState()
    LaunchedEffect(product, chips.maxValue) { chips.animateScrollTo(chips.maxValue * CHIPS.indexOfFirst { it.first == product }.coerceAtLeast(0) / (CHIPS.size - 1)) }
    Row(Modifier.layoutId(WIDE).horizontalScroll(chips).padding(horizontal = 14.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CHIPS.forEach { (key, name) -> GlassChip(name, key == product) { pick(key) } }
    }
    key(product) { ProductBody(s, vm, product) }
}

/** Every product with its lead number and trend; the picked one is lit. Falls back to the chip names before the snapshot has `wide`. */
@Composable
private fun ProductList(rows: List<JsonObject>, product: String, pick: (String) -> Unit) {
    Panel("Products") {
        val list = rows.ifEmpty { CHIPS.map { (k, n) -> JsonObject(mapOf("key" to JsonPrimitive(k), "name" to JsonPrimitive(n))) } }
        list.forEach { r ->
            val key = r.str("key") ?: return@forEach
            val on = key == product
            val k = r.objs("kpis").firstOrNull()
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                    .background(if (on) J.cyan.copy(alpha = 0.14f) else Color.Transparent)
                    .border(1.dp, if (on) J.cyan.copy(alpha = 0.8f) else J.line.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                    .clickable(onClickLabel = "Show") { pick(key) }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(r.str("name") ?: key, fontSize = 14.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, color = if (on) J.text else J.muted)
                    Sparkline(r.obj("series")?.get("values").doubles(), if (on) J.cyan else J.dim, Modifier.height(18.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text(k?.prim("value").text().ifBlank { "—" }, fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = J.text)
                    Text(k?.str("label") ?: "no data yet", fontSize = 11.sp, color = J.dim, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun ProductBody(s: UiState, vm: JarvisViewModel, product: String) {
    if (product == "outreach") { OutreachScreen(s, vm); return }
    if (product == "marketing") { MarketingScreen(s, vm); return }
    if (product == "engagement") { EngagementScreen(s, vm); return }
    if (product == "github") { GithubScreen(s, vm); return }
    if (product == "hub") SocialHub(s, vm)
    val snap = s.snapshot
    val p = snap.obj("products").obj(product)
    if (p == null) { Panel("No data") { Muted("Pull down to load this product.") }; return }

    Panel(PRODUCTS.toMap()[product] ?: product) {
        KpiGrid(p.objs("kpis"))
        p.obj("anomaly")?.let { a -> Text("Unusual last day: ${fmt(a.num("last"))} against an average of ${fmt(a.num("mean"))} (z ${a.num("z")})", color = J.amber, fontSize = 12.sp) }
    }
    if (product == "review") {
        PeoplePanel(s)
        LocalPanel(s)
        TopList("Funnel", p.pairs("funnel"), 4)
    }

    val series = p.obj("series")
    Panel(when (product) { "inbox" -> "Messages per day"; "review" -> "Opens per day"; "hub" -> "Hub and post views per day"; else -> "Visits per day" }) {
        BarChart(series.at("values").doubles(), series.at("labels").strings())
    }
    p.obj("reviewSeries")?.let { Panel("Reviews per day") { BarChart(it.at("values").doubles(), it.at("labels").strings(), J.violet) } }
    p.obj("ratingSeries")?.let { Panel("Ratings per day") { BarChart(it.at("values").doubles(), it.at("labels").strings(), J.amber) } }

    val grid = (p["heatmap"] as? JsonArray)?.map { it.doubles() } ?: emptyList()
    Heatmap(grid, p.str("peak"))

    if (product in setOf("cv", "studio", "lab", "review", "hub")) PageHealth(snap, product)

    (p["lists"] as? JsonObject)?.keys?.forEach { key -> TopList(humanize(key), p.obj("lists").pairs(key)) }

    when (product) {
        "review" -> ReviewOps(s, vm)
        "hub" -> Panel("Actions") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RunJob(s, vm, "refreshSocialHubStats", "Refresh stats")
                RunJob(s, vm, "dispatchFacebookQueue", "Post Facebook queue")
            }
        }
        "cv", "studio", "lab" -> Panel("Reports") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("daily", "weekly").forEach { period -> SendReport(s, vm, "site", period) }
            }
        }
    }
}

@Composable
private fun PageHealth(snap: JsonObject?, product: String) {
    val up = snap.ext("uptime").objs("pages").firstOrNull { it.str("product") == product }
    val speed = snap.ext("speed").objs("pages").firstOrNull { it.str("product") == product }
    if (up == null && speed == null) return
    Panel("Page health") {
        up?.let { KeyRow("Uptime (${it.str("name")})", if (it.bool("ok") == true) "${it.num("status")?.toInt()} · ${fmt(it.num("ms"))} ms" else "DOWN ${it.str("error") ?: it.num("status")?.toInt() ?: ""}", if (it.bool("ok") == true) J.green else J.pink, it.str("url")) }
        speed?.let { sp ->
            KeyRow("PageSpeed score", fmt(sp.num("score")), score(sp.num("score")))
            sp.obj("lab")?.let { l -> KeyRow("LCP · TBT · CLS", "${fmt(l.num("lcp"))} ms · ${fmt(l.num("tbt"))} ms · ${l.num("cls") ?: "—"}") }
        }
    }
}

private fun score(v: Double?) = when { v == null -> J.muted; v >= 90 -> J.green; v >= 50 -> J.amber; else -> J.pink }

@Composable
private fun ReviewOps(s: UiState, vm: JarvisViewModel) {
    val health = s.snapshot.ext("health")
    Panel("Failed runs") {
        Text("${fmt(health.at("failures").num("total"))} failures · ${fmt(health.at("reruns").num("total"))} re-runs", fontSize = 14.sp)
        health.at("failures").pairs("causes").take(6).forEach { (k, v) -> KeyRow(k, fmt(v)) }
        health.obj("failures").objs("latest").take(8).forEach { StatusRow("alert", it.str("host") ?: "", (it.str("cause") ?: "") + " · " + (it.str("message") ?: "")) }
    }
    val alerts = health.obj("alerts").objs("latest")
    if (alerts.isNotEmpty()) Panel("Review alerts") { alerts.take(10).forEach { StatusRow("warn", it.str("title") ?: it.str("kind") ?: "", ago(it.str("at")), it.str("url")) } }
    Panel("Actions") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RunJob(s, vm, "sweepReviews", "Sweep reviews")
            RunJob(s, vm, "rerunReviewFailures", "Re-run failures")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("daily", "weekly").forEach { SendReport(s, vm, "review", it) } }
        var host by remember { mutableStateOf("") }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(host, { host = it }, label = { Text("Unlist a host") }, singleLine = true, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            Button(onClick = { vm.act("unlist", "unlist", mapOf("host" to JsonPrimitive(host))) { "Unlisted " + (it.str("unlisted") ?: host) }; host = "" }, enabled = host.contains('.') && "unlist" !in s.running) { Text("Unlist") }
        }
    }
}

@Composable
fun RunJob(s: UiState, vm: JarvisViewModel, job: String, label: String = job) =
    ActionButton(label, "job:$job" in s.running) { vm.act("job:$job", "run-job", mapOf("job" to JsonPrimitive(job))) { "Started $label." } }

@Composable
private fun SendReport(s: UiState, vm: JarvisViewModel, kind: String, period: String) =
    ActionButton("Send $period", "report:$kind:$period" in s.running) {
        vm.act("report:$kind:$period", "send-report", mapOf("kind" to JsonPrimitive(kind), "period" to JsonPrimitive(period))) { it.str("note") ?: "Done." }
    }

// ---------------------------------------------------------------- Outreach

private fun daysText(n: Int) = when { n == 0 -> "today"; n > 0 -> "in $n " + (if (n == 1) "day" else "days"); else -> "${-n} days ago" }

@Composable
private fun OutreachScreen(s: UiState, vm: JarvisViewModel) {
    val snap = s.snapshot
    val ou = snap.ext("outreach")
    Approvals(s, vm)
    val brief = snap.objs("briefing").filter { it.str("product") == "outreach" }
    if (brief.isNotEmpty()) Panel("Briefing") { brief.forEach { StatusRow(it.str("level"), it.str("text") ?: "") } }
    if (ou == null || !ou.isOk()) { Panel("Outreach") { Muted(ou?.str("error") ?: "Pull down to read the outreach pipeline, Instantly and the plan.") }; return }
    val pipe = ou.obj("pipeline")?.takeIf { it.isOk() }
    val mail = ou.obj("instantly")?.takeIf { it.isOk() }
    val plan = ou.obj("plan")?.takeIf { it.isOk() }
    val th = snap.obj("thresholds")
    val warmNeed = th.num("outreachWarmup") ?: 80.0
    val bounceAt = th.num("outreachBouncePct") ?: 3.0
    val deadlineDays = th.num("outreachDeadlineDays") ?: 14.0
    val weekly = plan.obj("weekly")
    val accounts = mail.objs("accounts")
    val warm = if (accounts.isEmpty()) null else accounts.minOf { it.num("score") ?: 0.0 }
    val contacted = mail.num("contacted") ?: 0.0
    val rates = mail.obj("rates")
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    val was = mail.obj("prior")
    val links = ou.obj("links")?.takeIf { it.isOk() }
    fun paid(l: JsonObject?) = fmt(l.num("paid")) + " · " + fmt(l.num("usd")) + " USD"

    Panel("Outreach") {
        KpiPairs(listOf(
            KpiData("Prospects queued", fmt(pipe.num("queued"))),
            kpiVs("Reviewed in range", pipe.num("reviews"), pipe.num("priorReviews")),
            KpiData("With a Live Report", fmt(pipe.num("withLiveReport"))),
            kpiVs("Emails sent", mail.num("sent"), was.num("sent")),
            if (contacted > 0) kpiVs("Reply rate", rates.num("reply"), if ((was.num("contacted") ?: 0.0) > 0) was.obj("rates").num("reply") else null,
                alert = contacted >= 50 && (rates.num("reply") ?: 0.0) < (weekly.num("replyPct") ?: 0.0)) { fmt(it) + "%" }
            else KpiData("Reply rate", "—"),
            kpiVs("Interested", mail.num("interested"), was.num("interested")),
            KpiData("Lowest warm-up", fmt(warm), alert = warm != null && warm < warmNeed),
            if (links != null) kpiVs("Paid from qalabreview.com", links.num("paid"), links.obj("prior").num("paid"), alert = links.bool("live") != true) { paid(links) }
            else KpiData("Paid from qalabreview.com", "—")
        ))
    }

    Panel("90-day plan") {
        if (plan == null) { Muted("The plan is not uploaded."); Needs(ou); return@Panel }
        val day = plan.num("day")?.toInt() ?: 0
        val length = plan.num("length")?.toInt() ?: 0
        val phase = plan.obj("phase")
        Text((if (day > 0) "Day ${minOf(day, length)} of $length" else "Starts ${plan.str("start") ?: ""}") + (phase?.let { " · ${it.str("name")} (ends ${it.str("end")})" } ?: ""), fontSize = 14.sp)
        plan.obj("next")?.let { n -> Muted("Next milestone ${daysText(n.num("daysLeft")?.toInt() ?: 0)} (${n.str("date")}): ${n.str("label")}") }
        plan.objs("deadlines").forEach { d ->
            val left = d.num("daysLeft")?.toInt() ?: 0
            KeyRow("${d.str("label")} · ${d.str("date")}", daysText(left), if (left <= 7) J.pink else if (left <= deadlineDays) J.amber else J.muted)
        }
        plan.objs("milestones").forEach { m -> KeyRow("${m.str("label")} · ${m.str("date")}", if (m.bool("past") == true) "past" else "", J.dim) }
    }

    Panel("Weekly funnel against the plan") {
        fun ratio(a: Double?, b: Double?) = if (a == null || b == null || b == 0.0) null else Math.round(a / b * 100).toDouble()
        val openOff = contacted > 0 && mail?.bool("openTracking") == false
        listOf(
            Triple("Prospects reviewed this week", pipe.num("thisWeek"), weekly.num("prospects") to ""),
            Triple("Reviewed prospects with a Live Report", if (pipe != null) ratio(pipe.num("reviewedWithLiveReport"), maxOf(1.0, pipe.num("reviewedHosts") ?: pipe.num("swept") ?: 0.0)) else null, weekly.num("liveReportPct") to "%"),
            Triple("Open rate", if (contacted > 0 && !openOff) rates.num("open") else null, weekly.num("openPct") to "%"),
            Triple("Reply rate", if (contacted > 0) rates.num("reply") else null, weekly.num("replyPct") to "%"),
            Triple("Positive replies", if (contacted > 0) rates.num("positive") else null, weekly.num("positivePct") to "%")
        ).forEach { (metric, now, target) ->
            val (goal, unit) = target
            KeyRow(metric, (if (metric == "Open rate" && openOff) "Not tracked" else now?.let { fmt(it) + unit } ?: "—") + " / " + (goal?.let { fmt(it) + unit } ?: "—"),
                if (now == null) J.muted else if (goal == null || now >= goal) J.green else J.pink)
        }
    }

    TargetsPanel(s, vm)

    Panel("Prospect pipeline (nightly sweep)") {
        if (pipe == null) { Muted(ou.obj("pipeline").str("error") ?: "Not loaded."); return@Panel }
        KpiPairs(listOf(
            KpiData("Swept", fmt(pipe.num("swept"))),
            KpiData("Left in queue", fmt(pipe.num("left")), alert = pipe.num("left") == 0.0 && (pipe.num("queued") ?: 0.0) > 0),
            KpiData("Avg score", fmt(pipe.num("avgScore")))
        ))
        BarChart(pipe.objs("daily").map { it.num("reviews") ?: 0.0 }, pipe.objs("daily").map { it.str("date") ?: "" })
        if (pipe.objs("bySegment").isEmpty()) Muted("No prospects queued. Add a list with scripts/sweep-outreach.js.")
    }
    if (pipe != null) {
        TopList("Prospects by segment", pipe.pairs("bySegment"))
        TopList("Review results", pipe.pairs("results"))
    }

    Panel("Campaigns (Instantly)") {
        if (mail == null) { Muted(ou.obj("instantly").str("error") ?: "Not loaded."); return@Panel }
        mail.objs("status").forEach { KeyRow(it.str("label") ?: "", fmt(it.num("value"))) }
        KpiPairs(listOf(
            KpiData("Contacted", fmt(mail.num("contacted"))), KpiData("Opened", fmt(mail.num("opened"))),
            KpiData("Replies", fmt(mail.num("replies"))), KpiData("Meetings", fmt(mail.num("meetings"))),
            KpiData("Bounced", fmt(mail.num("bounced")), alert = (mail.num("sent") ?: 0.0) >= 20 && (rates.num("bounce") ?: 0.0) >= bounceAt),
            KpiData("Unsubscribed", fmt(mail.num("unsubscribed")))
        ))
        val rows = snap.ext("marketing").obj("campaigns")?.takeIf { it.isOk() }
        if (rows != null) {
            CampaignRows(rows, s, vm) { text, run -> confirm = PendingAction(text, run) }
            Muted("Activate starts a campaign on its start date and sending window; nothing goes out to a campaign with no leads. Pause stops it at once.")
        } else {
            val camps = mail.objs("byCampaign")
            if (camps.isEmpty()) Muted("No campaign has sent yet.")
            camps.forEach { c -> StatusRow("info", c.str("name") ?: "", "${fmt(c.num("sent"))} sent · ${fmt(c.num("opened"))} opened · ${fmt(c.num("replies"))} replies · ${fmt(c.num("bounced"))} bounced") }
        }
    }
    ConfirmAction(confirm) { confirm = null }

    if (mail != null) Panel("Mailboxes and warm-up") {
        if (accounts.isEmpty()) Muted("No mailboxes connected.")
        accounts.forEach { a ->
            val score = a.num("score")
            val good = a.str("status") == "active" && a.str("warmup") == "on" && (score == null || score >= warmNeed)
            StatusRow(if (good) "good" else "warn", a.str("email") ?: "", listOfNotNull(a.str("status"), "warm-up " + (a.str("warmup") ?: "—"), score?.let { "score " + fmt(it) }, a.num("dailyLimit")?.let { "limit " + fmt(it) + "/day" }).joinToString(" · "))
            a.str("error")?.takeIf { it.isNotEmpty() }?.let { StatusRow("alert", "Reconnect in Instantly", it, url = "https://app.instantly.ai/app/accounts") }
        }
    }

    QalabLinksPanel(ou, vm)

    val dns = ou.obj("mail")
    Panel("Sending domain" + (dns.str("domain")?.let { " ($it)" } ?: "")) {
        val checks = dns.objs("checks")
        if (checks.isEmpty()) Muted(dns.str("error") ?: "Not loaded.")
        checks.forEach { StatusRow(if (it.bool("ok") == true) "good" else "alert", it.str("name") ?: "", it.str("detail")) }
    }

    val visits = snap.obj("outreachVisits")
    if (visits.objs("campaigns").isEmpty()) Panel("Visits from outreach links") { Muted("No visits tagged utm_source=outreach in this range yet.") }
    else TopList("Visits from outreach links", visits.pairs("campaigns"))
    Needs(ou)
}

// ---------------------------------------------------------------- Business

@Composable
fun BusinessScreen(s: UiState, vm: JarvisViewModel) {
    val snap = s.snapshot
    CallsPanel(s, vm)
    val money = snap.ext("money")
    Panel("Revenue") {
        Needs(money)
        if (money.isOk()) {
            val r = money.obj("revenue"); val p = money.obj("prior")
            KpiPairs(listOf(
                KpiData("Revenue", "$" + fmt(r.num("usd"), 2), delta(r.num("usd"), p.num("usd"))),
                KpiData("Sales", fmt(r.num("count")), delta(r.num("count"), p.num("count"))),
                KpiData("Average sale", "$" + fmt(r.num("avgUsd"), 2)),
                KpiData("Paid runs", fmt(r.num("paidRuns")), delta(r.num("paidRuns"), p.num("paidRuns"))),
                KpiData("Refunds", "$" + fmt(money.num("refundsUsd"), 2), alert = (money.num("refundsUsd") ?: 0.0) > 0),
                KpiData("PayPal disputes", fmt(money.at("paypal").num("disputesOpen")), alert = (money.at("paypal").num("disputesOpen") ?: 0.0) > 0)
            ).map { it.copy(dir = if (it.dir == 0) dirOf(it.delta) else it.dir) })
            BarChart(money.objs("daily").map { it.num("usd") ?: 0.0 }, money.objs("daily").map { it.str("date") ?: "" }, J.green)
            money.obj("paypal")?.obj("transactions")?.let { t -> KeyRow("PayPal gross · fees · net", "$${fmt(t.num("grossUsd"), 2)} · $${fmt(t.num("feesUsd"), 2)} · $${fmt(t.num("netUsd"), 2)}") }
            KeyRow("Stripe", money.at("stripe").str("mode") ?: "—")
        }
    }
    val empties = Empties()
    val wide = snap.obj("wide")
    val mix = wide.pairs("revenue")
    if (mix.isNotEmpty()) Panel("Revenue by product") { Donut(mix, "USD") }
    else empties.add("Revenue by product", if (money.isOk()) "no paid sale in this range" else money.str("error"))
    val funnel = wide.objs("funnel")
    if (funnel.isNotEmpty()) Panel("Outreach funnel") {
        Funnel(funnel.map { (it.str("label") ?: "") to it.num("value") })
        Muted("Reviewed by the nightly sweep in range, emailed through Instantly, replied, and paid through a qalabreview.com link. Instantly counts every contact it emailed, so Notified can pass Reviewed.")
    } else empties.add("Outreach funnel", snap.ext("outreach").str("error"))
    if (money.isOk()) {
        TopList("By provider", money.pairs("byProvider"))
    }

    val email = snap.ext("email")
    if (!email.isOk()) empties.add("Email (SendGrid)", email.str("error"))
    else Panel("Email (SendGrid)") {
        Needs(email)
        run {
            val t = email.obj("totals"); val r = email.obj("rates")
            KpiPairs(listOf(
                KpiData("Delivered", fmt(t.num("delivered"))), KpiData("Delivered %", pct(r.num("delivered"))),
                KpiData("Opened %", pct(r.num("opened"))), KpiData("Clicked %", pct(r.num("clicked"))),
                KpiData("Bounces + blocks", fmt((t.num("bounces") ?: 0.0) + (t.num("blocks") ?: 0.0)), alert = (r.num("bad") ?: 0.0) > 0.05),
                KpiData("Spam reports", fmt(t.num("spam_reports")), alert = (t.num("spam_reports") ?: 0.0) > 0)
            ))
            BarChart(email.objs("daily").map { it.num("delivered") ?: 0.0 }, email.objs("daily").map { it.str("date") ?: "" })
            email.obj("suppressions")?.let { sup ->
                listOf("bounces", "blocks", "spam").forEach { k ->
                    sup.objs(k).groupBy { (it.str("domain") ?: "") to (it.str("reason") ?: "").take(90) }.entries.take(4)
                        .forEach { (key, rows) -> StatusRow("warn", "$k: ${key.first}" + if (rows.size > 1) " ×${rows.size}" else "", key.second) }
                }
            }
        }
    }

    val search = snap.ext("search")
    if (!search.isOk()) empties.add("Search", search.str("error"))
    else Panel("Search") {
        Needs(search)
        search.obj("console")?.let { c ->
            if (c.bool("ok") == true) KpiPairs(listOf(KpiData("Google clicks", fmt(c.num("clicks"))), KpiData("Impressions", fmt(c.num("impressions"))), KpiData("CTR", pct(c.num("ctr"))), KpiData("Avg position", fmt(c.num("position")))))
            else Muted("Search Console: " + (c.str("error") ?: c.str("need") ?: "off"))
        }
        val braveDepth = search.obj("brave").num("depth")?.toInt() ?: 20
        search.obj("brave").objs("queries").forEach { q -> KeyRow(q.str("query") ?: "", q.num("position")?.let { "#" + it.toInt() } ?: "not in top $braveDepth", if (q.num("position") != null) J.green else J.muted, q.str("url")) }
    }
    search.obj("index")?.takeIf { it.bool("ok") == true }?.let { ix ->
        Panel("Search index (Brave)") {
            KpiPairs(listOf(KpiData("Pages indexed", fmt(ix.num("indexed"))), KpiData("Sitemap pages", fmt(ix.num("total"))), KpiData("Missing", fmt(ix.num("missing")))))
            ix.str("zeroSince")?.let { Muted("None indexed since " + it.take(10) + ".") }
            ix.at("mainMissing").strings().forEach { u -> KeyRow(u.removePrefix("https://carlosandmunoz.com").ifEmpty { "/" }, "missing", J.muted, u) }
            Muted(ix.str("pushedAt")?.let { at -> "Last sent " + at.take(10) + ": Brave took " + fmt(ix.obj("pushed").num("brave")) + "." } ?: "Not sent yet: Jarvis sends the missing pages on its next weekly pass.")
        }
    }
    search.obj("console")?.let { c -> TopList("Google queries", c.objs("queries").map { (it.str("query") ?: "") to (it.num("clicks") ?: 0.0) }) }

    val social = snap.ext("social")
    if (!social.isOk()) empties.add("Social", social.str("error"))
    else Panel("Social") {
        Needs(social)
        if (social.isOk()) {
            KpiPairs(listOf(KpiData("Posts sent", fmt(social.num("sent"))), KpiData("Failed", fmt(social.num("failed")), alert = (social.num("failed") ?: 0.0) > 0), KpiData("YouTube views", fmt(social.at("youtube").num("views")))))
            BarChart(social.objs("daily").map { it.num("posts") ?: 0.0 }, social.objs("daily").map { it.str("date") ?: "" }, J.violet)
            social.objs("latest").take(8).forEach { StatusRow(if (it.str("result") == "ok" || it.str("result") == "sent") "good" else "warn", "${it.str("channel")}: ${it.str("post") ?: ""}", ago(it.str("at")), it.str("url")) }
        }
    }
    if (social.isOk()) {
        TopList("Channels", social.pairs("channels"))
        val videos = social.obj("youtube").objs("videos")
        if (videos.isNotEmpty()) Panel("YouTube") { videos.take(10).forEach { v -> KeyRow(v.str("title") ?: "", "${fmt(v.num("views"))} views", url = v.str("id")?.let { "https://youtu.be/$it" }) } }
    }
    NoDataRow(empties.items)
}

// ---------------------------------------------------------------- Traffic

@Composable
fun TrafficScreen(s: UiState) {
    val snap = s.snapshot
    val empties = Empties()
    val traffic = snap.obj("wide").obj("traffic")
    val compare = traffic.obj("compare")
    val lines = compare.objs("series")
    if (lines.isNotEmpty()) Panel("Site counter, GA4 and Cloudflare per day", Modifier.layoutId(WIDE)) {
        val color = mapOf("site" to J.green, "ga4" to J.cyan, "cloudflare" to J.violet)
        LineChart(lines.map { (it.str("name") ?: "") to it["values"].doubles() }, compare.at("labels").strings(), lines.map { color[it.str("key")] ?: J.dim }, if (LocalColumns.current >= 2) 170 else 130)
        compare.objs("totals").forEach { t -> KeyRow(t.str("label") ?: "", t.num("value")?.let { fmt(it) } ?: (t.str("why") ?: "off"), if (t.num("value") == null) J.muted else J.text) }
        Muted("The site counts every visit; GA4 only visitors who allow analytics; Cloudflare counts page views at the edge, bots it lets through included.")
    }
    val grid = (traffic?.get("heatmap") as? JsonArray)?.map { it.doubles() } ?: emptyList()
    if (grid.any { r -> r.any { it > 0 } }) Heatmap(grid, traffic.str("peak"), "When visitors come, every site")
    val sources = traffic.pairs("sources")
    if (sources.isNotEmpty()) Panel("Where visits come from") { Donut(sources, "visits") }
    snap?.let { Home.siteVisits(it) }?.let { site ->
        Panel("Site visits") {
            val d = delta(site.value, site.prior)
            KpiPairs(listOf(KpiData("Site visits", fmt(site.value), d, site.prior?.let { site.value.compareTo(it) } ?: 0)) +
                site.parts.map { (name, value) -> KpiData(name, fmt(value)) })
            BarChart(site.series, color = J.green)
            Muted("Counted by the site with or without analytics consent. GA4 below only sees visitors who allow analytics.")
        }
    }
    val ga = snap.ext("ga4")
    if (!ga.isOk()) empties.add("Google Analytics", ga.str("error"))
    else Panel("Google Analytics") {
        Needs(ga)
        ga.objs("groups").forEach { g ->
            KeyRow(g.str("group") ?: "", "${fmt(g.num("sessions"))} sessions · ${fmt(g.num("users"))} users", url = null)
            Text("views ${fmt(g.num("views"))} · engaged ${pct(g.num("engagement"))} · ${delta(g.num("sessions"), g.num("priorSessions")) ?: ""}", color = J.dim, fontSize = 11.sp)
        }
        BarChart(ga.objs("daily").map { it.num("sessions") ?: 0.0 }, ga.objs("daily").map { it.str("date") ?: "" })
    }
    TopList("GA4 countries", ga.pairs("countries"))
    TopList("GA4 sources", ga.pairs("sources"))

    val cf = snap.ext("cloudflare")
    if (!cf.isOk()) empties.add("Cloudflare edge", cf.str("error"))
    else Panel("Cloudflare edge") {
        Needs(cf)
        run {
            KpiPairs(listOf(
                KpiData("Requests", fmt(cf.num("requests"))), KpiData("Page views", fmt(cf.num("pageViews"))),
                KpiData("Uniques", fmt(cf.num("uniques"))), KpiData("Bandwidth", bytes(cf.num("bytes"))),
                KpiData("Cached", pct(cf.num("cacheRatio"))), KpiData("Threats", fmt(cf.num("threats")), alert = (cf.num("threats") ?: 0.0) > 0)
            ))
            BarChart(cf.objs("daily").map { it.num("requests") ?: 0.0 }, cf.objs("daily").map { it.str("date") ?: "" })
            cf.str("breakdownError")?.let { Muted("Breakdown: $it") }
        }
    }
    listOf("paths" to "Top paths", "countries" to "Edge countries", "statuses" to "Status codes", "contentTypes" to "Content types", "threatCountries" to "Threat countries")
        .forEach { (k, t) -> TopList(t, cf.pairs(k)) }
    NoDataRow(empties.items)
}

// ---------------------------------------------------------------- Systems

/** Codes and confirm links mailed to qa@ and the channel addresses in the last day (#1898); a tap copies the code. */
@Composable
fun SignInCodes(codes: List<JsonObject>) {
    val context = LocalContext.current
    Panel("Sign-in codes") {
        if (codes.isEmpty()) Muted("No codes in the last day.")
        codes.forEach { c ->
            val code = c.str("code").orEmpty()
            val detail = listOfNotNull(
                c.str("alias")?.takeIf { it.isNotBlank() }?.let { "$it@" },
                c.str("subject")?.takeIf { it.isNotBlank() },
                ago(c.str("at")),
                "sender not checked".takeIf { c.bool("trusted") != true }
            ).joinToString(" · ")
            StatusRow(if (c.bool("trusted") == true) "good" else "warn", "${c.str("label") ?: ""}: ${code.ifBlank { "confirm link" }}", detail,
                url = c.str("link")?.takeIf { it.startsWith("https://") },
                onClick = if (code.isNotBlank()) ({ CodeCopy.copy(context, code) }) else null)
        }
        Muted("Tap a code to copy it. Gmail keeps every mail.")
    }
}

private val CANARY_TEXT = mapOf("waiting" to "sent, waiting for it to come back", "lost" to "did not come back within 30 minutes", "stale" to "has not run in over a day", "never" to "has not run yet")

/** What ImprovMX did with the mail to the aliases, SMTP sends against the plan, and the daily canary round trip (#1900). */
@Composable
fun MailHealth(box: JsonObject?) {
    Panel("Mail forwarding (ImprovMX)") {
        if (box == null || !box.isOk()) { Muted(box.str("error") ?: "Asking ImprovMX…"); return@Panel }
        val t = box.obj("totals"); val smtp = box.obj("smtp"); val c = box.obj("canary")
        val month = smtp.num("month") ?: 0.0; val limit = smtp.num("monthLimit")
        KpiPairs(listOf(
            KpiData("Mails in", fmt(t.num("mails"))), KpiData("Forwarded", fmt(t.num("forwarded"))),
            KpiData("Bounced", fmt(t.num("bounced")), alert = (t.num("bounced") ?: 0.0) > 0), KpiData("Refused (aliases)", fmt(t.num("refused")), alert = (t.num("refused") ?: 0.0) > 0),
            KpiData("Spam blocked", fmt(t.num("spam") ?: 0.0)), KpiData("No such address", fmt(t.num("unknown"))), KpiData("SMTP this month", fmt(month) + (limit?.let { " / " + fmt(it) } ?: ""), alert = limit != null && month >= limit * 0.8)
        ))
        val state = c.str("state") ?: "never"
        val history = c.objs("history").joinToString("") { if (it.num("seconds") == null) "✗" else "✓" }
        StatusRow(when (state) { "ok" -> "good"; "waiting" -> "info"; "stale" -> "warn"; else -> "alert" }, "Daily round trip to canary@",
            listOfNotNull(if (state == "ok") "came back in ${fmt(c.num("seconds"))} s" else CANARY_TEXT[state] ?: state, ago(c.str("sentAt"))?.let { "sent $it" }, history.takeIf { it.isNotEmpty() }).joinToString(" · "))
        box.objs("problems").take(8).forEach { p ->
            val to = p.arr("to").joinToString(", ") { it.text() }
            StatusRow("alert", "${p.str("alias")}@ ${p.str("outcome")}", listOfNotNull(ago(p.str("at")), p.str("from"), to.takeIf { it.isNotBlank() }?.let { "→ $it" }, p.str("reason")).filter { it.isNotBlank() }.joinToString(" · "))
        }
        box.objs("aliases").forEach { a ->
            val bad = (a.num("bounced") ?: 0.0) + (a.num("refused") ?: 0.0)
            KeyRow("${a.str("alias")}@", "${fmt(a.num("forwarded"))} of ${fmt(a.num("mails"))}" + (if (bad > 0) " · ${fmt(bad)} failed" else ""), if (bad > 0) J.pink else J.text)
        }
        Muted("${fmt(box.num("aliasCount"))} aliases, last ${fmt(box.num("days"))} days. Mail refused to addresses that are not aliases is expected: there is no catch-all.")
    }
}

@Composable
fun SystemsScreen(s: UiState, vm: JarvisViewModel) {
    val snap = s.snapshot
    val empties = Empties()
    val wide = snap.obj("wide")
    val tiles = wide.objs("matrix")
    if (tiles.isNotEmpty()) Panel("Status matrix", Modifier.layoutId(WIDE)) { TileMatrix(tiles) }
    val strip = wide.obj("uptime")
    if (strip != null) Panel("Uptime, last 90 days", Modifier.layoutId(WIDE)) {
        val days = strip.objs("days")
        Muted(strip.num("pct")?.let { "${fmt(it)}% of checks answered since ${strip.str("since")}. Jarvis pings the product pages every hour and keeps one tally per day." }
            ?: "No checks recorded yet. Jarvis pings the product pages every hour and keeps one tally per day.")
        UptimeStrip(days.map { it.num("pct") })
        Row(Modifier.fillMaxWidth()) {
            Text(days.firstOrNull()?.str("date") ?: "", fontFamily = Mono, fontSize = 10.sp, color = J.dim)
            Spacer(Modifier.weight(1f))
            Text("today", fontFamily = Mono, fontSize = 10.sp, color = J.dim)
        }
    }
    JarvisActions(s, vm)
    SignInCodes(snap.objs("mailCodes"))
    MailHealth(snap.ext("mailbox"))
    EmailAddresses(snap.ext("addresses"))
    Panel("Connections") {
        snap.objs("connections").forEach { c -> StatusRow(c.str("state"), c.str("name") ?: "", listOfNotNull(c.str("state"), c.str("detail")?.takeIf { it.isNotBlank() }, c.arr("needs").takeIf { it.isNotEmpty() }?.joinToString(" ") { it.text() }).filter { it.isNotBlank() }.joinToString(" · ")) }
    }
    val safety = snap.ext("safety")
    if (!safety.isOk()) empties.add("Safety", safety.str("error"))
    else Panel("Safety", trailing = { Text(safety.num("score")?.let { "${it.toInt()}/100" } ?: "", fontFamily = Mono, color = J.muted) }) {
        Needs(safety)
        safety.objs("checks").forEach { StatusRow(it.str("level"), it.str("name") ?: "", it.str("detail")) }
    }
    Panel("Uptime") {
        val up = snap.ext("uptime")
        up.objs("pages").forEach { p -> StatusRow(if (p.bool("ok") == true) "good" else "alert", p.str("name") ?: "", if (p.bool("ok") == true) "${p.num("status")?.toInt()} · ${fmt(p.num("ms"))} ms · ${bytes(p.num("bytes"))}" else (p.str("error") ?: "down"), p.str("url")) }
        up.num("tlsDaysLeft")?.let { KeyRow("TLS certificate", "${it.toInt()} days left", if (it < 14) J.pink else J.green) }
    }
    Panel("PageSpeed") {
        snap.ext("speed").objs("pages").forEach { p -> KeyRow(p.str("name") ?: "", p.num("score")?.let { fmt(it) } ?: (p.str("error") ?: "—"), score(p.num("score")), p.str("url")) }
    }
    PageSpeedPanels(snap.ext("pagespeed"), vm)
    Panel("Scheduled jobs", trailing = { ActionButton("Daily now", "daily-now" in s.running) { vm.act("daily-now", "daily-now") { "Daily briefing: " + (it.str("sent") ?: "sent") } } }) {
        snap.ext("jobs").objs("jobs").forEach { j ->
            val name = j.str("name") ?: return@forEach
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    StatusRow(if (j.bool("ok") == false) "alert" else if (j.str("state") == "PAUSED") "warn" else "good", name, listOfNotNull(j.str("schedule"), ago(j.str("lastAttempt"))?.let { "last $it" }, j.str("error")).filter { it.isNotBlank() }.joinToString(" · "))
                }
                TextButton(onClick = { vm.act("job:$name", "run-job", mapOf("job" to JsonPrimitive(name))) { "Started $name." } }, enabled = "job:$name" !in s.running) { Text("Run") }
            }
        }
    }
    val health = snap.ext("health")
    Panel("Pipeline") {
        health.objs("jobs").forEach { StatusRow(if (it.bool("ok") == false) "alert" else "good", it.str("job") ?: "", listOfNotNull(ago(it.str("endedAt")), it.str("note"), it.str("error")).filter { it.isNotBlank() }.joinToString(" · ")) }
        KeyRow("Review failures", fmt(health.at("failures").num("total")))
        KeyRow("Re-runs (held)", "${fmt(health.at("reruns").num("total"))} (${fmt(health.at("reruns").num("held"))})")
        KeyRow("Owner notices", fmt(health.at("notices").num("total")))
        KeyRow("Rivals tracked", fmt(health.at("rivals").num("total")))
        KeyRow("Coupons (uses)", "${fmt(health.at("coupons").num("total"))} (${fmt(health.at("coupons").num("uses"))})")
        KeyRow("Captures", fmt(health.at("captures").num("total")))
    }
    val gh = snap.ext("github")
    if (!gh.isOk()) empties.add("GitHub", gh.str("error"))
    else Panel("GitHub") {
        Needs(gh)
        gh.objs("ci").forEach { StatusRow(if (it.str("conclusion") == "success") "good" else if (it.str("conclusion") == null) "info" else "alert", it.str("name") ?: "", (it.str("conclusion") ?: "running") + " · " + (ago(it.str("at")) ?: ""), it.str("url")) }
        KeyRow("Open bugs", fmt(gh.num("openBugs")), if ((gh.num("openBugs") ?: 0.0) > 0) J.amber else J.green, "https://github.com/kaanmuar/kaanmuar.github.io/issues?q=is%3Aopen+label%3Abug")
        KeyRow("PRs merged in range", fmt(gh.at("merged").num("total")))
    }
    TopList("Bugs by area", gh.pairs("bugAreas"))
    if (gh.obj("merged").objs("items").isNotEmpty()) Panel("Merged") { gh.obj("merged").objs("items").take(10).forEach { KeyRow("#${it.num("number")?.toInt()} ${it.str("title")}", ago(it.str("at"))?.take(10) ?: "", url = it.str("url")) } }
    if (gh.objs("recent").isNotEmpty()) Panel("Newest issues") { gh.objs("recent").take(10).forEach { StatusRow(if (it.str("state") == "open") "warn" else "good", "#${it.num("number")?.toInt()} ${it.str("title")}", ago(it.str("at")), it.str("url")) } }

    val pl = snap.ext("platform")
    if (!pl.isOk()) empties.add("Google Cloud", pl.str("error"))
    else Panel("Google Cloud") {
        Needs(pl)
        run {
            val f = pl.obj("functions"); val g = pl.obj("gemini"); val fs = pl.obj("firestore"); val u = pl.obj("users")
            val freeUsed = fs.num("readsFreePct")
            val freeWarn = snap.obj("thresholds").num("firestoreFreePct") ?: 80.0
            KpiPairs(listOf(
                KpiData("Function runs", fmt(f.num("executions"))), KpiData("Failure rate", pct(f.num("failureRate")), alert = (f.num("failureRate") ?: 0.0) > 0.02),
                KpiData("Gemini calls", fmt(g.num("requests"))), KpiData("Gemini errors", pct(g.num("errorRate")), alert = (g.num("errorRate") ?: 0.0) > 0.05),
                KpiData("Firestore reads today (Pacific)", fmt(fs.num("reads"))), KpiData("Free reads used", if (freeUsed == null) "—" else "${fmt(freeUsed)}%", alert = (freeUsed ?: 0.0) >= freeWarn),
                KpiData("Users", fmt(u.num("total"))), KpiData("New users", fmt(u.num("newInRange")))
            ))
            f.objs("latest").take(6).forEach { StatusRow("alert", it.str("fn") ?: "", (it.str("kind") ?: "") + " · " + (ago(it.str("at")) ?: "")) }
        }
    }
    TopList("Function failures", pl.obj("functions").pairs("byFunction"))
    NoDataRow(empties.items)
}
