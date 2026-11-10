const test = require("node:test");
const assert = require("node:assert/strict");
const CP = require("../../functions/company-prospects");
const P = require("../../functions/engagement-profiles");

const FINDINGS = [
  { area: "SEO", verdict: "fail", severity: "medium", title: "4 pages share the same title" },
  { area: "Performance", verdict: "fail", severity: "medium", title: "The booking page takes 6.1 s to show its content" },
  { area: "Performance", verdict: "risk", severity: "medium", title: "Images are not compressed" },
  { area: "Accessibility", verdict: "fail", severity: "medium", title: "2 form controls have no label" },
  { area: "Security", verdict: "pass", severity: "high", title: "HTTPS works" },
  { area: "GEO", verdict: "fail", severity: "low", title: "1 AI answer crawler is blocked" }
];
const PERSON = {
  kind: "company", domain: "hotelcasabrava.com.co", sector: "hotel", name: "Hotel Casa Brava", lang: "es", country: "co",
  emails: [{ email: "info@hotelcasabrava.com.co", kind: "role", url: "https://www.hotelcasabrava.com.co/" }], phones: ["+576056601234"],
  socials: [{ network: "facebook", handle: "HotelCasaBrava", url: "https://facebook.com/HotelCasaBrava" }, { network: "instagram", handle: "@hotelcasabrava", url: "https://instagram.com/hotelcasabrava" },
    { network: "x", handle: "@casabrava", url: "https://x.com/casabrava" }]
};
const TRIAL = { code: "TRY-ABC123", url: "https://qalabreview.com/t/try-abc123" };

test("findings follow the sector: a hotel hears about speed first, a bank about accessibility, the second from another area", () => {
  assert.deepEqual(CP.findingsFor(FINDINGS, "hotel").map((f) => f.title), ["The booking page takes 6.1 s to show its content", "2 form controls have no label"]);
  assert.equal(CP.findingsFor(FINDINGS, "bank")[0].area, "Accessibility");
  assert.deepEqual(CP.findingsFor(FINDINGS, "agency").map((f) => f.area), ["SEO", "GEO"], "an agency lives on search and AI answers, so a low GEO finding beats a medium speed one");
  assert.ok(!CP.findingsFor(FINDINGS, "crypto").some((f) => f.title === "HTTPS works"), "passed checks are never cited");
  assert.equal(CP.findingsFor([{ area: "SEO", severity: "high", title: "No title" }, { area: "SEO", severity: "low", title: "Long title" }], "hotel").length, 2, "one area only still gives two");
  assert.deepEqual(CP.findingsFor([], "hotel"), []);
});

test("the offer goes to the published address and up to two profiles, in the site's language", () => {
  const o = CP.offerFor({ person: PERSON, findings: FINDINGS, sector: "hotel-chain" });
  assert.equal(o.ok, true);
  assert.deepEqual(o.channels, ["email", "social"]);
  assert.equal(o.email, "info@hotelcasabrava.com.co");
  assert.deepEqual(o.socials.map((s) => s.network), ["instagram", "facebook"]);
  assert.equal(o.sector, "hotel");
  assert.equal(o.lang, "es");
  assert.match(o.reason, /commission/);
  const socialOnly = CP.offerFor({ person: Object.assign({}, PERSON, { emails: [] }), findings: FINDINGS, sector: "hotel" });
  assert.deepEqual(socialOnly.channels, ["social"]);
  const german = CP.offerFor({ person: Object.assign({}, PERSON, { country: "de", lang: "de" }), findings: FINDINGS, sector: "hotel" });
  assert.deepEqual([german.channels, german.email], [["social"], ""], "no cold email where B2B email needs consent");
  assert.equal(CP.offerFor({ person: Object.assign({}, PERSON, { country: "at", socials: [] }), findings: FINDINGS, sector: "hotel" }).why, "no-contact");
});

test("no offer to opt-outs, payers, companies already offered or courted, or without contacts and findings", () => {
  const why = (c) => CP.offerFor(Object.assign({ person: PERSON, findings: FINDINGS, sector: "hotel" }, c)).why;
  assert.equal(why({ dnc: true }), "stopped");
  assert.equal(why({ person: Object.assign({}, PERSON, { stopped: "asked" }) }), "stopped");
  assert.equal(why({ paid: true }), "paid");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "paid" }) }), "paid");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "claimed" }) }), "claimed");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "discount_sent" }) }), "claimed");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "declined" }) }), "stopped");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "found", offers: [{ code: "TRY-X" }] }) }), "offered");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "offered" }) }), "offered");
  assert.equal(why({ profileCampaign: true }), "profile-campaign");
  assert.equal(why({ sector: "plumber" }), "sector");
  assert.equal(why({ findings: [{ area: "SEO", verdict: "pass", title: "fine" }] }), "no-findings");
  assert.equal(why({ person: Object.assign({}, PERSON, { emails: [], socials: [] }) }), "no-contact");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "found" }) }), "");
  assert.equal(why({ person: Object.assign({}, PERSON, { stage: "engaged" }) }), "");
});

test("the lead row carries the trial, the findings in both languages and the published contacts", () => {
  const o = CP.offerFor({ person: PERSON, findings: FINDINGS, sector: "hotel" });
  const r = CP.leadRow({ host: "www.hotelcasabrava.com.co", cc: "co" }, PERSON, o, TRIAL, { finding_1: "la página de reservas tarda 6,1 s", country: "Colombia" });
  assert.deepEqual(Object.keys(r), CP.LEAD_HEADER);
  assert.equal(r.sequence, "T");
  assert.equal(r.host, "hotelcasabrava.com.co");
  assert.equal(r.finding_1, "la página de reservas tarda 6,1 s");
  assert.equal(r.finding_1_en, "The booking page takes 6.1 s to show its content");
  assert.equal(r.finding_2, "2 form controls have no label");
  assert.deepEqual([r.trial_code, r.trial_url, r.trial_days, r.after_percent], [TRIAL.code, TRIAL.url, "2", "20"]);
  assert.deepEqual([r.instagram_url, r.facebook_url, r.linkedin_url, r.phone, r.country], [PERSON.socials[1].url, PERSON.socials[0].url, "", "+576056601234", "Colombia"]);
});

