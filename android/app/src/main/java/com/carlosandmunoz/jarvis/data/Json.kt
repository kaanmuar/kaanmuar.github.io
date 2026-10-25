package com.carlosandmunoz.jarvis.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.abs
import kotlin.math.roundToLong

val JSON = Json { ignoreUnknownKeys = true; isLenient = true }

fun JsonElement?.obj(key: String): JsonObject? = (this as? JsonObject)?.get(key) as? JsonObject
fun JsonElement?.arr(key: String): List<JsonElement> = ((this as? JsonObject)?.get(key) as? JsonArray) ?: emptyList()
fun JsonElement?.objs(key: String): List<JsonObject> = arr(key).filterIsInstance<JsonObject>()
fun JsonElement?.prim(key: String): JsonPrimitive? = (this as? JsonObject)?.get(key) as? JsonPrimitive
fun JsonElement?.str(key: String): String? = prim(key)?.takeIf { it !is JsonNull }?.content
fun JsonElement?.num(key: String): Double? = prim(key)?.doubleOrNull
fun JsonElement?.bool(key: String): Boolean? = prim(key)?.booleanOrNull
fun JsonElement?.isOk(): Boolean = this is JsonObject && bool("ok") != false
fun JsonElement?.at(vararg path: String): JsonElement? {
    var cur: JsonElement? = this
    for (key in path) cur = (cur as? JsonObject)?.get(key)
    return cur
}

fun JsonElement?.doubles(): List<Double> = (this as? JsonArray)?.map { (it as? JsonPrimitive)?.doubleOrNull ?: 0.0 } ?: emptyList()
fun JsonElement?.strings(): List<String> = (this as? JsonArray)?.map { (it as? JsonPrimitive)?.content ?: "" } ?: emptyList()

/** A display string for any JSON value: numbers get thousands separators, nulls a dash. */
fun JsonElement?.text(): String = when (this) {
    null, JsonNull -> "—"
    is JsonPrimitive -> doubleOrNull?.let { if (isString) content else fmt(it) } ?: content
    is JsonArray -> joinToString(", ") { it.text() }
    is JsonObject -> entries.joinToString(" · ") { (k, v) -> "$k ${v.text()}" }
}

fun fmt(value: Double?, digits: Int = 1): String {
    if (value == null || value.isNaN()) return "—"
    if (value == value.roundToLong().toDouble() && abs(value) < 1e15) return "%,d".format(value.roundToLong())
    return "%,.${digits}f".format(value)
}

fun bytes(value: Double?): String {
    if (value == null) return "—"
    val units = listOf("B", "KB", "MB", "GB", "TB")
    var v = value
    var i = 0
    while (v >= 1024 && i < units.size - 1) { v /= 1024; i++ }
    return "%.1f %s".format(v, units[i])
}

fun pct(value: Double?): String = if (value == null) "—" else (if (value <= 1.0) value * 100 else value).let { "%.1f%%".format(it) }

/** A list of {label, value} rows as pairs. */
fun JsonElement?.pairs(key: String): List<Pair<String, Double>> =
    objs(key).map { (it.str("label") ?: it.str("name") ?: "?") to (it.num("value") ?: 0.0) }
