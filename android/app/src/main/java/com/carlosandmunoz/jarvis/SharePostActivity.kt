package com.carlosandmunoz.jarvis

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.home.Home
import com.carlosandmunoz.jarvis.ui.ActionButton
import com.carlosandmunoz.jarvis.ui.GlassChip
import com.carlosandmunoz.jarvis.ui.J
import com.carlosandmunoz.jarvis.ui.JarvisTheme
import com.carlosandmunoz.jarvis.ui.Mono
import com.carlosandmunoz.jarvis.ui.Reactor
import com.carlosandmunoz.jarvis.ui.glass
import com.carlosandmunoz.jarvis.ui.reveal
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Share to post (#1420): a photo or video from any app (or the Social hub) with one caption; Gemini drafts each network's post, you edit, and the social-inbox workflow posts it. */
class SharePostActivity : ComponentActivity() {
    private sealed interface Step {
        data object Ready : Step
        data class Working(val what: String) : Step
        data class Draft(val id: String) : Step
        data object Queued : Step
        data class Failed(val message: String, val back: Step) : Step
    }

    private data class Media(val uri: Uri, val type: String, val name: String, val size: Long) {
        val video get() = type.startsWith("video/")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as JarvisApp
        val fixture = BuildConfig.DEBUG && java.io.File(filesDir, "jarvis/fixture.json").exists()
        val media = mediaOf(intent)
        setContent {
            JarvisTheme {
                val scope = rememberCoroutineScope()
                var caption by remember { mutableStateOf(intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()) }
                var step by remember { mutableStateOf<Step>(Step.Ready) }
                val draft = remember { mutableStateMapOf<String, String>() }
                var note by remember { mutableStateOf("") }

                fun makeDraft(m: Media) = scope.launch {
                    runCatching {
                        if (fixture) return@runCatching JsonObject(mapOf("id" to JsonPrimitive("fixture"), "draft" to JsonObject(
                            FIELDS.filter { m.video || it.first !in CLIP_FIELDS }.associate { it.first to JsonPrimitive(if (it.first == "title") caption.take(60) else caption) })))
                        step = Step.Working("Uploading…")
                        val ext = m.name.substringAfterLast('.', "").lowercase().filter { it.isLetterOrDigit() }.take(5).ifEmpty { if (m.video) "mp4" else "jpg" }
                        val path = "social-inbox/${System.currentTimeMillis().toString(36)}-${(100000..999999).random()}.$ext"
                        app.api.upload(path, m.type, m.size) { contentResolver.openInputStream(m.uri) ?: error("The file could not be read.") }
                        step = Step.Working("Drafting with Gemini…")
                        app.api.call("share-draft", 1, mapOf("path" to JsonPrimitive(path), "caption" to JsonPrimitive(caption.trim())))
                    }.onSuccess { out ->
                        draft.clear()
                        (out["draft"] as? JsonObject)?.forEach { (k, v) -> if (FIELDS.any { it.first == k }) draft[k] = (v as? JsonPrimitive)?.content.orEmpty() }
                        note = out.str("note").orEmpty()
                        step = Step.Draft(out.str("id").orEmpty())
                    }.onFailure { step = Step.Failed(it.message ?: "Jarvis could not draft the post.", Step.Ready) }
                }

                fun queue(id: String) = scope.launch {
                    val back = step
                    step = Step.Working("Queueing…")
                    runCatching {
                        if (!fixture) app.api.call("share-queue", 1, mapOf("id" to JsonPrimitive(id), "draft" to JsonObject(draft.mapValues { JsonPrimitive(it.value) })))
                    }.onSuccess { step = Step.Queued; delay(2800); finish() }
                        .onFailure { step = Step.Failed(it.message ?: "Jarvis could not queue the post.", back) }
                }

                fun drop(id: String) = scope.launch {
                    if (!fixture) runCatching { app.api.call("share-drop", 1, mapOf("id" to JsonPrimitive(id))) }
                    finish()
                }

                Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { if (step is Step.Ready) finish() }, contentAlignment = Alignment.BottomCenter) {
                    Column(
                        Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(12.dp).reveal()
                            .background(J.bg.copy(alpha = 0.94f), RoundedCornerShape(18.dp)).glass(radius = 18.dp).clickable(remember { MutableInteractionSource() }, null) { }.padding(18.dp)
                    ) {
                        Text("POST TO SOCIAL", color = J.cyan, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 2.sp)
                        Spacer(Modifier.height(10.dp))
                        AnimatedContent(step, transitionSpec = { (fadeIn() + slideInVertically { it / 6 }) togetherWith fadeOut() }, label = "step") { now ->
                            val shown = (now as? Step.Failed)?.back ?: now
                            val error = (now as? Step.Failed)?.message
                            when {
                                !app.auth.signedIn && !fixture -> SignedOut()
                                media == null -> Column {
                                    Text("Share a photo or a video", color = J.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                                    Text("JPG, PNG or WebP photos; MP4, MOV or WebM videos with sound.", color = J.muted, fontSize = 13.sp)
                                    TextButton(onClick = ::finish) { Text("Close", color = J.muted) }
                                }
                                now is Step.Queued -> Queued()
                                shown is Step.Draft -> Drafts(draft, note, error, now is Step.Working, { queue(shown.id) }, { drop(shown.id) })
                                else -> Form(media, caption, { caption = it }, (now as? Step.Working)?.what, error) { if (caption.isNotBlank()) makeDraft(media) }
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun Form(m: Media, caption: String, setCaption: (String) -> Unit, working: String?, error: String?, start: () -> Unit) = Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GlassChip(if (m.video) "VIDEO" else "PHOTO", true) { }
            Text(m.name, color = J.text, fontSize = 15.sp, maxLines = 1, modifier = Modifier.weight(1f))
            Text(size(m.size), color = J.muted, fontSize = 12.sp)
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(caption, setCaption, minLines = 3, maxLines = 6, label = { Text("What should the post say?") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors())
        Spacer(Modifier.height(8.dp))
        Text(if (m.video) "Posts as-is in the language you speak in it, and must have sound. Gemini drafts one post per network from your caption; you check them before anything goes out."
            else "Gemini drafts one post per network from your caption, in the language you write in; you check them before anything goes out.", color = J.dim, fontSize = 12.sp)
        if (error != null) Text(error, color = J.pink, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            ActionButton(working ?: "Draft with Gemini", working != null, start)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = ::finish) { Text("Cancel", color = J.muted) }
        }
    }

    @Composable
    private fun Drafts(draft: MutableMap<String, String>, note: String, error: String?, busy: Boolean, queue: () -> Unit, drop: () -> Unit) = Column {
        Text(note.ifEmpty { "Edit any post, then queue. LinkedIn, X and the Facebook Page get it about 30 minutes later." }, color = J.muted, fontSize = 12.sp)
        Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState()).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            FIELDS.filter { it.first in draft }.forEach { (key, label) ->
                OutlinedTextField(draft[key].orEmpty(), { draft[key] = it }, label = { Text(label) }, modifier = Modifier.fillMaxWidth(),
                    singleLine = key == "title" || key == "youtubeTitle", maxLines = 6, colors = fieldColors())
            }
        }
        if (error != null) Text(error, color = J.pink, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            ActionButton(if (busy) "Queueing…" else "Queue the post", busy, queue)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = drop, enabled = !busy) { Text("Drop", color = J.muted) }
        }
    }

    @Composable
    private fun Queued() = Row(verticalAlignment = Alignment.CenterVertically) {
        Reactor(100.0, "QUEUED", 72.dp)
        Spacer(Modifier.padding(start = 14.dp))
        Column {
            Text("Posting soon", color = J.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text("The hub page goes live first; follow it in Social hub › Share a post.", color = J.muted, fontSize = 13.sp)
        }
    }

    @Composable
    private fun SignedOut() = Column {
        Text("Sign in to Jarvis first", color = J.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Text("Posts go out as the owner account.", color = J.muted, fontSize = 13.sp)
        ActionButton("Open Jarvis", false) { startActivity(Home.open(this@SharePostActivity, "overview")); finish() }
    }

    @Composable
    private fun fieldColors() = OutlinedTextFieldDefaults.colors(focusedBorderColor = J.cyan, unfocusedBorderColor = J.dim, focusedTextColor = J.text, unfocusedTextColor = J.text,
        cursorColor = J.cyan, focusedLabelColor = J.cyan, unfocusedLabelColor = J.muted)

    private fun mediaOf(intent: Intent): Media? {
        val uri = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)) ?: intent.data ?: return null
        val type = (contentResolver.getType(uri) ?: intent.type ?: "").lowercase()
        if (type !in TYPES) return null
        var name = uri.lastPathSegment ?: "media"
        var size = -1L
        runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) { c.getString(0)?.let { name = it }; if (!c.isNull(1)) size = c.getLong(1) }
            }
        }
        return Media(uri, type, name, size)
    }

    private fun size(bytes: Long) = when { bytes < 0 -> ""; bytes < 1_048_576 -> "${bytes / 1024} KB"; else -> String.format(java.util.Locale.US, "%.1f MB", bytes / 1_048_576.0) }

    companion object {
        val TYPES = setOf("image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm")
        val FIELDS = listOf("title" to "Title", "linkedin" to "LinkedIn", "x" to "X", "facebook" to "Facebook", "instagram" to "Instagram",
            "tiktok" to "TikTok", "youtubeTitle" to "YouTube title", "youtube" to "YouTube")
        val CLIP_FIELDS = setOf("tiktok", "youtubeTitle", "youtube")
    }
}
