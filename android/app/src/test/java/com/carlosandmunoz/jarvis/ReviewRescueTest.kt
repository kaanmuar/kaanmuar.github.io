package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.ReviewRescue
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ReviewRescueTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun promisesShowTheHoursLeftAndTheirColour() {
        assertEquals("past due", ReviewRescue.hoursLeft(-1.0))
        assertEquals("3.5 h left", ReviewRescue.hoursLeft(3.5))
        assertEquals("alert", ReviewRescue.promiseLevel(1.5))
        assertEquals("warn", ReviewRescue.promiseLevel(6.0))
        assertEquals("good", ReviewRescue.promiseLevel(30.0))
    }

    @Test fun waysAndStepsReadLikeTheWebPanel() {
        assertEquals(listOf("self", "quote", "package", "call"), ReviewRescue.WAYS.map { it.first })
        assertEquals("Paid / accepted", ReviewRescue.STEPS.toMap()["accepted"])
    }

    @Test fun aPaidRequestSaysPackagePriceAndAge() {
        assertEquals("security-headers · 99 USD · paid 4 d ago (late)", ReviewRescue.paidLine(json("""{"package":"security-headers","priceUsd":99,"daysWaiting":4,"late":true}""")))
        assertEquals("quote · 250 USD · paid 0 d ago", ReviewRescue.paidLine(json("""{"package":"","priceUsd":250,"daysWaiting":0,"late":false}""")))
    }

    @Test fun quotasShowTheCapAndTheSplit() {
        assertEquals("2,300 of 2,581 (89.1%) · 1,100 clients · 1,200 sweeps", ReviewRescue.quotaLine(json("""{"used":2300,"cap":2581,"pct":89.1,"customer":1100,"sweep":1200}""")))
        assertEquals("12 of 5,000 (0.2%) · 40 calls", ReviewRescue.quotaLine(json("""{"used":12,"cap":5000,"pct":0.2,"calls":40}""")))
        assertEquals("3", ReviewRescue.quotaLine(json("""{"used":3,"cap":null,"pct":null}""")))
        assertEquals("warn", ReviewRescue.quotaLevel(89.1))
        assertEquals("alert", ReviewRescue.quotaLevel(100.0))
        assertEquals("info", ReviewRescue.quotaLevel(null))
    }

    @Test fun sourcesAndFamiliesReadPlainly() {
        assertEquals("alert", ReviewRescue.sourceLevel("down"))
        assertEquals("info", ReviewRescue.sourceLevel("off"))
        assertEquals("1 of 2 · 1 client · 1 high", ReviewRescue.familyLine(json("""{"hits":1,"checked":2,"customerHits":1,"critical":1,"unchecked":0}""")))
        assertEquals("0 of 3 · 3 not checked", ReviewRescue.familyLine(json("""{"hits":0,"checked":3,"customerHits":0,"critical":0,"unchecked":3}""")))
    }
}
