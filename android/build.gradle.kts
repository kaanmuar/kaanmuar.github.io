plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.google.services) apply false
}

// Dependency locking (#3951): gradle.lockfile per module so OSV-Scanner can scan Android dependencies.
// Refresh with: ./gradlew dependencies --write-locks
allprojects {
    dependencyLocking {
        lockAllConfigurations()
    }
}
