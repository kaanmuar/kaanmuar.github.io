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
        val c = Ongoing.content(week, json("""{"external":{"money":{"ok":true,"revenue":{"usd":38,"count":2}}}}"""), 5L, 3)
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
        assertEquals(Ongoing.Part.ALL, Ongoing.Part.of(null))
        assertEquals(setOf(Ongoing.Part.BAR), Ongoing.Part.of("bar,gone"))
    }

    @Test fun chipShowsApprovalsThenReadiness() {
        val snap = json("""{"readiness":88,"briefing":[{"level":"warn","text":"TLS expires in 9 days"}]}""")
        assertEquals("2 waiting", Ongoing.content(snap, null, 0L, 2).chip)
        assertEquals("88%", Ongoing.content(snap, null, 0L, 0).chip)
    }
}
