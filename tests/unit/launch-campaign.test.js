const test = require("node:test");
const assert = require("node:assert/strict");
const fixOffers = require("../../functions/url-review-fix-offers");
const fixCheckout = require("../../functions/url-review-fix-checkout");
const core = require("../../functions/url-review-core");
const offers = require("../../functions/url-review-offers");
const campaign = require("../../functions/launch-campaign");
const client = require("../../js/qa-review-fix.js");
const sample = require("./fixtures/review-carlosandmunoz.json");

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const DURING = Date.parse("2026-11-12T12:00:00Z");
const LAST_MINUTE = Date.parse("2026-12-11T04:59:59Z");
const AFTER = Date.parse("2026-12-11T05:00:00Z");

// The fake Firestore the minting runs against: docs by path, and a transaction that reads and writes them.
function fakeDb() {
  const docs = new Map();
  const ref = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => ref(path + "/" + name + "/" + id) }),
    get: async () => snap(path)
  });
  const snap = (path) => ({ exists: docs.has(path), get: (key) => (docs.get(path) || {})[key], data: () => docs.get(path) });
  return {
    docs,
    collection: (name) => ({ doc: (id) => ref(name + "/" + id) }),
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r.path),
      set: (r, data) => docs.set(r.path, data),
      create: (r, data) => { if (docs.has(r.path)) throw new Error("exists"); docs.set(r.path, data); }
    })
  };
}

const approved = { approved: true, approvedBy: "kaanmuar@gmail.com", approvedAt: "2026-11-11T15:00:00Z", option: "night" };
const openGate = (over) => campaign.gate(Object.assign({ env: { LAUNCH_CAMPAIGN_SEND: "on" }, approval: approved, send: true, confirm: "launch-2026-12", now: DURING }, over || {}));

test("each package charges its launch price through Dec 10 in Bogotá and its list price from the next minute", () => {
  fixOffers.PACKAGES.forEach((pkg) => {
    assert.equal(fixOffers.usdOf(pkg, DURING), pkg.usd);
    assert.equal(fixOffers.usdOf(pkg, LAST_MINUTE), pkg.usd);
    assert.equal(fixOffers.usdOf(pkg, AFTER), pkg.listUsd);
  });
  assert.equal(fixOffers.launchOn(LAST_MINUTE), true);
  assert.equal(fixOffers.launchOn(AFTER), false);
  assert.equal(fixOffers.LAUNCH.until, "2026-12-10");
});

test("each list price is the launch price / 0.7 at the nearest dollar amount ending in 9", () => {
  fixOffers.PACKAGES.forEach((pkg) => {
    const target = pkg.usd / 0.7;
    const nines = [Math.floor(target / 10) * 10 - 1, Math.floor(target / 10) * 10 + 9];
    const nearest = nines.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    assert.equal(pkg.listUsd, nearest, pkg.id);
    assert.ok(pkg.listUsd > pkg.usd);
  });
});

test("the offers, the quote, the request and the checkout all take the price of the day", () => {
  const during = fixOffers.publicPackages(DURING);
  const after = fixOffers.publicPackages(AFTER);
  during.forEach((item, i) => {
    assert.equal(item.usd, fixOffers.PACKAGES[i].usd);
    assert.equal(item.listUsd, fixOffers.PACKAGES[i].listUsd);
    assert.equal(item.launch, true);
    assert.equal(item.launchUntil, "2026-12-10");
    assert.equal(after[i].usd, fixOffers.PACKAGES[i].listUsd);
    assert.equal(after[i].launch, false);
    assert.equal(after[i].launchUntil, "");
  });
  assert.equal(fixCheckout.quote("security-headers", DURING).usd, 99);
  assert.equal(fixCheckout.quote("security-headers", AFTER).usd, 139);
  assert.equal(fixCheckout.quote("security-headers", AFTER).fixPackage.launch, false);
  const row = { email: "ana@example.com", reportId: "r1", status: "new", package: "performance", host: "example.com" };
  assert.equal(fixCheckout.payable(row, "ana@example.com", "r1", DURING).usd, 199);
  assert.equal(fixCheckout.payable(row, "ana@example.com", "r1", AFTER).usd, 289);
  const report = JSON.parse(JSON.stringify(sample));
  const finding = report.insights.findings.find((f) => fixOffers.packageFor(f.key) && ["fail", "risk"].includes(f.verdict));
  const body = { findings: [finding.id], package: fixOffers.packageFor(finding.key) };
  const pkg = fixOffers.packageById(body.package);
  assert.equal(fixOffers.requestRecord(body, { report }, "ana@example.com", DURING).priceUsd, pkg.usd);
  assert.equal(fixOffers.requestRecord(body, { report }, "ana@example.com", AFTER).priceUsd, pkg.listUsd);
  assert.equal(fixOffers.offersFor(report.insights.findings, AFTER)[0].usd, fixOffers.packageById(fixOffers.offersFor(report.insights.findings, AFTER)[0].id).listUsd);
});

