package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.strings
import kotlinx.serialization.json.JsonObject

/** Jarvis > URL Review > Signed-in people (#1976): who signed in, what they ran, whether they came back and for how long. */
object People {
    const val SHOWN = 10

    /** "45 s", "12 min", "1 h 20 min": the web panel's spent(). */
    fun spent(ms: Double?): String {
        val n = ms ?: 0.0
        val m = Math.round(n / 60000).toInt()
        return when {
            n < 60000 -> "${Math.round(n / 1000)} s"
            m < 60 -> "$m min"
            else -> "${m / 60} h" + if (m % 60 > 0) " ${m % 60} min" else ""
        }
    }

    /** "3 visits · back 2× · 2 days · 14 min · 1 run, 1 paid" */
    fun line(p: JsonObject): String {
        val visits = (p.num("visits") ?: 0.0).toInt()
        val returns = (p.num("returns") ?: 0.0).toInt()
        val days = (p.num("days") ?: 0.0).toInt()
        val runs = (p.num("runs") ?: 0.0).toInt()
        val paid = (p.num("paid") ?: 0.0).toInt()
        return listOfNotNull(
            "$visits visit" + if (visits == 1) "" else "s",
            if (returns > 0) "back $returns×" else null,
            if (days > 1) "$days days" else null,
            spent(p.num("activeMs")),
            "$runs run" + (if (runs == 1) "" else "s") + if (paid > 0) ", $paid paid" else ""
        ).joinToString(" · ")
    }

    fun who(p: JsonObject): String = p.str("name")?.ifEmpty { null } ?: p.str("email").orEmpty()
}

@Composable
fun PeoplePanel(s: UiState) {
    val g = s.snapshot.obj("external").obj("people")
    var all by rememberSaveable { mutableStateOf(false) }
    var open by rememberSaveable { mutableStateOf("") }
    if (g == null || !g.isOk()) { Panel("Signed-in people", id = "review-people") { Muted(g.str("error") ?: "Pull down to read the signed-in people.") }; return }
    val t = g.obj("totals")
    val people = g.objs("people").filter { it.bool("test") != true }
    Panel("Signed-in people · ${people.size}", id = "review-people") {
        KpiPairs(listOf(
            KpiData("People", fmt(t.num("people"))),
            KpiData("Seen in range", fmt(t.num("active"))),
            KpiData("New in range", fmt(t.num("new"))),
            KpiData("Came back", fmt(t.num("returning"))),
            KpiData("Visits in range", fmt(t.num("visits"))),
            KpiData("Time on site", People.spent(t.num("activeMs"))),
            KpiData("Average visit", People.spent(t.num("avgVisitMs"))),
            KpiData("Runs in range", fmt(t.num("runs")))
        ))
        if (people.isEmpty()) Muted("Nobody has signed in yet.")
        (if (all) people else people.take(People.SHOWN)).forEach { p ->
            val email = p.str("email").orEmpty()
            Column(Modifier.fillMaxWidth().clickable { open = if (open == email) "" else email }.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(People.who(p), fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Muted(listOfNotNull(if (p.str("name").isNullOrEmpty()) null else email, ago(p.str("lastSeenAt"))?.let { "seen $it" }).joinToString(" · "))
                Text(People.line(p), color = J.dim, fontSize = 12.sp)
                if (open == email) {
                    Muted("Signed up ${ago(p.str("firstAt")) ?: "—"} · ${p["providers"].strings().joinToString(", ").ifEmpty { "email" }} · ${fmt(p.num("views"))} page views · average visit ${People.spent(p.num("avgVisitMs"))}")
                    p.objs("urls").forEach { u ->
                        StatusRow(if (u.bool("paid") == true) "good" else "info", u.str("url").orEmpty().removePrefix("https://").removePrefix("http://"), listOfNotNull(ago(u.str("at")), if (u.bool("paid") == true) "paid" else u.str("status")).joinToString(" · "))
                    }
                    if (p.objs("urls").isEmpty()) Muted("No runs yet.")
                    p.objs("recent").forEach { v ->
                        KeyRow(ago(v.str("startedAt")) ?: "", "${People.spent(v.num("activeMs"))} · ${fmt(v.num("views"))} views")
                    }
                    if (p.objs("recent").isEmpty()) Muted("No visits recorded since ${g.str("since") ?: "1 Nov 2026"}.")
                }
            }
        }
        if (people.size > People.SHOWN) TextButton({ all = !all }) { Text(if (all) "Show fewer" else "Show all ${people.size}", color = J.cyan, fontSize = 13.sp) }
        Muted("Signed-in people only, on the URL Review pages, since ${g.str("since") ?: "1 Nov 2026"}. Time counts while the tab is visible; a visit ends after 30 minutes without activity. Tap a person for their runs and visits.")
    }
}
