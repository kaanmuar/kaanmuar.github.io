const test = require("node:test");
const assert = require("node:assert/strict");
const fixOffers = require("../../functions/url-review-fix-offers");
const fixMail = require("../../functions/url-review-fix-mail");
const fixRequests = require("../../functions/url-review-fix-requests");
const client = require("../../js/qa-review-fix.js");
const sample = require("./fixtures/review-carlosandmunoz.json");

const NOW = Date.parse("2026-11-09T12:00:00Z");
const LANGS = ["en", "es", "pt", "de", "fr", "it"];

function row(changes) {
  return Object.assign({ email: "ana@example.com", paid: true, report: JSON.parse(JSON.stringify(sample)) }, changes || {});
}

test("each finding key lands in the first package whose prefix it starts with", () => {
  assert.equal(fixOffers.packageFor("sec-hsts"), "security-headers");
  assert.equal(fixOffers.packageFor("sec-tlsrpt"), "email-dns");
  assert.equal(fixOffers.packageFor("sec-tls-chain"), "tls-redirects");
  assert.equal(fixOffers.packageFor("sec-mixed-live"), "security-headers");
  assert.equal(fixOffers.packageFor("a11y-alt"), "accessibility");
  assert.equal(fixOffers.packageFor("ax-color-contrast"), "accessibility");
  assert.equal(fixOffers.packageFor("pf-lcp"), "performance");
  assert.equal(fixOffers.packageFor("seo-title-length"), "seo-meta");
  assert.equal(fixOffers.packageFor("sec-libraries"), "");
  assert.equal(fixOffers.packageFor("an-consent"), "");
});

test("the price table is one row per package with a price, days, and a name and line in six languages", () => {
  const ids = fixOffers.PACKAGES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of fixOffers.PACKAGES) {
    assert.ok(item.usd > 0 && item.days > 0, item.id);
    assert.deepEqual(Object.keys(item.name).sort(), LANGS.slice().sort(), item.id);
    assert.deepEqual(Object.keys(item.what).sort(), LANGS.slice().sort(), item.id);
  }
});

test("offers cover only the report's open findings, in table order", () => {
  const offers = fixOffers.offersFor(sample.insights.findings);
  assert.deepEqual(offers.map((offer) => offer.id), ["security-headers", "email-dns", "performance", "seo-meta"]);
  assert.deepEqual(offers[0].findings, ["F-01", "F-02", "F-03", "F-04", "F-05", "F-06"]);
  assert.deepEqual(offers[1].findings, ["F-11", "F-14"]);
  const passed = sample.insights.findings.filter((f) => f.verdict === "pass").map((f) => f.id);
  for (const offer of offers) for (const id of offer.findings) assert.ok(!passed.includes(id));
});

test("the report page groups findings into the same offers as the server, from the packages it is sent", () => {
  const open = client.openFindings(sample);
  const server = fixOffers.offersFor(sample.insights.findings).map((offer) => [offer.id, offer.usd, offer.findings]);
  const page = client.offersFor(fixOffers.publicPackages(), open).map((offer) => [offer.id, offer.usd, offer.findings]);
  assert.deepEqual(page, server);
});

test("the report page copy has every key in all six languages", () => {
  const keys = Object.keys(client.T.en).sort();
  for (const lang of LANGS) assert.deepEqual(Object.keys(client.T[lang]).sort(), keys, lang);
});

test("the call link carries the report, host, language and findings", () => {
  const url = new URL(client.bookUrl({ id: "ab12", host: "shop.example.com" }, ["F-01", "F-03"], "de"), "https://carlosandmunoz.com/");
  assert.equal(url.pathname, "/book.html");
  assert.equal(url.searchParams.get("type"), "walkthrough");
  assert.equal(url.searchParams.get("review"), "ab12");
  assert.equal(url.searchParams.get("host"), "shop.example.com");
  assert.equal(url.searchParams.get("lang"), "de");
  assert.equal(url.searchParams.get("findings"), "F-01,F-03");
});

