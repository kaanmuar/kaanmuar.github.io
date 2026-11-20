package com.carlosandmunoz.jarvis

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.carlosandmunoz.jarvis.push.Push

/**
 * Debug builds only: shows a push as if FCM had sent it, for emulator checks without the server, e.g.
 * adb shell am broadcast -n com.carlosandmunoz.jarvis.debug/com.carlosandmunoz.jarvis.DebugPush --es kind social --es title "Post this?" --es image https://…
 */
class DebugPush : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        val data = extras.keySet().associateWith { extras.getString(it).orEmpty() }
        val done = goAsync()
        Thread { try { Push.show(context.applicationContext, data) } finally { done.finish() } }.start()
    }
}
