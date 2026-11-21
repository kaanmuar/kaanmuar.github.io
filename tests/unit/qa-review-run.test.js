/**
 * The report's Run tab (#1945): what each state shows.
 *
 *   node --test tests/unit/qa-review-run.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const run = require("../../js/qa-review-run.js");

const report = { id: "abc123", host: "shop.example.com", cases: [
  { id: "FN-01", title: "The start page answers" }, { id: "CT-02", title: "One canonical link" }, { id: "UX-09", title: "The <checkout> flow" }
] };

test("signed out, the sample asks for a sign-in and the full run waits for checkout", () => {
  const html = run.view({ report, signedIn: false, size: 5 });
  assert.match(html, /data-run="sign-in">Sign in to run 5 cases free/);
  assert.match(html, /All 3 cases in Playwright: 29 USD, or 19 USD in the launch month/);
  assert.match(html, /disabled>Checkout opens soon/);
});

test("a site whose sample ran today offers no second one, and a stranger cannot start one", () => {
  assert.match(run.view({ report, signedIn: true, owner: true, sample: { used: true, next: "2026-11-04T00:00:00.000Z" } }), /already ran today/);
  assert.doesNotMatch(run.view({ report, signedIn: true, owner: true, sample: { used: true, next: "2026-11-04T00:00:00.000Z" } }), /data-run="sample"/);
  assert.match(run.view({ report, signedIn: true, owner: false }), /Only the account that ran this report/);
});

test("while it runs, the tab shows the live log and hides the offers", () => {
  const html = run.view({ report, signedIn: true, owner: true, now: Date.parse("2026-11-03T21:31:05Z"),
    run: { id: "r1", status: "running", source: "sample", cases: 2, startedAt: "2026-11-03T21:30:00Z", log: ["Running 2 tests", "<b>x</b>"] } });
  assert.match(html, /Running 2 cases on shop.example.com · 1 min 05 s/);
  assert.match(html, /<li>&lt;b&gt;x&lt;\/b&gt;<\/li>/);
  assert.doesNotMatch(html, /run-offers/);
});

test("when the sample ends, each case it ran has a row and the rest are listed as not run", () => {
  const html = run.view({ report, signedIn: true, owner: true, paid: false, sample: { used: true, next: "" },
    run: { id: "r1", status: "done", source: "sample", startedAt: "2026-11-03T21:30:00Z", finishedAt: "2026-11-03T21:30:40Z",
      summary: { total: 2, passed: 1, failed: 1 },
      results: [{ id: "FN-01", title: "The start page answers", status: "passed", ms: 900 }, { id: "CT-02", title: "One canonical link", status: "failed", ms: 1200, triage: "disagree", error: "expected 1, got 2" }] } });
  assert.match(html, /Ran 2 cases on shop.example.com in 40 s/);
  assert.match(html, /Disagrees with the review, which passed it/);
  assert.match(html, /<pre class="run-err">expected 1, got 2<\/pre>/);
  assert.match(html, /1 more case not in the sample/);
  assert.match(html, /UX-09<\/span> <strong>The &lt;checkout&gt; flow/);
  assert.doesNotMatch(html, /run-log/);
});

test("a failed sample says the day is free again and keeps the log", () => {
  const html = run.view({ report, signedIn: true, owner: true, run: { id: "r1", status: "failed", source: "sample", error: "Cloud Run refused the run", log: ["boom"] } });
  assert.match(html, /The run stopped/);
  assert.match(html, /The free sample is open again/);
  assert.match(html, /<li>boom<\/li>/);
  assert.match(html, /data-run="sample"/);
});
