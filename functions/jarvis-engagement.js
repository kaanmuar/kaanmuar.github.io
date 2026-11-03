"use strict";
/*
 * Jarvis > Engagement (#1988): the scout run, the reports, and what the tab and the app read and change.
 *
 *   engagement_posts/<network>_<hash>  each post in our field the scout kept: metrics, score, Gemini's read, the plan
 *   engagement_daily/<YYYY-MM-DD>      counters per Bogotá day (read, candidates, actions, the reply funnel, topics)
 *   engagement_runs/<ISO>              one per scout run
 *   engagement_reports/<period>-<day>  the daily, weekly and monthly reports as sent
 *   engagement_issues/<day>            the weekly report-reply results ticket opened for the week ending that day (#2471)
 *   jarvis_settings/engagement         pause, live (or a dry run), caps, thresholds, competitors, own handles
 *   engagement_private/*               the accounts the poster acts as (functions/engagement-act.js)
 *
 * deps: { db, fetch, env, now, inc (n => FieldValue.increment(n)), push (msg => Promise), mail (msg => Promise),
 *         keys ({ clientId, secret }: the Google OAuth client YouTube refreshes through), openIssue (resultsTicket only) }
 */
const E = require("./engagement");
const Sources = require("./engagement-sources");
const Act = require("./engagement-act");
const R = require("./engagement-reports");

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const STALE = 75 * 60 * 1000;
const PUSH_PER_RUN = 5;
const CHAIN_AI = 20;
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

/** Conversations we already answered or have an answer waiting or approved in, as E.threadKey. */
async function repliedThreads(db) {
  const snap = await db.collection("engagement_posts").where("actions.reply.status", "in", ["waiting", "approved", "posted", "replied"]).limit(2000).get();
  return new Set(snap.docs.map((d) => E.threadKey(d.data())));
}

/** Today's planned actions per network, for the caps. */
function usedToday(daily) {
  const used = {};
  Object.entries((daily && daily.n) || {}).forEach(([net, n]) => { used[net] = { like: n.like || 0, repost: n.repost || 0, follow: n.follow || 0, reply: n.drafted || 0 }; });
  return used;
}

/**
 * Posts read this run, from the cloud readers or the Mac's browser (functions/engagement-mac.js): kept when in our
 * field, scored, read by Gemini, planned, stored and counted, and the best waiting replies pushed to Carlos.
 * read: posts read per network; errors: per network.
 */
