const test = require("node:test");
const assert = require("node:assert/strict");
const days = require("../../functions/jarvis-days");
const jarvis = require("../../functions/jarvis");
const sources = require("../../functions/jarvis-sources");
const core = require("../../functions/jarvis-core");

const HOUR = 3600000;
const DAY = 24 * HOUR;

// Firestore as Jarvis uses it, counting reads the way Firestore bills them: one per document returned, one for an empty query.
function fakeDb(rows) {
  const docs = {};
  const stats = { reads: 0, queries: [] };
  const ms = (v) => (v && typeof v.toDate === "function" ? v.toDate().getTime() : v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) : v);
  const pass = (row, [field, op, value]) => {
    if (row[field] === undefined) return false;
    const a = typeof value === "boolean" || typeof value === "string" && !/^\d{4}-/.test(value) ? row[field] : ms(row[field]);
    const b = typeof value === "boolean" || typeof value === "string" && !/^\d{4}-/.test(value) ? value : ms(value);
    return op === ">=" ? a >= b : op === "<" ? a < b : op === "==" ? a === b : false;
  };
  const pick = (row, fields) => {
    if (!fields) return Object.assign({}, row);
    const out = {};
    fields.forEach((f) => {
      const [head, sub] = f.split(".");
      if (!(head in row)) return;
      if (!sub) out[head] = row[head];
      else if (row[head] && sub in row[head]) out[head] = Object.assign(out[head] || {}, { [sub]: row[head][sub] });
    });
    return out;
  };
  const merge = (a, b) => {
    const out = Object.assign({}, a);
    Object.keys(b).forEach((k) => { out[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && !(b[k] instanceof Date) && a[k] ? merge(a[k], b[k]) : b[k]; });
    return out;
  };
  const query = (name, filters, fields, order, cap) => ({
    where: (f, op, v) => query(name, filters.concat([[f, op, v]]), fields, order, cap),
    orderBy: (f, dir) => query(name, filters, fields, { f, desc: dir === "desc" }, cap),
    select: (...f) => query(name, filters, f, order, cap),
    limit: (n) => query(name, filters, fields, order, n),
    count: () => ({ get: async () => { stats.reads += 1; return { data: () => ({ count: (rows[name] || []).filter((r) => filters.every((f) => pass(r, f))).length }) }; } }),
    get: async () => {
      let list = (rows[name] || []).filter((r) => filters.every((f) => pass(r, f)));
      if (order) list = list.slice().sort((x, y) => (ms(x[order.f]) - ms(y[order.f])) * (order.desc ? -1 : 1));
      if (cap) list = list.slice(0, cap);
      stats.reads += Math.max(1, list.length);
      stats.queries.push(name);
      return { docs: list.map((r) => ({ id: r.id, data: () => pick(r, fields), get: (f) => r[f] })) };
    },
    doc: (id) => ({
      get: async () => { stats.reads += 1; const d = docs[name + "/" + id]; return { exists: !!d, data: () => d }; },
      set: async (value, opts) => { docs[name + "/" + id] = opts && opts.merge ? merge(docs[name + "/" + id] || {}, value) : value; }
    })
  });
  return { collection: (name) => query(name, []), docs, stats };
}

const NOW = Date.parse("2026-11-01T15:00:00Z");
const ts = (ms) => ({ toDate: () => new Date(ms), toMillis: () => ms });

function seed() {
  const events = [], opens = [], reviews = [];
  for (let h = 1; h < 20 * 24; h += 3) {
    events.push({ id: "e" + h, site: h % 2 ? "cv" : "lab", kind: "visit", createdAt: ts(NOW - h * HOUR) });
    opens.push({ id: "o" + h, createdAt: ts(NOW - h * HOUR), page: "/qa-review.html", ip: "1.2.3.4", userAgent: "UA", acceptLanguage: "es" });
  }
  for (let h = 2; h < 20 * 24; h += 12) reviews.push({ id: "r" + h, createdAt: new Date(NOW - h * HOUR).toISOString(), status: "complete", paid: false, score: 70, report: "x".repeat(1000), email: "a@b.co" });
  return { site_events: events, url_review_opens: opens, url_reviews: reviews };
}

