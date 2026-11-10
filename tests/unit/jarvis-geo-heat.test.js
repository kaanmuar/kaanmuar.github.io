// Jarvis Map heatmap and sector grid (#3112): replies and sends by local weekday and hour, sending windows, country by sector.
const test = require("node:test");
const assert = require("node:assert/strict");
const heat = require("../../functions/jarvis-geo-heat.js");

const NOW = Date.parse("2026-11-09T12:00:00Z");
const bit = (hex, d, h) => (parseInt(hex.slice(d * 6, d * 6 + 6), 16) >> (23 - h)) & 1;

test("reads Instantly's sending window text", () => {
  assert.deepEqual(heat.parseWindow("Mon-Fri 09:00-17:00 America/Chicago"), { days: [0, 1, 2, 3, 4], from: 540, to: 1020, zone: "America/Chicago" });
  assert.deepEqual(heat.parseWindow("Mon, Wed 08:30-12:00"), { days: [0, 2], from: 510, to: 720, zone: "" });
  assert.deepEqual(heat.parseWindow("Sat-Mon 10:00-11:00").days, [5, 6, 0]);
  assert.deepEqual(heat.parseWindow("09:00-10:00").days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(heat.parseWindow(""), null);
  assert.equal(heat.parseWindow("Mon-Fri"), null);
  assert.equal(heat.parseWindow("Mon 17:00-09:00"), null);
});

test("every country has a zone Intl knows, and several-zone countries use the most populous one", () => {
  Object.values(heat.ZONES).forEach((z) => assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: z }), z));
  assert.equal(heat.ZONES.US, "America/New_York");
  assert.equal(heat.ZONES.BR, "America/Sao_Paulo");
  assert.ok(heat.MULTI_ZONE.MX && !heat.MULTI_ZONE.CO);
  assert.deepEqual(heat.slotIn(Date.parse("2026-11-10T15:00:00Z"), "America/Bogota"), { d: 1, h: 10, m: 0 });
  assert.deepEqual(heat.slotIn(Date.parse("2026-11-10T15:00:00Z"), "Asia/Kolkata"), { d: 1, h: 20, m: 30 });
  assert.equal(heat.slotIn(NOW, "Mars/Olympus"), null);
});

test("puts replies and sends in the recipient country's local weekday and hour", () => {
  const out = heat.heatRows({
    now: NOW,
    sync: {
      leads: { rows: [{ campaign: "W1 B-es Americas", cc: "co", email: "ana@a.edu.co", host: "a.edu.co" }] },
      replies: [
        { from: "Ana <ana@a.edu.co>", at: "2026-11-10T15:10:00Z", category: "Interested" },
        { from: "bo@mail.b.com.br", at: "2026-11-10T15:10:00Z", category: "not now" },
        { from: "x@unknown.example", at: "2026-11-10T15:10:00Z" },
        { from: "ana@a.edu.co", at: "" }
      ]
    },
    queue: { hosts: [{ host: "b.com.br", cc: "br", sector: "bank" }] },
    marketing: {
      sent: { rows: [{ to: "ana@a.edu.co", at: "2026-11-09T14:00:00Z", kind: "campaign" }, { to: "ana@a.edu.co", at: "2026-11-09T14:30:00Z", kind: "resend" }] },
      campaigns: { rows: [{ id: "c1", name: "W1 B-es Americas", status: "active", window: "Mon-Fri 09:00-17:00 America/Chicago" }, { id: "c2", status: "completed", window: "Sat 09:00-10:00" }] }
    },
    countries: [{ cc: "CO", camps: [{ id: "c1" }, { id: "c2" }] }, { cc: "BR", camps: [] }, { cc: "XK", camps: [{ id: "c1" }] }]
  });
  assert.deepEqual(out.countries.CO.r, [[1, 10, 1, 1]]);
  assert.deepEqual(out.countries.CO.s, [[0, 9, 1]]);
  assert.deepEqual(out.countries.BR.r, [[1, 12, 1, 0]]);
  assert.deepEqual(out.all.r, [[1, 10, 1, 1], [1, 12, 1, 0]]);
  assert.equal(out.replies, 2);
  assert.equal(out.sends, 1);
  assert.equal(out.unzoned, 2);
  assert.equal(out.zones.CO, "America/Bogota");
  assert.deepEqual(out.multi, ["BR"]);
  assert.equal(out.countries.XK, undefined);
  // Chicago 09:00-17:00 is Bogotá 10:00-18:00 in November (CST is UTC-6, Bogotá UTC-5); the completed Saturday campaign is left out.
  const w = out.countries.CO.w;
  assert.equal(w.length, 42);
  assert.equal(bit(w, 0, 9), 0);
  assert.equal(bit(w, 0, 10), 1);
  assert.equal(bit(w, 4, 17), 1);
  assert.equal(bit(w, 4, 18), 0);
  assert.equal(bit(w, 5, 9), 0);
  assert.equal(out.countries.BR.w, "");
});