async function takeIn(deps, conf, posts, read, errors) {
  const { db, now, env, inc } = deps;
  const seen = new Map();
  posts.forEach((p) => {
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
  const replied = await repliedThreads(db);
  const plan = (p, read) => {
    const d = E.decide(p, read, conf, used, now, follows, replied);
    if (d.actions.follow && d.actions.follow.status === "planned") follows.add(p.network + ":" + String((p.author || {}).handle || "").toLowerCase());
    if (d.actions.reply && d.actions.reply.status === "waiting") replied.add(E.threadKey(p));
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

  const counters = E.rollup(read, docs, { errors: Object.keys(errors || {}).length }, again);
  await dailyRef.set(Object.assign({ day }, increments(counters, inc)), { merge: true });

  const decided = docs.concat(again);
  const waiting = decided.filter((d) => d.actions.reply && d.actions.reply.status === "waiting").sort((a, b) => b.score - a.score);
  let pushed = 0;
  if (!conf.paused && deps.push) for (const d of waiting.slice(0, PUSH_PER_RUN)) { await deps.push(E.replyPush(d)).catch(() => null); pushed += 1; }
  return {
    candidates: candidates.length, fresh: fresh.length, updated: stale.length, risen: again.length, asked: asked.length, aiError,
    engaged: decided.filter((d) => d.verdict === "engage").length, drafted: waiting.length, pushed
  };
}

/**
 * Comment chains (#2421): comments under the replies we posted, and on our own posts and clips (#2447), that we have
 * not liked or answered. Gemini reads each with what we wrote; a like is planned (carried out on the next runs like the scout's own) and an answer
 * waits for Carlos. A comment stays unread until Gemini answers for it, so a failing read is tried again next run.
 */
async function followChains(deps, conf) {
  const { db } = deps;
  const out = { checked: 0, chained: 0, liked: 0, drafted: 0, pushed: 0, aiError: "", errors: {} };
  if (conf.paused) return out;
  const chains = await Act.pendingChains(deps);
  const handled = async (keys) => {
    const snaps = keys.length ? await db.getAll(...keys.map((k) => db.collection("engagement_posts").doc(k))) : [];
    return new Set(keys.filter((k, i) => snaps[i].exists && !E.reopens(snaps[i].data())));
  };
  const inbox = await Act.pendingInbox(deps, handled).catch((error) => ({ found: [], checked: 0, errors: { inbox: String(error.message || error).slice(0, 200) } }));
  Object.assign(out, { checked: chains.checked + inbox.checked, errors: Object.assign({}, chains.errors, inbox.errors) });
  return takeChains(deps, conf, chains.found.concat(inbox.found), out);
}

/** Comments found ([{ parent, comments }]) into chain posts: read by Gemini, a like planned, an answer drafted and pushed. */
async function takeChains(deps, conf, found, into) {
  const { db, now, env, inc } = deps;
  const out = into || { checked: 0, chained: 0, liked: 0, drafted: 0, pushed: 0, aiError: "", errors: {} };
  if (conf.paused) return out;
  const byKey = new Map();
  found.forEach(({ parent, comments }) => comments.forEach((c) => {
    const key = E.keyOf(c.network, c.id);
    if (!byKey.has(key)) byKey.set(key, Object.assign({ key, parent }, c));
  }));
  const all = Array.from(byKey.values());
  const known = all.length ? await db.getAll(...all.map((c) => db.collection("engagement_posts").doc(c.key))) : [];
  const fresh = all.filter((c, i) => !known[i].exists || E.reopens(known[i].data())).slice(0, CHAIN_AI);
  if (!fresh.length) return out;
  if (!env.GEMINI_API_KEY) return Object.assign(out, { aiError: "GEMINI_API_KEY is not set, so comments on our replies wait unread." });
  let ai;
  try { ai = E.parseAi(await geminiJson(deps.fetch, env, E.chainPrompt(fresh)), fresh); } catch (error) { return Object.assign(out, { aiError: String(error.message || error).slice(0, 200) }); }

  const docs = fresh.filter((c) => ai[c.key]).map((c) => Object.assign({ key: c.key }, E.chainDoc(c, c.parent, E.chainDecide(c, ai[c.key], conf, now), ai[c.key], now)));
  if (!docs.length) return out;
  const batch = db.batch();
  docs.forEach((d) => batch.set(db.collection("engagement_posts").doc(d.key), d));
  await batch.commit();
  const n = {};
  docs.forEach((d) => {
    const x = n[d.network] = n[d.network] || {};
    x.chained = (x.chained || 0) + 1;
    if ((d.actions.like || {}).status === "planned") { x.like = (x.like || 0) + 1; out.liked += 1; }
    if ((d.actions.reply || {}).status === "waiting") { x.drafted = (x.drafted || 0) + 1; out.drafted += 1; }
  });
  out.chained = docs.length;
  await db.collection("engagement_daily").doc(E.bogotaDay(now)).set(Object.assign({ day: E.bogotaDay(now) }, increments({ n }, inc)), { merge: true });
  if (deps.push) {
    for (const d of docs.filter((x) => (x.actions.reply || {}).status === "waiting").slice(0, PUSH_PER_RUN)) { await deps.push(E.replyPush(d)).catch(() => null); out.pushed += 1; }
  }
  return out;
}

const LIVE_INDEX = "https://carlosandmunoz.com/assets/live-reports/index.json";
let liveCache = { at: 0, list: [] };

async function liveTargets(deps) {
  if (liveCache.list.length && deps.now - liveCache.at < 3600000) return liveCache.list;
  const res = await deps.fetch(LIVE_INDEX, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("The Live Reports index answered " + res.status);
  liveCache = { at: deps.now, list: R.targets(await res.json()) };
  return liveCache.list;
}

/** Hosts answered with a report reply in the gap (waiting, approved or out), checked 30 at a time. */
async function repliedSites(db, hosts, now) {
  const since = new Date(now - R.SITE_GAP).toISOString();
  const out = new Set();
  for (let i = 0; i < hosts.length; i += 30) {
    const snap = await db.collection("engagement_posts").where("report.host", "in", hosts.slice(i, i + 30)).limit(300).get();
    snap.docs.map((d) => d.data()).filter((d) => d.seenAt >= since && ["waiting", "approved", "posted", "replied"].includes(((d.actions || {}).reply || {}).status)).forEach((d) => out.add(d.report.host));
  }
  return out;
}

/** Hosts whose owner had our mail in the gap: owner notices, and leads uploaded to the cold-email campaigns. */
async function contactedSites(db, hosts, now) {
  const since = new Date(now - R.SITE_GAP).toISOString();
  const want = new Set(hosts);
  const out = new Map();
  for (let i = 0; i < hosts.length; i += 30) {
    const snap = await db.collection("url_review_owner_notice_log").where("host", "in", hosts.slice(i, i + 30)).limit(300).get().catch(() => ({ docs: [] }));
    snap.docs.map((d) => d.data()).filter((d) => String(d.sentAt || "") >= since).forEach((d) => out.set(R.bare(d.host), "owner notice"));
  }
  const sync = await db.collection("jarvis_settings").doc("marketing_sync").get().catch(() => null);
  const rows = (sync && sync.exists && ((sync.data().leads || {}).rows)) || [];
  rows.filter((r) => want.has(R.bare(r.host)) && String(r.uploaded || "") >= since.slice(0, 10)).forEach((r) => out.set(R.bare(r.host), "cold email"));
  const dnc = (sync && sync.exists && ((sync.data().dnc || {}).items)) || [];
  dnc.forEach((x) => { const v = R.bare(String(x.value || "").replace(/^.*@/, "")); if (want.has(v)) out.set(v, "do not contact"); });
  return out;
}

/** A link past R.LONG_LINK through TinyURL; the long one when TinyURL does not answer. */
async function shortLink(fetchImpl, link) {
  if (link.length <= R.LONG_LINK) return link;
  const res = await fetchImpl("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(link), { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const text = res && res.ok ? String(await res.text()).trim() : "";
  return /^https:\/\/tinyurl\.com\/\S+$/.test(text) ? text : link;
}

/**
 * Report replies (#2465): this slot's Live Reports are looked for on the networks, and each post that names one is
 * read by Gemini, decided (functions/engagement-reports.js), stored with campaign "report-reply", counted under
 * engagement_daily report, and its invite pushed to Carlos.
 */
async function reportPass(deps, conf, creds) {
  const { db, now, env, inc } = deps;
  const out = { searched: 0, read: 0, matched: 0, drafted: 0, pushed: 0, aiError: "", errors: {} };
  if (conf.paused) return out;
  const all = await liveTargets(deps);
  const slot = Math.floor(now / Sources.SLOT);
  const ahead = R.pick(all, slot, null, R.PER_RUN * 3);
  const hosts = ahead.map((t) => t.host);
  const [recent, contacted] = await Promise.all([repliedSites(db, hosts, now), contactedSites(db, hosts, now)]);
  const sites = R.pick(ahead, 0, new Set([...recent, ...contacted.keys()]), R.PER_RUN);
  out.searched = sites.length;
  if (!sites.length) return out;
  const m = creds && creds.mastodon;
  const found = await Sources.search({ fetch: deps.fetch, now, env: Object.assign({}, withAccounts(env, creds), m && m.token ? { MASTODON_SEARCH_URL: m.base, MASTODON_SEARCH_TOKEN: m.token } : {}) }, sites.flatMap(R.queries));
  out.errors = found.errors;
  out.read = Object.values(found.read).reduce((a, b) => a + b, 0);

  const byKey = new Map();
  found.posts.forEach((p) => {
    const hit = R.siteOf(p, sites);
    const key = E.keyOf(p.network, p.id);
    if (hit && !byKey.has(key)) byKey.set(key, Object.assign({ key, target: hit.target, match: hit.match }, p, E.score(p, now)));
  });
  const posts = Array.from(byKey.values());
  const known = posts.length ? await db.getAll(...posts.map((p) => db.collection("engagement_posts").doc(p.key))) : [];
  const fresh = posts.filter((p, i) => !known[i].exists).slice(0, conf.perRun);
  if (!fresh.length) return out;

  let ai = {};
  const ask = fresh.filter((p) => !E.guard(p, Object.assign({}, conf, { maxAgeHours: Math.max(conf.maxAgeHours, R.MAX_AGE_HOURS) }), now));
  if (ask.length && env.GEMINI_API_KEY) {
    try { ai = R.parse(await geminiJson(deps.fetch, env, R.prompt(ask)), ask); } catch (error) { out.aiError = String(error.message || error).slice(0, 200); }
  }
  const links = {};
  for (const p of fresh) {
    const a = ai[p.key];
    if (a && a.reply) links[p.key] = await shortLink(deps.fetch, R.linkFor(p.target, p.network, a.lang || String(p.lang || "").slice(0, 2), p.key));
  }
  const day = E.bogotaDay(now);
  const dailyRef = db.collection("engagement_daily").doc(day);
  const dailySnap = await dailyRef.get();
  const ctx = { recent, contacted, replied: await repliedThreads(db), links };
  const used = usedToday(dailySnap.exists ? dailySnap.data() : null);
  const docs = fresh.map((p) => {
    const d = R.decide(p, ai[p.key], p.target, conf, used, now, ctx);
    if (d.actions.reply && d.actions.reply.status === "waiting") ctx.replied.add(E.threadKey(p));
    return Object.assign({ key: p.key }, R.doc(p, ai[p.key], p.target, p.match, d, links[p.key], now));
  });
  const batch = db.batch();
  docs.forEach((d) => batch.set(db.collection("engagement_posts").doc(d.key), d));
  await batch.commit();
  const counters = E.rollup(found.read, docs, { errors: Object.keys(found.errors).length });
  delete counters.runs;
  delete counters.runErrors;
  await dailyRef.set(Object.assign({ day }, increments(Object.assign(counters, { report: R.rollup(sites.length, docs) }), inc)), { merge: true });
  const waiting = docs.filter((d) => (d.actions.reply || {}).status === "waiting");
  Object.assign(out, { matched: docs.length, drafted: waiting.length });
  if (deps.push) for (const d of waiting.slice(0, PUSH_PER_RUN)) { await deps.push(E.replyPush(d)).catch(() => null); out.pushed += 1; }
  return out;
}

/** One scout run. Returns the run document. */
async function scout(deps) {
  const { db, now, env } = deps;
  const started = Date.now();
  const conf = await readSettings(db);
  const expired = await expire(deps).catch(() => 0);
  const creds = await Act.readCreds(db).catch(() => ({}));
  const read = await Sources.readAll({ fetch: deps.fetch, env: withAccounts(env, creds), now });
  const took = await takeIn(deps, conf, read.posts, read.read, read.errors);
  let reports;
  try { reports = await reportPass(deps, conf, creds); } catch (error) { reports = { searched: 0, matched: 0, drafted: 0, pushed: 0, aiError: "", errors: {}, error: String(error.message || error).slice(0, 200) }; }

  let acted = {};
  let actError = "";
  try { acted = await Act.carryOut(deps, conf); } catch (error) { actError = String(error.message || error).slice(0, 200); }
  const sum = (k) => Object.values(acted).reduce((a, x) => a + (x[k] || 0), 0);
  let chains;
  try { chains = await followChains(deps, conf); } catch (error) { chains = { chained: 0, liked: 0, drafted: 0, pushed: 0, aiError: String(error.message || error).slice(0, 200), errors: {} }; }

  const run = {
    at: new Date(now).toISOString(), ms: Date.now() - started, paused: conf.paused, live: conf.live, read: read.read, errors: read.errors, skipped: read.skipped,
    candidates: took.candidates, fresh: took.fresh, updated: took.updated, risen: took.risen, asked: took.asked, aiError: took.aiError,
    engaged: took.engaged, drafted: took.drafted, pushed: took.pushed, expired,
    done: sum("done"), dry: sum("dry"), missed: sum("missed"), posted: sum("posted"), already: sum("already"), actFailed: sum("failed"), acted, actError,
    reports: { searched: reports.searched, read: reports.read || 0, matched: reports.matched, drafted: reports.drafted, pushed: reports.pushed, aiError: reports.aiError, errors: reports.errors, error: reports.error || "" },
    chains: { checked: chains.checked || 0, chained: chains.chained, liked: chains.liked, drafted: chains.drafted, pushed: chains.pushed, aiError: chains.aiError, errors: chains.errors }
  };
  await db.collection("engagement_runs").doc(run.at).set(run);
  await clearCache(db);
  return run;
}

const actNote = (r) => {
  const errs = Object.entries(r.acted || {}).filter(([, x]) => x.error).map(([k, x]) => k + ": " + x.error);
  return (r.done || r.posted ? "; done " + (r.done || 0) + ", replies posted " + (r.posted || 0) : "") + (r.dry ? "; dry run " + r.dry : "")
    + (r.actFailed ? "; " + r.actFailed + " actions failed" : "") + (errs.length ? "; poster: " + errs.join("; ") : "") + (r.actError ? "; poster: " + r.actError : "")
    + (r.already ? "; " + r.already + " replies not sent, we had already answered" : "") + reportNote(r.reports) + chainNote(r.chains);
};
const reportNote = (x) => {
  if (!x) return "";
  const errs = Object.entries(x.errors || {}).map(([k, v]) => k + ": " + v).concat(x.error ? [x.error] : []).concat(x.aiError ? ["Gemini: " + x.aiError] : []);
  return (x.searched ? "; report replies: " + x.searched + " sites looked for, " + x.matched + " posts name them, " + x.drafted + " invites drafted" : "") + (errs.length ? "; report replies: " + errs.join("; ") : "");
};
const chainNote = (c) => {
  if (!c) return "";
  const errs = Object.entries(c.errors || {}).map(([k, v]) => k + ": " + v);
  return (c.chained ? "; " + c.chained + " new comments on our replies (" + c.liked + " to like, " + c.drafted + " answers drafted)" : "")
    + (c.aiError ? "; comment chains: " + c.aiError : "") + (errs.length ? "; comment chains: " + errs.join("; ") : "");
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
  return snap.docs.map((d) => Object.assign({ key: d.id }, d.data())).filter((d) => d.verdict !== "skip" && !d.chain).sort((a, b) => b.score - a.score).slice(0, limit || 15);
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

/**
 * The weekly results ticket for the report replies (#2471), once per week: deps.openIssue({ title, body, labels, parent })
 * files it on the board and answers { number, html_url }; deps.social reads the link results (jarvis-outreach socialResults).
 */
async function resultsTicket(deps) {
  const { db, now } = deps;
  const r = await buildReport(db, "weekly", now);
  const social = await (deps.social || require("./jarvis-outreach").socialResults)({ db, now, days: 7 });
  const issue = R.resultsIssue(r, social);
  if (!issue) return { opened: false, note: "no report reply and no click on one from " + r.from + " to " + r.to };
  const ref = db.collection("engagement_issues").doc(r.to);
  try {
    await ref.create({ at: new Date(now).toISOString(), from: r.from, to: r.to, title: issue.title, issue: null });
  } catch (error) {
    if (error.code === 6) return { opened: false, note: "the ticket for the week to " + r.to + " is already open" };
    throw error;
  }
  try {
    const out = await deps.openIssue(issue);
    await ref.update({ issue: out.number, url: out.html_url });
    return { opened: true, number: out.number, url: out.html_url, note: "opened #" + out.number };
  } catch (error) {
    await ref.delete().catch(() => null);
    throw error;
  }
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
    return { network: doc.network, invite: doc.campaign === R.CAMPAIGN, d };
  });
  await db.collection("engagement_daily").doc(E.bogotaDay(now)).set(increments(Object.assign({ n: { [out.network]: { [out.d.counter]: 1 } }, decided: 1, decideMs: out.d.waited }, out.invite ? { report: { [out.d.counter]: 1 } } : {}), inc), { merge: true });
  const net = E.NETWORKS[out.network] || {};
  const name = net.name || out.network;
  if (out.d.counter === "dismissed") { await clearCache(db); return { key, status: "dismissed", message: "Dismissed." }; }
  const said = out.d.counter === "edited" ? "Your version is approved" : "Approved";
  if (!net.api) { await clearCache(db); return { key, status: "approved", message: said + "; the Mac's browser agent posts it on " + name + " on its next run (every 30 minutes, 7:00 to 22:00)." }; }
  if ((await readSettings(db)).paused) { await clearCache(db); return { key, status: "approved", message: said + "; engagement is paused, so it goes out on " + name + " when you resume." }; }
  const sent = await Act.replyNow(deps, key).catch((error) => ({ status: "approved", error: error.message }));
  await clearCache(db);
  if (sent.status === "posted") return { key, status: "posted", url: sent.url || "", message: "Posted on " + name + "." };
  if (sent.status === "replied") return { key, status: "replied", url: sent.url || "", message: "Not posted: we had already replied there on " + name + "." };
  if (sent.status === "failed") return { key, status: "failed", message: "Not posted on " + name + ": " + sent.error };
  return { key, status: "approved", message: said + "; " + name + " did not take it yet (" + (sent.error || "not sent") + "), so the next scout run tries again." };
}

/** Jarvis > Engagement > Accounts: save Bluesky's app password, start Connect YouTube or Mastodon, or disconnect. */
async function connect(deps, body, redirect) {
  const network = String((body && body.network) || "");
  let out;
  if (body && body.disconnect) out = await Act.disconnect(deps.db, network);
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

const WORDS = { like: "likes", repost: "reposts", follow: "follows", reply: "replies" };
const joinAnd = (list) => list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list.join("");
const STAGE = Object.assign(
  Object.fromEntries(Object.entries(E.NETWORKS).filter(([, n]) => n.browser).map(([k, n]) => [k, joinAnd((n.only || Object.keys(WORDS)).map((a) => WORDS[a]))])),
  { bluesky: "likes, reposts, follows and replies", mastodon: "likes, boosts, follows and replies", youtube: "likes, subscribes and comments", hn: "trends only", devto: "trends only", lobsters: "trends only" }
);
const MAC_STALE = 2 * 3600000;
const AGENT = "node scripts/engagement-browser/agent.js";

const brief = (d) => ({
  key: d.key, network: d.network, url: d.url, author: d.author || {}, title: d.title || "", text: String(d.text || "").slice(0, 600), lang: d.lang, topic: d.topic, words: d.words || [],
  score: d.score, trend: d.trend, metrics: d.metrics || {}, about: d.about || "", why: d.why || "", sentiment: d.sentiment || "", worth: d.worth, verdict: d.verdict, skip: d.skip || "",
  actions: d.actions || {}, seenAt: d.seenAt, createdAt: d.createdAt, chain: d.chain || null, campaign: d.campaign || "", report: d.report || null
});

/** What Jarvis > Engagement and the app show for the selected range. */
async function source(ctx) {
  const db = ctx.db;
  const now = ctx.now;
  const days = Math.max(1, Math.min(365, Number(ctx.days) || 7));
  const range = dayList(E.bogotaDay(now), Math.min(days, 92));
  const [conf, runsSnap, waitingSnap, approvedSnap, cur, prev, top, reportsSnap, accounts, creds, macSnap] = await Promise.all([
    readSettings(db),
    db.collection("engagement_runs").orderBy("at", "desc").limit(12).get(),
    db.collection("engagement_posts").where("actions.reply.status", "==", "waiting").limit(60).get(),
    db.collection("engagement_posts").where("actions.reply.status", "in", ["approved", "posted", "failed", "replied"]).limit(90).get(),
    dailies(db, range),
    dailies(db, dayList(E.bogotaDay(now - range.length * DAY), range.length)),
    topPosts(db, range[0], range[range.length - 1], 40),
    db.collection("engagement_reports").orderBy("at", "desc").limit(9).get(),
    Act.connections(db),
    Act.readCreds(db),
    db.collection("engagement_private").doc("mac").get()
  ]);
  const mac = macSnap.exists && macSnap.data().at ? macSnap.data() : null;
  const signed = (k) => !!(mac && (mac.signedIn || {})[k]);
  const macReads = (k) => (!mac ? "Mac browser, not set up" : !signed(k) ? "Mac browser, not signed in" : "Mac browser" + ((mac.accounts || {})[k] ? " as " + mac.accounts[k] : ""));
  const runs = runsSnap.docs.map((d) => d.data());
  const last = runs[0] || null;
  const stale = !last || now - Date.parse(last.at) > STALE;
  const report = E.report("range", cur, prev, top, now);
  const env = withAccounts(ctx.env || {}, creds);
  const readers = Object.fromEntries(Sources.readable(env).map((r) => [r.network, r]));
  const acting = (k) => {
    if ((E.NETWORKS[k] || {}).browser) {
      if (!signed(k)) return STAGE[k] + " through the Mac's browser once it is signed in there";
      const until = (mac.blocked || {})[k];
      return "Mac browser: " + STAGE[k] + (conf.live ? "" : " (dry run: replies post, the rest is only logged)") + (until ? "; held until " + until + " after a check" : "");
    }
    const a = accounts.find((x) => x.network === k);
    if (!a) return STAGE[k] || "";
    if (!a.connected) return "API, not connected: connect it under Accounts";
    return "API as " + a.account + ": " + STAGE[k] + (conf.live ? "" : " (dry run: replies post, the rest is only logged)") + (a.error ? "; last error: " + a.error : "");
  };
  const networks = Object.entries(E.NETWORKS).map(([k, n]) => ({
    network: k, name: n.name, reads: readers[k] ? (readers[k].ok ? "API" : k === "bluesky" ? "needs the account" : "needs a key") : n.browser ? macReads(k) : "",
    lastRead: n.browser ? (mac && mac.read ? mac.read[k] || 0 : 0) : last && last.read ? last.read[k] || 0 : 0,
    error: n.browser ? (mac && mac.errors ? mac.errors[k] || "" : "") : last && last.errors ? last.errors[k] || "" : "", acts: acting(k),
    row: report.networks.find((r) => r.network === k) || null
  }));
  const needs = [];
  if (!last) needs.push("Engagement: the scout has not run yet; it runs every 30 minutes once engagementScout is deployed.");
  else if (stale) needs.push("Engagement: the last scout run was " + Math.round((now - Date.parse(last.at)) / 60000) + " minutes ago; check engagementScout in Systems.");
  Sources.readable(env).filter((r) => !r.ok && r.network !== "bluesky").forEach((r) => needs.push(r.help));
  accounts.filter((a) => !a.connected).forEach((a) => needs.push("Engagement: " + a.help));
  accounts.filter((a) => a.connected && a.error).forEach((a) => needs.push("Engagement: " + a.name + " poster failed (" + a.error + "). Connect it again if the sign-in expired."));
  const browser = Object.keys(E.NETWORKS).filter((k) => E.NETWORKS[k].browser);
  const bogotaHour = new Date(now - 5 * 3600000).getUTCHours();
  if (!mac) needs.push("Engagement: " + joinAnd(browser.map((k) => E.NETWORKS[k].name)) + " wait for the Mac's browser agent; on the Mac run " + AGENT + " setup (#1991).");
  else {
    if (now - Date.parse(mac.at) > MAC_STALE && bogotaHour >= 8 && bogotaHour < 22) needs.push("Engagement: the Mac's browser agent last reported " + Math.round((now - Date.parse(mac.at)) / 3600000) + " hours ago; it runs every 30 minutes from 7:00 to 22:00 while the Mac is awake (" + AGENT + " status).");
    browser.filter((k) => !signed(k)).forEach((k) => needs.push("Engagement: sign in to " + E.NETWORKS[k].name + " in the agent's Chrome: " + AGENT + " login " + k + "."));
    browser.filter((k) => (mac.blocked || {})[k]).forEach((k) => needs.push("Engagement: " + E.NETWORKS[k].name + " asked for a check (a captcha or unusual activity), so the agent leaves it alone until " + mac.blocked[k] + ". Clear it with " + AGENT + " login " + k + "."));
  }
  if (last && last.aiError) needs.push("Engagement: Gemini failed on the last run (" + last.aiError + "), so no reply was drafted.");
  if (conf.paused) needs.push("Engagement is paused: nothing is planned or pushed until you resume it.");
  const byScore = (a, b) => b.score - a.score;
  return {
    ok: true, settings: conf, paused: conf.paused, live: conf.live, stale, lastRun: last, runs, accounts,
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

module.exports = { scout, takeIn, reportPass, shortLink, followChains, takeChains, runNote, sendReport, buildReport, resultsTicket, windowOf, decide, connect, saveSettings, readSettings, source, increments, usedToday, clearCache, withAccounts, STALE, geminiJson };
