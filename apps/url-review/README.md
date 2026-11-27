# URL Review (Capacitor)

Native shells for [qa-review](https://carlosandmunoz.com/qa-review.html). Shared by iOS (#4495) and Android (#4494).

| Field | Value |
| --- | --- |
| Bundle / application ID | `com.carlosandmunoz.urlreview` |
| Web entry (production) | `https://carlosandmunoz.com/qa-review.html` |
| Capacitor `webDir` | `www/` (offline fallback only; release builds load the live site) |

## Prerequisites

- Node.js 20+
- **iOS:** Xcode 16+ (command line tools + full Xcode for device/archive)
- **Android:** JDK **21+** (Capacitor 7.4 Android), Android SDK / Android Studio (#4494)

Never commit signing material (`*.p12`, `*.mobileprovision`, `*.cer`). Use Xcode’s automatic signing or export profiles only on the build machine / CI secret store.

## Install

```bash
cd apps/url-review
npm ci
npx cap sync ios
```

## Local web override (simulator / device)

Point the WebView at a different host while developing:

```bash
CAPACITOR_SERVER_URL='http://127.0.0.1:8768/qa-review.html' npx cap copy ios
npx cap open ios
```

Start the review server from the repo root: `node scripts/url-review-server.js` (needs `FIREBASE_WEB_KEY`).

## iOS — Xcode & TestFlight

1. Open the project: `npx cap open ios` (or `open ios/App/App.xcodeproj`).
2. Select the **App** target → **Signing & Capabilities**:
   - **Team:** your Apple Developer team (placeholder until a team is chosen on the Mac).
   - **Bundle Identifier:** `com.carlosandmunoz.urlreview` (must match App Store Connect).
   - Enable **Automatically manage signing** for local builds, or set manual profiles in Xcode only (do not add profiles to git).
3. Pick a run destination (simulator or a registered device).
4. **Product → Archive** → **Distribute App** → **App Store Connect** → upload for TestFlight.

### Versioning

Bump **Marketing Version** and **Current Project Version** (build number) in Xcode before each TestFlight upload.

### ATS

`ios/App/App/Info.plist` includes `NSAppTransportSecurity` so HTTPS to `carlosandmunoz.com` (and subdomains) is explicit. Cleartext HTTP stays disabled unless you use a dev `CAPACITOR_SERVER_URL` on plain HTTP (simulator only).

### CocoaPods

After `npm ci`, install native deps (requires full **Xcode.app**, not Command Line Tools only):

```bash
cd ios/App && pod install
```

Open `ios/App/App.xcworkspace` (not the `.xcodeproj` alone).

### List schemes / targets (CI smoke)

```bash
xcodebuild -list -project ios/App/App.xcodeproj
```

If `xcodebuild` points at Command Line Tools, run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` once on the Mac.

Signing errors on a fresh clone are expected until a team is selected in Xcode; they do not block committing the scaffold.

## Android — debug APK (#4494)

Jarvis lives in repo-root `android/` (`com.carlosandmunoz.jarvis`). **Do not** run Capacitor sync there; this app is only under `apps/url-review/android/`.

| Field | Value |
| --- | --- |
| Application ID | `com.carlosandmunoz.urlreview` |
| Debug application ID | `com.carlosandmunoz.urlreview.debug` |

### Prerequisites

- **JDK 21+** (`capacitor.build.gradle` targets Java 21; Android Studio’s bundled JBR works)
- **Android SDK** via `ANDROID_HOME` or `ANDROID_SDK_ROOT` (Android Studio install)
- Accept SDK licenses: `sdkmanager --licenses`

### Build

```bash
cd apps/url-review
npm ci
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"  # or any JDK 21+
export ANDROID_HOME="$HOME/Library/Android/sdk"
npx cap sync android
cd android && ./gradlew assembleDebug
```

Shortcut: `npm run android:assembleDebug` from `apps/url-review/`.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Open in Android Studio: `npm run cap:open:android`.

### CSP / WebView

Release builds use `server.url` → `https://carlosandmunoz.com/qa-review.html` (see `capacitor.config.ts`). The WebView loads the live site over HTTPS; `qa-review.html` meta CSP applies as in mobile Chrome. `www/index.html` is an offline fallback only.

### Deep links (later)

App Links for `carlosandmunoz.com` / `qa-review*.html` and OAuth return URLs are not in M1; add `assetlinks.json` on the domain when billing or GSC redirects must open this app.

### Smoke tests

```bash
cd apps/url-review && npm test
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run cap:sync` | Copy web assets and update native projects |
| `npm run cap:open:ios` | Open Xcode |
| `npm run cap:open:android` | Open Android Studio |

Parent epic: #4491 (native URL Review architecture).