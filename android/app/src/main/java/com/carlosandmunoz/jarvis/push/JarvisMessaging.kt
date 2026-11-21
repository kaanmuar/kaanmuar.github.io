package com.carlosandmunoz.jarvis.push

import com.carlosandmunoz.jarvis.BuildConfig
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.telemetry.Telemetry
import com.carlosandmunoz.jarvis.update.Updater
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class JarvisMessaging : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val log = Telemetry.log("JarvisPush")

    override fun onNewToken(token: String) {
        if (BuildConfig.DEBUG) log.d { "token $token" }
        scope.launch {
            runCatching { Push.sync(application as JarvisApp, token) }
                .onFailure { log.w(it) { "Push token sync failed" } }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        log.i { "push received kind=${message.data["kind"] ?: "alert"}" }
        when {
            message.data["kind"] == "update" -> Updater.soon(this)
            message.data["kind"] == "sections" -> Push.sections(this, message.data)
            message.data.isNotEmpty() -> Push.show(this, message.data)
        }
    }
}
