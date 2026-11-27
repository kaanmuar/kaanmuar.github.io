package com.carlosandmunoz.urlreview.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom

/**
 * Thin HTTPS client for QA-lab URL Review (Wave 1.5).
 * Endpoints mirror [packages/qa-lab-mcp](https://github.com/kaanmuar/kaanmuar.github.io/tree/main/packages/qa-lab-mcp).
 */
object ReviewApi {
    const val PROD_RUN_URL =
        "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewRun"
    const val PROD_REVIEW_URL =
        "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl"

    /** When true, Entry still navigates to Arena if preview fails (offline / Turnstile). */
    const val USE_MOCK = true

    private const val USER_AGENT =
        "URLReview-Android/0.1 (Wave 1.5; +https://carlosandmunoz.com/qa-review)"

    private val deviceId: String by lazy { randomHex(8) }

    data class PreviewResult(
        val reportId: String?,
        val host: String?,
        val softLeft: Int?,
        val softCap: Int?,
        val raw: JSONObject,
    )

    data class StandingResult(
        val billing: String?,
        val free: Boolean,
        val softLeft: Int?,
        val softCap: Int?,
        val raw: JSONObject,
    )

    data class OpenReportResult(
        val reportId: String?,
        val host: String?,
        val paid: Boolean,
        val locked: Boolean,
        val raw: JSONObject,
    )

    class ReviewApiException(
        val httpStatus: Int,
        message: String,
        val body: JSONObject? = null,
    ) : Exception(message)

    suspend fun previewUrl(targetUrl: String): PreviewResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("url", targetUrl.trim())
            .put("lang", "en")
            .put("pageLang", "en")
            .put("openedAt", System.currentTimeMillis() - 5_000)
            .put("runId", randomHex(8))
            .put("deviceId", deviceId)
            .put("turnstileToken", "")
        val (status, json, contentType) = postJson("$PROD_RUN_URL/review/preview", body)
        if (status !in 200..299) {
            throw ReviewApiException(
                status,
                json.optString("error", "HTTP $status"),
                json,
            )
        }
        val report = json.optJSONObject("report") ?: json
        PreviewResult(
            reportId = report.optString("id").takeIf { it.isNotBlank() }
                ?: json.optString("id").takeIf { it.isNotBlank() },
            host = report.optString("host").takeIf { it.isNotBlank() }
                ?: json.optString("host").takeIf { it.isNotBlank() },
            softLeft = json.optInt("softLeft").takeIf { json.has("softLeft") },
            softCap = json.optInt("softCap").takeIf { json.has("softCap") },
            raw = json,
        )
    }

    suspend fun fetchStanding(): StandingResult = withContext(Dispatchers.IO) {
        val body = JSONObject().put("deviceId", deviceId)
        val (status, json, _) = postJson("$PROD_REVIEW_URL/standing", body)
        if (status !in 200..299) {
            throw ReviewApiException(
                status,
                json.optString("error", "HTTP $status"),
                json,
            )
        }
        StandingResult(
            billing = json.optString("billing").takeIf { it.isNotBlank() },
            free = json.optBoolean("free", true),
            softLeft = json.optInt("softLeft").takeIf { json.has("softLeft") },
            softCap = json.optInt("softCap").takeIf { json.has("softCap") },
            raw = json,
        )
    }

    suspend fun openReport(reportId: String): OpenReportResult = withContext(Dispatchers.IO) {
        val id = reportId.replace(Regex("[^a-f0-9]"), "").take(32)
        require(id.isNotEmpty()) { "Missing report id." }
        val body = JSONObject().put("id", id)
        val (status, json, _) = postJson("$PROD_REVIEW_URL/review/open", body)
        if (status !in 200..299 && !json.has("preview")) {
            throw ReviewApiException(
                status,
                json.optString("error", "HTTP $status"),
                json,
            )
        }
        OpenReportResult(
            reportId = json.optString("id", id).takeIf { it.isNotBlank() },
            host = json.optString("host").takeIf { it.isNotBlank() },
            paid = json.optBoolean("paid", false),
            locked = json.optBoolean("locked", status !in 200..299),
            raw = json,
        )
    }

    private fun postJson(
        endpoint: String,
        body: JSONObject,
    ): Triple<Int, JSONObject, String?> {
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 25_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/x-ndjson, application/json")
            setRequestProperty("User-Agent", USER_AGENT)
        }
        try {
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { out ->
                out.write(body.toString())
            }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val contentType = conn.contentType
            val json = parseJsonPayload(text, contentType)
            return Triple(status, json, contentType)
        } finally {
            conn.disconnect()
        }
    }

    private fun parseJsonPayload(text: String, contentType: String?): JSONObject {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return JSONObject()
        val isNdjson = contentType?.contains("ndjson", ignoreCase = true) == true ||
            trimmed.lines().count { it.isNotBlank() } > 1
        if (isNdjson) {
            var last: JSONObject? = null
            trimmed.lineSequence().forEach { line ->
                val row = line.trim()
                if (row.isEmpty()) return@forEach
                try {
                    last = JSONObject(row)
                } catch (_: Exception) {
                    /* keep scanning */
                }
            }
            return last ?: JSONObject()
        }
        return try {
            JSONObject(trimmed)
        } catch (_: Exception) {
            JSONObject()
        }
    }

    private fun randomHex(byteCount: Int): String {
        val bytes = ByteArray(byteCount)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
}