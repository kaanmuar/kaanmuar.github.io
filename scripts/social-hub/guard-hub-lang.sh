#!/usr/bin/env bash
# Runs tests/unit/social-hub.test.js before a bot's [skip ci] commit to main (#2141). If it fails, each
# localized hub page and its feed, captions and RSS go back to <ref>, the main the commit builds on, so the
# rest of the data still lands; it fails only if the tests still fail after that.
#
#   scripts/social-hub/guard-hub-lang.sh [ref]    ref defaults to HEAD; after a cherry-pick onto main, pass HEAD~1
set -euo pipefail
cd "$(dirname "$0")/../.."
ref="${1:-HEAD}"

node --test tests/unit/social-hub.test.js > /dev/null 2>&1 && exit 0

files=()
for lang in $(node -p "require('./scripts/social-hub/i18n').LANGS.join(' ')"); do
	files+=("qa-review-social-$lang.html" "assets/social/feed-$lang.json" "assets/social/captions-$lang.json" "assets/social/rss-$lang.xml")
done
git checkout "$ref" -- "${files[@]}"
echo "::warning::The social hub tests failed, so the localized hub pages keep the version on main (#2141)."
node --test tests/unit/social-hub.test.js
