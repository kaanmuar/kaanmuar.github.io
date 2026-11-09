/* Jarvis geo source (#2976): the Map tab's numbers per country, rolled up from what the other sources already hold.

   prospects   the sweep list (url_review_sweep/outreach) by country: queued, swept, left and the top segments
   reviewed    Live Reports per country and their average score
   email       Instantly campaigns per country. A campaign's numbers are split across the countries of its leads
               (marketing-sync lead rows); a campaign with no synced leads falls back to the countries of its name's
               region that speak its language, weighted by prospects. A split row is marked est.
   replies     the outreach replies (marketing-sync) per country, and how many were positive
   social      engagement report replies (waiting or approved) about a site in that country
   visitors    GA4 sessions per country, now and in the prior span
   links       short-link visits, reviews, paid unlocks and USD per prospect host
   gaps        why a country needs attention: prospects or reviewed sites but no campaign, visitors but no outreach,
               a target market with no activity, a reply rate under half the average, bounces over 5%, no prospects left
   light       how far we got with a country, 0 to 5 (#2988): Dark, Spark (prospects or reviewed sites), Ember (contacted
               or social replies drafted), Lit (opens, link visits, visitors or approved social replies), Bright (email
               replies), Blazing (positive replies, interested, paid unlocks). Twins: lightOf in js/admin-jarvis-geo.js and Geo.kt.

   Target markets are every country speaking one of our six languages unless jarvis_settings/geo lists others. */

const sweep = require("./url-review-sweep");

const ORIGIN = "https://carlosandmunoz.com";
const LANG_COUNTRIES = {
  en: ["US", "GB", "IE", "CA", "AU", "NZ", "ZA", "IN", "SG", "PH", "NG", "KE", "GH", "JM", "TT", "MT"],
  es: ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR", "GQ"],
  pt: ["BR", "PT", "AO", "MZ", "CV", "GW", "ST", "TL"],
  de: ["DE", "AT", "CH", "LI", "LU"],
  fr: ["FR", "BE", "CH", "LU", "MC", "CA", "SN", "CI", "CM", "ML", "BF", "NE", "TD", "GN", "BJ", "TG", "CD", "CG", "GA", "MG", "HT", "RW", "BI", "DJ", "KM"],
  it: ["IT", "CH", "SM", "VA"]
};
const AMERICAS = ["US", "CA", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "HT", "JM", "TT", "PR", "BS", "BB",
  "CO", "VE", "EC", "PE", "BO", "BR", "PY", "UY", "AR", "CL", "GY", "SR"];
const EUROPE = ["GB", "IE", "FR", "BE", "NL", "LU", "DE", "AT", "CH", "LI", "IT", "SM", "VA", "MT", "ES", "PT", "AD", "MC",
  "DK", "NO", "SE", "FI", "IS", "PL", "CZ", "SK", "HU", "SI", "HR", "RO", "BG", "GR", "CY", "EE", "LV", "LT"];
const REGIONS = { americas: AMERICAS, latam: AMERICAS.filter((c) => c !== "US" && c !== "CA"), europe: EUROPE, eu: EUROPE };
const ALIASES = { us: "US", usa: "US", uk: "GB", "great britain": "GB", england: "GB", turkey: "TR", "czech republic": "CZ", russia: "RU", "south korea": "KR" };
// Retired or reserved codes Intl still names after a current country (DD → Germany, UK → United Kingdom).
const RETIRED = new Set(["AN", "BU", "CS", "DD", "EU", "EZ", "FX", "NT", "QO", "SU", "TP", "UK", "UN", "YU", "ZR", "ZZ"]);
const POSITIVE = /interest|positive|meeting|yes|book/i;
const ACTIVE = /^(active|running subsequences)$/;
const MIN_SENT = 50;

const up = (cc) => String(cc || "").trim().toUpperCase();
const valid = (cc) => /^[A-Z]{2}$/.test(cc);
const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "").replace(/^www\./, "");
const domainOf = (email) => bare(String(email || "").split("@")[1] || "");
const round = (n, d) => Math.round(n * (d || 1)) / (d || 1);

const NAMES = (() => {
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  const name = {};
  const code = Object.assign({}, ALIASES);
  for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) {
    const cc = String.fromCharCode(a, b);
    const n = dn.of(cc);
    if (n && n !== cc && !RETIRED.has(cc)) { name[cc] = n; code[n.toLowerCase()] = cc; }
  }
  return { name, code };
})();
const nameOf = (cc) => NAMES.name[cc] || cc;
const codeOf = (label) => { const s = String(label || "").trim(); return valid(up(s)) && NAMES.name[up(s)] ? up(s) : NAMES.code[s.toLowerCase()] || ""; };
const langsOf = (cc) => Object.keys(LANG_COUNTRIES).filter((l) => LANG_COUNTRIES[l].includes(cc));
const DEFAULT_TARGETS = Array.from(new Set([].concat(...Object.values(LANG_COUNTRIES)))).sort();

