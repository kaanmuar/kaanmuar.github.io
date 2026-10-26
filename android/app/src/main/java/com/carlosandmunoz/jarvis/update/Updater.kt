package com.carlosandmunoz.jarvis.update

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.IntentCompat
import androidx.core.content.edit
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.carlosandmunoz.jarvis.BuildConfig
import com.carlosandmunoz.jarvis.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Self-update (#1562): finds the newest jarvis-android-v* release CI published, downloads the APK and
 * installs it with PackageInstaller. Android 12+ lets an app update itself without a prompt; otherwise
 * Android asks once, straight away when the app is open or from a notification when it is not.
 */
object Updater {
    data class Release(val code: Long, val name: String, val apk: String, val sha256: String?)

    const val CHANNEL = "updates"
    private const val TAG = "jarvis-android-v"
    private const val RELEASES = "https://api.github.com/repos/kaanmuar/kaanmuar.github.io/releases?per_page=30"
    private const val STATUS = BuildConfig.APPLICATION_ID + ".UPDATE_STATUS"
    private const val WORK = "jarvis-update"
    private const val NOTE = 1562
    private const val EVERY_MS = 6 * 3600_000L
    private val busy = AtomicBoolean(false)
    private val json = Json { ignoreUnknownKeys = true }
    private val http by lazy { OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build() }

    fun channel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "A new Jarvis version installed, or one that needs a tap to install." })
    }

    /** Every six hours on any network, plus once now; the release push calls [soon] instead. */
    fun schedule(context: Context) {
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val wm = WorkManager.getInstance(context)
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<UpdateWorker>(6, TimeUnit.HOURS).setConstraints(net).build())
        wm.enqueueUniqueWork("$WORK-open", ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<UpdateWorker>().setConstraints(net).build())
    }

    /** A release push arrived: check now, ignoring the six-hour spacing. */
    fun soon(context: Context) {
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(context).enqueueUniqueWork("$WORK-now", ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<UpdateWorker>().setConstraints(net).setInputData(workDataOf("force" to true)).build())
    }

    /** Checks, downloads and starts the install. Returns a line for the app to show. */
    suspend fun run(context: Context, force: Boolean): String = withContext(Dispatchers.IO) {
        if (BuildConfig.DEBUG) return@withContext "Debug builds don't update themselves."
        val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (!force && now - prefs.getLong("checkedAt", 0) < EVERY_MS) return@withContext "Checked recently."
        if (!busy.compareAndSet(false, true)) return@withContext "Already checking."
        try {
            val rel = latest() ?: return@withContext "Couldn't reach GitHub. Try again later."
            prefs.edit { putLong("checkedAt", now) }
            if (rel.code <= BuildConfig.VERSION_CODE) return@withContext "Jarvis ${BuildConfig.VERSION_NAME} is the latest version."
            install(context, download(context, rel), rel)
            "Installing Jarvis ${rel.name}."
        } catch (e: Exception) {
            "The update failed: ${e.message ?: e.javaClass.simpleName}"
        } finally {
            busy.set(false)
        }
    }

    private fun latest(): Release? {
        val req = Request.Builder().url(RELEASES).header("Accept", "application/vnd.github+json").build()
        return http.newCall(req).execute().use { r -> if (r.isSuccessful) newest(r.body!!.string()) else null }
    }

    /** CI tags each build 1.0.<run number> and uses that run number as the versionCode. */
    internal fun newest(body: String): Release? = json.parseToJsonElement(body).jsonArray.mapNotNull { el ->
        val o = el.jsonObject
        val tag = o["tag_name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        if (!tag.startsWith(TAG) || o["draft"]?.jsonPrimitive?.boolean == true) return@mapNotNull null
        val name = tag.removePrefix(TAG)
        val code = name.substringAfterLast('.').toLongOrNull() ?: return@mapNotNull null
        val asset = o["assets"]?.jsonArray?.map { it.jsonObject }?.firstOrNull { it["name"]?.jsonPrimitive?.contentOrNull == "jarvis-$name.apk" } ?: return@mapNotNull null
        val url = asset["browser_download_url"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        Release(code, name, url, asset["digest"]?.jsonPrimitive?.contentOrNull?.takeIf { it.startsWith("sha256:") }?.removePrefix("sha256:"))
    }.maxByOrNull { it.code }

    private fun download(context: Context, rel: Release): File {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "${rel.code}.apk")
        http.newCall(Request.Builder().url(rel.apk).build()).execute().use { r ->
            if (!r.isSuccessful) error("download returned HTTP ${r.code}")
            file.outputStream().use { r.body!!.byteStream().copyTo(it) }
        }
        rel.sha256?.let { want ->
            val got = file.inputStream().use { input ->
                val md = MessageDigest.getInstance("SHA-256")
                val buf = ByteArray(64 * 1024)
                while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) }
                md.digest().joinToString("") { "%02x".format(it) }
            }
            if (!got.equals(want, ignoreCase = true)) { file.delete(); error("the download didn't match its checksum") }
        }
        return file
    }

    private fun install(context: Context, apk: File, rel: Release) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setSize(apk.length())
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("base.apk", 0, apk.length()).use { out -> apk.inputStream().use { it.copyTo(out) }; session.fsync(out) }
            val status = Intent(context, UpdateReceiver::class.java).setAction(STATUS).putExtra("name", rel.name)
            // The installer fills in the status extras, so the PendingIntent has to stay mutable.
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            session.commit(PendingIntent.getBroadcast(context, id, status, flags).intentSender)
        }
    }

    internal fun notify(context: Context, title: String, text: String?, tap: PendingIntent? = null) {
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setContentTitle(title)
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(tap ?: context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { PendingIntent.getActivity(context, NOTE, it, PendingIntent.FLAG_IMMUTABLE) })
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(NOTE, n) }
    }
}

class UpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        Updater.run(applicationContext, inputData.getBoolean("force", false))
        return Result.success()
    }
}

class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Updater.notify(context, "Jarvis updated to ${BuildConfig.VERSION_NAME}", "Open it to see what's new.")
            return
        }
        val name = intent.getStringExtra("name").orEmpty()
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java) ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) context.startActivity(confirm)
                else Updater.notify(context, "Jarvis $name is ready", "Tap to install it.",
                    PendingIntent.getActivity(context, 0, confirm, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            }
            PackageInstaller.STATUS_SUCCESS, PackageInstaller.STATUS_FAILURE_ABORTED -> Unit
            else -> Updater.notify(context, "Jarvis $name didn't install", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
        }
    }
}
