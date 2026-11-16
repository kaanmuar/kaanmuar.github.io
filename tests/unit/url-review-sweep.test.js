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

test("a failed tick lists its host and reason under the day, the newest thirty (#1096)", () => {
  let state = sweep.tally({}, "2026-10-24", "failed", { host: "www.hoka.com", cc: "us", at: "2026-10-24T05:15:00Z", reason: "Parse Error: Header overflow", note: "x" });
  state = sweep.tally(state, "2026-10-24", "done", { host: "a.co" });
  assert.deepEqual(state.days["2026-10-24"].failures, [{ host: "www.hoka.com", cc: "us", at: "2026-10-24T05:15:00Z", reason: "Parse Error: Header overflow" }]);
  for (let i = 0; i < 40; i += 1) state = sweep.tally(state, "2026-10-25", "failed", { host: "h" + i + ".co", reason: "r".repeat(300) });
  const kept = state.days["2026-10-25"].failures;
  assert.deepEqual([kept.length, kept[0].host, kept[29].host, kept[0].reason.length], [30, "h10.co", "h39.co", 160]);
  assert.equal(state.days["2026-10-25"].failed, 40);
});

test("a failed sweep review is saved as a failure the diagnosis and re-runs pick up, re-run through the sweep (#1096)", () => {
  const failures = require("../../functions/url-review-failures");
  const target = { host: "www.hoka.com", cc: "us", month: "202609", rank: 12 };
  const record = failures.failureRecord(Object.assign({}, sweep.intake(target), {
    kind: "failed", runId: "sweep-abc", error: new Error("Parse Error: Header overflow"), lines: [{ t: 5, text: "Opening the first page." }],
    startedAt: 1000, endedAt: 2000, source: "sweep", sweep: target
  }));
  assert.deepEqual([record.source, record.cc, record.host, record.url, record.email, record.diagnosedAt, record.runId], ["sweep", "us", "www.hoka.com", "https://www.hoka.com/", "", null, "sweep-abc"]);
  assert.deepEqual(record.sweep, target);
  assert.deepEqual([record.cause.id, record.intake.reasonCode, record.options.frameworks], ["headers", "sweep", ["Playwright"]]);
  assert.ok(failures.SUMMARY_FIELDS.includes("source"));
  assert.equal(failures.failureRecord({ kind: "failed", url: "https://a.co/", error: "x" }).source, undefined);

  const diagnosed = Object.assign({ id: "sweep-abc" }, record, {
    at: "2026-10-24T05:15:00Z", diagnosedAt: "2026-10-24T11:00:00Z",
    diagnosis: { cause: "headers", cleared: false, rerun: false },
    fixes: record.fixes.filter((key) => key !== "headers #1102")
  });
  const plan = failures.rerunPlan([diagnosed], [], 8);
  assert.equal(plan.runs.length, 1, "the headers fix re-runs a sweep failure from before it");
  const group = plan.runs[0];
  assert.deepEqual([group.source, group.sweep, group.email, group.trigger.id], ["sweep", target, "", "fix"]);
  const swept = failures.rerunDoc(group, { record: { id: "r9", status: "complete" }, lines: [] });
  assert.equal(swept.status, "swept");
  assert.equal(failures.rerunTrigger(Object.assign({}, diagnosed, { rerun: failures.rerunMark("x", swept) })), null);
  const mail = failures.rerunMail([swept]);
  assert.equal(mail.subject, "URL review re-runs: 0 held for you, 1 saved by the sweep, 0 failed again");
  assert.match(mail.body, /^Saved by the sweep: www\.hoka\.com for Country sweep\n/);
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

test("outreach prospects go before the lap, in list order, up to the nightly share (#1280)", () => {
  const list = [{ host: "www.eafit.edu.co", cc: "CO", sector: "university" }, { host: "agencia.com.mx", cc: "mx", sector: "agency" }];
  const day = "2026-10-26";
  const first = sweep.nextOutreach({ lap: ["co"], pos: 0 }, list, day);
  assert.deepEqual(first.target, { host: "www.eafit.edu.co", cc: "co", month: "", rank: 0, outreach: true, sector: "university" });
  assert.deepEqual([first.state.outreachAt, first.state.pos], [1, 0], "the lap does not move");
  const second = sweep.nextOutreach(first.state, list, day);
  assert.equal(second.target.host, "agencia.com.mx");
  assert.equal(sweep.nextOutreach(second.state, list, day), null, "the list is done");
  assert.equal(sweep.nextOutreach(second.state, list.concat({ host: "startup.io", cc: "us" }), day).target.host, "startup.io", "appended hosts are picked up");

  let state = sweep.tally({}, day, "skipped", first.target);
  state = sweep.tally(state, day, "done", first.target);
  state = sweep.tally(state, day, "failed", second.target);
  state = sweep.tally(state, day, "done", { host: "a.co", cc: "co" });
  assert.deepEqual([state.days[day].outreach, sweep.doneOn(state, day)], [2, 3], "skips do not use the share; outreach counts in the cap");
  state.days[day].outreach = sweep.OUTREACH_PER_DAY;
  assert.equal(sweep.nextOutreach(Object.assign(state, { outreachAt: 0 }), list, day), null, "tonight's share is used");
  assert.equal(sweep.nextOutreach(Object.assign({}, state, { outreachAt: 0 }), list, day, sweep.OUTREACH_PER_DAY + 1).target.host, "www.eafit.edu.co", "the lane's budget sets the cap");
});

test("the outreach lane starts where the shared sweep stopped and reports over both documents (#2363)", () => {
  assert.equal(sweep.laneStart(undefined, { outreachAt: 244, lap: ["co"] }).outreachAt, 244);
  assert.equal(sweep.laneStart({ outreachAt: 0 }, { outreachAt: 244 }).outreachAt, 0, "the lane's own cursor wins once set");
  const view = sweep.outreachView({ outreachAt: 244, days: { "2026-11-01": { outreach: 40, done: 90 } } }, { outreachAt: 260, days: { "2026-11-01": { outreach: 2 }, "2026-11-02": { outreach: 16 } } });
  assert.deepEqual(view, { outreachAt: 260, days: { "2026-11-01": { outreach: 42 }, "2026-11-02": { outreach: 16 } } });
  assert.equal(sweep.outreachView({ outreachAt: 12 }, null).outreachAt, 12, "before the lane's first tick");
  const ops = require("../../functions/ops-schedule");
  assert.equal(ops.cron("outreachSweep"), "*/15 * * * *", "around the clock");
  assert.equal(ops.budget("outreachPerDay", {}), 96 * sweep.PER_TICK);
});

test("an outreach review is named as such, survives a failed run, and never becomes a social post (#1280)", () => {
  const target = { host: "www.eafit.edu.co", cc: "co", month: "", rank: 0, outreach: true, sector: "university" };
  const value = sweep.intake(target);
  assert.deepEqual([value.name, value.reason, value.reasonCode, value.lang], ["Outreach sweep", "Outreach sweep: a university site in CO", "sweep", "es"]);
  assert.match(sweep.intake({ host: "a.co", cc: "co", month: "202609", rank: 3 }).reason, /^Country sweep: /);

  const failures = require("../../functions/url-review-failures");
  const record = failures.failureRecord(Object.assign({}, value, { kind: "failed", runId: "sweep-x", error: new Error("x"), lines: [], startedAt: 1, endedAt: 2, source: "sweep", sweep: target }));
  assert.deepEqual(record.sweep, target);

  const report = { host: "eafit.edu.co", status: "complete", limits: { pagesRead: 5 }, pages: [{ status: 200 }], insights: { score: { overall: 75, areas: {} }, findings: [] } };
  const picked = publish.selectPublishable([{ createdAt: "2026-10-26T01:00:00Z", source: "sweep", sweep: target, report }], []);
  assert.deepEqual(picked.reports.map((r) => r.source), ["outreach"]);

  const row = { host: "eafit.edu.co", overall: 75, areas: {}, outreach: true, rivals: [{ host: "udea.edu.co", overall: 53, areas: {} }] };
  assert.equal(publish.publicComparisons([row], [])[0].outreach, true);
  assert.equal(publish.publicComparisons([Object.assign({}, row, { outreach: undefined })], [])[0].outreach, undefined);
});

test("the outreach script keeps hosts, countries and sectors only, and leaves out what it cannot sweep (#1280)", () => {
  const { parseCsv, prospectOf } = require("../../scripts/sweep-outreach");
  assert.deepEqual(parseCsv('host,cc,segment\n"www.eafit.edu.co",CO,university\r\nx,,\n'), [["host", "cc", "segment"], ["www.eafit.edu.co", "CO", "university"], ["x", "", ""]]);
  assert.deepEqual(prospectOf({ url: "http://WWW.Agencia.com.mx/servicios", cc: "MX", segment: "Agency" }), { host: "www.agencia.com.mx", cc: "mx", sector: "agency" });
  assert.deepEqual(prospectOf({ host: "betway.com", cc: "gb" }), { skip: "blocked" });
  assert.deepEqual(prospectOf({ host: "uni.edu", cc: "United States" }), { skip: "no two-letter cc" });
  assert.deepEqual(prospectOf({ host: "", cc: "co" }), { skip: "no host" });
  assert.equal(prospectOf({ host: "a.co", cc: "co", email: "jane@a.co", contact_name: "Jane" }).email, undefined);
});

test("the ops table names every job once and flags failed, quiet and never-run jobs", () => {
  const names = ops.JOBS.map((row) => row.job);
  assert.equal(new Set(names).size, names.length);
  assert.equal(ops.cron("sweepReviews"), "*/15 0-5 * * *");
  assert.throws(() => ops.cron("nope"));
  assert.equal(ops.budget("sweepPerDay", {}), 96);
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

test("a job that started and never finished is flagged as crashed once it is past every timeout", () => {
  const now = Date.parse("2026-11-02T13:00:00Z");
  const fresh = new Date(now - 3600000).toISOString();
  const runs = Object.fromEntries(ops.JOBS.filter((r) => r.host !== "github").map((r) => [r.job, { startedAt: fresh, endedAt: fresh, ok: true }]));
  runs.emailMonthlyReviewReport = { startedAt: "2026-11-01T12:50:04Z", endedAt: "", ok: undefined };
  runs.emailDailySiteReport = { startedAt: new Date(now - 10 * 60000).toISOString(), endedAt: fresh, ok: true };
  const problems = ops.overdue(runs, now, "2026-09-01T00:00:00Z");
  assert.deepEqual(problems.map((p) => p.job), ["emailMonthlyReviewReport"]);
  assert.match(problems[0].why, /^started 2026-11-01T12:50:04Z and never finished: it crashed/);
  assert.ok(ops.CRASH_AFTER > 1800 * 1000, "longer than rerunReviewFailures' 1800 s timeout");
});

test("the Live Reports batch starts after the night's last sweep tick", () => {
  const hour = (cron) => Number(cron.split(" ")[1]);
  const lastSweepHour = Number(ops.cron("sweepReviews").split(" ")[1].split("-")[1]);
  assert.ok(hour(ops.cron("ensureLiveReportsBatch")) > lastSweepHour);
  const firstBackupBogota = hour(ops.job("auto-live-reports.yml").cron) - 5;
  assert.ok(firstBackupBogota > lastSweepHour);
});

test("96 a night: 24 ticks of up to 4 reviews, each tick done before the next, the batch and the diagnosis (#1099)", () => {
  const [minutes, hours] = ops.cron("sweepReviews").split(" ");
  const every = Number(minutes.split("/")[1]);
  const [first, last] = hours.split("-").map(Number);
  const ticks = (last - first + 1) * (60 / every);
  assert.equal(ticks * sweep.PER_TICK, sweep.PER_DAY);
  assert.equal(ops.budget("sweepPerDay", {}), sweep.PER_DAY);
  assert.ok(sweep.TICK_MS <= every * 60000 && sweep.TICK_MS < sweep.TICK_SECONDS * 1000);
  assert.ok(sweep.TICK_SECONDS * 1000 <= every * 60000, "a tick never runs into the next one (maxInstances 1)");
  const lastTickEnds = last * 60 + (60 - every) + sweep.TICK_SECONDS / 60;
  const at = (job) => { const [m, h] = ops.cron(job).split(" ").map(Number); return h * 60 + m; };
  ["ensureLiveReportsBatch", "diagnoseReviewFailures"].forEach((job) => assert.ok(at(job) >= lastTickEnds, job));

  assert.equal(sweep.roomForReview(0), true);
  assert.equal(sweep.roomForReview(sweep.TICK_MS - sweep.REVIEW_MS), true);
  assert.equal(sweep.roomForReview(sweep.TICK_MS - sweep.REVIEW_MS + 1), false);
  // At the usual ~100 s a review all four start; at the 240 s stop, three do.
  const started = (ms) => { let n = 0; for (let t = 0; n < sweep.PER_TICK && sweep.roomForReview(t); t += ms) n += 1; return n; };
  assert.deepEqual([started(100000), started(150000), started(sweep.REVIEW_MS)], [4, 4, 3]);
});

// A lane's tick over `hosts`, each review taking ms[host]: tallies and saves as functions/index.js sweepTick does.
async function laneTick(hosts, { slots, ms = {}, room = () => true, cap = Infinity }) {
  const day = "2026-11-09";
  const log = { saves: [], picks: [], live: 0, peak: 0, settling: 0, overlap: false };
  const hold = { state: { cursor: 0 } };
  const busy = new Set();
  const started = Date.now();
  const notes = await sweep.runTick({
    slots,
    room,
    pick: async () => {
      if (sweep.doneOn(hold.state, day) + busy.size >= cap) return { note: "daily cap reached" };
      const host = hosts[hold.state.cursor];
      if (!host) return { note: "nothing to review" };
      hold.state = Object.assign({}, hold.state, { cursor: hold.state.cursor + 1 });
      log.picks.push(host);
      busy.add(host);
      return { target: { host, cc: "co" } };
    },
    review: async (target) => {
      log.live += 1;
      log.peak = Math.max(log.peak, log.live);
      await new Promise((resolve) => setTimeout(resolve, ms[target.host] || 20));
      log.live -= 1;
      return { outcome: target.host.startsWith("bad") ? "failed" : "done", note: target.host + " reviewed" };
    },
    settle: async (target, run) => {
      log.overlap = log.overlap || log.settling > 0;
      log.settling += 1;
      busy.delete(target.host);
      hold.state = sweep.tally(hold.state, day, run.outcome, { host: target.host, reason: "x" });
      await new Promise((resolve) => setTimeout(resolve, 2));
      log.saves.push(JSON.parse(JSON.stringify(hold.state)));
      log.settling -= 1;
      return run.note;
    }
  });
  return Object.assign(log, { notes, state: hold.state, day, elapsed: Date.now() - started });
}

test("a tick runs its reviews at once, up to the lane's concurrency, and keeps notes in pick order (#3166)", async () => {
  const hosts = ["a.co", "bad.co", "c.co", "d.co", "e.co"];
  const out = await laneTick(hosts, { slots: 4, ms: { "a.co": 60, "bad.co": 10, "c.co": 40, "d.co": 20 } });
  assert.equal(out.peak, 4);
  assert.deepEqual(out.picks, hosts.slice(0, sweep.PER_TICK), "never past PER_TICK, and in the lap's order");
  assert.deepEqual(out.notes, ["a.co reviewed", "bad.co reviewed", "c.co reviewed", "d.co reviewed"]);
  assert.equal(out.overlap, false, "ledger writes never overlap");
  assert.equal(out.saves.length, 4);
  assert.deepEqual(out.saves.map((s) => sweep.doneOn(s, out.day)), [1, 2, 3, 4], "each save holds every tally before it");
  assert.equal(out.state.last.host, "a.co", "last is the review that ended last");
  assert.deepEqual(sweep.night(out.state, out.day, 96), { done: 3, failed: 1, skipped: 0, short: true });
  assert.equal(out.state.cursor, 4);
});

test("four 100 ms reviews take one review's time at concurrency 4 and four at concurrency 1 (#3166)", async () => {
  const hosts = ["a.co", "b.co", "c.co", "d.co"];
  const ms = Object.fromEntries(hosts.map((h) => [h, 100]));
  const one = await laneTick(hosts, { slots: 1, ms });
  const four = await laneTick(hosts, { slots: 4, ms });
  assert.equal(one.peak, 1);
  assert.ok(one.elapsed >= 400, "one by one: " + one.elapsed + " ms");
  assert.ok(four.elapsed < 250, "at once: " + four.elapsed + " ms");
  assert.deepEqual(four.notes, one.notes);
  assert.deepEqual(four.state.days, one.state.days);
});

test("a tick starts no review past the cap, the room left or the end of the list (#3166)", async () => {
  const hosts = ["a.co", "b.co", "c.co", "d.co"];
  const capped = await laneTick(hosts, { slots: 4, cap: 2 });
  assert.deepEqual(capped.picks, ["a.co", "b.co"], "in-flight reviews count against the cap");
  assert.equal(capped.notes[2], "daily cap reached");
  let rooms = 0;
  const late = await laneTick(hosts, { slots: 4, room: () => (rooms += 1) <= 3 });
  assert.equal(late.picks.length, 3);
  const short = await laneTick(["a.co"], { slots: 4 });
  assert.deepEqual(short.notes, ["a.co reviewed", "nothing to review"]);
  for (const slots of [0, -2, "x", 9]) {
    const out = await laneTick(hosts, { slots });
    assert.equal(out.peak, slots === 9 ? sweep.PER_TICK : 1, "slots " + slots);
  }
});

test("a failed ledger write stops new reviews, lets running ones end, and fails the tick (#3166)", async () => {
  let reviews = 0;
  let running = 0;
  let saves = 0;
  await assert.rejects(sweep.runTick({
    slots: 2,
    room: () => true,
    pick: async () => ({ target: { host: "h" + reviews } }),
    review: async () => {
      reviews += 1;
      running += 1;
      await new Promise((resolve) => setTimeout(resolve, reviews === 1 ? 5 : 30));
      running -= 1;
      return { outcome: "done", note: "" };
    },
    settle: async () => {
      saves += 1;
      if (saves === 1) throw new Error("Firestore is down");
      return "";
    }
  }), /Firestore is down/);
  assert.equal(reviews, 2);
  assert.equal(running, 0, "the second review ended before the tick failed");
  assert.equal(saves, 2);
});

test("a sweep review waits out a busy review browser, then reviews without it (#3166)", async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  let calls = 0;
  const answers = [{ ok: false, error: "the browser was busy" }, { ok: false, error: "the browser was busy" }, { ok: true, pages: [] }];
  const browse = sweep.patientBrowse(async (job) => { assert.equal(job.url, "https://a.co/"); return answers[calls++]; }, () => false, sleep);
  assert.deepEqual(await browse({ url: "https://a.co/" }), { ok: true, pages: [] });
  assert.deepEqual(waits, [sweep.BUSY_WAIT_MS, 2 * sweep.BUSY_WAIT_MS]);
  calls = 0;
  waits.length = 0;
  const always = sweep.patientBrowse(async () => { calls += 1; return answers[0]; }, () => false, sleep);
  assert.deepEqual(await always({}), answers[0]);
  assert.equal(calls, sweep.BUSY_TRIES);
  calls = 0;
  const late = sweep.patientBrowse(async () => { calls += 1; return answers[0]; }, () => true, sleep);
  await late({});
  assert.equal(calls, 1, "a review past its stop does not wait");
  calls = 0;
  const broken = sweep.patientBrowse(async () => { calls += 1; return { ok: false, error: "status 500" }; }, () => false, sleep);
  await broken({});
  assert.equal(calls, 1, "only a busy browser is waited for");
  assert.equal(sweep.patientBrowse(undefined), undefined);
  assert.ok(sweep.BUSY_WAIT_MS * (sweep.BUSY_TRIES - 1) * sweep.BUSY_TRIES / 2 < sweep.REVIEW_MS / 2, "the waits leave the review most of its time");
});

test("both lanes' concurrency fits the review browser with room for people, and the env can lower it (#3166)", () => {
  const fs = require("fs");
  const path = require("path");
  const source = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const browser = source.match(/exports\.reviewBrowser = [\s\S]*?maxInstances: (\d+)/);
  const lanes = ops.budget("sweepConcurrency", {}) + ops.budget("outreachConcurrency", {});
  assert.deepEqual([ops.budget("sweepConcurrency", {}), ops.budget("outreachConcurrency", {})], [sweep.PER_TICK, sweep.PER_TICK]);
  assert.ok(Number(browser[1]) >= lanes + 3, "a person's 3-way comparison still finds browsers");
  assert.equal(ops.budget("sweepConcurrency", { SWEEP_CONCURRENCY: "1" }), 1);
  assert.equal(ops.budget("outreachConcurrency", { OUTREACH_CONCURRENCY: "2" }), 2);
});

test("the watchdog flags a night that reviewed under half the cap (#1099)", () => {
  let state = {};
  for (let i = 0; i < 40; i += 1) state = sweep.tally(state, "2026-10-25", i % 10 ? "done" : "failed", { host: "h" + i + ".co" });
  state = sweep.tally(state, "2026-10-25", "skipped", { host: "s.co" });
  assert.deepEqual(sweep.night(state, "2026-10-25", 96), { done: 36, failed: 4, skipped: 1, short: true });
  for (let i = 0; i < 10; i += 1) state = sweep.tally(state, "2026-10-25", "done", { host: "m" + i + ".co" });
  assert.equal(sweep.night(state, "2026-10-25", 96).short, false);
  assert.deepEqual(sweep.night({}, "2026-10-26", 96), { done: 0, failed: 0, skipped: 0, short: true });
});

test("the GitHub rows match the crons in the workflow files", () => {
  const fs = require("fs");
  const path = require("path");
  ops.JOBS.filter((row) => row.host === "github").forEach((row) => {
    const yml = fs.readFileSync(path.join(__dirname, "../../.github/workflows", row.job), "utf8");
    assert.ok(yml.includes("cron: '" + row.cron + "'"), row.job + " runs at " + row.cron);
  });
});
