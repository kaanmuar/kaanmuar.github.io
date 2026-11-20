package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.at
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.pairs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import kotlin.math.min
import kotlin.math.sqrt

/** Jarvis > URL Review (#3329): failed reviews and rescue, fix requests and the newer checks, as the web panels show them. */
object ReviewRescue {
    const val SHOWN = 8

    /** "past due", "3.5 h left" */
    fun hoursLeft(h: Double?): String = when {
        h == null -> "—"
        h <= 0.0 -> "past due"
        else -> "${fmt(h)} h left"
    }

    /** Dot colour for a promise by its hours left: 2 h or less pink, 8 h or less amber. */
    fun promiseLevel(h: Double?): String = when {
        h == null -> "info"
        h <= 2.0 -> "alert"
        h <= 8.0 -> "warn"
        else -> "good"
    }

    /** The web panel's FIX_WAYS and FIX_STEPS. */
    val WAYS = listOf("self" to "Fix it yourself", "quote" to "Quote", "package" to "Package", "call" to "Call")
    val STEPS = listOf("new" to "New", "quoted" to "Quoted", "accepted" to "Paid / accepted", "in-progress" to "In progress", "done" to "Done", "re-reviewed" to "Re-reviewed")

    /** "security-headers · 99 USD · paid 3 d ago (late)" */
    fun paidLine(x: JsonObject): String = listOfNotNull(
        x.str("package")?.ifEmpty { null } ?: "quote",
        "${fmt(x.num("priceUsd"))} USD",
        "paid ${(x.num("daysWaiting") ?: 0.0).toInt()} d ago" + if (x.bool("late") == true) " (late)" else ""
    ).joinToString(" · ")

    /** Dot colour for a source's state: ok green, quiet or running amber, down pink, off grey. */
    fun sourceLevel(state: String?): String = when (state) {
        "ok" -> "good"
        "quiet", "running" -> "warn"
        "down" -> "alert"
        else -> "info"
    }

    /** "2,300 of 2,581 (89.1%) · 1,100 clients · 1,200 sweeps" */
    fun quotaLine(q: JsonObject): String {
        val cap = q.num("cap")
        val used = fmt(q.num("used")) + (if (cap != null) " of ${fmt(cap)}" else "") + (q.num("pct")?.let { " (${fmt(it)}%)" } ?: "")
        val split = when {
            q.num("sweep") != null -> "${fmt(q.num("customer"))} clients · ${fmt(q.num("sweep"))} sweeps"
            q.num("calls") != null -> "${fmt(q.num("calls"))} calls"
            else -> null
        }
        return listOfNotNull(used, split).joinToString(" · ")
    }

    /** Quota level: at or over the cap pink, from 80% amber. */
    fun quotaLevel(pct: Double?): String = when {
        pct == null -> "info"
        pct >= 100.0 -> "alert"
        pct >= 80.0 -> "warn"
        else -> "good"
    }

    /** "1 of 3 · 1 client · 1 high" */
    fun familyLine(f: JsonObject): String = listOfNotNull(
        "${fmt(f.num("hits"))} of ${fmt(f.num("checked"))}",
        (f.num("customerHits") ?: 0.0).takeIf { it > 0 }?.let { "${fmt(it)} client" + if (it == 1.0) "" else "s" },
        (f.num("critical") ?: 0.0).takeIf { it > 0 }?.let { "${fmt(it)} high" },
        (f.num("unchecked") ?: 0.0).takeIf { it > 0 }?.let { "${fmt(it)} not checked" }
    ).joinToString(" · ")

    /** Dot colour for an internal threat ledger level (#3890). */
    fun threatLevel(level: String?): String = when (level) {
        "critical" -> "alert"
        "high" -> "warn"
        else -> "info"
    }

    /** "critical · phishing-host · US · delist pending" */
    fun threatLine(x: JsonObject): String = listOfNotNull(
        x.str("level")?.ifEmpty { null },
        x.str("kind")?.ifEmpty { null },
        x.str("country")?.ifEmpty { null },
        x.str("source")?.ifEmpty { null },
        x.str("delistStatus")?.takeIf { it.isNotEmpty() && it != "none" }?.let { "delist $it" }
    ).joinToString(" · ")