test("the server's checkout price switches by date, and PayPal accepts both the launch and the list amounts", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: DURING });
  assert.equal(core.priceForFix("tls-redirects", "example.com").usd, 69);
  assert.equal(core.chargedUsd({ purpose: "fix", fixPackage: "tls-redirects", priceUsd: 69 }).usd, 69);
  assert.throws(() => core.chargedUsd({ purpose: "fix", fixPackage: "tls-redirects", priceUsd: 99 }), /does not match/);
  t.mock.timers.setTime(AFTER);
  assert.equal(core.priceForFix("tls-redirects", "example.com").usd, 99);
  assert.equal(core.chargedUsd({ purpose: "fix", fixPackage: "tls-redirects", priceUsd: 99 }).usd, 99);
  assert.throws(() => core.chargedUsd({ purpose: "fix", fixPackage: "tls-redirects", priceUsd: 69 }), /does not match/);
  t.mock.timers.reset();
  fixOffers.PACKAGES.forEach((pkg) => {
    assert.equal(core.priceMatches(pkg.usd), true, pkg.id + " launch");
    assert.equal(core.priceMatches(pkg.listUsd), true, pkg.id + " list");
  });
});

test("the package cards say Launch price until Dec 10 in six languages, with the list price struck through", () => {
  LANGS.forEach((lang) => {
    assert.match(client.T[lang].packLaunch, /10/, lang);
    assert.match(client.T[lang].packList, /\{usd\}/, lang);
  });
  assert.equal(client.T.en.packLaunch, "Launch price until Dec 10");
});

test("a campaign code is half off one review until the launch ends, and never opens a pass or a fix package", () => {
  const coupon = campaign.couponFor({ email: "Ana@Example.com" }, DURING);
  assert.equal(coupon.percent, 50);
  assert.deepEqual(coupon.purposes, ["new-run", "report"]);
  assert.equal(coupon.maxUses, 1);
  assert.equal(coupon.validUntil, fixOffers.LAUNCH.endsAt);
  assert.equal(coupon.email, "ana@example.com");
  assert.equal(coupon.source, "launch-campaign");
  assert.equal(offers.couponOpen(coupon, "new-run", "", DURING), true);
  assert.equal(offers.couponOpen(coupon, "report", "r1", LAST_MINUTE), true);
  assert.equal(offers.couponOpen(coupon, "new-run", "", AFTER), false);
  assert.equal(offers.couponOpen(coupon, "pass", "", DURING), false);
  assert.equal(offers.couponOpen(coupon, "fix", "", DURING), false);
  assert.equal(offers.couponOpen(Object.assign({}, coupon, { uses: 1 }), "new-run", "", DURING), false);
  const deal = offers.discountFor(4000, 1, { coupon });
  assert.equal(deal.usd, 20);
  assert.throws(() => core.chargedUsd({ purpose: "fix", fixPackage: "seo-meta", priceUsd: 59.5, listUsd: 119 }), /out of range/);
});

