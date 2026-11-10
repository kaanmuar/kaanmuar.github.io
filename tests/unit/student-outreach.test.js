"use strict";
// Students (#3138): who reads as a student, the student communities with their rules, LinkedIn groups joined as
// Carlos's profile, and the routine's drafts (weekly posts, comments, invites with a trial) waiting for Carlos.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement.js");
const Joins = require("../../functions/engagement-joins.js");
const C = require("../../functions/student-communities.js");
const S = require("../../functions/student-outreach.js");
const { studentCheck } = require("../../functions/student-check.js");
const COPY = require("../../functions/student-outreach-copy.json");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-09T15:00:00Z");
const check = (x) => studentCheck(Object.assign({ now: NOW }, x));

function fakes() {
  const minted = [];
  const touched = [];
  return {
    minted, touched,
    trials: { TRIAL: { followup: { student: 40 } }, mintTrial: async (db, p) => { minted.push(p); return { code: "STU" + minted.length, url: "https://carlosandmunoz.com/qa-review.html?trial=STU" + minted.length }; } },
    people: { touch: async (db, p) => { touched.push(p); } }
  };
}
const deps = (db, f, extra) => Object.assign({ db, now: NOW, inc: (n) => ({ inc: n }), trials: f.trials, people: f.people }, extra || {});

test("a school email is a student with high confidence, locked to its domain; staff, alumni and pupils are not", () => {
  const mit = check({ email: "ana@cs.mit.edu" });
  assert.deepEqual([mit.student, mit.confidence, mit.domain, mit.lock, mit.school], [true, "high", "mit.edu", true, "Massachusetts Institute of Technology"]);
  assert.equal(check({ email: "x@unknown.ac.za" }).confidence, "high", "an academic suffix without a list entry");
  assert.equal(check({ email: "x@unal.edu.co" }).school, "Universidad Nacional de Colombia");
  assert.equal(check({ email: "x@gmail.com" }).student, false);
  assert.equal(check({ email: "x@alumni.stanford.edu" }).confidence, "low");
  assert.deepEqual([check({ email: "kid@pps.k12.or.us" }).confidence, check({ email: "kid@pps.k12.or.us" }).student], ["none", false]);
  const prof = check({ email: "p@mit.edu", profile: "Professor of Computer Science" });
  assert.deepEqual([prof.student, prof.lock], [false, false], "a school email on a staff profile");
});

test("what students say about themselves is medium confidence, with the school, in six languages", () => {
  const cases = [
    ["Computer Science Student at Universidad de los Andes | Frontend", "Universidad de los Andes"],
    ["Estudiante de Ingeniería de Sistemas en la Universidad Nacional de Colombia", "Universidad Nacional de Colombia"],
    ["Estudante de Ciência da Computação na USP", "USP"],
    ["Studentin der Informatik an der TU Berlin", "TU Berlin"],
    ["Étudiante en informatique à Sorbonne Université", "Sorbonne Université"],
    ["Studentessa di informatica presso Politecnico di Milano", "Politecnico di Milano"]
  ];
  cases.forEach(([profile, school]) => {
    const r = check({ profile });
    assert.deepEqual([r.student, r.confidence, r.school, r.lock], [true, "medium", school, false], profile);
  });
  assert.equal(check({ profile: { headline: "Aspiring developer", education: [{ school: "TU München", end: "2028" }] } }).school, "TU München");
  assert.equal(check({ profile: "Junior dev, class of 2027" }).why, "graduates in 2027");
  assert.equal(check({ profile: "Senior engineer. Class of 2015" }).student, false, "a graduation year gone by");
  assert.equal(check({ profile: "Product designer and student mentor" }).student, false);
});

test("a student community counts with a learner's words; alone it is only a hint", () => {
  const boot = check({ text: "Roast my portfolio, built it for my bootcamp capstone", url: "https://www.reddit.com/r/codingbootcamp/comments/1/x/" });
  assert.deepEqual([boot.student, boot.confidence], [true, "medium"]);
  assert.match(boot.why, /r\/codingbootcamp/);
  assert.deepEqual([check({ text: "Roast my portfolio", url: "https://www.reddit.com/r/webdev/comments/1/x/" }).student, check({ text: "Roast my portfolio", community: { name: "CS students", audience: "students" } }).confidence], [false, "low"]);
});

test("rules: a ban wins, an explicit allowance or a self-promotion day opens the offer, unread rules allow nothing", () => {
  assert.deepEqual(C.readRules(""), { promoAllowed: false, promoDay: -1, summary: "" });
  assert.equal(C.readRules("1. No self-promotion: posts linking to your products are removed.").promoAllowed, false);
  assert.equal(C.readRules("Sharing your own project is welcome. Self-promotion is allowed with context.").promoAllowed, true);
  assert.equal(C.readRules("Self-promotion is allowed. No spam.").promoAllowed, false, "a ban wins");
  assert.equal(C.readRules("Self promotion only on Showoff Saturday.").promoDay, 6);
  assert.equal(C.readRules("Keine Werbung. Kein Spam.").promoAllowed, false);
  assert.ok(C.isStudentGroup("Estudiantes de Ingeniería de Sistemas") && C.isStudentGroup("Web Dev Bootcamp grads") && !C.isStudentGroup("Software Testing Professionals"));
});

