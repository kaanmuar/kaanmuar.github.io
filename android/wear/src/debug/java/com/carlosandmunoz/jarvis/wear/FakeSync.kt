package com.carlosandmunoz.jarvis.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.wearable.DataMap

/** Debug only: stands in for the phone on an unpaired emulator.
 *  adb shell am broadcast -n com.carlosandmunoz.jarvis.debug/com.carlosandmunoz.jarvis.wear.FakeSync --ef readiness 92 --ei warns 1 */
class FakeSync : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val map = DataMap()
        if (intent.getBooleanExtra("empty", false)) map.putBoolean("empty", true)
        else map.apply {
            val alerts = intent.getIntExtra("alerts", 0)
            val warns = intent.getIntExtra("warns", 0)
            putDouble("readiness", intent.getFloatExtra("readiness", 92f).toDouble())
            putInt("alerts", alerts)
            putInt("warns", warns)
            putString("headline", intent.getStringExtra("headline") ?: if (alerts + warns == 0) "All clear" else "$alerts alerts · $warns warnings")
            putString("revenue", intent.getStringExtra("revenue") ?: "$184")
            putInt("sales", intent.getIntExtra("sales", 3))
            putString("top", intent.getStringExtra("top") ?: "")
            putLong("at", System.currentTimeMillis() - intent.getIntExtra("ago", 4) * 60_000L)
        }
        Store.write(context, map)
    }
}
