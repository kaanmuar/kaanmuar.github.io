#!/bin/bash
# Main is fixed, refresh the PRs (#2245). Re-running a PR's failed jobs tests its old refs/pull/<n>/merge, which still
# has the broken main, so this closes and reopens the open, non-draft PRs whose newest run of the workflow failed
# before main's newest green run: 3 s apart, at most 20 a call (run it again for the rest). PRs that conflict with
# main get no merge and no run; they are skipped and listed. Same code as Jarvis's rerun-ci (refreshPrs in
# functions/jarvis.js), REST only. Fails while the workflow is still red on main.
#   scripts/refresh-prs.sh [workflow]        default "E2E and Visual Tests"
set -euo pipefail
cd "$(dirname "$0")/.."
GITHUB_TOKEN=$(gh auth token) WORKFLOW="${1:-E2E and Visual Tests}" node -e '
const jarvis = require("./functions/jarvis");
const budget = { left: 20, until: Infinity, seen: new Set() };
jarvis.rerunCi(fetch, process.env.GITHUB_TOKEN, process.env.WORKFLOW, { rerunMain: false, budget })
  .then((res) => console.log(res.note || process.env.WORKFLOW + " already ended with " + res.already + " on main; nothing to refresh."))
  .catch((error) => { console.error(error.message || String(error)); process.exit(1); });
'
