#!/usr/bin/env bash
# Commits the Buffer, Facebook Page, Bluesky and Mastodon, dev.to, Telegram, and Reddit ledgers (scripts/social-ledger.js) straight to main
# with [skip ci].
#   scripts/commit-social-ledgers.sh "<what ran>"
# The Live Reports, Facebook Page, Bluesky and Mastodon, and dev.to workflows write them, so a push that loses the race is retried on
# the new main with each ledger merged entry by entry, not overwritten.
# The social hub pages show chips read from the ledgers, so they are rebuilt and committed with them. Pull requests
# leave those generated files to these commits and the regen commits (#2242).
# The body is in functions so bash has read all of it before git reset rewrites this file.
set -euo pipefail

stage() {
	scripts/social-hub-build.sh
	# The commit skips CI, so a hub page in the wrong language would fail every PR after it.
	scripts/social-hub/guard-hub-lang.sh
	git add "${files[@]}" assets/social qa-review-social*.html sitemap-social.xml social
}

main() {
	local files=() file attempt saved
	if [ -z "${GITHUB_ACTIONS:-}" ]; then
		echo "Runs only in GitHub Actions: it commits to main as the bot, fetches main with --depth=1, which makes a local clone shallow, and resets this checkout to it." >&2
		return 1
	fi
	for file in assets/social/buffer.json assets/social/facebook.json assets/social/open-social.json assets/social/devto.json assets/social/telegram.json assets/social/reddit.json; do
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
