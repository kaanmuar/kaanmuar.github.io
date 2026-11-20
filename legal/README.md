# The legal page, as a living document (#4004)

`qa-review-legal.html` is generated. Do not edit its notices by hand.

## 1. Source

- `legal/clauses.json`: one record per clause (`id`, `kind`, `notice`, `language`, `jurisdiction`, `text`, `cites`, `lastChecked`, `status`, `counselReviewedOn`).
- `legal/notices-script.tmpl`: the page script, with a `{{clause-id}}` slot where each clause goes.
- `node scripts/build-legal-html.js` renders the page; `--check` fails when the page is stale. The page's text only changes when a clause's `text` changes.

## 2. Sign-off (the gate)

- `legal/signoff.json` binds each clause id to the SHA-256 of its `text`, with `signedOffBy`, `signedOffOn`, a `note`, and `counselReviewedOn` (the day the owner reported counsel had read that text, or `null`).
- `node scripts/check-legal-signoff.js` runs in CI (and as a unit test in `npm run test:review`). It fails when a clause text differs from its signed-off hash, when a clause has no sign-off, or when a `status` line is not what the sign-off says.
- `status` and `counselReviewedOn` in `clauses.json` are set only by `node scripts/legal-signoff.js --apply`: a clause is `counsel-approved` on the sign-off's `counselReviewedOn` when its text matches its hash, otherwise `draft` with `null`. The script writes no counsel name or other fact.

## 3. Weekly watch

- The Cloud Function `legalWatch` (`functions/legal-watch.js`, Mondays 10:00 Bogotá, row in `functions/ops-schedule.js`) reads `legal/clauses.json` from `main`, fetches every unique `cites[].url` (polite user agent, 20 s timeout, at most 60 pages and 1.5 s apart per run), hashes the normalized text, and stores it in Firestore `legal_watch/<sha-256 of url>`.
- The first run only records baselines. A page that fails to load is recorded (`status: "error"`) and retried next week; it is never a change.
- When a page's text changed, the run writes `legal_watch_changes/<doc>-<hash>` and files ONE GitHub issue under #4004 listing the URL, the clauses that cite it, and the dates. The new text becomes the baseline. It never edits `clauses.json`, `signoff.json` or the page, and publishes nothing. The run note also shows in `ops_runs/legalWatch` and Jarvis > Console.

## 4. How the owner approves a change

1. Read the issue and the source page. If the wording is still right, close the issue.
2. If a clause needs new wording, edit its `text` (and `cites`, `lastChecked`) in `legal/clauses.json`, then run `node scripts/build-legal-html.js` and `node scripts/build-csp-hashes.js`.
3. Re-sign the changed clauses in the same PR: `node scripts/legal-signoff.js --sign --by "<name>" --on YYYY-MM-DD --note "<why>" [--counsel-on YYYY-MM-DD]`, then `node scripts/legal-signoff.js --apply`. Without `--counsel-on` the changed clauses go back to `draft`.
4. The PR diff shows both the new text and the new `signoff.json` entries: that is the approval. CI passes only when they match.
