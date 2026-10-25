/* Jarvis: the owner-only data the admin Statistics tab cannot read from Firestore rules or the browser.

   Each op returns plain JSON for js/admin-jarvis.js. index.js checks the owner (verifyOperator), caches each op in
   jarvis_cache/<op> for TTL[op], and runs the actions (run a scheduled job, unlist a host, email the briefing).

   health       ops_runs, failures, re-runs, alerts, owner notices, rivals, coupons, captures (server-only collections)
   jobs         Cloud Scheduler jobs: schedule, state, last attempt, last status
   github       CI on main, open bugs by area, PRs merged in the last 7 days, the newest issues
   ga4          sessions, users, views and engagement by content group, country, source and day (property 495572902)
   cloudflare   requests, bytes, cache ratio, threats and uniques for the zone (needs Zone Analytics Read)
   speed        PageSpeed (mobile) for each product page, CrUX history for the origin
   uptime       status, latency and TLS days left for each product page
   brief / ask  Gemini writes the briefing or answers a question from the numbers the page sends */

const PROJECT = "carlosm-interactive-cv";
const PROPERTY = "495572902";
const REPO = "kaanmuar/kaanmuar.github.io";
const ORIGIN = "https://carlosandmunoz.com";
const PAGES = [
  { product: "cv", name: "CV", url: ORIGIN + "/" },
  { product: "studio", name: "QA Studio", url: ORIGIN + "/simulador.html" },
  { product: "lab", name: "QA Lab", url: ORIGIN + "/qa-lab.html" },
  { product: "review", name: "URL Review", url: ORIGIN + "/qa-review.html" },
  { product: "hub", name: "Social hub", url: ORIGIN + "/qa-review-social.html" }
];
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const TTL = { health: MINUTE, jobs: MINUTE, github: 5 * MINUTE, ga4: 15 * MINUTE, cloudflare: 15 * MINUTE, speed: 6 * 60 * MINUTE, uptime: 5 * MINUTE };
const SCHEDULER = "https://cloudscheduler.googleapis.com/v1/projects/" + PROJECT + "/locations/us-central1/jobs";
const JOB_PREFIX = "firebase-schedule-";
const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL = "gemini-flash-latest";
const core = require("./jarvis-core");
const { AggregateField } = require("firebase-admin/firestore");
const ADMIN_URL = ORIGIN + "/admin.html#stats/overview/1";

function rangeDays(value) {
  const days = Number(value);
  return Number.isFinite(days) && days >= 1 && days <= 400 ? Math.round(days) : 30;
}

function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function count(map, key, by) {
  const name = String(key || "unknown").slice(0, 80);
  map[name] = (map[name] || 0) + (by || 1);
}

function top(map, limit) {
  return Object.keys(map).map((key) => ({ label: key, value: map[key] })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, limit || 12);
}

