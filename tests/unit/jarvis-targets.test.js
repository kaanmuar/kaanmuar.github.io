// Jarvis's 90-day targets (#2649): what each target counts since the plan start, the verdict, and the hand-kept log.
const test = require("node:test");
const assert = require("node:assert/strict");
const tg = require("../../functions/jarvis-targets.js");
const core = require("../../functions/jarvis-core.js");

const PLAN = {
  start: "2026-10-26", end: "2027-01-24",
  targets: [{ key: "unlocks", label: "Paid report unlocks", target: "30" }, { key: "agencies", label: "Agencies buying 3+ reports", target: "5" },
    { key: "calls", label: "Discovery calls", target: "6" }, { key: "clips", label: "Segment clips published", target: "12" },
    { key: "links", label: "Links from education or partner sites", target: "15" }, { key: "contracts", label: "Consulting contracts", target: "1" }]
};
const START = Date.parse("2026-10-26T00:00:00Z");
const NOW = Date.parse("2026-11-05T18:00:00Z");
const paid = (at, email, status = "paid-report", extra = {}) => Object.assign({ createdAt: at, email, status, paid: true, priceUsd: 9 }, extra);

test("counts every paid, non-refunded purchase since the start, and company domains with three or more", () => {
  const reviews = [
    paid("2026-10-20T10:00:00Z", "a@acme.io"),
    paid("2026-10-27T10:00:00Z", "a@acme.io"), paid("2026-10-28T10:00:00Z", "b@acme.io", "paid-addon"), paid("2026-10-29T10:00:00Z", "c@acme.io", "run-credit"),
    paid("2026-10-30T10:00:00Z", "x@gmail.com"), paid("2026-10-31T10:00:00Z", "x@gmail.com"), paid("2026-11-01T10:00:00Z", "x@gmail.com"),
    paid("2026-11-02T10:00:00Z", "r@acme.io", "paid-report", { refunded: true }), paid("2026-11-02T11:00:00Z", "t@acme.io", "paid-report", { test: true }),
    { createdAt: "2026-11-03T10:00:00Z", email: "f@acme.io", status: "done", paid: false },
    { createdAt: "2026-11-03T11:00:00Z", email: "g@acme.io", status: "complete", paid: true, priceUsd: 0 }, paid("2026-11-03T12:00:00Z", "h@acme.io", "paid-report", { priceUsd: 0 })
  ];
  const auto = tg.autoRows({ reviews, bookings: [], videos: [], start: START, now: NOW });
  assert.equal(auto.unlocks.length, 6);
  assert.deepEqual(auto.agencies.map((r) => r.text), ["acme.io · 3 purchases"]);
  assert.equal(auto.agencies[0].at, "2026-10-29T10:00:00.000Z");
});

test("counts site calls once held, not CV calls, and clips that name a segment", () => {
  const bookings = [{ type: "intro", start: "2026-10-30T15:00:00Z", name: "Ana", company: "Uni" }, { type: "cv", start: "2026-10-31T15:00:00Z" },
    { type: "call", start: "2026-11-20T15:00:00Z" }, { type: "walkthrough", start: "2026-11-01T15:00:00Z", status: "cancelled" }];
  const videos = [{ id: "a", title: "Accessibility for teachers", published: "2026-10-28T00:00:00Z", tags: ["Education"] },
    { id: "b", title: "Headers #Shorts", published: "2026-10-29T00:00:00Z", description: "For #startups shipping fast" },
    { id: "c", title: "Headers #Shorts", published: "2026-10-30T00:00:00Z", tags: ["security"] },
    { id: "d", title: "Old", published: "2026-10-01T00:00:00Z", tags: ["agency"] }];
  const auto = tg.autoRows({ reviews: [], bookings, videos, start: START, now: NOW });
  assert.deepEqual(auto.calls.map((r) => r.text), ["Ana · Uni"]);
  assert.deepEqual(auto.clips.map((r) => r.url), ["https://youtu.be/b", "https://youtu.be/a"]);
  assert.equal(tg.segmentOf({ tags: ["Marketing Agency"] }), "agencies");
  assert.equal(tg.segmentOf({ title: "No tags here" }), "");
});

