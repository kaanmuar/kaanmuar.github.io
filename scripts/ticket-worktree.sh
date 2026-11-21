#!/bin/bash
# Gives a ticket's branch its own working tree under .worktrees/, so chats running at once never share a checkout.
#   scripts/ticket-worktree.sh <branch> [--take]    e.g. fix/731-review-lang; prints the path to work in
# A branch that already has a worktree gets that path back. A new branch starts from origin/main.
# The worktree is locked to this chat (scripts/worktree-lock.sh, #2244): one another live chat holds is refused
# and its holder named; --take takes it over. A new worktree also warns, on stderr, about open PRs and other worktrees
# that already name the ticket or touch the files its issue names (scripts/open-work.js, #2969).
# Writes to the shared .git/ (fetch, worktree add) run under scripts/git-lock.sh (#3835): flock(1) where installed,
# else a mkdir lock with a stale timeout (macOS ships no flock). Dirty-tree safeguards, all warnings on stderr: a reused
# worktree with uncommitted changes, and a dirty main checkout (read-only for chats).
set -euo pipefail
take=
for arg; do
	case $arg in
	--take) take=--take ;;
	*) branch=$arg ;;
	esac
done
branch=${branch:?usage: scripts/ticket-worktree.sh <branch> [--take]}
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
lock=$(cd "$(dirname "$0")" && pwd)/worktree-lock.sh
gitlock=$(cd "$(dirname "$0")" && pwd)/git-lock.sh
gitcommon=$(git rev-parse --path-format=absolute --git-common-dir)
warn_dirty() { # <dir> <what>
	local n
	n=$(git -C "$1" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
	[ "${n:-0}" -eq 0 ] || echo "warning: $2 has $n uncommitted change(s); do not switch, stash or reset it ($1)" >&2
}
"$lock" install

# Root node_modules is only worth sharing when the review/hub suite can resolve postcss and
# css-select. An empty or stale main/node_modules still passes -e and would poison every new
# worktree with ~39 "Cannot find module" failures while CI stays green via NODE_PATH (#4056).
root_modules_usable() {
	[ -f "$1/node_modules/postcss/package.json" ] && [ -f "$1/node_modules/css-select/package.json" ]
}
# Drop a symlink (or leave a real install alone) when it cannot resolve those packages.
drop_unusable_root_modules() { # <worktree>
	local wt=$1
	if [ -L "$wt/node_modules" ] && ! root_modules_usable "$wt"; then
		rm -f "$wt/node_modules"
		echo "warning: removed broken node_modules symlink (main install lacks postcss/css-select). Run: npm ci --ignore-scripts --no-audit --no-fund (#4056)" >&2
	fi
}
link_shared() { # <worktree>
	local wt=$1 deps
	# functions/.env is gitignored; without it a deploy from the worktree ships every function without its keys (#1739).
	for deps in node_modules functions/node_modules functions/.env functions/.secret.local; do
		if [ "$deps" = "node_modules" ]; then
			if root_modules_usable "$main"; then
				[ ! -e "$wt/node_modules" ] && ln -s "$main/node_modules" "$wt/node_modules"
			elif [ -e "$main/node_modules" ] && [ ! -e "$wt/node_modules" ]; then
				echo "warning: main node_modules lacks postcss/css-select; not linking. Run npm ci in the worktree, or npm run test:review (installs the CI CSS deps) (#4056)" >&2
			fi
			continue
		fi
		[ -e "$main/$deps" ] && [ ! -e "$wt/$deps" ] && ln -s "$main/$deps" "$wt/$deps"
	done
	drop_unusable_root_modules "$wt"
}

existing=$(git -C "$main" worktree list --porcelain | awk -v ref="refs/heads/$branch" '$1 == "worktree" { dir = $2 } $1 == "branch" && $2 == ref { print dir }')
if [ -n "$existing" ]; then
	"$lock" claim "$existing" $take
	warn_dirty "$existing" "the reused worktree"
	drop_unusable_root_modules "$existing"
	echo "$existing"
	exit 0
fi

dir="$main/.worktrees/${branch//\//-}"
warn_dirty "$main" "the main checkout"
if [ -e "$dir" ]; then
	echo "refusing: $dir exists but is not a worktree of branch $branch; move it aside first" >&2
	exit 1
fi
"$gitlock" "$gitcommon/ticket-worktree.lock" git -C "$main" fetch -q origin
if git -C "$main" show-ref -q --verify "refs/heads/$branch"; then
	"$gitlock" "$gitcommon/ticket-worktree.lock" git -C "$main" worktree add -q "$dir" "$branch"
elif git -C "$main" show-ref -q --verify "refs/remotes/origin/$branch"; then
	"$gitlock" "$gitcommon/ticket-worktree.lock" git -C "$main" worktree add -q --track -b "$branch" "$dir" "origin/$branch"
else
	"$gitlock" "$gitcommon/ticket-worktree.lock" git -C "$main" worktree add -q --no-track -b "$branch" "$dir" origin/main
fi
"$lock" claim "$dir"

# Open PRs and worktrees that already name the ticket or touch the files its issue names (#2969): a warning only.
n=$(sed -nE 's#^[^/]+/([0-9]+)(-.*)?$#\1#p' <<<"$branch")
[ -z "$n" ] || node "$(dirname "$0")/open-work.js" ticket "$n" --branch "$branch" </dev/null >&2 || true

link_shared "$dir"
echo "$dir"
