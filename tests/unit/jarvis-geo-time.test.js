// Jarvis Map over time (#3109): the daily history, Instantly's days split by country, ranges against the span before and 13 weeks.
const test = require("node:test");
const assert = require("node:assert/strict");
const time = require("../../functions/jarvis-geo-time.js");
const geo = require("../../functions/jarvis-geo.js");

const F = time.FIELDS;
const row = (o) => F.map((f) => o[f] || 0);

// Firestore in memory: doc get/set with mergeFields, batches, getAll and where("day", ">=").
function fakeDb() {
  const store = {};
  const ref = (col, id) => ({
    id, col,
    get: async () => { const d = (store[col] || {})[id]; return { exists: !!d, data: () => d && JSON.parse(JSON.stringify(d)), get: (k) => d && d[k] }; },
    set: async (data, opts) => {
      const was = (store[col] = store[col] || {})[id] || {};
      const keep = opts && opts.mergeFields ? Object.assign({}, was, ...opts.mergeFields.map((k) => ({ [k]: data[k] }))) : opts && opts.merge ? Object.assign({}, was, data) : data;
      store[col][id] = JSON.parse(JSON.stringify(keep));
    }
  });
  return {
    store,
    collection: (col) => ({
      doc: (id) => ref(col, id),
      where: (field, op, value) => ({ get: async () => {
        const docs = Object.values(store[col] || {}).filter((d) => d[field] >= value).map((d) => ({ data: () => JSON.parse(JSON.stringify(d)) }));
        return { docs, size: docs.length };
      } })
    }),
    batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), commit: async () => { for (const op of ops) await op(); } }; },
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get()))
  };
}

test("geoRows counts the replies by their Bogotá day and country", () => {
  const out = geo.geoRows({
    targets: ["CO", "MX"],
    sync: { leads: { rows: [{ campaign: "W1", cc: "co", email: "x@a.edu.co" }, { campaign: "W1", cc: "mx", email: "z@c.mx" }] },
      replies: [{ from: "x@a.edu.co", category: "Interested", at: "2026-11-08T15:00:00Z" }, { from: "x@a.edu.co", category: "not now", at: "2026-11-09T03:00:00Z" },
        { from: "z@c.mx", category: "meeting", at: "2026-11-09T12:00:00Z" }, { from: "z@c.mx", category: "x" }] }
  });
  // 03:00 UTC on the 9th is still the 8th in Bogotá; a reply with no date is counted but not dated.
  assert.deepEqual(out.replyDays, { "2026-11-08": { CO: [2, 1] }, "2026-11-09": { MX: [1, 1] } });
  assert.equal(out.countries.find((r) => r.cc === "MX").answered, 2);
});

test("a day's snapshot keeps the countries with a number, and campaign weights come from the countries' shares", () => {
  const countries = [
    { cc: "CO", sent: 10, opened: 4, prospects: 3, usd: 1.239, camps: [{ id: "c1", share: 60 }, { id: "c2", share: 100 }] },
    { cc: "MX", sent: 0, camps: [{ id: "c1", share: 40 }] },
    { cc: "AO", sent: 0, camps: [] }
  ];
  assert.deepEqual(time.snapshotOf(countries), { CO: row({ sent: 10, opened: 4, prospects: 3, usd: 1.24 }) });
  assert.deepEqual(time.campaignWeights(countries), { c1: { CO: 0.6, MX: 0.4 }, c2: { CO: 1 } });
});

