package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.GeoTime
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** #3109: the Map's ranges against the span before and the week player, as js/admin-jarvis-geo-time.js. */
class GeoTimeTest {
    private val g = JSON.parseToJsonElement("""{
      "countries": [{"cc":"CO","name":"Colombia","target":true,"sent":264},{"cc":"BR","name":"Brazil","target":true,"sent":180},{"cc":"AO","name":"Angola","target":true}],
      "time": {"to":"2026-11-08",
        "ranges": {
          "7": {"from":"2026-11-02","to":"2026-11-08","prevFrom":"2026-10-26","prevTo":"2026-11-01","days":7,"prevDays":7,
                "c": {"CO":{"sent":[269.4,251],"replies":[9.43,8.8],"opened":[113,104],"positive":[2,null]},"BR":{"sent":[13,19],"prospects":[30,28]},"PE":{"sent":[20,0]}}},
          "30": {"from":"2026-10-10","to":"2026-11-08","prevFrom":"2026-09-10","prevTo":"2026-10-09","days":30,"prevDays":0,"c":{"CO":{"sent":[1000,null]}}}
        },
        "weeks": {"start":["2026-10-19","2026-10-26","2026-11-02"],"days":[0,7,7],"c":{"BR":{"sent":[null,19,13]},"CO":{"sent":[null,251,269]}}}
      }}""") as JsonObject
    private fun row(rows: List<JsonObject>, cc: String) = rows.first { it.str("cc") == cc }

    @Test fun rangeRowsCarryTodaysNamesAndRoundedNumbers() {
        val now = GeoTime.spanRows(g, 7, 0)
        assertEquals(setOf("CO", "BR", "AO", "PE"), now.map { it.str("cc") }.toSet())
        assertEquals(269.0, row(now, "CO").num("sent")!!, 0.0)
        assertEquals(9.0, row(now, "CO").num("replies")!!, 0.0)
        assertEquals(3.3, row(now, "CO").num("replyRate")!!, 0.0)
        assertEquals("Peru", row(now, "PE").str("name"))
        assertEquals(5.0, row(now, "CO").num("light")!!, 0.0)
        assertNull(GeoTime.valueOf(row(now, "AO"), "sent"))
        assertNull(GeoTime.valueOf(row(GeoTime.spanRows(g, 7, 1), "CO"), "positive"))
    }

    @Test fun theViewComparesWithTheSpanBeforeAndShadesTheChange() {
        val v = GeoTime.view(g, 7, null, true, "sent")
        assertEquals("span", v.mode)
        assertEquals("Nov 2 – Nov 8 against Oct 26 – Nov 1", v.label)
        assertEquals(18.0, v.delta!!["CO"]!!, 0.0)
        assertEquals(-6.0, v.delta!!["BR"]!!, 0.0)
        assertNull(v.delta!!["AO"])
        assertEquals(GeoTime.UP.copy(alpha = 1f), v.fills!!["PE"]!!.copy(alpha = 1f))
        assertEquals(GeoTime.DOWN.copy(alpha = 1f), v.fills!!["BR"]!!.copy(alpha = 1f))
        assertFalse("AO" in v.fills!!)
        assertNull(GeoTime.view(g, 7, null, false, "sent").fills)
        assertEquals("The 30 days before are not recorded yet, so there is no change to show.", GeoTime.view(g, 30, null, false, "sent").note)
        assertEquals("now", GeoTime.view(g, 7, null, false, "campaigns").mode)
        assertTrue(GeoTime.view(g, 7, null, false, "campaigns").note.startsWith("Campaigns has no history"))
        assertEquals("now", GeoTime.view(g, 0, null, false, "sent").mode)
        val empty = JSON.parseToJsonElement("""{"countries":[]}""") as JsonObject
        assertTrue(GeoTime.view(empty, 7, null, false, "sent").note.startsWith("No history yet"))
    }

    @Test fun weeksPlayOneAtATimeAgainstTheWeekBefore() {
        assertEquals(3, GeoTime.weeks(g))
        val v = GeoTime.view(g, 0, 2, false, "sent")
        assertEquals("week", v.mode)
        assertEquals("Week of Nov 2 – Nov 8", v.label)
        assertEquals(-6.0, v.delta!!["BR"]!!, 0.0)
        assertEquals("Nothing recorded that week.", GeoTime.view(g, 0, 0, false, "sent").note)
        assertNull(GeoTime.view(g, 0, 0, false, "sent").delta)
        assertEquals(2, GeoTime.view(g, 0, 9, false, "sent").week)
    }

    @Test fun arrowsMatchTheWeb() {
        assertEquals("▲ +18", GeoTime.arrow(18.0, "sent"))
        assertEquals("▼ −6", GeoTime.arrow(-6.0, "sent"))
        assertEquals("▲ +0.5 pts", GeoTime.arrow(0.5, "replyRate"))
        assertEquals("▲ +$9", GeoTime.arrow(9.0, "usd"))
        assertEquals("= 0", GeoTime.arrow(0.0, "sent"))
        assertEquals("—", GeoTime.arrow(null, "sent"))
        assertEquals(GeoTime.DOWN, GeoTime.arrowColor(1.0, "bounceRate"))
        assertFalse(GeoTime.canShow(g["time"] as JsonObject, "bounceRate"))
        assertTrue(GeoTime.canShow(g["time"] as JsonObject, "light"))
    }
}
