const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../functions/url-review-core");
const offers = require("../../functions/url-review-offers");
const desk = require("../../functions/url-review-desk");

const now = Date.parse("2026-11-01T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const fw = (n) => core.FRAMEWORKS.slice(0, n);
const pass = (over) => Object.assign({ id: "p1", status: "monthly-pass", email: "ana@example.com", plan: "freelancer", priceUsd: 29, paid: true, runs: 10, runsUsed: 0, paidUntil: iso(now + 20 * day) }, over);

test.describe("pass pricing", () => {
  test("a pass is its plan's price, flat, and only the three plans are sold", () => {
    assert.deepEqual(["freelancer", "team", "pro"].map((id) => core.priceForPass(id).usd), [29, 79, 189]);
    assert.deepEqual(offers.MONTHLY_PLANS.map((plan) => [plan.id, plan.name, plan.usd]), [["freelancer", "Freelancer", 29], ["team", "Team", 79], ["pro", "Pro", 189]]);
    assert.throws(() => core.priceForPass("gold"), /Freelancer, Team, or Pro/);
    assert.equal(core.chargedUsd({ purpose: "pass", plan: "team", priceUsd: 79 }).usd, 79);
    assert.throws(() => core.chargedUsd({ purpose: "pass", plan: "team", priceUsd: 71.1, listUsd: 79 }), /out of range/);
    assert.throws(() => core.chargedUsd({ purpose: "pass", plan: "team", priceUsd: 29 }), /does not match/);
    [29, 79, 189].forEach((usd) => assert.equal(core.priceMatches(usd), true, usd));
    assert.equal(offers.paidPurpose("pass"), "pass");
  });

  test("a run within the plan asks for nothing; Pro includes every framework, tool, page and link step", () => {
    const freelancer = offers.planById("freelancer");
    assert.equal(core.priceForPassExtras(freelancer, { frameworks: fw(3), tools: [], pages: 20, depth: 2 }).cents, 0);
    assert.equal(core.priceForPassExtras(offers.planById("team"), { frameworks: fw(6), tools: ["axe-core", "Lighthouse"], pages: 100, depth: 5 }).cents, 0);
    assert.equal(core.priceForPassExtras(offers.planById("pro"), { frameworks: core.FRAMEWORKS, tools: core.SPECIALIST_TOOLS, pages: 100, depth: 5 }).cents, 0);
  });

  test("over the plan, only the extras are charged at the tag prices: 5 USD per framework or tool, and the step difference", () => {
    const freelancer = offers.planById("freelancer");
    const extras = core.priceForPassExtras(freelancer, { frameworks: fw(4), tools: ["axe-core"], pages: 60, depth: 4 });
    assert.equal(extras.billing, "pass");
    assert.deepEqual(extras.extra, [core.FRAMEWORKS[3], "axe-core"]);
    assert.deepEqual(extras.discount.map((row) => row.usd), [0, 0, 0, 5, 5]);
    assert.deepEqual([extras.frameworkUsd, extras.pageUsd, extras.depthUsd, extras.usd], [10, 9, 7, 26]);
    assert.equal(core.priceForPassExtras(offers.planById("team"), { frameworks: fw(8), tools: ["Percy"], pages: 100, depth: 5 }).usd, 5);
    assert.equal(core.chargedUsd({ purpose: "new-run", passPlan: freelancer, frameworks: fw(4), tools: ["axe-core"], pages: 60, depth: 4, priceUsd: 26 }).usd, 26);
    assert.throws(() => core.chargedUsd({ purpose: "new-run", passPlan: freelancer, frameworks: fw(4), tools: ["axe-core"], pages: 60, depth: 4, priceUsd: 13, listUsd: 26 }), /out of range/);
    assert.equal(core.priceMatches(26), true);
  });
});

test.describe("pass runs", () => {
  const ask = (over) => Object.assign({ frameworks: fw(2), tools: [], pages: 20, depth: 2 }, over);

  test("an open pass with runs left carries the run; a used-up, ended, refunded or replaced one does not", () => {
    const run = offers.passRun([pass({ runsUsed: 9 })], "Ana@Example.com", ask(), now);
    assert.equal(run.row.id, "p1");
    assert.equal(run.due, false);
    assert.equal(offers.passRun([pass({ runsUsed: 10 })], "ana@example.com", ask(), now), null);
    assert.equal(offers.passRun([pass({ paidUntil: iso(now - 1) })], "ana@example.com", ask(), now), null);
    assert.equal(offers.passRun([pass({ paid: false, refunded: true })], "ana@example.com", ask(), now), null);
    assert.equal(offers.passRun([pass({ replacedBy: "pass-x" })], "ana@example.com", ask(), now), null);
    assert.equal(offers.passRun([pass({ paid: false })], "ana@example.com", ask(), now), null);
    assert.equal(offers.passRun([pass({ paid: false, localPass: true })], "ana@example.com", ask(), now).row.id, "p1");
    assert.equal(offers.passRun([pass()], "bo@example.com", ask(), now), null);
  });

  test("a desk pass written before runs were counted holds its plan's runs", () => {
    const old = pass({ runs: undefined, runsUsed: undefined, plan: "team", paid: false, localPass: true });
    assert.equal(offers.passRuns(old), 25);
    assert.equal(offers.passLeft(old), 25);
    assert.equal(offers.passLeft(pass({ runs: 12, runsUsed: 15 })), 0);
  });

  test("a run over the plan is due until its extras are paid, and the paid extras credit covers only the same run", () => {
    const over = ask({ frameworks: fw(5), pages: 40 });
    const due = offers.passRun([pass()], "ana@example.com", over, now);
    assert.equal(due.due, true);
    assert.equal(due.extras.usd, 15);
    const credit = { id: "credit-r1", status: "run-credit", passExtra: true, email: "ana@example.com", usedAt: "", frameworks: fw(5), tools: [], pages: 40, depth: 2 };
    const paid = offers.passRun([pass(), credit], "ana@example.com", over, now);
    assert.equal(paid.due, false);
    assert.equal(paid.credit.id, "credit-r1");
    assert.equal(offers.passRun([pass(), Object.assign({}, credit, { usedAt: iso(now) })], "ana@example.com", over, now).due, true);
    assert.equal(offers.passRun([pass(), credit], "ana@example.com", Object.assign({}, over, { pages: 60 }), now).due, true);
    assert.equal(offers.passRun([pass(), Object.assign({}, credit, { email: "bo@example.com" })], "ana@example.com", over, now).due, true);
  });

  test("each comparison competitor is one pass run with nothing over the plan", () => {
    const run = offers.passRun([pass()], "ana@example.com", ask({ frameworks: fw(12), pages: 100, depth: 5, compareWith: "abc123" }), now);
    assert.equal(run.due, false);
    assert.equal(run.extras, null);
  });

  test("a plain run credit never pays for extras over a pass, and an extras credit never pays for a plain run", () => {
    const value = core.validateIntake({ termsAccepted: true, termsVersion: core.TERMS_VERSION, name: "Ana Ruiz", email: "ana@example.com", reasonCode: "teaching", frameworks: fw(2), tools: ["axe-core"], url: "https://shop.example.com/" }).value;
    assert.deepEqual(value.tools, ["axe-core"]);
    const earlier = { status: "complete", deviceId: "d1", createdAt: iso(now - day) };
    const extra = { id: "x1", status: "run-credit", passExtra: true, deviceId: "d1", frameworks: fw(2), tools: ["axe-core"], pages: 20, depth: 2 };
    assert.equal(core.judgeAttempts([earlier, extra], { deviceId: "d1", ip: "" }, value).code, "payment");
    const plain = Object.assign({}, extra, { id: "k1", passExtra: undefined });
    assert.deepEqual(core.judgeAttempts([earlier, plain], { deviceId: "d1", ip: "" }, value), { ok: true, consumeId: "k1" });
    assert.equal(core.passExtraCredit([plain], "ana@example.com", value), null);
  });

  test("a pass run opens its report; Pro also opens the signed-in run", () => {
    assert.deepEqual(offers.passAddons("freelancer"), []);
    assert.deepEqual(offers.passAddons("pro"), ["credentials"]);
  });
});

test.describe("pass purchase", () => {
  test("a first pass starts now, for 30 days, with the plan's runs and none used", () => {
    const made = offers.passPurchase("team", [], " Ana@Example.com ", now, { reference: "r1", sessionId: "S1" });
    assert.equal(made.replaces, "");
    assert.deepEqual([made.row.status, made.row.email, made.row.plan, made.row.priceUsd, made.row.paid, made.row.runs, made.row.runsUsed, made.row.paidUntil, made.row.reference],
      ["monthly-pass", "ana@example.com", "team", 79, true, 25, 0, iso(now + 30 * day), "r1"]);
  });

  test("a pass bought while one is open starts with the new plan, keeps the runs left, and adds 30 days to the later end", () => {
    const made = offers.passPurchase("pro", [pass({ runsUsed: 7 })], "ana@example.com", now, {});
    assert.equal(made.replaces, "p1");
    assert.deepEqual([made.row.plan, made.row.runs, made.row.carriedRuns, made.row.paidUntil], ["pro", 63, 3, iso(now + 50 * day)]);
    const ended = offers.passPurchase("freelancer", [pass({ paidUntil: iso(now - day) })], "ana@example.com", now, {});
    assert.deepEqual([ended.replaces, ended.row.runs, ended.row.paidUntil], ["", 10, iso(now + 30 * day)]);
  });

  test("the account file and the standing show the open pass's plan, runs left and end", () => {
    const rows = [pass({ runsUsed: 4 }), pass({ id: "p0", paidUntil: iso(now - 40 * day), plan: "pro" })];
    const file = offers.accountFile(rows, "ana@example.com", now);
    assert.equal(file.pass, true);
    assert.equal(file.open, false);
    assert.deepEqual([file.passDetail.plan, file.passDetail.runs, file.passDetail.runsLeft, file.passDetail.paidUntil], ["freelancer", 10, 6, iso(now + 20 * day)]);
    assert.equal(file.lastPlan, "freelancer");
    const lapsed = offers.accountFile([pass({ paidUntil: iso(now - day), plan: "team" })], "ana@example.com", now);
    assert.equal(lapsed.pass, false);
    assert.equal(lapsed.passDetail, null);
    assert.equal(lapsed.lastPlan, "team");
    assert.deepEqual(offers.passPlans().map((plan) => plan.id), ["freelancer", "team", "pro"]);
  });

  test("the next plan up follows Freelancer, Team, Pro, and stays at Pro", () => {
    assert.deepEqual(["", "freelancer", "team", "pro"].map((id) => offers.nextPlan(id).id), ["freelancer", "team", "pro", "pro"]);
  });

  test("a refund takes the pass back, and a dispute marks it", () => {
    const refund = offers.reversalUpdates([pass()], { kind: "refund", at: "t" });
    assert.deepEqual(refund, [{ id: "p1", set: { paid: false, refunded: true, refundedAt: "t" } }]);
    assert.equal(offers.passFor([Object.assign(pass(), refund[0].set)], "ana@example.com", now), null);
    assert.equal(offers.reversalUpdates([pass()], { kind: "dispute", status: "OPEN" })[0].set.disputed, true);
  });

  test("the desk names a bought pass apart from one it granted", () => {
    assert.equal(desk.alertFrom("", pass()).kind, "pass-paid");
    assert.equal(desk.alertFrom("", pass({ paid: false, localPass: true })).kind, "monthly");
    assert.match(desk.alertFrom("pass-paid", pass()).detail, /Pass: freelancer · until 2026-11-21 · 10 runs/);
  });
});

// Firestore runs transactions as if one after another; this store does exactly that.
function fakeDb(seed) {
  const docs = new Map(Object.entries(seed || {}));
  let chain = Promise.resolve();
  const snap = (id) => ({ exists: docs.has(id), id, data: () => Object.assign({}, docs.get(id)), get: (key) => (docs.get(id) || {})[key] });
  return {
    docs,
    collection: () => ({ doc: (id) => ({ id }) }),
    runTransaction(fn) {
      const run = chain.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => snap(ref.id),
          set: (ref, data) => writes.push(() => docs.set(ref.id, Object.assign({}, data))),
          update: (ref, data) => writes.push(() => docs.set(ref.id, Object.assign({}, docs.get(ref.id), data)))
        };
        const out = await fn(tx);
        writes.forEach((write) => write());
        return out;
      });
      chain = run.catch(() => {});
      return run;
    }
  };
}

