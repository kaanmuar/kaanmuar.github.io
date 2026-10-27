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
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
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
import com.carlosandmunoz.jarvis.AssistActivity
import com.carlosandmunoz.jarvis.ConfirmActivity
import com.carlosandmunoz.jarvis.PickPostActivity
import com.carlosandmunoz.jarvis.ShareActivity
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
        Column(GlanceModifier.fillMaxWidth().defaultWeight(), content = content)
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
    val fits = ((LocalSize.current.height.value - 44) / 34).toInt().coerceIn(1, 9)
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
    val fits = ((LocalSize.current.height.value - 64) / 32).toInt().coerceIn(1, 7)
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

// ---------------------------------------------------------------- Ask Jarvis bar

class AskWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) = provideContent { AskBody() }
}

class AskWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = AskWidget() }

@Composable
private fun AskBody() {
    val context = LocalContext.current
    val ask = Intent(context, AssistActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val review = Intent(context, ShareActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val post = Intent(context, PickPostActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) { Row(
        GlanceModifier.fillMaxWidth().height(56.dp).cornerRadius(28.dp).background(ImageProvider(R.drawable.widget_glass)).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(GlanceModifier.defaultWeight().fillMaxHeight().clickable(actionStartActivity(ask)), verticalAlignment = Alignment.CenterVertically) {
            Image(ImageProvider(R.drawable.widget_cube), null, GlanceModifier.size(18.dp))
            Spacer(GlanceModifier.width(10.dp))
            Text("Ask Jarvis…", style = TextStyle(color = color(Art.MUTED), fontSize = 14.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
            Image(ImageProvider(R.drawable.widget_mic), "Ask by voice", GlanceModifier.size(22.dp))
        }
        Spacer(GlanceModifier.width(14.dp))
        Image(ImageProvider(R.drawable.widget_review), "Review a URL", GlanceModifier.size(22.dp).clickable(actionStartActivity(review)))
        Spacer(GlanceModifier.width(14.dp))
        Image(ImageProvider(R.drawable.widget_post), "Post a photo or video", GlanceModifier.size(22.dp).clickable(actionStartActivity(post)))
    } }
}

// ---------------------------------------------------------------- Money today

class MoneyWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        val days = Home.days(context.applicationContext as com.carlosandmunoz.jarvis.JarvisApp)
        val money = saved?.let { val (day, isDay) = Home.day(context, it.first); Home.money(day, it.first, days, isDay) }
        provideContent { MoneyBody(saved, money, days) }
    }
}

class MoneyWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = MoneyWidget() }

@Composable
private fun MoneyBody(saved: Pair<JsonObject, Long>?, money: Home.Money?, days: Int) {
    val context = LocalContext.current
    val open = Home.open(context, "business")
    if (saved == null || money == null) return SignedOut(open, "Money")
    val size = LocalSize.current
    val sparkW = size.width - 28.dp
    val sparkH = (size.height - 44.dp - 80.dp - (money.flags.size * 15).dp).coerceAtLeast(0.dp)
    Glass(open, money.title) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(money.usd, style = TextStyle(color = color(Art.TEXT), fontSize = 28.sp, fontWeight = FontWeight.Bold), maxLines = 1)
            if (money.delta != null) {
                Spacer(GlanceModifier.width(8.dp))
                Text(money.delta, style = TextStyle(color = color(when (money.dir) { 1 -> Art.GREEN; -1 -> Art.PINK; else -> Art.MUTED }), fontSize = 13.sp, fontWeight = FontWeight.Medium), maxLines = 1)
            }
        }
        Text(money.sales + " · updated " + ago(saved.second), style = Muted, maxLines = 1)
        money.flags.forEach { Text(it, style = TextStyle(color = color(Art.AMBER), fontSize = 11.sp), maxLines = 1) }
        if (money.series.size > 1 && sparkH > 16.dp) {
            Spacer(GlanceModifier.height(4.dp))
            Image(ImageProvider(Art.sparkline(context.px(sparkW), context.px(sparkH), money.series, Art.GREEN)), "Daily revenue, last $days days", GlanceModifier.width(sparkW).height(sparkH))
            Text("Daily revenue, last $days days", style = TextStyle(color = color(Art.DIM), fontSize = 10.sp), maxLines = 1)
        }
    }
}

