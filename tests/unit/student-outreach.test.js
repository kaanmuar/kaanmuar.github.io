"use strict";
// Students (#3138): who reads as a student, the student communities with their rules, LinkedIn groups joined as
// Carlos's profile, the routine's drafts (weekly posts, comments, invites with a trial), and the Mac sending them.
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

const deps = (db, extra) => Object.assign({ db, now: NOW, inc: (n) => ({ inc: n }) }, extra || {});
const coupons = async (db) => (await db.collection("url_review_coupons").get()).docs.map((d) => Object.assign({ code: d.id }, d.data()));
const person = async (db, id) => { const snap = await db.collection("outreach_people").doc(id).get(); return snap.exists ? snap.data() : null; };

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
    assert.ok(COPY[l].posts.length >= 2 && COPY[l].reply.length >= 1 && COPY[l].subject, l);
    assert.ok(COPY[l].offerPost.includes("{days}") && COPY[l].offerPost.includes("{pct}") && !COPY[l].offerPost.includes("{link}"), l + " offerPost");
    ["offer", "invite"].forEach((k) => ["{days}", "{pct}", "{link}"].forEach((v) => assert.ok(COPY[l][k].includes(v), l + " " + k + " " + v)));
  });
});

test("seeding keeps what the Mac and Carlos set, and queues the curated subreddits we may post in for joins", async () => {
  const db = fakeDb();
  const first = await C.seed(deps(db));
  assert.equal(first.fresh, C.LIST.length);
  assert.ok(first.queued > 0);
  const webdev = C.keyOf(C.LIST.find((c) => c.name === "r/webdev"));
  await db.collection(C.COLLECTION).doc(webdev).update({ status: "active", lastPostAt: "2026-11-01T00:00:00Z" });
  const again = await C.seed(deps(db));
  assert.deepEqual([again.fresh, again.queued], [0, 0]);
  const doc = (await db.collection(C.COLLECTION).doc(webdev).get()).data();
  assert.deepEqual([doc.status, doc.lastPostAt, doc.promoDay], ["active", "2026-11-01T00:00:00Z", 6]);
  const join = (await db.collection("engagement_joins").doc(E.keyOf("reddit", "webdev")).get()).data();
  assert.deepEqual([join.status, join.topic], ["found", "Students"]);
});

test("LinkedIn student groups are kept, joined within the cap as Carlos, and their rules make the community active", async () => {
  const db = fakeDb();
  assert.ok(Joins.JOINS.includes("linkedin"));
  const g = Joins.cleanGroup({ network: "linkedin", id: "8765432", name: "Estudiantes de Programación Colombia", url: "https://www.linkedin.com/groups/8765432/", members: 5400, about: "Comunidad de estudiantes", kind: "group" }, E.DEFAULTS);
  assert.deepEqual([g.skip, g.topic, g.id], ["", "Students", "8765432"]);
  assert.equal(Joins.cleanGroup({ network: "linkedin", id: "123", name: "Cooking lovers", url: "https://www.linkedin.com/groups/123/", members: 5000 }, E.DEFAULTS).skip, "off-topic");
  assert.equal(Joins.cleanGroup({ network: "linkedin", id: "linkedin-x", name: "Students", url: "https://www.linkedin.com/groups/x/", members: 5000 }, E.DEFAULTS), null, "ids are numbers");

  await Joins.found(deps(db), E.DEFAULTS, [{ network: "linkedin", id: "8765432", name: g.name, url: g.url, members: 5400, about: "Comunidad de estudiantes", kind: "group" }]);
  await C.searched(deps(db), [{ network: "linkedin", id: "8765432", name: g.name, url: g.url, members: 5400, about: "Comunidad de estudiantes" }]);
  const out = await Joins.result(deps(db), { key: g.key, ok: true, pending: true, members: 5500, rules: "No promotion or spam. Be kind." });
  assert.equal(out.status, "requested");
  const comm = (await db.collection(C.COLLECTION).doc(C.keyOf({ network: "linkedin", url: g.url })).get()).data();
  assert.deepEqual([comm.status, comm.promoAllowed, comm.size], ["requested", false, 5500]);
  assert.match(comm.rulesSummary, /No promotion/);
  assert.equal((await Joins.pool(db)).linkedin, undefined, "LinkedIn groups are not read by name");
});