/** The countries a campaign name's region covers ("Americas", "Brazil", "UK"), narrowed to its language when that leaves any. */
function regionCountries(region, lang) {
  const r = String(region || "").trim().toLowerCase();
  const all = REGIONS[r] || (codeOf(r) ? [codeOf(r)] : []);
  const spoken = LANG_COUNTRIES[lang] ? all.filter((c) => LANG_COUNTRIES[lang].includes(c)) : [];
  return spoken.length ? spoken : all;
}

// Host → country from the prospect queue and the Live Reports, trying parent domains (mail.uni.edu.co → uni.edu.co).
function hostCountry(maps) {
  return (host) => {
    let h = bare(host);
    while (h && h.includes(".")) {
      for (const m of maps) if (m[h]) return m[h];
      h = h.slice(h.indexOf(".") + 1);
    }
    return "";
  };
}

const LIGHTS = ["Dark", "Spark", "Ember", "Lit", "Bright", "Blazing"];

/** A country's light level, 0 (nothing) to 5 (positive replies or money): the furthest step any channel reached. */
function lightOf(r) {
  const n = (k) => Number(r && r[k]) > 0;
  if (n("positive") || n("interested") || n("paid") || n("usd")) return 5;
  if (n("replies") || n("answered")) return 4;
  if (n("opened") || n("visits") || n("visitors") || n("socialApproved")) return 3;
  if (n("contacted") || n("sent") || n("social")) return 2;
  if (n("prospects") || n("reviewed") || n("leads")) return 1;
  return 0;
}

