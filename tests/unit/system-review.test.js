const test = require("node:test");
const assert = require("node:assert/strict");
const review = require("../../functions/system-review");

const NOW = Date.parse("2026-11-03T15:00:00Z");

test("the cause of a failed job is read from its log, with the fix", () => {
  const mastodon = "2026-11-03T13:00:56.3515826Z mastodon: Mastodon /api/v1/accounts/verify_credentials 401: The access token is invalid\n2026-11-03T13:00:57.3396713Z ##[error]Process completed with exit code 1.";
  assert.match(review.causeOf(mastodon), /^a token was refused \(mastodon: Mastodon .* 401: The access token is invalid\): renew that secret/);
  const pages = ["2026-11-03T14:11:00.4081938Z broken: social/pick/a-es.html -> /social/pick/b-es.html", "2026-11-03T14:11:00.4083246Z broken: social/pick/a-es.html -> /social/pick/c-es.html", "##[error]Process completed with exit code 1."].join("\n");
  assert.match(review.causeOf(pages), /^2 links point to pages that do not exist \(social\/pick\/a-es\.html -> \/social\/pick\/b-es\.html\): build the missing pages/);
  assert.match(review.causeOf("Memory limit of 256 MiB exceeded with 286 MiB used."), /^ran out of memory/);
  const stalled = ["2026-11-09T12:58:40Z Current status: syncing_files", "2026-11-09T12:58:50Z Current status: ", "2026-11-09T12:58:50Z ##[error]Timeout reached, aborting!", "Canceling Pages deployment..."].join("\n");
  assert.match(review.causeOf(stalled), /^the Pages deployment stalled on GitHub's side \(Timeout reached, aborting!\), not in the commit/);
  assert.match(review.causeOf("##[error]Creating Pages deployment failed"), /^the Pages deployment stalled/);
  assert.equal(review.causeOf("npm ci\nError: Cannot find module 'x'\n##[error]Process completed with exit code 1."), "failed: Error: Cannot find module 'x'");
  assert.equal(review.causeOf(""), "failed with no readable cause in its log");
});

test("a new leaked secret and a critical Dependabot alert are problems; the rest are counts", () => {
  const out = review.security({
    secrets: [{ created_at: "2026-11-01T00:00:00Z", secret_type_display_name: "Google API Key" }, { created_at: "2025-07-07T00:00:00Z", secret_type_display_name: "Google API Key" }],
    dependabot: [{ security_advisory: { severity: "high" } }, { security_advisory: { severity: "critical" } }, { security_advisory: { severity: "high" } }],
    code: [{ rule: { security_severity_level: "high" } }, { rule: { severity: "warning" } }]
  }, NOW);
  assert.deepEqual(out.problems.map((p) => p.job), ["Secret scanning", "Dependabot"]);
  assert.match(out.problems[0].why, /^1 new leaked secret \(Google API Key\): revoke and rotate it/);
  assert.deepEqual(out.rows.map((r) => r.value), ["2 open", "1 critical, 2 high", "1 high"]);
  const blind = review.security({ secrets: null, dependabot: null, code: null }, NOW);
  assert.deepEqual(blind.problems, []);
  assert.ok(blind.rows.every((r) => /not readable by the GitHub App/.test(r.value)));
});

test("PRs open over a week are listed, chats apart from Dependabot, drafts left out", () => {
  const old = "2026-10-25T00:00:00Z";
  const row = review.stalePrs([
    { number: 1384, created_at: old, draft: false, head: { ref: "fix/1364-account-pay-lang" } },
    { number: 1919, created_at: old, draft: false, head: { ref: "dependabot/npm_and_yarn/brace-expansion-2.1.7" } },
    { number: 2109, created_at: old, draft: true, head: { ref: "feat/1991-engagement-mac-browser" } },
    { number: 2408, created_at: "2026-11-03T00:00:00Z", draft: false, head: { ref: "fix/1965-save-large-page" } }
  ], NOW);
  assert.equal(row.value, "1 from chats (#1384); 1 from Dependabot (#1919)");
  assert.equal(review.stalePrs([], NOW).value, "none");
});

test("run reads the newest finished run per workflow on main and names the failing step and cause", async () => {
  const replies = {
    "/actions/runs?branch=main&status=completed&per_page=100": { workflow_runs: [
      { id: 2, name: "Pages", conclusion: "failure", updated_at: "2026-11-03T14:11:00Z", html_url: "https://github.com/r/2" },
      { id: 1, name: "Pages", conclusion: "success", updated_at: "2026-11-03T07:41:00Z" },
      { id: 3, name: "Lint", conclusion: "success", updated_at: "2026-11-03T03:52:00Z" },
      { id: 4, name: "Buffer handoff (once)", conclusion: "failure", updated_at: "2026-10-26T15:52:00Z" }
    ] },
    "/actions/runs/2/jobs?filter=latest": { jobs: [{ id: 9, conclusion: "failure", steps: [{ name: "Build", conclusion: "success" }, { name: "No forbidden paths, every local link resolves", conclusion: "failure" }] }] },
    "/actions/jobs/9/logs": "broken: social/pick/a-es.html -> /social/pick/b-es.html\n##[error]Process completed with exit code 1.",
    "/secret-scanning/alerts?state=open&per_page=100": [],
    "/dependabot/alerts?state=open&per_page=100": [],
    "/pulls?state=open&per_page=100": []
  };
  const fetch = async (url) => {
    const path = url.replace("https://api.github.com/repos/kaanmuar/kaanmuar.github.io", "");
    if (!(path in replies)) return { ok: false, status: 403, json: async () => ({}) };
    const body = replies[path];
    return { ok: true, status: 200, json: async () => body, text: async () => body };
  };
  const out = await review.run({ fetch, token: "t", now: NOW });
  assert.equal(out.problems.length, 1);
  assert.equal(out.problems[0].job, "Pages");
  assert.match(out.problems[0].why, /^step "No forbidden paths, every local link resolves": 1 links point to pages that do not exist .* https:\/\/github.com\/r\/2$/);
  assert.deepEqual(out.rows.map((r) => r.label + ": " + r.value), [
    "Workflows on main: 3 seen, 1 failing",
    "Secret scanning: 0 open",
    "Dependabot: none",
    "Code scanning: not readable by the GitHub App (needs Code scanning alerts: read)",
    "PRs open over 7 days: none"
  ]);
});
