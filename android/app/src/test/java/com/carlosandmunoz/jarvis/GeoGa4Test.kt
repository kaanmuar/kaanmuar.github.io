package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.Geo
import com.carlosandmunoz.jarvis.ui.GeoGa4
import com.carlosandmunoz.jarvis.ui.GeoTime
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** #3282: GA4 visitors, engaged sessions and key events per country on the Map, as js/admin-jarvis-geo-ga4.js. */
class GeoGa4Test {
    private fun obj(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun changeIsAWholePercentAndNullWithoutABase() {
        assertEquals(125, GeoGa4.change(900.0, 400.0))
        assertEquals(-50, GeoGa4.change(5.0, 10.0))
        assertNull(GeoGa4.change(5.0, 0.0))
        assertNull(GeoGa4.change(null, 3.0))
    }

    @Test fun theSheetShowsVisitorsEngagedSessionsAndKeyEventsAgainstBefore() {
        val k = GeoGa4.kpis(obj("""{"cc":"US","visitors":900,"visitorsPrior":400,"engaged":300,"engagedPrior":0,"engagementRate":33.3,"keyEvents":null,"keyEventsPrior":null}"""))
        assertEquals(listOf("Visitors (GA4)", "Engaged sessions · rate", "Key events"), k.map { it.label })
        assertEquals("900", k[0].value)
        assertEquals("+125% vs 400", k[0].delta)
        assertEquals(1, k[0].dir)
        assertEquals("300 · 33.3%", k[1].value)
        assertEquals("new", k[1].delta)
        assertEquals("—", k[2].value)
        assertNull(k[2].delta)
        val quiet = GeoGa4.kpis(obj("""{"cc":"MX","visitors":0,"visitorsPrior":0,"engaged":0,"engagedPrior":0,"engagementRate":null,"keyEvents":0,"keyEventsPrior":2}"""))
        assertEquals("0", quiet[1].value)
        assertEquals("-100% vs 2", quiet[2].delta)
        assertEquals(-1, quiet[2].dir)
    }

    @Test fun thePickerAndTheHistoryCarryTheNewMetrics() {
        val web = Geo.metricsFor("web").map { it.key }
        assertTrue(web.containsAll(listOf("visitors", "engaged", "keyEvents")))
        assertEquals("Visitors (GA4)", Geo.metric("visitors").label)
        val r = obj("""{"cc":"JP","engaged":30,"keyEvents":2}""")
        assertEquals(30.0, Geo.value(r, "engaged")!!, 0.0)
        assertEquals(listOf("JP"), Geo.ranked(listOf(r, obj("""{"cc":"MX","keyEvents":0}""")), "keyEvents").map { it.str("cc") })
        val g = obj("""{"countries":[{"cc":"JP","name":"Japan"}],"time":{"ranges":{"7":{"c":{"JP":{"visitors":[40,10],"engaged":[30,5],"keyEvents":[2,null]}}}}}}""")
        val now = GeoTime.spanRows(g, 7, 0).first { it.str("cc") == "JP" }
        assertEquals(30.0, now.num("engaged")!!, 0.0)
        assertEquals(2.0, GeoTime.valueOf(now, "keyEvents")!!, 0.0)
        assertNull(GeoTime.valueOf(GeoTime.spanRows(g, 7, 1).first { it.str("cc") == "JP" }, "keyEvents"))
        assertTrue(GeoTime.canShow(g.get("time") as JsonObject, "engaged"))
    }
}