test("a range reads one document per closed day after the first build, and the same rows as a raw read", async () => {
  days._memo.clear();
  const db = fakeDb(seed());
  const from = NOW - 14 * DAY;
  const first = await days.rows(db, ["events", "opens", "reviews"], { from, now: NOW });
  const rawEvents = seed().site_events.filter((r) => r.createdAt.toMillis() >= from);
  assert.equal(first.events.length, rawEvents.length);
  assert.deepEqual(first.events.map((r) => r.id), rawEvents.map((r) => r.id));
  days._memo.clear();
  db.stats.reads = 0;
  const again = await days.rows(db, ["events", "opens", "reviews"], { from, now: NOW });
  assert.deepEqual(again.events.map((r) => r.id), first.events.map((r) => r.id));
  assert.deepEqual(again.reviews.map((r) => r.id), first.reviews.map((r) => r.id));
  const openDayRows = (rows) => rows.filter((r) => days.toMs(r.createdAt) >= Date.parse("2026-11-01T00:00:00Z")).length;
  // meta + 14 day documents (Oct 18 to 31) + the open day's rows of each kind + the refunded-review probe
  assert.equal(db.stats.reads, 1 + 14 + openDayRows(first.events) + openDayRows(first.opens) + Math.max(1, openDayRows(first.reviews)) + 1);
  assert.ok(db.stats.reads < 60, "reads " + db.stats.reads + " vs " + (first.events.length + first.opens.length + first.reviews.length) + " raw");
});

test("stored days keep only the fields Jarvis reads: no ip, user agent or review report", async () => {
  days._memo.clear();
  const db = fakeDb(seed());
  await days.rows(db, ["opens", "reviews"], { from: NOW - 3 * DAY, now: NOW });
  const doc = db.docs["jarvis_days/2026-10-30_365"];
  assert.ok(doc && doc.expireAt instanceof Date);
  assert.equal(doc.expireAt.toISOString(), "2027-10-31T00:00:00.000Z");
  const open = doc.parts.opens.rows[0];
  assert.ok(open.page && !("ip" in open) && !("userAgent" in open) && !("acceptLanguage" in open));
  assert.ok(doc.parts.reviews.rows.length && doc.parts.reviews.rows.every((r) => !("report" in r)));
});

test("a stored day whose rows may still change is read again after 6 hours, and settles", async () => {
  days._memo.clear();
  const db = fakeDb(seed());
  await days.rows(db, ["reviews"], { from: NOW - 2 * DAY, now: NOW });
  const key = "jarvis_days/2026-10-31_365";
  assert.equal(db.docs[key].parts.reviews.final, false);
  const stored = db.docs[key].parts.reviews.rows.length;
  db.stats.queries = [];
  days._memo.clear();
  await days.rows(db, ["reviews"], { from: NOW - 2 * DAY, now: NOW + HOUR });
  assert.equal(db.stats.queries.filter((q) => q === "url_reviews").length, 2, "open day and the refunded probe only");
  await days.rows(db, ["reviews"], { from: NOW - 2 * DAY, now: NOW + 3 * DAY });
  assert.equal(db.docs[key].parts.reviews.final, true);
  assert.equal(db.docs[key].parts.reviews.rows.length, stored);
});

test("a refunded review is read live over the stored copy", async () => {
  days._memo.clear();
  const data = seed();
  const db = fakeDb(data);
  const from = NOW - 7 * DAY;
  await days.rows(db, ["reviews"], { from, now: NOW });
  const target = data.url_reviews.find((r) => Date.parse(r.createdAt) < NOW - 3 * DAY);
  target.refunded = true;
  target.refundedUsd = 9;
  const out = await days.rows(db, ["reviews"], { from, now: NOW });
  const row = out.reviews.find((r) => r.id === target.id);
  assert.equal(row.refunded, true);
  assert.equal(row.refundedUsd, 9);
});

