package com.carlosandmunoz.jarvis.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.home.StatusSlot

/**
 * Add / remove / edit / reorder rings and bars for the status notification (#3610).
 * Connections, 90-day targets and goals are each their own slot — not one all-or-nothing Bars switch.
 */
@Composable
fun StatusSlotsEditor(slots: List<StatusSlot>, onChange: (List<StatusSlot>) -> Unit) {
    var draft by remember(slots) { mutableStateOf<StatusSlot?>(null) }
    var editAt by remember { mutableStateOf<Int?>(null) }

    Muted("Rings and bars on the card. Add a metric, choose ring or bar, and optionally rename it. Order is top to bottom; the card shows up to two rings and three bars.")
    slots.forEachIndexed { i, slot ->
        val metric = StatusSlot.Metric.of(slot.metric)
        Row(Modifier.fillMaxWidth().padding(start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(slot.label?.takeIf { it.isNotBlank() } ?: metric?.title ?: slot.metric, fontSize = 14.sp)
                Muted("${if (slot.kind == StatusSlot.Kind.RING) "Ring" else "Bar"} · ${metric?.hint ?: slot.metric}")
            }
            TextButton(onClick = { if (i > 0) onChange(slots.toMutableList().also { it.add(i - 1, it.removeAt(i)) }) }, enabled = i > 0) {
                Text("↑", color = J.cyan)
            }
            TextButton(onClick = { if (i < slots.lastIndex) onChange(slots.toMutableList().also { it.add(i + 1, it.removeAt(i)) }) }, enabled = i < slots.lastIndex) {
                Text("↓", color = J.cyan)
            }
            TextButton(onClick = { editAt = i; draft = slot }) { Text("Edit", color = J.cyan, fontSize = 13.sp) }
            TextButton(onClick = { onChange(slots.filterIndexed { j, _ -> j != i }) }) { Text("Remove", color = J.pink, fontSize = 13.sp) }
        }
    }
    TextButton(onClick = {
        editAt = null
        draft = StatusSlot(StatusSlot.Metric.CONNECTIONS.key, StatusSlot.Kind.BAR)
    }) { Text("Add ring or bar", color = J.cyan) }

    draft?.let { editing ->
        SlotDraft(
            slot = editing,
            title = if (editAt == null) "Add to the card" else "Edit slot",
            onDismiss = { draft = null; editAt = null },
            onSave = { next ->
                val list = slots.toMutableList()
                val at = editAt
                if (at == null) list += next else list[at] = next
                onChange(list)
                draft = null
                editAt = null
            },
        )
    }
}

@Composable
private fun SlotDraft(slot: StatusSlot, title: String, onDismiss: () -> Unit, onSave: (StatusSlot) -> Unit) {
    var metric by remember(slot) { mutableStateOf(slot.metric) }
    var kind by remember(slot) { mutableStateOf(slot.kind) }
    var label by remember(slot) { mutableStateOf(slot.label.orEmpty()) }
    var metricOpen by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth().padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, color = J.cyan, fontSize = 13.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Metric", modifier = Modifier.weight(1f), fontSize = 14.sp)
            TextButton(onClick = { metricOpen = true }) {
                Text(StatusSlot.Metric.of(metric)?.title ?: metric, color = J.cyan)
            }
            DropdownMenu(metricOpen, { metricOpen = false }) {
                StatusSlot.Metric.entries.forEach { m ->
                    DropdownMenuItem({ Text(m.title) }, {
                        metric = m.key
                        kind = m.defaultKind
                        metricOpen = false
                    })
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Show as", fontSize = 14.sp)
            TextButton(onClick = { kind = StatusSlot.Kind.RING }) {
                Text("Ring", color = if (kind == StatusSlot.Kind.RING) J.cyan else J.muted)
            }
            TextButton(onClick = { kind = StatusSlot.Kind.BAR }) {
                Text("Bar", color = if (kind == StatusSlot.Kind.BAR) J.cyan else J.muted)
            }
        }
        OutlinedTextField(
            label,
            { label = it },
            label = { Text("Custom label (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onDismiss) { Text("Cancel", color = J.muted) }
            TextButton(onClick = { onSave(StatusSlot(metric, kind, label.trim().takeIf { it.isNotEmpty() })) }) {
                Text("Save", color = J.cyan)
            }
        }
    }
}
