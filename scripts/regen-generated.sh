#!/usr/bin/env bash
# Rebuilds every generated file whose builder's --check says it is stale, then checks them all again.
#   scripts/regen-generated.sh          # rebuild what is stale in this checkout
#   scripts/regen-generated.sh --push   # in the Regenerate workflow: rebuild on the tip of main, commit, push
# Two PRs that each passed CI can together leave generated pages stale on main (#968), so the workflow runs this on
# every push to main. A builder runs only when its check fails, so dates such as the social hub's as-of day do not churn.
# Order matters: build-llms-full.py also writes the review language pages. A builder not on this branch yet is skipped.
# The social hub rebuilds offline, from committed sources only; the daily Live Reports job pulls YouTube and the admin edits.
# A push that loses the race is not rebased: the rebuild is redone on the new tip, so generated files never conflict.
# The body is one function so bash has read all of it before git reset rewrites this file.
set -euo pipefail

main() {
	local builders=(
		scripts/build-catalog-suites.js
		scripts/build-llms-full.py
		scripts/build-review-langs.py
		scripts/build-legal-html.js
		scripts/build-social-hub.js
	)
	local rebuilt=()
	export PYTHONDONTWRITEBYTECODE=1

	check() {
		case "$1" in
		*.py) python3 "$1" --check ;;
		*) node "$1" --check ;;
		esac
	}

	build() {
		case "$1" in
		*.py) python3 "$1" ;;
		scripts/build-social-hub.js)
			# New thumbnails need sharp, which is in package-lock.json but not installed on a bare runner.
			if [ -n "${GITHUB_ACTIONS:-}" ] && ! node -e 'require("sharp")' 2>/dev/null; then
				local version
				version=$(node -p "(require('./package-lock.json').packages['node_modules/sharp'] || {}).version || 'latest'")
				npm install -s --no-save --prefix "$RUNNER_TEMP/sharp" "sharp@$version" >/dev/null
				export NODE_PATH="$RUNNER_TEMP/sharp/node_modules"
			fi
			node "$1" --offline
			;;
		*) node "$1" ;;
		esac
	}

	regen() {
		local file out line stale=()
		rebuilt=()
		for file in "${builders[@]}"; do
			[ -f "$file" ] || {
				echo "skip $file (not on this branch)"
				continue
			}
			if out=$(check "$file" 2>&1); then
				echo "ok   $file"
				continue
			fi
			while IFS= read -r line; do echo "     $line"; done <<<"$out"
			echo "build $file"
			build "$file"
			rebuilt+=("$file")
		done
		for file in ${rebuilt[@]+"${rebuilt[@]}"}; do
			check "$file" >/dev/null 2>&1 || stale+=("$file")
		done
		if [ ${#stale[@]} -gt 0 ]; then
			echo "::error::Still stale after a rebuild: ${stale[*]}"
			return 1
		fi
	}

	if [ "${1:-}" != "--push" ]; then
		regen
		[ ${#rebuilt[@]} -gt 0 ] && echo "Rebuilt: ${rebuilt[*]}" || echo "Every generated file matches its builder."
		return 0
	fi

	git config user.name "github-actions[bot]"
	git config user.email "41898299+github-actions[bot]@users.noreply.github.com"
	local attempt
	for attempt in 1 2 3; do
		git fetch -q --depth=1 origin main
		git reset -q --hard FETCH_HEAD
		regen
		if [ -z "$(git status --porcelain)" ]; then
			echo "Generated files on main $(git rev-parse --short HEAD) match their builders."
			return 0
		fi
		git add -A
		git commit -q -m "Rebuild generated pages left stale on main [regen]" \
			-m "Two merges left these builders' output stale; rebuilt on $(git rev-parse --short HEAD) by scripts/regen-generated.sh:
$(printf -- '- %s\n' "${rebuilt[@]}")"
		if git push -q origin HEAD:main; then
			echo "Pushed $(git rev-parse --short HEAD): ${rebuilt[*]}"
			[ -n "${GITHUB_OUTPUT:-}" ] && echo "pushed=1" >>"$GITHUB_OUTPUT"
			return 0
		fi
		echo "main moved; rebuilding on the new tip ($attempt/3)"
		sleep $((attempt * 5))
	done
	echo "::error::main kept moving; the stale files were not pushed. The next push to main runs this again."
	return 1
}

main "$@"
