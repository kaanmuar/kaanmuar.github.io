# URL Review — native apps (#4505)

Native URL Review clients (#4505). Branch: `feat/4505-urlreview-native`.

**Wave 2:** Lab Tries / ReviewArena ships inside each app (`scripts/sync-arena-assets.sh` copies `js/qa-review-arena*.js`, progress + console CSS/JS, and `assets/review-arena/v3` into Android `assets/arena/` and iOS `URLReview/Arena/`). Not Three.js — a 2D canvas lab skin driven by `ReviewProgress` log lines (same as `spearhead-arena-harness.html`).

| Platform | Path | Bundle / application ID |
|----------|------|-------------------------|
| iOS | [`ios/`](ios/) | `com.carlosandmunoz.urlreview` |
| Android | [`android/`](android/) | `com.carlosandmunoz.urlreview` |

Platform-specific build and signing docs live in each subdirectory's README.

## Arena sync (`scripts/sync-arena-assets.sh`)

When repo-root arena files change (`js/qa-review-arena*.js`, `css/qa-review-*.css`, `assets/review-arena/v3/`, or `web/` shell/bridge), re-copy into both native bundles and commit:

```bash
apps/url-review-native/scripts/sync-arena-assets.sh
git add apps/url-review-native/android/app/src/main/assets/arena \
        apps/url-review-native/ios/URLReview/Arena
```

The script header lists exact source/destination paths (~1.5 MiB). Android loads `file:///android_asset/arena/index.html`; iOS uses the `Arena` folder reference in `URLReview.xcodeproj`.