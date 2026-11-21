package com.carlosandmunoz.jarvis.wear

import com.google.android.horologist.data.WearDataLayerRegistry
import com.google.android.horologist.data.WearDataService

/** Wakes on phone→watch Data Layer writes (#3836 Horologist WearDataService). */
class SyncService : WearDataService() {
    override val registry: WearDataLayerRegistry by lazy {
        DataLayer.registry(this).also {
            DataLayer.bindStatusListener(this) { Store.apply(this, it) }
        }
    }
}
