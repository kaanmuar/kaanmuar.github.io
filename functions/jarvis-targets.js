/* Jarvis 90-day targets (#2649): how far each target of the outreach plan (jarvis_settings/outreach) has come since
   the plan's start, whether it is done, on pace, behind or missed, and what Carlos logged by hand.

   unlocks   paid, non-refunded purchases over 0 USD: report unlocks, add-ons, run credits and monthly passes (a
             comped unlock is a "complete" review with paid true and no price, so it never counts)
   agencies  company email domains (not Gmail, Outlook and the like) with 3 or more of those purchases
   calls     calls booked on the site, not CV calls, once their time has passed
   clips     YouTube uploads whose tags or hashtags name a segment (education, agencies, startups)
   links     logged pages that link to carlosandmunoz.com or qalabreview.com; Jarvis rechecks them weekly
   any key   entries logged by hand add to the count (a call held on Zoom, a signed partnership, a talk)

   The hand-kept part lives in jarvis_settings/outreach-targets, apart from the plan, so a plan upload keeps it:
   entries [{ id, key, at, count, note, url, by, check }], fix { key: { value, at, by } } (the count was <value> at
   <at>; later rows add to it) and done { key: { at, by, proof } } (held done by hand). */

const dayRows = require("./jarvis-days");

const DAY = 24 * 60 * 60 * 1000;
const ORIGIN = "https://carlosandmunoz.com";
const SHORT = "https://qalabreview.com";
const DOC = "outreach-targets";
const MAX_ENTRIES = 600;
const RECHECK_MS = 7 * DAY;
const RECHECKS_PER_RUN = 8;
const STALE_MS = 14 * DAY;
const PER_DOMAIN = 3;
const REVENUE = { "paid-report": "Report unlock", "paid-addon": "Add-on", "run-credit": "Run credit", "monthly-pass": "Monthly pass" };
const OWN = new Set(["carlosandmunoz.com", "qalabreview.com"]);
const FREE_MAIL = new Set(("gmail.com googlemail.com outlook.com outlook.es hotmail.com hotmail.es hotmail.co.uk hotmail.fr hotmail.it live.com " +
  "live.com.mx msn.com yahoo.com yahoo.es yahoo.com.br yahoo.co.uk yahoo.fr yahoo.it ymail.com icloud.com me.com mac.com aol.com " +
  "proton.me protonmail.com pm.me gmx.com gmx.de gmx.net web.de mail.com yandex.com yandex.ru zoho.com bol.com.br uol.com.br " +
  "terra.com.br libero.it virgilio.it orange.fr free.fr laposte.net sfr.fr t-online.de qq.com 163.com").split(" "));
const SEGMENTS = [["education", /^(education|edu|edtech|universit(y|ies)|college|students?|teach(ers?|ing)|lecturers?|professors?|schools?)$/i],
  ["agencies", /^(agenc(y|ies)|marketing ?agenc(y|ies)|web ?agenc(y|ies))$/i], ["startups", /^(startups?|founders?|saas)$/i]];
