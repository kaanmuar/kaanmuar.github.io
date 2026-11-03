"use strict";
/*
 * The Mac's browser agent (#1991): X, LinkedIn, Facebook, Instagram, Threads and TikTok have no API we can search
 * and answer through, so scripts/engagement-browser/agent.js drives a real Chrome on the Mac, signed in once in its
 * own profile, every 30 minutes. It talks to the jarvis function with these ops, signed with the token it paired:
 *
 *   engagement-mac-sites   {}                                            this slot's report-reply site queries (#2467):
 *                                                                        the Live Reports the cloud looks for on
 *                                                                        Bluesky, Mastodon and YouTube
 *   engagement-mac-ingest  { posts, reports, comments, errors, signedIn, accounts, agent }  posts it read; scored,
 *                                                                        read by Gemini and planned like the scout's
 *                                                                        own; reports: posts read for a site query,
 *                                                                        each with its query, through the report pass
 *                                                                        (functions/engagement-reports.js);
 *                                                                        comments: replies and mentions of us from a
 *                                                                        network's notifications (#2424), liked and
 *                                                                        answered like the API networks' (#2447)
 *   engagement-mac-queue   { networks }                                  planned likes, reposts, follows and approved
 *                                                                        replies for the networks signed in; a
 *                                                                        LinkedIn like names its reaction
 *   engagement-mac-result  { key, action, ok, url, reaction, error, retry, already }  what came of one task;
 *                                                                        already: the post had our earlier reply
 *                                                                        (url), so none was sent
 *
 *   engagement_private/mac  { tokenHash, pairedAt, at, read, errors, signedIn, accounts, agent, blocked }
 *
 * `agent.js pair` writes tokenHash with the Mac's gcloud sign-in, so no secret is deployed. A queued task is leased
 * for LEASE so a second run never doubles it; one the Mac cannot carry out in ACT_WINDOW turns missed, and in a dry
 * run (settings.live off) planned likes, reposts and follows turn dry as they are queued. Replies Carlos approved go
 * out either way.
 */
const crypto = require("crypto");
const E = require("./engagement");
const J = require("./jarvis-engagement");
const R = require("./engagement-reports");
const Act = require("./engagement-act");

const BROWSER = Object.keys(E.NETWORKS).filter((k) => E.NETWORKS[k].browser);
const CARRIED = ["like", "repost", "follow"];
const LEASE = 20 * 60 * 1000;
const PER_NETWORK = 6;
const MAX_POSTS = 300;

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const macRef = (db) => db.collection("engagement_private").doc("mac");
const hash = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

class MacError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

/** The token the Mac sends, against the hash agent.js pair stored. */
async function verify(db, token) {
  const t = String(token || "");
  if (t.length < 32) throw new MacError("Pair the Mac first: node scripts/engagement-browser/agent.js pair", 401);
  const snap = await macRef(db).get();
  const want = snap.exists ? String(snap.data().tokenHash || "") : "";
  const got = hash(t);
  if (!want || want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) throw new MacError("This Mac is not paired, or was paired again elsewhere.", 403);
}

