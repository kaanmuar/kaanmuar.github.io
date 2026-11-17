"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement");
const S = require("../../functions/engagement-sources");
const R = require("../../functions/engagement-reports");
const Meta = require("../../functions/meta-scout");
const J = require("../../functions/jarvis-engagement");
const M = require("../../functions/engagement-mac");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-02T15:00:00Z");
const SLOT = 30 * 60 * 1000;
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();

function fakeFetch() {
  const toot = (id, text) => ({ id, uri: "https://m.s/u/" + id, url: "https://m.s/@a/" + id, content: "<p>" + text + "</p>", language: "en", created_at: hoursAgo(1), favourites_count: 3, account: { acct: "a@m.s", display_name: "A" } });
  return async (url) => {
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes("/timelines/tag/")) return json([toot("1", "Playwright and WCAG accessibility testing")]);
    if (url.includes("/trends/statuses")) return json([]);
    if (url.includes("/api/v2/search")) return json({ statuses: [toot("9", "technical SEO for core web vitals")] });
    if (url.includes("generativelanguage")) {
      const keys = JSON.parse(JSON.parse((arguments[1] || {}).body).contents[0].parts[0].text.split("\n").pop()).map((p) => p.id);
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(keys.map((id) => ({ id, about: "a11y", lang: "en", sentiment: "positive", worth: 0.9, reply: "We audit focus order too." }))) }] } }] });
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
}

test("DISCOVERY lists every phrase and discoveryForRun stays within DISCOVERY_BUDGET", () => {
  assert.ok(E.DISCOVERY.length > 80, "full phrase pool, not first phrase only");
  const run = E.discoveryForRun(NOW);
  assert.equal(run.length, E.DISCOVERY_BUDGET);
  const later = E.discoveryForRun(NOW + SLOT);
  assert.notDeepEqual(run.map((d) => d.q), later.map((d) => d.q), "queries rotate by slot");
});

test("looseForMac hands a budgeted slice of niche problem queries to the Mac", () => {
  const dian = { host: "dian.gov.co", name: "DIAN", lang: "es", short: "DIAN", weak: ["Performance"], niche: "government" };
  const loose = R.looseQueries([dian]);
  assert.ok(loose.length);
  const mac = R.looseForMac(loose, NOW);
  assert.ok(mac.length <= R.LOOSE_MAC_BUDGET);
  assert.equal(mac[0].q, loose[(Math.floor(NOW / SLOT) * mac.length) % loose.length].q);
});

test("Mastodon field search merges with tag timelines when MASTODON_SEARCH_* is set", async () => {
  const seen = [];
  const fetch = async (url, opts) => {
    seen.push(url);
    if (url.includes("/timelines/")) return { ok: true, json: async () => [{ id: "1", uri: "u/1", url: "https://m/1", content: "<p>tag</p>", created_at: hoursAgo(1), account: { acct: "a" } }] };
    if (url.includes("/trends/")) return { ok: true, json: async () => [] };
    if (url.includes("/api/v2/search")) return { ok: true, json: async () => ({ statuses: [{ id: "2", uri: "u/2", url: "https://m/2", content: "<p>search</p>", created_at: hoursAgo(1), account: { acct: "b" } }] }) };
    return { ok: false, json: async () => ({}) };
  };
  const posts = await S.readAll({ fetch, now: NOW, env: { MASTODON_SEARCH_URL: "https://masto.example", MASTODON_SEARCH_TOKEN: "t" } });
  assert.ok(posts.read.mastodon >= 2);
  assert.ok(seen.some((u) => u.includes("/api/v2/search")));
});

test("meta-scout.run stores the envelope and pass chips", async () => {
  const db = fakeDb();
  await db.collection("engagement_private").doc("mac").set({ at: hoursAgo(0.5), signedIn: { x: true }, read: { x: 4 }, students: { communities: 1 } });
  await db.collection("engagement_private").doc("reddit").set({ at: hoursAgo(0.5), read: 2 });
  const deps = { db, fetch: fakeFetch(), env: { GEMINI_API_KEY: "k", MASTODON_SEARCH_URL: "https://masto.example", MASTODON_SEARCH_TOKEN: "t" }, now: NOW, inc: (n) => ({ inc: n }), push: async () => {} };
  const out = await Meta.run(deps);
  assert.equal(out.at, new Date(NOW).toISOString());
  assert.ok(out.passes.cloud);
  assert.ok(out.passes.mac.ok);
  assert.ok(out.passes.reddit.ok);
  assert.ok(out.run.fresh >= 0);
  const saved = db.data.get("engagement_meta_runs/" + out.at);
  assert.equal(saved.passes.cloud.ok, out.passes.cloud.ok);
  const src = await J.source({ db, now: NOW + 60000, days: 7, env: deps.env });
  assert.equal(src.metaScout.at, out.at);
});

test("engagement-mac-sites adds loose queries and a discovery budget to topics", async () => {
  const db = fakeDb();
  const sites = await M.sites({ db, now: NOW });
  assert.ok(sites.topics.length <= E.DISCOVERY_BUDGET + 5);
  assert.ok(Array.isArray(sites.loose));
});