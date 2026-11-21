package com.carlosandmunoz.jarvis.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Debug only: stands in for the phone on an unpaired emulator.
 *  adb shell am broadcast -n com.carlosandmunoz.jarvis.debug/com.carlosandmunoz.jarvis.wear.FakeSync --ef readiness 92 --ei warns 1 --ei running 2 --ei needsYou 1 */
class FakeSync : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getBooleanExtra("empty", false)) {
            Store.write(context, null)
            return
        }
        val alerts = intent.getIntExtra("alerts", 0)
        val warns = intent.getIntExtra("warns", 0)
        Store.write(
            context,
            Store.Status(
                readiness = intent.getFloatExtra("readiness", 92f).toDouble(),
                alerts = alerts,
                warns = warns,
                headline = intent.getStringExtra("headline")
                    ?: if (alerts + warns == 0) "All clear" else "$alerts alerts · $warns warnings",
                revenue = intent.getStringExtra("revenue") ?: "$184",
                sales = intent.getIntExtra("sales", 3),
                top = intent.getStringExtra("top")?.takeIf { it.isNotBlank() },
                at = System.currentTimeMillis() - intent.getIntExtra("ago", 4) * 60_000L,
                running = intent.getIntExtra("running", 0),
                needsYou = intent.getIntExtra("needsYou", 0),
            ),
        )
    }
}
