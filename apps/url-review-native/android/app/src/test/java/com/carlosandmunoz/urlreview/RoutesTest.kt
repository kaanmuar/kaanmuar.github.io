package com.carlosandmunoz.urlreview

import com.carlosandmunoz.urlreview.navigation.Routes
import org.junit.Assert.assertEquals
import org.junit.Test

class RoutesTest {
    @Test
    fun wave1RouteIdsAreStable() {
        assertEquals("entry", Routes.Entry)
        assertEquals("arena", Routes.Arena)
        assertEquals("report", Routes.Report)
    }
}