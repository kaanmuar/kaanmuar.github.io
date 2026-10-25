package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.at
import com.carlosandmunoz.jarvis.data.bytes
import com.carlosandmunoz.jarvis.data.doubles
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.pairs
import com.carlosandmunoz.jarvis.data.pct
import com.carlosandmunoz.jarvis.data.text
import com.carlosandmunoz.jarvis.ui.delta
import com.carlosandmunoz.jarvis.ui.dirOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test
import java.util.Locale

class FormatTest {
    @Before fun locale() = Locale.setDefault(Locale.US)

    @Test fun numbers() {
        assertEquals("1,234", fmt(1234.0))
        assertEquals("12.5", fmt(12.5))
        assertEquals("—", fmt(null))
        assertEquals("1.5 KB", bytes(1536.0))
        assertEquals("42.0%", pct(0.42))
        assertEquals("42.0%", pct(42.0))
    }

    @Test fun deltasMatchThePage() {
        assertEquals("+100%", delta(4.0, 2.0))
        assertEquals("-50%", delta(1.0, 2.0))
        assertEquals("new", delta(3.0, 0.0))
        assertEquals("±0", delta(0.0, 0.0))
        assertEquals(1, dirOf("new"))
        assertEquals(-1, dirOf("-5%"))
    }

    @Test fun snapshotShapes() {
        val snap = JSON.parseToJsonElement("""{"products":{"cv":{"series":{"values":[1,2,3]},"lists":{"sources":[{"label":"google","value":5}]},"kpis":[{"label":"Visits","value":"9 USD"}]}},"external":{"money":{"ok":false}}}""")
        assertEquals(listOf(1.0, 2.0, 3.0), snap.at("products", "cv", "series", "values").doubles())
        assertEquals(listOf("google" to 5.0), snap.at("products", "cv", "lists").pairs("sources"))
        assertEquals("9 USD", snap.at("products", "cv", "kpis").let { (it as kotlinx.serialization.json.JsonArray)[0] }.at("value").text())
        assertFalse(snap.at("external", "money").isOk())
    }
}
