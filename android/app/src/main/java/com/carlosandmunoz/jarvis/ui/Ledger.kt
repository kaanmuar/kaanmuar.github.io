package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.Ledger
import com.carlosandmunoz.jarvis.data.ago
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonElement

private fun statusColor(status: String): Color = when (status) {
    "worse" -> J.pink
    "better", "held" -> J.green
    "manual" -> J.amber
    "flat" -> J.cyan
    else -> J.dim
}

/** The change ledger (#3794): one row per shipped change with its status chip, before -> after and what to check. The
    server's order is kept; "worse" rows are outlined in pink. Empty state before the first daily run. */
@Composable
fun LedgerPanel(ledger: JsonElement?, modifier: Modifier = Modifier) {
    val rows = Ledger.rows(ledger)
    val summary = Ledger.summary(rows)
    Panel("Change ledger", modifier, id = "systems-ledger", trailing = {
        if (summary != null) Text(summary, fontFamily = Mono, fontSize = 12.sp, color = if (rows.any { it.worse }) J.pink else J.cyan, maxLines = 1)
    }) {
        if (!Ledger.ran(ledger)) { Muted("No ledger run yet"); return@Panel }
        ago(ledger.str("at"))?.let { Muted("Built $it") }
        if (rows.isEmpty()) Muted("The ledger has no changes yet.")
        rows.forEach { LedgerRow(it) }
        Muted("Each shipped change is judged against its metric once enough days have passed since it merged. Rebuilt daily.")
    }
}

@Composable
private fun LedgerRow(r: Ledger.Row) {
    val uri = LocalUriHandler.current
    val url = r.prUrl
    val color = statusColor(r.status)
    val shape = RoundedCornerShape(10.dp)
    Row(
        Modifier.fillMaxWidth()
            .let { if (r.worse) it.background(J.pink.copy(alpha = 0.08f), shape).border(1.dp, J.pink.copy(alpha = 0.55f), shape).padding(8.dp) else it }
            .let { if (url != null) it.clickable { runCatching { uri.openUri(url) } } else it },
        verticalAlignment = androidx.compose.ui.Alignment.Top,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.title, fontSize = 14.sp, color = if (url != null) J.cyan else J.text, fontWeight = if (r.worse) FontWeight.SemiBold else FontWeight.Normal, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Ledger.detail(r).takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.sp, color = J.muted, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            Ledger.change(r).takeIf { it.isNotEmpty() }?.let { Text(it, fontFamily = Mono, fontSize = 12.sp, color = if (r.worse) J.pink else J.text) }
            r.note?.let { Text(it, fontSize = 12.sp, color = J.muted) }
        }
        Spacer(Modifier.width(8.dp))
        Text(
            r.label, fontFamily = Mono, fontSize = 11.sp, color = color, fontWeight = if (r.worse) FontWeight.Bold else FontWeight.Normal, maxLines = 1,
            modifier = Modifier.border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(999.dp)).background(if (r.worse) color.copy(alpha = 0.2f) else Color.Transparent, RoundedCornerShape(999.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}
