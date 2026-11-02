"use strict";
/*
 * Jarvis > Engagement (#1988): the scout run, the reports, and what the tab and the app read and change.
 *
 *   engagement_posts/<network>_<hash>  each post in our field the scout kept: metrics, score, Gemini's read, the plan
 *   engagement_daily/<YYYY-MM-DD>      counters per Bogotá day (read, candidates, actions, the reply funnel, topics)
 *   engagement_runs/<ISO>              one per scout run
 *   engagement_reports/<period>-<day>  the daily, weekly and monthly reports as sent
 *   jarvis_settings/engagement         pause, caps, thresholds, competitors, own handles
 *
 * deps: { db, fetch, env, now, inc (n => FieldValue.increment(n)), push (msg => Promise), mail (msg => Promise) }
 */
const E = require("./engagement");
const Sources = require("./engagement-sources");

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const STALE = 75 * 60 * 1000;
const PUSH_PER_RUN = 5;
const DAY = 24 * 3600000;
const CACHE_DAYS = [1, 7, 30, 90, 365];

const settingsRef = (db) => db.collection("jarvis_settings").doc("engagement");

async function readSettings(db) {
  const snap = await settingsRef(db).get();
  return E.settings(snap.exists ? snap.data() : null);
}

/** Nested plain counters as Firestore increments, for a merge set. */
function increments(map, inc) {
  const out = {};
  Object.entries(map).forEach(([k, v]) => {
    if (typeof v === "number") { if (v) out[k] = inc(v); } else if (v && typeof v === "object") { const sub = increments(v, inc); if (Object.keys(sub).length) out[k] = sub; }
  });
  return out;
}

async function geminiJson(fetchImpl, env, prompt) {
  const res = await fetchImpl(GEMINI + (env.GEMINI_MODEL || "gemini-flash-latest") + ":generateContent", {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 8192, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } } })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Gemini answered " + res.status + ": " + String((data.error || {}).message || "").slice(0, 160));
  return (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || "").join("");
}

/** Waiting replies past their 6 hours become expired. */
async function expire(deps) {
  const { db, now, inc } = deps;
  const snap = await db.collection("engagement_posts").where("actions.reply.status", "==", "waiting").limit(200).get();
  const old = snap.docs.filter((d) => Date.parse(((d.data().actions || {}).reply || {}).expiresAt) < now);
  for (const d of old) {
    await d.ref.update({ "actions.reply.status": "expired", updatedAt: new Date(now).toISOString() });
    await db.collection("engagement_daily").doc(E.bogotaDay(now)).set(increments({ n: { [d.data().network]: { expired: 1 } } }, inc), { merge: true });
  }
  return old.length;
}

/** Authors already planned for a follow in the last 30 days, as "network:handle". */
async function followed(db, now) {
  const snap = await db.collection("engagement_posts").where("actions.follow.status", "==", "planned").limit(1000).get();
  const since = new Date(now - 30 * DAY).toISOString();
  return new Set(snap.docs.map((d) => d.data()).filter((d) => d.seenAt >= since).map((d) => d.network + ":" + String((d.author || {}).handle || "").toLowerCase()));
}

/** Today's planned actions per network, for the caps. */
function usedToday(daily) {
  const used = {};
  Object.entries((daily && daily.n) || {}).forEach(([net, n]) => { used[net] = { like: n.like || 0, repost: n.repost || 0, follow: n.follow || 0, reply: n.drafted || 0 }; });
  return used;
}

