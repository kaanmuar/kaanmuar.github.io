const test = require("node:test");
const assert = require("node:assert/strict");
const fix = require("../../scripts/fix-review-failures.js");

const mark = (runs, ours, site) => "3 more URL review runs failed with the cause class `bot-protection`.\n\n**Triage:** …\n<!-- review-triage " + JSON.stringify({ runs, ours, site }) + " -->";
const bug = { number: 330, title: "BE: After #319, URL reviews still failed because the site's bot protection refused the review", created_at: "2026-10-21T12:00:00Z", body: "**Found while:** #320, by the daily check of failed URL reviews", labels: [] };

test("the daily fix skips a bug with an open PR or nothing new since its last comment (#1982)", () => {
  assert.deepEqual(fix.triage(bug, [{ created_at: "2026-11-02T12:05:00Z", body: mark(3, 3, {}) }], [{ number: 2001, head: "fix/330-akamai-wall" }]), { action: "skip", why: "PR #2001 is open" });
  assert.equal(fix.triage(bug, [{ created_at: "2026-11-02T12:05:00Z", body: mark(3, 3, {}) }], [{ number: 2002, head: "fix/3300-other" }]).action, "agent");

  const settled = [
    { created_at: "2026-11-01T12:05:00Z", body: mark(4, 2, { "bot-wall": 2 }) },
    { created_at: "2026-11-01T12:40:00Z", body: "Daily fix, 2026-11-01: …\n\n" + fix.MARK }
  ];
  assert.deepEqual(fix.triage(bug, settled, []), { action: "skip", why: "no new runs since 2026-11-01" });

  const legacy = [
    { created_at: "2026-10-27T13:01:00Z", body: "Daily fix agent, 2026-10-27: **still not fixable in our code." },
    { created_at: "2026-10-28T12:05:00Z", body: "6 more URL review runs failed with the cause class `bot-protection` since this bug was last updated (2026-10-27)." }
  ];
  assert.deepEqual(fix.triage(bug, legacy, []), { action: "skip", why: "no new runs since 2026-10-27 (1 update filed before the triage marker)" });
});

test("a bug filed before the triage marker that no daily fix has seen goes to the agent", () => {
  const unseen = Object.assign({}, bug, { number: 1965, body: bug.body + "\n\n## What happened\n3 URL review runs failed with the cause class `save` on 2026-10-28." });
  const result = fix.triage(unseen, [{ created_at: "2026-10-30T12:05:00Z", body: "2 more URL review runs failed with the cause class `save` since this bug was last updated (2026-10-28)." }], []);
  assert.deepEqual(result, { action: "agent", why: "no daily fix has looked at it yet", runs: 5, ours: 5, site: {}, since: "" });
  assert.match(fix.agentPrompt([Object.assign({ bug: unseen }, result)], ""), /\(5 runs of 5 since it was filed\)/);
});

