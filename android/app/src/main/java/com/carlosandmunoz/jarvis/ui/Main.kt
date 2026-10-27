@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.carlosandmunoz.jarvis.ui

import android.Manifest
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.StopCircle
import androidx.core.content.ContextCompat
import android.text.format.DateUtils
import androidx.core.app.NotificationManagerCompat
import androidx.compose.ui.platform.LocalContext
import android.os.Build
import com.carlosandmunoz.jarvis.home.GoalsWidgetReceiver
import com.carlosandmunoz.jarvis.home.AlertsWidgetReceiver
import com.carlosandmunoz.jarvis.home.AskWidgetReceiver
import com.carlosandmunoz.jarvis.home.MoneyWidgetReceiver
import com.carlosandmunoz.jarvis.home.HealthWidgetReceiver
import com.carlosandmunoz.jarvis.home.SocialWidgetReceiver
import com.carlosandmunoz.jarvis.home.NextWidgetReceiver
import com.carlosandmunoz.jarvis.home.MarketingWidgetReceiver
import com.carlosandmunoz.jarvis.home.PipelineWidgetReceiver
import com.carlosandmunoz.jarvis.home.TrafficWidgetReceiver
import com.carlosandmunoz.jarvis.home.PickWidgetReceiver
import com.carlosandmunoz.jarvis.PickConfigActivity
import com.carlosandmunoz.jarvis.home.NeedsWidgetReceiver
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.home.NumbersWidgetReceiver
import com.carlosandmunoz.jarvis.home.StatusWidgetReceiver
import com.carlosandmunoz.jarvis.push.Push
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalTextStyle
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import com.carlosandmunoz.jarvis.voice.Voice
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.BuildConfig
import com.carlosandmunoz.jarvis.JarvisViewModel
import com.carlosandmunoz.jarvis.Tab
import com.carlosandmunoz.jarvis.UiState
import com.carlosandmunoz.jarvis.data.bool
import com.carlosandmunoz.jarvis.data.obj
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

val RANGES = listOf(1 to "24h", 7 to "7d", 30 to "30d", 90 to "90d", 365 to "1y")

@Composable
fun SignInScreen(s: UiState, vm: JarvisViewModel) {
    var email by rememberSaveable { mutableStateOf(s.email ?: "") }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().imePadding().padding(20.dp), contentAlignment = Alignment.Center) {
    Column(Modifier.fillMaxWidth().reveal().glass().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Reactor(100.0, "JARVIS", 120.dp)
        Spacer(Modifier.height(24.dp))
        if (s.pendingCode == null) {
            Text("Sign in with the owner account", color = J.muted)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            Button(onClick = { vm.signIn(email, password) }, enabled = !s.busy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text(if (s.busy) "Signing in…" else "Sign in") }
        } else {
            Text("Code from ${s.pendingCode.factor}", color = J.muted)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(code, { if (it.length <= 6) code = it.filter(Char::isDigit) }, label = { Text("6-digit code") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            Button(onClick = { vm.submitCode(code) }, enabled = !s.busy && code.length == 6, modifier = Modifier.fillMaxWidth()) { Text(if (s.busy) "Checking…" else "Verify") }
            TextButton(onClick = vm::cancelCode) { Text("Start again") }
        }
        s.authError?.let { Spacer(Modifier.height(8.dp)); Text(it, color = J.pink) }
    }
    }
}

@Composable
fun LockScreen(unlock: () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Reactor(100.0, "LOCKED", 120.dp)
        Spacer(Modifier.height(12.dp))
        Icon(Icons.Filled.Lock, null, tint = J.cyan)
        Spacer(Modifier.height(12.dp))
        Text("Jarvis is locked")
        Spacer(Modifier.height(12.dp))
        Button(onClick = unlock) { Text("Unlock") }
    }
}

