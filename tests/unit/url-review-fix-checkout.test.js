const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../functions/url-review-core");
const offers = require("../../functions/url-review-offers");
const customerMail = require("../../functions/url-review-customer-mail");
const fixOffers = require("../../functions/url-review-fix-offers");
const fixCheckout = require("../../functions/url-review-fix-checkout");
const fixRereview = require("../../functions/url-review-fix-rereview");
const fixMail = require("../../functions/url-review-fix-mail");
const fixRequests = require("../../functions/url-review-fix-requests");
const sample = require("./fixtures/review-carlosandmunoz.json");

const NOW = Date.parse("2026-11-09T12:00:00Z");
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const HEADERS = fixOffers.packageById("security-headers");

function reportRow(changes) {
  return Object.assign({ email: "ana@example.com", paid: true, lang: "es", requestedUrl: "https://carlosandmunoz.com/", pages: 20, depth: 2, report: Object.assign({ id: sample.id }, JSON.parse(JSON.stringify(sample))) }, changes || {});
}

function fixRow(changes) {
  const record = fixOffers.requestRecord({ findings: ["F-01", "F-03"], package: "security-headers", lang: "de" }, reportRow(), "ana@example.com", NOW);
  return Object.assign(record, changes || {});
}

// A Firestore stand-in with the calls the routes, checkout and trigger make.
function memoryDb(seed) {
  const data = { url_reviews: new Map(), [fixOffers.COLLECTION]: new Map() };
  Object.keys(seed || {}).forEach((name) => Object.keys(seed[name]).forEach((id) => data[name].set(id, seed[name][id])));
  let n = 0;
  const docRef = (name, id) => ({
    id,
    get: async () => ({ id, exists: data[name].has(id), data: () => data[name].get(id) }),
    set: async (value) => data[name].set(id, value),
    create: async (value) => {
      if (data[name].has(id)) throw Object.assign(new Error("6 ALREADY_EXISTS: Document already exists"), { code: 6 });
      data[name].set(id, value);
    },
    update: async (patch) => data[name].set(id, Object.assign({}, data[name].get(id), patch)),
    _name: name
  });
  const docsOf = (name, keep) => [...data[name].entries()].filter(([, value]) => keep(value)).map(([id, value]) => ({ id, data: () => value }));
  return {
    data,
    collection: (name) => ({
      doc: (id) => docRef(name, id),
      add: async (value) => { const id = "fix" + (++n); data[name].set(id, value); return docRef(name, id); },
      where: (field, op, value) => ({ limit: () => ({ get: async () => ({ docs: docsOf(name, (v) => v[field] === value) }) }) }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: docsOf(name, () => true) }) }) })
    }),
    runTransaction: async (work) => work({
      get: (ref) => ref.get(),
      update: (ref, patch) => data[ref._name].set(ref.id, Object.assign({}, data[ref._name].get(ref.id), patch))
    })
  };
}

function response() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = (key, value) => { res.headers[key] = value; return res; };
  return res;
}

function deps(db, mailed) {
  const signedIn = async (body, found) => (found && body.session === "ok" ? { ok: true, email: found.email } : { ok: false, status: 401, error: "Sign in.", code: "sign-in", signIn: true });
  return {
    db,
    access: signedIn,
    paidAccess: async (body, found) => {
      const access = await signedIn(body, found);
      return access.ok && found.paid !== true ? { ok: false, status: 402, error: "Paid only." } : access;
    },
    mailOwner: async (notice) => mailed.push(["owner", notice.subject]),
    mailCustomer: async (lang, email, mail, category) => mailed.push(["customer", email, lang, category]),
    deskUrl: "https://desk.example/desk"
  };
}

test("every package price is a capturable PayPal amount, charged at its list price only", () => {
  for (const pkg of fixOffers.PACKAGES) {
    assert.ok(core.priceMatches(pkg.usd), pkg.id);
    const priced = core.chargedUsd({ purpose: "fix", fixPackage: pkg.id, priceUsd: pkg.usd });
    assert.equal(priced.usd, pkg.usd);
    assert.equal(priced.package, pkg.id);
  }
  assert.throws(() => core.chargedUsd({ purpose: "fix", fixPackage: "security-headers", priceUsd: HEADERS.usd - 10, listUsd: HEADERS.usd }), /discount/);
  assert.throws(() => core.chargedUsd({ purpose: "fix", fixPackage: "security-headers", priceUsd: 1 }), /does not match/);
  assert.throws(() => core.priceForFix("logo-design"), /not offered/);
});

