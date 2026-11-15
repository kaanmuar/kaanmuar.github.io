package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.linkCounts
import com.carlosandmunoz.jarvis.ui.qalabLink
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QalabLinksTest {
    @Test
    fun aProspectLinkMatchesTheWorkerRoute() {
        assertEquals("https://qalabreview.com/es/upb.edu.co", qalabLink(" https://www.UPB.edu.co/admisiones ", "es"))
        assertEquals("https://qalabreview.com/en/acme.io", qalabLink("acme.io", "ja"))
    }

    @Test
    fun aReportReplyRowCountsClicksRunsAndPayments() {
        val row = JSON.parseToJsonElement("""{"visits":12,"reviews":3,"paid":1,"usd":19}""") as JsonObject
        assertEquals("12 clicks · 3 runs · 1 paid · 19 USD", linkCounts(row))
        assertEquals("1 click · 1 run · 0 paid · 0 USD", linkCounts(JSON.parseToJsonElement("""{"visits":1,"reviews":1,"paid":0,"usd":0}""") as JsonObject))
    }

    @Test
    fun aBadDomainMakesNoLink() {
        assertNull(qalabLink("not a domain", "es"))
        assertNull(qalabLink("", "en"))
    }
}
