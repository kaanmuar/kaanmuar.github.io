#!/bin/bash
# Daily disk hygiene for this Mac (#4515): prune merged/gone git worktrees, clear regenerating
# caches, and notify when free space or Cursor state.vscdb is unhealthy. Never quits Cursor,
# never closes agent chats, never touches state.vscdb while Cursor is running.
#
#   scripts/disk-hygiene.sh              run once now
#   scripts/disk-hygiene.sh --dry-run    print actions only
#   scripts/disk-hygiene.sh install      launchd job daily 06:30 (local)
#   scripts/disk-hygiene.sh uninstall    remove the launchd job
#   scripts/disk-hygiene.sh status       free space + last log line
#   scripts/disk-hygiene.sh vacuum-state when Cursor is quit: archive bloated state.vscdb
#
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LABEL=com.kaanmuar.diskhygiene
STATE="$HOME/Library/Application Support/QALab/disk-hygiene"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
# Prefer the main checkout for worktree prune (worktrees live under it).
REPO_ROOT="${DISK_HYGIENE_REPO:-$HOME/Documents/GitHub/kaanmuar.github.io}"
REPO=kaanmuar/kaanmuar.github.io
# Alert when Data volume free GiB falls below this.
MIN_FREE_GB="${DISK_HYGIENE_MIN_FREE_GB:-25}"
# Notify (do not auto-delete) when state.vscdb exceeds this GiB.
STATE_WARN_GB="${DISK_HYGIENE_STATE_WARN_GB:-8}"
# Protected worktree dir names (never auto-remove).
PROTECT='_media shots status media-1898 review-1977 sim-2519 deploy-jarvis'

mkdir -p "$STATE/logs"
DRY=0
CMD=run
for arg in "$@"; do
	case "$arg" in
	--dry-run) DRY=1 ;;
	install | uninstall | status | vacuum-state | run) CMD=$arg ;;
	-h | --help)
		sed -n '2,14p' "$0" | tr -d '#'
		exit 0
		;;
	esac