test("new runs that are all the site's own state get a comment; any run that may be ours goes to the agent", () => {
  const site = fix.triage(bug, [
    { created_at: "2026-10-27T13:01:00Z", body: "Daily fix agent, 2026-10-27: done." },
    { created_at: "2026-11-01T12:05:00Z", body: mark(5, 0, { "bot-wall": 4, "5xx": 1 }) },
    { created_at: "2026-11-02T12:05:00Z", body: mark(2, 0, { "bot-wall": 2 }) }
  ], []);
  assert.deepEqual(site, { action: "site", why: "every new run is the site's own state", runs: 7, ours: 0, site: { "bot-wall": 6, "5xx": 1 }, since: "2026-10-27T13:01:00Z" });
  const comment = fix.siteComment(site, "2026-11-02");
  assert.equal(comment, "Daily fix, 2026-11-02: the 7 new runs since 2026-10-27 are all the site's own state (6 runs behind a bot wall that refuses headless Chrome too, 1 run answering every client with a 5xx), so our code cannot fix them. The bug stays in Backlog; no agent ran.\n\n" + fix.MARK);
  assert.match(fix.siteComment({ runs: 1, site: { cert: 1 }, since: "" }, "2026-11-02"), /^Daily fix, 2026-11-02: the new run is the site's own state \(1 run with a certificate .*\), so our code cannot fix it\./);

  const mixed = fix.triage(Object.assign({}, bug, { body: bug.body + "\n" + mark(2, 1, { cert: 1 }) }), [{ created_at: "2026-11-02T12:05:00Z", body: mark(3, 0, { "bot-wall": 3 }) }], []);
  assert.deepEqual([mixed.action, mixed.runs, mixed.ours, mixed.why], ["agent", 5, 1, "1 run may be ours to fix"]);
});

test("the agent's prompt asks for code only, on a branch the script can find", () => {
  const prompt = fix.agentPrompt([{ bug, runs: 5, ours: 1, since: "2026-11-01T12:40:00Z" }], "Pre-flight (#1970): a normal ticket.");
  assert.match(prompt, /- #330 BE: After #319, .* \(1 run of 5 since 2026-11-01\)/);
  assert.match(prompt, /branch named `fix\/<n>-<short-slug>`/);
  assert.match(prompt, /Do not watch CI, merge, deploy, close or move the bug/);
  assert.match(prompt, /end the comment with the line `<!-- daily-fix -->`/);
  assert.match(prompt, /Pre-flight \(#1970\): a normal ticket\.$/);
  assert.doesNotMatch(prompt, /gh pr|gh issue|--watch/);
});

const now = Date.parse("2026-11-03T12:30:00Z");
const cache = (planPct, extra = {}, at = "2026-11-03T08:00:00Z") => Object.assign({ planPct, cycleEnd: "2026-11-20T00:00:00Z", at: Date.parse(at) }, extra);

test("the cloud run starts an agent on a known plan under 70% (#2419)", () => {
  assert.deepEqual(fix.planCheck(cache(40), now), { ok: true, line: "Cursor plan 40% used" });
  assert.equal(fix.planAllows(cache(40, { odEnabled: false }), now), true, "on-demand does not matter under 70%");
  assert.equal(fix.planAllows(cache(40, {}, "2026-10-31T08:00:00Z"), now), false, "older than two days");
  assert.equal(fix.planAllows(cache(40, { odEnabled: true, odRemaining: 30000 }, "2026-10-31T08:00:00Z"), now), false, "stale, even with credit left");
  assert.equal(fix.planAllows(null, now), false, "the Mac never uploaded one");
  assert.match(fix.planCheck(null, now).line, /^Cursor quota unknown/);
});

test("at 70% or more the agent runs only on on-demand credit of at least the floor (#2481)", () => {
  assert.deepEqual(fix.planCheck(cache(100, { odEnabled: true, odRemaining: 30000 }), now), { ok: true, line: "Cursor plan 100% used, $300.00 on-demand credit left, at or over the $20 floor" });
  assert.equal(fix.planAllows(cache(70, { odEnabled: true, odRemaining: 2000 }), now), true, "exactly $20 left");
  assert.deepEqual(fix.planCheck(cache(70, { odEnabled: true, odRemaining: 1999 }), now), { ok: false, line: "Cursor plan 70% used, $19.99 on-demand credit left, under the $20 floor" });
  assert.deepEqual(fix.planCheck(cache(85, { odEnabled: false, odRemaining: 30000 }), now), { ok: false, line: "Cursor plan 85% used, on-demand off" });
  assert.deepEqual(fix.planCheck(cache(85), now), { ok: false, line: "Cursor plan 85% used, on-demand off" }, "a copy uploaded before #2481");
  assert.deepEqual(fix.planCheck(cache(85, { odEnabled: true }), now), { ok: false, line: "Cursor plan 85% used, on-demand credit left unknown" });
  assert.equal(fix.planAllows(cache(100, { odEnabled: true, odRemaining: 4000 }), now, 50), false, "a $50 floor");
  assert.equal(fix.planAllows(cache(100, { odEnabled: true, odRemaining: 100 }), now, 0), true, "a $0 floor");
});

test("FIX_REVIEW_OD_FLOOR overrides the $20 floor only with a number of dollars (#2481)", () => {
  assert.equal(fix.odFloor("50"), 50);
  assert.equal(fix.odFloor("0"), 0);
  assert.equal(fix.odFloor("12.5"), 12.5);
  for (const value of [undefined, "", " ", "abc", "-5"]) assert.equal(fix.odFloor(value), 20, JSON.stringify(value));
});

test("a failed CI says whether the retry agent ran or was held back, and why (#2481)", () => {
  const pr = { number: 2500 };
  assert.match(fix.ciFailComment(pr, { ok: true, line: "Cursor plan 40% used" }, "boom"), /^Daily fix: CI still fails on #2500 after one retry, so it is left open for a person\.\n\n```\nboom\n```$/);
  const held = fix.planCheck(cache(100, { odEnabled: true, odRemaining: 1200 }), now);
  assert.match(fix.ciFailComment(pr, held, "boom"), /^Daily fix: CI fails on #2500 and the retry agent was held back \(Cursor plan 100% used, \$12\.00 on-demand credit left, under the \$20 floor\), so it is left open for a person\./);
});

test("the Mac uploads only the plan fields the cloud run reads (#2419, #2481)", () => {
  const { quotaPayload } = require("../../scripts/fix-review-failures-sync.js");
  const full = { planPct: 41, cycleEnd: "2026-11-20T00:00:00Z", at: 1793700000, odEnabled: true, odRemaining: 2550, odUsed: 1234, odLimit: 5000, team: "QA lab" };
  assert.deepEqual(JSON.parse(quotaPayload(full)), { planPct: 41, cycleEnd: "2026-11-20T00:00:00Z", at: 1793700000, odEnabled: true, odRemaining: 2550 });
  assert.equal(quotaPayload(null), null);
});