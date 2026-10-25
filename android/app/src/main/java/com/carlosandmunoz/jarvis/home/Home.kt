package com.carlosandmunoz.jarvis.home

import android.app.StatusBarManager
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.TileService
import com.carlosandmunoz.jarvis.R
import androidx.glance.appwidget.updateAll
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.carlosandmunoz.jarvis.BuildConfig
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.MainActivity
import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.at
import com.carlosandmunoz.jarvis.data.doubles
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.prim
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.text
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonObject

/** Home-screen surfaces (#1417): widgets, the quick-settings tile and shortcuts all read the snapshot the app last saved. */
object Home {
    const val EXTRA_ACTION = "jarvis.action"
    private const val WORK = "jarvis-home"

    data class Status(val readiness: Double?, val alerts: Int, val warns: Int) {
        val headline get() = if (alerts + warns == 0) "All clear" else listOfNotNull(alerts.takeIf { it > 0 }?.let { plural(it, "alert") }, warns.takeIf { it > 0 }?.let { plural(it, "warning") }).joinToString(" · ")
    }

    data class Cell(val label: String, val value: String, val delta: String?, val dir: Int, val series: List<Double>, val note: String? = null)

    data class Goal(val label: String, val value: Double?, val target: Double?, val pct: Double, val status: String?)

    fun days(app: JarvisApp) = app.vault.get("days")?.toIntOrNull() ?: 7

    fun snapshot(context: Context): Pair<JsonObject, Long>? {
        val app = context.applicationContext as JarvisApp
        val fixture = File(app.filesDir, "jarvis/fixture.json").takeIf { BuildConfig.DEBUG && it.exists() }
        if (fixture != null) return runCatching { (JSON.parseToJsonElement(fixture.readText()) as JsonObject) to fixture.lastModified() }.getOrNull()
        if (!app.auth.signedIn) return null
        return app.api.saved("snapshot", days(app))?.let { it.json to it.at }
    }

    fun status(snap: JsonObject): Status {
        val brief = snap.objs("briefing")
        return Status(snap.num("readiness"), brief.count { it.str("level") == "alert" }, brief.count { it.str("level") == "warn" })
    }

    fun numbers(snap: JsonObject): List<Cell> {
        val money = snap.obj("external").obj("money")?.takeIf { it.isOk() }
        val usd = money.at("revenue").num("usd")
        val prior = money.at("prior").num("usd")
        val sales = money.at("revenue").num("count")
        val revenue = Cell("Revenue", if (usd == null) "—" else "$" + fmt(usd, 0), change(usd, prior), dirOf(change(usd, prior)), emptyList(),
            sales?.let { plural(it.toInt(), "sale") })
        fun product(key: String, name: String): Cell {
            val p = snap.obj("products").obj(key)
            val k = p.objs("kpis").firstOrNull()
            val delta = k?.str("delta")
            val label = k?.str("label")?.takeIf { !it.equals(name, ignoreCase = true) }?.let { "$name · " + it.lowercase() } ?: name
            return Cell(label, k?.prim("value").text(), delta, dirOf(delta), p.obj("series").at("values").doubles())
        }
        val pipe = snap.obj("external").obj("outreach").obj("pipeline")?.takeIf { it.isOk() }
        val outreach = Cell("Outreach · reviewed", pipe?.prim("reviews").text(), null, 0, pipe.objs("daily").map { it.num("reviews") ?: 0.0 })
        return listOf(revenue, product("review", "Reviews"), product("cv", "CV"), outreach)
    }

    fun goals(snap: JsonObject): List<Goal> = snap.objs("goals").map {
        Goal(it.str("label") ?: "", it.num("value"), it.num("target"), ((it.num("pct") ?: 0.0) / 100).coerceIn(0.0, 1.0), it.str("status"))
    }

    /** Fetches a fresh snapshot in the background and redraws every surface; false when signed out or offline. */
    suspend fun refresh(context: Context): Boolean {
        val app = context.applicationContext as JarvisApp
        if (!app.auth.signedIn) return false
        val ok = runCatching { app.api.fetch("snapshot", days(app)) }.isSuccess
        redraw(context)
        return ok
    }

    suspend fun redraw(context: Context) {
        runCatching { StatusWidget().updateAll(context) }
        runCatching { NumbersWidget().updateAll(context) }
        runCatching { GoalsWidget().updateAll(context) }
        runCatching { TileService.requestListeningState(context, ComponentName(context, StatusTile::class.java)) }
    }

    fun schedule(context: Context) {
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES).setConstraints(net).build())
    }

    /** A push just changed the picture: refresh now rather than at the next half hour. */
    fun refreshSoon(context: Context) {
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(context).enqueueUniqueWork("$WORK-now", ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<RefreshWorker>().setConstraints(net).build())
    }

    fun stop(context: Context) = WorkManager.getInstance(context).cancelUniqueWork(WORK)

    /** Opens the app on a tab ("products:outreach" also picks the chip), optionally running an action once open. */
    fun open(context: Context, tab: String, action: String? = null): Intent =
        Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            .putExtra(com.carlosandmunoz.jarvis.push.Push.EXTRA_TAB, tab)
            .apply { if (action != null) putExtra(EXTRA_ACTION, action) }
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    fun canPin(context: Context) = AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported

    /** Asks the launcher to place a widget; it shows its own confirm sheet. */
    fun pin(context: Context, receiver: Class<*>) {
        AppWidgetManager.getInstance(context).requestPinAppWidget(ComponentName(context, receiver), null, null)
    }

    /** Android 13+: the system sheet that adds the quick-settings tile without editing the shade. */
    fun addTile(context: Context) {
        if (Build.VERSION.SDK_INT < 33) return
        context.getSystemService(StatusBarManager::class.java).requestAddTileService(ComponentName(context, StatusTile::class.java),
            context.getString(R.string.tile_label), Icon.createWithResource(context, R.drawable.ic_stat_jarvis), context.mainExecutor) { }
    }

    fun plural(n: Int, word: String) = "$n $word" + if (n == 1) "" else "s"

    private fun change(now: Double?, prior: Double?): String? {
        if (now == null || prior == null) return null
        if (prior == 0.0) return if (now == 0.0) "±0" else "new"
        val p = ((now - prior) / prior * 100).toInt()
        return (if (p > 0) "+" else "") + p + "%"
    }

    private fun dirOf(delta: String?) = when { delta == null -> 0; delta.startsWith("+") || delta == "new" -> 1; delta.startsWith("-") -> -1; else -> 0 }
}

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (!(applicationContext as JarvisApp).auth.signedIn) { Home.redraw(applicationContext); return Result.success() }
        return if (Home.refresh(applicationContext)) Result.success() else Result.retry()
    }
}
