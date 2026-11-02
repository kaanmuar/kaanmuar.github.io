package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.People
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class PeopleTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun timeOnSiteReadsLikeTheWebPanel() {
        assertEquals("0 s", People.spent(null))
        assertEquals("45 s", People.spent(45000.0))
        assertEquals("12 min", People.spent(12 * 60000.0))
        assertEquals("1 h", People.spent(60 * 60000.0))
        assertEquals("1 h 20 min", People.spent(80 * 60000.0))
    }

    @Test fun theLineSaysHowOftenTheyCameBackAndWhatTheyRan() {
        assertEquals("3 visits · back 2× · 2 days · 14 min · 1 run, 1 paid",
            People.line(json("""{"visits":3,"returns":2,"days":2,"activeMs":840000,"runs":1,"paid":1}""")))
        assertEquals("1 visit · 30 s · 0 runs", People.line(json("""{"visits":1,"returns":0,"days":1,"activeMs":30000,"runs":0,"paid":0}""")))
    }

    @Test fun aPersonIsNamedOrElseTheirEmail() {
        assertEquals("Ana Ruiz", People.who(json("""{"name":"Ana Ruiz","email":"ana@x.org"}""")))
        assertEquals("ana@x.org", People.who(json("""{"name":"","email":"ana@x.org"}""")))
    }
}
