package com.carlosandmunoz.jarvis.ui

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.bytes
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.text
import kotlinx.serialization.json.JsonObject

/* The daily PageSpeed routine (#1978), as on the web's Systems: every sitemap page worst first, then the runs and the
   PRs with Merge and Close. Everything comes from the snapshot's external.pagespeed. */

const val PAGESPEED_SHOWN = 40
val PAGESPEED_STAGES = mapOf("countdown" to "merges on a countdown", "merging" to "merging", "merged" to "merged", "proposal" to "waits in Proposals", "closed" to "closed", "waiting" to "waits for CI")

private fun JsonObject?.score(mode: String): Double? = this.obj(mode).num("score")

/** A page's lower score of mobile and desktop; a page with neither sorts last. */
fun pageSpeedLow(page: JsonObject?): Double = listOfNotNull(page.score("mobile"), page.score("desktop")).minOrNull() ?: 101.0

fun pageSpeedWorstFirst(pages: List<JsonObject>): List<JsonObject> = pages.sortedBy { pageSpeedLow(it) }

fun pageSpeedPath(url: String?): String = (url ?: "").removePrefix("https://carlosandmunoz.com").ifEmpty { "/" }

/** "mobile 63 · desktop 53", with a dash for a mode PageSpeed did not answer. */
fun pageSpeedScores(page: JsonObject?): String = listOf("mobile", "desktop").joinToString(" · ") { m -> "$m " + (page.score(m)?.let { fmt(it) } ?: "—") }

private fun scoreColor(v: Double): Color = when { v > 100 -> J.pink; v >= 90 -> J.green; v >= 50 -> J.amber; else -> J.pink }

private fun fixes(s: JsonObject?): String? = s?.let {
    it.str("error")?.takeIf { e -> e.isNotBlank() } ?: (fmt(it.num("fixes")) + " fixes" + (it.obj("verdict").str("reason")?.let { r -> " · $r" } ?: ""))
}

@Composable
fun PageSpeedPanels(ps: JsonObject?, vm: JarvisViewModel) {
    var all by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<PendingAction?>(null) }
    ConfirmAction(confirm) { confirm = null }
    Panel("Page health: every page", trailing = { Text(ps.obj("counts").num("pages")?.let { fmt(it) } ?: "", fontFamily = Mono, color = J.muted) }) {
        if (ps == null) { Muted("The daily PageSpeed run is not in this snapshot."); return@Panel }
        if (ps.bool("ok") == false) { Muted(ps.str("error") ?: "Could not read the daily PageSpeed run."); return@Panel }
        if (ps.bool("empty") == true) { Muted(ps.str("note") ?: "No run yet."); return@Panel }
        Needs(ps)
        val c = ps.obj("counts")
        val avg = ps.objs("runs").firstOrNull().obj("avg")
        val th = ps.num("threshold") ?: 90.0
        KpiPairs(listOf(
            KpiData("Pages", fmt(c.num("pages"))), KpiData("Measured", fmt(c.num("scored")), alert = (c.num("scored") ?: 0.0) < (c.num("pages") ?: 0.0)),
            KpiData("Under ${fmt(th)}", fmt(c.num("below")), alert = (c.num("below") ?: 0.0) > 0), KpiData("Under 50", fmt(c.num("under50")), alert = (c.num("under50") ?: 0.0) > 0),
            KpiData("Average mobile", fmt(avg.num("mobile"))), KpiData("Average desktop", fmt(avg.num("desktop")))
        ))
        val pages = pageSpeedWorstFirst(ps.objs("pages"))
        (if (all) pages else pages.take(PAGESPEED_SHOWN)).forEach { p ->
            val flagged = p.arr("fails").take(3).joinToString(", ") { it.text() }
            KeyRow(pageSpeedPath(p.str("url")) + if (flagged.isNotBlank()) "\n$flagged" else "", pageSpeedScores(p), scoreColor(pageSpeedLow(p)), p.str("url"))
        }
        if (pages.size > PAGESPEED_SHOWN) TextButton(onClick = { all = !all }) { Text(if (all) "Show the worst $PAGESPEED_SHOWN" else "Show the other ${pages.size - PAGESPEED_SHOWN} pages") }
        Muted("Lighthouse through PageSpeed Insights, mobile and desktop, every page in sitemap.xml and sitemap-social.xml. Measured ${ago(ps.str("at")) ?: "—"}; worst first.")
    }
    if (ps == null || ps.bool("ok") == false || ps.bool("empty") == true) return
    Panel("PageSpeed routine") {
        val prs = ps.objs("prs")
        if (prs.isEmpty()) Muted("No PageSpeed PRs yet.")
        prs.forEach { pr ->
            val n = pr.num("number")?.toInt() ?: return@forEach
            val stage = pr.str("stage") ?: "waiting"
            StatusRow(when (stage) { "merged" -> "good"; "closed" -> "info"; else -> "warn" }, "#$n " + (if (pr.str("kind") == "ai") "Gemini's fixes" else "Safe fixes") + " · " + (PAGESPEED_STAGES[stage] ?: stage),
                listOfNotNull(pr.str("dueAt")?.let { ago(it) }?.let { "merges " + it.replaceFirstChar { c -> c.lowercase() } }, pr.str("reason")?.takeIf { it.isNotBlank() } ?: pr.str("title")).joinToString(" · "), pr.str("url"))
            if (pr.bool("open") == true) PageSpeedButtons(n, vm, null) { confirm = it }
        }
        ps.objs("runs").take(7).forEach { r ->
            StatusRow(if (r.str("status") == "ok") "good" else "alert", "Run " + (ago(r.str("at")) ?: ""),
                listOfNotNull("${fmt(r.num("scored"))} of ${fmt(r.num("pages"))} measured", "${fmt(r.num("below"))} under 90", r.str("error")?.takeIf { it.isNotBlank() },
                    fixes(r.obj("safe"))?.let { "safe: $it" }, fixes(r.obj("ai"))?.let { "Gemini: $it" }).joinToString(" · "), r.obj("run").str("url"))
        }
        ps.objs("cache").take(5).forEach { f ->
            KeyRow(pageSpeedPath(f.str("url")), (f.num("ttlMs")?.takeIf { it > 0 }?.let { "${fmt(it / 60000, 0)} min cache" } ?: "no cache") + " · could save " + bytes(f.num("wastedBytes")), J.amber)
        }
        if (ps.objs("cache").isNotEmpty()) Muted("Short cache lifetimes are set by GitHub Pages: reported, not fixed.")
        Muted("Every day at 06:00 UTC. Safe fixes that score up on both mobile and desktop merge on a 2-hour countdown once CI passes (Jarvis pushes first, 08:00-20:00 Bogotá); Gemini's fixes and the rest wait in Proposals." +
            if (ps.bool("stale") == true) " The last run is more than a day old." else "")
    }
}
