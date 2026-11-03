#!/usr/bin/env bash
# Builds the social hub offline, from committed sources (scripts/build-social-hub.js --offline), on a runner or here.
#   scripts/social-hub-build.sh
# Pull requests leave the generated hub files to the bots (#2242), so CI and the Pages build run this before they test
# or publish the hub, and the regen and ledger commits run it on main.
# On a runner it first installs what a bare runner lacks: the critical CSS builder's packages (#1089), and sharp for
# new thumbnails, at the version package-lock.json pins.
set -euo pipefail

if [ -n "${GITHUB_ACTIONS:-}" ]; then
	if ! node -e 'require("postcss")' 2>/dev/null; then
		read -ra deps <<<"$(node scripts/build-critical-css.js --deps)"
		npm install -s --no-save --prefix "$RUNNER_TEMP/critical-css" "${deps[@]}" >/dev/null
		export NODE_PATH="$RUNNER_TEMP/critical-css/node_modules${NODE_PATH:+:$NODE_PATH}"
	fi
	if ! node -e 'require("sharp")' 2>/dev/null; then
		version=$(node -p "(require('./package-lock.json').packages['node_modules/sharp'] || {}).version || 'latest'")
		npm install -s --no-save --prefix "$RUNNER_TEMP/sharp" "sharp@$version" >/dev/null
		export NODE_PATH="$RUNNER_TEMP/sharp/node_modules${NODE_PATH:+:$NODE_PATH}"
	fi
fi
node scripts/build-social-hub.js --offline
