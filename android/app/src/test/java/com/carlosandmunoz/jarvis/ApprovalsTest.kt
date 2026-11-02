package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.noticeBadges
import com.carlosandmunoz.jarvis.ui.noticeHeld
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ApprovalsTest {
    private fun notice(json: String) = JSON.parseToJsonElement(json) as JsonObject

    @Test fun readyNoticeShowsItsStateAndLanguage() {
        assertEquals(listOf("Ready to send" to "good", "ES" to "info"), noticeBadges(notice("""{"state":"ready","lang":"es"}"""), 3))
    }

    @Test fun waitingCriticalFailedNoticeShowsEveryBadge() {
        val badges = noticeBadges(notice("""{"state":"waiting","critical":true,"lastError":"Not public yet.","tries":2}"""), 3)
        assertEquals(listOf("Waiting for Live Report" to "warn", "Critical security" to "alert", "Last try failed · 2/3 auto tries" to "warn", "EN" to "info"), badges)
    }

    @Test fun manualFailureHasNoTryCount() {
        assertEquals("Last try failed" to "warn", noticeBadges(notice("""{"state":"","lastError":"SendGrid down."}"""), 3)[0])
    }

    @Test fun onlyReadyAndUnknownNoticesCanBeSent() {
        assertNull(noticeHeld("ready"))
        assertNull(noticeHeld(""))
        assertEquals("Send opens once its Live Report is public.", noticeHeld("waiting"))
        assertEquals(true, noticeHeld("unlisted")?.contains("off Live Reports"))
        assertEquals(true, noticeHeld("stopped")?.contains("asked for no notices"))
    }
}
