package com.carlosandmunoz.jarvis.home

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.R
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/** Persistent status notification (#1530): the status-bar icon is the readiness ring with its number, redrawn on every refresh. */
object Ongoing {
    const val CHANNEL = "status"
    const val FLAG = "ongoing"
    const val ACTION_AGAIN = "com.carlosandmunoz.jarvis.ONGOING_AGAIN"
    private const val PARTS = "ongoing.parts"
    private const val ID = 1530

    data class Content(
        val readiness: Int?, val title: String, val text: String, val lines: List<String>, val urgent: Boolean, val at: Long, val chip: String?,
        val waiting: Boolean = false, val ring: Boolean = true, val bar: Boolean = true, val live: Boolean = true,
        val counts: String = "", val card: StatusCard.Card? = null,
    )

    /** What the notification shows, picked in Settings; nothing saved means everything but the Live Update. */
    enum class Part(val key: String, val label: String, val hint: String) {
        READINESS("readiness", "Readiness", "The ring in the card, and the ring icon in the status bar"),
        ALERTS("alerts", "Alerts and warnings", "How many, next to the app name"),
        APPROVALS("approvals", "Approvals waiting", "Notices waiting for Send or Drop"),
        TOP("top", "Top briefing line", "The most urgent line from the briefing"),
        MONEY("money", "Today's money", "Revenue and sales today"),
        BAR("bar", "Bars", "Connections online and the top goals as bars"),
        CHIP("live", "Live Update instead of the card", "Android 16: a chip by the clock, pinned at the top of the shade. Android can't pin the card, so this swaps it for text and one readiness bar");

        companion object {
            val ALL = entries.toSet()
            val DEFAULT = ALL - CHIP
            fun of(saved: String?): Set<Part> = saved?.split(",")?.let { k -> entries.filter { it.key in k }.toSet() } ?: DEFAULT
        }
    }

    fun enabled(app: JarvisApp) = app.vault.flag(FLAG, true)

    fun parts(app: JarvisApp) = Part.of(app.vault.get(PARTS))

    fun setParts(app: JarvisApp, parts: Set<Part>) = app.vault.put(PARTS, parts.joinToString(",") { it.key })

