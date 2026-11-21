#!/usr/bin/env bash
# Runs the unit suite. When postcss/css-select are missing (empty worktree node_modules, or a
# symlink to an incomplete main install), installs the same critical-CSS packages the CI review
# job puts on NODE_PATH so local `npm run test:review` matches that gate (#4056).
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
if ! node -e 'require("postcss"); require("css-select")' 2>/dev/null; then
	cache="${RUNNER_TEMP:-$root/.tmp}/critical-css-unit"
	mkdir -p "$cache"
	read -ra deps <<<"$(node scripts/build-critical-css.js --deps)"
	echo "unit suite: installing ${deps[*]} into $cache for NODE_PATH (#4056)" >&2
	npm install -s --no-save --prefix "$cache" "${deps[@]}"
	export NODE_PATH="$cache/node_modules${NODE_PATH:+:$NODE_PATH}"
fi
exec node --disable-warning=ExperimentalWarning --test "tests/unit/*.test.js"
