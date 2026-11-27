package com.carlosandmunoz.urlreview.ui.arena

import android.webkit.JavascriptInterface
import org.json.JSONObject

class ArenaJsBridge(
    private val onProgress: (Int) -> Unit,
    private val onFinish: (String) -> Unit,
    private val onCancel: () -> Unit,
) {
    @JavascriptInterface
    fun postMessage(json: String) {
        val type = runCatching { JSONObject(json).optString("type") }.getOrDefault("")
        when (type) {
            "progress" -> {
                val pct = runCatching { JSONObject(json).optInt("percent") }.getOrDefault(0)
                onProgress(pct)
            }
            "finish" -> {
                val status = runCatching { JSONObject(json).optString("status", "ready") }.getOrDefault("ready")
                onFinish(status)
            }
            "cancel" -> onCancel()
        }
    }
}