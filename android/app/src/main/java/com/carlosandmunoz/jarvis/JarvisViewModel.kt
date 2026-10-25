package com.carlosandmunoz.jarvis

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.carlosandmunoz.jarvis.data.Auth
import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.str
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

enum class Tab(val label: String) { Overview("Overview"), Products("Products"), Business("Business"), Traffic("Traffic"), Systems("Systems") }

data class Chat(val question: String, val answer: String?, val error: Boolean = false)

data class UiState(
    val signedIn: Boolean = false,
    val email: String? = null,
    val pendingCode: Auth.Step.NeedsCode? = null,
    val busy: Boolean = false,
    val authError: String? = null,
    val days: Int = 7,
    val snapshot: JsonObject? = null,
    val savedAt: Long = 0,
    val loading: Boolean = false,
    val error: String? = null,
    val brief: String? = null,
    val briefBusy: Boolean = false,
    val chat: List<Chat> = emptyList(),
    val toast: String? = null,
    val running: Set<String> = emptySet()
)

class JarvisViewModel(app: Application) : AndroidViewModel(app) {
    private val jarvis = app as JarvisApp
    private val auth = jarvis.auth
    private val api = jarvis.api
    private val _state = MutableStateFlow(UiState(signedIn = auth.signedIn, email = auth.email, days = jarvis.vault.get("days")?.toIntOrNull() ?: 7))
    val state: StateFlow<UiState> = _state

    /** Debug builds only: files/jarvis/fixture.json stands in for the server, for emulator screenshots without the owner login. */
    private val fixture = File(app.filesDir, "jarvis/fixture.json").takeIf { BuildConfig.DEBUG && it.exists() }

    init {
        if (fixture != null) _state.update { it.copy(signedIn = true, email = "fixture", snapshot = JSON.parseToJsonElement(fixture.readText()) as JsonObject, savedAt = fixture.lastModified()) }
        else if (auth.signedIn) { showSaved(); refresh() }
    }

    fun signIn(email: String, password: String) = authStep {
        when (val step = auth.signIn(email.trim(), password)) {
            Auth.Step.Done -> signedIn()
            is Auth.Step.NeedsCode -> _state.update { it.copy(pendingCode = step) }
        }
    }

    fun submitCode(code: String) = authStep {
        val step = _state.value.pendingCode ?: return@authStep
        auth.finishWithCode(step, code)
        signedIn()
    }

    fun cancelCode() = _state.update { it.copy(pendingCode = null, authError = null) }

    fun signOut() {
        auth.signOut()
        api.forget()
        _state.value = UiState(email = auth.email)
    }

    fun setDays(days: Int) {
        if (fixture != null) return
        jarvis.vault.put("days", days.toString())
        _state.update { it.copy(days = days, brief = null) }
        showSaved()
        refresh()
    }

    fun refresh() {
        if (fixture != null) return
        val days = _state.value.days
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { api.fetch("snapshot", days) }
                .onSuccess { saved -> if (_state.value.days == days) _state.update { it.copy(snapshot = saved.json, savedAt = saved.at, loading = false) } }
                .onFailure { e -> fail(e) { it.copy(loading = false, error = e.message ?: "Could not reach Jarvis.") } }
        }
    }

    fun brief() {
        _state.update { it.copy(briefBusy = true) }
        viewModelScope.launch {
            runCatching { api.call("brief", _state.value.days) }
                .onSuccess { out -> _state.update { it.copy(brief = out.str("text"), briefBusy = false) } }
                .onFailure { e -> fail(e) { it.copy(briefBusy = false, toast = e.message) } }
        }
    }

    fun ask(question: String) {
        val q = question.trim()
        if (q.isEmpty()) return
        _state.update { it.copy(chat = it.chat + Chat(q, null)) }
        viewModelScope.launch {
            val answer = runCatching { api.call("ask", _state.value.days, mapOf("question" to JsonPrimitive(q))).str("text") ?: "No answer." }
            _state.update { s ->
                val i = s.chat.indexOfLast { it.question == q && it.answer == null }
                if (i < 0) s else s.copy(chat = s.chat.toMutableList().also { list ->
                    list[i] = answer.fold({ Chat(q, it) }, { Chat(q, it.message ?: "Jarvis could not answer.", error = true) })
                })
            }
        }
    }

    /** An action op (run-job, unlist, email-briefing, daily-now, send-report); the reply becomes a toast. */
    fun act(key: String, op: String, extra: Map<String, JsonElement> = emptyMap(), done: (JsonObject) -> String) {
        _state.update { it.copy(running = it.running + key) }
        viewModelScope.launch {
            runCatching { api.call(op, _state.value.days, extra) }
                .onSuccess { out -> _state.update { it.copy(running = it.running - key, toast = done(out)) } }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, toast = e.message ?: "Failed.") } }
        }
    }

    fun toastShown() = _state.update { it.copy(toast = null) }

    private fun showSaved() {
        val saved = api.saved("snapshot", _state.value.days)
        _state.update { it.copy(snapshot = saved?.json, savedAt = saved?.at ?: 0) }
    }

    private fun signedIn() {
        _state.update { it.copy(signedIn = true, email = auth.email, pendingCode = null, authError = null) }
        showSaved()
        refresh()
    }

    private fun fail(e: Throwable, change: (UiState) -> UiState) {
        if (e is Auth.AuthError && !auth.signedIn) _state.update { change(it).copy(signedIn = false) } else _state.update(change)
    }

    private fun authStep(block: suspend () -> Unit) {
        _state.update { it.copy(busy = true, authError = null) }
        viewModelScope.launch {
            runCatching { block() }.onFailure { e -> _state.update { it.copy(authError = e.message ?: "Sign-in failed.") } }
            _state.update { it.copy(busy = false) }
        }
    }
}
