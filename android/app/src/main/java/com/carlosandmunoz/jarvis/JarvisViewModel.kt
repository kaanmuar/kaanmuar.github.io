package com.carlosandmunoz.jarvis

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.carlosandmunoz.jarvis.background.Keep
import com.carlosandmunoz.jarvis.data.Processes
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.Auth
import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.num
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.data.strings
import com.carlosandmunoz.jarvis.ui.Layouts
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.home.Ongoing
import com.carlosandmunoz.jarvis.push.Push
import com.carlosandmunoz.jarvis.ui.Github
import com.carlosandmunoz.jarvis.voice.Heard
import com.carlosandmunoz.jarvis.voice.Listener
import com.carlosandmunoz.jarvis.update.Updater
import com.carlosandmunoz.jarvis.voice.Voice
import java.io.File
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

enum class Tab(val label: String) { Overview("Overview"), Products("Products"), Business("Business"), Traffic("Traffic"), Systems("Systems") }

data class Chat(val question: String, val answer: String?, val error: Boolean = false, val spoken: Boolean = false)

/** What a GitHub row's action is doing (#2808): queued, running, done, launched or failed, with a link to the run, PR, issue or agent. */
data class GhResult(val state: String, val text: String, val url: String? = null, val link: String? = null)

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
    val ongoingParts: Set<Ongoing.Part> = Ongoing.Part.DEFAULT,
    val heard: Heard = Heard(),
    val handsFree: Boolean = false,
    val speaking: String? = null,
    val speak: Boolean = true,
    val voiceLang: String? = null,
    val voices: Map<String, String> = emptyMap(),
    val rate: Float = Voice.RATE_DEFAULT,
    val notices: JsonObject? = null,
    val noticeErrors: Map<String, String> = emptyMap(),
    val proposals: List<JsonObject>? = null,
    val runs: List<JsonObject>? = null,
    val shares: List<JsonObject>? = null,
    val devices: List<JsonObject>? = null,
    val studio: JsonObject? = null,
    /** Jarvis > Console (#2810): the log op's lines, newest first, its cursor and the last read's error. */
    val log: List<JsonObject> = emptyList(),
    val logCursor: String = "",
    val logError: String? = null,
    val ghRows: Map<String, GhResult> = emptyMap(),
)

class JarvisViewModel(app: Application) : AndroidViewModel(app) {
    private val jarvis = app as JarvisApp
    private val auth = jarvis.auth
    private val api = jarvis.api
    private val _state = MutableStateFlow(UiState(signedIn = auth.signedIn, email = auth.email, days = jarvis.vault.get("days")?.toIntOrNull() ?: 7, push = Push.kinds(app as JarvisApp), ongoing = Ongoing.enabled(app), ongoingParts = Ongoing.parts(app), speak = Voice.speakOn(app),
        voiceLang = Voice.langChoice(app as JarvisApp), voices = voices(app), rate = Voice.rate(app)))
    val state: StateFlow<UiState> = _state
    private val listener = Listener(app) { ask(it, spoken = true) }
    private val speaker = jarvis.speaker
    private val handsFree = jarvis.handsFree

    /** Debug builds only: files/jarvis/fixture.json stands in for the server, for emulator screenshots without the owner login. */
    private val fixture = File(app.filesDir, "jarvis/fixture.json").takeIf { BuildConfig.DEBUG && it.exists() }

    init {
        if (fixture != null) _state.update { it.copy(signedIn = true, email = "fixture", snapshot = JSON.parseToJsonElement(fixture.readText()) as JsonObject, savedAt = fixture.lastModified()) }
        else if (auth.signedIn) { showSaved(); refresh(); syncPush() }
        viewModelScope.launch { Home.redraw(jarvis) }
        viewModelScope.launch { combine(listener.state, handsFree.heard, handsFree.on) { mine, hf, on -> if (on) hf else mine }.collect { h -> _state.update { it.copy(heard = h) } } }
        viewModelScope.launch { handsFree.on.collect { on -> _state.update { it.copy(handsFree = on) } } }
        viewModelScope.launch { handsFree.turns.collect { c -> _state.update { it.copy(chat = answered(it.chat, c)) } } }
        viewModelScope.launch { speaker.speaking.collect { t -> _state.update { it.copy(speaking = t) } } }
        // A processes push (#2548) lands on the screen in place, without a refresh.
        viewModelScope.launch { Processes.pushed.collect { out -> out.obj("processes")?.let { p -> _state.update { s -> s.copy(snapshot = s.snapshot?.let { Processes.patch(it, p, out.obj("version")) }) } } } }
    }

