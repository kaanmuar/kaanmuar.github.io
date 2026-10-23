#!/bin/bash
# Every day at 07:00, an hour after diagnoseReviewFailures, a Cursor agent on this Mac takes the bugs the daily
# check of failed URL reviews files (#320), fixes the ones our code can fix, merges, deploys and closes them.
#   scripts/fix-review-failures.sh install   installs the launchd job (re-run after changing this file)
#   scripts/fix-review-failures.sh           runs once now
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO=kaanmuar/kaanmuar.github.io
LABEL=com.kaanmuar.fixreviewfailures
STATE="$HOME/Library/Application Support/QALab/fix-review-failures"
CLONE="$STATE/repo"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$STATE/logs"

if [ "${1:-}" = install ]; then
	cp "$0" "$STATE/run.sh"
	chmod +x "$STATE/run.sh"
	cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$STATE/run.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$STATE/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/logs/launchd.log</string>
</dict>
</plist>
EOF
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$PLIST"
	echo "Installed $LABEL: daily at 07:00, logs in $STATE/logs"
	exit 0
fi

# A run killed hard leaves its lock behind; no run takes 3 hours.
find "$STATE" -maxdepth 1 -name lock -mmin +180 -exec rmdir {} \; 2>/dev/null || true
mkdir "$STATE/lock" 2>/dev/null || {
	echo "$(date -u +%FT%TZ) a run is already going"
	exit 0
}
trap 'rmdir "$STATE/lock"' EXIT

[ -d "$CLONE/.git" ] || gh repo clone "$REPO" "$CLONE" -- -q
cd "$CLONE"
git fetch -q origin
git checkout -q -B main origin/main
git reset -q --hard origin/main
git clean -qfd

read -r -d '' PROMPT <<'EOF' || true
You run unattended every morning on the owner's Mac, an hour after diagnoseReviewFailures has diagnosed yesterday's failed URL reviews. Nobody will answer questions: decide, act, and finish. The repo is kaanmuar/kaanmuar.github.io and this checkout is a clean `main`. Follow `.cursor/rules/scrum-board.mdc` for tickets, sub-issues and board columns.

1. List open issues labelled `bug` and `area:be` whose body contains "Found while: #320, by the daily check of failed URL reviews". Skip one that already has an open PR, or that you commented on with no new failed runs since.
2. For each bug, read its evidence (cause class, sites, probe: DNS, plain read hop chain, size, bot-check vendor, headless Chrome, last log lines), `functions/url-review-failures.js` and the review code it calls.
3. If the cause is the site's own state (a real 404 or 402, a host that does not resolve, a site that is down or refuses every client), comment on the bug with the evidence and why our code cannot fix it, and leave it open in Backlog.
4. If our code can fix it (read strategy, timeout, fallback, size, a misclassified cause), fix it on a new branch off `main`, one PR per cause class:
   - Keep the change to the review code and its tests. Add or update tests in `tests/unit/`; `npm ci` then `npm run test:review` must pass.
   - Add a row to `FIXES` in `functions/url-review-failures.js` with that cause, `at` set to the time you open the PR (UTC), the PR ref and a plain label, so the failed runs it covers are re-run.
   - Open the PR with the bug and #320 in the body, move the bug to Dev, and run `gh pr merge --squash --auto --delete-branch`. Wait with `gh pr checks --watch`. If a check fails, fix it and push; after two failed attempts, comment on the PR and the bug with what failed and leave both open.
   - Once merged, pull `main` and deploy the functions that load the changed code from the repo root, for example `npx -y firebase-tools deploy --only functions:reviewUrl,functions:reviewBrowser,functions:diagnoseReviewFailures,functions:rerunReviewFailures,functions:fileReviewFailureBugs`. Then close the bug with "Fixed in #<PR>." and set it to Done.
5. Log every other bug or slip you find as its own issue tied to #320, per the board rules.
6. Append a row for each bug you worked on to `/Users/Apple/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/u452212433/files/cursor-usage/work-log.csv` (`start_utc,end_utc,ticket,title,chat_id,notes`, chat_id `daily-fix-agent`).
7. End with a short summary: which bugs were fixed and deployed, which got a comment, and why.
EOF

log="$STATE/logs/$(date -u +%F).log"
echo "$(date -u +%FT%TZ) start" >>"$log"
perl -e 'alarm shift; exec @ARGV' 7200 cursor-agent -p --force --trust --workspace "$CLONE" --output-format text "$PROMPT" >>"$log" 2>&1 || echo "exit $?" >>"$log"
echo "$(date -u +%FT%TZ) end" >>"$log"
find "$STATE/logs" -name '20*.log' -mtime +90 -delete
