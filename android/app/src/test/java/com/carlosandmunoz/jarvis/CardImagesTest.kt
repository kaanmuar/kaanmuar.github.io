package com.carlosandmunoz.jarvis

import com.carlosandmunoz.jarvis.data.CardImages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CardImagesTest {
    @Test fun onlyHttpsCardsAreLoaded() {
        val card = "https://carlosandmunoz.com/assets/social/sweep-roundup/2026-11-02.jpg"
        assertEquals(card, CardImages.usable(" $card "))
        listOf(null, "", "http://x.co/a.jpg", "assets/social/sweep-roundup/2026-11-02.jpg", "data:image/png;base64,AAAA", "https://x.co/" + "a".repeat(1000))
            .forEach { assertNull(it, CardImages.usable(it)) }
    }

    @Test fun aBigCardIsDecodedAtThePowerOfTwoThatStillCoversTheWidth() {
        assertEquals(1, CardImages.sampleSize(1200, 1080))
        assertEquals(2, CardImages.sampleSize(2400, 1080))
        assertEquals(4, CardImages.sampleSize(4800, 1080))
        assertEquals(1, CardImages.sampleSize(600, 1080))
        assertEquals(1, CardImages.sampleSize(1200, 0))
    }

    @Test fun aTallCardIsLetterboxedWholeInThePushAndAWideOneShowsAsItIs() {
        assertEquals(CardImages.Frame(1024, 512, 409, 512), CardImages.pushFrame(1080, 1350))
        assertEquals(CardImages.Frame(1024, 512, 512, 512), CardImages.pushFrame(1080, 1080))
        assertNull(CardImages.pushFrame(1200, 627))
        assertNull(CardImages.pushFrame(1000, 420))
        assertNull(CardImages.pushFrame(0, 0))
    }
}
