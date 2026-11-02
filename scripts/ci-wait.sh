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

# Every gh call can fail on the shared rate limit; retry it rather than read an error as a result.
runs() { until gh run list --commit "$ref" --json databaseId -q '.[].databaseId' 2>/dev/null; do sleep 60; done; }

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
seen=" "
while [ -n "$ids" ]; do
	for id in $ids; do
		seen="$seen$id "
		until state=$(gh run view "$id" --json status,conclusion -q '"\(.status) \(.conclusion)"' 2>/dev/null) &&
			[[ "$state" == completed* ]]; do
			gh run watch "$id" -i 30 >/dev/null 2>&1 || sleep 60
		done
		# A run whose jobs all skipped has passed.
		[[ "$state" == "completed success" || "$state" == "completed skipped" ]] && continue
		failed=1
		gh run view "$id" --json name,url -q '"FAILED  \(.name)  \(.url)"'
		gh run view "$id" --log-failed 2>/dev/null | cut -f3- | sed 's/^[0-9T:.-]*Z //' | tail -n "$lines"
	done
	sleep 20
	ids=$(runs | while read -r id; do [[ "$seen" == *" $id "* ]] || echo "$id"; done)
done
[ $failed = 0 ] && echo "All runs passed for ${ref:0:7}."
exit $failed
