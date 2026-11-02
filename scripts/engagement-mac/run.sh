#!/bin/bash
# The Mac browser agent for Jarvis > Engagement (#1991), run by launchd every 5 minutes from its own clone of main.
#   run.sh install          installs the launchd job (re-run after changing this file)
#   run.sh uninstall        removes it
#   run.sh                  one pass now (what launchd runs)
#   run.sh login <network>  opens that network's sign-in in the agent's Chrome, on screen (x, linkedin, facebook,
#                           instagram, threads, tiktok); Sign in on the Mac in Jarvis does the same from the phone
#   run.sh probe <network> [query]  reads one search and prints it, without Firestore
# State, the Chrome profile and logs: ~/Library/Application Support/QALab/engagement-mac
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LABEL=com.kaanmuar.engagementmac
STATE="$HOME/Library/Application Support/QALab/engagement-mac"
CLONE="$STATE/repo"
DEPS="$STATE/deps"
export ENGAGEMENT_MAC_DEPS="$DEPS"
mkdir -p "$STATE/logs"
log="$STATE/logs/$(date -u +%F).log"

if [ "${1:-}" = install ]; then
	cp "$0" "$STATE/run.sh"
	chmod +x "$STATE/run.sh"
	cat >"$HOME/Library/LaunchAgents/$LABEL.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$STATE/run.sh</string></array>
  <key>StartInterval</key><integer>300</integer><key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$STATE/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/logs/launchd.log</string>
</dict>
</plist>
EOF
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist"
	echo "Installed $LABEL: a pass every 5 minutes; logs in $STATE/logs. Next: press Sign in on the Mac in Jarvis > Engagement > Accounts."
	exit 0
fi
if [ "${1:-}" = uninstall ]; then
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
	echo "Removed $LABEL. The Chrome profile stays in $STATE/chrome."
	exit 0
fi

# Main, at most an hour old; its functions modules for Firestore, and playwright-core to drive Chrome.
if [ ! -f "$CLONE/scripts/engagement-mac/agent.js" ] || [ -n "$(find "$CLONE/.git/FETCH_HEAD" -mmin +60 2>/dev/null)" ]; then
	[ -d "$CLONE/.git" ] || gh repo clone kaanmuar/kaanmuar.github.io "$CLONE" -- -q --depth 50 >>"$log" 2>&1
	{ git -C "$CLONE" fetch -q origin main && git -C "$CLONE" reset -q --hard origin/main; } >>"$log" 2>&1 || true
fi
[ -d "$CLONE/functions/node_modules/@google-cloud/firestore" ] || npm --prefix "$CLONE/functions" ci --silent >>"$log" 2>&1
want=$(node -p "require('$CLONE/package.json').devDependencies.playwright || require('$CLONE/package.json').dependencies.playwright" 2>/dev/null | tr -d '^~')
[ -d "$DEPS/node_modules/playwright-core" ] && [ "$(node -p "require('$DEPS/node_modules/playwright-core/package.json').version")" = "$want" ] ||
	npm --prefix "$DEPS" i --silent --no-audit --no-fund "playwright-core@$want" >>"$log" 2>&1

case "${1:-}" in
login) node "$CLONE/scripts/engagement-mac/agent.js" --state "$STATE" --login "${2:?network}" 2>&1 | tee -a "$log" ;;
probe) node "$CLONE/scripts/engagement-mac/agent.js" --state "$STATE" --probe "${2:?network}" "${3:-}" ;;
*) node "$CLONE/scripts/engagement-mac/agent.js" --state "$STATE" >>"$log" 2>&1 || echo "$(date -u +%FT%TZ) agent exit $?" >>"$log" ;;
esac
find "$STATE/logs" -name '20*.log' -mtime +30 -delete 2>/dev/null || true
