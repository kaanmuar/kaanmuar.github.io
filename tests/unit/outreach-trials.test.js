const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fakeDb } = require("./fixtures/fake-firestore.js");
const core = require("../../functions/url-review-core");
const offers = require("../../functions/url-review-offers");
const trials = require("../../functions/outreach-trials");
const people = require("../../functions/outreach-people");
const cli = require("../../scripts/outreach-people");

const now = Date.parse("2026-11-09T15:00:00Z");
const DAY = 24 * 3600000;
const doc = (db, path) => { const d = db.data.get(path); return d ? JSON.parse(JSON.stringify(d)) : null; };
const seq = (chars) => { let i = 0; return () => chars[i++ % chars.length]; };
const redeem = (db, code, email, over) => trials.redeemTrial(db, Object.assign({ code, email, now: now + 1000, matches: core.mailboxMatchesHost }, over));

test.describe("outreach trials", () => {
  test("TRIAL holds the contract's numbers", () => {
    assert.deepEqual(trials.TRIAL, { days: 2, plan: "freelancer", runs: 3, followup: { social: 20, company: 20, student: 40, live: 20 }, followupDays: 7, codeDays: 14 });
  });

  test("mintTrial stores a one-use TRY- coupon for the trial only and links the page in the person's language", async () => {
    const db = fakeDb();
    const made = await trials.mintTrial(db, { kind: "social", network: "bluesky", handle: "@Ana.Dev", lang: "es", by: "test" }, now, seq([0, 1, 2, 3, 4, 5]));
    assert.equal(made.code, "TRY-ABCDEF");
    assert.equal(made.url, "https://carlosandmunoz.com/qa-review-es.html?trial=TRY-ABCDEF");
    const c = doc(db, "url_review_coupons/TRY-ABCDEF");
    assert.deepEqual([c.trial, c.percent, c.maxUses, c.perEmail, c.uses, c.purposes, c.person, c.locked], [true, 0, 1, 1, 0, ["trial"], "bluesky:ana.dev", false]);
    assert.equal(Date.parse(c.validUntil) - now, 14 * DAY);
    assert.equal(offers.couponOpen(Object.assign({ code: made.code }, c), "new-run", "", now, 0), false, "a trial code takes nothing off at checkout");
    const en = await trials.mintTrial(db, { kind: "company", domain: "https://www.Acme.com/about", lang: "xx" }, now);
    assert.match(en.url, /^https:\/\/carlosandmunoz\.com\/qa-review\.html\?trial=TRY-[A-Z0-9]{6}$/);
    assert.deepEqual([doc(db, "url_review_coupons/" + en.code).person, doc(db, "url_review_coupons/" + en.code).locked], ["web:acme.com", true]);
    await assert.rejects(trials.mintTrial(db, { kind: "friend", handle: "x", network: "x" }, now), /social, student, company or live/);
    await assert.rejects(trials.mintTrial(db, { kind: "social" }, now), /Name the person/);
  });

  test("a live code is shared for the show plus a day, one trial per address, and its row counts claims without addresses (#3176)", async () => {
    const db = fakeDb();
    const out = await trials.handle({ db, now }, { op: "outreach-mint", kind: "live", network: "live", handle: "2026-11-09-tiktok-hotel", name: "Hotel live", lang: "es", maxUses: 3, validHours: 25 });
    assert.deepEqual([out.maxUses, Date.parse(out.validUntil) - now, out.person.id], [3, 25 * 3600000, "live:2026-11-09-tiktok-hotel"]);
    assert.match(out.url, /qa-review-es\.html\?trial=TRY-/);
    const c = doc(db, "url_review_coupons/" + out.code);
    assert.deepEqual([c.kind, c.maxUses, c.perEmail, c.locked], ["live", 3, 1, false]);
    const a = await redeem(db, out.code, "ana@example.com");
    const b = await redeem(db, out.code, "bo@example.com");
    assert.equal(a.ok && b.ok, true);
    assert.notEqual(a.id, b.id);
    assert.match(a.id, new RegExp("^trial-" + out.code + "-[0-9a-f]{10}$"));
    assert.equal((await redeem(db, out.code, "ANA@example.com")).id, a.id, "the same address claiming again gets the same pass");
    assert.equal(doc(db, "url_review_coupons/" + out.code).redeemedBy, undefined);
    const other = await trials.mintTrial(db, { kind: "social", network: "x", handle: "cy" }, now);
    assert.equal((await redeem(db, other.code, "cy@example.com")).ok, true);
    assert.deepEqual(await redeem(db, out.code, "cy@example.com"), { ok: false, why: "email" }, "still one trial per address");
    assert.equal((await redeem(db, out.code, "di@example.com")).ok, true);
    assert.deepEqual(await redeem(db, out.code, "ed@example.com"), { ok: false, why: "used" });
    const late = await trials.mintTrial(db, { kind: "live", network: "live", handle: "late", validHours: 2 }, now);
    assert.deepEqual(await redeem(db, late.code, "fa@example.com", { now: now + 3 * 3600000 }), { ok: false, why: "expired" });
    const row = doc(db, "outreach_people/live:2026-11-09-tiktok-hotel");
    assert.deepEqual([row.kind, row.stage, row.uses, row.email, row.offers[0].kind], ["live", "claimed", 3, "", "live"]);
    assert.equal(JSON.stringify(row).includes("@example.com"), false);
    assert.equal(people.counts([row]).lives.uses, 3);
    await assert.rejects(trials.mintTrial(db, { kind: "social", network: "x", handle: "a", maxUses: 2 }, now), /Only a live code/);
    await assert.rejects(trials.mintTrial(db, { kind: "live", network: "live", handle: "a", maxUses: 0 }, now), /maxUses is 1 to 5000/);
    await assert.rejects(trials.mintTrial(db, { kind: "live", network: "live", handle: "a", validHours: 24 * 15 }, now), /validHours/);
    assert.equal(doc(db, "url_review_coupons/" + (await trials.mintTrial(db, { kind: "live", network: "live", handle: "b" }, now)).code).maxUses, 500);
  });

  test("an ended live trial gets its viewer's AFTER code at 20% and leaves the live's row where it was", async () => {
    const db = fakeDb();
    const { code } = await trials.handle({ db, now }, { op: "outreach-mint", kind: "live", network: "live", handle: "s1" });
    const { id } = await redeem(db, code, "ana@example.com");
    assert.match(await trials.endTrials(db, { now: now + 3 * DAY }), /1 trials ended, 1 follow-up codes/);
    const after = doc(db, "url_reviews/" + id).followup;
    assert.deepEqual([doc(db, "url_review_coupons/" + after).percent, doc(db, "url_review_coupons/" + after).email], [20, "ana@example.com"]);
    await trials.afterPaid(db, after, now + 4 * DAY);
    const row = doc(db, "outreach_people/live:s1");
    assert.deepEqual([row.stage, row.offers.length, row.history[row.history.length - 1].note], ["claimed", 1, "paid " + after]);
  });

  test("a taken code is drawn again", async () => {
    const db = fakeDb();
    await trials.mintTrial(db, { kind: "social", network: "x", handle: "a" }, now, seq([0]));
    const second = await trials.mintTrial(db, { kind: "social", network: "x", handle: "b" }, now, seq([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]));
    assert.equal(second.code, "TRY-BBBBBB");
  });

  test("outreach-mint mints and moves the person to offered with the offer on their row", async () => {
    const db = fakeDb();
    const out = await trials.handle({ db, now }, { op: "outreach-mint", kind: "social", network: "mastodon", handle: "@dev@fosstodon.org", name: "Dev", lang: "pt" });
    assert.equal(out.ok, true);
    assert.match(out.code, /^TRY-/);
    assert.deepEqual(out.person, { id: "mastodon:dev@fosstodon.org", stage: "offered", moved: true });
    const p = doc(db, "outreach_people/mastodon:dev@fosstodon.org");
    assert.deepEqual([p.kind, p.name, p.lang, p.offers[0].code, p.offers[0].kind, p.offers[0].url], ["social", "Dev", "pt", out.code, "trial", out.url]);
    assert.deepEqual(p.history.map((h) => h.stage), ["offered"]);
    await assert.rejects(trials.handle({ db, now }, { op: "outreach-nope" }), /Unknown outreach op/);
  });

  test("redeeming writes a free trial pass the pass rules carry, uses the code and marks the person claimed", async () => {
    const db = fakeDb();
    const { code } = await trials.handle({ db, now }, { op: "outreach-mint", kind: "social", network: "x", handle: "ana" });
    const out = await redeem(db, code, "Ana@Example.com");
    assert.equal(out.ok, true);
    assert.equal(out.id, "trial-" + code);
    const row = Object.assign({ id: out.id }, doc(db, "url_reviews/trial-" + code));
    assert.deepEqual([row.status, row.email, row.plan, row.priceUsd, row.paid, row.trial, row.runs, row.followup, row.kind, row.person], ["monthly-pass", "ana@example.com", "freelancer", 0, false, true, 3, "", "social", "x:ana"]);
    assert.equal(Date.parse(row.paidUntil) - (now + 1000), 2 * DAY);
    assert.equal(offers.passLive(row, now + DAY), true);
    assert.equal(offers.passFor([row], "ana@example.com", now + DAY).id, out.id);
    assert.equal(offers.passView(row).charged, false);
    assert.equal(offers.passView(row).runsLeft, 3);
    assert.deepEqual(out.pass, offers.passView(row));
    assert.equal(doc(db, "url_review_coupons/" + code).uses, 1);
    const p = doc(db, "outreach_people/x:ana");
    assert.deepEqual([p.stage, p.email], ["claimed", "ana@example.com"]);
    assert.equal((await redeem(db, code, "ana@example.com")).ok, true, "the same address claiming again is answered ok");
    assert.equal(doc(db, "url_review_coupons/" + code).uses, 1);
    assert.equal((await redeem(db, code, "bo@example.com")).why, "used");
  });

  test("one trial per address: a second code for the same address is refused", async () => {
    const db = fakeDb();
    const a = await trials.mintTrial(db, { kind: "social", network: "x", handle: "a" }, now);
    const b = await trials.mintTrial(db, { kind: "student", network: "x", handle: "b" }, now);
    assert.equal((await redeem(db, a.code, "ana@example.com")).ok, true);
    assert.deepEqual(await redeem(db, b.code, "ANA@example.com"), { ok: false, why: "email" });
    assert.equal(doc(db, "url_review_coupons/" + b.code).uses, 0);
    assert.equal((await redeem(db, b.code, "bo@example.com")).ok, true);
  });

  test("a locked company trial opens only on its domain, once per domain", async () => {
    const db = fakeDb();
    const a = await trials.mintTrial(db, { kind: "company", domain: "acme.com" }, now);
    const b = await trials.mintTrial(db, { kind: "company", domain: "acme.com", person: "web:acme.com" }, now);
    assert.deepEqual(await redeem(db, a.code, "ana@gmail.com"), { ok: false, why: "domain" });
    assert.equal((await redeem(db, a.code, "ana@mail.acme.com")).ok, true);
    assert.deepEqual(await redeem(db, b.code, "bo@acme.com"), { ok: false, why: "domain-used" });
    assert.ok(doc(db, "url_review_trials/domain:acme.com"));
    const social = await trials.mintTrial(db, { kind: "social", network: "x", handle: "c", domain: "acme.com" }, now);
    assert.equal((await redeem(db, social.code, "cy@gmail.com")).ok, true, "a social trial is never domain-locked");
  });

  test("a student trial asks only for an address on the school's domain; each student gets one, not one per school (#3193)", async () => {
    const db = fakeDb();
    const mint = (handle) => trials.mintTrial(db, { kind: "student", network: "instagram", handle, domain: "uni.edu" }, now);
    const [a, b, c, d] = await Promise.all(["ana", "bo", "cy", "di"].map(mint));
    assert.equal(doc(db, "url_review_coupons/" + a.code).locked, true);
    assert.deepEqual(await redeem(db, a.code, "ana@gmail.com"), { ok: false, why: "domain" });
    assert.deepEqual(await redeem(db, a.code, "ana@uni.edu.evil.com"), { ok: false, why: "domain" });
    assert.equal((await redeem(db, a.code, "ana@uni.edu")).ok, true);
    assert.equal((await redeem(db, b.code, "bo@cs.uni.edu")).ok, true, "a subdomain of the school counts");
    assert.equal(doc(db, "url_review_trials/domain:uni.edu"), null, "no domain marker for a school");
    assert.deepEqual(await redeem(db, c.code, "ANA@uni.edu"), { ok: false, why: "email" }, "still one trial per address");
    assert.equal((await redeem(db, d.code, "di@uni.edu")).ok, true);
  });

  test("a claim is refused signed out, for a bad, expired or unknown code, and while a pass is open", async () => {
    const db = fakeDb();
    const { code } = await trials.mintTrial(db, { kind: "social", network: "x", handle: "a" }, now);
    assert.deepEqual(await redeem(db, code, ""), { ok: false, why: "sign-in" });
    assert.deepEqual(await redeem(db, "HI-ABCDEFGH", "a@example.com"), { ok: false, why: "code" });
    assert.deepEqual(await redeem(db, "TRY-ZZZZZZ", "a@example.com"), { ok: false, why: "gone" });
    assert.deepEqual(await redeem(db, code, "a@example.com", { now: now + 15 * DAY }), { ok: false, why: "expired" });
    const paid = { id: "pass-1", status: "monthly-pass", email: "a@example.com", plan: "team", paid: true, runs: 25, paidUntil: new Date(now + 9 * DAY).toISOString() };
    assert.deepEqual(await redeem(db, code, "a@example.com", { rows: [paid] }), { ok: false, why: "pass" });
  });

  test("the banner's view says what the trial is and nothing about who holds it", async () => {
    const db = fakeDb();
    const { code } = await trials.mintTrial(db, { kind: "student", network: "x", handle: "a", email: "s@uni.edu", domain: "uni.edu" }, now);
    const v = await trials.view(db, code, now);
    assert.deepEqual(v, { code, open: true, why: "", days: 2, runs: 3, plan: "freelancer", planName: "Freelancer", validUntil: new Date(now + 14 * DAY).toISOString(), domain: "uni.edu" });
    assert.equal(JSON.stringify(v).includes("s@uni.edu"), false);
    assert.equal(await trials.view(db, "nope", now), null);
    assert.equal((await trials.view(db, "TRY-ZZZZZZ", now)).why, "gone");
  });

  test("an ended trial gets one AFTER- code at its kind's percent, and its person moves to trial_ended, then discount_sent when mailed", async () => {
    const db = fakeDb();
    const { code } = await trials.handle({ db, now }, { op: "outreach-mint", kind: "student", network: "instagram", handle: "stu", lang: "fr" });
    await redeem(db, code, "stu@uni.fr");
    assert.equal(await trials.endTrials(db, { now: now + DAY }), "no trials ended");
    const notes = [];
    const mail = async (row, note) => { notes.push({ to: row.email, note }); return true; };
    const at = now + 2 * DAY + 2000;
    assert.equal(await trials.endTrials(db, { now: at, mail, rand: seq([1]) }), "1 trials ended, 1 follow-up codes, 1 mailed");
    const c = doc(db, "url_review_coupons/AFTER-BBBBBB");
    assert.deepEqual([c.percent, c.perEmail, c.maxUses, c.purposes, c.email, c.person, c.trial, c.kind], [40, 1, 1, ["new-run", "report", "pass"], "stu@uni.fr", "instagram:stu", code, "student"]);
    assert.equal(Date.parse(c.validUntil) - at, 7 * DAY);
    assert.equal(offers.couponOpen(Object.assign({ code: "AFTER-BBBBBB" }, c), "new-run", "", at, 0), true);
    assert.equal(offers.couponOpen(Object.assign({ code: "AFTER-BBBBBB" }, c), "pass", "", at, 0), true, "the code opens the pass the person tried (#3142)");
    assert.equal(offers.couponOpen(Object.assign({ code: "AFTER-BBBBBB" }, c), "pass", "", at + 7 * DAY, 0), false, "valid 7 days");
    assert.equal(offers.discountFor(2900, 1, { coupon: Object.assign({ code: "AFTER-BBBBBB" }, c) }).percent, 40);
    assert.equal(core.chargedUsd({ purpose: "pass", plan: "freelancer", priceUsd: offers.discountFor(2900, 1, { coupon: c }).usd, listUsd: 29 }).usd, 17.4);
    const row = doc(db, "url_reviews/trial-" + code);
    assert.equal(row.followup, "AFTER-BBBBBB");
    assert.ok(row.followupMailedAt);
    assert.equal(notes[0].to, "stu@uni.fr");
    assert.match(notes[0].note.subject, /40 %/);
    assert.match(notes[0].note.text, /AFTER-BBBBBB[\s\S]*pass Freelancer[\s\S]*https:\/\/carlosandmunoz\.com\/qa-review-pay-fr\.html\?purpose=pass&plan=freelancer&coupon=AFTER-BBBBBB/);
    const p = doc(db, "outreach_people/instagram:stu");
    assert.equal(p.stage, "discount_sent");
    assert.deepEqual(p.history.map((h) => h.stage), ["offered", "claimed", "trial_ended", "discount_sent"]);
    assert.equal(p.offers[1].code, "AFTER-BBBBBB");
    assert.equal(await trials.endTrials(db, { now: at + DAY, mail }), "no trials ended", "a trial gets its follow-up once");
    assert.equal(notes.length, 1);
  });

  test("a trial whose runs are spent ends early; an unmailed follow-up leaves the person at trial_ended", async () => {
    const db = fakeDb();
    const { code } = await trials.handle({ db, now }, { op: "outreach-mint", kind: "company", domain: "acme.com" });
    await redeem(db, code, "it@acme.com");
    await db.collection("url_reviews").doc("trial-" + code).update({ runsUsed: 3 });
    assert.equal(await trials.endTrials(db, { now: now + DAY, mail: async () => false }), "1 trials ended, 1 follow-up codes, 0 mailed");
    const row = doc(db, "url_reviews/trial-" + code);
    assert.equal(doc(db, "url_review_coupons/" + row.followup).percent, 20);
    assert.equal(doc(db, "outreach_people/web:acme.com").stage, "trial_ended");
  });

  test("a payment with an AFTER- code moves its person to paid", async () => {
    const db = fakeDb();
    const { code } = await trials.handle({ db, now }, { op: "outreach-mint", kind: "social", network: "x", handle: "pay" });
    await redeem(db, code, "pay@example.com");
    await trials.endTrials(db, { now: now + 3 * DAY, rand: seq([2]) });
    assert.equal((await trials.afterPaid(db, "after-cccccc", now + 4 * DAY)).stage, "paid");
    assert.equal(await trials.afterPaid(db, "BACK-ABCDEFGH", now), null);
  });

  test("the follow-up note exists in every page language and adds the stop link when given", () => {
    Object.keys(trials.PAGES).forEach((lang) => {
      const note = trials.followupNote(lang, { code: "AFTER-AAAAAA", p: 20, days: 2, plan: "Freelancer", date: "2026-11-18", url: "https://x", stop: "https://stop" });
      assert.equal(note.lang, lang);
      assert.match(note.text, /AFTER-AAAAAA/);
      assert.match(note.text, /https:\/\/stop/);
      assert.match(note.text, /Calle 29 # 29-31, Medellín, Colombia \(050016\)/);
      assert.doesNotMatch(note.subject + note.text, /\{\w+\}/);
    });
    assert.doesNotMatch(trials.followupNote("en", { code: "C", p: 1, days: 2, date: "d", url: "u" }).text, /No more notes/);
  });

  test("the follow-up link opens the trial's pass on the pay page in the person's language with the code filled in", () => {
    assert.equal(trials.passPayUrl("en", "AFTER-AAAAAA"), "https://carlosandmunoz.com/qa-review-pay.html?purpose=pass&plan=freelancer&coupon=AFTER-AAAAAA");
    assert.equal(trials.passPayUrl("de", "AFTER-AAAAAA"), "https://carlosandmunoz.com/qa-review-pay-de.html?purpose=pass&plan=freelancer&coupon=AFTER-AAAAAA");
    assert.match(trials.passPayUrl("xx", "AFTER-AAAAAA"), /\/qa-review-pay\.html\?/);
  });
});

test.describe("outreach ledger", () => {
  test("idFor lowercases and drops the @; a company is web:<domain>", () => {
    assert.equal(people.idFor("X", "@CarlosM"), "x:carlosm");
    assert.equal(people.idFor("web", "https://www.Acme.com/path"), "web:acme.com");
    assert.equal(people.idFor("", "a"), "");
  });

  test("stages only move forward; declined and blocked hold the person", () => {
    assert.equal(people.canMove("offered", "engaged"), false);
    assert.equal(people.canMove("engaged", "claimed"), true);
    assert.equal(people.canMove("declined", "offered"), false);
    assert.equal(people.canMove("declined", "blocked"), true);
    assert.equal(people.canMove("blocked", "found"), false);
    assert.equal(people.canMove("blocked", "declined"), false);
    assert.equal(people.canMove("paid", "declined"), false);
    assert.equal(people.canMove("paid", "blocked"), true);
    assert.equal(people.canMove("found", "nope"), false);
  });

  test("touch merges, appends history on a stage change, and never moves a blocked person on", async () => {
    const db = fakeDb();
    const first = await people.touch(db, "bluesky:ana", { kind: "social", name: "Ana", threads: [{ url: "https://bsky.app/p/1", lastAt: "2026-11-09", ourLast: "hi" }] }, now);
    assert.deepEqual([first.stage, first.moved, first.network, first.handle], ["found", true, "bluesky", "ana"]);
    const second = await people.touch(db, "bluesky:ana", { stage: "replied", threads: [{ url: "https://bsky.app/p/1", theirLast: "thanks" }], dms: [{ network: "bluesky", text: "Hello" }], links: { site: "https://ana.dev", bad: "javascript:x" } }, now + 1);
    assert.equal(second.stage, "replied");
    assert.deepEqual(second.threads, [{ url: "https://bsky.app/p/1", lastAt: "2026-11-09", ourLast: "hi", theirLast: "thanks" }]);
    assert.equal(second.dms.length, 1);
    assert.deepEqual(second.links, { site: "https://ana.dev" });
    const back = await people.touch(db, "bluesky:ana", { stage: "engaged" }, now + 2);
    assert.deepEqual([back.stage, back.moved, back.held], ["replied", false, true]);
    await people.touch(db, "bluesky:ana", { stage: "blocked", by: "carlos", note: "asked us to stop" }, now + 3);
    const after = await people.touch(db, "bluesky:ana", { stage: "offered", note: "tried" }, now + 4);
    assert.deepEqual([after.stage, after.held], ["blocked", true]);
    assert.deepEqual(after.history.map((h) => h.stage), ["found", "replied", "blocked", "blocked"]);
    assert.equal(after.history[2].note, "asked us to stop");
    await assert.rejects(people.touch(db, "nocolon", {}), /ledger id/);
  });

  test("a stopped person keeps their stage when the trial steps touch them", async () => {
    const db = fakeDb();
    const { code } = await trials.handle({ db, now }, { op: "outreach-mint", kind: "social", network: "x", handle: "no" });
    await trials.handle({ db, now }, { op: "outreach-touch", id: "x:no", patch: { stage: "declined" } });
    await redeem(db, code, "no@example.com");
    assert.equal(doc(db, "outreach_people/x:no").stage, "declined");
  });

  test("listDue gives the people whose nextAt has come, soonest first, without stopped ones", async () => {
    const db = fakeDb();
    const iso = (ms) => new Date(ms).toISOString();
    await people.touch(db, "x:a", { kind: "social", stage: "engaged", nextAt: iso(now - 2000) }, now);
    await people.touch(db, "x:b", { kind: "social", stage: "engaged", nextAt: iso(now - 5000) }, now);
    await people.touch(db, "x:c", { kind: "social", stage: "engaged", nextAt: iso(now + DAY) }, now);
    await people.touch(db, "x:d", { kind: "student", stage: "replied", nextAt: iso(now - 1000) }, now);
    await people.touch(db, "x:e", { kind: "social", stage: "blocked", nextAt: iso(now - 1000) }, now);
    const due = await trials.handle({ db, now }, { op: "outreach-due", kind: "social", before: iso(now) });
    assert.deepEqual(due.people.map((p) => p.id), ["x:b", "x:a"]);
    assert.deepEqual((await people.listDue(db, { stage: "replied", before: iso(now) })).map((p) => p.id), ["x:d"]);
    assert.deepEqual((await people.listDue(db, { before: iso(now), limit: 1 })).map((p) => p.id), ["x:b"]);
  });

  test("the CLI lists, shows and exports the ledger as CSV", async () => {
    const db = fakeDb();
    await trials.handle({ db, now }, { op: "outreach-mint", kind: "social", network: "x", handle: "ana", name: "Ana, Dev" });
    await people.touch(db, "web:acme.com", { kind: "company", domain: "acme.com" }, now);
    const listed = await cli.main(["list"], () => db);
    assert.match(listed, /x:ana\s+social\s+offered\s+TRY-/);
    assert.match(listed, /2 people: found 1, offered 1/);
    assert.match(await cli.main(["list", "--kind", "company"], () => db), /1 people: found 1/);
    assert.equal(JSON.parse(await cli.main(["show", "x:ana"], () => db)).stage, "offered");
    const csv = (await cli.main(["export", "--csv"], () => db)).split("\n");
    assert.equal(csv[0], "id,kind,stage,network,handle,name,lang,domain,email,offers,lastOffer,dms,uses,lastThread,nextAt,updatedAt,createdAt,notes");
    assert.ok(csv.some((l) => l.startsWith("x:ana,social,offered,x,ana,\"Ana, Dev\"")));
    await assert.rejects(cli.main(["list", "--stage", "nope"], () => db), /--stage is one of/);
    await assert.rejects(cli.main(["frob"], () => db), /Usage/);
  });

  test("counts tally people at each stage, in all and by kind", () => {
    assert.deepEqual(people.counts([{ kind: "social", stage: "offered" }, { kind: "social", stage: "paid" }, { kind: "student" }]),
      { total: 3, stages: { offered: 1, paid: 1, found: 1 }, kinds: { social: { offered: 1, paid: 1 }, student: { found: 1 } }, lives: { count: 0, uses: 0 } });
    assert.deepEqual(people.counts([{ kind: "live", stage: "claimed", uses: 4 }, { kind: "live", stage: "offered" }]).lives, { count: 2, uses: 4 });
  });
});
