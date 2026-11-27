# URL Review — Android (Wave 1)

Jetpack Compose shell for [#4505](https://github.com/carlosandmunoz-hq/kaanmuar.github.io/issues/4505). Branch `feat/4505-urlreview-native` (shared with `../ios/`).

| Item | Value |
|------|--------|
| applicationId | `com.carlosandmunoz.urlreview` |
| Min SDK | 26 |
| Gradle | `apps/url-review-native/android/` (not repo-root `android/` Jarvis) |

## Build

JDK **17+** (Android Studio JBR 25 works with Gradle 8.11; or Homebrew `openjdk@17`):

```bash
cd apps/url-review-native/android
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export GRADLE_USER_HOME="$HOME/.gradle"
./gradlew testDebugUnitTest assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Wave 1 flow

- **Entry** — URL field, stub prediction chips, Run
- **Arena** — full-screen WebView → `assets/arena/index.html` (Lab Tries placeholder)
- **Report** — score hero + three collapsed section rows (stub data)

Spearhead dark theme (`#0e151c`, cyan accent). Network and real arena assets land in Wave 2.