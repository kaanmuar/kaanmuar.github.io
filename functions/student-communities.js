"use strict";
/*
 * Student communities (#3138): where students in web development, QA, design, marketing and CS gather, one document
 * each in engagement_communities/<network>_<hash of its url or search>:
 *
 *   { network, url, name, lang, size, kind, fields, audience, promoAllowed, promoDay, rulesSummary, rules, status,
 *     source, query, joinedAt, lastDraftAt, lastDraftKey, lastPostAt, students, trials, at }
 *
 *   seed       a search the Mac runs (LinkedIn, Facebook, Telegram), its phrases mixed into the Mac's topic searches
 *   candidate  rules not read yet: the Mac joins it within the warm-up cap (functions/engagement-joins.js) and reads them
 *   requested  the group's admins have our join request
 *   active     joined with its rules read: a weekly value post is drafted for Carlos (functions/student-outreach.js)
 *   watch      we comment on students' posts there, never post (rules forbid it, or it is a university's own sub)
 *   paused     Carlos stopped it
 *
 * The curated list is functions/student-communities.json; groups the Mac's searches find join it as candidates.
 * promoAllowed is false until the rules say otherwise: an offer only rides on a post where they allow it (or on
 * promoDay, Bogotá weekday 0-6). LinkedIn and Facebook groups are Carlos's personal profile's, never the page's.
 */
const E = require("./engagement");
const LIST = require("./student-communities.json").communities;

const COLLECTION = "engagement_communities";
const STATUSES = ["seed", "candidate", "requested", "active", "watch", "paused"];
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const POSTABLE = ["group", "subreddit", "tag", "forum"];

const STUDENT_GROUP = /(?<!\p{L})(students?|estudiantes?|estudantes?|studenten|studierende|studium|[ée]tudiants?|studenti|universit\p{L}*|college|campus|bootcamps?|beginners?|newbies?|codenewbies?|learn(?:ing)? to code|aprend(?:iendo|endo) a programar|junior devs?|trainees?|freshers?|hackathons?|cs ?majors?)(?!\p{L})/iu;
// A rule that bans promotion wins over one that allows it; a day named for self-promotion is the only day it is allowed.
const NO_PROMO = /(no|without|zero) (self[- ]?promo\w*|promo\w*|advertis\w*|ads|spam|selling|solicit\w*|marketing|links? to your)|self[- ]?promo\w* (is )?(not allowed|prohibited|banned|forbidden)|advertising (is )?(not allowed|prohibited)|sin (auto)?promoci|no (se permite|está permitid[ao]) (la )?(publicidad|promoci)|prohibid[ao] (la )?(publicidad|promoci|spam)|sem (auto)?promo|proibid[ao] (propaganda|divulga)|keine (eigen)?werbung|werbung (ist )?(nicht erlaubt|verboten)|pas de (publicit|promo|pub)|publicité (est )?interdite|niente (pubblicit|promo|spam)|vietat[ao] (la )?(pubblicit|promo)/i;
const PROMO_OK = /(self[- ]?promo\w*|promotion|promote your|share your (own )?(project|work|tool|product)s?|showcase)[^.\n]{0,40}(allowed|welcome|permitted|ok\b|encouraged)|(allowed|welcome)[^.\n]{0,20}(self[- ]?promo|promot)/i;
const PROMO_DAY = [["sunday", 0], ["monday", 1], ["tuesday", 2], ["wednesday", 3], ["thursday", 4], ["friday", 5], ["saturday", 6]];

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
const ref = (db, key) => db.collection(COLLECTION).doc(key);
const keyOf = (c) => E.keyOf(c.network, c.url || c.network + ":" + String(c.query || c.name || "").toLowerCase());

/** Whether a group's name or description says it is for students or learners. */
const isStudentGroup = (text) => STUDENT_GROUP.test(String(text || ""));