test("profile messages wait for Carlos with the trial tone, and the ledger stops the domain-offer touches", () => {
  const o = CP.offerFor({ person: PERSON, findings: FINDINGS, sector: "hotel" });
  const items = CP.socialItems(PERSON, o, TRIAL);
  assert.deepEqual(items.map((i) => [i.network, i.mode, i.tone, i.offer.code, i.offer.days, i.offer.percent]), [["instagram", "copy", "trial", TRIAL.code, 2, 20], ["facebook", "copy", "trial", TRIAL.code, 2, 20]]);
  const prompt = P.prompt(items);
  assert.match(prompt, /Tone trial[^\n]*offer\.days days of full free access/);
  assert.match(prompt, /"weakest":"Performance"/);
  assert.doesNotMatch(P.prompt([Object.assign({}, items[0], { tone: "cheer", touch: 1 })]), /Tone trial/);
  const doc = CP.socialDoc(items[0], "@hotelcasabrava, revisamos su sitio. {link}", TRIAL.url, Date.parse("2026-11-09T12:00:00Z"));
  assert.equal(doc.actions.reply.status, "waiting");
  assert.equal(doc.report.offerKind, "trial");
  assert.equal(doc.report.offer, TRIAL.code);
  assert.match(doc.actions.reply.draft, /qalabreview\.com\/t\/try-abc123/);
  const led = CP.profileLedger(null, PERSON.domain, o.socials, TRIAL.code, [items[0].key], Date.parse("2026-11-09T12:00:00Z"));
  assert.deepEqual([led.trial, led.stopped, led.code, led.touches.length], [TRIAL.code, "company-trial", null, 1]);
  assert.equal(P.due(led, Date.parse("2026-12-30T00:00:00Z"), {}).why, "stop");
});

test("the dashboard counts each company in every step it reached, with reviewed as a flag rather than a stage", () => {
  const out = CP.stageCounts([
    { sector: "hotel", stage: "found" }, { sector: "hotel", stage: "found", reviewedAt: "2026-11-09T00:00:00Z" }, { sector: "hotel", stage: "offered" },
    { sector: "hotel-chain", stage: "paid" }, { sector: "bank", stage: "trial_ended" }, { sector: "bank", stage: "declined", reviewedAt: "x", offers: [{ code: "TRY-A" }] },
    { sector: "weird", stage: "claimed" }, { sector: "hotel", stage: "nonsense" }
  ]);
  assert.deepEqual(out.stages, ["found", "reviewed", "offered", "claimed", "paid"]);
  assert.deepEqual(out.rows.map((r) => [r.sector, r.found, r.reviewed, r.offered, r.claimed, r.paid]), [["hotel", 4, 3, 2, 1, 1], ["bank", 2, 2, 2, 1, 0], ["other", 1, 1, 1, 1, 0]]);
  assert.deepEqual([out.total.found, out.total.reviewed, out.total.offered, out.total.paid], [7, 6, 5, 1]);
});

test("a company is recorded through outreach-people touch, its own fields merged on the same row", async () => {
  const people = require("../../functions/outreach-people");
  const rows = {};
  const ref = (id) => ({ id, get: async () => ({ exists: !!rows[id], data: () => rows[id] }), set: async (v, o) => { rows[id] = o && o.merge ? Object.assign({}, rows[id], v) : v; } });
  const db = { collection: () => ({ doc: ref }), runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v) => { rows[r.id] = v; } }) };
  const person = CP.personOf({ host: "www.hotelcasabrava.com.co", cc: "co" }, { name: "Hotel Casa Brava", lang: "es", country: "co", emails: PERSON.emails, phones: PERSON.phones, socials: PERSON.socials }, "hotel");
  await CP.record(db, person, "found");
  await CP.record(db, person, "", { note: "reviewed" }, { reviewedAt: "2026-11-09T12:00:00Z" });
  await CP.record(db, person, "offered", { offers: [{ code: TRIAL.code, kind: "company", url: TRIAL.url }] });
  await CP.record(db, person, "found");
  const row = rows["web:hotelcasabrava.com.co"];
  assert.deepEqual([row.kind, row.stage, row.domain, row.email, row.sector, row.country, row.reviewedAt], ["company", "offered", "hotelcasabrava.com.co", "info@hotelcasabrava.com.co", "hotel", "co", "2026-11-09T12:00:00Z"]);
  assert.equal(row.links.instagram, PERSON.socials[1].url);
  assert.deepEqual(row.offers.map((o) => o.code), [TRIAL.code]);
  assert.deepEqual(row.phones, ["+576056601234"]);
  assert.deepEqual(row.history.map((h) => h.stage), ["found", "found", "offered"], "stages only move forward; reviewed is a note");
  assert.ok(people.STAGES.includes("offered") && !people.STAGES.includes("reviewed"));
  assert.equal(CP.offeredYet(row), true);
});

test("the ledger id is web:<domain> and the trial terms come from outreach-trials: 2 days, then 20% for companies", () => {
  assert.equal(CP.idOf("https://www.Hotelcasabrava.com.co/x"), "web:hotelcasabrava.com.co");
  assert.deepEqual(CP.terms(), { days: 2, after: 20 });
});
