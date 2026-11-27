package com.carlosandmunoz.urlreview

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.carlosandmunoz.urlreview.navigation.UrlReviewNavHost
import com.carlosandmunoz.urlreview.theme.UrlReviewTheme

@androidx.compose.runtime.Composable
fun UrlReviewApp() {
    UrlReviewTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            UrlReviewNavHost()
        }
    }
}