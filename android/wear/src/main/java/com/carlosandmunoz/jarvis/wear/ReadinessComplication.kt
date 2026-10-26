package com.carlosandmunoz.jarvis.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

/** Readiness on any watch face: a ring (ranged value) or "92%" with the alert count as its title. */
class ReadinessComplication : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType) =
        data(type, Store.Status(92.0, 0, 1, "1 warning", "$184", 3, null, 0))

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? =
        Store.read(this)?.let { data(request.complicationType, it) } ?: NoDataComplicationData()

    private fun data(type: ComplicationType, s: Store.Status): ComplicationData? {
        fun plain(t: String) = PlainComplicationText.Builder(t).build()
        val tap = PendingIntent.getActivity(this, 0, Intent(this, WatchActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val describe = plain("Readiness ${s.percent}, ${s.headline}")
        val title = when { s.alerts > 0 -> "${s.alerts} !"; s.warns > 0 -> "${s.warns} ⚠"; else -> "OK" }
        return when (type) {
            ComplicationType.RANGED_VALUE ->
                RangedValueComplicationData.Builder((s.readiness ?: 0.0).toFloat(), 0f, 100f, describe)
                    .setText(plain(s.readiness?.toInt()?.toString() ?: "—")).setTitle(plain(title)).setTapAction(tap).build()
            ComplicationType.SHORT_TEXT ->
                ShortTextComplicationData.Builder(plain(s.percent), describe).setTitle(plain(title)).setTapAction(tap).build()
            else -> null
        }
    }
}