test("the curated list: real communities and searches in six languages, each with rules and a status", () => {
  const langs = new Set(C.LIST.map((c) => c.lang));
  ["en", "es", "pt", "de", "fr", "it"].forEach((l) => assert.ok(langs.has(l), l));
  C.LIST.forEach((c) => {
    assert.ok(C.STATUSES.includes(c.status) && typeof c.promoAllowed === "boolean" && ["students", "learners"].includes(c.audience), c.name);
    if (c.kind !== "search") assert.match(c.url, /^https:\/\//, c.name);
  });
  assert.equal(new Set(C.LIST.map(C.keyOf)).size, C.LIST.length, "no duplicates");
  ["linkedin", "facebook", "telegram"].forEach((n) => assert.ok(C.LIST.some((c) => c.network === n && c.kind === "search"), n));
  const topics = C.withStudents(E.DISCOVERY, 4);
  assert.equal(topics.filter((t) => t.topic === "Students").length, Math.floor(E.DISCOVERY.length / 4));
  ["en", "es", "pt", "de", "fr", "it"].forEach((l) => {
    assert.ok(COPY[l].posts.length >= 2 && COPY[l].reply.length >= 1, l);
    ["offer", "invite"].forEach((k) => ["{days}", "{pct}", "{link}"].forEach((v) => assert.ok(COPY[l][k].includes(v), l + " " + k + " " + v)));
  });
});

test("seeding keeps what the Mac and Carlos set, and queues the curated subreddits we may post in for joins", async () => {
  const db = fakeDb();
  const f = fakes();
  const first = await C.seed(deps(db, f));
  assert.equal(first.fresh, C.LIST.length);
  assert.ok(first.queued > 0);
  const webdev = C.keyOf(C.LIST.find((c) => c.name === "r/webdev"));
  await db.collection(C.COLLECTION).doc(webdev).update({ status: "active", lastPostAt: "2026-11-01T00:00:00Z" });
  const again = await C.seed(deps(db, f));
  assert.deepEqual([again.fresh, again.queued], [0, 0]);
  const doc = (await db.collection(C.COLLECTION).doc(webdev).get()).data();
  assert.deepEqual([doc.status, doc.lastPostAt, doc.promoDay], ["active", "2026-11-01T00:00:00Z", 6]);
  const join = (await db.collection("engagement_joins").doc(E.keyOf("reddit", "webdev")).get()).data();
  assert.deepEqual([join.status, join.topic], ["found", "Students"]);
});

test("LinkedIn student groups are kept, joined within the cap as Carlos, and their rules make the community active", async () => {
  const db = fakeDb();
  const f = fakes();
  assert.ok(Joins.JOINS.includes("linkedin"));
  const g = Joins.cleanGroup({ network: "linkedin", id: "8765432", name: "Estudiantes de Programación Colombia", url: "https://www.linkedin.com/groups/8765432/", members: 5400, about: "Comunidad de estudiantes", kind: "group" }, E.DEFAULTS);
  assert.deepEqual([g.skip, g.topic, g.id], ["", "Students", "8765432"]);
  assert.equal(Joins.cleanGroup({ network: "linkedin", id: "123", name: "Cooking lovers", url: "https://www.linkedin.com/groups/123/", members: 5000 }, E.DEFAULTS).skip, "off-topic");
  assert.equal(Joins.cleanGroup({ network: "linkedin", id: "linkedin-x", name: "Students", url: "https://www.linkedin.com/groups/x/", members: 5000 }, E.DEFAULTS), null, "ids are numbers");

  await Joins.found(deps(db, f), E.DEFAULTS, [{ network: "linkedin", id: "8765432", name: g.name, url: g.url, members: 5400, about: "Comunidad de estudiantes", kind: "group" }]);
  await C.searched(deps(db, f), [{ network: "linkedin", id: "8765432", name: g.name, url: g.url, members: 5400, about: "Comunidad de estudiantes" }]);
  const out = await Joins.result(deps(db, f), { key: g.key, ok: true, pending: true, members: 5500, rules: "No promotion or spam. Be kind." });
  assert.equal(out.status, "requested");
  const comm = (await db.collection(C.COLLECTION).doc(C.keyOf({ network: "linkedin", url: g.url })).get()).data();
  assert.deepEqual([comm.status, comm.promoAllowed, comm.size], ["requested", false, 5500]);
  assert.match(comm.rulesSummary, /No promotion/);
  const pool = await Joins.pool(db);
  assert.equal(pool.linkedin, undefined, "LinkedIn groups are not read by name");
});

test("weekly posts: one per active community a week, the offer with a trial only where rules allow it, waiting for Carlos to copy", async () => {
  const db = fakeDb();
  const f = fakes();
  await C.seed(deps(db, f));
  const side = C.keyOf(C.LIST.find((c) => c.name === "r/SideProject"));
  const prog = C.keyOf(C.LIST.find((c) => c.name === "r/programacion"));
  await db.collection(C.COLLECTION).doc(side).update({ status: "active", size: 300000 });
  await db.collection(C.COLLECTION).doc(prog).update({ status: "active", size: 100000 });
  const r = await S.run(deps(db, f));
  assert.deepEqual(r.posts.map((p) => [p.community, p.offer]), [["r/SideProject", true], ["r/programacion", false]]);
  assert.equal(f.minted.length, 1);
  assert.deepEqual([f.minted[0].kind, f.minted[0].person], ["student", "community:" + side]);
  const doc = (await db.collection("engagement_posts").doc(r.posts[0].key).get()).data();
  assert.deepEqual([doc.campaign, doc.actions.reply.status, doc.report.manual, doc.student.kind], ["students", "waiting", true, "post"]);
  assert.match(doc.actions.reply.draft, /free for 2 days, then 40% off/);
  const es = (await db.collection("engagement_posts").doc(r.posts[1].key).get()).data();
  assert.match(es.actions.reply.draft, /portafolio/);
  assert.doesNotMatch(es.actions.reply.draft, /https?:/, "no link where promotion is not allowed");
  assert.equal((await S.run(deps(db, f))).posts.length, 0, "once a week");
  await db.collection("engagement_posts").doc(r.posts[0].key).update({ "actions.reply": Object.assign({}, doc.actions.reply, { status: "copy", decidedAt: "2026-11-09T16:00:00Z" }) });
  const later = await S.run(deps(db, f, { now: NOW + 3600000 }));
  assert.equal(later.posted, 1);
  assert.match(S.runNote(later), /communities/);
});

test("student posts get a value comment; the offer and a trial only where promotion is allowed and the author reads as a student", async () => {
  const db = fakeDb();
  const f = fakes();
  await C.seed(deps(db, f));
  const post = (id, sub, text, extra) => Object.assign({ network: "reddit", via: "mac", id, url: "https://www.reddit.com/r/" + sub + "/comments/" + id + "/x/", author: { handle: "u" + id, name: "u" + id }, title: text, text: "", lang: "en" }, extra);
  const out = await S.takePosts(deps(db, f), [
    post("t3_a", "codingbootcamp", "Roast my portfolio, my bootcamp capstone"),
    post("t3_b", "SideProject", "Just launched my portfolio, I'm a CS student at Purdue"),
    post("t3_c", "cooking", "My first website for my bakery"),
    post("t3_d", "webdev", "Weekly hiring thread")
  ]);
  assert.deepEqual([out.drafted, out.trials], [2, 1]);
  const a = (await db.collection("engagement_posts").doc(E.keyOf("reddit", "t3_a")).get()).data();
  assert.doesNotMatch(a.actions.reply.draft, /https?:/, "r/codingbootcamp forbids promotion");
  assert.equal(a.report, undefined, "the Mac comments on Reddit itself once approved");
  const b = (await db.collection("engagement_posts").doc(E.keyOf("reddit", "t3_b")).get()).data();
  assert.match(b.actions.reply.draft, /trial=STU1/);
  assert.equal(f.touched.length, 2);
  assert.deepEqual([f.touched[1].kind, f.touched[1].stage, f.touched[1].code], ["student", "offered", "STU1"]);
  assert.equal((await S.takePosts(deps(db, f), [post("t3_a", "codingbootcamp", "Roast my portfolio, my bootcamp capstone")])).drafted, 0, "once per post");
});

test("a student who answered us gets one trial of their own and a DM invite for Carlos, in their language", async () => {
  const db = fakeDb();
  const f = fakes();
  const c = (handle, text, lang) => ({ network: "linkedin", id: "c" + handle, url: "https://www.linkedin.com/feed/update/urn:li:activity:1/", author: { handle: "in/" + handle, name: handle + " Pérez" }, text, lang });
  const out = await S.takeCommenters(deps(db, f), [c("ana", "¡Gracias! Soy estudiante de ingeniería en la Universidad de Antioquia", "es"), c("bob", "Great tips, we use this at work", "en")]);
  assert.equal(out.invited, 1);
  const doc = (await db.collection("engagement_posts").doc(E.keyOf("linkedin", "student-dm:in/ana")).get()).data();
  assert.deepEqual([doc.student.kind, doc.report.manual, doc.actions.reply.status, doc.lang], ["dm", true, "waiting", "es"]);
  assert.match(doc.actions.reply.draft, /^¡Hola ana, .*2 días gratis.*40% de descuento.*trial=STU1/s);
  assert.equal((await S.takeCommenters(deps(db, f), [c("ana", "Soy estudiante", "es")])).invited, 0, "one invite per person");
  const broken = await S.takeCommenters(deps(db, { trials: { mintTrial: async () => { throw new Error("ledger down"); } }, people: f.people }), [c("eva", "I'm a student at UNAM", "en")]);
  assert.deepEqual([broken.invited, broken.errors], [0, ["ledger down"]]);
});
