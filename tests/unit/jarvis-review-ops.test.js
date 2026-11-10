const test = require("node:test");
const assert = require("node:assert/strict");
const ops = require("../../functions/jarvis-review-ops");
const jcore = require("../../functions/jarvis-core");
const review = require("../../functions/url-review-core");
const threat = require("../../functions/url-review-threat-lists");
const digest = require("../../functions/jarvis-digest");
const sections = require("../../functions/jarvis-sections");

const NOW = Date.parse("2026-11-10T15:00:00Z");
const HOUR = 3600 * 1000;
const at = (hours) => new Date(NOW - hours * HOUR).toISOString();
const range = { now: NOW, days: 7 };

test("rescue counts failures by cause, re-runs, Mac rescues and AI diagnoses by provider", () => {
  const out = ops.rescueSummary({
    failures: [
      { id: "f1", at: at(2), kind: "failed", host: "a.com", cause: { id: "bot-protection", label: "A bot wall refused the read" } },
      { id: "f2", at: at(3), kind: "failed", host: "b.com", cause: { id: "bot-protection", label: "A bot wall refused the read" } },
      { id: "f3", at: at(4), kind: "failed", host: "c.com", cause: { id: "timeout", label: "Timed out" } },
      { id: "s", at: at(4), kind: "stopped", host: "d.com" },
      { id: "old", at: at(24 * 9), kind: "failed", host: "e.com", cause: { id: "timeout" } }
    ],
    rescues: [
      { failedAt: at(2), status: "rescued", strategy: "mac", diagnosis: { by: "gemini", via: "vertex" }, attempts: [{ strategy: "chrome-headers", ok: false }, { strategy: "mac", ok: true }] },
      { failedAt: at(3), status: "mac-wanted", diagnosis: { by: "gemini" }, attempts: [{ strategy: "chrome-headers", ok: false }] },
      { failedAt: at(4), status: "rescued", strategy: "alt-host", diagnosis: { by: "rules" }, attempts: [{ strategy: "alt-host", ok: true }] }
    ],
    macWaiting: [{ host: "b.com", failedAt: at(3), promised: true }, { host: "x.com", failedAt: at(30) }],
    reruns: [{ at: at(1), status: "sent" }, { at: at(1), status: "held" }, { at: at(2), status: "sent" }],
    coupons: [], open: []
  }, range);
  assert.equal(out.failures.total, 3);
  assert.deepEqual(out.failures.causes[0], { label: "A bot wall refused the read", value: 2 });
  assert.deepEqual(out.reruns, { total: 3, status: [{ label: "sent", value: 2 }, { label: "held", value: 1 }], sent: 2, held: 1, failed: 0 });
  assert.equal(out.rescues.rescued, 2);
  assert.equal(out.rescues.macDone, 1);
  assert.equal(out.rescues.macPending, 2);
  assert.equal(out.rescues.macPromised, 1);
  assert.equal(out.macList[0].host, "b.com", "promised rescues first");
  assert.deepEqual(out.diagnoses, { vertex: 1, studio: 1, rules: 1 });
});

test("rescue follows each promise by its code: sent within 48 h, apologies, open ones near the deadline and redeemed codes", () => {
  const promise = (state, coupon, extra) => Object.assign({ state, coupon, at: "" }, extra || {});
  const out = ops.rescueSummary({
    failures: [
      { id: "p1", at: at(30), kind: "failed", host: "late.com", promise: promise("delivered", "SORRY-A", { closedAt: at(1) }) },
      { id: "p1b", at: at(29), kind: "failed", host: "late.com", promise: promise("delivered", "SORRY-A", { closedAt: at(1) }) },
      { id: "p2", at: at(80), kind: "failed", host: "slow.com", promise: promise("delivered", "SORRY-B", { closedAt: at(10) }) },
      { id: "p3", at: at(60), kind: "failed", host: "sorry.com", promise: promise("apologized", "SORRY-C", { closedAt: at(12) }) },
      { id: "p4", at: at(45), kind: "failed", host: "open.com", promise: promise("open", "SORRY-D", { tries: 4 }) }
    ],
    rescues: [], macWaiting: [], reruns: [],
    coupons: [{ createdAt: at(60), source: "inconclusive", uses: 1 }, { createdAt: at(30), source: "inconclusive", uses: 0 }, { createdAt: at(5), source: "outreach", uses: 1 }],
    open: [
      { id: "p4", at: at(45), host: "open.com", promise: promise("open", "SORRY-D", { tries: 4 }) },
      { id: "p5", at: at(5), host: "fresh.com", promise: promise("open", "SORRY-E", { tries: 1 }) }
    ]
  }, range);
  assert.deepEqual(out.promises, { made: 4, open: 2, atRisk: 1, delivered: 2, within48h: 1, apologized: 1, ownRun: 0, held: 0 });
  assert.deepEqual(out.codes, { sent: 2, redeemed: 1 });
  assert.equal(out.openList[0].host, "open.com");
  assert.equal(out.openList[0].hoursLeft, 3);
  assert.equal(out.openList[0].tries, 4);
});