test("the PayPal line names the package and the site, and the payment counts as a fix", () => {
  assert.equal(core.productName("fix", [], core.priceForFix("seo-meta", "shop.example.com")), "QA-lab URL Review fix · SEO meta and structured data · shop.example.com");
  assert.equal(offers.paidPurpose("fix"), "fix");
  for (const lang of LANGS) assert.ok(customerMail.receiptMail({ lang, purpose: "fix", host: "shop.example.com", priceUsd: HEADERS.usd, reference: "R1", paidAt: "2026-11-09T00:00:00Z" }).text.length > 0, lang);
  const items = LANGS.map((lang) => customerMail.receiptMail({ lang, purpose: "fix", priceUsd: 1, reference: "R", paidAt: "2026-11-09T00:00:00Z" }).text);
  const runs = LANGS.map((lang) => customerMail.receiptMail({ lang, purpose: "new-run", priceUsd: 1, reference: "R", paidAt: "2026-11-09T00:00:00Z" }).text);
  items.forEach((text, i) => assert.notEqual(text, runs[i], LANGS[i]));
});

test("only the address that asked may pay, once, for a package request that is new or quoted", () => {
  const row = fixRow();
  assert.equal(fixCheckout.payable(null, "ana@example.com").status, 404);
  assert.equal(fixCheckout.payable(row, "").status, 401);
  assert.equal(fixCheckout.payable(row, "").signIn, true);
  assert.equal(fixCheckout.payable(row, "eve@example.com").status, 403);
  assert.equal(fixCheckout.payable(row, "ana@example.com", "other").status, 400);
  assert.equal(fixCheckout.payable(fixRow({ paidAt: "2026-11-09T13:00:00Z" }), "ana@example.com").status, 409);
  assert.equal(fixCheckout.payable(fixRow({ status: "done" }), "ana@example.com").status, 409);
  assert.equal(fixCheckout.payable(fixRow({ package: "" }), "ana@example.com").status, 400);
  assert.deepEqual(fixCheckout.payable(fixRow({ status: "quoted" }), "ANA@example.com", sample.id), { ok: true, package: "security-headers", usd: HEADERS.usd, host: row.host, reportId: sample.id });
});

test("the pay page quote carries the price and the package name in every language", () => {
  const quote = fixCheckout.quote("performance");
  assert.equal(quote.usd, fixOffers.packageById("performance").usd);
  assert.deepEqual(Object.keys(quote.fixPackage.name).sort(), LANGS.slice().sort());
  assert.equal(fixCheckout.quote("nope"), null);
});

test("a confirmed payment accepts the request once, keeps a payment row, and tells the owner once", async () => {
  const db = memoryDb({ [fixOffers.COLLECTION]: { fx1: fixRow() } });
  const mailed = [];
  const open = { fixId: "fx1", fixPackage: "security-headers", reportId: sample.id };
  const payment = { provider: "paypal", reference: "abc123", sessionId: "ORDER1", priceUsd: HEADERS.usd, test: false, createdAt: "2026-11-09T13:00:00.000Z" };
  const row = await fixCheckout.recordPayment(db, open, payment, deps(db, mailed));
  const saved = db.data[fixOffers.COLLECTION].get("fx1");
  assert.equal(saved.status, "accepted");
  assert.equal(saved.paidAt, "2026-11-09T13:00:00.000Z");
  assert.deepEqual(saved.paid, { reference: "abc123", priceUsd: HEADERS.usd, provider: "paypal", test: false });
  assert.deepEqual(saved.history.at(-1), { status: "accepted", at: "2026-11-09T13:00:00.000Z", by: "payment" });
  assert.equal(row.status, "paid-addon");
  assert.equal(row.purpose, "fix");
  assert.equal(row.email, "ana@example.com");
  assert.ok(db.data.url_reviews.has("paid-fix-abc123"));
  assert.equal(mailed.length, 1);
  assert.match(mailed[0][1], /^Fix paid: Security headers for carlosandmunoz\.com/);
  await fixCheckout.recordPayment(db, open, payment, deps(db, mailed));
  assert.equal(mailed.length, 1);
  assert.equal(db.data[fixOffers.COLLECTION].get("fx1").history.length, 2);
});