/** One scout run. Returns the run document. */
async function scout(deps) {
  const { db, now, env, inc } = deps;
  const started = Date.now();
  const conf = await readSettings(db);
  const expired = await expire(deps).catch(() => 0);
  const read = await Sources.readAll({ fetch: deps.fetch, env, now });

  // Our field only, once each, best first.
  const seen = new Map();
  read.posts.forEach((p) => {
    const s = E.score(p, now);
    if (!s.relevance) return;
    const key = E.keyOf(p.network, p.id);
    if (!seen.has(key) || seen.get(key).score < s.score) seen.set(key, Object.assign({ key }, p, s));
  });
  const candidates = Array.from(seen.values());
  const refs = candidates.map((p) => db.collection("engagement_posts").doc(p.key));
  const known = refs.length ? await db.getAll(...refs) : [];
  const fresh = candidates.filter((p, i) => !known[i].exists);
  const stale = candidates.filter((p, i) => known[i].exists);

  let ai = {};
  let aiError = "";
  const asked = E.forAi(fresh, conf, now);
  if (asked.length && env.GEMINI_API_KEY) {
    try { ai = E.parseAi(await geminiJson(deps.fetch, env, E.aiPrompt(asked)), asked); } catch (error) { aiError = String(error.message || error).slice(0, 200); }
  }

  const day = E.bogotaDay(now);
  const dailyRef = db.collection("engagement_daily").doc(day);
  const dailySnap = await dailyRef.get();
  const used = usedToday(dailySnap.exists ? dailySnap.data() : null);
  const follows = await followed(db, now).catch(() => new Set());
  const docs = fresh.map((p) => {
    const d = E.decide(p, ai[p.key], conf, used, now, follows);
    if (d.actions.follow && d.actions.follow.status === "planned") follows.add(p.network + ":" + String((p.author || {}).handle || "").toLowerCase());
    return Object.assign({ key: p.key }, E.postDoc(p, ai[p.key], d, now));
  });

  const writes = docs.map((d) => ({ ref: db.collection("engagement_posts").doc(d.key), data: d, set: true }))
    .concat(stale.map((p) => ({ ref: db.collection("engagement_posts").doc(p.key), data: { metrics: p.metrics, trend: p.trend, score: p.score, updatedAt: new Date(now).toISOString() } })));
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((w) => (w.set ? batch.set(w.ref, w.data) : batch.update(w.ref, w.data)));
    await batch.commit();
  }

  const errors = Object.keys(read.errors).length;
  const counters = E.rollup(read.read, docs, { errors });
  await dailyRef.set(Object.assign({ day }, increments(counters, inc)), { merge: true });

  const waiting = docs.filter((d) => d.actions.reply && d.actions.reply.status === "waiting").sort((a, b) => b.score - a.score);
  let pushed = 0;
  if (!conf.paused && deps.push) for (const d of waiting.slice(0, PUSH_PER_RUN)) { await deps.push(E.replyPush(d)).catch(() => null); pushed += 1; }

  const run = {
    at: new Date(now).toISOString(), ms: Date.now() - started, paused: conf.paused, read: read.read, errors: read.errors, skipped: read.skipped,
    candidates: candidates.length, fresh: fresh.length, updated: stale.length, asked: asked.length, aiError,
    engaged: docs.filter((d) => d.verdict === "engage").length, drafted: waiting.length, pushed, expired
  };
  await db.collection("engagement_runs").doc(run.at).set(run);
  await clearCache(db);
  return run;
}

const runNote = (r) => Object.values(r.read).reduce((a, b) => a + b, 0) + " read, " + r.fresh + " new in field, " + r.engaged + " to engage, " + r.drafted + " replies drafted"
  + (Object.keys(r.errors).length ? "; failed: " + Object.keys(r.errors).join(", ") : "") + (r.aiError ? "; Gemini: " + r.aiError : "") + (r.paused ? "; paused" : "");

async function clearCache(db) {
  const cache = db.collection("jarvis_cache");
  await Promise.all(CACHE_DAYS.flatMap((d) => ["engagement-" + d, "snapshot-" + d]).map((id) => cache.doc(id).delete().catch(() => null)));
}

const dayList = (to, n) => Array.from({ length: n }, (_, i) => E.bogotaDay(Date.parse(to + "T12:00:00Z") - (n - 1 - i) * DAY));

async function dailies(db, days) {
  if (!days.length) return [];
  const snaps = await db.getAll(...days.map((d) => db.collection("engagement_daily").doc(d)));
  return snaps.filter((s) => s.exists).map((s) => Object.assign({ day: s.id }, s.data()));
}

async function topPosts(db, fromDay, toDay, limit) {
  const from = new Date(Date.parse(fromDay + "T05:00:00Z")).toISOString();
  const to = new Date(Date.parse(toDay + "T05:00:00Z") + DAY).toISOString();
  const snap = await db.collection("engagement_posts").where("seenAt", ">=", from).where("seenAt", "<", to).orderBy("seenAt", "desc").limit(1500).get();
  return snap.docs.map((d) => Object.assign({ key: d.id }, d.data())).filter((d) => d.verdict !== "skip").sort((a, b) => b.score - a.score).slice(0, limit || 15);
}

