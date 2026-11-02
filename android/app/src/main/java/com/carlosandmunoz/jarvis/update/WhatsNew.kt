package com.carlosandmunoz.jarvis.update

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.edit
import com.carlosandmunoz.jarvis.BuildConfig
import com.carlosandmunoz.jarvis.ui.J

/**
 * What's new (#2169): the lines CI baked into this release from the PRs merged since the last one
 * (scripts/jarvis-whats-new.js), shown once on the first open after an update, never after a fresh install.
 */
object WhatsNew {
    private const val ASSET = "whats-new.txt"

    /** The lines to show now, or null. Each version answers once, so the window never comes back. */
    fun take(context: Context): List<String>? {
        val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)
        val seen = prefs.getLong("whatsNewSeen", -1)
        val code = BuildConfig.VERSION_CODE.toLong()
        val pkg = context.packageManager.getPackageInfo(context.packageName, 0)
        if (!due(seen, code, pkg.firstInstallTime == pkg.lastUpdateTime)) return null
        prefs.edit { putLong("whatsNewSeen", code) }
        val text = runCatching { context.assets.open(ASSET).bufferedReader().use { it.readText() } }.getOrNull() ?: return null
        return lines(text).ifEmpty { null }
    }

    /** No record yet means this version is the first with the window: show it unless the app was just installed. */
    internal fun due(seen: Long, code: Long, freshInstall: Boolean) = seen != code && !(seen < 0 && freshInstall)

    internal fun lines(text: String) = text.lines().map { it.trim().removePrefix("- ").trim() }.filter { it.isNotEmpty() }
}

@Composable
fun WhatsNewDialog(lines: List<String>, close: () -> Unit) {
    AlertDialog(
        onDismissRequest = close,
        icon = { Icon(Icons.Filled.AutoAwesome, null, tint = J.cyan) },
        title = { Text("What's new in Jarvis ${BuildConfig.VERSION_NAME}") },
        text = {
            Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                lines.forEach { l ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("•", color = J.cyan)
                        Text(l, color = J.text)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = close) { Text("Got it") } },
        containerColor = J.surface
    )
}