test("a request keeps only findings the stored report holds, and prices a package from the table", () => {
  const record = fixOffers.requestRecord({ findings: ["f-01", "F-03", "F-99"], package: "security-headers", deadline: "2026-12-01", budget: "  500 USD ", access: "Cloudflare, ask Ana", lang: "de-DE" }, row(), "Ana@Example.com", NOW);
  assert.deepEqual(record.findings.map((f) => f.id), ["F-01", "F-03"]);
  assert.equal(record.findings[0].package, "security-headers");
  assert.equal(record.priceUsd, fixOffers.packageById("security-headers").usd);
  assert.equal(record.kind, "package");
  assert.equal(record.email, "ana@example.com");
  assert.equal(record.lang, "de");
  assert.equal(record.budget, "500 USD");
  assert.equal(record.status, "new");
  assert.equal(record.reportId, sample.id);
  assert.deepEqual(record.history, [{ status: "new", at: new Date(NOW).toISOString(), by: "client" }]);
});

test("a request with no package is a quote at no set price", () => {
  const record = fixOffers.requestRecord({ findings: ["F-10"] }, row(), "ana@example.com", NOW);
  assert.equal(record.kind, "quote");
  assert.equal(record.priceUsd, 0);
  assert.equal(record.lang, "en");
});

test("a request is refused without a finding of the report, with an unknown package, or a past or broken deadline", () => {
  assert.match(fixOffers.requestRecord({ findings: ["F-99"] }, row(), "a@b.co", NOW).error, /at least one finding/);
  assert.match(fixOffers.requestRecord({ findings: ["F-01"], package: "everything" }, row(), "a@b.co", NOW).error, /not offered/);
  assert.match(fixOffers.requestRecord({ findings: ["F-01"], deadline: "2026-11-01" }, row(), "a@b.co", NOW).error, /passed/);
  assert.match(fixOffers.requestRecord({ findings: ["F-01"], deadline: "2026-02-30" }, row(), "a@b.co", NOW).error, /not a date/);
  assert.equal(fixOffers.requestRecord({ findings: ["F-01"], deadline: "2026-11-09" }, row(), "a@b.co", NOW).deadline, "2026-11-09");
});

test("an address may send a few requests a day, then is told to write", () => {
  const recent = (hours) => ({ createdAt: new Date(NOW - hours * 36e5).toISOString() });
  assert.equal(fixOffers.overLimit([recent(1), recent(2), recent(3), recent(4)], NOW), false);
  assert.equal(fixOffers.overLimit([recent(1), recent(2), recent(3), recent(4), recent(5)], NOW), true);
  assert.equal(fixOffers.overLimit([recent(1), recent(2), recent(3), recent(4), recent(30)], NOW), false);
});

test("the desk moves a request through the statuses, with a price in US$ and an https pay link", () => {
  const record = fixOffers.requestRecord({ findings: ["F-01"] }, row(), "a@b.co", NOW);
  assert.match(fixOffers.statusPatch(record, { status: "lost" }, "carlos", NOW).error, /not one of/);
  assert.match(fixOffers.statusPatch(record, { status: "quoted", quoteUsd: "-3" }, "carlos", NOW).error, /price/);
  assert.match(fixOffers.statusPatch(record, { status: "quoted", payUrl: "javascript:alert(1)" }, "carlos", NOW).error, /https/);
  const patch = fixOffers.statusPatch(record, { status: "quoted", quoteUsd: "240", payUrl: "https://www.paypal.com/ncp/payment/ABC" }, "carlos@x", NOW + 1000);
  assert.equal(patch.quoteUsd, 240);
  assert.equal(patch.payUrl, "https://www.paypal.com/ncp/payment/ABC");
  assert.deepEqual(patch.history.map((h) => [h.status, h.by]), [["new", "client"], ["quoted", "carlos@x"]]);
  assert.equal(fixOffers.statusPatch(Object.assign({}, record, patch), { status: "quoted", quoteUsd: "250" }, "carlos", NOW).history, undefined);
});

