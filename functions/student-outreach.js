"use strict";
/*
 * Student outreach (#3138): students get a 2-day free trial of the full audit and a discount after it
 * (functions/outreach-trials.js, kind "student", TRIAL.followup.student). Value first, everywhere:
 *
 *   weekly posts   each active student community (functions/student-communities.js) gets one value post a week in its
 *                  language (functions/student-outreach-copy.json). Where its rules allow promotion (or on its
 *                  promoDay) the post adds the offer and asks students to comment or write for a personal link: trial
 *                  codes are one use each, so no shared code is ever posted.
 *   student posts  a portfolio launch or "roast my site" the Mac read gets a value comment, no link; the offer and a
 *                  trial of their own join it only where promotion is allowed and the author reads as a student.
 *   commenters     someone who answered us and reads as a student gets a trial of their own (locked to their school
 *                  domain when we know it) and an invite by DM.
 *
 * Every draft is an engagement_posts document (campaign "students"). sendMode decides who sends it: "approve" (the
 * first week after launch, Carlos's call) leaves it waiting for him in the engagement queue; "auto" approves it as
 * written. Approved drafts on Reddit and LinkedIn are the Mac's: publish (a post), reply (a comment) and dm tasks, as
 * Carlos's own accounts, within CAPS a day per network. Elsewhere (DEV, forums, Facebook groups) Carlos copies them.
 * Each student is tracked in outreach_people (kind student) and each community counts its students and trials.
 */
const E = require("./engagement");
const C = require("./student-communities");
const People = require("./outreach-people");
const Trials = require("./outreach-trials");
const { studentCheck } = require("./student-check");
const COPY = require("./student-outreach-copy.json");

const CAMPAIGN = "students";
const WEEK = 7 * 24 * 3600 * 1000;
const POSTS_PER_RUN = 3;
const LEADS_PER_RUN = 5;
const TTL = 5 * 24 * 3600 * 1000;
const MODES = ["approve", "auto"];
// What the Mac sends for students a day, per network and task, as Carlos's own accounts.
const CAPS = { reddit: { publish: 1, reply: 4, dm: 3 }, linkedin: { publish: 1, reply: 4, dm: 5 } };
const ACTIONS = ["publish", "reply", "dm"];
const STATE = () => ["engagement_private", "students"];

const STUDENT_POST = /(roast my (site|website|portfolio)|(review|feedback|critique|thoughts) (on|of|for) my (portfolio|website|site|personal site|landing page)|my (first|new) (portfolio|website|personal site|web ?site)|portfolio (review|feedback|launch)|just (launched|built|finished|shipped) my (portfolio|website|site|personal site)|rate my (portfolio|website|site)|mi (primer )?portafolio|mi (primera )?(web|página web|página|sitio web)|feedback (de|sobre) mi (portafolio|web|página)|meu (primeiro )?portf[oó]lio|meu (primeiro )?site|feedback (do|sobre o) meu (portf[oó]lio|site)|meine? (erstes? )?(portfolio|webseite|website)|feedback zu meine[mr]? (portfolio|webseite|website)|mon (premier )?(portfolio|site)|avis sur mon (portfolio|site)|il mio (primo )?(portfolio|sito)|feedback sul mio (portfolio|sito))/iu;

const fill = (s, v) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (v[k] === undefined ? m : String(v[k])));
const copyOf = (lang) => COPY[C.LANGS.includes(lang) ? lang : "en"] || COPY.en;
const weekOf = (now) => Math.floor(now / WEEK);
const weekday = (now) => new Date(E.bogotaDay(now) + "T12:00:00Z").getUTCDay();
const lower = (s) => String(s || "").toLowerCase().replace(/\/+$/, "");
const iso = (ms) => new Date(ms).toISOString();
const stateRef = (db) => db.collection(STATE()[0]).doc(STATE()[1]);

/** The offer's terms: free days and the discount after them. */
const terms = () => ({ days: Trials.TRIAL.days, pct: Trials.TRIAL.followup.student });

/** Whether a community allows the offer today: its rules allow promotion, or today is its promotion day. */
const offerAllowed = (c, now) => !!c && (c.promoAllowed === true || (Number.isInteger(c.promoDay) && c.promoDay >= 0 && c.promoDay === weekday(now)));

/**
 * Who sends student drafts now: "approve" (each waits for Carlos) or "auto" (approved as written, sent by the Mac
 * within CAPS). deps.sendMode is where #3137's shared switch plugs in; until then the engagement settings'
 * studentsSendMode, else approve for the first week after launch (the first run) and auto after it.
 */
