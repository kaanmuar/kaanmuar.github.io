package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
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

private fun humanize(key: String) = key.replace(Regex("([a-z])([A-Z])"), "$1 $2").replaceFirstChar { it.uppercase() }

private fun JsonObject?.ext(key: String): JsonObject? = this.obj("external").obj(key)

// ---------------------------------------------------------------- Overview

@Composable
fun OverviewScreen(s: UiState, vm: JarvisViewModel, open: (String) -> Unit) {
    val snap = s.snapshot
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Ring(snap.num("readiness"), "READY")
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            val brief = snap.objs("briefing")
            val alerts = brief.count { it.str("level") == "alert" }
            val warns = brief.count { it.str("level") == "warn" }
            Text(if (alerts + warns == 0) "All clear" else "$alerts alerts · $warns warnings", fontSize = 20.sp, fontWeight = FontWeight.SemiBold,
                color = if (alerts > 0) J.pink else if (warns > 0) J.amber else J.green)
            val down = snap.objs("connections").filter { it.str("state") != "live" }
            Muted(if (down.isEmpty()) "Every connection is live" else down.joinToString { (it.str("name") ?: "") + " " + (it.str("state") ?: "") })
        }
    }

    Panel("Briefing", trailing = { TextButton(onClick = vm::brief, enabled = !s.briefBusy) { Text(if (s.briefBusy) "Thinking…" else if (s.brief == null) "Ask Gemini" else "Again") } }) {
        s.brief?.let { text ->
            Text(text, fontSize = 14.sp)
            Row { ActionButton("Email it to me", "email-briefing" in s.running) { vm.act("email-briefing", "email-briefing", mapOf("text" to JsonPrimitive(text))) { if (it.bool("sent") == true) "Briefing sent." else "Mail is off." } } }
        }
        val items = snap.objs("briefing")
        if (items.isEmpty()) Muted("Nothing to flag.")
        items.forEach { StatusRow(it.str("level"), it.str("text") ?: "", it.str("product")?.let { p -> PRODUCTS.toMap()[p] ?: humanize(p) }) }
    }

    Panel("Products") {
        PRODUCTS.forEach { (key, name) ->
            val p = snap.obj("products").obj(key)
            val k = p.objs("kpis").firstOrNull()
            Row(Modifier.fillMaxWidth().clickable { open(key) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.width(110.dp)) {
                    Text(name, fontSize = 14.sp)
                    Text((k?.str("label") ?: "") + " " + k?.prim("value").text(), color = J.muted, fontSize = 12.sp)
                }
                Sparkline(p.obj("series").at("values").doubles(), modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(k?.str("delta") ?: "", color = when ((k?.num("dir") ?: 0.0).toInt()) { 1 -> J.green; -1 -> J.pink; else -> J.muted }, fontSize = 12.sp, modifier = Modifier.width(48.dp))
            }
        }
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

fun delta(now: Double?, prior: Double?): String? {
    if (now == null || prior == null) return null
    if (prior == 0.0) return if (now == 0.0) "±0" else "new"
    val p = ((now - prior) / prior * 100).toInt()
    return (if (p > 0) "+" else "") + p + "%"
}

fun dirOf(delta: String?) = when { delta == null -> 0; delta.startsWith("+") || delta == "new" -> 1; delta.startsWith("-") -> -1; else -> 0 }

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
                LinearProgressIndicator(progress = { ((g.num("pct") ?: 0.0) / 100).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(4.dp),
                    color = J.level(g.str("status")), trackColor = Color(0x1438E1FF), drawStopIndicator = {})
                Text((g.str("status") ?: "").replace('-', ' ') + (g.num("projected")?.let { " · on pace for " + fmt(it) } ?: ""), color = J.dim, fontSize = 11.sp)
            }
        }
    }
}

// ---------------------------------------------------------------- Products

