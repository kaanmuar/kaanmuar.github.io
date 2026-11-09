package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.ACTION_LABELS
import com.carlosandmunoz.jarvis.ui.CHIPS
import com.carlosandmunoz.jarvis.ui.Github
import com.carlosandmunoz.jarvis.ui.askFor
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GithubTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun gradesFollowTheContractBands() {
        assertEquals("A", Github.grade(90.0))
        assertEquals("B", Github.grade(89.9))
        assertEquals("C", Github.grade(70.0))
        assertEquals("D", Github.grade(60.0))
        assertEquals("F", Github.grade(59.0))
        assertEquals("—", Github.grade(null))
        assertEquals("good", Github.tone("elite"))
        assertEquals("alert", Github.tone("F"))
        assertEquals("warn", Github.tone("medium"))
        assertEquals("info", Github.tone(null))
    }

    @Test fun stagesKeepScrumOrderCountFlowAndLightWipOverTheLimit() {
        val board = json("""{"wip":18,"wipLimit":15,"columns":[{"name":"Done","count":40},{"name":"Dev","count":9,"ageMedD":3.5},{"name":"Backlog","count":120},{"name":"QA","count":6}]}""")
        val flow = listOf(json("""{"from":"Design","to":"Dev","count":4}"""), json("""{"from":"design","to":"dev","count":1}"""), json("""{"from":"Dev","to":"QA","count":3}"""))
        val st = Github.stages(board, flow)
        assertEquals(Github.COLUMNS, st.map { it.name })
        val dev = st.first { it.name == "Dev" }
        assertEquals(9, dev.count)
        assertEquals(3.5, dev.ageMedD!!, 0.0)
        assertEquals(5, dev.into)
        assertTrue(dev.over)
        assertFalse(st.first { it.name == "Backlog" }.over)
        assertEquals(0, st.first().into)
        assertFalse(Github.stages(json("""{"wip":3,"wipLimit":15,"columns":[{"name":"Dev","count":3}]}"""), emptyList()).any { it.over })
        assertTrue(Github.stages(json("{}"), flow).isEmpty())
    }

    @Test fun prStatesAndButtons() {
        assertEquals("ready to merge" to "good", Github.prState("clean", "pass"))
        assertEquals("conflicts" to "alert", Github.prState("dirty", "pass"))
        assertEquals("behind main" to "warn", Github.prState("behind", "pending"))
        val green = json("""{"number":12,"state":"clean","checks":"pass"}""")
        val behind = json("""{"number":13,"state":"behind","checks":"pass"}""")
        val dirty = json("""{"number":14,"title":"Fix login","branch":"fix/14","state":"dirty","checks":"fail"}""")
        assertTrue(Github.canMerge(green)); assertFalse(Github.canUpdate(green))
        assertTrue(Github.canUpdate(behind)); assertFalse(Github.canMerge(behind))
        assertFalse(Github.canMerge(json("""{"state":"clean","checks":"pending"}""")))
        assertTrue(Github.hasConflicts(dirty))
        assertTrue(Github.conflictPrompt(dirty).startsWith("Resolve the merge conflicts of PR #14 (fix/14)"))
    }

    @Test fun agentPromptPrefersGeminiAndClips() {
        val drafted = json("""{"name":"CI","branch":"main","diag":{"prompt":"Fix the flaky test in a.spec.js"}}""")
        assertEquals("Fix the flaky test in a.spec.js", Github.runPrompt(drafted))
        val bare = json("""{"name":"Deploy","branch":"feat/9","pr":9,"url":"https://github.com/x/runs/1","diag":{"cause":"lint error","fix":"run eslint --fix"}}""")
        val p = Github.runPrompt(bare)
        assertTrue(p.startsWith("Fix the failing \"Deploy\" run on feat/9 (PR #9)."))
        assertTrue(p.contains("Likely cause: lint error") && p.contains("Suggested fix: run eslint --fix") && p.contains("https://github.com/x/runs/1"))
        assertEquals("short", Github.clip("short"))
        val long = "x".repeat(700)
        assertEquals(Github.PROMPT_MAX, Github.clip(long).length)
        assertTrue(Github.clip(long).endsWith("…"))
    }

    @Test fun xpProgressRatesDurationsAndBudget() {
        // level 3 starts at 50·2² = 200 XP; the next level at 450
        assertEquals(0.4f, Github.xpProgress(json("""{"xp":300,"level":3,"nextAt":450}"""))!!, 0.001f)
        assertNull(Github.xpProgress(json("""{"xp":300}""")))
        assertEquals(93.0, Github.rate(0.93)!!, 1e-9)
        assertEquals(93.0, Github.rate(93.0)!!, 1e-9)
        assertEquals("45 s", Github.dur(45.0))
        assertEquals("3 min", Github.dur(200.0))
        assertEquals("2 h", Github.dur(7200.0))
        assertEquals(25.0, Github.left(json("""{"used":3750,"limit":5000}"""))!!, 1e-9)
        assertEquals(0.0, Github.left(json("""{"used":6000,"limit":5000}"""))!!, 1e-9)
        assertNull(Github.left(json("""{"used":1}""")))
    }

    @Test fun briefingProposalsAndDegradedParts() {
        val snap = json("""{"briefing":[{"key":"gh:wip","product":"systems"},{"key":"x","product":"github"},{"key":"mk:1","product":"marketing"}],
            "proposals":[{"key":"gh:pr-green:12"},{"key":"seo:1"}]}""")
        assertEquals(listOf("gh:wip", "x"), Github.briefing(snap).map { it.str() })
        assertEquals(listOf("gh:pr-green:12"), Github.proposals(snap).map { it.str() })
        assertEquals("No data yet.", Github.down(null))
        assertNull(Github.down(json("""{"ok":true}""")))
        assertEquals("403 · needs dependabot_alerts", Github.down(json("""{"ok":false,"error":"403","need":"dependabot_alerts"}""")))
    }

    @Test fun chipLabelsAndConfirmTexts() {
        assertTrue(CHIPS.contains("github" to "GitHub"))
        listOf("gh-board-sync", "gh-orphan-ticket", "gh-update-pr", "gh-merge-pr", "gh-revert", "gh-delete-branch", "gh-close-issue", "gh-remove-worktree", "gh-agent", "rerun-ci")
            .forEach { assertTrue(it, ACTION_LABELS.containsKey(it)) }
        assertEquals("Launch a fix agent", ACTION_LABELS["gh-agent"])
        assertEquals("squash-merge PR #12 into main now (it goes to production)", askFor("gh-merge-pr", null, null, 12))
        assertEquals("delete the merged branch fix/1", askFor("gh-delete-branch", "fix/1", null))
        assertEquals("delete the merged branches", askFor("gh-delete-branch", null, null))
        assertEquals("remove the merged worktree on the Mac (the uploader does it, never forced)", askFor("gh-remove-worktree", null, null))
    }

    @Test fun oneColumnFoldedTwoUnfolded() {
        assertEquals(1, Github.columnsFor(344))
        assertEquals(1, Github.columnsFor(412))
        assertEquals(2, Github.columnsFor(600))
        assertEquals(2, Github.columnsFor(884))
        assertEquals(3, Github.columnsFor(1280))
    }

    @Test fun theProcessMapFitsAcrossAnUnfoldedScreenAndScrollsOnTheCover() {
        assertFalse(Github.mapFits(300))
        assertFalse(Github.mapFits(380))
        assertTrue(Github.mapFits(550))
        assertTrue(Github.mapFits(800))
    }

    @Test fun ringsSitInOneRowWhenTheyFitElseInEvenRows() {
        assertEquals(10 to 84, Github.ringGrid(1000))
        assertEquals(10 to 65, Github.ringGrid(740))
        assertEquals(5 to 84, Github.ringGrid(550))
        val (per, size) = Github.ringGrid(300)
        assertEquals(4, per)
        assertEquals(67, size)
        assertEquals(1 to 60, Github.ringGrid(40, 3))
    }

    @Test fun workerSpendWarnsAtTwentyAndStopsAtForty() {
        val ok = Github.spend(json("""{"spend":{"month":"2026-11","usd":0.116,"cap":40,"warn":20,"left":39.884,"level":"ok","runs":1,"input":176980,"output":9170}}"""))!!
        assertEquals("good", Github.spendTone(ok))
        assertEquals("$39.88 left before the worker stops at $40.00.", Github.spendLine(ok))
        assertEquals(0.5f, ok.warnAt)
        assertEquals(176980L, ok.input)
        val warn = Github.spend(json("""{"spend":{"usd":21.5,"cap":40,"warn":20}}"""))!!
        assertEquals("warn", warn.level)
        assertEquals("Past the $20.00 warning; the worker stops at $40.00.", Github.spendLine(warn))
        val over = Github.spend(json("""{"spend":{"usd":45,"cap":40,"warn":20,"level":"over"}}"""))!!
        assertEquals("alert", Github.spendTone(over))
        assertEquals(1f, over.fraction)
        assertTrue(Github.spendLine(over).contains("Cursor"))
        assertNull(Github.spend(json("""{"ok":true}""")))
        assertNull(Github.spend(null))
    }

    @Test fun workerRowsNameTheModelAndTheHandOff() {
        assertEquals("Flash", Github.workerModel(json("""{"tier":"flash"}""")))
        assertEquals("Pro after Flash", Github.workerModel(json("""{"tier":"pro","escalatedFrom":"wabc"}""")))
        assertEquals("failed → Pro", Github.workerState(json("""{"state":"failed","escalatedTo":"wdef"}""")))
        assertEquals("no change", Github.workerState(json("""{"state":"nochange"}""")))
        assertEquals("alert", Github.workerLevel("failed"))
        assertEquals("good", Github.workerLevel("done"))
        assertEquals("Gemini quota", Github.workerState(json("""{"state":"failed","reason":"quota"}""")))
        assertEquals("warn", Github.workerLevel("failed", "quota"))
    }

    private fun JsonObject.str() = (this["key"] as kotlinx.serialization.json.JsonPrimitive).content
}
