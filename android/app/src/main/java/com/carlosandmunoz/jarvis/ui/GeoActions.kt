package com.carlosandmunoz.jarvis.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Map: 90-day plan progress and next best actions (#3115), from the geo source's `plan` and `actions`
 * (functions/jarvis-geo-actions.js). Each button does what the country sheet already does. Web twin: js/admin-jarvis-geo-actions.js.
 */
object GeoActions {
    fun word(status: String?) = when (status) { "ahead" -> "Ahead"; "done" -> "Done"; "on-track" -> "On track"; "behind" -> "Behind"; "waiting" -> "Not started"; "no-data" -> "No data"; else -> status.orEmpty() }

    fun tone(status: String?): Color = when (status) { "ahead", "done" -> J.green; "on-track" -> J.amber; "behind" -> J.pink; "plan" -> J.cyan; else -> J.dim }

    fun level(level: String?) = when (level) { "high" -> "Now"; "mid" -> "Soon"; "low" -> "Later"; else -> level.orEmpty() }

    fun inDays(d: Int) = if (d <= 0) "today" else if (d == 1) "tomorrow" else "in $d days"

    /** The share of the target done, 0 to 100. */
    fun share(r: JsonObject): Float {
        val a = r.num("actual") ?: return 0f
        val t = r.num("target")?.takeIf { it > 0 } ?: return 0f
        return (a / t * 100).toFloat().coerceIn(0f, 100f)
    }

    /** Where the pace tick sits: a rate's target is the whole bar, a weekly count's is the week gone, a 90-day count's is today's expected. */
    fun pace(r: JsonObject, weekShare: Double?, week: Boolean): Float? {
        if (week) return if (r.str("unit").isNullOrEmpty()) weekShare?.toFloat()?.coerceIn(0f, 100f) else 100f
        val t = r.num("target")?.takeIf { it > 0 } ?: return null
        return ((r.num("expected") ?: return null) / t * 100).toFloat().coerceIn(0f, 100f)
    }

    fun amount(n: Double?, unit: String?) = if (n == null) "—" else fmt(n) + unit.orEmpty()

    /** The confirmation for a button, as the country sheet words it; null when it needs none. */
    fun ask(d: JsonObject): String? = when (d.str("type")) {
        "pause" -> "pause ${d.str("name")} now"
        "activate" -> "activate ${d.str("name")}" + (if ((d.num("leads") ?: 0.0) == 0.0) " (it has no leads yet, so nothing sends until leads are uploaded)" else "") +
            (d.str("start")?.takeIf { it.isNotEmpty() }?.let { ", sending from $it" } ?: "")
        "target" -> if (d.bool("on") == false) "drop ${d.str("cc")} as a target market" else "make ${d.str("cc")} a target market"
        "calendar-pause" -> "pause the campaigns that mostly reach ${d.str("cc")} on ${CountryDates.label(d.str("date"))} for ${d.str("name")}, and resume them the next business day"
        "confirm" -> "set ${d.str("host")}'s Live Report country to ${d.str("name")}"
        "run" -> "run ${d.str("job")} now"
        else -> null
    }

    /** The running key the button waits on, the same one the country sheet uses. */
    fun key(d: JsonObject): String = when (d.str("type")) {
        "pause", "activate" -> "mk:camp:${d.str("id")}"
        "target" -> "geo:target:${d.str("cc")}"
        "calendar-pause" -> "action:calendar:${d.str("cc")}:${d.str("date")}"
        "confirm" -> "geo:confirm:${d.str("host")}"
        "run" -> "job:${d.str("job")}"
        else -> "geo:next:${d.str("type")}"
    }

    /** A jump has no button on the phone: it names the panel above to open. */
    fun jump(panel: String?) = when (panel) { "geo-confirm" -> "Open Live Report countries to confirm, above."; "geo-plan" -> "See the Plan, above."; else -> "See the panel above." }
}

/** A progress bar on Canvas: the share done, and a tick where the pace says it should be today. */
@Composable
private fun PlanBar(share: Float, pace: Float?, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxWidth().height(8.dp)) {
        val r = CornerRadius(size.height / 2)
        drawRoundRect(color.copy(alpha = 0.12f), Offset.Zero, size, r)
        if (share > 0f) drawRoundRect(color, Offset.Zero, Size(size.width * share / 100f, size.height), r)
        pace?.let { val x = size.width * it / 100f; drawLine(J.text.copy(alpha = 0.8f), Offset(x, 0f), Offset(x, size.height), 2.dp.toPx()) }
    }
}

