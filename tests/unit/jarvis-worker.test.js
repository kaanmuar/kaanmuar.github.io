const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const worker = require("../../functions/jarvis-worker");
const actions = require("../../functions/jarvis-actions");
const script = require("../../scripts/jarvis-worker");
const { fakeDb } = require("./fake-jarvis-db");

const NOW = Date.parse("2026-11-09T17:00:00Z");
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = Object.assign(publicKey.export({ format: "jwk" }), { kid: "k1", alg: "RS256", use: "sig" });

function jwt(over, kid) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claims = Object.assign({ iss: "https://token.actions.githubusercontent.com", aud: "jarvis-worker", repository: worker.REPO, workflow_ref: worker.WORKFLOW_REF,
    run_id: "777", exp: Math.floor(NOW / 1000) + 300, nbf: Math.floor(NOW / 1000) - 10 }, over || {});
  const head = enc({ alg: "RS256", kid: kid || "k1", typ: "JWT" }) + "." + enc(claims);
  return head + "." + crypto.sign("RSA-SHA256", Buffer.from(head), privateKey).toString("base64url");
}

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    const method = (opts && opts.method) || "GET";
    const body = opts && opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith("/.well-known/jwks")) return { ok: true, status: 200, json: async () => ({ keys: [JWK] }) };
    for (const [m, p, handler] of routes || []) {
      if (m === method && (typeof p === "string" ? url.includes(p) : p.test(url))) {
        const out = handler(body, url);
        const status = (out && out._status) || 200;
        return { ok: status < 400, status, json: async () => out };
      }
    }
    return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
  };
  fn.calls = calls;
  return fn;
}

const ctxOf = (fetch, db) => ({ fetch, db: db || fakeDb(), now: NOW, env: {}, github: async () => "tok" });

test.beforeEach(() => worker._reset());

test("cost bills at rounded-up list prices, thinking as output", () => {
  assert.deepEqual(worker.cost([{ model: "gemini-pro-latest", input: 1e6, output: 1e5 }, { model: "gemini-flash-latest", input: 2e6, output: 0 }]), { usd: 5, input: 3e6, output: 1e5 });
  assert.equal(worker.priceOf("gemini-2.5-flash-lite").in, 0.1);
  assert.equal(worker.cost(null).usd, 0);
  assert.deepEqual(script.usage({ models: { "gemini-pro-latest": { tokens: { prompt: 900, candidates: 50, thoughts: 25 } } } }), [{ model: "gemini-pro-latest", input: 900, output: 75 }]);
});

test("dispatch stores the task and starts jarvis-worker.yml on main with its inputs", async () => {
  const f = fakeFetch([["POST", "/actions/workflows/jarvis-worker.yml/dispatches", () => ({ _status: 204 })]]);
  const db = fakeDb();
  const out = await worker.dispatch(ctxOf(f, db), { prompt: "Make the flaky Playwright login test wait for the form.", title: "Fix login test", by: "Carlos" });
  assert.equal(out.ok, true);
  const call = f.calls.find((c) => c.url.includes("/dispatches"));
  assert.equal(call.body.ref, "main");
  assert.equal(call.body.inputs.id, out.id);
  assert.equal(call.body.inputs.tier, "pro");
  assert.equal(call.body.inputs.branch, "main");
  const row = db.doc("jarvis_worker", out.id);
  assert.equal(row.state, "queued");
  assert.equal(row.by, "Carlos");
});

test("dispatch refuses over the month's budget and short tasks", async () => {
  const db = fakeDb();
  await db.collection("jarvis_worker_spend").doc("2026-11").set({ usd: 40.01 });
  const f = fakeFetch([]);
  await assert.rejects(worker.dispatch(ctxOf(f, db), { prompt: "A task long enough to pass the length check." }), /budget for 2026-11 is used/);
  await assert.rejects(worker.dispatch(ctxOf(f, fakeDb()), { prompt: "short" }), /at least 20 characters/);
  await assert.rejects(worker.dispatch(ctxOf(f, fakeDb()), { prompt: "A task long enough to pass the length check.", branch: "../etc" }), /branch name/);
  assert.equal(f.calls.length, 0);
});

test("a dispatch GitHub refuses marks the task failed and names the grant", async () => {
  const db = fakeDb();
  const f = fakeFetch([["POST", "/dispatches", () => ({ _status: 403, message: "Resource not accessible by integration" })]]);
  await assert.rejects(worker.dispatch(ctxOf(f, db), { prompt: "A task long enough to pass the length check." }), /Actions: write/);
  assert.equal(db.docs("jarvis_worker")[0].state, "failed");
});