async function googleToken(fetchImpl, scope) {
  const res = await fetchImpl(METADATA + "?scopes=" + encodeURIComponent(scope), { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("No Google token (" + res.status + ")");
  return (await res.json()).access_token;
}

async function readJson(res, label) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(label + " " + res.status + ": " + String((data.error && (data.error.message || data.error)) || data.message || "no answer").slice(0, 200));
  return data;
}

// Failure causes are stored as { id, label, ... }; older rows may hold a plain string.
function causeLabel(row) {
  const cause = row && row.cause;
  if (cause && typeof cause === "object") return String(cause.label || cause.id || "unknown");
  return String(cause || (row && row.kind) || "unknown");
}

// --- health: server-only Firestore collections -------------------------------------------------------------

async function health(db, { days, now }) {
  const since = new Date(now - rangeDays(days) * DAY).toISOString();
  const read = async (name, field) => {
    try {
      const snap = await db.collection(name).where(field, ">=", since).limit(2000).get();
      return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
    } catch (error) {
      return [];
    }
  };
  const [runs, failures, reruns, alerts, notices, rivals, coupons, captures] = await Promise.all([
    db.collection("ops_runs").get().then((snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()))).catch(() => []),
    read("url_review_failures", "at"),
    read("url_review_reruns", "at"),
    read("url_review_alerts", "at"),
    read("url_review_owner_notices", "createdAt"),
    read("url_review_rivals", "createdAt"),
    read("url_review_coupons", "createdAt"),
    read("url_review_captures", "at")
  ]);
  const causes = {}, failedHosts = {}, rerunStatus = {}, alertKinds = {}, noticeStatus = {}, captureKinds = {};
  failures.forEach((row) => { count(causes, causeLabel(row)); count(failedHosts, row.host); });
  reruns.forEach((row) => count(rerunStatus, row.status));
  alerts.forEach((row) => count(alertKinds, row.kind || row.title));
  notices.forEach((row) => count(noticeStatus, row.unlistedAt ? "unlisted" : row.status));
  captures.forEach((row) => count(captureKinds, row.kind));
  const couponUses = coupons.reduce((sum, row) => sum + (Number(row.uses) || 0), 0);
  return {
    jobs: runs.map((row) => ({ job: row.job || row.id, ok: row.ok !== false, startedAt: row.startedAt || "", endedAt: row.endedAt || "", note: String(row.note || "").slice(0, 160), error: String(row.error || "").slice(0, 200) }))
      .sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt))),
    failures: { total: failures.length, causes: top(causes), hosts: top(failedHosts, 8), latest: failures.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8).map((row) => ({ at: row.at, host: row.host, cause: causeLabel(row), message: String((row.error && row.error.message) || "").slice(0, 140) })) },
    reruns: { total: reruns.length, status: top(rerunStatus), held: reruns.filter((row) => row.status === "held").length },
    alerts: { total: alerts.length, kinds: top(alertKinds), latest: alerts.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8).map((row) => ({ at: row.at, kind: row.kind, title: String(row.title || "").slice(0, 120), url: row.url || "" })) },
    notices: { total: notices.length, status: top(noticeStatus) },
    rivals: { total: rivals.length },
    coupons: { total: coupons.length, uses: couponUses },
    captures: { total: captures.length, kinds: top(captureKinds) }
  };
}

// --- jobs: Cloud Scheduler ------------------------------------------------------------------------------------

function jobName(full) {
  const short = String(full || "").split("/").pop();
  return short.startsWith(JOB_PREFIX) ? short.slice(JOB_PREFIX.length).replace(/-us-central1$/, "") : short;
}

