"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const trust = require("../../functions/url-review-trust-grade");
const core = require("../../functions/url-review-core");
const insights = require("../../functions/url-review-insights");
const { english } = require("../../functions/url-review-findings-en");

const PAGE_URL = "https://shop.example.com/";
const GOOD_HEADERS = {
  "content-type": "text/html",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=()",
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy": "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
};
const NOW = Date.parse("2026-11-19T12:00:00Z");

function collect(fn) {
  const rows = [];
  fn((area, verdict, severity, key, title, evidence, fix) => rows.push({ area, verdict, severity, key, title, evidence, fix }));
  return rows;
}

function review(headers, extras) {
  const page = { url: PAGE_URL, path: "/", status: 200, ms: 100, depth: 0, inspect: core.analyzeHtml("<html><head><title>Shop</title></head><body><h1>Shop</h1></body></html>", headers, PAGE_URL) };
  return insights.analyze({ pages: [page], robotsText: "", extras: extras || {} });
}

const sec = (body, over) => Object.assign({ status: 200, url: "https://shop.example.com/.well-known/security.txt", contentType: "text/plain; charset=utf-8", body, html: false }, over);
const GOOD = "Contact: mailto:security@shop.example.com\nExpires: 2027-06-01T00:00:00Z\nCanonical: https://shop.example.com/.well-known/security.txt\n";
const ids = (audit) => audit.issues.map((item) => item.id);

test("letter maps scores to A+ through F", () => {
  assert.equal(trust.letter(103), "A+");
  assert.equal(trust.letter(95), "A");
  assert.equal(trust.letter(85), "A-");
  assert.equal(trust.letter(72), "B");
  assert.equal(trust.letter(46), "C-");
  assert.equal(trust.letter(10), "F");
});

test("trustGrade: a clean sheet with the habits earns the A+ bonus, and nothing open stays at 100 without them", () => {
  const clean = trust.trustGrade([
    { key: "sec-csp", verdict: "pass", severity: "info" },
    { key: "sec-coop", verdict: "pass", severity: "info" },
    { key: "sec-securitytxt", verdict: "pass", severity: "info" }
  ]);
  assert.equal(clean.score, 105);
  assert.equal(clean.grade, "A+");
  assert.deepEqual(trust.trustGrade([]).grade, "A+");
  assert.equal(trust.trustGrade([]).score, 100);
});

test("trustGrade: deductions are largest first and a missing header or CSP lowers the letter", () => {
  const grade = trust.trustGrade([
    { key: "sec-nosniff", verdict: "risk", severity: "low" },
    { key: "sec-hsts", verdict: "fail", severity: "medium" },
    { key: "sec-csp", verdict: "risk", severity: "medium" },
    { key: "sec-http", verdict: "pass", severity: "info" }
  ]);
  assert.deepEqual(grade.rows.map((row) => row.key), ["sec-hsts", "sec-csp", "sec-nosniff"]);
  assert.equal(grade.score, 55);
  assert.equal(grade.grade, "C");
  assert.deepEqual(grade.bonus, []);
});

test("trustGrade: a script host on the backdoored list caps the grade at F whatever else is clean", () => {
  const grade = trust.trustGrade([{ key: "sec-backdoored", verdict: "fail", severity: "high" }]);
  assert.equal(grade.grade, "F");
  assert.equal(grade.capped, true);
});

test("securityTxtAudit: a good file has no issues and a file without Contact is left to the existing check", () => {
  assert.deepEqual(trust.securityTxtAudit(sec(GOOD), NOW), { present: true, issues: [] });
  assert.equal(trust.securityTxtAudit(sec("Expires: 2027-01-01T00:00:00Z"), NOW).present, false);
  assert.equal(trust.securityTxtAudit(sec(GOOD, { html: true }), NOW).present, false);
  assert.equal(trust.securityTxtAudit(sec(GOOD, { status: 404 }), NOW).present, false);
  assert.equal(trust.securityTxtAudit(null, NOW).present, false);
});

