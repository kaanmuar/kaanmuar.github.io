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

// Versions past the advisories OSV reports (#3967). These artifacts only come in through the Android unified
// test platform host (netty via grpc-netty, guava, protobuf-java, commons-io), not the shipped APK.
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency {
            if (requested.group == "io.netty") {
                useVersion("4.1.137.Final")
            } else if (requested.group == "com.google.guava" && requested.name == "guava") {
                useVersion("33.7.2-jre")
            } else if (requested.group == "com.google.protobuf" && requested.name == "protobuf-java") {
                useVersion("3.25.5")
            } else if (requested.group == "commons-io" && requested.name == "commons-io") {
                useVersion("2.14.0")
            }
        }
    }
}