async function jobs(fetchImpl) {
  const bearer = await googleToken(fetchImpl, "https://www.googleapis.com/auth/cloud-platform");
  const data = await readJson(await fetchImpl(SCHEDULER + "?pageSize=200", { headers: { Authorization: "Bearer " + bearer }, signal: AbortSignal.timeout(15000) }), "Scheduler");
  // A job that never ran (a monthly report before its first 1st) carries status code -1 and no attempt time.
  return (data.jobs || []).map((job) => {
    const code = Number(job.status && job.status.code) || 0;
    const ran = !!job.lastAttemptTime;
    return {
      name: jobName(job.name),
      schedule: job.schedule || "",
      timeZone: job.timeZone || "",
      state: job.state || "",
      lastAttempt: job.lastAttemptTime || "",
      nextRun: job.scheduleTime || "",
      ok: !ran || code <= 0,
      error: ran && code > 0 ? String((job.status && job.status.message) || "code " + code).slice(0, 160) : "",
      note: ran ? "" : "not run yet"
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function runJob(fetchImpl, name) {
  const short = String(name || "");
  if (!/^[A-Za-z][A-Za-z0-9]{2,60}$/.test(short)) throw new Error("Unknown job.");
  const bearer = await googleToken(fetchImpl, "https://www.googleapis.com/auth/cloud-platform");
  const res = await fetchImpl(SCHEDULER + "/" + JOB_PREFIX + short + "-us-central1:run", { method: "POST", headers: { Authorization: "Bearer " + bearer }, signal: AbortSignal.timeout(15000) });
  await readJson(res, "Scheduler");
  return { ran: short, at: new Date().toISOString() };
}

// --- github ---------------------------------------------------------------------------------------------------

async function github(fetchImpl, token, { now }) {
  if (!token) return { ok: false, error: "GITHUB_BUGS_TOKEN is not set." };
  const get = async (path) => readJson(await fetchImpl("https://api.github.com/" + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15000)
  }), "GitHub");
  const week = isoDay(now - 7 * DAY);
  const [runs, bugs, merged, recent] = await Promise.all([
    get("repos/" + REPO + "/actions/runs?branch=main&per_page=30"),
    get("search/issues?q=" + encodeURIComponent("repo:" + REPO + " is:issue is:open label:bug") + "&per_page=100"),
    get("search/issues?q=" + encodeURIComponent("repo:" + REPO + " is:pr is:merged merged:>=" + week) + "&per_page=50"),
    get("repos/" + REPO + "/issues?state=all&sort=created&direction=desc&per_page=12")
  ]);
  const byWorkflow = {};
  (runs.workflow_runs || []).forEach((run) => {
    if (byWorkflow[run.name] || run.status !== "completed" || run.conclusion === "cancelled") return;
    byWorkflow[run.name] = { name: run.name, conclusion: run.conclusion, at: run.updated_at, url: run.html_url, sha: String(run.head_sha || "").slice(0, 7) };
  });
  const areas = {};
  (bugs.items || []).forEach((issue) => {
    const area = (issue.labels || []).map((label) => label.name).find((name) => /^area:/.test(name));
    count(areas, area ? area.slice(5) : "none");
  });
  return {
    ok: true,
    ci: Object.values(byWorkflow),
    openBugs: bugs.total_count || 0,
    bugAreas: top(areas),
    merged: { total: merged.total_count || 0, items: (merged.items || []).slice(0, 10).map((pr) => ({ number: pr.number, title: pr.title, url: pr.html_url, at: pr.closed_at })) },
    recent: (recent || []).map((issue) => ({ number: issue.number, title: issue.title, url: issue.html_url, state: issue.state, pr: !!issue.pull_request, at: issue.created_at }))
  };
}

// --- ga4 ------------------------------------------------------------------------------------------------------

async function ga4(fetchImpl, { days }) {
  const bearer = await googleToken(fetchImpl, "https://www.googleapis.com/auth/analytics.readonly");
  const span = rangeDays(days);
  const run = async (body) => {
    const data = await readJson(await fetchImpl("https://analyticsdata.googleapis.com/v1beta/properties/" + PROPERTY + ":runReport", {
      method: "POST",
      headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ dateRanges: [{ startDate: span + "daysAgo", endDate: "today" }, { startDate: (span * 2) + "daysAgo", endDate: (span + 1) + "daysAgo" }] }, body)),
      signal: AbortSignal.timeout(30000)
    }), "GA4");
    return (data.rows || []).map((row) => ({ dims: (row.dimensionValues || []).map((v) => v.value), mets: (row.metricValues || []).map((v) => Number(v.value) || 0) }));
  };
  const metrics = [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "engagementRate" }, { name: "averageSessionDuration" }];
  const [groups, countries, sources, daily] = await Promise.all([
    run({ dimensions: [{ name: "contentGroup" }], metrics }),
    run({ dimensions: [{ name: "country" }], metrics: [{ name: "sessions" }], limit: 12, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    run({ dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }], metrics: [{ name: "sessions" }], limit: 12, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    run({ dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }], dateRanges: [{ startDate: span + "daysAgo", endDate: "today" }], orderBys: [{ dimension: { dimensionName: "date" } }] })
  ]);
  // With two date ranges GA4 adds a dateRange dimension last: date_range_0 is now, date_range_1 the prior span.
  const split = (rows) => {
    const out = {};
    rows.forEach((row) => {
      const which = row.dims[row.dims.length - 1] === "date_range_1" ? "prior" : "now";
      const key = row.dims.slice(0, -1).join(" / ") || "(not set)";
      out[key] = out[key] || { now: null, prior: null };
      out[key][which] = row.mets;
    });
    return out;
  };
  const named = split(groups);
  return {
    ok: true,
    groups: Object.keys(named).map((key) => {
      const [sessions, users, views, engagement, duration] = named[key].now || [0, 0, 0, 0, 0];
      const prior = named[key].prior || [0, 0, 0, 0, 0];
      return { group: key, sessions, users, views, engagement: Math.round(engagement * 1000) / 10, duration: Math.round(duration), priorSessions: prior[0], priorUsers: prior[1] };
    }).sort((a, b) => b.sessions - a.sessions),
    countries: Object.entries(split(countries)).map(([label, v]) => ({ label, value: (v.now || [0])[0], prior: (v.prior || [0])[0] })).sort((a, b) => b.value - a.value).slice(0, 12),
    sources: Object.entries(split(sources)).map(([label, v]) => ({ label, value: (v.now || [0])[0], prior: (v.prior || [0])[0] })).sort((a, b) => b.value - a.value).slice(0, 12),
    daily: daily.map((row) => ({ date: row.dims[0].replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"), sessions: row.mets[0], users: row.mets[1] }))
  };
}

// --- cloudflare -----------------------------------------------------------------------------------------------

async function cloudflare(fetchImpl, env, { days, now }) {
  const token = env.CLOUDFLARE_ANALYTICS_TOKEN || env.CLOUDFLARE_API_TOKEN;
  if (!token || !env.CLOUDFLARE_ZONE_ID) return { ok: false, error: "Cloudflare token or zone is not set." };
  const from = isoDay(now - Math.min(rangeDays(days), 30) * DAY);
  const query = `{viewer{zones(filter:{zoneTag:"${env.CLOUDFLARE_ZONE_ID.replace(/[^a-f0-9]/gi, "")}"}){httpRequests1dGroups(limit:60,orderBy:[date_ASC],filter:{date_geq:"${from}"}){dimensions{date} sum{requests bytes cachedRequests threats pageViews} uniq{uniques}}}}}`;
  const data = await readJson(await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000)
  }), "Cloudflare");
  if (data.errors && data.errors.length) {
    const message = String(data.errors[0].message || "");
    return { ok: false, error: /permission/i.test(message) ? "The Cloudflare token needs Zone > Analytics > Read." : message.slice(0, 200) };
  }
  const zone = (((data.data || {}).viewer || {}).zones || [])[0] || {};
  const daily = (zone.httpRequests1dGroups || []).map((row) => ({ date: row.dimensions.date, requests: row.sum.requests, bytes: row.sum.bytes, cached: row.sum.cachedRequests, threats: row.sum.threats, pageViews: row.sum.pageViews, uniques: row.uniq.uniques }));
  const sum = (key) => daily.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const requests = sum("requests");
  return { ok: true, from, requests, bytes: sum("bytes"), cacheRatio: requests ? Math.round((sum("cached") / requests) * 1000) / 10 : 0, threats: sum("threats"), pageViews: sum("pageViews"), uniques: sum("uniques"), daily };
}