test("judges done, on pace, behind, missed and quiet hand-logged targets", () => {
  const days = { day: 40, length: 91 };
  assert.equal(tg.judge({ actual: 30, target: 30 }, days, NOW).status, "done");
  assert.equal(tg.judge({ actual: 0, target: 1, done: { at: "x" } }, days, NOW).status, "done");
  const behind = tg.judge({ actual: 5, target: 30, auto: true }, days, NOW);
  assert.equal(behind.status, "behind");
  assert.equal(behind.expected, 13.2);
  assert.equal(behind.perWeek, 3.4);
  assert.equal(tg.judge({ actual: 12, target: 30, auto: true }, days, NOW).status, "on-pace");
  assert.equal(tg.judge({ actual: 0, target: 30 }, { day: 5, length: 91 }, NOW).status, "on-pace");
  assert.equal(tg.judge({ actual: 2, target: 6 }, { day: 92, length: 91 }, NOW).status, "missed");
  assert.equal(tg.judge({ actual: 0, target: 1, lastAt: "" }, { day: 20, length: 91 }, NOW).stale, true);
  assert.equal(tg.judge({ actual: 0, target: 1, auto: true }, { day: 20, length: 91 }, NOW).stale, false);
});

test("adds logged entries, only counts links that link to us, and a correction starts the count again", () => {
  const kept = {
    entries: [{ id: "1", key: "contracts", at: "2026-11-01T10:00:00Z", count: 1, note: "Acme audit" },
      { id: "2", key: "links", at: "2026-11-01T10:00:00Z", url: "https://uni.edu/a", check: { ok: true, detail: "Links to qalabreview.com.", at: "x" } },
      { id: "3", key: "links", at: "2026-11-02T10:00:00Z", url: "https://uni.edu/b", check: { ok: false, detail: "No link", at: "x" } },
      { id: "4", key: "calls", at: "2026-11-03T10:00:00Z", count: 2, note: "Zoom calls" }],
    fix: { unlocks: { value: 10, at: "2026-11-01T00:00:00Z" } }
  };
  const auto = { unlocks: [{ at: "2026-10-30T00:00:00Z", text: "x" }, { at: "2026-11-02T00:00:00Z", text: "y" }], agencies: [], calls: [{ at: "2026-10-30T15:00:00Z", text: "Ana" }], clips: [] };
  const rows = tg.build(PLAN, kept, auto, NOW);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.unlocks.actual, 11);
  assert.equal(by.calls.actual, 3);
  assert.equal(by.contracts.actual, 1);
  assert.equal(by.contracts.status, "done");
  assert.equal(by.links.actual, 1);
  assert.equal(by.links.items.find((i) => i.source === "failing").id, "3");
  assert.ok(by.calls.next.some((n) => n.copy === "https://qalabreview.com/call"));
  assert.match(by.contracts.how, /Logged by hand/);
});

test("only fetches public pages, and finds links to our domains", async () => {
  assert.equal(tg.publicUrl("https://uni.edu/partners"), true);
  ["http://localhost/", "http://10.0.0.1/", "http://metadata.google.internal/", "ftp://uni.edu/", "nonsense"].forEach((u) => assert.equal(tg.publicUrl(u), false, u));
  const page = (body, status = 200) => async () => ({ ok: status === 200, status, text: async () => body });
  assert.equal((await tg.checkLink(page('<a href="https://www.qalabreview.com/edu">QA</a>'), "https://uni.edu/a", NOW)).ok, true);
  assert.equal((await tg.checkLink(page("<p>carlosandmunoz.com in text only</p>"), "https://uni.edu/a", NOW)).ok, false);
  assert.equal((await tg.checkLink(page("", 404), "https://uni.edu/a", NOW)).detail, "The page answered 404.");
});

