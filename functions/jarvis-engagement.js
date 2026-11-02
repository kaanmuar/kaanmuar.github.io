"use strict";
/*
 * Jarvis > Engagement (#1988): the scout run, the reports, and what the tab and the app read and change.
 *
 *   engagement_posts/<network>_<hash>  each post in our field the scout kept: metrics, score, Gemini's read, the plan
 *   engagement_daily/<YYYY-MM-DD>      counters per Bogotá day (read, candidates, actions, the reply funnel, topics)
 *   engagement_runs/<ISO>              one per scout run
 *   engagement_inbox/<ISO>             posts the Mac's browser agent read (#1991), taken by the next scout run
 *   engagement_reports/<period>-<day>  the daily, weekly and monthly reports as sent
 *   jarvis_settings/engagement         pause, live (or a dry run), caps, thresholds, competitors, own handles
 *   engagement_private/*               the accounts the poster acts as (functions/engagement-act.js)
 *
 * deps: { db, fetch, env, now, inc (n => FieldValue.increment(n)), push (msg => Promise), mail (msg => Promise),
 *         keys ({ clientId, secret }: the Google OAuth client YouTube refreshes through) }
 */
const E = require("./engagement");
const Sources = require("./engagement-sources");
const Act = require("./engagement-act");

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const STALE = 75 * 60 * 1000;
const PUSH_PER_RUN = 5;
const DAY = 24 * 3600000;
const CACHE_DAYS = [1, 7, 30, 90, 365];
const INBOX_AGE = 2 * 3600000;

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

/**
 * What the Mac's browser agent read since the last run (#1991): engagement_inbox/<ISO> { at, posts, read, errors },
 * taken once. Posts older than INBOX_AGE are dropped: by then the plan's window is mostly gone.
 */
async function inbox(db, now) {
  const snap = await db.collection("engagement_inbox").limit(40).get();
  const out = { posts: [], read: {}, errors: {} };
  for (const d of snap.docs) {
    const x = d.data();
    if (Date.parse(x.at) > now - INBOX_AGE) {
      (x.posts || []).filter((p) => p && p.id && p.url && (E.NETWORKS[p.network] || {}).browser).forEach((p) => out.posts.push(p));
      Object.entries(x.read || {}).forEach(([k, n]) => { out.read[k] = (out.read[k] || 0) + (Number(n) || 0); });
      Object.assign(out.errors, x.errors || {});
    }
    await d.ref.delete();
  }
  return out;
}

function addInbox(read, got) {
  if (!got) return;
  read.posts.push(...got.posts);
  Object.entries(got.read).forEach(([k, n]) => { read.read[k] = (read.read[k] || 0) + n; });
  Object.assign(read.errors, got.errors);
}

