package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Geo
import kotlinx.serialization.json.JsonObject
import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    @Test fun lightsMatchTheServer() {
        assertEquals(listOf("Dark", "Spark", "Ember", "Lit", "Bright", "Blazing"), Geo.LIGHTS.map { it.name })
        assertEquals(0, Geo.lightOf(json("{}")))
        assertEquals(1, Geo.lightOf(json("""{"prospects":3}""")))
        assertEquals(2, Geo.lightOf(json("""{"prospects":3,"sent":10}""")))
        assertEquals(2, Geo.lightOf(json("""{"social":1}""")))
        assertEquals(3, Geo.lightOf(json("""{"social":1,"socialApproved":1}""")))
        assertEquals(3, Geo.lightOf(json("""{"visitors":30}""")))
        assertEquals(4, Geo.lightOf(json("""{"sent":10,"replies":1}""")))
        assertEquals(5, Geo.lightOf(json("""{"usd":9}""")))
        assertEquals(4, Geo.lightOf(co))
        assertEquals(2, Geo.light(json("""{"light":2,"replies":5}""")))
        assertEquals("Bright", Geo.show(Geo.value(co, "light"), "light"))
        assertEquals("light", Geo.METRICS[0].key)
        assertEquals(setOf("CO"), Geo.fills(listOf(co, ao), "light").keys)
        assertEquals(Geo.LIGHTS[4].color, Geo.fills(listOf(co, ao), "light")["CO"])
    }

    @Test fun shortNamesAndFlags() {
        assertEquals("DR Congo", Geo.shortName("CD", "Congo - Kinshasa"))
        assertEquals("USA", Geo.shortName("US", "United States"))
        assertEquals("UK", Geo.shortName("GB", "United Kingdom"))
        assertEquals("Myanmar", Geo.shortName("MM", "Myanmar (Burma)"))
        assertEquals("Hong Kong", Geo.shortName("HK", "Hong Kong SAR China"))
        assertEquals("Colombia", Geo.shortName("CO", "Colombia"))
        assertEquals("\uD83C\uDDE8\uD83C\uDDF4", Geo.flagOf("CO"))
        assertEquals("", Geo.flagOf("x"))
        assertEquals(Geo.Box(506f, 121f, 515f, 127f), Geo.mainBox("M515,123L515,125L510,126L506,122L512,121L514,127ZM900,10L990,10L990,90L900,90Z", Offset(511f, 124f)))
    }

    @Test fun labelsTheLitCountriesWithoutOverlaps() {
        val world = Geo.World(1000f, 500f, emptyMap(), mapOf("CO" to Offset(296f, 275f), "EC" to Offset(290f, 280f), "AO" to Offset(530f, 330f), "BR" to Offset(340f, 320f)),
            mapOf("CO" to Geo.Box(280f, 247f, 313f, 301f), "EC" to Geo.Box(285f, 276f, 295f, 285f), "AO" to Geo.Box(515f, 310f, 545f, 350f), "BR" to Geo.Box(300f, 270f, 390f, 370f)))
        val ec = json("""{"cc":"EC","name":"Ecuador","prospects":2}""")
        val br = json("""{"cc":"BR","name":"Brazil","sent":10}""")
        val all = Geo.labels(listOf(co, ao, ec, br), world, null, 8f, 13f)
        assertEquals(listOf("CO", "BR", "EC"), all.map { it.cc })
        assertTrue(all.first().inside)
        assertFalse(all.first { it.cc == "EC" }.inside)
        all.forEachIndexed { i, a -> all.drop(i + 1).forEach { b -> assertFalse("${a.cc} overlaps ${b.cc}", box(a).hits(box(b))) } }
        assertEquals("AO", Geo.labels(listOf(co, ao), world, "AO", 8f, 13f).first().cc)
    }

    private fun box(l: Geo.Label): Geo.Box {
        val w = l.text.length * l.size * 0.56f
        val x0 = when (l.anchor) { 1 -> l.x; -1 -> l.x - w; else -> l.x - w / 2 }
        return Geo.Box(x0, l.y - l.size * 0.55f, x0 + w, l.y + l.size * 0.55f)
    }
}
