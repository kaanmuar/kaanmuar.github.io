package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.home.Home
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun listsNoticesThenPicksThenProposals() {
        val snap = json("""{"proposals":[{"key":"studio:swing","title":"Find why QA Studio visits fell","level":"warn","tab":"studio"},
            {"key":"ci","title":"Fix the failing deploy","level":"alert","tab":"systems"},{"key":"untitled"}]}""")
        val notices = json("""{"notices":[{"domain":"acme.com","host":"www.acme.com","critical":true,"candidates":[{"email":"info@acme.com"}]},
            {"domain":"shop.io","email":"owner@shop.io"}]}""")
        val picks = json("""{"proposals":[{"id":"p1","title":"Playwright 2.0 is out","source":"Hacker News"}]}""")
        val needs = Home.needs(snap, notices, picks)
        assertEquals(listOf("notice", "notice", "social", "proposal", "proposal"), needs.map { it.kind })
        assertEquals("Send notice to www.acme.com", needs[0].title)
        assertEquals("info@acme.com", needs[0].email)
        assertEquals("alert", needs[0].level)
        assertEquals("owner@shop.io", needs[1].email)
        assertEquals("warn", needs[1].level)
        assertEquals("Social pick · Hacker News", needs[2].detail)
        assertEquals("products:studio", needs[3].tab)
        assertEquals("systems", needs[4].tab)
    }

    @Test fun aNoticeWithoutAnAddressCannotBeSent() {
        val n = Home.needs(json("{}"), json("""{"notices":[{"domain":"nomail.dev","candidates":[]}]}"""), null).single()
        assertNull(n.email)
        assertEquals("No address found", n.detail)
    }

    @Test fun alertsComeFirstAndOpenWhereTheyHappened() {
        val a = Home.alerts(json("""{"briefing":[{"level":"good","product":"cv","text":"CV visits up 40%"},{"level":"warn","product":"business","text":"PayPal dispute open"},
            {"level":"alert","product":"outreach","text":"Mailbox score under 80"},{"level":"info","text":"No product"},{"level":"warn"}]}"""))
        assertEquals(listOf("Mailbox score under 80", "PayPal dispute open", "No product", "CV visits up 40%"), a.map { it.text })
        assertEquals("products:outreach", a[0].tab)
        assertEquals("Outreach", a[0].label)
        assertEquals("business", a[1].tab)
        assertEquals("Business", a[1].label)
        assertEquals("overview", a[2].tab)
        assertNull(a[2].label)
    }

    @Test fun moneyComparesTheDayWithTheDayBefore() {
        val day = json("""{"external":{"money":{"ok":true,"revenue":{"usd":184.4,"count":3,"avgUsd":61.47},"prior":{"usd":120},"refundsUsd":29,"paypal":{"disputesOpen":1}}}}""")
        val week = json("""{"external":{"money":{"ok":true,"daily":[{"date":"2026-10-20","usd":90},{"date":"2026-10-21","usd":140}]}}}""")
        val m = Home.money(day, week, 7, true)
        assertEquals("Money · last 24 hours", m.title)
        assertEquals("$184", m.usd)
        assertEquals(1, m.dir)
        assertEquals("3 sales · avg $61", m.sales)
        assertEquals(listOf(90.0, 140.0), m.series)
        assertEquals(listOf("$29 refunded", "1 PayPal dispute open"), m.flags)
    }

    @Test fun moneyFallsBackToTheMainWindow() {
        val m = Home.money(json("""{"external":{"money":{"ok":false}}}"""), json("{}"), 30, false)
        assertEquals("Money · last 30 days", m.title)
        assertEquals("—", m.usd)
        assertEquals("No sales data", m.sales)
        assertTrue(m.flags.isEmpty())
    }

    @Test fun nothingWaitingWhenTheListsAreMissing() {
        assertTrue(Home.needs(json("{}"), null, null).isEmpty())
    }
}