test("fixes count requests by way, the status pipeline, PayPal package revenue and paid work that waits", () => {
  const out = ops.fixesSummary({
    requests: [
      { id: "r1", createdAt: at(10), kind: "package", package: "security-headers", status: "accepted", host: "a.com", paid: { priceUsd: 99, provider: "paypal" }, paidAt: at(24 * 6) },
      { id: "r2", createdAt: at(20), kind: "package", package: "tls-redirects", status: "in-progress", host: "b.com", paid: { priceUsd: 69, provider: "paypal" }, paidAt: at(12) },
      { id: "r3", createdAt: at(30), kind: "quote", status: "new", host: "c.com" },
      { id: "r4", createdAt: at(40), kind: "quote", status: "quoted", host: "d.com" },
      { id: "r5", createdAt: at(50), kind: "package", package: "seo-meta", status: "re-reviewed", host: "e.com", paid: { priceUsd: 119, provider: "paypal", test: true }, paidAt: at(50), rereview: { status: "done", at: at(2), result: { fixed: 3 } } },
      { id: "self-1", createdAt: at(5), kind: "self", status: "done", host: "f.com", rereview: { status: "done" } },
      { id: "old", createdAt: at(24 * 30), kind: "quote", status: "done", host: "g.com" }
    ],
    calls: [{ createdAt: at(3) }, { createdAt: at(24 * 20) }]
  }, range);
  assert.deepEqual(out.ways, { self: 1, quote: 2, package: 3, call: 1 });
  assert.deepEqual(out.pipeline, { new: 1, quoted: 1, accepted: 1, "in-progress": 1, done: 0, "re-reviewed": 1 });
  assert.equal(out.revenue.usd, 168, "test payments are left out");
  assert.equal(out.revenue.count, 2);
  assert.deepEqual(out.revenue.byPackage[0], { label: "security-headers", value: 99 });
  assert.deepEqual(out.rechecks, { total: 1, done: 1, failed: 0 });
  assert.deepEqual(out.rereviews, { total: 1, fixed: 3 });
  assert.equal(out.waiting.paid, 2);
  assert.equal(out.waiting.quotes, 1);
  assert.equal(out.paidList[0].host, "a.com", "oldest payment first");
  assert.equal(out.paidList[0].late, true, "a 3-day package paid 6 days ago is late");
  assert.equal(out.paidList[1].late, false);
});

