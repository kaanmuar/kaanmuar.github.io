package com.carlosandmunoz.jarvis.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.arr
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.text
import kotlinx.serialization.json.JsonObject

/* Every email address we own (#2338), as on the web's Systems: by domain, each address with its state, where it
   forwards and who fixes it, plus the domains' mail records. Everything comes from the snapshot's external.addresses. */

/** Rows by domain, in the server's order (domain, then system). */
fun addressGroups(rows: List<JsonObject>): List<Pair<String, List<JsonObject>>> {
    val out = mutableListOf<Pair<String, MutableList<JsonObject>>>()
    rows.forEach { r ->
        val d = r.str("domain").orEmpty()
        if (out.lastOrNull()?.first == d) out.last().second.add(r) else out.add(d to mutableListOf(r))
    }
    return out
}

fun addressLevel(state: String?): String = when (state) { "ok" -> "good"; "error" -> "alert"; "warn", "paused" -> "warn"; else -> "info" }

/** "Jarvis fixes it", or Carlos's step with an arrow when it has a link to open. */
fun addressFix(row: JsonObject?): String? {
    val fix = row.obj("fix") ?: return null
    if (fix.str("by") == "jarvis") return "Jarvis fixes it"
    val action = fix.str("action") ?: return null
    return if (fix.str("link").isNullOrBlank()) action else "$action →"
}

/** "alias · ImprovMX · → owner@gmail.example, webhook · 2 mails in the last day…" */
fun addressDetail(row: JsonObject?): String {
    val forwards = row.arr("forwards").map { it.text() }.filter { it.isNotBlank() }
    return listOfNotNull(
        listOfNotNull(row.str("kind"), row.str("system")).joinToString(" · "),
        row.str("aliasOf")?.takeIf { it.isNotBlank() }?.let { "alias of $it" } ?: forwards.takeIf { it.isNotEmpty() }?.let { "→ " + it.joinToString(", ") },
        row.str("detail")?.takeIf { it.isNotBlank() },
        addressFix(row)
    ).joinToString(" · ")
}

/** "MX ✓ · SPF ✓ · DKIM ✗ · DMARC ✓" */
fun domainChecks(domain: JsonObject?): String = domain.objs("checks").joinToString(" · ") { (it.str("name") ?: "?") + if (it.bool("ok") == true) " ✓" else " ✗" }

@Composable
fun EmailAddresses(a: JsonObject?) {
    Panel("Email addresses", trailing = { Text(a.obj("counts").num("addresses")?.let { fmt(it) } ?: "", fontFamily = Mono, color = J.muted) }) {
        if (a == null) { Muted("Email addresses are not in this snapshot."); return@Panel }
        if (a.bool("ok") == false) { Muted(a.str("error") ?: "Could not read the email addresses."); return@Panel }
        Needs(a)
        val c = a.obj("counts")
        KpiPairs(listOf(
            KpiData("Addresses", fmt(c.num("addresses"))), KpiData("OK", fmt(c.num("ok"))),
            KpiData("Warnings", fmt(c.num("warn")), alert = (c.num("warn") ?: 0.0) > 0), KpiData("Errors", fmt(c.num("error")), alert = (c.num("error") ?: 0.0) > 0),
            KpiData("Paused", fmt(c.num("paused")))
        ))
        a.objs("domains").forEach { d ->
            StatusRow(if (d.bool("ok") == true) "good" else "warn", (d.str("domain") ?: "") + " mail records", domainChecks(d) + d.arr("systems").takeIf { it.isNotEmpty() }?.let { " · " + it.joinToString(", ") { s -> s.text() } }.orEmpty())
        }
        addressGroups(a.objs("rows")).forEach { (domain, rows) ->
            Text(domain, fontFamily = Mono, fontSize = 12.sp, color = J.cyan)
            rows.forEach { r ->
                val fix = r.obj("fix")
                StatusRow(addressLevel(r.str("state")), (r.str("address") ?: "") + " · " + (r.str("state") ?: ""), addressDetail(r),
                    url = fix.str("link")?.takeIf { fix.str("by") == "carlos" && it.startsWith("https://") })
            }
        }
        a.arr("errors").takeIf { it.isNotEmpty() }?.let { Muted("Not read: " + it.joinToString("; ") { e -> e.text() }) }
        Muted("One row per address and system. Jarvis turns Instantly warm-up back on and restores the canary, postmaster and abuse aliases on its own; what it cannot fix it pushes to you once. Tap a row with an arrow to fix it.")
    }
}
