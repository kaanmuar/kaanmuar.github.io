/* Jarvis Map over time (#3109): a daily per-country history, ranges compared with the period before, and 13 weeks to play.

   jarvis_geo_history/{YYYY-MM-DD}, one document per Bogotá day, only countries with a number:
     c   the geo source's numbers for that day (geoRows at days=1), FIELDS in order: written by the daily briefing run
     d   the day's own email: Instantly's daily campaign analytics, each campaign split across countries with the shares
         geoRows gives it (its leads' countries, else its region weighted by prospects). [sent, opened, replies,
         interested, bounced]; bounced is null when Instantly sends none. The first run backfills BACKFILL_DAYS once,
         every run after rewrites the last REFRESH_DAYS (opens and replies land late).
     a   the outreach replies dated that day (marketing-sync keeps the last 80): [answered, positive], never lowered.
     k   the short-link clicks that day by visitor country, { cc: clicks } (#3281, jarvis-geo-clicks.js recordDays);
         over the clicks in c when present.

   jarvis_settings/geo_time keeps when the backfill ran and the summary the geo source sends (`time` on the Map tab):
     ranges   7, 30 and 90 days to yesterday against the same span before: { cc: { field: [now, before] } }
     weeks    the 13 weeks to yesterday: start dates and { cc: { field: [13 values] } }
   A null is a span with no history yet. Email, replies, visitors, link visits, reviews, paid, USD and clicks add up over a span;
   prospects, swept, left, reviewed and social replies are levels, the last day's value. */

const FIELDS = ["sent", "opened", "replies", "interested", "bounced", "answered", "positive", "prospects", "swept", "left", "reviewed", "social", "visitors", "visits", "reviews", "paid", "usd", "clicks"];
const EMAIL = FIELDS.slice(0, 5);
const LEVELS = new Set(["prospects", "swept", "left", "reviewed", "social"]);
const COLLECTION = "jarvis_geo_history";
const SUMMARY = ["jarvis_settings", "geo_time"];
const RANGES = [7, 30, 90];
const WEEKS = 13;
const BACKFILL_DAYS = 91;
const REFRESH_DAYS = 7;
const KEEP_DAYS = 2 * Math.max(...RANGES);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const round = (n) => Math.round(n * 100) / 100;
const valid = (cc) => /^[A-Z]{2}$/.test(cc);
const bogotaDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const daysFrom = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

/** The Bogotá day of a timestamp, "" when it has none. */
function dayOf(at) {
  const ms = typeof at === "number" ? at : Date.parse(at || "");
  return Number.isFinite(ms) && ms > 0 ? bogotaDay(ms) : "";
}

/** Counts one reply into { day: { cc: [answered, positive] } } (geoRows' replyDays). */
function tally(days, day, cc, positive) {
  const byCc = days[day] || (days[day] = {});
  const row = byCc[cc] || (byCc[cc] = [0, 0]);
  row[0] += 1;
  if (positive) row[1] += 1;
  return days;
}

/** The geo source's rows as { cc: [FIELDS] }, countries with a number only. */
function snapshotOf(countries) {
  const out = {};
  (countries || []).forEach((r) => {
    if (!r || !valid(r.cc)) return;
    const row = FIELDS.map((f) => round(Number(r[f]) || 0));
    if (row.some((n) => n)) out[r.cc] = row;
  });
  return out;
}

/** { campaignId: { cc: weight } } from the shares geoRows put on each country's camps, each campaign's adding to 1. */
function campaignWeights(countries) {
  const raw = {};
  (countries || []).forEach((r) => (r.camps || []).forEach((c) => {
    if (!c || !c.id || !(Number(c.share) > 0)) return;
    (raw[c.id] = raw[c.id] || {})[r.cc] = Number(c.share);
  }));
  Object.keys(raw).forEach((id) => {
    const sum = Object.values(raw[id]).reduce((s, n) => s + n, 0);
    Object.keys(raw[id]).forEach((cc) => { raw[id][cc] = raw[id][cc] / sum; });
  });
  return raw;
}

