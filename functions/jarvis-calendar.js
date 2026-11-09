/* Jarvis country calendar (#2989): each target market's special dates for the next 60 days, so campaigns, posts and
   routines move ahead of them.

   holidays    public holidays from Nager.Date (date.nager.at), cached per year in jarvis_holidays/<year> and refreshed
               monthly; a country Nager lacks is listed in missing and simply has no holidays
   curated     commerce seasons, academic calendars, fiscal year ends, regulation dates, awareness days, events and
               religious dates from country-dates.json (rules computed for last, this and next year)
   pauses      jarvis_calendar_pauses/<CC>-<date>: a campaign pause over a country's holiday, planned from a proposal or
               made by the daily job when settings.calendar.autoPause is on; resumed on the next business day

   A campaign is paused for a holiday only when at least SHARE% of its leads (the geo source's camps share) are in that
   country and it is sending. Settings live in jarvis_settings/main.calendar = { autoPause, warnDays, remindDays }. */

const DATA = require("./country-dates.json");
const core = require("./jarvis-core");

const NAGER = "https://date.nager.at/api/v3/PublicHolidays/";
const HOLIDAYS = "jarvis_holidays";
const PAUSES = "jarvis_calendar_pauses";
const HORIZON = core.CALENDAR.horizon;
const SHARE = core.CALENDAR.share;
const DAY = 24 * 60 * 60 * 1000;
const REFRESH = 30 * DAY;
const DEFAULTS = { autoPause: false, warnDays: core.CALENDAR.warnDays, remindDays: core.CALENDAR.remindDays };
const KINDS = ["holiday", "commerce", "academic", "fiscal", "regulation", "awareness", "religious", "event"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NTH = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };

const text = (v, max) => String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const int = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.round(Number(v)) : d);
const utc = (s) => Date.parse(s + "T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => iso(utc(s) + n * DAY);
const diffDays = core.dayDiff;
const weekend = (s) => { const d = new Date(utc(s)).getUTCDay(); return d === 0 || d === 6; };
const bogotaDay = (now) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));

const cleanSettings = core.calendarSettings;
const heldCampaigns = core.heldCampaigns;

// Easter Sunday (anonymous Gregorian algorithm).
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(year, month - 1, day));
}

/** The nth (1-5, or -1 for last) weekday (0 Sunday) of a month (0-11), or null when the month has no such day. */
function nthWeekday(year, month, weekday, n) {
  if (n < 0) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return iso(last.getTime() - ((last.getUTCDay() - weekday + 7) % 7) * DAY);
  }
  const first = new Date(Date.UTC(year, month, 1));
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (n - 1);
  const out = new Date(Date.UTC(year, month, day));
  return out.getUTCMonth() === month ? iso(out.getTime()) : null;
}

/** A rule's date in a year: "MM-DD", "easter", "day N", "<nth> <weekday> of <month>", each with an optional " +N"/" -N" days. */
function ruleDate(rule, year) {
  const m = /^(.*?)(?:\s+([+-]\d+))?$/.exec(String(rule || "").trim().toLowerCase());
  const base = m[1].trim();
  let d = null, x;
  if ((x = /^(\d{2})-(\d{2})$/.exec(base))) {
    const t = Date.UTC(year, Number(x[1]) - 1, Number(x[2]));
    d = iso(t) === `${year}-${x[1]}-${x[2]}` ? iso(t) : null;
  } else if (base === "easter") d = easter(year);
  else if ((x = /^day (\d{1,3})$/.exec(base))) d = Number(x[1]) >= 1 && Number(x[1]) <= 366 ? addDays(`${year}-01-01`, Number(x[1]) - 1) : null;
  else if ((x = /^(\w+) (\w+) of (\w+)$/.exec(base)) && NTH[x[1]] && WEEKDAYS.includes(x[2]) && MONTHS.includes(x[3])) d = nthWeekday(year, MONTHS.indexOf(x[3]), WEEKDAYS.indexOf(x[2]), NTH[x[1]]);
  return d && m[2] ? addDays(d, Number(m[2])) : d;
}

