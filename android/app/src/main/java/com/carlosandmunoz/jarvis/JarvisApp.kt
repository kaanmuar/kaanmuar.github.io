package com.carlosandmunoz.jarvis

import android.app.Application
import com.carlosandmunoz.jarvis.data.Api
import com.carlosandmunoz.jarvis.data.Auth
import com.carlosandmunoz.jarvis.data.Vault
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.home.Ongoing
import com.carlosandmunoz.jarvis.home.Shortcuts
import com.carlosandmunoz.jarvis.push.Push
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class JarvisApp : Application() {
    lateinit var vault: Vault
    lateinit var auth: Auth
    lateinit var api: Api

    override fun onCreate() {
        super.onCreate()
        val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(200, TimeUnit.SECONDS).build()
        vault = Vault(this)
        auth = Auth(http, vault)
        api = Api(this, http, auth)
        Push.channels(this)
        Ongoing.channel(this)
        Shortcuts.publish(this)
        if (auth.signedIn) Home.schedule(this)
    }
}
