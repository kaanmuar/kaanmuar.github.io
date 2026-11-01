package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Calls
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CallsTest {
    private fun calls(json: String): JsonObject = JSON.parseToJsonElement(json).jsonObject

    @Test
    fun rowsReadTheSnapshotsCallsSource() {
        val rows = Calls.rows(calls("""{"ok":true,"connected":true,"upcoming":[
            {"start":"2026-11-03T15:00:00.000Z","name":"Ana","label":"URL Review report walkthrough","minutes":30,"lang":"es","email":"ana@example.com","host":"example.com","note":"","meet":"https://meet.google.com/abc-defg-hij"},
            {"start":"2026-11-04T20:15:00.000Z","name":"Ben","label":"Call about a role","minutes":30,"lang":"en","email":"ben@example.com","meet":""}
        ]}"""))
        assertEquals(2, rows.size)
        assertEquals("Tue Nov 3, 10:00 AM · Ana", rows[0].title)
        assertEquals("URL Review report walkthrough (30 min, es) · ana@example.com · example.com", rows[0].detail)
        assertEquals("https://meet.google.com/abc-defg-hij", rows[0].meet)
        assertNull(rows[1].meet)
    }

    @Test
    fun noCallsSourceMeansNoRows() {
        assertEquals(0, Calls.rows(null).size)
        assertEquals("—", Calls.whenText(null))
    }
}