    /** The live map's timeframes, as CY_RANGES in js/admin-jarvis.js. */
    val RANGES = listOf("live" to "Latest news, hourly", "7d" to "7 days", "30d" to "30 days", "90d" to "90 days")

    /** A country's pink by the square root of its share of the busiest one, as the web map. */
    fun cyberFill(count: Double, max: Double): Color =
        if (count <= 0.0 || max <= 0.0) J.dim else J.pink.copy(alpha = (0.18 + 0.82 * sqrt(min(1.0, count / max))).toFloat())

    fun countryName(cc: String): String = java.util.Locale("", cc).displayCountry.ifEmpty { cc }

    /** critical is pink, high amber, the rest plain. */
    fun exposureLevel(level: String?): String = when (level) { "critical" -> "alert"; "high" -> "warn"; else -> "info" }

    /** GDELT writes 20261119T143000Z or 20261119143000; the app wants ISO to say how long ago. */
    fun eventIso(date: String?): String {
        val m = Regex("^(\\d{4})(\\d{2})(\\d{2})T?(\\d{2})(\\d{2})(\\d{2})Z?$").find(date.orEmpty()) ?: return date.orEmpty()
        val (y, mo, d, h, mi, se) = m.destructured
        return "$y-$mo-${d}T$h:$mi:${se}Z"
    }

    /** "ana@ruiz.co · paid", "our sweep (not a customer)", "customer unknown" */
    fun who(x: JsonObject): String = when {
        !x.str("email").isNullOrEmpty() -> x.str("email").orEmpty() + if (x.bool("paid") == true) " · paid" else ""
        x.bool("known") == true -> "our sweep (not a customer)"
        else -> "customer unknown"
    }

    /** "phishing-host · Google Web Risk · delist pending" per finding, at most three. */
    fun findings(x: JsonObject): String = x.objs("findings").take(3).joinToString(" | ") { f ->
        listOfNotNull(f.str("kind"), f.str("source")?.ifEmpty { null }, f.str("delistStatus")?.takeIf { it.isNotEmpty() && it != "none" }?.let { "delist $it" }).joinToString(" · ")
    }
}