/** One post the Mac read, in the scout's shape, or null when it is not one of the Mac's networks or has no id. */
function cleanPost(p) {
  if (!p || !BROWSER.includes(p.network) || !clip(p.id, 300) || !/^https:\/\//.test(String(p.url || ""))) return null;
  const a = p.author || {};
  const m = p.metrics || {};
  const at = Date.parse(p.createdAt);
  return {
    network: p.network, id: clip(p.id, 300), url: clip(p.url, 500),
    author: { handle: clip(a.handle, 120).replace(/^@/, ""), name: clip(a.name, 120), id: clip(a.id, 200), followers: num(a.followers) },
    title: clip(p.title, 300), text: String(p.text || "").slice(0, 1200), lang: clip(p.lang, 8), createdAt: Number.isFinite(at) ? new Date(at).toISOString() : "",
    isReply: p.isReply === true, metrics: { likes: num(m.likes), replies: num(m.replies), reposts: num(m.reposts), views: num(m.views) },
    tags: (Array.isArray(p.tags) ? p.tags : []).map((t) => clip(t, 40)).filter(Boolean).slice(0, 10)
  };
}

const netMap = (obj, fn) => Object.fromEntries(BROWSER.filter((k) => obj && obj[k] !== undefined).map((k) => [k, fn(obj[k])]));

/** This slot's site queries, the same sites the cloud's report pass looks for. */
async function sites(deps) {
  const conf = await J.readSettings(deps.db);
  if (conf.paused) return { ok: true, paused: true, queries: [] };
  const look = await J.reportSites(deps);
  return { ok: true, paused: false, queries: look.sites.flatMap(R.queries) };
}

/** Posts the Mac read: the same scoring, Gemini read and plan as the scout's, site posts through the report pass, and the agent's heartbeat. */
async function ingest(deps, body) {
  const { db, now } = deps;
  const b = body || {};
  const posts = (Array.isArray(b.posts) ? b.posts : []).slice(0, MAX_POSTS).map(cleanPost).filter(Boolean);
  const read = Object.fromEntries(BROWSER.map((k) => [k, 0]).filter(([k]) => (b.signedIn || {})[k]));
  posts.forEach((p) => { read[p.network] = (read[p.network] || 0) + 1; });
  const sitePosts = (Array.isArray(b.reports) ? b.reports : []).slice(0, MAX_POSTS).map((x) => {
    const p = cleanPost(x);
    return p && Object.assign(p, { query: clip(x.query, 80) });
  }).filter((p) => p && p.query);
  const siteRead = {};
  sitePosts.forEach((p) => { siteRead[p.network] = (siteRead[p.network] || 0) + 1; });
  const errors = netMap(b.errors, (v) => clip(v, 200));
  const conf = await J.readSettings(db);
  const r = await J.takeIn(deps, conf, posts, read, errors);
  const rep = await J.macReports(deps, conf, sitePosts, siteRead).catch((error) => ({ matched: 0, drafted: 0, aiError: String(error.message || error).slice(0, 200) }));
  Object.entries(siteRead).forEach(([k, n]) => { read[k] = (read[k] || 0) + n; });
  const comments = (Array.isArray(b.comments) ? b.comments : []).slice(0, MAX_POSTS).map((c) => {
    const p = cleanPost(c);
    return p && Object.assign(p, { liked: c.liked === true, answered: c.answered === true, on: clip(c.on, 300), ours: clip(c.ours, 500) });
  }).filter(Boolean);
  const found = comments.map((c) => ({ parent: { key: "", own: true, network: c.network, id: c.on, thread: c.on || c.id, text: "", score: 0, actions: { reply: { draft: c.ours } } }, comments: [c] }));
  const chains = found.length ? await J.takeChains(deps, conf, found).catch((error) => ({ chained: 0, aiError: String(error.message || error).slice(0, 200) })) : { chained: 0, aiError: "" };
  await macRef(db).set({
    at: new Date(now).toISOString(), read, errors, signedIn: netMap(b.signedIn, (v) => v === true), accounts: netMap(b.accounts, (v) => clip(v, 120)),
    blocked: netMap(b.blocked, (v) => clip(v, 30)), agent: clip(b.agent, 40), fresh: r.fresh, engaged: r.engaged, drafted: r.drafted,
    reports: { read: sitePosts.length, matched: rep.matched, drafted: rep.drafted }
  }, { merge: true });
  await J.clearCache(db);
  return {
    ok: true, read: posts.length, fresh: r.fresh, engaged: r.engaged, drafted: r.drafted, aiError: r.aiError || rep.aiError || chains.aiError || "", chained: chains.chained || 0,
    reports: { read: sitePosts.length, matched: rep.matched, drafted: rep.drafted }
  };
}

const leased = (x, now) => x && x.leasedAt && Date.parse(x.leasedAt) > now - LEASE;

// LinkedIn's reactions, in its menu's order. A like there is whichever one fits the post; the rest stay a thumbs-up.
const REACTIONS = ["like", "celebrate", "support", "love", "insightful", "funny"];
const REACTS = [
  ["funny", /😂|🤣|😆|\b(lol|lmao|haha\w*|jaja\w*|kkkk\w*|meme)\b/i],
  ["celebrate", /🎉|🥳|🚀|🏆|\b(excited|thrilled|proud|happy|pleased) to (announce|share)|\b(announc\w*|(just|finally|we('ve| have)?) (launched|shipped|released|won)|milestone|anniversary|award\w*|certified|certification|promoted|new (role|job|position)|lanz\w*|anunci\w*|orgullos\w*|celebr\w*|lançam\w*|conquist\w*|certificad\w*)\b/iu],
  ["support", /\b(struggl\w*|burn ?out|burned out|rejected|tough (week|year|time)|hard (week|year|time)|open to work|opentowork|looking for (a )?(new )?(role|job|position|opportunit\w*)|busco (empleo|trabajo)|procuro emprego|difícil|frustra\w*)\b/iu],
  ["love", /❤|💙|💜|🙏|\b(grateful|gratitude|thank you all|thankful|agradecid\w*|gratitud|obrigad\w*|gracias a todos)\b/iu],
  ["insightful", /\b(how to|tips?|guide|checklist|lessons?( learned)?|mistakes|step[- ]by[- ]step|best practices|deep dive|explained|here'?s (how|why)|cómo|consejos|guía|errores|lecciones|dicas|como fazer|passo a passo|boas práticas)\b/iu]
];

/** The LinkedIn reaction that fits a stored post: funny, celebrate, support or love by what it says, insightful for a long or how-to post in our field, else like. */
function reaction(doc) {
  const d = doc || {};
  const text = [d.title, d.text].join("\n");
  if (d.sentiment === "negative" || d.sentiment === "angry") return /\b(struggl|burn ?out|open to work|opentowork)/i.test(text) ? "support" : "like";
  const hit = REACTS.find(([, re]) => re.test(text));
  if (hit) return hit[0];
  return String(d.text || "").length >= 600 && (d.relevance || 0) >= 2 ? "insightful" : "like";
}

/** The Mac's work for this run: approved replies first, then planned likes, reposts and follows, best first. */
async function queue(deps, body) {
  const { db, now, inc } = deps;
  const conf = await J.readSettings(db);
  if (conf.paused) return { ok: true, paused: true, live: conf.live, tasks: [] };
  const want = (Array.isArray((body || {}).networks) ? body.networks : BROWSER).filter((k) => BROWSER.includes(k));
  const rows = (snap) => snap.docs.map((d) => ({ key: d.id, ref: d.ref, doc: d.data() })).filter((t) => BROWSER.includes(t.doc.network));
  const planned = (await Promise.all(CARRIED.map((a) => db.collection("engagement_posts").where("actions." + a + ".status", "==", "planned").limit(300).get()
    .then((s) => rows(s).map((t) => Object.assign(t, { action: a })))))).flat().sort((a, b) => (b.doc.score || 0) - (a.doc.score || 0));
  const replies = rows(await db.collection("engagement_posts").where("actions.reply.status", "==", "approved").limit(50).get()).map((t) => Object.assign(t, { action: "reply" }));
  const at = new Date(now).toISOString();
  const day = db.collection("engagement_daily").doc(E.bogotaDay(now));
  const tasks = [];
  const per = {};
  const take = async (t) => {
    if (!want.includes(t.doc.network) || leased(t.doc.actions[t.action], now) || (per[t.doc.network] || 0) >= PER_NETWORK) return;
    per[t.doc.network] = (per[t.doc.network] || 0) + 1;
    await t.ref.update({ ["actions." + t.action + ".leasedAt"]: at, updatedAt: at });
    const r = t.doc.actions.reply || {};
    tasks.push({
      key: t.key, network: t.doc.network, action: t.action, id: t.doc.id, url: t.doc.url, author: { handle: (t.doc.author || {}).handle || "", id: (t.doc.author || {}).id || "" },
      draft: t.action === "reply" ? r.draft || "" : "", lang: t.action === "reply" ? r.lang || t.doc.lang || "" : "",
      reaction: t.action === "like" && t.doc.network === "linkedin" ? reaction(t.doc) : ""
    });
  };
  for (const t of replies) await take(t);
  let dry = 0;
  let missed = 0;
  for (const t of planned) {
    const k = "actions." + t.action + ".";
    if (Date.parse(t.doc.decidedAgainAt || t.doc.seenAt || 0) < now - Act.ACT_WINDOW) {
      await t.ref.update({ [k + "status"]: "missed", [k + "at"]: at, [k + "error"]: "The Mac's browser did not get to it within 6 hours.", updatedAt: at });
      missed += 1;
    } else if (!conf.live) {
      await t.ref.update({ [k + "status"]: "dry", [k + "at"]: at, updatedAt: at });
      await day.set({ n: { [t.doc.network]: { [t.action + "_dry"]: inc(1) } } }, { merge: true });
      dry += 1;
    } else await take(t);
  }
  if (dry || missed) await J.clearCache(db);
  return { ok: true, paused: false, live: conf.live, tasks, dry, missed };
}

/** What came of one task the Mac carried out. retry: the network refused for now (signed out, a check), so it stays queued. */
async function result(deps, body) {
  const { db, now, inc } = deps;
  const b = body || {};
  const key = String(b.key || "");
  const action = String(b.action || "");
  if (!/^[a-z]+_[a-f0-9]{20}$/.test(key) || !CARRIED.concat("reply").includes(action)) throw new MacError("That is not a task the Mac was given.");
  const ref = db.collection("engagement_posts").doc(key);
  const snap = await ref.get();
  const doc = snap.exists ? snap.data() : null;
  if (!doc || !BROWSER.includes(doc.network)) throw new MacError("That post is gone.", 404);
  const cur = (doc.actions || {})[action] || {};
  const k = "actions." + action + ".";
  const at = new Date(now).toISOString();
  const count = (c) => db.collection("engagement_daily").doc(E.bogotaDay(now)).set({ n: { [doc.network]: { [c]: inc(1) } } }, { merge: true });
  const error = clip(b.error, 200);
  let status;
  if (action === "reply") {
    if (cur.status !== "approved") return { ok: true, status: cur.status || "", note: "Already " + (cur.status || "gone") + "." };
    const tries = (cur.tries || 0) + (b.retry ? 0 : 1);
    if (b.already) {
      status = "replied";
      await ref.update({ [k + "status"]: status, [k + "at"]: at, [k + "url"]: clip(b.url, 500), [k + "error"]: "We had already replied there, so this one was not sent.", [k + "leasedAt"]: "", [k + "by"]: "mac", updatedAt: at });
      await count("already");
    } else if (b.ok) {
      status = "posted";
      await ref.update({ [k + "status"]: status, [k + "postedAt"]: at, [k + "url"]: clip(b.url, 500), [k + "tries"]: tries, [k + "error"]: "", [k + "leasedAt"]: "", [k + "by"]: "mac", updatedAt: at });
      await count("posted");
      if (doc.campaign === "report-reply") await db.collection("engagement_daily").doc(E.bogotaDay(now)).set({ report: { posted: inc(1) } }, { merge: true });
    } else {
      status = !b.retry && tries >= Act.MAX_TRIES ? "failed" : "approved";
      await ref.update(Object.assign({ [k + "error"]: error, [k + "tries"]: tries, [k + "leasedAt"]: "", updatedAt: at }, status === "failed" ? { [k + "status"]: status } : {}));
      if (status === "failed") await count("failed");
    }
  } else {
    if (cur.status !== "planned") return { ok: true, status: cur.status || "", note: "Already " + (cur.status || "gone") + "." };
    if (b.ok) {
      status = "done";
      await ref.update(Object.assign({ [k + "status"]: status, [k + "at"]: at, [k + "url"]: clip(b.url, 500), [k + "leasedAt"]: "", [k + "by"]: "mac", updatedAt: at },
        action === "like" && REACTIONS.includes(b.reaction) ? { [k + "reaction"]: b.reaction } : {}));
      await count(action + "_done");
    } else if (b.retry) {
      status = "planned";
      await ref.update({ [k + "leasedAt"]: "", [k + "error"]: error, updatedAt: at });
    } else {
      status = "failed";
      await ref.update({ [k + "status"]: status, [k + "at"]: at, [k + "error"]: error, [k + "leasedAt"]: "", updatedAt: at });
      await count("act_failed");
    }
  }
  await J.clearCache(db);
  return { ok: true, key, action, status };
}

const OPS = { "engagement-mac-sites": sites, "engagement-mac-ingest": ingest, "engagement-mac-queue": queue, "engagement-mac-result": result };

/** The jarvis function's entry for the Mac: checks the token, then runs the op. */
async function handle(deps, body, token) {
  const op = OPS[String((body || {}).op || "")];
  if (!op) throw new MacError("Unknown Mac op.");
  await verify(deps.db, token);
  return op(deps, body);
}

module.exports = { BROWSER, LEASE, PER_NETWORK, REACTIONS, MacError, hash, verify, cleanPost, reaction, sites, ingest, queue, result, handle };
