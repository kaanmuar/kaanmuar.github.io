package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.ActionSettings
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ActionSettingsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    private val saved = json("""{"mail":{"digest":true},"goals":[],"actions":{"auto":true,"caps":{"rerun-held":10,"ai-fix":3},"confidence":0.8,"countdownHours":2}}""")

    @Test fun capsAndConfidenceChangeAndEverythingElseKeepsItsValue() {
        val next = ActionSettings.with(saved, caps = mapOf("ai-fix" to 5), confidence = 0.9)
        assertEquals(json("""{"mail":{"digest":true},"goals":[],"actions":{"auto":true,"caps":{"rerun-held":10,"ai-fix":5},"confidence":0.9,"countdownHours":2}}"""), next)
    }

    @Test fun theSwitchAndTheCountdownSaveAlone() {
        assertEquals(json("""{"auto":false,"caps":{"rerun-held":10,"ai-fix":3},"confidence":0.8,"countdownHours":2}"""), ActionSettings.with(saved, auto = false)["actions"])
        assertEquals(json("""{"auto":true,"caps":{"rerun-held":10,"ai-fix":3},"confidence":0.8,"countdownHours":0.5}"""), ActionSettings.with(saved, countdownHours = 0.5)["actions"])
    }

    @Test fun settingsWithoutActionsGetThem() {
        assertEquals(json("""{"caps":{"merge-pr":1},"confidence":0.75}"""), ActionSettings.with(json("{}"), caps = mapOf("merge-pr" to 1), confidence = 0.75)["actions"])
    }

    @Test fun capsAndConfidenceStayInTheServersRanges() {
        assertEquals(100, ActionSettings.cap("250"))
        assertEquals(0, ActionSettings.cap("0"))
        assertNull(ActionSettings.cap(""))
        assertEquals(0.85, ActionSettings.confidence(0.8649), 0.0)
        assertEquals(0.5, ActionSettings.confidence(0.2), 0.0)
        assertEquals(1.0, ActionSettings.confidence(1.4), 0.0)
    }
}
