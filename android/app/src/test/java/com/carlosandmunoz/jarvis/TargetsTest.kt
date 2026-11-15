package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Targets
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TargetsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun saysTheVerdictAndThePaceItNeeds() {
        assertEquals("Behind · 3.4 a week to go", Targets.verdict(json("""{"status":"behind","perWeek":3.4}""")))
        assertEquals("On pace · 1 a week to go · nothing logged in 14 days", Targets.verdict(json("""{"status":"on-pace","perWeek":1,"stale":true}""")))
        assertEquals("Done", Targets.verdict(json("""{"status":"done","perWeek":0}""")))
        assertEquals("Missed", Targets.verdict(json("""{"status":"missed"}""")))
    }

    @Test fun buildsEachActionsBody() {
        assertEquals(mapOf("action" to "log", "key" to "talks", "note" to "UNAL lecture"), Targets.body("log", "talks", " UNAL lecture "))
        assertEquals(mapOf("action" to "log", "key" to "links", "url" to "https://uni.edu/p", "note" to "Uni"), Targets.body("log", "links", "https://uni.edu/p", "Uni"))
        assertNull(Targets.body("log", "links", " "))
        assertEquals(mapOf("action" to "correct", "key" to "unlocks", "value" to 7), Targets.body("correct", "unlocks", "7"))
        assertNull(Targets.body("correct", "unlocks", "seven"))
        assertEquals(mapOf("action" to "done", "key" to "contracts", "proof" to "signed"), Targets.body("done", "contracts", "signed"))
        assertEquals(mapOf("action" to "recheck", "key" to "links"), Targets.body("recheck", "links"))
    }

    @Test fun toastSaysWhetherALoggedLinkCounts() {
        assertEquals("Links: logged. Links to qalabreview.com.", Targets.toast(json("""{"label":"Links: logged","check":{"ok":true,"detail":"Links to qalabreview.com."}}""")))
        assertEquals("Links: logged. Not counted yet: The page answered 404.", Targets.toast(json("""{"label":"Links: logged","check":{"ok":false,"detail":"The page answered 404."}}""")))
        assertEquals("Calls: set to 3.", Targets.toast(json("""{"label":"Calls: set to 3"}""")))
    }
}
