package com.carlosandmunoz.jarvis.data

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Jarvis 2.0 sections (#2510, contract on #2507): the same rules as sectionSince, applySections and sectionsToFetch
    in js/admin-jarvis-core.js, so the app, watch, widgets and web keep the same snapshot. */
object Sections {
    /** The saved snapshot's versions to send as `since`, or null when it has none: then the app fetches it all. */
    fun since(saved: JsonObject?): JsonObject? {
        val since = saved.obj("versions")?.mapNotNull { (name, v) -> v.str("v")?.let { name to JsonPrimitive(it) } }?.toMap().orEmpty()
        return since.takeIf { it.isNotEmpty() }?.let(::JsonObject)
    }

    /** A delta answer applied to the saved full snapshot: each field replaced (null drops it), `external` merged by
        source, checked times from `checked`, and the window moved with the build time when products did not change.
        Null when it cannot be applied, which means a full fetch. */
    fun apply(saved: JsonObject?, answer: JsonObject?): JsonObject? {
        if (saved == null || answer == null || answer.bool("delta") != true) return null
        val sections = answer["sections"] as? JsonObject ?: return null
        val versions = answer["versions"] as? JsonObject ?: return null
        val out = saved.toMutableMap()
        val external = (saved["external"] as? JsonObject).orEmpty().toMutableMap()
        fun put(into: MutableMap<String, JsonElement>, key: String, value: JsonElement) { if (value is JsonNull) into.remove(key) else into[key] = value }
        sections.values.filterIsInstance<JsonObject>().forEach { payload ->
            payload.forEach { (key, value) ->
                if (key == "external") (value as? JsonObject)?.forEach { (source, x) -> put(external, source, x) }
                else put(out, key, value)
            }
        }
        val checked = (answer["checked"] as? JsonObject).orEmpty().mapNotNull { (k, v) -> (v as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.let { k to it } }.toMap()
        checked.forEach { (source, at) ->
            val x = external[source] as? JsonObject ?: return@forEach
            if (x.str("cachedAt") != at) external[source] = JsonObject(x + ("cachedAt" to JsonPrimitive(at)))
        }
        out["external"] = JsonObject(external)
        (out["connections"] as? JsonArray)?.takeIf { checked.isNotEmpty() }?.let { rows ->
            out["connections"] = JsonArray(rows.map { row ->
                val key = (row as? JsonObject)?.str("key")
                val at = key?.let(checked::get)
                if (row is JsonObject && at != null && external[key] != null && row.str("at") != at) JsonObject(row + ("at" to JsonPrimitive(at))) else row
            })
        }
        val shift = millis(answer.str("cachedAt"))?.let { new -> millis(saved.str("cachedAt"))?.let { new - it } } ?: 0L
        val window = out["window"] as? JsonObject
        if (sections["products"] == null && window != null && shift != 0L) out["window"] = moved(window, shift)
        answer["cachedAt"]?.let { out["cachedAt"] = it }
        out["versions"] = JsonObject((saved["versions"] as? JsonObject).orEmpty() + versions)
        return JsonObject(out)
    }

    /** The sections a push (#2509) asks this snapshot to fetch: on its own range the versions it does not hold, on
        another range the sections the push names as moved. Empty means nothing to do. */
    fun toFetch(data: Map<String, String>, saved: JsonObject?, days: Int): List<String> {
        val moved = data["sections"].orEmpty().split(',').filter { it.isNotBlank() }
        val pushed = runCatching { JSON.parseToJsonElement(data["versions"] ?: "{}") as JsonObject }.getOrNull() ?: return moved
        if (data["days"] != days.toString()) return moved
        val stale = pushed.filter { (name, v) -> saved.obj("versions").obj(name).str("v") != (v as? JsonPrimitive)?.content }.keys.toList()
        return stale + moved.filter { it !in pushed }
    }

    private val ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    private fun millis(iso: String?) = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

    private fun moved(window: JsonObject, shift: Long): JsonObject {
        fun move(o: JsonObject, key: String): Pair<String, JsonElement>? =
            millis(o.str(key))?.let { key to JsonPrimitive(ISO.format(Instant.ofEpochMilli(it + shift))) }
        val prior = window.obj("prior")?.let { p -> "prior" to JsonObject(p + listOfNotNull(move(p, "start"), move(p, "end"))) }
        return JsonObject(window + listOfNotNull(move(window, "start"), move(window, "end"), prior))
    }
}