test("marking a fix done queues its re-review once; a failed one can be queued again", () => {
  const at = new Date(NOW).toISOString();
  assert.deepEqual(fixRereview.queuePatch({ status: "in-progress" }, { status: "done" }, {}, NOW), { rereview: { status: "queued", at } });
  assert.deepEqual(fixRereview.queuePatch({ status: "done" }, { status: "done" }, {}, NOW), {});
  assert.deepEqual(fixRereview.queuePatch({ status: "re-reviewed", rereview: { status: "done" } }, { status: "done" }, {}, NOW), {});
  assert.deepEqual(fixRereview.queuePatch({ status: "done", rereview: { status: "running" } }, { status: "done" }, { rereview: true }, NOW), {});
  assert.deepEqual(fixRereview.queuePatch({ status: "done", rereview: { status: "failed" } }, { status: "done" }, { rereview: true }, NOW), { rereview: { status: "queued", at } });
  const queued = { rereview: { status: "queued", at } };
  assert.equal(fixRereview.due(null, queued), true);
  assert.equal(fixRereview.due({ rereview: { status: "failed", at: "x" } }, queued), true);
  assert.equal(fixRereview.due(queued, queued), false);
  assert.equal(fixRereview.due(queued, { rereview: { status: "running", at } }), false);
  assert.equal(fixRereview.due({}, { status: "done" }), false);
});

test("the desk's done queues the re-review on the request", async () => {
  const db = memoryDb({ [fixOffers.COLLECTION]: { fx1: fixRow({ status: "in-progress" }) } });
  const res = response();
  await fixRequests.deskUpdate({ body: { id: "fx1", status: "done" } }, res, "carlos", deps(db, []));
  assert.equal(res.statusCode, 200);
  assert.equal(db.data[fixOffers.COLLECTION].get("fx1").rereview.status, "queued");
  assert.equal(res.body.request.rereview.status, "queued");
});

test("the re-review runs the original address with the original options", () => {
  const goal = fixRereview.target(reportRow({ frameworks: ["Playwright"], pageLang: "es", section: true }));
  assert.equal(goal.url, "https://carlosandmunoz.com/");
  assert.deepEqual(goal.options, { frameworks: ["Playwright"], pages: 20, depth: 2, pageLang: "es", section: true });
  assert.equal(goal.email, "ana@example.com");
  assert.equal(fixRereview.target({ report: { host: "shop.example.com" } }).url, "https://shop.example.com/");
});

function afterReport(change) {
  const report = JSON.parse(JSON.stringify(sample));
  report.insights.findings = report.insights.findings.map((f) => Object.assign({}, f, change(f) || {}));
  report.insights.score = Object.assign({}, report.insights.score, { overall: 93, grade: "A" });
  return report;
}

test("before and after: each asked finding is fixed, still open or needs a person, with the score and new problems", () => {
  const asked = fixRow().findings;
  const after = afterReport((f) => (f.id === "F-01" ? { verdict: "pass" } : f.id === "F-03" ? { verdict: "person" } : f.verdict === "pass" && f.key === sample.insights.findings.find((x) => x.verdict === "pass").key ? { verdict: "fail" } : null));
  const result = fixRereview.beforeAfter(sample, after, asked);
  assert.deepEqual(result.items.map((item) => [item.id, item.state]), [["F-01", "fixed"], ["F-03", "check"]]);
  assert.equal(result.fixed, 1);
  assert.equal(result.open, 1);
  assert.equal(result.scoreBefore, sample.insights.score.overall);
  assert.equal(result.scoreAfter, 93);
  assert.equal(result.newCount, 1);
  const gone = fixRereview.beforeAfter(sample, afterReport(() => null), [{ id: "F-77", key: "sec-gone", title: "Gone", verdict: "fail" }]);
  assert.equal(gone.items[0].state, "fixed");
  assert.equal(fixRereview.beforeAfter(sample, afterReport(() => null), asked).open, 2);
});

test("the re-review report is saved free, tied to the request and the report it re-checks", () => {
  const record = fixRereview.rereviewRecord({ id: "new1", report: {}, lang: "" }, reportRow(), "fx1", NOW);
  assert.equal(record.paid, true);
  assert.equal(record.free, true);
  assert.equal(record.priceUsd, 0);
  assert.equal(record.fixRequest, "fx1");
  assert.equal(record.rereviewOf, sample.id);
  assert.equal(record.lang, "es");
  const done = fixRereview.finishedPatch(fixRow(), "new1", { fixed: 1 }, NOW);
  assert.equal(done.status, "re-reviewed");
  assert.equal(done.rereview.reportId, "new1");
  assert.equal(done.history.at(-1).by, "re-review");
  assert.equal(fixRereview.failedPatch(new Error("browser down"), NOW).rereview.status, "failed");
});

