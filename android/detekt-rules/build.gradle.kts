// Custom Detekt rules for Jarvis (#3836). Plain JVM module: detekt-api is Apache-2.0 (detekt/detekt LICENSE, verified).
plugins {
    alias(libs.plugins.kotlin.jvm)
}

kotlin { jvmToolchain(17) }

dependencies {
    compileOnly(libs.detekt.api)
    testImplementation(libs.detekt.api)
    testImplementation(libs.detekt.test)
    testImplementation(libs.junit)
}