private val ICONS: Map<Tab, ImageVector> = mapOf(Tab.Overview to Icons.Filled.Dashboard, Tab.Products to Icons.Filled.Widgets, Tab.Business to Icons.Filled.AttachMoney, Tab.Traffic to Icons.Filled.Public, Tab.Systems to Icons.Filled.Dns)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(s: UiState, vm: JarvisViewModel, lockOn: Boolean, openTab: String?, tabOpened: () -> Unit, setLock: (Boolean) -> Unit) {
    var tab by rememberSaveable { mutableStateOf(Tab.Overview) }
    var product by rememberSaveable { mutableStateOf("review") }
    var page by rememberSaveable { mutableStateOf("") }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(s.toast) { s.toast?.let { snack.showSnackbar(it); vm.toastShown() } }
    LaunchedEffect(openTab) {
        openTab?.let { target ->
            val (name, chip) = target.split(':', limit = 2).let { it[0] to it.getOrNull(1) }
            Tab.entries.firstOrNull { it.name.equals(name, ignoreCase = true) }?.let { tab = it; page = "" }
            chip?.takeIf { c -> CHIPS.any { it.first == c } }?.let { product = it }
            tabOpened()
        }
    }
    if (page.isNotEmpty()) BackHandler { page = "" }

    AnimatedContent(page, transitionSpec = {
        val forward = targetState.isNotEmpty()
        (fadeIn(tween(320)) + slideInHorizontally(tween(420, easing = FastOutSlowInEasing)) { if (forward) it / 3 else -it / 3 } + scaleIn(tween(420), 0.94f)) togetherWith
            (fadeOut(tween(220)) + slideOutHorizontally(tween(420, easing = FastOutSlowInEasing)) { if (forward) -it / 4 else it / 4 } + scaleOut(tween(420), 0.96f))
    }, label = "page") { shown ->
        when (shown) {
            "ask" -> AskScreen(s, vm) { page = "" }
            "settings" -> SettingsScreen(s, vm, lockOn, setLock) { page = "" }
            else -> Scaffold(
                containerColor = Color.Transparent,
                snackbarHost = { SnackbarHost(snack) },
                topBar = {
                    TopAppBar(
                        title = {
                            Column {
                                Text("JARVIS", fontFamily = Mono, letterSpacing = 5.sp, color = J.cyan, fontWeight = FontWeight.Bold,
                                    style = LocalTextStyle.current.copy(shadow = Shadow(J.cyan, blurRadius = 18f)))
                                Text(when {
                                    s.loading -> "Updating…"
                                    s.savedAt > 0 -> (if (s.error != null) "Offline · " else "") + "updated " + DateUtils.getRelativeTimeSpanString(s.savedAt)
                                    else -> "No data yet"
                                }, fontSize = 11.sp, fontFamily = Mono, color = if (s.error != null) J.amber else J.muted)
                            }
                        },
                        actions = {
                            IconButton(onClick = { page = "ask" }, modifier = Modifier.tilt()) { Icon(Icons.Filled.Forum, "Ask Jarvis", tint = J.cyan) }
                            IconButton(onClick = { page = "settings" }, modifier = Modifier.tilt()) { Icon(Icons.Filled.Settings, "Settings", tint = J.muted) }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                        modifier = Modifier.topFade()
                    )
                },
                bottomBar = { Dock(tab) { tab = it } }
            ) { pad ->
                PullToRefreshBox(isRefreshing = s.loading, onRefresh = vm::refresh, modifier = Modifier.padding(pad).fillMaxSize()) {
                    AnimatedContent(tab, transitionSpec = {
                        val dir = if (targetState.ordinal > initialState.ordinal) 1 else -1
                        (fadeIn(tween(300)) + slideInHorizontally(tween(450, easing = FastOutSlowInEasing)) { dir * it / 5 } + scaleIn(tween(450), 0.96f)) togetherWith
                            (fadeOut(tween(200)) + slideOutHorizontally(tween(450, easing = FastOutSlowInEasing)) { -dir * it / 6 } + scaleOut(tween(450), 0.97f))
                    }, label = "tab") { shownTab ->
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                RANGES.forEach { (d, label) -> GlassChip(label, s.days == d) { vm.setDays(d) } }
                            }
                            s.error?.let { e -> Panel("Could not refresh") { Text(e, color = J.amber, fontSize = 13.sp); if (s.snapshot != null) Muted("Showing the last saved numbers.") } }
                            if (s.snapshot == null && s.loading) Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) { Reactor(null, "LOADING"); Spacer(Modifier.height(12.dp)); Muted("Jarvis is gathering every number. The first load takes up to a minute.") }
                            }
                            if (s.snapshot != null) when (shownTab) {
                                Tab.Overview -> OverviewScreen(s, vm) { target -> Tab.entries.firstOrNull { it.name.equals(target, ignoreCase = true) }?.let { tab = it } ?: run { product = target; tab = Tab.Products } }
                                Tab.Products -> ProductsScreen(s, vm, product) { product = it }
                                Tab.Business -> BusinessScreen(s)
                                Tab.Traffic -> TrafficScreen(s)
                                Tab.Systems -> SystemsScreen(s, vm)
                            }
                            Spacer(Modifier.height(24.dp))
                        }
                    }
                }
            }
        }
    }
}