// --- speed: PageSpeed + CrUX ----------------------------------------------------------------------------------

async function speed(core, env) {
  const key = env.PAGESPEED_KEY;
  if (!key) return { ok: false, error: "PAGESPEED_KEY is not set." };
  const pages = await Promise.all(PAGES.map(async (page) => {
    try {
      const result = await core.pageSpeed(page.url, key);
      if (!result || !result.ok) return Object.assign({}, page, { ok: false, error: (result && result.error) || "no answer" });
      const field = result.field || {};
      return Object.assign({}, page, { ok: true, score: result.score, lab: result.lab, field: { scope: field.scope || "", overall: field.overall || "", lcp: field.lcp || null, inp: field.inp || null, cls: field.cls || null } });
    } catch (error) {
      return Object.assign({}, page, { ok: false, error: String(error.message || error).slice(0, 160) });
    }
  }));
  let crux = null;
  try {
    crux = await core.cruxHistory(ORIGIN + "/", env.CRUX_KEY || key);
  } catch (error) {
    crux = { ok: false, error: String(error.message || error).slice(0, 160) };
  }
  return { ok: true, pages, crux };
}

// --- uptime + TLS ---------------------------------------------------------------------------------------------

function tlsDaysLeft(host, now) {
  return new Promise((resolve) => {
    const socket = require("tls").connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert && cert.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - now) / DAY) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
  });
}

