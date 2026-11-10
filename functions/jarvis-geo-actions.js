/* Jarvis Map: 90-day plan progress and next best actions (#3115), added to the geo source (jarvis-geo.js) and so to
   the snapshot and Ask.

   plan      the private 90-day plan (jarvis_settings/outreach, planNow in jarvis-outreach.js) as counts only: day N,
             the phase, the next milestone, the nearest deadlines, this week against the weekly funnel targets and the
             plan so far against the 90-day targets (as jarvis-targets.js counts and judges them), each ahead, on
             track or behind. Phase, milestone and deadline names are the ones the outreach source already shows.
   actions   what to do next, from rules over the country rows and gaps, prospects left, special dates (the calendar's
             warn and remind days) and the plan targets that are behind. Each has one button that reuses a Map
             action: pause or activate a campaign, open the country to queue prospects, confirm a Live Report's
             country, make a target market, pause for a holiday, copy a link, run the sweep.
   ai        Gemini's order of those actions and one line on top, kept in jarvis_cache/geo-actions-ai. The hourly
             jarvisWatch asks again when the rule set changes or the answer is a day old, so a snapshot never waits on
             Gemini. Without an answer for this exact rule set (another range, a failed call) the rules' order stands
             and there is no line.

   Twins: js/admin-jarvis-geo-actions.js and android/.../ui/GeoActions.kt. */

const crypto = require("crypto");
const { regionCountries } = require("./jarvis-geo");
const { weekStart } = require("./jarvis-outreach");
const { parseJson } = require("./jarvis-proposals");

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const AI_DOC = "geo-actions-ai";
const AI_FRESH = 22 * HOUR;
const AI_RETRY = 3 * HOUR;
const AI_KEEP = 36 * HOUR;
const SHOWN = 12;
const MIN_SENT = 50;
const DATES = { warnDays: 14, remindDays: 3 };
// The weekly funnel targets a plan may set (scripts/jarvis-outreach-plan.js): [key, label, unit].
const WEEKLY = [["prospects", "Prospects reviewed", ""], ["liveReportPct", "Reviewed with a Live Report", "%"], ["openPct", "Open rate", "%"], ["replyPct", "Reply rate", "%"], ["positivePct", "Positive replies", "%"]];
// Rule order: the first kinds cost money or reputation soonest.
const ORDER = ["date-soon", "bouncing", "no-prospects-left", "plan-week", "target", "low-reply", "saturation", "no-campaign", "confirm", "date-ahead", "visitors-no-outreach", "silent"];
const HIGH = new Set(["date-soon", "bouncing", "no-prospects-left"]);
const LOW = new Set(["date-ahead", "visitors-no-outreach", "silent"]);
const ACTIVE = /^(active|running subsequences)$/;
const IDLE = /^(draft|paused)$/;

const round1 = (n) => Math.round(n * 10) / 10;
const text = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const pct = (a, b) => (b ? round1((a / b) * 100) : null);
const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const inDays = (d) => (d <= 0 ? "today" : d === 1 ? "tomorrow" : "in " + d + " days");

/** A count against its weekly target, with one day's grace: ahead once met, behind when well under the week's pace. */
function countStatus(actual, target, share) {
  if (actual === null || actual === undefined || !target) return "no-data";
  if (actual >= target) return "ahead";
  return actual >= target * Math.max(0, share - 1 / 7) * 0.85 ? "on-track" : "behind";
}

/** A rate against its target: ahead 20% over it, on track from 90% of it. */
function rateStatus(actual, target) {
  if (actual === null || actual === undefined || !target) return "no-data";
  return actual >= target * 1.2 ? "ahead" : actual >= target * 0.9 ? "on-track" : "behind";
}

/** A 90-day target as jarvis-targets.js judged it (done, on-pace, behind, missed, waiting), in the Map's words. */
function totalStatus(t) {
  if (t.status === "done") return "done";
  if (t.status === "behind" || t.status === "missed") return "behind";
  if (t.status === "waiting") return "waiting";
  return t.expected > 0 && t.actual >= t.expected * 1.15 ? "ahead" : "on-track";
}