@Composable
private fun StatusChip(status: String?) {
    val c = GeoActions.tone(status)
    Text(GeoActions.word(status), color = c, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
        modifier = Modifier.background(c.copy(alpha = 0.12f), RoundedCornerShape(10.dp)).padding(horizontal = 7.dp, vertical = 2.dp))
}

@Composable
private fun ProgRow(r: JsonObject, pace: Float?) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(r.str("label").orEmpty(), fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text("${GeoActions.amount(r.num("actual"), r.str("unit"))} of ${GeoActions.amount(r.num("target"), r.str("unit"))}", fontSize = 13.sp, fontWeight = FontWeight.Medium)
            StatusChip(r.str("status"))
        }
        PlanBar(GeoActions.share(r), pace, GeoActions.tone(r.str("status")), Modifier.padding(top = 3.dp))
    }
}

/** The Plan section: day N of the plan, phase, next milestone, nearest deadlines, this week and the 90 days so far. */
@Composable
fun GeoPlan(g: JsonObject) {
    val p = g.obj("plan")
    val day = p?.num("day")?.toInt() ?: 0
    val length = p?.num("length")?.toInt() ?: 90
    Panel(if (p == null) "Plan" else "Plan · day ${minOf(day, length)} of $length", key = "geo-plan", id = "geo-plan") {
        if (p == null) { Muted("No 90-day plan uploaded: run node scripts/jarvis-outreach-plan.js with the private plan."); return@Panel }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(p.obj("phase")?.str("name") ?: "Day $day", fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            StatusChip(p.str("status"))
        }
        p.obj("phase")?.num("daysLeft")?.toInt()?.let { Muted(if (it > 0) "$it days left in this phase" else "This phase ends today") }
        PlanBar(minOf(day, length) * 100f / maxOf(1, length), null, J.cyan, Modifier.padding(vertical = 6.dp))
        val dates = listOfNotNull(p.obj("next")?.let { Triple("Milestone", it, J.cyan) }) + p.objs("deadlines").map { d ->
            val left = d.num("daysLeft")?.toInt() ?: 99
            Triple("Deadline", d, if (left <= 3) J.pink else if (left <= 14) J.amber else J.muted)
        }
        dates.forEach { (kind, d, c) ->
            Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(kind.uppercase(), color = c, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(70.dp))
                Column(Modifier.weight(1f)) {
                    Text(d.str("label").orEmpty(), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Muted("${CountryDates.label(d.str("date"))} · ${GeoActions.inDays(d.num("daysLeft")?.toInt() ?: 0)}")
                }
            }
        }
        val week = p.objs("week")
        if (week.isNotEmpty()) {
            Text("THIS WEEK · ${fmt(p.num("weekShare"))}% GONE", color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
            week.forEach { ProgRow(it, GeoActions.pace(it, p.num("weekShare"), true)) }
        }
        val total = p.objs("total")
        if (total.isNotEmpty()) {
            Text("90-DAY TARGETS SO FAR", color = J.amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
            total.forEach { ProgRow(it, GeoActions.pace(it, null, false)) }
        }
        Muted("Counts only: the plan text and the prospects stay private. The tick on a bar is where the pace says it should be today; rates are over the range.", Modifier.padding(top = 6.dp))
    }
}

/** The Next actions section: Gemini's line on top, then each action with its reason and one button. */
@Composable
fun GeoNext(g: JsonObject, s: UiState, vm: JarvisViewModel, open: (String) -> Unit, ask: (String, () -> Unit) -> Unit) {
    val a = g.obj("actions")
    val rows = a?.objs("rows").orEmpty()
    val total = a?.num("total")?.toInt() ?: rows.size
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    Panel("Next actions · ${rows.size}" + (if (total > rows.size) " of $total" else ""), key = "geo-next", id = "geo-next") {
        if (a == null) { Muted("Not loaded."); return@Panel }
        a.str("line")?.takeIf { it.isNotEmpty() }?.let { Text("✦ $it", color = J.violet, fontSize = 14.sp, modifier = Modifier.padding(bottom = 6.dp)) }
        if (rows.isEmpty()) Muted("Nothing to do on the map right now.")
        rows.forEachIndexed { n, r ->
            val d = r.obj("do") ?: JsonObject(emptyMap())
            val lv = r.str("level")
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${n + 1}", color = if (lv == "high") J.pink else if (lv == "mid") J.amber else J.dim, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(18.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(r.str("title").orEmpty(), fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f, fill = false))
                        Muted(GeoActions.level(lv))
                    }
                    Muted(r.str("why").orEmpty())
                    NextButton(d, s, vm, open, ask, context, uri::openUri)
                }
            }
        }
        Muted(if (a.str("ranked") == "gemini") "Ranked by Gemini ${a.str("at").orEmpty().drop(11).take(5)} UTC from the rules' list. Each button does what the country sheet does."
            else "In the rules' order: holidays soon, bounces and empty queues first. Gemini ranks them within the hour when they change. Each button does what the country sheet does.")
    }
}

