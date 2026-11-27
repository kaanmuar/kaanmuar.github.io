#!/usr/bin/env bash
# Copy product ReviewArena (Lab Tries) 2D canvas stack into native WebView bundles (#4505).
#
# Run from anywhere after changing repo-root arena files or apps/url-review-native/web/:
#   apps/url-review-native/scripts/sync-arena-assets.sh
#
# Sources (REPO = git root of the worktree):
#   web/index.html, web/js/native-bridge.js  — native shell + JS bridge
#   js/qa-review-{progress,arena,console,…}.js, css/qa-review-*.css
#   assets/review-arena/v3/                  — lab art (clean.jpg, items.png, loop-*.webp)
#
# Destinations (~1.5 MiB each):
#   android/app/src/main/assets/arena/       — file:///android_asset/arena/index.html
#   ios/URLReview/Arena/                     — WKWebView loadFileURL (folder ref in Xcode)
#
# Commit both destinations after sync when arena product files change on main.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
WEB="$ROOT/web"
ANDROID="$ROOT/android/app/src/main/assets/arena"
IOS="$ROOT/ios/URLReview/Arena"

JS_FILES=(
  qa-review-progress.js
  qa-review-arena-facts.js
  qa-review-arena-atlas.js
  qa-review-arena-motion.js
  qa-review-console.js
  qa-review-arena.js
)
CSS_FILES=(
  qa-review-progress.css
  qa-review-arena.css
  qa-review-console.css
)

rm -rf "$ANDROID" "$IOS"
mkdir -p "$ANDROID/js" "$ANDROID/css" "$ANDROID/assets/review-arena/v3"
mkdir -p "$IOS/js" "$IOS/css" "$IOS/assets/review-arena/v3"

cp "$WEB/index.html" "$ANDROID/index.html"
cp "$WEB/index.html" "$IOS/index.html"
cp "$WEB/js/native-bridge.js" "$ANDROID/js/native-bridge.js"
cp "$WEB/js/native-bridge.js" "$IOS/js/native-bridge.js"

for f in "${JS_FILES[@]}"; do
  cp "$REPO/js/$f" "$ANDROID/js/$f"
  cp "$REPO/js/$f" "$IOS/js/$f"
done
for f in "${CSS_FILES[@]}"; do
  cp "$REPO/css/$f" "$ANDROID/css/$f"
  cp "$REPO/css/$f" "$IOS/css/$f"
done
cp -R "$REPO/assets/review-arena/v3/." "$ANDROID/assets/review-arena/v3/"
cp -R "$REPO/assets/review-arena/v3/." "$IOS/assets/review-arena/v3/"

echo "Synced arena → $ANDROID and $IOS ($(du -sh "$ANDROID" | awk '{print $1}') each)"