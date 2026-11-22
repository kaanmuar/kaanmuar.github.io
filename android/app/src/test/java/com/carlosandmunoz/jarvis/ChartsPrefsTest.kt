package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.ui.ChartPrefs
import com.carlosandmunoz.jarvis.ui.Layouts
import com.carlosandmunoz.jarvis.ui.PlateMath
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

    // #3978 / #4207: the 3×1 / 3×2 / 3×3 plate — phone 3×2, unfold 3×3; charts match on unfold.
    @Test fun plateStartsAt3x2OnAPhoneAnd3x3OnWideScreens() {
        assertEquals(2, Layouts.plateDefault(1))
        assertEquals(3, Layouts.plateDefault(2))
        assertEquals(3, Layouts.plateDefault(3))
        assertEquals(1, Layouts.plateScale(0))
        assertEquals(3, Layouts.plateScale(3))
        assertEquals(1, Layouts.chartDefault(1))
        assertEquals(3, Layouts.chartDefault(2))
    }

    @Test fun plateCyclesBetweenOneTwoAndThreeAndChartsBetweenOneAndThree() {
        assertEquals(1, Layouts.nextStretch(3, Layouts.PLATE_MAX))
        assertEquals(2, Layouts.nextStretch(1, Layouts.PLATE_MAX))
        assertEquals(3, Layouts.nextStretch(2, Layouts.PLATE_MAX))
        assertEquals(2, Layouts.nextStretch(1, 3))
        assertEquals(1, Layouts.nextStretch(3, 3))
    }

    @Test fun chartsThatFixTheirHeightStretchToo() {
        val p = ChartPrefs.Prefs(height = "m")
        assertEquals(80, ChartPrefs.plot(p, 80, 1))
        assertEquals(116, ChartPrefs.plot(p, 80, 2))
        assertEquals(130, ChartPrefs.plot(p, null, 1))
        assertEquals(48, ChartPrefs.scaled(48, 1))
    }

    @Test fun mapTapIsGivenAsAFractionOfTheVisibleStrip() {
        assertEquals(0.5f, PlateMath.viewFraction(300f, 0, 600f, 1), 0.001f)
        assertEquals(0.25f, PlateMath.viewFraction(450f, 300, 1200f, 2), 0.001f)
        assertEquals(1f, PlateMath.viewFraction(1900f, 0, 1200f, 2), 0.001f)
    }
}
