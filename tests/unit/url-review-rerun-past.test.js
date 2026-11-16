const test = require("node:test");
const assert = require("node:assert/strict");
const fixOffers = require("../../functions/url-review-fix-offers");
const past = require("../../functions/url-review-rerun-past");

const DURING = Date.parse("2026-11-16T12:00:00Z");
const AFTER = Date.parse("2026-12-11T05:00:00Z");

function fakeDb() {
  const docs = new Map();
  const ref = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => ref(path + "/" + name + "/" + id) }),
    get: async () => snap(path)
  });
  const snap = (path) => ({ exists: docs.has(path), get: (key) => (docs.get(path) || {})[key], data: () => docs.get(path) });
  return {
    docs,
    collection: (name) => ({ doc: (id) => ref(name + "/" + id) }),
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r.path),
      set: (r, data) => docs.set(r.path, data),
      create: (r, data) => { if (docs.has(r.path)) throw new Error("exists"); docs.set(r.path, data); }
    })
  };
}

test("describe names the shared sweep cap, two 50% uses, and no packages", () => {
  const plan = past.describe({ status: "running", hosts: 10, reviewed: 2, mailed: 1, skipped: 1 }, {});
  assert.equal(plan.id, "rerun-past-2026");
  assert.equal(plan.ticket, 3458);
  assert.equal(plan.status, "running");
  assert.equal(plan.perDay, 96);
  assert.equal(plan.percent, 50);
  assert.equal(plan.uses, 2);
  assert.equal(plan.packages, false);
  assert.equal(plan.until, fixOffers.LAUNCH.until);
  assert.match(plan.line, /one mail goes out after the new report is ready/i);
  assert.match(plan.line, /does not apply to fix packages/i);
});

test("gate stays off until PAST_RERUN_LIVE=1 and status is running", () => {
  assert.equal(past.gate({ env: {}, progress: { status: "running" } }).why, "env-off");
  assert.equal(past.gate({ env: { PAST_RERUN_LIVE: "1" }, progress: {} }).why, "not-started");
  assert.equal(past.gate({ env: { PAST_RERUN_LIVE: "1" }, progress: { status: "paused" } }).why, "paused");
  assert.equal(past.gate({ env: { PAST_RERUN_LIVE: "1" }, progress: { status: "done" } }).why, "done");
  assert.deepEqual(past.gate({ env: { PAST_RERUN_LIVE: "1" }, progress: { status: "running" } }), { ok: true });
});

test("roomLeft shares the sweep daily cap", () => {
  assert.equal(past.roomLeft(0, 96), 96);
  assert.equal(past.roomLeft(90, 96), 6);
  assert.equal(past.roomLeft(96, 96), 0);
  assert.equal(past.roomLeft(100, 96), 0);
});

test("hostsFromReviews keeps one bare host, visitors before rivals before sweeps", () => {
  const rows = [
    { id: "s1", status: "complete", source: "sweep", sweep: { cc: "co" }, createdAt: "2026-11-01T00:00:00Z", report: { host: "www.Acme.co" } },
    { id: "v1", status: "complete", source: "web", email: "ana@acme.co", lang: "es", createdAt: "2026-11-02T00:00:00Z", report: { host: "acme.co" } },
    { id: "r1", status: "complete", source: "rivals", email: "bot@other.test", createdAt: "2026-11-03T00:00:00Z", report: { host: "rival.test" } },
    { id: "own", status: "complete", email: "x@carlosandmunoz.com", createdAt: "2026-11-04T00:00:00Z", report: { host: "mine.test" } },
    { id: "open", status: "running", email: "a@b.co", createdAt: "2026-11-05T00:00:00Z", report: { host: "open.test" } }
  ];
  const hosts = past.hostsFromReviews(rows);
  assert.deepEqual(hosts.map((h) => h.bare), ["acme.co", "rival.test"]);
  assert.equal(hosts[0].kind, "visitor");
  assert.equal(hosts[0].email, "ana@acme.co");
  assert.equal(hosts[0].lang, "es");
  assert.equal(hosts[1].kind, "rival");
});

test("mailAddress only writes to known contacts who did not opt out", () => {
  const visitor = { kind: "visitor", email: "ana@acme.co" };
  const sweep = { kind: "sweep", email: "ops@acme.co" };
  assert.equal(past.mailAddress(visitor, { stops: new Set() }), "ana@acme.co");
  assert.equal(past.mailAddress(visitor, { stops: new Set(["ana@acme.co"]) }), "");
  assert.equal(past.mailAddress(sweep, { stops: new Set(), contacted: new Set() }), "");
  assert.equal(past.mailAddress(sweep, { stops: new Set(), contacted: new Set(["ops@acme.co"]) }), "ops@acme.co");
  assert.equal(past.mailAddress(sweep, { stops: new Set(["@acme.co"]), contacted: new Set(["ops@acme.co"]) }), "");
});

test("coupon is 50% with two uses until launch ends, and mint is once per address", async () => {
  const coupon = past.couponFor({ email: "Ana@Acme.co", host: "www.acme.co" }, DURING);
  assert.equal(coupon.percent, 50);
  assert.equal(coupon.maxUses, 2);
  assert.deepEqual(coupon.purposes, ["new-run", "report"]);
  assert.equal(coupon.source, "rerun-past");
  assert.equal(coupon.campaign, past.ID);
  assert.equal(coupon.host, "acme.co");
  assert.equal(coupon.validUntil, fixOffers.LAUNCH.endsAt);

  const db = fakeDb();
  const rand = (() => { let i = 0; return () => (i++ % 31); })();
  const first = await past.mintFor(db, { email: "ana@acme.co", host: "acme.co" }, DURING, rand);
  const second = await past.mintFor(db, { email: "ana@acme.co", host: "acme.co" }, DURING, rand);
  assert.equal(first, second);
  assert.match(first, /^RERUN-[A-Z0-9]{8}$/);
  assert.equal(db.docs.get("url_review_coupons/" + first).maxUses, 2);
  await assert.rejects(() => past.mintFor(db, { email: "b@c.co", host: "c.co" }, AFTER, rand), /launch window ended/i);
});

test("progressAfter tallies reviewed, mailed and skipped, and marks done when the queue is empty", () => {
  const base = { status: "running", hosts: 2, reviewed: 0, mailed: 0, skipped: 0 };
  const afterMail = past.progressAfter(base, "mailed", DURING);
  assert.equal(afterMail.reviewed, 1);
  assert.equal(afterMail.mailed, 1);
  assert.equal(afterMail.status, "running");
  const afterSkip = past.progressAfter(afterMail, "skipped", DURING);
  assert.equal(afterSkip.skipped, 1);
  assert.equal(afterSkip.status, "done");
});

test("mailFor builds a note with the new report and the code", () => {
  const mail = past.mailFor(
    { id: "r-new", lang: "en", report: { host: "acme.co" } },
    { code: "RERUN-ABCD2345", stopUrl: "https://example.com/stop" }
  );
  assert.match(mail.subject, /50%/);
  assert.match(mail.text, /RERUN-ABCD2345/);
  assert.match(mail.text, /acme\.co/);
  assert.match(mail.html, /RERUN-ABCD2345/);
});