test("securityTxtAudit follows RFC 9116", () => {
  const audit = (body, over) => ids(trust.securityTxtAudit(sec(body, over), NOW));
  assert.deepEqual(audit("Contact: mailto:a@b.co\n"), ["noExpires"]);
  assert.deepEqual(audit("Contact: mailto:a@b.co\nExpires: soon\n"), ["badExpires"]);
  assert.deepEqual(audit("Contact: mailto:a@b.co\nExpires: 2029-01-01T00:00:00Z\n"), ["farExpires"]);
  assert.deepEqual(audit("Contact: mailto:a@b.co\nExpires: 2027-01-01T00:00:00Z\nExpires: 2027-02-01T00:00:00Z\n"), ["multipleExpires"]);
  assert.deepEqual(audit("Contact: security@b.co\nExpires: 2027-01-01T00:00:00Z\n"), ["badContact"]);
  assert.deepEqual(audit("Contact: http://b.co/report\nExpires: 2027-01-01T00:00:00Z\n"), ["plainHttpContact"]);
  assert.deepEqual(audit(GOOD.replace("shop.example.com/.well-known", "other.example.org/.well-known")), ["canonicalMismatch"]);
  assert.deepEqual(audit(GOOD, { contentType: "text/html" }), ["wrongType"]);
  assert.deepEqual(audit("# comment\r\nContact: https://b.co/report\r\nContact: tel:+1-555-0100\r\nExpires: 2027-01-01T00:00:00Z\r\n-----BEGIN PGP SIGNED MESSAGE-----\r\n"), []);
});

test("securityTxtFindings adds one low risk finding listing every issue, and nothing for a good file", () => {
  assert.deepEqual(collect((add) => trust.securityTxtFindings(sec(GOOD), add, NOW)), []);
  const rows = collect((add) => trust.securityTxtFindings(sec("Contact: http://b.co/x\n"), add, NOW));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "sec-securitytxt-quality");
  assert.equal(rows[0].verdict, "risk");
  const text = String(english(rows[0].evidence));
  assert.match(text, /no Expires line/);
  assert.match(text, /unencrypted http/);
});

test("helmetSnippet covers only the missing headers and adds Permissions-Policy by hand", () => {
  assert.equal(trust.helmetSnippet([]), "");
  const all = trust.helmetSnippet(["Strict-Transport-Security", "Content-Security-Policy-Report-Only", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]);
  ["strictTransportSecurity", "contentSecurityPolicy", "reportOnly: true", "xContentTypeOptions", "xFrameOptions", "referrerPolicy", "crossOriginOpenerPolicy", "Permissions-Policy"].forEach((word) => assert.ok(all.includes(word), word));
  const one = trust.helmetSnippet(["Referrer-Policy"]);
  assert.ok(one.includes("referrerPolicy"));
  assert.ok(!one.includes("strictTransportSecurity"));
  assert.ok(!one.includes("Permissions-Policy"));
  const only = trust.helmetSnippet(["Permissions-Policy"]);
  assert.ok(!only.includes("require(\"helmet\")"));
  assert.ok(only.includes("setHeader"));
});

test("analyze returns a trust grade and a helmet snippet from what the review already read", () => {
  const poor = review({ "content-type": "text/html" });
  assert.ok(poor.trust && typeof poor.trust.score === "number");
  assert.ok(poor.trust.rows.some((row) => row.key === "sec-hsts"));
  assert.ok(["D+", "D", "D-", "F", "C-", "C"].indexOf(poor.trust.grade) !== -1, poor.trust.grade);
  assert.ok(poor.fixkit.helmet.includes("strictTransportSecurity"));
  const solid = review(GOOD_HEADERS, { securityTxt: sec(GOOD.replace("2027-06-01", String(new Date().getUTCFullYear() + 1) + "-01-01")) });
  assert.ok(solid.trust.score > poor.trust.score);
  assert.equal(solid.fixkit.helmet, "");
});

test("analyze reports security.txt problems as their own finding", () => {
  const result = review(GOOD_HEADERS, { securityTxt: sec("Contact: mailto:a@shop.example.com\nExpires: 2037-01-01T00:00:00Z\n") });
  const row = result.findings.find((item) => item.key === "sec-securitytxt-quality");
  assert.ok(row, "finding present");
  assert.equal(row.verdict, "risk");
  const good = review(GOOD_HEADERS, { securityTxt: sec(GOOD.replace("2027-06-01", String(new Date().getUTCFullYear() + 1) + "-01-01")) });
  assert.equal(good.findings.some((item) => item.key === "sec-securitytxt-quality"), false);
});