/** One label-and-value row of the list widgets, the value in its level colour. */
@Composable
private fun LineRow(line: Home.Line, labelWidth: Dp = 84.dp, dot: Boolean = false) =
    Row(GlanceModifier.fillMaxWidth().height(24.dp), verticalAlignment = Alignment.CenterVertically) {
        if (dot) {
            Text("●", style = TextStyle(color = color(Art.level(line.level)), fontSize = 9.sp))
            Spacer(GlanceModifier.width(8.dp))
            Text(line.label, style = TextStyle(color = color(Art.TEXT), fontSize = 12.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
            Text(line.value, style = TextStyle(color = color(Art.CYAN), fontSize = 11.sp, fontFamily = FontFamily.Monospace), maxLines = 1)
        } else {
            Text(line.label, style = TextStyle(color = color(Art.MUTED), fontSize = 11.sp), maxLines = 1, modifier = GlanceModifier.width(labelWidth))
            Text(line.value, style = TextStyle(color = color(if (line.level == "info") Art.TEXT else Art.level(line.level)), fontSize = 12.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
        }
    }

/** Rows that fit the widget, at most nine so a trailing link still fits Glance's ten children per Column. */
private fun fits(height: Dp, used: Int, row: Int) = ((height.value - used) / row).toInt().coerceIn(1, 9)

// ---------------------------------------------------------------- Site health

class HealthWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { HealthBody(saved, saved?.let { Home.health(it.first, System.currentTimeMillis()) }.orEmpty()) }
    }
}

class HealthWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = HealthWidget() }

@Composable
private fun HealthBody(saved: Pair<JsonObject, Long>?, lines: List<Home.Line>) {
    val open = Home.open(LocalContext.current, "systems")
    if (saved == null) return SignedOut(open, "Site health")
    Glass(open, "Site health") {
        if (lines.isEmpty()) Text("No health data in the last snapshot.", style = Muted)
        lines.take(fits(LocalSize.current.height, 44, 24)).forEach { LineRow(it) }
    }
}

// ---------------------------------------------------------------- Social queue

class SocialWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { SocialBody(saved, saved?.let { Home.social(it.first, System.currentTimeMillis()) }) }
    }
}

class SocialWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = SocialWidget() }

@Composable
private fun SocialBody(saved: Pair<JsonObject, Long>?, queue: Home.Queue?) {
    val context = LocalContext.current
    val open = Home.open(context, "products:hub")
    if (saved == null || queue == null) return SignedOut(open, "Social queue")
    Glass(open, "Social · ${queue.count} queued") {
        if (queue.rows.isEmpty()) Text("Nothing scheduled. Approve picks or share a post to fill the queue.", style = Muted, maxLines = 2)
        queue.rows.take(fits(LocalSize.current.height, 70, 24)).forEach { LineRow(it, 76.dp) }
        if (queue.count > 0) Row(GlanceModifier.fillMaxWidth()) {
            Spacer(GlanceModifier.defaultWeight())
            val post = ConfirmActivity.intent(context, Home.Need("post", "queue", "Post the queue now", Home.plural(queue.count, "scheduled post"), "info"))
            Text("Post now ›", style = TextStyle(color = color(Art.CYAN), fontSize = 11.sp, fontFamily = FontFamily.Monospace),
                modifier = GlanceModifier.padding(top = 4.dp, start = 12.dp, bottom = 2.dp).clickable(actionStartActivity(post)))
        }
    }
}

// ---------------------------------------------------------------- Next up

class NextWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { NextBody(saved, saved?.let { Home.next(it.first, System.currentTimeMillis()) }.orEmpty()) }
    }
}

class NextWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = NextWidget() }

@Composable
private fun NextBody(saved: Pair<JsonObject, Long>?, lines: List<Home.Line>) {
    val open = Home.open(LocalContext.current, "systems")
    if (saved == null) return SignedOut(open, "Next up")
    Glass(open, "Next up") {
        if (lines.isEmpty()) Text("No scheduled runs ahead in the last snapshot.", style = Muted, maxLines = 2)
        lines.take(fits(LocalSize.current.height, 44, 24)).forEach { LineRow(it, dot = true) }
    }
}

// ---------------------------------------------------------------- Outreach pipeline

class PipelineWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { PipelineBody(saved, saved?.let { Home.pipeline(it.first) }) }
    }
}

class PipelineWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = PipelineWidget() }

@Composable
private fun PipelineBody(saved: Pair<JsonObject, Long>?, funnel: Home.Funnel?) {
    val context = LocalContext.current
    val open = Home.open(context, "products:outreach")
    if (saved == null || funnel == null) return SignedOut(open, "Outreach pipeline")
    val barW = LocalSize.current.width - 28.dp
    val top = funnel.stages.firstOrNull()?.second?.takeIf { it > 0 } ?: 1.0
    Glass(open, "Outreach pipeline") {
        if (funnel.stages.isEmpty()) Text("No outreach numbers in the last snapshot.", style = Muted)
        // Glance drops a Column's children past the tenth, so each stage is one child.
        funnel.stages.take(fits(LocalSize.current.height, if (funnel.note != null) 62 else 46, 27)).forEach { (label, value) ->
            Column(GlanceModifier.fillMaxWidth().padding(bottom = 3.dp)) {
                Row(GlanceModifier.fillMaxWidth()) {
                    Text(label, style = TextStyle(color = color(Art.MUTED), fontSize = 11.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                    Text(com.carlosandmunoz.jarvis.data.fmt(value, 0), style = TextStyle(color = color(Art.TEXT), fontSize = 11.sp, fontFamily = FontFamily.Monospace), maxLines = 1)
                }
                Image(ImageProvider(Art.glowBar(context.px(barW), context.px(8.dp), (value / top).coerceIn(0.0, 1.0), Art.CYAN)), null, GlanceModifier.width(barW).height(8.dp))
            }
        }
        if (funnel.note != null) Text(funnel.note, style = TextStyle(color = color(Art.VIOLET), fontSize = 11.sp), maxLines = 1)
    }
}

// ---------------------------------------------------------------- Marketing

class MarketingWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        provideContent { MarketingBody(saved, saved?.let { Home.marketing(it.first, System.currentTimeMillis()) }) }
    }
}

class MarketingWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = MarketingWidget() }

@Composable
private fun MarketingBody(saved: Pair<JsonObject, Long>?, card: Home.MarketingCard?) {
    val open = Home.open(LocalContext.current, "products:marketing")
    if (saved == null || card == null) return SignedOut(open, "Marketing")
    Glass(open, "Marketing") {
        if (card.headline != null) Text(card.headline, style = TextStyle(color = color(Art.VIOLET), fontSize = 15.sp, fontWeight = FontWeight.Bold), maxLines = 1,
            modifier = GlanceModifier.padding(bottom = 4.dp))
        if (card.lines.isEmpty()) Text("No marketing numbers in the last snapshot.", style = Muted, maxLines = 2)
        card.lines.take(fits(LocalSize.current.height, if (card.headline != null) 68 else 44, 24)).forEach { LineRow(it, 70.dp) }
    }
}

// ---------------------------------------------------------------- Traffic

class TrafficWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val saved = Home.snapshot(context)
        val days = Home.days(context.applicationContext as com.carlosandmunoz.jarvis.JarvisApp)
        provideContent { TrafficBody(saved, saved?.let { Home.traffic(it.first) }, days) }
    }
}

class TrafficWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = TrafficWidget() }

