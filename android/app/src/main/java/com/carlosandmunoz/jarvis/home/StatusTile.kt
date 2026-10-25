package com.carlosandmunoz.jarvis.home

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.carlosandmunoz.jarvis.R

/** Quick-settings tile: readiness and the alert count in the shade; a tap opens Jarvis on Overview. */
class StatusTile : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        val tile = qsTile ?: return
        val saved = Home.snapshot(this)
        tile.icon = Icon.createWithResource(this, R.drawable.ic_stat_jarvis)
        tile.label = getString(R.string.tile_label)
        if (saved == null) {
            tile.state = Tile.STATE_INACTIVE
            if (Build.VERSION.SDK_INT >= 29) tile.subtitle = "Signed out"
        } else {
            val st = Home.status(saved.first)
            val ready = st.readiness?.let { "${it.toInt()}%" } ?: "—"
            tile.state = Tile.STATE_ACTIVE
            if (Build.VERSION.SDK_INT >= 29) tile.subtitle = "$ready · ${st.headline}" else tile.label = "Jarvis $ready"
            if (Build.VERSION.SDK_INT >= 30) tile.stateDescription = st.headline
        }
        tile.updateTile()
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val open = Home.open(this, "overview")
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(this, 7, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        else @Suppress("DEPRECATION") startActivityAndCollapse(open)
    }
}
