/* Jarvis > URL Review > Local (#2118): how the Google Maps Local check (#2067, case SEO-05) ran across the URL reviews
   in range. It reads the small `local` summary each review keeps (url_reviews.local, from 2 Nov 2026: finding keys and
   verdicts, never Business Profile data) and the Places calls per UTC day (url_review_places).
   The web panel and the Android app read the same answer from the "local" source. */
const core = require("./jarvis-core");

const DAY = 24 * 60 * 60 * 1000;
const REVIEWS = 5000;
const SHOWN = 100;
const KEYS = ["local-website", "local-status", "local-nap", "local-hours", "local-utm", "local-profile"];
const REVIEW_FIELDS = ["createdAt", "test", "source", "sweep", "requestedUrl", "report.host", "local"];

const ms = (value) => { const d = core.toDate(value); return d ? d.getTime() : 0; };
const iso = (value) => { const t = ms(value); return t ? new Date(t).toISOString() : ""; };
const hostOf = (r) => {
  const host = (r.report && r.report.host) || (r.sweep && r.sweep.host) || "";
  if (host) return String(host).slice(0, 120);
  try { return new URL(r.requestedUrl).hostname; } catch (error) { return ""; }
};

function site(r) {
  const issues = (r.local.issues || []).filter((i) => i && KEYS.includes(i.key));
  return {
    id: r.id,
    host: hostOf(r),
    at: iso(r.createdAt),
    source: r.source || "",
    outreach: !!(r.sweep && r.sweep.outreach),
    profile: r.local.profile === true,
    worst: issues.some((i) => i.verdict === "fail") ? "fail" : issues.length ? "risk" : "",
    issues: issues.map((i) => ({ key: i.key, verdict: i.verdict, severity: i.severity || "" }))
  };
}

function summarize({ reviews, usage }, { now, days }) {
  const start = now - days * DAY;
  const real = (reviews || []).filter((r) => r && r.test !== true && ms(r.createdAt) >= start);
  const sites = real.filter((r) => r.local && typeof r.local === "object").map(site).sort((a, b) => ms(b.at) - ms(a.at));
  const issues = KEYS.map((key) => {
    const hit = sites.flatMap((s) => s.issues).filter((i) => i.key === key);
    return { key, count: hit.length, fail: hit.filter((i) => i.verdict === "fail").length };
  }).filter((i) => i.count).sort((a, b) => b.count - a.count || KEYS.indexOf(a.key) - KEYS.indexOf(b.key));
  const startDay = new Date(start).toISOString().slice(0, 10);
  const today = new Date(now).toISOString().slice(0, 10);
  const counted = (usage || []).filter((u) => u && String(u.day || "") >= startDay);
  const sum = (key) => counted.reduce((n, u) => n + (Number(u[key]) || 0), 0);
  const lastError = counted.filter((u) => u.lastErrorAt).sort((a, b) => ms(b.lastErrorAt) - ms(a.lastErrorAt))[0];
  const todayRow = counted.find((u) => u.day === today) || {};
  return {
    ok: true,
    since: "2026-11-02",
    totals: {
      reviews: real.length,
      local: sites.length,
      profiles: sites.filter((s) => s.profile).length,
      noProfile: sites.filter((s) => !s.profile).length,
      withIssues: sites.filter((s) => s.worst).length,
      failing: sites.filter((s) => s.worst === "fail").length,
      outreach: sites.filter((s) => s.outreach).length,
      calls: sum("calls"),
      errors: sum("errors"),
      callsToday: Number(todayRow.calls) || 0
    },
    issues,
    lastError: lastError ? { at: iso(lastError.lastErrorAt), error: String(lastError.lastError || "").slice(0, 120) } : null,
    sites: sites.slice(0, SHOWN),
    more: Math.max(0, sites.length - SHOWN)
  };
}

async function source(ctx) {
  const { db, now } = ctx;
  const days = ctx.days || 7;
  const start = now - days * DAY;
  const rowsOf = (snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const [reviews, usage] = await Promise.all([
    db.collection("url_reviews").where("createdAt", ">=", new Date(start).toISOString()).orderBy("createdAt", "desc").select(...REVIEW_FIELDS).limit(REVIEWS).get().then(rowsOf),
    db.collection("url_review_places").where("day", ">=", new Date(start).toISOString().slice(0, 10)).get().then(rowsOf)
  ]);
  return summarize({ reviews, usage }, { now, days });
}

module.exports = { KEYS, summarize, source };