/** What a group's rules allow: { promoAllowed, promoDay (-1: none), summary }. Unread or unclear rules allow nothing. */
function readRules(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return { promoAllowed: false, promoDay: -1, summary: "" };
  const day = (PROMO_DAY.find(([d]) => new RegExp("(self[- ]?promo\\w*|showoff|show[- ]off|promotion)[^.]{0,30}" + d + "|" + d + "[^.]{0,30}(self[- ]?promo\\w*|showoff|show[- ]off|promotion)", "i").test(t)) || [])[1];
  const banned = NO_PROMO.test(t);
  const promoAllowed = !banned && PROMO_OK.test(t);
  const lines = t.split(/(?<=[.!?])\s+|\s*\n\s*/).filter((l) => /promo|advertis|spam|link|sell|solicit|publicidad|propaganda|werbung|publicit|pubblicit|self/i.test(l));
  return { promoAllowed, promoDay: day === undefined ? -1 : day, summary: clip(lines.slice(0, 3).join(" ") || t, 300) };
}

/** A community in our shape, for a new document. */
function cleanCommunity(c, source, now) {
  const at = new Date(now).toISOString();
  return {
    network: clip(c.network, 20), url: clip(c.url, 300), name: clip(c.name, 120), lang: LANGS.includes(c.lang) ? c.lang : "en", size: num(c.size || c.members),
    kind: clip(c.kind, 20), fields: (Array.isArray(c.fields) ? c.fields : []).map((f) => clip(f, 20)).slice(0, 6), audience: c.audience === "learners" ? "learners" : "students",
    promoAllowed: c.promoAllowed === true, promoDay: Number.isInteger(c.promoDay) ? c.promoDay : -1, rulesSummary: clip(c.rulesSummary, 300), rules: "",
    status: STATUSES.includes(c.status) ? c.status : "candidate", source, query: clip(c.query || (c.kind === "search" ? c.name : ""), 80),
    joinedAt: "", lastDraftAt: "", lastDraftKey: "", lastPostAt: "", students: 0, trials: 0, foundAt: at, at
  };
}

/**
 * The curated list into the collection: new ones stored whole, known ones keep what the Mac and Carlos set (status,
 * rules, dates, counts). Curated subreddits we may post in are handed to the joins queue as found.
 */
async function seed(deps) {
  const { db, now } = deps;
  const keys = LIST.map(keyOf);
  const snaps = await db.getAll(...keys.map((k) => ref(db, k)));
  const batch = db.batch();
  let fresh = 0;
  LIST.forEach((c, i) => {
    const doc = cleanCommunity(c, "curated", now);
    if (!snaps[i].exists) { fresh += 1; batch.set(ref(db, keys[i]), doc); return; }
    batch.update(ref(db, keys[i]), { name: doc.name, kind: doc.kind, fields: doc.fields, audience: doc.audience });
  });
  await batch.commit();
  const joins = LIST.filter((c) => c.network === "reddit" && c.status === "candidate").map((c) => {
    const id = String(c.url.match(/\/r\/([^/]+)/)[1]).toLowerCase();
    return { key: E.keyOf("reddit", id), doc: { network: "reddit", id, name: c.name, url: c.url, kind: "subreddit", lang: c.lang, members: num(c.size), about: c.rulesSummary || "", topic: "Students", topics: ["Students"], relevance: 1, score: 1, query: "curated" } };
  });
  const jsnaps = joins.length ? await db.getAll(...joins.map((j) => db.collection("engagement_joins").doc(j.key))) : [];
  const at = new Date(now).toISOString();
  const jb = db.batch();
  let queued = 0;
  joins.forEach((j, i) => {
    if (jsnaps[i].exists) return;
    queued += 1;
    jb.set(db.collection("engagement_joins").doc(j.key), Object.assign(j.doc, { status: "found", foundAt: at, seenAt: at, at, joinedAt: "", error: "", tries: 0, leasedAt: "" }));
  });
  if (queued) await jb.commit();
  return { communities: LIST.length, fresh, queued };
}

