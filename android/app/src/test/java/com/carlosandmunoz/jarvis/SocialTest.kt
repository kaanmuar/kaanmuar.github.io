package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Telegram
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SocialTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun telegramMembersShowTheCountAndTheChangeSinceTheRangeBegan() {
        val up = Telegram.members(json("""{"members":25,"change":11,"from":{"date":"2026-10-27","members":14}}"""))
        assertEquals("25 members · +11 since 2026-10-27", up?.text)
        assertEquals(11, up?.change)
        assertEquals("8 members · -2 since 2026-10-30", Telegram.members(json("""{"members":8,"change":-2,"from":{"date":"2026-10-30","members":10}}"""))?.text)
        assertEquals("25 members", Telegram.members(json("""{"members":25,"change":null,"from":null}"""))?.text)
    }

    @Test fun noTelegramCountShowsNoMembersLine() {
        assertNull(Telegram.members(json("""{"members":null,"change":null,"need":"Telegram members: no count yet"}""")))
        assertNull(Telegram.members(null))
    }
}