/** The plan's progress in counts: day, phase, next milestone, nearest deadlines, this week and the 90 days so far. */
function planProgress(outreach, targets, now) {
  const p = outreach && outreach.plan;
  if (!p || p.ok === false || !p.start) return null;
  const pipe = outreach.pipeline && outreach.pipeline.ok !== false ? outreach.pipeline : null;
  const mail = outreach.instantly && outreach.instantly.ok !== false ? outreach.instantly : null;
  const rates = (mail && mail.rates) || {};
  const share = Math.min(1, Math.max(0, (now - weekStart(now)) / (7 * DAY)));
  const actual = {
    prospects: pipe ? Number(pipe.thisWeek) || 0 : null,
    liveReportPct: pipe ? pct(Number(pipe.reviewedWithLiveReport) || 0, Math.max(1, pipe.reviewedHosts === undefined ? Number(pipe.swept) || 0 : Number(pipe.reviewedHosts) || 0)) : null,
    openPct: mail && mail.contacted && mail.openTracking !== false ? rates.open : null,
    replyPct: mail && mail.contacted ? rates.reply : null,
    positivePct: mail && mail.contacted ? rates.positive : null
  };
  const weekly = p.weekly || {};
  const week = WEEKLY.filter(([key]) => Number(weekly[key]) > 0).map(([key, label, unit]) => {
    const target = Number(weekly[key]);
    const a = actual[key] === undefined ? null : actual[key];
    return { key, label, unit, actual: a, target, status: unit ? rateStatus(a, target) : countStatus(a, target, share) };
  });
  const length = Math.max(1, Number(p.length) || 90);
  const day = Math.max(0, Number(p.day) || 0);
  const judged = targets && targets.ok !== false && Array.isArray(targets.targets) ? targets.targets : null;
  const total = (judged || p.targets || []).map((t) => {
    const target = Number(t.target) || 0;
    const a = t.actual === null || t.actual === undefined ? null : Number(t.actual) || 0;
    const expected = judged ? Number(t.expected) || 0 : round1(target * Math.min(1, day / length));
    const status = judged ? totalStatus(Object.assign({}, t, { actual: a, expected }))
      : a === null ? "no-data" : target && a >= target ? "done" : day <= 7 ? "on-track" : a + Math.max(0.5, target * 0.15) < expected ? "behind" : a >= expected * 1.15 ? "ahead" : "on-track";
    const row = { key: String(t.key), label: text(t.label || t.key, 60), actual: a, target, expected, status };
    if (judged && t.perWeek !== undefined) row.perWeek = t.perWeek;
    return row;
  });
  const seen = week.concat(total).map((r) => r.status).filter((s) => s !== "no-data" && s !== "waiting");
  const status = !seen.length ? "no-data" : seen.includes("behind") ? "behind" : seen.every((s) => s === "ahead" || s === "done") ? "ahead" : "on-track";
  return {
    day, length, weekShare: Math.round(share * 100),
    phase: p.phase ? { name: text(p.phase.name, 60), end: p.phase.end, daysLeft: p.phase.daysLeft } : null,
    next: p.next ? { date: p.next.date, label: text(p.next.label, 80), daysLeft: p.next.daysLeft } : null,
    deadlines: (p.deadlines || []).filter((d) => d.daysLeft >= 0).slice(0, 3).map((d) => ({ date: d.date, label: text(d.label, 80), daysLeft: d.daysLeft })),
    week, total, status
  };
}

const campaignDo = (type, c) => ({ type, label: (type === "pause" ? "Pause " : "Activate ") + text(c.name, 40), id: c.id, name: text(c.name, 60), leads: Number(c.leads) || 0, start: c.start || "" });
const openDo = (r, label) => ({ type: "open", label: label || "Open " + r.name, cc: r.cc });

