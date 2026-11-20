#!/bin/bash
# Serializes writers of the shared .git/ (fetch, worktree add) across chats and worktrees (#3835). The pattern is
# from max-sixty/worktrunk and raine/workmux (reference only, nothing copied).
#   scripts/git-lock.sh <lock-path> <command> [args...]    runs the command while holding the lock, exits with its status
# Uses flock(1) when installed (Linux CI). macOS ships none, so the fallback is an atomic mkdir lock directory
# <lock-path>.d holding the owner's pid. A lock is stale, and taken over, when its owner pid is gone or it is
# older than GIT_LOCK_STALE seconds (default 120). Waiting gives up after GIT_LOCK_WAIT seconds (default 60) with exit 75.
set -uo pipefail
lock=${1:?usage: scripts/git-lock.sh <lock-path> <command> [args...]}
shift
[ $# -gt 0 ] || {
	echo "git-lock: no command" >&2
	exit 64
}
stale=${GIT_LOCK_STALE:-120}
wait_for=${GIT_LOCK_WAIT:-60}

if [ -z "${GIT_LOCK_NO_FLOCK:-}" ] && command -v flock >/dev/null 2>&1; then
	exec flock -w "$wait_for" "$lock.flock" "$@"
fi

dir="$lock.d"
age() { # seconds since the lock directory last changed
	local m
	# GNU stat first: on Linux `stat -f` prints filesystem info and exits 0, so it must not run first.
	m=$(stat -c %Y "$dir" 2>/dev/null || stat -f %m "$dir" 2>/dev/null) || {
		echo 0
		return
	}
	case $m in '' | *[!0-9]*)
		echo 0
		return
		;;
	esac
	echo $(($(date +%s) - m))
}
held=
release() { [ -n "$held" ] && rm -rf "$dir"; }
trap release EXIT
trap 'exit 130' INT TERM

waited=0
until mkdir "$dir" 2>/dev/null; do
	owner=$(cat "$dir/pid" 2>/dev/null || true)
	if { [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; } || [ "$(age)" -ge "$stale" ]; then
		echo "git-lock: taking over a stale lock ${owner:+(pid $owner)}" >&2
		rm -rf "$dir"
		continue
	fi
	if [ "$waited" -ge "$wait_for" ]; then
		echo "git-lock: still held by pid ${owner:-?} after ${wait_for}s: $dir" >&2
		exit 75
	fi
	sleep 1
	waited=$((waited + 1))
done
held=1
echo $$ >"$dir/pid"
"$@"
