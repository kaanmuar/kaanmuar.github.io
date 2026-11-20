"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const evidencePdf = require("../../functions/url-review-evidence-pdf");

const SAMPLE_TARGETED = {
  checkedAt: "2026-11-19T12:00:00.000Z",
  sourcesRead: ["CISA KEV", "OSV.dev", "Network DROP", "Feodo Tracker", "GDELT Project", "CertSpotter CT"],
  sourcesSkipped: ["CertSpotter CT (no key)"],
  attributions: ["EPSS data provided by FIRST.org", "GDELT Project (https://www.gdeltproject.org/)"],
  kevHits: [{ cve: "CVE-2024-9999", software: "jquery", added: "2026-01-15", ransomware: false }],
  feodoHit: { ip: "45.155.205.42", malware: "Pikabot", lastOnline: "2026-11-18" },
  items: [{ kind: "c2-indicator", level: "critical", source: "Feodo Tracker", last_seen: "2026-11-18T10:00:00.000Z" }]
};

const PAID_RECORD = {
  paid: true,
  status: "complete",
  lang: "en",
  report: {
    id: "abc123",
    host: "shop.example.com",
    fetchedAt: "2026-11-19T12:00:00.000Z",
    targeted: SAMPLE_TARGETED,
    insights: {
      findings: [
        { key: "sec-kev", area: "Security", verdict: "fail", severity: "critical", title: "KEV", evidence: "CVE-2024-9999 (jquery)" },
        { key: "sec-feodo", area: "Security", verdict: "fail", severity: "critical", title: "Feodo", evidence: "45.155.205.42" },
        { key: "sec-hsts", area: "Security", verdict: "fail", severity: "medium", title: "HSTS", evidence: "missing" }
      ]
    }
  }
};

const UNPAID = JSON.parse(JSON.stringify(PAID_RECORD));
UNPAID.paid = false;

test("free or unpaid report yields no PDF rows (#3925)", () => {
  assert.equal(evidencePdf.paidReport(UNPAID), false);
  const gate = evidencePdf.meta(UNPAID);
  assert.equal(gate.ok, false);
  assert.equal(gate.rows.length, 0);
});

test("paid report lists attack-source findings with source and time, not unrelated keys", () => {
  assert.equal(evidencePdf.meta(PAID_RECORD).ok, true);
  const rows = evidencePdf.rows(PAID_RECORD, "en");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => evidencePdf.FINDING_KEYS.indexOf(row.key) !== -1));
  assert.ok(!rows.some((row) => row.key === "sec-hsts"));
  const kev = rows.find((row) => row.key === "sec-kev");
  assert.ok(kev.source.includes("CISA KEV"));
  assert.ok(kev.time);
  assert.match(kev.title, /KEV|exploit/i);
});

test("sources come only from sourcesRead hints, never invented names", () => {
  const read = ["CISA KEV", "OSV.dev"];
  const sources = evidencePdf.sourcesForKey("sec-kev", { sourcesRead: read });
  assert.deepEqual(sources, ["CISA KEV"]);
  const empty = evidencePdf.sourcesForKey("sec-feodo", { sourcesRead: read });
  assert.deepEqual(empty, []);
  assert.ok(!sources.includes("Spamhaus"));
  const page = evidencePdf.page(PAID_RECORD, { lang: "en" });
  assert.ok(page.html.includes("Read: CISA KEV"));
  assert.ok(page.html.includes("Skipped: CertSpotter CT (no key)"));
  assert.ok(page.html.includes("EPSS data provided by FIRST.org"));
});
test("times read as a plain UTC date and minute, not an ISO string with milliseconds", () => {
  const kev = evidencePdf.rows(PAID_RECORD, "en").find((row) => row.key === "sec-kev");
  assert.equal(kev.time, "2026-01-15 00:00");
  const page = evidencePdf.page(PAID_RECORD, { lang: "en" });
  assert.ok(page.html.includes("2026-11-19 12:00"));
  assert.ok(!page.html.includes(".000Z"));
});

test("the sources read and skipped are named in the report's language", () => {
  const de = evidencePdf.page(PAID_RECORD, { lang: "de" }).html;
  assert.ok(de.includes("Gelesen: CISA KEV"));
  assert.ok(de.includes("Übersprungen: CertSpotter CT (no key)"));
  assert.ok(!de.includes("Attack and exploit sources read"));
  const es = evidencePdf.page(PAID_RECORD, { lang: "es" }).html;
  assert.ok(es.includes("Leídas: CISA KEV"));
});

test("a run where no source answered says so in the report's language", () => {
  const none = JSON.parse(JSON.stringify(PAID_RECORD));
  none.report.targeted.sourcesRead = [];
  none.report.targeted.sourcesSkipped = [];
  assert.ok(evidencePdf.page(none, { lang: "en" }).html.includes("No source answered in time."));
  assert.ok(evidencePdf.page(none, { lang: "fr" }).html.includes("Aucune source n’a répondu à temps."));
});

const DEEP = {
  checkedAt: "2026-11-19T15:30:00.000Z",
  sourcesRead: ["CertSpotter CT", "GDELT Project"],
  sourcesSkipped: [],
  attributions: ["GDELT Project (https://www.gdeltproject.org/)"],
  breachNews: [{ date: "2026-11-18", source: "News", url: "https://news.example.net/x" }],
  certCheck: { anomalies: [{ kind: "issuance-spike", detail: "30 unexpired certificates issued in the last 7 days for example.com" }], ctChecked: true, ctIssuances: 30 },
  findings: [
    { key: "sec-cert-anomaly", verdict: "risk", severity: "medium", title: "Certificate anomaly", evidence: "30 certificates in 7 days",
      msg: { title: { id: "sec-cert-anomaly.title", vars: { n: 1 } }, evidence: { id: "sec-cert-anomaly.evidence", vars: { details: "30 unexpired certificates issued in the last 7 days for example.com" } } } },
    { key: "sec-targeted", verdict: "pass", severity: "info", title: "pass", evidence: "ok" }
  ]
};

test("a bought Deep check adds tagged rows, its sources and its attribution to the PDF; a pass adds no row (#3946)", () => {
  const record = Object.assign({}, PAID_RECORD, { deep: DEEP });
  const list = evidencePdf.rows(record, "en");
  const deepRows = list.filter((row) => row.deep);
  assert.equal(deepRows.length, 1);
  assert.match(deepRows[0].title, /^Deep check: /);
  assert.equal(deepRows[0].source, "CertSpotter CT");
  assert.equal(deepRows[0].time, "2026-11-19 15:30");
  const html = evidencePdf.page(record, { lang: "en" }).html;
  assert.ok(html.includes("Deep check · Read: CertSpotter CT, GDELT Project."));
  assert.ok(html.includes("GDELT Project (https://www.gdeltproject.org/)"));
  const de = evidencePdf.page(record, { lang: "de" }).html;
  assert.ok(de.includes("Tiefenprüfung: "));
  assert.ok(de.includes("Tiefenprüfung · Gelesen: CertSpotter CT, GDELT Project."));
  assert.equal(evidencePdf.rows(PAID_RECORD, "en").filter((row) => row.deep).length, 0);
});

test("a report with only a Deep result still lists it", () => {
  const record = JSON.parse(JSON.stringify(PAID_RECORD));
  delete record.report.targeted;
  record.report.insights.findings = [];
  record.deep = DEEP;
  const gate = evidencePdf.meta(record);
  assert.equal(gate.ok, true);
  assert.equal(gate.rows.length, 1);
});
