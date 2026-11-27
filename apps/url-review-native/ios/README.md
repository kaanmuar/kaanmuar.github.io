# URL Review — iOS (Wave 1)

Native SwiftUI shell for ticket [#4505](https://github.com/carlosandmunoz-hq/kaanmuar.github.io/issues/4505). Shares the monorepo branch `feat/4505-urlreview-native` with the Android app under `apps/url-review-native/android/`.

| Item | Value |
|------|--------|
| Bundle ID | `com.carlosandmunoz.urlreview` |
| Minimum iOS | 17.0 |
| Xcode project | `URLReview.xcodeproj` |

## Open in Xcode

1. Install **Xcode** from the App Store (not Command Line Tools alone).
2. Open `apps/url-review-native/ios/URLReview.xcodeproj`.
3. Select the **URLReview** scheme and an iOS Simulator (e.g. iPhone 16).
4. **Product → Run** (⌘R).

## Signing (placeholders)

Certificates and provisioning profiles must **not** be committed.

1. In Xcode, select the **URLReview** target → **Signing & Capabilities**.
2. Set **Team** to your Apple Developer team (or Personal Team for simulator-only builds).
3. Confirm **Bundle Identifier** is `com.carlosandmunoz.urlreview`.

For CI or `xcodebuild`, export `DEVELOPMENT_TEAM` and pass it to the build:

```bash
xcodebuild -project URLReview.xcodeproj -scheme URLReview \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  DEVELOPMENT_TEAM='YOUR_TEAM_ID' build
```

## Simulator notes

- **Entry** (URL + prediction chips stub + Run), **Arena** (packaged Lab Tries canvas in `URLReview/Arena/`), **Report** (score hero stub).
- Refresh arena bundle from repo root: `../scripts/sync-arena-assets.sh` (see script header). Bridge: `webkit.messageHandlers.urlReview`.
- Later waves will call `https://carlosandmunoz.com` APIs; **ATS** already allows that domain (see `URLReview/Info.plist`).

## Build without full Xcode.app

If `xcode-select -p` points at **Command Line Tools** only, `xcodebuild` and the Simulator are unavailable. Sources and `project.pbxproj` are still valid; open the project on a Mac with Xcode to build and run.

```bash
xcode-select -p
# /Applications/Xcode.app/Contents/Developer  → OK
# /Library/Developer/CommandLineTools           → install Xcode.app, then:
# sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## Layout

```
ios/
  README.md
  URLReview.xcodeproj/
  URLReview/
    URLReviewApp.swift
    ContentView.swift
    Views/
      EntryView.swift
      ArenaView.swift
      ReportView.swift
    Info.plist
```