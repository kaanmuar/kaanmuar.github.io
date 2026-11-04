package com.carlosandmunoz.jarvis.voice

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.data.str
import java.io.File
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive

/** Voice Ask (#1418): the phone's language, listened to on the device and answered with the server's Cloud TTS voice. */
object Voice {
    data class Option(val name: String, val lang: String, val label: String)

    /** #1674: the jarvis function's catalog; the first of each language is its default. */
    val VOICES = listOf(
        Option("en-GB-Chirp3-HD-Orus", "en", "Orus, British"),
        Option("en-US-Chirp3-HD-Charon", "en", "Charon, American"),
        Option("es-US-Chirp3-HD-Algenib", "es", "Algenib, Latin American"),
        Option("es-ES-Chirp3-HD-Charon", "es", "Charon, Spain"),
    )
    const val RATE_MIN = 0.75f
    const val RATE_MAX = 1.25f
    const val RATE_DEFAULT = 0.95f
    val SAMPLE = mapOf("en" to "Good evening, Carlos. All systems are running, and two things need you today.",
        "es" to "Buenas noches, Carlos. Todos los sistemas funcionan, y hoy hay dos cosas que te esperan.")

    /** "en" or "es" when picked in Settings, else null to follow the phone. */
    fun langChoice(app: JarvisApp): String? = app.vault.get("voice.lang")?.takeIf { it == "en" || it == "es" }
    fun setLangChoice(app: JarvisApp, lang: String?) = app.vault.put("voice.lang", lang)

    /** The language Jarvis listens and answers in ("es", "pt", ...): the Settings choice, else the phone's. */
    fun lang(app: JarvisApp): String = langChoice(app) ?: Locale.getDefault().language.ifEmpty { "en" }

    /** The tag the recognizer listens for: the phone's locale unless Settings picked another language. */
    fun tag(app: JarvisApp): String = langChoice(app)?.takeIf { it != Locale.getDefault().language } ?: Locale.getDefault().toLanguageTag()

    fun voice(app: JarvisApp, lang: String): String? =
        app.vault.get("voice.$lang")?.takeIf { n -> VOICES.any { it.name == n && it.lang == lang } } ?: VOICES.firstOrNull { it.lang == lang }?.name
    fun setVoice(app: JarvisApp, lang: String, name: String) = app.vault.put("voice.$lang", name)

    fun rate(app: JarvisApp): Float = app.vault.get("voice.rate")?.toFloatOrNull()?.coerceIn(RATE_MIN, RATE_MAX) ?: RATE_DEFAULT
    fun setRate(app: JarvisApp, rate: Float) = app.vault.put("voice.rate", "%.2f".format(Locale.ROOT, rate.coerceIn(RATE_MIN, RATE_MAX)))

    fun speakOn(app: JarvisApp) = app.vault.flag("voice.speak", true)
    fun setSpeak(app: JarvisApp, on: Boolean) = app.vault.setFlag("voice.speak", on)

    fun available(context: Context) = SpeechRecognizer.isRecognitionAvailable(context)
}

data class Heard(val listening: Boolean = false, val level: Float = 0f, val partial: String = "", val error: String? = null)

/** One question at a time through Android's SpeechRecognizer; must be used on the main thread. */
class Listener(private val context: Context, private val onText: (String) -> Unit) {
    private val _state = MutableStateFlow(Heard())
    val state: StateFlow<Heard> = _state
    private var rec: SpeechRecognizer? = null

    fun start() {
        stop()
        if (!Voice.available(context)) { _state.value = Heard(error = "Speech recognition is not available on this phone."); return }
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        rec = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { _state.value = Heard(listening = true) }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) { _state.value = _state.value.copy(level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)) }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { _state.value = _state.value.copy(level = 0f) }
            override fun onError(error: Int) {
                _state.value = Heard(error = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't catch that."
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Jarvis needs the microphone permission."
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition needs a connection."
                    else -> "Listening stopped ($error)."
                })
                release()
            }
            override fun onResults(results: Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
                _state.value = Heard()
                release()
                if (text.isNotEmpty()) onText(text) else _state.value = Heard(error = "I didn't catch that.")
            }
            override fun onPartialResults(partial: Bundle?) {
                partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { _state.value = _state.value.copy(partial = it) }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Voice.tag(context.applicationContext as JarvisApp))
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true))
        _state.value = Heard(listening = true)
    }

    fun stop() {
        rec?.stopListening()
        release()
        if (_state.value.listening) _state.value = Heard()
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }

    private fun release() { rec?.destroy(); rec = null }
}

/** Plays answers in the jarvis function's Cloud TTS voice; one at a time. */
class Speaker(private val app: JarvisApp) {
    private val _speaking = MutableStateFlow<String?>(null)
    /** The text being spoken, so a list can show which answer is playing. */
    val speaking: StateFlow<String?> = _speaking
    private var player: MediaPlayer? = null

    suspend fun say(text: String, lang: String = Voice.lang(app), voice: String? = Voice.voice(app, lang)) {
        stop()
        _speaking.value = text
        val extra = mapOf("text" to JsonPrimitive(text), "lang" to JsonPrimitive(lang), "rate" to JsonPrimitive(Voice.rate(app))) +
            (voice?.let { mapOf("voice" to JsonPrimitive(it)) } ?: emptyMap())
        val out = runCatching { app.api.call("speak", 1, extra) }
            .getOrElse { _speaking.value = null; throw it }
        val audio = out.str("audio") ?: run { _speaking.value = null; return }
        val file = withContext(Dispatchers.IO) {
            File(app.cacheDir, "jarvis-voice.mp3").apply { writeBytes(Base64.decode(audio, Base64.DEFAULT)) }
        }
        if (_speaking.value != text) return
        player = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            setDataSource(file.absolutePath)
            setOnCompletionListener { stop() }
            prepare()
            start()
        }
    }

    fun stop() {
        player?.runCatching { stop(); release() }
        player = null
        _speaking.value = null
    }
}
