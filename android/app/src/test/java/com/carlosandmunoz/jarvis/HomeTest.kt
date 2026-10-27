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

    private val now = java.time.Instant.parse("2026-10-26T20:00:00Z").toEpochMilli()

    @Test fun healthListsUptimeSpeedCiDeployAndTls() {
        val h = Home.health(json("""{"external":{
            "uptime":{"pages":[{"name":"CV","ok":true,"ms":300},{"name":"Lab","ok":false,"ms":500}],"tlsDaysLeft":9},
            "speed":{"pages":[{"name":"CV","score":97},{"name":"Lab","score":0.62}]},
            "github":{"ci":[{"name":"E2E and Visual Tests","conclusion":"failure","at":"2026-10-26T19:00:00Z"},{"name":"pages build and deployment","conclusion":"success","at":"2026-10-26T18:00:00Z"}]}}}"""), now)
        assertEquals(listOf("Uptime", "Speed", "CI on main", "Last deploy", "TLS"), h.map { it.label })
        assertEquals("1/2 up · 400 ms", h[0].value)
        assertEquals("alert", h[0].level)
        assertEquals("avg 80 · lowest Lab 62", h[1].value)
        assertEquals("warn", h[1].level)
        assertEquals("1 failing: E2E and Visual Tests", h[2].value)
        assertEquals("2 h ago", h[3].value)
        assertEquals("warn", h[4].level)
    }

    @Test fun socialQueueIsSoonestFirst() {
        val q = Home.social(json("""{"external":{"social":{"ok":true,"scheduled":{"count":5},"queue":[
            {"name":"Bluesky","next":[{"at":"2026-10-26T23:00:00Z","post":"HSTS tip"}]},{"name":"LinkedIn","next":[{"at":"2026-10-26T20:35:00Z","post":"CWV tip"}]},{"name":"Empty","next":[]}]}}}"""), now)
        assertEquals(5, q.count)
        assertEquals(listOf("LinkedIn", "Bluesky"), q.rows.map { it.label })
        assertEquals("in 35 min · CWV tip", q.rows[0].value)
    }

    @Test fun nextUpSkipsPastRunsAndFlagsFailures() {
        val n = Home.next(json("""{"external":{"jobs":{"jobs":[{"name":"sweepReviews","nextRun":"2026-10-26T21:00:00Z","ok":false},
            {"name":"dailyBriefing","nextRun":"2026-10-26T10:00:00Z","ok":true},{"name":"probe-failures","nextRun":"2026-10-26T20:20:00Z","ok":true}]},
            "social":{"scheduled":{"next":"2026-10-26T20:50:00Z"}}}}"""), now)
        assertEquals(listOf("Probe failures", "Next social post", "Sweep reviews"), n.map { it.label })
        assertEquals("alert", n[2].level)
        assertEquals("in 1 h", n[2].value)
    }

    @Test fun pipelineKeepsStagesWithNumbers() {
        val f = Home.pipeline(json("""{"external":{"outreach":{"ok":true,"pipeline":{"reviews":120},"instantly":{"sent":80,"opened":40,"replies":9},"plan":{"next":{"label":"first 50 emails","daysLeft":3}}}}}"""))
        assertEquals(listOf("Reviewed" to 120.0, "Contacted" to 80.0, "Opened" to 40.0, "Replied" to 9.0), f.stages)
        assertEquals("Next: first 50 emails in 3 days", f.note)
    }

    @Test fun trafficUsesAnalyticsThenCloudflare() {
        val ga = Home.traffic(json("""{"external":{"ga4":{"ok":true,"groups":[{"sessions":1200,"priorSessions":1000},{"sessions":110,"priorSessions":100}],
            "countries":[{"label":"Spain","value":20},{"label":"US","value":300},{"label":"Mexico","value":90},{"label":"Peru","value":5}],"daily":[{"sessions":1},{"sessions":2}]}}}"""))
        assertEquals("1,310", ga.value)
        assertEquals(1, ga.dir)
        assertEquals(listOf("US", "Mexico", "Spain"), ga.countries.map { it.first })
        val cf = Home.traffic(json("""{"external":{"ga4":{"ok":false},"cloudflare":{"ok":true,"uniques":900}}}"""))
        assertEquals("Visitors", cf.label)
        assertEquals("900", cf.value)
    }

    @Test fun pickFallsBackToRevenue() {
        val snap = json("""{"readiness":92,"briefing":[{"level":"alert","text":"x"}]}""")
        val day = json("""{"external":{"money":{"ok":true,"revenue":{"usd":184.4,"count":3}}}}""")
        assertEquals("$184", Home.pick("nonsense", snap, day, 0, 7).value)
        assertEquals("3", Home.pick("sales", snap, day, 0, 7).value)
        assertEquals("92%", Home.pick("readiness", snap, day, 0, 7).value)
        assertEquals("alert", Home.pick("readiness", snap, day, 0, 7).level)
        assertEquals("products:outreach", Home.pick("needs", snap, day, 2, 7).tab)
    }

    @Test fun nothingWaitingWhenTheListsAreMissing() {
        assertTrue(Home.needs(json("{}"), null, null).isEmpty())
    }
}
