/* Jarvis Map: short-link clicks by visitor country (#3281), added to the geo source (jarvis-geo.js).

   clicks     the qalabreview.com Worker writes one Workers Analytics Engine data point per click (qalabreview/src/clicks.js,
              dataset qalabreview_clicks): blobs [kind, country, campaign, prospect host, language, agent]. Jarvis reads
              it over the account's SQL API in hours, without bots, for the range and the span before it. AE keeps
              three months, so a prior span reaching further back is partial.
   visitors   reviews, paid unlocks and USD from short links by the visitor's own country: the review page's opens and
              the review rows (url_reviews keeps the requester's country), tagged the way jarvis-outreach linkRows tags
              them. The prospect-country numbers (visits, reviews, paid, usd) stay as they are, next to these.
   history    each Bogotá day's clicks per country as `k` in jarvis_geo_history (jarvis-geo-time.js), from the first day
              the dataset has clicks.

   The token is CLOUDFLARE_ANALYTICS_TOKEN, the one the cloudflare source reads zone analytics with; it also needs
   Account > Account Analytics > Read on CLOUDFLARE_ACCOUNT_ID. */

const DATASET = "qalabreview_clicks";
const SQL_API = "https://api.cloudflare.com/client/v4/accounts/";
const HOUR = 3600000;
const DAY = 24 * HOUR;
const KEEP_DAYS = 90;
const HISTORY_DAYS = 30;
const KINDS = ["outreach", "social", "channel", "call", "landing", "unknown"];
const NEED = "Short-link clicks by visitor country: add Account > Account Analytics > Read to the Cloudflare token in CLOUDFLARE_ANALYTICS_TOKEN (dash.cloudflare.com > Manage account > Account API tokens).";

// XX is Cloudflare's unknown country.
const valid = (cc) => /^[A-Z]{2}$/.test(cc) && cc !== "XX";
const round = (n) => Math.round(n * 100) / 100;
const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "").replace(/^www\./, "");
const bogotaDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

const tokenOf = (env) => (env && env.CLOUDFLARE_ANALYTICS_TOKEN) || "";

/** Clicks per hour, country, kind and prospect host over the last `days` days, people only. */
function sqlFor(days) {
  const n = Math.max(1, Math.min(KEEP_DAYS + 1, Math.ceil(Number(days) || 1)));
  return `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob2 AS cc, blob1 AS kind, blob4 AS host, SUM(_sample_interval) AS n
FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '${n}' DAY AND blob6 = '' GROUP BY hour, cc, kind, host ORDER BY hour FORMAT JSON`;
}

/** The SQL API's JSON answer as rows { at, cc, kind, host, n }; AE sends UInt64 as strings and hours in UTC. */
function parse(body) {
  const list = (body && Array.isArray(body.data) ? body.data : []);
  return list.map((x) => {
    const at = Date.parse(String(x.hour || "").replace(" ", "T") + (/[zZ+]/.test(String(x.hour || "").slice(10)) ? "" : "Z"));
    const cc = String(x.cc || "").toUpperCase();
    return { at, cc: valid(cc) ? cc : "", kind: KINDS.includes(x.kind) ? x.kind : "unknown", host: bare(x.host), n: Number(x.n) || 0 };
  }).filter((r) => Number.isFinite(r.at) && r.n > 0);
}

/**
 * The rows for a range ending `now`: per country now and before, kinds and prospect hosts now, and per Bogotá day.
 * priorComplete is false when the span before reaches past what AE keeps.
 */
function tally(rows, now, days) {
  const start = now - days * DAY;
  const priorStart = start - days * DAY;
  const out = { now: {}, prior: {}, kinds: {}, hosts: {}, days: {}, total: 0, priorTotal: 0, unknown: 0, priorComplete: 2 * days <= KEEP_DAYS };
  const add = (map, k, n) => { map[k] = (map[k] || 0) + n; };
  (rows || []).forEach((r) => {
    if (r.at >= start) {
      out.total += r.n;
      if (!r.cc) out.unknown += r.n;
      else {
        add(out.now, r.cc, r.n);
        add(out.kinds[r.cc] || (out.kinds[r.cc] = {}), r.kind, r.n);
      }
      if (r.host) add(out.hosts, r.host, r.n);
    } else if (r.at >= priorStart) {
      out.priorTotal += r.n;
      if (r.cc) add(out.prior, r.cc, r.n);
    }
    if (r.cc) add(out.days[bogotaDay(r.at)] || (out.days[bogotaDay(r.at)] = {}), r.cc, r.n);
  });
  return out;
}

