package com.carlosandmunoz.jarvis.ui

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import kotlinx.serialization.json.JsonObject

/** Jarvis > URL Review > Local (#2118): the Google Maps Local check (#2067, SEO-05) across reviews, and its Places calls. */
object Local {
    const val SHOWN = 10

    /** The web panel's LOCAL_ISSUES. */
    val ISSUES = mapOf(
        "local-website" to "Profile website link",
        "local-status" to "Marked closed",
        "local-nap" to "Name, address or phone",
        "local-hours" to "Opening hours",
        "local-utm" to "No UTM tags",
        "local-profile" to "No profile found"
    )

    fun issue(key: String?): String = ISSUES[key] ?: key.orEmpty()

    /** StatusRow level for a site's worst finding: failing pink, at risk amber, clean green. */
    fun level(worst: String?): String = when (worst) {
        "fail" -> "alert"
        "risk" -> "warn"
        else -> "good"
    }

    /** "1 site", "3 sites · 1 failing" */
    fun sites(count: Double?, fail: Double?): String {
        val n = (count ?: 0.0).toInt()
        val f = (fail ?: 0.0).toInt()
        return "$n site" + (if (n == 1) "" else "s") + if (f > 0) " · $f failing" else ""
    }

    /** "profile found · Opening hours, No UTM tags · outreach" */
    fun line(x: JsonObject): String = listOfNotNull(
        if (x.bool("profile") == true) "profile found" else "no profile",
        x.objs("issues").joinToString(", ") { issue(it.str("key")) }.ifEmpty { null },
        if (x.bool("outreach") == true) "outreach" else null
    ).joinToString(" · ")
}

@Composable
fun LocalPanel(s: UiState) {
    val g = s.snapshot.obj("external").obj("local")
    var all by rememberSaveable { mutableStateOf(false) }
    if (g == null || !g.isOk()) { Panel("Google Maps: local businesses", id = "review-local") { Muted(g.str("error") ?: "Pull down to read the Local checks.") }; return }
    val t = g.obj("totals")
    val sites = g.objs("sites")
    Panel("Google Maps: local businesses · ${fmt(t.num("local"))}", id = "review-local") {
        KpiPairs(listOf(
            KpiData("Reviews in range", fmt(t.num("reviews"))),
            KpiData("Looked local", fmt(t.num("local"))),
            KpiData("Profile found", fmt(t.num("profiles"))),
            KpiData("No profile", fmt(t.num("noProfile"))),
            KpiData("With a Maps issue", fmt(t.num("withIssues"))),
            KpiData("Outreach prospects", fmt(t.num("outreach"))),
            KpiData("Places calls", fmt(t.num("calls"))),
            KpiData("Places errors", fmt(t.num("errors")))
        ))
        g.objs("issues").forEach { i ->
            KeyRow(Local.issue(i.str("key")), Local.sites(i.num("count"), i.num("fail")))
        }
        if (sites.isEmpty()) Muted("No local businesses reviewed in range.")
        (if (all) sites else sites.take(Local.SHOWN)).forEach { x ->
            StatusRow(Local.level(x.str("worst")), x.str("host").orEmpty(), listOfNotNull(ago(x.str("at")), Local.line(x)).joinToString(" · "))
        }
        if (sites.size > Local.SHOWN) TextButton({ all = !all }) { Text(if (all) "Show fewer" else "Show all ${sites.size}", color = J.cyan, fontSize = 13.sp) }
        g.obj("lastError")?.let { e -> Muted("Last Places error ${ago(e.str("at")) ?: ""}: ${e.str("error").orEmpty()}") }
        Muted("Reviews whose start page looks like a local business are checked against their Google Business Profile (case SEO-05). Only finding keys are kept, never the profile's own data. Counted since ${g.str("since") ?: "2 Nov 2026"}; test runs are left out. ${fmt(t.num("callsToday"))} Places calls today.")
    }
}