test("verifyOidc takes only jarvis-worker.yml on main of this repo, signed by GitHub", async () => {
  const f = fakeFetch([]);
  assert.equal((await worker.verifyOidc(f, jwt(), NOW)).run_id, "777");
  await assert.rejects(worker.verifyOidc(f, jwt({ workflow_ref: worker.REPO + "/.github/workflows/jarvis-worker.yml@refs/heads/evil" }), NOW), /on main/);
  await assert.rejects(worker.verifyOidc(f, jwt({ repository: "someone/fork" }), NOW), /on main/);
  await assert.rejects(worker.verifyOidc(f, jwt({ aud: "other" }), NOW), /not for Jarvis/);
  await assert.rejects(worker.verifyOidc(f, jwt({ exp: Math.floor(NOW / 1000) - 600 }), NOW), /expired/);
  await assert.rejects(worker.verifyOidc(f, jwt({}, "k2"), NOW), /does not publish/);
  const t = jwt().split(".");
  await assert.rejects(worker.verifyOidc(f, t[0] + "." + Buffer.from(JSON.stringify({ iss: "x" })).toString("base64url") + "." + t[2], NOW), /signature/);
  await assert.rejects(worker.verifyOidc(f, "nope", NOW), (e) => e.status === 403);
});

async function queued(db, over) {
  const row = Object.assign({ id: "wabc", state: "queued", title: "Fix login test", prompt: "Make the login test wait.", tier: "pro", branch: "main", pr: null, issue: null, by: "Carlos", at: new Date(NOW).toISOString() }, over || {});
  await db.collection("jarvis_worker").doc(row.id).set(row);
  return row;
}

test("a done report opens the PR with the jarvis label and adds the run's cost to the month", async () => {
  const db = fakeDb();
  await queued(db);
  const f = fakeFetch([
    ["GET", /\/pulls\?state=open&head=/, () => []],
    ["POST", /\/pulls$/, (body) => ({ number: 3001, html_url: "https://github.com/x/pull/3001", body })],
    ["POST", "/issues/3001/labels", () => ({})]
  ]);
  const ctx = ctxOf(f, db);
  assert.equal((await worker.report(ctx, { id: "wabc", state: "running" }, jwt())).state, "running");
  const out = await worker.report(ctx, { id: "wabc", state: "done", branch: "jarvis/wabc-fix-login-test", summary: "Waited for the form.", files: ["tests/login.spec.js"], tests: "pass",
    models: [{ model: "gemini-pro-latest", input: 400000, output: 20000 }] }, jwt());
  assert.deepEqual([out.state, out.pr], ["done", 3001]);
  const pr = f.calls.find((c) => c.method === "POST" && /\/pulls$/.test(c.url)).body;
  assert.equal(pr.title, "Jarvis: Fix login test");
  assert.equal(pr.head, "jarvis/wabc-fix-login-test");
  assert.match(pr.body, /Waited for the form/);
  assert.deepEqual(f.calls.find((c) => c.url.includes("/issues/3001/labels")).body, { labels: ["jarvis"] });
  const month = db.doc("jarvis_worker_spend", "2026-11");
  assert.equal(month.usd, 1.3);
  assert.equal(month.runs, 1);
  assert.equal(db.doc("jarvis_worker", "wabc").run, "777");
  assert.equal((await worker.spend(db, NOW)).usd, 1.3);
});

test("reports from another run, for unknown tasks or on foreign branches are refused; a finished task is not reopened", async () => {
  const db = fakeDb();
  await queued(db, { run: "555" });
  const f = fakeFetch([]);
  await assert.rejects(worker.report(ctxOf(f, db), { id: "wabc", state: "done" }, jwt()), (e) => e.status === 403);
  await assert.rejects(worker.report(ctxOf(f, db), { id: "nope", state: "done" }, jwt()), (e) => e.status === 404);
  const db2 = fakeDb();
  await queued(db2);
  await assert.rejects(worker.report(ctxOf(f, db2), { id: "wabc", state: "done", branch: "main" }, jwt()), /jarvis\/\* branches/);
  const db3 = fakeDb();
  await queued(db3, { state: "done", prNumber: 9, prUrl: "u" });
  assert.equal((await worker.report(ctxOf(f, db3), { id: "wabc", state: "failed" }, jwt())).already, true);
});

test("a task on a PR comments there instead of opening another PR", async () => {
  const db = fakeDb();
  await queued(db, { pr: 42 });
  const f = fakeFetch([["POST", "/issues/42/comments", () => ({})]]);
  const out = await worker.report(ctxOf(f, db), { id: "wabc", state: "done", branch: "feat/x", summary: "Merged main." }, jwt());
  assert.equal(out.pr, 42);
  assert.ok(!f.calls.some((c) => /\/pulls$/.test(c.url)));
});

