package com.carlosandmunoz.jarvis.background

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.R
import com.carlosandmunoz.jarvis.home.Home
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Work the owner starts outlives the screen (#2531): while anything holds Keep, [KeepService] keeps the process
 * running in the foreground, and an answer that lands while Jarvis is out of sight arrives as a notification.
 */
object Keep {
    const val WORKING = "working"
    const val ANSWERS = "answers"
    private const val ANSWER_ID = 2532

    data class Hold(val label: String, val mic: Boolean)

    private val _holds = MutableStateFlow<Map<Long, Hold>>(emptyMap())
    val holds: StateFlow<Map<Long, Hold>> = _holds
    private val next = AtomicLong()

    fun channels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(WORKING, "Working in the background", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shown while Jarvis listens, answers or runs something you started after you leave the app."
            setShowBadge(false)
        })
        nm.createNotificationChannel(NotificationChannel(ANSWERS, "Answers", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "An answer or result that finished while Jarvis was not on screen."
        })
    }

    /** [mic] asks for the microphone type, which Android only grants while Jarvis is on screen. */
    fun hold(context: Context, label: String, mic: Boolean = false): Long {
        val id = next.incrementAndGet()
        _holds.update { it + (id to Hold(label, mic)) }
        KeepService.start(context)
        return id
    }

    fun release(id: Long) = _holds.update { it - id }

    suspend fun <T> during(context: Context, label: String, block: suspend () -> T): T {
        val id = hold(context, label)
        try { return block() } finally { release(id) }
    }

    fun visible() = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

    /** On screen the screen shows the result; away, it becomes a notification that opens [tab]. */
    fun tell(context: Context, title: String, text: String, tab: String = "overview") {
        if (visible()) return
        val app = context.applicationContext
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val open = PendingIntent.getActivity(app, ANSWER_ID, Home.open(app, tab), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(app, ANSWERS)
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setColor(0xFF38E1FF.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(NotificationCompat.Builder(app, ANSWERS).setSmallIcon(R.drawable.ic_stat_jarvis).setContentTitle("Jarvis answered").build())
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(app).notify(ANSWER_ID, n) }
    }
}

/** The foreground service behind [Keep]: one quiet notification with Stop, gone when the last hold is released. */
class KeepService : Service() {
    private val app get() = application as JarvisApp
    private var watch: Job? = null
    private var types = 0
    private var lock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        lock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:keep").apply { setReferenceCounted(false) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) app.stopVoice()
        show(Keep.holds.value)
        if (watch == null) watch = app.scope.launch {
            Keep.holds.collect { h -> if (h.isEmpty()) stop() else show(h) }
        }
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) = stop()

    override fun onDestroy() {
        running = false
        watch?.cancel()
        lock?.takeIf { it.isHeld }?.release()
        super.onDestroy()
    }

    private fun stop() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun show(holds: Map<Long, Keep.Hold>) {
        val handsFree = app.handsFree.on.value
        val voice = handsFree || holds.values.any { it.mic } || app.speaker.speaking.value != null
        val label = if (handsFree) "Ask anything. Say \"stop\" to end hands-free." else holds.values.lastOrNull()?.label ?: "Finishing up"
        val open = PendingIntent.getActivity(this, ID, Home.open(this, "ask"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, Keep.WORKING)
            .setSmallIcon(R.drawable.ic_stat_jarvis)
            .setColor(0xFF38E1FF.toInt())
            .setContentTitle(if (handsFree) "Jarvis is listening" else "Jarvis is working")
            .setContentText(label)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
            .apply {
                if (voice) addAction(0, "Stop", PendingIntent.getService(this@KeepService, ID, Intent(this@KeepService, KeepService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE))
            }
            .build()
        val mic = holds.values.any { it.mic } && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val wanted = types or (if (mic) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
        // Android refuses the microphone type once Jarvis is off screen; the running types then stay as they are.
        types = listOf(wanted, types, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC).filter { it != 0 }.distinct()
            .firstOrNull { t -> runCatching { ServiceCompat.startForeground(this, ID, n, t) }.isSuccess } ?: types
        lock?.acquire(LOCK_MS)
    }

    companion object {
        private const val ID = 2531
        private const val STOP = "com.carlosandmunoz.jarvis.KEEP_STOP"
        private const val LOCK_MS = 10 * 60_000L
        @Volatile private var running = false

        /** Started from the screen that began the work; a running service just picks up the new hold. */
        fun start(context: Context) {
            if (running) return
            runCatching { ContextCompat.startForegroundService(context, Intent(context, KeepService::class.java)) }
        }
    }
}
