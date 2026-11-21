package com.carlosandmunoz.jarvis.telemetry

import android.app.Application
import co.touchlab.kermit.LogWriter
import co.touchlab.kermit.Logger
import co.touchlab.kermit.Severity
import co.touchlab.kermit.platformLogWriter
import com.carlosandmunoz.jarvis.BuildConfig
import io.sentry.Breadcrumb
import io.sentry.Sentry
import io.sentry.SentryLevel
import io.sentry.android.core.SentryAndroid

/**
 * Logging and crash capture (#3836). Code logs through Kermit (`Telemetry.log("Tag")`); Kermit routes to logcat in
 * debug builds and, in release builds with a DSN, to Sentry as breadcrumbs (Info and up) and error events.
 */
object Telemetry {
    /** A Kermit logger for one area, e.g. `Telemetry.log("Updater")`. */
    fun log(tag: String): Logger = Logger.withTag(tag)

    /** Debug builds log to logcat only; release builds add Sentry when [dsn] is set. Safe to call once per process. */
    fun init(app: Application, dsn: String = BuildConfig.SENTRY_DSN, debug: Boolean = BuildConfig.DEBUG) {
        val sentryOn = sentryEnabled(dsn, debug)
        Logger.setLogWriters(if (sentryOn) listOf(platformLogWriter(), SentryLogWriter()) else listOf(platformLogWriter()))
        Logger.setMinSeverity(if (debug) Severity.Verbose else Severity.Info)
        if (!sentryOn) return
        SentryAndroid.init(app) { options ->
            options.dsn = dsn
            options.release = "${BuildConfig.APPLICATION_ID}@${BuildConfig.VERSION_NAME}+${BuildConfig.VERSION_CODE}"
            options.isSendDefaultPii = false
            options.isAttachScreenshot = false
            options.isEnableUserInteractionBreadcrumbs = false
        }
    }

    /** Sentry runs only in release builds that were given a DSN; debug builds and unit tests never phone home. */
    internal fun sentryEnabled(dsn: String, debug: Boolean): Boolean = !debug && dsn.isNotBlank()

    internal fun level(severity: Severity): SentryLevel = when (severity) {
        Severity.Verbose, Severity.Debug -> SentryLevel.DEBUG
        Severity.Info -> SentryLevel.INFO
        Severity.Warn -> SentryLevel.WARNING
        Severity.Error -> SentryLevel.ERROR
        Severity.Assert -> SentryLevel.FATAL
    }
}

/**
 * Kermit writer that forwards to Sentry: Info and up become breadcrumbs (Debug stays out, since debug lines may carry
 * a push token), and Error/Assert with a throwable is also captured as an event.
 */
internal class SentryLogWriter : LogWriter() {
    override fun isLoggable(tag: String, severity: Severity): Boolean = severity >= Severity.Info

    override fun log(severity: Severity, message: String, tag: String, throwable: Throwable?) {
        Sentry.addBreadcrumb(Breadcrumb().apply {
            category = tag
            this.message = message
            level = Telemetry.level(severity)
        })
        if (throwable != null && severity >= Severity.Error) Sentry.captureException(throwable)
    }
}
