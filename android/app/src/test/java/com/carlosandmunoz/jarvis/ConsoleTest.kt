package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.CHIPS
import com.carlosandmunoz.jarvis.ui.Console
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class ConsoleTest {
    private fun line(id: String, at: String, source: String, level: String, text: String, ref: String? = null) =
        JSON.parseToJsonElement("""{"id":"$id","at":"$at","source":"$source","level":"$level","text":"$text"${ref?.let { ",\"ref\":\"$it\"" } ?: ""}}""") as JsonObject

    private val rows = listOf(
        line("4", "2026-11-09T04:00:04Z", "actions", "error", "E2E #881 failure in 7m02s on main"),
        line("3", "2026-11-09T04:00:03Z", "gemini", "info", "Gemini ok in 2140 ms: Write the briefing"),
        line("2", "2026-11-09T04:00:02Z", "board", "info", "#2810 moved Next → Dev", "kaanmuar.github.io#2810"),
        line("1", "2026-11-09T04:00:01Z", "function", "warn", "jarvisWatch: mail retry failed"),
        line("0", "2026-11-09T04:00:00Z", "actions", "debug", "Pages #12 started on main")
    )
    private fun ids(list: List<JsonObject>) = list.map { it.str("id") }

    @Test fun filtersBySourceLevelAndEveryWordLikeTheWeb() {
        assertEquals(listOf("4", "3", "2", "1", "0"), ids(Console.filter(rows, emptySet(), "debug", "")))
        assertEquals(listOf("4", "0"), ids(Console.filter(rows, setOf("actions"), "debug", "")))
        assertEquals(listOf("4", "3", "2", "1"), ids(Console.filter(rows, emptySet(), "info", "")))
        assertEquals(listOf("4", "1"), ids(Console.filter(rows, emptySet(), "warn", "")))
        assertEquals(listOf("4"), ids(Console.filter(rows, setOf("actions", "board"), "error", "")))
        assertEquals(listOf("3"), ids(Console.filter(rows, emptySet(), "debug", "GEMINI  briefing")))
        assertEquals(listOf("2"), ids(Console.filter(rows, emptySet(), "debug", "kaanmuar.github.io#2810")))
        assertEquals(emptyList<String?>(), ids(Console.filter(rows, setOf("push"), "debug", "")))
        assertEquals(listOf("jarvis", "function", "actions", "mac", "board", "github", "gemini", "push", "countdown"), Console.SOURCES)
    }

    @Test fun mergeKeepsEachLineOnceNewestFirstAndCapped() {
        val first = Console.merge(emptyList(), rows.drop(2))
        assertEquals(listOf("2", "1", "0"), ids(first))
        val next = Console.merge(first, listOf(rows[0], rows[2], rows[1], rows[0]))
        assertEquals(listOf("4", "3", "2", "1", "0"), ids(next))
        assertSame(next, Console.merge(next, listOf(rows[3])))
        assertEquals(listOf("4", "3"), ids(Console.merge(next, listOf(line("9", "2026-11-09T03:00:00Z", "push", "info", "old")), keep = 2)))
    }

    @Test fun timesAreBogotaAndNameTheDayWhenNotToday() {
        val now = java.time.Instant.parse("2026-11-09T04:30:00Z").toEpochMilli()
        assertEquals("23:00:04", Console.time("2026-11-09T04:00:04Z", now))
        assertEquals("Nov 7 18:00:00", Console.time("2026-11-07T23:00:00Z", now))
        assertEquals("", Console.time("nope", now))
        assertTrue(CHIPS.any { it.first == "console" && it.second == "Console" })
    }
}
