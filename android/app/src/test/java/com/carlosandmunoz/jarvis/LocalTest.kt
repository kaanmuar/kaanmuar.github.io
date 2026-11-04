package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Local
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class LocalTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun issuesReadLikeTheWebPanel() {
        assertEquals("Opening hours", Local.issue("local-hours"))
        assertEquals("No profile found", Local.issue("local-profile"))
        assertEquals("local-new", Local.issue("local-new"))
    }

    @Test fun theWorstResultPicksTheDotColour() {
        assertEquals("alert", Local.level("fail"))
        assertEquals("warn", Local.level("risk"))
        assertEquals("good", Local.level(""))
    }

    @Test fun theIssueRowCountsSitesAndFailing() {
        assertEquals("1 site", Local.sites(1.0, 0.0))
        assertEquals("1 site · 1 failing", Local.sites(1.0, 1.0))
        assertEquals("3 sites", Local.sites(3.0, null))
    }

    @Test fun theLineSaysProfileIssuesAndOutreach() {
        assertEquals("profile found · Opening hours, No UTM tags · outreach",
            Local.line(json("""{"profile":true,"outreach":true,"issues":[{"key":"local-hours"},{"key":"local-utm"}]}""")))
        assertEquals("no profile · No profile found", Local.line(json("""{"profile":false,"issues":[{"key":"local-profile"}]}""")))
        assertEquals("profile found", Local.line(json("""{"profile":true,"issues":[]}""")))
    }
}
