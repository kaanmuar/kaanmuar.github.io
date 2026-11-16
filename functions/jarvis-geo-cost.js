/* Jarvis Map cost and return (#3283): monthly outreach costs spread over the countries, per email, reply and positive reply.

   jarvis_settings/geo_costs   items [{ label, usd, channel, from, to }]: usd a month; channel email, social, links or all;
                               from and to optional months (YYYY-MM, both counted). Saved by the geo-costs-save op, empty
                               until Carlos adds them; while empty the layer asks for them and the geo source has a need.
   proration   an item counts usd / days in the month for each day of a span inside its months.
   spread      email and all costs by each country's share of the emails sent in the span, social costs by social
               replies, links costs by short-link visits. A channel with nothing to spread over stays unspread.
   per country [cost, costPerSent, costPerReply, costPerPositive, revenue, roi] (KEYS): revenue is the link USD, roi is
               revenue / cost. A ratio whose count is 0, or with no cost, is null rather than 0.
   spans       Now uses the history range nearest the Jarvis range (7, 30 or 90 days, jarvis-geo-time.js), since the
               lifetime email numbers and the range's link revenue cover different days; with no history yet, the
               campaigns' lifetime from the first one created. ranges carry [last n days, the n before]; weeks the 13 to play.
   suggest     geo-costs with suggest: the domains on Cloudflare Registrar at their renewal price a month, for Carlos to
               add or leave; nothing is saved on its own. Twins: js/admin-jarvis-geo-cost.js, android/.../ui/GeoCost.kt. */

const CHANNELS = ["email", "social", "links", "all"];
const SPREAD_BY = { email: "sent", all: "sent", social: "social", links: "visits" };
const KEYS = ["cost", "costPerSent", "costPerReply", "costPerPositive", "revenue", "roi"];
const COUNTS = ["sent", "replies", "positive", "social", "visits", "usd"];
const DOC = "geo_costs";
const MAX_ITEMS = 30;
const MAX_USD = 100000;
const NEEDS = "Add monthly outreach costs in Settings to see cost and return.";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CF = "https://api.cloudflare.com/client/v4/accounts/";

const round = (n, d) => Math.round(n * d) / d;
const money = (n) => round(n, 100);
const pos = (n) => (Number(n) > 0 ? Number(n) : 0);
const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const daysIn = (month) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const bogotaDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const active = (item, month) => (!item.from || month >= item.from) && (!item.to || month <= item.to);