    /** While something runs and no push came, the Processes panel asks again (one read). */
    fun refreshProcesses() { if (fixture == null && auth.signedIn) viewModelScope.launch { Push.processes(jarvis) } }

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
        _state.value = UiState(email = auth.email, push = _state.value.push, ongoing = _state.value.ongoing, ongoingParts = _state.value.ongoingParts)
        viewModelScope.launch {
            runCatching { Push.forget(jarvis) }
            runCatching { api.call("device", 1, mapOf("gone" to JsonPrimitive(true))) }
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

    fun setOngoingPart(part: Ongoing.Part, on: Boolean) {
        val parts = if (on) _state.value.ongoingParts + part else _state.value.ongoingParts - part
        Ongoing.setParts(jarvis, parts)
        _state.update { it.copy(ongoingParts = parts) }
        viewModelScope.launch { Ongoing.show(jarvis, Home.today(jarvis)) }
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

    fun checkUpdate() {
        _state.update { it.copy(running = it.running + "update") }
        viewModelScope.launch {
            val line = Updater.run(jarvis, force = true)
            _state.update { it.copy(running = it.running - "update", toast = line) }
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
        keep("Writing today's brief") {
            runCatching { api.call("brief", _state.value.days) }
                .onSuccess { out -> _state.update { it.copy(brief = out.str("text"), briefBusy = false) }; out.str("text")?.let { Keep.tell(jarvis, "Today's brief", it) } }
                .onFailure { e -> fail(e) { it.copy(briefBusy = false, toast = e.message) }; told() }
        }
    }

    /** Asks in the phone's language; a spoken question gets a speech-shaped answer, read aloud when "Speak answers" is on. */
    fun ask(question: String, spoken: Boolean = false) {
        val q = question.trim()
        if (q.isEmpty()) return
        _state.update { it.copy(chat = it.chat + Chat(q, null, spoken = spoken)) }
        keep("Answering \"$q\"") {
            val extra = mapOf("question" to JsonPrimitive(q), "lang" to JsonPrimitive(Voice.lang(jarvis)), "spoken" to JsonPrimitive(spoken))
            val answer = runCatching { api.call("ask", _state.value.days, extra).str("text") ?: "No answer." }
            val chat = answer.fold({ Chat(q, it, spoken = spoken) }, { Chat(q, it.message ?: "Jarvis could not answer.", error = true, spoken = spoken) })
            _state.update { s -> s.copy(chat = answered(s.chat, chat)) }
            Keep.tell(jarvis, q, chat.answer.orEmpty(), "ask")
            answer.onSuccess { if (spoken && _state.value.speak) runCatching { speaker.say(it) } }
        }
    }

    /** Fills in the answer of the question still waiting, or adds the turn. */
    private fun answered(chat: List<Chat>, c: Chat): List<Chat> {
        val i = chat.indexOfLast { it.question == c.question && it.answer == null }
        return if (c.answer != null && i >= 0) chat.toMutableList().also { it[i] = c } else chat + c
    }

    fun listen() { handsFree.stop(); speaker.stop(); listener.start() }
    fun stopListening() { listener.stop(); handsFree.stop() }

    /** Hands-free listening (#2531); starting it needs the microphone permission and this screen showing. */
    fun setHandsFree(on: Boolean) {
        if (!on) { handsFree.stop(); return }
        listener.stop()
        speaker.stop()
        handsFree.start()
    }
    fun heardShown() = listener.clearError()

    /** Plays an answer, or stops it if it is the one playing. */
    fun speak(text: String) {
        if (_state.value.speaking == text) { speaker.stop(); return }
        keep("Speaking the answer") { runCatching { speaker.say(text) }.onFailure { e -> fail(e) { it.copy(toast = e.message ?: "Could not speak.") } } }
    }

    fun setSpeak(on: Boolean) {
        Voice.setSpeak(jarvis, on)
        if (!on) speaker.stop()
        _state.update { it.copy(speak = on) }
    }

    private fun voices(app: JarvisApp) = listOf("en", "es").mapNotNull { l -> Voice.voice(app, l)?.let { l to it } }.toMap()

    /** null follows the phone's language. */
    fun setVoiceLang(lang: String?) {
        Voice.setLangChoice(jarvis, lang)
        _state.update { it.copy(voiceLang = lang) }
    }

    /** Picks the voice for its language and lets it say the sample. */
    fun setVoice(option: Voice.Option) {
        Voice.setVoice(jarvis, option.lang, option.name)
        _state.update { it.copy(voices = voices(jarvis)) }
        preview(option.lang)
    }

    fun setRate(rate: Float) {
        Voice.setRate(jarvis, rate)
        _state.update { it.copy(rate = Voice.rate(jarvis)) }
    }

    fun preview(lang: String = Voice.lang(jarvis)) {
        val text = Voice.SAMPLE[lang] ?: Voice.SAMPLE.getValue("en")
        keep("Playing the voice sample") { runCatching { speaker.say(text, lang) }.onFailure { e -> fail(e) { it.copy(toast = e.message ?: "Could not speak.") } } }
    }

    /** Work the owner started runs in the app's scope under Keep, so leaving Jarvis or locking the phone does not cut it off (#2531). */
    private fun keep(label: String, block: suspend () -> Unit) = jarvis.scope.launch { Keep.during(jarvis, label) { block() } }

    /** The toast as a notification, when it lands while Jarvis is out of sight. */
    private fun told() { _state.value.toast?.let { Keep.tell(jarvis, "Jarvis", it) } }

    /** An action op (run-job, unlist, email-briefing, daily-now, send-report); the reply becomes a toast. */
    fun act(key: String, op: String, extra: Map<String, JsonElement> = emptyMap(), done: (JsonObject) -> String) {
        _state.update { it.copy(running = it.running + key) }
        keep("Running your action") {
            runCatching { api.call(op, _state.value.days, extra) }
                .onSuccess { out -> _state.update { it.copy(running = it.running - key, toast = done(out)) } }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, toast = e.message ?: "Failed.") } }
            told()
        }
    }