/** One scout run. Returns the run document. */
async function scout(deps) {
  const { db, now, env, inc } = deps;
  const started = Date.now();
  const conf = await readSettings(db);
  const expired = await expire(deps).catch(() => 0);
  const read = await Sources.readAll({ fetch: deps.fetch, env: withAccounts(env, await Act.readCreds(db).catch(() => ({}))), now });
  addInbox(read, await inbox(db, now).catch(() => null));

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
  const fresh = [];
  const stale = [];
  const risen = [];
  candidates.forEach((p, i) => {
    if (!known[i].exists) fresh.push(p);
    else if (E.rises(known[i].data(), p, conf, now)) risen.push({ post: p, doc: known[i].data() });
    else stale.push(p);
  });

  let ai = {};
  let aiError = "";
  const asked = E.forAi(fresh.concat(risen.filter((r) => E.askAgain(r.doc, conf)).map((r) => r.post)), conf, now);
  if (asked.length && env.GEMINI_API_KEY) {
    try { ai = E.parseAi(await geminiJson(deps.fetch, env, E.aiPrompt(asked)), asked); } catch (error) { aiError = String(error.message || error).slice(0, 200); }
  }

  const day = E.bogotaDay(now);
  const dailyRef = db.collection("engagement_daily").doc(day);
  const dailySnap = await dailyRef.get();
  const used = usedToday(dailySnap.exists ? dailySnap.data() : null);
  const follows = await followed(db, now).catch(() => new Set());
  const plan = (p, read) => {
    const d = E.decide(p, read, conf, used, now, follows);
    if (d.actions.follow && d.actions.follow.status === "planned") follows.add(p.network + ":" + String((p.author || {}).handle || "").toLowerCase());
    return Object.assign({ key: p.key }, E.postDoc(p, read, d, now));
  };
  const docs = fresh.map((p) => plan(p, ai[p.key]));
  const again = risen.map(({ post, doc }) => {
    const d = plan(post, ai[post.key] || E.storedAi(doc));
    return Object.assign(d, { seenAt: doc.seenAt, day: doc.day, decidedAgainAt: new Date(now).toISOString() });
  });

  const writes = docs.map((d) => ({ ref: db.collection("engagement_posts").doc(d.key), data: d, set: true }))
    .concat(again.map((d) => ({ ref: db.collection("engagement_posts").doc(d.key), data: d, set: true })))
    .concat(stale.map((p) => ({ ref: db.collection("engagement_posts").doc(p.key), data: { metrics: p.metrics, trend: p.trend, score: p.score, updatedAt: new Date(now).toISOString() } })));
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((w) => (w.set ? batch.set(w.ref, w.data) : batch.update(w.ref, w.data)));
    await batch.commit();
  }

  const errors = Object.keys(read.errors).length;
  const counters = E.rollup(read.read, docs, { errors }, again);
  await dailyRef.set(Object.assign({ day }, increments(counters, inc)), { merge: true });

  const decided = docs.concat(again);
  const waiting = decided.filter((d) => d.actions.reply && d.actions.reply.status === "waiting").sort((a, b) => b.score - a.score);
  let pushed = 0;
  if (!conf.paused && deps.push) for (const d of waiting.slice(0, PUSH_PER_RUN)) { await deps.push(E.replyPush(d)).catch(() => null); pushed += 1; }

  let acted = {};
  let actError = "";
  try { acted = await Act.carryOut(deps, conf); } catch (error) { actError = String(error.message || error).slice(0, 200); }
  const sum = (k) => Object.values(acted).reduce((a, x) => a + (x[k] || 0), 0);

  const run = {
    at: new Date(now).toISOString(), ms: Date.now() - started, paused: conf.paused, live: conf.live, read: read.read, errors: read.errors, skipped: read.skipped,
    candidates: candidates.length, fresh: fresh.length, updated: stale.length, risen: again.length, asked: asked.length, aiError,
    engaged: decided.filter((d) => d.verdict === "engage").length, drafted: waiting.length, pushed, expired,
    done: sum("done"), dry: sum("dry"), missed: sum("missed"), posted: sum("posted"), actFailed: sum("failed"), acted, actError
  };
  await db.collection("engagement_runs").doc(run.at).set(run);
  await clearCache(db);
  return run;
}

const actNote = (r) => {
  const errs = Object.entries(r.acted || {}).filter(([, x]) => x.error).map(([k, x]) => k + ": " + x.error);
  return (r.done || r.posted ? "; done " + (r.done || 0) + ", replies posted " + (r.posted || 0) : "") + (r.dry ? "; dry run " + r.dry : "")
    + (r.actFailed ? "; " + r.actFailed + " actions failed" : "") + (errs.length ? "; poster: " + errs.join("; ") : "") + (r.actError ? "; poster: " + r.actError : "");
};
const runNote = (r) => Object.values(r.read).reduce((a, b) => a + b, 0) + " read, " + r.fresh + " new in field, " + r.engaged + " to engage, " + r.drafted + " replies drafted"
  + actNote(r) + (Object.keys(r.errors).length ? "; failed: " + Object.keys(r.errors).join(", ") : "") + (r.aiError ? "; Gemini: " + r.aiError : "") + (r.paused ? "; paused" : "");

