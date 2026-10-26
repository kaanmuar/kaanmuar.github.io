package com.carlosandmunoz.jarvis

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.carlosandmunoz.jarvis.data.Auth
import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.home.Ongoing
import com.carlosandmunoz.jarvis.push.Push
import com.carlosandmunoz.jarvis.voice.Heard
import com.carlosandmunoz.jarvis.voice.Listener
import com.carlosandmunoz.jarvis.voice.Speaker
import com.carlosandmunoz.jarvis.voice.Voice
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

enum class Tab(val label: String) { Overview("Overview"), Products("Products"), Business("Business"), Traffic("Traffic"), Systems("Systems") }

data class Chat(val question: String, val answer: String?, val error: Boolean = false, val spoken: Boolean = false)

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
    val running: Set<String> = emptySet(),
    val push: Map<String, Boolean> = emptyMap(),
    val ongoing: Boolean = true,
    val heard: Heard = Heard(),
    val speaking: String? = null,
    val speak: Boolean = true,
    val notices: JsonObject? = null,
    val noticeErrors: Map<String, String> = emptyMap(),
    val proposals: List<JsonObject>? = null,
    val runs: List<JsonObject>? = null,
    val shares: List<JsonObject>? = null,
)

class JarvisViewModel(app: Application) : AndroidViewModel(app) {
    private val jarvis = app as JarvisApp
    private val auth = jarvis.auth
    private val api = jarvis.api
    private val _state = MutableStateFlow(UiState(signedIn = auth.signedIn, email = auth.email, days = jarvis.vault.get("days")?.toIntOrNull() ?: 7, push = Push.kinds(app as JarvisApp), ongoing = Ongoing.enabled(app), speak = Voice.speakOn(app)))
    val state: StateFlow<UiState> = _state
    private val listener = Listener(app) { ask(it, spoken = true) }
    private val speaker = Speaker(jarvis)

    /** Debug builds only: files/jarvis/fixture.json stands in for the server, for emulator screenshots without the owner login. */
    private val fixture = File(app.filesDir, "jarvis/fixture.json").takeIf { BuildConfig.DEBUG && it.exists() }

    init {
        if (fixture != null) _state.update { it.copy(signedIn = true, email = "fixture", snapshot = JSON.parseToJsonElement(fixture.readText()) as JsonObject, savedAt = fixture.lastModified()) }
        else if (auth.signedIn) { showSaved(); refresh(); syncPush() }
        viewModelScope.launch { Home.redraw(jarvis) }
        viewModelScope.launch { listener.state.collect { h -> _state.update { it.copy(heard = h) } } }
        viewModelScope.launch { speaker.speaking.collect { t -> _state.update { it.copy(speaking = t) } } }
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
        _state.value = UiState(email = auth.email, push = _state.value.push, ongoing = _state.value.ongoing)
        viewModelScope.launch {
            runCatching { Push.forget(jarvis) }
            auth.signOut()
            api.forget()
            Home.stop(jarvis)
            Home.redraw(jarvis)
        }
    }

    /** Turns one push kind on or off for this phone; the jarvis function only pushes the kinds a phone keeps. */
    fun setOngoing(on: Boolean) {
        jarvis.vault.setFlag(Ongoing.FLAG, on)
        _state.update { it.copy(ongoing = on) }
        viewModelScope.launch { Home.redraw(jarvis) }
    }

    fun setPush(kind: String, on: Boolean) {
        jarvis.vault.setFlag("push.$kind", on)
        _state.update { it.copy(push = Push.kinds(jarvis)) }
        viewModelScope.launch {
            runCatching { Push.sync(jarvis) }
                .onSuccess { ok -> _state.update { it.copy(toast = if (ok) "Saved." else "Push is not ready on this phone.") } }
                .onFailure { e -> fail(e) { it.copy(toast = e.message ?: "Could not save.") } }
        }
    }

    fun testPush() {
        _state.update { it.copy(running = it.running + "test-push") }
        viewModelScope.launch {
            val token = Push.token()
            if (token == null) { _state.update { it.copy(running = it.running - "test-push", toast = "Push is not ready on this phone.") }; return@launch }
            runCatching { Push.sync(jarvis, token); api.call("test-push", 1, mapOf("token" to JsonPrimitive(token))) }
                .onSuccess { out -> _state.update { it.copy(running = it.running - "test-push", toast = if ((out.num("sent") ?: 0.0) > 0) "Test sent. It should arrive in a few seconds." else "Firebase did not accept the push.") } }
                .onFailure { e -> fail(e) { it.copy(running = it.running - "test-push", toast = e.message ?: "Failed.") } }
        }
    }

