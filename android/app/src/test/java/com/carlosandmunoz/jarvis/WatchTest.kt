package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.home.Watch
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WatchTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    private val week = json("""{"readiness":92,"briefing":[{"level":"warn","text":"TLS expires in 9 days"},{"level":"alert","text":"Checkout is down"},{"level":"good","text":"Sweep ran"}],
        "external":{"money":{"ok":true,"revenue":{"usd":1284,"count":19}}}}""")

    @Test fun usesTodayForRevenueAndTheWeekForStatus() {
        val s = Watch.summary(week, json("""{"external":{"money":{"ok":true,"revenue":{"usd":184.4,"count":3}}}}"""), 7L)
        assertEquals(92.0, s.readiness)
        assertEquals(1, s.alerts)
        assertEquals(1, s.warns)
        assertEquals("$184", s.revenue)
        assertEquals(3, s.sales)
        assertEquals("Checkout is down", s.top)
        assertEquals(7L, s.at)
    }

    @Test fun fallsBackWhenMoneyIsMissing() {
        val s = Watch.summary(json("""{"briefing":[]}"""), json("""{"external":{"money":{"ok":false}}}"""), 0L)
        assertNull(s.readiness)
        assertEquals("—", s.revenue)
        assertEquals("All clear", s.headline)
        assertNull(s.top)
    }
}
