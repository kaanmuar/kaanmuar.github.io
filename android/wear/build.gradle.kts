plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val build = (System.getenv("JARVIS_VERSION_CODE") ?: "1").toInt()
val keystore = System.getenv("JARVIS_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

// Same applicationId and signing key as the phone app: the Data Layer only pairs apps that match on both.
android {
    namespace = "com.carlosandmunoz.jarvis.wear"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.carlosandmunoz.jarvis"
        minSdk = 30
        targetSdk = 34
        versionCode = build
        versionName = "1.0.$build"
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
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

dependencies {
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
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
}