/** Runs one query; { ok, rows } or { ok: false, need | error }. */
async function query(fetchImpl, env, sql) {
  const token = tokenOf(env);
  const account = String((env && env.CLOUDFLARE_ACCOUNT_ID) || "").replace(/[^a-f0-9]/gi, "");
  if (!token || !account) return { ok: false, need: NEED };
  const res = await fetchImpl(SQL_API + account + "/analytics_engine/sql", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "text/plain" }, body: sql, signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || /authentication error|not authorized/i.test(text.slice(0, 300))) return { ok: false, need: NEED };
  // A dataset nobody has written to yet does not exist: no clicks so far.
  if (/unknown table|does not exist|no such table/i.test(text.slice(0, 500))) return { ok: true, rows: [], empty: true };
  if (!res.ok) return { ok: false, error: "Analytics Engine answered " + res.status + ": " + text.slice(0, 160) };
  let body = null;
  try { body = JSON.parse(text); } catch (error) { return { ok: false, error: "Analytics Engine sent no JSON." }; }
  return { ok: true, rows: parse(body) };
}

/** The geo source's clicks: tally() for ctx.days and the span before, or { ok: false, need | error }. ctx: fetch, env, now, days. */
async function read(ctx) {
  const days = Math.max(1, Number(ctx.days) || 1);
  const out = await query(ctx.fetch, ctx.env, sqlFor(2 * days)).catch((error) => ({ ok: false, error: String(error.message || error).slice(0, 160) }));
  if (!out.ok) return out;
  return Object.assign({ ok: true, days, empty: !!out.empty }, tally(out.rows, ctx.now || Date.now(), days));
}

/**
 * Link reviews, paid unlocks and USD by the visitor's own country, and the review page's opens from short links.
 * The same rows and rules as jarvis-outreach linkRows: tags from the query, tests and other ranges left out, a paid
 * unlock traced to the review it unlocked. Returns [{ cc, visits, reviews, paid, usd }].
 */
function visitorRows(opens, reviews, ctx, { linkTags, revenue, toMs }) {
  const start = ctx.now - ctx.days * DAY;
  const by = {};
  const row = (cc) => { cc = String(cc || "").toUpperCase(); return valid(cc) ? by[cc] || (by[cc] = { cc, visits: 0, reviews: 0, paid: 0, usd: 0 }) : null; };
  (opens || []).forEach((o) => {
    if (toMs(o.createdAt) < start || !linkTags(o.query)) return;
    const r = row(o.country);
    if (r) r.visits += 1;
  });
  const inRange = (reviews || []).filter((r) => toMs(r.createdAt) >= start && !r.test);
  const byId = {};
  const byEmail = {};
  inRange.filter((r) => !revenue.has(r.status)).forEach((r) => {
    const tags = linkTags(r.query);
    if (!tags) return;
    const email = String(r.email || "").toLowerCase();
    if (r.id) byId[r.id] = { tags, cc: r.country };
    if (email && !byEmail[email]) byEmail[email] = { tags, cc: r.country };
    const x = row(r.country);
    if (x) x.reviews += 1;
  });
  inRange.filter((r) => r.paid === true && r.refunded !== true && revenue.has(r.status)).forEach((r) => {
    const src = byId[r.reportId] || byEmail[String(r.email || "").toLowerCase()];
    if (!src && !linkTags(r.query)) return;
    const x = row(r.country || (src && src.cc));
    if (!x) return;
    x.paid += 1;
    x.usd = round(x.usd + (Number(r.priceUsd) || 0) - (Number(r.refundedUsd) || 0));
  });
  return Object.values(by).sort((a, b) => b.usd - a.usd || b.reviews - a.reviews || b.visits - a.visits || a.cc.localeCompare(b.cc));
}

const FIELDS = ["clicks", "clicksPrior", "prospectClicks", "visitorVisits", "visitorReviews", "visitorPaid", "visitorUsd"];

