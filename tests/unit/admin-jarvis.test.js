const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const core = require("../../js/admin-jarvis-core.js");
const jarvis = require("../../functions/jarvis.js");

const NOW = new Date("2026-10-25T15:00:00Z");
const daysAgo = (n, hour) => new Date(NOW.getTime() - n * core.DAY + (hour || 0) * 3600 * 1000);
const json = (body, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => body, text: async () => JSON.stringify(body) });

test("each product gets its own numbers: CV, Studio, Lab and hub events never mix", () => {
  const window = core.windowFor(7, NOW);
  const rows = [
    { site: "cv", kind: "visit", createdAt: daysAgo(1), query: "?utm_source=LinkedIn", lang: "es", screen: "phone", label: "acme-recruiter" },
    { site: "cv", kind: "visit", createdAt: daysAgo(2), referrerHost: "www.google.com" },
    { site: "cv", kind: "export", name: "pdf", createdAt: daysAgo(1) },
    { site: "cv", kind: "click", name: "hub_open", createdAt: daysAgo(1) },
    { site: "studio", kind: "visit", createdAt: daysAgo(1) },
    { site: "studio", kind: "run", createdAt: daysAgo(1) },
    { site: "lab", kind: "click", name: "lab_start", createdAt: daysAgo(3) }
  ];
  const prior = [{ site: "cv", kind: "visit", createdAt: daysAgo(9) }];
  const cv = core.summarizeSite("cv", rows, prior, window);
  assert.deepEqual(cv.totals, { visits: 2, clicks: 0, exports: 1, runs: 0 });
  assert.equal(cv.kpis[0].prior, 1);
  assert.equal(cv.kpis[0].dir, 1);
  assert.equal(cv.lists.sources[0].label, "linkedin (tagged link)");
  assert.deepEqual(cv.lists.links, [{ label: "acme-recruiter", value: 1 }]);
  assert.equal(cv.series.values.reduce((a, b) => a + b, 0), 2);
  const studio = core.summarizeSite("studio", rows, null, window);
  assert.deepEqual(studio.totals, { visits: 1, clicks: 0, exports: 0, runs: 1 });
  assert.equal(studio.prior, null);
  assert.equal(core.summarizeSite("lab", rows, [], window).totals.clicks, 1);
});

test("URL Review splits opens, reviews, payments and the funnel", () => {
  const window = core.windowFor(30, NOW);
  const summary = core.summarizeReview({
    opens: [{ createdAt: daysAgo(1), query: "?utm_source=x&utm_campaign=premium" }, { createdAt: daysAgo(2) }, { createdAt: daysAgo(2) }, { createdAt: daysAgo(3) }],
    reviews: [
      { createdAt: daysAgo(1).toISOString(), status: "complete", paid: true, priceUsd: 9, score: 80, requestedUrl: "https://shop.example/a", frameworks: ["React"] },
      { createdAt: daysAgo(2).toISOString(), status: "failed", score: 0, requestedUrl: "nope" }
    ],
    events: [{ site: "review", kind: "click", name: "qa_review_share", createdAt: daysAgo(1) }, { site: "review", kind: "click", name: "hub_x", createdAt: daysAgo(1) }],
    prior: { opens: 2, reviews: 2 }
  }, window);
  assert.deepEqual(summary.totals, { opens: 4, reviews: 2, paid: 1, usd: 9, complete: 1, conversion: 50, avgScore: 80 });
  assert.deepEqual(summary.funnel.map((row) => row.value), [4, 2, 1, 1]);
  assert.equal(summary.kpis[0].delta, "+100%");
  assert.ok(summary.lists.sources.some((row) => row.label === "x / premium (tagged link)"));
  assert.deepEqual(summary.lists.hosts.map((row) => row.label).sort(), ["none", "shop.example"]);
  assert.equal(summary.lists.actions.length, 1);
});

test("the inbox honours the real/test filter and flags what waits", () => {
  const window = core.windowFor(7, NOW);
  const messages = [
    { email: "a@real.co", createdAt: daysAgo(1), topic: "Job" },
    { email: "qa@test.dev", createdAt: daysAgo(1), topic: "Job" },
    { email: "b@real.co", createdAt: daysAgo(2), topic: "Hi", response: "thanks" }
  ];
  const ratings = [{ email: "c@real.co", createdAt: daysAgo(1), rating: 5 }, { email: "d@real.co", createdAt: daysAgo(1), rating: 3, status: "approved" }];
  const inbox = core.summarizeInbox(messages, ratings, window, window.prior, (email) => !/test\.dev$/.test(email));
  assert.equal(inbox.totals.messages, 2);
  assert.equal(inbox.totals.unanswered, 1);
  assert.equal(inbox.totals.pending, 1);
  assert.equal(inbox.totals.avg, 4);
});

test("anomaly, delta and the heatmap read sensibly", () => {
  assert.equal(core.anomaly([1, 1, 1, 1, 1, 1]), null);
  const spike = core.anomaly([2, 3, 2, 3, 2, 3, 2, 30]);
  assert.ok(spike && spike.z >= 2.5);
  assert.deepEqual(core.delta(15, 10), { pct: 50, text: "+50%", dir: 1 });
  assert.equal(core.delta(5, undefined).text, "");
  const grid = core.heatmap([{ createdAt: new Date("2026-10-26T14:00:00Z") }]);
  assert.equal(grid.length, 7);
  assert.equal(core.peak(grid), "Mon 09:00 (1)");
});

test("the briefing ranks alerts first and readiness counts every check", () => {
  const window = core.windowFor(7, NOW);
  const rows = Array.from({ length: 20 }, (_, i) => ({ site: "cv", kind: "visit", createdAt: daysAgo(i % 6) }));
  const external = {
    health: { jobs: [{ job: "sweepReviews", ok: false, error: "boom" }, { job: "mailDigest", ok: true }], failures: { total: 0 }, reruns: { held: 0 } },
    github: { ok: true, ci: [{ name: "CI", conclusion: "failure" }], openBugs: 3, bugAreas: [{ label: "be", value: 2 }], merged: { total: 4 } },
    uptime: { ok: true, pages: [{ product: "cv", name: "CV", ok: true, ms: 400 }], tlsDaysLeft: 10 }
  };
  const items = core.briefing({ products: { cv: core.summarizeSite("cv", rows, [], window) }, external });
  assert.equal(items[0].level, "alert");
  assert.ok(items.some((row) => /sweepReviews failed/.test(row.text)));
  assert.ok(items.some((row) => /TLS certificate expires in 10/.test(row.text)));
  assert.equal(core.readiness(external), 50);
  assert.equal(core.readiness({}), null);
});

test("voice and command-bar phrases map to actions", () => {
  assert.deepEqual(core.parseCommand("Jarvis, show URL review"), { type: "go", product: "review" });
  assert.deepEqual(core.parseCommand("simulator"), { type: "go", product: "studio" });
  assert.deepEqual(core.parseCommand("last 7 days"), { type: "range", value: "7" });
  assert.deepEqual(core.parseCommand("all time"), { type: "range", value: "all" });
  assert.deepEqual(core.parseCommand("export csv"), { type: "export", format: "csv" });
  assert.deepEqual(core.parseCommand("print everything"), { type: "print", all: true });
  assert.deepEqual(core.parseCommand("run sweepReviews"), { type: "run-job", job: "sweepReviews" });
  assert.equal(core.parseCommand("why did the CV traffic drop on Tuesday?").type, "ask");
});

test("CSV escapes commas, quotes and objects", () => {
  assert.equal(core.csv([{ a: 'x,"y"', b: { n: 1 } }, { a: 1, c: null }]), 'a,b,c\n"x,""y""","{""n"":1}",\n1,,');
  assert.equal(core.csv([]), "");
});

