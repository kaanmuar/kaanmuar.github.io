package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.OwnerTags
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OwnerTagsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun theStateIsPausedLiveOrADryRun() {
        assertEquals("paused", OwnerTags.state(json("""{"settings":{"paused":true,"live":true}}""")))
        assertEquals("live", OwnerTags.state(json("""{"settings":{"paused":false,"live":true}}""")))
        assertEquals("dry run", OwnerTags.state(json("""{"settings":{}}""")))
    }

    @Test fun eachAccountGetsTheButtonsForTheOtherStatuses() {
        assertEquals(listOf("approved" to "Approve", "rejected" to "Reject", "blocked" to "Block"), OwnerTags.acts("suggested"))
        assertEquals(listOf("rejected" to "Reject", "blocked" to "Block"), OwnerTags.acts("approved"))
        assertEquals(listOf("approved" to "Approve", "rejected" to "Reject"), OwnerTags.acts("blocked"))
    }

    @Test fun profilesOpenOnTheirNetwork() {
        assertEquals("https://x.com/metrodebogota", OwnerTags.profile("x", "metrodebogota"))
        assertEquals("https://mastodon.social/@ana", OwnerTags.profile("mastodon", "ana@mastodon.social"))
        assertEquals("https://www.youtube.com/channel/UCabc", OwnerTags.profile("youtube", "channel/UCabc"))
        assertEquals("https://bsky.app/profile/metro.bsky.social", OwnerTags.profile("bluesky", "metro.bsky.social"))
        assertNull(OwnerTags.profile("mastodon", "ana"))
    }

    @Test fun linesSayWhyAndWhatHappened() {
        val a = json("""{"why":"city transit agency","scopes":["city:bogota"],"batch":"metrobogota","source":"gemini","kind":"related","verified":true}""")
        assertEquals("city transit agency · city:bogota · batch metrobogota · from gemini · related · verified", OwnerTags.accountLine(a))
        assertEquals("tags (2 mentions) · posted", OwnerTags.commentLine(json("""{"kind":"tags","status":"posted","mentions":2,"error":""}""")))
        assertEquals("owner reply · failed: 422 rate limited", OwnerTags.commentLine(json("""{"kind":"reply","status":"failed","error":"422 rate limited"}""")))
        val o = json("""{"week":{"bluesky":3,"x":1}}""")
        assertEquals("Bluesky 3 · X 1", OwnerTags.week(o, mapOf("bluesky" to "Bluesky", "x" to "X")))
        assertEquals(4.0, OwnerTags.weekTotal(o), 0.0)
    }

    @Test fun addAccountNeedsALinkOrANetworkAndAScope() {
        assertEquals(mapOf("url" to JsonPrimitive("https://x.com/metro"), "scope" to JsonPrimitive("city:bogota"), "kind" to JsonPrimitive("related"), "status" to JsonPrimitive("approved")),
            OwnerTags.addBody(" https://x.com/metro ", "", "city", "Bogotá", "related"))
        assertEquals(mapOf("network" to JsonPrimitive("bluesky"), "handle" to JsonPrimitive("metro.bsky.social"), "scope" to JsonPrimitive("report:u-vivastreet-ie"), "kind" to JsonPrimitive("owner"), "status" to JsonPrimitive("approved")),
            OwnerTags.addBody("@metro.bsky.social", "bluesky", "report", "u-vivastreet-ie", "owner"))
        assertNull(OwnerTags.addBody("@metro", "", "city", "bogota", "related"))
        assertNull(OwnerTags.addBody("https://x.com/metro", "", "city", " ", "related"))
        assertEquals("san-jose", OwnerTags.slug("San José"))
    }
}