done

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$STATE/logs/$(date -u +%F).log"; }
notify() {
	local title=$1 body=$2
	osascript -e "display notification $(printf %q "$body") with title $(printf %q "$title")" 2>/dev/null || true
}
free_gb() { df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2{print $4+0}'; }
cursor_running() {
	# Main binary args end with .../Cursor.app/Contents/MacOS/Cursor (helpers have "Cursor Helper").
	ps -axo args= 2>/dev/null | grep -F '/Applications/Cursor.app/Contents/MacOS/Cursor' | grep -v 'Cursor Helper' | grep -q .
}

rm_rf() {
	local p=$1
	[ -e "$p" ] || return 0
	if [ "$DRY" = 1 ]; then
		log "dry-run rm -rf $p ($(du -sh "$p" 2>/dev/null | awk '{print $1}'))"
		return 0
	fi
	rm -rf "$p"
	log "removed $p"
}

# --- install / uninstall / status ------------------------------------------------

if [ "$CMD" = install ]; then
	# Always run the copied script so launchd keeps working before/after merge; re-run install after edits.
	cp "$0" "$STATE/run.sh"
	chmod +x "$STATE/run.sh"
	RUN="$STATE/run.sh"
	cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUN</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>6</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>StandardOutPath</key><string>$STATE/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/logs/launchd.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
    <key>DISK_HYGIENE_REPO</key><string>$REPO_ROOT</string>
  </dict>
</dict>
</plist>
EOF
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$PLIST"
	echo "Installed $LABEL: daily 06:30, logs in $STATE/logs"
	echo "Run now: $RUN"
	exit 0
fi

if [ "$CMD" = uninstall ]; then
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	rm -f "$PLIST"
	echo "Uninstalled $LABEL"
	exit 0
fi

if [ "$CMD" = status ]; then
	echo "Free: $(free_gb) GB on Data"
	echo "Launchd: $(launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | head -1 || echo not-loaded)"
	vscdb="$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
	[ -f "$vscdb" ] && echo "state.vscdb: $(du -sh "$vscdb" | awk '{print $1}')"
	[ -d "$REPO_ROOT/.worktrees" ] && echo "worktrees: $(find "$REPO_ROOT/.worktrees" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
	tail -n 5 "$STATE/logs/$(ls -1t "$STATE/logs" 2>/dev/null | head -1)" 2>/dev/null || echo "(no logs yet)"
	exit 0
fi

if [ "$CMD" = vacuum-state ]; then
	vscdb="$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
	if cursor_running; then
		echo "Refuse: Cursor is running. Quit Cursor, then re-run vacuum-state." >&2
		exit 1
	fi
	[ -f "$vscdb" ] || {
		echo "No state.vscdb"
		exit 0
	}
	sz=$(du -sm "$vscdb" | awk '{print $1}')
	if [ "$sz" -lt $((STATE_WARN_GB * 1024)) ]; then
		echo "state.vscdb is ${sz}M (< ${STATE_WARN_GB}G); nothing to do"
		exit 0
	fi
	free=$(free_gb)
	# Need headroom to move the file aside (archive stays until you delete it).
	need=$((sz / 1024 + 5))
	if [ "$free" -lt "$need" ]; then
		echo "Refuse: only ${free}G free, need ~${need}G to archive safely." >&2
		exit 1
	fi
	arch="$vscdb.archived-$(date -u +%Y%m%dT%H%M%SZ)"
	if [ "$DRY" = 1 ]; then
		echo "dry-run: mv state.vscdb -> $arch (${sz}M)"
		exit 0
	fi
	mv "$vscdb" "$arch"
	rm -f "${vscdb}-wal" "${vscdb}-shm" 2>/dev/null || true
	log "archived state.vscdb (${sz}M) -> $arch"
	notify "Disk hygiene" "Archived Cursor state.vscdb (${sz}M). Cursor will recreate a fresh one on next launch. Delete the .archived-* file when sure."
	echo "Archived to $arch"
	exit 0
fi

# --- main run --------------------------------------------------------------------

# Lock so overlapping launchd/manual runs do not race.
find "$STATE" -maxdepth 1 -name lock -mmin +120 -exec rmdir {} \; 2>/dev/null || true
mkdir "$STATE/lock" 2>/dev/null || {
	log "skip: another run holds the lock"
	exit 0
}
trap 'rmdir "$STATE/lock" 2>/dev/null || true' EXIT

before=$(free_gb)
log "start free=${before}G dry=$DRY repo=$REPO_ROOT"

# 1) Alert on low disk
if [ "${before:-0}" -lt "$MIN_FREE_GB" ]; then
	notify "Disk low" "Only ${before} GB free on Data (want ≥ ${MIN_FREE_GB} GB). Hygiene run started."
	log "alert: free ${before}G < ${MIN_FREE_GB}G"
fi

# 2) Prune merged / gone worktrees
prune_worktrees() {
	[ -d "$REPO_ROOT/.git" ] || {
		log "skip worktrees: no repo at $REPO_ROOT"
		return 0
	}
	cd "$REPO_ROOT"
	git fetch -q origin main 2>/dev/null || git fetch -q origin 2>/dev/null || true
	local live open_refs name path branch tip reason
	live=$(ps aux 2>/dev/null | grep 'extension-host' | grep -v grep | sed 's/.*extension-host //' | awk '{print $1}' | sort -u || true)
	open_refs=$(gh pr list --repo "$REPO" --state open --limit 200 --json headRefName --jq '.[].headRefName' 2>/dev/null || true)
	local removed=0 kept=0
	for path in .worktrees/*/; do
		[ -d "$path" ] || continue
		name=$(basename "$path")
		reason=
		echo "$PROTECT" | grep -qw "$name" && reason=protected
		echo "$live" | grep -qi "$name" && reason="${reason:-live-agent}"
		branch=$(cd "$path" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)
		if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
			echo "$open_refs" | grep -qix "$branch" && reason="${reason:-open-pr}"
			# Dir slug feat-4505-… vs branch feat/4505-…
			slug=$(echo "$branch" | tr '/' '-')
			echo "$open_refs" | tr '/' '-' | grep -qix "$slug" && reason="${reason:-open-pr-slug}"
			echo "$open_refs" | tr '/' '-' | grep -qix "$name" && reason="${reason:-open-pr-dir}"
		fi
		if [ -n "$reason" ]; then
			kept=$((kept + 1))
			continue
		fi
		# Drop only if tip is on origin/main OR remote branch is gone.
		# Never treat "no-remote" alone as enough when gh failed (empty open_refs) — require fetch ok.
		tip=$(cd "$path" 2>/dev/null && git rev-parse HEAD 2>/dev/null || true)
		drop=
		if [ -n "$tip" ] && git merge-base --is-ancestor "$tip" origin/main 2>/dev/null; then
			drop=merged
		elif [ -n "$branch" ] && [ "$branch" != "HEAD" ] && [ -n "$open_refs" ] \
			&& ! git ls-remote --heads origin "$branch" 2>/dev/null | grep -q .; then
			drop=no-remote
		fi
		if [ -z "$drop" ]; then
			kept=$((kept + 1))
			continue
		fi
		if [ "$DRY" = 1 ]; then
			log "dry-run worktree remove $name ($drop, $(du -sh "$path" 2>/dev/null | awk '{print $1}'))"
			removed=$((removed + 1))
			continue
		fi
		if git worktree remove --force "$path" 2>/dev/null; then
			[ -n "$branch" ] && [ "$branch" != "HEAD" ] && git branch -D "$branch" 2>/dev/null || true
			log "worktree removed $name ($drop)"
			removed=$((removed + 1))
		else
			chmod -R u+w "$path" 2>/dev/null || true
			rm -rf "$path"
			git worktree prune 2>/dev/null || true
			[ -n "$branch" ] && [ "$branch" != "HEAD" ] && git branch -D "$branch" 2>/dev/null || true
			log "worktree force-rm $name ($drop)"
			removed=$((removed + 1))
		fi
	done
	git worktree prune 2>/dev/null || true
	log "worktrees removed=$removed kept=$kept"
}
prune_worktrees

# 3) Regenerating caches (safe while Cursor runs)
rm_rf "$HOME/Library/Application Support/com.apple.wallpaper/aerials/videos"
rm_rf "$HOME/.gradle/caches"
rm_rf "$HOME/Library/Caches/QALab"
rm_rf "$HOME/Library/Caches/Cypress"
rm_rf "$HOME/Library/Caches/ms-playwright"
rm_rf "$HOME/Library/Caches/Google"
rm_rf "$HOME/Library/Caches/com.todesktop.230313mzl4w4u92.ShipIt"
rm_rf "$HOME/Library/Caches/Homebrew"
rm_rf "$HOME/Library/Caches/node-gyp"
rm_rf "$HOME/Library/Caches/review-voices"
rm_rf "$HOME/Library/Application Support/QALab/fix-review-failures"
rm_rf "$HOME/Library/Application Support/QALab/url-review-failures"
# Cursor logs: keep newest day folder only
if [ -d "$HOME/Library/Application Support/Cursor/logs" ]; then
	# shellcheck disable=SC2012
	ls -1t "$HOME/Library/Application Support/Cursor/logs" 2>/dev/null | tail -n +2 | while read -r d; do
		rm_rf "$HOME/Library/Application Support/Cursor/logs/$d"
	done
fi
# Cursor snapshots older than 2 days
if [ -d "$HOME/Library/Application Support/Cursor/snapshots" ]; then
	find "$HOME/Library/Application Support/Cursor/snapshots/codebases" "$HOME/Library/Application Support/Cursor/snapshots/roots" \
		-mindepth 1 -maxdepth 1 -type d -mtime +2 2>/dev/null | while read -r d; do
		rm_rf "$d"
	done
fi
# iOS simulators only when none booted
booted=$(xcrun simctl list devices 2>/dev/null | grep -c Booted || true)
if [ "${booted:-0}" = 0 ]; then
	if [ "$DRY" = 1 ]; then
		log "dry-run simctl delete unavailable + clear Devices ($(du -sh "$HOME/Library/Developer/CoreSimulator/Devices" 2>/dev/null | awk '{print $1}'))"
	else
		xcrun simctl delete unavailable 2>/dev/null || true
		rm -rf "$HOME/Library/Developer/CoreSimulator/Caches" 2>/dev/null || true
		# Only clear device data dirs that are not in use; full wipe when none booted.
		rm -rf "$HOME/Library/Developer/CoreSimulator/Devices"/* 2>/dev/null || true
		log "cleared CoreSimulator devices (none booted)"
	fi
else
	log "skip CoreSimulator: $booted booted"
fi

# 4) state.vscdb: never auto-archive from the daily job (detection must not false-negative).
#    Notify when large; vacuum-state is manual / explicit only.
vscdb="$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
if [ -f "$vscdb" ]; then
	vgb=$(du -sm "$vscdb" | awk '{printf "%d", $1/1024}')
	if [ "$vgb" -ge "$STATE_WARN_GB" ]; then
		log "warn: state.vscdb ~${vgb}G (Cursor running=$(cursor_running && echo yes || echo no)) — run vacuum-state only after a full Cursor quit"
		# At most one notification per calendar day
		stamp="$STATE/state-vscdb-warned"
		today=$(date +%F)
		if [ "$(cat "$stamp" 2>/dev/null)" != "$today" ]; then
			notify "Cursor state.vscdb large" "~${vgb} GB of chat history bloat. When Cursor is fully quit: scripts/disk-hygiene.sh vacuum-state"
			[ "$DRY" = 1 ] || echo "$today" >"$stamp"
		fi
	fi
fi

after=$(free_gb)
log "end free=${after}G (was ${before}G)"
# Keep 90 days of logs
find "$STATE/logs" -name '20*.log' -mtime +90 -delete 2>/dev/null || true
find "$STATE/logs" -name 'launchd.log' -size +50M -exec truncate -s 0 {} \; 2>/dev/null || true

if [ "$after" -gt "$before" ]; then
	notify "Disk hygiene" "Freed ~$((after - before)) GB. Now ${after} GB free."
elif [ "$after" -lt "$MIN_FREE_GB" ]; then
	notify "Disk still low" "Still only ${after} GB free after hygiene."
fi
