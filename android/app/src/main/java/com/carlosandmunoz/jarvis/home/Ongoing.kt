package com.carlosandmunoz.jarvis.home

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
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
import com.carlosandmunoz.jarvis.data.objs
import kotlin.math.roundToInt
import kotlinx.serialization.json.JsonObject

/** Persistent status notification (#1530): the status-bar icon is the readiness ring with its number, redrawn on every refresh. */
object Ongoing {
    const val CHANNEL = "status"
    const val FLAG = "ongoing"
    private const val ID = 1530

    data class Content(val readiness: Int?, val title: String, val text: String, val lines: List<String>, val urgent: Boolean, val at: Long)

    fun enabled(app: JarvisApp) = app.vault.flag(FLAG, true)

    fun channel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Live status", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Stays in the status bar: readiness as a ring, what needs you, and today's money. Updates silently."
                setShowBadge(false)
            })
    }

    fun content(snap: JsonObject, today: JsonObject?, at: Long, approvals: Int?): Content {
        val w = Watch.summary(snap, today, at)
        val ready = w.readiness?.roundToInt()
        val counts = listOfNotNull(
            w.alerts.takeIf { it > 0 }?.let { Home.plural(it, "alert") },
            w.warns.takeIf { it > 0 }?.let { Home.plural(it, "warning") },
            approvals?.takeIf { it > 0 }?.let { Home.plural(it, "approval") + " waiting" },
        ).joinToString(" · ").ifEmpty { "All clear" }
        val money = "Today ${w.revenue} · " + Home.plural(w.sales, "sale")
        val title = (if (ready == null) "Readiness —" else "Readiness $ready%") + " · " + counts
        return Content(ready, title, w.top ?: money, listOfNotNull(w.top, money), w.alerts > 0, at)
    }

    /** Shows, updates or removes the notification to match the saved snapshot and the Settings switch. */
    suspend fun show(context: Context, today: suspend () -> JsonObject?) {
        val app = context.applicationContext as JarvisApp
        val nm = NotificationManagerCompat.from(app)
        val saved = Home.snapshot(app)
        val allowed = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (saved == null || !enabled(app) || !allowed) { nm.cancel(ID); return }
        val (snap, at) = saved
        val c = content(snap, today(), at, approvals(app, snap))
        val open = PendingIntent.getActivity(app, ID, Home.open(app, "overview"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val icon = IconCompat.createWithBitmap(ring(c.readiness, (24 * app.resources.displayMetrics.density).roundToInt()))
        fun base() = NotificationCompat.Builder(app, CHANNEL)
            .setSmallIcon(icon)
            .setColor(if (c.urgent) 0xFFFF4F9A.toInt() else 0xFF38E1FF.toInt())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(true)
            .setWhen(c.at)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(open)
        val public = base().setContentTitle(if (c.readiness == null) "Jarvis" else "Readiness ${c.readiness}%").build()
        val n = base()
            .setContentTitle(c.title)
            .setContentText(c.text)
            .setStyle(NotificationCompat.InboxStyle().also { s -> c.lines.forEach(s::addLine) })
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(public)
            .build()
        runCatching { nm.notify(ID, n) }
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
