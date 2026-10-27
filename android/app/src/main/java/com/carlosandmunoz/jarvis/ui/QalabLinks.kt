package com.carlosandmunoz.jarvis.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.pairs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject

val QALAB_LANGS = listOf("en", "es", "pt", "de", "fr", "it")

/** The personal link the qalabreview.com Worker forwards to the prospect's Live Report (#1866), or null for a bad domain. */
fun qalabLink(input: String, lang: String): String? {
    val host = input.trim().lowercase().removePrefix("https://").removePrefix("http://").substringBefore('/').removePrefix("www.")
    if (!Regex("^[a-z0-9.-]+\\.[a-z]{2,}$").matches(host)) return null
    return "https://qalabreview.com/" + (if (lang in QALAB_LANGS) lang else "en") + "/" + host
}

private fun copy(context: Context, text: String) {
    (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("link", text))
}

/** qalabreview.com links on the Outreach tab (#1868): same numbers, links and actions as the web panel. */
@Composable
fun QalabLinksPanel(ou: JsonObject?, vm: JarvisViewModel) {
    val links = ou.obj("links")
    val context = LocalContext.current
    if (links == null || !links.isOk()) { Panel("qalabreview.com links") { Muted(links?.str("error") ?: "Not loaded.") }; return }
    val live = links.bool("live") == true
    Panel("qalabreview.com links") {
        StatusRow(if (live) "good" else "alert", if (live) "Worker live" else "Worker not live", if (live) "Short links forward to the Live Reports." else "robots.txt answered ${fmt(links.num("workerStatus"))}. Deploy the Worker in qalabreview/.", url = links.str("base"))
        KpiPairs(listOf(
            KpiData("Visits", fmt(links.num("visits"))),
            KpiData("Free reviews", fmt(links.num("reviews"))),
            KpiData("Visit → review", fmt(links.num("reviewRate")) + "%"),
            KpiData("Paid unlocks", fmt(links.num("paid"))),
            KpiData("Review → paid", fmt(links.num("payRate")) + "%"),
            KpiData("Revenue", fmt(links.num("usd")) + " USD"),
        ))
    }
    val campaigns = links.pairs("byCampaign")
    if (campaigns.isEmpty()) Panel("Visits by link") { Muted("No visits from qalabreview.com links in this range yet.") }
    else TopList("Visits by link", campaigns)
    Panel("Prospects who opened their link") {
        val prospects = links.objs("prospects")
        if (prospects.isEmpty()) Muted("No prospect has opened a link yet.")
        prospects.take(20).forEach { p ->
            val host = p.str("host") ?: ""
            StatusRow(if ((p.num("paid") ?: 0.0) > 0) "good" else "info", host,
                "${fmt(p.num("visits"))} visits · ${fmt(p.num("reviews"))} reviews · ${fmt(p.num("paid"))} paid · ${fmt(p.num("usd"))} USD" + (p.str("last")?.let { " · last " + it.take(10) } ?: ""),
                url = "https://qalabreview.com/$host")
        }
    }
    Panel("Make a prospect link") {
        var host by remember { mutableStateOf("") }
        var lang by remember { mutableStateOf("es") }
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            QALAB_LANGS.forEach { l -> TextButton({ lang = l }) { Text(if (l == lang) "[$l]" else l, color = if (l == lang) J.cyan else J.muted) } }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(host, { host = it }, label = { Text("Prospect domain") }, singleLine = true, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            val link = qalabLink(host, lang)
            Button(onClick = { link?.let { copy(context, it); vm.say("Copied $it") } }, enabled = link != null) { Text("Copy") }
        }
    }
    Panel("Channel links") {
        links.objs("channels").forEach { c ->
            val url = c.str("url") ?: return@forEach
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f)) { StatusRow("info", c.str("label") ?: "", url.removePrefix("https://"), url = url) }
                TextButton({ copy(context, url); vm.say("Copied $url") }) { Text("Copy", color = J.cyan) }
            }
        }
        links.objs("funnel").forEach { f -> StatusRow(null, f.str("label") ?: "", "Funnel ticket", url = f.str("url")) }
    }
}
