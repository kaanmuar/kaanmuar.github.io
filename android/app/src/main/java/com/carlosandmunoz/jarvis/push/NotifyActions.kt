package com.carlosandmunoz.jarvis.push

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.carlosandmunoz.jarvis.JarvisApp
import com.carlosandmunoz.jarvis.R
import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.str
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Notification buttons (#1670): a press marks the notification busy and hands the work to NotifyWorker,
 * which runs the jarvis "notify-act" op and shows the outcome in the same notification. No unlock step.
 */
object NotifyActions {
    private const val ACTION = "com.carlosandmunoz.jarvis.NOTIFY_ACT"
    const val INPUT = "text"

    fun action(context: Context, data: Map<String, String>, button: Push.Button, text: String? = null): NotificationCompat.Action {
        val intent = Intent(context, ActionReceiver::class.java).setAction(ACTION)
            .putExtra("data", JsonObject(data.mapValues { JsonPrimitive(it.value) }).toString())
            .putExtra("act", button.act)
        if (text != null) intent.putExtra(INPUT, text)
        val code = ((data["tag"] ?: "") + button.act).hashCode()
        if (button.input == null) {
            val pi = PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            return NotificationCompat.Action.Builder(0, button.label, pi).build()
        }
        // Inline reply needs a mutable intent so the system can add the typed text.
        val pi = PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Action.Builder(0, button.label, pi)
            .addRemoteInput(RemoteInput.Builder(INPUT).setLabel(button.input).build())
            .setAllowGeneratedReplies(false)
            .build()
    }

    fun dataOf(raw: String?): Map<String, String> = runCatching {
        (JSON.parseToJsonElement(raw ?: "{}") as JsonObject).mapValues { (it.value as JsonPrimitive).content }
    }.getOrDefault(emptyMap())
}

class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val raw = intent.getStringExtra("data") ?: return
        val act = intent.getStringExtra("act") ?: return
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(NotifyActions.INPUT)?.toString()?.trim()
            ?: intent.getStringExtra(NotifyActions.INPUT)
        val data = NotifyActions.dataOf(raw)
        Push.result(context, data, if (text != null) "Sending: $text" else "Working…", busy = true)
        val work = OneTimeWorkRequestBuilder<NotifyWorker>()
            .setInputData(workDataOf("data" to raw, "act" to act, NotifyActions.INPUT to text))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("notify-" + (data["tag"] ?: act), ExistingWorkPolicy.KEEP, work)
    }
}

class NotifyWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val data = NotifyActions.dataOf(inputData.getString("data"))
        val act = inputData.getString("act") ?: return Result.failure()
        val text = inputData.getString(NotifyActions.INPUT)
        val extra = buildMap<String, JsonElement> {
            put("ref", JsonPrimitive(data["ref"].orEmpty()))
            put("act", JsonPrimitive(act))
            if (text != null) put("text", JsonPrimitive(text))
        }
        runCatching { (applicationContext as JarvisApp).api.call("notify-act", 1, extra) }
            .onSuccess { Push.result(applicationContext, data, it.str("message") ?: "Done.") }
            .onFailure { Push.result(applicationContext, data, "Didn't work: " + (it.message ?: "no answer."), retry = Push.Button(act, "Retry", null), retryText = text) }
        return Result.success()
    }

    // Expedited work runs as a foreground service before Android 12, which needs a notification.
    override suspend fun getForegroundInfo(): ForegroundInfo = ForegroundInfo(
        0x4A41,
        NotificationCompat.Builder(applicationContext, "test").setSmallIcon(R.drawable.ic_stat_jarvis)
            .setContentTitle("Jarvis").setContentText("Running a notification button").setSilent(true).build()
    )
}