async function uptime(fetchImpl, { now, tls }) {
  const pages = await Promise.all(PAGES.map(async (page) => {
    const started = Date.now();
    try {
      const res = await fetchImpl(page.url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "qa-lab-jarvis" } });
      const body = await res.text();
      return Object.assign({}, page, { status: res.status, ms: Date.now() - started, bytes: body.length, ok: res.ok });
    } catch (error) {
      return Object.assign({}, page, { status: 0, ms: Date.now() - started, ok: false, error: String(error.message || error).slice(0, 120) });
    }
  }));
  const daysLeft = await (tls || tlsDaysLeft)("carlosandmunoz.com", now);
  return { ok: true, pages, tlsDaysLeft: daysLeft };
}

// --- brief / ask: Gemini --------------------------------------------------------------------------------------

const VOICE = "You are Jarvis, the analyst for Carlos's sites: the CV (carlosandmunoz.com), QA Studio (a test-sprint simulator), "
  + "QA Lab (a regression lab), QA-lab URL Review (paid website reviews), the Social hub, and the systems behind them. "
  + "Use only the numbers in the JSON you get. Plain English, short sentences, no hype, no markdown tables. "
  + "Name the product, the number and the comparison. Say when a number is too small to mean anything.";

async function gemini(fetchImpl, env, prompt, maxTokens) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  const res = await fetchImpl(GEMINI + (env.GEMINI_MODEL || MODEL) + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: VOICE }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens || 1200, thinkingConfig: { thinkingLevel: "low" } }
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await readJson(res, "Gemini");
  const candidate = (data.candidates || [])[0] || {};
  const text = ((candidate.content || {}).parts || []).map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini sent no text (" + (candidate.finishReason || "unknown") + ").");
  return text;
}

function snapshotText(snapshot) {
  const text = JSON.stringify(snapshot || {});
  return text.length > 60000 ? text.slice(0, 60000) : text;
}

async function brief(fetchImpl, env, snapshot) {
  const text = await gemini(fetchImpl, env, "Write the briefing for these numbers: three to six short paragraphs or bullet lines, most important first: "
    + "what moved, what needs action today, what is healthy. End with one line that starts with 'Next:' and names the single best next action.\n\n" + snapshotText(snapshot));
  return { text };
}

async function ask(fetchImpl, env, question, snapshot) {
  const q = String(question || "").trim().slice(0, 500);
  if (!q) throw new Error("Ask a question.");
  const text = await gemini(fetchImpl, env, "Question: " + q + "\n\nAnswer in at most six sentences from these numbers. If they cannot answer it, say which number is missing.\n\n" + snapshotText(snapshot), 800);
  return { text };
}

function briefingMail(snapshot, text) {
  const products = (snapshot && snapshot.products) || {};
  const rows = Object.keys(products).slice(0, 12).map((key) => {
    const p = products[key] || {};
    const kpis = (p.kpis || []).slice(0, 4).map((k) => k.label + " " + k.value + (k.delta ? " (" + k.delta + ")" : "")).join(" · ");
    return { label: p.name || key, value: kpis || "no data" };
  });
  return { subject: "Jarvis briefing: " + String((snapshot && snapshot.range) || "") , rows, body: String(text || "").slice(0, 8000) };
}