test("route: the asked tier wins, else Flash for test and config fixes and Pro for code", () => {
  assert.equal(worker.route({ tier: "flash", category: "code" }), "flash");
  assert.equal(worker.route({ category: "test" }), "flash");
  assert.equal(worker.route({ category: "config" }), "flash");
  assert.equal(worker.route({ category: "code" }), "pro");
  assert.equal(worker.route({ tier: "ultra" }), "pro");
  assert.equal(worker.route(null), "pro");
});

test("spend levels: ok under $20, warn from $20, over from $40", async () => {
  const at = async (usd) => { const db = fakeDb(); await db.collection("jarvis_worker_spend").doc("2026-11").set({ usd }); return worker.spend(db, NOW); };
  assert.deepEqual([(await at(19.99)).level, (await at(20)).level, (await at(40)).level], ["ok", "warn", "over"]);
  assert.equal((await at(12.5)).left, 27.5);
  assert.equal((await at(41)).left, 0);
  assert.deepEqual([worker.crossed(19, 21), worker.crossed(21, 22), worker.crossed(39, 40), worker.crossed(10, 45), worker.crossed(1, 2)], ["warn", null, "cap", "cap", null]);
  assert.equal(worker.budgetMessage(null, 5), null);
  assert.match(worker.budgetMessage("warn", 20.4).body, /\$20\.40 of \$40/);
  assert.equal(worker.budgetMessage("cap", 40).tab, "products:github");
});

test("the run that carries the month past $20 says so once", async () => {
  const db = fakeDb();
  await db.collection("jarvis_worker_spend").doc("2026-11").set({ usd: 19.5, runs: 30 });
  await queued(db);
  const f = fakeFetch([["GET", /\/pulls\?state=open&head=/, () => [{ number: 5, html_url: "u" }]], ["POST", "/issues/5/labels", () => ({})]]);
  const out = await worker.report(ctxOf(f, db), { id: "wabc", state: "done", branch: "jarvis/wabc-x", models: [{ model: "gemini-pro-latest", input: 200000, output: 10000 }] }, jwt());
  assert.deepEqual([out.crossed, out.monthUsd], ["warn", 20.15]);
  assert.ok(db.doc("jarvis_worker_spend", "2026-11").warnAt);
  await queued(db, { id: "wdef" });
  const next = await worker.report(ctxOf(f, db), { id: "wdef", state: "done", branch: "jarvis/wdef-x", models: [{ model: "gemini-flash-latest", input: 1000, output: 100 }] }, jwt({ run_id: "778" }));
  assert.equal(next.crossed, undefined);
});

test("a failed Flash run starts again once on Pro; a failed Pro run waits for Cursor", async () => {
  const db = fakeDb();
  await queued(db, { tier: "flash", key: "gh:diag:9" });
  const f = fakeFetch([["POST", "/dispatches", () => ({ _status: 204 })]]);
  const out = await worker.report(ctxOf(f, db), { id: "wabc", state: "failed", error: "tests still fail" }, jwt());
  assert.ok(out.escalated);
  const call = f.calls.find((c) => c.url.includes("/dispatches"));
  assert.equal(call.body.inputs.tier, "pro");
  const next = db.doc("jarvis_worker", out.escalated);
  assert.deepEqual([next.tier, next.escalatedFrom, next.key], ["pro", "wabc", "gh:diag:9"]);
  assert.equal(db.doc("jarvis_worker", "wabc").escalatedTo, out.escalated);
  const view = await worker.view(db, NOW);
  assert.equal(view.tasks.find((t) => t.id === "wabc").cursor, null);

  const db2 = fakeDb();
  await queued(db2, { pr: 42, branch: "main" });
  const f2 = fakeFetch([]);
  const out2 = await worker.report(ctxOf(f2, db2), { id: "wabc", state: "failed", error: "Gemini quota" }, jwt());
  assert.equal(out2.escalated, undefined);
  assert.equal(f2.calls.filter((c) => c.url.includes("/dispatches")).length, 0);
  const row = (await worker.view(db2, NOW)).tasks[0];
  assert.deepEqual(row.cursor, { prompt: "Make the login test wait.", branch: undefined, pr: 42, name: "Jarvis fix: Fix login test" });
});

test("a failed Flash run over the cap is not tried again and says why", async () => {
  const db = fakeDb();
  await db.collection("jarvis_worker_spend").doc("2026-11").set({ usd: 40 });
  await queued(db, { tier: "flash" });
  const out = await worker.report(ctxOf(fakeFetch([]), db), { id: "wabc", state: "failed" }, jwt());
  assert.equal(out.escalated, undefined);
  assert.match(db.doc("jarvis_worker", "wabc").escalateError, /budget/);
  assert.ok((await worker.view(db, NOW)).tasks[0].cursor);
});