test("codes read LAUNCH- and eight letters the checkout accepts", () => {
  const code = campaign.codeOf(() => 0);
  assert.equal(code, "LAUNCH-AAAAAAAA");
  assert.match(campaign.codeOf(), /^LAUNCH-[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(offers.cleanCode(code), code);
});

test("the send gate holds unless the flag, the env switch, Carlos's approval, the design and the confirmation are all there", () => {
  assert.deepEqual(campaign.gate({ env: { LAUNCH_CAMPAIGN_SEND: "on" }, approval: approved, confirm: "launch-2026-12", now: DURING }), { ok: false, why: "dry-run" });
  assert.equal(openGate({ env: {} }).why, "env-off");
  assert.equal(openGate({ env: { LAUNCH_CAMPAIGN_SEND: "true" } }).why, "env-off");
  assert.equal(openGate({ approval: null }).why, "not-approved");
  assert.equal(openGate({ approval: Object.assign({}, approved, { approved: false }) }).why, "not-approved");
  assert.equal(openGate({ approval: Object.assign({}, approved, { approvedBy: "agent@example.com" }) }).why, "not-approved");
  assert.equal(openGate({ approval: Object.assign({}, approved, { approvedAt: "2026-11-20T00:00:00Z" }) }).why, "not-approved");
  assert.equal(openGate({ approval: Object.assign({}, approved, { option: "neon" }) }).why, "no-option");
  assert.equal(openGate({ confirm: "yes" }).why, "no-confirm");
  assert.equal(openGate({ now: Date.parse(campaign.LAST_SEND_AT) }).why, "too-late");
  assert.deepEqual(openGate(), { ok: true, option: "night" });
});

test("no code is minted before the gate opens, and an address keeps one code however often the send runs", async () => {
  const db = fakeDb();
  const person = { email: "ana@example.com", lang: "es" };
  await assert.rejects(campaign.mintFor(db, person, openGate({ env: {} }), DURING), /not approved/);
  await assert.rejects(campaign.mintFor(db, person, campaign.gate({}), DURING), /not approved/);
  assert.equal(db.docs.size, 0);
  assert.equal(campaign.mintAllowed(openGate(), AFTER), false);
  let n = 0;
  const first = await campaign.mintFor(db, person, openGate(), DURING, () => n++ % 31);
  const again = await campaign.mintFor(db, person, openGate(), DURING, () => 5);
  assert.equal(again, first);
  const coupons = [...db.docs.keys()].filter((key) => key.startsWith("url_review_coupons/"));
  assert.deepEqual(coupons, ["url_review_coupons/" + first]);
  assert.equal(db.docs.get("url_review_coupons/" + first).percent, 50);
  const sendRow = db.docs.get("url_review_campaigns/launch-2026-12/sends/" + campaign.hashOf(person.email));
  assert.equal(sendRow.code, first);
  assert.ok(!JSON.stringify(sendRow).includes("ana@example.com"));
});

test("only people who ran a review get the mail: opt-outs, our own addresses, sweeps and failed runs are left out", () => {
  const rows = [
    { email: "Ana@Ana.dev", status: "complete", lang: "es", createdAt: "2026-10-01T00:00:00Z" },
    { email: "ana@ana.dev", status: "complete", lang: "pt", createdAt: "2026-11-01T00:00:00Z", report: { host: "ana.dev" } },
    { email: "bo@shop.io", status: "stopped", lang: "de", createdAt: "2026-09-01T00:00:00Z" },
    { email: "stop@shop.io", status: "complete", createdAt: "2026-09-02T00:00:00Z" },
    { email: "x@blocked.co", status: "complete", createdAt: "2026-09-03T00:00:00Z" },
    { email: "kaanmuar@gmail.com", status: "complete" },
    { email: "qa@carlosandmunoz.com", status: "complete" },
    { email: "demo@example.com", status: "complete" },
    { email: "jar@vis.io", status: "complete", source: "jarvis" },
    { email: "sw@eep.io", status: "complete", sweep: { outreach: true } },
    { email: "fail@site.io", status: "failed" },
    { email: "test@site.io", status: "complete", test: true },
    { email: "done@site.io", status: "complete" },
    { email: "not-an-email", status: "complete" }
  ];
  const stops = new Set(["stop@shop.io", "@blocked.co"]);
  const list = campaign.recipients(rows, stops, new Set([campaign.hashOf("done@site.io")]));
  assert.deepEqual(list.map((p) => p.email), ["ana@ana.dev", "bo@shop.io"]);
  assert.equal(list[0].lang, "pt");
  assert.equal(list[0].host, "ana.dev");
  assert.equal(campaign.optedOut("someone@BLOCKED.co", stops), true);
  assert.equal(campaign.optedOut("bo@shop.io", stops), false);
});

test("a run sends at most MAX_PER_RUN mails, one every three seconds, and logs each without the address", () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ email: "p" + i + "@example.net" }));
  assert.equal(campaign.batch(many).people.length, campaign.MAX_PER_RUN);
  assert.equal(campaign.batch(many, 10).people.length, 10);
  assert.equal(campaign.batch(many, 9999).people.length, campaign.MAX_PER_RUN);
  assert.equal(campaign.batch(many).pauseMs, 3000);
  const row = campaign.sendRow({ email: "p1@example.net", lang: "fr" }, { state: "sent", option: "glass", code: "LAUNCH-AAAAAAAA" }, DURING);
  assert.equal(row.state, "sent");
  assert.equal(row.emailHash, campaign.hashOf("p1@example.net"));
  assert.ok(!JSON.stringify(row).includes("p1@example.net"));
});
