#!/bin/bash
# Every day at 07:30, after fileReviewFailureBugs (07:05) has filed the day's bugs, scripts/fix-review-failures.js takes the bugs the daily
# check of failed URL reviews files (#320) in a clean clone of main: it settles what a script can, and starts a Cursor agent only for
# bugs our code may fix (#1982).
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
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$STATE/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/logs/launchd.log</string>
</dict>
</plist>
EOF
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$PLIST"
	echo "Installed $LABEL: daily at 07:30, logs in $STATE/logs"
	exit 0
fi

# A run killed hard leaves its lock behind; the alarm below ends every run within 3 hours.
find "$STATE" -maxdepth 1 -name lock -mmin +200 -exec rmdir {} \; 2>/dev/null || true
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

log="$STATE/logs/$(date -u +%F).log"
echo "$(date -u +%FT%TZ) start" >>"$log"
perl -e 'alarm shift; exec @ARGV' 10800 node scripts/fix-review-failures.js >>"$log" 2>&1 || echo "exit $?" >>"$log"
echo "$(date -u +%FT%TZ) end" >>"$log"
find "$STATE/logs" -name '20*.log' -mtime +90 -delete
