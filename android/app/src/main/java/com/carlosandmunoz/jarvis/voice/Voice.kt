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
    /** The phone's language as the jarvis function expects it ("es", "pt", ...). */
    fun lang(): String = Locale.getDefault().language.ifEmpty { "en" }

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
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
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

    suspend fun say(text: String, lang: String = Voice.lang()) {
        stop()
        _speaking.value = text
        val out = runCatching { app.api.call("speak", 1, mapOf("text" to JsonPrimitive(text), "lang" to JsonPrimitive(lang))) }
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
