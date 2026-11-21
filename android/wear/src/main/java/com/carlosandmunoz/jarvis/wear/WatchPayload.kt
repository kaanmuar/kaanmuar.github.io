package com.carlosandmunoz.jarvis.wear

import androidx.datastore.core.Serializer
import java.io.InputStream
import java.io.OutputStream

/**
 * Bytes on the Wear Data Layer path `/jarvis/status` (#3836 / Horologist).
 * Same JSON schema as the phone's WatchPayload (duplicated: no shared Android module yet).
 */
data class WatchPayload(
    val empty: Boolean = false,
    val readiness: Double? = null,
    val alerts: Int = 0,
    val warns: Int = 0,
    val headline: String = "",
    val revenue: String = "—",
    val sales: Int = 0,
    val top: String = "",
    val at: Long = 0,
    val running: Int = 0,
    val needsYou: Int = 0,
    val sent: Long = 0,
) {
    fun toStatus(): Store.Status? = if (empty) null else Store.Status(
        readiness, alerts, warns, headline, revenue, sales,
        top.takeIf { it.isNotBlank() }, at, running, needsYou,
    )
}

object WatchPayloadSerializer : Serializer<WatchPayload> {
    override val defaultValue: WatchPayload = WatchPayload(empty = true)

    override suspend fun readFrom(input: InputStream): WatchPayload {
        val text = input.bufferedReader().readText()
        if (text.isBlank() || !text.trimStart().startsWith("{")) return defaultValue
        return runCatching { decode(text) }.getOrDefault(defaultValue)
    }

    override suspend fun writeTo(t: WatchPayload, output: OutputStream) {
        output.write(encode(t).toByteArray(Charsets.UTF_8))
    }

    internal fun encode(t: WatchPayload): String {
        val parts = mutableListOf<String>()
        if (t.empty) {
            parts += "\"empty\":true"
        } else {
            parts += "\"readiness\":${t.readiness ?: -1.0}"
            parts += "\"alerts\":${t.alerts}"
            parts += "\"warns\":${t.warns}"
            parts += "\"headline\":${quote(t.headline)}"
            parts += "\"revenue\":${quote(t.revenue)}"
            parts += "\"sales\":${t.sales}"
            parts += "\"top\":${quote(t.top)}"
            parts += "\"at\":${t.at}"
            parts += "\"running\":${t.running}"
            parts += "\"needsYou\":${t.needsYou}"
        }
        parts += "\"sent\":${t.sent}"
        return "{${parts.joinToString(",")}}"
    }

    internal fun decode(text: String): WatchPayload {
        val empty = bool(text, "empty") == true
        if (empty) return WatchPayload(empty = true, sent = long(text, "sent") ?: 0L)
        val readiness = double(text, "readiness")?.takeIf { it >= 0 }
        return WatchPayload(
            readiness = readiness,
            alerts = int(text, "alerts") ?: 0,
            warns = int(text, "warns") ?: 0,
            headline = string(text, "headline").orEmpty(),
            revenue = string(text, "revenue") ?: "—",
            sales = int(text, "sales") ?: 0,
            top = string(text, "top").orEmpty(),
            at = long(text, "at") ?: 0L,
            running = int(text, "running") ?: 0,
            needsYou = int(text, "needsYou") ?: 0,
            sent = long(text, "sent") ?: 0L,
        )
    }

    private fun quote(s: String): String = buildString {
        append('"')
        for (c in s) when (c) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> append(c)
        }
        append('"')
    }

    private fun bool(json: String, key: String): Boolean? =
        Regex("\"$key\"\\s*:\\s*(true|false)").find(json)?.groupValues?.get(1)?.toBooleanStrict()

    private fun int(json: String, key: String): Int? =
        Regex("\"$key\"\\s*:\\s*(-?\\d+)").find(json)?.groupValues?.get(1)?.toIntOrNull()

    private fun long(json: String, key: String): Long? =
        Regex("\"$key\"\\s*:\\s*(-?\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull()

    private fun double(json: String, key: String): Double? =
        Regex("\"$key\"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)").find(json)?.groupValues?.get(1)?.toDoubleOrNull()

    private fun string(json: String, key: String): String? {
        val m = Regex("\"$key\"\\s*:\\s*\"").find(json) ?: return null
        val start = m.range.last + 1
        val out = StringBuilder()
        var i = start
        while (i < json.length) {
            val c = json[i]
            when {
                c == '\\' && i + 1 < json.length -> {
                    when (json[i + 1]) {
                        '\\' -> out.append('\\')
                        '"' -> out.append('"')
                        'n' -> out.append('\n')
                        'r' -> out.append('\r')
                        't' -> out.append('\t')
                        else -> out.append(json[i + 1])
                    }
                    i += 2
                }
                c == '"' -> return out.toString()
                else -> {
                    out.append(c)
                    i++
                }
            }
        }
        return null
    }
}
