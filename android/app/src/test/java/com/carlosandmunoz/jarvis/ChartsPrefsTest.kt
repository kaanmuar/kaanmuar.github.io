package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.ui.ChartPrefs
import com.carlosandmunoz.jarvis.ui.Layouts
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class ChartsPrefsTest {
    @Test fun chartPrefsDefaultAndClean() {
        assertEquals(ChartPrefs.Prefs(), ChartPrefs.clean(null))
        assertEquals(ChartPrefs.Prefs("off", false, "l"), ChartPrefs.clean(JsonObject(mapOf("grid" to JsonPrimitive("off"), "fill" to JsonPrimitive(false), "height" to JsonPrimitive("l")))))
    }

    @Test fun plotHeightScalesWithStretch() {
        val p = ChartPrefs.Prefs(height = "m")
        assertEquals(130, ChartPrefs.baseHeight(p, 1))
        assertEquals(188, ChartPrefs.baseHeight(p, 2))
        assertEquals(260, ChartPrefs.baseHeight(p, 3))
    }

    @Test fun layoutStretchRoundTrips() {
        val saved = Layouts.Saved(order = listOf("github-ci"), hidden = emptyList(), stretch = mapOf("github-ci" to 2))
        val kept = Layouts.keep(saved, listOf("github-ci"), emptyList(), listOf("github-ci"))
        assertEquals(2, kept.stretch["github-ci"])
    }
}