/** Student groups among those the Mac's searches found: new ones join the collection as candidates. */
async function searched(deps, groups) {
  const { db, now } = deps;
  const list = (Array.isArray(groups) ? groups : []).filter((g) => g && g.url && /^https:\/\//.test(g.url) && isStudentGroup([g.name, g.about].join(" ")) && g.nsfw !== true && g.open !== false).slice(0, 100);
  if (!list.length) return { found: 0 };
  const keys = list.map((g) => keyOf({ network: g.network, url: g.url }));
  const snaps = await db.getAll(...keys.map((k) => ref(db, k)));
  const batch = db.batch();
  let found = 0;
  list.forEach((g, i) => {
    if (snaps[i].exists) { batch.update(ref(db, keys[i]), { size: num(g.members) || snaps[i].data().size || 0 }); return; }
    found += 1;
    batch.set(ref(db, keys[i]), cleanCommunity({ network: g.network, url: g.url, name: g.name, lang: g.lang, size: g.members, kind: g.network === "reddit" ? "subreddit" : "group", fields: [], audience: "students", rulesSummary: clip(g.about, 300), status: "candidate", query: g.query }, "searched", now));
  });
  await batch.commit();
  return { found };
}

/** A group the Mac joined (or asked to join): its rules read, and the community active, requested or still watched. */
async function joined(deps, group, rules) {
  const { db, now } = deps;
  const key = keyOf({ network: group.network, url: group.url });
  const snap = await ref(db, key).get();
  const cur = snap.exists ? snap.data() : cleanCommunity({ network: group.network, url: group.url, name: group.name, lang: group.lang, size: group.members, kind: group.kind === "subreddit" ? "subreddit" : "group", status: "candidate" }, "searched", now);
  const read = readRules(rules);
  const at = new Date(now).toISOString();
  const status = group.status === "requested" ? "requested" : ["watch", "paused"].includes(cur.status) ? cur.status : "active";
  const patch = Object.assign({}, cur, { status, size: num(group.members) || cur.size || 0, joinedAt: cur.joinedAt || at, at },
    rules ? { rules: clip(rules, 2000), rulesSummary: read.summary || cur.rulesSummary, promoAllowed: read.promoAllowed, promoDay: read.promoDay } : {});
  await ref(db, key).set(patch);
  return { key, status, promoAllowed: patch.promoAllowed };
}

/** The Mac's student searches: [{ q, lang, topic: "Students" }], one per seed phrase and language. */
function queries() {
  const seen = new Set();
  return LIST.filter((c) => c.kind === "search").map((c) => ({ q: c.query || c.name, lang: c.lang, topic: "Students" })).filter((t) => !seen.has(t.lang + t.q) && seen.add(t.lang + t.q));
}

/** The Mac's topic searches with the student ones mixed in, one every `every`. */
function withStudents(topics, every) {
  const extra = queries();
  const out = [];
  (topics || []).forEach((t, i) => { out.push(t); if (extra.length && (i + 1) % (every || 4) === 0) out.push(extra[((i + 1) / (every || 4) - 1) % extra.length]); });
  return out;
}

/** Counts for Jarvis and the ticket: by network, language and status. */
async function summary(db) {
  const rows = (await db.collection(COLLECTION).limit(1000).get()).docs.map((d) => d.data());
  const by = (f) => rows.reduce((o, r) => Object.assign(o, { [f(r)]: (o[f(r)] || 0) + 1 }), {});
  return { total: rows.length, network: by((r) => r.network), lang: by((r) => r.network + "/" + r.lang), status: by((r) => r.status), students: rows.reduce((n, r) => n + (r.students || 0), 0), trials: rows.reduce((n, r) => n + (r.trials || 0), 0) };
}

module.exports = { COLLECTION, STATUSES, LANGS, POSTABLE, LIST, keyOf, isStudentGroup, readRules, cleanCommunity, seed, searched, joined, queries, withStudents, summary };