/** Floating glass dock; a lit plate slides under the picked tab. */
@Composable
private fun Dock(tab: Tab, pick: (Tab) -> Unit) {
    val n = Tab.entries.size
    val at by animateFloatAsState(tab.ordinal.toFloat(), spring(0.7f, Spring.StiffnessMediumLow), label = "dock")
    Box(Modifier.navigationBarsPadding().padding(horizontal = 14.dp, vertical = 10.dp).fillMaxWidth().height(64.dp).glass(radius = 20.dp, brackets = false, glow = 1.4f)) {
        Box(Modifier.fillMaxSize().drawBehind {
            val w = size.width / n; val pad = 6.dp.toPx()
            val x = at * w + pad
            drawRoundRect(Brush.verticalGradient(listOf(J.cyan.copy(alpha = 0.28f), J.cyan.copy(alpha = 0.06f))), Offset(x, pad), Size(w - 2 * pad, size.height - 2 * pad), CornerRadius(14.dp.toPx()))
            drawRoundRect(J.cyan.copy(alpha = 0.7f), Offset(x, pad), Size(w - 2 * pad, size.height - 2 * pad), CornerRadius(14.dp.toPx()), style = Stroke(1.dp.toPx()))
            drawRoundRect(J.cyan, Offset(x + (w - 2 * pad) / 2 - 12.dp.toPx(), pad), Size(24.dp.toPx(), 2.dp.toPx()), CornerRadius(2f))
        })
        Row(Modifier.fillMaxSize()) {
            Tab.entries.forEach { t ->
                val on = t == tab
                val lift by animateFloatAsState(if (on) 1f else 0f, spring(0.5f, Spring.StiffnessLow), label = "lift")
                Column(Modifier.weight(1f).fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { pick(t) }.graphicsLayer { translationY = -3.dp.toPx() * lift; scaleX = 1f + 0.12f * lift; scaleY = 1f + 0.12f * lift },
                    verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(ICONS.getValue(t), null, tint = if (on) J.cyan else J.muted, modifier = Modifier.size(22.dp))
                    Text(t.label, fontSize = 10.sp, fontFamily = Mono, color = if (on) J.text else J.dim)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskScreen(s: UiState, vm: JarvisViewModel, back: () -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(s.chat.size, s.chat.lastOrNull()?.answer) { if (s.chat.isNotEmpty()) list.animateScrollToItem(s.chat.size - 1) }
    Scaffold(containerColor = Color.Transparent, topBar = {
        TopAppBar(modifier = Modifier.topFade(), title = { Text("Ask Jarvis") }, navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent))
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().imePadding()) {
            LazyColumn(Modifier.weight(1f), state = list) {
                if (s.chat.isEmpty()) item {
                    Panel("Try") {
                        listOf("What needs my attention today?", "How did URL Review revenue move against last period?", "Which page is slowest and why?", "Where do CV visitors come from?", "Is anything failing in the pipeline?")
                            .forEach { sample -> TextButton(onClick = { vm.ask(sample) }) { Text(sample) } }
                    }
                }
                items(s.chat) { c ->
                    Column(Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(c.question, color = J.cyan, modifier = Modifier.reveal().glass(brackets = false, radius = 10.dp).padding(12.dp))
                        Spacer(Modifier.height(6.dp))
                        if (c.answer == null) Muted("Thinking…") else Row(verticalAlignment = Alignment.Top) {
                            Text(c.answer, color = if (c.error) J.pink else J.text, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            if (!c.error) IconButton(onClick = { vm.speak(c.answer) }) {
                                Icon(if (s.speaking == c.answer) Icons.Filled.StopCircle else Icons.AutoMirrored.Filled.VolumeUp, if (s.speaking == c.answer) "Stop" else "Read aloud",
                                    tint = if (s.speaking == c.answer) J.cyan else J.muted)
                            }
                        }
                    }
                }
            }
            HorizontalDivider(color = J.line)
            val context = LocalContext.current
            val mic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) vm.listen() }
            val listen = {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) vm.listen()
                else mic.launch(Manifest.permission.RECORD_AUDIO)
            }
            s.heard.error?.let { Text(it, color = J.amber, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
            AnimatedContent(s.heard.listening, label = "input") { listening ->
                if (listening) Row(Modifier.padding(8.dp).fillMaxWidth().glass(radius = 14.dp, brackets = false).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    VoiceOrb(s.heard.level, true, 52.dp)
                    Spacer(Modifier.width(10.dp))
                    Text(s.heard.partial.ifEmpty { "Listening…" }, color = if (s.heard.partial.isEmpty()) J.muted else J.text, fontSize = 15.sp, modifier = Modifier.weight(1f), maxLines = 3)
                    TextButton(onClick = vm::stopListening) { Text("Stop", color = J.cyan) }
                } else Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(q, { q = it }, placeholder = { Text("Ask about the ${RANGES.toMap()[s.days]} numbers") }, modifier = Modifier.weight(1f), maxLines = 4)
                    if (q.isBlank()) IconButton(onClick = { vm.heardShown(); listen() }) { Icon(Icons.Filled.Mic, "Ask by voice", tint = J.cyan) }
                    else IconButton(onClick = { vm.ask(q); q = "" }) { Icon(Icons.AutoMirrored.Filled.Send, "Ask") }
                }
            }
        }
    }
}

private fun openAssistantSettings(context: android.content.Context) {
    val tries = listOf(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS), Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS), Intent(Settings.ACTION_SETTINGS))
    tries.firstOrNull { runCatching { context.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(s: UiState, vm: JarvisViewModel, lockOn: Boolean, setLock: (Boolean) -> Unit, back: () -> Unit) {
    val settings = s.snapshot.obj("settings")
    var mail by remember(settings) { mutableStateOf(MAIL_LABELS.keys.associateWith { settings.obj("mail").bool(it) ?: false }) }
    Scaffold(containerColor = Color.Transparent, topBar = {
        TopAppBar(modifier = Modifier.topFade(), title = { Text("Settings") }, navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent))
    }) { pad ->
        Column(Modifier.padding(pad).verticalScroll(rememberScrollState())) {
            Panel("Account") {
                KeyRow("Signed in as", s.email ?: "—")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text("Lock with fingerprint or screen lock"); Muted("Asked when you open Jarvis after a minute away.") }
                    Switch(lockOn, setLock)
                }
                TextButton(onClick = vm::signOut) { Text("Sign out", color = J.pink) }
            }
            if (settings != null) Panel("Jarvis mail") {
                Muted("Everything below also arrives as a push. Off, it waits for the evening digest.")
                MAIL_LABELS.forEach { (k, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(label, Modifier.weight(1f))
                        Switch(mail[k] == true, { on ->
                            mail = mail + (k to on)
                            vm.act("settings", "settings-save", mapOf("settings" to withMail(settings, mail))) { "Saved." }
                        })
                    }
                }
                Muted("Goals, thresholds and search queries are edited in Admin › Statistics on the web.")
            }
            Panel("Push notifications") {
                val context = LocalContext.current
                val allowed = NotificationManagerCompat.from(context).areNotificationsEnabled()
                if (!allowed) Text("Notifications are off for Jarvis on this phone.", color = J.amber, fontSize = 13.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text("Live status"); Muted("Readiness as a ring in the status bar, what needs you and today's money. Updates silently on each refresh.") }
                    Switch(s.ongoing, vm::setOngoing)
                }
                mapOf(
                    Push.ALERTS to ("Alerts" to "A threshold crossing from the hourly watch, at any hour."),
                    Push.BRIEFING to ("Daily briefing" to "The 07:40 briefing, next to the email."),
                    Push.MONEY to ("Payments" to "Each live PayPal payment, with the amount and who paid."),
                    Push.REVIEWS to ("New reviews" to "A customer's review finished, with its score."),
                    Push.OUTREACH to ("Outreach approvals" to "Owner notices waiting to be sent, at most hourly."),
                    Push.INBOX to ("Inbox" to "CV messages, CV feedback and site owners' replies."),
                    Push.DESK to ("Review desk" to "Runs as they go, held re-runs, comparisons and runs that need you."),
                    Push.SOCIAL to ("Social posts" to "Each post Jarvis proposes, with Post and Skip."),
                )
                    .forEach { (kind, text) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(text.first); Muted(text.second) }
                            Switch(s.push[kind] != false, { vm.setPush(kind, it) })
                        }
                    }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("Send a test", "test-push" in s.running) { vm.testPush() }
                    ActionButton("Sound and style", false) {
                        context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                    }
                }
                Muted("Email and push are separate: the mail switches above do not silence the phone.")
            }
            Panel("Voice") {
                val context = LocalContext.current
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text("Speak answers"); Muted("Questions you ask by voice are answered aloud.") }
                    Switch(s.speak, vm::setSpeak)
                }
                val phone = java.util.Locale.getDefault().getDisplayLanguage(java.util.Locale.ENGLISH)
                Text("Language")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    GlassChip("Phone ($phone)", s.voiceLang == null) { vm.setVoiceLang(null) }
                    GlassChip("English", s.voiceLang == "en") { vm.setVoiceLang("en") }
                    GlassChip("Español", s.voiceLang == "es") { vm.setVoiceLang("es") }
                }
                listOf("en" to "English voice", "es" to "Spanish voice").forEach { (lang, title) ->
                    Text(title)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Voice.VOICES.filter { it.lang == lang }.forEach { o -> GlassChip(o.label, s.voices[lang] == o.name) { vm.setVoice(o) } }
                    }
                }
                var rate by remember(s.rate) { mutableFloatStateOf(s.rate) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Speed", Modifier.weight(1f))
                    Muted("%.2f×".format(java.util.Locale.ROOT, rate))
                }
                Slider(rate, { rate = it }, onValueChangeFinished = { vm.setRate(rate) }, valueRange = Voice.RATE_MIN..Voice.RATE_MAX, steps = 9,
                    colors = SliderDefaults.colors(thumbColor = J.cyan, activeTrackColor = J.cyan, inactiveTrackColor = J.line))
                Row { ActionButton(if (s.speaking in Voice.SAMPLE.values) "Playing…" else "Preview", false) { vm.preview() } }
                Muted("Tap a voice to hear it. Jarvis listens and answers in the language above; other languages keep the standard Google voice.")
                val held = Build.VERSION.SDK_INT >= 29 && context.getSystemService(RoleManager::class.java).isRoleHeld(RoleManager.ROLE_ASSISTANT)
                Row { ActionButton(if (held) "Assistant settings" else "Use Jarvis as the phone's assistant", false) { openAssistantSettings(context) } }
                Muted(if (held) "Jarvis is the phone's assistant: long-press the power or home button and ask."
                    else "Pick Jarvis under Digital assistant app; then long-press the power or home button and ask. \"Hey Google, open Jarvis\" works either way.")
            }
            Panel("Home screen") {
                val context = LocalContext.current
                val pinnable = Home.canPin(context)
                if (pinnable) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton("Status", false) { Home.pin(context, StatusWidgetReceiver::class.java) }
                    ActionButton("Numbers", false) { Home.pin(context, NumbersWidgetReceiver::class.java) }
                    ActionButton("Goals", false) { Home.pin(context, GoalsWidgetReceiver::class.java) }
                    ActionButton("Needs you", false) { Home.pin(context, NeedsWidgetReceiver::class.java) }
                    ActionButton("Alerts", false) { Home.pin(context, AlertsWidgetReceiver::class.java) }
                    ActionButton("Ask bar", false) { Home.pin(context, AskWidgetReceiver::class.java) }
                    ActionButton("Money", false) { Home.pin(context, MoneyWidgetReceiver::class.java) }
                    ActionButton("Site health", false) { Home.pin(context, HealthWidgetReceiver::class.java) }
                    ActionButton("Social queue", false) { Home.pin(context, SocialWidgetReceiver::class.java) }
                    ActionButton("Next up", false) { Home.pin(context, NextWidgetReceiver::class.java) }
                    ActionButton("Pipeline", false) { Home.pin(context, PipelineWidgetReceiver::class.java) }
                    ActionButton("Marketing", false) { Home.pin(context, MarketingWidgetReceiver::class.java) }
                    ActionButton("Traffic", false) { Home.pin(context, TrafficWidgetReceiver::class.java) }
                    ActionButton("Pick a number", false) { Home.pin(context, PickWidgetReceiver::class.java, Intent(context, PickConfigActivity::class.java)) }
                }
                if (Build.VERSION.SDK_INT >= 33) Row { ActionButton("Add the quick-settings tile", false) { Home.addTile(context) } }
                Muted(if (pinnable) "Widgets refresh every half hour and whenever the app or a push brings new numbers. Long-press the app icon for shortcuts; share a link to Jarvis to review it."
                    else "Add Jarvis widgets from your launcher's widget list. Long-press the app icon for shortcuts; share a link to Jarvis to review it.")
            }
            Panel("About") {
                KeyRow("Version", BuildConfig.VERSION_NAME)
                Row { ActionButton("Check for updates", "update" in s.running) { vm.checkUpdate() } }
                Muted("Jarvis updates itself: it checks every six hours and as soon as a new release is published.")
                KeyRow("Web dashboard", "open", url = "https://carlosandmunoz.com/admin.html#stats/overview/${s.days}")
                KeyRow("Releases", "open", url = "https://github.com/kaanmuar/kaanmuar.github.io/releases")
            }
            Spacer(Modifier.width(1.dp).height(24.dp))
        }
    }
}

