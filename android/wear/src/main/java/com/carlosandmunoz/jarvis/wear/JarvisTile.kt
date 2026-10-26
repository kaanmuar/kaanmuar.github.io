package com.carlosandmunoz.jarvis.wear

import android.content.Context
import androidx.concurrent.futures.SuspendToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders.DeviceParameters
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.CircularProgressIndicator
import androidx.wear.protolayout.material.ProgressIndicatorColors
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.EdgeContentLayout
import androidx.wear.tiles.EventBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture

/** Readiness as the ring, revenue today and the alert headline; a tap opens Jarvis on the phone. */
class JarvisTile : TileService() {

    override fun onTileRequest(req: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        SuspendToFutureAdapter.launchFuture {
            val s = Store.read(this@JarvisTile)
            if (s == null || System.currentTimeMillis() - s.at > Store.STALE_MS) Store.pull(this@JarvisTile)
            tile(this@JarvisTile, Store.read(this@JarvisTile), req.deviceConfiguration)
        }

    override fun onTileResourcesRequest(req: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        SuspendToFutureAdapter.launchFuture { ResourceBuilders.Resources.Builder().setVersion(RES).build() }

    override fun onTileAddEvent(event: EventBuilders.TileAddEvent) {
        SuspendToFutureAdapter.launchFuture { Store.pull(this@JarvisTile) }
    }

    companion object {
        private const val RES = "1"

        fun tile(context: Context, s: Store.Status?, device: DeviceParameters): TileBuilders.Tile =
            TileBuilders.Tile.Builder()
                .setResourcesVersion(RES)
                .setFreshnessIntervalMillis(Store.STALE_MS)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout(context, s, device)))
                .build()

        fun layout(context: Context, s: Store.Status?, device: DeviceParameters): LayoutElementBuilders.LayoutElement {
            fun text(value: String, type: Int, color: Int, lines: Int = 1) =
                Text.Builder(context, value).setTypography(type).setColor(argb(color)).setMaxLines(lines).build()
            val ring = CircularProgressIndicator.Builder()
                .setProgress(((s?.readiness ?: 0.0) / 100).toFloat().coerceIn(0f, 1f))
                .setStrokeWidth(6f)
                .setCircularProgressIndicatorColors(ProgressIndicatorColors(s?.color ?: Store.CYAN, Store.TRACK))
                .build()
            val body = LayoutElementBuilders.Column.Builder()
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .apply {
                    if (s == null) addContent(text("Open Jarvis on your phone", Typography.TYPOGRAPHY_BODY1, Store.TEXT, 3))
                    else {
                        addContent(text(s.percent, Typography.TYPOGRAPHY_DISPLAY2, Store.TEXT))
                        addContent(text(s.today, Typography.TYPOGRAPHY_CAPTION1, Store.MUTED))
                    }
                }
                .build()
            val layout = EdgeContentLayout.Builder(device)
                .setResponsiveContentInsetEnabled(true)
                .setEdgeContent(ring)
                .setPrimaryLabelTextContent(text("JARVIS", Typography.TYPOGRAPHY_CAPTION2, Store.CYAN))
                .setContent(body)
                .apply { if (s != null) setSecondaryLabelTextContent(text(s.headline, Typography.TYPOGRAPHY_CAPTION1, s.color)) }
                .build()
            val open = ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(
                    ActionBuilders.AndroidActivity.Builder()
                        .setPackageName(context.packageName)
                        .setClassName(WatchActivity::class.java.name)
                        .addKeyToExtraMapping(WatchActivity.EXTRA_OPEN, ActionBuilders.booleanExtra(true))
                        .build(),
                )
                .build()
            return LayoutElementBuilders.Box.Builder()
                .setWidth(expand()).setHeight(expand())
                .setModifiers(ModifiersBuilders.Modifiers.Builder()
                    .setClickable(ModifiersBuilders.Clickable.Builder().setId("open").setOnClick(open).build())
                    .build())
                .addContent(layout)
                .build()
        }
    }
}