test("server: GitHub keeps the latest finished run per workflow and groups bugs by area", async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    if (/actions\/runs/.test(url)) return json({ workflow_runs: [
      { name: "CI", status: "in_progress" },
      { name: "CI", status: "completed", conclusion: "success", head_sha: "abcdef123" },
      { name: "CI", status: "completed", conclusion: "failure" },
      { name: "Lint", status: "completed", conclusion: "failure" }
    ] });
    if (/label%3Abug/.test(url)) return json({ total_count: 2, items: [{ labels: [{ name: "bug" }, { name: "area:be" }] }, { labels: [] }] });
    if (/is%3Amerged/.test(url)) return json({ total_count: 1, items: [{ number: 9, title: "t", html_url: "u", closed_at: "c" }] });
    return json([{ number: 1, title: "x", html_url: "u", state: "open", created_at: "z", pull_request: {} }]);
  };
  const out = await jarvis.github(fetch, "token", { now: NOW.getTime() });
  assert.deepEqual(out.ci.map((run) => [run.name, run.conclusion]), [["CI", "success"], ["Lint", "failure"]]);
  assert.equal(out.ci[0].sha, "abcdef1");
  assert.deepEqual(out.bugAreas, [{ label: "be", value: 1 }, { label: "none", value: 1 }]);
  assert.equal(out.recent[0].pr, true);
  assert.equal((await jarvis.github(fetch, "", { now: 0 })).ok, false);
});

test("server: Scheduler jobs get short names and run-job refuses odd names", async () => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push([url, (opts || {}).method]);
    if (/metadata/.test(url)) return json({ access_token: "t" });
    if (/:run$/.test(url)) return json({});
    return json({ jobs: [{ name: "projects/p/locations/l/jobs/firebase-schedule-sweepReviews-us-central1", schedule: "*/5 * * * *", state: "ENABLED", lastAttemptTime: "2026-10-25T05:00:00Z", status: { code: 2, message: "late" } }] });
  };
  const list = await jarvis.jobs(fetch);
  assert.deepEqual(list.map((job) => [job.name, job.ok, job.error]), [["sweepReviews", false, "late"]]);
  const ran = await jarvis.runJob(fetch, "sweepReviews");
  assert.equal(ran.ran, "sweepReviews");
  assert.ok(calls.some(([url, method]) => /firebase-schedule-sweepReviews-us-central1:run$/.test(url) && method === "POST"));
  await assert.rejects(jarvis.runJob(fetch, "../evil"), /Unknown job/);
});

test("server: GA4 splits the current and prior range", async () => {
  const fetch = async (url, opts) => {
    if (/metadata/.test(url)) return json({ access_token: "t" });
    const body = JSON.parse(opts.body);
    const dim = body.dimensions[0].name;
    if (dim === "contentGroup") return json({ rows: [
      { dimensionValues: [{ value: "cv" }, { value: "date_range_0" }], metricValues: ["10", "8", "20", "0.5", "61.4"].map((value) => ({ value })) },
      { dimensionValues: [{ value: "cv" }, { value: "date_range_1" }], metricValues: ["4", "3", "9", "0.4", "30"].map((value) => ({ value })) }
    ] });
    if (dim === "date") return json({ rows: [{ dimensionValues: [{ value: "20261024" }], metricValues: [{ value: "3" }, { value: "2" }] }] });
    return json({ rows: [] });
  };
  const out = await jarvis.ga4(fetch, { days: 7 });
  assert.deepEqual(out.groups[0], { group: "cv", sessions: 10, users: 8, views: 20, engagement: 50, duration: 61, priorSessions: 4, priorUsers: 3 });
  assert.deepEqual(out.daily, [{ date: "2026-10-24", sessions: 3, users: 2 }]);
});

test("server: Cloudflare explains a missing analytics permission", async () => {
  const fetch = async () => json({ errors: [{ message: "not authorized: missing permission" }] });
  const out = await jarvis.cloudflare(fetch, { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ZONE_ID: "abc" }, { days: 7, now: NOW.getTime() });
  assert.deepEqual(out, { ok: false, error: "The Cloudflare token needs Zone > Analytics > Read." });
  assert.equal((await jarvis.cloudflare(fetch, {}, { days: 7, now: 0 })).ok, false);
});

test("server: uptime times each page and reports a failure without throwing", async () => {
  const fetch = async (url) => {
    if (/qa-lab/.test(url)) throw new Error("timeout");
    return { ok: true, status: 200, text: async () => "<html>" };
  };
  const out = await jarvis.uptime(fetch, { now: NOW.getTime(), tls: async () => 40 });
  assert.equal(out.pages.length, jarvis.PAGES.length);
  assert.equal(out.pages.find((page) => page.product === "lab").ok, false);
  assert.equal(out.tlsDaysLeft, 40);
});

test("server: the Gemini briefing sends the snapshot and returns its text", async () => {
  let sent = null;
  const fetch = async (url, opts) => { sent = { url, body: JSON.parse(opts.body) }; return json({ candidates: [{ content: { parts: [{ text: "All quiet. Next: nothing." }] } }] }); };
  const out = await jarvis.brief(fetch, { GEMINI_API_KEY: "k" }, { range: "7", products: { cv: { kpis: [] } } });
  assert.equal(out.text, "All quiet. Next: nothing.");
  assert.match(sent.url, /gemini-flash-latest:generateContent$/);
  assert.match(sent.body.contents[0].parts[0].text, /"range":"7"/);
  await assert.rejects(jarvis.ask(fetch, { GEMINI_API_KEY: "k" }, "  ", {}), /Ask a question/);
  await assert.rejects(jarvis.brief(fetch, {}, {}), /GEMINI_API_KEY/);
});

test("server: the briefing mail lists each product's top numbers", () => {
  const mail = jarvis.briefingMail({ range: "Last 7 days", products: { cv: { name: "CV", kpis: [{ label: "Visits", value: 4, delta: "+33%" }] } } }, "Body");
  assert.equal(mail.subject, "Jarvis briefing: Last 7 days");
  assert.deepEqual(mail.rows, [{ label: "CV", value: "Visits 4 (+33%)" }]);
  assert.equal(jarvis.rangeDays("9999"), 30);
});

