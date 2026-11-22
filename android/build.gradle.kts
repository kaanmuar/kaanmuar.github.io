plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.google.services) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.detekt) apply false
    alias(libs.plugins.sentry.gradle) apply false
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
            } else if (requested.group == "com.google.protobuf" &&
                (requested.name == "protobuf-javalite" || requested.name == "protobuf-kotlin-lite")
            ) {
                // Horologist datalayer (#3836) pulls 4.26.1; OSV GHSA-735f-pc8j-v9w8 fixed in 4.27.5.
                useVersion("4.27.5")
            } else if (requested.group == "org.json" && requested.name == "json") {
                // Unit-test classpath via Horologist; OSV GHSA-ghc9-756g-vrcv fixed in 20260719.
                useVersion("20260719")
            } else if (requested.group == "commons-io" && requested.name == "commons-io") {
                useVersion("2.14.0")
            }
        }
    }
}

// Jarvis custom Detekt rules (#3836) run over the app and watch sources: ./gradlew detekt
subprojects {
    if (name == "app" || name == "wear") {
        apply(plugin = "io.gitlab.arturbosch.detekt")
        extensions.configure<io.gitlab.arturbosch.detekt.extensions.DetektExtension> {
            buildUponDefaultConfig = false
            config.setFrom(rootProject.file("config/detekt/detekt.yml"))
            source.setFrom("src/main/java", "src/main/kotlin", "src/test/java")
        }
        dependencies.add("detektPlugins", project(":detekt-rules"))
    }
}
