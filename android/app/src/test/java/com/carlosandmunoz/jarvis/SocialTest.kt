package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.ChannelMembers
import com.carlosandmunoz.jarvis.ui.ChannelNumbers
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SocialTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun telegramMembersShowTheCountAndTheChangeSinceTheRangeBegan() {
        val up = ChannelMembers.members(json("""{"members":25,"change":11,"from":{"date":"2026-10-27","members":14}}"""))
        assertEquals("25 members · +11 since 2026-10-27", up?.text)
        assertEquals(11, up?.change)
        assertEquals("8 members · -2 since 2026-10-30", ChannelMembers.members(json("""{"members":8,"change":-2,"from":{"date":"2026-10-30","members":10}}"""))?.text)
        assertEquals("25 members", ChannelMembers.members(json("""{"members":25,"change":null,"from":null}"""))?.text)
    }

    @Test fun channelNumbersListTheSummedCountsAboveZeroInOrder() {
        assertEquals("1,200 views · 7 likes · 3 comments", ChannelNumbers.text(json("""{"comments":3,"likes":7,"views":1200,"impressions":0}""")))
        assertNull(ChannelNumbers.text(json("{}")))
        assertNull(ChannelNumbers.text(null))
    }

    @Test fun noTelegramCountShowsNoMembersLine() {
        assertNull(ChannelMembers.members(json("""{"members":null,"change":null,"need":"Telegram members: no count yet"}""")))
        assertNull(ChannelMembers.members(null))
    }

    @Test fun redditMembersShowLikeTelegrams() {
        assertEquals("12 members · +3 since 2026-11-01", ChannelMembers.members(json("""{"channel":"r/QALabLiveReports","members":12,"change":3,"from":{"date":"2026-11-01","members":9}}"""))?.text)
        assertNull(ChannelMembers.members(json("""{"members":null,"change":null,"need":"Reddit members: the Reddit ledger has no member count yet."}""")))
    }
}