test("send mode: Carlos approves everything the first week after launch, then drafts go out on their own; settings and the shared switch override it", async () => {
  const db = fakeDb();
  assert.equal(await S.sendMode(deps(db)), "approve", "before launch");
  await S.run(deps(db));
  assert.equal(await S.sendMode(deps(db, { now: NOW + 6 * 24 * 3600000 })), "approve");
  assert.equal(await S.sendMode(deps(db, { now: NOW + S.WEEK })), "auto");
  await db.collection("jarvis_settings").doc("engagement").set({ studentsSendMode: "approve" });
  assert.equal(await S.sendMode(deps(db, { now: NOW + S.WEEK })), "approve");
  assert.equal(await S.sendMode(deps(db, { sendMode: async (what) => (what === "students" ? "auto" : "") })), "auto", "#3137's switch");
  assert.deepEqual(["post", "comment", "dm"].map((k) => S.carriedAs("reddit", k, "https://www.reddit.com/r/SideProject/")), ["publish", "reply", "dm"]);
  assert.deepEqual([S.carriedAs("linkedin", "post", "https://www.linkedin.com/groups/123/"), S.carriedAs("linkedin", "post", "https://www.linkedin.com/search/x"), S.carriedAs("devto", "post", "https://dev.to/t/portfolio")], ["publish", "", ""]);
});

test("weekly posts: one per active community a week, the offer (no shared code) only where rules allow it, sent by the Mac or copied by Carlos", async () => {
  const db = fakeDb();
  await C.seed(deps(db));
  const side = C.keyOf(C.LIST.find((c) => c.name === "r/SideProject"));
  const prog = C.keyOf(C.LIST.find((c) => c.name === "r/programacion"));
  const dev = C.keyOf(C.LIST.find((c) => c.name === "DEV #portfolio"));
  await db.collection(C.COLLECTION).doc(side).update({ status: "active", size: 300000 });
  await db.collection(C.COLLECTION).doc(prog).update({ status: "active", size: 100000 });
  await db.collection(C.COLLECTION).doc(dev).update({ status: "active", size: 50000 });
  const r = await S.run(deps(db));
  assert.equal(r.mode, "approve");
  assert.deepEqual(r.posts.map((p) => [p.community, p.offer, p.status, p.by]), [["r/SideProject", true, "waiting", "mac"], ["r/programacion", false, "waiting", "mac"], ["DEV #portfolio", false, "waiting", "carlos"]]);
  assert.equal((await coupons(db)).length, 0, "trial codes are one use each, so posts carry none");
  const doc = (await db.collection("engagement_posts").doc(r.posts[0].key).get()).data();
  assert.deepEqual([doc.campaign, doc.via, doc.student.action, doc.report, E.carrier(doc)], ["students", "mac", "publish", undefined, "mac"]);
  assert.match(doc.actions.reply.draft, /free for 2 days, then 40% off\. Comment or message me/);
  const es = (await db.collection("engagement_posts").doc(r.posts[1].key).get()).data();
  assert.match(es.actions.reply.draft, /portafolio/);
  assert.doesNotMatch(es.actions.reply.draft, /https?:|Comenta o escríbeme/, "no offer where promotion is not allowed");
  assert.equal((await db.collection("engagement_posts").doc(r.posts[2].key).get()).data().report.manual, true, "DEV posts are Carlos's to copy");
  assert.equal((await S.run(deps(db))).posts.length, 0, "once a week");
  await db.collection("engagement_posts").doc(r.posts[2].key).update({ "actions.reply": Object.assign({}, doc.actions.reply, { status: "copy", decidedAt: "2026-11-09T16:00:00Z" }) });
  const later = await S.run(deps(db, { now: NOW + 3600000 }));
  assert.equal(later.posted, 1);
  assert.match(S.runNote(later), /send mode approve/);
  const auto = await S.run(deps(db, { now: NOW + S.WEEK + 2 * 3600000 }));
  assert.equal(auto.mode, "auto");
  assert.deepEqual(auto.posts.map((p) => [p.community, p.status]), [["r/SideProject", "approved"], ["r/programacion", "approved"], ["DEV #portfolio", "waiting"]]);
});

test("student posts get a value comment; the offer and a trial only where promotion is allowed and the author reads as a student", async () => {
  const db = fakeDb();
  await C.seed(deps(db));
  const post = (id, sub, text, extra) => Object.assign({ network: "reddit", via: "mac", id, url: "https://www.reddit.com/r/" + sub + "/comments/" + id + "/x/", author: { handle: "u" + id, name: "u" + id }, title: text, text: "", lang: "en" }, extra);
  const out = await S.takePosts(deps(db), [
    post("t3_a", "codingbootcamp", "Roast my portfolio, my bootcamp capstone"),
    post("t3_b", "SideProject", "Just launched my portfolio, I'm a CS student at Purdue"),
    post("t3_c", "cooking", "My first website for my bakery"),
    post("t3_d", "webdev", "Weekly hiring thread")
  ]);
  assert.deepEqual([out.drafted, out.trials, out.errors], [2, 1, []]);
  const a = (await db.collection("engagement_posts").doc(E.keyOf("reddit", "t3_a")).get()).data();
  assert.doesNotMatch(a.actions.reply.draft, /https?:/, "r/codingbootcamp forbids promotion");
  assert.deepEqual([a.student.action, a.via, a.report], ["reply", "mac", undefined]);
  const b = (await db.collection("engagement_posts").doc(E.keyOf("reddit", "t3_b")).get()).data();
  const [coupon] = await coupons(db);
  assert.deepEqual([coupon.kind, coupon.person, coupon.trial, coupon.maxUses], ["student", "reddit:ut3_b", true, 1]);
  assert.ok(b.actions.reply.draft.includes(coupon.code));
  const p = await person(db, "reddit:ut3_b");
  assert.deepEqual([p.kind, p.stage, p.offers[0].code, p.threads[0].url], ["student", "offered", coupon.code, "https://www.reddit.com/r/SideProject/comments/t3_b/x/"]);
  assert.equal((await person(db, "reddit:ut3_a")).stage, "found", "a learner met, no offer yet");
  assert.equal((await S.takePosts(deps(db), [post("t3_a", "codingbootcamp", "Roast my portfolio, my bootcamp capstone")])).drafted, 0, "once per post");
});

