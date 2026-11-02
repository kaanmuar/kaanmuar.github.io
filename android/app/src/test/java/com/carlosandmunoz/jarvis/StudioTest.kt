package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.studioModes
import com.carlosandmunoz.jarvis.ui.studioNames
import com.carlosandmunoz.jarvis.ui.studioRequest
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class StudioTest {
    private val studio = JSON.parseToJsonElement("""{"sources":["compare","evergreen"],"skits":[{"id":"friday-release","takes":["en","es"]},{"id":"new-skit","takes":[]}],"runs":[]}""").jsonObject

    @Test
    fun namesListSourcesOrSkitsWithTheirTakes() {
        assertEquals(listOf("compare" to "compare", "evergreen" to "evergreen"), studioNames(studio, "tips"))
        assertEquals(listOf("friday-release" to "friday-release (en, es)", "new-skit" to "new-skit (no takes yet)"), studioNames(studio, "skit"))
        assertEquals(emptyList<Pair<String, String>>(), studioNames(null, "tips"))
    }

    @Test
    fun aSkitCannotBeReVoiced() {
        assertEquals(listOf("render", "rotate", "captions"), studioModes("tips").map { it.first })
        assertEquals(listOf("render", "captions"), studioModes("skit").map { it.first })
    }

    @Test
    fun theRequestDropsBlanksAndSendsPicksAsTheKindTakesThem() {
        assertEquals(mapOf("kind" to "tips", "name" to "evergreen", "mode" to "render", "tips" to "hsts,csp"),
            studioRequest("tips", "evergreen", "render", " ", "hsts,csp ", ""))
        assertEquals(mapOf("kind" to "skit", "name" to "friday-release", "mode" to "render", "start" to "2026-11-03", "langs" to "en", "ticket" to "1981"),
            studioRequest("skit", "friday-release", "render", "2026-11-03", "en", "#1981"))
    }
}
