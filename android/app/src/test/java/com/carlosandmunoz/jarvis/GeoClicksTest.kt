package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Geo
import com.carlosandmunoz.jarvis.ui.GeoClicks
import com.carlosandmunoz.jarvis.ui.GeoTime
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoClicksTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    private val br = json("""{"cc":"BR","name":"Brazil","clicks":12,"clicksPrior":5,"prospectClicks":4,"clickKinds":{"outreach":8,"social":3,"channel":1},
        "visitorVisits":9,"visitorReviews":3,"visitorPaid":1,"visitorUsd":19,"visits":4,"reviews":1,"paid":0,"usd":0}""")

    @Test fun theSheetSetsVisitorsFromACountryAgainstItsProspects() {
        val rows = GeoClicks.rows(br)!!
        assertEquals(listOf("Short-link clicks", "Review page opens", "Reviews", "Paid unlocks", "Revenue (USD)"), rows.map { it.label })
        assertEquals(12.0, rows[0].visitors, 0.0)
        assertEquals(4.0, rows[0].prospects, 0.0)
        assertEquals(19.0, rows[4].visitors, 0.0)
        assertTrue(rows[4].usd)
        assertNull(GeoClicks.rows(json("""{"cc":"CO","clicks":0}""")))
        assertNull(GeoClicks.rows(null))
    }

    @Test fun kindsAndChangeReadLikeTheWeb() {
        assertEquals("outreach email 8, social replies 3, channels 1", GeoClicks.kindsText(br["clickKinds"] as JsonObject))
        assertEquals("", GeoClicks.kindsText(null))
        assertEquals("+7 on the span before", GeoClicks.changeText(br))
        assertEquals("−2 on the span before", GeoClicks.changeText(json("""{"clicks":1,"clicksPrior":3}""")))
        assertEquals("same as the span before", GeoClicks.changeText(json("""{"clicks":2,"clicksPrior":2}""")))
        assertEquals("", GeoClicks.changeText(json("{}")))
    }

    @Test fun theMapNoteNamesTheTotalsAndUnknownCountries() {
        assertEquals("15 short-link clicks, 5 the span before; 2 with no country. Bots and link previews are left out.",
            GeoClicks.note(json("""{"totals":{"clicks":15,"clicksPrior":5,"clicksUnknown":2}}""")))
        assertEquals("3 short-link clicks. Bots and link previews are left out.", GeoClicks.note(json("""{"totals":{"clicks":3,"clicksPrior":null}}""")))
        assertEquals("", GeoClicks.note(json("""{"totals":{}}""")))
    }

    @Test fun clicksAreAWebMetricThatLightsACountryAndPlaysOverTime() {
        assertTrue(Geo.metricsFor("web").any { it.key == "clicks" })
        assertEquals(3, Geo.lightOf(json("""{"clicks":1}""")))
        assertEquals(12.0, Geo.value(br, "clicks"))
        assertEquals(17, GeoTime.FIELDS.indexOf("clicks"))
    }
}
