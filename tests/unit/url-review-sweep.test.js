const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const sweep = require("../../functions/url-review-sweep");
const ops = require("../../functions/ops-schedule");
const publish = require("../../functions/url-review-publish");

test("seeds keep one main host per domain from the country, without global, blocked or foreign sites", async () => {
  const rows = [
    ["https://login.bancolocal.com.co", 1000],
    ["https://www.bancolocal.com.co", 1000],
    ["https://www.google.com.co", 1000],
    ["https://1xbet.co", 1000],
    ["https://pelis.example.to", 1000],
    ["https://campus.unal.edu.co", 5000],
    ["http://insecure.com.co", 5000],
    ["https://tienda.com", 5000]
  ];
  const hosts = await sweep.seedHosts(rows, new Set(["google.com.co"]), core.registrable, 10, "co");
  assert.deepEqual(hosts, ["www.bancolocal.com.co", "unal.edu.co", "tienda.com"]);
  assert.deepEqual(await sweep.seedHosts([["https://shop.co.uk", 1000]], new Set(), core.registrable, 10, "gb"), ["shop.co.uk"]);
  assert.equal((await sweep.seedHosts(rows, new Set(), core.registrable, 1, "co")).length, 1);
});

const PSL = [
  "// ===BEGIN ICANN DOMAINS===",
  "at", "gv.at", "ac.at", "ae", "gov.ae", "uk", "co.uk", "ck", "*.ck", "!www.ck", "jp", "東京.jp",
  "// ===END ICANN DOMAINS===",
  "// ===BEGIN PRIVATE DOMAINS===", "github.io", "// ===END PRIVATE DOMAINS==="
].join("\n");

test("the Public Suffix List keeps the site's own label under gv.at and reads a bare suffix as no domain", () => {
  const registrable = sweep.suffixRegistrable(PSL);
  assert.equal(registrable("www.oesterreich.gv.at"), "oesterreich.gv.at");
  assert.equal(registrable("WWW.Wien.GV.AT."), "wien.gv.at");
  assert.equal(registrable("shop.co.uk"), "shop.co.uk");
  assert.equal(registrable("www.derstandard.at"), "derstandard.at");
  assert.equal(registrable("u.ae"), "u.ae");
  assert.equal(registrable("gv.at"), "");
  assert.equal(registrable("gov.ae"), "");
  assert.equal(registrable("at"), "");
  assert.equal(registrable("a.b.foo.ck"), "b.foo.ck");
  assert.equal(registrable("www.ck"), "www.ck");
  assert.equal(registrable("www.city.xn--1lqs71d.jp"), "city.xn--1lqs71d.jp");
  assert.equal(registrable("blog.someone.github.io"), "github.io");
  assert.equal(registrable("news.example.zz"), "example.zz");
});

test("seeds under a multi-label suffix keep their own host, and seeds that do not resolve are dropped", async () => {
  const registrable = sweep.suffixRegistrable(PSL);
  const rows = [
    ["https://gv.at", 1000],
    ["https://www.oesterreich.gv.at", 1000],
    ["https://finanzonline.bmf.gv.at", 1000],
    ["https://www.sozialversicherung.at", 1000],
    ["https://portal.uni.ac.at", 5000],
    ["https://gone.at", 5000],
    ["https://news.orf.at", 5000]
  ];
  const live = new Set(["www.oesterreich.gv.at", "bmf.gv.at", "www.sozialversicherung.at", "portal.uni.ac.at", "orf.at"]);
  const asked = [];
  const resolves = async (host) => { asked.push(host); return live.has(host); };
  const hosts = await sweep.seedHosts(rows, new Set(), registrable, 10, "at", resolves);
  assert.deepEqual(hosts, ["www.oesterreich.gv.at", "bmf.gv.at", "www.sozialversicherung.at", "portal.uni.ac.at", "orf.at"]);
  assert.ok(!asked.includes("gv.at"));
  assert.ok(asked.includes("uni.ac.at"));
  assert.deepEqual(await sweep.seedHosts(rows, new Set(), registrable, 2, "at", resolves), ["www.oesterreich.gv.at", "bmf.gv.at"]);
  assert.deepEqual(await sweep.seedHosts(rows, new Set(), registrable, 5, "at", resolves), hosts);
});

test("the committed seeds hold no bare public suffix", () => {
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(__dirname, "../../assets/sweep");
  const bare = new Set(["gv.at", "ac.at", "gov.ae", "com.af", "edu.af", "gov.af", "com.al", "gov.al", "edu.al", "com.cn", "gov.cn", "com.ag"]);
  const found = fs.readdirSync(dir).filter((file) => /^[a-z]{2}\.json$/.test(file))
    .flatMap((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).hosts.filter((host) => bare.has(host)).map((host) => file + ": " + host));
  assert.deepEqual(found, []);
});

test("a lap visits every country once and the six-language markets twice", () => {
  const lap = sweep.lapOrder(["co", "ng", "de", "jp", "kr", "co"]);
  assert.deepEqual(lap, ["co", "de", "jp", "kr", "co", "de", "ng"]);
});

