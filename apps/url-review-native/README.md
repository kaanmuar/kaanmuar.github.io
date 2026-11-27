# URL Review — native apps (#4505)

Native URL Review clients (#4505). Branch: `feat/4505-urlreview-native`.

**Wave 2:** Lab Tries / ReviewArena ships inside each app (`scripts/sync-arena-assets.sh` copies `js/qa-review-arena*.js`, progress + console CSS/JS, and `assets/review-arena/v3` into Android `assets/arena/` and iOS `URLReview/Arena/`). Not Three.js — a 2D canvas lab skin driven by `ReviewProgress` log lines (same as `spearhead-arena-harness.html`).

| Platform | Path | Bundle / application ID |
|----------|------|-------------------------|
| iOS | [`ios/`](ios/) | `com.carlosandmunoz.urlreview` |
| Android | [`android/`](android/) | `com.carlosandmunoz.urlreview` |

Platform-specific build and signing docs live in each subdirectory's README.