@Composable
fun RescuePanel(s: UiState) {
    val r = s.snapshot.obj("external").obj("rescue")
    val health = s.snapshot.obj("external").obj("health")
    if (r == null || !r.isOk() || r.obj("promises") == null) {
        Panel("Failed reviews and rescue", id = "review-failures") {
            Text("${fmt(health.at("failures").num("total"))} failures · ${fmt(health.at("reruns").num("total"))} re-runs", fontSize = 14.sp)
            health.at("failures").pairs("causes").take(6).forEach { (k, v) -> KeyRow(k, fmt(v)) }
            Muted(r.str("error") ?: "Pull down to read rescues and promises.")
        }
        return
    }
    val f = r.obj("failures")
    val rr = r.obj("reruns")
    val x = r.obj("rescues")
    val d = r.obj("diagnoses")
    val p = r.obj("promises")
    val c = r.obj("codes")
    val deadline = (r.num("deadlineHours") ?: 48.0).toInt()
    val giveUp = (r.num("giveUpDays") ?: 14.0).toInt()
    Panel("Failed reviews and rescue · ${fmt(f.num("total"))}", id = "review-failures") {
        KpiPairs(listOf(
            KpiData("Failed reviews", fmt(f.num("total"))),
            KpiData("Re-runs", fmt(rr.num("total"))),
            KpiData("Re-runs sent", fmt(rr.num("sent"))),
            KpiData("Held on the desk", fmt(rr.num("held")), alert = (rr.num("held") ?: 0.0) > 0),
            KpiData("Rescued", fmt(x.num("rescued"))),
            KpiData("Read by the Mac", fmt(x.num("macDone"))),
            KpiData("Waiting for the Mac", fmt(x.num("macPending")), alert = (x.num("macPromised") ?: 0.0) > 0),
            KpiData("AI: Vertex AI", fmt(d.num("vertex"))),
            KpiData("AI: AI Studio", fmt(d.num("studio"))),
            KpiData("Rule diagnoses", fmt(d.num("rules")))
        ))
        f.pairs("causes").take(6).forEach { (k, v) -> KeyRow(k, fmt(v), J.pink) }
        Text("Report promises", color = J.amber, fontSize = 12.sp)
        KpiPairs(listOf(
            KpiData("Promised by email", fmt(p.num("made"))),
            KpiData("Open now", fmt(p.num("open"))),
            KpiData("Near the deadline", fmt(p.num("atRisk")), alert = (p.num("atRisk") ?: 0.0) > 0),
            KpiData("Sent within $deadline h", fmt(p.num("within48h"))),
            KpiData("Apologies sent", fmt(p.num("apologized"))),
            KpiData("Still trying after the apology", fmt(p.num("stillTrying") ?: 0.0)),
            KpiData("Sent late", fmt(p.num("sentLate") ?: 0.0)),
            KpiData("Given up after $giveUp days", fmt(p.num("givenUp") ?: 0.0), alert = (p.num("givenUp") ?: 0.0) > 0),
            KpiData("Apology codes sent", fmt(c.num("sent"))),
            KpiData("Codes redeemed", fmt(c.num("redeemed")))
        ))
        val open = r.objs("openList")
        if (open.isEmpty()) Muted("No promised report is open.")
        open.take(ReviewRescue.SHOWN).forEach { o ->
            StatusRow(ReviewRescue.promiseLevel(o.num("hoursLeft")), o.str("host").orEmpty(), listOfNotNull(ReviewRescue.hoursLeft(o.num("hoursLeft")), "re-run ${fmt(o.num("tries"))} of ${r.arr("triesAtHours").size}", ago(o.str("failedAt"))).joinToString(" · "))
        }
        val mac = r.objs("macList")
        if (mac.isNotEmpty()) Text("Waiting for the Mac", color = J.amber, fontSize = 12.sp)
        mac.take(ReviewRescue.SHOWN).forEach { m ->
            StatusRow(if (m.bool("promised") == true) "warn" else "info", m.str("host").orEmpty(), listOfNotNull(if (m.bool("promised") == true) "promised" else null, ago(m.str("failedAt"))).joinToString(" · "))
        }
        Muted("A review that fails on our side is diagnosed (rules, then Gemini on Vertex AI with AI Studio as fallback) and re-run with the read that fits; the last rung is Carlos's Mac in a real Chrome window, promised reviews first. Its asker gets the report by email, usually within $deadline hours; past that, an apology with a ${fmt(r.num("apologyPercent"))}% code, and the rescue keeps trying: a report finished within $giveUp days is sent late, otherwise a last note goes out.")
        val past = r.obj("pastRerun")
        if (past != null) {
            Text("Finished reports, run again · ${past.str("status").orEmpty()}", color = J.amber, fontSize = 12.sp)
            KpiPairs(listOf(
                KpiData("Reviews a day", fmt(past.num("perDay"))),
                KpiData("Reviewed", fmt(past.num("reviewed") ?: 0.0)),
                KpiData("Mails sent", fmt(past.num("mailed") ?: 0.0)),
                KpiData("Skipped", fmt(past.num("skipped") ?: 0.0)),
                KpiData("50% uses", fmt(past.num("uses")))
            ))
            Muted(past.str("line").orEmpty())
        }
    }
}

