# Bugbot — kaanmuar.github.io / QA-lab

Repo switch for `kaanmuar/kaanmuar.github.io` is ON in Bugbot Manage (#3552). Team-level Bugbot may still show Off until Cursor unlocks team Enable; keep trigger Manual / Ready for Review (not every-push).
Repo `.cursor/config/bugbot.yaml` sets `oncePerPr`, skips drafts, and disables autofix/PR summaries.
Local on-demand review subagents remain the default for routine PRs; Bugbot is the GitHub-side safety net.

## Ignore & skip
- Do not review `work-log.csv`, quota caches, or scrum/board chore-only diffs.
- Skip generated media, social clip renders, and static fixture payloads unless a script path is broken.
- No praise, summaries, or style nits covered by formatters/linters. Actionable defects only.

## High-priority checks
1. **Jarvis mobile/web parity** — UI/DOM changes that break phone layout, touch targets, or Jarvis snapshot/API error handling; no client-side key leaks.
2. **Workers & preflight (#1970)** — unhandled rejections, missing CORS, unbounded Worker/KV reads; hook JSON must match Cursor hook contracts.
3. **CI / GitHub budget** — raw `gh` loops that bypass `gh-budget` or `ci-wait`; Playwright fixed sleeps or brittle selectors.

## False positives (do not flag)
- Intentional mock tokens or dummy credentials under `tests/` / fixtures.
- Worktree / ticket / usage-log process rules and scripts.
- Inline scripts or styles on intentional single-file static pages.
- Generated social HTML under `social/` and rendered media under `media/`.
