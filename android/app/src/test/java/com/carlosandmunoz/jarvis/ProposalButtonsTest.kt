package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.push.Push
import com.carlosandmunoz.jarvis.ui.ProposalButtons
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class ProposalButtonsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    private fun acts(p: JsonObject) = ProposalButtons.of(p).map { it["act"].toString().trim('"') }

    @Test fun theServersButtonsWinAndOldProposalsKeepDoneAndDismiss() {
        val p = json("""{"key":"job","buttons":[{"act":"run","label":"Run rivalSweep again","action":"run-job","jobs":["rivalSweep"]},{"act":"open","label":"Open Systems","tab":"systems"},{"act":"dismissed","label":"Dismiss"},{"act":"done","label":"Done"}]}""")
        assertEquals(listOf("run", "open", "dismissed"), acts(p))
        assertEquals(listOf("done", "dismissed"), acts(json("""{"key":"old"}""")))
    }

    @Test fun aRunAsksInWordsAndSendsItsJobsWorkflowsOrSource() {
        val jobs = json("""{"act":"run","label":"Run 2 jobs again","action":"run-job","jobs":["rivalSweep","mailCanary"]}""")
        assertEquals("run 2 jobs again (rivalSweep, mailCanary)", ProposalButtons.ask(jobs))
        assertEquals("publish the Social hub (run refreshSocialHubStats)", ProposalButtons.ask(json("""{"act":"run","label":"Publish the hub","action":"publish-hub"}""")))
        val extra = ProposalButtons.extra(jobs, "job")
        assertEquals(JsonPrimitive("run-job"), extra["action"])
        assertEquals(JsonPrimitive("job"), extra["proposal"])
        assertEquals(2, (extra["jobs"] as JsonArray).size)
        assertEquals("resume the outreach mailboxes Jarvis paused that have been healthy for two hourly checks", ProposalButtons.ask(json("""{"act":"run","label":"Resume mailboxes","action":"resume-outreach"}""")))
    }

    @Test fun aPageSpeedProposalAsksToMergeOrCloseItsPr() {
        val p = json("""{"key":"pagespeed:pr:12","buttons":[{"act":"run","label":"Merge #12","action":"pagespeed-merge","pr":12},{"act":"close","label":"Close #12","action":"pagespeed-close","pr":12},{"act":"dismissed","label":"Dismiss"}]}""")
        assertEquals(listOf("run", "close", "dismissed"), acts(p))
        assertEquals("close PageSpeed fixes #12 without merging", ProposalButtons.ask(ProposalButtons.of(p)[1]))
    }

    @Test fun aPushOpenButtonKeepsItsTabOrLink() {
        val data = mapOf("actions" to """[{"act":"run","label":"Re-run Pages"},{"act":"open","label":"Open ↗","url":"https://github.com/x"},{"act":"open","label":"Open Systems","tab":"systems"},{"act":"dismissed","label":"Dismiss"}]""")
        val b = Push.buttons(data)
        assertEquals(3, b.size)
        assertEquals("https://github.com/x", b[1].url)
        assertEquals("systems", b[2].tab)
    }
}
