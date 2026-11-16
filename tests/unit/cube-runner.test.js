/**
 * Offline checks for the Cube runner (#1935): suite preparation, result rows and triage.
 *
 *   node --test tests/unit/cube-runner.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cube = require("../../runner/cube.js");

const report = {
  finalUrl: "https://shop.example.com/",
  host: "shop.example.com",
  pages: [{ path: "/", status: 200 }],
  cases: [
    { id: "PR-01", layer: "Privacy", title: "A privacy notice is linked", why: "Linked.", fw: ["Playwright"], verdict: "pass", check: { kind: "count", path: "/", selector: "a[href*=\"legal.html\" i]", op: "gte", n: 1 } },
    { id: "A11Y-01", layer: "Accessibility", title: "Images have alt text", why: "Missing. Expected none.", fw: ["Playwright"], verdict: "risk" },
    { id: "FN-02", layer: "Functional", title: "The start page answers", why: "Answered.", fw: ["Playwright"] },
    { id: "CT-02", layer: "Content", title: "One canonical link", why: "One.", fw: ["Playwright"] }
  ]
};

function spec(title, results, status) {
  return { title, tests: [{ status: status || "expected", results }] };
}

const results = {
  stats: { duration: 4210.6 },
  suites: [{
    title: "qa-lab.spec.ts",
    suites: [{
      title: "QA-lab URL Review · shop.example.com",
      specs: [
        spec("PR-01 · A privacy notice is linked", [{ status: "failed", duration: 900, error: { message: "\u001b[31mExpected: >= 1\nReceived: 0\u001b[39m" }, attachments: [{ name: "trace", path: "/tmp/a/trace.zip", contentType: "application/zip" }, { name: "error-context", contentType: "text/markdown" }] }]),
        spec("A11Y-01 · Images have alt text", [{ status: "failed", duration: 700, error: { message: "Expected: 0\nReceived: 3" } }, { status: "failed", duration: 650, error: { message: "Expected: 0\nReceived: 3" } }]),
        spec("FN-02 · The start page answers", [{ status: "failed", duration: 30000, error: { message: "page.goto: net::ERR_NAME_NOT_RESOLVED at https://shop.example.com/" } }]),
        spec("CT-02 · One canonical link", [{ status: "failed", duration: 500 }, { status: "passed", duration: 400 }], "flaky"),
        spec("PERF-02 · Field data stays good", [{ status: "skipped", duration: 0 }], "skipped")
      ]
    }]
  }]
};

test("case ids are read from the test title", () => {
  assert.equal(cube.caseId("A11Y-01 · Images"), "A11Y-01");
  assert.equal(cube.caseId("RT-12 · Retest"), "RT-12");
  assert.equal(cube.caseId("Untitled"), "");
});

test("a failure the review saw pass is flagged as a disagreement; an unanswered page judges nothing", () => {
  assert.equal(cube.triage({ verdict: "pass" }, "Received: 0"), "disagree");
  assert.equal(cube.triage({ verdict: "risk" }, "Received: 3"), "site");
  assert.equal(cube.triage({}, "Received: 3"), "site");
  assert.equal(cube.triage({ verdict: "pass" }, "page.goto: Timeout 30000ms exceeded."), "unreachable");
  assert.equal(cube.triage({ verdict: "risk" }, "net::ERR_CONNECTION_REFUSED"), "unreachable");
});

test("each case becomes one row with its status, triage, and kept files", () => {
  const { cases, summary } = cube.collect(results, report);
  const row = (id) => cases.find((item) => item.id === id);
  assert.deepEqual(cases.map((item) => item.id), ["PR-01", "A11Y-01", "FN-02", "CT-02", "PERF-02"]);
  assert.equal(row("PR-01").triage, "disagree");
  assert.equal(row("PR-01").error, "Expected: >= 1\nReceived: 0");
  assert.deepEqual(row("PR-01").artifacts, [{ name: "trace", path: "/tmp/a/trace.zip", type: "application/zip" }]);
  assert.equal(row("A11Y-01").triage, "site");
  assert.equal(row("A11Y-01").ms, 1350);
  assert.equal(row("A11Y-01").layer, "Accessibility");
  assert.equal(row("FN-02").triage, "unreachable");
  assert.equal(row("CT-02").status, "flaky");
  assert.equal(row("CT-02").triage, undefined);
  assert.equal(row("PERF-02").status, "skipped");
  assert.equal(row("PERF-02").title, "Field data stays good");
  assert.deepEqual(summary, { total: 5, passed: 0, failed: 3, flaky: 1, skipped: 1, site: 1, disagree: 1, unreachable: 1, ms: 4211 });
});

test("prepare writes the Playwright suite and a config, never the fix kit or a workflow", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cube-test-"));
  try {
    assert.deepEqual(cube.prepare(report, ["Playwright", "Cypress"], dir), ["Playwright"]);
    const spec = fs.readFileSync(path.join(dir, "playwright", "qa-lab.spec.ts"), "utf8");
    assert.match(spec, /legal\.html/);
    assert.match(spec, /https:\/\/shop\.example\.com/);
    assert.match(fs.readFileSync(path.join(dir, "playwright.config.js"), "utf8"), /results\.json/);
    assert.equal(fs.existsSync(path.join(dir, ".github")), false);
    assert.equal(fs.existsSync(path.join(dir, "fix-kit")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a choice with no framework the Cube can run is refused", () => {
  assert.throws(() => cube.prepare(report, ["Cypress"], os.tmpdir()), /can run in the Cube yet/);
});

const queue = require("../../functions/cube.js");

function fakeDb(reviews) {
  const added = [];
  return {
    added,
    collection(name) {
      return {
        doc: (id) => ({ get: async () => ({ exists: name === "url_reviews" && !!reviews[id], data: () => ({ report: reviews[id] }) }) }),
        add: async (row) => { added.push({ name, row }); return { id: "run" + added.length }; }
      };
    }
  };
}

test("the queue runs only frameworks the runner has, and falls back to Playwright", () => {
  assert.deepEqual(queue.cleanFrameworks(["playwright", "Cypress"]), ["Playwright"]);
  assert.deepEqual(queue.cleanFrameworks("Selenium"), ["Playwright"]);
  assert.deepEqual(queue.cleanFrameworks(), ["Playwright"]);
});

test("a run is queued only for a report that has cases", async () => {
  const db = fakeDb({ abc123: report, empty1: { host: "x.example", cases: [] } });
  const out = await queue.enqueue(db, { reviewId: "abc123", frameworks: ["Cypress"], source: "nowhere" }, "carlos@example.com", Date.UTC(2026, 9, 27));
  assert.deepEqual(out, { id: "run1", reviewId: "abc123", host: "shop.example.com", frameworks: ["Playwright"], cases: 4 });
  assert.equal(db.added[0].name, "url_review_runs");
  assert.equal(db.added[0].row.status, "queued");
  assert.equal(db.added[0].row.source, "jarvis");
  assert.equal(db.added[0].row.at, "2026-10-27T00:00:00.000Z");
  await assert.rejects(queue.enqueue(db, { reviewId: "empty1" }, "", 0), /no cases/);
  await assert.rejects(queue.enqueue(db, { reviewId: "../x" }, "", 0), /not a report id/);
  await assert.rejects(queue.enqueue(db, { reviewId: "missing1" }, "", 0), /no cases/);
});

test("starting the job passes the run id to the container and reports Cloud Run's refusal", async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ name: "operations/1" }) }; };
  assert.equal(await queue.startJob(ok, "tok", "run9"), "operations/1");
  assert.equal(calls[0].url, "https://run.googleapis.com/v2/projects/carlosm-interactive-cv/locations/us-central1/jobs/cube-runner:run");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(calls[0].init.body).overrides.containerOverrides[0].env, [{ name: "RUN_ID", value: "run9" }]);
  const refused = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "Permission denied" } }) });
  await assert.rejects(queue.startJob(refused, "tok", "run9"), /refused the run \(403\): Permission denied/);
});

test("the push goes out once, when a run finishes, and names the failed cases", () => {
  assert.equal(queue.finished({ status: "running" }, { status: "done" }), true);
  assert.equal(queue.finished({ status: "done" }, { status: "done" }), false);
  assert.equal(queue.finished({ status: "queued" }, { status: "running" }), false);
  const done = queue.doneMessage({ status: "done", host: "shop.example.com", reviewId: "abc123", summary: { passed: 37, failed: 3, disagree: 1, flaky: 0 }, cases: [{ id: "MB-02", title: "Tablet width", status: "failed" }, { id: "FN-01", title: "Home", status: "passed" }] }, "https://x/r");
  assert.equal(done.kind, "review");
  assert.equal(done.title, "Run done: shop.example.com");
  assert.equal(done.body, "37 passed, 3 failed, 1 disagree with the review. Tap to open the report.");
  assert.deepEqual(done.lines, ["MB-02 Tablet width"]);
  assert.equal(queue.doneMessage({ status: "failed", host: "h", reviewId: "r", error: "No run" }, "u").title, "Run failed: h");
});
