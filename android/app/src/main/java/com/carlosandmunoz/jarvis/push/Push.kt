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
import com.carlosandmunoz.jarvis.data.str

/** Push alerts (#1416): channels, the FCM token handed to the jarvis function, and the notifications it sends. */
object Push {
    const val ALERTS = "alerts"
    const val BRIEFING = "briefing"
    const val MONEY = "money"
    const val REVIEWS = "reviews"
    const val OUTREACH = "outreach"
    const val INBOX = "inbox"
    const val DESK = "desk"
    const val SOCIAL = "social"
    const val EXTRA_TAB = "jarvis.tab"
    private val CHANNELS = mapOf(
        ALERTS to Triple("Alerts", "Threshold crossings from the hourly watch: a page down, TLS, failed jobs and runs.", NotificationManager.IMPORTANCE_HIGH),
        BRIEFING to Triple("Daily briefing", "The 07:40 briefing: the last 24 hours, goals and alerts.", NotificationManager.IMPORTANCE_DEFAULT),
        MONEY to Triple("Payments", "Each live PayPal payment: what was bought, the amount and who paid.", NotificationManager.IMPORTANCE_HIGH),
        REVIEWS to Triple("New reviews", "A customer's URL review finished: the site, its score and the plan.", NotificationManager.IMPORTANCE_DEFAULT),
        OUTREACH to Triple("Outreach approvals", "Owner notices waiting for you to send or drop, at most once an hour.", NotificationManager.IMPORTANCE_DEFAULT),
        INBOX to Triple("Inbox", "CV messages, CV feedback and site owners' replies to outreach.", NotificationManager.IMPORTANCE_HIGH),
        DESK to Triple("Review desk", "URL review runs as they go, held re-runs, comparisons, and runs that need you.", NotificationManager.IMPORTANCE_DEFAULT),
        SOCIAL to Triple("Social posts", "Posts Jarvis proposes for the social hub, to post or skip.", NotificationManager.IMPORTANCE_DEFAULT),
        "review" to Triple("Reviews", "URL reviews you started by sharing a link to Jarvis.", NotificationManager.IMPORTANCE_DEFAULT),
        "test" to Triple("Tests", "Test notifications sent from Settings.", NotificationManager.IMPORTANCE_LOW)
    )

    fun channels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        CHANNELS.forEach { (id, c) -> nm.createNotificationChannel(NotificationChannel(id, c.first, c.third).apply { description = c.second }) }
    }

    fun kinds(app: JarvisApp) = listOf(ALERTS, BRIEFING, MONEY, REVIEWS, OUTREACH, INBOX, DESK, SOCIAL).associateWith { app.vault.flag("push.$it", true) }

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

    /** A button a push asks for (#1670); input makes it an inline reply. */
    data class Button(val act: String, val label: String, val input: String?)

    fun buttons(data: Map<String, String>): List<Button> = runCatching {
        (JSON.parseToJsonElement(data["actions"] ?: "[]") as JsonArray).filterIsInstance<JsonObject>().mapNotNull { o ->
            val act = o.str("act") ?: return@mapNotNull null
            Button(act, o.str("label") ?: act, o.str("input"))
        }.take(3)
    }.getOrDefault(emptyList())

    private fun allowed(context: Context) =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun kindOf(data: Map<String, String>) = data["kind"]?.takeIf { it in CHANNELS } ?: ALERTS

    private fun tagOf(data: Map<String, String>) = data["tag"] ?: kindOf(data)

    fun show(context: Context, data: Map<String, String>) {
        if (data["kind"] in setOf(ALERTS, BRIEFING, MONEY, REVIEWS)) Home.refreshSoon(context)
        if (!allowed(context)) return
        val body = data["body"] ?: ""
        val lines = runCatching { (JSON.parseToJsonElement(data["lines"] ?: "[]") as JsonArray).map { (it as JsonPrimitive).content } }.getOrDefault(emptyList())
        val n = builder(context, data, body, lines).setSilent(data["quiet"] == "1")
        if (!data["ref"].isNullOrEmpty()) buttons(data).forEach { n.addAction(NotifyActions.action(context, data, it)) }
        NotificationManagerCompat.from(context).notify(tagOf(data), 1, n.build())
    }

    /** The same notification after a button: busy while it runs, then the outcome, with Retry when it failed. */
    fun result(context: Context, data: Map<String, String>, shown: String, retry: Button? = null, retryText: String? = null, busy: Boolean = false) {
        if (!allowed(context)) return
        val n = builder(context, data, shown, emptyList()).setSilent(true).setOnlyAlertOnce(true)
        if (busy) n.setProgress(0, 0, true).setOngoing(true).setAutoCancel(false)
        else if (retry == null) n.setTimeoutAfter(10 * 60 * 1000L)
        retry?.let { n.addAction(NotifyActions.action(context, data, it, retryText)) }
        NotificationManagerCompat.from(context).notify(tagOf(data), 1, n.build())
    }

    private fun builder(context: Context, data: Map<String, String>, body: String, lines: List<String>): NotificationCompat.Builder {
        val kind = kindOf(data)
        val tag = tagOf(data)
        val link = data["url"]?.takeIf { it.startsWith("https://") }
        val open = if (link != null) Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            else Intent(context, MainActivity::class.java).putExtra(EXTRA_TAB, data["tab"] ?: "overview").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val style = if (lines.size > 1) NotificationCompat.InboxStyle().also { s -> lines.forEach(s::addLine) }.setSummaryText(body.take(60)) else NotificationCompat.BigTextStyle().bigText(body)
        return NotificationCompat.Builder(context, kind)
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setColor(0xFF38E1FF.toInt())
            .setContentTitle(data["title"] ?: "Jarvis")
            .setContentText(body)
            .setStyle(style)
            .setAutoCancel(true)
            .setCategory(if (kind == ALERTS) NotificationCompat.CATEGORY_ERROR else NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(PendingIntent.getActivity(context, tag.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    }
}