/** The saved list, checked: every item named, a monthly USD above 0, a known channel, months as YYYY-MM in order. Throws the first problem. */
function cleanItems(list) {
  if (!Array.isArray(list)) throw new Error("Send the costs as a list.");
  if (list.length > MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} costs.`);
  return list.map((x, i) => {
    const o = x && typeof x === "object" ? x : {};
    const label = String(o.label || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!label) throw new Error(`Cost ${i + 1} needs a name.`);
    const usd = Number(o.usd);
    if (!Number.isFinite(usd) || usd <= 0 || usd > MAX_USD) throw new Error(`${label}: give the USD a month, above 0 and up to ${MAX_USD}.`);
    const channel = String(o.channel || "all").trim().toLowerCase();
    if (!CHANNELS.includes(channel)) throw new Error(`${label}: the channel is email, social, links or all.`);
    const month = (v, what) => {
      const s = String(v || "").trim();
      if (s && !MONTH.test(s)) throw new Error(`${label}: the ${what} month is YYYY-MM.`);
      return s;
    };
    const from = month(o.from, "start");
    const to = month(o.to, "end");
    if (from && to && to < from) throw new Error(`${label}: the end month is before the start.`);
    return { label, usd: money(usd), channel, from, to };
  });
}

/** The saved items that still pass the checks; a bad one is left out instead of failing the Map. */
function keepValid(list) {
  return (Array.isArray(list) ? list : []).map((x) => { try { return cleanItems([x])[0]; } catch (error) { return null; } }).filter(Boolean).slice(0, MAX_ITEMS);
}

/** One item's USD over the days from..to, both counted: usd / days in the month for each day inside its months. */
function prorate(item, from, to) {
  if (!DAY.test(from || "") || !DAY.test(to || "") || to < from) return 0;
  let total = 0;
  for (let d = from; d <= to;) {
    const m = d.slice(0, 7);
    const last = m + "-" + String(daysIn(m)).padStart(2, "0");
    const end = last < to ? last : to;
    if (active(item, m)) total += (item.usd * (daysBetween(d, end) + 1)) / daysIn(m);
    d = addDays(end, 1);
  }
  return total;
}

/** USD per channel and in all over the span, unrounded. */
function spendOf(items, from, to) {
  const out = { email: 0, social: 0, links: 0, all: 0, total: 0 };
  (items || []).forEach((it) => { const v = prorate(it, from, to); out[it.channel] += v; out.total += v; });
  return out;
}

/** The monthly USD per channel for the items running in a month (YYYY-MM). */
function monthlyOf(items, month) {
  const out = { email: 0, social: 0, links: 0, all: 0, total: 0 };
  (items || []).filter((it) => active(it, month)).forEach((it) => { out[it.channel] += it.usd; out.total += it.usd; });
  Object.keys(out).forEach((k) => { out[k] = money(out[k]); });
  return out;
}

const ratio = (cost, n) => (cost > 0 && n > 0 ? round(cost / n, 10000) : null);

/**
 * The span's spend spread over the countries. rows: { cc: { sent, replies, positive, social, visits, usd } } over the same
 * days. Returns { from, to, days, totals, c: { cc: KEYS values } }, only countries with a cost or revenue. Pure, for the tests.
 */
function allocate(items, from, to, rows) {
  const spend = spendOf(items, from, to);
  const ccs = Object.keys(rows || {}).filter((cc) => /^[A-Z]{2}$/.test(cc)).sort();
  const sums = { sent: 0, social: 0, visits: 0 };
  ccs.forEach((cc) => Object.keys(sums).forEach((k) => { sums[k] += pos(rows[cc][k]); }));
  const cost = {};
  const channels = {};
  CHANNELS.forEach((ch) => {
    const by = SPREAD_BY[ch];
    const usd = spend[ch];
    const spread = usd && sums[by] ? usd : 0;
    if (spread) ccs.forEach((cc) => { const w = pos(rows[cc][by]) / sums[by]; if (w) cost[cc] = (cost[cc] || 0) + spread * w; });
    channels[ch] = { usd: money(usd), unspread: money(usd - spread), over: ccs.filter((cc) => pos(rows[cc][by]) > 0).length };
  });
  const total = (k) => round(ccs.reduce((s, cc) => s + pos(rows[cc][k]), 0), 100);
  const c = {};
  ccs.forEach((cc) => {
    const r = rows[cc];
    const k = cost[cc] || 0;
    const revenue = pos(r.usd);
    if (!k && !revenue) return;
    c[cc] = [k ? money(k) : 0, ratio(k, pos(r.sent)), ratio(k, pos(r.replies)), ratio(k, pos(r.positive)), money(revenue), k > 0 ? round(revenue / k, 100) : null];
  });
  const t = { sent: total("sent"), replies: total("replies"), positive: total("positive"), revenue: money(total("usd")) };
  const unspread = CHANNELS.reduce((s, ch) => s + channels[ch].unspread, 0);
  const totals = Object.assign({ cost: money(spend.total), spread: money(spend.total - unspread), unspread: money(unspread) }, t, {
    costPerSent: ratio(spend.total, t.sent), costPerReply: ratio(spend.total, t.replies), costPerPositive: ratio(spend.total, t.positive),
    roi: spend.total > 0 ? round(t.revenue / spend.total, 100) : null, channels
  });
  return { from, to, days: DAY.test(from) && DAY.test(to) && to >= from ? daysBetween(from, to) + 1 : 0, totals, c };
}

// The history's numbers as allocate's rows: which 0 the span, 1 the span before (or a week's index).
function historyRows(byCc, which) {
  const out = {};
  Object.keys(byCc || {}).forEach((cc) => {
    const f = byCc[cc] || {};
    out[cc] = {};
    COUNTS.forEach((k) => { out[cc][k] = f[k] ? Number(f[k][which]) || 0 : 0; });
  });
  return out;
}

// Today's geo rows as allocate's rows.
function liveRows(countries) {
  const out = {};
  (countries || []).forEach((r) => { if (r && r.cc) { out[r.cc] = {}; COUNTS.forEach((k) => { out[r.cc][k] = Number(r[k]) || 0; }); } });
  return out;
}

const spanOf = (days) => (days <= 7 ? 7 : days <= 30 ? 30 : 90);

/**
 * The whole layer from the saved items, the geo rows, the history summary and the campaigns. input: items, at, by, days
 * (the Jarvis range), countries, time (jarvis-geo-time summary or null), campaigns (marketing rows), now. Pure, for the tests.
 */
function build(input) {
  const i = input || {};
  const items = keepValid(i.items);
  const today = bogotaDay(i.now || Date.now());
  const out = { items, at: i.at || "", by: i.by || "", monthly: monthlyOf(items, today.slice(0, 7)), basis: null, now: null, ranges: {}, weeks: [] };
  if (!items.length) return out;
  const time = i.time && i.time.ranges ? i.time : null;
  const n = spanOf(Number(i.days) || 30);
  const r = time && time.ranges[n];
  if (r && r.days) {
    out.basis = { kind: "span", span: n, from: r.from, to: r.to };
    out.now = allocate(items, r.from, r.to, historyRows(r.c, 0));
  } else {
    const first = (i.campaigns || []).map((c) => String((c && c.created) || "")).filter((d) => DAY.test(d) && d <= today).sort()[0];
    if (first) {
      out.basis = { kind: "lifetime", span: 0, from: first, to: today };
      out.now = allocate(items, first, today, liveRows(i.countries));
    }
  }
  if (time) {
    Object.keys(time.ranges).forEach((k) => {
      const x = time.ranges[k];
      if (x && x.from) out.ranges[k] = [allocate(items, x.from, x.to, historyRows(x.c, 0)), allocate(items, x.prevFrom, x.prevTo, historyRows(x.c, 1))];
    });
    if (time.weeks && Array.isArray(time.weeks.start)) out.weeks = time.weeks.start.map((s, k) => allocate(items, s, addDays(s, 6), historyRows(time.weeks.c, k)));
  }
  return out;
}

/** The KEYS fields of one country from a span's view, all null where it has none. */
function fieldsOf(view, cc) {
  const row = view && view.c && view.c[cc];
  const out = {};
  KEYS.forEach((k, n) => { out[k] = row ? row[n] : null; });
  return out;
}

async function read(db) {
  const snap = await db.collection("jarvis_settings").doc(DOC).get().catch(() => null);
  const d = snap && snap.exists ? snap.data() || {} : {};
  return { items: keepValid(d.items), at: String(d.at || ""), by: String(d.by || "") };
}

/** The geo source's hook: out.cost, each country's Now fields, and the need while the list is empty. */
async function attach(ctx, out, extra) {
  const saved = await read(ctx.db);
  const campaigns = extra && extra.marketing && extra.marketing.campaigns && extra.marketing.campaigns.rows;
  const cost = build(Object.assign({}, saved, { days: ctx.days, countries: out.countries, time: out.time, campaigns, now: ctx.now }));
  out.cost = cost;
  (out.countries || []).forEach((r) => Object.assign(r, fieldsOf(cost.now, r.cc)));
  if (!cost.items.length && extra && extra.needs) extra.needs.push(NEEDS);
  return cost;
}

/** The geo-costs-save op: the checked list replaces the saved one. */
async function save(db, body, by, now) {
  const items = cleanItems(body && body.items);
  const at = new Date(now || Date.now()).toISOString();
  await db.collection("jarvis_settings").doc(DOC).set({ items, at, by: String(by || "") });
  return { ok: true, items, at, monthly: monthlyOf(items, bogotaDay(now || Date.now()).slice(0, 7)) };
}

/** The calendar month before now's, "YYYY-MM" (UTC). */
const lastMonth = (now) => { const d = new Date(now); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); };
const why = (error) => String((error && error.message) || error).slice(0, 120);
const REGISTRAR_NEED = "Cloudflare Registrar: give the token in CLOUDFLARE_ANALYTICS_TOKEN the permission Account > Registrar Domains > Read";

/**
 * The domains on Cloudflare Registrar at their extension's renewal price a month. The price is Cloudflare's at-cost one, read
 * by checking an unregistered name on the same extension (the registrations list has none). It reads with
 * CLOUDFLARE_ANALYTICS_TOKEN, then CLOUDFLARE_API_TOKEN, whichever has Account > Registrar Domains > Read.
 */
async function domainSuggestions(ctx) {
  const env = (ctx && ctx.env) || {};
  const tokens = [...new Set([env.CLOUDFLARE_ANALYTICS_TOKEN, env.CLOUDFLARE_API_TOKEN].filter(Boolean))];
  const account = String(env.CLOUDFLARE_ACCOUNT_ID || "").replace(/[^a-f0-9]/gi, "");
  if (!tokens.length || !account) return { note: "Cloudflare is not set up here, so there are no domains to suggest." };
  const call = async (token, path, init) => {
    const res = await ctx.fetch(CF + account + path, Object.assign({ headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) }, init));
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) throw new Error(((j.errors || [])[0] || {}).message || "Cloudflare answered " + res.status);
    return j.result;
  };
  let token = "", list, failed;
  for (const t of tokens) {
    try { list = await call(t, "/registrar/registrations?per_page=50"); token = t; break; } catch (error) { failed = failed || error; }
  }
  if (!token) return { note: `${REGISTRAR_NEED} (${why(failed)}).` };
  const domains = (Array.isArray(list) ? list : []).filter((d) => d && d.domain_name && d.status !== "expired").map((d) => String(d.domain_name).toLowerCase());
  if (!domains.length) return { note: "No domain is registered on Cloudflare Registrar." };
  const byTld = {};
  domains.forEach((d) => { const tld = d.slice(d.indexOf(".") + 1); (byTld[tld] = byTld[tld] || []).push(d); });
  const suggestions = [];
  const unpriced = [];
  for (const tld of Object.keys(byTld).sort()) {
    const probe = "jarvis-price-" + Date.now().toString(36) + "." + tld;
    const res = await call(token, "/registrar/domain-check", { method: "POST", body: JSON.stringify({ domains: [probe] }) }).catch(() => null);
    const hit = ((res && res.domains) || []).find((x) => x && x.pricing && Number(x.pricing.renewal_cost) > 0);
    if (!hit) { unpriced.push("." + tld); continue; }
    const year = Number(hit.pricing.renewal_cost);
    const names = byTld[tld];
    suggestions.push({
      label: `Domain renewals .${tld} (${names.length})`.slice(0, 60), usd: money((year * names.length) / 12), channel: "email", from: "", to: "",
      source: "Cloudflare Registrar", why: `${names.join(", ")}: ${hit.pricing.currency || "USD"} ${year.toFixed(2)} a year each, renewed on Cloudflare. Leave it out if a domain is not for outreach.`
    });
  }
  return { suggestions, note: unpriced.length ? `Cloudflare listed the domains but did not price ${unpriced.join(", ")}; enter that renewal by hand.` : "" };
}

/** Google Cloud's net cost for the last full month, after credits and in USD, from the billing export (the costs source). */
async function cloudSuggestions(ctx, month) {
  const sources = require("./jarvis-sources");
  try {
    const token = await sources.googleToken(ctx.fetch, "https://www.googleapis.com/auth/cloud-platform");
    const out = await sources.costs({ fetch: ctx.fetch, month }, token);
    if (out.need) return { note: "Google Cloud: the billing export to BigQuery is off, so there is no month to suggest." };
    if (out.pending) return { note: "Google Cloud: the billing export has no rows yet." };
    const usd = money(out.usd || 0);
    if (!(usd > 0)) return { note: `Google Cloud: nothing billed for ${month}.` };
    const top = (out.byService || []).filter((x) => x.value > 0).slice(0, 3).map((x) => x.label).join(", ");
    return { suggestions: [{ label: "Google Cloud (Jarvis)", usd, channel: "all", from: "", to: "", source: "Google Cloud billing export",
      why: `Net cost billed for ${month}, after credits${out.currency && out.currency !== "USD" ? ", converted from " + out.currency : ""}${top ? "; mostly " + top : ""}. Gemini on Vertex AI is in it.` }] };
  } catch (error) {
    return { note: "Google Cloud: the billing export could not be read (" + why(error) + ")." };
  }
}

/**
 * AI spend: the Jarvis worker's last full month (jarvis_worker_spend/<YYYY-MM>), and Cursor on-demand from the Mac upload
 * (jarvis_github_local/latest), which only has the current billing cycle so far: it is suggested once that cycle is a month old.
 */
async function aiSuggestions(ctx, month, now) {
  if (!ctx.db) return { note: "AI: Firestore is not reachable here." };
  const read = (col, id) => ctx.db.collection(col).doc(id).get().then((d) => (d.exists ? d.data() : null)).catch(() => null);
  const [spend, local] = await Promise.all([read("jarvis_worker_spend", month), read("jarvis_github_local", "latest")]);
  const suggestions = [];
  const notes = [];
  const usd = money(Number(spend && spend.usd) || 0);
  if (usd > 0) suggestions.push({ label: "AI: Jarvis worker (Gemini)", usd, channel: "all", from: "", to: "", source: "Jarvis worker spend",
    why: `${month}: ${Number(spend.runs) || 0} runs, ${Number(spend.input) || 0} tokens in and ${Number(spend.output) || 0} out, at list prices rounded up, so it overstates a little. If GEMINI_API_KEY bills to this Google Cloud project, Google Cloud already has it: keep one.` });
  else notes.push(`AI: the Jarvis worker spent nothing in ${month}.`);
  const c = local && local.cost;
  const start = Date.parse((c && c.cycleStart) || "");
  const at = Date.parse((local && local.at) || "") || now;
  const onDemand = money(Number(c && c.onDemandUsd) || 0);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  if (!c || !Number.isFinite(start)) notes.push("AI: the Mac upload has no Cursor cost yet.");
  else if (at - start < 28 * 86400000) notes.push(`AI: Cursor on-demand is $${onDemand.toFixed(2)} for the cycle since ${day(start)} (${Math.max(0, Math.floor((at - start) / 86400000))} days, from the Mac upload), not a full month yet, so it is not suggested.`);
  else if (onDemand > 0) suggestions.push({ label: "AI: Cursor on-demand", usd: onDemand, channel: "all", from: "", to: "", source: "Cursor, from the Mac upload",
    why: `On-demand usage for the billing cycle from ${day(start)}, as of ${day(at)}. The plan's fixed fee is not in it: add that by hand.` });
  else notes.push(`AI: Cursor on-demand was $0 for the cycle from ${day(start)}.`);
  return { suggestions, note: notes.join(" ") };
}

