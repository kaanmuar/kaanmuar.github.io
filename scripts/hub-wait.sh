#!/usr/bin/env bash
# Waits for main's social hub before a queue job posts (#2242).
#   scripts/hub-wait.sh [minutes]   # default 15; needs GH_TOKEN and GITHUB_REPOSITORY
# Pull requests leave the generated hub files to the bots, so for a few minutes after a hub merge Pages (pages.yml)
# is deploying the hub it built and Rebuild stale generated files (regen-generated.yml) is committing it to main.
# scripts/hub-gate.js holds a post whose page is not live yet, and takes its day from assets/social/feed*.json, so a
# queue run in that window would skip the new posts until its next slot. This waits while either workflow has a run on
# main queued or in progress, then takes the hub feeds from the tip of main. Past the limit it warns and lets the gate
# decide.
set -euo pipefail

main() {
	local minutes=${1:-15} deadline busy wf status n
	deadline=$(($(date +%s) + minutes * 60))
	while :; do
		busy=""
		for wf in regen-generated.yml pages.yml; do
			for status in queued in_progress; do
				if ! n=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$wf/runs?branch=main&status=$status&per_page=1" -q .total_count); then
					echo "::warning::Could not list the $wf runs, so this posts without waiting for the hub rebuild."
					break 3
				fi
				[ "$n" = 0 ] || busy="$busy $wf"
			done
		done
		if [ -z "$busy" ]; then
			echo "No hub rebuild or Pages deploy is running on main."
			break
		fi
		if [ "$(date +%s)" -ge "$deadline" ]; then
			echo "::warning::Still running after $minutes minutes:$busy. Posting now; the hub gate holds posts whose page is not live."
			break
		fi
		echo "Waiting for$busy on main"
		sleep 20
	done
	if git fetch -q --depth=1 origin main && git restore --source=FETCH_HEAD --worktree -- 'assets/social/feed*.json'; then
		echo "Hub feeds taken from main $(git rev-parse --short FETCH_HEAD)."
	else
		echo "::warning::Could not take the hub feeds from main; the gate reads the ones this job checked out."
	fi
}

main "$@"
