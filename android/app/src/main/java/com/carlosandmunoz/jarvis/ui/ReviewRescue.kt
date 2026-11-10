package com.carlosandmunoz.jarvis.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
        Muted("A review that fails on our side is diagnosed (rules, then Gemini on Vertex AI with AI Studio as fallback) and re-run with the read that fits; the last rung is Carlos's Mac in a real Chrome window, promised reviews first. Its asker gets the report by email within $deadline hours or an apology with a ${fmt(r.num("apologyPercent"))}% code.")
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
        KpiPairs(listOf(
            KpiData("Reviews in range", fmt(t.num("reviews"))),
            KpiData("Counted", fmt(t.num("counted"))),
            KpiData("With a hit", fmt(t.num("withHits"))),
            KpiData("Wordfence feed", if (c.obj("wordfence").bool("stored") == true) "stored" else "not stored", alert = c.obj("wordfence").bool("stored") != true)
        ))
        c.objs("families").forEach { fam -> StatusRow(when { (fam.num("critical") ?: 0.0) > 0 -> "alert"; (fam.num("hits") ?: 0.0) > 0 -> "warn"; else -> "good" }, fam.str("label").orEmpty(), ReviewRescue.familyLine(fam)) }
        Text("Quotas", color = J.amber, fontSize = 12.sp)
        c.objs("quotas").forEach { q -> StatusRow(ReviewRescue.quotaLevel(q.num("pct")), q.str("label").orEmpty(), ReviewRescue.quotaLine(q)) }
        Text("Sources", color = J.amber, fontSize = 12.sp)
        c.objs("sources").forEach { x -> StatusRow(ReviewRescue.sourceLevel(x.str("state")), x.str("name").orEmpty(), listOfNotNull(x.str("state"), x.str("detail")?.ifEmpty { null }, ago(x.str("at"))).joinToString(" · ")) }
        Muted("Hits are counted from ${c.str("since") ?: "10 Nov 2026"}, when reviews started keeping a small summary of these checks; test runs are left out. A phishing-list or linked-script hit is critical and keeps the site off Live Reports. Web Risk keeps half of each day for client reviews; URL Scanner scans are public on Cloudflare Radar.")
    }
}