/** The next best actions in the rules' order: each { id, kind, cc, name, level, title, why, weight, do }. Pure. */
function nextActions(input) {
  const i = input || {};
  const g = i.geo || {};
  const rows = g.countries || [];
  const by = {};
  rows.forEach((r) => { by[r.cc] = r; });
  const camps = i.campaigns || [];
  const merged = (c) => Object.assign({}, c, camps.find((m) => m.id === c.id) || {});
  const lead = (r, status) => (r.camps || []).map(merged).filter((c) => status.test(c.status || "")).sort((a, b) => (b.share || 0) - (a.share || 0))[0] || null;
  const d = Object.assign({}, DATES, i.dates);
  const avg = (g.totals && g.totals.avgReply) || null;
  const out = [];
  const add = (a) => out.push(Object.assign({ cc: "", name: "" }, a, { title: text(a.title, 90), why: text(a.why, 200), weight: round1(Number(a.weight) || 0) }));

  (g.gaps || []).forEach((x) => {
    const r = by[x.cc];
    if (!r || x.kind === "silent") return;
    const base = { id: x.kind + ":" + r.cc, kind: x.kind, cc: r.cc, name: r.name, weight: x.weight };
    if (x.kind === "no-prospects-left") {
      const c = lead(r, ACTIVE);
      add(Object.assign(base, { title: "Queue prospects in " + r.name, why: "Every prospect is swept while " + (c ? c.name : "a campaign") + " sends there" + (r.sent ? " (" + fmt(r.sent) + " sent)" : ""), do: openDo(r, "Queue prospects") }));
    } else if (x.kind === "bouncing") {
      const c = lead(r, ACTIVE);
      add(Object.assign(base, { title: c ? "Pause " + c.name + ((c.share || 100) < 100 ? " in " + r.name : "") : "Check the bounces in " + r.name, why: x.text + "; over 5% puts the sending domain at risk", do: c ? campaignDo("pause", c) : openDo(r) }));
    } else if (x.kind === "low-reply") {
      const c = lead(r, ACTIVE);
      add(Object.assign(base, { title: "Rework the emails for " + r.name, why: r.replyRate + "% replies over " + fmt(r.sent) + " sent, against " + avg + "% on average", do: c ? campaignDo("pause", c) : openDo(r) }));
    } else if (x.kind === "no-campaign") {
      const draft = camps.find((c) => IDLE.test(c.status || "") && regionCountries(c.region, c.lang).includes(r.cc));
      add(Object.assign(base, { title: draft ? "Activate " + draft.name + " for " + r.name : "Start a campaign for " + r.name, why: x.text, do: draft ? campaignDo("activate", draft) : openDo(r) }));
    } else if (x.kind === "visitors-no-outreach") {
      add(Object.assign(base, r.target ? { title: "Queue prospects in " + r.name, why: x.text, do: openDo(r, "Queue prospects") }
        : { title: "Make " + r.name + " a target market", why: x.text, do: { type: "target", label: "Make a target", cc: r.cc, on: true } }));
    }
  });

  // Silent target markets: the ones that speak the language of the best-replying country first.
  const silent = rows.filter((r) => (r.gaps || []).includes("silent"));
  if (silent.length) {
    const talking = rows.filter((r) => r.sent >= MIN_SENT && r.replyRate > 0);
    const peerOf = (r) => talking.filter((t) => t.langs.some((l) => r.langs.includes(l))).sort((a, b) => b.replyRate - a.replyRate)[0] || null;
    const picks = silent.map((r) => ({ r, peer: peerOf(r) })).filter((x) => x.peer).sort((a, b) => b.peer.replyRate - a.peer.replyRate || a.r.cc.localeCompare(b.r.cc)).slice(0, 2);
    picks.forEach(({ r, peer }) => add({ id: "silent:" + r.cc, kind: "silent", cc: r.cc, name: r.name, weight: peer.replyRate, title: "Queue prospects in " + r.name,
      why: "Speaks " + r.langs.filter((l) => peer.langs.includes(l)).join(", ") + " like " + peer.name + " (" + peer.replyRate + "% replies); " + silent.length + " target markets have no activity", do: openDo(r, "Queue prospects") }));
    if (!picks.length) add({ id: "silent:all", kind: "silent", cc: silent[0].cc, name: silent[0].name, weight: silent.length, title: silent.length + " target markets have no activity",
      why: "Queue prospects in one, or drop the ones you will not work this quarter", do: openDo(silent[0]) });
  }

  rows.forEach((r) => {
    if (r.active && r.left > 0 && r.prospects >= 10 && r.swept / r.prospects >= 0.8) {
      const c = lead(r, ACTIVE);
      add({ id: "saturation:" + r.cc, kind: "saturation", cc: r.cc, name: r.name, weight: Math.round((r.swept / r.prospects) * 100), title: "Queue more prospects in " + r.name,
        why: Math.round((r.swept / r.prospects) * 100) + "% of " + fmt(r.prospects) + " prospects swept, " + fmt(r.left) + " left while " + (c ? c.name : "a campaign") + " sends", do: openDo(r, "Queue prospects") });
    }
    const n = r.daysToDate;
    if (!r.nextDate || n === null || n === undefined || n > d.warnDays || !(r.campaigns || r.prospects)) return;
    const soon = n <= d.remindDays;
    const dn = text(r.nextDate.name, 60);
    const base = { id: (soon ? "date-soon:" : "date-ahead:") + r.cc + ":" + r.nextDate.date, kind: soon ? "date-soon" : "date-ahead", cc: r.cc, name: r.name, weight: d.warnDays - n };
    if (r.nextDate.kind === "holiday" && r.active) {
      add(Object.assign(base, { title: "Pause " + r.name + "'s campaigns for " + dn, why: dn + " is " + inDays(n) + "; " + r.active + (r.active === 1 ? " campaign sends" : " campaigns send") + " there",
        do: { type: "calendar-pause", label: "Pause that day", cc: r.cc, date: r.nextDate.date, name: dn } }));
    } else {
      add(Object.assign(base, { title: "Plan around " + dn + " in " + r.name, why: (r.nextDate.kind || "date").replace(/^./, (ch) => ch.toUpperCase()) + " " + inDays(n) + (r.active ? ", while campaigns send there" : ""), do: openDo(r) }));
    }
  });

  const waiting = (g.totals && g.totals.confirm) || 0;
  if (waiting) {
    const first = (g.confirm || []).find((c) => c.cc);
    add(first ? { id: "confirm:queue", kind: "confirm", weight: waiting, title: "Confirm " + first.host + " as " + first.name, why: Math.round((first.confidence || 0) * 100) + "% sure from " + fmt(first.reports) + " report" + (first.reports === 1 ? "" : "s") + "; " + fmt(waiting) + " Live Reports wait for a country", do: { type: "confirm", label: "Confirm", host: first.host, cc: first.cc, name: first.name } }
      : { id: "confirm:queue", kind: "confirm", weight: waiting, title: "Confirm " + fmt(waiting) + " Live Report countries", why: "The country finder was unsure of them, so their pages wait", do: { type: "jump", label: "Open the list", panel: "geo-confirm" } });
  }

  const plan = i.plan;
  if (plan) {
    const worst = rows.filter((r) => r.sent >= MIN_SENT && r.replyRate !== null).sort((a, b) => a.replyRate - b.replyRate)[0];
    const behind = plan.week.filter((w) => w.status === "behind");
    const short = (w) => (w.target ? round1(100 - ((w.actual || 0) / w.target) * 100) : 0);
    const sweepWeek = behind.find((w) => w.key === "prospects");
    if (sweepWeek) add({ id: "plan-week:prospects", kind: "plan-week", weight: short(sweepWeek), title: "Review more prospects this week",
      why: fmt(sweepWeek.actual) + " of " + fmt(sweepWeek.target) + " reviewed with " + plan.weekShare + "% of the week gone", do: { type: "run", label: "Run the sweep now", job: "sweepReviews" } });
    const rates = behind.filter((w) => /^(openPct|replyPct|positivePct)$/.test(w.key));
    if (rates.length && worst) add({ id: "plan-week:rates", kind: "plan-week", cc: worst.cc, name: worst.name, weight: Math.max(...rates.map(short)),
      title: rates.length === 1 ? "Lift the " + rates[0].label.toLowerCase() : rates.some((w) => w.key === "openPct") ? "Lift the open and reply rates" : "Lift the reply rates",
      why: rates.map((w) => w.label + " " + w.actual + "% against " + w.target + "%").join(", ") + "; " + worst.name + " is lowest at " + worst.replyRate + "% replies", do: openDo(worst) });
    const next = {};
    ((i.targets && i.targets.targets) || []).forEach((t) => { next[t.key] = (t.next || [])[0]; });
    plan.total.filter((t) => t.status === "behind").forEach((t) => {
      const n = next[t.key];
      add({ id: "target:" + t.key, kind: "target", weight: t.target ? round1(100 - ((t.actual || 0) / t.target) * 100) : 0, title: "Catch up on " + t.label.toLowerCase(),
        why: fmt(t.actual) + " of " + fmt(t.target) + " on day " + plan.day + " of " + plan.length + (t.perWeek !== undefined ? ", " + t.perWeek + " a week from here" : ", " + fmt(t.expected) + " expected by now"),
        do: n && n.copy ? { type: "copy", label: text(n.label, 40), copy: n.copy } : n && n.open ? { type: "link", label: text(n.label, 40), url: n.open } : { type: "jump", label: "See the plan", panel: "geo-plan" } });
    });
  }

  out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.weight - a.weight || a.id.localeCompare(b.id));
  // One button once: a second reason for the same campaign, target or holiday joins the first action's why.
  const keyOf = (a) => (/^(pause|activate|target|calendar-pause)$/.test(a.do.type) ? a.do.type + ":" + (a.do.id || a.do.cc) : "");
  const kept = [];
  out.forEach((a) => {
    const same = keyOf(a) && kept.find((k) => keyOf(k) === keyOf(a));
    if (same) same.why = text(same.why + "; " + a.why, 240);
    else kept.push(Object.assign(a, { level: HIGH.has(a.kind) ? "high" : LOW.has(a.kind) ? "low" : "mid" }));
  });
  return kept;
}