/** Every country's row and the ranked gaps, from the inputs the source gathers (pure, for the tests). */
function geoRows(input) {
  const i = input || {};
  const targets = new Set((i.targets && i.targets.length ? i.targets : DEFAULT_TARGETS).map(up).filter(valid));
  const rows = {};
  const row = (cc) => {
    cc = up(cc);
    if (!valid(cc)) return null;
    return rows[cc] || (rows[cc] = {
      cc, name: nameOf(cc), langs: langsOf(cc), target: targets.has(cc),
      prospects: 0, swept: 0, left: 0, sectors: {}, reviewed: 0, scoreSum: 0, scored: 0,
      campaigns: 0, active: 0, leads: 0, contacted: 0, sent: 0, opened: 0, replies: 0, interested: 0, bounced: 0, est: false, camps: [],
      answered: 0, positive: 0, social: 0, socialApproved: 0, visitors: 0, visitorsPrior: 0, visits: 0, reviews: 0, paid: 0, usd: 0
    });
  };
  targets.forEach(row);

  const queueHosts = {};
  const hosts = (i.queue && Array.isArray(i.queue.hosts)) ? i.queue.hosts : [];
  const at = Math.max(0, Math.min(Number(i.queue && i.queue.sweptAt) || 0, hosts.length));
  hosts.forEach((h, n) => {
    const r = row(h.cc);
    if (!r) return;
    queueHosts[bare(h.host)] = r.cc;
    r.prospects++;
    if (n < at) r.swept++; else r.left++;
    const s = String(h.sector || "other").slice(0, 40);
    r.sectors[s] = (r.sectors[s] || 0) + 1;
  });
  const liveHosts = {};
  ((i.live && i.live.reports) || []).forEach((rep) => {
    const r = row(rep.country);
    if (!r) return;
    liveHosts[bare(rep.host)] = r.cc;
    r.reviewed++;
    const score = Number(rep.overall);
    if (Number.isFinite(score) && score > 0) { r.scoreSum += score; r.scored++; }
  });
  const leadRows = (i.sync && i.sync.leads && i.sync.leads.rows) || [];
  const leadEmail = {};
  const leadHosts = {};
  leadRows.forEach((l) => {
    const cc = up(l.cc);
    if (!valid(cc)) return;
    if (l.email) leadEmail[String(l.email).toLowerCase()] = cc;
    if (l.host) leadHosts[bare(l.host)] = cc;
  });
  const countryOf = hostCountry([leadHosts, queueHosts, liveHosts]);

  ((i.marketing && i.marketing.campaigns && i.marketing.campaigns.rows) || []).forEach((c) => {
    const weights = {};
    leadRows.filter((l) => l.campaign === c.name && valid(up(l.cc))).forEach((l) => { weights[up(l.cc)] = (weights[up(l.cc)] || 0) + 1; });
    if (!Object.keys(weights).length) {
      const list = regionCountries(c.region, c.lang);
      const byProspects = list.map((cc) => (rows[cc] ? rows[cc].prospects : 0));
      const total = byProspects.reduce((s, n) => s + n, 0);
      list.forEach((cc, n) => { weights[cc] = total ? byProspects[n] : 1; });
    }
    const sum = Object.values(weights).reduce((s, n) => s + n, 0);
    const keys = Object.keys(weights).filter((cc) => weights[cc] > 0);
    keys.forEach((cc) => {
      const r = row(cc);
      const w = weights[cc] / sum;
      r.campaigns++;
      if (ACTIVE.test(c.status || "")) r.active++;
      ["leads", "contacted", "sent", "opened", "replies", "interested", "bounced"].forEach((k) => { r[k] += (Number(c[k]) || 0) * w; });
      if (keys.length > 1) r.est = true;
      r.camps.push({ id: c.id, name: c.name, status: c.status || "", share: round(w * 100) });
    });
  });
  ((i.sync && i.sync.replies) || []).forEach((rep) => {
    const from = String(rep.from || "").toLowerCase().replace(/^.*</, "").replace(/>.*$/, "").trim();
    const r = row(leadEmail[from] || countryOf(domainOf(from)));
    if (!r) return;
    r.answered++;
    if (POSITIVE.test(rep.category || "")) r.positive++;
  });
  const social = (list, approved) => (list || []).forEach((p) => {
    const r = p && p.report && row(countryOf(p.report.host));
    if (!r) return;
    r.social++;
    if (approved) r.socialApproved++;
  });
  social(i.engagement && i.engagement.waiting, false);
  social(i.engagement && i.engagement.approved, true);
  ((i.ga4 && i.ga4.countries) || []).forEach((c) => {
    const r = row(codeOf(c.label));
    if (!r) return;
    r.visitors += Number(c.value) || 0;
    r.visitorsPrior += Number(c.prior) || 0;
  });
  ((i.links && i.links.prospects) || []).forEach((p) => {
    const r = row(countryOf(p.host));
    if (!r) return;
    r.visits += Number(p.visits) || 0;
    r.reviews += Number(p.reviews) || 0;
    r.paid += Number(p.paid) || 0;
    r.usd += Number(p.usd) || 0;
  });

  const list = Object.values(rows).map((r) => {
    ["leads", "contacted", "sent", "opened", "replies", "interested", "bounced"].forEach((k) => { r[k] = Math.round(r[k]); });
    const sectors = Object.keys(r.sectors).map((label) => ({ label, value: r.sectors[label] })).sort((a, b) => b.value - a.value).slice(0, 5);
    const out = Object.assign({}, r, { sectors, score: r.scored ? Math.round(r.scoreSum / r.scored) : null, usd: round(r.usd, 100),
      replyRate: r.sent ? round((r.replies / r.sent) * 100, 10) : null, openRate: r.sent ? round((r.opened / r.sent) * 100, 10) : null });
    delete out.scoreSum;
    delete out.scored;
    out.light = lightOf(out);
    return out;
  });
  const sending = list.filter((r) => r.sent >= MIN_SENT);
  const sentAll = sending.reduce((s, r) => s + r.sent, 0);
  const avgReply = sentAll ? round((sending.reduce((s, r) => s + r.replies, 0) / sentAll) * 100, 10) : null;
  const gaps = [];
  list.forEach((r) => {
    r.gaps = [];
    const add = (kind, weight, text) => { r.gaps.push(kind); gaps.push({ cc: r.cc, name: r.name, kind, weight, text }); };
    const busy = r.prospects || r.reviewed || r.campaigns || r.social || r.visitors || r.visits;
    if (!r.campaigns && (r.prospects || r.reviewed)) add("no-campaign", r.prospects + r.reviewed, `${r.prospects} prospects and ${r.reviewed} reviewed sites, but no campaign`);
    else if (!r.campaigns && (r.visitors || r.visits)) add("visitors-no-outreach", r.visitors + r.visits, `${r.visitors + r.visits} visits, but we never reach out`);
    if (r.target && !busy) add("silent", 1, `speaks ${r.langs.join(", ") || "a target language"}, no activity at all`);
    if (avgReply && r.sent >= MIN_SENT && r.replyRate < avgReply / 2) add("low-reply", r.sent, `${r.replyRate}% replies against ${avgReply}% on average`);
    if (r.sent >= MIN_SENT && r.bounced / r.sent > 0.05) add("bouncing", r.bounced, `${Math.round((r.bounced / r.sent) * 100)}% of emails bounced`);
    if (r.prospects && !r.left && r.active) add("no-prospects-left", r.sent || r.prospects, "every prospect swept while a campaign runs");
  });
  const ORDER = ["no-prospects-left", "bouncing", "low-reply", "no-campaign", "visitors-no-outreach", "silent"];
  gaps.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.weight - a.weight || a.cc.localeCompare(b.cc));
  const acting = list.filter((r) => r.campaigns || r.prospects || r.social);
  return {
    targets: Array.from(targets).sort(),
    countries: list.sort((a, b) => b.sent - a.sent || b.prospects - a.prospects || a.cc.localeCompare(b.cc)),
    gaps: gaps.slice(0, 80),
    totals: {
      countries: acting.length, targets: targets.size, targetsActive: acting.filter((r) => r.target).length,
      missing: list.filter((r) => r.gaps.some((k) => k !== "silent")).length, silent: list.filter((r) => r.gaps.includes("silent")).length, avgReply,
      sent: list.reduce((s, r) => s + r.sent, 0), replies: list.reduce((s, r) => s + r.replies, 0), prospects: list.reduce((s, r) => s + r.prospects, 0),
      byLight: LIGHTS.map((_, n) => list.filter((r) => r.light === n).length)
    }
  };
}

