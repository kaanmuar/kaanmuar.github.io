#!/bin/bash
# Gives a ticket's branch its own working tree under .worktrees/, so chats running at once never share a checkout.
#   scripts/ticket-worktree.sh <branch>    e.g. fix/731-review-lang; prints the path to work in
# A branch that already has a worktree gets that path back. A new branch starts from origin/main.
set -euo pipefail
branch=${1:?usage: scripts/ticket-worktree.sh <branch>}
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

existing=$(git -C "$main" worktree list --porcelain | awk -v ref="refs/heads/$branch" '$1 == "worktree" { dir = $2 } $1 == "branch" && $2 == ref { print dir }')
if [ -n "$existing" ]; then
	echo "$existing"
	exit 0
fi

dir="$main/.worktrees/${branch//\//-}"
git -C "$main" fetch -q origin
if git -C "$main" show-ref -q --verify "refs/heads/$branch"; then
	git -C "$main" worktree add -q "$dir" "$branch"
elif git -C "$main" show-ref -q --verify "refs/remotes/origin/$branch"; then
	git -C "$main" worktree add -q --track -b "$branch" "$dir" "origin/$branch"
else
	git -C "$main" worktree add -q --no-track -b "$branch" "$dir" origin/main
fi

# functions/.env is gitignored; without it a deploy from the worktree ships every function without its keys (#1739).
for deps in node_modules functions/node_modules functions/.env; do
	[ -e "$main/$deps" ] && [ ! -e "$dir/$deps" ] && ln -s "$main/$deps" "$dir/$deps"
done
echo "$dir"