test.describe("pass writes", () => {
  const reviewPass = require("../../functions/url-review-pass");
  const open = { email: "Ana@Example.com", plan: "team", priceUsd: 79 };

  test("a replayed webhook or a second confirm writes one pass, not two", async () => {
    const db = fakeDb();
    const payment = { reference: "ab12cd34", sessionId: "ORDER1", provider: "paypal" };
    const first = await reviewPass.writePass(db, open, payment, [], now);
    const again = await Promise.all([reviewPass.writePass(db, open, payment, [], now), reviewPass.writePass(db, open, payment, [], now)]);
    assert.equal(first.id, "pass-ab12cd34");
    assert.deepEqual(again, [null, null]);
    assert.equal([...db.docs.values()].filter((row) => row.status === "monthly-pass").length, 1);
    assert.deepEqual([db.docs.get("pass-ab12cd34").email, db.docs.get("pass-ab12cd34").runs, db.docs.get("pass-ab12cd34").priceUsd], ["ana@example.com", 25, 79]);
  });

  test("a pass bought over an open one replaces it and carries its runs left", async () => {
    const db = fakeDb({ p1: pass({ runsUsed: 6 }) });
    const made = await reviewPass.writePass(db, open, { reference: "ef56" }, [pass({ runsUsed: 6 })], now);
    assert.deepEqual([made.runs, made.carriedRuns, made.paidUntil], [29, 4, iso(now + 50 * day)]);
    assert.equal(db.docs.get("p1").replacedBy, "pass-ef56");
  });

  test("parallel runs cannot overspend a pass, and a failed run gives its run and its extras credit back", async () => {
    const db = fakeDb({ p1: pass({ runsUsed: 8 }), x1: { status: "run-credit", passExtra: true, usedAt: "" } });
    const taken = await Promise.all([1, 2, 3, 4].map(() => reviewPass.takePassRun(db, "p1", "", now)));
    assert.deepEqual(taken.filter(Boolean).length, 2);
    assert.equal(db.docs.get("p1").runsUsed, 10);
    await reviewPass.giveBackPassRun(db, "p1", "");
    assert.equal(db.docs.get("p1").runsUsed, 9);
    assert.equal(await reviewPass.takePassRun(db, "p1", "x1", now), true);
    assert.equal(db.docs.get("x1").usedAt, iso(now));
    assert.equal(await reviewPass.takePassRun(db, "p1", "x1", now), false);
    await reviewPass.giveBackPassRun(db, "p1", "x1");
    assert.deepEqual([db.docs.get("p1").runsUsed, db.docs.get("x1").usedAt], [9, ""]);
    assert.equal(await reviewPass.takePassRun(fakeDb({ p1: pass({ paidUntil: iso(now - 1) }) }), "p1", "", now), false);
  });

  test("a desk pass without counted runs gets its plan's runs fixed on its first run", async () => {
    const db = fakeDb({ p1: pass({ runs: undefined, runsUsed: undefined, paid: false, localPass: true, plan: "pro" }) });
    assert.equal(await reviewPass.takePassRun(db, "p1", "", now), true);
    assert.deepEqual([db.docs.get("p1").runs, db.docs.get("p1").runsUsed], [60, 1]);
  });
});