/** Each row's next special date from the calendar source (#2989): nextDate {date, name, kind} and daysToDate from today. */
function joinDates(rows, calendar, now) {
  const next = (calendar && calendar.byCountry) || {};
  const { bogotaDay, diffDays } = require("./jarvis-calendar");
  const today = bogotaDay(now || Date.now());
  rows.forEach((r) => {
    const d = (next[r.cc] || []).find((x) => (x.end || x.date) >= today);
    r.nextDate = d ? { date: d.date, name: d.name, kind: d.kind } : null;
    r.daysToDate = d ? Math.max(0, diffDays(today, d.date)) : null;
  });
  return rows;
}

async function readTargets(db) {
  const snap = await db.collection("jarvis_settings").doc("geo").get().catch(() => null);
  const list = snap && snap.exists ? snap.data().targets : null;
  return Array.isArray(list) ? list.map(up).filter(valid) : [];
}

/** Turn one country on or off as a target market; the first change starts from the default list. */
async function setTarget(db, body) {
  const cc = up(body && body.cc);
  if (!valid(cc) || !NAMES.name[cc]) throw new Error("Give a two-letter country.");
  const now = await readTargets(db);
  const list = new Set(now.length ? now : DEFAULT_TARGETS);
  if (body.on) list.add(cc); else list.delete(cc);
  await db.collection("jarvis_settings").doc("geo").set({ targets: Array.from(list).sort(), at: new Date().toISOString() });
  return { ok: true, cc, on: !!body.on, targets: list.size };
}

async function geo(ctx) {
  const needs = [];
  const peer = (op) => (ctx.peer ? ctx.peer(op).then((o) => (o && o.ok !== false ? o : null)).catch(() => null) : Promise.resolve(null));
  const [queue, state, lane, live, targets, marketing, sync, outreach, engagement, ga4, calendar] = await Promise.all([
    ctx.db.collection("url_review_sweep").doc("outreach").get(),
    ctx.db.collection("url_review_sweep").doc("state").get(),
    ctx.db.collection("url_review_sweep").doc("lane").get(),
    ctx.fetch(ORIGIN + "/assets/live-reports/index.json", { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null),
    readTargets(ctx.db),
    peer("marketing"), peer("marketing-sync"), peer("outreach"), peer("engagement"), peer("ga4"), peer("calendar")
  ]);
  const view = sweep.outreachView(state.exists ? state.data() : null, lane.exists ? lane.data() : null);
  const q = queue.exists ? queue.data() : {};
  if (!live) needs.push("Live Reports index could not be read, so reviewed sites per country are missing.");
  if (!marketing || !marketing.campaigns || marketing.campaigns.ok === false) needs.push("Instantly campaigns are missing, so email numbers per country are empty.");
  if (!sync) needs.push("Marketing sync has not run, so campaigns are split by region instead of by their leads.");
  if (!ga4) needs.push("GA4 is not connected, so visitors per country are empty.");
  const out = geoRows({
    queue: { hosts: q.hosts, sweptAt: view && view.outreachAt }, live, targets, marketing, sync, engagement, ga4,
    links: outreach && outreach.links
  });
  joinDates(out.countries, calendar, ctx.now);
  return Object.assign({ ok: true, needs, days: ctx.days }, out);
}

module.exports = { geo, geoRows, joinDates, lightOf, LIGHTS, setTarget, readTargets, regionCountries, codeOf, nameOf, langsOf, LANG_COUNTRIES, DEFAULT_TARGETS };