/** The window a report covers: daily is today, weekly the last 7 days, monthly the calendar month before. */
function windowOf(period, now) {
  const today = E.bogotaDay(now);
  if (period === "monthly") {
    const d = new Date(Date.parse(today + "T12:00:00Z"));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0, 12));
    const before = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 0, 12));
    return { days: dayList(last.toISOString().slice(0, 10), last.getUTCDate()), prior: dayList(before.toISOString().slice(0, 10), before.getUTCDate()) };
  }
  const n = period === "weekly" ? 7 : 1;
  return { days: dayList(today, n), prior: dayList(E.bogotaDay(Date.parse(today + "T12:00:00Z") - n * DAY), n) };
}

async function buildReport(db, period, now) {
  const w = windowOf(period, now);
  const [cur, prev, top] = await Promise.all([dailies(db, w.days), dailies(db, w.prior), topPosts(db, w.days[0], w.days[w.days.length - 1], 15)]);
  const r = E.report(period, cur, prev, top, now);
  r.from = w.days[0];
  r.to = w.days[w.days.length - 1];
  return r;
}

/** Builds, stores, mails and pushes one report. */
async function sendReport(deps, period) {
  const { db, now } = deps;
  const r = await buildReport(db, period, now);
  await db.collection("engagement_reports").doc(period + "-" + r.to).set({ period, at: r.at, from: r.from, to: r.to, json: JSON.stringify(r).slice(0, 800000) });
  const mail = E.reportMail(r);
  const sent = deps.mail ? await deps.mail(mail) : false;
  if (deps.push) await deps.push(E.reportPush(r)).catch(() => null);
  return { period, from: r.from, to: r.to, sent: sent !== false, subject: mail.subject };
}

/** Approve, edit or dismiss a waiting reply. */
async function decide(deps, body, by) {
  const { db, now, inc } = deps;
  const key = String((body && (body.key || body.id)) || "");
  if (!/^[a-z]+_[a-f0-9]{20}$/.test(key)) throw new Error("That is not a post of the engagement list.");
  const ref = db.collection("engagement_posts").doc(key);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("That post is gone.");
    const doc = snap.data();
    const d = E.decideReply(doc, String(body.decision || ""), body.text, String(by || ""), now);
    tx.update(ref, { "actions.reply": d.reply, updatedAt: new Date(now).toISOString() });
    return { network: doc.network, d };
  });
  await db.collection("engagement_daily").doc(E.bogotaDay(now)).set(increments({ n: { [out.network]: { [out.d.counter]: 1 } }, decided: 1, decideMs: out.d.waited }, inc), { merge: true });
  await clearCache(db);
  const name = (E.NETWORKS[out.network] || {}).name || out.network;
  const message = out.d.counter === "dismissed" ? "Dismissed." : (out.d.counter === "edited" ? "Your version is approved" : "Approved") + "; it goes out on " + name + " when the " + name + " poster is live (#1990, #1991).";
  return { key, status: out.d.reply.status, message };
}

async function saveSettings(db, body, by, now) {
  const next = E.settingsPatch(await readSettings(db), body);
  next.updatedAt = new Date(now).toISOString();
  next.by = String(by || "");
  await settingsRef(db).set(next);
  await clearCache(db);
  return { settings: next };
}

const STAGE = {
  bluesky: "API: likes, reposts, follows and replies post once #1990 ships",
  mastodon: "API: likes, boosts, follows and replies post once #1990 ships",
  youtube: "API: likes and comments post once #1990 ships (needs the channel's OAuth)",
  x: "reads and acts once the Mac browser agent ships (#1991)", linkedin: "reads and acts once the Mac browser agent ships (#1991)",
  facebook: "reads and acts once the Mac browser agent ships (#1991)", instagram: "reads and acts once the Mac browser agent ships (#1991)",
  threads: "reads and acts once the Mac browser agent ships (#1991)", tiktok: "reads and acts once the Mac browser agent ships (#1991)",
  hn: "trends only", devto: "trends only", lobsters: "trends only"
};

