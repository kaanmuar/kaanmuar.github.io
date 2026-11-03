package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.update.WhatsNew
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WhatsNewTest {
    @Test fun showsOncePerUpdateAndNeverAfterAFreshInstall() {
        assertTrue(WhatsNew.due(seen = 190, code = 191, freshInstall = false))
        assertFalse(WhatsNew.due(seen = 191, code = 191, freshInstall = false))
        assertTrue(WhatsNew.due(seen = -1, code = 191, freshInstall = false))
        assertFalse(WhatsNew.due(seen = -1, code = 191, freshInstall = true))
    }

    @Test fun readsOneLinePerChange() {
        assertEquals(listOf("Calls tab", "Faster Ask"), WhatsNew.lines("Calls tab\n\n- Faster Ask  \n"))
        assertEquals(emptyList<String>(), WhatsNew.lines("\n"))
    }
}
