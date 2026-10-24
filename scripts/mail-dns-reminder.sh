#!/usr/bin/env bash
# shellcheck disable=SC2016 # the backticks are Markdown code spans
# Comments on #928 with the live DMARC, MTA-STS and TLS-RPT records and the checklist for one stage.
# Usage: scripts/mail-dns-reminder.sh [1|2]   (DRY=1 prints the comment instead of posting it)
# Stage defaults to 1 before the 21st of the month, 2 from then on. Exits quietly once the issue is closed.
set -euo pipefail

REPO=${GITHUB_REPOSITORY:-kaanmuar/kaanmuar.github.io}
ISSUE=928
DOMAIN=carlosandmunoz.com
STEPS="https://github.com/$REPO/issues/$ISSUE#issuecomment-6390748275"
DASHBOARD="https://dash.cloudflare.com/?to=/:account/$DOMAIN/email/dmarc-management"

state=$(gh api "repos/$REPO/issues/$ISSUE" -q .state)
if [ "$state" != open ]; then
	echo "#$ISSUE is $state; nothing to remind."
	exit 0
fi

day=$(date -u +%d)
stage=${1:-$([ "${day#0}" -ge 21 ] && echo 2 || echo 1)}

txt() { dig +short TXT "$1" @1.1.1.1 | sed 's/" "//g; s/"//g' | paste -sd ' ' -; }
dmarc=$(txt "_dmarc.$DOMAIN")
sts=$(txt "_mta-sts.$DOMAIN")
tlsrpt=$(txt "_smtp._tls.$DOMAIN")
policy=$(curl -fsS --max-time 15 "https://mta-sts.$DOMAIN/.well-known/mta-sts.txt" | tr -d '\r' || true)
mode=$(printf '%s\n' "$policy" | sed -n 's/^mode: *//p')
max_age=$(printf '%s\n' "$policy" | sed -n 's/^max_age: *//p')

if [ "$stage" = 1 ]; then
	if [[ "$dmarc" =~ pct=100|p=reject ]] && [ "$mode" = enforce ]; then applied=yes; else applied=no; fi
	target='`_dmarc` at `pct=100`, the policy at `mode: enforce` with `max_age: 1209600`, and a new `_mta-sts` id'
else
	if [[ "$dmarc" =~ p=reject ]]; then applied=yes; else applied=no; fi
	target='`_dmarc` at `p=reject`, then close this issue'
fi

body=$(
	printf '## Stage %s check-in, %s\n\n' "$stage" "$(date -u +%F)"
	printf 'Posted by `.github/workflows/mail-dns-reminder.yml`. Live records:\n\n'
	printf -- '- `_dmarc`: `%s`\n' "${dmarc:-missing}"
	printf -- '- `_mta-sts`: `%s`\n' "${sts:-missing}"
	printf -- '- `_smtp._tls`: `%s`\n' "${tlsrpt:-missing}"
	printf -- '- policy: `mode: %s`, `max_age: %s`\n\n' "${mode:-fetch failed}" "${max_age:-fetch failed}"
	if [ "$applied" = yes ]; then
		printf 'Stage %s already looks applied (%s).\n' "$stage" "$target"
	else
		printf 'Stage %s target: %s.\n\n' "$stage" "$target"
		printf 'Check these first; the workflow cannot read them. Stop if either fails:\n\n'
		printf -- '- [ ] [DMARC Management](%s), last 14 days: every legitimate source passes aligned DKIM or SPF.\n' "$DASHBOARD"
		if [ "$stage" = 1 ]; then
			printf -- '- [ ] The TLS-RPT mails to qa@ since 2026-10-24 show `failure-session-count: 0`.\n'
		fi
		printf '\nThen follow the [steps](%s).\n' "$STEPS"
	fi
)

if [ "${DRY:-}" = 1 ]; then
	printf '%s\n' "$body"
else
	gh api "repos/$REPO/issues/$ISSUE/comments" -f body="$body" -q .html_url
fi