const brief = (d) => ({
  key: d.key, network: d.network, url: d.url, author: d.author || {}, title: d.title || "", text: String(d.text || "").slice(0, 600), lang: d.lang, topic: d.topic, words: d.words || [],
  score: d.score, trend: d.trend, metrics: d.metrics || {}, about: d.about || "", why: d.why || "", sentiment: d.sentiment || "", worth: d.worth, verdict: d.verdict, skip: d.skip || "",
  actions: d.actions || {}, seenAt: d.seenAt, createdAt: d.createdAt
});

/** What Jarvis > Engagement and the app show for the selected range. */
async function source(ctx) {
  const db = ctx.db;
  const now = ctx.now;
  const days = Math.max(1, Math.min(365, Number(ctx.days) || 7));
  const range = dayList(E.bogotaDay(now), Math.min(days, 92));
  const [conf, runsSnap, waitingSnap, approvedSnap, cur, prev, top, reportsSnap] = await Promise.all([
    readSettings(db),
    db.collection("engagement_runs").orderBy("at", "desc").limit(12).get(),
    db.collection("engagement_posts").where("actions.reply.status", "==", "waiting").limit(60).get(),
    db.collection("engagement_posts").where("actions.reply.status", "==", "approved").limit(60).get(),
    dailies(db, range),
    dailies(db, dayList(E.bogotaDay(now - range.length * DAY), range.length)),
    topPosts(db, range[0], range[range.length - 1], 40),
    db.collection("engagement_reports").orderBy("at", "desc").limit(9).get()
  ]);
  const runs = runsSnap.docs.map((d) => d.data());
  const last = runs[0] || null;
  const stale = !last || now - Date.parse(last.at) > STALE;
  const report = E.report("range", cur, prev, top, now);
  const readers = Object.fromEntries(Sources.readable(ctx.env || {}).map((r) => [r.network, r]));
  const networks = Object.entries(E.NETWORKS).map(([k, n]) => ({
    network: k, name: n.name, reads: readers[k] ? (readers[k].ok ? "API" : "needs a key") : "Mac browser",
    lastRead: last && last.read ? last.read[k] || 0 : 0, error: last && last.errors ? last.errors[k] || "" : "", acts: STAGE[k] || "",
    row: report.networks.find((r) => r.network === k) || null
  }));
  const needs = [];
  if (!last) needs.push("Engagement: the scout has not run yet; it runs every 30 minutes once engagementScout is deployed.");
  else if (stale) needs.push("Engagement: the last scout run was " + Math.round((now - Date.parse(last.at)) / 60000) + " minutes ago; check engagementScout in Systems.");
  Sources.readable(ctx.env || {}).filter((r) => !r.ok).forEach((r) => needs.push(r.help));
  if (last && last.aiError) needs.push("Engagement: Gemini failed on the last run (" + last.aiError + "), so no reply was drafted.");
  if (conf.paused) needs.push("Engagement is paused: nothing is planned or pushed until you resume it.");
  const byScore = (a, b) => b.score - a.score;
  return {
    ok: true, settings: conf, paused: conf.paused, stale, lastRun: last, runs,
    waiting: waitingSnap.docs.map((d) => brief(Object.assign({ key: d.id }, d.data()))).sort(byScore),
    approved: approvedSnap.docs.map((d) => brief(Object.assign({ key: d.id }, d.data()))).sort((a, b) => String(b.actions.reply.decidedAt).localeCompare(String(a.actions.reply.decidedAt))).slice(0, 30),
    posts: top.map(brief), report, networks,
    reports: reportsSnap.docs.map((d) => { const x = d.data(); let r = {}; try { r = JSON.parse(x.json); } catch (error) { r = {}; } return { id: d.id, period: x.period, from: x.from, to: x.to, at: x.at, totals: r.totals || {}, approvalRate: r.approvalRate === undefined ? null : r.approvalRate }; }),
    caps: conf.caps, used: usedToday(cur.find((d) => d.day === E.bogotaDay(now))),
    daily: range.map((day) => {
      const t = E.report("day", cur.filter((d) => d.day === day), [], [], now).totals;
      return { day, read: t.read, candidates: t.candidates, like: t.like, repost: t.repost, follow: t.follow, drafted: t.drafted, approved: t.approved + t.edited, posted: t.posted };
    }),
    needs
  };
}

module.exports = { scout, runNote, sendReport, buildReport, windowOf, decide, saveSettings, readSettings, source, increments, usedToday, clearCache, STALE, geminiJson };
