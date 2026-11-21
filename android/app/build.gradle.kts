import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

val build = (System.getenv("JARVIS_VERSION_CODE") ?: "1").toInt()
val keystore = System.getenv("JARVIS_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

// Identity Toolkit-only Android Auth REST key (#3971, #4140). Not in git — local.properties or JARVIS_FIREBASE_AUTH_KEY.
val firebaseAuthKey: String = run {
    val fromEnv = System.getenv("JARVIS_FIREBASE_AUTH_KEY")?.trim().orEmpty()
    if (fromEnv.isNotEmpty()) fromEnv
    else {
        val local = rootProject.file("local.properties")
        if (!local.isFile) ""
        else {
            val props = Properties()
            local.inputStream().use { props.load(it) }
            props.getProperty("jarvis.firebase.auth.key")?.trim().orEmpty()
        }
    }
}

android {
    namespace = "com.carlosandmunoz.jarvis"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.carlosandmunoz.jarvis"
        minSdk = 28
        targetSdk = 35
        versionCode = build
        versionName = "2.1.$build"
        buildConfigField("String", "FIREBASE_AUTH_KEY", "\"$firebaseAuthKey\"")
        // Sentry DSN (#3836) comes from the environment at build time and is never committed. Empty (the default,
        // and always in debug builds and unit tests) leaves Sentry off.
        buildConfigField("String", "SENTRY_DSN", "\"${System.getenv("JARVIS_SENTRY_DSN") ?: ""}\"")
    }

    signingConfigs {
        if (keystore != null) create("release") {
            storeFile = keystore
            storePassword = System.getenv("JARVIS_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("JARVIS_KEY_ALIAS")
            keyPassword = System.getenv("JARVIS_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

    // CI points this at the release's whats-new.txt (#2169); builds without it show no What's new window.
    System.getenv("JARVIS_WHATS_NEW_DIR")?.let { sourceSets["main"].assets.srcDir(it) }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf("-opt-in=com.google.android.horologist.annotations.ExperimentalHorologistApi")
    }

    // Gate only on slackhq/compose-lints (#3836): the module's other Android Lint findings (e.g. wear's
    // TilePreviewImageFormat) predate this and stay out of the gate until they are cleaned up.
    lint {
        checkOnly += listOf(
            "ComposeCompositionLocalGetter",
            "ComposeCompositionLocalUsage",
            "ComposeContentEmitterReturningValues",
            "ComposeModifierComposed",
            "ComposeModifierMissing",
            "ComposeModifierReused",
            "ComposeModifierWithoutDefault",
            "ComposeMultipleContentEmitters",
            "ComposeMutableParameters",
            "ComposeNamingLowercase",
            "ComposeNamingUppercase",
            "ComposeParameterOrder",
            "ComposePreviewNaming",
            "ComposePreviewPublic",
            "ComposeRememberMissing",
            "ComposeUnstableCollections",
            "ComposeUnstableReceiver",
            "ComposeViewModelForwarding",
            "ComposeViewModelInjection"
        )
        abortOnError = true
        // The 201 findings that predate the gate (80 ComposeModifierMissing, 59 UnstableCollections, 22 ViewModelForwarding...)
        // live here; only new ones fail CI. Shrink it by regenerating: ./gradlew :app:updateLintBaseline
        baseline = file("lint-baseline.xml")
    }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    // slackhq/compose-lints (Apache-2.0, #3836): Compose Android Lint checks, run by ./gradlew lintDebug.
    lintChecks(libs.compose.lint.checks)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.fragment)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.window)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.glance.appwidget)
    implementation(libs.work.runtime)
    implementation(libs.play.services.wearable)
    // google/horologist datalayer (Apache-2.0, #3836): WearDataLayerRegistry for phone→watch status sync.
    implementation(libs.horologist.datalayer)
    implementation(libs.kotlinx.coroutines.play.services)
    // getsentry/sentry-java (MIT) crash capture + touchlab/Kermit (Apache-2.0) logging facade (#3836).
    implementation(libs.sentry.android)
    implementation(libs.kermit)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.junit)
    // Real org.json for JVM unit tests (Android's stub throws "not mocked" on put/get).
    testImplementation("org.json:json:20240303")
}