test("days before a source's first row and past its retention are not read", async () => {
  days._memo.clear();
  const db = fakeDb({ url_review_failures: [{ id: "f1", at: new Date(NOW - 5 * DAY).toISOString(), host: "a.com", cause: "timeout" }] });
  const out = await days.rows(db, ["failures"], { from: NOW - 300 * DAY, now: NOW });
  assert.deepEqual(out.failures.map((r) => r.id), ["f1"]);
  const stored = Object.keys(db.docs).filter((k) => k.startsWith("jarvis_days/2"));
  assert.ok(stored.every((k) => k.endsWith("_90")), stored.join());
  assert.equal(stored.length, 5);
});

test("a day too large for one document keeps its rows out and is read raw", async () => {
  days._memo.clear();
  const big = [];
  for (let i = 0; i < 400; i += 1) big.push({ id: "b" + i, site: "cv", kind: "visit", page: "x".repeat(3000), createdAt: ts(Date.parse("2026-10-30T12:00:00Z") + i) });
  const db = fakeDb({ site_events: big });
  const out = await days.rows(db, ["events"], { from: NOW - 3 * DAY, now: NOW });
  assert.equal(out.events.length, 400);
  assert.equal(db.docs["jarvis_days/2026-10-30_365"].parts.events.over, true);
  assert.equal(db.docs["jarvis_days/2026-10-30_365"].parts.events.rows.length, 0);
  days._memo.clear();
  assert.equal((await days.rows(db, ["events"], { from: NOW - 3 * DAY, now: NOW })).events.length, 400);
});

test("rows for the browser carry Timestamps as ISO strings", () => {
  const row = days.plain({ id: "x", createdAt: ts(Date.parse("2026-10-30T12:00:00Z")), page: "/", at: "2026-10-30T12:00:00Z" });
  assert.deepEqual(row, { id: "x", createdAt: "2026-10-30T12:00:00.000Z", page: "/", at: "2026-10-30T12:00:00Z" });
});

test("health counts the logged collections through the day documents", async () => {
  days._memo.clear();
  const db = fakeDb({
    url_review_failures: [{ id: "f1", at: new Date(NOW - 2 * DAY).toISOString(), host: "a.com", cause: { label: "TLS failed" }, error: { message: "bad cert", stack: "long" } }],
    url_review_owner_notices: [
      { id: "n1", createdAt: new Date(NOW - 3 * DAY).toISOString(), status: "pending", lastError: "no MX", email: "x@a.com" },
      { id: "n2", createdAt: new Date(NOW - 2 * HOUR).toISOString(), status: "sent" }
    ],
    ops_runs: [{ id: "sweepReviews", ok: true }]
  });
  const h = await jarvis.health(db, { days: 7, now: NOW });
  assert.equal(h.failures.total, 1);
  assert.equal(h.failures.causes[0].label, "TLS failed");
  assert.equal(h.failures.latest[0].message, "bad cert");
  assert.deepEqual([h.notices.total, h.notices.failed], [2, 1]);
  assert.ok(!("email" in db.docs["jarvis_days/2026-10-29_365"].parts.notices.rows[0]));
});

// A month of what health counts: 39 tracked jobs and the logged collections at roughly their live rates.
function healthSeed() {
  const iso = (ms) => new Date(ms).toISOString();
  const data = { ops_runs: [], url_review_failures: [], url_review_alerts: [], url_review_owner_notices: [], url_review_rivals: [], url_review_captures: [], url_review_reruns: [], url_review_coupons: [] };
  for (let i = 0; i < 39; i += 1) data.ops_runs.push({ id: "job" + i, job: "job" + i, ok: true, startedAt: iso(NOW - (i + 2) * 20 * 60000), endedAt: iso(NOW - (i + 2) * 20 * 60000 + 30000), note: "", error: "" });
  for (let m = 30; m < 31 * 24 * 60; m += 30) {
    const at = iso(NOW - m * 60000);
    if (m % 60 === 0) data.url_review_failures.push({ id: "f" + m, at, host: "h" + (m % 7) + ".com", cause: { label: m % 3 ? "Timeout" : "TLS failed" }, error: { message: "boom" } });
    if (m % 360 === 0) data.url_review_alerts.push({ id: "a" + m, at, kind: "paid", title: "Paid review", url: "https://x.co" });
    if (m % 480 === 0) data.url_review_owner_notices.push({ id: "n" + m, createdAt: at, status: m % 960 ? "sent" : "pending" });
    if (m % 720 === 0) data.url_review_rivals.push({ id: "v" + m, createdAt: at });
    data.url_review_captures.push({ id: "c" + m, at, kind: m % 4 ? "lead" : "email" });
  }
  return data;
}

