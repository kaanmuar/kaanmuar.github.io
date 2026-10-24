#!/usr/bin/env bash
# shellcheck disable=SC2016 # the backticks are Markdown code spans
# Comments on #1060 with what the first six-language social batch (#794, #1024) did: the runs, the caption step and
# its warnings, the paths the batch commit touched, each post's language pages and the phrasebook entries Google filled.
# Usage: scripts/social-batch-check.sh [batch]   (default auto-<today UTC>; DRY=1 prints the comment instead of posting it)
# Exits quietly once the issue is closed.
set -euo pipefail

REPO=${GITHUB_REPOSITORY:-kaanmuar/kaanmuar.github.io}
ISSUE=1060
BATCH=${1:-auto-$(date -u +%F)}
DAY=${BATCH#auto-}
LANGS="es pt de fr it"
# The country sweep's last tick is 05:45 Bogotá (functions/ops-schedule.js).
SWEEP_END="${DAY}T10:45:00Z"
STEP="Write the captions in six languages"

if [ "${DRY:-}" != 1 ]; then
	state=$(gh api "repos/$REPO/issues/$ISSUE" -q .state)
	if [ "$state" != open ]; then
		echo "#$ISSUE is $state; nothing to check."
		exit 0
	fi
fi

box() { if [ "$1" = yes ]; then printf -- '- [x] '; else printf -- '- [ ] '; fi; }

runs=$(gh api "repos/$REPO/actions/workflows/auto-live-reports.yml/runs?created=$DAY&per_page=20" \
	--jq '.workflow_runs[] | [.id, .event, .status, (.conclusion // "-"), .created_at, .html_url] | @tsv')

commit=$(gh api --paginate "repos/$REPO/commits?sha=main&since=${DAY}T00:00:00Z&per_page=100" \
	--jq ".[] | select(.commit.message | startswith(\"Live reports:\") and contains(\"($BATCH)\")) | .sha" | head -1)

body=$(
	printf '## Batch check, %s\n\n' "$BATCH"
	printf 'Posted by `.github/workflows/social-batch-check.yml`.\n\n'

	printf '### Runs of `auto-live-reports.yml` on %s\n\n' "$DAY"
	step_ran=no
	warned=no
	if [ -z "$runs" ]; then
		printf 'None.\n'
	fi
	while IFS=$'\t' read -r id event status conclusion created url; do
		[ -n "$id" ] || continue
		publish=$(gh api "repos/$REPO/actions/runs/$id/jobs" --jq '.jobs[] | select(.name == "publish")')
		if [ "$(jq -r '.conclusion // empty' <<<"$publish")" = skipped ]; then
			printf -- '- [%s](%s): %s, created %s, publish skipped (batch already on main)\n' "$id" "$url" "$event" "$created"
			continue
		fi
		job=$(jq -r '.id // empty' <<<"$publish")
		started=$(jq -r '.started_at // "-"' <<<"$publish")
		caption=$(jq -r --arg s "$STEP" '.steps[]? | select(.name == $s) | .conclusion // .status' <<<"$publish")
		printf -- '- [%s](%s): %s, %s %s, created %s, publish started %s, caption step: %s\n' \
			"$id" "$url" "$event" "$status" "$conclusion" "$created" "$started" "${caption:-not reached}"
		if [ "$caption" = success ]; then step_ran=yes; fi
		if [ -n "$job" ]; then
			while IFS= read -r msg; do
				[ -n "$msg" ] || continue
				printf '  - warning: %s\n' "$msg"
				if [[ "$msg" == *"Google's translator refused"* ]]; then warned=yes; fi
			done < <(gh api "repos/$REPO/check-runs/$job/annotations" \
				--jq '.[] | select(.annotation_level == "warning" and (.message | startswith("Node.js") | not)) | .message')
		fi
	done <<<"$runs"
	printf '\n'

	if [ -z "$commit" ]; then
		printf 'No `Live reports: ... (%s)` commit on main yet. Rerun this check (Actions, Social batch check, Run workflow) once it lands.\n' "$BATCH"
		exit 0
	fi

	git fetch -q --depth=2 origin "$commit"
	subject=$(git log -1 --format=%s "$commit")
	since=$(git show "$commit:scripts/auto-live-reports.state.json" | jq -r .since)
	printf '### Commit [%s](https://github.com/%s/commit/%s)\n\n`%s`\n\n' "${commit:0:8}" "$REPO" "$commit" "$subject"

	box "$([[ "$since" > "$SWEEP_END" || "$since" == "$SWEEP_END" ]] && echo yes || echo no)"
	printf 'Whole night'"'"'s sweep: reviews read up to `%s` (the sweep ends `%s`).\n' "$since" "$SWEEP_END"

	files=$(git diff --name-only "$commit^" "$commit")
	for path in assets/social/ social/ sitemap-social.xml scripts/social-hub/phrases/; do
		count=$(grep -c "^$path" <<<"$files" || true)
		box "$([ "$count" -gt 0 ] && echo yes || echo no)"
		printf '`%s`: %s files\n' "$path" "$count"
	done

	if [ "$warned" = yes ]; then
		box no
		printf '%s: Google refused, so the batch kept only the languages the phrasebooks cover.\n' "$STEP"
	else
		box "$step_ran"
		printf '%s: %s.\n' "$STEP" "$([ "$step_ran" = yes ] && echo "ran" || echo "did not run")"
	fi

	pages=$(git ls-tree --name-only "$commit" "social/$BATCH/" | sed 's|.*/||')
	posts=$(grep -Ev -- '-(es|pt|de|fr|it)\.html$' <<<"$pages" | grep '\.html$' || true)
	missing=""
	for post in $posts; do
		for lang in $LANGS; do
			grep -qx -- "${post%.html}-$lang.html" <<<"$pages" || missing+=" ${post%.html}-$lang.html"
		done
	done
	box "$([ -n "$posts" ] && [ -z "$missing" ] && echo yes || echo no)"
	printf 'Language pages: %s posts in `social/%s/`' "$(wc -w <<<"$posts" | tr -d ' ')" "$BATCH"
	if [ -z "$posts" ]; then
		printf '.\n'
	elif [ -n "$missing" ]; then
		printf ', missing:%s\n' "$missing"
	else
		printf ', each with %s.\n' "$LANGS"
	fi

	machine=0
	counts=""
	for lang in $LANGS; do
		if ! book=$(git show "$commit:scripts/social-hub/phrases/$lang.json" 2>/dev/null); then
			counts+=" $lang missing,"
			continue
		fi
		n=$(jq '[.[] | objects | select(.machine == true)] | length' <<<"$book")
		machine=$((machine + n))
		counts+=" $lang $n,"
	done
	counts=${counts# }
	box "$([ "$machine" = 0 ] && [[ "$counts" != *missing* ]] && echo yes || echo no)"
	printf 'Phrasebook entries marked `machine: true`: %s (%s).\n\n' "$machine" "${counts%,}"

	printf 'Next: an agent rewrites the `machine: true` entries in a PR (`text` rewritten, `machine` dropped), '
	printf 'files a `bug` sub-issue here for each unchecked line, then closes this ticket and deletes the workflow.\n'
)

if [ "${DRY:-}" = 1 ]; then
	printf '%s\n' "$body"
else
	gh api "repos/$REPO/issues/$ISSUE/comments" -f body="$body" -q .html_url
fi