/** Instantly's daily analytics rows as { day: [sent, opened, replies, interested, bounced] }; bounced null when it has none. */
function dailyOf(res) {
  const list = Array.isArray(res) ? res : (res && (res.items || res.data)) || [];
  const out = {};
  list.forEach((x) => {
    const day = String((x && x.date) || "").slice(0, 10);
    if (!DAY.test(day)) return;
    const n = (...keys) => { for (const k of keys) if (x[k] !== undefined && x[k] !== null) return Number(x[k]) || 0; return 0; };
    const bounced = x.bounced !== undefined ? x.bounced : x.bounced_count;
    out[day] = [n("sent", "emails_sent_count"), n("unique_opened", "opened"), n("unique_replies", "replies"), n("unique_opportunities", "opportunities"),
      bounced === undefined || bounced === null ? null : Number(bounced) || 0];
  });
  return out;
}

/** Each campaign's days split across its countries: { day: { cc: [5] } }, every day from `from` to `to` present. */
function splitDays(perCampaign, weights, from, to) {
  const out = {};
  daysFrom(from, to).forEach((d) => { out[d] = {}; });
  Object.keys(perCampaign || {}).forEach((id) => {
    const w = weights[id];
    if (!w) return;
    Object.keys(perCampaign[id]).forEach((day) => {
      if (!out[day]) return;
      const nums = perCampaign[id][day];
      Object.keys(w).forEach((cc) => {
        const row = (out[day][cc] = out[day][cc] || [0, 0, 0, 0, null]);
        nums.forEach((n, i) => { if (n !== null) row[i] = (row[i] || 0) + n * w[cc]; });
      });
    });
  });
  Object.values(out).forEach((byCc) => Object.keys(byCc).forEach((cc) => {
    const row = byCc[cc].map((n) => (n === null ? null : round(n)));
    if (row.some((n) => n)) byCc[cc] = row; else delete byCc[cc];
  }));
  return out;
}

/** The stored replies for a day with the new count laid over, never lower: sync.replies drops the oldest. */
function mergeReplies(kept, fresh) {
  const out = Object.assign({}, kept || {});
  Object.keys(fresh || {}).forEach((cc) => {
    const was = out[cc] || [0, 0];
    out[cc] = [Math.max(was[0], fresh[cc][0]), Math.max(was[1], fresh[cc][1])];
  });
  return out;
}

// One country's FIELDS on one day: null where that part of the day was never recorded.
function dayRow(doc, cc) {
  return FIELDS.map((f, i) => {
    if (i < EMAIL.length) {
      if (!doc.d) return null;
      const row = doc.d[cc];
      if (row) return row[i] === undefined ? null : row[i];
      return i === 4 && doc.nb ? null : 0;
    }
    if (f === "answered" || f === "positive") return doc.a ? ((doc.a[cc] || [0, 0])[f === "answered" ? 0 : 1]) : null;
    if (f === "clicks" && doc.k) return doc.k[cc] || 0;
    return doc.c ? (doc.c[cc] ? doc.c[cc][i] : 0) : null;
  });
}

// FIELDS over a span: flows add up, levels keep the last recorded day; null where no day had it.
function spanRow(rows) {
  return FIELDS.map((f, i) => {
    let out = null;
    rows.forEach((row) => {
      const v = row[i];
      if (v === null || v === undefined) return;
      out = LEVELS.has(f) ? v : (out || 0) + v;
    });
    return out === null ? null : round(out);
  });
}