const LINK_TO = /href\s*=\s*["']?(?:https?:)?\/\/(?:[a-z0-9-]+\.)*(carlosandmunoz\.com|qalabreview\.com)/i;

// How Jarvis counts each key, and the buttons that move it; a key the plan adds later is counted from what is logged.
const HOW = {
  unlocks: "Paid, non-refunded purchases since the plan started: report unlocks, add-ons, run credits and monthly passes.",
  agencies: `Company email domains (not Gmail, Outlook and the like) with ${PER_DOMAIN} or more paid purchases.`,
  calls: "Calls booked on the site (not CV calls) once their time has passed. Log calls booked another way.",
  clips: "YouTube uploads with #education, #agencies or #startups in the caption or tags. Log clips posted elsewhere.",
  links: "Log the page that links to us; Jarvis checks it links to carlosandmunoz.com or qalabreview.com and rechecks it weekly."
};
const MANUAL = "Logged by hand: press Log when one happens.";
const NEXT = {
  unlocks: [{ label: "Copy one-pager link", copy: SHORT + "/pdf" }],
  agencies: [{ label: "Copy booking link", copy: SHORT + "/call" }, { label: "Copy one-pager link", copy: SHORT + "/pdf" }],
  partnerships: [{ label: "Copy lecture slides link", copy: SHORT + "/lecture" }, { label: "Copy booking link", copy: SHORT + "/call" }],
  accelerators: [{ label: "Copy one-pager link", copy: SHORT + "/pdf" }],
  calls: [{ label: "Copy booking link", copy: SHORT + "/call" }],
  contracts: [{ label: "Copy booking link", copy: SHORT + "/call" }],
  talks: [{ label: "Copy lecture link", copy: SHORT + "/lecture" }, { label: "Copy webinar link", copy: SHORT + "/webinar" }],
  links: [{ label: "Copy link to share", copy: SHORT }],
  clips: [{ label: "Open YouTube Studio", open: "https://studio.youtube.com/" }]
};

const clean = (error) => String((error && error.message) || error || "failed").slice(0, 200);
const toMs = (v) => (v && typeof v.toDate === "function" ? v.toDate().getTime() : Date.parse(v || "") || 0);
const iso = (ms) => new Date(ms).toISOString();
const round1 = (n) => Math.round(n * 10) / 10;
const domainOf = (email) => String(email || "").toLowerCase().split("@")[1] || "";
const atNoon = (d) => Date.parse(d + "T12:00:00Z");

/** Day of the plan (1 on its start day) and its length in days. */
function planDays(plan, now) {
  return { day: Math.max(0, Math.floor((now - atNoon(plan.start)) / DAY) + 1), length: Math.round((atNoon(plan.end) - atNoon(plan.start)) / DAY) + 1 };
}

/** The segment a YouTube upload names in its tags or hashtags, or "". */
function segmentOf(video) {
  const words = [].concat(video.tags || [], String((video.title || "") + " " + (video.description || "")).match(/#[\p{L}\p{N}_]+/gu) || [])
    .map((w) => String(w).replace(/^#/, "").trim());
  const hit = SEGMENTS.find(([, re]) => words.some((w) => re.test(w)));
  return hit ? hit[0] : "";
}

/** Rows each auto-counted key is made of, newest first: { at, text, url? }. */
function autoRows({ reviews, bookings, videos, start, now }) {
  const paid = (reviews || []).filter((r) => r.paid === true && r.refunded !== true && !r.test && REVENUE[r.status] && (Number(r.priceUsd) || 0) > 0 && toMs(r.createdAt) >= start && toMs(r.createdAt) <= now)
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  const unlocks = paid.map((r) => {
    const usd = Math.round(((Number(r.priceUsd) || 0) - (Number(r.refundedUsd) || 0)) * 100) / 100;
    return { at: iso(toMs(r.createdAt)), text: [REVENUE[r.status], domainOf(r.email), usd ? usd + " USD" : ""].filter(Boolean).join(" · ") };
  });
  const byDomain = {};
  paid.forEach((r) => {
    const d = domainOf(r.email);
    if (!d || FREE_MAIL.has(d) || OWN.has(d)) return;
    (byDomain[d] = byDomain[d] || []).push(toMs(r.createdAt));
  });
  const agencies = Object.keys(byDomain).filter((d) => byDomain[d].length >= PER_DOMAIN)
    .map((d) => ({ at: iso(byDomain[d][PER_DOMAIN - 1]), text: d + " · " + byDomain[d].length + " purchases" }));
  const calls = (bookings || []).filter((b) => b.type !== "cv" && b.status !== "cancelled" && toMs(b.start) >= start && toMs(b.start) <= now)
    .map((b) => ({ at: iso(toMs(b.start)), text: [b.name, b.company || domainOf(b.email)].filter(Boolean).join(" · ") || "Booked call" }));
  const clips = (videos || []).filter((v) => toMs(v.published) >= start && toMs(v.published) <= now).map((v) => Object.assign({ seg: segmentOf(v) }, v))
    .filter((v) => v.seg).map((v) => ({ at: iso(toMs(v.published)), text: v.seg + " · " + String(v.title || "").slice(0, 120), url: "https://youtu.be/" + v.id }));
  const newest = (rows) => rows.sort((a, b) => toMs(b.at) - toMs(a.at));
  return { unlocks: newest(unlocks), agencies: newest(agencies), calls: newest(calls), clips: newest(clips) };
}

/** Where the target stands: done, on-pace, behind, missed or waiting, with the pace it needs from here. */
function judge(t, days, now) {
  const left = Math.max(0, t.target - t.actual);
  if (t.done || (t.target > 0 && t.actual >= t.target)) return { status: "done", left: 0 };
  if (days.day > days.length) return { status: "missed", left };
  if (days.day <= 0) return { status: "waiting", left };
  const expected = t.target * Math.min(1, days.day / days.length);
  const weeksLeft = Math.max(1, days.length - days.day + 1) / 7;
  const behind = days.day > 7 && t.actual + Math.max(0.5, t.target * 0.15) < expected;
  const stale = !t.auto && days.day > 14 && (!t.lastAt || now - toMs(t.lastAt) > STALE_MS);
  return { status: behind ? "behind" : "on-pace", left, expected: round1(expected), perWeek: round1(left / weeksLeft), stale };
}

/** Each plan target with its count, status, the rows behind it and its buttons. */
function build(plan, kept, auto, now) {
  const days = planDays(plan, now);
  const entries = (kept.entries || []).filter((e) => e && e.key);
  return (plan.targets || []).map((p) => {
    const key = String(p.key);
    const target = Number(p.target) || 0;
    const logged = entries.filter((e) => e.key === key && (key !== "links" || (e.check && e.check.ok)));
    const rows = (auto[key] || []).map((r) => Object.assign({ n: 1, source: "auto" }, r))
      .concat(logged.map((e) => ({ at: e.at, n: Math.max(1, Number(e.count) || 1), text: e.note || (key === "links" ? e.url : "Logged"), url: e.url || "", id: e.id, source: "logged" })))
      .sort((a, b) => toMs(b.at) - toMs(a.at));
    const fix = (kept.fix || {})[key];
    const sum = (list) => list.reduce((s, r) => s + r.n, 0);
    const actual = fix ? Number(fix.value) + sum(rows.filter((r) => toMs(r.at) > toMs(fix.at))) : sum(rows);
    const done = (kept.done || {})[key] || null;
    const lastAt = rows.length ? rows[0].at : fix ? fix.at : "";
    const row = { key, label: String(p.label || key), target, actual, auto: !!auto[key], how: HOW[key] || MANUAL, lastAt, done, fix: fix || null, next: NEXT[key] || [] };
    const failing = key === "links" ? entries.filter((e) => e.key === "links" && e.check && !e.check.ok).map((e) => ({ at: e.at, text: (e.note ? e.note + " · " : "") + e.check.detail, url: e.url, id: e.id, source: "failing" })) : [];
    return Object.assign(row, judge(row, days, now), { items: rows.slice(0, 25).map((r) => ({ at: r.at, text: r.text, url: r.url || "", id: r.id || "", source: r.source, n: r.n })).concat(failing.slice(0, 15)) });
  });
}

/** True for a public http(s) page Jarvis may fetch: no IP literals, local names or metadata hosts. */
function publicUrl(url) {
  let u;
  try { u = new URL(String(url || "")); } catch (error) { return false; }
  const h = u.hostname.toLowerCase();
  return /^https?:$/.test(u.protocol) && h.includes(".") && !/^[\d.]+$/.test(h) && !h.includes(":") && !/(^|\.)(local|internal|localhost)$/.test(h) && !/^\[/.test(h);
}

/** Whether the page links to carlosandmunoz.com or qalabreview.com: { ok, status, detail, at }. */
async function checkLink(fetchFn, url, now) {
  const at = iso(now);
  if (!publicUrl(url)) return { ok: false, status: 0, detail: "Not a public web address.", at };
  try {
    const res = await fetchFn(url, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "Mozilla/5.0 (compatible; JarvisLinkCheck/1.0; +" + ORIGIN + ")" } });
    if (!res.ok) return { ok: false, status: res.status, detail: "The page answered " + res.status + ".", at };
    const hit = LINK_TO.exec((await res.text()).slice(0, 3000000));
    return hit ? { ok: true, status: res.status, detail: "Links to " + hit[1].toLowerCase() + ".", at } : { ok: false, status: res.status, detail: "No link to carlosandmunoz.com or qalabreview.com on the page.", at };
  } catch (error) { return { ok: false, status: 0, detail: clean(error), at }; }
}

// YouTube uploads since the plan start with their tags and description (one videos.list call per 50).
async function videos(ctx, start) {
  const res = await ctx.fetch(ORIGIN + "/assets/social/youtube.json?t=" + Math.floor(ctx.now / 3600000), { signal: AbortSignal.timeout(10000) });
  const ledger = res.ok ? await res.json() : {};
  const list = Object.keys(ledger.videos || {}).map((id) => Object.assign({ id }, ledger.videos[id])).filter((v) => toMs(v.published) >= start);
  const key = (ctx.env || {}).YOUTUBE_KEY;
  if (!key || !list.length) return { list, need: key ? "" : "Segment clips: set YOUTUBE_KEY so Jarvis can read the clips' tags." };
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const r = await ctx.fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" + chunk.map((v) => v.id).join(",") + "&key=" + key, { signal: AbortSignal.timeout(15000) });
    const data = r.ok ? await r.json() : { items: [] };
    const byId = {};
    (data.items || []).forEach((it) => { byId[it.id] = it.snippet || {}; });
    chunk.forEach((v) => { const s = byId[v.id] || {}; v.tags = s.tags || []; v.description = s.description || ""; });
  }
  return { list, need: "" };
}

const docRef = (db) => db.collection("jarvis_settings").doc(DOC);

/** Rechecks logged links not checked in a week (a few per run) and saves what changed. */
async function recheck(ctx, kept, all) {
  const due = (kept.entries || []).filter((e) => e.key === "links" && e.url && (all || !e.check || ctx.now - toMs(e.check.at) > RECHECK_MS)).slice(0, all ? 40 : RECHECKS_PER_RUN);
  if (!due.length) return 0;
  const checks = await Promise.all(due.map((e) => checkLink(ctx.fetch, e.url, ctx.now)));
  const byId = new Map(due.map((e, i) => [e.id, checks[i]]));
  kept.entries = kept.entries.map((e) => (byId.has(e.id) ? Object.assign({}, e, { check: byId.get(e.id) }) : e));
  await docRef(ctx.db).set({ entries: kept.entries }, { merge: true });
  return due.length;
}

/** The targets source: { ok, start, end, day, length, targets, needs }. */
async function source(ctx) {
  const [planSnap, keptSnap] = await Promise.all([ctx.db.collection("jarvis_settings").doc("outreach").get(), docRef(ctx.db).get()]);
  const plan = planSnap.exists ? planSnap.data() : null;
  if (!plan || !plan.start || !(plan.targets || []).length) return { ok: false, error: "No 90-day targets uploaded.", needs: [] };
  const kept = keptSnap.exists ? keptSnap.data() || {} : {};
  const start = atNoon(plan.start) - 12 * 3600000;
  const now = ctx.now;
  const needs = [];
  const keys = new Set(plan.targets.map((t) => String(t.key)));
  const [reviews, bookings, vids] = await Promise.all([
    keys.has("unlocks") || keys.has("agencies") ? dayRows.rows(ctx.db, ["reviews"], { from: start, now }).then((r) => r.reviews) : [],
    keys.has("calls") ? ctx.db.collection("bookings").where("start", ">=", iso(start)).get().then((s) => s.docs.map((d) => d.data())) : [],
    keys.has("clips") ? videos(ctx, start).catch((error) => ({ list: [], need: "Segment clips: " + clean(error) })) : { list: [], need: "" }
  ]);
  if (vids.need) needs.push(vids.need);
  if (keys.has("links")) await recheck(ctx, kept, false).catch((error) => needs.push("Link checks: " + clean(error)));
  const auto = autoRows({ reviews, bookings, videos: vids.list, start, now });
  ["unlocks", "agencies", "calls", "clips"].filter((k) => !keys.has(k)).forEach((k) => delete auto[k]);
  const days = planDays(plan, now);
  return { ok: true, start: plan.start, end: plan.end, day: days.day, length: days.length, targets: build(plan, kept, auto, now), needs };
}

/** One target action from the page or the app: log, remove, correct, done, undone or recheck. */
async function act(ctx, body, by) {
  const action = String(body.action || "");
  const planSnap = await ctx.db.collection("jarvis_settings").doc("outreach").get();
  const plan = planSnap.exists ? planSnap.data() : {};
  const target = (plan.targets || []).find((t) => String(t.key) === String(body.key || ""));
  if (action !== "remove" && !target) throw new Error("That is not one of the 90-day targets.");
  const snap = await docRef(ctx.db).get();
  const kept = snap.exists ? snap.data() || {} : {};
  kept.entries = kept.entries || [];
  const now = ctx.now;
  const who = String(by || "");
  const label = target ? target.label : "";
  if (action === "log") {
    const url = String(body.url || "").trim().slice(0, 500);
    const note = String(body.note || "").trim().slice(0, 200);
    const count = Math.min(50, Math.max(1, Math.round(Number(body.count) || 1)));
    if (target.key === "links" && !url) throw new Error("Paste the address of the page that links to us.");
    if (url && !publicUrl(url)) throw new Error("That is not a public web address.");
    const day = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? atNoon(body.date) : now;
    if (day > now + DAY) throw new Error("That date has not happened yet.");
    const entry = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), key: String(target.key), at: iso(Math.min(day, now)), count: target.key === "links" ? 1 : count, note, url, by: who };
    if (target.key === "links") entry.check = await checkLink(ctx.fetch, url, now);
    kept.entries = kept.entries.concat(entry).slice(-MAX_ENTRIES);
    await docRef(ctx.db).set({ entries: kept.entries }, { merge: true });
    return { label: label + ": logged" + (entry.count > 1 ? " " + entry.count : ""), check: entry.check || null };
  }
  if (action === "remove") {
    const gone = kept.entries.find((e) => e.id === body.id);
    if (!gone) throw new Error("That entry is already gone.");
    await docRef(ctx.db).set({ entries: kept.entries.filter((e) => e.id !== body.id) }, { merge: true });
    return { label: "Entry removed" };
  }
  if (action === "correct") {
    const value = Math.round(Number(body.value));
    if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error("The count must be a whole number.");
    await docRef(ctx.db).set({ fix: { [target.key]: { value, at: iso(now), by: who } } }, { merge: true });
    return { label: label + ": set to " + value };
  }
  if (action === "done") {
    await docRef(ctx.db).set({ done: { [target.key]: { at: iso(now), by: who, proof: String(body.proof || "").trim().slice(0, 300) } } }, { merge: true });
    return { label: label + ": marked done" };
  }
  if (action === "undone") {
    const done = Object.assign({}, kept.done);
    delete done[target.key];
    await docRef(ctx.db).set(Object.assign({}, kept, { done }));
    return { label: label + ": no longer held done" };
  }
  if (action === "recheck") {
    const n = await recheck(Object.assign({}, ctx, { now }), kept, true);
    return { label: n ? "Rechecked " + n + (n === 1 ? " link" : " links") : "No links to check" };
  }
  throw new Error("Unknown target action.");
}

/** Sunday's push: the targets behind pace with what each needs a week, or null when none is. */
function weeklyPush(src) {
  const behind = ((src && src.ok && src.targets) || []).filter((t) => t.status === "behind");
  if (!behind.length) return null;
  return {
    kind: "outreach", tab: "products:outreach", tag: "jarvis-targets-weekly",
    title: behind.length === 1 ? "A 90-day target is behind" : behind.length + " 90-day targets are behind",
    body: behind.slice(0, 4).map((t) => `${t.label}: ${t.actual} of ${t.target}, ${t.perWeek} a week from here`).join("; ").slice(0, 240)
  };
}

module.exports = { source, act, build, judge, autoRows, segmentOf, checkLink, publicUrl, planDays, weeklyPush, HOW, NEXT, FREE_MAIL, TTL: 60 * 60 * 1000 };