async function sendMode(deps) {
  if (deps.sendMode) {
    const m = await deps.sendMode("students");
    if (MODES.includes(m)) return m;
  }
  const [conf, state] = await Promise.all([deps.db.collection("jarvis_settings").doc("engagement").get(), stateRef(deps.db).get()]);
  const set = conf.exists ? conf.data().studentsSendMode : "";
  if (MODES.includes(set)) return set;
  const launched = Date.parse((state.exists && state.data().launchedAt) || "");
  return launched && deps.now >= launched + WEEK ? "auto" : "approve";
}

/** Which Mac task carries a student draft, or "" when Carlos posts it himself. */
function carriedAs(network, kind, url) {
  const action = kind === "post" ? "publish" : kind === "dm" ? "dm" : "reply";
  if (!CAPS[network]) return "";
  if (action === "publish" && network === "linkedin" && !/\/groups\/\d+/.test(String(url))) return "";
  if (action === "publish" && network === "reddit" && !/\/r\/[^/]+/.test(String(url))) return "";
  return action;
}

/** A student trial: { code, url }, or { error } when the ledger cannot mint one. */
async function mint(deps, p) {
  try {
    return await Trials.mintTrial(deps.db, Object.assign({ kind: "student", by: CAMPAIGN }, p), deps.now);
  } catch (error) { return { error: String(error.message || error).slice(0, 200) }; }
}

/** The student in outreach_people; a failure is reported, never fatal. */
async function track(deps, network, handle, patch) {
  const id = People.idFor(network, handle);
  if (!id) return "";
  try { await People.touch(deps.db, id, Object.assign({ kind: "student", network, handle, by: CAMPAIGN }, patch), deps.now); return ""; } catch (error) { return String(error.message || error).slice(0, 200); }
}

/** A draft in the engagement queue: waiting for Carlos, or approved for the Mac in auto mode; Carlos copies what the Mac cannot carry. */
function draftDoc(post, draft, student, mode, now) {
  const carried = carriedAs(post.network, student.kind, post.url);
  const auto = mode === "auto" && carried;
  const reply = Object.assign({ status: auto ? "approved" : "waiting", kind: CAMPAIGN, draft, lang: post.lang, expiresAt: iso(now + TTL) }, auto ? { decidedAt: iso(now), by: "auto" } : {});
  const base = E.postDoc(Object.assign({ topic: "Students", topics: ["Students"] }, post, carried ? { via: "mac" } : {}), { about: student.about, lang: post.lang }, { verdict: "engage", skip: "", actions: { reply } }, now);
  return Object.assign(base, { campaign: CAMPAIGN, student: Object.assign({}, student, { action: carried }) }, carried ? {} : { report: { manual: true, profile: post.url } });
}

/** This week's value post for a community, with the offer where the rules allow it. */
function postFor(c, now, offer) {
  const copy = copyOf(c.lang);
  const p = copy.posts[weekOf(now) % copy.posts.length];
  const t = terms();
  return { title: p.title, body: p.body + (offer ? "\n\n" + fill(copy.offerPost, t) : "") };
}

/** Drafts that became posts (sent by the Mac or copied by Carlos): lastPostAt follows them. */
async function sync(deps, rows) {
  const { db } = deps;
  const open = rows.filter((r) => r.doc.lastDraftKey && (!r.doc.lastPostAt || r.doc.lastPostAt < r.doc.lastDraftAt));
  if (!open.length) return 0;
  const snaps = await db.getAll(...open.map((r) => db.collection("engagement_posts").doc(r.doc.lastDraftKey)));
  let n = 0;
  for (let i = 0; i < open.length; i += 1) {
    const r = ((snaps[i].exists && snaps[i].data().actions) || {}).reply || {};
    if (["copy", "posted", "replied"].includes(r.status)) {
      await db.collection(C.COLLECTION).doc(open[i].key).update({ lastPostAt: r.postedAt || r.decidedAt || r.at || open[i].doc.lastDraftAt });
      n += 1;
    }
  }
  return n;
}

/** This run's weekly posts: active communities not drafted for a week, biggest first, POSTS_PER_RUN at most. */
async function planPosts(deps, rows, mode) {
  const { db, now } = deps;
  const due = rows.filter((r) => r.doc.status === "active" && C.POSTABLE.includes(r.doc.kind) && !(Date.parse(r.doc.lastDraftAt || 0) > now - WEEK + 3600000))
    .sort((a, b) => (b.doc.size || 0) - (a.doc.size || 0)).slice(0, POSTS_PER_RUN);
  const out = [];
  for (const r of due) {
    const c = r.doc;
    const offer = offerAllowed(c, now);
    const p = postFor(c, now, offer);
    const key = E.keyOf(c.network, "student-post:" + c.url + ":" + weekOf(now));
    const doc = draftDoc({ network: c.network, id: "student-post:" + c.url, url: c.url, author: { handle: c.name, name: c.name }, title: p.title, text: "", lang: c.lang, createdAt: iso(now) },
      p.body, { kind: "post", community: r.key, offer, code: "", about: "Weekly value post for " + c.name }, mode, now);
    await db.collection("engagement_posts").doc(key).set(doc);
    await db.collection(C.COLLECTION).doc(r.key).update({ lastDraftAt: iso(now), lastDraftKey: key });
    out.push({ key, community: c.name, lang: c.lang, offer, status: doc.actions.reply.status, by: doc.student.action ? "mac" : "carlos" });
  }
  return out;
}