@Composable
fun FixesPanel(s: UiState) {
    val f = s.snapshot.obj("external").obj("fixes")
    if (f == null || !f.isOk() || f.obj("ways") == null) { Panel("Fix requests", id = "review-fixes") { Muted(f.str("error") ?: "Pull down to read fix requests.") }; return }
    val ways = f.obj("ways")
    val rev = f.obj("revenue")
    val w = f.obj("waiting")
    val pipe = f.obj("pipeline")
    Panel("Fix requests · ${fmt(f.num("total"))}", id = "review-fixes") {
        KpiPairs(ReviewRescue.WAYS.map { (k, label) -> KpiData(label, fmt(ways.num(k))) } + listOf(
            KpiData("Package revenue (USD)", fmt(rev.num("usd"))),
            KpiData("Packages paid", fmt(rev.num("count"))),
            KpiData("Free re-checks", fmt(f.obj("rechecks").num("total"))),
            KpiData("Waiting for work", fmt(w.num("paid")), alert = (w.num("paid") ?: 0.0) > 0)
        ))
        ReviewRescue.STEPS.forEach { (k, label) -> KeyRow(label, fmt(pipe.num(k))) }
        rev.pairs("byPackage").forEach { (k, v) -> KeyRow(k, "${fmt(v)} USD", J.green) }
        val paid = f.objs("paidList")
        Text("Paid, waiting for work", color = J.amber, fontSize = 12.sp)
        if (paid.isEmpty()) Muted("No paid fix request waits for work.")
        paid.take(ReviewRescue.SHOWN).forEach { x -> StatusRow(if (x.bool("late") == true) "alert" else "warn", x.str("host").orEmpty(), ReviewRescue.paidLine(x)) }
        val quotes = f.objs("quoteList")
        if (quotes.isNotEmpty()) Text("Waiting for a reply or a quote", color = J.amber, fontSize = 12.sp)
        quotes.take(ReviewRescue.SHOWN).forEach { x -> StatusRow("warn", x.str("host").orEmpty(), "${x.str("kind") ?: "quote"} · ${fmt(x.num("daysWaiting"))} d") }
        Muted("From a report a client picks a way: fix it themselves (one free re-check on a paid report), ask for a quote, buy a fixed-price package (PayPal; coupons never apply) or book a call. Marking a fix done runs the free re-review and mails the before/after. Re-reviews in range: ${fmt(f.obj("rereviews").num("total"))} (${fmt(f.obj("rereviews").num("fixed"))} findings fixed). Quotes waiting for payment: ${fmt(w.num("quoted"))}.")
    }
}

@Composable
fun ChecksPanel(s: UiState) {
    val c = s.snapshot.obj("external").obj("checks")
    if (c == null || !c.isOk() || c.obj("totals") == null) { Panel("New checks: hits, quotas and sources", id = "review-checks") { Muted(c.str("error") ?: "Pull down to read the new checks.") }; return }
    val t = c.obj("totals")
    Panel("New checks: hits, quotas and sources · ${fmt(t.num("withHits"))}", id = "review-checks") {
        val tf = c.obj("threatFeeds")
        KpiPairs(listOfNotNull(
            KpiData("Reviews in range", fmt(t.num("reviews"))),
            KpiData("Counted", fmt(t.num("counted"))),
            KpiData("With a hit", fmt(t.num("withHits"))),
            KpiData("Wordfence feed", if (c.obj("wordfence").bool("stored") == true) "stored" else "not stored", alert = c.obj("wordfence").bool("stored") != true),
            if (tf != null) KpiData("Threat feeds", if (tf.bool("stored") == true) "stored" else "not stored", alert = tf.bool("stored") != true) else null
        ))
        c.objs("families").forEach { fam -> StatusRow(when { (fam.num("critical") ?: 0.0) > 0 -> "alert"; (fam.num("hits") ?: 0.0) > 0 -> "warn"; else -> "good" }, fam.str("label").orEmpty(), ReviewRescue.familyLine(fam)) }
        Text("Quotas", color = J.amber, fontSize = 12.sp)
        c.objs("quotas").forEach { q -> StatusRow(ReviewRescue.quotaLevel(q.num("pct")), q.str("label").orEmpty(), ReviewRescue.quotaLine(q)) }
        Text("Sources", color = J.amber, fontSize = 12.sp)
        c.objs("sources").forEach { x -> StatusRow(ReviewRescue.sourceLevel(x.str("state")), x.str("name").orEmpty(), listOfNotNull(x.str("state"), x.str("detail")?.ifEmpty { null }, ago(x.str("at"))).joinToString(" · ")) }
        Muted("Hits are counted from ${c.str("since") ?: "10 Nov 2026"}, when reviews started keeping a small summary of these checks; test runs are left out. A phishing-list or linked-script hit is critical and keeps the site off Live Reports. Web Risk keeps half of each day for client reviews; URL Scanner scans are public on Cloudflare Radar.")
    }
}

