package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Countdowns
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class CountdownsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun theActionsOpWinsAndTheSnapshotFillsInWithoutIt() {
        val view = json("""{"countdowns":{"pending":[{"id":"a1","label":"Re-run failed CI jobs","target":"Pages"}],"recent":[]}}""")
        val snap = json("""{"countdowns":{"pending":[{"id":"b2"},{"id":"c3"}],"recent":[]}}""")
        assertEquals(listOf("a1"), Countdowns.pending(view, snap).map { it["id"].toString().trim('"') })
        assertEquals(2, Countdowns.pending(null, snap).size)
        assertEquals(0, Countdowns.pending(null, null).size)
    }

    @Test fun hoursReadAsHoursOrMinutes() {
        assertEquals("2 h", Countdowns.hoursText(2.0))
        assertEquals("1.5 h", Countdowns.hoursText(1.5))
        assertEquals("30 min", Countdowns.hoursText(0.5))
    }

    @Test fun aRowSaysWhatWhatKindWhoPickedItAndWhy() {
        val r = json("""{"id":"d4","label":"Run a job again","target":"run-job:sendOwnerNotices","kind":"email","kindLabel":"third-party email","by":"gemini","confidence":0.92,"status":"running","why":"Its last run failed."}""")
        assertEquals("Run a job again: run-job:sendOwnerNotices", Countdowns.title(r))
        assertEquals("third-party email · Gemini 0.92 · running now · Its last run failed.", Countdowns.detail(r))
        val held = json("""{"label":"Post the queues now","target":"queues","kind":"post","by":"jarvis","status":"running","hold":"Email and posts wait for 08:00-21:00 Bogotá."}""")
        assertEquals("post · running now · Email and posts wait for 08:00-21:00 Bogotá.", Countdowns.detail(held))
    }
}
