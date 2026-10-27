package com.carlosandmunoz.jarvis.home

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateUtils
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.carlosandmunoz.jarvis.ConfirmActivity
import com.carlosandmunoz.jarvis.R
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.serialization.json.JsonObject

private fun color(argb: Int) = ColorProvider(Color(argb))
private val Muted = TextStyle(color = color(Art.MUTED), fontSize = 11.sp)
private fun Context.px(dp: Dp) = (dp.value * resources.displayMetrics.density).roundToInt().coerceAtLeast(1)
private fun ago(at: Long) = if (System.currentTimeMillis() - at < 60_000) "just now"
    else DateUtils.getRelativeTimeSpanString(at, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()

/** The glass card every widget sits in: gradient fill, cyan hairline border and corner brackets (drawable/widget_glass). */
@Composable
private fun Glass(open: Intent, title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        GlanceModifier.fillMaxSize().cornerRadius(20.dp).background(ImageProvider(R.drawable.widget_glass)).padding(horizontal = 14.dp, vertical = 12.dp)
            .clickable(actionStartActivity(open))
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(ImageProvider(R.drawable.widget_cube), null, GlanceModifier.size(12.dp))
            Spacer(GlanceModifier.width(6.dp))
            Text(title.uppercase(), style = TextStyle(color = color(Art.CYAN), fontSize = 10.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium))
        }
        Spacer(GlanceModifier.height(6.dp))
        content()
    }
}

@Composable
private fun SignedOut(open: Intent, title: String) = Glass(open, title) {
    Text("Sign in to Jarvis", style = TextStyle(color = color(Art.TEXT), fontSize = 14.sp, fontWeight = FontWeight.Medium))
    Text("Widgets fill in after the first refresh.", style = Muted)
}

// ---------------------------------------------------------------- Status

class StatusWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { StatusBody(saved) }
    }
}

class StatusWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = StatusWidget() }

@Composable
private fun StatusBody(saved: Pair<JsonObject, Long>?) {
    val context = LocalContext.current
    val open = Home.open(context, "overview")
    if (saved == null) return SignedOut(open, "Jarvis")
    val st = Home.status(saved.first)
    val size = LocalSize.current
    val wide = size.width > 200.dp
    val dial = if (wide) min(size.height.value - 44, 110f).dp else min(size.width.value - 28, size.height.value - 82).coerceAtLeast(48f).dp
    val headColor = if (st.alerts > 0) Art.PINK else if (st.warns > 0) Art.AMBER else Art.GREEN
    Glass(open, "Jarvis") {
        val reactor = @Composable { Image(ImageProvider(Art.reactor(context.px(dial), st.readiness, "READY")), "Readiness", GlanceModifier.size(dial)) }
        val words = @Composable {
            Text(st.headline, style = TextStyle(color = color(headColor), fontSize = 15.sp, fontWeight = FontWeight.Bold), maxLines = 2)
            Text("Updated " + ago(saved.second), style = Muted, maxLines = 1)
        }
        if (wide) Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            reactor()
            Spacer(GlanceModifier.width(12.dp))
            Column { words() }
        } else Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            reactor()
            Spacer(GlanceModifier.height(4.dp))
            words()
        }
    }
}

// ---------------------------------------------------------------- Key numbers

class NumbersWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        val days = Home.days(context.applicationContext as com.carlosandmunoz.jarvis.JarvisApp)
        provideContent { NumbersBody(saved, days) }
    }
}

class NumbersWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = NumbersWidget() }

@Composable
private fun NumbersBody(saved: Pair<JsonObject, Long>?, days: Int) {
    val context = LocalContext.current
    val open = Home.open(context, "overview")
    val title = if (days == 1) "Last 24 hours" else "Last $days days"
    if (saved == null) return SignedOut(open, title)
    val cells = Home.numbers(saved.first)
    val size = LocalSize.current
    val cellW = (size.width - 28.dp - 10.dp) / 2
    val rowH = (size.height - 44.dp) / 2
    Glass(open, title) {
        cells.chunked(2).forEach { pair ->
            Row(GlanceModifier.fillMaxWidth().height(rowH)) {
                pair.forEachIndexed { i, cell ->
                    if (i > 0) Spacer(GlanceModifier.width(10.dp))
                    NumberCell(cell, cellW, rowH)
                }
            }
        }
    }
}

@Composable
private fun NumberCell(cell: Home.Cell, w: Dp, h: Dp) {
    val context = LocalContext.current
    val deltaColor = when (cell.dir) { 1 -> Art.GREEN; -1 -> Art.PINK; else -> Art.MUTED }
    Column(GlanceModifier.width(w).height(h)) {
        Text(cell.label, style = TextStyle(color = color(Art.MUTED), fontSize = 10.sp), maxLines = 1)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(cell.value, style = TextStyle(color = color(Art.TEXT), fontSize = 17.sp, fontWeight = FontWeight.Bold), maxLines = 1)
            if (cell.delta != null) {
                Spacer(GlanceModifier.width(5.dp))
                Text(cell.delta, style = TextStyle(color = color(deltaColor), fontSize = 10.sp, fontWeight = FontWeight.Medium), maxLines = 1)
            }
        }
        val sparkH = (h - 38.dp).coerceAtLeast(10.dp)
        if (cell.note != null) Text(cell.note, style = Muted, maxLines = 1)
        if (cell.series.size > 1) Image(ImageProvider(Art.sparkline(context.px(w), context.px(sparkH), cell.series)), null, GlanceModifier.width(w).height(sparkH))
    }
}

// ---------------------------------------------------------------- Needs you

class NeedsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        val needs = saved?.let { val (notices, picks) = Home.waiting(context, it.first); Home.needs(it.first, notices, picks) }
        provideContent { NeedsBody(saved, needs.orEmpty()) }
    }
}

class NeedsWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = NeedsWidget() }

@Composable
private fun NeedsBody(saved: Pair<JsonObject, Long>?, needs: List<Home.Need>) {
    val context = LocalContext.current
    val open = Home.open(context, "products:outreach")
    if (saved == null) return SignedOut(open, "Needs you")
    val decide = needs.count { it.kind != "proposal" }
    val fits = ((LocalSize.current.height.value - 44) / 34).toInt().coerceAtLeast(1)
    Glass(open, if (decide > 0) "Needs you · $decide" else "Needs you") {
        if (needs.isEmpty()) {
            Text("Nothing waiting on you", style = TextStyle(color = color(Art.GREEN), fontSize = 14.sp, fontWeight = FontWeight.Medium))
            Text("Notices, social picks and Jarvis's suggestions show up here.", style = Muted, maxLines = 2)
        }
        needs.take(fits).forEach { n ->
            val tap = if (n.kind == "proposal") Home.open(context, n.tab ?: "overview").setData(Uri.parse("jarvis://open/" + (n.tab ?: "overview") + "/" + n.id))
                else ConfirmActivity.intent(context, n)
            Row(GlanceModifier.fillMaxWidth().height(34.dp).clickable(actionStartActivity(tap)), verticalAlignment = Alignment.CenterVertically) {
                Text("●", style = TextStyle(color = color(Art.level(n.level)), fontSize = 9.sp))
                Spacer(GlanceModifier.width(8.dp))
                Column(GlanceModifier.defaultWeight()) {
                    Text(n.title, style = TextStyle(color = color(Art.TEXT), fontSize = 12.sp, fontWeight = FontWeight.Medium), maxLines = 1)
                    if (n.detail != null) Text(n.detail, style = TextStyle(color = color(Art.MUTED), fontSize = 10.sp), maxLines = 1)
                }
                Spacer(GlanceModifier.width(8.dp))
                Text(if (n.kind == "proposal") "Open ›" else "Review ›", style = TextStyle(color = color(Art.CYAN), fontSize = 10.sp, fontFamily = FontFamily.Monospace))
            }
        }
        if (needs.size > fits) Text("+${needs.size - fits} more in Jarvis", style = Muted, maxLines = 1)
    }
}

// ---------------------------------------------------------------- Alerts list

class AlertsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { AlertsBody(saved) }
    }
}

class AlertsWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = AlertsWidget() }

@Composable
private fun AlertsBody(saved: Pair<JsonObject, Long>?) {
    val context = LocalContext.current
    val open = Home.open(context, "overview")
    if (saved == null) return SignedOut(open, "Alerts")
    val st = Home.status(saved.first)
    val alerts = Home.alerts(saved.first)
    val fits = ((LocalSize.current.height.value - 64) / 32).toInt().coerceAtLeast(1)
    Glass(open, "Alerts") {
        Text(st.headline, style = TextStyle(color = color(if (st.alerts > 0) Art.PINK else if (st.warns > 0) Art.AMBER else Art.GREEN), fontSize = 13.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        Spacer(GlanceModifier.height(2.dp))
        alerts.take(fits).forEachIndexed { i, a ->
            val tap = Home.open(context, a.tab).setData(Uri.parse("jarvis://open/" + a.tab + "/alert/" + i))
            Row(GlanceModifier.fillMaxWidth().height(32.dp).clickable(actionStartActivity(tap)), verticalAlignment = Alignment.CenterVertically) {
                Text("●", style = TextStyle(color = color(Art.level(a.level)), fontSize = 9.sp))
                Spacer(GlanceModifier.width(8.dp))
                Column(GlanceModifier.defaultWeight()) {
                    Text(a.text, style = TextStyle(color = color(Art.TEXT), fontSize = 12.sp), maxLines = 1)
                    if (a.label != null) Text(a.label, style = TextStyle(color = color(Art.MUTED), fontSize = 10.sp), maxLines = 1)
                }
            }
        }
        if (alerts.size > fits) Text("+${alerts.size - fits} more in Jarvis", style = Muted, maxLines = 1)
        else if (alerts.isEmpty()) Text("Nothing in today's briefing. Updated " + ago(saved.second) + ".", style = Muted, maxLines = 2)
    }
}

// ---------------------------------------------------------------- Goals

class GoalsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { GoalsBody(saved) }
    }
}

class GoalsWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = GoalsWidget() }

@Composable
private fun GoalsBody(saved: Pair<JsonObject, Long>?) {
    val context = LocalContext.current
    val open = Home.open(context, "overview")
    if (saved == null) return SignedOut(open, "Goals")
    val goals = Home.goals(saved.first)
    val size = LocalSize.current
    val fits = ((size.height.value - 44) / 36).toInt().coerceAtLeast(1)
    val barW = size.width - 28.dp
    Glass(open, "Goals") {
        if (goals.isEmpty()) Text("No goals set. Add them in Settings on the web.", style = Muted)
        goals.take(fits).forEach { g ->
            val c = Art.level(g.status)
            Row(GlanceModifier.fillMaxWidth()) {
                Text(g.label, style = TextStyle(color = color(Art.TEXT), fontSize = 12.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                Text(com.carlosandmunoz.jarvis.data.fmt(g.value) + " / " + com.carlosandmunoz.jarvis.data.fmt(g.target),
                    style = TextStyle(color = color(c), fontSize = 11.sp, fontFamily = FontFamily.Monospace), maxLines = 1)
            }
            Image(ImageProvider(Art.glowBar(context.px(barW), context.px(12.dp), g.pct, c)), null, GlanceModifier.width(barW).height(12.dp))
            Spacer(GlanceModifier.height(8.dp))
        }
    }
}