// Merged into the saved switches, so the ones the app does not show (the weekly strategy) keep their value.
private fun withMail(settings: JsonObject, mail: Map<String, Boolean>): JsonObject =
    JsonObject(settings + ("mail" to JsonObject((settings.obj("mail") ?: JsonObject(emptyMap())) + mail.mapValues { JsonPrimitive(it.value) })))

// The owner emails Jarvis also pushes (#1672), as in Admin › Statistics › Settings.
private val MAIL_LABELS = linkedMapOf(
    "digest" to "Evening digest email (20:00)", "daily" to "Daily briefing email (07:40)", "gemini" to "Gemini summary in the daily email", "watch" to "Alert email",
    "messages" to "New CV messages", "ratings" to "New CV feedback", "siteDaily" to "Daily CV site report", "siteQuarter" to "Quarter-hour CV site report",
    "reviewDaily" to "Daily URL review report", "reviewQuarter" to "Quarter-hour URL review report", "reruns" to "Held URL review re-runs",
    "reviewOpened" to "URL Review was opened", "comparisons" to "Comparison saved", "reviewEvents" to "URL review events (refunds and disputes always email)",
    "ops" to "Ops: jobs missed or failed", "ownerReplies" to "Owner replies", "ownerRemind" to "Owner replies still waiting"
)
