package com.carlosandmunoz.jarvis.data

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.serialization.json.JsonObject
import java.time.Instant

/** Live processes (#2548): the snapshot's `processes` section, what runs now, waits on Carlos or ended in the last day. */
object Processes {
    val ACTIVE = setOf("queued", "running", "waiting")
    val KINDS = mapOf(
        "agent" to "Cursor agent", "mac-agent" to "Mac agent", "workflow" to "Workflow", "deploy" to "Deploy",
        "review-run" to "URL review", "desk" to "Review desk", "cube" to "Cube run", "job" to "Scheduled job",
    )
    val STATES = mapOf("queued" to "Queued", "running" to "Running", "waiting" to "Waiting", "done" to "Done", "failed" to "Failed", "cancelled" to "Cancelled")

    /** A processes push brings the section here; the screen on show merges it in place. */
    val pushed = MutableSharedFlow<JsonObject>(extraBufferCapacity = 4)

    fun rows(p: JsonObject?): List<JsonObject> = p.objs("rows")
    fun active(p: JsonObject?): List<JsonObject> = rows(p).filter { it.str("state") in ACTIVE }
    fun recent(p: JsonObject?): List<JsonObject> = rows(p).filter { it.str("state") !in ACTIVE }
    fun running(p: JsonObject?): Int = rows(p).count { it.str("state") == "running" }
    fun needsYou(p: JsonObject?): Int = rows(p).count { it.bool("needsYou") == true }

    /** "2 running · 1 needs you", or null when nothing runs or waits. */
    fun summary(p: JsonObject?): String? {
        val r = running(p)
        val n = needsYou(p)
        return listOfNotNull("$r running".takeIf { r > 0 }, "$n needs you".takeIf { n > 0 }).joinToString(" · ").ifEmpty { null }
    }

    fun millis(iso: String?): Long? = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

    /** 42s, 3m 12s, 1h 04m, 2d 3h. */
    fun elapsed(ms: Long): String {
        val s = (ms / 1000).coerceAtLeast(0)
        return when {
            s < 60 -> "${s}s"
            s < 3600 -> "${s / 60}m ${(s % 60).toString().padStart(2, '0')}s"
            s < 86400 -> "${s / 3600}h ${((s % 3600) / 60).toString().padStart(2, '0')}m"
            else -> "${s / 86400}d ${(s % 86400) / 3600}h"
        }
    }

    /** What the time column shows: the clock of an active row, how long ago a finished one ended. */
    fun clock(row: JsonObject, now: Long): String {
        if (row.str("state") in ACTIVE) return millis(row.str("startedAt"))?.let { elapsed(now - it) }.orEmpty()
        return end(row)?.let { elapsed(now - it) + " ago" }.orEmpty()
    }

    /** "took 3m 12s" for a finished row. */
    fun took(row: JsonObject): String? {
        if (row.str("state") in ACTIVE) return null
        val start = millis(row.str("startedAt")) ?: return null
        return end(row)?.let { "took " + elapsed(it - start) }
    }

    private fun end(row: JsonObject) = millis(row.str("endedAt")) ?: millis(row.str("updatedAt"))

    /** The snapshot with this processes section and its version in place of the old ones. */
    fun patch(snap: JsonObject, processes: JsonObject, version: JsonObject? = null): JsonObject {
        val out = snap.toMutableMap()
        out["processes"] = processes
        if (version != null) out["versions"] = JsonObject((snap.obj("versions") ?: JsonObject(emptyMap())).toMutableMap().apply { put("processes", version) })
        return JsonObject(out)
    }
}
