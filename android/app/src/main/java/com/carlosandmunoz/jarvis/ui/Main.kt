package com.carlosandmunoz.jarvis.ui

import android.text.format.DateUtils
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
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
    Column(Modifier.fillMaxSize().background(J.bg).imePadding().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Ring(100.0, "JARVIS", 110)
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

@Composable
fun LockScreen(unlock: () -> Unit) {
    Column(Modifier.fillMaxSize().background(J.bg), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
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
fun MainScreen(s: UiState, vm: JarvisViewModel, lockOn: Boolean, setLock: (Boolean) -> Unit) {
    var tab by rememberSaveable { mutableStateOf(Tab.Overview) }
    var product by rememberSaveable { mutableStateOf("review") }
    var page by rememberSaveable { mutableStateOf("") }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(s.toast) { s.toast?.let { snack.showSnackbar(it); vm.toastShown() } }

    when (page) {
        "ask" -> { BackHandler { page = "" }; AskScreen(s, vm) { page = "" }; return }
        "settings" -> { BackHandler { page = "" }; SettingsScreen(s, vm, lockOn, setLock) { page = "" }; return }
    }

    Scaffold(
        containerColor = J.bg,
        snackbarHost = { SnackbarHost(snack) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("JARVIS", fontFamily = Mono, letterSpacing = 3.sp, color = J.cyan)
                        Text(when {
                            s.loading -> "Updating…"
                            s.savedAt > 0 -> (if (s.error != null) "Offline · " else "") + "updated " + DateUtils.getRelativeTimeSpanString(s.savedAt)
                            else -> "No data yet"
                        }, fontSize = 11.sp, color = if (s.error != null) J.amber else J.muted)
                    }
                },
                actions = {
                    IconButton(onClick = { page = "ask" }) { Icon(Icons.Filled.Forum, "Ask Jarvis") }
                    IconButton(onClick = { page = "settings" }) { Icon(Icons.Filled.Settings, "Settings") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = J.bg)
            )
        },
        bottomBar = {
            NavigationBar(containerColor = J.bg) {
                Tab.entries.forEach { t -> NavigationBarItem(selected = tab == t, onClick = { tab = t }, icon = { Icon(ICONS.getValue(t), null) }, label = { Text(t.label, fontSize = 10.sp) }) }
            }
        }
    ) { pad ->
        PullToRefreshBox(isRefreshing = s.loading, onRefresh = vm::refresh, modifier = Modifier.padding(pad).fillMaxSize()) {
            Column(Modifier.fillMaxSize().verticalScroll(key(tab) { rememberScrollState() })) {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    RANGES.forEach { (d, label) -> FilterChip(selected = s.days == d, onClick = { vm.setDays(d) }, label = { Text(label) }) }
                }
                s.error?.let { e -> Panel("Could not refresh") { Text(e, color = J.amber, fontSize = 13.sp); if (s.snapshot != null) Muted("Showing the last saved numbers.") } }
                if (s.snapshot == null && s.loading) Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(); Spacer(Modifier.height(8.dp)); Muted("Jarvis is gathering every number. The first load takes up to a minute.") }
                }
                if (s.snapshot != null) when (tab) {
                    Tab.Overview -> OverviewScreen(s, vm) { product = it; tab = Tab.Products }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskScreen(s: UiState, vm: JarvisViewModel, back: () -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(s.chat.size, s.chat.lastOrNull()?.answer) { if (s.chat.isNotEmpty()) list.animateScrollToItem(s.chat.size - 1) }
    Scaffold(containerColor = J.bg, topBar = {
        TopAppBar(title = { Text("Ask Jarvis") }, navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = J.bg))
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
                        Text(c.question, color = J.cyan, modifier = Modifier.background(J.panel, RoundedCornerShape(10.dp)).padding(10.dp))
                        Spacer(Modifier.height(6.dp))
                        if (c.answer == null) Muted("Thinking…") else Text(c.answer, color = if (c.error) J.pink else J.text, fontSize = 14.sp)
                    }
                }
            }
            HorizontalDivider(color = J.line)
            Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(q, { q = it }, placeholder = { Text("Ask about the ${RANGES.toMap()[s.days]} numbers") }, modifier = Modifier.weight(1f), maxLines = 4)
                IconButton(onClick = { vm.ask(q); q = "" }, enabled = q.isNotBlank()) { Icon(Icons.AutoMirrored.Filled.Send, "Ask") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(s: UiState, vm: JarvisViewModel, lockOn: Boolean, setLock: (Boolean) -> Unit, back: () -> Unit) {
    val settings = s.snapshot.obj("settings")
    var mail by remember(settings) { mutableStateOf(listOf("daily", "gemini", "watch").associateWith { settings.obj("mail").bool(it) ?: false }) }
    Scaffold(containerColor = J.bg, topBar = {
        TopAppBar(title = { Text("Settings") }, navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = J.bg))
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
                val labels = mapOf("daily" to "Daily briefing email (07:40)", "gemini" to "Gemini summary in the daily email", "watch" to "Hourly alert email")
                labels.forEach { (k, label) ->
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
            Panel("About") {
                KeyRow("Version", BuildConfig.VERSION_NAME)
                KeyRow("Web dashboard", "open", url = "https://carlosandmunoz.com/admin.html#stats/overview/${s.days}")
                KeyRow("Releases", "open", url = "https://github.com/kaanmuar/kaanmuar.github.io/releases")
            }
            Spacer(Modifier.width(1.dp).height(24.dp))
        }
    }
}

private fun withMail(settings: JsonObject, mail: Map<String, Boolean>): JsonObject =
    JsonObject(settings + ("mail" to JsonObject(mail.mapValues { JsonPrimitive(it.value) })))