test("view: the month's spend and the newest tasks first", async () => {
  const db = fakeDb();
  await db.collection("jarvis_worker_spend").doc("2026-11").set({ usd: 0.116, runs: 1 });
  await queued(db, { id: "w1", at: "2026-11-09T10:00:00.000Z", state: "done", prNumber: 2977, prUrl: "https://github.com/x/pull/2977", usd: 0.116 });
  await queued(db, { id: "w2", at: "2026-11-09T11:00:00.000Z", state: "running" });
  const v = await worker.view(db, NOW);
  assert.deepEqual([v.spend.usd, v.spend.level, v.spend.cap, v.spend.warn], [0.116, "ok", 40, 20]);
  assert.deepEqual(v.tasks.map((t) => t.id), ["w2", "w1"]);
  assert.deepEqual([v.tasks[1].pr, v.tasks[1].usd, v.tasks[1].cursor], [2977, 0.116, null]);
});

test("porcelain keeps the first file's name whole when its status starts with a space", () => {
  assert.deepEqual(script.porcelain(" M tests/unit/jarvis-worker.test.js\n?? js/new.js\nM  .gemini/settings.json\n"), ["tests/unit/jarvis-worker.test.js", "js/new.js"]);
});

test("candidates: fresh code, test or config diagnoses on main or Jarvis's branches, and needs-agent bugs", async () => {
  const db = fakeDb();
  const diag = (run, over) => db.collection("jarvis_github_diag").doc(String(run)).set(Object.assign({ run, repo: worker.REPO, workflow: "E2E", branch: "main", pr: null, category: "code",
    confidence: 0.9, cause: "a selector changed", prompt: "Update the selector in the login test.", at: new Date(NOW - 3600000).toISOString() }, over || {}));
  await diag(1);
  await diag(2, { category: "flaky" });
  await diag(3, { confidence: 0.5 });
  await diag(4, { at: new Date(NOW - 3 * 864e5).toISOString() });
  await diag(5, { branch: "feat/someone", pr: 77 });
  await diag(6, { branch: "jarvis/wx-y", pr: 78 });
  const out = await worker.candidates(db, { now: NOW, confidence: 0.8, github: { needsAgent: [{ number: 2950, title: "BE: a null MX record" }] } });
  assert.deepEqual(out.map((c) => c.target).sort(), ["#2950", "run 1", "run 6"]);
  assert.equal(out.find((c) => c.target === "run 6").task.pr, 78);
  assert.equal(out.find((c) => c.target === "#2950").task.issue, 2950);
});

test("candidates leave out diagnoses on main of workflows that are no longer failing there", async () => {
  const db = fakeDb();
  const diag = (run, over) => db.collection("jarvis_github_diag").doc(String(run)).set(Object.assign({ run, repo: worker.REPO, workflow: "Pages", branch: "main", pr: null, category: "config",
    confidence: 0.9, cause: "a step failed", prompt: "Fix the Pages deploy step.", at: new Date(NOW - 3600000).toISOString() }, over || {}));
  await diag(1);
  await diag(2, { workflow: "Merge PageSpeed PR" });
  await diag(3, { workflow: "E2E", branch: "jarvis/wx-y", pr: 78 });
  const out = await worker.candidates(db, { now: NOW, confidence: 0.8, github: {}, failing: ["Merge PageSpeed PR"] });
  assert.deepEqual(out.map((c) => c.target).sort(), ["run 2", "run 3"]);
  assert.equal(out.find((c) => c.target === "run 2").task.category, "config");
  assert.equal((await worker.candidates(db, { now: NOW, confidence: 0.8, github: {} })).length, 3);
});

test("the hourly pass hands candidates to the worker once each, and waits while the budget is used", async () => {
  const MONDAY_10 = Date.parse("2026-10-26T15:00:00Z");
  const started = [];
  const task = { target: "run 1", why: "E2E failed", task: { prompt: "Update the selector in the login test." } };
  const opsOf = (over) => Object.assign({ held: async () => [], hubStale: async () => false,
    workerCandidates: async () => ({ over: false, cap: 40, tasks: [task] }), workerRun: async (t) => { started.push(t); return { detail: "started" }; } }, over);
  const db = fakeDb();
  await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: opsOf() });
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops: opsOf() });
  assert.equal(started.length, 1);
  const db2 = fakeDb();
  const out = await actions.autoRun({ db: db2, now: MONDAY_10, settings: {}, ops: opsOf({ workerCandidates: async () => ({ over: true, cap: 40, tasks: [task] }) }) });
  assert.equal(started.length, 1);
  assert.match(out.waiting.find((w) => w.action === "gh-worker").reason, /budget of \$40/);
});
