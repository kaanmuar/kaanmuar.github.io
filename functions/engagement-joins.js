"use strict";
/*
 * Joins (#2614): the Mac's browser finds groups in our field on Telegram (channels and groups) and Reddit (subreddits)
 * with topic searches in any language (E.DISCOVERY), and joins the best ones within a daily cap that warms up
 * (E.joinCap). Each group is one document, engagement_joins/<network>_<hash of its id>, which is also the join log:
 *
 *   { network, id, name, url, kind, lang, members, about, topic, topics, relevance, score, query,
 *     status, foundAt, seenAt, at, joinedAt, error, tries, leasedAt }
 *
 *   found    a candidate: named for our field or described as in it, public, safe for work, at least MIN_MEMBERS
 *   dry      a dry run (settings.live off) would have joined it; it is joined once live
 *   joined   the Mac joined it (joinedAt, and members, read again as it joined)
 *   member   the account was in it already
 *   requested  the group asks its admins first (LinkedIn); counted as joined for the cap
 *   failed   the network refused it MAX_TRIES times
 *
 * LinkedIn (#3138) joins groups as Carlos's personal profile, and student groups (web dev, CS, design, marketing, QA)
 * count as our field there and everywhere: each joined one's rules go to functions/student-communities.js.
 *
 * engagement_private/mac.joinsFrom[network] is when its first live join went out, where the warm-up starts. Joined
 * groups and channels are also where the Mac reads the field (pool).
 */
const E = require("./engagement");
const Students = require("./student-communities");

const COLLECTION = "engagement_joins";
const JOINS = Object.keys(E.NETWORKS).filter((k) => (E.NETWORKS[k].caps || {}).join);
const MIN_MEMBERS = { telegram: 300, reddit: 1000, linkedin: 200 };
const MAX_TRIES = 3;
const LEASE = 20 * 60 * 1000;
const POOL = 30;
const MAX_GROUPS = 200;
const OWN = { telegram: ["qalab_live"], reddit: ["qalablivereports"], linkedin: [] };
const ID = { telegram: /^[a-z][a-z0-9_]{3,31}$/, reddit: /^[a-z0-9][a-z0-9_]{1,20}$/, linkedin: /^\d{3,12}$/ };
// Where the Mac reads a joined group's posts by name; LinkedIn groups are found and joined only.
const READ = ["telegram", "reddit"];
const LOG = ["joined", "requested", "member", "dry", "failed"];

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
const ref = (db, key) => db.collection(COLLECTION).doc(key);
const leased = (d, now) => d.leasedAt && Date.parse(d.leasedAt) > now - LEASE;

