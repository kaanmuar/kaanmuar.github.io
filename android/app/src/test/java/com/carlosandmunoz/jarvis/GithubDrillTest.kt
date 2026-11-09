package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.Charts
import com.carlosandmunoz.jarvis.ui.Github
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class GithubDrillTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject
    private val repo = Github.REPO_URL

    @Test fun aColumnListsItsFirstEightCardsWithDaysAndTheFilteredBoard() {
        val items = (1..10).joinToString(",") { """{"number":$it,"title":"T$it","days":${20 - it},"url":"$repo/issues/$it"}""" }
        val board = json("""{"columns":[{"name":"Dev","count":12,"items":[$items]},{"name":"Done","count":3,"items":[{"number":99,"title":"Shipped","days":0}]}]}""")
        val dev = Github.columnDrill(board, "Dev")
        assertEquals("Dev · 12 cards", dev.title)
        assertEquals(8, dev.rows.size)
        assertEquals("#1", dev.rows[0].lead)
        assertEquals("19 d in Dev", dev.rows[0].meta)
        assertEquals("Oldest 8 of 12.", dev.more)
        assertEquals("Open Dev on the board" to "https://github.com/orgs/carlosandmunoz-hq/projects/1/views/1?filterQuery=status%3A%22Dev%22", dev.links[0])
        assertEquals("All issues" to "$repo/issues", dev.links[1])
        assertEquals("$repo/issues/99", Github.columnDrill(board, "Done").rows[0].url)
        assertEquals("Newest 1 of 3.", Github.columnDrill(board, "Done").more)
        assertEquals("QA · 0 cards", Github.columnDrill(board, "QA").title)
    }

    @Test fun issueAndAreaDrillsLinkTheMatchingGithubSearch() {
        val iss = json("""{"open":61,"openBugs":9,"opened":4,"closed":3,"since":"2026-10-27",
            "lists":{"open":[{"number":5,"title":"A","days":2}],"openBugs":[{"number":6,"title":"B","days":4}],"opened":[],"closed":[{"number":7,"title":"C","days":1}]},
            "subIssues":{"parents":12,"done":30,"total":40,"items":[{"number":2546,"title":"P","done":2,"total":8}]},"oldest":[{"number":1,"title":"Old","days":300}],
            "bugsByArea":[{"label":"be","value":5,"items":[{"number":8,"title":"BE bug","days":3}]},{"label":"none","value":1,"items":[]}]}""")
        val d = Github.issueDrills(iss).associateBy { it.key }
        assertEquals(listOf("open", "bugs", "opened", "closed", "sub", "oldest"), Github.issueDrills(iss).map { it.key })
        assertEquals("Newest 1 of 9.", d.getValue("bugs").more)
        assertEquals("$repo/issues?q=is%3Aissue+is%3Aopen+label%3Abug", d.getValue("bugs").links[0].second)
        assertEquals("$repo/issues?q=is%3Aissue+is%3Aclosed+closed%3A%3E%3D2026-10-27", d.getValue("closed").links[0].second)
        assertEquals("closed 1 d ago", d.getValue("closed").rows[0].meta)
        assertEquals("2 of 8 sub-issues done", d.getValue("sub").rows[0].meta)
        assertEquals("No issue opened in this range.", d.getValue("opened").empty)
        val areas = Github.areaDrills(iss)
        assertEquals("area:be · 5 open bugs", areas[0].title)
        assertEquals("$repo/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%3Abe+label%3Abug", areas[0].links[0].second)
        assertEquals("No area label · 1 open bug", areas[1].title)
        assertEquals("is:issue is:open label:bug", Github.areaQuery("none"))
    }

    @Test fun branchDrillsListStaleMergedAndBehindWithTreeAndCompareLinks() {
        val br = json("""{"total":30,"stale":1,"merged":[{"name":"fix/1-x","pr":12,"days":3}],
            "ahead":[{"name":"feat/2-new","ahead":2,"behind":1,"days":1,"pr":40},{"name":"feat/3-old","ahead":5,"behind":90,"days":40}]}""")
        val d = Github.branchDrills(br).associateBy { it.key }
        assertEquals(listOf("feat/2-new", "feat/3-old"), d.getValue("all").rows.map { it.lead })
        assertEquals("Newest 10 of 30 read; the rest are on GitHub.", d.getValue("all").more)
        assertEquals(listOf("feat/3-old"), d.getValue("stale").rows.map { it.lead })
        assertEquals("feat/3-old", d.getValue("ahead").rows[0].lead)
        assertEquals("$repo/tree/feat/2-new", d.getValue("all").rows[0].url)
        assertEquals("compare" to "$repo/compare/main...feat/2-new", d.getValue("all").rows[0].extra)
        assertEquals("last commit 1 d ago · 2 ahead, 1 behind · PR #40", d.getValue("all").rows[0].meta)
        assertEquals("PR #12 merged 3 d ago", d.getValue("merged").rows[0].meta)
    }

    @Test fun oneDrillOpenPerPanel() {
        assertEquals("Dev", Github.toggle(null, "Dev"))
        assertEquals("QA", Github.toggle("Dev", "QA"))
        assertNull(Github.toggle("QA", "QA"))
    }

    @Test fun reposCleanLikeJarvisCoreAndFallBackToTheFourDefaults() {
        assertEquals(listOf("kaanmuar/qa-lab-outreach", "kaanmuar/cursor-quota"),
            Github.cleanRepos(listOf(" kaanmuar/qa-lab-outreach ", "https://github.com/kaanmuar/cursor-quota/", "not a repo", "kaanmuar/qa-lab-outreach", "")))
        assertEquals(Github.REPOS, Github.cleanRepos(listOf("", "nope")))
        assertEquals(4, Github.REPOS.size)
        assertEquals(Github.REPOS, Github.shownRepos(json("""{"access":{}}""")))
        assertEquals(listOf("a/b"), Github.shownRepos(json("""{"access":{"shown":["a/b"]}}""")))
        assertEquals("""{"repos":["a/b"]}""", Github.reposJson(listOf("a/b")).toString())
    }

    @Test fun chartsShortenAxisLabelsAndFindTheTappedValue() {
        assertEquals("11-03", Charts.short("2026-11-03"))
        assertEquals("14:00", Charts.short("2026-11-03T14:00:00Z"))
        assertEquals("2026-W44", Charts.short("2026-W44"))
        assertEquals(listOf("11-01", "11-03", "11-05"), Charts.ticks(listOf("2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05")))
        assertEquals(listOf("11-01"), Charts.ticks(listOf("2026-11-01")))
        assertEquals(0, Charts.indexAt(10f, 100f, 4, bars = true))
        assertEquals(3, Charts.indexAt(99f, 100f, 4, bars = true))
        assertEquals(3, Charts.indexAt(140f, 100f, 4, bars = true))
        assertEquals(1, Charts.indexAt(40f, 100f, 4, bars = false))
        assertEquals(0, Charts.indexAt(50f, 100f, 1, bars = false))
        assertEquals("2026-11-03: 248 runs", Charts.tip("2026-11-03", 248.0, "runs"))
        assertEquals("7", Charts.tip(null, 7.0, null))
    }
}
