#!/bin/bash
# One live chat per ticket worktree (#2244). A lock in the worktree's git dir (.git/worktrees/<name>/chat-lock)
# names the chat working there and when it was last seen; `git worktree remove` deletes it with the worktree.
#   scripts/worktree-lock.sh claim <dir> [--take]   claim <dir> for this chat, or refuse and name the live holder
#   scripts/worktree-lock.sh hook                   pre-commit and pre-push: the same check for the current worktree
#   scripts/worktree-lock.sh install                adds the hook line to the shared pre-commit and pre-push hooks
# The chat is $CURSOR_CONVERSATION_ID. The pre-flight hook refreshes its heartbeat on every turn and tool call, and
# a heartbeat older than WORKTREE_LOCK_STALE seconds (30 minutes) is dead. Taking a worktree over records the
# previous holder, whose next pre-flight turn tells it to stop. Without a chat id (a terminal, an automation)
# nothing is claimed or refused: a live holder only gets a warning.
set -euo pipefail
STALE=${WORKTREE_LOCK_STALE:-1800}
HOOK_LINE='[ ! -x scripts/worktree-lock.sh ] || scripts/worktree-lock.sh hook </dev/null || exit 1  # chat lock (#2244)'

claim() {
	local dir=$1 take=$2 me=${CURSOR_CONVERSATION_ID:-} gitdir lock now holder='' beat=0 previous='' age seen branch
	gitdir=$(git -C "$dir" rev-parse --absolute-git-dir)
	[ "$gitdir" != "$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir)" ] || return 0
	lock=$gitdir/chat-lock
	now=$(date +%s)
	if [ -f "$lock" ]; then
		holder=$(sed -n 's/^chat=//p' "$lock")
		beat=$(sed -n 's/^heartbeat=//p' "$lock")
		previous=$(sed -n 's/^previous=//p' "$lock")
	fi
	age=$((now - ${beat:-0}))
	if [ -n "$holder" ] && [ "$holder" != "$me" ] && [ "$age" -lt "$STALE" ]; then
		seen="chat $holder (last seen $((age / 60)) min ago)"
		if [ -z "$me" ]; then
			echo "worktree-lock: $dir is held by $seen; going ahead without a chat id." >&2
			return 0
		fi
		if [ "$take" != 1 ]; then
			branch=$(git -C "$dir" branch --show-current)
			echo "worktree-lock: $dir is held by $seen." >&2
			echo "  Leave it to that chat, or take it over: scripts/ticket-worktree.sh ${branch:-<branch>} --take" >&2
			return 1
		fi
		echo "worktree-lock: took $dir from $seen; its next turn tells it to stop." >&2
	elif [ -n "$holder" ] && [ "$holder" != "$me" ] && [ -n "$me" ]; then
		echo "worktree-lock: chat $holder last touched $dir $((age / 60)) min ago; its lock lapsed, so this chat takes it." >&2
	fi
	[ -n "$me" ] || return 0
	[ -z "$holder" ] || [ "$holder" = "$me" ] || previous=$holder
	{
		printf 'chat=%s\nheartbeat=%s\n' "$me" "$now"
		[ -z "$previous" ] || printf 'previous=%s\n' "$previous"
	} >"$lock"
}

install() {
	local hooks f
	hooks=$(git rev-parse --path-format=absolute --git-path hooks)
	mkdir -p "$hooks"
	for f in "$hooks/pre-commit" "$hooks/pre-push"; do
		[ -f "$f" ] || printf '#!/bin/sh\n' >"$f"
		grep -qF 'worktree-lock.sh hook' "$f" && continue
		{
			head -n 1 "$f"
			echo "$HOOK_LINE"
			tail -n +2 "$f"
		} >"$f.tmp"
		cat "$f.tmp" >"$f" && rm "$f.tmp"
		chmod +x "$f"
	done
}

case ${1:-} in
claim) claim "${2:?usage: scripts/worktree-lock.sh claim <dir> [--take]}" "$([ "${3:-}" = --take ] && echo 1 || echo 0)" ;;
hook) claim "$(git rev-parse --show-toplevel)" 0 ;;
install) install ;;
*) sed -n '2,10s/^# \{0,1\}//p' "$0" >&2 && exit 2 ;;
esac
