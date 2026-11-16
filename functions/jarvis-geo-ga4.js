/* Jarvis Map GA4 visitors (#3282): every country GA4 sees, by ISO code, for the range and the span before, and per day.

   countries   one runReport (countryId, country) with sessions, engaged sessions, total users and key events over the
               ga4 op's two date ranges, up to 250 countries. The ga4 op keeps its top-12 `countries` for the Traffic tab
               and adds the full list as `countryRows`.
   days        one runReport (date, countryId) over a span of days for the Map's daily history (jarvis-geo-time.js g).
   geo rows    visitors, engaged, users and keyEvents with their *Prior, and engagementRate (engaged / visitors, %).

   A property whose reports reject keyEvents is asked again without it, and its key events stay null. */

const METRICS = ["sessions", "engagedSessions", "totalUsers", "keyEvents"];
const FIELDS = ["visitors", "engaged", "users", "keyEvents"];
const MAX_COUNTRIES = 250;
const TOP = 12;

const valid = (cc) => /^[A-Z]{2}$/.test(cc);
const metrics = (withKeys) => METRICS.slice(0, withKeys ? 4 : 3).map((name) => ({ name }));
const nums = (mets, withKeys) => FIELDS.map((_, i) => (i < 3 || withKeys ? Number(mets[i]) || 0 : null));

/** The runReport body for every country, sessions first; the ga4 op's run adds the range and the span before. */
function countryReport(withKeys) {
  return {
    dimensions: [{ name: "countryId" }, { name: "country" }], metrics: metrics(withKeys),
    limit: MAX_COUNTRIES * 2, orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
  };
}

/**
 * Report rows ({dims: [countryId, country, dateRange], mets}) as one row per country: cc ("" for GA4's "(not set)"),
 * label, the four FIELDS and their *Prior, most sessions first.
 */
function countryRows(rows, withKeys) {
  const by = {};
  (rows || []).forEach((row) => {
    const [id, label, range] = row.dims || [];
    const cc = valid(String(id || "").toUpperCase()) ? String(id).toUpperCase() : "";
    const key = cc || "(not set)";
    const out = by[key] || (by[key] = Object.assign({ cc, label: cc ? label || cc : "(not set)" }, ...FIELDS.map((f) => ({ [f]: 0, [f + "Prior"]: 0 }))));
    const prior = range === "date_range_1";
    nums(row.mets || [], withKeys).forEach((n, i) => {
      const k = FIELDS[i] + (prior ? "Prior" : "");
      out[k] = n === null ? null : out[k] + n;
    });
    if (!withKeys) { out.keyEvents = null; out.keyEventsPrior = null; }
  });
  return Object.values(by).sort((a, b) => b.visitors - a.visitors || b.visitorsPrior - a.visitorsPrior || a.label.localeCompare(b.label)).slice(0, MAX_COUNTRIES);
}

/** The Traffic tab's list from the full one: the top 12 by sessions as {label, value, prior}. */
const top = (list) => (list || []).filter((r) => r.visitors > 0).slice(0, TOP).map((r) => ({ label: r.label, value: r.visitors, prior: r.visitorsPrior }));

// run(body) → [{dims, mets}]; a report that rejects keyEvents is run again without it.
async function withFallback(run, body) {
  try {
    return { rows: await run(body(true)), withKeys: true };
  } catch (error) {
    if (!/keyEvents|metric/i.test(String(error && error.message))) throw error;
    return { rows: await run(body(false)), withKeys: false };
  }
}

/** Every country for the ga4 op: { countryRows, keyEvents (false when the property rejects it) }. */
async function fetchCountries(run) {
  const { rows, withKeys } = await withFallback(run, countryReport);
  return { countryRows: countryRows(rows, withKeys), keyEvents: withKeys };
}

/** The runReport body for sessions per country per day, from and to as YYYY-MM-DD. */
function dailyReport(from, to, withKeys) {
  return {
    dateRanges: [{ startDate: from, endDate: to }], dimensions: [{ name: "date" }, { name: "countryId" }], metrics: metrics(withKeys),
    limit: 100000, orderBys: [{ dimension: { dimensionName: "date" } }]
  };
}

/** Report rows ({dims: [YYYYMMDD, countryId], mets}) as { day: { cc: [visitors, engaged, users, keyEvents] } }. */
function dailyOf(rows, withKeys) {
  const out = {};
  (rows || []).forEach((row) => {
    const [date, id] = row.dims || [];
    const day = String(date || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const cc = String(id || "").toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !valid(cc)) return;
    const n = nums(row.mets || [], withKeys);
    if (!n.some((v) => v)) return;
    const byCc = out[day] || (out[day] = {});
    const was = byCc[cc];
    byCc[cc] = was ? was.map((v, i) => (v === null || n[i] === null ? null : v + n[i])) : n;
  });
  return out;
}

/** The daily history's GA4 days from `from` to `to`: { day: { cc: [4] } }. */
async function fetchDays(run, from, to) {
  const { rows, withKeys } = await withFallback(run, (keys) => dailyReport(from, to, keys));
  return dailyOf(rows, withKeys);
}

/**
 * The ga4 op's numbers per country code for the geo rows: { cc: { visitors, visitorsPrior, engaged, ... } }.
 * Reads countryRows; an older cached op with only the top-12 `countries` maps their names through codeOf.
 */
function byCountry(ga4, codeOf) {
  const out = {};
  if (!ga4) return out;
  if (Array.isArray(ga4.countryRows)) {
    ga4.countryRows.forEach((r) => {
      if (!r || !valid(r.cc)) return;
      out[r.cc] = Object.assign({}, ...FIELDS.map((f) => ({ [f]: r[f] === null || r[f] === undefined ? null : Number(r[f]) || 0, [f + "Prior"]: r[f + "Prior"] === null || r[f + "Prior"] === undefined ? null : Number(r[f + "Prior"]) || 0 })));
    });
    return out;
  }
  (ga4.countries || []).forEach((c) => {
    const cc = codeOf(c.label);
    if (!cc) return;
    const was = out[cc] || { visitors: 0, visitorsPrior: 0 };
    out[cc] = { visitors: was.visitors + (Number(c.value) || 0), visitorsPrior: was.visitorsPrior + (Number(c.prior) || 0) };
  });
  return out;
}

/** Fills a finished geo row's GA4 fields (0 when GA4 has none for it, keyEvents null when the property has none) and its engagement rate. */
function finish(row, keyEvents) {
  FIELDS.forEach((f) => {
    [f, f + "Prior"].forEach((k) => { if (row[k] === undefined) row[k] = f === "keyEvents" && keyEvents === false ? null : 0; });
  });
  row.engagementRate = row.visitors ? Math.round((row.engaged / row.visitors) * 1000) / 10 : null;
  return row;
}

/** The Map's notes about GA4: none when it counts key events; one when it counts sessions but no key event. */
function needs(ga4) {
  if (!ga4 || !Array.isArray(ga4.countryRows)) return [];
  const sum = (k) => ga4.countryRows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  if (ga4.keyEvents === false) return ["GA4 rejects key events for this property, so Key events per country are empty."];
  if (sum("visitors") && !sum("keyEvents") && !sum("keyEventsPrior")) return ["GA4 counts no key events, so Key events per country are empty: mark one in GA4 Admin, Events."];
  return [];
}

module.exports = { METRICS, FIELDS, MAX_COUNTRIES, countryReport, countryRows, top, fetchCountries, dailyReport, dailyOf, fetchDays, byCountry, finish, needs };
