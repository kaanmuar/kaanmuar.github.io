package com.carlosandmunoz.jarvis.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalUriHandler
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.fmt
import com.carlosandmunoz.jarvis.data.isOk
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Calls booked on book.html (#1971): the same rows as the web Business > Calls panel. */
object Calls {
    private val BOGOTA = ZoneId.of("America/Bogota")
    private val WHEN = DateTimeFormatter.ofPattern("EEE MMM d, h:mm a", Locale.US).withZone(BOGOTA)

    data class Row(val title: String, val detail: String, val meet: String?)

    fun whenText(iso: String?): String = runCatching { WHEN.format(Instant.parse(iso)) }.getOrDefault(iso ?: "—")

    fun rows(calls: JsonObject?): List<Row> = calls.objs("upcoming").map { c ->
        Row(
            title = whenText(c.str("start")) + " · " + (c.str("name") ?: "Someone"),
            detail = listOf(
                (c.str("label") ?: "Call") + " (" + fmt(c.num("minutes"), 0) + " min, " + (c.str("lang") ?: "en") + ")",
                c.str("email"), c.str("company"), c.str("host"), c.str("note")
            ).filterNot { it.isNullOrBlank() }.joinToString(" · "),
            meet = c.str("meet")?.takeIf { it.startsWith("https://") }
        )
    }
}

@Composable
fun CallsPanel(s: UiState, vm: JarvisViewModel) {
    val calls = s.snapshot.obj("external").obj("calls")
    val uri = LocalUriHandler.current
    val connected = calls.bool("connected") == true
    val rows = Calls.rows(calls)
    Panel("Calls", id = "business-calls") {
        Needs(calls)
        if (calls != null && calls.isOk()) {
            KpiPairs(listOf(KpiData("Ahead", fmt(rows.size.toDouble(), 0)), KpiData("Booked in range", fmt(calls.num("bookedInRange"), 0))))
            Muted(if (connected) "book.html reads " + (calls.str("account")?.takeIf { it.isNotBlank() } ?: "your Google Calendar") + "." else "Google Calendar is not connected, so book.html shows booking as closed.")
            calls.str("error")?.takeIf { it.isNotBlank() }?.let { StatusRow("error", "Calendar error", it) }
            if (rows.isEmpty()) Muted("No calls ahead.")
            rows.forEach { r -> StatusRow("live", r.title, r.detail, url = r.meet) }
        }
        ActionButton(if (connected) "Reconnect Google Calendar" else "Connect Google Calendar", "calendar" in s.running) {
            vm.connectCalendar { url -> runCatching { uri.openUri(url) } }
        }
    }
}
