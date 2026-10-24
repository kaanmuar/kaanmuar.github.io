#!/usr/bin/env bash
# Runs gh with whichever account still has GraphQL budget. Board commands (gh project ..., or GraphQL that names
# a ProjectV2) go first as the qa-lab-agents app, whose installation on the enterprise org carlosandmunoz-hq gets
# 10,000 points an hour (scripts/gh-app-token.js). Then as kaanmuar, which every chat shares (5,000 an hour), then
# as the bot. A rate-limited request is not carried out, so the retry is safe for mutations. Queries and board
# mutations can be counted in different buckets, so checking rate_limit first does not predict whether a call passes.
#
# The bot's classic token (scopes repo, project) is in the macOS Keychain:
#   security add-generic-password -a qa-lab-bot -s qa-lab-bot -w
#
#   scripts/gh-budget.sh project item-edit ...     # any non-interactive gh command; output is printed at the end
#   scripts/gh-budget.sh --status                  # GraphQL points left on each account
set -uo pipefail

bot=$(security find-generic-password -a qa-lab-bot -s qa-lab-bot -w 2>/dev/null || true)
app=$("$(dirname "$0")/gh-app-token.js" 2>/dev/null || true)
me=$(gh auth token 2>/dev/null || true)

if [ "${1:-}" = "--status" ]; then
	query='.data.rateLimit | "\(.remaining)/\(.limit) GraphQL points left, resets \(.resetAt)"'
	for who in app me bot; do
		token=${!who}
		if [ -n "$token" ]; then
			echo "$who: $(GH_TOKEN="$token" gh api graphql -f query='{rateLimit{limit remaining resetAt}}' -q "$query" 2>&1)"
		else echo "$who: no token"; fi
	done
	exit 0
fi

order="me bot"
case "$*" in project* | *ProjectV2*) order="app me bot" ;; esac

out=$(mktemp) err=$(mktemp)
trap 'rm -f "$out" "$err"' EXIT

status=1
for who in $order; do
	token=${!who}
	[ -n "$token" ] || continue
	status=0
	GH_TOKEN="$token" gh "$@" >"$out" 2>"$err" || status=$?
	[ "$status" -ne 0 ] && grep -qi "rate limit" "$out" "$err" || break
	echo "gh-budget: $who is rate limited; trying the next account" >&2
done
cat "$out"
cat "$err" >&2
exit "$status"
