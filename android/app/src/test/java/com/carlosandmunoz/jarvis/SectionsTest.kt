package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.Sections
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SectionsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    private val kept = json("""{
        "cachedAt":"2026-11-01T15:00:00.000Z",
        "window":{"start":"2026-10-31T15:00:00.000Z","end":"2026-11-01T15:00:00.000Z","days":1,"prior":{"start":"2026-10-30T15:00:00.000Z","end":"2026-10-31T15:00:00.000Z"}},
        "products":{"review":{"kpis":[]}},
        "goals":[{"label":"Sales"}],
        "briefHidden":[{"key":"a"}],
        "connections":[{"key":"jobs","state":"live","at":"2026-11-01T14:58:00.000Z"},{"key":"gone","state":"off"}],
        "external":{"jobs":{"ok":true,"state":"ENABLED","cachedAt":"2026-11-01T14:58:00.000Z"},"money":{"ok":true,"usd":120,"cachedAt":"2026-11-01T14:50:00.000Z"}},
        "versions":{"products":{"v":"p1","at":"x"},"goals":{"v":"g1","at":"x"},"processes":{"v":"j1","at":"x"},"money":{"v":"m1","at":"x"},"briefing":{"v":"b1","at":"x"}}
    }""")

    private val answer = json("""{
        "delta":true,"days":1,"cachedAt":"2026-11-01T15:06:00.000Z",
        "versions":{"products":{"v":"p1","at":"y"},"goals":{"v":"g2","at":"y"},"processes":{"v":"j2","at":"y"},"money":{"v":"m1","at":"y"},"briefing":{"v":"b2","at":"y"}},
        "sections":{"goals":{"goals":[{"label":"Sales"},{"label":"Reviews"}]},"processes":{"external":{"jobs":{"ok":true,"state":"RUNNING"},"github-work":null}},"briefing":{"briefHidden":null}},
        "checked":{"jobs":"2026-11-01T15:06:00.000Z","money":"2026-11-01T15:05:00.000Z"}
    }""")

    @Test fun sendsTheSavedVersionsAsSince() {
        assertEquals(json("""{"products":"p1","goals":"g1","processes":"j1","money":"m1","briefing":"b1"}"""), Sections.since(kept))
        assertNull(Sections.since(null))
        assertNull(Sections.since(json("""{"products":{}}""")))
    }

    @Test fun replacesChangedFieldsAndMergesSourcesBySection() {
        val out = Sections.apply(kept, answer)!!
        assertEquals(2, out.objs("goals").size)
        assertEquals("RUNNING", out.obj("external").obj("jobs").str("state"))
        assertEquals("120", out.obj("external").obj("money")!!["usd"].toString())
        assertFalse("a null field is dropped", "briefHidden" in out)
        assertFalse("a null source is dropped", "github-work" in out.obj("external")!!)
        assertEquals(kept["products"], out["products"])
        assertEquals("2026-11-01T15:06:00.000Z", out.str("cachedAt"))
        assertEquals("g2", out.obj("versions").obj("goals").str("v"))
        assertEquals("p1", out.obj("versions").obj("products").str("v"))
    }

    @Test fun takesCheckedTimesFromTheAnswerEvenWhenASectionWasNotResent() {
        val out = Sections.apply(kept, answer)!!
        assertEquals("2026-11-01T15:05:00.000Z", out.obj("external").obj("money").str("cachedAt"))
        assertEquals("2026-11-01T15:06:00.000Z", out.obj("external").obj("jobs").str("cachedAt"))
        assertEquals("2026-11-01T15:06:00.000Z", out.objs("connections")[0].str("at"))
        assertNull(out.objs("connections")[1].str("at"))
    }

    @Test fun movesTheWindowWithTheBuildTimeWhenProductsKeptTheirVersion() {
        val w = Sections.apply(kept, answer)!!.obj("window")!!
        assertEquals("2026-10-31T15:06:00.000Z", w.str("start"))
        assertEquals("2026-11-01T15:06:00.000Z", w.str("end"))
        assertEquals("2026-10-31T15:06:00.000Z", w.obj("prior").str("end"))
        val resent = json(answer.toString().replace("\"sections\":{", "\"sections\":{\"products\":{\"window\":{\"end\":\"new\"}},"))
        assertEquals("new", Sections.apply(kept, resent)!!.obj("window").str("end"))
    }

    @Test fun keepsSavedVersionsForSectionsAnOnlyFetchLeftOut() {
        val only = json("""{"delta":true,"cachedAt":"2026-11-01T15:00:00.000Z","versions":{"goals":{"v":"g3","at":"z"}},"sections":{"goals":{"goals":[]}}}""")
        val out = Sections.apply(kept, only)!!
        assertEquals("g3", out.obj("versions").obj("goals").str("v"))
        assertEquals("j1", out.obj("versions").obj("processes").str("v"))
        assertEquals(kept["window"], out["window"])
    }

    @Test fun refusesWhatItCannotApplySoTheAppFetchesItAll() {
        assertNull(Sections.apply(null, answer))
        assertNull(Sections.apply(kept, json("""{"ok":true,"products":{}}""")))
        assertNull(Sections.apply(kept, json("""{"delta":true,"sections":{}}""")))
        assertNull(Sections.apply(kept, json("""{"delta":true,"versions":{}}""")))
    }

    private fun resource(name: String) = json(javaClass.classLoader!!.getResource("sections/$name")!!.readText())

    /** kept.json and answer.json come from the server's own snapshot build; applied.json is what applySections in
        js/admin-jarvis-core.js makes of them, so the app and the web keep the same snapshot. */
    @Test fun appliesADeltaExactlyAsTheWebDoes() {
        assertEquals(resource("applied.json"), Sections.apply(resource("kept.json"), resource("answer.json")))
    }

    private fun push(versions: String, sections: String = "processes", days: String = "1") = mapOf("kind" to "sections", "days" to days, "sections" to sections, "versions" to versions)

    @Test fun aPushOnTheSameRangeFetchesOnlyTheVersionsNotHeld() {
        assertEquals(emptyList<String>(), Sections.toFetch(push("""{"goals":"g1","processes":"j1"}"""), kept, 1))
        assertEquals(listOf("processes"), Sections.toFetch(push("""{"goals":"g1","processes":"j9"}"""), kept, 1))
        assertEquals(listOf("goals", "processes"), Sections.toFetch(push("""{"goals":"g1","processes":"j1"}""", "goals,processes"), null, 1))
    }

    @Test fun aPushOnAnotherRangeFetchesTheSectionsItNames() {
        assertEquals(listOf("goals", "approvals"), Sections.toFetch(push("""{"goals":"g1"}""", "goals,approvals"), kept, 7))
    }

    @Test fun anUnreadablePushFetchesTheSectionsItNames() {
        assertEquals(listOf("processes"), Sections.toFetch(push("not json"), kept, 1))
        assertTrue(Sections.toFetch(push("not json", ""), kept, 1).isEmpty())
    }
}
