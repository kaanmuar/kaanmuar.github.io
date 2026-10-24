#!/usr/bin/env bash
# Commits the Buffer and Facebook Page ledgers (scripts/social-ledger.js) straight to main with [skip ci].
#   scripts/commit-social-ledgers.sh "<what ran>"
# Both the Live Reports and the Facebook Page workflows write them, so a push that loses the race is retried on
# the new main with each ledger merged entry by entry, not overwritten.
# The body is one function so bash has read all of it before git reset rewrites this file.
set -euo pipefail

main() {
	local files=() file attempt saved
	for file in assets/social/buffer.json assets/social/facebook.json; do
		[ -f "$file" ] && files+=("$file")
	done
	[ ${#files[@]} -gt 0 ] || {
		echo "No ledgers to commit."
		return 0
	}

	git config user.name "github-actions[bot]"
	git config user.email "41898299+github-actions[bot]@users.noreply.github.com"
	git add "${files[@]}"
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
		git add "${files[@]}"
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
