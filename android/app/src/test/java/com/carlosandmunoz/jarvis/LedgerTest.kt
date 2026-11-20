package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.Ledger
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LedgerTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    private val ledger = json("""{"at":"2026-11-18T10:00:00.000Z","results":[
        {"id":"pr-3700","pr":3700,"ticket":3690,"title":"FE: Faster hero","mergedAt":"2026-11-01","metric":"lcp","expect":"down","status":"worse","before":{"days":7,"mean":2.5},"after":{"days":7,"mean":3.125},"deltaPct":25},
        {"id":"pr-3701","pr":null,"ticket":null,"title":"Copy change","mergedAt":"2026-11-02","metric":null,"expect":null,"status":"manual","check":"Look at the bounce page"},
        {"id":"pr-3702","pr":3702,"ticket":null,"title":"New chart","mergedAt":"2026-11-17","metric":"visits","expect":"up","status":"too early","reason":"merged 1 day ago"},
        {"id":"pr-3703","pr":3703,"ticket":3699,"title":"Faster API","mergedAt":"2026-10-20","metric":"visits","expect":"up","status":"better","before":{"days":7,"mean":10},"after":{"days":7,"mean":12.5},"deltaPct":-3}
    ]}""")

    @Test fun aFullResultParsesWithItsNumbersAndLinks() {
        val r = Ledger.rows(ledger).first()
        assertEquals("FE: Faster hero", r.title)
        assertEquals(3700, r.pr)
        assertEquals(3690, r.ticket)
        assertEquals("https://github.com/kaanmuar/kaanmuar.github.io/pull/3700", r.prUrl)
        assertEquals("lcp", r.metric)
        assertEquals("down", r.expect)
        assertTrue(r.worse)
        assertEquals("2.5 -> 3.13 (+25%)", Ledger.change(r))
        assertEquals("PR #3700 · ticket #3690 · merged 2026-11-01 · lcp (expect down)", Ledger.detail(r))
        assertNull(r.note)
    }

    @Test fun aNullOrMissingLedgerHasNoRowsAndHasNotRun() {
        assertTrue(Ledger.rows(null).isEmpty())
        assertTrue(Ledger.rows(JsonNull).isEmpty())
        assertFalse(Ledger.ran(null))
        assertFalse(Ledger.ran(JsonNull))
        assertFalse(Ledger.ran(json("""{"at":"2026-11-18T10:00:00Z"}""")))
        assertTrue(Ledger.ran(json("""{"at":"2026-11-18T10:00:00Z","results":[]}""")))
        assertNull(Ledger.summary(Ledger.rows(json("""{"results":[]}"""))))
    }

    @Test fun aManualRowHasNoMetricOrNumbersAndShowsWhatToCheck() {
        val r = Ledger.rows(ledger)[1]
        assertNull(r.metric)
        assertNull(r.expect)
        assertNull(r.pr)
        assertNull(r.prUrl)
        assertEquals("Look at the bounce page", r.note)
        assertEquals("", Ledger.change(r))
        assertEquals("Manual", r.label)
        assertEquals("merged 2026-11-02", Ledger.detail(r))
    }

    @Test fun aRowWithMissingFieldsStillParses() {
        val r = Ledger.row(json("""{"id":"x","status":"unknown metric","before":null,"after":{}}"""))
        assertEquals("x", r.title)
        assertNull(r.before)
        assertNull(r.after)
        assertEquals("unknown metric", r.label)
        assertEquals("", Ledger.change(r))
        val half = Ledger.row(json("""{"title":"t","status":"flat","after":{"mean":4}}"""))
        assertEquals("? -> 4", Ledger.change(half))
    }

    @Test fun reasonShowsForTooEarlyAndRowsKeepTheServersOrder() {
        val rows = Ledger.rows(ledger)
        assertEquals(listOf("worse", "manual", "too early", "better"), rows.map { it.status })
        assertEquals("merged 1 day ago", rows[2].note)
        assertEquals("10 -> 12.5 (-3%)", Ledger.change(rows[3]))
    }

    @Test fun labelsAndRankPutWorseFirstAndSummaryCountsInThatOrder() {
        assertEquals(listOf("Worse", "Better", "Flat", "Held", "Too early", "Too little data", "Manual"), Ledger.STATUS_ORDER.map { Ledger.statusLabel(it) })
        assertEquals(0, Ledger.statusRank("worse"))
        assertTrue(Ledger.statusRank("better") < Ledger.statusRank("manual"))
        assertEquals(Ledger.STATUS_ORDER.size, Ledger.statusRank("bad mergedAt"))
        assertEquals("bad mergedAt", Ledger.statusLabel("bad mergedAt"))
        assertEquals("unknown", Ledger.statusLabel(null))
        assertEquals("1 worse · 1 better · 1 too early · 1 manual", Ledger.summary(Ledger.rows(ledger)))
    }
}