test("checks count hits per family, quotas with the customer and sweep share, the Wordfence feed and source health", () => {
  const row = (key, verdict, severity, extra) => Object.assign({ key, verdict, severity }, extra || {});
  const out = ops.checksSummary({
    reviews: [
      { createdAt: at(2), source: "", checks: [row("sec-threatlists", "fail", "critical"), row("sec-linked-script", "fail", "critical"), row("sec-seo-spam", "person", "info", { unchecked: true })] },
      { createdAt: at(3), source: "sweep", checks: [row("sec-threatlists", "pass", "info"), row("sec-lookalike", "risk", "medium"), row("sec-seo-spam", "person", "info", { unchecked: true })] },
      { createdAt: at(4), source: "", checks: [row("sec-exposed-env", "fail", "critical"), row("sec-blocklist-2", "fail", "high"), row("sec-seo-spam", "person", "info", { unchecked: true })] },
      { createdAt: at(5), source: "", checks: null },
      { createdAt: at(5), test: true, checks: [row("sec-threatlists", "fail", "critical")] }
    ],
    webrisk: { lookups: 66000, days: { 10: 2300 }, sweeps: { 10: 1200 } },
    threat: { cloudflare: { calls: 40, scans: 12, lastOkAt: at(1) }, phishstats: { calls: 5, lastOkAt: at(30), lastErrorAt: at(2), lastError: "status 521", days: { 10: { calls: 3 } } }, urlhaus: { skipped: 40 } },
    wordfence: { startedAt: at(20), endedAt: at(19), ok: false, error: "feed answered 401" }
  }, range);
  assert.deepEqual(out.totals, { reviews: 4, counted: 3, withHits: 3 });
  const fam = Object.fromEntries(out.families.map((f) => [f.id, f]));
  assert.deepEqual([fam.phishing.checked, fam.phishing.hits, fam.phishing.customerHits], [2, 1, 1]);
  assert.equal(fam.linked.hits, 1);
  assert.equal(fam.lookalike.customerHits, 0, "a sweep hit is not a client hit");
  assert.equal(fam.exposed.critical, 1);
  assert.equal(fam.blocklist.hits, 1);
  assert.equal(fam.hacked.unchecked, 3);
  const q = Object.fromEntries(out.quotas.map((x) => [x.id, x]));
  assert.equal(q["webrisk-day"].cap, 2581);
  assert.equal(q["webrisk-day"].customer, 1100);
  assert.equal(q["webrisk-day"].sweep, 1200);
  assert.equal(q["webrisk-month"].pct, 82.5);
  assert.equal(q["urlscan-month"].used, 12);
  assert.equal(q["phishstats-day"].used, 3);
  assert.deepEqual(out.nearCap.sort(), ["webrisk-day", "webrisk-month"]);
  assert.equal(out.wordfence.stored, false);
  const src = Object.fromEntries(out.sources.map((x) => [x.key, x.state]));
  assert.deepEqual(src, { webrisk: "ok", cloudflare: "ok", phishstats: "down", urlhaus: "off", brave: "down", wordfence: "down" });
});

test("the Wordfence state reads the job row: stored, skipped, failed or never run", () => {
  assert.equal(ops.wordfenceState({ ok: true, endedAt: at(1), note: "41200 records, 9800 slugs stored" }).stored, true);
  assert.equal(ops.wordfenceState({ ok: true, endedAt: at(1), note: "skipped: WORDFENCE_KEY is not set" }).state, "off");
  assert.equal(ops.wordfenceState(null).detail, "never ran");
});

test("the briefing names promises at risk, paid fix work, quotas near the cap, a failing feed and a source down", () => {
  const rescue = { ok: true, deadlineHours: 48, promises: { made: 2, open: 1, within48h: 1, apologized: 0 }, codes: { redeemed: 0 }, rescues: { macPending: 1, macPromised: 1, macDone: 2 }, openList: [{ host: "open.com", hoursLeft: 1.5 }] };
  const fixes = { ok: true, waiting: { paid: 1, quotes: 1 }, revenue: { usd: 99, count: 1 }, paidList: [{ host: "a.com", package: "security-headers", daysWaiting: 4, late: true }] };
  const checks = { ok: true, quotas: [{ id: "webrisk-day", label: "Web Risk linked hosts today", used: 2300, cap: 2581, pct: 89.1, sweep: 1200 }], wordfence: { stored: false, state: "down", at: at(2), detail: "feed answered 401" },
    sources: [{ key: "phishstats", name: "PhishStats", state: "down", detail: "status 521" }], families: [{ id: "phishing", label: "Phishing and malware lists", hits: 1, customerHits: 1 }] };
  const lines = jcore.briefing({ products: {}, external: { rescue, fixes, checks } });
  const by = Object.fromEntries(lines.map((b) => [b.key, b]));
  assert.equal(by["review:promise-risk"].level, "alert");
  assert.match(by["review:promise-risk"].text, /open\.com \(1\.5 h left\)/);
  assert.equal(by["review:fix-paid"].level, "alert");
  assert.equal(by["review:fix-quote"].level, "warn");
  assert.equal(by["review:quota:webrisk-day"].level, "warn");
  assert.equal(by["review:wordfence"].level, "warn");
  assert.equal(by["review:source:phishstats"].level, "warn");
  assert.equal(by["review:mac"].level, "warn");
  assert.equal(by["review:fix-revenue"].level, "good");
  const proposals = jcore.proposalRules({ products: {}, external: { rescue, fixes, checks } }, lines).map((p) => p.title);
  assert.ok(proposals.includes("Get the promised review reports out before the 48-hour deadline"));
  assert.ok(proposals.includes("Start the paid fix packages"));
  assert.ok(proposals.includes("Keep the review check quotas under their caps"));
});

