package com.carlosandmunoz.jarvis.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.math.BigDecimal
import java.math.RoundingMode

/** The change ledger (#3794): the snapshot's `ledger` section (written daily by jarvisChangeLedger, #3784), one row per
    shipped change with what its metric did since it merged. Twin of js/admin-jarvis-ledger.js. */
object Ledger {
    const val REPO_URL = "https://github.com/kaanmuar/kaanmuar.github.io"

    /** The statuses in the order the summary lists them; "worse" first because it is the one that needs a look. */
    val STATUS_ORDER = listOf("worse", "better", "flat", "held", "too early", "too little data", "manual")
    val STATUS_LABELS = mapOf(
        "worse" to "Worse", "better" to "Better", "flat" to "Flat", "held" to "Held",
        "too early" to "Too early", "too little data" to "Too little data", "manual" to "Manual",
    )

    /** One result, every field tolerant of a null or a missing value. */
    data class Row(
        val title: String, val pr: Int?, val ticket: Int?, val mergedAt: String?, val metric: String?, val expect: String?,
        val status: String, val before: Double?, val after: Double?, val deltaPct: Double?, val note: String?,
    ) {
        val worse get() = status == "worse"
        val label get() = statusLabel(status)
        val prUrl get() = pr?.let { "$REPO_URL/pull/$it" }
    }

    /** The ledger's results in the server's order; none when the ledger is null or has no results array. */
    fun rows(ledger: JsonElement?): List<Row> = ledger.objs("results").map(::row)

    fun row(r: JsonObject): Row {
        val status = r.str("status").orEmpty()
        return Row(
            title = r.str("title")?.takeIf { it.isNotBlank() } ?: r.str("id").orEmpty(),
            pr = whole(r.num("pr")), ticket = whole(r.num("ticket")),
            mergedAt = r.str("mergedAt")?.takeIf { it.isNotBlank() },
            metric = r.str("metric")?.takeIf { it.isNotBlank() },
            expect = r.str("expect")?.takeIf { it.isNotBlank() },
            status = status,
            before = r.obj("before").num("mean"), after = r.obj("after").num("mean"), deltaPct = r.num("deltaPct"),
            note = (if (status == "manual") r.str("check") else r.str("reason") ?: r.str("check"))?.takeIf { it.isNotBlank() },
        )
    }

    private fun whole(v: Double?): Int? = v?.takeIf { it > 0 && it == Math.floor(it) && it < Int.MAX_VALUE }?.toInt()

    /** True once the first daily run wrote the ledger (it can still have no results). */
    fun ran(ledger: JsonElement?): Boolean = ledger is JsonObject && ledger["results"] is kotlinx.serialization.json.JsonArray

    fun statusLabel(status: String?): String = STATUS_LABELS[status] ?: status?.takeIf { it.isNotBlank() } ?: "unknown"

    /** 0 for worse up to the number of known statuses for an unknown one: the prominence of a status. */
    fun statusRank(status: String?): Int = STATUS_ORDER.indexOf(status).let { if (it < 0) STATUS_ORDER.size else it }

    /** "1 worse · 3 better", worse first, or null when there are no rows. */
    fun summary(rows: List<Row>): String? =
        rows.groupingBy { it.status }.eachCount().entries.sortedBy { statusRank(it.key) }
            .joinToString(" · ") { "${it.value} ${statusLabel(it.key).lowercase()}" }.ifEmpty { null }

    /** "12.5" for a mean: up to two decimals, no trailing zeros; "" for none. */
    fun mean(v: Double?): String = v?.takeIf { it.isFinite() }?.let { plain(it, 2) }.orEmpty()

    /** "+12.5%" or "-3%"; "" for none. */
    fun delta(v: Double?): String = v?.takeIf { it.isFinite() }?.let { (if (it > 0 && plain(it, 1) != "0") "+" else "") + plain(it, 1) + "%" }.orEmpty()

    /** "2.5 -> 3.13 (+25%)", the side that exists with "?" for the other, or "" when neither exists. */
    fun change(r: Row): String {
        val b = mean(r.before)
        val a = mean(r.after)
        if (b.isEmpty() && a.isEmpty()) return ""
        val d = delta(r.deltaPct)
        return "${b.ifEmpty { "?" }} -> ${a.ifEmpty { "?" }}" + if (d.isNotEmpty()) " ($d)" else ""
    }

    /** "PR #3700 · ticket #3690 · merged 2026-11-01 · lcp (expect down)". */
    fun detail(r: Row): String = listOfNotNull(
        r.pr?.let { "PR #$it" }, r.ticket?.let { "ticket #$it" }, r.mergedAt?.let { "merged $it" },
        r.metric?.let { it + (r.expect?.let { e -> " (expect $e)" } ?: "") },
    ).joinToString(" · ")

    private fun plain(v: Double, digits: Int): String {
        val s = BigDecimal(v).setScale(digits, RoundingMode.HALF_UP).stripTrailingZeros()
        return (if (s.signum() == 0) BigDecimal.ZERO else s).toPlainString()
    }
}