    /** One tab's section layout (#2809), shown at once and saved through settings-save; a failed save puts the old one back. */
    fun saveLayout(tab: String, layout: Layouts.Saved?) {
        val before = Layouts.read(_state.value.snapshot, tab)
        _state.update { it.copy(snapshot = Layouts.patch(it.snapshot, tab, layout)) }
        if (fixture != null) return
        keep("Saving the layout") {
            runCatching { api.call("settings-save", _state.value.days, mapOf("layout" to JsonObject(mapOf(tab to Layouts.json(layout))))) }
                .onSuccess { out -> _state.update { s -> s.copy(snapshot = out.obj("layout")?.let { Layouts.withLayout(s.snapshot, it) } ?: s.snapshot, toast = "Layout saved. The web shows it too.") } }
                .onFailure { e -> fail(e) { it.copy(snapshot = Layouts.patch(it.snapshot, tab, before), toast = "The layout did not save: ${e.message ?: "failed"}. It is back as it was.") } }
            told()
        }
    }

    /** A Marketing button (#1729): like act, then the snapshot is read again so the screen shows the command waiting for the outreach sync. */
    fun market(key: String, op: String, extra: Map<String, JsonElement>, done: (JsonObject) -> String) {
        _state.update { it.copy(running = it.running + key) }
        keep("Running your action") {
            runCatching { api.call(op, _state.value.days, extra) }
                .onSuccess { out -> _state.update { it.copy(running = it.running - key, toast = done(out)) }; refresh() }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, toast = e.message ?: "Failed.") } }
            told()
        }
    }

    private fun ghMark(key: String, r: GhResult) = _state.update { it.copy(ghRows = it.ghRows + (key to r)) }

    /** A GitHub row's action (#2808): its state shows on the row at once, the answer replaces it, then the snapshot is read again. */
    fun ghRow(key: String, op: String, extra: Map<String, JsonElement>, busy: String, done: (JsonObject) -> GhResult) {
        ghMark(key, GhResult("running", busy))
        keep("Running your action") {
            runCatching { api.call(op, _state.value.days, extra) }
                .onSuccess { out -> val r = done(out); ghMark(key, r); _state.update { it.copy(toast = r.text) }; refresh() }
                .onFailure { e -> ghMark(key, GhResult("failed", e.message ?: "Failed.")); fail(e) { it.copy(toast = e.message ?: "Failed.") } }
            told()
        }
    }

    /** Re-runs a run's failed jobs, then reads github-run every 10 s until it completes, for at most 15 minutes. */
    fun ghRerun(key: String, run: Long, extra: Map<String, JsonElement>) {
        ghMark(key, GhResult("queued", "Re-running…"))
        keep("Re-running the CI run") {
            val out = runCatching { api.call("github-act", _state.value.days, extra) }
            out.exceptionOrNull()?.let { e -> ghMark(key, GhResult("failed", "Not re-run: " + (e.message ?: "failed."))); fail(e) { it }; return@keep }
            ghMark(key, GhResult("queued", "Re-run queued."))
            refresh()
            viewModelScope.launch {
                repeat(Github.POLL_TRIES) {
                    runCatching { api.call("github-run", _state.value.days, mapOf("run" to JsonPrimitive(run))) }.getOrNull()?.let { st ->
                        ghMark(key, Github.runResult(st))
                        if (st.bool("done") == true) { refresh(); return@launch }
                    }
                    delay(Github.POLL_MS)
                }
                ghMark(key, GhResult("failed", "Still not done after 15 minutes; open the run to follow it.", _state.value.ghRows[key]?.url, "Open the run"))
            }
        }
    }

    /** Gemini's fix prompt for a flaky workflow; [open] shows it in the agent dialog to edit and confirm. */
    fun ghDraft(key: String, extra: Map<String, JsonElement>, open: (String) -> Unit) {
        ghMark(key, GhResult("running", "Gemini is drafting a fix prompt…"))
        viewModelScope.launch {
            runCatching { api.call("github-draft", _state.value.days, extra) }
                .onSuccess { out -> _state.update { it.copy(ghRows = it.ghRows - key) }; out.str("prompt")?.let(open) }
                .onFailure { e -> ghMark(key, GhResult("failed", "No prompt: " + (e.message ?: "failed."))) }
        }
    }

    /** Connect YouTube or Mastodon for the engagement poster (#1990): the network's sign-in opens in the browser. */
    fun connectEngagement(network: String, open: (String) -> Unit) {
        if (fixture != null) { say("Connect is off with a fixture."); return }
        val key = "eg:connect:$network"
        _state.update { it.copy(running = it.running + key) }
        viewModelScope.launch {
            runCatching { api.call("engagement-connect", _state.value.days, mapOf("network" to JsonPrimitive(network))) }
                .onSuccess { out ->
                    _state.update { it.copy(running = it.running - key) }
                    out.str("url")?.let(open) ?: say(out.str("error") ?: "No sign-in link came back.")
                }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, toast = e.message ?: "Failed.") } }
        }
    }

    /** Connect Google Calendar for book.html (#1971): Google's consent page opens in the browser. */
    fun connectCalendar(open: (String) -> Unit) {
        if (fixture != null) { say("Connect is off with a fixture."); return }
        _state.update { it.copy(running = it.running + "calendar") }
        viewModelScope.launch {
            runCatching { api.call("calendar-connect", _state.value.days) }
                .onSuccess { out ->
                    _state.update { it.copy(running = it.running - "calendar") }
                    out.str("url")?.let(open) ?: say(out.str("error") ?: "Google sent no sign-in link.")
                }
                .onFailure { e -> fail(e) { it.copy(running = it.running - "calendar", toast = e.message ?: "Failed.") } }
        }
    }

    /** The screen changed (folded, opened, tabletop, DeX): the server keeps this device's row and answers with the list Settings shows. */
    fun reportDevice() {
        if (fixture != null || !auth.signedIn) return
        viewModelScope.launch {
            runCatching { api.call("device", _state.value.days) }.onSuccess { out -> _state.update { it.copy(devices = out.objs("devices")) } }
        }
    }

    /** Console (#2810): the lines since the last read, every 5 s while the Console is on screen; a fixture's "log" stands in. */
    fun pullLog() {
        if ("log" in _state.value.running) return
        if (fixture != null) { _state.update { it.copy(log = com.carlosandmunoz.jarvis.ui.Console.merge(it.log, _state.value.snapshot.obj("log").objs("entries"))) }; return }
        if (!auth.signedIn) return
        _state.update { it.copy(running = it.running + "log") }
        viewModelScope.launch {
            val since = _state.value.logCursor
            runCatching { api.call("log", _state.value.days, mapOf("limit" to JsonPrimitive(300)) + (if (since.isNotEmpty()) mapOf("since" to JsonPrimitive(since)) else emptyMap())) }
                .onSuccess { out -> _state.update { it.copy(running = it.running - "log", log = com.carlosandmunoz.jarvis.ui.Console.merge(it.log, out.objs("entries")), logCursor = out.str("cursor") ?: since, logError = null) } }
                .onFailure { e -> fail(e) { it.copy(running = it.running - "log", logError = e.message ?: "The log did not load.") } }
        }
    }

    fun toastShown() = _state.update { it.copy(toast = null) }
    fun say(text: String) = _state.update { it.copy(toast = text) }

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
            _state.update { it.copy(proposals = f.objs("proposals"), runs = f.objs("runs"), shares = f.objs("shares"), studio = f?.get("studio") as? JsonObject) }
            return
        }
        if (!auth.signedIn || "social" in _state.value.running) return
        _state.update { it.copy(running = it.running + "social") }
        viewModelScope.launch {
            val days = _state.value.days
            val proposals = runCatching { api.call("social-proposals", days).objs("proposals") }
            val runs = runCatching { api.call("social-runs", days).objs("runs") }
            val shares = runCatching { api.call("share-list", days).objs("items") }
            val studio = runCatching { api.call("studio", days) }
            _state.update { it.copy(running = it.running - "social", proposals = proposals.getOrNull() ?: it.proposals, runs = runs.getOrNull() ?: it.runs, shares = shares.getOrNull() ?: it.shares,
                studio = studio.getOrNull() ?: it.studio,
                toast = proposals.exceptionOrNull()?.message?.let { m -> "Proposals: $m" } ?: it.toast) }
        }
    }

    fun decideSocial(id: String, decision: String) {
        val key = "social:$id"
        _state.update { it.copy(running = it.running + key) }
        keep("Saving your decision") {
            runCatching { if (fixture == null) api.call("social-decide", _state.value.days, mapOf("id" to JsonPrimitive(id), "decision" to JsonPrimitive(decision))) }
                .onSuccess { _ -> _state.update { s -> s.copy(running = s.running - key, proposals = s.proposals?.filter { it.str("id") != id },
                    toast = if (decision == "approved") "Approved. The next daily hub build publishes it." else "Dismissed.") } }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, toast = e.message ?: "Failed.") } }
            told()
        }
    }

    fun postNow() = act("post-now", "social-post-now") { out -> loadSocial(); out.str("note") ?: "Started." }

    /** Studio (#1981): starts studio-render.yml; the PR with clip links follows when the render is done. */
    fun startRender(request: Map<String, String>) = act("studio-render", "studio-render", request.mapValues { JsonPrimitive(it.value) }) { out -> loadSocial(); out.str("note") ?: "Started." }

    /** Send (one email to each address in emails) or Drop a pending owner notice. */
    fun decideNotice(domain: String, send: Boolean, emails: List<String>) {
        val key = "notice:$domain"
        _state.update { it.copy(running = it.running + key) }
        keep(if (send) "Sending to $domain" else "Dropping $domain") {
            runCatching {
                val picked = JsonArray(emails.map { JsonPrimitive(it) })
                if (fixture != null) JsonObject(mapOf("emails" to picked))
                else api.call("notice-decide", _state.value.days, mapOf("domain" to JsonPrimitive(domain), "send" to JsonPrimitive(send), "email" to picked))
            }
                .onSuccess { out ->
                    val sentTo = out["emails"].strings().ifEmpty { listOfNotNull(out.str("email")) }.ifEmpty { emails }
                    val failed = out.objs("failed").map { it.str("email") + " (" + it.str("error") + ")" }
                    _state.update { s ->
                        val left = s.notices?.let { n -> JsonObject(n + ("notices" to JsonArray(n.objs("notices").filter { it.str("domain") != domain }))) }
                        s.copy(running = s.running - key, notices = left, noticeErrors = s.noticeErrors - domain,
                            toast = if (!send) "Dropped $domain." else "Sent to " + sentTo.joinToString(", ") + "." +
                                if (failed.isEmpty()) "" else " Not sent to " + failed.joinToString(", ") + ".")
                    }
                }
                .onFailure { e -> fail(e) { it.copy(running = it.running - key, noticeErrors = it.noticeErrors + (domain to (e.message ?: "Failed.")), toast = e.message ?: "Failed.") } }
            told()
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