// --- settings: goals, thresholds, mail switches (jarvis_settings/main) -----------------------------------------

const MAIL_DEFAULTS = { daily: true, gemini: true, watch: true };

function normalizeSettings(data) {
  const d = data || {};
  const mail = Object.assign({}, MAIL_DEFAULTS);
  Object.keys(MAIL_DEFAULTS).forEach((key) => { if (d.mail && typeof d.mail[key] === "boolean") mail[key] = d.mail[key]; });
  return { goals: core.cleanGoals(d.goals), thresholds: core.thresholds(d.thresholds), mail, updatedAt: String(d.updatedAt || "") };
}

async function readSettings(db) {
  const snap = await db.collection("jarvis_settings").doc("main").get().catch(() => null);
  return normalizeSettings(snap && snap.exists ? snap.data() : {});
}

async function saveSettings(db, input, by) {
  const clean = normalizeSettings(input);
  const doc = { goals: clean.goals, thresholds: clean.thresholds, mail: clean.mail, updatedAt: new Date().toISOString(), by: String(by || "") };
  await db.collection("jarvis_settings").doc("main").set(doc);
  return normalizeSettings(doc);
}

// --- goals: count and sum aggregations, a few reads each --------------------------------------------------------

const SITE_KINDS = { visits: "visit", exports: "export", runs: "run" };

async function goalValue(db, goal, start, end) {
  const total = async (q) => (await q.count().get()).data().count;
  const between = (q, iso) => q.where("createdAt", ">=", iso ? start.toISOString() : start).where("createdAt", "<", iso ? end.toISOString() : end);
  if (SITE_KINDS[goal.metric] && ["cv", "studio", "lab"].includes(goal.product)) {
    return total(between(db.collection("site_events").where("site", "==", goal.product).where("kind", "==", SITE_KINDS[goal.metric])));
  }
  if (goal.product === "review") {
    if (goal.metric === "opens") return total(between(db.collection("url_review_opens")));
    if (goal.metric === "reviews") return total(between(db.collection("url_reviews"), true));
    const paid = between(db.collection("url_reviews").where("paid", "==", true), true);
    if (goal.metric === "paid") return total(paid);
    const snap = await paid.aggregate({ usd: AggregateField.sum("priceUsd") }).get();
    return Math.round((Number(snap.data().usd) || 0) * 100) / 100;
  }
  if (goal.product === "inbox") return total(between(db.collection(goal.metric === "ratings" ? "ratings" : "messages")));
  throw new Error("No such goal.");
}

async function goals(db, settings, { now }) {
  const at = new Date(now);
  const list = (settings || {}).goals || [];
  return Promise.all(list.map(async (goal) => {
    const w = core.periodWindow(goal.period, at);
    try {
      return core.goalProgress(goal, await goalValue(db, goal, w.start, w.end), at);
    } catch (error) {
      return Object.assign(core.goalProgress(goal, 0, at), { error: String(error.message || error).slice(0, 160) });
    }
  }));
}

// --- daily briefing: the last 24 hours against the 24 before, with the same rules as the page --------------------

