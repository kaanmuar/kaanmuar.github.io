package com.carlosandmunoz.jarvis.push

import android.util.Log
import com.carlosandmunoz.jarvis.BuildConfig
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.update.Updater
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class JarvisMessaging : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        if (BuildConfig.DEBUG) Log.d("JarvisPush", "token $token")
        scope.launch { runCatching { Push.sync(application as JarvisApp, token) } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["kind"] == "update") Updater.soon(this)
        else if (message.data.isNotEmpty()) Push.show(this, message.data)
    }
}