test("the quote mail goes once per price or pay link on a quoted request", () => {
  const before = { status: "new" };
  const quoted = { status: "quoted", quoteUsd: 240 };
  assert.equal(fixOffers.quoteMailDue(before, { status: "quoted" }), false);
  assert.equal(fixOffers.quoteMailDue(before, quoted), true);
  assert.equal(fixOffers.quoteMailDue(Object.assign({ quoteMailedAt: "x" }, quoted), quoted), false);
  assert.equal(fixOffers.quoteMailDue(Object.assign({ quoteMailedAt: "x" }, quoted), { status: "quoted", quoteUsd: 260 }), true);
  assert.equal(fixOffers.quoteMailDue(before, { status: "accepted", quoteUsd: 240 }), false);
  assert.equal(fixOffers.quoteMailDue(before, { status: "quoted", priceUsd: 99 }), true);
});

test("open requests come first on the desk, newest first", () => {
  const rows = fixOffers.deskOrder([
    { id: "a", status: "done", createdAt: "2026-11-09" },
    { id: "b", status: "new", createdAt: "2026-11-01" },
    { id: "c", status: "quoted", createdAt: "2026-11-05" }
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["c", "b", "a"]);
});

test("the owner mail names the client, site, package, deadline and each finding", () => {
  const record = fixOffers.requestRecord({ findings: ["F-01", "F-14"], package: "security-headers", deadline: "2026-12-01", access: "Cloudflare" }, row(), "ana@example.com", NOW);
  const mail = fixOffers.ownerNotice(record, "https://desk.example/desk");
  assert.ok(mail.subject.endsWith("carlosandmunoz.com · Security headers US$" + fixOffers.packageById("security-headers").usd), mail.subject);
  assert.equal(mail.respondUrl, "https://desk.example/desk");
  const values = mail.rows.filter((r) => r.label).map((r) => r.label + "=" + r.value).join("\n");
  assert.match(values, /F-01 · medium=HSTS is not sent/);
  assert.match(values, /Deadline=2026-12-01/);
  assert.match(mail.body, /Cloudflare/);
});

test("the mail names each finding in the client's language when the report kept its message", () => {
  const report = row();
  const hsts = report.report.insights.findings.find((f) => f.id === "F-01");
  hsts.msg = { title: { id: "sec-hsts.title" } };
  const record = fixOffers.requestRecord({ findings: ["F-01"], lang: "de" }, report, "ana@example.com", NOW);
  assert.deepEqual(record.findings[0].titleMsg, { id: "sec-hsts.title" });
  const german = require("../../functions/url-review-findings-copy").forLang("de").line({ id: "sec-hsts.title" }, "HSTS is not sent");
  assert.notEqual(german, "HSTS is not sent");
  assert.ok(fixMail.confirmMail(record).text.includes("F-01: " + german));
});

test("the client gets the confirmation and the quote in their language, with nothing left unfilled", () => {
  for (const lang of LANGS) {
    const record = Object.assign(fixOffers.requestRecord({ findings: ["F-01", "F-02"], package: "security-headers", lang }, row(), "ana@example.com", NOW), { id: "r1" });
    const confirm = fixMail.confirmMail(record);
    assert.equal(confirm.lang, lang);
    assert.match(confirm.subject, /carlosandmunoz\.com/);
    assert.ok(confirm.html.includes(fixOffers.packageById("security-headers").name[lang]), lang);
    assert.doesNotMatch(confirm.subject + confirm.text, /\{\w+\}/, lang);
    const quote = fixMail.quoteMail(Object.assign({}, record, { status: "quoted", quoteUsd: 240, payUrl: "https://pay.example/abc" }));
    assert.match(quote.subject, /240/);
    assert.match(quote.html, /href="https:\/\/pay\.example\/abc"/, lang);
    assert.ok(quote.text.includes(fixMail.FIX[lang].pay + ": https://pay.example/abc"), lang);
    assert.doesNotMatch(quote.subject + quote.text, /\{\w+\}/, lang);
  }
});

// A Firestore stand-in with the calls the routes make.
function memoryDb(seed) {
  const data = { url_reviews: new Map(), [fixOffers.COLLECTION]: new Map() };
  Object.keys(seed || {}).forEach((name) => Object.keys(seed[name]).forEach((id) => data[name].set(id, seed[name][id])));
  let n = 0;
  const docRef = (name, id) => ({
    id,
    get: async () => ({ exists: data[name].has(id), data: () => data[name].get(id) }),
    update: async (patch) => data[name].set(id, Object.assign({}, data[name].get(id), patch))
  });
  const docsOf = (name, keep) => [...data[name].entries()].filter(([, value]) => keep(value)).map(([id, value]) => ({ id, data: () => value }));
  return {
    data,
    collection: (name) => ({
      doc: (id) => docRef(name, id),
      add: async (value) => { const id = "fix" + (++n); data[name].set(id, value); return docRef(name, id); },
      where: (field, op, value) => ({ limit: () => ({ get: async () => ({ docs: docsOf(name, (v) => v[field] === value) }) }) }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: docsOf(name, () => true) }) }) })
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

