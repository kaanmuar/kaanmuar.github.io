const test = require("node:test");
const assert = require("node:assert/strict");
const ps = require("../../functions/jarvis-pagespeed");
const mailPush = require("../../functions/jarvis-mail-push");
const core = require("../../functions/jarvis-core");

const DAY = "2026-11-01T15:00:00Z"; // 10:00 Bogotá
const NIGHT = "2026-11-01T08:30:00Z"; // 03:30 Bogotá
const API = "https://api.github.com/repos/kaanmuar/kaanmuar.github.io";
const SAFE = "pagespeed/safe-2026-11-01";
const AI = "pagespeed/ai-2026-11-01";

function runs(up) {
  return { runs: [{ at: "2026-11-01T08:40:00Z", run: { id: 9, url: "https://github.com/run/9" }, status: "ok", pages: 3, scored: 3, below: 2, avg: { mobile: 70, desktop: 80 },
    safe: { branch: SAFE, fixes: [{ page: "index.html", kind: "lazy", detail: "4 images" }], pages: [{ file: "index.html", mobile: { before: 85, after: 91 }, desktop: { before: 91, after: 93 } }], verdict: { up, reason: up ? "Rose on index.html (mobile 85 → 91); nothing fell more than 2." : "No page rose 3 points or more." } },
    ai: { branch: AI, fixes: [{ page: "qa-review.html", file: "qa-review.html", kind: "gemini", detail: "defer the chart" }], pages: [], verdict: { up: true, reason: "Rose." } } }] };
}

// A fake GitHub: routes are "METHOD /path" (query dropped) → body or (body, url) => body. Every call is kept.
function github(routes, data) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const method = (opts && opts.method) || "GET";
    const body = opts && opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, url, body });
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      const name = url.split("/data/pagespeed/")[1].split("?")[0];
      const v = (data || {})[name];
      return { ok: v !== undefined, status: v === undefined ? 404 : 200, json: async () => v };
    }
    const key = method + " " + url.replace(API, "").split("?")[0];
    const hit = routes[key];
    if (hit === undefined) return { ok: false, status: 404, json: async () => ({ message: "Not Found " + key }) };
    const out = typeof hit === "function" ? hit(body, url) : hit;
    return { ok: true, status: out === null ? 204 : 200, json: async () => out };
  };
  return { fetchImpl, calls };
}

function firestore(seed) {
  const docs = Object.assign({}, seed);
  const ref = (id) => ({ id, get: async () => ({ data: () => docs[id] }), set: async (v, o) => { docs[id] = o && o.merge ? Object.assign({}, docs[id], v) : v; } });
  return {
    docs,
    collection: () => ({ doc: ref }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v) => { docs[r.id] = v; } })
  };
}

function deps(gh, db, now, extra) {
  const pushes = [], logs = [];
  return Object.assign({ fetchImpl: gh.fetchImpl, token: "t", db, now: Date.parse(now), by: "jarvis", push: async (m) => { pushes.push(m); }, log: async (e) => { logs.push(e); }, pushes, logs }, extra || {});
}

const pr = (number, ref, extra) => Object.assign({ number, state: "open", html_url: "https://github.com/pull/" + number, title: "PageSpeed: fixes", head: { ref, sha: "sha" + number }, created_at: "2026-11-01T08:45:00Z" }, extra || {});
const green = { check_runs: ["Lint Code", "url-review-unit", "playwright"].map((name) => ({ name, status: "completed", conclusion: "success" })) };

