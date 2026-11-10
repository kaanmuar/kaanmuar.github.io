"use strict";
/*
 * Student outreach (#3138): students get a 2-day free trial of the full audit and a discount after it
 * (functions/outreach-trials.js, kind "student", TRIAL.followup.student). Value first, everywhere:
 *
 *   weekly posts   each active student community (functions/student-communities.js) gets one value post a week in its
 *                  language (functions/student-outreach-copy.json), with the student offer only where its rules allow
 *                  promotion (or on its promoDay). Carlos posts them by hand from his personal profile ("copy").
 *   student posts  a portfolio launch or "roast my site" the Mac read gets a value comment, no link; the offer joins
 *                  it only where promotion is allowed and the author reads as a student (functions/student-check.js).
 *   commenters     someone who answered us and reads as a student gets a trial of their own (locked to their school
 *                  domain when we know it) and an invite drafted as a DM for Carlos to send.
 *
 * Every draft is an engagement_posts document waiting for Carlos (campaign "students"), the queue the engagement
 * chains use: nothing goes out unapproved. Each student is tracked in outreach_people (kind student) and each community
 * counts its students and trials.
 */
const E = require("./engagement");
const C = require("./student-communities");
const { studentCheck } = require("./student-check");
const COPY = require("./student-outreach-copy.json");

const CAMPAIGN = "students";
const DAYS = 2;
const PCT = 40;
const WEEK = 7 * 24 * 3600 * 1000;
const POSTS_PER_RUN = 3;
const LEADS_PER_RUN = 5;
const TTL = 5 * 24 * 3600 * 1000;
const SITE = "https://carlosandmunoz.com/qa-review.html";

const STUDENT_POST = /(roast my (site|website|portfolio)|(review|feedback|critique|thoughts) (on|of|for) my (portfolio|website|site|personal site|landing page)|my (first|new) (portfolio|website|personal site|web ?site)|portfolio (review|feedback|launch)|just (launched|built|finished|shipped) my (portfolio|website|site|personal site)|rate my (portfolio|website|site)|mi (primer )?portafolio|mi (primera )?(web|página web|página|sitio web)|feedback (de|sobre) mi (portafolio|web|página)|meu (primeiro )?portf[oó]lio|meu (primeiro )?site|feedback (do|sobre o) meu (portf[oó]lio|site)|meine? (erstes? )?(portfolio|webseite|website)|feedback zu meine[mr]? (portfolio|webseite|website)|mon (premier )?(portfolio|site)|avis sur mon (portfolio|site)|il mio (primo )?(portfolio|sito)|feedback sul mio (portfolio|sito))/iu;

const fill = (s, v) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (v[k] === undefined ? m : String(v[k])));
const copyOf = (lang) => COPY[C.LANGS.includes(lang) ? lang : "en"] || COPY.en;
const weekOf = (now) => Math.floor(now / WEEK);
const weekday = (now) => new Date(E.bogotaDay(now) + "T12:00:00Z").getUTCDay();
const lower = (s) => String(s || "").toLowerCase().replace(/\/+$/, "");

/** The offer's terms: free days and the discount after them, from the trials ledger's defaults. */
function terms(deps) {
  let pct = PCT;
  try { pct = (((trials(deps).TRIAL || {}).followup || {}).student) || PCT; } catch (error) { pct = PCT; }
  return { days: DAYS, pct: pct <= 1 ? Math.round(pct * 100) : pct };
}
const trials = (deps) => deps.trials || require("./outreach-trials");
const people = (deps) => deps.people || require("./outreach-people");

/** Whether a community allows the offer today: its rules allow promotion, or today is its promotion day. */
const offerAllowed = (c, now) => !!c && (c.promoAllowed === true || (Number.isInteger(c.promoDay) && c.promoDay >= 0 && c.promoDay === weekday(now)));

/** A student trial: { code, url } from the ledger, or { error } when it cannot mint one. */
async function mint(deps, p) {
  try {
    const out = await trials(deps).mintTrial(deps.db, Object.assign({ kind: "student", lang: "en", email: "", domain: "", by: CAMPAIGN }, p));
    return out && out.url ? out : { error: "The trials ledger returned no link." };
  } catch (error) { return { error: String(error.message || error).slice(0, 200) }; }
}

/** The student in outreach_people; a failure is reported, never fatal. */
async function track(deps, p) {
  try { await people(deps).touch(deps.db, Object.assign({ kind: "student", by: CAMPAIGN }, p), deps.now); return ""; } catch (error) { return String(error.message || error).slice(0, 200); }
}

