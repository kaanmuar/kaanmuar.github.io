# ADR 4506 — URL Review native apps (Jetpack Compose + SwiftUI)

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-11-27 |
| **Tickets** | Parent [#4491](https://github.com/kaanmuar/kaanmuar.github.io/issues/4491) · This ADR [#4506](https://github.com/kaanmuar/kaanmuar.github.io/issues/4506) · Implementation [#4505](https://github.com/kaanmuar/kaanmuar.github.io/issues/4505) · Supersedes [#4493](https://github.com/kaanmuar/kaanmuar.github.io/issues/4493) / [ADR 4493](./4493-url-review-native-capacitor.md) |
| **Related** | [#40](https://github.com/kaanmuar/kaanmuar.github.io/issues/40) store pay timing · [#4422](https://github.com/kaanmuar/kaanmuar.github.io/issues/4422) mobile web spearhead · [#4496](https://github.com/kaanmuar/kaanmuar.github.io/issues/4496) auth/IAP (later) |

## Context

QA-lab **URL Review** needs **Play Store and App Store** customer apps with native navigation, OS integrations (share sheet, back gesture, safe areas), and TestFlight / internal testing tracks.

[ADR 4493](./4493-url-review-native-capacitor.md) chose a **full-screen Capacitor WebView** loading production `qa-review.html` for M1. After design review ([#4492](https://github.com/kaanmuar/kaanmuar.github.io/issues/4492), #4506), we accept a **native-first** product: almost all screens are **Jetpack Compose (Android)** and **SwiftUI (iOS)**. The only intentional WebView surface is the **Three.js Lab arena** (“tries”) already shipped under `assets/review-arena/v3`.

Constraints unchanged from #4493:

- **Jarvis** (`android/`, `com.carlosandmunoz.jarvis`) stays a separate operator app — no shared Gradle root, Firebase, Sentry, or release train with URL Review.
- Customer app code: **permissive licenses** only (`tool-arsenal.mdc`).
- **Store IAP / native accounts** are not M1-ready ([#4496](https://github.com/kaanmuar/kaanmuar.github.io/issues/4496), [#40](https://github.com/kaanmuar/kaanmuar.github.io/issues/40)). M1 must ship review flows and pay via **web checkout handoff**; IAP follows in a later milestone.
- Backend contract for product data remains **Firebase Cloud Functions** `reviewUrl` and `reviewRun` (same as web and Jarvis operator tools, different auth surfaces).

## Decision

**Supersede Capacitor full-wrap (ADR 4493).** Build **dual native apps** under `apps/url-review-native/`:

| Platform | UI | Application ID |
| --- | --- | --- |
| Android | Jetpack Compose | `com.carlosandmunoz.urlreview` |
| iOS | SwiftUI | `com.carlosandmunoz.urlreview` |

### Screen model (M1)

| Surface | Implementation |
| --- | --- |
| Entry, URL capture, progress, report, pricing, account shell, settings, deep-linked flows | **Native** (Compose / SwiftUI) |
| **Lab arena / Three.js “tries”** | **Contained WebView** (Android `WebView`, iOS `WKWebView`) loading bundled `assets/review-arena/v3` (or equivalent app-bundled copy synced from repo root) |
| Arena ↔ native | **JavaScript bridge** (typed message contract): run state, skin, safe-area insets, back navigation, and handoff to native report / checkout — no full-page remote `qa-review.html` in M1 |

Production web (`carlosandmunoz.com/qa-review*.html`) remains the **deployment source of truth for web** and for design reference; native M1 does **not** re-host the entire funnel in a WebView.

### API clients (M1)

- **Parallel clients**: Kotlin (Android) and Swift (iOS) HTTP clients against `reviewUrl` and `reviewRun`, sharing the same request/response shapes as the shipped web client.
- **KMP shared module** is optional later if duplication becomes costly; not required for M1 scaffold ([#4505](https://github.com/kaanmuar/kaanmuar.github.io/issues/4505)).

### Pay and accounts (M1)

- **Pay**: open existing **web checkout** in Chrome Custom Tab / `SFSafariViewController` (or equivalent) when the native funnel reaches purchase — same policy as [#40](https://github.com/kaanmuar/kaanmuar.github.io/issues/40) until store-legal IAP exists.
- **IAP / Play Billing / StoreKit**: explicitly **out of M1**; track under #4496.

### Repository rules

- **Do not** extend repo-root `android/` (Jarvis). URL Review native code lives only under `apps/url-review-native/`.
- Any experimental Capacitor tree under `apps/url-review/` is **not product** (parked reference only if present); implementation follows this ADR.
- Path-filtered CI for `apps/url-review-native/**` only; no Jarvis parity on native-only changes.

## Consequences

### Positive

- **Store narrative**: distinct native app with branded UI, not a thin browser shell — better alignment with listing and review expectations.
- **Performance and UX**: native lists, sheets, and navigation without WebView variance on core funnel screens.
- **Arena reuse**: keeps the shipped Three.js lab asset pipeline (`assets/review-arena/v3`) without rewriting WebGL in Compose/SwiftUI for M1.
- **Clear Jarvis boundary**: customer Compose/SwiftUI apps remain sibling products to Jarvis Kotlin, not a fork of `android/`.

### Negative / risks

- **Two UI codebases** (Kotlin + Swift) until/unless KMP ships — higher M1 cost than Capacitor wrap.
- **Arena bridge** must be kept small and tested; WebView bugs are isolated to lab tries, not the whole funnel.
- **Parity**: web spearhead (#4422) may lead native on minor UX; native tickets must cite intentional diffs.
- **CI**: Android + iOS build lanes, signing, and device matrices ([#4505](https://github.com/kaanmuar/kaanmuar.github.io/issues/4505)).

### Follow-up work

| Ticket | Work |
| --- | --- |
| #4505 | Compose + SwiftUI scaffold, API clients, arena WebView + bridge |
| #4492 | Icons, splash, store listings (still valid) |
| #4494 / #4495 | **Retarget** to this ADR (no Capacitor scaffold) |
| #4496 | Auth, accounts, IAP |
| #4491 | Epic tracking for native apps |

## Alternatives considered

| Option | Verdict | Rationale |
| --- | --- | --- |
| **Native Compose + SwiftUI (this ADR)** | **Chosen (M1)** | Store-quality shell; arena stays Web; APIs unchanged. |
| **Capacitor full-wrap** ([ADR 4493](./4493-url-review-native-capacitor.md)) | **Superseded** | Fastest wrap but weak store story and full-funnel WebView risk. |
| **KMP + CMP single UI** | **Later** | Reduces duplication; not blocking M1. |
| **Jarvis `android/` extension** | **Rejected** | Wrong package, audience, and release train. |
| **Rewrite arena in native GL** | **Rejected for M1** | Unnecessary cost; v3 assets already ship. |

## Proposed repo layout

```text
apps/url-review-native/
  README.md                 # build, store IDs, links to this ADR
  android/                  # Gradle project — Compose app (NOT repo-root android/)
    applicationId com.carlosandmunoz.urlreview
  ios/                      # Xcode project — SwiftUI app
    bundle id com.carlosandmunoz.urlreview
  arena/                    # packaged review-arena/v3 + bridge HTML/JS entry (sync from assets/)
  contracts/                # bridge message schema, API DTO notes (optional M1)
```

Rules:

- **Do not** merge `apps/url-review-native/android/` into Jarvis `settings.gradle.kts`.
- **Do not** reuse Jarvis `google-services.json`, Sentry DSN, or Firebase projects.
- Sync or copy `assets/review-arena/v3/**` into the app bundle on build; version pin in CI when arena assets change.

## M1 technical notes

- **APIs**: `https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl` and `reviewRun` (and locale/host rewrites as on web); authenticate per existing web/MCP patterns for customer flows.
- **Deep links**: Universal Links / App Links to native routes; web URLs may open in-app or fall back to Safari/Chrome where not yet implemented.
- **Arena entry**: load `file://` or `appassets` bundle URL for v3 lab shell; set `sessionStorage` / bridge equivalents for skin (`lab`) as web does in `spearhead-arena-harness.html`.
- **Telemetry**: customer analytics only — no Jarvis operator channels.
- **Versioning**: app `versionCode` / `CFBundleShortVersionString` independent of Jarvis.

## Compliance

- **Licenses**: Compose, SwiftUI, and HTTP client deps — MIT/Apache/BSD only in customer bundle.
- **AGPL**: none in customer app (`tool-arsenal.mdc`).
- **Deck**: product web changes still follow deck parity; **docs and `apps/url-review-native/**` skip deck** when PR says so.

---

*Author: design ticket #4506. Supersedes [ADR 4493 — Capacitor](./4493-url-review-native-capacitor.md). Parent epic [#4491](https://github.com/kaanmuar/kaanmuar.github.io/issues/4491).*