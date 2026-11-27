#!/usr/bin/env bash
# Commit Live Reports cards and/or social clips to main with the cherry-pick retry (#4457).
# Usage: scripts/commit-live-reports.sh cards|social <batch> <cards-count> <social-count>
set -euo pipefail
MODE=${1:?mode}
BATCH=${2:?batch}
CARDS=${3:-0}
SOCIAL=${4:-0}

git config user.name "github-actions[bot]"
git config user.email "41898299+github-actions[bot]@users.noreply.github.com"

if [ "$MODE" = cards ]; then
	git add assets/live-reports data/live-report-countries.json data/live-reports-social-batch.json data/live-reports-batches \
		llms.txt llms-full.txt qa-review*.html scripts/auto-live-reports.state.json scripts/social-hub/phrases 2>/dev/null || true
	# Drop the social batch file from the index when it was removed (empty social day).
	git add -u -- data/live-reports-social-batch.json scripts/auto-live-reports.state.json 2>/dev/null || true
elif [ "$MODE" = social ]; then
	if [ -d "media/social-posts/$BATCH" ]; then
		git add "media/social-posts/$BATCH"
		git add -f "media/social-posts/$BATCH/story" 2>/dev/null || true
	fi
	git add scripts/auto-live-reports.state.json data/live-reports-social-batch.json 2>/dev/null || true
	git add -u -- scripts/auto-live-reports.state.json data/live-reports-social-batch.json 2>/dev/null || true
else
	echo "mode must be cards or social" >&2
	exit 1
fi

node scripts/build-social-hub.js
if node scripts/social-hub/translate-captions.js --picks --machine; then
	node scripts/build-social-hub.js --offline
else echo "::warning::Google's translator refused; new picks keep the languages the phrasebooks cover."; fi
node scripts/build-style-css.js && node scripts/build-critical-css.js || echo "::warning::style.css was not rebuilt; run node scripts/build-style-css.js and build-critical-css.js on main (#2552)."
git add -u -- style.css '*.html'
git add assets/social qa-review-social*.html sitemap-social.xml social scripts/social-hub/phrases 2>/dev/null || true
scripts/social-hub/guard-hub-lang.sh

if git diff --cached --quiet; then
	echo "pushed=0" >>"$GITHUB_OUTPUT"
	exit 0
fi

if [ "$MODE" = cards ]; then
	git commit -q -m "Live reports: $CARDS reviews, $SOCIAL posts ($BATCH) [skip ci]"
else
	git commit -q -m "Live reports social: $SOCIAL posts ($BATCH) [skip ci]"
fi

for attempt in 1 2 3 4 5; do
	git push origin HEAD:main && break
	if [ "$attempt" = 5 ]; then
		echo "::error::main kept moving; batch $BATCH was not pushed."
		exit 1
	fi
	sleep $((attempt * 5))
	DATA=$(git rev-parse HEAD)
	git fetch -q --depth=1 origin main
	git reset -q --hard FETCH_HEAD
	if [ "$MODE" = cards ] && git diff --quiet HEAD "$DATA" -- assets/live-reports scripts/auto-live-reports.state.json; then
		echo "main already has batch $BATCH."
		echo "pushed=0" >>"$GITHUB_OUTPUT"
		exit 0
	fi
	if [ "$MODE" = social ] && git diff --quiet HEAD "$DATA" -- "media/social-posts/$BATCH" scripts/auto-live-reports.state.json; then
		echo "main already has social batch $BATCH."
		echo "pushed=0" >>"$GITHUB_OUTPUT"
		exit 0
	fi
	git cherry-pick -X theirs "$DATA"
	python3 scripts/build-llms-full.py
	node scripts/build-social-hub.js --offline
	node scripts/build-style-css.js && node scripts/build-critical-css.js || echo "::warning::style.css was not rebuilt; run node scripts/build-style-css.js and build-critical-css.js on main (#2552)."
	git add -u -- style.css '*.html'
	git add llms.txt llms-full.txt qa-review*.html assets/social sitemap-social.xml social
	scripts/social-hub/guard-hub-lang.sh HEAD~1
	git diff --cached --quiet || git commit -q --amend --no-edit
done
gh workflow run pages.yml --ref main -R "${GITHUB_REPOSITORY:-kaanmuar/kaanmuar.github.io}" || echo "::warning::Pages was not dispatched; the next push to main deploys this batch."
echo "pushed=1" >>"$GITHUB_OUTPUT"
