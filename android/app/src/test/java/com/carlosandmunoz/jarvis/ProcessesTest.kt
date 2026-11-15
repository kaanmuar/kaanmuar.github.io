package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.Processes
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.home.Watch
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class ProcessesTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    private val p = json("""{"rows":[
        {"id":"mac:engagement","kind":"mac-agent","name":"Engagement browser","state":"waiting","needsYou":true,"step":"Sign in to LinkedIn","startedAt":"2026-11-09T05:00:00Z","updatedAt":"2026-11-09T05:10:00Z"},
        {"id":"gh:1","kind":"deploy","name":"Pages","state":"running","startedAt":"2026-11-09T05:00:00Z","updatedAt":"2026-11-09T05:00:00Z","progress":0.4},
        {"id":"job:opsWatchdog","kind":"job","name":"Daily system review","state":"done","startedAt":"2026-11-09T04:00:00Z","endedAt":"2026-11-09T04:03:12Z","updatedAt":"2026-11-09T04:03:12Z"}
    ],"running":1,"waiting":1,"needsYou":1,"at":"2026-11-09T05:10:00Z"}""")
    private val now = Instant.parse("2026-11-09T05:12:05Z").toEpochMilli()

    @Test fun splitsActiveFromRecentAndSaysWhatNeedsYou() {
        assertEquals(listOf("mac:engagement", "gh:1"), Processes.active(p).map { it.str("id") })
        assertEquals(listOf("job:opsWatchdog"), Processes.recent(p).map { it.str("id") })
        assertEquals("1 running · 1 needs you", Processes.summary(p))
        assertNull(Processes.summary(json("""{"rows":[]}""")))
        assertNull(Processes.summary(null))
    }

    @Test fun clocksTickForActiveRowsAndFinishedOnesSayWhen() {
        val rows = Processes.rows(p)
        assertEquals("12m 05s", Processes.clock(rows[1], now))
        assertEquals("1h 08m ago", Processes.clock(rows[2], now))
        assertEquals("took 3m 12s", Processes.took(rows[2]))
        assertNull(Processes.took(rows[1]))
        assertEquals("42s", Processes.elapsed(42_000))
        assertEquals("2d 3h", Processes.elapsed((2 * 86400 + 3 * 3600) * 1000L))
    }

    @Test fun aPushPutsTheSectionAndItsVersionIntoTheSnapshot() {
        val snap = json("""{"readiness":90,"versions":{"goals":{"v":"g"},"processes":{"v":"old"}}}""")
        val out = Processes.patch(snap, p, json("""{"v":"new","at":"2026-11-09T05:10:00Z"}"""))
        assertEquals("new", out.obj("versions").obj("processes").str("v"))
        assertEquals("g", out.obj("versions").obj("goals").str("v"))
        assertEquals(3, Processes.rows(out.obj("processes")).size)
    }

    @Test fun theWatchGetsRunningAndNeedsYouCounts() {
        val s = Watch.summary(json("""{"briefing":[]}""").let { Processes.patch(it, p) }, null, 0L)
        assertEquals(1, s.running)
        assertEquals(1, s.needsYou)
    }
}
