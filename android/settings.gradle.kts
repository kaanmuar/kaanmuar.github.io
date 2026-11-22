pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    // Resolve the Sentry plugin from Maven Central (artifact exists there); the
    // plugin-marker lookup on the Gradle Plugin Portal has failed in CI (#4192).
    resolutionStrategy {
        eachPlugin {
            if (requested.id.id == "io.sentry.android.gradle") {
                useModule("io.sentry:sentry-android-gradle-plugin:${requested.version}")
            }
        }
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "Jarvis"
include(":app", ":wear", ":detekt-rules")
