package com.carlosandmunoz.jarvis

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.ui.ActionButton
import com.carlosandmunoz.jarvis.ui.J
import com.carlosandmunoz.jarvis.ui.JarvisTheme
import com.carlosandmunoz.jarvis.ui.Mono
import com.carlosandmunoz.jarvis.ui.VoiceOrb
import com.carlosandmunoz.jarvis.ui.glass
import com.carlosandmunoz.jarvis.ui.reveal
import com.carlosandmunoz.jarvis.voice.Listener
import com.carlosandmunoz.jarvis.voice.Speaker
import com.carlosandmunoz.jarvis.voice.Voice
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/** The phone's assistant (#1418): long-press power or home, ask, and Jarvis answers aloud over whatever is on screen. */
class AssistActivity : FragmentActivity() {
    private val app get() = application as JarvisApp
    private lateinit var listener: Listener
    private lateinit var speaker: Speaker
    private var question by mutableStateOf<String?>(null)
    private var answer by mutableStateOf<String?>(null)
    private var thinking by mutableStateOf(false)
    private var failed by mutableStateOf<String?>(null)
    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) listen() else failed = "Jarvis needs the microphone to listen."
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        listener = Listener(this) { ask(it) }
        speaker = Speaker(app)
        val signedIn = app.auth.signedIn || (BuildConfig.DEBUG && java.io.File(filesDir, "jarvis/fixture.json").exists())
        setContent {
            JarvisTheme {
                val heard by listener.state.collectAsState()
                val speaking by speaker.speaking.collectAsState()
                Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { finish() }, contentAlignment = Alignment.BottomCenter) {
                    Column(
                        Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp).reveal()
                            .background(J.bg.copy(alpha = 0.94f), RoundedCornerShape(20.dp)).glass(radius = 20.dp)
                            .clickable(remember { MutableInteractionSource() }, null) { }.padding(18.dp).animateContentSize(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("JARVIS", color = J.cyan, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 3.sp)
                        Spacer(Modifier.height(8.dp))
                        if (!signedIn) {
                            Text("Sign in to Jarvis first", color = J.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(8.dp))
                            ActionButton("Open Jarvis", false) { startActivity(Home.open(this@AssistActivity, "overview")); finish() }
                            return@Column
                        }
                        VoiceOrb(heard.level, heard.listening || speaking != null || thinking, 112.dp, if (failed != null || heard.error != null) J.amber else J.cyan)
                        val status = when {
                            heard.listening -> "Listening…"
                            thinking -> "Thinking…"
                            speaking != null -> "Speaking"
                            else -> null
                        }
                        status?.let { Text(it.uppercase(), color = J.muted, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 2.sp) }
                        Spacer(Modifier.height(8.dp))
                        val said = heard.partial.takeIf { heard.listening && it.isNotEmpty() } ?: question
                        said?.let { Text(it, color = J.cyan, fontSize = 17.sp, textAlign = TextAlign.Center) }
                        AnimatedContent(answer, label = "answer") { a ->
                            if (a != null) Text(a, color = J.text, fontSize = 15.sp, modifier = Modifier.padding(top = 10.dp).heightIn(max = 260.dp).verticalScroll(rememberScrollState()))
                        }
                        (failed ?: heard.error)?.let { Text(it, color = J.amber, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp)) }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ActionButton(if (heard.listening) "Stop" else "Ask again", false) { if (heard.listening) listener.stop() else listen() }
                            ActionButton("Open Jarvis", false) { startActivity(Home.open(this@AssistActivity, "overview")); finish() }
                        }
                    }
                }
            }
        }
        if (signedIn) unlockThen { listen() }
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) { listener.stop(); speaker.stop(); finish() }
    }

    private fun listen() {
        failed = null
        speaker.stop()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) listener.start()
        else askMic.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun ask(q: String) {
        question = q
        answer = null
        thinking = true
        lifecycleScope.launch {
            val extra = mapOf("question" to JsonPrimitive(q), "lang" to JsonPrimitive(Voice.lang()), "spoken" to JsonPrimitive(true))
            runCatching { app.api.call("ask", Home.days(app), extra).str("text") ?: "No answer." }
                .onSuccess { a ->
                    thinking = false
                    answer = a
                    if (Voice.speakOn(app)) runCatching { speaker.say(a) }.onFailure { failed = it.message }
                }
                .onFailure { thinking = false; failed = it.message ?: "Jarvis could not answer." }
        }
    }

    /** The app's own lock applies here too: business numbers are spoken only after the fingerprint or screen lock. */
    private fun unlockThen(go: () -> Unit) {
        val can = BiometricManager.from(this).canAuthenticate(BIOMETRIC_WEAK or DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS
        if (!app.vault.flag("lock", true) || !can) { go(); return }
        val info = BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Jarvis").setAllowedAuthenticators(BIOMETRIC_WEAK or DEVICE_CREDENTIAL).build()
        BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = go()
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = finish()
        }).authenticate(info)
    }
}
