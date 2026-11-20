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
    // OSV (#4006): AGP's unified-test-platform tooling pulls grpc-netty 1.57.0 -> netty 4.1.93.Final (CVEs fixed
    // by 4.1.137). Force the whole netty 4.1 family up; drop once AGP ships a newer grpc/netty.
    configurations.all {
        resolutionStrategy.eachDependency {
            if (requested.group == "io.netty" && requested.name.startsWith("netty-") && !requested.name.startsWith("netty-tcnative")) {
                useVersion("4.1.137.Final")
                because("OSV netty CVEs fixed in <= 4.1.137.Final (#4006)")
            }
        }
    }
}