@Composable
fun ThreatsPanel(s: UiState) {
    val c = s.snapshot.obj("external").obj("checks")
    val th = c.obj("threats")
    val mp = c.obj("map")
    if (c == null || !c.isOk() || (th == null && mp == null)) {
        Panel("Cyber threats and global map", id = "review-threats") { Muted(c.str("error") ?: "Pull down to read cyber threats and the global map.") }
        return
    }
    val lv = th.obj("byLevel")
    val crit = lv.num("critical") ?: 0.0
    val hw = (lv.num("high") ?: 0.0) + (lv.num("watch") ?: 0.0)
    val delist = th.num("pendingDelist") ?: 0.0
    Panel("Cyber threats and global map · ${fmt(th.num("total") ?: 0.0)}", id = "review-threats") {
        KpiPairs(listOf(
            KpiData("Critical", fmt(crit), alert = crit > 0),
            KpiData("High / Watch", fmt(hw)),
            KpiData("Pending delist", fmt(delist), alert = delist > 0),
            KpiData("Global 15m", fmt(mp.num("mentionsLive") ?: 0.0)),
            KpiData("CISA KEV", fmt(mp.num("kevCount") ?: 0.0)),
            KpiData("DROP blocks", fmt(mp.num("dropRanges") ?: 0.0))
        ))
        val recent = th.objs("recentCritical")
        if (recent.isEmpty()) Muted("No critical or high threats recorded yet.")
        recent.take(ReviewRescue.SHOWN).forEach { x ->
            StatusRow(ReviewRescue.threatLevel(x.str("level")), x.str("host").orEmpty(), listOfNotNull(ReviewRescue.threatLine(x), ago(x.str("observedAt"))).joinToString(" · "))
        }
        val countries = th.pairs("topCountries")
        if (countries.isNotEmpty()) {
            Text("Reviewed threat hosts by DB-IP country", color = J.amber, fontSize = 12.sp)
            countries.take(6).forEach { (cc, n) -> KeyRow(cc, fmt(n)) }
        }
        val mapCountries = mp.pairs("topCountries")
        if (mapCountries.isNotEmpty()) {
            Text("Global map top cited countries", color = J.amber, fontSize = 12.sp)
            mapCountries.take(6).forEach { (cc, n) -> KeyRow(cc, fmt(n), J.cyan) }
        }
        val slice = mp.str("slice").orEmpty()
        Muted("Internal url_review_threats stays operator-only on /desk; global telemetry comes from GDELT Project, CISA KEV and DROP." + if (slice.isNotEmpty()) " Latest global slice $slice." else "")
    }
}