test("a window without a zone is read in the country's own time", () => {
  const out = heat.heatRows({ now: NOW, marketing: { campaigns: { rows: [{ id: "c", status: "draft", window: "Tue 09:00-10:30" }] } }, countries: [{ cc: "IN", camps: [{ id: "c" }] }] });
  const w = out.countries.IN.w;
  assert.equal(bit(w, 1, 9), 1);
  assert.equal(bit(w, 1, 10), 1);
  assert.equal(bit(w, 1, 11), 0);
  assert.equal(bit(w, 0, 9), 0);
  assert.deepEqual(out.countries.IN.r, []);
});

test("splits campaign sends and replies across the sectors of their leads' sites", () => {
  const out = heat.sectorGrid({
    queue: { hosts: [{ host: "a.edu.co", cc: "co", sector: "university" }, { host: "b.edu.co", cc: "co", sector: "university" }, { host: "c.com.co", cc: "co", sector: "company" }, { host: "d.mx", cc: "mx" }] },
    sync: { leads: { rows: [
      { campaign: "W1", cc: "co", email: "x@mail.a.edu.co" }, { campaign: "W1", cc: "co", email: "y@c.com.co", host: "c.com.co" },
      { campaign: "W1", cc: "mx", email: "z@elsewhere.mx" }, { campaign: "W1", cc: "", email: "q@q.com" }
    ] } },
    marketing: { campaigns: { rows: [{ name: "W1", sent: 90, replies: 6 }, { name: "W2", sent: 40, replies: 1 }] } }
  });
  assert.deepEqual(out.list, ["university", "company", "other", "?"]);
  const co = out.rows.find((r) => r.cc === "CO");
  assert.equal(co.name, "Colombia");
  assert.deepEqual(co.p, [2, 1, 0, 0]);
  assert.deepEqual(co.s, [30, 30, 0, 0]);
  assert.deepEqual(co.r, [2, 2, 0, 0]);
  const mx = out.rows.find((r) => r.cc === "MX");
  assert.deepEqual(mx.p, [0, 0, 1, 0]);
  assert.deepEqual(mx.s, [0, 0, 0, 30]);
  assert.equal(out.leads, 3);
  assert.equal(out.matched, 2);
  assert.equal(out.unsplit, 40);
  assert.equal(out.rows[0].cc, "CO");
  assert.match(out.needs.join(" "), /1 of 3 synced leads/);
  assert.match(out.needs.join(" "), /40 emails come from campaigns with no synced leads/);
});

test("says why sent and replies per sector are missing", () => {
  const q = { hosts: [{ host: "a.pt", cc: "pt", sector: "agency" }] };
  assert.match(heat.sectorGrid({ queue: q }).needs[0], /has none, so only prospects show/);
  assert.match(heat.sectorGrid({ queue: q, sync: { leads: { rows: [{ campaign: "W", cc: "pt", email: "a@b.pt" }] } } }).needs[0], /none matched yet/);
  const many = Array.from({ length: 14 }, (_, n) => ({ host: `h${n}.pt`, cc: "pt", sector: "s" + String(n).padStart(2, "0") }));
  const out = heat.sectorGrid({ queue: { hosts: many } });
  assert.equal(out.list.length, 10);
  assert.equal(out.list[9], "other");
  assert.equal(out.rows[0].p.reduce((s, n) => s + n, 0), 14);
});

test("tells Ask each country's busiest reply hours and the top sector cells", () => {
  const ask = heat.heatAsk({ ok: true, heat: { zones: { CO: "America/Bogota" }, multi: [], countries: { CO: { r: [[1, 10, 3, 1], [2, 9, 1, 0]], s: [], w: "" } } },
    sectors: { list: ["university", "?"], rows: [{ cc: "CO", p: [5, 0], s: [20, 4], r: [1, 0] }] } });
  assert.deepEqual(ask.replyHours, ["CO (America/Bogota): 4 replies, most Tue 10h, Wed 9h"]);
  assert.deepEqual(ask.sectors, ["CO university: 5 prospects, 20 sent, 1 replies", "CO no sector: 0 prospects, 4 sent, 0 replies"]);
  assert.equal(heat.heatAsk({ ok: true }), null);
});
