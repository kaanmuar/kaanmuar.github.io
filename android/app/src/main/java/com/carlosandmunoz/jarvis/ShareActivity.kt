package com.carlosandmunoz.jarvis

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.push.Push
import com.carlosandmunoz.jarvis.ui.ActionButton
import com.carlosandmunoz.jarvis.ui.GlassChip
import com.carlosandmunoz.jarvis.ui.J
import com.carlosandmunoz.jarvis.ui.JarvisTheme
import com.carlosandmunoz.jarvis.ui.Mono
import com.carlosandmunoz.jarvis.ui.Reactor
import com.carlosandmunoz.jarvis.ui.glass
import com.carlosandmunoz.jarvis.ui.reveal
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/** Share a link from any app: a glass sheet that queues an owner URL review; the score arrives as a push. */
class ShareActivity : ComponentActivity() {
    private sealed interface Step {
        data object Ready : Step
        data object Sending : Step
        data class Queued(val host: String) : Step
        data class Failed(val message: String) : Step
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as JarvisApp
        val fixture = BuildConfig.DEBUG && java.io.File(filesDir, "jarvis/fixture.json").exists()
        val shared = listOfNotNull(intent.getStringExtra(Intent.EXTRA_TEXT), intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.dataString).joinToString(" ")
        val first = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE).find(shared)?.value?.trimEnd(')', '.', ',', ';', '!', '?') ?: shared.trim()
        setContent {
            JarvisTheme {
                val scope = rememberCoroutineScope()
                var url by remember { mutableStateOf(first) }
                var lang by remember { mutableStateOf(app.vault.get("review.lang") ?: Locale.getDefault().language.takeIf { it in LANGS } ?: "en") }
                var step by remember { mutableStateOf<Step>(Step.Ready) }
                fun start() {
                    step = Step.Sending
                    app.vault.put("review.lang", lang)
                    scope.launch {
                        runCatching {
                            val token = runCatching { Push.token() }.getOrNull() ?: ""
                            app.api.call("review", 1, mapOf("url" to JsonPrimitive(url.trim()), "lang" to JsonPrimitive(lang), "token" to JsonPrimitive(token)))
                        }.onSuccess { out ->
                            step = Step.Queued((out["host"] as? JsonPrimitive)?.content ?: hostOf(url))
                            delay(2600)
                            finish()
                        }.onFailure { step = Step.Failed(it.message ?: "Jarvis could not start the review.") }
                    }
                }
                Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { finish() }, contentAlignment = Alignment.BottomCenter) {
                    Column(
                        Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(12.dp).reveal()
                            .background(J.bg.copy(alpha = 0.94f), RoundedCornerShape(18.dp)).glass(radius = 18.dp).clickable(remember { MutableInteractionSource() }, null) { }.padding(18.dp)
                    ) {
                        Text("REVIEW WITH JARVIS", color = J.cyan, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 2.sp)
                        Spacer(Modifier.height(10.dp))
                        AnimatedContent(step, transitionSpec = { (fadeIn() + slideInVertically { it / 6 }) togetherWith fadeOut() }, label = "step") { now ->
                            when {
                                !app.auth.signedIn && !fixture -> SignedOut()
                                now is Step.Queued -> Queued(now.host)
                                else -> Form(url, { url = it }, lang, { lang = it }, now, ::start)
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun Form(url: String, setUrl: (String) -> Unit, lang: String, setLang: (String) -> Unit, step: Step, start: () -> Unit) = Column {
        Text(hostOf(url).ifEmpty { "No link found" }, color = J.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(url, setUrl, singleLine = true, label = { Text("Web address") }, modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = J.cyan, unfocusedBorderColor = J.dim, focusedTextColor = J.text, unfocusedTextColor = J.text, cursorColor = J.cyan, focusedLabelColor = J.cyan, unfocusedLabelColor = J.muted))
        Spacer(Modifier.height(12.dp))
        Text("Report language", color = J.muted, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LANGS.forEach { code -> GlassChip(code.uppercase(), code == lang) { setLang(code) } }
        }
        Spacer(Modifier.height(12.dp))
        Text("Runs as your own review, free, and opens in full in your account. A push with the score arrives in 2 to 7 minutes.", color = J.dim, fontSize = 12.sp)
        if (step is Step.Failed) Text(step.message, color = J.pink, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            ActionButton(if (step is Step.Sending) "Starting…" else "Start review", step is Step.Sending) { if (hostOf(url).isNotEmpty()) start() }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = ::finish) { Text("Cancel", color = J.muted) }
        }
    }

    @Composable
    private fun Queued(host: String) = Row(verticalAlignment = Alignment.CenterVertically) {
        Reactor(100.0, "QUEUED", 72.dp)
        Spacer(Modifier.padding(start = 14.dp))
        Column {
            Text("Reviewing $host", color = J.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text("You'll get a push with the score when it's done.", color = J.muted, fontSize = 13.sp)
        }
    }

    @Composable
    private fun SignedOut() = Column {
        Text("Sign in to Jarvis first", color = J.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Text("Reviews start as the owner account.", color = J.muted, fontSize = 13.sp)
        ActionButton("Open Jarvis", false) { startActivity(Home.open(this@ShareActivity, "overview")); finish() }
    }

    private fun hostOf(url: String) = runCatching { Uri.parse(if (url.contains("://")) url.trim() else "https://" + url.trim()).host ?: "" }.getOrDefault("")
        .takeIf { it.contains('.') } ?: ""

    companion object { val LANGS = listOf("en", "es", "pt", "de", "fr", "it") }
}