@Composable
fun CyberMapPanel(s: UiState) {
    var range by remember { mutableStateOf("live") }
    var picked by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val world by produceState<Geo.World?>(null) { value = Geo.world(context) }
    val c = s.snapshot.obj("external").obj("checks")
    val mp = c.obj("map")
    val ranges = mp.obj("ranges")
    if (c == null || !c.isOk() || ranges == null || ranges.isEmpty()) {
        Panel("Cyber-attack map", id = "review-cyber-map") { Muted(c.str("error") ?: "Pull down to read the global cyber feed.") }
        return
    }
    val ex = c.obj("exposure")
    val t = ex.obj("totals")
    val cur = ranges.obj(range) ?: ranges.obj("live")
    val rows = cur.objs("countries")
    val max = rows.maxOfOrNull { it.num("count") ?: 0.0 } ?: 0.0
    val by = rows.associateBy { it.str("cc").orEmpty() }
    val label = ReviewRescue.RANGES.firstOrNull { it.first == range }?.second ?: "Latest news, hourly"
    val direct = ex.objs("direct")
    val regional = ex.objs("regional")
    val pins = direct.mapNotNull { it.str("country")?.ifEmpty { null } }.toSet()
    val fills = rows.associate { it.str("cc").orEmpty() to ReviewRescue.cyberFill(it.num("count") ?: 0.0, max) }
    fun inRange(r: String, cc: String): Double = ranges.obj(r).objs("countries").firstOrNull { it.str("cc") == cc }?.num("count") ?: 0.0
    Panel("Cyber-attack map · $label", id = "review-cyber-map", plate = true) {
        KpiPairs(listOf(
            KpiData("Cited events · $label", fmt(cur.num("total"))),
            KpiData("Countries cited", fmt(rows.size.toDouble())),
            KpiData("CISA KEV", fmt(mp.num("kevCount"))),
            KpiData("DROP blocks", fmt(mp.num("dropRanges"))),
            KpiData("Botnet servers online now (Feodo)", fmt(mp.obj("botnetNow")?.num("online") ?: 0.0)),
            KpiData("Reports exposed", fmt(t.num("directReports") ?: 0.0), alert = (t.num("directReports") ?: 0.0) > 0),
            KpiData("Customers exposed", fmt(t.num("directCustomers") ?: 0.0), alert = (t.num("directCustomers") ?: 0.0) > 0)
        ))
        Row(Modifier.horizontalScroll(rememberScrollState())) {
            ReviewRescue.RANGES.forEach { (k, l) ->
                TextButton({ range = k }) { Text("$l ${fmt(ranges.obj(k).num("total"))}", color = if (k == range) J.cyan else J.muted, fontWeight = if (k == range) FontWeight.Bold else FontWeight.Normal, fontSize = 13.sp) }
            }
        }
        world?.let { w -> WorldMap(w, emptyList(), "cyber", picked, fills, pins) { cc, _ -> picked = if (cc == picked) null else cc } } ?: Muted("Drawing the map…")
        Muted("Pink: cited events, brighter is more (0 to ${fmt(max)}). Cyan dot: a country where a report of ours has a threat finding. Tap a country.")
        picked?.let { cc ->
            val x = by[cc]
            val dir = direct.filter { it.str("country") == cc }
            val reg = regional.filter { it.str("country") == cc }
            Text("${ReviewRescue.countryName(cc)} · $cc", color = J.amber, fontSize = 12.sp)
            KeyRow("Events in this window", fmt(x.num("count") ?: 0.0) + (x?.num("share")?.let { " ($it%)" } ?: ""))
            ReviewRescue.RANGES.forEach { (k, l) -> KeyRow(l, fmt(inRange(k, cc))) }
            dir.forEach { d -> StatusRow(ReviewRescue.exposureLevel(d.str("level")), d.str("host").orEmpty(), ReviewRescue.who(d) + " · " + ReviewRescue.findings(d)) }
            reg.forEach { r -> StatusRow("info", r.str("host").orEmpty(), "${r.str("email").orEmpty()} · same country, context only") }
        }
        Text("Countries, ranked", color = J.amber, fontSize = 12.sp)
        if (rows.isEmpty()) Muted("No country cited in this window.")
        rows.take(10).forEach { x ->
            val cc = x.str("cc").orEmpty()
            val d = direct.count { it.str("country") == cc }
            val g = regional.count { it.str("country") == cc }
            StatusRow(if (d > 0) "alert" else if (g > 0) "warn" else "info", "${ReviewRescue.countryName(cc)} $cc",
                listOfNotNull("${fmt(x.num("count"))} events · ${x.num("share")}%", "7 d ${fmt(inRange("7d", cc))} · 30 d ${fmt(inRange("30d", cc))} · 90 d ${fmt(inRange("90d", cc))}",
                    if (d > 0) "$d exposed" else null, if (g > 0) "$g same country" else null).joinToString(" · "), onClick = { picked = cc })
        }
        val events = mp.objs("events").filter { picked == null || it.arr("countries").any { c2 -> c2.toString().trim('"') == picked } }
        // Cloudflare Radar, last 24 h (#3935): internal personal use only (CC BY-NC 4.0), never shown to customers.
        val rd = c.obj("radar")
        Text("Attack traffic, last 24 h · Cloudflare Radar", color = J.amber, fontSize = 12.sp)
        if (rd == null) Muted("Not read yet. The threat feeds job reads it every 30 minutes.") else {
            listOf("layer3Origin" to "Network attacks from", "layer3Target" to "Network attacks to", "layer7Origin" to "Web attacks from", "layer7Target" to "Web attacks to").forEach { (k, label) ->
                val rows = rd.objs(k).take(5)
                KeyRow(label, if (rows.isEmpty()) "none read" else rows.joinToString(" · ") { (it.str("name") ?: it.str("cc").orEmpty()) + " " + fmt(it.num("share")) + "%" })
            }
            Muted("Share of each attack type's traffic, data as of ${ago(rd.str("asOf")).orEmpty()}. ${rd.str("attribution").orEmpty()} Not for customers, reports or the public map.")
        }
        Text("Cyber-attack and breach headlines · ${events.size}", color = J.amber, fontSize = 12.sp)
        if (events.isEmpty()) Muted(if (picked == null) "No headlines in the latest feed." else "No headline names this country in the latest feed.")
        events.take(12).forEach { e ->
            StatusRow("info", e.str("source").orEmpty(), listOfNotNull(ago(ReviewRescue.eventIso(e.str("date"))), e.arr("countries").joinToString("/") { it.toString().trim('"') }.ifEmpty { null },
                e.arr("themes").joinToString(", ") { it.toString().trim('"').replace('_', ' ').lowercase() }.ifEmpty { null }).joinToString(" · "), url = e.str("url"))
        }
        Muted("News telemetry: GDELT Project feed, updated hourly${mp.str("slice")?.let { " (latest file $it)" } ?: ""}; CISA KEV ${mp.str("kevVersion").orEmpty()}; DROP network counts. Counts are cited reports by country, not confirmed attacks.")
    }
}

