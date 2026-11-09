package com.carlosandmunoz.jarvis

import android.app.Application
import com.carlosandmunoz.jarvis.data.Api
import com.carlosandmunoz.jarvis.data.Auth
import com.carlosandmunoz.jarvis.data.Vault
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.home.Ongoing
import com.carlosandmunoz.jarvis.home.Shortcuts
import com.carlosandmunoz.jarvis.push.Push
import com.carlosandmunoz.jarvis.background.Keep
import com.carlosandmunoz.jarvis.update.Updater
import com.carlosandmunoz.jarvis.voice.HandsFree
import com.carlosandmunoz.jarvis.voice.Listener
import com.carlosandmunoz.jarvis.voice.Speaker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class JarvisApp : Application() {
    lateinit var vault: Vault
    lateinit var auth: Auth
    lateinit var api: Api

    /** This install, so the server keeps one row per device in Settings › Devices. */
    val installId: String by lazy { vault.get("install.id") ?: java.util.UUID.randomUUID().toString().also { vault.put("install.id", it) } }

    /** Work the owner starts runs here, not in a screen's scope, so leaving Jarvis does not cancel it (#2531). */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val speaker by lazy { Speaker(this) }
    val handsFree by lazy { HandsFree(this) }

    /** The Stop on the background notification: hands-free, listening and the answer being read. */
    fun stopVoice() {
        handsFree.stop()
        speaker.stop()
        Listener.stopAll()
    }

    override fun onCreate() {
        super.onCreate()
        val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(200, TimeUnit.SECONDS).build()
        vault = Vault(this)
        auth = Auth(http, vault)
        api = Api(this, http, auth)
        Push.channels(this)
        Ongoing.channel(this)
        Keep.channels(this)
        Shortcuts.publish(this)
        Updater.channel(this)
        Updater.schedule(this)
        if (auth.signedIn) Home.schedule(this)
    }
}
