const test = require("node:test");
const assert = require("node:assert/strict");
const index = require("../../functions/jarvis-index");
const actions = require("../../functions/jarvis-actions");
const core = require("../../js/admin-jarvis-core.js");
const { fakeDb } = require("./fake-jarvis-db");

const NOW = Date.parse("2026-11-03T15:00:00Z");
const DAY = 86400000;
const MAIN = ["https://carlosandmunoz.com/", "https://carlosandmunoz.com/qa-review.html", "https://carlosandmunoz.com/qa-lab.html"];
const SOCIAL = ["https://carlosandmunoz.com/social/a.html", "https://carlosandmunoz.com/qa-review.html"];
const xml = (urls) => "<urlset>" + urls.map((u) => `<url><loc>${u}</loc></url>`).join("") + "</urlset>";
const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => body });

function docs() {
  const rows = {};
  return { rows, collection: () => ({ doc: (id) => ({ get: async () => ({ exists: id in rows, data: () => rows[id] }), set: async (v) => { rows[id] = v; } }) }) };
}

function web(braveUrls, calls) {
  return async (url, init) => {
    calls && calls.push(url.replace(/\?.*/, "") + (/offset=(\d)/.test(url) ? "@" + url.match(/offset=(\d)/)[1] : ""));
    if (url.endsWith("/sitemap.xml")) return reply(xml(MAIN));
    if (url.endsWith("/sitemap-social.xml")) return reply(xml(SOCIAL));
    if (url.startsWith("https://api.search.brave.com/")) return reply({ web: { results: braveUrls.map((u) => ({ url: u })) }, query: { more_results_available: false } });
    if (url === "https://api.indexnow.org/indexnow") { calls && calls.push(JSON.parse(init.body)); return reply("", 202); }
    throw new Error("unexpected " + url);
  };
}

test("index: the same page however it is written, and only our own host", () => {
  assert.equal(index.pageKey("https://www.carlosandmunoz.com/qa-review.html"), "/qa-review");
  assert.equal(index.pageKey("https://carlosandmunoz.com/qa-review/"), "/qa-review");
  assert.equal(index.pageKey("https://carlosandmunoz.com/"), "/");
  assert.equal(index.pageKey("https://carlosandmunoz.com/index.html"), "/");
  assert.equal(index.pageKey("https://notcarlosandmunoz.com/"), "");
});

test("index: check counts both sitemaps once each, lists the main pages missing and keeps the day Brave first had none", async () => {
  const db = docs();
  const env = { BRAVE_SEARCH_KEY: "k" };
  const none = await index.check({ fetch: web([]), db, env, now: NOW });
  assert.equal(none.total, 4);
  assert.equal(none.indexed, 0);
  assert.deepEqual(none.mainMissing, MAIN);
  assert.equal(none.zeroSince, "2026-11-03T15:00:00.000Z");
  const later = await index.check({ fetch: web([]), db, env, now: NOW + 3 * DAY });
  assert.equal(later.zeroSince, "2026-11-03T15:00:00.000Z");
  const some = await index.check({ fetch: web(["https://www.carlosandmunoz.com/qa-lab", "https://rival.example/"]), db, env, now: NOW + 4 * DAY });
  assert.equal(some.indexed, 1);
  assert.equal(some.zeroSince, null);
  assert.deepEqual(some.mainMissing, MAIN.slice(0, 2));
  assert.equal((await index.check({ fetch: web([]), env: {} })).ok, false);
});

test("index: push sends every missing page to IndexNow, up to the weekly cap to Brave main pages first, and none to Brave again within 28 days", async () => {
  const db = docs();
  const calls = [];
  const many = Array.from({ length: 30 }, (_, i) => ({ url: "https://carlosandmunoz.com/s/" + i + ".html", main: false }));
  const missing = [{ url: MAIN[0], main: true }].concat(many);
  const jobs = [];
  const browse = async (job) => { jobs.push(job); return { ok: true, results: job.urls.map((url) => ({ url, ok: !url.endsWith("/3.html"), text: url.endsWith("/3.html") ? "Verifying..." : "ok" })) }; };
  const out = await index.push({ fetch: web([], calls), db, now: NOW, browse }, missing);
  assert.equal(calls.find((c) => c.urlList).urlList.length, 31);
  const sent = jobs.flatMap((j) => j.urls);
  assert.equal(sent.length, index.BRAVE_WEEK);
  assert.equal(sent[0], MAIN[0]);
  assert.ok(jobs.every((j) => j.kind === "brave-submit" && j.urls.length <= 8));
  assert.match(out.detail, /31 pages missing.*IndexNow took 31.*Brave took 23 of 24 \(Verifying\.\.\.\)/);
  jobs.length = 0;
  await index.push({ fetch: web([], calls), db, now: NOW + 7 * DAY, browse }, missing);
  const second = jobs.flatMap((j) => j.urls);
  assert.ok(second.includes("https://carlosandmunoz.com/s/3.html"), "a failed one goes again next week");
  assert.ok(!second.includes(MAIN[0]), "a sent one waits 28 days");
  assert.ok(second.includes("https://carlosandmunoz.com/s/29.html"));
});

test("index: the hourly pass sends the missing pages once a week, and not at all when nothing is missing", async () => {
  const db = fakeDb();
  let pushes = 0;
  let missing = [{ url: MAIN[0], main: true }];
  const ops = { held: async () => [], hubStale: async () => false, failedNotices: async () => [], noticeBudget: async () => 0,
    indexGaps: async () => missing, indexPush: async (list) => { pushes++; return { detail: list.length + " sent" }; } };
  const monday = Date.parse("2026-11-02T15:00:00Z");
  await actions.autoRun({ db, now: monday, settings: {}, ops });
  await actions.autoRun({ db, now: monday + 3 * DAY, settings: {}, ops });
  assert.equal(pushes, 1);
  await actions.autoRun({ db, now: monday + 7 * DAY, settings: {}, ops });
  assert.equal(pushes, 2);
  missing = [];
  await actions.autoRun({ db, now: monday + 14 * DAY, settings: {}, ops });
  assert.equal(pushes, 2);
});

test("index: the briefing warns while Brave has none of our pages and says when Jarvis last sent them", () => {
  const ext = (ix) => ({ search: { ok: true, index: Object.assign({ ok: true, total: 25, indexed: 0, missing: 25, mainMissing: [], zeroSince: "2026-10-01T00:00:00Z", pushedAt: null }, ix) } });
  const line = (e) => core.briefing({ products: {}, external: e, thresholds: core.thresholds({}) }).find((i) => i.key === "search:index");
  assert.equal(line(ext({})).level, "warn");
  assert.match(line(ext({})).text, /none of our 25 sitemap pages indexed \(none since 2026-10-01\)/);
  const some = line(ext({ indexed: 5, missing: 20, zeroSince: null, pushedAt: "2026-11-02T15:00:00Z" }));
  assert.equal(some.level, "info");
  assert.match(some.text, /5 of our 25 .*last sent the missing ones on 2026-11-02/);
  assert.equal(line(ext({ indexed: 25, missing: 0 })), undefined);
});