/** The community a post or comment was in, from its url (a subreddit's, a group's). */
function communityAt(rows, url) {
  const u = lower(url);
  return (u && rows.find((r) => r.doc.url && r.doc.kind !== "search" && u.startsWith(lower(r.doc.url)))) || null;
}

/** Whether a post the Mac read is a student showing their site: a portfolio launch or "roast my site", by a learner. */
function isStudentPost(post, community) {
  const text = [post.title, post.text].join("\n");
  if (!STUDENT_POST.test(text)) return null;
  const check = studentCheck({ text, url: post.url, community: community ? community.doc : null });
  return community || check.confidence !== "none" ? check : null;
}

const communities = async (db) => (await db.collection(C.COLLECTION).limit(1000).get()).docs.map((d) => ({ key: d.id, doc: d.data() }));

/**
 * Student posts among those the Mac read: a value comment drafted for each new one (LEADS_PER_RUN at most), the offer
 * with a trial of their own only where the community allows promotion and the author reads as a student.
 */
async function takePosts(deps, posts) {
  const { db, now } = deps;
  const rows = await communities(db);
  const mode = await sendMode(deps);
  const t = terms();
  const out = { drafted: 0, trials: 0, errors: [] };
  for (const post of (Array.isArray(posts) ? posts : [])) {
    if (out.drafted >= LEADS_PER_RUN) break;
    const comm = communityAt(rows, post.url);
    if (comm && comm.doc.status === "paused") continue;
    const check = isStudentPost(post, comm);
    if (!check) continue;
    const key = E.keyOf(post.network, post.id);
    if ((await db.collection("engagement_posts").doc(key).get()).exists) continue;
    const a = post.author || {};
    const lang = post.lang || (comm && comm.doc.lang) || "en";
    const copy = copyOf(lang);
    let draft = copy.reply[weekOf(now) % copy.reply.length];
    let tr = {};
    if (check.student && offerAllowed(comm && comm.doc, now)) {
      tr = await mint(deps, { network: post.network, handle: a.handle, lang, domain: check.lock ? check.domain : "" });
      if (tr.url) { draft += "\n\n" + fill(copy.offer, { days: t.days, pct: t.pct, link: tr.url }); out.trials += 1; } else out.errors.push(tr.error);
    }
    await db.collection("engagement_posts").doc(key).set(draftDoc(Object.assign({}, post, { lang }), draft,
      { kind: "comment", community: comm ? comm.key : "", offer: !!tr.code, code: tr.code || "", confidence: check.confidence, why: check.why, about: "Student post: " + check.why }, mode, now));
    out.drafted += 1;
    if (check.student) {
      const err = await track(deps, post.network, a.handle, { name: a.name, lang, domain: check.domain, stage: tr.code ? "offered" : "found", note: check.why,
        threads: [{ url: post.url, lastAt: post.createdAt || iso(now), theirLast: [post.title, post.text].filter(Boolean).join("\n") }], offers: tr.code ? [{ code: tr.code, kind: "student", url: tr.url }] : [] });
      if (err) out.errors.push(err);
    }
    if (comm) await db.collection(C.COLLECTION).doc(comm.key).update(Object.assign({ students: (comm.doc.students || 0) + (check.student ? 1 : 0) }, tr.code ? { trials: (comm.doc.trials || 0) + 1 } : {}));
  }
  return out;
}

/**
 * People who answered us (comments and replies the Mac found in our notifications) who read as students: a trial of
 * their own and an invite by DM, one per person.
 */