/** A curated entry's {start, end} in each year: the organiser's date for that year, its one-off date, or its rule. */
function occurrences(e, years) {
  return years.map((y) => {
    const start = (e.dates && e.dates[y]) || (e.date ? (String(e.date).startsWith(y + "-") ? e.date : null) : e.rule ? ruleDate(e.rule, y) : null);
    return start ? { start, end: addDays(start, Math.max(1, int(e.days, 1)) - 1) } : null;
  }).filter(Boolean);
}

function expand(cc, regions) {
  return [].concat(cc || []).flatMap((c) => (regions[c] ? regions[c] : [String(c).toUpperCase()]));
}

/** The next business day after `date` in a country: no weekend, no public holiday. */
function nextBusinessDay(date, holidaySet) {
  let d = addDays(date, 1);
  while (weekend(d) || (holidaySet && holidaySet.has(d))) d = addDays(d, 1);
  return d;
}

/** Every date in the window for the target markets, holidays grouped by date and name across countries (pure, for the tests). */
function build(input) {
  const i = input || {};
  const data = i.data || DATA;
  const today = i.today;
  const horizon = i.horizon || HORIZON;
  const last = addDays(today, horizon);
  const targets = Array.from(new Set((i.targets || []).map((c) => String(c).toUpperCase())));
  const isTarget = new Set(targets);
  const holidays = i.holidays || {};
  const sets = {};
  Object.keys(holidays).forEach((cc) => { sets[cc] = new Set(holidays[cc].map((h) => h.date)); });

  const groups = new Map();
  targets.forEach((cc) => (holidays[cc] || []).forEach((h) => {
    if (h.date < today || h.date > last) return;
    const key = h.date + "|" + h.name;
    const g = groups.get(key) || { id: "holiday:" + h.date + ":" + text(h.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-"), date: h.date, kind: "holiday", name: h.name, ccs: [], local: {}, after: {} };
    g.ccs.push(cc);
    if (h.local && h.local !== h.name) g.local[cc] = h.local;
    g.after[cc] = nextBusinessDay(h.date, sets[cc]);
    groups.set(key, g);
  }));
  const items = Array.from(groups.values()).map((g) => Object.assign(g, {
    cc: g.ccs[0], all: false, weekend: weekend(g.date), daysAway: diffDays(today, g.date), lead: null, do: null, source: data.sources && data.sources.nager,
    why: "Public holiday: offices, universities and many companies are closed; email sent that day waits for the next business day.",
    action: weekend(g.date) ? "Falls on a weekend: nothing to change." : "Hold sends to these countries that day: a campaign with half its leads there pauses and resumes the next business day."
  }));

  const ty = Number(today.slice(0, 4));
  (data.dates || []).forEach((e) => {
    const all = e.cc === "ALL";
    const ccs = all ? [] : Array.from(new Set(expand(e.cc, data.regions || {}))).filter((c) => isTarget.has(c));
    if (!all && !ccs.length) return;
    occurrences(e, [ty - 1, ty, ty + 1]).forEach((o) => {
      if (o.end < today || o.start > last) return;
      // A listed public holiday only stands in for a country Nager.Date has none for.
      const keep = e.kind === "religious" ? ccs.filter((c) => !(sets[c] && sets[c].has(o.start)))
        : e.kind === "holiday" ? ccs.filter((c) => !(holidays[c] && holidays[c].length)) : ccs;
      if (!all && !keep.length) return;
      const row = {
        id: e.id + ":" + o.start, ref: e.id, date: o.start, end: o.end !== o.start ? o.end : null, kind: KINDS.includes(e.kind) ? e.kind : "event",
        name: e.name, cc: all ? "ALL" : keep[0], ccs: keep, all, daysAway: Math.max(0, diffDays(today, o.start)), ongoing: o.start < today,
        lead: e.lead || null, do: e.do || null, why: e.why || "", action: e.action || "", source: (data.sources && data.sources[e.source]) || null
      };
      if (e.kind === "holiday") Object.assign(row, { local: {}, weekend: weekend(o.start), after: Object.fromEntries(keep.map((c) => [c, nextBusinessDay(o.end, sets[c])])) });
      items.push(row);
    });
  });
  const order = (k) => KINDS.indexOf(k);
  items.sort((a, b) => (a.ongoing ? today : a.date).localeCompare(b.ongoing ? today : b.date) || order(a.kind) - order(b.kind) || a.name.localeCompare(b.name));

  const byCountry = {};
  targets.forEach((cc) => {
    const list = items.filter((d) => !d.all && d.ccs.includes(cc)).slice(0, 5)
      .map((d) => ({ date: d.date, end: d.end || null, kind: d.kind, name: (d.local && d.local[cc]) || d.name, daysAway: d.daysAway, why: d.why, action: d.action, after: (d.after && d.after[cc]) || null }));
    if (list.length) byCountry[cc] = list;
  });
  const kinds = {};
  items.forEach((d) => { kinds[d.kind] = (kinds[d.kind] || 0) + 1; });
  return { today, horizon, days: items, byCountry, kinds, settings: cleanSettings(i.settings), pauses: i.pauses || [], missing: i.missing || [] };
}

// --- Nager.Date ---------------------------------------------------------------------------------------------------

async function nager(fetch, year, cc) {
  const res = await fetch(NAGER + year + "/" + cc, { signal: AbortSignal.timeout(8000) });
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error("Nager.Date answered " + res.status);
  const list = await res.json().catch(() => null);
  if (!Array.isArray(list) || !list.length) return null;
  return list.filter((h) => h && h.date && h.global !== false && (!Array.isArray(h.types) || h.types.includes("Public")))
    .map((h) => ({ date: String(h.date).slice(0, 10), name: text(h.name, 80), local: text(h.localName, 80) }));
}

/** Public holidays per target country for the years, from jarvis_holidays/<year>, asking Nager only for what is missing or a month old. */
async function holidays(ctx, years, targets) {
  const byCc = {};
  const none = new Set();
  let failed = 0;
  for (const year of years) {
    const ref = ctx.db.collection(HOLIDAYS).doc(String(year));
    const snap = await ref.get().catch(() => null);
    const saved = snap && snap.exists ? snap.data() : {};
    const countries = Object.assign({}, saved.countries || {});
    const missing = new Set(saved.none || []);
    const stale = !saved.at || ctx.now - Date.parse(saved.at) > REFRESH;
    const want = targets.filter((cc) => stale || (!countries[cc] && !missing.has(cc)));
    let fetched = 0, misses = 0;
    for (let n = 0; n < want.length; n += 8) {
      await Promise.all(want.slice(n, n + 8).map(async (cc) => {
        try {
          const rows = await nager(ctx.fetch, year, cc);
          fetched++;
          if (rows) { countries[cc] = rows; missing.delete(cc); } else { delete countries[cc]; missing.add(cc); }
        } catch (error) { misses++; }
      }));
    }
    failed += misses;
    if (fetched) await ref.set({ at: stale && !misses ? new Date(ctx.now).toISOString() : saved.at || new Date(ctx.now).toISOString(), countries, none: Array.from(missing).sort() }).catch(() => null);
    targets.forEach((cc) => {
      if (countries[cc]) byCc[cc] = (byCc[cc] || []).concat(countries[cc]);
      else if (missing.has(cc)) none.add(cc);
    });
  }
  return { byCc, missing: Array.from(none).sort(), failed };
}

async function readPauses(db) {
  const snap = await db.collection(PAUSES).where("open", "==", true).limit(100).get().catch(() => null);
  return snap ? snap.docs.map((doc) => doc.data()).sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
}

async function source(ctx) {
  const { readTargets, DEFAULT_TARGETS } = require("./jarvis-geo");
  const saved = await readTargets(ctx.db);
  const targets = saved.length ? saved : DEFAULT_TARGETS;
  const today = bogotaDay(ctx.now);
  const year = Number(today.slice(0, 4));
  const [hol, pauses] = await Promise.all([holidays(ctx, [year, year + 1], targets), readPauses(ctx.db)]);
  const notes = [];
  if (hol.failed) notes.push(`Nager.Date did not answer for ${hol.failed} country-years; their public holidays are missing until the next refresh.`);
  if (hol.missing.length) notes.push(`Nager.Date has no public holidays for ${hol.missing.length} target markets: ${hol.missing.join(", ")}; only the national holidays in Jarvis's list show for them.`);
  const out = build({ today, targets, holidays: hol.byCc, settings: ctx.settings && ctx.settings.calendar, pauses, missing: hol.missing });
  return Object.assign({ ok: true, needs: [], notes }, out);
}

// --- pauses over holidays -------------------------------------------------------------------------------------------

const warnAt = (d, s) => Math.min(HORIZON, Math.max(s.warnDays, Number(d.lead) || 0));

/** What the daily job does today: pauses that start, pauses that end, and the dates to remind about (pure). */
function dailyPlan(input) {
  const i = input || {};
  const s = cleanSettings(i.settings);
  const today = i.today;
  const rows = {};
  ((i.geo && i.geo.countries) || []).forEach((r) => { rows[r.cc] = r; });
  const pauses = i.pauses || [];
  const known = new Set(pauses.map((p) => p.id));
  const days = ((i.calendar && i.calendar.days) || []).map((d) => Object.assign({}, d, { daysAway: diffDays(today, d.date) }));
  const pause = [], expire = [];
  pauses.filter((p) => p.status === "planned" && p.date <= today).forEach((p) => (p.resumeOn > today ? pause : expire).push(p));
  if (s.autoPause) days.filter((d) => d.kind === "holiday" && d.date === today && !weekend(d.date)).forEach((d) => d.ccs.forEach((cc) => {
    const id = cc + "-" + d.date;
    const campaigns = heldCampaigns(rows[cc], i.campaigns);
    if (known.has(id) || !campaigns.length) return;
    known.add(id);
    pause.push({ id, cc, date: d.date, name: (d.local && d.local[cc]) || d.name, country: (rows[cc] && rows[cc].name) || cc, campaigns, resumeOn: (d.after && d.after[cc]) || nextBusinessDay(d.date), by: "auto", status: "planned" });
  }));
  const resume = pauses.filter((p) => p.status === "paused" && p.resumeOn <= today);
  const remind = days.filter((d) => !d.ongoing && d.daysAway > 0 && (d.daysAway === warnAt(d, s) || d.daysAway === s.remindDays) && (d.kind === "holiday"
    ? !weekend(d.date) && d.ccs.some((cc) => heldCampaigns(rows[cc], i.campaigns).length) : !!d.do));
  return { settings: s, pause, resume, expire, remind };
}

const dayLabel = (d) => new Date(utc(d) + 12 * 3600 * 1000).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const names = (list) => list.map((c) => c.name).join(", ");

function remindMessage(list, today) {
  if (!list.length) return null;
  const line = (d) => `${d.name}${d.all ? "" : " (" + d.ccs.slice(0, 4).join(", ") + (d.ccs.length > 4 ? " +" + (d.ccs.length - 4) : "") + ")"} in ${d.daysAway} ${d.daysAway === 1 ? "day" : "days"}${d.action ? ": " + d.action : ""}`;
  return { kind: "briefing", tab: "geo", tag: "jarvis-calendar-" + today, title: text(`Dates ahead: ${list[0].name}${list.length > 1 ? " and " + (list.length - 1) + " more" : ""}`, 120), body: text(list.slice(0, 4).map(line).join(" · "), 400) };
}

function pauseMessage(done, resumed) {
  if (!done.length && !resumed.length) return null;
  const parts = done.map((p) => `${names(p.campaigns)} for ${p.name} in ${p.country || p.cc}, back ${dayLabel(p.resumeOn)}`).concat(resumed.map((p) => `${names(p.campaigns)} resumed after ${p.name} (${p.cc})`));
  return { kind: "outreach", tab: "geo", tag: "jarvis-calendar-pause", title: text(done.length ? `Paused ${done.reduce((n, p) => n + p.campaigns.length, 0)} campaign(s) for a holiday` : "Campaigns resumed after a holiday", 120), body: text(parts.join(" · "), 400) };
}

/* Runs one pause or resume through ops.campaign(id, "pause" | "activate"), saves the row and logs each campaign to
   Jarvis actions. A campaign another open pause still holds stays paused. */
async function apply(ctx, row, action, extra) {
  const { db, now, ops } = ctx;
  const held = new Set();
  if (action === "activate") (await readPauses(db)).filter((p) => p.id !== row.id && p.status === "paused" && p.resumeOn > bogotaDay(now)).forEach((p) => (p.campaigns || []).forEach((c) => held.add(c.id)));
  const ok = [], failed = [];
  for (const c of row.campaigns || []) {
    if (held.has(c.id)) continue;
    try { await ops.campaign(c.id, action); ok.push(c); } catch (error) { failed.push(c.name + ": " + text(error.message || error, 120)); }
  }
  const status = action === "pause" ? (ok.length ? "paused" : "failed") : "resumed";
  const at = new Date(now).toISOString();
  const doc = Object.assign({}, row, extra || {}, { status, open: status === "paused" || status === "planned", detail: failed.join("; ") || null }, action === "pause" ? { pausedAt: at } : { resumedAt: at });
  await db.collection(PAUSES).doc(row.id).set(doc, { merge: true });
  await ops.log({ action: action === "pause" ? "calendar-pause" : "calendar-resume", status: ok.length || !failed.length ? "done" : "failed", count: ok.length,
    target: text(`${names(row.campaigns)} · ${row.cc} ${row.date}`, 200), detail: text(action === "pause" ? `${row.name}; resumes ${row.resumeOn}.` : `After ${row.name}.` + (failed.length ? " Failed: " + failed.join("; ") : ""), 400) });
  return Object.assign(doc, { done: ok.length, failed: failed.length });
}

/** The daily job (jarvisDaily): planned and automatic holiday pauses, resumes on the next business day, and the reminder push. */
async function runDaily(ctx, input) {
  const plan = dailyPlan(input);
  const done = [], resumed = [];
  for (const p of plan.expire) await ctx.db.collection(PAUSES).doc(p.id).set({ status: "expired", open: false }, { merge: true });
  for (const p of plan.pause) {
    if (p.by === "auto") {
      const prior = await ctx.db.collection(PAUSES).doc(p.id).get();
      if (prior.exists && prior.data().status === "cancelled") continue;
    }
    const row = await apply(Object.assign({}, ctx, { ops: Object.assign({}, ctx.ops, { log: (e) => ctx.ops.log(Object.assign({ mode: p.by === "auto" ? "auto" : "click", by: p.by === "auto" ? "jarvis" : p.by }, e)) }) }), p, "pause");
    if (row.done) done.push(row);
  }
  for (const p of plan.resume) {
    const row = await apply(Object.assign({}, ctx, { ops: Object.assign({}, ctx.ops, { log: (e) => ctx.ops.log(Object.assign({ mode: "auto" }, e)) }) }), p, "activate");
    resumed.push(row);
  }
  const messages = [pauseMessage(done, resumed), remindMessage(plan.remind, input.today)].filter(Boolean);
  for (const m of messages) await ctx.ops.push(m);
  return { paused: done.length, resumed: resumed.length, expired: plan.expire.length, reminded: plan.remind.length, pushed: messages.length };
}

const KEY = /^calendar:(pause|resume):([A-Z]{2}):(\d{4}-\d{2}-\d{2})$/;

/* A proposal's button (action-run calendar-pause / calendar-resume, the key in body.proposal): a pause today runs at
   once, a later one is planned for the daily job; resume runs at once. */
async function clickAction(ctx, body, input) {
  const m = KEY.exec(String((body && body.proposal) || body.key || ""));
  if (!m) throw new Error("Which country and date? The proposal key is missing.");
  const [, kind, cc, date] = m;
  const today = bogotaDay(ctx.now);
  const id = cc + "-" + date;
  const ref = ctx.db.collection(PAUSES).doc(id);
  const snap = await ref.get();
  const saved = snap.exists ? snap.data() : null;
  if (kind === "resume") {
    if (saved && saved.status === "planned") {
      await ref.set({ status: "cancelled", open: false, cancelledBy: ctx.by || "", cancelledAt: new Date(ctx.now).toISOString() }, { merge: true });
      await ctx.ops.log({ action: "calendar-resume", status: "done", count: 0, target: text(`${names(saved.campaigns)} · ${cc} ${date}`, 200), detail: `Planned pause for ${saved.name} cancelled; the campaigns keep sending.` });
      return { action: "calendar-resume", done: 0, note: `The pause for ${saved.name} is cancelled; ${names(saved.campaigns)} keep sending.` };
    }
    if (!saved || saved.status !== "paused") throw new Error("Nothing is paused for that holiday.");
    const row = await apply(ctx, saved, "activate", { resumedBy: ctx.by || "" });
    return { action: "calendar-resume", done: row.done, failed: row.failed, ran: names(saved.campaigns) + " resumed" };
  }
  if (saved && (saved.status === "planned" || saved.status === "paused")) return { action: "calendar-pause", done: 0, note: `Already ${saved.status} for ${saved.name}.` };
  const day = ((input.calendar && input.calendar.days) || []).find((d) => d.kind === "holiday" && d.date === date && (d.ccs || []).includes(cc));
  if (!day) throw new Error(`No public holiday on ${date} in ${cc}.`);
  if (date < today) throw new Error("That holiday has passed.");
  const row = ((input.geo && input.geo.countries) || []).find((r) => r.cc === cc);
  const campaigns = heldCampaigns(row, input.campaigns);
  if (!campaigns.length) throw new Error(`No sending campaign has half its leads in ${cc}.`);
  const plan = { id, cc, date, name: (day.local && day.local[cc]) || day.name, country: (row && row.name) || cc, campaigns, resumeOn: (day.after && day.after[cc]) || nextBusinessDay(date), by: ctx.by || "", plannedAt: new Date(ctx.now).toISOString() };
  if (date === today) {
    const out = await apply(ctx, plan, "pause");
    return { action: "calendar-pause", done: out.done, failed: out.failed, ran: `${names(campaigns)} paused; back ${dayLabel(plan.resumeOn)}` };
  }
  await ref.set(Object.assign({}, plan, { status: "planned", open: true }));
  await ctx.ops.log({ action: "calendar-pause", status: "waiting", count: campaigns.length, target: text(`${names(campaigns)} · ${cc} ${date}`, 200), detail: `Planned for ${plan.name}; resumes ${plan.resumeOn}.` });
  return { action: "calendar-pause", done: campaigns.length, note: `${names(campaigns)} will pause on ${dayLabel(date)} for ${plan.name} and resume ${dayLabel(plan.resumeOn)}.` };
}

module.exports = { DATA, HORIZON, SHARE, DEFAULTS, KINDS, PAUSES, HOLIDAYS, cleanSettings, easter, nthWeekday, ruleDate, occurrences, nextBusinessDay, build, holidays, readPauses, source, heldCampaigns, dailyPlan, remindMessage, pauseMessage, runDaily, clickAction, bogotaDay, diffDays, warnAt };
