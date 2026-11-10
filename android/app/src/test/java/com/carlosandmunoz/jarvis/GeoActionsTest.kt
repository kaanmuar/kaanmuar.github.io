package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.GeoActions
import com.carlosandmunoz.jarvis.ui.J
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoActionsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun statusesMatchTheWebChips() {
        assertEquals("On track", GeoActions.word("on-track"))
        assertEquals("Not started", GeoActions.word("waiting"))
        assertEquals(J.green, GeoActions.tone("ahead"))
        assertEquals(J.pink, GeoActions.tone("behind"))
        assertEquals("Now", GeoActions.level("high"))
        assertEquals("in 3 days", GeoActions.inDays(3))
        assertEquals("tomorrow", GeoActions.inDays(1))
    }

    @Test fun barsShowTheShareAndThePaceTick() {
        val count = json("""{"label":"Prospects reviewed","unit":"","actual":14,"target":40,"status":"on-track"}""")
        val rate = json("""{"label":"Reply rate","unit":"%","actual":1.2,"target":3,"status":"behind"}""")
        val total = json("""{"label":"Paid unlocks","actual":2,"target":30,"expected":8,"status":"behind"}""")
        assertEquals(35f, GeoActions.share(count), 0.01f)
        assertEquals(50f, GeoActions.pace(count, 50.0, true)!!, 0f)
        assertEquals(100f, GeoActions.pace(rate, 50.0, true)!!, 0f)
        assertEquals(26.67f, GeoActions.pace(total, null, false)!!, 0.01f)
        assertEquals(0f, GeoActions.share(json("""{"actual":null,"target":5}""")), 0f)
        assertEquals("14", GeoActions.amount(14.0, ""))
        assertEquals("—", GeoActions.amount(null, "%"))
    }

    @Test fun buttonsReuseTheCountrySheetKeysAndConfirmations() {
        val pause = json("""{"type":"pause","label":"Pause W1 E-pt Brazil","id":"c2","name":"W1 E-pt Brazil","leads":30,"start":""}""")
        val activate = json("""{"type":"activate","label":"Activate W2 A-de DACH","id":"c9","name":"W2 A-de DACH","leads":0,"start":"2026-11-17"}""")
        val holiday = json("""{"type":"calendar-pause","label":"Pause that day","cc":"BR","date":"2026-11-15","name":"Proclamação da República"}""")
        val confirm = json("""{"type":"confirm","label":"Confirm","host":"teaminternational.com","cc":"US","name":"United States"}""")
        assertEquals("mk:camp:c2", GeoActions.key(pause))
        assertEquals("pause W1 E-pt Brazil now", GeoActions.ask(pause))
        assertTrue(GeoActions.ask(activate)!!.contains("no leads yet") && GeoActions.ask(activate)!!.endsWith("sending from 2026-11-17"))
        assertEquals("action:calendar:BR:2026-11-15", GeoActions.key(holiday))
        assertTrue(GeoActions.ask(holiday)!!.contains("Sun, Nov 15"))
        assertEquals("geo:confirm:teaminternational.com", GeoActions.key(confirm))
        assertEquals("make AO a target market", GeoActions.ask(json("""{"type":"target","cc":"AO","on":true}""")))
        assertNull(GeoActions.ask(json("""{"type":"open","cc":"CO"}""")))
        assertNull(GeoActions.ask(json("""{"type":"copy","copy":"https://qalabreview.com/pdf"}""")))
        assertEquals("Open Live Report countries to confirm, above.", GeoActions.jump("geo-confirm"))
    }
}