function deps(db, mailed, access) {
  return {
    db,
    access: access || (async (body, found) => (found && body.session === "ok" ? { ok: true, email: found.email } : { ok: false, status: 401, error: "Sign in.", code: "sign-in", signIn: true })),
    mailOwner: async (notice) => mailed.push(["owner", notice.subject]),
    mailCustomer: async (lang, email, mail, category) => mailed.push(["customer", email, lang, category]),
    deskUrl: "https://desk.example/desk"
  };
}

test("the offers route sends the price table", async () => {
  const res = response();
  assert.equal(await fixRequests.route({ method: "GET", body: {} }, res, "/review/fix/offers", deps(memoryDb(), [])), true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.packages.map((p) => [p.id, p.usd]), fixOffers.PACKAGES.map((p) => [p.id, p.usd]));
});

test("a signed-in owner's request is saved, mailed to the desk and confirmed to them", async () => {
  const db = memoryDb({ url_reviews: { [sample.id]: row() } });
  const mailed = [];
  const res = response();
  await fixRequests.route({ method: "POST", body: { session: "ok", id: sample.id, findings: ["F-01"], package: "security-headers", lang: "es" } }, res, "/review/fix/request", deps(db, mailed));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.email, "ana@example.com");
  const saved = db.data[fixOffers.COLLECTION].get(res.body.id);
  assert.equal(saved.status, "new");
  assert.equal(saved.priceUsd, fixOffers.packageById("security-headers").usd);
  assert.deepEqual(mailed.map((m) => m[0]), ["owner", "customer"]);
  assert.deepEqual(mailed[1].slice(1), ["ana@example.com", "es", "url-review-fix-request"]);
});

test("a request without the owner's sign-in, or past the daily limit, is refused and nothing is mailed", async () => {
  const db = memoryDb({ url_reviews: { [sample.id]: row() } });
  const mailed = [];
  const res = response();
  await fixRequests.route({ method: "POST", body: { id: sample.id, findings: ["F-01"] } }, res, "/review/fix/request", deps(db, mailed));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "sign-in");
  for (let i = 0; i < fixOffers.DAILY_LIMIT; i++) db.data[fixOffers.COLLECTION].set("old" + i, { email: "ana@example.com", createdAt: new Date().toISOString() });
  const limited = response();
  await fixRequests.route({ method: "POST", body: { session: "ok", id: sample.id, findings: ["F-01"] } }, limited, "/review/fix/request", deps(db, mailed));
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(mailed, []);
});

test("saving a quoted request on the desk mails the quote once", async () => {
  const record = fixOffers.requestRecord({ findings: ["F-10"], lang: "fr" }, row(), "ana@example.com", NOW);
  const db = memoryDb({ [fixOffers.COLLECTION]: { abc: record } });
  const mailed = [];
  const first = response();
  await fixRequests.deskUpdate({ body: { id: "abc", status: "quoted", quoteUsd: "320", payUrl: "https://pay.example/x" } }, first, "carlos@x", deps(db, mailed));
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.request.status, "quoted");
  assert.ok(first.body.request.quoteMailedAt);
  const again = response();
  await fixRequests.deskUpdate({ body: { id: "abc", status: "quoted", quoteUsd: "320", payUrl: "https://pay.example/x" } }, again, "carlos@x", deps(db, mailed));
  assert.deepEqual(mailed, [["customer", "ana@example.com", "fr", "url-review-fix-quote"]]);
  const rows = await fixRequests.deskRows(db);
  assert.equal(rows[0].quoteUsd, 320);
});
