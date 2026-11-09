package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Geo
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    private val co = json("""{"cc":"CO","name":"Colombia","sent":200,"bounced":10,"replies":8,"replyRate":4.0,"prospects":40,"swept":30,"social":2,"visits":3,"visitors":5,"reviewed":10,"gaps":["low-reply"]}""")
    private val ao = json("""{"cc":"AO","name":"Angola","sent":0,"prospects":0,"replyRate":null,"gaps":["silent"],"target":true}""")

    @Test fun valuesMatchTheWebTab() {
        assertEquals(260.0, Geo.value(co, "activity")!!, 0.0)
        assertEquals(5.0, Geo.value(co, "bounceRate")!!, 0.0)
        assertEquals(75.0, Geo.value(co, "saturation")!!, 0.0)
        assertEquals(1.0, Geo.value(co, "gaps")!!, 0.0)
        assertNull(Geo.value(ao, "replyRate"))
        assertNull(Geo.value(ao, "bounceRate"))
        assertEquals("4%", Geo.show(4.0, "replyRate"))
        assertEquals("$9", Geo.show(9.0, "usd"))
    }

    @Test fun channelsKeepTheirMetricsAndMissingZones() {
        assertTrue(Geo.metricsFor("email").all { it.channel == "email" || it.key == "gaps" })
        assertEquals(Geo.METRICS.size, Geo.metricsFor("all").size)
    }

    @Test fun shadesByMetricAndColoursGaps() {
        val sent = Geo.fills(listOf(co, ao), "sent")
        assertEquals(setOf("CO"), sent.keys)
        assertEquals(1f, sent.getValue("CO").alpha, 0.01f)
        val gaps = Geo.fills(listOf(co, ao), "gaps")
        assertEquals(Geo.GAPS.getValue("low-reply").second, gaps["CO"])
        assertEquals(Geo.GAPS.getValue("silent").second, gaps["AO"])
        assertEquals(listOf("CO"), Geo.ranked(listOf(ao, co), "sent").map { it["cc"].toString().trim('"') })
    }

    @Test fun datesAheadShadesTheSoonestBrightest() {
        val mx = json("""{"cc":"MX","name":"Mexico","daysToDate":5,"gaps":[]}""")
        val br = json("""{"cc":"BR","name":"Brazil","daysToDate":0,"gaps":[]}""")
        assertEquals(56.0, Geo.value(mx, "dates")!!, 0.0)
        assertNull(Geo.value(co, "dates"))
        assertEquals("in 5 days", Geo.show(Geo.value(mx, "dates"), "dates"))
        assertEquals("today", Geo.show(Geo.value(br, "dates"), "dates"))
        assertEquals(listOf("BR", "MX"), Geo.ranked(listOf(mx, co, br), "dates").map { it["cc"].toString().trim('"') })
        assertEquals(1f, Geo.fills(listOf(mx, br), "dates").getValue("BR").alpha, 0.01f)
    }

    private val cal = json("""{"ok":true,"days":[
        {"date":"2026-11-08","kind":"holiday","name":"Past","ccs":["MX"]},
        {"date":"2026-11-09","end":"2026-11-12","kind":"event","name":"Web Summit Lisbon","ccs":["PT"]},
        {"date":"2026-11-16","kind":"holiday","name":"Revolution Day","ccs":["MX"],"local":{"MX":"Día de la Revolución"},"after":{"MX":"2026-11-17"}},
        {"date":"2026-11-16","kind":"commerce","name":"Sale","ccs":["MX","CO"]}],
        "pauses":[{"cc":"MX","date":"2026-11-16","status":"planned"}]}""")

    @Test fun countryDatesCountFromTodayAndGroupByDate() {
        val today = java.time.LocalDate.parse("2026-11-10")
        val days = com.carlosandmunoz.jarvis.ui.CountryDates.days(cal, today)
        assertEquals(listOf("Web Summit Lisbon", "Revolution Day", "Sale"), days.map { it["name"].toString().trim('"') })
        assertEquals("Tue, Nov 10".length, com.carlosandmunoz.jarvis.ui.CountryDates.label("2026-11-10").length)
        assertEquals("Mon, Nov 9 to Thu, Nov 12 · on now", com.carlosandmunoz.jarvis.ui.CountryDates.whenText(days[0]))
        assertEquals("Mon, Nov 16 · in 6 days", com.carlosandmunoz.jarvis.ui.CountryDates.whenText(days[1]))
        assertEquals(listOf("2026-11-09", "2026-11-16"), com.carlosandmunoz.jarvis.ui.CountryDates.groups(days).map { it.first })
        assertEquals("planned", com.carlosandmunoz.jarvis.ui.CountryDates.pause(cal, "MX", "2026-11-16")!!["status"].toString().trim('"'))
        assertNull(com.carlosandmunoz.jarvis.ui.CountryDates.pause(cal, "CO", "2026-11-16"))
        assertEquals("calendar:pause:MX:2026-11-16", com.carlosandmunoz.jarvis.ui.CountryDates.key("pause", "MX", "2026-11-16"))
    }

    @Test fun onlyCampaignsWithHalfTheirLeadsThereAndSendingPause() {
        val camps = listOf(json("""{"id":"a","name":"A","share":62,"status":"active"}"""), json("""{"id":"b","name":"B","share":50,"status":"Running subsequences"}"""),
            json("""{"id":"c","name":"C","share":49,"status":"active"}"""), json("""{"id":"d","name":"D","share":90,"status":"paused"}"""))
        assertEquals(listOf("A", "B"), com.carlosandmunoz.jarvis.ui.CountryDates.held(camps).map { it["name"].toString().trim('"') })
    }

    @Test fun calendarSettingsMatchTheWebAndDefaultOff() {
        val none = com.carlosandmunoz.jarvis.ui.CalendarSettings.clean(null)
        assertEquals(com.carlosandmunoz.jarvis.ui.CalendarSettings(false, 14, 3), none)
        assertEquals(com.carlosandmunoz.jarvis.ui.CalendarSettings(true, 60, 60), com.carlosandmunoz.jarvis.ui.CalendarSettings.clean(json("""{"autoPause":true,"warnDays":90,"remindDays":99}""")))
        assertEquals("""{"autoPause":false,"warnDays":14,"remindDays":3}""", none.json().toString())
    }
}