/** A draft waiting for Carlos, in the engagement queue. manual: he copies and posts it himself (posts, DMs, groups). */
function draftDoc(post, draft, student, manual, now) {
  const reply = { status: "waiting", kind: CAMPAIGN, draft, lang: post.lang, expiresAt: new Date(now + TTL).toISOString() };
  const base = E.postDoc(Object.assign({ topic: "Students", topics: ["Students"] }, post), { about: student.about, lang: post.lang }, { verdict: "engage", skip: "", actions: { reply } }, now);
  return Object.assign(base, { campaign: CAMPAIGN, student }, manual ? { report: { manual: true, profile: post.url } } : {});
}

/** This week's value post for a community, with the offer and its link when the rules allow it. */
function postFor(c, now, link, t) {
  const copy = copyOf(c.lang);
  const p = copy.posts[weekOf(now) % copy.posts.length];
  const offer = link ? "\n\n" + fill(copy.offer, { days: t.days, pct: t.pct, link }) : "";
  return { title: p.title, text: p.title + "\n\n" + p.body + offer };
}

/** Drafts last week's posts Carlos approved became posts: lastPostAt follows them. */
async function sync(deps, rows) {
  const { db } = deps;
  const open = rows.filter((r) => r.doc.lastDraftKey && (!r.doc.lastPostAt || r.doc.lastPostAt < r.doc.lastDraftAt));
  if (!open.length) return 0;
  const snaps = await db.getAll(...open.map((r) => db.collection("engagement_posts").doc(r.doc.lastDraftKey)));
  let n = 0;
  for (let i = 0; i < open.length; i += 1) {
    const r = ((snaps[i].exists && snaps[i].data().actions) || {}).reply || {};
    if (["copy", "posted", "replied"].includes(r.status)) {
      await db.collection(C.COLLECTION).doc(open[i].key).update({ lastPostAt: r.decidedAt || r.at || open[i].doc.lastDraftAt });
      n += 1;
    }
  }
  return n;
}

