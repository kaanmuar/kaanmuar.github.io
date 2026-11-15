package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.data.obj
import com.carlosandmunoz.jarvis.data.objs
import com.carlosandmunoz.jarvis.ui.ACTION_LABELS
import com.carlosandmunoz.jarvis.ui.Github
import com.carlosandmunoz.jarvis.ui.askFor
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The GitHub tab's fix buttons, re-run states, flaky rows and security actions (#2808). */
class GithubActionsTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    private val sec = json(
        """{"dependabot":{"ok":true,"open":3,"bySeverity":{"critical":1,"high":1,"medium":0,"low":1},"byRepo":[{"label":"kaanmuar/kaanmuar.github.io","value":3}],
        "items":[{"repo":"kaanmuar/kaanmuar.github.io","number":1,"severity":"critical","package":"axios","manifest":"package-lock.json","patched":"1.7.4","pr":{"number":2520,"url":"u"}},
        {"repo":"kaanmuar/kaanmuar.github.io","number":3,"severity":"low","package":"left-pad","manifest":"package.json","patched":"1.3.0","summary":"Slow padding"}]},
        "codeScanning":{"ok":true,"open":2,"bySeverity":{"critical":0,"high":0,"medium":1,"low":1},"byRepo":[{"label":"kaanmuar/kaanmuar.github.io","value":1},{"label":"kaanmuar/qa-lab-outreach","value":1}],
        "items":[{"repo":"kaanmuar/qa-lab-outreach","number":7,"severity":"low","rule":"js/xss"}]},
        "secrets":{"ok":true,"open":1,"bySeverity":{"critical":1},"byRepo":[{"label":"kaanmuar/qa-lab-outreach","value":1}],"items":[{"repo":"kaanmuar/qa-lab-outreach","number":4,"severity":"low","type":"Google API Key"}]}}"""
    )

    @Test fun reRunStatesFollowGithubRun() {
        val queued = Github.runResult(json("""{"ok":true,"status":"queued","done":false,"attempt":2,"url":"https://x/runs/9"}"""))
        assertEquals(GhResult("queued", "Attempt 2: queued…", "https://x/runs/9", "Watch the run"), queued)
        assertEquals("running", Github.runResult(json("""{"status":"in_progress","done":false,"attempt":2}""")).state)
        assertEquals("Attempt 2: in progress…", Github.runResult(json("""{"status":"in_progress","done":false,"attempt":2}""")).text)
        assertEquals(GhResult("done", "Passed on attempt 3.", "u", "Open the run"), Github.runResult(json("""{"status":"completed","conclusion":"success","done":true,"attempt":3,"url":"u"}""")))
        val red = Github.runResult(json("""{"status":"completed","conclusion":"failure","done":true,"attempt":2,"url":""}"""))
        assertEquals("failed", red.state)
        assertEquals("Ended failure on attempt 2.", red.text)
        assertNull(red.url)
        assertEquals(10_000L * 90, Github.POLL_MS * Github.POLL_TRIES)
    }

    @Test fun fixRunsTheDiagnosisActionOrLeavesOnlyTheAgent() {
        assertEquals("Fix: re-run", Github.fixLabel(json("""{"action":"rerun-ci"}"""), null))
        assertEquals("Fix: update with main", Github.fixLabel(json("""{"action":"gh-update-pr"}"""), 2505))
        assertNull(Github.fixLabel(json("""{"action":"gh-update-pr"}"""), null))
        assertNull(Github.fixLabel(json("""{"action":"gh-agent"}"""), 1))
        assertNull(Github.fixLabel(json("""{"action":"none"}"""), 1))
        assertNull(Github.fixLabel(null, 1))
    }

    @Test fun aDiagnosisDraftsTheSameAgentPromptAsItsRun() {
        val d = json("""{"run":903,"workflow":"Unit tests","branch":"chore/footer","pr":2505,"url":"https://x/runs/903","cause":"Behind main.","fix":"Merge main.","prompt":"","repo":null}""")
        val run = Github.diagRun(d)
        assertEquals("Unit tests", run["name"].let { (it as JsonPrimitive).content })
        assertFalse(run.containsKey("repo"))
        val prompt = Github.runPrompt(run)
        assertTrue(prompt, prompt.contains("\"Unit tests\" run on chore/footer (PR #2505)"))
        assertTrue(prompt.contains("Likely cause: Behind main."))
        assertEquals("Use this.", Github.runPrompt(Github.diagRun(json("""{"run":1,"workflow":"W","prompt":"Use this."}"""))))
    }

    @Test fun quarantineTitlesTheFlakyWorkflowAsTheServerFilesIt() {
        assertEquals("CI: Cypress is flaky (9% of 140 runs)", Github.quarantineTitle(json("""{"name":"Cypress","pct":9,"runs":140}""")))
        assertTrue(askFor("gh-quarantine", "CI: Cypress is flaky (9% of 140 runs)", null).contains("area:ci"))
    }

    @Test fun dismissSendsTheReasonAndCommentGithubTakes() {
        assertEquals(listOf("tolerable_risk", "fix_started", "inaccurate", "no_bandwidth", "not_used"), Github.DISMISS_REASONS.getValue("dependabot").map { it.first })
        assertEquals(listOf("false positive", "won't fix", "used in tests"), Github.DISMISS_REASONS.getValue("codeScanning").map { it.first })
        assertNull(Github.DISMISS_REASONS["secrets"])
        val item = sec.obj("dependabot").objs("items")[1]
        val body = JsonObject(Github.dismissArgs("dependabot", item, "not_used", "  Only a dev script uses it.  "))
        assertEquals(json("""{"action":"gh-dismiss-alert","kind":"dependabot","repo":"kaanmuar/kaanmuar.github.io","number":3,"reason":"not_used","comment":"Only a dev script uses it.","target":"left-pad #3"}"""), body)
        val long = Github.dismissArgs("codeScanning", sec.obj("codeScanning").objs("items")[0], "won't fix", "x".repeat(400))
        assertEquals(280, (long.getValue("comment") as JsonPrimitive).content.length)
        assertEquals("js/xss #7", (long.getValue("target") as JsonPrimitive).content)
    }

    @Test fun securityAlertsCountBySeverityRepoAndLowOnes() {
        assertEquals(listOf("Dependabot" to listOf(1, 1, 0, 1), "Code scanning" to listOf(0, 0, 1, 1), "Secret scanning" to listOf(1, 0, 0, 0)), Github.severityRows(sec))
        assertEquals("Critical 1, High 1, Low 1", Github.severityText(listOf(1, 1, 0, 1)))
        assertEquals(listOf("kaanmuar/kaanmuar.github.io" to 4.0, "kaanmuar/qa-lab-outreach" to 2.0), Github.alertsByRepo(sec))
        val lows = Github.lowAlerts(sec)
        assertEquals(listOf(json("""{"kind":"dependabot","repo":"kaanmuar/kaanmuar.github.io","number":3}"""), json("""{"kind":"codeScanning","repo":"kaanmuar/qa-lab-outreach","number":7}""")), lows)
        assertEquals(emptyList<Any>(), Github.severityRows(json("""{"dependabot":{"ok":false,"error":"no"}}""")))
        assertTrue(askFor("gh-dismiss-low", null, null, 2).startsWith("dismiss 2 low security alerts"))
    }

    @Test fun alertFixesDraftTheUpgradeAndTicketsLeaveThePrOut() {
        val pad = sec.obj("dependabot").objs("items")[1]
        assertEquals("Upgrade left-pad to 1.3.0 or later in package.json (Dependabot alert #3 in kaanmuar/kaanmuar.github.io: Slow padding). Update the lockfile, run the affected tests, and open a PR against main.", Github.securityPrompt(pad))
        val axios = sec.obj("dependabot").objs("items")[0]
        val args = Github.alertArgs("dependabot", axios)
        assertFalse(args.containsKey("pr"))
        assertEquals("dependabot", (args.getValue("kind") as JsonPrimitive).content)
        assertEquals("dependabot:kaanmuar/kaanmuar.github.io#1", Github.alertKey("dependabot", axios))
        assertEquals("Google API Key", Github.alertName("secrets", sec.obj("secrets").objs("items")[0]))
        listOf("gh-quarantine", "gh-security-ticket", "gh-dismiss-alert", "gh-dismiss-low").forEach { assertTrue(it, ACTION_LABELS.containsKey(it)) }
    }

}