@Composable
private fun TrafficBody(saved: Pair<JsonObject, Long>?, t: Home.Traffic?, days: Int) {
    val context = LocalContext.current
    val open = Home.open(context, "traffic")
    if (saved == null || t == null) return SignedOut(open, "Traffic")
    val size = LocalSize.current
    val half = (size.width - 28.dp - 12.dp) / 2
    Glass(open, if (days == 1) "Traffic · last 24 hours" else "Traffic · last $days days") {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(GlanceModifier.width(half)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(t.value, style = TextStyle(color = color(Art.TEXT), fontSize = 22.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                    if (t.delta != null) {
                        Spacer(GlanceModifier.width(6.dp))
                        Text(t.delta, style = TextStyle(color = color(when (t.dir) { 1 -> Art.GREEN; -1 -> Art.PINK; else -> Art.MUTED }), fontSize = 11.sp), maxLines = 1)
                    }
                }
                Text(t.label, style = Muted, maxLines = 1)
            }
            Spacer(GlanceModifier.width(12.dp))
            if (t.series.size > 1) Image(ImageProvider(Art.sparkline(context.px(half), context.px(36.dp), t.series)), "Daily ${t.label.lowercase()}", GlanceModifier.width(half).height(36.dp))
        }
        if (size.height > 150.dp) {
            Spacer(GlanceModifier.height(6.dp))
            Row(GlanceModifier.fillMaxWidth()) {
                listOf("Countries" to t.countries, "Sources" to t.sources).filter { it.second.isNotEmpty() }.forEachIndexed { i, (title, rows) ->
                    if (i > 0) Spacer(GlanceModifier.width(12.dp))
                    Column(GlanceModifier.width(half)) {
                        Text(title.uppercase(), style = TextStyle(color = color(Art.DIM), fontSize = 9.sp, fontFamily = FontFamily.Monospace), maxLines = 1)
                        rows.forEach { (label, value) ->
                            Row(GlanceModifier.fillMaxWidth()) {
                                Text(label, style = TextStyle(color = color(Art.TEXT), fontSize = 11.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                                Text(value, style = TextStyle(color = color(Art.MUTED), fontSize = 11.sp, fontFamily = FontFamily.Monospace), maxLines = 1)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Pick a number

class PickWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val app = context.applicationContext as com.carlosandmunoz.jarvis.JarvisApp
        val key = app.vault.get("pick." + androidx.glance.appwidget.GlanceAppWidgetManager(context).getAppWidgetId(id)) ?: "revenue"
        val saved = Home.snapshot(context)
        val pick = saved?.let {
            val needs = Home.waiting(context, it.first).let { (n, p) -> Home.needs(it.first, n, p).count { x -> x.kind != "proposal" } }
            Home.pick(key, it.first, Home.day(context, it.first).first, needs, Home.days(app))
        }
        provideContent { PickBody(pick) }
    }
}

class PickWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget = PickWidget() }

@Composable
private fun PickBody(pick: Home.Pick?) {
    val context = LocalContext.current
    val small = LocalSize.current.width < 140.dp
    Column(
        GlanceModifier.fillMaxSize().cornerRadius(20.dp).background(ImageProvider(R.drawable.widget_glass)).padding(10.dp)
            .clickable(actionStartActivity(Home.open(context, pick?.tab ?: "overview"))),
        horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically
    ) {
        Text((pick?.label ?: "Jarvis").uppercase(), style = TextStyle(color = color(Art.CYAN), fontSize = 9.sp, fontFamily = FontFamily.Monospace), maxLines = 1)
        Text(pick?.value ?: "—", style = TextStyle(color = color(Art.TEXT), fontSize = if (small) 24.sp else 30.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        Text(pick?.sub ?: "Sign in to Jarvis", style = TextStyle(color = color(if (pick == null || pick.level == "info") Art.MUTED else Art.level(pick.level)), fontSize = 10.sp), maxLines = 1)
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
