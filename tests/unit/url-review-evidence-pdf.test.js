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
  assert.ok(page.html.includes("Attack and exploit sources read: CISA KEV"));
  assert.ok(page.html.includes("EPSS data provided by FIRST.org"));
});