test("the before/after mail reads in each language, with the score, each state and the new report", () => {
  const request = fixRow();
  const result = fixRereview.beforeAfter(sample, afterReport((f) => (f.id === "F-01" ? { verdict: "pass" } : null)), request.findings);
  for (const lang of LANGS) {
    const mail = fixMail.afterMail(Object.assign({}, request, { lang }), "newreport1", result);
    const t = fixMail.FIX[lang];
    assert.ok(mail.subject.includes("carlosandmunoz.com"), lang);
    assert.ok(mail.text.includes(t.stateFixed) && mail.text.includes(t.stateOpen), lang);
    assert.ok(mail.text.includes(sample.insights.score.overall + " (" + sample.insights.score.grade + ") → 93 (A)"), lang);
    assert.match(mail.html, /report=newreport1/, lang);
    assert.ok(mail.text.includes(t.afterWhy), lang);
    assert.doesNotMatch(mail.subject + mail.text, /\{\w+\}/, lang);
  }
  const self = fixMail.afterMail(Object.assign({}, request, { kind: "self", lang: "en" }), "n", result);
  assert.ok(self.text.includes("after your changes"));
});

test("a paid report's owner gets one free re-check over every open finding; a second ask or an unpaid report is refused", async () => {
  const db = memoryDb({ url_reviews: { [sample.id]: reportRow(), "0a1b2c": reportRow({ paid: false }) } });
  const res = response();
  assert.equal(await fixRequests.route({ method: "POST", body: { session: "ok", id: sample.id, lang: "fr" } }, res, "/review/fix/recheck", deps(db, [])), true);
  assert.equal(res.statusCode, 200);
  const saved = db.data[fixOffers.COLLECTION].get("self-" + sample.id);
  assert.equal(saved.kind, "self");
  assert.equal(saved.status, "done");
  assert.equal(saved.rereview.status, "queued");
  assert.equal(saved.lang, "fr");
  assert.equal(saved.findings.length, sample.insights.findings.filter((f) => f.verdict === "fail" || f.verdict === "risk").length);
  const again = response();
  await fixRequests.route({ method: "POST", body: { session: "ok", id: sample.id } }, again, "/review/fix/recheck", deps(db, []));
  assert.equal(again.statusCode, 409);
  assert.equal(again.body.code, "used");
  const unpaid = response();
  await fixRequests.route({ method: "POST", body: { session: "ok", id: "0a1b2c" } }, unpaid, "/review/fix/recheck", deps(db, []));
  assert.equal(unpaid.statusCode, 402);
  const signedOut = response();
  await fixRequests.route({ method: "POST", body: { id: sample.id } }, signedOut, "/review/fix/recheck", deps(db, []));
  assert.equal(signedOut.statusCode, 401);
});

test("a package request answers with its package and price, so the page can start the checkout", async () => {
  const db = memoryDb({ url_reviews: { [sample.id]: reportRow() } });
  const res = response();
  await fixRequests.route({ method: "POST", body: { session: "ok", id: sample.id, findings: ["F-01"], package: "security-headers" } }, res, "/review/fix/request", deps(db, []));
  assert.equal(res.body.package, "security-headers");
  assert.equal(res.body.priceUsd, HEADERS.usd);
});

test("the desk row shows the payment and the re-review", () => {
  const row = fixOffers.deskRow("fx1", fixRow({ paidAt: "2026-11-09T13:00:00Z", paid: { priceUsd: HEADERS.usd, test: true }, rereview: { status: "done", at: "t", reportId: "n1", result: { fixed: 2, items: [{}, {}], scoreBefore: 60, scoreAfter: 90, newCount: 0 } } }));
  assert.equal(row.paidUsd, HEADERS.usd);
  assert.equal(row.paidTest, true);
  assert.deepEqual(row.rereview, { status: "done", at: "t", error: "", reportId: "n1", fixed: 2, total: 2, scoreBefore: 60, scoreAfter: 90, newCount: 0 });
  assert.equal(fixOffers.deskRow("fx2", fixRow()).rereview, null);
});