/** The scout reads Bluesky as the connected account when there is no BLUESKY_* secret. */
function withAccounts(env, creds) {
  const b = (creds || {}).bluesky;
  if (!b || (env && env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD)) return env || {};
  return Object.assign({}, env, { BLUESKY_HANDLE: b.handle, BLUESKY_APP_PASSWORD: b.password });
}

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
  const net = E.NETWORKS[out.network] || {};
  const name = net.name || out.network;
  if (out.d.counter === "dismissed") { await clearCache(db); return { key, status: "dismissed", message: "Dismissed." }; }
  const said = out.d.counter === "edited" ? "Your version is approved" : "Approved";
  if ((await readSettings(db)).paused) { await clearCache(db); return { key, status: "approved", message: said + "; engagement is paused, so it goes out on " + name + " when you resume." }; }
  if (!net.api) {
    await clearCache(db);
    const mac = await Act.macStatus(db).catch(() => ({}));
    const late = !mac.at || now - Date.parse(mac.at) > Act.MAC_LATE;
    return { key, status: "approved", message: said + "; " + (late ? "it goes out on " + name + " once the Mac's browser agent is back (" + (mac.at ? "last seen " + mac.at.slice(0, 16).replace("T", " ") + " UTC" : "not installed yet") + ")." : "the Mac posts it on " + name + " within 5 minutes.") };
  }
  const sent = await Act.replyNow(deps, key).catch((error) => ({ status: "approved", error: error.message }));
  await clearCache(db);
  if (sent.status === "posted") return { key, status: "posted", url: sent.url || "", message: "Posted on " + name + "." };
  if (sent.status === "failed") return { key, status: "failed", message: "Not posted on " + name + ": " + sent.error };
  return { key, status: "approved", message: said + "; " + name + " did not take it yet (" + (sent.error || "not sent") + "), so the next scout run tries again." };
}

/** Jarvis > Engagement > Accounts: save Bluesky's app password, start Connect YouTube or Mastodon, disconnect, or ask the Mac to sign in. */
async function connect(deps, body, redirect) {
  const network = String((body && body.network) || "");
  let out;
  if ((E.NETWORKS[network] || {}).browser) out = await Act.askMacLogin(deps, network);
  else if (body && body.disconnect) out = await Act.disconnect(deps.db, network);
  else if (network === "bluesky") out = await Act.saveBluesky(deps, body);
  else out = Object.assign({ network }, await Act.connectUrl(deps, network, redirect, deps.keys || {}));
  await clearCache(deps.db);
  return out;
}

async function saveSettings(db, body, by, now) {
  const cur = await readSettings(db);
  const next = E.settingsPatch(cur, body);
  if (next.live !== cur.live) next.liveAt = new Date(now).toISOString();
  next.updatedAt = new Date(now).toISOString();
  next.by = String(by || "");
  await settingsRef(db).set(next);
  await clearCache(db);
  return { settings: next };
}