test("only a branch the run recorded becomes a PR, labelled by whether it may merge itself", async () => {
  await assert.rejects(ps.openPr({ fetchImpl: async () => ({}), token: "t", branch: "main" }), /not a PageSpeed branch/);
  const gh = github({
    [`GET /branches/${encodeURIComponent(SAFE)}`]: { name: SAFE },
    "GET /pulls": [pr(7, "pagespeed/safe-2026-10-31")],
    "POST /pulls": (b) => ({ number: 8, html_url: "https://github.com/pull/8", title: b.title }),
    "POST /issues/8/labels": {}, "POST /issues/7/comments": {}, "PATCH /pulls/7": {}
  }, { "runs.json": runs(true), "latest.json": { pages: [] } });
  const out = await ps.openPr({ fetchImpl: gh.fetchImpl, token: "t", branch: SAFE });
  assert.deepEqual([out.pr, out.autoMerge, out.superseded], [8, true, [7]]);
  const opened = gh.calls.find((c) => c.method === "POST" && c.url.endsWith("/pulls"));
  assert.equal(opened.body.title, "PageSpeed: safe fixes on 1 page (2026-11-01)");
  assert.match(opened.body.body, /Merges itself on a 2-hour countdown once CI passes/);
  assert.deepEqual(gh.calls.find((c) => c.url.endsWith("/issues/8/labels")).body.labels, ["pagespeed", "auto-merge"]);
  await assert.rejects(ps.openPr({ fetchImpl: gh.fetchImpl, token: "t", branch: "pagespeed/safe-2026-01-01" }), /No PageSpeed run recorded/);
});

test("CI is green only when the required checks passed and nothing failed", () => {
  assert.equal(ps.ciState(green.check_runs).state, "green");
  assert.equal(ps.ciState(green.check_runs.slice(1)).state, "pending");
  assert.deepEqual(ps.ciState(green.check_runs.concat([{ name: "e2e", status: "completed", conclusion: "failure" }])), { state: "red", failed: ["e2e"] });
});