/** The rule set's fingerprint: the shown actions' ids, in any order. */
const hashOf = (list) => crypto.createHash("sha1").update(list.map((a) => a.id).sort().join("|")).digest("hex").slice(0, 10);

/** The shown actions in Gemini's order with its line when its answer is for this rule set and fresh, else the rules' order. */
function applyAi(list, ai, now) {
  const rows = list.slice(0, SHOWN);
  const hash = hashOf(rows);
  const base = { rows, total: list.length, hash, ranked: "rules", line: "", at: "" };
  const order = ai && Array.isArray(ai.order) ? ai.order : [];
  if (!order.length || ai.hash !== hash || !(now - Date.parse(ai.at) < AI_KEEP)) return base;
  const at = (a) => { const n = order.indexOf(a.id); return n < 0 ? order.length + rows.indexOf(a) : n; };
  return Object.assign(base, { rows: rows.slice().sort((a, b) => at(a) - at(b)), ranked: "gemini", line: text(ai.line, 160), at: ai.at });
}

function aiPrompt(rows, plan) {
  const ruled = rows.slice().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const p = plan ? { day: plan.day, length: plan.length, phase: plan.phase && plan.phase.name, status: plan.status,
    week: plan.week.map((w) => w.label + " " + (w.actual === null ? "—" : w.actual) + w.unit + " of " + w.target + w.unit + " (" + w.status + ")"),
    total: plan.total.map((t) => t.label + " " + (t.actual === null ? "—" : t.actual) + " of " + t.target + " (" + t.status + ")") } : null;
  return "These are the next actions Jarvis's rules found for Carlos's cold outreach by country (the Map tab), in the rules' order:\n"
    + JSON.stringify(ruled.map((a) => ({ id: a.id, title: a.title, why: a.why })))
    + (p ? "\n\nThe 90-day outreach plan, counts only: " + JSON.stringify(p) : "")
    + "\n\nOrder them best first by what moves replies, customers and revenue soonest; a holiday a few days away or a sending domain at risk comes early."
    + " Then write one line under 140 characters that names the first action and why, quoting a number from above. Keep every id exactly as given."
    + "\nAnswer with JSON only: {\"order\":[\"id\"],\"line\":\"\"}";
}