async function dailyProducts(db, { now }) {
  const end = new Date(now);
  const start = new Date(now - DAY);
  const priorStart = new Date(now - 2 * DAY);
  const window = { start, end, days: 1, prior: { start: priorStart, end: start } };
  const rows = async (q) => (await q.limit(20000).get()).docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const since = (name, iso) => db.collection(name).where("createdAt", ">=", iso ? priorStart.toISOString() : priorStart);
  const [events, opens, reviews, messages, ratings, pending, hubSnap] = await Promise.all([
    rows(since("site_events")), rows(since("url_review_opens")), rows(since("url_reviews", true)),
    rows(since("messages")), rows(since("ratings")),
    rows(db.collection("ratings").where("status", "==", "pending")),
    db.collection("socialHubStats").doc("latest").get().catch(() => null)
  ]);
  const inside = (row) => { const when = core.toDate(row.createdAt); return !!when && when >= start; };
  const now1 = events.filter(inside);
  const was = events.filter((row) => !inside(row));
  const seen = new Set(ratings.map((row) => row.id));
  const allRatings = ratings.concat(pending.filter((row) => !seen.has(row.id)));
  const products = {
    inbox: core.summarizeInbox(messages, allRatings, window, window.prior, (email) => !core.isTestEmail(email)),
    cv: core.summarizeSite("cv", now1, was, window),
    studio: core.summarizeSite("studio", now1, was, window),
    lab: core.summarizeSite("lab", now1, was, window),
    review: core.summarizeReview({ opens: opens.filter(inside), reviews: reviews.filter(inside), events: now1, prior: { opens: opens.filter((row) => !inside(row)).length, reviews: reviews.filter((row) => !inside(row)).length } }, window),
    hub: core.summarizeHub(hubSnap && hubSnap.exists ? hubSnap.data() : null, now1, window)
  };
  return { window, products };
}

function compact(products) {
  return Object.keys(products).reduce((out, key) => {
    const p = products[key];
    out[key] = { name: (core.PRODUCTS.find((row) => row.key === key) || {}).name || key, kpis: (p.kpis || []).map((k) => ({ label: k.label, value: k.value, prior: k.prior, delta: k.delta })) };
    return out;
  }, {});
}

const LEVEL_MARK = { alert: "ALERT", warn: "WARN", good: "GOOD", info: "INFO" };

function dailyMail({ products, items, goalRows, aiText, dateLabel }) {
  const counts = items.reduce((m, row) => { m[row.level] = (m[row.level] || 0) + 1; return m; }, {});
  const rows = Object.keys(products).map((key) => {
    const p = products[key];
    const value = (p.kpis || []).slice(0, 4).map((k) => k.label + " " + k.value + (k.delta ? " (" + k.delta + ")" : "")).join(" · ");
    return { label: (core.PRODUCTS.find((row) => row.key === key) || {}).name || key, value: value || "no data" };
  });
  goalRows.forEach((g) => rows.push({ label: "Goal", value: g.label + ": " + g.value + " of " + g.target + " (" + g.pct + "%, " + g.status.replace("-", " ") + ")" }));
  const lines = items.map((row) => LEVEL_MARK[row.level] + "  " + row.text);
  const body = (aiText ? aiText.trim() + "\n\n" : "") + (lines.length ? lines.join("\n") : "Nothing needs you today.");
  const head = (counts.alert ? counts.alert + " alert" + (counts.alert > 1 ? "s" : "") : "") + (counts.alert && counts.warn ? ", " : "") + (counts.warn ? counts.warn + " warning" + (counts.warn > 1 ? "s" : "") : "");
  return { subject: "Jarvis daily briefing, " + dateLabel + (head ? ": " + head : ": all clear"), intro: "Your last 24 hours across the CV, QA Studio, QA Lab, URL Review, the Social hub and the systems behind them.", rows, body: body.slice(0, 12000) };
}

// --- watch: alerts only, once a day per issue -------------------------------------------------------------------

function watchItems(external, thresholds) {
  return core.briefing({ products: {}, external, thresholds }).filter((row) => row.level === "alert");
}

async function unsentToday(db, items, { now }) {
  const day = core.zoneParts(new Date(now)).day;
  const ref = db.collection("jarvis_watch").doc(day);
  const snap = await ref.get().catch(() => null);
  const sent = (snap && snap.exists && snap.data().sent) || {};
  const fresh = items.filter((row) => !sent[row.key]);
  return { day, ref, sent, fresh };
}

module.exports = { PAGES, TTL, ADMIN_URL, rangeDays, causeLabel, health, jobs, jobName, runJob, github, ga4, cloudflare, speed, uptime, tlsDaysLeft, brief, ask, briefingMail, top,
  normalizeSettings, readSettings, saveSettings, goalValue, goals, dailyProducts, compact, dailyMail, watchItems, unsentToday };