/** This run's weekly posts: active communities not drafted for a week, biggest first, POSTS_PER_RUN at most. */
async function planPosts(deps, rows) {
  const { db, now } = deps;
  const t = terms(deps);
  const due = rows.filter((r) => r.doc.status === "active" && C.POSTABLE.includes(r.doc.kind) && !(Date.parse(r.doc.lastDraftAt || 0) > now - WEEK + 3600000))
    .sort((a, b) => (b.doc.size || 0) - (a.doc.size || 0)).slice(0, POSTS_PER_RUN);
  const out = [];
  for (const r of due) {
    const c = r.doc;
    let link = "";
    let error = "";
    if (offerAllowed(c, now)) {
      const tr = await mint(deps, { person: "community:" + r.key, lang: c.lang, network: c.network, handle: c.name });
      link = tr.url || "";
      error = tr.error || "";
    }
    const p = postFor(c, now, link, t);
    const key = E.keyOf(c.network, "student-post:" + c.url + ":" + weekOf(now));
    await db.collection("engagement_posts").doc(key).set(draftDoc({ network: c.network, id: "student-post:" + c.url, url: c.url, author: { handle: c.name, name: c.name }, title: p.title, text: "", lang: c.lang, createdAt: new Date(now).toISOString() },
      p.text, { kind: "post", community: r.key, offer: !!link, code: "", about: "Weekly value post for " + c.name }, true, now));
    await db.collection(C.COLLECTION).doc(r.key).update({ lastDraftAt: new Date(now).toISOString(), lastDraftKey: key });
    out.push({ key, community: c.name, lang: c.lang, offer: !!link, error });
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

/**
 * Student posts among those the Mac read: a value comment drafted for each new one (LEADS_PER_RUN at most), the offer
 * with a trial of their own only where the community allows promotion and the author reads as a student.
 */
async function takePosts(deps, posts) {
  const { db, now } = deps;
  const rows = await communities(db);
  const t = terms(deps);
  const out = { drafted: 0, trials: 0, errors: [] };
  for (const post of (Array.isArray(posts) ? posts : [])) {
    if (out.drafted >= LEADS_PER_RUN) break;
    const comm = communityAt(rows, post.url);
    if (comm && comm.doc.status === "paused") continue;
    const check = isStudentPost(post, comm);
    if (!check) continue;
    const key = E.keyOf(post.network, post.id);
    if ((await db.collection("engagement_posts").doc(key).get()).exists) continue;
    const copy = copyOf(post.lang || (comm && comm.doc.lang));
    let draft = copy.reply[weekOf(now) % copy.reply.length];
    let code = "";
    if (check.student && offerAllowed(comm && comm.doc, now)) {
      const tr = await mint(deps, { person: post.network + ":" + (post.author || {}).handle, lang: post.lang || "en", domain: check.lock ? check.domain : "", network: post.network, handle: (post.author || {}).handle });
      if (tr.url) { draft += "\n\n" + fill(copy.offer, { days: t.days, pct: t.pct, link: tr.url }); code = tr.code || ""; out.trials += 1; } else out.errors.push(tr.error);
    }
    const manual = !(E.NETWORKS[post.network] || {}).acts || /\/groups\//.test(String(post.url));
    await db.collection("engagement_posts").doc(key).set(draftDoc(Object.assign({}, post, { lang: post.lang || (comm && comm.doc.lang) || "en" }), draft,
      { kind: "comment", community: comm ? comm.key : "", offer: !!code, code, confidence: check.confidence, why: check.why, about: "Student post: " + check.why }, manual, now));
    out.drafted += 1;
    if (check.student) {
      const err = await track(deps, { network: post.network, handle: (post.author || {}).handle, name: (post.author || {}).name, lang: post.lang, school: check.school, domain: check.domain, confidence: check.confidence, community: comm ? comm.key : "", url: post.url, code, stage: code ? "offered" : "engaged" });
      if (err) out.errors.push(err);
    }
    if (comm) await db.collection(C.COLLECTION).doc(comm.key).update(Object.assign({ students: (comm.doc.students || 0) + (check.student ? 1 : 0) }, code ? { trials: (comm.doc.trials || 0) + 1 } : {}));
  }
  return out;
}

/**
 * People who answered us (comments and replies the Mac found in our notifications) who read as students: a trial of
 * their own and an invite drafted as a DM, one per person, for Carlos to approve and send.
 */
async function takeCommenters(deps, comments) {
  const { db, now } = deps;
  const rows = await communities(db);
  const t = terms(deps);
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
    const tr = await mint(deps, { person: c.network + ":" + a.handle, lang, domain: check.lock ? check.domain : "", network: c.network, handle: a.handle });
    if (!tr.url) { out.errors.push(tr.error); continue; }
    const draft = fill(copyOf(lang).invite, { name: String(a.name || a.handle).split(/\s+/)[0], days: t.days, pct: t.pct, link: tr.url });
    await db.collection("engagement_posts").doc(key).set(draftDoc({ network: c.network, id: "student-dm:" + a.handle, url: c.url, author: { handle: a.handle, name: a.name || a.handle }, text: c.text, lang, createdAt: new Date(now).toISOString() },
      draft, { kind: "dm", community: comm ? comm.key : "", offer: true, code: tr.code || "", confidence: check.confidence, why: check.why, about: "Student who answered us: " + check.why }, true, now));
    out.invited += 1;
    const err = await track(deps, { network: c.network, handle: a.handle, name: a.name, lang, school: check.school, domain: check.domain, confidence: check.confidence, community: comm ? comm.key : "", url: c.url, code: tr.code || "", stage: "offered" });
    if (err) out.errors.push(err);
    if (comm) await db.collection(C.COLLECTION).doc(comm.key).update({ students: (comm.doc.students || 0) + 1, trials: (comm.doc.trials || 0) + 1 });
  }
  return out;
}

const communities = async (db) => (await db.collection(C.COLLECTION).limit(1000).get()).docs.map((d) => ({ key: d.id, doc: d.data() }));

/** The daily run: the curated list in, posts Carlos approved marked, and this run's weekly value posts drafted. */
async function run(deps) {
  const seeded = await C.seed(deps);
  const rows = await communities(deps.db);
  const posted = await sync(deps, rows);
  const posts = await planPosts(deps, rows);
  const summary = await C.summary(deps.db);
  return { at: new Date(deps.now).toISOString(), seeded, posted, posts, summary };
}

function runNote(r) {
  const s = r.summary || {};
  return (r.posts || []).length + " student posts drafted (" + (r.posts || []).filter((p) => p.offer).length + " with the offer), " + r.posted + " posted since; "
    + s.total + " communities (" + Object.entries(s.status || {}).map(([k, v]) => v + " " + k).join(", ") + "), " + (s.students || 0) + " students met, " + (s.trials || 0) + " trials"
    + ((r.posts || []).some((p) => p.error) ? "; trials ledger: " + r.posts.find((p) => p.error).error : "");
}

module.exports = { CAMPAIGN, DAYS, PCT, WEEK, POSTS_PER_RUN, LEADS_PER_RUN, STUDENT_POST, terms, offerAllowed, postFor, isStudentPost, communityAt, draftDoc, sync, planPosts, takePosts, takeCommenters, run, runNote };