    fun channel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Live status", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Stays in the status bar and comes back if swiped away: readiness as a ring, what needs you, and today's money. Updates silently; turn it off in Jarvis settings."
                setShowBadge(false)
            })
    }

    fun content(snap: JsonObject, today: JsonObject?, at: Long, approvals: Int?, show: Set<Part> = Part.DEFAULT): Content {
        val w = Watch.summary(snap, today, at)
        val ready = w.readiness?.roundToInt()
        val alerts = Part.ALERTS in show
        val waiting = Part.APPROVALS in show && (approvals ?: 0) > 0
        val counts = listOfNotNull(
            w.alerts.takeIf { alerts && it > 0 }?.let { Home.plural(it, "alert") },
            w.warns.takeIf { alerts && it > 0 }?.let { Home.plural(it, "warning") },
            approvals?.takeIf { waiting }?.let { Home.plural(it, "approval") + " waiting" },
        ).joinToString(" · ").ifEmpty { if (alerts) w.headline else "" }
        val money = "Today ${w.revenue} · " + Home.plural(w.sales, "sale")
        val title = listOfNotNull(
            (if (ready == null) "Readiness —" else "Readiness $ready%").takeIf { Part.READINESS in show },
            counts.ifEmpty { null },
        ).joinToString(" · ").ifEmpty { "Jarvis" }
        val lines = listOfNotNull(w.top?.takeIf { Part.TOP in show }, money.takeIf { Part.MONEY in show })
        val chip = when {
            Part.CHIP !in show -> null
            alerts && w.alerts > 0 -> Home.plural(w.alerts, "alert")
            waiting -> "$approvals waiting"
            Part.READINESS in show && ready != null -> "$ready%"
            else -> null
        }
        val urgent = alerts && w.alerts > 0
        val color = when { urgent -> PINK; waiting -> AMBER; else -> CYAN }
        val card = StatusCard.Card(ready?.takeIf { Part.READINESS in show }, "Readiness", color, if (Part.BAR in show) bars(snap) else emptyList(), lines)
        return Content(ready, title, lines.firstOrNull().orEmpty(), lines, urgent, at, chip,
            waiting = waiting, ring = Part.READINESS in show, bar = Part.BAR in show, live = Part.CHIP in show, counts = counts, card = card)
    }

    /** Connections online, then the two top goals, coloured by how they are doing. */
    fun bars(snap: JsonObject): List<StatusCard.Bar> {
        val states = snap.objs("connections").map { it.str("state") }
        val on = states.count { it != "down" && it != "partial" }
        val systems = states.takeIf { it.isNotEmpty() }?.let {
            StatusCard.Bar("Connections", "$on of ${it.size} online", on * 100 / it.size, if (on < it.size) AMBER else CYAN)
        }
        val goals = Home.goals(snap).take(2).map { g ->
            val color = when (g.status) { "done" -> GREEN; "behind" -> AMBER; "far-behind" -> PINK; else -> CYAN }
            StatusCard.Bar(g.label, "${fmt(g.value, 0)} of ${fmt(g.target, 0)}", (g.pct * 100).roundToInt(), color)
        }
        return listOfNotNull(systems) + goals
    }

    private const val CYAN = 0xFF38E1FF.toInt()
    private const val PINK = 0xFFFF4F9A.toInt()
    private const val AMBER = 0xFFFFB020.toInt()
    private const val GREEN = 0xFF34C759.toInt()

    /** Shows, updates or removes the notification to match the saved snapshot and the Settings switch. */
    suspend fun show(context: Context, today: suspend () -> JsonObject?) {
        val app = context.applicationContext as JarvisApp
        val nm = NotificationManagerCompat.from(app)
        val saved = Home.snapshot(app)
        val allowed = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (saved == null || !enabled(app) || !allowed) { nm.cancel(ID); return }
        val (snap, at) = saved
        val c = content(snap, today(), at, approvals(app, snap), parts(app))
        val open = PendingIntent.getActivity(app, ID, Home.open(app, "overview"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val again = PendingIntent.getBroadcast(app, ID, Intent(app, OngoingReceiver::class.java).setAction(ACTION_AGAIN), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val icon = if (c.ring) IconCompat.createWithBitmap(ring(c.readiness, (24 * app.resources.displayMetrics.density).roundToInt()))
            else IconCompat.createWithResource(app, R.drawable.ic_stat_jarvis)
        fun base() = NotificationCompat.Builder(app, CHANNEL)
            .setSmallIcon(icon)
            .setColor(when { c.urgent -> PINK; c.waiting -> AMBER; else -> CYAN })
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(true)
            .setWhen(c.at)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(open)
            .setDeleteIntent(again)
        val public = base().setContentTitle(if (c.readiness == null || !c.ring) "Jarvis" else "Readiness ${c.readiness}%").build()
        val live = c.live && Build.VERSION.SDK_INT >= 36
        val n = base()
            .setContentTitle(c.title)
            .apply {
                if (live || c.card == null) {
                    if (c.bar && c.readiness != null) setProgress(100, c.readiness.coerceIn(0, 100), false)
                    if (c.lines.isNotEmpty()) setContentText(c.text).setStyle(NotificationCompat.BigTextStyle().bigText(c.lines.joinToString("\n")))
                } else {
                    setContentText(c.text)
                    setSubText(c.counts.ifEmpty { null })
                    setStyle(NotificationCompat.DecoratedCustomViewStyle())
                    setCustomContentView(StatusCard.views(app, c.card, big = false))
                    setCustomBigContentView(StatusCard.views(app, c.card, big = true))
                }
            }
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(public)
            .build()
        runCatching { nm.notify(ID, if (live) promote(app, n, c.chip) else n) }
    }

    /**
     * Android 16+ Live Update: the status-bar chip, the top of the shade and the lock screen. Inbox style can't be promoted, hence big text.
     * The app compiles against API 35, so the API 36 builder calls go through reflection.
     */
    private fun promote(context: Context, n: Notification, chip: String?): Notification {
        if (Build.VERSION.SDK_INT < 36) return n
        return runCatching {
            val b = Notification.Builder.recoverBuilder(context, n)
            Notification.Builder::class.java.getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType).invoke(b, true)
            Notification.Builder::class.java.getMethod("setShortCriticalText", String::class.java).invoke(b, chip)
            b.build()
        }.getOrDefault(n)
    }

    /** Owner notices waiting for Send or Drop; the last count when offline. */
    private suspend fun approvals(app: JarvisApp, snap: JsonObject): Int? {
        (snap["notices"] as? JsonObject)?.let { return it.objs("notices").size }
        if (!app.auth.signedIn) return null
        val fresh = runCatching { app.api.call("notices", 1).objs("notices").size }.getOrNull()
        if (fresh != null) app.vault.put("ongoing.approvals", fresh.toString())
        return fresh ?: app.vault.get("ongoing.approvals")?.toIntOrNull()
    }

    /** White on transparent, since the status bar tints small icons by alpha: a faint track, the filled arc, the number inside. */
    fun ring(readiness: Int?, size: Int): Bitmap {
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val g = Canvas(bmp)
        val stroke = size * 0.11f
        val box = RectF(stroke / 2, stroke / 2, size - stroke / 2, size - stroke / 2)
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; color = 0xFFFFFFFF.toInt(); strokeCap = Paint.Cap.ROUND }
        g.drawArc(box, 0f, 360f, false, Paint(line).apply { alpha = 90; strokeCap = Paint.Cap.BUTT })
        if (readiness != null && readiness > 0) g.drawArc(box, -90f, 360f * readiness.coerceIn(0, 100) / 100f, false, line)
        val label = when { readiness == null -> "–"; readiness >= 100 -> "✓"; else -> readiness.toString() }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt(); typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD); textAlign = Paint.Align.CENTER
            textSize = size * if (label.length > 2) 0.4f else if (label.length > 1) 0.52f else 0.58f
        }
        g.drawText(label, size / 2f, size / 2f - (text.descent() + text.ascent()) / 2, text)
        return bmp
    }
}

/**
 * Android 14+ lets a swipe remove even an ongoing notification, so a dismissal puts it straight back; the Settings switch is the
 * way to turn it off. Boot and app updates clear notifications too, so it is redrawn from the saved snapshot then as well.
 */
class OngoingReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as JarvisApp
        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                runCatching { Ongoing.show(app, Home.today(app)) }
                if (intent.action != Ongoing.ACTION_AGAIN) Home.refreshSoon(app)
            } finally {
                pending.finish()
            }
        }
    }
}
