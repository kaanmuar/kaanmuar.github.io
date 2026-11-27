package com.carlosandmunoz.urlreview.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.carlosandmunoz.urlreview.ui.arena.ArenaPlaceholder
import com.carlosandmunoz.urlreview.ui.entry.EntryScreen
import com.carlosandmunoz.urlreview.ui.report.ReportPlaceholder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Composable
fun UrlReviewNavHost() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Routes.Entry,
    ) {
        composable(Routes.Entry) {
            EntryScreen(
                onRun = { url ->
                    val encoded = URLEncoder.encode(url, StandardCharsets.UTF_8.toString())
                    navController.navigate("${Routes.Arena}?url=$encoded") {
                        launchSingleTop = true
                    }
                },
            )
        }
        composable(
            route = "${Routes.Arena}?url={url}",
            arguments = listOf(
                navArgument("url") {
                    type = NavType.StringType
                    defaultValue = "https://example.com"
                },
            ),
        ) {
            ArenaPlaceholder(
                targetUrl = it.arguments?.getString("url").orEmpty().ifBlank { "https://example.com" },
                onContinue = { url ->
                    val encoded = URLEncoder.encode(url, StandardCharsets.UTF_8.toString())
                    navController.navigate("${Routes.Report}?url=$encoded") {
                        launchSingleTop = true
                    }
                },
            )
        }
        composable(
            route = "${Routes.Report}?url={url}",
            arguments = listOf(
                navArgument("url") {
                    type = NavType.StringType
                    defaultValue = ""
                },
            ),
        ) {
            ReportPlaceholder(
                targetUrl = it.arguments?.getString("url").orEmpty(),
                onNewReview = {
                    navController.popBackStack(Routes.Entry, inclusive = false)
                },
            )
        }
    }
}