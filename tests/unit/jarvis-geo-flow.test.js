// Jarvis Map timeline and flow (#3114): campaign bars by week with calendar markers, and channel-to-outcome links.
const test = require("node:test");
const assert = require("node:assert/strict");
const flow = require("../../functions/jarvis-geo-flow.js");
const geo = require("../../functions/jarvis-geo.js");
const marketing = require("../../functions/jarvis-marketing.js");

const NOW = Date.parse("2026-11-09T17:00:00Z");
const CAMPS = [
  { id: "a", name: "W1 B-es Americas", week: "W1", lang: "es", region: "Americas", status: "active", start: "2026-10-20", window: "Tue-Thu 08:00-10:30 America/Bogota", updated: "2026-11-01" },
  { id: "b", name: "W1 E-pt Brazil", week: "W1", lang: "pt", region: "Brazil", status: "paused", start: "2026-10-27", updated: "2026-11-05" },
  { id: "c", name: "W2 B-es Americas", week: "W2", lang: "es", region: "Americas", status: "active", start: "2026-11-16" },
  { id: "d", name: "W2 E-pt Brazil", week: "W2", lang: "pt", region: "Brazil", status: "draft", start: "" },
  { id: "e", name: "W0 A-en UK", week: "W0", lang: "en", region: "UK", status: "completed", start: "2026-10-01", updated: "2026-10-25" },
  { id: "f", name: "W0 A-en US", week: "W0", lang: "en", region: "US", status: "bounce protect", start: "2026-10-05", created: "2026-09-30", updated: "2026-09-01" }
];
const COUNTRIES = [
  { cc: "CO", camps: [{ id: "a", share: 60 }, { id: "c", share: 50 }], leads: 30, contacted: 25, sent: 70, opened: 20, replies: 3, prospects: 40, social: 2, socialApproved: 1, visits: 4, paid: 1, nextDate: { date: "2026-11-16", name: "Independencia de Cartagena", kind: "holiday" } },
  { cc: "MX", camps: [{ id: "a", share: 40 }, { id: "c", share: 50 }], leads: 20, contacted: 0, sent: 40, opened: 10, replies: 1, prospects: 10, social: 0, socialApproved: 0, visits: 0, paid: 0, nextDate: { date: "2026-11-16", name: "Revolución", kind: "holiday" } },
  { cc: "BR", camps: [{ id: "b", share: 100 }], leads: 5, contacted: 5, sent: 5, opened: 2, replies: 0, prospects: 8, social: 0, socialApproved: 0, visits: 0, paid: 0, nextDate: { date: "2026-11-15", name: "Proclamação da República", kind: "holiday" } },
  { cc: "GB", camps: [{ id: "e", share: 100 }], leads: 0, contacted: 0, sent: 0, opened: 0, replies: 0, prospects: 0, social: 0, socialApproved: 0, visits: 0, paid: 0, nextDate: null },
  { cc: "PT", camps: [], leads: 0, contacted: 0, sent: 0, opened: 0, replies: 0, prospects: 0, social: 0, socialApproved: 0, visits: 0, paid: 0, nextDate: { date: "2026-12-01", name: "Restauração", kind: "holiday" } }
];

test("statuses: scheduled is active with its start ahead; Instantly's stopped states are paused", () => {
  const today = "2026-11-09";
  assert.equal(flow.statusOf({ status: "active", start: "2026-11-16" }, today), "scheduled");
  assert.equal(flow.statusOf({ status: "running subsequences", start: "2026-11-01" }, today), "active");
  assert.equal(flow.statusOf({ status: "completed" }, today), "done");
  assert.equal(flow.statusOf({ status: "bounce protect" }, today), "paused");
  assert.equal(flow.statusOf({ status: "draft", start: "2026-12-01" }, today), "draft");
  assert.equal(flow.statusOf({ status: "status 9" }, today), "draft");
});

test("bars run from the start to now, or to when they stopped when known, with the countries they reach", () => {
  const t = flow.timeline({ campaigns: CAMPS, countries: COUNTRIES, now: NOW });
  const by = (id) => t.rows.find((r) => r.id === id);
  assert.equal(t.today, "2026-11-09");
  assert.deepEqual(by("a"), { id: "a", name: "W1 B-es Americas", week: "W1", lang: "es", region: "Americas", status: "active", raw: "active", start: "2026-10-20", end: "", endBy: "", window: "Tue-Thu 08:00-10:30 America/Bogota", ccs: ["CO", "MX"], pauses: [] });
  assert.equal(by("b").end, "2026-11-05");
  assert.equal(by("b").endBy, "update");
  assert.equal(by("c").status, "scheduled");
  assert.equal(by("c").end, "2026-11-16");
  assert.deepEqual(by("c").ccs, ["CO", "MX"]);
  assert.equal(by("d").start, "");
  assert.equal(by("e").status, "done");
  assert.equal(by("e").end, "2026-10-25");
  assert.equal(by("f").status, "paused");
  assert.equal(by("f").raw, "bounce protect");
  assert.equal(by("f").end, "", "an update before the start is not when it stopped");
  assert.deepEqual(t.byStatus, [1, 1, 1, 2, 1]);
  assert.equal(t.undated, 1);
  assert.equal(t.rows[t.rows.length - 1].id, "d", "undated campaigns come last");
  assert.equal(t.from, "2026-10-01");
  assert.equal(t.to, "2026-12-07", "four weeks ahead, past the scheduled start a week later");
});

