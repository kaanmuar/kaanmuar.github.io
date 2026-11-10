#!/bin/bash
# Every hour. The first run from 07:30 each day, after fileReviewFailureBugs (07:05) has filed the day's bugs, is the daily one:
# scripts/fix-review-failures.js takes the bugs the daily check of failed URL reviews files (#320) in a clean clone of main, settles what a
# script can, and starts a Cursor agent only for bugs our code may fix (#1982); and, ahead of it, scripts/review-rescue.js reviews from
# this Mac the failed reviews the cloud could not read (#3080). The other runs take only the rescues of askers promised a report within 48 hours
# (#3079), and do nothing when there are none.
#   scripts/fix-review-failures.sh install   installs the launchd job (re-run after changing this file)
#   scripts/fix-review-failures.sh           runs once now: the daily run if today's is due, else the promised rescues
#   scripts/fix-review-failures.sh daily     runs the daily run now
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
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$STATE/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/logs/launchd.log</string>
</dict>
</plist>
EOF
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$PLIST"
	echo "Installed $LABEL: hourly, the daily run from 07:30, logs in $STATE/logs"
	exit 0
fi

# A run killed hard leaves its lock behind; the alarms below end every run within 5 hours.
find "$STATE" -maxdepth 1 -name lock -mmin +320 -exec rmdir {} \; 2>/dev/null || true
mkdir "$STATE/lock" 2>/dev/null || exit 0
trap 'rmdir "$STATE/lock"' EXIT

[ -d "$CLONE/.git" ] || gh repo clone "$REPO" "$CLONE" -- -q
cd "$CLONE"
git fetch -q origin
git checkout -q -B main origin/main
git reset -q --hard origin/main
git clean -qfd

log="$STATE/logs/$(date -u +%F).log"
today="$(date +%F)"
daily=
if [ "${1:-}" = daily ] || { [ "$(date +%H%M)" -ge 0730 ] && [ "$(cat "$STATE/daily-done" 2>/dev/null)" != "$today" ]; }; then
	daily=1
fi
# The rescues the cloud queued for this Mac's home connection (#3080) need the functions' packages, installed again when their lock changes.
lock="$(shasum functions/package-lock.json | cut -c1-40)"
if [ ! -d functions/node_modules ] || [ "$lock" != "$(cat "$STATE/functions-lock" 2>/dev/null)" ]; then
	npm ci --prefix functions --omit=dev --no-audit --no-fund >>"$log" 2>&1 && echo "$lock" >"$STATE/functions-lock"
fi
if [ -z "$daily" ]; then
	out="$(perl -e 'alarm shift; exec @ARGV' 3300 node scripts/review-rescue.js --promised 2>&1)" || out="$out
promised rescue exit $?"
	[ -z "$out" ] || printf '%s promised rescues\n%s\n' "$(date -u +%FT%TZ)" "$out" >>"$log"
	exit 0
fi
echo "$(date -u +%FT%TZ) start" >>"$log"
echo "$today" >"$STATE/daily-done"
# The rescues first, promised ones at their head, so the fix script's hours never hold up a 48-hour promise.
perl -e 'alarm shift; exec @ARGV' 7200 node scripts/review-rescue.js >>"$log" 2>&1 || echo "rescue exit $?" >>"$log"
perl -e 'alarm shift; exec @ARGV' 10800 node scripts/fix-review-failures.js >>"$log" 2>&1 || echo "exit $?" >>"$log"
echo "$(date -u +%FT%TZ) end" >>"$log"
find "$STATE/logs" -name '20*.log' -mtime +90 -delete