test.describe("pass renewal note", () => {
  test("a paid pass ending within three days is reminded once; a granted, newer-covered or far one is not", () => {
    const soon = pass({ paidUntil: iso(now + 2 * day), lang: "de" });
    assert.deepEqual(offers.renewalsDue([soon], now).map((row) => row.id), ["p1"]);
    assert.deepEqual(offers.renewalsDue([Object.assign({}, soon, { renewalSentAt: iso(now) })], now), []);
    assert.deepEqual(offers.renewalsDue([pass({ paidUntil: iso(now + 4 * day) })], now), []);
    assert.deepEqual(offers.renewalsDue([Object.assign({}, soon, { paid: false, localPass: true })], now), []);
    assert.deepEqual(offers.renewalsDue([soon, pass({ id: "p2", paidUntil: iso(now + 30 * day) })], now), []);
    assert.deepEqual(offers.renewalsDue([pass({ paidUntil: iso(now - 1) })], now), []);
  });

  test("the note is plain text in the language the pass was bought in, with the plan, the end date, the runs left and the account page", () => {
    const row = pass({ paidUntil: "2026-11-03T12:00:00Z", runsUsed: 6 });
    ["en", "es", "pt", "de", "fr", "it"].forEach((lang) => {
      const mail = offers.renewalMail(Object.assign({}, row, { lang }));
      assert.equal(mail.lang, lang);
      assert.match(mail.subject, /Freelancer/, lang);
      assert.match(mail.subject, /2026-11-03/, lang);
      assert.match(mail.text, /\b4\b/, lang);
      assert.match(mail.text, /https:\/\/carlosandmunoz\.com\/qa-review-account\.html/, lang);
      assert.equal(mail.html, undefined);
      assert.ok(!/\{\w+\}/.test(mail.text + mail.subject), lang);
    });
    assert.match(offers.renewalMail(Object.assign({}, row, { lang: "es" })).subject, /Tu pase Freelancer termina/);
    assert.equal(offers.renewalMail(Object.assign({}, row, { lang: "xx" })).lang, "en");
  });
});