/**
 * Suggested items to confirm, never saved on their own: Cloudflare Registrar domains, Google Cloud and AI (Jarvis worker,
 * Cursor on-demand) for the last full month. A label already in the list is left out.
 * ctx: fetch, env, db, now, items (the saved list). Never throws: a missing or failing source is a note.
 */
async function suggest(ctx) {
  const now = ctx.now || Date.now();
  const month = lastMonth(now);
  const parts = await Promise.all([domainSuggestions(ctx), cloudSuggestions(ctx, month), aiSuggestions(ctx, month, now)].map((p) => p.catch((error) => ({ note: why(error) }))));
  const have = new Set((ctx.items || []).map((x) => String(x.label || "").toLowerCase()));
  const suggestions = [].concat(...parts.map((p) => p.suggestions || [])).filter((x) => !have.has(x.label.toLowerCase()));
  return { suggestions, month, note: parts.map((p) => p.note).filter(Boolean).join(" ") };
}

const showUsd = (v) => (v === null || v === undefined ? "none" : "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2)));

/** For Ask: the monthly costs, the basis, the totals and the cheapest and costliest countries per reply. */
function ask(geo) {
  const c = geo && geo.cost;
  if (!c) return null;
  if (!c.items.length) return { note: NEEDS };
  const v = c.now;
  const rows = v ? Object.keys(v.c).map((cc) => Object.assign({ cc }, fieldsOf(v, cc))) : [];
  const line = (r) => `${r.cc}: $${r.cost} cost, ${showUsd(r.costPerSent)} per email, ${showUsd(r.costPerReply)} per reply, ${showUsd(r.costPerPositive)} per positive, revenue $${r.revenue}, return ${r.roi === null ? "none" : r.roi + "x"}`;
  const perReply = rows.filter((r) => r.costPerReply !== null).sort((a, b) => a.costPerReply - b.costPerReply || a.cc.localeCompare(b.cc));
  return {
    monthlyUsd: c.monthly,
    items: c.items.map((it) => `${it.label}: $${it.usd} a month, ${it.channel}${it.from ? " from " + it.from : ""}${it.to ? " to " + it.to : ""}`),
    basis: c.basis ? (c.basis.kind === "span" ? `last ${c.basis.span} days, ${c.basis.from} to ${c.basis.to}` : `since the first campaign, ${c.basis.from}`) : "no basis yet",
    totals: v ? v.totals : null,
    cheapestPerReply: perReply.slice(0, 5).map(line),
    costliestPerReply: perReply.slice(-5).reverse().map(line),
    bestReturn: rows.filter((r) => r.roi !== null && r.roi > 0).sort((a, b) => b.roi - a.roi).slice(0, 5).map(line)
  };
}

module.exports = { CHANNELS, KEYS, NEEDS, DOC, MAX_ITEMS, cleanItems, keepValid, prorate, spendOf, monthlyOf, allocate, build, fieldsOf, read, attach, save, suggest, domainSuggestions, cloudSuggestions, aiSuggestions, lastMonth, ask };
