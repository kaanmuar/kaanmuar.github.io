package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.update.Updater
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdaterTest {
    private fun rel(tag: String, apk: String, draft: Boolean = false, digest: String? = null) =
        """{"tag_name":"$tag","draft":$draft,"assets":[{"name":"$apk","browser_download_url":"https://x/$apk"${digest?.let { ",\"digest\":\"$it\"" } ?: ""}}]}"""

    @Test fun picksTheHighestJarvisBuildAndIgnoresOtherReleases() {
        val body = "[" + listOf(
            rel("jarvis-android-v1.0.35", "jarvis-1.0.35.apk"),
            rel("jarvis-android-v1.0.120", "jarvis-1.0.120.apk", digest = "sha256:abc"),
            rel("jarvis-android-v1.0.200", "jarvis-1.0.200.apk", draft = true),
            rel("live-reports-2026-10-26", "report.zip"),
        ).joinToString(",") + "]"
        val r = Updater.newest(body)!!
        assertEquals(120L, r.code)
        assertEquals("1.0.120", r.name)
        assertEquals("https://x/jarvis-1.0.120.apk", r.apk)
        assertEquals("abc", r.sha256)
    }

    @Test fun aReleaseWithoutThePhoneApkIsSkipped() {
        assertNull(Updater.newest("[" + rel("jarvis-android-v1.0.40", "jarvis-watch-1.0.40.apk") + "]"))
    }
}
