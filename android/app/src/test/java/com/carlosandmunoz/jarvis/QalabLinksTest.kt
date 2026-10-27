package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.ui.qalabLink
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
    fun aBadDomainMakesNoLink() {
        assertNull(qalabLink("not a domain", "es"))
        assertNull(qalabLink("", "en"))
    }
}
