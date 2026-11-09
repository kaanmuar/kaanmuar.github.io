package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.push.Push
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SectionPushTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    private val saved = json("""{"versions":{"processes":{"v":"aaa111bbb222","at":"x"},"goals":{"v":"ccc333ddd444","at":"x"}}}""")

    @Test fun skipsWhenTheSavedSnapshotHoldsEveryVersion() {
        assertFalse(Push.sectionsStale("""{"goals":"ccc333ddd444","processes":"aaa111bbb222"}""", saved))
    }

    @Test fun refreshesWhenASectionMoved() {
        assertTrue(Push.sectionsStale("""{"goals":"ccc333ddd444","processes":"fff000fff000"}""", saved))
    }

    @Test fun refreshesWithNoSavedSnapshotOrNoVersions() {
        assertTrue(Push.sectionsStale("""{"processes":"aaa111bbb222"}""", null))
        assertTrue(Push.sectionsStale("""{"processes":"aaa111bbb222"}""", json("""{"products":{}}""")))
    }

    @Test fun refreshesOnAnUnreadablePush() {
        assertTrue(Push.sectionsStale("not json", saved))
    }
}