/** The `time` summary from the history documents, to the day `to` (yesterday). Pure, for the tests. */
function summarize(docs, to) {
  const byDay = {};
  (docs || []).forEach((d) => { if (d && DAY.test(d.day) && d.day <= to) byDay[d.day] = d; });
  const days = Object.keys(byDay).sort();
  const ccs = new Set();
  days.forEach((d) => ["c", "d", "a", "k"].forEach((k) => Object.keys(byDay[d][k] || {}).forEach((cc) => { if (valid(cc)) ccs.add(cc); })));
  const span = (from, end, cc) => spanRow(days.filter((d) => d >= from && d <= end).map((d) => dayRow(byDay[d], cc)));
  const covered = (from, end) => days.filter((d) => d >= from && d <= end).length;
  const pack = (cols) => {
    const out = {};
    Object.keys(cols).forEach((cc) => {
      const fields = {};
      FIELDS.forEach((f, i) => {
        const list = cols[cc].map((row) => row[i]);
        if (list.some((v) => v)) fields[f] = list;
      });
      if (Object.keys(fields).length) out[cc] = fields;
    });
    return out;
  };
  const ranges = {};
  RANGES.forEach((n) => {
    const from = addDays(to, 1 - n);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, 1 - n);
    const cols = {};
    ccs.forEach((cc) => { cols[cc] = [span(from, to, cc), span(prevFrom, prevTo, cc)]; });
    ranges[n] = { from, to, prevFrom, prevTo, days: covered(from, to), prevDays: covered(prevFrom, prevTo), c: pack(cols) };
  });
  const start = Array.from({ length: WEEKS }, (_, k) => addDays(to, 1 - 7 * (WEEKS - k)));
  const cols = {};
  ccs.forEach((cc) => { cols[cc] = start.map((s) => span(s, addDays(s, 6), cc)); });
  return {
    fields: FIELDS, to, since: days[0] || "", levelsSince: days.find((d) => byDay[d].c) || "",
    ranges, weeks: { start, days: start.map((s) => covered(s, addDays(s, 6))), c: pack(cols) }
  };
}

/** For Ask: the countries that moved most over 7 and 30 days, sent and replies against the span before. */
function askView(time) {
  if (!time || !time.ranges) return null;
  const out = {};
  [7, 30].forEach((n) => {
    const r = time.ranges[n];
    if (!r) return;
    const moves = Object.keys(r.c).map((cc) => {
      const f = r.c[cc];
      const pair = (k) => (f[k] ? f[k].map((v) => v || 0) : [0, 0]);
      return { cc, sent: pair("sent"), replies: pair("replies"), positive: pair("positive"), move: Math.abs(pair("sent")[0] - pair("sent")[1]) + 10 * Math.abs(pair("replies")[0] - pair("replies")[1]) };
    }).filter((m) => m.sent[0] || m.sent[1] || m.replies[0] || m.replies[1]).sort((a, b) => b.move - a.move || b.sent[0] - a.sent[0] || a.cc.localeCompare(b.cc)).slice(0, 8);
    out[n + " days"] = { from: r.from, to: r.to, recordedDays: r.days, previousRecordedDays: r.prevDays, countries: moves.map((m) => `${m.cc}: sent ${m.sent[0]} (before ${m.sent[1]}), replies ${m.replies[0]} (before ${m.replies[1]}), positive ${m.positive[0]} (before ${m.positive[1]})`) };
  });
  return out;
}

/** The summary the geo source attaches as `time`, or null before the first daily run. */
async function read(db) {
  const snap = await db.collection(SUMMARY[0]).doc(SUMMARY[1]).get();
  const d = snap.exists ? snap.data() : null;
  if (!d || typeof d.json !== "string") return null;
  return Object.assign(JSON.parse(d.json), { at: d.at || "" });
}

// Instantly's daily numbers for each campaign, four at a time; one failure fails the lot, so no day is half written.
async function fetchDaily(ctx, ids, from, to) {
  const out = {};
  const queue = ids.slice();
  const one = async () => {
    while (queue.length) {
      const id = queue.shift();
      const q = "campaign_id=" + encodeURIComponent(id) + "&start_date=" + from + "&end_date=" + to;
      out[id] = dailyOf(await ctx.instantly("campaigns/analytics/daily?" + q));
    }
  };
  await Promise.all([one(), one(), one(), one()]);
  return out;
}