test("health re-reads only what changed since its last check (#2101)", async (t) => {
  days._memo.clear();
  const data = healthSeed();
  const db = fakeDb(data);
  const at = (min) => NOW + min * 60000;
  await jarvis.health(db, { days: 30, now: at(0) });

  // Before #2101: every minute-cache miss read the meta and day documents, the whole open day and every ops_runs job.
  days._memo.clear();
  delete db.docs["jarvis_cache/state-health"];
  db.stats.reads = 0;
  await jarvis.health(db, { days: 30, now: at(2) });
  const before = db.stats.reads - 1;

  db.stats.reads = 0;
  const warm = await jarvis.health(db, { days: 30, now: at(4) });
  const warmReads = db.stats.reads;
  days._memo.clear();
  db.stats.reads = 0;
  const cold = await jarvis.health(db, { days: 30, now: at(6) });
  const coldReads = db.stats.reads;
  t.diagnostic("30-day health reads per miss: " + before + " before, " + warmReads + " warm, " + coldReads + " cold");

  // Every query left costs at least one read: four write-once sources since their newest row, two ops_runs stamps,
  // re-runs and coupons; a cold instance adds the state document and the open day's notices.
  assert.ok(warmReads <= 10, "warm reads " + warmReads);
  assert.ok(coldReads <= warmReads + 2, "cold reads " + coldReads);
  assert.ok(warmReads * 5 < before, warmReads + " vs " + before);
  assert.deepEqual(warm, await jarvis.health(fakeDb(data), { days: 30, now: at(4) }));
  assert.deepEqual(cold, await jarvis.health(fakeDb(data), { days: 30, now: at(6) }));
});

test("a failure, an alert, a notice change and a failed job written since the last check still alert on time", async () => {
  days._memo.clear();
  const data = healthSeed();
  const db = fakeDb(data);
  const at = (min) => NOW + min * 60000;
  const first = await jarvis.health(db, { days: 1, now: at(0) });
  const iso = (min) => new Date(at(min)).toISOString();
  // A run committed a few minutes after its own timestamp, behind a newer one.
  data.url_review_failures.push({ id: "late", at: iso(-4), host: "late.com", cause: { label: "Timeout" }, error: { message: "slow" } });
  data.url_review_failures.push({ id: "new", at: iso(1), host: "new.com", cause: { label: "Timeout" }, error: { message: "boom" } });
  data.url_review_alerts.push({ id: "a-new", at: iso(1), kind: "paid", title: "Paid review", url: "https://y.co" });
  Object.assign(data.url_review_owner_notices[0], { status: "pending", lastError: "no MX" });
  Object.assign(data.ops_runs.find((row) => row.id === "job30"), { ok: false, endedAt: iso(1), error: "quota" });
  // The 2-minute open-day memo (wall clock) has run out; the held state stays.
  Array.from(days._memo.keys()).filter((key) => !key.startsWith("state|")).forEach((key) => days._memo.delete(key));

  const h = await jarvis.health(db, { days: 1, now: at(2) });
  assert.deepEqual(h, await jarvis.health(fakeDb(data), { days: 1, now: at(2) }));
  assert.deepEqual(h.failures.latest.slice(0, 2).map((row) => row.host), ["new.com", "late.com"]);
  assert.equal(h.alerts.latest[0].url, "https://y.co");
  assert.equal(h.notices.failed, first.notices.failed + 1);
  assert.deepEqual(h.jobs.filter((job) => !job.ok).map((job) => job.job), ["job30"]);
  const keys = jarvis.watchItems({ health: Object.assign({ ok: true }, h) }, core.thresholds({ failuresAlert: h.failures.total })).map((row) => row.key);
  assert.ok(keys.includes("job:job30"), keys.join());
  assert.ok(keys.includes("review:failures"), keys.join());
});

