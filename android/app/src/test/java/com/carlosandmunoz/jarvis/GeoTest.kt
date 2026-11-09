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
}