test("admin mounts Jarvis in the stats pane and the endpoint stays owner-only", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../admin.html"), "utf8");
  assert.match(html, /<div id="stats-pane" class="hidden"><div id="jarvis-host"><\/div><\/div>/);
  assert.match(html, /import \{ mountJarvis \} from "\.\/js\/admin-jarvis\.js/);
  assert.match(html, /js\/admin-jarvis-core\.js/);
  assert.doesNotMatch(html, /renderStatisticsGraph/);
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const block = index.slice(index.indexOf("exports.jarvis ="));
  assert.match(block, /verifyOperator/);
  assert.match(block, /Access-Control-Allow-Headers", "Content-Type, Authorization"/);
});

// --- #1299: goals, thresholds, daily briefing, watch ------------------------------------------------------------

function fakeDb(data) {
  const writes = [];
  const query = (name, filters) => ({
    where: (field, op, value) => query(name, filters.concat([[field, op, value]])),
    limit: () => query(name, filters),
    count: () => ({ get: async () => ({ data: () => ({ count: (data.counts || {})[name + JSON.stringify(filters.map((f) => f[0] + f[1] + (f[2] instanceof Date ? "date" : typeof f[2] === "string" && /^\d{4}-/.test(f[2]) ? "iso" : f[2])))] ?? 0 }) }) }),
    aggregate: () => ({ get: async () => ({ data: () => ({ usd: data.usd || 0 }) }) }),
    get: async () => ({ docs: ((data.rows || {})[name] || []).map((row, i) => ({ id: row.id || name + i, data: () => row })) }),
    doc: (id) => ({
      get: async () => ({ exists: !!(data.docs || {})[name + "/" + id], data: () => (data.docs || {})[name + "/" + id] }),
      set: async (value) => { writes.push({ path: name + "/" + id, value }); (data.docs = data.docs || {})[name + "/" + id] = value; }
    })
  });
  return { collection: (name) => query(name, []), writes };
}

test("thresholds clamp to their range and drive the briefing", () => {
  assert.equal(core.thresholds({ pendingRatings: 200, uptimeMs: 5, bogus: 1 }).pendingRatings, 200);
  assert.equal(core.thresholds({ uptimeMs: 5 }).uptimeMs, 3000);
  const inbox = { totals: { unanswered: 1, pending: 147 } };
  const loud = core.briefing({ products: { inbox } });
  assert.ok(loud.some((row) => row.text === "1 message in range still has no answer."));
  assert.ok(loud.some((row) => row.text === "147 ratings wait for approval."));
  const quiet = core.briefing({ products: { inbox }, thresholds: { pendingRatings: 200, unanswered: 2 } });
  assert.equal(quiet.length, 0);
});

test("a cancelled CI run is not an alert and does not count against readiness", () => {
  const external = { github: { ok: true, ci: [{ name: "E2E", conclusion: "cancelled" }, { name: "Lint", conclusion: "success" }], merged: { total: 0 } } };
  assert.equal(core.briefing({ external }).filter((row) => row.level === "alert").length, 0);
  assert.equal(core.readiness(external), 100);
});

test("the failure line names the cause label", () => {
  const items = core.briefing({ external: { health: { jobs: [], failures: { total: 49, causes: [{ label: "The site's bot protection refused the review", value: 20 }] }, reruns: { held: 11 } } } });
  assert.ok(items.some((row) => row.text === "49 URL review runs failed in range; top cause: The site's bot protection refused the review."));
  assert.ok(items.some((row) => row.text === "11 re-runs are held on the desk."));
  assert.equal(jarvis.causeLabel({ cause: { id: "tls", label: "TLS failed" } }), "TLS failed");
  assert.equal(jarvis.causeLabel({ cause: "timeout" }), "timeout");
  assert.equal(jarvis.causeLabel({ kind: "failed" }), "failed");
});

test("goals: only known metrics survive, and pace reads against the Bogota week", () => {
  const goals = core.cleanGoals([{ product: "cv", metric: "visits", period: "week", target: "300" }, { product: "cv", metric: "nope", period: "week", target: 5 }, { product: "review", metric: "usd", period: "month", target: 0 }]);
  assert.deepEqual(goals, [{ product: "cv", metric: "visits", period: "week", target: 300 }]);
  const wednesdayNoon = new Date("2026-10-21T17:00:00Z");
  const w = core.periodWindow("week", wednesdayNoon);
  assert.equal(w.start.toISOString(), "2026-10-19T05:00:00.000Z");
  const g = core.goalProgress(goals[0], 50, wednesdayNoon);
  assert.equal(g.label, "CV visits this week");
  assert.equal(g.elapsed, 36);
  assert.equal(g.status, "far-behind");
  assert.equal(core.goalProgress(goals[0], 120, wednesdayNoon).status, "on-track");
  assert.equal(core.goalProgress(goals[0], 300, wednesdayNoon).status, "done");
  const items = core.briefing({ goals: [g, core.goalProgress(goals[0], 300, wednesdayNoon)] });
  assert.equal(items[0].level, "warn");
  assert.match(items[0].text, /^Goal behind: CV visits this week is at 50 of 300/);
  assert.ok(items.some((row) => row.level === "good" && /^Goal met/.test(row.text)));
});

test("server: Scheduler treats a job that never ran as fine", async () => {
  const fetch = async (url) => (/metadata/.test(url) ? json({ access_token: "t" }) : json({ jobs: [
    { name: "x/firebase-schedule-emailMonthlyReviewReport-us-central1", status: { code: -1 } },
    { name: "x/firebase-schedule-sweepReviews-us-central1", lastAttemptTime: "2026-10-25T05:00:00Z", status: { code: 13, message: "" } }
  ] }));
  const list = await jarvis.jobs(fetch);
  assert.deepEqual(list.map((job) => [job.name, job.ok, job.error, job.note]), [["emailMonthlyReviewReport", true, "", "not run yet"], ["sweepReviews", false, "code 13", ""]]);
});

test("server: GitHub skips cancelled runs, Cloudflare prefers the analytics token", async () => {
  const gh = await jarvis.github(async (url) => (/actions\/runs/.test(url) ? json({ workflow_runs: [{ name: "E2E", status: "completed", conclusion: "cancelled" }, { name: "E2E", status: "completed", conclusion: "success" }] }) : /search/.test(url) ? json({ total_count: 0, items: [] }) : json([])), "t", { now: NOW.getTime() });
  assert.deepEqual(gh.ci.map((run) => run.conclusion), ["success"]);
  let auth = "";
  await jarvis.cloudflare(async (url, opts) => { auth = opts.headers.Authorization; return json({ data: { viewer: { zones: [{ httpRequests1dGroups: [] }] } } }); }, { CLOUDFLARE_API_TOKEN: "dns", CLOUDFLARE_ANALYTICS_TOKEN: "analytics", CLOUDFLARE_ZONE_ID: "abc" }, { days: 7, now: NOW.getTime() });
  assert.equal(auth, "Bearer analytics");
});

test("server: settings are cleaned on save and read back with defaults", async () => {
  const db = fakeDb({});
  const empty = await jarvis.readSettings(db);
  assert.deepEqual(empty.mail, { daily: true, gemini: true, watch: true, weekly: true });
  assert.equal(empty.thresholds.tlsDays, 21);
  const saved = await jarvis.saveSettings(db, { goals: [{ product: "review", metric: "paid", period: "week", target: 10 }, { product: "x" }], thresholds: { tlsDays: 30, uptimeMs: "abc" }, mail: { daily: false, gemini: "yes" } }, "kaanmuar@gmail.com");
  assert.equal(saved.goals.length, 1);
  assert.equal(saved.thresholds.tlsDays, 30);
  assert.equal(saved.thresholds.uptimeMs, 3000);
  assert.deepEqual(saved.mail, { daily: false, gemini: true, watch: true, weekly: true });
  assert.equal(db.writes[0].path, "jarvis_settings/main");
  assert.equal(db.writes[0].value.by, "kaanmuar@gmail.com");
});

test("server: goal values come from count and sum aggregations with the right filters", async () => {
  const db = fakeDb({ usd: 34.2, counts: {
    'site_events["site==cv","kind==visit","createdAt>=date","createdAt<date"]': 120,
    'url_reviews["paid==true","createdAt>=iso","createdAt<iso"]': 7,
    'url_review_opens["createdAt>=date","createdAt<date"]': 561
  } });
  const start = new Date("2026-10-19T05:00:00Z");
  const end = new Date("2026-10-26T05:00:00Z");
  assert.equal(await jarvis.goalValue(db, { product: "cv", metric: "visits" }, start, end), 120);
  assert.equal(await jarvis.goalValue(db, { product: "review", metric: "paid" }, start, end), 7);
  assert.equal(await jarvis.goalValue(db, { product: "review", metric: "opens" }, start, end), 561);
  assert.equal(await jarvis.goalValue(db, { product: "review", metric: "usd" }, start, end, (field) => ({ sum: field })), 34.2);
  const rows = await jarvis.goals(db, { goals: [{ product: "cv", metric: "visits", period: "week", target: 300 }] }, { now: Date.parse("2026-10-21T17:00:00Z") });
  assert.deepEqual([rows[0].value, rows[0].status], [120, "on-track"]);
});

test("server: the daily briefing reads the last 24 hours, drops test emails and builds the mail", async () => {
  const now = Date.parse("2026-10-25T12:40:00Z");
  const ts = (h) => ({ toDate: () => new Date(now - h * 3600000) });
  const db = fakeDb({ rows: {
    site_events: [{ site: "cv", kind: "visit", createdAt: ts(2) }, { site: "cv", kind: "visit", createdAt: ts(3) }, { site: "cv", kind: "visit", createdAt: ts(30) }],
    url_review_opens: [{ createdAt: ts(1) }],
    url_reviews: [{ createdAt: new Date(now - 3600000).toISOString(), paid: true, priceUsd: 9, status: "complete" }],
    messages: [{ email: "a@real.co", createdAt: ts(2) }, { email: "pw-bot@example.com", createdAt: ts(2) }],
    ratings: [{ id: "r1", email: "b@real.co", createdAt: ts(5), rating: 5, status: "pending" }]
  } });
  const { products } = await jarvis.dailyProducts(db, { now });
  assert.equal(products.cv.totals.visits, 2);
  assert.equal(products.cv.kpis[0].prior, 1);
  assert.equal(products.inbox.totals.messages, 1);
  assert.equal(products.review.totals.usd, 9);
  const items = core.briefing({ products });
  const mail = jarvis.dailyMail({ products, items, goalRows: [core.goalProgress({ product: "cv", metric: "visits", period: "day", target: 4 }, 2, new Date(now))], aiText: "Quiet day. Next: answer the inbox.", dateLabel: "Sun, Oct 25" });
  assert.match(mail.subject, /^Jarvis daily briefing, Sun, Oct 25: 2 warnings$/);
  assert.ok(mail.rows.some((row) => row.label === "CV" && /^Visits 2 \(\+100%\)/.test(row.value)));
  assert.ok(mail.rows.some((row) => row.label === "Goal" && /CV visits today: 2 of 4/.test(row.value)));
  assert.match(mail.body, /^Quiet day\. Next: answer the inbox\.\n\nWARN {2}1 message/);
});

test("server: the app snapshot widens the window to the range it asks for", async () => {
  const now = Date.parse("2026-10-25T12:40:00Z");
  const ts = (h) => ({ toDate: () => new Date(now - h * 3600000) });
  const db = fakeDb({ rows: { site_events: [{ site: "cv", kind: "visit", createdAt: ts(2) }, { site: "cv", kind: "visit", createdAt: ts(30) }, { site: "cv", kind: "visit", createdAt: ts(200) }] } });
  const { window, products } = await jarvis.dailyProducts(db, { now, days: 7 });
  assert.equal(window.days, 7);
  assert.equal(products.cv.totals.visits, 2);
  assert.equal(products.cv.kpis[0].prior, 1);
});

test("server: Ask from the app gets the page's compact snapshot", () => {
  const snap = { products: { cv: { kpis: [{ label: "Visits", value: 4, prior: 2, delta: "+100%" }], lists: { sources: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ label: "s" + n, value: n })) } } },
    briefing: [{ level: "warn", text: "1 message waits." }], external: { money: { ok: true, revenue: { usd: 9 } }, safety: { ok: false, error: "x" } } };
  const out = jarvis.askSnapshot(snap, 7);
  assert.equal(out.range, "last 7 days");
  assert.deepEqual(out.products.cv.kpis, [{ label: "Visits", value: 4, delta: "+100%" }]);
  assert.equal(out.products.cv.name, "CV");
  assert.equal(out.products.cv.top.sources.length, 5);
  assert.deepEqual(out.briefing, ["[warn] 1 message waits."]);
  assert.equal(out.external.money.revenue.usd, 9);
  assert.equal(out.external.safety, null);
  assert.equal(out.external.outreach, null);
});