@Composable
fun ExposedPanel(s: UiState) {
    val c = s.snapshot.obj("external").obj("checks")
    val ex = c.obj("exposure")
    if (c == null || !c.isOk() || ex == null) {
        Panel("Who might be impacted", id = "review-exposed") { Muted(c.str("error") ?: "Pull down to match the threat ledger to reports.") }
        return
    }
    val t = ex.obj("totals")
    fun n(k: String) = t.num(k) ?: 0.0
    Panel("Who might be impacted · ${fmt(n("directCustomers"))} customers", id = "review-exposed") {
        KpiPairs(listOf(
            KpiData("Reports with a threat finding", fmt(n("directReports")), alert = n("directReports") > 0),
            KpiData("Customers exposed", fmt(n("directCustomers")), alert = n("directCustomers") > 0),
            KpiData("Paid reports exposed", fmt(n("directPaid")), alert = n("directPaid") > 0),
            KpiData("Critical", fmt(n("directCritical")), alert = n("directCritical") > 0),
            KpiData("Our sweep sites", fmt(n("directSweep"))),
            KpiData("Same-country reports (context)", fmt(n("regionalReports")))
        ))
        Text("Directly exposed: a threat finding on their site · last ${fmt(ex.num("windowDays"))} days", color = J.amber, fontSize = 12.sp)
        val direct = ex.objs("direct")
        if (direct.isEmpty()) Muted("No report of the last ${fmt(ex.num("windowDays"))} days carries a critical, high or watch threat finding.")
        direct.take(12).forEach { d ->
            StatusRow(ReviewRescue.exposureLevel(d.str("level")), listOfNotNull(d.str("host"), d.str("country")?.ifEmpty { null }).joinToString(" · "),
                listOfNotNull(ReviewRescue.who(d), ReviewRescue.findings(d), ago(d.str("reviewedAt"))).joinToString(" · "))
        }
        val customers = ex.objs("customers")
        if (customers.isNotEmpty()) Text("By customer", color = J.amber, fontSize = 12.sp)
        customers.take(10).forEach { x ->
            StatusRow(ReviewRescue.exposureLevel(x.str("level")), x.str("email").orEmpty(),
                "${fmt(x.num("reports"))} report${if (x.num("reports") == 1.0) "" else "s"} · ${fmt(x.num("paid") ?: 0.0)} paid · " + x.arr("hosts").joinToString(", ") { it.toString().trim('"') })
        }
        val hot = ex.objs("hot").joinToString(" · ") { ReviewRescue.countryName(it.str("cc").orEmpty()) + " " + fmt(it.num("count")) }
        Text("Context only: customer reports on sites in the busiest countries now${if (hot.isNotEmpty()) " ($hot)" else ""}", color = J.amber, fontSize = 12.sp)
        val regional = ex.objs("regional")
        if (regional.isEmpty()) Muted("No customer report is on a site in the countries the feed is busiest in.")
        regional.take(10).forEach { r ->
            StatusRow("info", r.str("host").orEmpty(), "${r.str("email").orEmpty()}${if (r.bool("paid") == true) " · paid" else ""} · ${r.str("basis").orEmpty()} ${ReviewRescue.countryName(r.str("country").orEmpty())} · ${fmt(r.num("liveCount"))} events · ${ago(r.str("reviewedAt")).orEmpty()}")
        }
        Muted("Directly exposed means the report found a critical, high or watch finding on that site. Same country is context, not proof: the site is hosted or based where the global feed is busy. Test accounts are left out.")
    }
}
