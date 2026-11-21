package com.carlosandmunoz.jarvis.wear

import android.app.Application
import com.carlosandmunoz.jarvis.wear.telemetry.Telemetry

/** Watch process entry (#3836): Telemetry starts here so tiles/complications share one Sentry init. */
class WearApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Telemetry.init(this)
    }
}