/**
 * Inside geoRows: the clicks and visitor-country numbers on each country's row (rows for countries that only have
 * clicks are made), and the prospect hosts' clicks on their own country. `row(cc)` is geoRows' row maker, `countryOf`
 * its host → country.
 */
function addRows(input, row, rows, countryOf) {
  const c = input && input.clicks && input.clicks.ok ? input.clicks : null;
  const visitors = (input && input.links && input.links.byVisitor) || [];
  if (c) {
    Object.keys(c.now).forEach((cc) => { const r = row(cc); if (r) r.clicks = (r.clicks || 0) + c.now[cc]; });
    Object.keys(c.prior).forEach((cc) => { const r = row(cc); if (r) r.clicksPrior = (r.clicksPrior || 0) + c.prior[cc]; });
    Object.keys(c.kinds).forEach((cc) => { const r = row(cc); if (r) r.clickKinds = c.kinds[cc]; });
    Object.keys(c.hosts).forEach((host) => { const r = row(countryOf(host)); if (r) r.prospectClicks = (r.prospectClicks || 0) + c.hosts[host]; });
  }
  visitors.forEach((v) => {
    const r = row(v.cc);
    if (!r) return;
    r.visitorVisits = (r.visitorVisits || 0) + (Number(v.visits) || 0);
    r.visitorReviews = (r.visitorReviews || 0) + (Number(v.reviews) || 0);
    r.visitorPaid = (r.visitorPaid || 0) + (Number(v.paid) || 0);
    r.visitorUsd = round((r.visitorUsd || 0) + (Number(v.usd) || 0));
  });
  Object.values(rows).forEach((r) => FIELDS.forEach((f) => { if (r[f] === undefined) r[f] = 0; }));
}

/** The source-level summary the Map shows under the sheet: totals now and before, unknown countries, and where AE stops. */
function totals(clicks) {
  if (!clicks || !clicks.ok) return null;
  return { clicks: clicks.total, clicksPrior: clicks.priorComplete ? clicks.priorTotal : null, clicksUnknown: clicks.unknown };
}

/**
 * The daily run's part (jarvis-geo-time.js record): each Bogotá day's clicks per country as `k`, for the last
 * HISTORY_DAYS to `to`, from the first day the dataset has a click. ctx: db, now, clicks (sql → query result).
 */
async function recordDays(ctx, col, to) {
  const out = await ctx.clicks(sqlFor(HISTORY_DAYS + 1));
  if (!out.ok) return "clicks: " + (out.need ? "no Account Analytics token" : out.error);
  const t = tally(out.rows, ctx.now, HISTORY_DAYS + 1);
  const days = Object.keys(t.days).filter((d) => d <= to).sort();
  if (!days.length) return "clicks: none yet";
  const list = [];
  for (let d = days[0]; d <= to; d = new Date(Date.parse(d + "T00:00:00Z") + DAY).toISOString().slice(0, 10)) list.push(d);
  const batch = ctx.db.batch();
  list.forEach((day) => batch.set(col.doc(day), { day, k: t.days[day] || {} }, { mergeFields: ["day", "k"] }));
  await batch.commit();
  return list.length + " click days";
}

/** For Ask: the countries with the most clicks, their visitor-country reviews and money, and the change. */
function ask(g) {
  if (!g || g.ok === false || !Array.isArray(g.countries)) return null;
  const rows = g.countries.filter((r) => r.clicks || r.visitorReviews || r.visitorPaid)
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0) || (b.visitorUsd || 0) - (a.visitorUsd || 0) || a.cc.localeCompare(b.cc)).slice(0, 12);
  const t = g.totals || {};
  return {
    clicks: t.clicks === undefined ? null : t.clicks, clicksBefore: t.clicksPrior === undefined ? null : t.clicksPrior, unknownCountry: t.clicksUnknown || 0,
    byVisitorCountry: rows.map((r) => `${r.cc}: ${r.clicks || 0} clicks (before ${r.clicksPrior || 0}), ${r.visitorReviews || 0} reviews, ${r.visitorPaid || 0} paid, $${r.visitorUsd || 0}; prospects here: ${r.prospectClicks || 0} clicks, ${r.reviews || 0} reviews, $${r.usd || 0}`)
  };
}

module.exports = { DATASET, KINDS, FIELDS, NEED, sqlFor, parse, tally, query, read, visitorRows, addRows, totals, recordDays, ask, tokenOf };
