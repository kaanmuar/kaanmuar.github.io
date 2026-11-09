package com.carlosandmunoz.jarvis.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
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
import com.carlosandmunoz.jarvis.data.CardImages
import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.obj
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
    const val CODES = "codes"
    const val ENGAGEMENT = "engagement"
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
        ENGAGEMENT to Triple("Social engagement", "Reply drafts to approve, edit or dismiss, and the daily, weekly and monthly engagement reports.", NotificationManager.IMPORTANCE_DEFAULT),
        CODES to Triple("Sign-in codes", "Codes and confirm links mailed to qa@ and the channel addresses, with a Copy button.", NotificationManager.IMPORTANCE_HIGH),
        "review" to Triple("Reviews", "URL reviews you started by sharing a link to Jarvis.", NotificationManager.IMPORTANCE_DEFAULT),
        "test" to Triple("Tests", "Test notifications sent from Settings.", NotificationManager.IMPORTANCE_LOW)
    )

    fun channels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        CHANNELS.forEach { (id, c) -> nm.createNotificationChannel(NotificationChannel(id, c.first, c.third).apply { description = c.second }) }
    }

    fun kinds(app: JarvisApp) = listOf(ALERTS, BRIEFING, MONEY, REVIEWS, OUTREACH, INBOX, DESK, SOCIAL, CODES, ENGAGEMENT).associateWith { app.vault.flag("push.$it", true) }

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

    /** A button a push asks for (#1670); input makes it an inline reply, and act "open" opens its tab or url on the phone (#1977). */
    data class Button(val act: String, val label: String, val input: String?, val tab: String? = null, val url: String? = null)

    fun buttons(data: Map<String, String>): List<Button> = runCatching {
        (JSON.parseToJsonElement(data["actions"] ?: "[]") as JsonArray).filterIsInstance<JsonObject>().mapNotNull { o ->
            val act = o.str("act") ?: return@mapNotNull null
            Button(act, o.str("label") ?: act, o.str("input"), o.str("tab"), o.str("url"))
        }.take(3)
    }.getOrDefault(emptyList())

    private fun openIntent(context: Context, link: String?, tab: String?): Intent =
        if (link != null) Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        else Intent(context, MainActivity::class.java).putExtra(EXTRA_TAB, tab ?: "overview").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    private fun openAction(context: Context, data: Map<String, String>, button: Button): NotificationCompat.Action {
        val intent = openIntent(context, button.url?.takeIf { it.startsWith("https://") }, button.tab)
        val pi = PendingIntent.getActivity(context, (tagOf(data) + "open").hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Action.Builder(0, button.label, pi).build()
    }

    /** A section push (#2509), data only: refresh, which redraws the widgets and syncs the watch, unless the saved
        snapshot already holds those versions. Applying only the changed sections is #2510. */
    fun sections(context: Context, data: Map<String, String>) {
        val app = context.applicationContext as JarvisApp
        val days = data["days"]?.toIntOrNull() ?: 1
        if (sectionsStale(data["versions"], app.api.saved("snapshot", days)?.json)) Home.refreshSoon(context)
    }

    /** True when the push names a section version the saved snapshot does not hold. */
    fun sectionsStale(versions: String?, saved: JsonObject?): Boolean {
        val pushed = runCatching { JSON.parseToJsonElement(versions ?: "{}") as JsonObject }.getOrNull() ?: return true
        return pushed.any { (name, v) -> saved.obj("versions").obj(name).str("v") != (v as? JsonPrimitive)?.content }
    }

    private fun allowed(context: Context) =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun kindOf(data: Map<String, String>) = data["kind"]?.takeIf { it in CHANNELS } ?: ALERTS

    private fun tagOf(data: Map<String, String>) = data["tag"] ?: kindOf(data)

    fun show(context: Context, data: Map<String, String>) {
        if (data["kind"] in setOf(ALERTS, BRIEFING, MONEY, REVIEWS)) Home.refreshSoon(context)
        if (!allowed(context)) return
        val body = data["body"] ?: ""
        val lines = runCatching { (JSON.parseToJsonElement(data["lines"] ?: "[]") as JsonArray).map { (it as JsonPrimitive).content } }.getOrDefault(emptyList())
        val n = builder(context, data, body, lines, CardImages.load(data["image"])).setSilent(data["quiet"] == "1")
        if (!data["ref"].isNullOrEmpty()) buttons(data).forEach { n.addAction(if (it.act == "open") openAction(context, data, it) else NotifyActions.action(context, data, it)) }
        data["code"]?.takeIf { kindOf(data) == CODES && it.isNotBlank() }?.let { n.addAction(CodeCopy.action(context, it, tagOf(data))).setTimeoutAfter(15 * 60 * 1000L) }
        NotificationManagerCompat.from(context).notify(tagOf(data), 1, n.build())
    }

    /** The same notification after a button: busy while it runs, then the outcome, with Retry when it failed. */
    fun result(context: Context, data: Map<String, String>, shown: String, retry: Button? = null, retryText: String? = null, busy: Boolean = false) {
        if (!allowed(context)) return
        val n = builder(context, data, shown, emptyList(), CardImages.cached(data["image"])).setSilent(true).setOnlyAlertOnce(true)
        if (busy) n.setProgress(0, 0, true).setOngoing(true).setAutoCancel(false)
        else if (retry == null) n.setTimeoutAfter(10 * 60 * 1000L)
        retry?.let { n.addAction(NotifyActions.action(context, data, it, retryText)) }
        NotificationManagerCompat.from(context).notify(tagOf(data), 1, n.build())
    }

    /** picture is the push's card image (#2248): expanded it shows big, collapsed as the thumbnail; without one the text styles stand. */
    private fun builder(context: Context, data: Map<String, String>, body: String, lines: List<String>, picture: Bitmap? = null): NotificationCompat.Builder {
        val kind = kindOf(data)
        val tag = tagOf(data)
        val open = openIntent(context, data["url"]?.takeIf { it.startsWith("https://") }, data["tab"])
        val style = when {
            picture != null -> NotificationCompat.BigPictureStyle().bigPicture(CardImages.forPush(picture)).bigLargeIcon(null as Bitmap?).setSummaryText(body)
            lines.size > 1 -> NotificationCompat.InboxStyle().also { s -> lines.forEach(s::addLine) }.setSummaryText(body.take(60))
            else -> NotificationCompat.BigTextStyle().bigText(body)
        }
        return NotificationCompat.Builder(context, kind)
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setColor(0xFF38E1FF.toInt())
            .setContentTitle(data["title"] ?: "Jarvis")
            .setContentText(body)
            .setLargeIcon(picture)
            .setStyle(style)
            .setAutoCancel(true)
            .setCategory(if (kind == ALERTS) NotificationCompat.CATEGORY_ERROR else NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(PendingIntent.getActivity(context, tag.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    }
}