test("held health state matches a fresh read across the hourly full read and the day change", async () => {
  days._memo.clear();
  const data = healthSeed();
  const db = fakeDb(data);
  const at = (min) => NOW + min * 60000;
  await jarvis.health(db, { days: 7, now: at(0) });
  data.ops_runs.pop();
  for (const min of [61, 11 * 60, 11 * 60 + 5]) {
    data.url_review_captures.push({ id: "c-" + min, at: new Date(at(min - 1)).toISOString(), kind: "lead" });
    const h = await jarvis.health(db, { days: 7, now: at(min) });
    assert.deepEqual(h, await jarvis.health(fakeDb(data), { days: 7, now: at(min) }), "at +" + min + " min");
  }
  assert.equal((await jarvis.health(db, { days: 7, now: at(11 * 60 + 6) })).jobs.length, 38);
});

test("pending ratings outside the range cost one count read once their number is known", async () => {
  days._memo.clear();
  const ratings = [];
  for (let i = 0; i < 40; i += 1) ratings.push({ id: "p" + i, status: "pending", email: i < 5 ? "pw-bot@example.com" : "fan" + i + "@real.co", createdAt: ts(NOW - 90 * DAY) });
  const db = fakeDb({ ratings });
  const first = await jarvis.dailyProducts(db, { now: NOW });
  assert.equal(first.products.inbox.totals.pending, 35);
  days._memo.clear();
  db.stats.reads = 0;
  db.stats.queries = [];
  const again = await jarvis.dailyProducts(db, { now: NOW });
  assert.equal(again.products.inbox.totals.pending, 35);
  assert.ok(db.stats.reads < 20, "reads " + db.stats.reads);
  ratings.push({ id: "p40", status: "pending", email: "new@real.co", createdAt: ts(NOW - 90 * DAY) });
  assert.equal((await jarvis.dailyProducts(db, { now: NOW })).products.inbox.totals.pending, 36);
});

test("the Firestore meter counts from midnight Pacific, across both DST switches", () => {
  const start = (iso) => new Date(sources.pacificDayStart(Date.parse(iso))).toISOString();
  assert.equal(start("2026-11-02T02:30:00Z"), "2026-11-01T07:00:00.000Z");
  assert.equal(start("2026-11-01T06:59:00Z"), "2026-10-31T07:00:00.000Z");
  assert.equal(start("2026-03-08T12:00:00Z"), "2026-03-08T08:00:00.000Z");
  assert.equal(start("2026-01-10T07:59:59Z"), "2026-01-09T08:00:00.000Z");
});

test("a snapshot rebuild serves the web Jarvis's feed, heat map and mailed reports without a raw read per row (#2102)", async () => {
  days._memo.clear();
  const data = seed();
  data.url_review_reports = Array.from({ length: 20 }, (_, i) => ({ id: "rep" + i, emailedAt: new Date(NOW - i * DAY).toISOString(), period: "daily", label: "Day " + i, opens: i, reviews: 1, paidUsd: 0 }));
  const db = fakeDb(data);
  await jarvis.dailyProducts(db, { now: NOW, days: 7 });
  days._memo.clear();
  db.stats.reads = 0;
  const out = await jarvis.dailyProducts(db, { now: NOW, days: 7 });
  const raw = data.site_events.length + data.url_review_opens.length + data.url_reviews.length;
  assert.ok(db.stats.reads < 60, "reads " + db.stats.reads + " vs " + raw + " raw rows");
  assert.equal(out.feed.length, 18);
  assert.ok(out.feed[0].at >= out.feed[17].at);
  assert.equal(out.socialHeat.length, 7);
  db.stats.reads = 0;
  const reports = await jarvis.mailedReports(db);
  assert.deepEqual(reports.map((r) => r.id).slice(0, 2), ["rep0", "rep1"]);
  assert.equal(reports.length, 12);
  assert.equal(db.stats.reads, 12);
});
