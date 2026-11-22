pluginManagement {
    repositories {
        // Maven Central first: io.sentry:sentry-android-gradle-plugin (and its
        // plugin marker) are published there; portal HTML index is incomplete.
        mavenCentral()
        google()
        gradlePluginPortal()
    }
    // Map plugin id → Maven module so CI does not depend on portal marker lookup (#4192).
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
