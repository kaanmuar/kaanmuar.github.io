package com.carlosandmunoz.jarvis.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.carlosandmunoz.jarvis.home.Home
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.MainActivity
import com.carlosandmunoz.jarvis.R
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import com.carlosandmunoz.jarvis.data.JSON

/** Push alerts (#1416): channels, the FCM token handed to the jarvis function, and the notifications it sends. */
object Push {
    const val ALERTS = "alerts"
    const val BRIEFING = "briefing"
    const val EXTRA_TAB = "jarvis.tab"
    private val CHANNELS = mapOf(
        ALERTS to Triple("Alerts", "Threshold crossings from the hourly watch: a page down, TLS, failed jobs and runs.", NotificationManager.IMPORTANCE_HIGH),
        BRIEFING to Triple("Daily briefing", "The 07:40 briefing: the last 24 hours, goals and alerts.", NotificationManager.IMPORTANCE_DEFAULT),
        "review" to Triple("Reviews", "URL reviews you started by sharing a link to Jarvis.", NotificationManager.IMPORTANCE_DEFAULT),
        "test" to Triple("Tests", "Test notifications sent from Settings.", NotificationManager.IMPORTANCE_LOW)
    )

    fun channels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        CHANNELS.forEach { (id, c) -> nm.createNotificationChannel(NotificationChannel(id, c.first, c.third).apply { description = c.second }) }
    }

    fun kinds(app: JarvisApp) = listOf(ALERTS, BRIEFING).associateWith { app.vault.flag("push.$it", true) }

    suspend fun token(): String? = suspendCoroutine { done ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { done.resume(if (it.isSuccessful) it.result else null) }
    }

    /** Tells the jarvis function where to push and which kinds this phone wants. */
    suspend fun sync(app: JarvisApp, token: String? = null): Boolean {
        if (!app.auth.signedIn) return false
        val t = token ?: token() ?: return false
        val kinds = JsonObject(kinds(app).mapValues { JsonPrimitive(it.value) })
        app.api.call("register-device", 1, mapOf("token" to JsonPrimitive(t), "name" to JsonPrimitive(Build.MANUFACTURER.replaceFirstChar { it.uppercase() } + " " + Build.MODEL), "kinds" to kinds))
        return true
    }

    suspend fun forget(app: JarvisApp) {
        val t = token() ?: return
        runCatching { app.api.call("unregister-device", 1, mapOf("token" to JsonPrimitive(t))) }
        runCatching { FirebaseMessaging.getInstance().deleteToken() }
    }

    fun show(context: Context, data: Map<String, String>) {
        if (data["kind"] == ALERTS || data["kind"] == BRIEFING) Home.refreshSoon(context)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val kind = data["kind"]?.takeIf { it in CHANNELS } ?: ALERTS
        val title = data["title"] ?: "Jarvis"
        val body = data["body"] ?: ""
        val lines = runCatching { (JSON.parseToJsonElement(data["lines"] ?: "[]") as JsonArray).map { (it as JsonPrimitive).content } }.getOrDefault(emptyList())
        val tag = data["tag"] ?: kind
        val link = data["url"]?.takeIf { it.startsWith("https://") }
        val open = if (link != null) Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            else Intent(context, MainActivity::class.java).putExtra(EXTRA_TAB, data["tab"] ?: "overview").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val style = if (lines.size > 1) NotificationCompat.InboxStyle().also { s -> lines.forEach(s::addLine) }.setSummaryText(body.take(60)) else NotificationCompat.BigTextStyle().bigText(body)
        val n = NotificationCompat.Builder(context, kind)
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setColor(0xFF38E1FF.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(style)
            .setAutoCancel(true)
            .setCategory(if (kind == ALERTS) NotificationCompat.CATEGORY_ERROR else NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(PendingIntent.getActivity(context, tag.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            .build()
        NotificationManagerCompat.from(context).notify(tag, 1, n)
    }
}
