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
    return json({ jobs: [{ name: "projects/p/locations/l/jobs/firebase-schedule-sweepReviews-us-central1", schedule: "*/5 * * * *", state: "ENABLED", status: { code: 2, message: "late" } }] });
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