test("server: the app snapshot carries outreach visits and Ask gets the page's outreach block", async () => {
  const now = Date.parse("2026-10-25T12:40:00Z");
  const ts = (h) => ({ toDate: () => new Date(now - h * 3600000) });
  const db = fakeDb({ rows: { site_events: [
    { site: "review", kind: "visit", query: "?utm_source=outreach&utm_campaign=unis", createdAt: ts(2) },
    { site: "review", kind: "visit", query: "?utm_source=Outreach&utm_campaign=unis", createdAt: ts(3) },
    { site: "review", kind: "visit", query: "?utm_source=outreach", createdAt: ts(4) },
    { site: "review", kind: "visit", query: "?utm_source=outreach&utm_campaign=old", createdAt: ts(200) },
    { site: "cv", kind: "visit", query: "?utm_source=linkedin", createdAt: ts(2) }
  ] } });
  const { outreachVisits } = await jarvis.dailyProducts(db, { now, days: 7 });
  assert.deepEqual(outreachVisits, { total: 3, campaigns: [{ label: "unis", value: 2 }, { label: "no campaign", value: 1 }] });
  const outreach = { ok: true, pipeline: { ok: true, queued: 40, swept: 12, reviews: 9, thisWeek: 5, withLiveReport: 3, bySegment: [{ label: "university", value: 30 }], daily: [] },
    instantly: { ok: true, status: [{ label: "active", value: 1 }], sent: 80, rates: { open: 40, reply: 5, positive: 2, bounce: 1 }, replies: 4, interested: 2, meetings: 1, accounts: [{ email: "a@x.co", score: 92 }, { email: "b@x.co", score: null }] },
    plan: { ok: false } };
  const out = jarvis.askSnapshot({ external: { outreach }, outreachVisits }, 7).external.outreach;
  assert.deepEqual(out.pipeline, { queued: 40, swept: 12, reviews: 9, thisWeek: 5, withLiveReport: 3, bySegment: [{ label: "university", value: 30 }] });
  assert.deepEqual(out.instantly.warmup, [92, null]);
  assert.equal(out.plan, null);
  assert.equal(out.visits, 3);
});

test("server: the watch mails alerts only, once a day per issue", async () => {
  const external = { uptime: { ok: true, pages: [{ product: "cv", name: "CV", ok: false, status: 503 }, { product: "lab", name: "QA Lab", ok: true, ms: 9000 }], tlsDaysLeft: 50 } };
  const items = jarvis.watchItems(external, {});
  assert.deepEqual(items.map((row) => row.key), ["uptime:cv"]);
  const now = Date.parse("2026-10-25T15:00:00Z");
  const db = fakeDb({ docs: { "jarvis_watch/2026-10-25": { sent: { "uptime:cv": "2026-10-25T13:00:00Z" } } } });
  assert.equal((await jarvis.unsentToday(db, items, { now })).fresh.length, 0);
  assert.equal((await jarvis.unsentToday(fakeDb({}), items, { now })).fresh.length, 1);
});

