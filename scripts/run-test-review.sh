#!/usr/bin/env bash
# Runs the unit suite. When postcss/css-select are missing (empty worktree node_modules, or a
# symlink to an incomplete main install), installs the same critical-CSS packages the CI review
# job puts on NODE_PATH so local `npm run test:review` matches that gate (#4056).
# Same for masto / @atproto/lex-password-session / @atproto/lex-client used by open-social-queue
# (#3841): url-review-unit does not run npm ci on the repo.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
cache="${RUNNER_TEMP:-$root/.tmp}/critical-css-unit"
mkdir -p "$cache"
if ! node -e 'require("postcss"); require("css-select")' 2>/dev/null; then
	read -ra deps <<<"$(node scripts/build-critical-css.js --deps)"
	echo "unit suite: installing ${deps[*]} into $cache for NODE_PATH (#4056)" >&2
	npm install -s --no-save --prefix "$cache" "${deps[@]}"
	export NODE_PATH="$cache/node_modules${NODE_PATH:+:$NODE_PATH}"
fi
if ! node -e 'require("masto"); require("@atproto/lex-password-session"); require("@atproto/lex-client")' 2>/dev/null; then
	masto_v=$(node -p "require('./package.json').dependencies.masto")
	atproto_v=$(node -p "require('./package.json').dependencies['@atproto/lex-password-session']")
	lex_v=$(node -p "require('./package.json').dependencies['@atproto/lex-client']")
	echo "unit suite: installing masto@$masto_v @atproto/lex-password-session@$atproto_v @atproto/lex-client@$lex_v into $cache (#3841)" >&2
	npm install -s --no-save --prefix "$cache" "masto@$masto_v" "@atproto/lex-password-session@$atproto_v" "@atproto/lex-client@$lex_v"
	export NODE_PATH="$cache/node_modules${NODE_PATH:+:$NODE_PATH}"
fi
exec node --disable-warning=ExperimentalWarning --test "tests/unit/*.test.js"