test("Instantly's daily rows split across countries, every day present and bounced null when Instantly has none", () => {
  const daily = time.dailyOf([{ date: "2026-11-01", sent: 10, unique_opened: 5, opened: 9, unique_replies: 1, opportunities: 1 }, { date: "bad" }, { date: "2026-11-03T00:00:00Z", sent: 5, bounced: 1 }]);
  assert.deepEqual(daily, { "2026-11-01": [10, 5, 1, 1, null], "2026-11-03": [5, 0, 0, 0, 1] });
  assert.deepEqual(time.dailyOf({ items: [{ date: "2026-11-01", sent: 2 }] }), { "2026-11-01": [2, 0, 0, 0, null] });
  const split = time.splitDays({ c1: daily, gone: { "2026-11-01": [99, 0, 0, 0, null] } }, { c1: { CO: 0.6, MX: 0.4 } }, "2026-11-01", "2026-11-03");
  assert.deepEqual(Object.keys(split), ["2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.deepEqual(split["2026-11-01"], { CO: [6, 3, 0.6, 0.6, null], MX: [4, 2, 0.4, 0.4, null] });
  assert.deepEqual(split["2026-11-02"], {});
  assert.deepEqual(split["2026-11-03"].CO, [3, 0, 0, 0, 0.6]);
});

test("replies stored for a day are never lowered when the oldest leave the sync", () => {
  assert.deepEqual(time.mergeReplies({ CO: [3, 1] }, { CO: [2, 2], MX: [1, 0] }), { CO: [3, 2], MX: [1, 0] });
  assert.deepEqual(time.mergeReplies(null, { CO: [1, 0] }), { CO: [1, 0] });
});

test("ranges add flows, keep the last level, and leave unrecorded spans null", () => {
  const to = "2026-11-08";
  const docs = [];
  for (let n = 0; n < 14; n++) {
    const day = time.addDays(to, -n);
    docs.push({ day, d: { CO: [10, 4, 1, 0, null] }, nb: true, a: n < 3 ? { CO: [1, n === 0 ? 1 : 0] } : undefined });
  }
  docs[0].c = { CO: row({ prospects: 50, left: 20, visitors: 7 }), BR: row({ reviewed: 4 }) };
  docs[7].c = { CO: row({ prospects: 40, left: 25, visitors: 3 }) };
  const t = time.summarize(docs, to);
  assert.equal(t.since, "2026-10-26");
  assert.equal(t.levelsSince, "2026-11-01");
  const r7 = t.ranges[7];
  assert.equal(r7.from, "2026-11-02");
  assert.equal(r7.prevTo, "2026-11-01");
  assert.equal(r7.prevFrom, "2026-10-26");
  assert.equal(r7.days, 7);
  assert.equal(r7.prevDays, 7);
  assert.deepEqual(r7.c.CO.sent, [70, 70]);
  assert.deepEqual(r7.c.CO.answered, [3, null]);
  assert.deepEqual(r7.c.CO.positive, [1, null]);
  assert.deepEqual(r7.c.CO.prospects, [50, 40]);
  assert.deepEqual(r7.c.CO.left, [20, 25]);
  assert.deepEqual(r7.c.CO.visitors, [7, 3]);
  assert.equal(r7.c.CO.bounced, undefined);
  // BR had no row on the day before's snapshot, so it had none then; with no snapshot at all it would be null.
  assert.deepEqual(r7.c.BR.reviewed, [4, 0]);
  assert.deepEqual(r7.c.BR.sent, undefined);
  assert.equal(t.ranges[90].prevDays, 0);
  assert.equal(t.weeks.start.length, time.WEEKS);
  assert.equal(t.weeks.start[12], "2026-11-02");
  assert.equal(t.weeks.start[0], "2026-08-10");
  assert.deepEqual(t.weeks.days.slice(10), [0, 7, 7]);
  assert.deepEqual(t.weeks.c.CO.sent.slice(10), [null, 70, 70]);
  assert.deepEqual(t.weeks.c.CO.prospects.slice(11), [40, 50]);
  // Docs after `to` (today, still running) stay out.
  assert.deepEqual(time.summarize(docs.concat([{ day: "2026-11-09", d: { CO: [999, 0, 0, 0, 0] } }]), to).ranges[7].c.CO.sent, [70, 70]);
  const ask = time.askView(t);
  assert.match(ask["7 days"].countries[0], /^CO: sent 70 \(before 70\)/);
  assert.equal(time.askView(null), null);
});

test("the daily run backfills once, then refreshes a week, and running it twice writes the same", async () => {
  const db = fakeDb();
  const now = Date.parse("2026-11-09T12:40:00Z");
  const calls = [];
  const instantly = async (path) => {
    calls.push(path);
    const q = new URLSearchParams(path.split("?")[1]);
    const out = [];
    for (let d = q.get("start_date"); d <= q.get("end_date"); d = time.addDays(d, 1)) out.push({ date: d, sent: 10, unique_opened: 2, unique_replies: 1 });
    return out;
  };
  const geoNow = { ok: true, countries: [{ cc: "CO", sent: 300, prospects: 9, camps: [{ id: "c1", share: 50 }] }, { cc: "MX", sent: 300, camps: [{ id: "c1", share: 50 }] }],
    replyDays: { "2026-11-08": { CO: [2, 1] }, "2026-11-09": { MX: [1, 0] } } };
  const first = await time.record({ db, now, geo: geoNow, instantly });
  assert.match(first, /backfilled 91 email days from 1 campaigns/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /campaign_id=c1&start_date=2026-08-10&end_date=2026-11-08/);
  const days = db.store[time.COLLECTION];
  assert.equal(Object.keys(days).length, 91);
  assert.deepEqual(days["2026-11-08"].d, { CO: [5, 1, 0.5, 0, null], MX: [5, 1, 0.5, 0, null] });
  assert.deepEqual(days["2026-11-08"].a, { CO: [2, 1] });
  assert.deepEqual(days["2026-11-08"].c.CO, row({ sent: 300, prospects: 9 }));
  assert.equal(days["2026-11-09"], undefined);
  const meta = db.store.jarvis_settings.geo_time;
  assert.ok(meta.backfilledAt);
  const summary = await time.read(db);
  assert.deepEqual(summary.ranges[7].c.CO.sent, [35, 35]);

  const before = JSON.stringify(days);
  const again = await time.record({ db, now, geo: Object.assign({}, geoNow, { replyDays: { "2026-11-08": { CO: [1, 0] } } }), instantly });
  assert.match(again, /refreshed 7 email days/);
  assert.match(calls[1], /start_date=2026-11-02&end_date=2026-11-08/);
  const strip = (s) => s.replace(/"at":"[^"]*"/g, "");
  assert.equal(strip(JSON.stringify(db.store[time.COLLECTION])), strip(before));

  // A failed Instantly call writes no email day and leaves the backfill for the next run.
  const db2 = fakeDb();
  const out = await time.record({ db: db2, now, geo: geoNow, instantly: async () => { throw new Error("Instantly 429: slow down"); } });
  assert.match(out, /Instantly daily analytics failed: Instantly 429/);
  assert.equal(db2.store.jarvis_settings.geo_time.backfilledAt, "");
  assert.equal(db2.store[time.COLLECTION]["2026-11-01"], undefined);
  assert.ok(db2.store[time.COLLECTION]["2026-11-08"].c);
});
