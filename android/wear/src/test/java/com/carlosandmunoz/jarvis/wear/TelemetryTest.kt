package com.carlosandmunoz.jarvis.wear

import co.touchlab.kermit.Severity
import com.carlosandmunoz.jarvis.wear.telemetry.SentryLogWriter
import com.carlosandmunoz.jarvis.wear.telemetry.Telemetry
import io.sentry.SentryLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TelemetryTest {
    @Test fun sentryNeedsReleaseAndDsn() {
        assertTrue(Telemetry.sentryEnabled("https://key@o0.ingest.sentry.io/1", debug = false))
        assertFalse(Telemetry.sentryEnabled("https://key@o0.ingest.sentry.io/1", debug = true))
        assertFalse(Telemetry.sentryEnabled("", debug = false))
        assertFalse(Telemetry.sentryEnabled("  ", debug = false))
    }

    @Test fun severityMapsToSentryLevel() {
        assertEquals(SentryLevel.DEBUG, Telemetry.level(Severity.Verbose))
        assertEquals(SentryLevel.INFO, Telemetry.level(Severity.Info))
        assertEquals(SentryLevel.WARNING, Telemetry.level(Severity.Warn))
        assertEquals(SentryLevel.ERROR, Telemetry.level(Severity.Error))
        assertEquals(SentryLevel.FATAL, Telemetry.level(Severity.Assert))
    }

    @Test fun debugLinesNeverReachSentry() {
        val w = SentryLogWriter()
        assertFalse(w.isLoggable("Store", Severity.Debug))
        assertTrue(w.isLoggable("DataLayer", Severity.Info))
    }

    @Test fun uninitialisedSentryWriterIsANoOp() {
        // Sentry was never init'd in a unit test, so these must not throw or send anything.
        SentryLogWriter().log(Severity.Error, "boom", "Store", IllegalStateException("x"))
    }
}
