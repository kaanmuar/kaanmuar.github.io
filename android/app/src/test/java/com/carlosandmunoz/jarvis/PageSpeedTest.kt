package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.askFor
import com.carlosandmunoz.jarvis.ui.pageSpeedLow
import com.carlosandmunoz.jarvis.ui.pageSpeedPath
import com.carlosandmunoz.jarvis.ui.pageSpeedPr
import com.carlosandmunoz.jarvis.ui.pageSpeedScores
import com.carlosandmunoz.jarvis.ui.pageSpeedWorstFirst
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.util.Locale

class PageSpeedTest {
    @Before fun locale() = Locale.setDefault(Locale.US)

    private val pages = JSON.parseToJsonElement("""[
        {"url":"https://carlosandmunoz.com/","mobile":{"score":85},"desktop":{"score":91}},
        {"url":"https://carlosandmunoz.com/qa-review.html","mobile":{"score":63},"desktop":{"score":53}},
        {"url":"https://carlosandmunoz.com/qa-lab.html","mobile":{"score":78},"desktop":{"error":"timed out"}},
        {"url":"https://carlosandmunoz.com/social/x.html","mobile":{"error":"500"},"desktop":{"error":"500"}}
    ]""").jsonArray.map { it.jsonObject }

    @Test fun worstFirstByTheLowerModeAndUnscoredLast() {
        assertEquals(listOf("/qa-review.html", "/qa-lab.html", "/", "/social/x.html"), pageSpeedWorstFirst(pages).map { pageSpeedPath(it.str("url")) })
        assertEquals(53.0, pageSpeedLow(pages[1]), 0.0)
        assertEquals(101.0, pageSpeedLow(pages[3]), 0.0)
    }

    @Test fun scoresShowADashForAModeThatDidNotAnswer() {
        assertEquals("mobile 78 · desktop —", pageSpeedScores(pages[2]))
        assertEquals("mobile 85 · desktop 91", pageSpeedScores(pages[0]))
        assertEquals("/", pageSpeedPath("https://carlosandmunoz.com"))
    }

    @Test fun proposalKeysCarryThePr() {
        assertEquals(2012, pageSpeedPr("pagespeed:pr:2012"))
        assertNull(pageSpeedPr("pagespeed:slow"))
        assertNull(pageSpeedPr("pagespeed:countdown:12"))
        assertEquals("merge PageSpeed fixes #12 into main now (it goes to production)", askFor("pagespeed-merge", null, null as JsonObject?, 12))
        assertEquals("close PageSpeed fixes #12 without merging", askFor("pagespeed-close", null, null, 12))
    }
}
