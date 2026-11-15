package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.JSON
import com.carlosandmunoz.jarvis.ui.CHIPS
import com.carlosandmunoz.jarvis.ui.Engagement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EngagementTest {
    private fun json(s: String) = JSON.parseToJsonElement(s) as JsonObject

    @Test fun anApproveWithChangedTextGoesAsAnEdit() {
        assertEquals("approve", Engagement.decision("We run axe.", " We run axe. ", true))
        assertEquals("edit", Engagement.decision("We run axe.", "We run axe-core in CI.", true))
        assertEquals("dismiss", Engagement.decision("We run axe.", "anything", false))
    }

    @Test fun aDraftInAnotherLanguageShowsItsEnglish() {
        val reply = json("""{"draft":"Probamos el foco con un lector de pantalla.","english":"We test focus with a screen reader."}""")
        assertEquals("In English: We test focus with a screen reader.", Engagement.english(reply, "Probamos el foco con un lector de pantalla."))
        assertEquals("In English (the original draft): We test focus with a screen reader.", Engagement.english(reply, "Probamos el foco con NVDA."))
        assertEquals(null, Engagement.english(json("""{"draft":"We tab through it."}"""), "We tab through it."))
    }

    @Test fun thePlanNamesEachActionOrWhyThePostWasLeftAlone() {
        assertEquals("like: planned · reply: waiting", Engagement.plan(json("""{"verdict":"engage","actions":{"like":{"status":"planned"},"reply":{"status":"waiting"}}}""")))
        assertEquals("left alone: competitor", Engagement.plan(json("""{"verdict":"skip","skip":"competitor","actions":{}}""")))
        assertEquals("trend only", Engagement.plan(json("""{"verdict":"trend","actions":{}}""")))
        assertEquals("watch", Engagement.plan(json("""{"verdict":"watch","actions":{}}""")))
    }

    @Test fun usageShowsTodayAgainstTheCaps() {
        val g = json("""{"caps":{"like":60,"repost":15,"follow":15,"reply":15},"used":{"mastodon":{"like":3,"reply":1}}}""")
        assertEquals("like 3/60 · repost 0/15 · follow 0/15 · reply 1/15", Engagement.usage(g, "mastodon"))
    }

    @Test fun joinsShowTheirWarmedUpCapAndEachJoinItsGroup() {
        val g = json("""{"caps":{"like":60,"repost":15,"follow":15,"reply":15,"join":2},"used":{"reddit":{"like":2,"join":1}},"joins":{"caps":{"reddit":1,"telegram":1}}}""")
        assertEquals("like 2/60 · repost 0/15 · follow 0/15 · reply 0/15 · join 1/1", Engagement.usage(g, "reddit"))
        assertEquals("like 0/60 · repost 0/15 · follow 0/15 · reply 0/15", Engagement.usage(g, "x"))
        assertEquals("joined · subreddit · en · 900 members · Testing", Engagement.joinLine(json("""{"status":"joined","kind":"subreddit","lang":"en","members":900,"topic":"Testing","error":""}""")))
        assertEquals("would join (dry run) · channel · ru · 420 members", Engagement.joinLine(json("""{"status":"dry","kind":"channel","lang":"ru","members":420}""")))
    }

    @Test fun eachNetworkKeepsItsReplyLimit() {
        assertEquals(300, Engagement.limit("bluesky"))
        assertEquals(280, Engagement.limit("x"))
        assertEquals(1000, Engagement.limit("telegram"))
        assertEquals(1500, Engagement.limit("reddit"))
        assertEquals(300, Engagement.limit(null))
    }

    @Test fun onlyABotTokenEnablesConnectTelegram() {
        assertTrue(Engagement.BOT_TOKEN.matches("123456789:AAEabcdefghijklmnopqrstuvwxyz012345"))
        assertTrue(!Engagement.BOT_TOKEN.matches("@qalab_live_bot"))
    }

    @Test fun metricsAndAuthorReadTheSnapshot() {
        val p = json("""{"author":{"handle":"ana@m.s","name":""},"score":8,"metrics":{"likes":12,"replies":3,"reposts":4,"views":0}}""")
        assertEquals("ana@m.s", Engagement.author(p))
        assertEquals("♥ 12 · ↩ 3 · ⟳ 4 · score 8", Engagement.metrics(p))
    }

    @Test fun theHeadlineDropsTheLinksAPostEndsOn() {
        assertEquals("Captioned Doesn’t Always Mean Accessible", Engagement.headline(json("""{"text":"Captioned Doesn’t Always Mean Accessible https://programming.dev/post/58836760"}""")))
        assertEquals("Lighthouse 13 is out", Engagement.headline(json("""{"title":"Lighthouse 13 is out","text":"https://x.dev long body"}""")))
    }

    @Test fun doneCountsTheCarriedOutLikesRepostsAndFollows() {
        val t = json("""{"like_done":4,"repost_done":1,"follow_done":2,"like_dry":9,"act_failed":3}""")
        assertEquals(7.0, Engagement.carried(t, "done"), 0.0)
        assertEquals(9.0, Engagement.carried(t, "dry"), 0.0)
        assertEquals(0.0, Engagement.carried(null, "done"), 0.0)
    }

    @Test fun anAccountRowSaysAsWhomTheBotFlagAndTheLastError() {
        assertEquals("connected as qalaburlreview · bot flag on", Engagement.account(json("""{"connected":true,"account":"qalaburlreview","bot":true,"error":""}""")))
        assertEquals("not connected", Engagement.account(json("""{"connected":false,"account":""}""")))
        assertEquals("connected as QA-lab URL Review · last error: 401", Engagement.account(json("""{"connected":true,"account":"QA-lab URL Review","error":"401"}""")))
    }

    @Test fun onlyAnAppPasswordEnablesConnectBluesky() {
        assertTrue(Engagement.APP_PASSWORD.matches("abcd-efgh-ijkl-mnop"))
        assertTrue(!Engagement.APP_PASSWORD.matches("my real password"))
    }

    @Test fun theFilterKeepsReportRepliesOrTheOthers() {
        val invite = json("""{"campaign":"report-reply","report":{"host":"upb.edu.co","name":"UPB","score":64,"shown":false,"match":"domain","format":"card"}}""")
        val field = json("""{"campaign":""}""")
        assertTrue(Engagement.isReport(invite) && !Engagement.isReport(field))
        assertEquals(listOf(invite, field), listOf(invite, field).filter { Engagement.keep(it, "all") })
        assertEquals(listOf(invite), listOf(invite, field).filter { Engagement.keep(it, "report") })
        assertEquals(listOf(field), listOf(invite, field).filter { Engagement.keep(it, "field") })
    }

    @Test fun aReportReplySaysWhichReportItInvitesTo() {
        assertEquals("Invites to the UPB report (upb.edu.co) · scores 64 (not named in the reply) · found by domain · card",
            Engagement.reportLine(json("""{"campaign":"report-reply","report":{"host":"upb.edu.co","name":"UPB","score":64,"shown":false,"match":"domain","format":"card"}}""")))
        assertEquals("Invites to the acme.io report (acme.io) · scores 91 · found by name · link",
            Engagement.reportLine(json("""{"campaign":"report-reply","report":{"host":"acme.io","name":"","score":91,"shown":true,"match":"name","format":"link"}}""")))
        assertEquals(null, Engagement.reportLine(json("""{"campaign":"","report":null}""")))
    }

    @Test fun engagementIsAProductsChipSoItsPushesOpenIt() {
        assertTrue(CHIPS.any { it.first == "engagement" })
    }
}
