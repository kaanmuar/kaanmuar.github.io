package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Layouts
import com.carlosandmunoz.jarvis.ui.Layouts.Saved
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The same cases as the web's applyLayout tests in tests/unit/admin-jarvis.test.js. */
class LayoutsTest {
    private val ids = listOf("a", "b", "c", "d")

    @Test fun slugsMatchTheWeb() {
        assertEquals("failing-runs", Layouts.slug("Failing runs · 3"))
        assertEquals("open-bugs-by-area", Layouts.slug("Open bugs by area (12)"))
        assertEquals("google-maps-local-businesses", Layouts.slug("Google Maps: local businesses"))
        assertEquals("panel", Layouts.slug("· ·"))
    }

    @Test fun noLayoutIsTheDefault() {
        val l = Layouts.apply(ids, null)
        assertEquals(ids, l.all)
        assertEquals(ids, l.order)
        assertEquals(emptyList<String>(), l.hidden)
    }

    @Test fun savedOrderWinsAndNewPanelsKeepTheirDefaultPlace() {
        assertEquals(listOf("c", "d", "a", "b"), Layouts.apply(ids, Saved(listOf("c", "a", "b"))).all)
        assertEquals(listOf("d", "a", "b", "c"), Layouts.apply(ids, Saved(listOf("d", "a"))).all)
        assertEquals(listOf("b", "c", "d", "a"), Layouts.apply(ids, Saved(listOf("gone", "b", "a", "web-id"))).all)
    }

    @Test fun hiddenPanelsLeaveTheOrderAndUnknownIdsAreIgnored() {
        val l = Layouts.apply(ids, Saved(listOf("b", "a"), listOf("a", "web-only", "bad id!")))
        assertEquals(listOf("b", "c", "d", "a"), l.all)
        assertEquals(listOf("b", "c", "d"), l.order)
        assertEquals(listOf("a"), l.hidden)
    }

    @Test fun moveStepsPastShownPanelsOnly() {
        assertEquals(listOf("b", "a", "c", "d"), Layouts.move(ids, emptyList(), "b", -1))
        assertEquals(listOf("b", "a", "c", "d"), Layouts.move(ids, listOf("c"), "a", 1))
        assertEquals(ids, Layouts.move(ids, emptyList(), "a", -1))
        assertEquals(ids, Layouts.move(ids, emptyList(), "d", 1))
        assertEquals(ids, Layouts.move(ids, emptyList(), "zz", 1))
    }

    @Test fun keepHoldsTheOtherSidesIds() {
        val prev = Saved(listOf("web-x", "b", "web-y", "a"), listOf("web-z", "a"))
        val next = Layouts.keep(prev, listOf("a", "b", "c"), listOf("c"), listOf("a", "b", "c"))
        assertEquals(listOf("web-x", "a", "b", "web-y", "c"), next.order)
        assertEquals(listOf("web-z", "c"), next.hidden)
        assertEquals(listOf("a", "b", "c"), Layouts.apply(listOf("a", "b", "c"), next).all)
    }

    @Test fun readsAndPatchesTheSnapshot() {
        val snap = JSON.parseToJsonElement("""{"settings":{"goals":[],"layout":{"github":{"order":["x","y",3],"hidden":["y"]}}}}""") as JsonObject
        assertEquals(Saved(listOf("x", "y"), listOf("y")), Layouts.read(snap, "github"))
        assertNull(Layouts.read(snap, "overview"))
        val moved = Layouts.patch(snap, "overview", Saved(listOf("briefing")))
        assertEquals(Saved(listOf("briefing")), Layouts.read(moved, "overview"))
        assertEquals(Saved(listOf("x", "y"), listOf("y")), Layouts.read(moved, "github"))
        assertNull(Layouts.read(Layouts.patch(moved, "github", null), "github"))
        assertEquals(JsonNull, Layouts.json(null))
    }
}