test("a student who answered us gets one trial of their own, locked to their school when we know it, and a DM invite in their language", async () => {
  const db = fakeDb();
  const c = (handle, text, lang, extra) => Object.assign({ network: "linkedin", id: "c" + handle, url: "https://www.linkedin.com/feed/update/urn:li:activity:1/", author: { handle: "in/" + handle, name: handle + " Pérez" }, text, lang }, extra);
  const out = await S.takeCommenters(deps(db), [c("ana", "¡Gracias! Soy estudiante de ingeniería en la Universidad de Antioquia", "es"), c("bob", "Great tips, we use this at work", "en")]);
  assert.equal(out.invited, 1);
  const doc = (await db.collection("engagement_posts").doc(E.keyOf("linkedin", "student-dm:in/ana")).get()).data();
  assert.deepEqual([doc.student.kind, doc.student.action, doc.via, doc.actions.reply.status, doc.lang], ["dm", "dm", "mac", "waiting", "es"]);
  assert.match(doc.actions.reply.draft, /^¡Hola ana, .*2 días gratis.*40% de descuento.*TRY-/s);
  assert.deepEqual([(await person(db, "linkedin:in_ana")).stage, (await person(db, "linkedin:in_ana")).kind], ["offered", "student"]);
  assert.equal((await S.takeCommenters(deps(db), [c("ana", "Soy estudiante", "es")])).invited, 0, "one invite per person");
  await S.takeCommenters(deps(db), [c("eva", "Thanks! I'm a CS student", "en", { author: { handle: "in/eva", name: "Eva", bio: "eva@cs.mit.edu" } })]);
  const locked = (await coupons(db)).find((x) => x.person === "linkedin:in_eva");
  assert.equal(locked.domain, "", "no email, no lock");
});

test("approved student drafts are the Mac's publish, reply and dm tasks as Carlos, within a daily cap per network, and a sent DM lands in the ledger", async () => {
  const M = require("../../functions/engagement-mac.js");
  const db = fakeDb();
  const put = (key, kind, url, extra) => db.collection("engagement_posts").doc(key).set(S.draftDoc(Object.assign({ network: "reddit", id: key, url, author: { handle: "ana", name: "Ana" }, title: "Audit your portfolio", lang: "en" }, extra), "Hello there", { kind, community: "", about: "" }, "auto", NOW));
  await put("reddit_" + "a".repeat(20), "post", "https://www.reddit.com/r/SideProject/");
  await put("reddit_" + "b".repeat(20), "post", "https://www.reddit.com/r/webdev/");
  await put("reddit_" + "c".repeat(20), "dm", "https://www.reddit.com/r/webdev/comments/1/x/");
  const q = await M.queue(deps(db), { networks: ["reddit"] });
  const byAction = Object.fromEntries(q.tasks.map((t) => [t.action, t]));
  assert.deepEqual(q.tasks.map((t) => t.action).sort(), ["dm", "publish"], "one post a day on Reddit");
  assert.deepEqual([byAction.publish.sr, byAction.publish.title, byAction.publish.as, byAction.dm.to, byAction.dm.draft], ["SideProject", "Audit your portfolio", "self", "ana", "Hello there"]);
  assert.match(byAction.dm.subject, /student trial/);
  const r = await M.result(deps(db), { key: byAction.dm.key, action: "dm", ok: true, url: "https://www.reddit.com/message/sent/" });
  assert.equal(r.status, "posted");
  const p = await person(db, "reddit:ana");
  assert.deepEqual([p.dms.length, p.dms[0].text], [1, "Hello there"]);
  await assert.rejects(M.result(deps(db), { key: byAction.dm.key, action: "boost", ok: true }), /not a task/);
});
