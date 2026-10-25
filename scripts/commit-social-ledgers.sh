#!/usr/bin/env bash
# Commits the Buffer and Facebook Page ledgers (scripts/social-ledger.js) straight to main with [skip ci].
#   scripts/commit-social-ledgers.sh "<what ran>"
# Both the Live Reports and the Facebook Page workflows write them, so a push that loses the race is retried on
# the new main with each ledger merged entry by entry, not overwritten.
# The social hub pages show chips read from the ledgers, so they are rebuilt and committed with them, or every PR
# fails the hub check in CI.
# The body is in functions so bash has read all of it before git reset rewrites this file.
set -euo pipefail

stage() {
	# build-social-hub.js inlines critical CSS with packages a bare runner does not have (#1089).
	if [ -n "${GITHUB_ACTIONS:-}" ] && [ -f scripts/build-critical-css.js ] && ! node -e 'require("postcss")' 2>/dev/null; then
		local deps
		read -ra deps <<<"$(node scripts/build-critical-css.js --deps)"
		npm install -s --no-save --prefix "$RUNNER_TEMP/critical-css" "${deps[@]}" >/dev/null
		export NODE_PATH="$RUNNER_TEMP/critical-css/node_modules${NODE_PATH:+:$NODE_PATH}"
	fi
	node scripts/build-social-hub.js --offline
	git add "${files[@]}" assets/social qa-review-social*.html sitemap-social.xml
}

main() {
	local files=() file attempt saved
	if [ -z "${GITHUB_ACTIONS:-}" ]; then
		echo "Runs only in GitHub Actions: it commits to main as the bot, fetches main with --depth=1, which makes a local clone shallow, and resets this checkout to it." >&2
		return 1
	fi
	for file in assets/social/buffer.json assets/social/facebook.json; do
		[ -f "$file" ] && files+=("$file")
	done
	[ ${#files[@]} -gt 0 ] || {
		echo "No ledgers to commit."
		return 0
	}

	git config user.name "github-actions[bot]"
	git config user.email "41898299+github-actions[bot]@users.noreply.github.com"
	stage
	if git diff --cached --quiet; then
		echo "The ledgers did not change."
		return 0
	fi
	git commit -q -m "Social ledgers: $1 [skip ci]"

	saved=$(mktemp -d)
	cp "${files[@]}" "$saved/"
	for attempt in 1 2 3 4 5; do
		git push origin HEAD:main && return 0
		sleep $((attempt * 5))
		git fetch -q --depth=1 origin main
		git reset -q --hard FETCH_HEAD
		for file in "${files[@]}"; do
			node scripts/social-ledger.js --merge "$saved/$(basename "$file")" "$file"
		done
		stage
		if git diff --cached --quiet; then
			echo "main already has these entries."
			return 0
		fi
		git commit -q -m "Social ledgers: $1 [skip ci]"
	done
	echo "::error::main kept moving; the social ledgers were not pushed."
	return 1
}

main "${1:-update}"