function fakeDb(docs) {
  const store = docs;
  const ref = (path) => ({
    get: async () => ({ exists: !!store[path], data: () => JSON.parse(JSON.stringify(store[path])) }),
    set: async (data, opts) => {
      if (!(opts && opts.merge)) { store[path] = JSON.parse(JSON.stringify(data)); return; }
      const merge = (a, b) => { Object.keys(b).forEach((k) => { a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? merge(Object.assign({}, a[k]), b[k]) : b[k]; }); return a; };
      store[path] = merge(store[path] || {}, JSON.parse(JSON.stringify(data)));
    }
  });
  return { store, collection: (c) => ({ doc: (d) => ref(c + "/" + d) }) };
}

test("logs, corrects, marks done and removes through the outreach-target op", async () => {
  const db = fakeDb({ "jarvis_settings/outreach": PLAN });
  const ctx = { db, now: NOW, fetch: async () => ({ ok: true, status: 200, text: async () => '<a href="//carlosandmunoz.com/">x</a>' }) };
  assert.match((await tg.act(ctx, { action: "log", key: "contracts", note: "Acme" }, "carlos")).label, /Consulting contracts: logged/);
  const link = await tg.act(ctx, { action: "log", key: "links", url: "https://uni.edu/p" }, "carlos");
  assert.equal(link.check.ok, true);
  await assert.rejects(tg.act(ctx, { action: "log", key: "links" }, "carlos"), /Paste the address/);
  await assert.rejects(tg.act(ctx, { action: "log", key: "nope" }, "carlos"), /not one of the 90-day targets/);
  await tg.act(ctx, { action: "correct", key: "unlocks", value: "4" }, "carlos");
  await tg.act(ctx, { action: "done", key: "talks" }, "carlos").catch(() => null);
  await tg.act(ctx, { action: "done", key: "contracts", proof: "signed PDF" }, "carlos");
  const kept = db.store["jarvis_settings/outreach-targets"];
  assert.equal(kept.entries.length, 2);
  assert.equal(kept.fix.unlocks.value, 4);
  assert.equal(kept.done.contracts.proof, "signed PDF");
  await tg.act(ctx, { action: "undone", key: "contracts" }, "carlos");
  assert.equal(db.store["jarvis_settings/outreach-targets"].done.contracts, undefined);
  await tg.act(ctx, { action: "remove", id: kept.entries[0].id }, "carlos");
  assert.equal(db.store["jarvis_settings/outreach-targets"].entries.length, 1);
});

test("behind targets become a briefing line, one grouped proposal and Sunday's push", () => {
  const targets = { ok: true, day: 40, length: 91, targets: [
    { key: "unlocks", label: "Paid report unlocks", actual: 5, target: 30, status: "behind", expected: 13.2, perWeek: 4.6 },
    { key: "calls", label: "Discovery calls", actual: 1, target: 6, status: "behind", expected: 2.6, perWeek: 1 },
    { key: "contracts", label: "Consulting contracts", actual: 0, target: 1, status: "on-pace", stale: true }] };
  const items = core.briefing({ products: {}, external: { targets }, thresholds: {}, goals: [] });
  assert.ok(items.some((i) => i.key === "targets:behind:unlocks" && i.level === "warn"));
  assert.ok(items.some((i) => i.key === "targets:stale:contracts"));
  const props = core.proposalRules({ products: {}, external: { targets }, thresholds: {}, goals: [] }, items).filter((p) => p.key === "targets:behind");
  assert.equal(props.length, 1);
  assert.equal(props[0].title, "Catch up on 2 90-day targets");
  const push = tg.weeklyPush(targets);
  assert.equal(push.kind, "outreach");
  assert.match(push.body, /Paid report unlocks: 5 of 30, 4.6 a week from here/);
  assert.equal(tg.weeklyPush({ ok: true, targets: [{ status: "on-pace" }] }), null);
});
