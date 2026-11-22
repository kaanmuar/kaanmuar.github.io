plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.sentry.gradle)
}

val build = (System.getenv("JARVIS_VERSION_CODE") ?: "1").toInt()
val keystore = System.getenv("JARVIS_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

// Same mapping-upload gate as :app (#3836). No DSN/token in git; no-op without SENTRY_AUTH_TOKEN + org + project.
val sentryAuthToken = System.getenv("SENTRY_AUTH_TOKEN")
    ?: (findProperty("sentry.auth.token") as String?)
val sentryOrg = System.getenv("SENTRY_ORG")
    ?: (findProperty("sentry.org") as String?)
val sentryProject = System.getenv("SENTRY_PROJECT")
    ?: (findProperty("sentry.project") as String?)
val sentryUpload = listOf(sentryAuthToken, sentryOrg, sentryProject).all { !it.isNullOrBlank() }

sentry {
    org.set(sentryOrg)
    projectName.set(sentryProject)
    authToken.set(sentryAuthToken)
    autoUploadProguardMapping.set(sentryUpload)
    uploadNativeSymbols.set(false)
    includeSourceContext.set(false)
    ignoredBuildTypes.set(setOf("debug"))
    autoInstallation { enabled.set(false) }
    telemetry.set(false)
}

// Same applicationId and signing key as the phone app: the Data Layer only pairs apps that match on both.
android {
    namespace = "com.carlosandmunoz.jarvis.wear"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.carlosandmunoz.jarvis"
        minSdk = 30
        targetSdk = 34
        versionCode = build
        versionName = "2.1.$build"
        // Sentry DSN (#3836) from the environment at build time; never committed. Empty leaves Sentry off.
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
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

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
    }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    // slackhq/compose-lints (Apache-2.0, #3836): Compose Android Lint checks, run by ./gradlew lintDebug.
    lintChecks(libs.compose.lint.checks)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.wear.compose.material)
    implementation(libs.wear.compose.foundation)
    implementation(libs.wear.tiles)
    implementation(libs.wear.protolayout)
    implementation(libs.wear.protolayout.material)
    implementation(libs.wear.complications)
    implementation(libs.wear.remote.interactions)
    implementation(libs.concurrent.futures)
    implementation(libs.play.services.wearable)
    // google/horologist datalayer (Apache-2.0, #3836): WearDataLayerRegistry + WearDataService for status sync.
    implementation(libs.horologist.datalayer)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    // getsentry/sentry-java (MIT) crash capture + touchlab/Kermit (Apache-2.0) logging facade (#3836).
    implementation(libs.sentry.android)
    implementation(libs.kermit)
    testImplementation(libs.junit)
}
