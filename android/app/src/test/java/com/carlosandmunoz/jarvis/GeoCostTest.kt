package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.Geo
import com.carlosandmunoz.jarvis.ui.GeoCost
import com.carlosandmunoz.jarvis.ui.GeoTime
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** #3283: the Map's cost and return, as js/admin-jarvis-geo-cost.js, from the geo source's `cost` (functions/jarvis-geo-cost.js). */
class GeoCostTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    // Fields per country: cost, costPerSent, costPerReply, costPerPositive, revenue, roi. AO had no replies, so its ratios are null.
    private val g = json("""{
      "countries": [
        {"cc":"CO","name":"Colombia","sent":264,"cost":12,"costPerSent":0.0455,"costPerReply":1.2,"costPerPositive":6,"revenue":18,"roi":1.5},
        {"cc":"BR","name":"Brazil","sent":180,"cost":8,"costPerSent":0.0444,"costPerReply":2.5,"costPerPositive":null,"revenue":0,"roi":0},
        {"cc":"AO","name":"Angola","sent":20,"cost":1,"costPerSent":0.05,"costPerReply":null,"costPerPositive":null,"revenue":0,"roi":0}],
      "time": {"to":"2026-11-08",
        "ranges": {"7": {"from":"2026-11-02","to":"2026-11-08","prevFrom":"2026-10-26","prevTo":"2026-11-01","days":7,"prevDays":7,
          "c": {"CO":{"sent":[269,251],"replies":[9,8]},"BR":{"sent":[13,19]}}}},
        "weeks": {"start":["2026-10-26","2026-11-02"],"days":[7,7],"c":{"CO":{"sent":[251,269]}}}},
      "cost": {"items":[{"label":"Email tool","usd":30,"channel":"email","from":"","to":""}],"monthly":{"email":30,"social":0,"links":0,"all":0},
        "basis":{"kind":"span","span":30,"from":"2026-10-10","to":"2026-11-08"},
        "now":{"from":"2026-10-10","to":"2026-11-08","days":30,"totals":{"cost":21,"unspread":0,"costPerReply":1.6,"channels":{"email":{"usd":21,"over":3}}},"c":{"CO":[12,0.0455,1.2,6,18,1.5]}},
        "ranges":{"7":[
          {"from":"2026-11-02","to":"2026-11-08","days":7,"totals":{"cost":7,"unspread":0},"c":{"CO":[6.5,0.0242,0.7222,null,0,0],"BR":[0.5,0.0385,null,null,0,0]}},
          {"from":"2026-10-26","to":"2026-11-01","days":7,"totals":{"cost":7,"unspread":0},"c":{"CO":[6,0.0239,0.75,null,0,0],"BR":[1,0.0526,null,null,0,0]}}]},
        "weeks":[{"c":{"CO":[7,0.0279,null,null,0,0]}},{"c":{"CO":[6.5,0.0242,0.7222,null,0,0]}}]}
    }""")
    private val rows = (g["countries"] as kotlinx.serialization.json.JsonArray).map { it as JsonObject }
    private fun row(list: List<JsonObject>, cc: String) = list.first { it.str("cc") == cc }

    @Test fun showsDollarsAndReturn() {
        assertEquals("$0", GeoCost.show(0.0, "cost"))
        assertEquals("$0.046", GeoCost.show(0.0455, "costPerSent"))
        assertEquals("$1,234.50", GeoCost.show(1234.5, "cost"))
        assertEquals("1.5×", GeoCost.show(1.5, "roi"))
        assertEquals("—", GeoCost.show(null, "costPerReply"))
        assertEquals("$1.20", Geo.show(1.2, "costPerReply"))
    }

    @Test fun ranksCheapestFirstAndSkipsCountriesWithNothingToDivideBy() {
        assertEquals(listOf("CO", "BR"), GeoCost.ranked(rows, "costPerReply").map { it.str("cc") })
        assertEquals(listOf("CO", "AO", "BR"), Geo.ranked(rows, "roi").map { it.str("cc") })
        assertEquals(listOf("CO", "BR", "AO"), Geo.ranked(rows, "cost").map { it.str("cc") })
        assertNull(Geo.value(row(rows, "AO"), "costPerReply"))
        assertEquals(0.0, Geo.value(row(rows, "AO"), "roi")!!, 0.0)
    }

    @Test fun colourGoesFromCheapGreenToCostlyPink() {
        val good = GeoCost.goodness(rows, "costPerReply")
        assertEquals(1.0, good["CO"]!!, 0.0)
        assertEquals(0.0, good["BR"]!!, 0.0)
        assertTrue("AO" !in good)
        assertEquals(GeoCost.GOOD, Geo.fills(rows, "costPerReply")["CO"])
        assertEquals(GeoCost.BAD, Geo.fills(rows, "costPerReply")["BR"])
        assertEquals(1.0, GeoCost.goodness(rows, "roi")["CO"]!!, 0.0)
        assertEquals(0.0, GeoCost.goodness(rows, "roi")["AO"]!!, 0.0)
    }

    @Test fun historyRowsCarryTheRangeAndWeekCosts() {
        val now = GeoTime.spanRows(g, 7, 0)
        val before = GeoTime.spanRows(g, 7, 1)
        assertEquals(6.5, row(now, "CO").num("cost")!!, 0.0)
        assertEquals(0.7222, row(now, "CO").num("costPerReply")!!, 0.0)
        assertNull(GeoTime.valueOf(row(now, "BR"), "costPerReply"))
        assertNull(GeoTime.valueOf(row(now, "AO"), "cost"))
        assertEquals(0.5, GeoTime.deltaOf(row(now, "CO"), row(before, "CO"), "cost")!!, 0.0)
        assertEquals(-0.0278, GeoTime.deltaOf(row(now, "CO"), row(before, "CO"), "costPerReply")!!, 0.0)
        assertEquals("▼ −$0.028", GeoTime.arrow(-0.0278, "costPerReply"))
        assertTrue(GeoTime.good(-0.0278, "costPerReply"))
        assertEquals(7.0, row(GeoTime.weekRows(g, 0), "CO").num("cost")!!, 0.0)
        val view = GeoTime.view(g, 7, null, false, "costPerReply")
        assertEquals(0.7222, row(view.rows, "CO").num("costPerReply")!!, 0.0)
    }

    @Test fun picksTheViewAndSaysWhatItCovers() {
        assertEquals(30.0, GeoCost.viewFor(g, "now", 0, null)!!.num("days")!!, 0.0)
        assertEquals("2026-11-02", GeoCost.viewFor(g, "span", 7, null)!!.str("from"))
        assertNull(GeoCost.viewFor(g, "span", 90, null))
        assertEquals("last 30 days, Oct 10 – Nov 8", GeoCost.basisText(g, "now", 0))
        assertEquals("last 7 days, Nov 2 – Nov 8", GeoCost.basisText(g, "span", 7))
        assertTrue(GeoCost.note(g, "now", 0, null, "").startsWith("Cost and return over the last 30 days"))
        val empty = json("""{"countries":[],"cost":{"items":[],"now":null}}""")
        assertEquals(GeoCost.NEEDS, GeoCost.note(empty, "now", 0, null, ""))
    }

    @Test fun legendExplainsAnEvenSpread() {
        val even = rows.map { JsonObject(it + ("costPerSent" to kotlinx.serialization.json.JsonPrimitive(0.05))) }
        val (ends, line) = GeoCost.legend(even, "costPerSent")
        assertNull(ends)
        assertTrue(line.contains("in each of 3 countries: email costs are spread by emails sent"))
        assertEquals(listOf("$1.20 cheapest", "$2.50 costliest"), GeoCost.legend(rows, "costPerReply").first)
    }

    @Test fun costGetsItsOwnChannelInThePicker() {
        assertTrue(Geo.CHANNELS.contains("cost" to "Cost and return"))
        assertEquals(listOf("cost", "costPerSent", "costPerReply", "costPerPositive", "roi", "gaps").sorted(), Geo.metricsFor("cost").map { it.key }.sorted())
        assertEquals("$", Geo.metric("costPerReply").unit)
    }

    @Test fun cleansTheTypedListLikeTheServer() {
        val ok = GeoCost.clean(listOf(GeoCost.Draft("  Email   tool ", "30,5", "email"), GeoCost.Draft(), GeoCost.Draft("Seats", "15", "nope", "2026-01", "2026-12")))
        assertNull(ok.error)
        assertEquals(2, ok.items.size)
        assertEquals("Email tool", ok.items[0].str("label"))
        assertEquals(30.5, ok.items[0].num("usd")!!, 0.0)
        assertEquals("all", ok.items[1].str("channel"))
        assertEquals("Cost 1 needs a name.", GeoCost.clean(listOf(GeoCost.Draft("", "9"))).error)
        assertEquals("Tool: give the USD a month, above 0.", GeoCost.clean(listOf(GeoCost.Draft("Tool", "0"))).error)
        assertEquals("Tool: months are YYYY-MM.", GeoCost.clean(listOf(GeoCost.Draft("Tool", "5", "email", "2026-13"))).error)
        assertEquals("Tool: the end month is before the start.", GeoCost.clean(listOf(GeoCost.Draft("Tool", "5", "email", "2026-05", "2026-02"))).error)
        assertEquals("At most 30 costs.", GeoCost.clean(List(31) { GeoCost.Draft("x", "1") }).error)
        assertEquals(listOf(GeoCost.Draft("Email tool", "30", "email")), GeoCost.draftsOf(listOf(json("""{"label":"Email tool","usd":30,"channel":"email","from":"","to":""}"""))))
    }
}
