package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.home.Ongoing
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OngoingTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun readsReadinessCountsAndTodaysMoney() {
        val week = json("""{"readiness":71.6,"briefing":[{"level":"alert","text":"Checkout is down"},{"level":"warn","text":"TLS expires in 9 days"}],
            "external":{"money":{"ok":true,"revenue":{"usd":1284,"count":19}}}}""")
        val c = Ongoing.content(week, json("""{"external":{"money":{"ok":true,"revenue":{"usd":38,"count":2}}}}"""), 5L, 3, Ongoing.Part.ALL)
        assertEquals(72, c.readiness)
        assertEquals("Readiness 72% · 1 alert · 1 warning · 3 approvals waiting", c.title)
        assertEquals("Checkout is down", c.text)
        assertEquals(listOf("Checkout is down", "Today $38 · 2 sales"), c.lines)
        assertTrue(c.urgent)
        assertEquals(5L, c.at)
        assertEquals("1 alert", c.chip)
    }

    @Test fun allClearShowsTheMoneyLine() {
        val c = Ongoing.content(json("""{"briefing":[{"level":"good","text":"Sweep ran"}]}"""), null, 0L, 0)
        assertNull(c.readiness)
        assertEquals("Readiness — · All clear", c.title)
        assertEquals("Today — · 0 sales", c.text)
        assertFalse(c.urgent)
        assertNull(c.chip)
    }

    @Test fun leavesOutThePartsTurnedOff() {
        val week = json("""{"readiness":71.6,"briefing":[{"level":"alert","text":"Checkout is down"}],
            "external":{"money":{"ok":true,"revenue":{"usd":38,"count":2}}}}""")
        val c = Ongoing.content(week, null, 0L, 3, setOf(Ongoing.Part.APPROVALS, Ongoing.Part.MONEY))
        assertEquals("3 approvals waiting", c.title)
        assertEquals(listOf("Today $38 · 2 sales"), c.lines)
        assertNull(c.chip)
        assertFalse(c.urgent)
        assertTrue(c.waiting)
        assertFalse(c.ring || c.bar || c.live)
        assertEquals("Jarvis", Ongoing.content(week, null, 0L, 0, emptySet()).title)
        assertEquals(Ongoing.Part.ALL - Ongoing.Part.CHIP, Ongoing.Part.of(null))
        assertEquals(setOf(Ongoing.Part.BAR), Ongoing.Part.of("bar,gone"))
    }

    @Test fun chipShowsApprovalsThenReadiness() {
        val snap = json("""{"readiness":88,"briefing":[{"level":"warn","text":"TLS expires in 9 days"}]}""")
        assertEquals("2 waiting", Ongoing.content(snap, null, 0L, 2, Ongoing.Part.ALL).chip)
        assertEquals("88%", Ongoing.content(snap, null, 0L, 0, Ongoing.Part.ALL).chip)
        assertNull(Ongoing.content(snap, null, 0L, 2).chip)
    }

    @Test fun cardShowsReadinessConnectionsAndGoals() {
        val snap = json("""{"readiness":88,"briefing":[{"level":"alert","text":"Checkout is down"}],
            "connections":[{"state":"ok"},{"state":"down"},{"state":"ok"},{"state":"ok"}],
            "goals":[{"label":"Reviews sold","value":12,"target":40,"pct":30,"status":"behind"},{"label":"Signups","value":90,"target":100,"pct":90,"status":"on-track"},{"label":"Third","value":1,"target":2,"pct":50}],
            "external":{"money":{"ok":true,"revenue":{"usd":38,"count":2}}}}""")
        val c = Ongoing.content(snap, null, 0L, 1)
        val card = c.card!!
        assertEquals(88, card.ring)
        assertEquals("Readiness", card.ringLabel)
        assertEquals(listOf("Connections", "Reviews sold", "Signups"), card.bars.map { it.label })
        assertEquals(listOf("3 of 4 online", "12 of 40", "90 of 100"), card.bars.map { it.value })
        assertEquals(listOf(75, 30, 90), card.bars.map { it.pct })
        assertEquals(listOf("Checkout is down", "Today $38 · 2 sales"), card.footer)
        assertEquals("1 alert · 1 approval waiting", c.counts)
        assertFalse(c.live)
        val bare = Ongoing.content(snap, null, 0L, 0, setOf(Ongoing.Part.MONEY)).card!!
        assertNull(bare.ring)
        assertTrue(bare.bars.isEmpty())
    }
}
