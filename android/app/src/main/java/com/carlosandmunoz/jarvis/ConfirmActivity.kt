package com.carlosandmunoz.jarvis

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.ui.ActionButton
import com.carlosandmunoz.jarvis.ui.J
import com.carlosandmunoz.jarvis.ui.JarvisTheme
import com.carlosandmunoz.jarvis.ui.Mono
import com.carlosandmunoz.jarvis.ui.glass
import com.carlosandmunoz.jarvis.ui.reveal
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/** Widgets (#1666): a one-tap decision on an owner notice, a social pick or posting the social queue, behind the app lock when it is on. */
class ConfirmActivity : FragmentActivity() {
    private class Choice(val label: String, val op: String, val extra: Map<String, JsonElement>, val done: String)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as JarvisApp
        val fixture = BuildConfig.DEBUG && java.io.File(filesDir, "jarvis/fixture.json").exists()
        val kind = intent.getStringExtra(EXTRA_KIND) ?: return finish()
        val id = intent.getStringExtra(EXTRA_ID) ?: return finish()
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        val detail = intent.getStringExtra(EXTRA_DETAIL)
        val email = intent.getStringExtra(EXTRA_EMAIL)
        val notice = kind == "notice"
        val post = kind == "post"
        val reload = if (notice) "notices" else if (post) null else "social-proposals"
        fun noticeChoice(send: Boolean) = Choice(if (send) "Send" else "Drop", "notice-decide",
            mapOf("domain" to JsonPrimitive(id), "send" to JsonPrimitive(send), "email" to JsonPrimitive(email.orEmpty())), if (send) "Sent to $email." else "Dropped.")
        fun socialChoice(approve: Boolean) = Choice(if (approve) "Approve" else "Dismiss", "social-decide",
            mapOf("id" to JsonPrimitive(id), "decision" to JsonPrimitive(if (approve) "approved" else "dismissed")),
            if (approve) "Approved. The next daily hub build publishes it." else "Dismissed.")
        val primary = if (post) Choice("Post now", "social-post-now", emptyMap(), "Started.") else if (notice) noticeChoice(true).takeIf { email != null } else socialChoice(true)
        val secondary = if (post) null else if (notice) noticeChoice(false) else socialChoice(false)
        setContent {
            JarvisTheme {
                val scope = rememberCoroutineScope()
                var busy by remember { mutableStateOf<String?>(null) }
                var result by remember { mutableStateOf<String?>(null) }
                var error by remember { mutableStateOf<String?>(null) }
                fun run(c: Choice) = unlocked {
                    busy = c.label; error = null
                    scope.launch {
                        runCatching { if (fixture) null else app.api.call(c.op, 1, c.extra) }
                            .onSuccess { out ->
                                result = out?.str("note") ?: c.done
                                if (reload != null) runCatching { if (!fixture) app.api.fetch(reload, 1) } else Home.refreshSoon(app)
                                Home.redraw(app)
                                delay(1400)
                                finish()
                            }
                            .onFailure { busy = null; error = it.message ?: "Jarvis could not do that." }
                    }
                }
                Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { finish() }, contentAlignment = Alignment.BottomCenter) {
                    Column(
                        Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp).reveal()
                            .background(J.bg.copy(alpha = 0.94f), RoundedCornerShape(18.dp)).glass(radius = 18.dp).clickable(remember { MutableInteractionSource() }, null) { }.padding(18.dp)
                    ) {
                        Text(if (notice) "OWNER NOTICE" else if (post) "SOCIAL QUEUE" else "SOCIAL PICK", color = J.cyan, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 2.sp)
                        Spacer(Modifier.height(10.dp))
                        Text(title, color = J.text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                        if (detail != null) Text(detail, color = J.muted, fontSize = 13.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(if (post) "Starts every channel's posting run now instead of at its next scheduled time."
                            else if (notice) "Send emails the site owner the review's findings. Drop takes the site out of the queue."
                            else "Approve adds it to the Social hub's next daily build. Dismiss drops it.", color = J.dim, fontSize = 12.sp)
                        when {
                            !app.auth.signedIn && !fixture -> Text("Sign in to Jarvis first.", color = J.pink, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
                            result != null -> Text(result!!, color = J.green, fontSize = 14.sp, modifier = Modifier.padding(top = 10.dp))
                            else -> {
                                error?.let { Text(it, color = J.pink, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    primary?.let { c -> ActionButton(if (busy == c.label) c.label + "…" else c.label, busy == c.label) { if (busy == null) run(c) } }
                                    Spacer(Modifier.width(8.dp))
                                    secondary?.let { c -> ActionButton(if (busy == c.label) c.label + "…" else c.label, busy == c.label) { if (busy == null) run(c) } }
                                    Spacer(Modifier.weight(1f))
                                    TextButton(onClick = { startActivity(Home.open(this@ConfirmActivity, if (notice) "products:outreach" else "products:hub")); finish() }) { Text("Open", color = J.muted) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /** Runs [then] at once when the app lock is off, otherwise after the same unlock prompt the app opens with. */
    private fun unlocked(then: () -> Unit) {
        val vault = (application as JarvisApp).vault
        val canLock = BiometricManager.from(this).canAuthenticate(BIOMETRIC_WEAK or DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS
        if (!vault.flag("lock", true) || !canLock) return then()
        val info = BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Jarvis").setAllowedAuthenticators(BIOMETRIC_WEAK or DEVICE_CREDENTIAL).build()
        BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = then()
        }).authenticate(info)
    }

    companion object {
        private const val EXTRA_KIND = "jarvis.confirm.kind"
        private const val EXTRA_ID = "jarvis.confirm.id"
        private const val EXTRA_TITLE = "jarvis.confirm.title"
        private const val EXTRA_DETAIL = "jarvis.confirm.detail"
        private const val EXTRA_EMAIL = "jarvis.confirm.email"

        /** Each row gets its own data URI, so the launcher keeps one PendingIntent per row. */
        fun intent(context: Context, need: Home.Need): Intent = Intent(context, ConfirmActivity::class.java)
            .setData(Uri.parse("jarvis://confirm/" + need.kind + "/" + Uri.encode(need.id)))
            .putExtra(EXTRA_KIND, need.kind).putExtra(EXTRA_ID, need.id).putExtra(EXTRA_TITLE, need.title)
            .putExtra(EXTRA_DETAIL, need.detail).putExtra(EXTRA_EMAIL, need.email)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    }
}
