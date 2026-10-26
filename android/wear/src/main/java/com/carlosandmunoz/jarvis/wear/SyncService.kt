package com.carlosandmunoz.jarvis.wear

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

class SyncService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        events.filter { it.type == DataEvent.TYPE_CHANGED && it.dataItem.uri.path == Store.PATH }
            .lastOrNull()?.let { Store.write(this, DataMapItem.fromDataItem(it.dataItem).dataMap) }
    }
}
