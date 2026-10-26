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
    }

    @Test fun allClearShowsTheMoneyLine() {
        val c = Ongoing.content(json("""{"briefing":[{"level":"good","text":"Sweep ran"}]}"""), null, 0L, 0)
        assertNull(c.readiness)
        assertEquals("Readiness — · All clear", c.title)
        assertEquals("Today — · 0 sales", c.text)
        assertFalse(c.urgent)
    }
}