test("server: Jarvis rules in functions are a byte copy of the admin page's", () => {
  const a = fs.readFileSync(path.join(__dirname, "../../js/admin-jarvis-core.js"), "utf8");
  const b = fs.readFileSync(path.join(__dirname, "../../functions/jarvis-core.js"), "utf8");
  assert.equal(a, b);
  assert.equal(core.isTestEmail("pw-bot@example.com"), true);
  assert.equal(core.isTestEmail("carlos@gmail.com"), false);
  const ops = require("../../functions/ops-schedule.js");
  assert.equal(ops.cron("jarvisDailyBriefing"), "40 7 * * *");
  assert.equal(ops.cron("jarvisWatch"), "5 * * * *");
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /exports\.jarvisDailyBriefing = scheduled\(/);
  assert.match(index, /exports\.jarvisWatch = scheduled\(/);
  ["settings", "settings-save", "goals", "daily-now"].forEach((op) => assert.match(index, new RegExp('op === "' + op + '"')));
});

const sources = require("../../functions/jarvis-sources.js");

test("money: sales, credit runs, refunds and test rows each land in the right place", () => {
  const start = daysAgo(7).getTime();
  const priorStart = daysAgo(14).getTime();
  const at = (n) => daysAgo(n).toISOString();
  const out = sources.moneyRows([
    { id: "a", createdAt: at(1), paid: true, priceUsd: 9, provider: "paypal" },
    { id: "b", createdAt: at(2), paid: true, priceUsd: 19, provider: "paypal", status: "refunded" },
    { id: "c", createdAt: at(2), paid: true },
    { id: "d", createdAt: at(3), paid: true, priceUsd: 9, requestedEmail: "qa@example.com", test: true },
    { id: "e", createdAt: at(10), paid: true, priceUsd: 9, provider: "paypal" }
  ], { start, priorStart });
  assert.deepEqual(out.revenue, { usd: 28, count: 2, avgUsd: 14, paidRuns: 1 });
  assert.deepEqual(out.prior, { usd: 9, count: 1, paidRuns: 0 });
  assert.equal(out.refundsUsd, 19);
  assert.deepEqual(out.byProvider, [{ label: "paypal", value: 28 }]);
});

test("money: rows saved before test and provider were recorded are read from the session and capture", () => {
  const start = daysAgo(7).getTime();
  const at = (n) => daysAgo(n).toISOString();
  const out = sources.moneyRows([
    { id: "stripe-test", createdAt: at(1), paid: true, priceUsd: 19, status: "run-credit", sessionId: "cs_test_a1iwBdIduHvq" },
    { id: "paypal-sandbox", createdAt: at(1), paid: true, priceUsd: 9, paypalMode: "sandbox", captureId: "7AB12345CD678901E" },
    { id: "stripe-live", createdAt: at(2), paid: true, priceUsd: 15, sessionId: "cs_live_b2jxCe" },
    { id: "paypal-live", createdAt: at(2), paid: true, priceUsd: 9, captureId: "8BC23456DE789012F" }
  ], { start, priorStart: daysAgo(14).getTime() });
  assert.deepEqual(out.revenue, { usd: 24, count: 2, avgUsd: 12, paidRuns: 0 });
  assert.deepEqual(out.byProvider, [{ label: "stripe", value: 15 }, { label: "paypal", value: 9 }]);
});

test("search console: a disabled API asks to enable it, a 403 without it asks to add the service account", async () => {
  const ctx = (answer) => ({ now: NOW.getTime(), days: 28, fetch: async (url) => {
    if (/token\?scopes=/.test(url)) return json({ access_token: "t" });
    if (/service-accounts\/default\/email$/.test(url)) return json("fn@carlosm-interactive-cv.iam.gserviceaccount.com");
    return answer;
  } });
  const disabled = await sources.searchConsole(ctx(json({ error: { code: 403, status: "PERMISSION_DENIED", message: "Google Search Console API has not been used in project 976558418058 before or it is disabled." } }, 403)));
  assert.match(disabled.error, /API is turned off/);
  assert.match(disabled.need, /searchconsole\.googleapis\.com/);
  const denied = await sources.searchConsole(ctx(json({ error: { code: 403, status: "PERMISSION_DENIED", message: "User does not have sufficient permission for site 'sc-domain:carlosandmunoz.com'." } }, 403)));
  assert.match(denied.need, /Add user .* with Restricted permission/);
});

test("safety: DNS, DMARC, domain and TLS checks read their records and rank alerts first", async () => {
  const answers = {
    "carlosandmunoz.com/TXT": [{ type: 16, data: "\"v=spf1 include:sendgrid.net ~all\"" }],
    "_dmarc.carlosandmunoz.com/TXT": [{ type: 16, data: "v=DMARC1; p=none; rua=mailto:x@y.z" }],
    "s1._domainkey.carlosandmunoz.com/CNAME": [{ type: 5, data: "s1.sendgrid.net." }],
    "carlosandmunoz.com/MX": []
  };
  const fetch = async (url) => {
    if (/dns\.google/.test(url)) {
      const u = new URL(url);
      return json({ Answer: answers[u.searchParams.get("name") + "/" + u.searchParams.get("type")] || [] });
    }
    if (/rdap/.test(url)) return json({ events: [{ eventAction: "expiration", eventDate: daysAgo(-10).toISOString() }] });
    throw new Error("unexpected " + url);
  };
  const out = await sources.safety({ fetch, env: {}, now: NOW.getTime(), thresholds: core.thresholds({}), tls: async () => 5 });
  const level = (name) => out.checks.find((c) => c.name === name).level;
  assert.equal(level("SPF"), "good");
  assert.equal(level("DMARC"), "warn");
  assert.equal(level("DKIM"), "warn");
  assert.equal(level("MX"), "alert");
  assert.equal(level("Domain"), "alert");
  assert.equal(level("TLS"), "alert");
  assert.equal(level("Web Risk"), "info");
  assert.equal(out.checks[0].level, "alert");
  assert.deepEqual(sources.dmarcPolicy("v=DMARC1; p=quarantine; pct=25"), { p: "quarantine", pct: 25, rua: false });
});

test("brave: our place counts only our own domain, and a failed search does not stop the rest", async () => {
  const fetch = async (url) => {
    if (/q=broken/.test(url)) return json({ message: "rate limited" }, 429);
    return json({ web: { results: [{ url: "https://rival.example/a" }, { url: "https://notcarlosandmunoz.com.evil.io/" }, { url: "https://www.carlosandmunoz.com/qa" }] } });
  };
  const out = await sources.brave({ fetch, env: { BRAVE_SEARCH_KEY: "k" } }, ["qa review", "broken"]);
  assert.deepEqual(out.queries[0], { query: "qa review", position: 3, url: "https://www.carlosandmunoz.com/qa", leader: "rival.example" });
  assert.equal(out.queries[1].position, null);
  assert.ok(out.queries[1].error);
  assert.equal((await sources.brave({ fetch, env: {} }, ["x"])).ok, false);
});

test("platform: real failures come from the log lines, not from every non-2xx", async () => {
  const fetch = async () => json({ entries: [
    { timestamp: "2026-10-25T14:00:00Z", resource: { labels: { function_name: "reviewUrl" } }, textPayload: "Function execution took 540001 ms, finished with status: 'timeout'" },
    { timestamp: "2026-10-25T13:00:00Z", resource: { labels: { function_name: "reviewUrl" } }, textPayload: "Function execution took 20 ms, finished with status code: 500" },
    { timestamp: "2026-10-25T12:00:00Z", resource: { labels: { function_name: "jarvis" } }, textPayload: "finished with status: 'crash'" }
  ], nextPageToken: "more" });
  const out = await sources.realFailures({ fetch }, "t", NOW.getTime() - core.DAY);
  assert.equal(out.total, 3);
  assert.equal(out.capped, true);
  assert.deepEqual(out.byFunction, [{ label: "reviewUrl", value: 2 }, { label: "jarvis", value: 1 }]);
  assert.deepEqual(out.kinds.map((k) => k.label).sort(), ["500", "crash", "timeout"]);
});

test("connections and the new briefing rules read money, mail, search, social, safety and platform", () => {
  const external = {
    money: { ok: true, revenue: { usd: 0, count: 0 }, prior: { usd: 18 }, refundsUsd: 9, paypal: { disputesOpen: 1 }, needs: ["PayPal: turn on Transaction Search."] },
    email: { ok: true, totals: { processed: 40, bounces: 1, blocks: 3, spam_reports: 1 }, rates: { bad: 12.5 }, needs: [] },
    search: { ok: true, brave: { ok: true, queries: [{ query: "qa", position: null }, { query: "cv", position: 2 }] }, console: { ok: false, need: "x" }, needs: ["x"] },
    social: { ok: true, sent: 4, failed: 2, needs: [] },
    safety: { ok: true, checks: [{ name: "DMARC", key: "dmarc", level: "warn", ok: false, detail: "monitor-only" }, { name: "CAA", key: "caa", level: "info", ok: true, detail: "" }] },
    platform: { ok: true, functions: { failures: 30, failureRate: 2, byFunction: [{ label: "reviewUrl", value: 30 }] }, gemini: { requests: 92, ok: 10, errorRate: 89.1, failedMethods: [{ label: "ListModels" }] }, firestore: { reads: 45000, readsFreePct: 90 }, needs: [] },
    github: { ok: false, error: "rate limited" }
  };
  const states = Object.fromEntries(core.connections(external, { ga4: true }).map((c) => [c.key, c.state]));
  assert.equal(states.money, "partial");
  assert.equal(states.email, "live");
  assert.equal(states.github, "down");
  assert.equal(states.ga4, "loading");
  assert.equal(states.cloudflare, "off");
  const rows = core.briefing({ external });
  const by = (key) => rows.find((r) => r.key === key) || {};
  assert.equal(by("money:none").text, "No sales in range, after 18 USD the period before.");
  assert.equal(by("money:refunds").level, "warn");
  assert.equal(by("money:disputes").level, "alert");
  assert.equal(by("email:spam").level, "alert");
  assert.equal(by("email:bad").text, "12.5% of emails bounced or were blocked (4 of 40).");
  assert.equal(by("search:brave").text, "Not in Brave's top 20 for 1 of 2 searches, such as \"qa\".");
  assert.equal(by("social:failed").level, "warn");
  assert.equal(by("safety:dmarc").text, "DMARC: monitor-only");
  assert.ok(!rows.some((r) => r.key === "safety:caa"));
  assert.equal(by("platform:failures").level, "warn");
  assert.equal(by("platform:gemini").level, "warn");
  assert.equal(by("platform:reads").level, "warn");
  assert.equal(by("connections:needs").text, "2 connections wait for a one-time grant; see Systems > Connections.");
  assert.equal(core.briefing({ external, thresholds: { fnFailures: 100, geminiErrorPct: 95, firestoreFreePct: 95, emailBadPct: 20 } }).filter((r) => /^platform:|^email:bad/.test(r.key)).length, 0);
});

test("server: settings keep up to 8 distinct trimmed searches", () => {
  const many = Array.from({ length: 12 }, (_, i) => "q" + i);
  assert.deepEqual(jarvis.normalizeSettings({ searchQueries: [" qa  review ", "qa review", "", 5, "x".repeat(90)] }).searchQueries, ["qa review", "5", "x".repeat(80)]);
  assert.equal(jarvis.normalizeSettings({ searchQueries: many }).searchQueries.length, 8);
  assert.deepEqual(jarvis.normalizeSettings({}).searchQueries, []);
});

test("admin.html loads the Jarvis files with a version that changes with their content", () => {
  const root = path.join(__dirname, "../..");
  const files = ["css/admin-jarvis.css", "js/admin-jarvis-core.js", "js/admin-jarvis.js"];
  const want = require("crypto").createHash("sha1").update(Buffer.concat(files.map((f) => fs.readFileSync(path.join(root, f))))).digest("hex").slice(0, 10);
  const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const seen = Array.from(html.matchAll(/admin-jarvis(?:-core)?\.(?:css|js)\?v=([^"]+)"/g)).map((m) => m[1]);
  assert.equal(seen.length, 4);
  assert.deepEqual(Array.from(new Set(seen)), [want], "set ?v=" + want + " on the Jarvis links in admin.html");
});

test("costs: asks for the export, waits for its first rows, then sums net spend by service", async () => {
  const missing = await sources.costs({ fetch: async () => json({ error: { message: "Not found: Dataset" } }, 404), days: 30 }, "t");
  assert.match(missing.need, /standard usage cost export/);
  const empty = await sources.costs({ fetch: async () => json({ tables: [] }), days: 30 }, "t");
  assert.equal(empty.pending, true);
  let sent = "";
  const fetch = async (url, init) => {
    if (/\/tables$/.test(url)) return json({ tables: [{ tableReference: { tableId: "gcp_billing_export_v1_01CFD3" } }] });
    sent = JSON.parse(init.body).query;
    return json({ rows: [{ f: [{ v: "Cloud Functions" }, { v: "USD" }, { v: "1.25" }, { v: "3.5" }] }, { f: [{ v: "Gemini API" }, { v: "USD" }, { v: "0" }, { v: "0.4" }] }] });
  };
  const out = await sources.costs({ fetch, days: 400 }, "t");
  assert.match(sent, /jarvis_billing\.gcp_billing_export_v1_01CFD3/);
  assert.match(sent, /INTERVAL 90 DAY/);
  assert.deepEqual(out, { days: 90, currency: "USD", net: 1.25, gross: 3.9, byService: [{ label: "Cloud Functions", value: 1.25 }, { label: "Gemini API", value: 0 }] });
});

test("email: refusals that name a blocklist are counted by list", async () => {
  const fetch = async (url) => {
    if (/suppression\/blocks/.test(url)) return json([
      { email: "a@x.org", reason: "551 5.7.1 Your IP is black listed by SpamCop.org", created: 1761400000 },
      { email: "b@y.org", reason: "554 rejected: listed on a DNSBL", created: 1761400000 },
      { email: "c@z.org", reason: "550 mailbox full", created: 1761400000 }
    ]);
    if (/suppression/.test(url)) return json([]);
    return json([]);
  };
  const out = await sources.email({ fetch, env: { SENDGRID_API_KEY: "k" }, now: NOW.getTime(), days: 7 });
  assert.deepEqual(out.blocklisted, [{ label: "spamcop", value: 1 }, { label: "unnamed blocklist", value: 1 }]);
  const rows = core.briefing({ external: { email: Object.assign(out, { totals: { processed: 0, bounces: 0, blocks: 3, spam_reports: 0 }, rates: { bad: 0 } }) } });
  assert.equal(rows.find((r) => r.key === "email:blocklist").text, "2 emails were refused because the sending IP is on spamcop, unnamed blocklist.");
});

test("social: posts scheduled for later are counted apart, not listed as recent", async () => {
  const at = (n) => daysAgo(n).toISOString();
  const buffer = { posts: { p1: [{ channel: "x", result: "sent", at: at(1) }, { channel: "x", result: "queued", at: at(-3) }, { channel: "tiktok", result: "queued", at: at(-1) }] } };
  const fetch = async (url) => (/buffer\.json/.test(url) ? json(buffer) : json({}, 404));
  const out = await sources.social({ fetch, env: {}, now: NOW.getTime(), days: 30 });
  assert.equal(out.sent, 1);
  assert.equal(out.latest.length, 1);
  assert.deepEqual(out.scheduled, { count: 2, next: at(-1) });
});

test("a source that does not answer gets a briefing line, and test payments stay out of revenue", () => {
  const rows = core.briefing({ external: { cloudflare: { ok: false, error: "Cloudflare 401: no answer" } } });
  assert.equal(rows.find((r) => r.key === "connections:down:cloudflare").text, "Cloudflare did not answer: Cloudflare 401: no answer");
  const sum = core.summarizeReview({ reviews: [{ paid: true, priceUsd: 19, createdAt: daysAgo(1) }, { paid: true, priceUsd: 15.2, test: true, createdAt: daysAgo(1) }] }, core.windowFor(30, NOW));
  assert.equal(sum.totals.usd, 19);
  assert.equal(sum.totals.paid, 1);
});

const outreachSrc = require("../../functions/jarvis-outreach.js");
const outreachPlan = require("../../scripts/jarvis-outreach-plan.js");

test("outreach: the week starts Monday in Bogota and the pipeline counts only outreach sweep reviews", () => {
  assert.equal(new Date(outreachSrc.weekStart(NOW.getTime())).toISOString(), "2026-10-19T05:00:00.000Z");
  const queue = { hosts: [{ host: "uni.edu.co", sector: "university" }, { host: "tvet.example", sector: "tvet" }, { host: "agency.example", sector: "agency" }] };
  const reviews = [
    { createdAt: daysAgo(1).toISOString(), status: "complete", score: 70, sweep: { host: "uni.edu.co", outreach: true, sector: "university" } },
    { createdAt: daysAgo(2).toISOString(), status: "failed", sweep: { host: "tvet.example", outreach: true, sector: "tvet" } },
    { createdAt: daysAgo(10).toISOString(), status: "complete", score: 90, sweep: { host: "agency.example", outreach: true, sector: "agency" } },
    { createdAt: daysAgo(1).toISOString(), status: "complete", score: 50, sweep: { host: "other.example" } }
  ];
  const p = outreachSrc.pipelineRows(queue, { outreachAt: 2, days: { "2026-10-24": { outreach: 1 }, "2026-10-01": { outreach: 9 } } }, reviews, ["www.uni.edu.co"], { now: NOW.getTime(), days: 7 });
  assert.equal(p.queued, 3);
  assert.equal(p.swept, 2);
  assert.equal(p.left, 1);
  assert.equal(p.reviews, 2);
  assert.equal(p.thisWeek, 2);
  assert.deepEqual(p.results, [{ label: "failed", value: 1 }, { label: "reviewed", value: 1 }]);
  assert.equal(p.avgScore, 70);
  assert.equal(p.withLiveReport, 1);
  assert.equal(p.reviewedWithLiveReport, 1);
  assert.deepEqual(p.daily, [{ date: "2026-10-24", reviews: 1 }]);
});

test("outreach: Instantly numbers become rates, campaign states and mailbox warm-up", () => {
  const x = outreachSrc.instantlyRows(
    [{ status: 0 }, { status: 0 }, { status: 1 }],
    { emails_sent_count: 200, contacted_count: 100, open_count_unique: 50, reply_count_unique: 8, reply_count_automatic_unique: 2, total_interested: 3, bounced_count: 10 },
    [{ campaign_name: "TVET wave 1", emails_sent_count: 200, open_count_unique: 50, reply_count_unique: 8, bounced_count: 10 }, { campaign_name: "Draft", emails_sent_count: 0 }],
    [{ email: "carlos@qalabreview.com", status: 1, warmup_status: 1, stat_warmup_score: 62, daily_limit: 30 }]
  );
  assert.deepEqual(x.status, [{ label: "draft", value: 2 }, { label: "active", value: 1 }]);
  assert.deepEqual(x.rates, { open: 50, reply: 8, positive: 3, bounce: 5 });
  assert.equal(x.byCampaign.length, 1);
  assert.deepEqual(x.accounts[0], { email: "carlos@qalabreview.com", status: "active", warmup: "on", score: 62, dailyLimit: 30 });
});

test("outreach: the plan knows the day, phase, next milestone and sorted deadlines", () => {
  const plan = {
    start: "2026-10-20", end: "2027-01-17",
    phases: [{ name: "Set up", start: "2026-10-20", end: "2026-11-02" }, { name: "Test", start: "2026-11-03", end: "2026-11-30" }],
    milestones: [{ date: "2026-10-22", label: "Domain ready" }, { date: "2026-10-30", label: "First wave" }],
    deadlines: [{ date: "2027-10-25", label: "Domain renewal" }, { date: "2026-10-31", label: "Instantly trial ends" }]
  };
  const now = outreachSrc.planNow(plan, NOW.getTime());
  assert.equal(now.day, 6);
  assert.equal(now.length, 90);
  assert.equal(now.phase.name, "Set up");
  assert.deepEqual(now.next, { date: "2026-10-30", label: "First wave", daysLeft: 5 });
  assert.equal(now.milestones[0].past, true);
  assert.equal(now.deadlines[0].label, "Instantly trial ends");
  assert.equal(outreachSrc.planNow(null, NOW.getTime()), null);
});

test("outreach: the plan script folds the weekly KPI tracker into target actuals", () => {
  const rows = outreachPlan.parseCsv("week,paid_reviews,backlinks,emails_sent\n2026-10-26,2,1,40\n2026-11-02,3,\"2\",60\n");
  const track = outreachPlan.tracker(rows);
  const doc = outreachPlan.build({ start: "2026-10-26", end: "2027-01-24", targets: [{ key: "unlocks", label: "Paid unlocks", target: 30 }, { key: "links", label: "Backlinks", target: 15 }, { key: "talks", label: "Talks", target: 6 }] }, track);
  assert.deepEqual(doc.targets.map((t) => t.actual), [5, 3, null]);
  assert.equal(doc.tracker.emailsSent, 100);
});

test("outreach: visits from outreach links are counted by campaign", () => {
  const v = core.outreachVisits([
    { kind: "visit", query: "?utm_source=outreach&utm_campaign=tvet-1" },
    { kind: "visit", query: "?utm_source=Outreach&utm_campaign=tvet-1" },
    { query: "?utm_source=outreach" },
    { kind: "click", query: "?utm_source=outreach" },
    { kind: "visit", query: "?utm_source=linkedin" }
  ]);
  assert.equal(v.total, 3);
  assert.deepEqual(v.campaigns, [{ label: "tvet-1", value: 2 }, { label: "no campaign", value: 1 }]);
});

test("outreach briefing: close deadlines, bounces, replies, cold mailboxes and DNS gaps", () => {
  const th = core.thresholds();
  const ext = { outreach: { ok: true, needs: [],
    plan: { day: 10, deadlines: [{ date: "2026-10-30", label: "Instantly trial ends", daysLeft: 5 }, { date: "2026-11-05", label: "M365 trial ends", daysLeft: 11 }, { date: "2027-10-25", label: "Renewal", daysLeft: 365 }], next: { date: "2026-10-28", label: "First wave", daysLeft: 3 }, weekly: { prospects: 40 } },
    pipeline: { ok: true, left: 0, thisWeek: 4 },
    instantly: { ok: true, sent: 100, bounced: 6, replies: 5, autoReplies: 1, interested: 2, rates: { bounce: 6 }, status: [{ label: "active", value: 1 }], accounts: [{ email: "a@q.com", status: "active", warmup: "on", score: 40 }] },
    mail: { domain: "qalabreview.com", checks: [{ name: "DMARC", ok: false, detail: "p=none (monitor only)" }, { name: "SPF", ok: true, detail: "" }] } } };
  const items = core.briefing({ external: ext, thresholds: th, now: NOW, products: {} }).filter((i) => i.product === "outreach");
  const byKey = Object.fromEntries(items.map((i) => [i.key, i.level]));
  assert.equal(byKey["outreach:deadline:2026-10-30"], "warn");
  assert.equal(byKey["outreach:deadline:2026-11-05"], "info");
  assert.equal(byKey["outreach:deadline:2027-10-25"], undefined);
  assert.equal(byKey["outreach:milestone"], "info");
  assert.equal(byKey["outreach:queue"], "warn");
  assert.equal(byKey["outreach:bounce"], "alert");
  assert.equal(byKey["outreach:replies"], "info");
  assert.equal(byKey["outreach:warmup"], "warn");
  assert.equal(byKey["outreach:dns:DMARC"], "warn");
  assert.equal(byKey["outreach:dns:SPF"], undefined);
});

const parity = require("../../scripts/check-jarvis-parity.js");

test("parity: a web Jarvis change needs an android/ change or 'no app change' in the PR body", () => {
  assert.equal(parity.check(["functions/url-review.js", "admin.html"], "").ok, true);
  assert.equal(parity.check(["js/admin-jarvis.js"], "").ok, false);
  assert.equal(parity.check(["functions/jarvis-sources.js", "css/admin-jarvis.css"], "Fixes #1").ok, false);
  assert.equal(parity.check(["js/admin-jarvis-core.js", "android/app/src/main/java/com/carlosandmunoz/jarvis/ui/Screens.kt"], "").ok, true);
  assert.deepEqual(parity.check(["functions/jarvis.js"], "No app change: the app reads it through snapshot."), { ok: true, web: ["functions/jarvis.js"], optOut: true });
  assert.equal(parity.check(["functions/jarvis.js"], "no app change:").ok, false);
});

const push = require("../../functions/jarvis-push.js");

function pushDb() {
  const docs = {};
  const col = { doc: (id) => ({ set: async (row, o) => { docs[id] = Object.assign(o && o.merge ? docs[id] || {} : {}, row); }, delete: async () => { delete docs[id]; } }),
    get: async () => ({ docs: Object.keys(docs).map((id) => ({ id, data: () => docs[id] })) }) };
  return { docs, collection: () => col };
}

test("push: phones register with their kinds, and each kind reaches only the phones that keep it on", async () => {
  const db = pushDb();
  const a = "a".repeat(40), b = "b".repeat(40);
  await push.register(db, { token: a, name: "Pixel" }, "owner", Date.parse("2026-10-25T12:00:00Z"));
  await push.register(db, { token: b, kinds: { briefing: false } }, "owner", Date.parse("2026-10-25T12:00:00Z"));
  assert.deepEqual((await push.list(db)).find((d) => d.token === b).kinds, { alerts: true, briefing: false, money: true, reviews: true, outreach: true });
  assert.deepEqual(await push.targets(db, "briefing"), [a]);
  assert.deepEqual((await push.targets(db, "alerts")).sort(), [a, b]);
  await assert.rejects(push.register(db, { token: "short" }, "owner", 0), /not a device token/);
  await push.unregister(db, b);
  assert.deepEqual(await push.targets(db, "test"), [a]);
});

test("push: alert and briefing messages, and dead tokens are dropped after a send", async () => {
  const m = push.alertMessage([{ text: "CV is down (503)." }, { text: "TLS expires in 5 days." }]);
  assert.equal(m.title, "Jarvis alerts: 2");
  assert.equal(m.body, "CV is down (503). (+1 more)");
  assert.equal(m.tab, "systems");
  const b = push.briefingMessage({ items: [{ level: "alert", text: "x" }, { level: "warn", text: "y" }, { level: "info", text: "z" }], aiText: "\nQuiet day overall.\nMore.", dateLabel: "Sun, Oct 25" });
  assert.equal(b.title, "Jarvis briefing, Sun, Oct 25: 1 alert, 1 warning");
  assert.equal(b.body, "Quiet day overall.");
  assert.deepEqual(b.lines, ["x", "y"]);
  assert.match(push.briefingMessage({ items: [], aiText: "", dateLabel: "Mon" }).title, /All clear$/);

  const db = pushDb();
  const ok = "o".repeat(40), dead = "d".repeat(40);
  await push.register(db, { token: ok }, "owner", 0);
  await push.register(db, { token: dead }, "owner", 0);
  let seen;
  const messaging = { sendEachForMulticast: async (msg) => { seen = msg; return { successCount: 1, failureCount: 1, responses: [{ success: true }, { success: false, error: { code: "messaging/registration-token-not-registered" } }] }; } };
  const out = await push.send(messaging, db, [ok, dead], m);
  assert.deepEqual(out, { sent: 1, failed: 1, removed: 1 });
  assert.equal(seen.android.priority, "high");
  assert.equal(seen.data.kind, "alerts");
  assert.deepEqual(JSON.parse(seen.data.lines), ["CV is down (503).", "TLS expires in 5 days."]);
  assert.deepEqual(await push.targets(db, "alerts"), [ok]);
  assert.deepEqual(await push.send(messaging, db, [], m), { sent: 0, failed: 0, removed: 0 });
});

const review = require("../../functions/jarvis-review.js");

test("share-to-review: the shared text becomes a clean URL and a queued owner review", async () => {
  assert.equal(review.cleanUrl("Look at this https://example.com/pricing?x=1). Nice"), "https://example.com/pricing?x=1");
  assert.equal(review.cleanUrl("example.org"), "https://example.org/");
  assert.throws(() => review.cleanUrl("just words"), /web address/);
  assert.equal(review.cleanLang("pt-BR"), "pt");
  assert.equal(review.cleanLang("nl"), "en");
  const added = [];
  const db = { collection: (name) => ({ add: async (row) => { added.push([name, row]); return { id: "r1" }; } }) };
  const out = await review.enqueue(db, { url: "https://shop.example.com", lang: "es", token: "tok" }, "owner@example.com", NOW.getTime());
  assert.deepEqual(out, { id: "r1", url: "https://shop.example.com/", lang: "es", host: "shop.example.com" });
  assert.equal(added[0][0], "jarvis_reviews");
  assert.equal(added[0][1].status, "queued");
  assert.equal(review.intake(added[0][1]).email, "owner@example.com");
});

test("share-to-review: the done push names the score and the failing checks, and opens the report", () => {
  const report = { host: "shop.example.com", limits: { pagesRead: 12 }, insights: { score: { overall: 71, grade: "C", totals: { fail: 2, risk: 1, pass: 30 } },
    findings: [{ verdict: "fail", title: "No HTTPS redirect" }, { verdict: "pass", title: "Has a title" }, { verdict: "risk", title: "Slow LCP" }] } };
  const m = review.doneMessage(report, "https://carlosandmunoz.com/qa-review.html?report=abc");
  assert.equal(m.title, "Review done: shop.example.com scored 71 (C)");
  assert.match(m.body, /^12 pages read: 2 failing, 1 at risk, 30 passing/);
  assert.deepEqual(m.lines, ["No HTTPS redirect", "Slow LCP"]);
  assert.equal(m.url, "https://carlosandmunoz.com/qa-review.html?report=abc");
  assert.equal(review.failedMessage("https://x.example.com/", "Timed out").title, "Review failed: x.example.com");
});

test("voice: spoken asks answer in the phone's language, plain text for speech", async () => {
  let prompt = "";
  const fetchImpl = async (url, init) => { prompt = JSON.parse(init.body).contents[0].parts[0].text; return json({ candidates: [{ content: { parts: [{ text: "Vas bien." }] } }] }); };
  const out = await jarvis.ask(fetchImpl, { GEMINI_API_KEY: "k" }, "¿Cómo va?", { a: 1 }, { lang: "es-ES", spoken: true });
  assert.deepEqual(out, { text: "Vas bien.", lang: "es" });
  assert.match(prompt, /Answer in Spanish\./);
  assert.match(prompt, /spoken sentences/);
  await jarvis.ask(fetchImpl, { GEMINI_API_KEY: "k" }, "How is it going?", {});
  assert.doesNotMatch(prompt, /Answer in [A-Z]/);
  assert.equal(jarvis.langCode("pt_BR"), "pt");
  assert.equal(jarvis.langCode("??"), "en");
});

test("voice: speak strips markdown, asks for Charon, and falls back to any male voice", async () => {
  assert.equal(jarvis.speakable("**Revenue** is up.\n- 3 sales\n# Next: [post](https://x.y)"), "Revenue is up. 3 sales Next: post");
  const voices = [];
  const fetchImpl = async (url, init) => {
    if (/metadata/.test(url)) return json({ access_token: "t" });
    const body = JSON.parse(init.body);
    voices.push(body.voice);
    return body.voice.name ? json({ error: { message: "no such voice" } }, 400) : json({ audioContent: "QUJD" });
  };
  const out = await jarvis.speak(fetchImpl, "*Hola*", "es");
  assert.deepEqual(out, { audio: "QUJD", format: "mp3", lang: "es" });
  assert.deepEqual(voices, [{ languageCode: "es-ES", name: "es-ES-Chirp3-HD-Charon" }, { languageCode: "es-ES", ssmlGender: "MALE" }]);
  await assert.rejects(jarvis.speak(fetchImpl, "  ", "en"), /Nothing to say/);
});

const notify = require("../../functions/jarvis-notify.js");

test("a live payment pushes amount, what and who; test and free ones stay quiet", () => {
  const note = { name: "Ana", email: "ana@shop.com", url: "https://www.shop.com/" };
  const msg = notify.paymentMessage("paid", { id: "r1", priceUsd: 19, via: "webhook" }, note);
  assert.equal(msg.kind, "money");
  assert.equal(msg.title, "$19 · Report paid · shop.com");
  assert.equal(msg.body, "Ana · ana@shop.com");
  assert.equal(msg.tab, "business");
  assert.equal(notify.paymentMessage("run-paid", { priceUsd: 4.5, competitors: 3 }, {}).lines[1], "3 competitor runs");
  assert.equal(notify.paymentMessage("paid", { priceUsd: 19, test: true }, note), null);
  assert.equal(notify.paymentMessage("paid", { priceUsd: 0 }, note), null);
  assert.equal(notify.paymentMessage("report", { priceUsd: 19 }, note), null);
});

test("only customer reviews push, with who, plan and the score", () => {
  const report = { host: "shop.com", limits: { pagesRead: 12 }, insights: { score: { overall: 81, grade: "B", totals: { fail: 2, risk: 3, pass: 30 } }, findings: [{ verdict: "fail", title: "No HTTPS redirect" }] } };
  const msg = notify.reviewMessage("report", { id: "x", report, name: "Ana", free: true });
  assert.equal(msg.kind, "reviews");
  assert.equal(msg.title, "New review: shop.com scored 81 (B)");
  assert.equal(msg.body, "Ana · free. 12 pages read: 2 failing, 3 at risk, 30 passing.");
  assert.deepEqual(msg.lines, ["No HTTPS redirect"]);
  assert.match(notify.reviewMessage("stopped", { report, passId: "p" }).title, /^Review stopped early/);
  for (const row of [{ report, source: "sweep" }, { report, source: "jarvis" }, { report, test: true }]) assert.equal(notify.reviewMessage("report", row), null);
  assert.equal(notify.reviewMessage("failed", { report }), null);
});

test("outreach notices push what is new, at most once an hour", () => {
  const now = Date.parse("2026-10-25T15:00:00Z");
  const pending = [
    { status: "pending", host: "a.com", email: "x@a.com", createdAt: "2026-10-25T14:30:00Z", critical: true },
    { status: "pending", host: "b.com", email: "y@b.com", createdAt: "2026-10-25T12:00:00Z" }
  ];
  assert.equal(notify.noticesDue(pending, "", now).length, 2);
  assert.deepEqual(notify.noticesDue(pending, "2026-10-25T13:00:00Z", now).map((n) => n.host), ["a.com"]);
  assert.deepEqual(notify.noticesDue(pending, "2026-10-25T14:10:00Z", now), []);
  const msg = notify.noticesMessage([pending[0]], 2);
  assert.equal(msg.title, "2 outreach notices waiting for you");
  assert.equal(msg.body, "1 new: a.com. 1 critical security finding. Send or drop each one.");
  assert.deepEqual(msg.lines, ["a.com → x@a.com · critical"]);
});

test("phones keep the new push kinds on unless turned off", () => {
  assert.deepEqual(push.cleanKinds({ money: false }), { alerts: true, briefing: true, money: false, reviews: true, outreach: true });
});
