#!/usr/bin/env bash
# Runs gh as kaanmuar and, if GitHub answers with a rate limit, runs it again as the bot account. Every chat
# shares kaanmuar's GraphQL budget (5,000 points an hour). A rate-limited request is not carried out, so the
# retry is safe for mutations. Queries and board mutations can be counted in different buckets, so checking
# rate_limit first does not predict whether a call passes.
#
# The bot's classic token (scopes repo, project) is in the macOS Keychain. GitHub Apps and fine-grained tokens
# can't reach a user-owned board, so it has to be a classic token:
#   security add-generic-password -a qa-lab-bot -s qa-lab-bot -w
#
#   scripts/gh-budget.sh project item-edit ...     # any non-interactive gh command; output is printed at the end
#   scripts/gh-budget.sh --status                  # GraphQL points left on each account
set -uo pipefail

bot=$(security find-generic-password -a qa-lab-bot -s qa-lab-bot -w 2>/dev/null || true)

if [ "${1:-}" = "--status" ]; then
	query='.data.rateLimit | "\(.remaining) GraphQL points left, resets \(.resetAt)"'
	echo "kaanmuar: $(gh api graphql -f query='{rateLimit{remaining resetAt}}' -q "$query" 2>&1)"
	if [ -n "$bot" ]; then
		echo "bot: $(GH_TOKEN="$bot" gh api graphql -f query='{rateLimit{remaining resetAt}}' -q "$query" 2>&1)"
	else echo "bot: no token in the Keychain"; fi
	exit 0
fi

out=$(mktemp) err=$(mktemp)
trap 'rm -f "$out" "$err"' EXIT

status=0
gh "$@" >"$out" 2>"$err" || status=$?
if [ "$status" -ne 0 ] && [ -n "$bot" ] && grep -qi "rate limit" "$out" "$err"; then
	echo "gh-budget: kaanmuar is rate limited; running as the bot" >&2
	status=0
	GH_TOKEN="$bot" gh "$@" >"$out" 2>"$err" || status=$?
fi
cat "$out"
cat "$err" >&2
exit "$status"
