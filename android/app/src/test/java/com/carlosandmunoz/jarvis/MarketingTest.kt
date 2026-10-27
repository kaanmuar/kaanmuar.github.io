package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.ui.Marketing
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

class MarketingTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    private val now = Instant.parse("2026-10-26T15:00:00Z").toEpochMilli()
    private val today = LocalDate.parse("2026-10-26")

    private val sync = json("""{"ok":true,"at":"2026-10-26T14:58:00Z","stale":false,
        "leads":{"weeks":[{"week":"W1","total":52,"complete":10,"missing":42,"approved":4,"uploaded":0,"ready":4},{"week":"W2","total":40,"complete":40,"missing":0,"approved":0,"uploaded":40,"ready":0}]},
        "replies":[{"id":"a","draft":"Hola","sent":""},{"id":"b","draft":"Hi","sent":"2026-10-25T10:00:00Z"},{"id":"c","draft":"","sent":""}],
        "linkedin":{"date":"2026-10-26","items":[{"name":"Ana","sent":true},{"name":"Leo","sent":false},{"name":"Eva","sent":false}]},
        "commands":{"pending":1,"items":[{"action":"approve","label":"Approve ana@uni.edu (W1)","status":"pending"},{"action":"upload","label":"Upload W1's approved leads","status":"done"}]}}""")

    @Test fun opensOnTheLatestWeekWithLeadsStillToUpload() {
        val weeks = Marketing.weeks(sync)
        assertEquals(listOf("W1", "W2"), weeks.map { it.week })
        assertEquals("W1", Marketing.openWeek(weeks, null)?.week)
        assertEquals("W2", Marketing.openWeek(weeks, "W2")?.week)
        assertNull(Marketing.openWeek(emptyList(), null))
    }

    @Test fun waitingOnlyCountsPendingCommandsForThatKey() {
        assertTrue(Marketing.waiting(sync, "approve", "ana@uni.edu"))
        assertFalse(Marketing.waiting(sync, "approve", "leo@uni.edu"))
        assertFalse(Marketing.waiting(sync, "upload", "W1"))
    }

    @Test fun repliesToAnswerHaveADraftAndNoAnswer() {
        assertEquals(listOf("a"), Marketing.repliesToAnswer(sync).map { it["id"].toString().trim('"') })
    }

    @Test fun countdownsAreSoonestFirstAndDropPastDates() {
        val mk = json("""{"campaigns":{"firstStart":"2026-11-10"}}""")
        val plan = json("""{"end":"2027-01-20","next":{"label":"first 50 emails","date":"2026-11-03"},"deadlines":[{"label":"Instantly trial ends","date":"2026-11-01"},{"label":"old","date":"2026-10-01"}]}""")
        val c = Marketing.countdowns(mk, plan, today)
        assertEquals(listOf("Instantly trial ends", "Next: first 50 emails", "First cold emails go out", "90-day plan ends"), c.map { it.label })
        assertEquals(15L, c[2].days)
        assertEquals("tomorrow", Marketing.inDays(1))
    }

    @Test fun widgetShowsTheFirstSendAndWhatWaits() {
        val snap = json("""{"external":{"marketing":{"ok":true,"campaigns":{"ok":true,"firstStart":"2026-11-10"}},"marketing-sync":$sync,
            "outreach":{"ok":true,"instantly":{"ok":true,"sent":0,"replies":0,"meetings":0}}}}""")
        val card = Home.marketing(snap, now, today)
        assertEquals("First emails in 15 days", card.headline)
        assertEquals(listOf("To upload" to "4 approved", "Replies" to "1 to answer", "LinkedIn" to "1 / 3 sent", "Sent" to "0 · 0 replies · 0 meetings", "Mac sync" to "2 min ago"),
            card.lines.map { it.label to it.value })
        assertEquals("alert", card.lines[1].level)
        val empty = Home.marketing(json("""{"external":{}}"""), now, today)
        assertNull(empty.headline)
        assertTrue(empty.lines.isEmpty())
    }
}
