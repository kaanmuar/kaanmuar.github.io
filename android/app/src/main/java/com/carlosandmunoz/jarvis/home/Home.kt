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
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.doubles
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.prim
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.text
import com.carlosandmunoz.jarvis.ui.CHIPS
import com.carlosandmunoz.jarvis.ui.Marketing
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

    /** One row of the Needs you widget: an owner notice or social pick to decide, or a rule proposal to open. */
    data class Alert(val level: String, val text: String, val label: String?, val tab: String)

    data class Need(val kind: String, val id: String, val title: String, val detail: String?, val level: String, val tab: String? = null, val email: String? = null)

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

    /** Owner notices first, then social picks, then the snapshot's rule proposals. */
    fun needs(snap: JsonObject, notices: JsonObject?, picks: JsonObject?): List<Need> {
        val sends = notices.objs("notices").mapNotNull { n ->
            val domain = n.str("domain") ?: return@mapNotNull null
            val email = n.str("email") ?: n.objs("candidates").firstNotNullOfOrNull { it.str("email") }
            Need("notice", domain, "Send notice to " + (n.str("host") ?: domain), email ?: "No address found", if (n.bool("critical") == true) "alert" else "warn", email = email)
        }
        val approve = picks.objs("proposals").mapNotNull { p ->
            val id = p.str("id") ?: return@mapNotNull null
            Need("social", id, p.str("title") ?: "Social pick", listOfNotNull("Social pick", p.str("source")).joinToString(" · "), "info")
        }
        val rules = snap.objs("proposals").mapNotNull { p ->
            Need("proposal", p.str("key") ?: return@mapNotNull null, p.str("title") ?: return@mapNotNull null, null, p.str("level") ?: "info", tab = p.str("tab")?.let(::route))
        }
        return sends + approve + rules
    }

    /** Briefing lines, alerts first, then warnings, notes and good news, each opening its product or tab. */
    fun alerts(snap: JsonObject): List<Alert> {
        val rank = listOf("alert", "warn", "info", "good")
        return snap.objs("briefing").mapNotNull { b ->
            val text = b.str("text") ?: return@mapNotNull null
            val product = b.str("product")
            val label = product?.let { p -> CHIPS.firstOrNull { it.first == p }?.second ?: p.replaceFirstChar { it.uppercase() } }
            Alert(b.str("level") ?: "info", text, label, product?.let(::route) ?: "overview")
        }.sortedBy { a -> rank.indexOf(a.level).let { if (it < 0) rank.size else it } }
    }

    data class Money(val title: String, val usd: String, val delta: String?, val dir: Int, val sales: String, val series: List<Double>, val flags: List<String>)

    /** Revenue for [day] (the last 24 hours when there is one) against the window before it, with the longer snapshot's daily trend. */
    fun money(day: JsonObject, week: JsonObject, days: Int, isDay: Boolean): Money {
        val m = day.obj("external").obj("money")?.takeIf { it.isOk() }
        val usd = m.at("revenue").num("usd")
        val delta = change(usd, m.at("prior").num("usd"))
        val count = m.at("revenue").num("count")?.toInt()
        val avg = m.at("revenue").num("avgUsd")?.takeIf { (count ?: 0) > 0 }
        val flags = listOfNotNull(
            m.num("refundsUsd")?.takeIf { it > 0 }?.let { "$" + fmt(it, 0) + " refunded" },
            m.obj("paypal").num("disputesOpen")?.toInt()?.takeIf { it > 0 }?.let { plural(it, "PayPal dispute") + " open" }
        )
        val series = week.obj("external").obj("money").objs("daily").map { it.num("usd") ?: 0.0 }
        return Money(if (isDay || days == 1) "Money · last 24 hours" else "Money · last $days days", if (usd == null) "—" else "$" + fmt(usd, 0), delta, dirOf(delta),
            listOfNotNull(count?.let { plural(it, "sale") }, avg?.let { "avg $" + fmt(it, 0) }).joinToString(" · ").ifEmpty { "No sales data" }, series, flags)
    }

    /** The 1-day snapshot for Money today, or the main one when it is already a day or the day is missing; the flag says which. */
    fun day(context: Context, snap: JsonObject): Pair<JsonObject, Boolean> {
        val app = context.applicationContext as JarvisApp
        if (days(app) == 1 || BuildConfig.DEBUG && File(app.filesDir, "jarvis/fixture.json").exists()) return (snap.obj("day") ?: snap) to (days(app) == 1 || snap.obj("day") != null)
        return app.api.saved("snapshot", 1)?.json?.let { it to true } ?: (snap to false)
    }

    /** A labelled value with its level colour, for the list widgets; [at] orders timed rows. */
    data class Line(val label: String, val value: String, val level: String, val at: Long = 0)

    /** Uptime, page speed, CI on main, the last deploy and the TLS certificate, in that order; rows without data are left out. */
    fun health(snap: JsonObject, now: Long): List<Line> {
        val ext = snap.obj("external")
        val pages = ext.obj("uptime").objs("pages")
        val up = pages.count { it.bool("ok") == true }
        val ms = pages.mapNotNull { it.num("ms") }.takeIf { it.isNotEmpty() }?.average()
        val speeds = ext.obj("speed").objs("pages").mapNotNull { p -> p.num("score")?.let { (p.str("name") ?: "") to if (it <= 1) it * 100 else it } }
        val ci = ext.obj("github").objs("ci")
        val failing = ci.filter { it.str("conclusion") !in setOf("success", "skipped", null) }
        val deploy = ci.firstOrNull { (it.str("name") ?: "").contains("deploy", ignoreCase = true) }
        val tls = ext.obj("uptime").num("tlsDaysLeft")
        return listOfNotNull(
            pages.takeIf { it.isNotEmpty() }?.let { Line("Uptime", "$up/${it.size} up" + (ms?.let { m -> " · " + fmt(m, 0) + " ms" } ?: ""), if (up == it.size) "good" else "alert") },
            speeds.takeIf { it.isNotEmpty() }?.let { s ->
                val low = s.minBy { it.second }
                Line("Speed", "avg " + fmt(s.map { it.second }.average(), 0) + " · lowest " + low.first + " " + fmt(low.second, 0), if (low.second < 50) "alert" else if (low.second < 90) "warn" else "good")
            },
            ci.takeIf { it.isNotEmpty() }?.let { Line("CI on main", if (failing.isEmpty()) "all ${it.size} passing" else "${failing.size} failing: " + failing.joinToString(", ") { f -> f.str("name") ?: "?" }, if (failing.isEmpty()) "good" else "alert") },
            (deploy ?: ci.maxByOrNull { it.str("at").orEmpty() })?.let { r -> rel(r.str("at"), now)?.let { Line(if (deploy != null) "Last deploy" else "Last CI run", it, "info") } },
            tls?.let { Line("TLS", fmt(it, 0) + " days left", if (it < 5) "alert" else if (it < 14) "warn" else "good") }
        )
    }

    data class Queue(val count: Int, val rows: List<Line>)

    /** The next post on each channel, soonest first, and how many are scheduled in all. */
    fun social(snap: JsonObject, now: Long): Queue {
        val s = snap.obj("external").obj("social")?.takeIf { it.isOk() }
        val rows = s.objs("queue").mapNotNull { q ->
            val next = q.objs("next").firstOrNull() ?: return@mapNotNull null
            val at = next.str("at")
            Line(q.str("name") ?: q.str("channel") ?: "?", listOfNotNull(rel(at, now), next.str("post")).joinToString(" · "), "info", epoch(at) ?: Long.MAX_VALUE)
        }.sortedBy { it.at }
        return Queue(s.at("scheduled").num("count")?.toInt() ?: s.objs("queue").sumOf { it.num("scheduled")?.toInt() ?: 0 }, rows)
    }

    /** Scheduled jobs still to run and the next social post, soonest first; a job whose last run failed is pink. */
    fun next(snap: JsonObject, now: Long): List<Line> {
        val ext = snap.obj("external")
        val jobs = ext.obj("jobs").objs("jobs").mapNotNull { j ->
            val at = epoch(j.str("nextRun"))?.takeIf { it >= now - 60_000 } ?: return@mapNotNull null
            Line(humanize(j.str("name") ?: "?"), rel(j.str("nextRun"), now) ?: "", if (j.bool("ok") == false) "alert" else "good", at)
        }
        val post = ext.obj("social").obj("scheduled").str("next")?.let { iso -> epoch(iso)?.takeIf { it >= now }?.let { Line("Next social post", rel(iso, now) ?: "", "info", it) } }
        return (jobs + listOfNotNull(post)).sortedBy { it.at }
    }

    data class Funnel(val stages: List<Pair<String, Double>>, val note: String?)

    /** Reviewed sites, then each Instantly stage that has a number, and the plan's next milestone. */
    fun pipeline(snap: JsonObject): Funnel {
        val o = snap.obj("external").obj("outreach")?.takeIf { it.isOk() }
        val i = o.obj("instantly")
        val stages = listOf("Reviewed" to o.obj("pipeline").num("reviews"), "Contacted" to (i.num("contacted") ?: i.num("sent")), "Opened" to i.num("opened"),
            "Replied" to i.num("replies"), "Interested" to i.num("interested"), "Meetings" to i.num("meetings"))
            .mapNotNull { (k, v) -> v?.let { k to it } }
        val next = o.obj("plan").obj("next")
        val note = next.str("label")?.let { label -> "Next: " + label + (next.num("daysLeft")?.toInt()?.let { d -> if (d <= 0) " today" else if (d == 1) " tomorrow" else " in $d days" } ?: "") }
        return Funnel(stages, note)
    }

    data class MarketingCard(val headline: String?, val lines: List<Line>)

    /** Days to the first cold email, then what waits for Carlos (leads to upload, replies, LinkedIn) and what came back (#1729). */
    fun marketing(snap: JsonObject, now: Long, today: java.time.LocalDate = java.time.LocalDate.now()): MarketingCard {
        val ext = snap.obj("external")
        val sy = ext.obj("marketing-sync")?.takeIf { it.isOk() }
        val mail = ext.obj("outreach").obj("instantly")?.takeIf { it.isOk() }
        val first = ext.obj("marketing").obj("campaigns").str("firstStart")?.let { d -> runCatching { java.time.temporal.ChronoUnit.DAYS.between(today, java.time.LocalDate.parse(d.take(10))) }.getOrNull() }
        val headline = when { first == null -> null; first > 1 -> "First emails in $first days"; first == 1L -> "First emails tomorrow"; first == 0L -> "First emails go out today"; else -> null }
        val weeks = Marketing.weeks(sy)
        val replies = Marketing.repliesToAnswer(sy).size
        val li = sy.obj("linkedin").objs("items")
        val liSent = li.count { it.bool("sent") == true }
        val lines = buildList {
            if (weeks.isNotEmpty()) {
                val ready = weeks.sumOf { it.ready }
                add(Line("To upload", if (ready > 0) "$ready approved" else "${weeks.sumOf { it.complete - it.approved - it.uploaded }.coerceAtLeast(0)} to approve", if (ready > 0) "warn" else "info"))
            }
            if (sy != null) add(Line("Replies", if (replies > 0) "$replies to answer" else "none waiting", if (replies > 0) "alert" else "good"))
            if (li.isNotEmpty()) add(Line("LinkedIn", "$liSent / ${li.size} sent", if (liSent < li.size) "warn" else "good"))
            if (mail != null) add(Line("Sent", "${fmt(mail.num("sent"), 0)} · ${fmt(mail.num("replies"), 0)} replies · ${fmt(mail.num("meetings"), 0)} meetings", "info"))
            if (sy != null) add(Line("Mac sync", rel(sy.str("at"), now) ?: "never", if (sy.bool("stale") == true) "alert" else "good"))
        }
        return MarketingCard(headline, lines)
    }

    data class Traffic(val label: String, val value: String, val delta: String?, val dir: Int, val series: List<Double>, val countries: List<Pair<String, String>>, val sources: List<Pair<String, String>>)

    /** Google Analytics sessions against the window before, top countries and sources; Cloudflare visitors when Analytics is down. */
    fun traffic(snap: JsonObject): Traffic {
        val ext = snap.obj("external")
        fun top(list: List<JsonObject>) = list.sortedByDescending { it.num("value") ?: 0.0 }.take(3).map { (it.str("label") ?: "?") to fmt(it.num("value"), 0) }
        val ga = ext.obj("ga4")?.takeIf { it.isOk() && it.objs("groups").isNotEmpty() }
        if (ga != null) {
            val now = ga.objs("groups").sumOf { it.num("sessions") ?: 0.0 }
            val delta = change(now, ga.objs("groups").sumOf { it.num("priorSessions") ?: 0.0 })
            return Traffic("Sessions", fmt(now, 0), delta, dirOf(delta), ga.objs("daily").map { it.num("sessions") ?: 0.0 }, top(ga.objs("countries")), top(ga.objs("sources")))
        }
        val cf = ext.obj("cloudflare")?.takeIf { it.isOk() }
        return Traffic("Visitors", fmt(cf.num("uniques"), 0), null, 0, cf.objs("daily").map { it.num("uniques") ?: it.num("requests") ?: 0.0 }, top(cf.objs("countries")), emptyList())
    }

    /** What a Pick a number widget can show, keyed by what is stored for it. */
    val PICKS = listOf("revenue" to "Revenue", "sales" to "Sales", "readiness" to "Readiness", "alerts" to "Alerts", "needs" to "Waiting for you",
        "reviews" to "Reviews", "cv" to "CV visits", "outreach" to "Outreach reviewed", "sessions" to "Sessions", "queued" to "Social queued")

    data class Pick(val label: String, val value: String, val sub: String?, val level: String, val tab: String)

    fun pick(key: String, snap: JsonObject, day: JsonObject, needs: Int, days: Int): Pick {
        val window = if (days == 1) "24 h" else "$days days"
        val money = day.obj("external").obj("money")?.takeIf { it.isOk() }
        val st = status(snap)
        fun product(k: String, label: String): Pick {
            val kpi = snap.obj("products").obj(k).objs("kpis").firstOrNull()
            return Pick(label, kpi?.prim("value").text(), listOfNotNull(kpi?.str("delta"), window).joinToString(" · "), if (kpi?.str("delta")?.startsWith("-") == true) "alert" else "info", "products:$k")
        }
        return when (key) {
            "sales" -> Pick("Sales", money.at("revenue").num("count")?.let { fmt(it, 0) } ?: "—", "24 h", "info", "business")
            "readiness" -> Pick("Readiness", st.readiness?.let { fmt(it, 0) + "%" } ?: "—", st.headline, if (st.alerts > 0) "alert" else if (st.warns > 0) "warn" else "good", "overview")
            "alerts" -> Pick("Alerts", (st.alerts + st.warns).toString(), st.headline, if (st.alerts > 0) "alert" else if (st.warns > 0) "warn" else "good", "overview")
            "needs" -> Pick("Waiting for you", needs.toString(), "notices and picks", if (needs > 0) "warn" else "good", "products:outreach")
            "reviews" -> product("review", "Reviews")
            "cv" -> product("cv", "CV visits")
            "outreach" -> Pick("Outreach reviewed", snap.obj("external").obj("outreach").obj("pipeline").prim("reviews").text(), window, "info", "products:outreach")
            "sessions" -> traffic(snap).let { Pick(it.label, it.value, listOfNotNull(it.delta, window).joinToString(" · "), if (it.dir < 0) "alert" else "info", "traffic") }
            "queued" -> Pick("Social queued", social(snap, 0).count.toString(), "scheduled posts", "info", "products:hub")
            else -> money.at("revenue").num("usd").let { usd -> Pick("Revenue", if (usd == null) "—" else "$" + fmt(usd, 0), "24 h", "good", "business") }
        }
    }

    /** "in 35 min", "2 h ago" and so on, from an ISO time; null when it cannot be read. */
    fun rel(iso: String?, now: Long): String? {
        val at = epoch(iso) ?: return null
        val min = (at - now) / 60_000
        val size = kotlin.math.abs(min)
        val span = when { size < 1 -> return "now"; size < 60 -> "$size min"; size < 48 * 60 -> "${size / 60} h"; else -> "${size / 1440} d" }
        return if (min > 0) "in $span" else "$span ago"
    }

    private fun epoch(iso: String?) = iso?.takeIf { it.isNotBlank() }?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }

    private fun humanize(name: String) = name.replace(Regex("([a-z])([A-Z])"), "$1 $2").replace('-', ' ').lowercase().replaceFirstChar { it.uppercase() }

    /** A product chip opens Products on that chip; anything else is a tab name. */
    private fun route(target: String) = if (CHIPS.any { it.first == target }) "products:$target" else target

    /** The notices and social picks behind Needs you, as last fetched; a debug fixture carries them as "notices" and "socialHub". */
    fun waiting(context: Context, snap: JsonObject): Pair<JsonObject?, JsonObject?> {
        val app = context.applicationContext as JarvisApp
        if (BuildConfig.DEBUG && File(app.filesDir, "jarvis/fixture.json").exists()) return snap.obj("notices") to snap.obj("socialHub")
        return app.api.saved("notices", 1)?.json to app.api.saved("social-proposals", 1)?.json
    }

    /** Fetches a fresh snapshot in the background and redraws every surface; false when signed out or offline. */
    suspend fun refresh(context: Context): Boolean {
        val app = context.applicationContext as JarvisApp
        if (!app.auth.signedIn) return false
        val ok = runCatching { app.api.fetch("snapshot", days(app)) }.isSuccess
        if (days(app) != 1) runCatching { app.api.fetch("snapshot", 1) }
        runCatching { app.api.fetch("notices", 1) }
        runCatching { app.api.fetch("social-proposals", 1) }
        redraw(context)
        return ok
    }

    suspend fun redraw(context: Context) {
        runCatching { NeedsWidget().updateAll(context) }
        runCatching { AlertsWidget().updateAll(context) }
        runCatching { MoneyWidget().updateAll(context) }
        runCatching { HealthWidget().updateAll(context) }
        runCatching { SocialWidget().updateAll(context) }
        runCatching { NextWidget().updateAll(context) }
        runCatching { PipelineWidget().updateAll(context) }
        runCatching { MarketingWidget().updateAll(context) }
        runCatching { TrafficWidget().updateAll(context) }
        runCatching { PickWidget().updateAll(context) }
        runCatching { StatusWidget().updateAll(context) }
        runCatching { NumbersWidget().updateAll(context) }
        runCatching { GoalsWidget().updateAll(context) }
        runCatching { TileService.requestListeningState(context, ComponentName(context, StatusTile::class.java)) }
        val today = today(context.applicationContext as JarvisApp)
        Ongoing.show(context, today)
        Watch.sync(context, today)
    }

    /** The one-day snapshot behind "today" figures, fetched at most once per redraw and only when asked for. */
    private fun today(app: JarvisApp): suspend () -> JsonObject? {
        var loaded = false
        var day: JsonObject? = null
        return {
            if (!loaded) {
                loaded = true
                val snap = snapshot(app)?.first
                day = if (snap == null || Home.days(app) == 1 || !app.auth.signedIn) snap
                    else app.api.saved("snapshot", 1)?.takeIf { System.currentTimeMillis() - it.at < 10 * 60_000 }?.json
                        ?: runCatching { app.api.fetch("snapshot", 1).json }.getOrNull() ?: app.api.saved("snapshot", 1)?.json
            }
            day
        }
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
    /** [after] opens once the launcher has placed the widget, with its EXTRA_APPWIDGET_ID filled in. */
    fun pin(context: Context, receiver: Class<*>, after: Intent? = null) {
        // Android 15 blocks the launcher from starting `after` unless the creator opts in.
        val options = if (Build.VERSION.SDK_INT >= 35) android.app.ActivityOptions.makeBasic()
            .setPendingIntentCreatorBackgroundActivityStartMode(android.app.ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED).toBundle() else null
        val callback = after?.let { android.app.PendingIntent.getActivity(context, receiver.name.hashCode(), it, android.app.PendingIntent.FLAG_CANCEL_CURRENT or android.app.PendingIntent.FLAG_MUTABLE, options) }
        AppWidgetManager.getInstance(context).requestPinAppWidget(ComponentName(context, receiver), null, callback)
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