test("Ask carries the three review sources, and the evening digest lists promises and paid fix work that wait", () => {
  const view = ops.ask({ rescue: { ok: true, failures: { total: 3 }, reruns: { total: 1, sent: 1, held: 0 }, rescues: {}, diagnoses: { vertex: 1 }, promises: { made: 1 }, codes: { sent: 1 }, openList: [{ host: "a.com", hoursLeft: 5 }] }, fixes: { ok: false }, checks: null });
  assert.deepEqual(view.urlReviewAfterFailure.promisesOpen, ["a.com 5 h left"]);
  assert.equal(view.urlReviewFixRequests, null);
  const lines = digest.waitingLines({ promises: [{ host: "a.com", hoursLeft: 5 }], fixes: [{ host: "b.com", package: "email-dns", late: true }] });
  assert.deepEqual(lines.map((l) => l.label), ["1 promised report still open", "1 paid fix request waiting for work"]);
  assert.equal(lines[1].names, "b.com email-dns (late)");
});

test("the three sources travel in the pagespeed and money snapshot sections", () => {
  const parts = sections.split({ external: { rescue: { ok: true }, checks: { ok: true }, fixes: { ok: true } } });
  assert.ok(parts.pagespeed.external.rescue && parts.pagespeed.external.checks);
  assert.ok(parts.money.external.fixes);
});

test("a review record keeps the newer checks' keys and verdicts, and marks a search that could not run", () => {
  const summary = review.checksSummary({ insights: { findings: [
    { key: "sec-threatlists", verdict: "pass", severity: "info", title: "x" },
    { key: "sec-seo-spam", verdict: "person", severity: "info", msg: { title: { id: "sec-seo-spam.unchecked.title" } } },
    { key: "sec-hsts", verdict: "fail", severity: "high" }
  ] } });
  assert.deepEqual(summary, [{ key: "sec-threatlists", verdict: "pass", severity: "info" }, { key: "sec-seo-spam", verdict: "person", severity: "info", unchecked: true }]);
  assert.equal(review.checksSummary({ insights: { findings: [{ key: "sec-hsts" }] } }), null);
});

test("the threat-list usage write counts calls, new scans, errors and keys that are missing", () => {
  const inc = (n) => n;
  const patch = threat.usagePatch([
    { source: "cloudflare", asked: true, ok: true },
    { source: "phishstats", asked: true, ok: false, error: "status 521" },
    { source: "urlhaus", asked: false, ok: false, skipped: "URLHAUS_AUTH_KEY" },
    { source: "cloudflare-cached", asked: false, ok: true }
  ], 1, NOW, inc);
  assert.deepEqual(Object.keys(patch), ["cloudflare", "phishstats", "urlhaus"]);
  assert.equal(patch.cloudflare.scans, 1);
  assert.equal(patch.cloudflare.days["10"].calls, 1);
  assert.equal(patch.phishstats.errors, 1);
  assert.equal(patch.phishstats.lastError, "status 521");
  assert.equal(patch.urlhaus.skipped, 1);
  assert.equal(patch.urlhaus.calls, 0);
});
