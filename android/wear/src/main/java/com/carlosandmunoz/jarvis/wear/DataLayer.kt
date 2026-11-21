package com.carlosandmunoz.jarvis.wear

import android.content.Context
import com.google.android.horologist.data.WearDataLayerRegistry
import com.google.android.horologist.data.store.ProtoDataListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Shared Horologist registry for the watch (#3836). */
object DataLayer {
    @Volatile private var instance: WearDataLayerRegistry? = null
    @Volatile private var listenerBound = false

    fun registry(context: Context): WearDataLayerRegistry {
        instance?.let { return it }
        synchronized(this) {
            instance?.let { return it }
            return WearDataLayerRegistry.fromContext(
                application = context.applicationContext,
                coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
            ).also {
                it.registerSerializer(WatchPayloadSerializer)
                instance = it
            }
        }
    }

    /** Registers the status listener once so WearDataService can wake and update the tile. */
    fun bindStatusListener(context: Context, onPayload: (WatchPayload) -> Unit) {
        val reg = registry(context)
        synchronized(this) {
            if (listenerBound) return
            reg.registerProtoDataListener(
                path = Store.PATH,
                listener = object : ProtoDataListener<WatchPayload> {
                    override fun dataAdded(nodeId: String, path: String, value: WatchPayload) {
                        onPayload(value)
                    }

                    override fun dataDeleted(nodeId: String, path: String) {
                        onPayload(WatchPayload(empty = true))
                    }
                },
                serializer = WatchPayloadSerializer,
            )
            listenerBound = true
        }
    }
}