const STAGE = {
  bluesky: "likes, reposts, follows and replies", mastodon: "likes, boosts, follows and replies", youtube: "likes, subscribes and comments",
  x: "likes, reposts, follows and replies", linkedin: "likes, reposts, follows and comments", facebook: "likes and comments",
  instagram: "likes, follows and comments", threads: "likes, reposts, follows and replies", tiktok: "likes, follows and comments",
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
  const [conf, runsSnap, waitingSnap, approvedSnap, cur, prev, top, reportsSnap, accounts, creds, mac] = await Promise.all([
    readSettings(db),
    db.collection("engagement_runs").orderBy("at", "desc").limit(12).get(),
    db.collection("engagement_posts").where("actions.reply.status", "==", "waiting").limit(60).get(),
    db.collection("engagement_posts").where("actions.reply.status", "in", ["approved", "posted", "failed"]).limit(90).get(),
    dailies(db, range),
    dailies(db, dayList(E.bogotaDay(now - range.length * DAY), range.length)),
    topPosts(db, range[0], range[range.length - 1], 40),
    db.collection("engagement_reports").orderBy("at", "desc").limit(9).get(),
    Act.connections(db),
    Act.readCreds(db),
    Act.macStatus(db)
  ]);
  const runs = runsSnap.docs.map((d) => d.data());
  const last = runs[0] || null;
  const stale = !last || now - Date.parse(last.at) > STALE;
  const report = E.report("range", cur, prev, top, now);
  const env = withAccounts(ctx.env || {}, creds);
  const readers = Object.fromEntries(Sources.readable(env).map((r) => [r.network, r]));
  const macLate = !mac.at || now - Date.parse(mac.at) > Act.MAC_LATE;
  const acting = (k) => {
    const a = accounts.find((x) => x.network === k);
    if (!a) return STAGE[k] || "";
    const via = a.via === "mac" ? "Mac browser" : "API";
    if (!a.connected) return via + (a.via === "mac" ? ", not signed in: Sign in on the Mac under Accounts" : ", not connected: connect it under Accounts");
    return via + " as " + a.account + ": " + STAGE[k] + (conf.live ? "" : " (dry run: replies post, the rest is only logged)") + (a.error ? "; last error: " + a.error : "");
  };
  const signedIn = (k) => !!(mac.signedIn || {})[k];
  const networks = Object.entries(E.NETWORKS).map(([k, n]) => ({
    network: k, name: n.name, reads: readers[k] ? (readers[k].ok ? "API" : k === "bluesky" ? "needs the account" : "needs a key") : signedIn(k) ? "Mac browser" : "needs sign-in on the Mac",
    lastRead: last && last.read ? last.read[k] || 0 : 0, error: last && last.errors ? last.errors[k] || "" : "", acts: acting(k),
    row: report.networks.find((r) => r.network === k) || null
  }));
  const needs = [];
  if (!last) needs.push("Engagement: the scout has not run yet; it runs every 30 minutes once engagementScout is deployed.");
  else if (stale) needs.push("Engagement: the last scout run was " + Math.round((now - Date.parse(last.at)) / 60000) + " minutes ago; check engagementScout in Systems.");
  Sources.readable(env).filter((r) => !r.ok && r.network !== "bluesky").forEach((r) => needs.push(r.help));
  accounts.filter((a) => !a.connected && a.via !== "mac").forEach((a) => needs.push("Engagement: " + a.help));
  const out = accounts.filter((a) => !a.connected && a.via === "mac").map((a) => a.name);
  if (!mac.at) needs.push("Engagement: the Mac browser agent for " + Act.BROWSER.map((k) => E.NETWORKS[k].name).join(", ") + " is not installed yet. On the Mac: scripts/engagement-mac/run.sh install, then Sign in on the Mac under Accounts (#1991).");
  else if (macLate) needs.push("Engagement: the Mac browser agent last checked in " + Math.round((now - Date.parse(mac.at)) / 60000) + " minutes ago, so " + Act.BROWSER.map((k) => E.NETWORKS[k].name).join(", ") + " wait. Wake the Mac or check ~/Library/Application Support/QALab/engagement-mac/logs.");
  else if (out.length) needs.push("Engagement: the Mac is not signed in to " + out.join(", ") + ". Press Sign in on the Mac under Accounts and sign in once in the window it opens.");
  accounts.filter((a) => a.connected && a.error).forEach((a) => needs.push("Engagement: " + a.name + " poster failed (" + a.error + "). " + (a.via === "mac" ? "Sign in on the Mac again" : "Connect it again") + " if the sign-in expired."));
  if (last && last.aiError) needs.push("Engagement: Gemini failed on the last run (" + last.aiError + "), so no reply was drafted.");
  if (conf.paused) needs.push("Engagement is paused: nothing is planned or pushed until you resume it.");
  const byScore = (a, b) => b.score - a.score;
  return {
    ok: true, settings: conf, paused: conf.paused, live: conf.live, stale, lastRun: last, runs, accounts,
    mac: { at: mac.at || "", host: mac.host || "", readAt: mac.readAt || "", late: macLate, acted: mac.acted || {}, read: mac.read || {} },
    waiting: waitingSnap.docs.map((d) => brief(Object.assign({ key: d.id }, d.data()))).sort(byScore),
    approved: approvedSnap.docs.map((d) => brief(Object.assign({ key: d.id }, d.data()))).sort((a, b) => String(b.actions.reply.decidedAt).localeCompare(String(a.actions.reply.decidedAt))).slice(0, 30),
    posts: top.map(brief), report, networks,
    reports: reportsSnap.docs.map((d) => { const x = d.data(); let r = {}; try { r = JSON.parse(x.json); } catch (error) { r = {}; } return { id: d.id, period: x.period, from: x.from, to: x.to, at: x.at, totals: r.totals || {}, approvalRate: r.approvalRate === undefined ? null : r.approvalRate }; }),
    caps: conf.caps, used: usedToday(cur.find((d) => d.day === E.bogotaDay(now))),
    daily: range.map((day) => {
      const t = E.report("day", cur.filter((d) => d.day === day), [], [], now).totals;
      return { day, read: t.read, candidates: t.candidates, like: t.like, repost: t.repost, follow: t.follow, drafted: t.drafted, approved: t.approved + t.edited, posted: t.posted, done: t.like_done + t.repost_done + t.follow_done, dry: t.like_dry + t.repost_dry + t.follow_dry };
    }),
    needs
  };
}

module.exports = { scout, inbox, runNote, sendReport, buildReport, windowOf, decide, connect, saveSettings, readSettings, source, increments, usedToday, clearCache, withAccounts, STALE, geminiJson };
