package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.home.WatchPayload
import com.carlosandmunoz.jarvis.home.WatchPayloadSerializer
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class WatchPayloadTest {
    @Test fun roundTripsStatus() = runBlocking {
        val original = WatchPayload(
            readiness = 92.0, alerts = 1, warns = 1, headline = "1 alert · 1 warning",
            revenue = "$184", sales = 3, top = "Checkout is down", at = 7L,
            running = 2, needsYou = 1, sent = 99L,
        )
        val bytes = ByteArrayOutputStream().also { WatchPayloadSerializer.writeTo(original, it) }.toByteArray()
        val back = WatchPayloadSerializer.readFrom(ByteArrayInputStream(bytes))
        assertEquals(92.0, back.readiness)
        assertEquals(1, back.alerts)
        assertEquals(1, back.warns)
        assertEquals("$184", back.revenue)
        assertEquals(3, back.sales)
        assertEquals("Checkout is down", back.top)
        assertEquals(7L, back.at)
        assertEquals(2, back.running)
        assertEquals(1, back.needsYou)
        assertEquals(99L, back.sent)
    }

    @Test fun roundTripsEmpty() = runBlocking {
        val bytes = ByteArrayOutputStream().also {
            WatchPayloadSerializer.writeTo(WatchPayload(empty = true, sent = 1L), it)
        }.toByteArray()
        val back = WatchPayloadSerializer.readFrom(ByteArrayInputStream(bytes))
        assertTrue(back.empty)
        assertNull(back.readiness)
    }

    @Test fun treatsPreHorologistDataMapBytesAsEmpty() = runBlocking {
        val back = WatchPayloadSerializer.readFrom(ByteArrayInputStream(byteArrayOf(0x08, 0x01, 0x12, 0x03)))
        assertTrue(back.empty)
        assertNull(back.readiness)
    }
}
