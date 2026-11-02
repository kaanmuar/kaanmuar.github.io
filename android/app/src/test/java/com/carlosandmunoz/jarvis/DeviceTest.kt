package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.device.Device
import com.carlosandmunoz.jarvis.device.Form
import com.carlosandmunoz.jarvis.device.Hinge
import com.carlosandmunoz.jarvis.device.Kind
import com.carlosandmunoz.jarvis.device.Posture
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceTest {
    private val flat = Hinge(vertical = true, halfOpen = false, left = 416f, top = 0f, right = 416f, bottom = 750f)
    private val book = flat.copy(halfOpen = true)
    private val table = Hinge(vertical = false, halfOpen = true, left = 0f, top = 375f, right = 832f, bottom = 375f)

    @Test fun tellsTheFoldsApart() {
        assertEquals(Kind.FoldableFolded to null, Device.classify(foldable = true, hinge = null, displaySmallestDp = 412, desktop = false))
        assertEquals(Kind.FoldableOpen to Posture.Flat, Device.classify(true, flat, 750, false))
        assertEquals(Kind.FoldableOpen to Posture.Book, Device.classify(true, book, 750, false))
        assertEquals(Kind.FoldableOpen to Posture.Tabletop, Device.classify(true, table, 750, false))
        assertEquals(Kind.FoldableOpen to Posture.Flat, Device.classify(true, null, 750, false))
    }

    @Test fun tellsPhonesTabletsAndDesktopsApart() {
        assertEquals(Kind.Phone to null, Device.classify(false, null, 411, false))
        assertEquals(Kind.Tablet to null, Device.classify(false, null, 800, false))
        assertEquals(Kind.Desktop to null, Device.classify(true, flat, 750, desktop = true))
    }

    @Test fun phonesKeepTheDockAndAskAsAPage() {
        val f = Form(Kind.FoldableFolded, null, 412, 900)
        assertFalse(f.rail)
        assertFalse(f.askBeside)
        assertEquals(1, Device.columns(412))
    }

    @Test fun anOpenFoldGetsTheRailTwoColumnsAndAskRightOfTheFold() {
        val f = Form(Kind.FoldableOpen, Posture.Flat, 832, 750, hinge = flat)
        assertTrue(f.rail)
        assertTrue(f.askBeside)
        assertFalse(f.askOpen)
        assertEquals(416, f.askWidthDp)
        assertEquals(2, Device.columns(832 - 90))
    }

    @Test fun bookPostureOpensAskAndTabletopPutsItBelowTheFold() {
        assertTrue(Form(Kind.FoldableOpen, Posture.Book, 832, 750, hinge = book).askOpen)
        val t = Form(Kind.FoldableOpen, Posture.Tabletop, 832, 750, hinge = table)
        assertTrue(t.tabletop)
        assertTrue(t.rail)
        assertFalse(t.askBeside)
        assertTrue("a narrow flip in tabletop still moves the dock to the rail", Form(Kind.FoldableOpen, Posture.Tabletop, 400, 700, hinge = table).rail)
    }

    @Test fun wideWindowsKeepAskOpenBesideTwoColumns() {
        val dex = Form(Kind.Desktop, null, 1600, 900, dex = true)
        assertTrue(dex.askOpen)
        assertEquals(400, dex.askWidthDp)
        assertEquals(3, Device.columns(1600 - 90 - 400 + 10))
    }

    @Test fun labelsAndSendsTheSameFieldsAsTheWeb() {
        val f = Form(Kind.FoldableOpen, Posture.Tabletop, 832, 750, "Galaxy Z Fold8 Ultra", "SM-F976U", hinge = table)
        assertEquals("Foldable, open · tabletop · 832×750 dp", f.label)
        assertEquals("Desktop · Samsung DeX · 1920×1080 dp", Form(Kind.Desktop, null, 1920, 1080, dex = true).label)
        val j = f.json("install-1")
        assertEquals("foldable-open", j["kind"]!!.jsonPrimitive.content)
        assertEquals("tabletop", j["posture"]!!.jsonPrimitive.content)
        assertEquals("android", j["app"]!!.jsonPrimitive.content)
        assertEquals("install-1", j["id"]!!.jsonPrimitive.content)
        assertNull(Form().json("x")["posture"])
    }
}