@Composable
fun ProductsScreen(s: UiState, vm: JarvisViewModel, product: String, pick: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        PRODUCTS.forEach { (key, name) -> FilterChip(selected = key == product, onClick = { pick(key) }, label = { Text(name) }) }
    }
    val snap = s.snapshot
    val p = snap.obj("products").obj(product)
    if (p == null) { Panel("No data") { Muted("Pull down to load this product.") }; return }

    Panel(PRODUCTS.toMap()[product] ?: product) {
        KpiGrid(p.objs("kpis"))
        p.obj("anomaly")?.let { a -> Text("Unusual last day: ${fmt(a.num("last"))} against an average of ${fmt(a.num("mean"))} (z ${a.num("z")})", color = J.amber, fontSize = 12.sp) }
    }
    if (product == "review") TopList("Funnel", p.pairs("funnel"), 4)

    val series = p.obj("series")
    Panel(if (product == "inbox") "Messages per day" else if (product == "review") "Opens per day" else "Visits per day") {
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

// ---------------------------------------------------------------- Business

@Composable
fun BusinessScreen(s: UiState) {
    val snap = s.snapshot
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
    if (money.isOk()) {
        TopList("By provider", money.pairs("byProvider"))
        TopList("By purpose", money.pairs("byPurpose"))
    }

    val email = snap.ext("email")
    Panel("Email (SendGrid)") {
        Needs(email)
        if (email.isOk()) {
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
    Panel("Search") {
        Needs(search)
        search.obj("console")?.let { c ->
            if (c.bool("ok") == true) KpiPairs(listOf(KpiData("Google clicks", fmt(c.num("clicks"))), KpiData("Impressions", fmt(c.num("impressions"))), KpiData("CTR", pct(c.num("ctr"))), KpiData("Avg position", fmt(c.num("position")))))
            else Muted("Search Console: " + (c.str("error") ?: c.str("need") ?: "off"))
        }
        search.obj("brave").objs("queries").forEach { q -> KeyRow(q.str("query") ?: "", q.num("position")?.let { "#" + it.toInt() } ?: "not in top 20", if (q.num("position") != null) J.green else J.muted, q.str("url")) }
    }
    search.obj("console")?.let { c -> TopList("Google queries", c.objs("queries").map { (it.str("query") ?: "") to (it.num("clicks") ?: 0.0) }) }

    val social = snap.ext("social")
    Panel("Social") {
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
}

// ---------------------------------------------------------------- Traffic

@Composable
fun TrafficScreen(s: UiState) {
    val snap = s.snapshot
    val ga = snap.ext("ga4")
    Panel("Google Analytics") {
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
    Panel("Cloudflare edge") {
        Needs(cf)
        if (cf.isOk()) {
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
}

// ---------------------------------------------------------------- Systems

@Composable
fun SystemsScreen(s: UiState, vm: JarvisViewModel) {
    val snap = s.snapshot
    Panel("Connections") {
        snap.objs("connections").forEach { c -> StatusRow(c.str("state"), c.str("name") ?: "", listOfNotNull(c.str("state"), c.str("detail")?.takeIf { it.isNotBlank() }, c.arr("needs").takeIf { it.isNotEmpty() }?.joinToString(" ") { it.text() }).filter { it.isNotBlank() }.joinToString(" · ")) }
    }
    val safety = snap.ext("safety")
    Panel("Safety", trailing = { Text(safety.num("score")?.let { "${it.toInt()}/100" } ?: "", fontFamily = Mono, color = J.muted) }) {
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
    Panel("GitHub") {
        Needs(gh)
        gh.objs("ci").forEach { StatusRow(if (it.str("conclusion") == "success") "good" else if (it.str("conclusion") == null) "info" else "alert", it.str("name") ?: "", (it.str("conclusion") ?: "running") + " · " + (ago(it.str("at")) ?: ""), it.str("url")) }
        KeyRow("Open bugs", fmt(gh.num("openBugs")), if ((gh.num("openBugs") ?: 0.0) > 0) J.amber else J.green, "https://github.com/kaanmuar/kaanmuar.github.io/issues?q=is%3Aopen+label%3Abug")
        KeyRow("PRs merged in range", fmt(gh.at("merged").num("total")))
    }
    TopList("Bugs by area", gh.pairs("bugAreas"))
    if (gh.obj("merged").objs("items").isNotEmpty()) Panel("Merged") { gh.obj("merged").objs("items").take(10).forEach { KeyRow("#${it.num("number")?.toInt()} ${it.str("title")}", ago(it.str("at"))?.take(10) ?: "", url = it.str("url")) } }
    if (gh.objs("recent").isNotEmpty()) Panel("Newest issues") { gh.objs("recent").take(10).forEach { StatusRow(if (it.str("state") == "open") "warn" else "good", "#${it.num("number")?.toInt()} ${it.str("title")}", ago(it.str("at")), it.str("url")) } }

    val pl = snap.ext("platform")
    Panel("Google Cloud") {
        Needs(pl)
        if (pl.isOk()) {
            val f = pl.obj("functions"); val g = pl.obj("gemini"); val fs = pl.obj("firestore"); val u = pl.obj("users")
            KpiPairs(listOf(
                KpiData("Function runs", fmt(f.num("executions"))), KpiData("Failure rate", pct(f.num("failureRate")), alert = (f.num("failureRate") ?: 0.0) > 0.02),
                KpiData("Gemini calls", fmt(g.num("requests"))), KpiData("Gemini errors", pct(g.num("errorRate")), alert = (g.num("errorRate") ?: 0.0) > 0.05),
                KpiData("Firestore reads", fmt(fs.num("reads"))), KpiData("Free reads left", pct(fs.num("readsFreePct"))),
                KpiData("Users", fmt(u.num("total"))), KpiData("New users", fmt(u.num("newInRange")))
            ))
            f.objs("latest").take(6).forEach { StatusRow("alert", it.str("fn") ?: "", (it.str("kind") ?: "") + " · " + (ago(it.str("at")) ?: "")) }
        }
    }
    TopList("Function failures", pl.obj("functions").pairs("byFunction"))
}