@Composable
private fun NextButton(d: JsonObject, s: UiState, vm: JarvisViewModel, open: (String) -> Unit, ask: (String, () -> Unit) -> Unit, context: Context, openUri: (String) -> Unit) {
    val label = d.str("label").orEmpty()
    val key = GeoActions.key(d)
    val warn = d.str("type") == "pause" || d.str("type") == "calendar-pause"
    val run: (() -> Unit)? = when (d.str("type")) {
        "pause", "activate" -> { -> vm.market(key, "marketing-campaign", mapOf("id" to JsonPrimitive(d.str("id").orEmpty()), "action" to JsonPrimitive(d.str("type")!!), "name" to JsonPrimitive(d.str("name").orEmpty()))) { out -> "${out.str("name") ?: d.str("name")} is ${out.str("status")}." } }
        "target" -> { -> vm.market(key, "geo-target", mapOf("cc" to JsonPrimitive(d.str("cc").orEmpty()), "on" to JsonPrimitive(d.bool("on") != false))) { out -> "${d.str("cc")} is now a target market (${fmt(out.num("targets"))} in all)." } }
        "calendar-pause" -> { -> vm.act(key, "action-run", mapOf("action" to JsonPrimitive("calendar-pause"), "proposal" to JsonPrimitive(CountryDates.key("pause", d.str("cc").orEmpty(), d.str("date"))))) { out -> out.str("note") ?: out.str("ran") ?: "Done." } }
        "confirm" -> { -> vm.market(key, "geo-country-confirm", mapOf("host" to JsonPrimitive(d.str("host").orEmpty()), "cc" to JsonPrimitive(d.str("cc").orEmpty()))) { out -> "${d.str("host")}: ${out.str("name") ?: d.str("cc")}. The next daily Live Reports run updates its pages." } }
        "run" -> { -> vm.act(key, "run-job", mapOf("job" to JsonPrimitive(d.str("job").orEmpty()))) { "Started ${d.str("job")}." } }
        "open" -> { -> open(d.str("cc").orEmpty()) }
        "copy" -> { -> (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("link", d.str("copy").orEmpty())); vm.say("Copied.") }
        "link" -> { -> runCatching { openUri(d.str("url").orEmpty()) } }
        else -> null
    }
    if (run == null) { if (d.str("type") == "jump") Muted(GeoActions.jump(d.str("panel")), Modifier.padding(top = 4.dp)); return }
    val text = GeoActions.ask(d)
    TextButton({ if (text != null) ask(text, run) else run() }, enabled = key !in s.running) { Text(label, color = if (warn) J.amber else J.cyan, fontSize = 13.sp) }
}
