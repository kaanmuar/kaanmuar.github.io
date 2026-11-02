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

    @Test fun engagementIsAProductsChipSoItsPushesOpenIt() {
        assertTrue(CHIPS.any { it.first == "engagement" })
    }
}
