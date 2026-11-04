package com.carlosandmunoz.jarvis.push

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PersistableBundle
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Sign-in codes (#1898): the Copy button on a code push puts the code on the clipboard and clears the notification. */
object CodeCopy {
    private const val ACTION = "com.carlosandmunoz.jarvis.COPY_CODE"

    fun action(context: Context, code: String, tag: String): NotificationCompat.Action {
        val intent = Intent(context, CodeCopyReceiver::class.java).setAction(ACTION).putExtra("code", code).putExtra("tag", tag)
        val pi = PendingIntent.getBroadcast(context, (tag + code).hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Action.Builder(0, "Copy $code", pi).build()
    }

    fun copy(context: Context, code: String) {
        val clip = ClipData.newPlainText("Sign-in code", code)
        if (Build.VERSION.SDK_INT >= 33) clip.description.extras = PersistableBundle().apply { putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true) }
        (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(clip)
        if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, "Code copied", Toast.LENGTH_SHORT).show()
    }
}

class CodeCopyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val code = intent.getStringExtra("code")?.takeIf { it.isNotBlank() } ?: return
        CodeCopy.copy(context, code)
        intent.getStringExtra("tag")?.let { NotificationManagerCompat.from(context).cancel(it, 1) }
    }
}
