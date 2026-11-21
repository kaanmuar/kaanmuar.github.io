"use strict";

// Trust grade and IR playbooks in the paid evidence PDF (#3958)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const evidencePdf = require("../../functions/url-review-evidence-pdf");
const books = require("../../functions/url-review-playbooks");

const RECORD = {
  paid: true,
  status: "complete",
  lang: "en",
  report: {
    id: "abc123",
    host: "shop.example.com",
    fetchedAt: "2026-11-19T12:00:00.000Z",
    targeted: {
      checkedAt: "2026-11-19T12:00:00.000Z",
      sourcesRead: ["CISA KEV", "Feodo Tracker"],
      kevHits: [{ cve: "CVE-2024-9999", software: "jquery", added: "2026-01-15" }],
      feodoHit: { ip: "45.155.205.42", malware: "Pikabot", lastOnline: "2026-11-18" }
    },
    insights: {
      findings: [
        { key: "sec-kev", area: "Security", verdict: "fail", severity: "critical", title: "KEV", evidence: "CVE-2024-9999 (jquery)" },
        { key: "sec-feodo", area: "Security", verdict: "fail", severity: "critical", title: "Feodo", evidence: "45.155.205.42" },
        { key: "sec-hsts", area: "Security", verdict: "fail", severity: "medium", title: "HSTS missing", evidence: "missing" }
      ],
      trust: { score: 72, grade: "B", capped: false, rows: [{ key: "sec-hsts", severity: "medium", points: 20 }], bonus: [] },
      fixkit: { helmet: "const helmet = require(\"helmet\");\napp.use(helmet({}));\n" }
    }
  }
};

test("the evidence PDF shows the trust grade, fix-first rows and the helmet snippet", () => {
  const html = evidencePdf.page(RECORD, { lang: "en" }).html;
  assert.match(html, /Customer trust grade/);
  assert.match(html, /<span class="grade">B<\/span> 72 points/);
  assert.ok(html.includes("HSTS missing"));
  assert.ok(html.includes("app.use(helmet({}));"));
  assert.match(evidencePdf.page(RECORD, { lang: "es" }).html, /Nota de confianza del cliente/);
  const bare = JSON.parse(JSON.stringify(RECORD));
  delete bare.report.insights.trust;
  assert.ok(!evidencePdf.page(bare, { lang: "en" }).html.includes("Customer trust grade"));
});

test("IR playbooks follow the findings, carry the CC BY attribution and read in EN, ES and FR", () => {
  const en = evidencePdf.page(RECORD, { lang: "en" }).html;
  assert.match(en, /Server or application intrusion/);
  assert.match(en, /Malicious network behaviour/);
  assert.ok(!en.includes("Information leakage"));
  assert.ok(en.includes("CERT Société Générale"));
  assert.ok(en.includes("CC BY 3.0"));
  assert.ok(en.includes("(" + books.SOURCE_URL + ")"));
  assert.match(evidencePdf.page(RECORD, { lang: "es" }).html, /Intrusión en el servidor/);
  assert.match(evidencePdf.page(RECORD, { lang: "fr" }).html, /Intrusion sur le serveur/);
  const de = evidencePdf.page(RECORD, { lang: "de" }).html;
  assert.match(de, /Server or application intrusion/);
  assert.ok(de.includes("CC BY 3.0"));
});

test("every playbook has all four phases with steps in EN, ES and FR", () => {
  Object.keys(books.PLAYBOOKS).forEach((id) => {
    ["en", "es", "fr"].forEach((lang) => {
      assert.ok(books.PLAYBOOKS[id].title[lang], id + " title " + lang);
      books.PHASES.forEach((phase) => assert.ok(books.PLAYBOOKS[id].steps[phase][lang].length >= 2, id + " " + phase + " " + lang));
    });
  });
  evidencePdf.FINDING_KEYS.forEach((key) => assert.ok(books.FOR_KEY[key], key));
});