async function takeCommenters(deps, comments) {
  const { db, now } = deps;
  const rows = await communities(db);
  const mode = await sendMode(deps);
  const t = terms();
  const out = { invited: 0, errors: [] };
  for (const c of (Array.isArray(comments) ? comments : [])) {
    if (out.invited >= LEADS_PER_RUN) break;
    const a = c.author || {};
    if (!a.handle) continue;
    const comm = communityAt(rows, c.url);
    const check = studentCheck({ text: c.text, url: c.url, profile: a.bio || a.headline || "", community: comm ? comm.doc : null, now });
    if (!check.student) continue;
    const key = E.keyOf(c.network, "student-dm:" + String(a.handle).toLowerCase());
    if ((await db.collection("engagement_posts").doc(key).get()).exists) continue;
    const lang = c.lang || (comm && comm.doc.lang) || "en";
    const tr = await mint(deps, { network: c.network, handle: a.handle, lang, domain: check.lock ? check.domain : "" });
    if (!tr.url) { out.errors.push(tr.error); continue; }
    const draft = fill(copyOf(lang).invite, { name: String(a.name || a.handle).split(/\s+/)[0], days: t.days, pct: t.pct, link: tr.url });
    await db.collection("engagement_posts").doc(key).set(draftDoc({ network: c.network, id: "student-dm:" + a.handle, url: c.url, author: { handle: a.handle, name: a.name || a.handle }, text: c.text, lang, createdAt: iso(now) },
      draft, { kind: "dm", community: comm ? comm.key : "", offer: true, code: tr.code, confidence: check.confidence, why: check.why, about: "Student who answered us: " + check.why }, mode, now));
    out.invited += 1;
    const err = await track(deps, c.network, a.handle, { name: a.name, lang, domain: check.domain, stage: "offered", note: check.why,
      threads: [{ url: c.url, lastAt: c.createdAt || iso(now), theirLast: c.text }], offers: [{ code: tr.code, kind: "student", url: tr.url }] });
    if (err) out.errors.push(err);
    if (comm) await db.collection(C.COLLECTION).doc(comm.key).update({ students: (comm.doc.students || 0) + 1, trials: (comm.doc.trials || 0) + 1 });
  }
  return out;
}

/** The Mac task for an approved student draft: its action and fields, or null when today's cap for it is spent. */
function task(doc, used) {
  const s = doc.student || {};
  const action = s.action || "";
  if (!ACTIONS.includes(action)) return null;
  if (((used || {})["student_" + action] || 0) >= ((CAPS[doc.network] || {})[action] || 0)) return null;
  const a = doc.author || {};
  return Object.assign({ action, as: "self" }, action === "publish" ? { title: doc.title || "", sr: (String(doc.url).match(/\/r\/([^/]+)/) || [])[1] || "" } : {},
    action === "dm" ? { to: a.handle || "", subject: (copyOf(doc.lang).subject || COPY.en.subject) } : {});
}

/** After the Mac sent a student draft: the person's thread or DM in outreach_people, and the community's post date. */
async function sent(deps, doc, b) {
  const s = doc.student || {};
  const r = (doc.actions || {}).reply || {};
  const a = doc.author || {};
  if (s.kind === "post") return s.community ? deps.db.collection(C.COLLECTION).doc(s.community).update({ lastPostAt: iso(deps.now) }).then(() => "") : "";
  return track(deps, doc.network, a.handle, s.kind === "dm"
    ? { dms: [{ network: doc.network, text: r.draft }] }
    : { stage: "engaged", threads: [{ url: b.url || doc.url, lastAt: iso(deps.now), ourLast: r.draft }] });
}

/** The daily run: launch noted, the curated list in, sent posts marked, and this run's weekly value posts drafted. */
async function run(deps) {
  const ref = stateRef(deps.db);
  const state = await ref.get();
  if (!(state.exists && state.data().launchedAt)) await ref.set({ launchedAt: iso(deps.now) }, { merge: true });
  const mode = await sendMode(deps);
  const seeded = await C.seed(deps);
  const rows = await communities(deps.db);
  const posted = await sync(deps, rows);
  const posts = await planPosts(deps, rows, mode);
  const summary = await C.summary(deps.db);
  return { at: iso(deps.now), mode, seeded, posted, posts, summary };
}

function runNote(r) {
  const s = r.summary || {};
  return (r.posts || []).length + " student posts drafted (" + (r.posts || []).filter((p) => p.offer).length + " with the offer, " + (r.posts || []).filter((p) => p.by === "mac").length + " for the Mac), send mode " + r.mode + ", "
    + r.posted + " posted since; " + s.total + " communities (" + Object.entries(s.status || {}).map(([k, v]) => v + " " + k).join(", ") + "), " + (s.students || 0) + " students met, " + (s.trials || 0) + " trials";
}

module.exports = { CAMPAIGN, WEEK, POSTS_PER_RUN, LEADS_PER_RUN, CAPS, ACTIONS, MODES, STUDENT_POST, terms, offerAllowed, sendMode, carriedAs, postFor, isStudentPost, communityAt, draftDoc, sync, planPosts, takePosts, takeCommenters, task, sent, run, runNote };
