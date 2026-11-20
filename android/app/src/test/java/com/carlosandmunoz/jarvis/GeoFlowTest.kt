package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.GeoFlow
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Map tab's campaign timeline and channel flow (#3114), as js/admin-jarvis-geo-flow.js draws them. */
class GeoFlowTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    private val tl = json("""{"today":"2026-11-09","from":"2026-10-01","to":"2026-12-07","rows":[
        {"id":"a","name":"W1 B-es Americas","lang":"es","region":"Americas","status":"active","raw":"active","start":"2026-10-20","end":"","ccs":["CO","MX"],"pauses":[]},
        {"id":"b","name":"W1 E-pt Brazil","lang":"pt","region":"Brazil","status":"paused","raw":"paused","start":"2026-10-27","end":"2026-11-05","endBy":"update","ccs":["BR"],"pauses":[]},
        {"id":"c","name":"W2 B-es Americas","lang":"es","region":"Americas","status":"scheduled","raw":"active","start":"2026-11-16","end":"2026-11-16","ccs":["CO"],"pauses":[]},
        {"id":"f","name":"W0 A-en US","lang":"en","region":"US","status":"paused","raw":"bounce protect","start":"2026-10-05","end":"","ccs":["US"],"pauses":[]},
        {"id":"d","name":"W2 E-pt Brazil","lang":"pt","region":"Brazil","status":"draft","raw":"draft","start":"","end":"","ccs":[],"pauses":[]}],
        "markers":[{"date":"2026-11-15","name":"Proclamação","kind":"holiday","ccs":["BR"],"all":false},{"date":"2026-11-27","name":"Black Friday","kind":"commerce","ccs":[],"all":true}]}""")
    private val flow = json("""{"links":[["email","","prospect"],["email","prospect","sent"],["email","sent","opened"],["email","opened","replied"],["sweep","","prospect"],["social","","prospect"],["social","prospect","sent"],["web","","viewed"],["web","viewed","paid"]],
        "all":[55,70,32,4,58,2,1,4,1],"by":{"BR":[5,5,2,0,8,0,0,0,0]},"needs":["email why","sweep why","social why","web why"]}""")

    @Test fun followsThePickedCountry() {
        assertEquals(listOf("a", "c"), GeoFlow.rowsFor(tl, "CO").map { it.str("id") })
        assertEquals(5, GeoFlow.rowsFor(tl, null).size)
        assertEquals(listOf("Proclamação", "Black Friday"), GeoFlow.markersFor(tl, "BR").map { it.str("name") })
        assertEquals(listOf("Black Friday"), GeoFlow.markersFor(tl, "CO").map { it.str("name") })
    }

    @Test fun groupsByLanguageOrRegionAndLeavesUndatedOut() {
        val rows = GeoFlow.rowsFor(tl, null)
        assertEquals(listOf("Spanish · es", "Portuguese · pt", "English · en"), GeoFlow.groups(rows, "lang").map { it.label })
        assertEquals(listOf("Americas", "Brazil", "US"), GeoFlow.groups(rows, "region").map { it.label })
        assertEquals(4, GeoFlow.groups(rows, "lang").sumOf { it.rows.size })
    }

    @Test fun barsRunToTodayOrToWhenTheyStopped() {
        val by = GeoFlow.rowsFor(tl, null).associateBy { it.str("id") }
        assertEquals("2026-10-20" to "2026-11-09", GeoFlow.span(by.getValue("a"), "2026-11-09"))
        assertEquals("2026-10-27" to "2026-11-05", GeoFlow.span(by.getValue("b"), "2026-11-09"))
        assertEquals("2026-11-16" to "2026-11-16", GeoFlow.span(by.getValue("c"), "2026-11-09"))
        assertEquals("2026-10-05" to "2026-11-09", GeoFlow.span(by.getValue("f"), "2026-11-09"))
        assertNull(GeoFlow.span(by.getValue("d"), "2026-11-09"))
    }

    @Test fun weeksAreMondaysThinnedWhenCrowded() {
        val all = GeoFlow.weeks("2026-10-01", "2026-12-07", 1000f)
        assertEquals("2026-10-05", all.first())
        assertEquals(10, all.size)
        assertEquals(listOf("2026-10-05", "2026-11-02", "2026-11-30"), GeoFlow.weeks("2026-10-01", "2026-12-07", 120f))
    }

    @Test fun flowFollowsCountryAndChannelAndListsWhatIsLeftOut() {
        val all = GeoFlow.model(flow, null, "all")
        assertEquals(9, all.shown.size)
        val br = GeoFlow.model(flow, "BR", "all")
        assertEquals(4, br.shown.size)
        assertTrue(br.empty.any { GeoFlow.linkLabel(it) == "Social replies: start → prospect" })
        val email = GeoFlow.model(flow, "BR", "email")
        assertEquals(3, email.shown.size)
        assertEquals(listOf("Cold email: opened → replied"), email.empty.map(GeoFlow::linkLabel))
        assertEquals(listOf("email why"), GeoFlow.needs(flow, "email"))
        assertEquals(0, GeoFlow.model(flow, "PT", "all").shown.size)
    }

    @Test fun sankeyStacksBandsAndKeepsSmallOnesVisible() {
        val lay = GeoFlow.layout(GeoFlow.model(flow, null, "all").shown, 900f, 240f, 120f, 8f, 10f, 2f)
        val prospect = lay.nodes.getValue("st:prospect")
        assertEquals(115.0, prospect.inV, 0.0)
        assertTrue(prospect.h <= 240f + 2f)
        assertTrue(lay.bands.all { it.width >= 2f })
        val paid = lay.bands.first { it.link.to == "paid" }
        assertEquals(2f, paid.width, 0.01f)
        assertTrue(lay.nodes.getValue("ch:email").x < prospect.x)
        assertTrue(lay.nodes.getValue("st:paid").x > lay.nodes.getValue("st:viewed").x)
    }
}
