# ADR 4493 — URL Review native apps (Android + iOS)

| Field | Value |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-11-27 |
| **Tickets** | Parent [#4491](https://github.com/kaanmuar/kaanmuar.github.io/issues/4491) · This ADR [#4493](https://github.com/kaanmuar/kaanmuar.github.io/issues/4493) · Children [#4492](https://github.com/kaanmuar/kaanmuar.github.io/issues/4492) design · [#4494](https://github.com/kaanmuar/kaanmuar.github.io/issues/4494) Android · [#4495](https://github.com/kaanmuar/kaanmuar.github.io/issues/4495) iOS · [#4496](https://github.com/kaanmuar/kaanmuar.github.io/issues/4496) auth/pay |
| **Related** | [#37](https://github.com/kaanmuar/kaanmuar.github.io/issues/37) installable/PWA · [#4422](https://github.com/kaanmuar/kaanmuar.github.io/issues/4422) mobile web spearhead (shipped) |

## Context

QA-lab **URL Review** is a customer product: review runs, checkout, packages, and accounts all live on production web (`qa-review.html` and locale shells on `carlosandmunoz.com`). The mobile web spearhead (#4422) already ships soft-gate, arena, collapsed layout, sticky pricing, StatusCard, and prediction UX in the browser.

We need **store-distributed native shells** for Android and iOS so customers can install from Play / App Store, use OS integrations (share sheet, back gesture, safe areas), and reach TestFlight / Play internal testing quickly without forking product logic.

Constraints:

- **Jarvis** (`android/`, `com.carlosandmunoz.jarvis`) is an internal operator app (Kotlin, Compose, Firebase, Sentry, Wear). It must stay **completely separate** from customer URL Review — different package IDs, signing, Firebase projects, crash reporting, and release trains.
- Customer product code must use **permissive licenses** only (`tool-arsenal.mdc`). No AGPL tooling bundled into the app.
- **Store IAP and native accounts** are not ready (#4496, #37). Milestone **M1** must still ship review + pay paths via web handoff or a flagged unlock stub.
- One web codebase remains source of truth; duplicating the review funnel in native UI for M1 is out of scope.

## Decision

**Adopt [Capacitor](https://capacitorjs.com/) (MIT)** as the M1 native shell for URL Review on **Android and iOS**.

1. **Load production web** in a full-screen WebView (Capacitor `server.url` or equivalent remote URL config), starting at `https://carlosandmunoz.com/qa-review.html` with locale shells (`qa-review-es.html`, etc.) as today.
2. **New application identifiers**, not Jarvis:
   - Android: `com.carlosandmunoz.urlreview` (display name per #4492).
   - iOS: bundle ID TBD in #4495 (proposed same reverse-DNS pattern).
3. **Repository layout** under `apps/url-review/`, not under repo-root `android/` (Jarvis). See [Proposed repo layout](#proposed-repo-layout).
4. **M1 pay / account**: defer Play Billing / StoreKit and native sign-in (#4496). Use existing **web checkout** (Safari/Chrome Custom Tab handoff when required) or a **remote-config / feature-flagged** “unlock” stub until store billing ships.
5. **Thin native layer only** in M1: splash, status bar / safe area, deep links (`https://carlosandmunoz.com/qa-review.html` paths), optional `app://` custom scheme for marketing, push permission placeholder (no product push until ticketed), and Capacitor plugins only where web cannot (e.g. `App`, `StatusBar`, `SplashScreen`, `Browser`).
6. **KMP + Compose Multiplatform (CMP)** is the documented **escape hatch** if WebView fidelity, performance, or store review feedback blocks shipment (see [Alternatives](#alternatives-considered)).

## Consequences

### Positive

- Fastest path to **Play internal testing** and **TestFlight** while reusing 100% of shipped review UX.
- Single product truth on `carlosandmunoz.com`; fixes deploy with existing Pages pipeline — no native resubmit for most UI changes.
- Clear **separation** from Jarvis: no shared Gradle root with `android/`, no accidental `com.carlosandmunoz.jarvis` wiring.
- Capacitor is **MIT** — aligned with customer code policy.

### Negative / risks

- **WebView variance** (iOS WKWebView vs Android System WebView) may expose edge cases not seen in mobile Safari/Chrome; track under #4494 / #4495 with device matrices.
- **Store policy** may scrutinize “thin shell” apps; mitigate with distinct branding (#4492), non-generic icons, and clear value prop in listing copy; escalate to KMP/CMP if rejected.
- **In-app purchase rules**: until #4496, paid unlock must stay on **web pay** or compliant stub — no fake IAP.
- Additional CI surface (Capacitor sync, native project lint); keep workflows scoped to `apps/url-review/**`.

### Follow-up work (not this ADR)

| Ticket | Work |
| --- | --- |
| #4492 | Native shells design (icons, splash, store listings, safe-area) |
| #4494 | Android Capacitor scaffold + `com.carlosandmunoz.urlreview` |
| #4495 | iOS Capacitor scaffold + bundle ID + TestFlight |
| #4496 | Auth, accounts, Play Billing / StoreKit |
| Arsenal | Add Capacitor pin row when #4494 lands (`@capacitor/core` version pinned) |

## Alternatives considered

| Option | Verdict | Rationale |
| --- | --- | --- |
| **Capacitor wrap production `qa-review`** | **Chosen (M1)** | Reuses prod UX; smallest time-to-store; MIT. |
| **KMP / CMP shared native UI** | **Escape hatch** | Right if WebView fails review or UX; higher cost; jarvis already proves Kotlin/Compose skill but customer UI differs. |
| **Dual native rewrite (SwiftUI + Jetpack)** | **Rejected for M1** | Two codebases for the same funnel; violates “web is truth” and blows schedule. |
| **Stuff URL Review into Jarvis `android/`** | **Rejected** | Wrong audience, package ID, signing, Firebase, and store listing; couples operator app to customer releases. |
| **PWA-only (#37)** | **Complement, not substitute** | `qa-review.webmanifest` remains; store presence still needs native wrappers for discoverability and OS integrations. |
| **React Native / Flutter** | **Rejected** | New stack for a web-first product; no reuse of existing HTML/JS review shell. |
| **Cordova** | **Rejected** | Superseded by Capacitor for greenfield; same WebView model but weaker maintenance story. |

## Proposed repo layout

Jarvis stays at repository root `android/`. URL Review native projects live in a **sibling tree**:

```text
apps/url-review/
  README.md                 # how to build, env, store IDs, link to this ADR
  package.json              # @capacitor/* deps (pinned); scripts: cap sync, open android/ios
  capacitor.config.ts       # appId com.carlosandmunoz.urlreview; server.url → prod or staging
  src/
    index.html              # minimal bootstrap if needed; may redirect to remote URL only
    native-bridge.ts        # optional Capacitor hooks (deep link, status bar) — keep tiny
  android/                  # Capacitor-generated Android project (NOT repo-root android/)
  ios/                      # Capacitor-generated Xcode project
  resources/                # icons + splash sources (#4492 exports)
```

Rules:

- **Do not** merge `apps/url-review/android/` into root `android/` or share `settings.gradle.kts` with Jarvis.
- **Do not** reference Jarvis Firebase (`google-services.json` from Jarvis) or Sentry DSN from Jarvis.
- Web assets for the product remain at repo root (`qa-review*.html`, `js/`, `css/`); Capacitor M1 does **not** copy the whole site into `www/` unless we later add offline mode (out of M1 scope).
- Path-filtered CI: new workflow(s) under `.github/workflows/` triggering only on `apps/url-review/**` (+ ticket refs).

## M1 technical notes

- **Entry URL**: `https://carlosandmunoz.com/qa-review.html` (and locale paths). Staging hostname only via build flavor / env for QA, never committed secrets.
- **Cookies / session**: same-site behavior as mobile browser; test login and checkout handoff on both platforms before store submit.
- **Deep links**: Universal Links / App Links to `https://carlosandmunoz.com/qa-review*` paths; document host verification files separately in #4494/#4495.
- **Versioning**: app `versionCode` / `CFBundleShortVersionString` independent of Jarvis `JARVIS_VERSION_CODE`.
- **Telemetry**: customer-appropriate analytics only; no Jarvis operator channels.

## Compliance

- **License**: Capacitor core and official plugins — verify each plugin’s license before adopt; default to MIT/Apache only.
- **AGPL**: no AGPL libraries in the customer app bundle (`tool-arsenal.mdc`).
- **Deck / Jarvis parity**: changes under `apps/url-review/` do not trigger Jarvis web parity (`jarvis-parity.yml`); product web changes still follow deck parity rules.

---

*Author: architecture ticket #4493. Supersedes informal lean in [#4491](https://github.com/kaanmuar/kaanmuar.github.io/issues/4491#issuecomment-7228841541).*