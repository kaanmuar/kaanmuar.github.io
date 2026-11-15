package com.carlosandmunoz.jarvis.voice

import android.speech.SpeechRecognizer
import com.carlosandmunoz.jarvis.Chat
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.background.Keep
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.home.Home
import java.util.Locale
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/**
 * Hands-free (#2531): Jarvis listens, answers aloud and listens again, also with the screen off, until the owner says
 * "stop" or taps Stop. Start it from a screen: Android only lets the microphone run in the background if it began on screen.
 */
class HandsFree(private val app: JarvisApp) {
    private data class Got(val text: String?, val error: Int = 0)

    private val _on = MutableStateFlow(false)
    val on: StateFlow<Boolean> = _on
    private val _turns = MutableSharedFlow<Chat>(extraBufferCapacity = 16)
    /** Each question, then its answer, for the chat on screen. */
    val turns: SharedFlow<Chat> = _turns
    private val got = Channel<Got>(Channel.UNLIMITED)
    private val listener = Listener(app, onMiss = { got.trySend(Got(null, it)) }) { got.trySend(Got(it)) }
    val heard get() = listener.state
    private var job: Job? = null

    fun start() {
        if (job != null) return
        _on.value = true
        job = app.scope.launch {
            val hold = Keep.hold(app, "Listening hands-free", mic = true)
            try { loop() } finally { listener.stop(); Keep.release(hold); _on.value = false; job = null }
        }
    }

    fun stop() { job?.cancel() }

    private suspend fun loop() {
        var misses = 0
        while (true) {
            while (got.tryReceive().isSuccess) Unit
            listener.start()
            val g = got.receive()
            val q = g.text
            if (q == null) {
                if (g.error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS || g.error == SpeechRecognizer.ERROR_CLIENT && !Voice.available(app)) return
                misses = if (g.error in SILENCE) 0 else misses + 1
                if (misses > 0) delay((misses * 2_000L).coerceAtMost(30_000L))
                continue
            }
            misses = 0
            if (isStop(q)) return
            _turns.tryEmit(Chat(q, null, spoken = true))
            val extra = mapOf("question" to JsonPrimitive(q), "lang" to JsonPrimitive(Voice.lang(app)), "spoken" to JsonPrimitive(true))
            val answer = Keep.during(app, "Answering \"$q\"") { runCatching { app.api.call("ask", Home.days(app), extra).str("text") ?: "No answer." } }
            currentCoroutineContext().ensureActive()
            val text = answer.getOrElse { it.message ?: "Jarvis could not answer." }
            _turns.tryEmit(Chat(q, text, error = answer.isFailure, spoken = true))
            Keep.tell(app, q, text, "ask")
            runCatching { app.speaker.say(text) }
            currentCoroutineContext().ensureActive()
        }
    }

    companion object {
        /** Silence and no match end a listen normally; hands-free starts the next one straight away. */
        private val SILENCE = setOf(SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT)
        private val STOP_WORDS = setOf("stop", "stop listening", "stop jarvis", "jarvis stop", "that's all", "goodbye", "goodbye jarvis",
            "para", "basta", "deja de escuchar", "para jarvis", "jarvis para", "eso es todo", "adiós", "adios", "adiós jarvis", "adios jarvis")

        fun isStop(text: String): Boolean = text.lowercase(Locale.ROOT).replace(Regex("[^\\p{L}' ]"), " ").trim().replace(Regex("\\s+"), " ") in STOP_WORDS
    }
}
