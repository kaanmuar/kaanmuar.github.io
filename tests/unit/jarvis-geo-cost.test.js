// Jarvis Map cost and return (#3283): monthly outreach costs prorated to a span and spread over the countries by channel.
const test = require("node:test");
const assert = require("node:assert/strict");
const cost = require("../../functions/jarvis-geo-cost.js");

const NOW = Date.parse("2026-11-09T17:00:00Z");
const item = (o) => Object.assign({ label: "Instantly", usd: 30, channel: "email", from: "", to: "" }, o);
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} is not ${b}`);

function fakeDb(data) {
  const docs = Object.assign({}, data);
  return {
    docs,
    collection: (c) => ({ doc: (id) => ({
      get: async () => ({ exists: !!docs[c + "/" + id], data: () => docs[c + "/" + id] }),
      set: async (d) => { docs[c + "/" + id] = d; }
    }) })
  };
}

test("checks every cost: a name, USD a month above 0, a known channel and months in order", () => {
  assert.deepEqual(cost.cleanItems([{ label: "  Google   Workspace ", usd: "14.4", channel: "EMAIL", from: "2026-09" }, { label: "Domains", usd: 2.791 }]), [
    { label: "Google Workspace", usd: 14.4, channel: "email", from: "2026-09", to: "" },
    { label: "Domains", usd: 2.79, channel: "all", from: "", to: "" }
  ]);
  assert.deepEqual(cost.cleanItems([]), []);
  assert.throws(() => cost.cleanItems("x"), /as a list/);
  assert.throws(() => cost.cleanItems([{ usd: 5 }]), /Cost 1 needs a name/);
  assert.throws(() => cost.cleanItems([{ label: "A", usd: 0 }]), /A: give the USD a month/);
  assert.throws(() => cost.cleanItems([{ label: "A", usd: -3 }]), /above 0/);
  assert.throws(() => cost.cleanItems([{ label: "A", usd: 200000 }]), /up to 100000/);
  assert.throws(() => cost.cleanItems([{ label: "A", usd: 5, channel: "tv" }]), /email, social, links or all/);
  assert.throws(() => cost.cleanItems([{ label: "A", usd: 5, from: "2026-13" }]), /start month is YYYY-MM/);
  assert.throws(() => cost.cleanItems([{ label: "A", usd: 5, from: "2026-10", to: "2026-09" }]), /end month is before the start/);
  assert.throws(() => cost.cleanItems(Array.from({ length: 31 }, () => item())), /At most 30/);
  assert.deepEqual(cost.keepValid([item(), { label: "", usd: 1 }, null]).length, 1);
});

test("prorates a monthly cost to the days of a span, inside the item's months", () => {
  near(cost.prorate(item({ usd: 30 }), "2026-11-01", "2026-11-30"), 30);
  near(cost.prorate(item({ usd: 30 }), "2026-11-01", "2026-11-15"), 15);
  near(cost.prorate(item({ usd: 31 }), "2026-10-25", "2026-10-31"), 7);
  // 15 October days of 31 and 15 November days of 30.
  near(cost.prorate(item({ usd: 62 }), "2026-10-17", "2026-11-15"), 62 * 15 / 31 + 62 * 15 / 30);
  near(cost.prorate(item({ usd: 30, from: "2026-11" }), "2026-10-17", "2026-11-15"), 15);
  near(cost.prorate(item({ usd: 31, to: "2026-10" }), "2026-10-17", "2026-11-15"), 15);
  near(cost.prorate(item({ usd: 28 }), "2027-02-01", "2027-02-28"), 28);
  assert.equal(cost.prorate(item(), "2026-11-10", "2026-11-01"), 0);
  assert.equal(cost.prorate(item(), "", "2026-11-01"), 0);
  assert.deepEqual(cost.monthlyOf([item({ usd: 10 }), item({ usd: 5, channel: "social", from: "2026-12" }), item({ usd: 2, channel: "all", to: "2026-11" })], "2026-11"),
    { email: 10, social: 0, links: 0, all: 2, total: 12 });
});

test("spreads email and all by emails sent, social by social replies and links by visits", () => {
  const items = [item({ usd: 30 }), item({ label: "Workspace", usd: 30, channel: "all" }), item({ label: "Buffer", usd: 30, channel: "social" }), item({ label: "Worker", usd: 30, channel: "links" })];
  const rows = {
    CO: { sent: 300, replies: 6, positive: 2, social: 1, visits: 10, usd: 18 },
    MX: { sent: 100, replies: 0, positive: 0, social: 3, visits: 0, usd: 0 },
    BR: { sent: 0, replies: 0, positive: 0, social: 0, visits: 30, usd: 9 },
    XX1: { sent: 999 }
  };
  const v = cost.allocate(items, "2026-11-01", "2026-11-30", rows);
  assert.equal(v.days, 30);
  // CO: 3/4 of email and all (45 + 45... of 30 each), 1/4 of social, 1/4 of links.
  assert.deepEqual(v.c.CO, [22.5 + 22.5 + 7.5 + 7.5, 0.2, 10, 30, 18, 0.3]);
  assert.deepEqual(v.c.MX, [7.5 + 7.5 + 22.5, 0.375, null, null, 0, 0]);
  assert.deepEqual(v.c.BR, [22.5, null, null, null, 9, 0.4]);
  assert.equal(v.c.XX1, undefined);
  assert.deepEqual(v.totals.channels.social, { usd: 30, unspread: 0, over: 2 });
  assert.equal(v.totals.cost, 120);
  assert.equal(v.totals.spread, 120);
  assert.equal(v.totals.costPerSent, 0.3);
  assert.equal(v.totals.costPerReply, 20);
  assert.equal(v.totals.costPerPositive, 60);
  assert.equal(v.totals.roi, 0.23);
});

test("zero denominators are null, never 0, and a channel with nothing to spread over stays unspread", () => {
  const v = cost.allocate([item({ usd: 30 }), item({ label: "Buffer", usd: 30, channel: "social" })], "2026-11-01", "2026-11-30",
    { CO: { sent: 0, replies: 0, positive: 0, social: 0, visits: 4, usd: 12 } });
  assert.deepEqual(v.c.CO, [0, null, null, null, 12, null]);
  assert.equal(v.totals.unspread, 60);
  assert.equal(v.totals.spread, 0);
  assert.equal(v.totals.costPerSent, null);
  assert.equal(v.totals.roi, 0.2);
  const empty = cost.allocate([], "2026-11-01", "2026-11-30", { CO: { sent: 10, usd: 0 } });
  assert.deepEqual(empty.c, {});
  assert.equal(empty.totals.roi, null);
  assert.equal(empty.totals.costPerSent, null);
});

// A history summary as jarvis-geo-time.summarize writes it: { cc: { field: [now, before] } }.
const TIME = {
  ranges: {
    7: { from: "2026-11-02", to: "2026-11-08", prevFrom: "2026-10-26", prevTo: "2026-11-01", days: 7, prevDays: 7,
      c: { CO: { sent: [70, 140], replies: [2, 1], positive: [1, 0], usd: [9, 0] }, MX: { sent: [70, 0], social: [2, 2] } } },
    30: { from: "2026-10-10", to: "2026-11-08", prevFrom: "2026-09-10", prevTo: "2026-10-09", days: 30, prevDays: 12,
      c: { CO: { sent: [300, 100], replies: [6, 1], positive: [2, 0], usd: [18, 0] } } }
  },
  weeks: { start: ["2026-10-26", "2026-11-02"], days: [7, 7], c: { CO: { sent: [140, 70], replies: [1, 2] } } }
};

test("compares a range with the span before and plays the weeks, each prorated to its own days", () => {
  const out = cost.build({ items: [item({ usd: 30 })], days: 7, time: TIME, countries: [], now: NOW });
  assert.deepEqual(out.basis, { kind: "span", span: 7, from: "2026-11-02", to: "2026-11-08" });
  const [now, before] = out.ranges[7];
  near(now.totals.cost, 7);
  near(before.totals.cost, 30 / 31 * 6 + 1);
  // Now CO sends half the emails and carries half the cost; before it carried all of it over 140 emails.
  assert.deepEqual(cost.fieldsOf(now, "CO"), { cost: 3.5, costPerSent: 0.05, costPerReply: 1.75, costPerPositive: 3.5, revenue: 9, roi: 2.57 });
  assert.equal(cost.fieldsOf(before, "CO").costPerSent, 0.0486);
  assert.equal(cost.fieldsOf(before, "MX").cost, null);
  assert.deepEqual(out.now, now);
  assert.equal(out.weeks.length, 2);
  near(out.weeks[1].c.CO[0], 7);
  assert.deepEqual(cost.build({ items: [item()], days: 30, time: TIME, now: NOW }).basis.span, 30);
  assert.deepEqual(cost.build({ items: [item()], days: 365, time: TIME, now: NOW }).basis, null);
});

test("with no history, Now is the campaigns' lifetime from the first one created", () => {
  const countries = [{ cc: "CO", sent: 400, replies: 8, positive: 2, social: 0, visits: 0, usd: 0 }];
  const out = cost.build({ items: [item({ usd: 30 })], days: 30, time: null, countries, campaigns: [{ created: "2026-11-01" }, { created: "" }, { created: "2027-01-01" }], now: NOW });
  assert.deepEqual(out.basis, { kind: "lifetime", span: 0, from: "2026-11-01", to: "2026-11-09" });
  assert.deepEqual(cost.fieldsOf(out.now, "CO"), { cost: 9, costPerSent: 0.0225, costPerReply: 1.125, costPerPositive: 4.5, revenue: 0, roi: 0 });
  assert.deepEqual(out.ranges, {});
  assert.equal(cost.build({ items: [item()], countries, campaigns: [], now: NOW }).now, null);
});

test("the geo source's hook: Now fields on each country, and a need while the list is empty", async () => {
  const empty = { countries: [{ cc: "CO", sent: 10 }], time: TIME };
  const needs = [];
  await cost.attach({ db: fakeDb(), days: 7, now: NOW }, empty, { needs });
  assert.deepEqual(needs, [cost.NEEDS]);
  assert.deepEqual(empty.cost.items, []);
  assert.equal(empty.countries[0].costPerSent, null);
  const out = { countries: [{ cc: "CO", sent: 10 }, { cc: "PE", sent: 0 }], time: TIME };
  await cost.attach({ db: fakeDb({ "jarvis_settings/geo_costs": { items: [item({ usd: 30 }), { label: "", usd: 3 }] } }), days: 7, now: NOW }, out, { needs: [] });
  assert.equal(out.cost.items.length, 1);
  assert.equal(out.countries[0].costPerSent, 0.05);
  assert.equal(out.countries[1].cost, null);
});

test("saves a checked list and refuses a bad one", async () => {
  const db = fakeDb();
  const out = await cost.save(db, { items: [{ label: "Instantly", usd: 37, channel: "email", from: "2026-10" }] }, "kaanmuar@gmail.com", NOW);
  assert.deepEqual(out.monthly, { email: 37, social: 0, links: 0, all: 0, total: 37 });
  assert.equal(db.docs["jarvis_settings/geo_costs"].by, "kaanmuar@gmail.com");
  assert.deepEqual((await cost.read(db)).items, out.items);
  await assert.rejects(cost.save(db, { items: [{ label: "x", usd: "free" }] }), /USD a month/);
  assert.equal((await cost.read(db)).items.length, 1);
});

test("suggests the Cloudflare Registrar domains at their renewal price a month, and notes when it cannot", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([url.replace(/accounts\/\w+/, "accounts/A"), (init && init.method) || "GET"]);
    if (/registrations/.test(url)) return { ok: true, json: async () => ({ success: true, result: [{ domain_name: "tryqa.com", status: "active" }, { domain_name: "getqa.com", status: "active" }, { domain_name: "old.io", status: "expired" }] }) };
    return { ok: true, json: async () => ({ success: true, result: { domains: [{ name: "x.com", registrable: true, pricing: { currency: "USD", registration_cost: "11.17", renewal_cost: "11.17" } }] } }) };
  };
  const out = await cost.suggest({ fetch, env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "abc123" } });
  assert.deepEqual(calls, [["https://api.cloudflare.com/client/v4/accounts/A/registrar/registrations?per_page=50", "GET"], ["https://api.cloudflare.com/client/v4/accounts/A/registrar/domain-check", "POST"]]);
  assert.equal(out.suggestions.length, 1);
  assert.deepEqual(Object.assign({}, out.suggestions[0], { why: "" }), { label: "Domain renewals .com (2)", usd: 1.86, channel: "email", from: "", to: "", source: "Cloudflare Registrar", why: "" });
  assert.match(out.suggestions[0].why, /tryqa\.com, getqa\.com: USD 11\.17 a year each/);
  assert.match((await cost.suggest({ fetch, env: {} })).note, /not set up/);
  const denied = async () => ({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ message: "Authentication error" }] }) });
  assert.match((await cost.suggest({ fetch: denied, env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "abc" } })).note, /could not be read: Authentication error/);
});

test("Ask gets the basis, the totals and the cheapest and costliest countries per reply", () => {
  assert.equal(cost.ask(null), null);
  assert.deepEqual(cost.ask({ cost: { items: [] } }), { note: cost.NEEDS });
  const geo = { cost: cost.build({ items: [item({ usd: 30 })], days: 7, time: TIME, now: NOW }) };
  const a = cost.ask(geo);
  assert.equal(a.basis, "last 7 days, 2026-11-02 to 2026-11-08");
  assert.deepEqual(a.items, ["Instantly: $30 a month, email"]);
  assert.match(a.cheapestPerReply[0], /^CO: \$3\.5 cost, \$0\.050 per email, \$1\.75 per reply/);
  assert.match(a.bestReturn[0], /return 2\.57x/);
});
