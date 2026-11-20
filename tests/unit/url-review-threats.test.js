"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fakeDb } = require("./fixtures/fake-firestore");
const threats = require("../../functions/url-review-threats");
const desk = require("../../functions/url-review-desk");
const publish = require("../../functions/url-review-publish");

const NOW = Date.parse("2026-11-19T12:00:00.000Z");

function sampleRecord(overrides) {
  return Object.assign({
    id: "rev-001",
    status: "complete",
    createdAt: "2026-11-19T10:00:00.000Z",
    sweep: { cc: "co" },
    report: {
      id: "rev-001",
      host: "shop.example.co",
      finalUrl: "https://shop.example.co/",
      fetchedAt: "2026-11-19T10:00:00.000Z",
      targeted: {
        hosting: { ip: "198.51.100.42", country: "US" },
        items: [
          {
            kind: "known-exploit-software",
            level: "high",
            subject_type: "software",
            subject: "jquery@1.12.4",
            role: "site_hit",
            source: "CISA KEV + OSV.dev",
            source_ref: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
            first_seen: "2026-11-10T00:00:00.000Z",
            last_seen: "2026-11-19T09:00:00.000Z",
            evidence: "Matched CVE-2020-11022 in CISA KEV",
            confidence: "inferred"
          }
        ]
      },
      alerts: [
        { id: "AL-01", level: "Leak", title: "Exposed API token", detail: "Found key in HTML" }
      ],
      insights: {
        score: { overall: 42, areas: { Security: { score: 20 } } },
        findings: [
          { key: "sec-safebrowsing", verdict: "fail", severity: "critical", title: "Google Safe Browsing flagged malware", evidence: "Malware URL on shop.example.co" },
          { key: "sec-cloaking", verdict: "fail", severity: "high", title: "Googlebot sees spam", evidence: "Pharma injection to crawler" },
          { key: "sec-lookalike", verdict: "risk", severity: "medium", title: "Lookalike registered", evidence: "sh0p-example.co resolves" },
          { key: "sec-hsts", verdict: "fail", severity: "medium", title: "HSTS missing", evidence: "No header" },
          { key: "sec-wordpress", verdict: "pass", severity: "info", title: "WordPress ok", evidence: "Clean" }
        ]
      }
    }
  }, overrides);
}

test("normalizeRecord enforces schema fields, defaults public_ok=false, clips HTML and assigns time windows (#3817)", () => {
  const live = threats.normalizeRecord({
    kind: "phishing-host",
    level: "critical",
    subject_type: "host",
    subject: "Phish.Example.com",
    role: "host_used",
    hosting_country: "us",
    company_country: "mx",
    source: "Google Web Risk",
    evidence: "<script>alert(1)</script>   " + "x".repeat(400),
    last_seen: "2026-11-19T06:00:00.000Z",
    observed_at: "2026-11-19T12:00:00.000Z",
    review_id: "r1"
  }, NOW);
  assert.equal(live.public_ok, false);
  assert.equal(live.delist_status, "pending");
  assert.equal(live.hosting_country, "US");
  assert.equal(live.company_country, "MX");
  assert.equal(live.time_window, "live");
  assert.ok(!live.evidence.includes("<script>"));
  assert.ok(live.evidence.length <= 280);
  assert.equal(live.retention_until.slice(0, 10), "2027-11-19");

  const old = threats.normalizeRecord({
    kind: "breach-news",
    level: "info",
    subject: "acme.org",
    last_seen: "2026-01-01T00:00:00.000Z",
    observed_at: "2026-11-19T12:00:00.000Z"
  }, NOW);
  assert.equal(old.time_window, "historical");
  assert.equal(old.delist_status, "none");
  assert.equal(old.retention_until.slice(0, 10), "2027-02-17");
});

test("recordsFromReview extracts targeted items, security threats and leaks while skipping passes and header hygiene (#3817)", () => {
  const items = threats.recordsFromReview(sampleRecord(), { now: NOW });
  const kinds = items.map((i) => i.kind);
  assert.ok(kinds.includes("known-exploit-software"));
  assert.ok(kinds.includes("malware-host"));
  assert.ok(kinds.includes("cloaking"));
  assert.ok(kinds.includes("lookalike"));
  assert.ok(kinds.includes("exposed-secret"));
  assert.ok(!items.some((i) => i.evidence.includes("No header")));
  assert.ok(!items.some((i) => i.evidence.includes("Clean")));
  assert.ok(items.every((i) => i.public_ok === false));
  assert.ok(items.every((i) => i.hosting_country === "US" && i.company_country === "CO"));
});

test("recordThreats, readThreats, updateThreat and backfillFromReviews work end-to-end on Firestore (#3817)", async () => {
  const db = fakeDb();
  const rec = sampleRecord();
  await db.collection("url_reviews").doc(rec.id).set(rec);
  const back = await threats.backfillFromReviews(db, { now: NOW });
  assert.equal(back.scanned, 1);
  assert.equal(back.stored, 5);

  const list = await threats.readThreats(db, { now: NOW });
  assert.equal(list.summary.total, 5);
  assert.equal(list.summary.byLevel.critical, 2);
  assert.equal(list.summary.countries.US, 5);

  const malware = list.items.find((i) => i.kind === "malware-host");
  assert.equal(malware.delist_status, "pending");
  const updated = await threats.updateThreat(db, { id: malware.id, delist_status: "requested", note: "Submitted delist form" }, "kaanmuar@gmail.com", NOW);
  assert.equal(updated.ok, true);
  assert.equal(updated.item.delist_status, "requested");

  // Re-recording the same review preserves operator delist_status and note.
  await threats.recordThreats(db, rec, { now: NOW });
  const reread = await threats.readThreats(db, { level: "critical", kind: "malware-host", now: NOW });
  assert.equal(reread.items.length, 1);
  assert.equal(reread.items[0].delist_status, "requested");
  assert.equal(reread.items[0].note, "Submitted delist form");
});

test("desk UI renders internal threat list and publicReport never exposes internal threat records (#3817)", () => {
  assert.match(desk.PAGE, /id="threats-block"/);
  assert.match(desk.PAGE, /deskFetch\("\/desk\/threats\/data"\)/);
  assert.match(desk.PAGE, /\/desk\/threats/);

  const rec = sampleRecord();
  const slim = desk.deskRecord(rec);
  assert.equal(slim.report.targeted.items.length, 1);
  const pub = publish.publicReport(rec.report);
  assert.equal(pub.targeted, undefined);
});