test("markers: the rows' next dates for the countries a campaign reaches, merged by day and name", () => {
  const t = flow.timeline({ campaigns: CAMPS, countries: COUNTRIES, now: NOW });
  assert.deepEqual(t.markers.map((m) => [m.date, m.name, m.ccs.join(" ")]), [
    ["2026-11-15", "Proclamação da República", "BR"], ["2026-11-16", "Independencia de Cartagena", "CO"], ["2026-11-16", "Revolución", "MX"]
  ]);
  assert.ok(!t.markers.some((m) => m.ccs.includes("PT")), "no campaign reaches Portugal");
});

test("with the calendar: its days for reached countries, and holiday pauses stop a paused bar and mark the day", () => {
  const calendar = {
    days: [
      { date: "2026-11-15", kind: "holiday", name: "Proclamação da República", ccs: ["BR"], all: false },
      { date: "2026-11-27", end: "2026-11-30", kind: "commerce", name: "Black Friday", ccs: [], all: true },
      { date: "2026-12-01", kind: "holiday", name: "Restauração", ccs: ["PT"], all: false },
      { date: "2027-03-01", kind: "event", name: "Too far", ccs: ["CO"], all: false }
    ],
    pauses: [
      { id: "BR-2026-11-02", cc: "BR", date: "2026-11-02", name: "Finados", campaigns: [{ id: "b", name: "W1 E-pt Brazil" }], resumeOn: "2026-11-03", status: "paused", pausedAt: "2026-11-02T10:00:00Z" },
      { id: "CO-2026-11-16", cc: "CO", date: "2026-11-16", name: "Cartagena", campaigns: [{ id: "a", name: "W1 B-es Americas" }], resumeOn: "2026-11-17", status: "planned" },
      { id: "MX-old", cc: "MX", date: "2026-10-01", name: "Old", campaigns: [{ id: "a" }], resumeOn: "2026-10-02", status: "resumed" }
    ]
  };
  const t = flow.timeline({ campaigns: CAMPS, countries: COUNTRIES, calendar, now: NOW });
  const b = t.rows.find((r) => r.id === "b");
  assert.equal(b.end, "2026-11-02");
  assert.equal(b.endBy, "pause");
  assert.deepEqual(t.rows.find((r) => r.id === "a").pauses, [{ cc: "CO", date: "2026-11-16", until: "2026-11-17", name: "Cartagena", status: "planned" }]);
  assert.deepEqual(t.markers.map((m) => m.name), ["Paused for Finados", "Proclamação da República", "Paused for Cartagena", "Black Friday"]);
  assert.equal(t.markers.find((m) => m.name === "Black Friday").all, true);
  assert.equal(t.markers.find((m) => m.name === "Paused for Finados").kind, "pause");
});

test("flow: one band per channel, all countries summed, per country only where there is any", () => {
  const f = flow.flow(COUNTRIES);
  const at = (ch, from, to) => f.links.findIndex((l) => l[0] === ch && l[1] === from && l[2] === to);
  assert.equal(f.links.length, flow.LINKS.length);
  assert.equal(f.all[at("email", "", "prospect")], 55);
  assert.equal(f.all[at("email", "prospect", "sent")], 25 + 40 + 5, "contacted, else emails sent when Instantly has no contacted count");
  assert.equal(f.all[at("email", "opened", "replied")], 4);
  assert.equal(f.all[at("sweep", "", "prospect")], 58);
  assert.equal(f.all[at("web", "viewed", "paid")], 1);
  assert.deepEqual(Object.keys(f.by).sort(), ["BR", "CO", "MX"]);
  assert.equal(f.by.CO[at("social", "prospect", "sent")], 1);
  assert.equal(f.needs.length, 4);
  assert.ok(f.needs.every((n) => !/\d+%|\b\d{2,}\b/.test(n)), "the needs line explains, it does not invent numbers");
  assert.ok(f.links.every((l) => flow.CHANNELS.includes(l[0]) && (l[1] === "" || flow.STAGES.includes(l[1])) && flow.STAGES.includes(l[2])));
});

test("the geo rows feed both, and Ask gets a compact summary", () => {
  const out = geo.geoRows({
    targets: ["CO", "BR"],
    queue: { hosts: [{ host: "a.edu.co", cc: "co" }, { host: "b.com.br", cc: "br" }], sweptAt: 1 },
    marketing: { campaigns: { rows: [{ id: "a", name: "W1 B-es Americas", region: "Americas", lang: "es", status: "active", start: "2026-10-20", sent: 10, opened: 4, replies: 1, leads: 5, contacted: 5 }] } }
  });
  const both = flow.build({ campaigns: [CAMPS[0]], countries: out.countries, now: NOW });
  assert.deepEqual(both.timeline.rows[0].ccs, ["CO"]);
  assert.equal(both.flow.all[0], 5);
  const said = flow.ask(Object.assign({ ok: true }, both));
  assert.ok(said.flow.includes("email: email → prospect 5"));
  assert.ok(!said.flow.some((x) => / 0$/.test(x)));
  assert.deepEqual(said.campaigns, { active: 1 });
  assert.equal(flow.ask({ ok: false }), null);
});

test("Instantly campaign rows keep their creation and last change days", () => {
  const out = marketing.campaignRows([{ id: "x", name: "W3 B-es Americas", status: 2, timestamp_created: "2026-10-01T12:00:00.000Z", timestamp_updated: "2026-11-02T08:00:00.000Z", campaign_schedule: { start_date: "2026-10-05" } }], [], NOW, {});
  assert.equal(out.rows[0].created, "2026-10-01");
  assert.equal(out.rows[0].updated, "2026-11-02");
  assert.equal(out.rows[0].status, "paused");
});
