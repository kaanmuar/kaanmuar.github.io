#!/bin/bash
# Waits for every CI run on a commit and prints only what failed (#1970): one blocking REST watch per run,
# then the last lines of each failed step instead of the whole log.
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

ids=""
for _ in $(seq 1 20); do
	ids=$(gh run list --commit "$ref" --json databaseId -q '.[].databaseId')
	[ -n "$ids" ] && break
	sleep 15
done
[ -z "$ids" ] && {
	echo "No runs for ${ref:0:7} after 5 minutes."
	exit 1
}

failed=0
for id in $ids; do
	gh run watch "$id" -i 30 --exit-status >/dev/null 2>&1 && continue
	failed=1
	gh run view "$id" --json name,url -q '"FAILED  \(.name)  \(.url)"'
	gh run view "$id" --log-failed 2>/dev/null | cut -f3- | sed 's/^[0-9T:.-]*Z //' | tail -n "$lines"
done
[ $failed = 0 ] && echo "All runs passed for ${ref:0:7}."
exit $failed
