package com.carlosandmunoz.jarvis.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.source
import java.io.File

/** The jarvis Cloud Function: one POST per op, the same API admin.html uses. Answers are kept on disk for offline use. */
class Api(context: Context, private val http: OkHttpClient, private val auth: Auth) {
    private val dir = File(context.filesDir, "jarvis").apply { mkdirs() }

    class Saved(val json: JsonObject, val at: Long)

    suspend fun call(op: String, days: Int, extra: Map<String, JsonElement> = emptyMap()): JsonObject {
        val body = buildJsonObject {
            put("op", op); put("days", days)
            extra.forEach { (k, v) -> put(k, v) }
        }.toString()
        var out = send(body, auth.token())
        if (out.second == 401 || out.second == 403) out = send(body, auth.token(force = true))
        val json = out.first
        if (out.second == 401 || out.second == 403) throw Auth.AuthError(json.str("error") ?: "Sign in with the owner account.")
        if (json.bool("ok") == false) throw IllegalStateException(json.str("error") ?: "Jarvis could not answer (${out.second}).")
        return json
    }

    /** Calls an op and keeps its answer, so the app still shows the last numbers without a network. */
    suspend fun fetch(op: String, days: Int): Saved {
        val json = call(op, days)
        withContext(Dispatchers.IO) { file(op, days).writeText(json.toString()) }
        return Saved(json, System.currentTimeMillis())
    }

    fun saved(op: String, days: Int): Saved? {
        val f = file(op, days)
        if (!f.exists()) return null
        return runCatching { Saved(JSON.parseToJsonElement(f.readText()) as JsonObject, f.lastModified()) }.getOrNull()
    }

    /** Share to post (#1420): streams a photo or video into Firebase Storage as the owner; storage.rules allow only social-inbox/. */
    suspend fun upload(path: String, type: String, length: Long, open: () -> java.io.InputStream) = withContext(Dispatchers.IO) {
        val body = object : okhttp3.RequestBody() {
            override fun contentType() = type.toMediaType()
            override fun contentLength() = length
            override fun writeTo(sink: okio.BufferedSink) { open().use { sink.writeAll(it.source()) } }
        }
        val url = "https://firebasestorage.googleapis.com/v0/b/$BUCKET/o?name=" + java.net.URLEncoder.encode(path, "UTF-8")
        val req = Request.Builder().url(url).header("Authorization", "Firebase " + auth.token()).post(body).build()
        http.newBuilder().writeTimeout(10, java.util.concurrent.TimeUnit.MINUTES).build().newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("The upload failed (${res.code}).")
        }
    }

    fun forget() { dir.listFiles()?.forEach { it.delete() } }

    private fun file(op: String, days: Int) = File(dir, "$op-$days.json")

    private suspend fun send(body: String, token: String): Pair<JsonObject, Int> = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(ENDPOINT)
            .header("Authorization", "Bearer $token")
            .post(body.toRequestBody(Auth.JSON_TYPE)).build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string() ?: ""
            val json = runCatching { JSON.parseToJsonElement(text) as JsonObject }.getOrNull()
                ?: JsonObject(mapOf("ok" to JsonPrimitive(false), "error" to JsonPrimitive("No answer (${res.code})")))
            json to res.code
        }
    }

    companion object {
        const val ENDPOINT = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis"
        const val BUCKET = "carlosm-interactive-cv.firebasestorage.app"
    }
}
