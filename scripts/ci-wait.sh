#!/bin/bash
# Waits for every CI run on a commit, and every check another app posts on it, and prints only what failed (#1970): one blocking REST watch per run,
# then the last lines of each failed step instead of the whole log. A run that has not started is skipped once every
# check main requires has passed: the macOS runners can leave a run queued for hours (#2293).
#   scripts/ci-wait.sh <sha|pr-number> [lines]
set -uo pipefail
R=repos/kaanmuar/kaanmuar.github.io
ref=${1:?usage: scripts/ci-wait.sh <sha|pr-number> [lines]}
lines=${2:-40}
if [[ "$ref" =~ ^[0-9]+$ ]]; then
	ref=$(gh api $R/pulls/"$ref" -q .head.sha)
else
	ref=$(gh api $R/commits/"$ref" -q .sha)
fi

# Every gh call can fail on the shared rate limit; retry it rather than read an error as a result.
runs() { until gh run list --commit "$ref" --json databaseId -q '.[].databaseId' 2>/dev/null; do sleep 60; done; }

required=$(gh api $R/rules/branches/main -q '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context] | unique | .[]' 2>/dev/null)
required_passed() {
	[ -n "$required" ] || return 1
	local passed name
	passed=$(gh api --paginate "$R/commits/$ref/check-runs?per_page=100" \
		-q '.check_runs[] | select(.conclusion == "success" or .conclusion == "skipped" or .conclusion == "neutral") | .name' 2>/dev/null) || return 1
	while IFS= read -r name; do
		grep -qxF "$name" <<<"$passed" || return 1
	done <<<"$required"
}

ids=""
for _ in $(seq 1 20); do
	ids=$(runs)
	[ -n "$ids" ] && break
	sleep 15
done
[ -z "$ids" ] && {
	echo "No runs for ${ref:0:7} after 5 minutes."
	exit 1
}

failed=0
skipped=0
seen=" "
while [ -n "$ids" ]; do
	for id in $ids; do
		seen="$seen$id "
		until state=$(gh run view "$id" --json status,conclusion -q '"\(.status) \(.conclusion)"' 2>/dev/null) &&
			[[ "$state" == completed* ]]; do
			if [[ "$state" =~ ^(queued|waiting|pending|requested) ]]; then
				required_passed && break
				sleep 60
			else
				gh run watch "$id" -i 30 >/dev/null 2>&1 || sleep 60
			fi
		done
		if [[ "$state" != completed* ]]; then
			gh run view "$id" --json name,url -q '"SKIPPED \(.name) has not started; the required checks passed  \(.url)"'
			skipped=1
			continue
		fi
		# A run whose jobs all skipped has passed.
		[[ "$state" == "completed success" || "$state" == "completed skipped" ]] && continue
		failed=1
		gh run view "$id" --json name,url -q '"FAILED  \(.name)  \(.url)"'
		gh run view "$id" --log-failed 2>/dev/null | cut -f3- | sed 's/^[0-9T:.-]*Z //' | tail -n "$lines"
	done
	sleep 20
	ids=$(runs | while read -r id; do [[ "$seen" == *" $id "* ]] || echo "$id"; done)
done

# Checks other apps post, such as CodeQL's code-scanning verdict, finish after the Actions runs and are not runs (#3247).
others() { gh api --paginate "$R/commits/$ref/check-runs?per_page=100" -q '.check_runs[] | select(.app.slug != "github-actions") | "\(.status)\t\(.conclusion)\t\(.name)\t\(.output.title // "")\t\(.html_url)"' 2>/dev/null; }
checks=""
for _ in $(seq 1 30); do
	checks=$(others) || {
		sleep 60
		continue
	}
	grep -qv "^completed" <<<"$checks" || break
	sleep 30
done
while IFS=$'\t' read -r status conclusion name title url; do
	[ -n "$name" ] || continue
	if [ "$status" != completed ]; then
		echo "PENDING $name has not finished after 15 minutes  $url"
		failed=1
	elif [[ "$conclusion" =~ ^(failure|timed_out|action_required|cancelled)$ ]]; then
		echo "FAILED  $name: $title  $url"
		failed=1
	fi
done <<<"$checks"

if [ $failed = 0 ]; then
	[ $skipped = 1 ] && echo "Every run that started passed for ${ref:0:7}." || echo "All runs passed for ${ref:0:7}."
fi
exit $failed
