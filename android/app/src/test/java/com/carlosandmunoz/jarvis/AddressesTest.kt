package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.str
import com.carlosandmunoz.jarvis.ui.addressDetail
import com.carlosandmunoz.jarvis.ui.addressFix
import com.carlosandmunoz.jarvis.ui.addressGroups
import com.carlosandmunoz.jarvis.ui.addressLevel
import com.carlosandmunoz.jarvis.ui.domainChecks
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AddressesTest {
    private val rows = JSON.parseToJsonElement("""[
        {"address":"qa@carlosandmunoz.com","domain":"carlosandmunoz.com","system":"ImprovMX","kind":"alias","forwards":["owner@gmail.example","webhook"],"aliasOf":"","state":"ok","detail":"No mail in the last day.","fix":null},
        {"address":"canary@carlosandmunoz.com","domain":"carlosandmunoz.com","system":"ImprovMX","kind":"alias","forwards":["owner@gmail.example","webhook"],"aliasOf":"","state":"error","detail":"Missing from ImprovMX.","fix":{"by":"jarvis","action":"restore-alias"}},
        {"address":"qa@qalabreview.com","domain":"qalabreview.com","system":"Microsoft 365","kind":"mailbox alias","forwards":[],"aliasOf":"carlos@qalabreview.com","state":"ok","detail":"Delivers to carlos@qalabreview.com.","fix":null},
        {"address":"hello@qalabreview.com","domain":"qalabreview.com","system":"Instantly","kind":"sending mailbox","forwards":[],"aliasOf":"","state":"error","detail":"Permanent OAuth failure","fix":{"by":"carlos","action":"Reconnect","link":"https://app.instantly.ai/app/accounts"}}
    ]""").jsonArray.map { it.jsonObject }

    @Test fun rowsGroupByDomainInTheServersOrder() {
        val groups = addressGroups(rows)
        assertEquals(listOf("carlosandmunoz.com", "qalabreview.com"), groups.map { it.first })
        assertEquals(listOf("qa@qalabreview.com", "hello@qalabreview.com"), groups[1].second.map { it.str("address") })
    }

    @Test fun detailShowsForwardsOrAliasAndWhoFixesIt() {
        assertEquals("alias · ImprovMX · → owner@gmail.example, webhook · No mail in the last day.", addressDetail(rows[0]))
        assertEquals("alias · ImprovMX · → owner@gmail.example, webhook · Missing from ImprovMX. · Jarvis fixes it", addressDetail(rows[1]))
        assertEquals("mailbox alias · Microsoft 365 · alias of carlos@qalabreview.com · Delivers to carlos@qalabreview.com.", addressDetail(rows[2]))
        assertEquals("Reconnect →", addressFix(rows[3]))
        assertNull(addressFix(rows[0]))
    }

    @Test fun statesMapToLevels() {
        assertEquals(listOf("good", "warn", "warn", "alert"), listOf("ok", "warn", "paused", "error").map { addressLevel(it) })
        val domain = JSON.parseToJsonElement("""{"checks":[{"name":"MX","ok":true},{"name":"DKIM","ok":false}]}""").jsonObject
        assertEquals("MX ✓ · DKIM ✗", domainChecks(domain))
    }
}