/** Gemini's answer checked against the actions: known ids only, each once, the ones it left out after in the rules' order. */
function parseAi(raw, rows) {
  const answer = parseJson(raw);
  const ids = new Set(rows.map((a) => a.id));
  const order = [];
  (Array.isArray(answer.order) ? answer.order : []).forEach((id) => { const k = String(id); if (ids.has(k) && !order.includes(k)) order.push(k); });
  if (!order.length) throw new Error("Gemini kept none of the actions.");
  rows.forEach((a) => { if (!order.includes(a.id)) order.push(a.id); });
  return { order, line: text(String(answer.line || "").replace(/[*_`#]/g, ""), 160) };
}

/** The hourly ask (jarvisWatch): Gemini ranks the actions when the rule set changed or the answer is old; deps { db, now, gemini }. */
async function refresh(deps, geo) {
  const g = geo && geo.ok !== false ? geo.actions : null;
  if (!g || !Array.isArray(g.rows)) return { saved: false, note: "no actions" };
  const ref = deps.db.collection("jarvis_cache").doc(AI_DOC);
  const was = await ref.get().then((s) => (s.exists ? s.data() : null)).catch(() => null);
  const age = was ? deps.now - Date.parse(was.at) : Infinity;
  if (was && was.hash === g.hash && age < (was.error ? AI_RETRY : AI_FRESH)) return { saved: false, note: "fresh" };
  const at = new Date(deps.now).toISOString();
  let row;
  if (!g.rows.length) row = { at, hash: g.hash, order: [], line: "", error: "" };
  else if (!deps.gemini) return { saved: false, note: "no Gemini key" };
  else {
    try { row = Object.assign({ at, hash: g.hash, error: "" }, parseAi(await deps.gemini(aiPrompt(g.rows, geo.plan), 700), g.rows)); }
    catch (error) { row = { at, hash: g.hash, order: [], line: "", error: text(error.message || error, 200) }; }
  }
  await ref.set(row);
  return { saved: true, note: row.error ? "rules order (" + row.error + ")" : "ranked " + row.order.length };
}

/** Adds plan and actions to the geo source's answer; extra { outreach, marketing, calendar, confirm } it already read. */
async function attach(ctx, out, extra) {
  const x = extra || {};
  const [targets, ai] = await Promise.all([
    ctx.peer ? ctx.peer("targets").then((o) => (o && o.ok !== false ? o : null)).catch(() => null) : null,
    ctx.db.collection("jarvis_cache").doc(AI_DOC).get().then((s) => (s.exists ? s.data() : null)).catch(() => null)
  ]);
  const now = ctx.now || Date.now();
  const plan = planProgress(x.outreach, targets, now);
  const campaigns = (x.marketing && x.marketing.campaigns && x.marketing.campaigns.ok !== false && x.marketing.campaigns.rows) || [];
  const list = nextActions({ geo: Object.assign({}, out, { confirm: x.confirm }), plan, targets, campaigns, dates: x.calendar && x.calendar.settings });
  out.plan = plan;
  out.actions = applyAi(list, ai, now);
  return out;
}

/** The plan and the next actions in a few hundred tokens, for askSnapshot. */
function askOf(g) {
  if (!g || g.ok === false || (!g.plan && !g.actions)) return null;
  const p = g.plan;
  const a = g.actions || {};
  return {
    plan: p ? {
      day: p.day, length: p.length, status: p.status, phase: p.phase && p.phase.name, next: p.next && p.next.label + " " + inDays(p.next.daysLeft),
      deadlines: p.deadlines.map((d) => d.label + " " + inDays(d.daysLeft)),
      thisWeek: p.week.map((w) => w.label + ": " + (w.actual === null ? "—" : w.actual + w.unit) + " of " + w.target + w.unit + ", " + w.status),
      toDate: p.total.map((t) => t.label + ": " + (t.actual === null ? "—" : t.actual) + " of " + t.target + ", " + t.status)
    } : null,
    nextActions: (a.rows || []).slice(0, 8).map((r) => r.title + ": " + r.why), line: a.line || null, rankedBy: a.ranked || null
  };
}

module.exports = { planProgress, nextActions, applyAi, hashOf, aiPrompt, parseAi, refresh, attach, askOf, countStatus, rateStatus, ORDER, AI_DOC, SHOWN };