test("Gemini's PR goes to Proposals with Merge and Close; a safe one that scored up starts a countdown once CI passes", async () => {
  const gh = github({
    "GET /pulls": [pr(8, SAFE), pr(9, AI)],
    "GET /commits/sha8/check-runs": green,
    "POST /issues/9/labels": {}
  }, { "runs.json": runs(true) });
  const db = firestore();
  const d = deps(gh, db, DAY);
  const note = await ps.tick(d);
  assert.match(note, /#9 to proposals/);
  assert.match(note, /#8 countdown started/);
  assert.equal(db.docs["pagespeed-9"].state, "proposal");
  assert.equal(db.docs["pagespeed-8"].state, "countdown");
  const [proposal, countdown] = [d.pushes.find((m) => m.ref === "pagespeed:9"), d.pushes.find((m) => m.ref === "countdown:pagespeed-8")];
  assert.deepEqual(proposal.actions.map((a) => a.act), ["merge", "close"]);
  assert.equal(countdown.title, "Merging PageSpeed fixes in 2 h");
  assert.deepEqual(countdown.actions.map((a) => a.label), ["Cancel", "Do it now"]);
  assert.match(countdown.body, /#8 goes to production at 11:50 Bogotá/);
  assert.deepEqual(mailPush.parseAct(countdown.ref, "cancel"), { type: "countdown", id: "pagespeed-8", act: "cancel" });
  assert.deepEqual(mailPush.parseAct(proposal.ref, "merge"), { type: "pagespeed", id: "9", act: "merge" });
});

test("a countdown waits for daytime, and red CI or a branch that did not score up goes to Proposals", async () => {
  const night = github({ "GET /pulls": [pr(8, SAFE)], "GET /commits/sha8/check-runs": green }, { "runs.json": runs(true) });
  const dbN = firestore();
  assert.match(await ps.tick(deps(night, dbN, NIGHT)), /waits for 08:00 Bogotá/);
  assert.equal(dbN.docs["pagespeed-8"], undefined);

  const red = github({ "GET /pulls": [pr(8, SAFE)], "GET /commits/sha8/check-runs": { check_runs: [{ name: "playwright", status: "completed", conclusion: "failure" }] }, "POST /issues/8/labels": {} }, { "runs.json": runs(true) });
  const dbR = firestore();
  await ps.tick(deps(red, dbR, DAY));
  assert.equal(dbR.docs["pagespeed-8"].reason, "CI failed: playwright.");

  const flat = github({ "GET /pulls": [pr(8, SAFE)], "POST /issues/8/labels": {} }, { "runs.json": runs(false) });
  const dbF = firestore();
  await ps.tick(deps(flat, dbF, DAY));
  assert.equal(dbF.docs["pagespeed-8"].state, "proposal");
  assert.match(dbF.docs["pagespeed-8"].reason, /No page rose/);
});

test("when the countdown ends Jarvis starts the merge workflow; a moved branch goes to Proposals instead", async () => {
  const due = { pr: 8, kind: "safe", state: "countdown", sha: "sha8", dueAt: "2026-11-01T14:00:00Z", at: "2026-11-01T12:10:00Z", url: "u", title: "t" };
  const gh = github({ "GET /pulls": [pr(8, SAFE)], "GET /commits/sha8/check-runs": green, "GET /pulls/8": pr(8, SAFE), "POST /actions/workflows/pagespeed-merge.yml/dispatches": null }, { "runs.json": runs(true) });
  const db = firestore({ "pagespeed-8": due });
  const d = deps(gh, db, DAY);
  assert.match(await ps.tick(d), /Merging #8/);
  assert.equal(db.docs["pagespeed-8"].state, "merging");
  assert.deepEqual(gh.calls.find((c) => c.url.endsWith("/dispatches")).body, { ref: "main", inputs: { pr: "8", by: "jarvis" } });
  assert.equal(d.pushes[0].title, "Merging PageSpeed fixes #8 now");

  const moved = github({ "GET /pulls": [pr(8, SAFE, { head: { ref: SAFE, sha: "other" } })], "GET /commits/other/check-runs": green, "POST /issues/8/labels": {} }, { "runs.json": runs(true) });
  const db2 = firestore({ "pagespeed-8": due });
  await ps.tick(deps(moved, db2, DAY));
  assert.equal(db2.docs["pagespeed-8"].reason, "The branch changed during the countdown.");
});

test("Cancel sends the countdown to Proposals; Do it now merges at once", async () => {
  const doc = { pr: 8, kind: "safe", state: "countdown", sha: "sha8", dueAt: "2026-11-01T17:00:00Z", at: DAY };
  const gh = github({ "POST /issues/8/labels": {}, "GET /pulls/8": pr(8, SAFE), "POST /actions/workflows/pagespeed-merge.yml/dispatches": null });
  const db = firestore({ "pagespeed-8": Object.assign({}, doc) });
  const d = deps(gh, db, DAY, { by: "carlos" });
  assert.match((await ps.countdownAct(d, "pagespeed-8", "cancel")).message, /waits in Proposals/);
  assert.equal(db.docs["pagespeed-8"].state, "cancelled");
  await assert.rejects(ps.countdownAct(d, "pagespeed-8", "now"), /no longer counting down/);
  db.docs["pagespeed-8"] = Object.assign({}, doc);
  await ps.countdownAct(d, "pagespeed-8", "now");
  assert.equal(db.docs["pagespeed-8"].state, "merging");
  assert.equal(gh.calls.find((c) => c.url.endsWith("/dispatches")).body.inputs.by, "carlos");
});

test("the merge result is read from GitHub, not from the caller", async () => {
  const run = { id: 77, path: ".github/workflows/pagespeed-merge.yml", display_title: "Merge PageSpeed PR #8" };
  const routes = (pull, steps, commits) => ({ "GET /actions/runs/77": run, "GET /pulls/8": pull, "GET /commits": commits, "GET /actions/runs/77/jobs": { jobs: [{ steps }] } });
  const ok = github(routes(pr(8, SAFE, { state: "closed" }), [{ name: "Check the PR and its CI", conclusion: "success" }], [{ sha: "abc1234def", commit: { message: "PageSpeed: safe fixes (#8)\n\nMerged by Jarvis" } }]));
  const db = firestore({ "pagespeed-8": { pr: 8, state: "merging", by: "jarvis", url: "u", title: "t" } });
  const d = deps(ok, db, DAY);
  assert.deepEqual(await ps.merged(d, { pr: 8, run: 77 }), { pushed: true, merged: true });
  assert.equal(d.pushes[0].title, "Merged PageSpeed fixes #8");
  assert.deepEqual(await ps.merged(d, { pr: 8, run: 77 }), { pushed: false }, "a second call pushes nothing");

  const failed = github(routes(pr(8, SAFE), [{ name: "Check the PR and its CI", conclusion: "failure" }], []));
  const db2 = firestore({ "pagespeed-8": { pr: 8, state: "merging", url: "u", title: "t" } });
  const d2 = deps(failed, db2, DAY);
  await ps.merged(d2, { pr: 8, run: 77 });
  assert.equal(db2.docs["pagespeed-8"].state, "failed");
  assert.match(d2.pushes[0].body, /failed at "Check the PR and its CI"\. It waits in Proposals/);

  const going = github(routes(pr(8, SAFE), [{ name: "Squash it onto main and push", conclusion: null }], []));
  await assert.rejects(ps.merged(deps(going, firestore(), DAY), { pr: 8, run: 77 }), /has not finished/);
  const other = github({ "GET /actions/runs/77": Object.assign({}, run, { path: ".github/workflows/ci.yml" }) });
  await assert.rejects(ps.merged(deps(other, firestore(), DAY), { pr: 8, run: 77 }), /not a PageSpeed merge run/);
});

test("Page health lists every page, the runs and where each PR stands, and feeds the briefing", async () => {
  const latest = { at: "2026-11-01T08:40:00Z", threshold: 90, pages: [
    { url: "https://carlosandmunoz.com/", file: "index.html", mobile: { score: 85 }, desktop: { score: 91 }, fails: ["render-blocking-insight"] },
    { url: "https://carlosandmunoz.com/qa-review.html", file: "qa-review.html", mobile: { score: 45 }, desktop: { score: 53 }, fails: [] },
    { url: "https://carlosandmunoz.com/x.html", file: "x.html", mobile: { error: "timed out" }, desktop: { error: "timed out" }, fails: [] }
  ], cache: [] };
  const gh = github({ "GET /pulls": [pr(8, SAFE), pr(9, AI), pr(5, "feat/other")] }, { "latest.json": latest, "runs.json": runs(true) });
  const db = firestore({ "pagespeed-8": { state: "countdown", dueAt: "2026-11-01T17:00:00Z" }, "pagespeed-9": { state: "proposal", reason: "Gemini's edits always wait for you." } });
  const src = await ps.source({ fetch: gh.fetchImpl, db, now: Date.parse(DAY), github: async () => "t" });
  assert.deepEqual(src.counts, { pages: 3, scored: 2, below: 2, under50: 1 });
  assert.deepEqual(src.prs.map((p) => [p.number, p.stage, p.kind]), [[8, "countdown", "safe"], [9, "proposal", "ai"]]);
  assert.equal(src.stale, false);
  const state = { external: { pagespeed: src }, products: {} };
  const keys = core.briefing(state).map((b) => b.key);
  assert.ok(keys.includes("pagespeed:pr:9") && keys.includes("pagespeed:countdown:8") && keys.includes("pagespeed:slow"));
  const detail = core.briefDetail(core.briefing(state).find((b) => b.key === "pagespeed:pr:9"), state);
  assert.deepEqual(detail.actions.map((a) => [a.id, a.pr]), [["pagespeed-merge", 9], ["pagespeed-close", 9]]);
  assert.deepEqual(core.proposalRules(state).map((p) => p.key), ["pagespeed:pr:9", "pagespeed:slow"]);

  const empty = await ps.source({ fetch: github({}, {}).fetchImpl, db: firestore(), now: Date.parse(DAY) });
  assert.equal(empty.empty, true);
  const stale = await ps.source({ fetch: github({}, { "latest.json": latest, "runs.json": runs(true) }).fetchImpl, db: firestore(), now: Date.parse("2026-11-03T15:00:00Z") });
  assert.equal(core.briefing({ external: { pagespeed: stale }, products: {} }).find((b) => b.key === "pagespeed:run").level, "alert");
});

test("the hourly watch opens a PR the workflow could not ask for", async () => {
  const gh = github({
    "GET /pulls": [], [`GET /branches/${encodeURIComponent(SAFE)}`]: { name: SAFE }, [`GET /branches/${encodeURIComponent(AI)}`]: { name: AI },
    "POST /pulls": (b) => ({ number: b.head === SAFE ? 8 : 9, html_url: "u", title: b.title }),
    "POST /issues/8/labels": {}, "POST /issues/9/labels": {},
    "GET /pulls/8": pr(8, SAFE), "GET /pulls/9": pr(9, AI), "GET /commits/sha8/check-runs": { check_runs: [] }
  }, { "runs.json": runs(true) });
  const note = await ps.tick(deps(gh, firestore(), DAY));
  assert.match(note, /opened #8.*opened #9/);
  assert.match(note, /#8 waits for CI/);
});
