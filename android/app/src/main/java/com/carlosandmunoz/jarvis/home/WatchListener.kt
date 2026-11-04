package com.carlosandmunoz.jarvis.home

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** The watch asks for a summary when its tile is added or opened with nothing to show. */
class WatchListener : WearableListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != SYNC) return
        scope.launch { if (!Home.refresh(this@WatchListener)) Home.redraw(this@WatchListener) }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object { const val SYNC = "/jarvis/sync" }
}
