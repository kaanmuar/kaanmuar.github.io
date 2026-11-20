package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.home.MapData
import com.carlosandmunoz.jarvis.home.MapData.Layout
import com.carlosandmunoz.jarvis.home.MapKind
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The map home-screen widgets (#3977): which size class draws what, and the numbers each map shows from the snapshot. */
class MapWidgetsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    private val snap = json("""{"external":{
        "checks":{"ok":true,"map":{"ranges":{
            "live":{"total":40,"countries":[{"cc":"US","count":30,"share":75},{"cc":"CN","count":10,"share":25}]},
            "7d":{"total":300,"countries":[{"cc":"RU","count":300,"share":100}]}},
          "botnetNow":{"online":12},"events":[{"source":"bleepingcomputer.com","countries":["US"]}]},
          "exposure":{"totals":{"directReports":2},"direct":[{"country":"US","host":"acme.com"}]}},
        "geo":{"ok":true,"totals":{"sent":200,"avgReply":4.0,"prospects":40,"missing":3},"countries":[
            {"cc":"CO","name":"Colombia","sent":200,"replies":8,"replyRate":4.0,"prospects":40,"visitors":50,"clicks":7,"social":2,"usd":9,"light":4},
            {"cc":"US","name":"United States","sent":10,"replies":0,"prospects":5,"visitors":500,"clicks":1,"social":0,"usd":0,"light":2}]}}}""")

    @Test fun sizeClassesFollowTheLauncherGrid() {
        assertEquals(Layout.COMPACT, MapData.layout(150f, 150f))
        assertEquals(Layout.SIDE, MapData.layout(300f, 115f))
        assertEquals(Layout.STACK, MapData.layout(300f, 190f))
        assertEquals(Layout.FULL, MapData.layout(300f, 270f))
        assertEquals(Layout.WIDE, MapData.layout(400f, 190f))
        assertEquals(Layout.SIDE, MapData.layout(400f, 115f))
        assertEquals(Layout.FULL, MapData.layout(400f, 330f))
    }

    @Test fun theChipCyclesThroughTheModesAndWraps() {
        assertEquals("live", MapData.mode(MapKind.CYBER, null))
        assertEquals("live", MapData.mode(MapKind.CYBER, "bogus"))
        assertEquals("7d", MapData.next(MapKind.CYBER, null))
        assertEquals("live", MapData.next(MapKind.CYBER, "90d"))
        assertEquals("replies", MapData.next(MapKind.OUTREACH, "light"))
        assertEquals("visitors", MapData.next(MapKind.MARKETING, "activity"))
    }

    @Test fun cyberMapShadesCitedCountriesAndPinsExposedOnes() {
        val live = MapData.view(MapKind.CYBER, snap, null)!!
        assertEquals(setOf("US", "CN"), live.fills.keys)
        assertEquals(setOf("US"), live.pins)
        assertEquals("40", live.stats[0].value)
        assertEquals("2", live.stats[2].value)
        assertTrue(live.stats[2].alert)
        assertEquals("12", live.stats[3].value)
        assertTrue(live.lines[0].alert)
        assertEquals("bleepingcomputer.com · US", live.headline)
        val week = MapData.view(MapKind.CYBER, snap, "7d")!!
        assertEquals(setOf("RU"), week.fills.keys)
        assertEquals("7 days", week.modeLabel)
    }

    @Test fun cyberMapWaitsForTheFeed() {
        assertNull(MapData.view(MapKind.CYBER, json("""{"external":{"checks":{"ok":true,"map":{"ranges":{}}}}}"""), null))
        assertNull(MapData.view(MapKind.CYBER, json("""{"external":{}}"""), null))
    }

    @Test fun outreachMapShowsLightAndTheTotals() {
        val v = MapData.view(MapKind.OUTREACH, snap, null)!!
        assertEquals("Light", v.modeLabel)
        assertEquals(setOf("CO", "US"), v.fills.keys)
        assertEquals("200", v.stats[0].value)
        assertEquals("4%", v.stats[1].value)
        assertTrue(v.stats[3].alert)
        assertEquals("Bright", v.lines[0].value)
        assertEquals("200", MapData.view(MapKind.OUTREACH, snap, "sent")!!.lines[0].value)
    }

    @Test fun marketingMapSumsVisitorsAndRanksByTheChosenMetric() {
        val v = MapData.view(MapKind.MARKETING, snap, null)!!
        assertEquals(listOf("550", "8", "2", "$9"), v.stats.map { it.value })
        assertTrue(v.lines[0].label.endsWith("USA"))
        assertEquals("500", v.lines[0].value)
        val usd = MapData.view(MapKind.MARKETING, snap, "usd")!!
        assertEquals(1, usd.lines.size)
        assertEquals("$9", usd.lines[0].value)
    }

    @Test fun geoMapsNeedTheGeoSource() {
        assertNull(MapData.view(MapKind.OUTREACH, json("""{"external":{"geo":{"ok":false}}}"""), null))
    }
}
