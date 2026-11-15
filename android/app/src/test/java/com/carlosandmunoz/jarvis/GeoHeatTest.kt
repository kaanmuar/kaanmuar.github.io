package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.GeoHeat
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoHeatTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    // Colombia: Mon-Fri 10:00-18:00 local, three replies on Tuesday 10:00 (one positive) and one on Wednesday 9:00.
    private val heat = json("""{"zones":{"CO":"America/Bogota"},"multi":[],"countries":{"CO":{"r":[[1,10,3,1],[2,9,1,0]],"s":[[0,8,4]],"w":"${"003fc0".repeat(5)}000000000000"}},"all":{"r":[[1,10,5,1]],"s":[]},"replies":4,"sends":4,"unzoned":0}""")

    @Test fun levelsMatchTheWebShading() {
        assertEquals(0, GeoHeat.levelOf(0.0, 10.0))
        assertEquals(0, GeoHeat.levelOf(null, 10.0))
        assertEquals(0, GeoHeat.levelOf(3.0, 0.0))
        assertEquals(1, GeoHeat.levelOf(0.1, 10.0))
        assertEquals(3, GeoHeat.levelOf(2.5, 10.0))
        assertEquals(5, GeoHeat.levelOf(10.0, 10.0))
    }

    @Test fun readsTheWindowMask() {
        val w = heat.let { GeoHeat.view(it, "CO", "replies").window }
        assertFalse(GeoHeat.windowOn(w, 0, 9))
        assertTrue(GeoHeat.windowOn(w, 0, 10))
        assertTrue(GeoHeat.windowOn(w, 4, 17))
        assertFalse(GeoHeat.windowOn(w, 4, 18))
        assertFalse(GeoHeat.windowOn(w, 5, 12))
        assertFalse(GeoHeat.windowOn("", 0, 10))
    }

    @Test fun aCountryShowsItsCellsWindowAndBusiestHour() {
        val v = GeoHeat.view(heat, "CO", "replies")
        assertEquals(168, v.grid.size)
        assertEquals(4, v.total)
        assertEquals(3, v.max)
        assertEquals(1 * 24 + 10, v.best)
        assertEquals(3, v.inWindow)
        assertEquals("America/Bogota", v.zone)
        assertEquals("Tue 10:00–11:00: 3 replies, 1 positive · sending window", GeoHeat.tip(v, 34, "replies"))
        assertEquals(4, GeoHeat.view(heat, "CO", "sends").total)
        val all = GeoHeat.view(heat, null, "replies")
        assertEquals(5, all.total)
        assertNull(all.inWindow)
        assertEquals("", all.zone)
    }

    @Test fun sectorCellsAndTheirMetric() {
        val row = json("""{"cc":"CO","name":"Colombia","p":[5,0],"s":[20,4],"r":[1,0]}""")
        assertEquals(5.0, GeoHeat.sectorValue(row, 0, "prospects")!!, 0.0)
        assertEquals(20.0, GeoHeat.sectorValue(row, 0, "sent")!!, 0.0)
        assertEquals(5.0, GeoHeat.sectorValue(row, 0, "replyRate")!!, 0.0)
        assertEquals(0.0, GeoHeat.sectorValue(row, 1, "replyRate")!!, 0.0)
        assertNull(GeoHeat.sectorValue(json("""{"p":[1],"s":[0],"r":[0]}"""), 0, "replyRate"))
        assertEquals("No sector", GeoHeat.sectorLabel("?"))
        assertEquals("TVET", GeoHeat.sectorLabel("tvet"))
        assertEquals("University", GeoHeat.sectorLabel("university"))
        assertEquals("sent", GeoHeat.metric(null, "email"))
        assertEquals("prospects", GeoHeat.metric(null, "all"))
        assertEquals("replyRate", GeoHeat.metric("replyRate", "email"))
        assertTrue(GeoHeat.timed("email") && !GeoHeat.timed("social"))
    }
}