/** One group the Mac found, in our shape with skip saying why we would not join it (""), or null when it is not a group. */
function cleanGroup(g, conf) {
  if (!g || !JOINS.includes(g.network)) return null;
  const raw = String(g.id || "").replace(/^@|^\/?r\//i, "");
  const id = raw.toLowerCase();
  const url = clip(g.url, 300);
  if (!ID[g.network].test(id) || !/^https:\/\//.test(url)) return null;
  const name = clip(g.name, 120) || raw;
  const about = clip(g.about, 500);
  const rel = E.relevance([name, raw.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " "), about].join("\n"));
  const members = num(g.members);
  const text = [name, about].join(" ").toLowerCase();
  const rivals = ((conf && conf.competitors) || []).find((c) => c && text.includes(c));
  const student = Students.isStudentGroup(name + " " + about);
  const skip = OWN[g.network].includes(id) ? "own" : g.nsfw === true ? "nsfw" : g.open === false ? "private" : E.SENSITIVE.test(text) ? "sensitive"
    : rivals ? "competitor" : !rel.hits && !student ? "off-topic" : members < MIN_MEMBERS[g.network] ? "small" : "";
  const hits = rel.hits + (student ? 1 : 0);
  return {
    key: E.keyOf(g.network, id), network: g.network, id, name, url, kind: clip(g.kind, 20), lang: clip(g.lang, 8).toLowerCase(), members, about,
    topic: rel.topic || (student ? "Students" : ""), topics: rel.topics.concat(student ? ["Students"] : []), relevance: hits, score: Math.round((1 + hits) * Math.log10(10 + members) * 100) / 100,
    query: clip(g.query, 80), member: g.member === true, skip
  };
}

/** Groups the Mac found this run: new ones stored as found (or member), known ones refreshed. */
async function found(deps, conf, groups) {
  const { db, now } = deps;
  const at = new Date(now).toISOString();
  const byKey = new Map();
  (Array.isArray(groups) ? groups : []).slice(0, MAX_GROUPS).map((g) => cleanGroup(g, conf)).filter((g) => g && !g.skip).forEach((g) => byKey.set(g.key, g));
  const list = Array.from(byKey.values());
  if (!list.length) return { found: 0, groups: 0 };
  const snaps = await db.getAll(...list.map((g) => ref(db, g.key)));
  let fresh = 0;
  const batch = db.batch();
  list.forEach((g, i) => {
    const { key, member, skip, ...doc } = g;
    if (!snaps[i].exists) {
      fresh += 1;
      batch.set(ref(db, key), Object.assign(doc, { status: member ? "member" : "found", foundAt: at, seenAt: at, at, joinedAt: "", error: "", tries: 0, leasedAt: "" }));
      return;
    }
    const cur = snaps[i].data();
    batch.update(ref(db, key), Object.assign({ members: doc.members || cur.members || 0, about: doc.about || cur.about || "", lang: cur.lang || doc.lang, score: doc.score, seenAt: at },
      member && ["found", "dry", "failed"].includes(cur.status) ? { status: "member", at } : {}));
  });
  await batch.commit();
  return { found: fresh, groups: list.length };
}

/** Where the Mac reads the field this run: per network, joined groups first, then the best found ones (Telegram: channels only, which read without joining). */
async function pool(db) {
  const out = {};
  for (const k of JOINS.filter((x) => READ.includes(x))) {
    const snap = await db.collection(COLLECTION).where("network", "==", k).limit(300).get();
    const rows = snap.docs.map((d) => d.data()).filter((d) => d.status !== "failed");
    const inside = rows.filter((d) => d.status === "joined" || d.status === "member").sort((a, b) => String(b.joinedAt || b.at).localeCompare(String(a.joinedAt || a.at)));
    const outside = rows.filter((d) => !inside.includes(d) && (k !== "telegram" || d.kind === "channel")).sort((a, b) => b.score - a.score);
    out[k] = inside.concat(outside).slice(0, POOL).map((d) => ({ q: (k === "reddit" ? "r/" : "@") + d.id, kind: d.kind || "", joined: inside.includes(d) }));
  }
  return out;
}

/**
 * This run's joins: per network, up to today's warmed-up cap less what today already joined or has out. Live, each is
 * leased and handed to the Mac; in a dry run each is logged as dry once.
 */
async function queue(deps, conf, want) {
  const { db, now, inc } = deps;
  const at = new Date(now).toISOString();
  const day = db.collection("engagement_daily").doc(E.bogotaDay(now));
  const [daySnap, macSnap] = await Promise.all([day.get(), db.collection("engagement_private").doc("mac").get()]);
  const n = (daySnap.exists && daySnap.data().n) || {};
  const from = Object.assign({}, (macSnap.exists && macSnap.data().joinsFrom) || {});
  const tasks = [];
  let dry = 0;
  for (const k of JOINS.filter((x) => want.includes(x))) {
    const rows = (await db.collection(COLLECTION).where("network", "==", k).limit(300).get()).docs.map((d) => ({ key: d.id, doc: d.data() }));
    const out = rows.filter((r) => leased(r.doc, now)).length;
    let left = E.joinCap(conf, k, from[k], now) - ((n[k] || {}).join_done || 0) - ((n[k] || {}).join_dry || 0) - out;
    const open = rows.filter((r) => !leased(r.doc, now) && (r.doc.status === "found" || (conf.live && r.doc.status === "dry"))).sort((a, b) => b.doc.score - a.doc.score);
    for (const r of open) {
      if (left <= 0) break;
      left -= 1;
      if (!conf.live) {
        await ref(db, r.key).update({ status: "dry", at });
        await day.set({ n: { [k]: { join_dry: inc(1) } } }, { merge: true });
        dry += 1;
        continue;
      }
      await ref(db, r.key).update({ leasedAt: at });
      if (!from[k]) {
        from[k] = at;
        await db.collection("engagement_private").doc("mac").set({ joinsFrom: { [k]: at } }, { merge: true });
      }
      tasks.push({ key: r.key, network: k, action: "join", id: r.doc.id, url: r.doc.url, name: r.doc.name, kind: r.doc.kind || "" });
    }
  }
  return { tasks, dry };
}

/** What came of one join: ok (already: the account was in it), retry (refused for now) or an error. Null when the group is gone. */
async function result(deps, b) {
  const { db, now, inc } = deps;
  const snap = await ref(db, b.key).get();
  if (!snap.exists) return null;
  const doc = snap.data();
  const at = new Date(now).toISOString();
  const count = (c) => db.collection("engagement_daily").doc(E.bogotaDay(now)).set({ n: { [doc.network]: { [c]: inc(1) } } }, { merge: true });
  let status = doc.status;
  if (b.ok) {
    status = b.already ? "member" : b.pending ? "requested" : "joined";
    await ref(db, b.key).update({ status, at, joinedAt: b.already ? doc.joinedAt || "" : at, members: num(b.members) || doc.members || 0, error: "", leasedAt: "" });
    if (!b.already) await count("join_done");
    if ((doc.topics || []).includes("Students") || b.rules) await Students.joined(deps, Object.assign({}, doc, { status, members: num(b.members) || doc.members || 0 }), clip(b.rules, 2000));
  } else if (b.retry) {
    await ref(db, b.key).update({ leasedAt: "", error: clip(b.error, 200) });
  } else {
    const tries = (doc.tries || 0) + 1;
    if (tries >= MAX_TRIES) status = "failed";
    await ref(db, b.key).update({ status, at, tries, error: clip(b.error, 200), leasedAt: "" });
    if (status === "failed") await count("join_failed");
  }
  return { ok: true, key: b.key, action: "join", status };
}

/** The join log and today's caps for Jarvis: the latest joins (with group, language and members), and how many are found. */
async function summary(db, conf, mac, used, now) {
  const snap = await db.collection(COLLECTION).where("status", "in", LOG.concat("found")).limit(500).get();
  const rows = snap.docs.map((d) => Object.assign({ key: d.id }, d.data()));
  const from = (mac && mac.joinsFrom) || {};
  return {
    log: rows.filter((d) => LOG.includes(d.status)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30)
      .map((d) => ({ key: d.key, network: d.network, name: d.name, id: d.id, url: d.url, kind: d.kind || "", lang: d.lang || "", members: d.members || 0, topic: d.topic || "", status: d.status, at: d.at, joinedAt: d.joinedAt || "", error: d.error || "" })),
    found: Object.fromEntries(JOINS.map((k) => [k, rows.filter((d) => d.network === k && d.status === "found").length])),
    caps: Object.fromEntries(JOINS.map((k) => [k, E.joinCap(conf, k, from[k], now)])),
    used: Object.fromEntries(JOINS.map((k) => [k, ((used || {})[k] || {}).join || 0])),
    warmup: Object.fromEntries(JOINS.map((k) => [k, from[k] || ""]))
  };
}

module.exports = { COLLECTION, JOINS, MIN_MEMBERS, MAX_TRIES, OWN, cleanGroup, found, pool, queue, result, summary };