    private fun syncPush() { if (fixture == null) viewModelScope.launch { runCatching { Push.sync(jarvis) } } }

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
                .onSuccess { saved ->
                    if (_state.value.days == days) _state.update { it.copy(snapshot = saved.json, savedAt = saved.at, loading = false) }
                    Home.redraw(jarvis)
                }
                .onFailure { e -> fail(e) { it.copy(loading = false, error = e.message ?: "Could not reach Jarvis.") } }
        }
        loadNotices()
        loadSocial()
    }

    fun brief() {
        _state.update { it.copy(briefBusy = true) }
        viewModelScope.launch {
            runCatching { api.call("brief", _state.value.days) }
                .onSuccess { out -> _state.update { it.copy(brief = out.str("text"), briefBusy = false) } }
                .onFailure { e -> fail(e) { it.copy(briefBusy = false, toast = e.message) } }
        }
    }

    /** Asks in the phone's language; a spoken question gets a speech-shaped answer, read aloud when "Speak answers" is on. */
    fun ask(question: String, spoken: Boolean = false) {
        val q = question.trim()
        if (q.isEmpty()) return
        _state.update { it.copy(chat = it.chat + Chat(q, null, spoken = spoken)) }
        viewModelScope.launch {
            val extra = mapOf("question" to JsonPrimitive(q), "lang" to JsonPrimitive(Voice.lang()), "spoken" to JsonPrimitive(spoken))
            val answer = runCatching { api.call("ask", _state.value.days, extra).str("text") ?: "No answer." }
            _state.update { s ->
                val i = s.chat.indexOfLast { it.question == q && it.answer == null }
                if (i < 0) s else s.copy(chat = s.chat.toMutableList().also { list ->
                    list[i] = answer.fold({ Chat(q, it, spoken = spoken) }, { Chat(q, it.message ?: "Jarvis could not answer.", error = true, spoken = spoken) })
                })
            }
            answer.onSuccess { if (spoken && _state.value.speak) speak(it) }
        }
    }

    fun listen() { speaker.stop(); listener.start() }
    fun stopListening() = listener.stop()
    fun heardShown() = listener.clearError()

    /** Plays an answer, or stops it if it is the one playing. */
    fun speak(text: String) {
        if (_state.value.speaking == text) { speaker.stop(); return }
        viewModelScope.launch { runCatching { speaker.say(text) }.onFailure { e -> fail(e) { it.copy(toast = e.message ?: "Could not speak.") } } }
    }

    fun setSpeak(on: Boolean) {
        Voice.setSpeak(jarvis, on)
        if (!on) speaker.stop()
        _state.update { it.copy(speak = on) }
    }

    override fun onCleared() { listener.stop(); speaker.stop() }

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

    /** Owner notices waiting for Send or Drop (#1420). */
    fun loadNotices() {
        if (fixture != null) { _state.update { it.copy(notices = _state.value.snapshot?.get("notices") as? JsonObject) }; return }
        if (!auth.signedIn || "notices" in _state.value.running) return
        _state.update { it.copy(running = it.running + "notices") }
        viewModelScope.launch {
            runCatching { api.call("notices", _state.value.days) }
                .onSuccess { out -> _state.update { it.copy(running = it.running - "notices", notices = out) } }
                .onFailure { e -> fail(e) { it.copy(running = it.running - "notices") } }
        }
    }

    /** Social hub (#1420): field-sweep proposals still waiting and the latest run of each posting workflow. */
    fun loadSocial() {
        if (fixture != null) {
            val f = _state.value.snapshot?.get("socialHub") as? JsonObject
            _state.update { it.copy(proposals = f.objs("proposals"), runs = f.objs("runs"), shares = f.objs("shares")) }
            return
        }
        if (!auth.signedIn || "social" in _state.value.running) return
        _state.update { it.copy(running = it.running + "social") }
        viewModelScope.launch {
            val days = _state.value.days
            val proposals = runCatching { api.call("social-proposals", days).objs("proposals") }
            val runs = runCatching { api.call("social-runs", days).objs("runs") }
            val shares = runCatching { api.call("share-list", days).objs("items") }
            _state.update { it.copy(running = it.running - "social", proposals = proposals.getOrNull() ?: it.proposals, runs = runs.getOrNull() ?: it.runs, shares = shares.getOrNull() ?: it.shares,
                toast = proposals.exceptionOrNull()?.message?.let { m -> "Proposals: $m" } ?: it.toast) }
        }
    }

    fun decideSocial(id: String, decision: String) {
        val key = "social:$id"
        _state.update { it.copy(running = it.running + key) }
        viewModelScope.launch {
            runCatching { if (fixture == null) api.call("social-decide", _state.value.days, mapOf("id" to JsonPrimitive(id), "decision" to JsonPrimitive(decision))) }
                .onSuccess { _ -> _state.update { s -> s.copy(running = s.running - key, proposals = s.proposals?.filter { it.str("id") != id },
                    toast = if (decision == "approved") "Approved. The next daily hub build publishes it." else "Dismissed.") } }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, toast = e.message ?: "Failed.") } }
        }
    }

    fun postNow() = act("post-now", "social-post-now") { out -> loadSocial(); out.str("note") ?: "Started." }

    fun decideNotice(domain: String, send: Boolean, email: String) {
        val key = "notice:$domain"
        _state.update { it.copy(running = it.running + key) }
        viewModelScope.launch {
            runCatching {
                if (fixture != null) JsonObject(mapOf("email" to JsonPrimitive(email)))
                else api.call("notice-decide", _state.value.days, mapOf("domain" to JsonPrimitive(domain), "send" to JsonPrimitive(send), "email" to JsonPrimitive(email)))
            }
                .onSuccess { out ->
                    _state.update { s ->
                        val left = s.notices?.let { n -> JsonObject(n + ("notices" to JsonArray(n.objs("notices").filter { it.str("domain") != domain }))) }
                        s.copy(running = s.running - key, notices = left, noticeErrors = s.noticeErrors - domain,
                            toast = if (send) "Sent to " + (out.str("email") ?: email) + "." else "Dropped $domain.")
                    }
                }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, noticeErrors = it.noticeErrors + (domain to (e.message ?: "Failed.")), toast = e.message ?: "Failed.") } }
        }
    }

    private fun showSaved() {
        val saved = api.saved("snapshot", _state.value.days)
        _state.update { it.copy(snapshot = saved?.json, savedAt = saved?.at ?: 0) }
    }

    private fun signedIn() {
        _state.update { it.copy(signedIn = true, email = auth.email, pendingCode = null, authError = null) }
        showSaved()
        refresh()
        syncPush()
        Home.schedule(jarvis)
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
