package com.carlosandmunoz.urlreview.ui.arena

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.net.URI

@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ArenaPlaceholder(
    targetUrl: String,
    onContinue: (String) -> Unit,
    onCancel: () -> Unit,
) {
    var progress by remember { mutableIntStateOf(0) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    val host = remember(targetUrl) {
        runCatching {
            URI(targetUrl).host.orEmpty()
        }.getOrDefault(targetUrl).ifBlank { "example.com" }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Lab Tries · $host", maxLines = 1) },
            navigationIcon = {
                IconButton(
                    onClick = {
                        webView?.evaluateJavascript("window.UrlReviewNative && UrlReviewNative.cancel();", null)
                        onCancel()
                    },
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Cancel review")
                }
            },
        )
        if (progress in 1..99) {
            LinearProgressIndicator(
                progress = { progress / 100f },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        AndroidView(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            factory = { context ->
                WebView(context).apply {
                    webViewClient = WebViewClient()
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = true
                    settings.allowFileAccessFromFileURLs = true
                    settings.allowUniversalAccessFromFileURLs = true
                    addJavascriptInterface(
                        ArenaJsBridge(
                            onProgress = { pct -> progress = pct },
                            onFinish = { onContinue(targetUrl) },
                            onCancel = onCancel,
                        ),
                        "UrlReviewAndroid",
                    )
                    val uri = Uri.parse("file:///android_asset/arena/index.html")
                        .buildUpon()
                        .appendQueryParameter("host", host)
                        .build()
                    loadUrl(uri.toString())
                    webView = this
                }
            },
            update = { webView = it },
        )
        Text(
            text = "$progress% · ReviewArena lab skin (packaged)",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}