test("the next slot walks the lap, moves each country's cursor and starts a new lap at the end", () => {
  let state = {};
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    const slot = sweep.nextSlot(state, ["co", "jp"]);
    seen.push(slot.cc + slot.at);
    state = slot.state;
  }
  assert.deepEqual(seen, ["co0", "jp0", "co1", "co2", "jp1"]);
  const dropped = sweep.nextSlot({ lap: ["xx"], pos: 0 }, ["co"]);
  assert.equal(dropped.cc, "co");
});

test("the daily tally caps on done and failed, keeps two weeks, and sums for the digest", () => {
  let state = {};
  state = sweep.tally(state, "2026-10-23", "done", { host: "a.co" });
  state = sweep.tally(state, "2026-10-23", "failed", { host: "b.co" });
  state = sweep.tally(state, "2026-10-23", "skipped", { host: "c.co" });
  assert.equal(sweep.doneOn(state, "2026-10-23"), 2);
  assert.equal(state.last.host, "c.co");
  for (let d = 1; d <= 20; d += 1) state = sweep.tally(state, "2026-11-" + String(d).padStart(2, "0"), "done");
  assert.equal(Object.keys(state.days).length, 14);
  assert.deepEqual(sweep.totals(state, "2026-11-15"), { done: 6, failed: 0, skipped: 0 });
});

test("a sweep intake builds a stored record with no undefined field", () => {
  const value = sweep.intake({ host: "www.rionegro.com.ar", cc: "ar", month: "202609", rank: 3 });
  const report = { id: "r1", host: "www.rionegro.com.ar", status: "complete", limits: { pagesRead: 4 } };
  const record = core.intakeRecord(value, report, { country: "AR" });
  assert.equal(record.requestedUrl, "https://www.rionegro.com.ar/");
  assert.equal(record.lang, "es");
  assert.equal(record.email, "");
  assert.deepEqual(Object.keys(record).filter((key) => record[key] === undefined), []);
});

test("site language follows the country", () => {
  assert.equal(sweep.langOf("CO"), "es");
  assert.equal(sweep.langOf("br"), "pt");
  assert.equal(sweep.langOf("at"), "de");
  assert.equal(sweep.langOf("sn"), "fr");
  assert.equal(sweep.langOf("jp"), "en");
});

test("publishable reviews say whether a person asked for them or the sweep found them", () => {
  const report = { host: "tienda.com.co", status: "complete", limits: { pagesRead: 5 }, pages: [{ status: 200 }], insights: { score: { overall: 70, areas: {} }, findings: [] } };
  const picked = publish.selectPublishable([
    { createdAt: "2026-10-22T01:00:00Z", source: "sweep", report },
    { createdAt: "2026-10-22T02:00:00Z", report: Object.assign({}, report, { host: "otra.com" }) }
  ], []);
  assert.deepEqual(picked.reports.map((r) => r.source), ["sweep", "request"]);
});

test("the ops table names every job once and flags failed, quiet and never-run jobs", () => {
  const names = ops.JOBS.map((row) => row.job);
  assert.equal(new Set(names).size, names.length);
  assert.equal(ops.cron("sweepReviews"), "*/15 0-5 * * *");
  assert.throws(() => ops.cron("nope"));
  assert.equal(ops.budget("sweepPerDay", {}), 24);
  assert.equal(ops.budget("sweepPerDay", { SWEEP_PER_DAY: "40" }), 40);
  const now = Date.parse("2026-10-23T13:00:00Z");
  const fresh = new Date(now - 3600000).toISOString();
  const runs = Object.fromEntries(names.map((job) => [job, { endedAt: fresh, ok: true }]));
  assert.deepEqual(ops.overdue(runs, now, "2026-09-01T00:00:00Z"), []);
  runs.rerunReviewFailures = { endedAt: fresh, ok: false, error: "boom" };
  runs.emailDailySiteReport = { endedAt: "2026-10-20T12:00:00Z", ok: true };
  delete runs.sendOwnerNotices;
  assert.deepEqual(ops.overdue(runs, now, "2026-09-01T00:00:00Z").map((p) => p.job), ["rerunReviewFailures", "emailDailySiteReport", "sendOwnerNotices"]);
  assert.deepEqual(ops.overdue({}, now, new Date(now - 1800000).toISOString()).map((p) => p.job), []);
});

test("the Live Reports batch starts after the night's last sweep tick", () => {
  const hour = (cron) => Number(cron.split(" ")[1]);
  const lastSweepHour = Number(ops.cron("sweepReviews").split(" ")[1].split("-")[1]);
  assert.ok(hour(ops.cron("ensureLiveReportsBatch")) > lastSweepHour);
  const firstBackupBogota = hour(ops.job("auto-live-reports.yml").cron) - 5;
  assert.ok(firstBackupBogota > lastSweepHour);
});

test("the GitHub rows match the crons in the workflow files", () => {
  const fs = require("fs");
  const path = require("path");
  ops.JOBS.filter((row) => row.host === "github").forEach((row) => {
    const yml = fs.readFileSync(path.join(__dirname, "../../.github/workflows", row.job), "utf8");
    assert.ok(yml.includes("cron: '" + row.cron + "'"), row.job + " runs at " + row.cron);
  });
});