/**
 * The daily run, inside the daily briefing: yesterday's numbers from the geo source, the email days from Instantly
 * (BACKFILL_DAYS once, then REFRESH_DAYS) and the dated replies, then the summary. Every write is a set of whole
 * fields per day, so a run repeated gives the same documents. ctx: db, now, geo (the geo source at days=1), instantly
 * (path → JSON, or null without the key).
 */
async function record(ctx) {
  const db = ctx.db;
  const to = addDays(bogotaDay(ctx.now), -1);
  const at = new Date(ctx.now).toISOString();
  const metaRef = db.collection(SUMMARY[0]).doc(SUMMARY[1]);
  const metaSnap = await metaRef.get();
  const meta = metaSnap.exists ? metaSnap.data() : {};
  const col = db.collection(COLLECTION);
  const geo = ctx.geo && ctx.geo.ok !== false ? ctx.geo : null;
  const notes = [];
  let backfilledAt = meta.backfilledAt || "";

  if (geo) await col.doc(to).set({ day: to, at, c: snapshotOf(geo.countries) }, { mergeFields: ["day", "at", "c"] });
  else notes.push("geo not loaded, no snapshot");

  const weights = geo ? campaignWeights(geo.countries) : {};
  const ids = Object.keys(weights);
  if (ctx.instantly && ids.length) {
    const from = addDays(to, 1 - (backfilledAt ? REFRESH_DAYS : BACKFILL_DAYS));
    try {
      const per = await fetchDaily(ctx, ids, from, to);
      const split = splitDays(per, weights, from, to);
      const nb = !Object.values(per).some((days) => Object.values(days).some((row) => row[4] !== null));
      const batch = db.batch();
      Object.keys(split).forEach((day) => batch.set(col.doc(day), { day, d: split[day], nb }, { mergeFields: ["day", "d", "nb"] }));
      await batch.commit();
      notes.push((backfilledAt ? "refreshed " : "backfilled ") + Object.keys(split).length + " email days from " + ids.length + " campaigns");
      if (!backfilledAt) backfilledAt = at;
    } catch (error) {
      notes.push("Instantly daily analytics failed: " + String(error.message || error).slice(0, 120));
    }
  } else notes.push(ctx.instantly ? "no campaign to split" : "no Instantly key");

  const replyDays = Object.keys((geo && geo.replyDays) || {}).filter((d) => DAY.test(d) && d <= to);
  if (replyDays.length) {
    const kept = await db.getAll(...replyDays.map((d) => col.doc(d)));
    const batch = db.batch();
    replyDays.forEach((day, n) => batch.set(col.doc(day), { day, a: mergeReplies(kept[n].exists ? kept[n].get("a") : null, geo.replyDays[day]) }, { mergeFields: ["day", "a"] }));
    await batch.commit();
    notes.push(replyDays.length + " reply days");
  }
  if (ctx.clicks) notes.push(await require("./jarvis-geo-clicks").recordDays(ctx, col, to).catch((error) => "clicks failed: " + String(error.message || error).slice(0, 120)));

  const snap = await col.where("day", ">=", addDays(to, 1 - KEEP_DAYS)).get();
  const time = summarize(snap.docs.map((d) => d.data()), to);
  const json = JSON.stringify(time);
  await metaRef.set({ at, to, backfilledAt, days: snap.size, json: json.length < 900000 ? json : "" }, { merge: true });
  return "geo history " + to + ": " + notes.join(", ") + "; " + snap.size + " days kept";
}

module.exports = { FIELDS, LEVELS, RANGES, WEEKS, BACKFILL_DAYS, REFRESH_DAYS, COLLECTION, dayOf, tally, snapshotOf, campaignWeights, dailyOf, splitDays, mergeReplies, summarize, askView, read, record, addDays };
