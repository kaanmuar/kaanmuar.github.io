package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.CHIPS
import com.carlosandmunoz.jarvis.ui.Engagement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EngagementTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun anApproveWithChangedTextGoesAsAnEdit() {
        assertEquals("approve", Engagement.decision("We run axe.", " We run axe. ", true))
        assertEquals("edit", Engagement.decision("We run axe.", "We run axe-core in CI.", true))
        assertEquals("dismiss", Engagement.decision("We run axe.", "anything", false))
    }

    @Test fun thePlanNamesEachActionOrWhyThePostWasLeftAlone() {
        assertEquals("like: planned · reply: waiting", Engagement.plan(json("""{"verdict":"engage","actions":{"like":{"status":"planned"},"reply":{"status":"waiting"}}}""")))
        assertEquals("left alone: competitor", Engagement.plan(json("""{"verdict":"skip","skip":"competitor","actions":{}}""")))
        assertEquals("trend only", Engagement.plan(json("""{"verdict":"trend","actions":{}}""")))
        assertEquals("watch", Engagement.plan(json("""{"verdict":"watch","actions":{}}""")))
    }

    @Test fun usageShowsTodayAgainstTheCaps() {
        val g = json("""{"caps":{"like":60,"repost":15,"follow":15,"reply":15},"used":{"mastodon":{"like":3,"reply":1}}}""")
        assertEquals("like 3/60 · repost 0/15 · follow 0/15 · reply 1/15", Engagement.usage(g, "mastodon"))
    }

    @Test fun eachNetworkKeepsItsReplyLimit() {
        assertEquals(300, Engagement.limit("bluesky"))
        assertEquals(280, Engagement.limit("x"))
        assertEquals(300, Engagement.limit(null))
    }

    @Test fun metricsAndAuthorReadTheSnapshot() {
        val p = json("""{"author":{"handle":"ana@m.s","name":""},"score":8,"metrics":{"likes":12,"replies":3,"reposts":4,"views":0}}""")
        assertEquals("ana@m.s", Engagement.author(p))
        assertEquals("♥ 12 · ↩ 3 · ⟳ 4 · score 8", Engagement.metrics(p))
    }

    @Test fun theHeadlineDropsTheLinksAPostEndsOn() {
        assertEquals("Captioned Doesn’t Always Mean Accessible", Engagement.headline(json("""{"text":"Captioned Doesn’t Always Mean Accessible https://programming.dev/post/58836760"}""")))
        assertEquals("Lighthouse 13 is out", Engagement.headline(json("""{"title":"Lighthouse 13 is out","text":"https://x.dev long body"}""")))
    }

    @Test fun doneCountsTheCarriedOutLikesRepostsAndFollows() {
        val t = json("""{"like_done":4,"repost_done":1,"follow_done":2,"like_dry":9,"act_failed":3}""")
        assertEquals(7.0, Engagement.carried(t, "done"), 0.0)
        assertEquals(9.0, Engagement.carried(t, "dry"), 0.0)
        assertEquals(0.0, Engagement.carried(null, "done"), 0.0)
    }

    @Test fun anAccountRowSaysAsWhomTheBotFlagAndTheLastError() {
        assertEquals("connected as qalaburlreview · bot flag on", Engagement.account(json("""{"connected":true,"account":"qalaburlreview","bot":true,"error":""}""")))
        assertEquals("not connected", Engagement.account(json("""{"connected":false,"account":""}""")))
        assertEquals("connected as QA-lab URL Review · last error: 401", Engagement.account(json("""{"connected":true,"account":"QA-lab URL Review","error":"401"}""")))
    }

    @Test fun theMacsNetworksSaySignedInAndTheAgentSaysWhenItCheckedIn() {
        assertEquals("Mac · signed in as @qalaburlreview", Engagement.account(json("""{"via":"mac","connected":true,"account":"@qalaburlreview"}""")))
        assertEquals("Mac · not signed in · last error: X shows a captcha.", Engagement.account(json("""{"via":"mac","connected":false,"account":"","error":"X shows a captcha."}""")))
        assertTrue(Engagement.mac(null).contains("not installed yet"))
        assertTrue(Engagement.mac(json("""{"at":"2026-11-01T18:00:00Z","host":"mac-mini"}""")).startsWith("The Mac's browser agent on mac-mini last checked in"))
    }

    @Test fun onlyAnAppPasswordEnablesConnectBluesky() {
        assertTrue(Engagement.APP_PASSWORD.matches("abcd-efgh-ijkl-mnop"))
        assertTrue(!Engagement.APP_PASSWORD.matches("my real password"))
    }

    @Test fun engagementIsAProductsChipSoItsPushesOpenIt() {
        assertTrue(CHIPS.any { it.first == "engagement" })
    }
}
