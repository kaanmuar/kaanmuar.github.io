/**
 * Peer groups (#2363): whose column a link opens, and what each column keeps.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const peers = require("../../functions/url-review-peers");
const sample = require("../../assets/qa-review-sample.json");

const report = (host, overall) => Object.assign(JSON.parse(JSON.stringify(sample.report || sample)), { host, contacts: { emails: ["web@" + host] } },
  { insights: Object.assign({}, (sample.report || sample).insights, { score: Object.assign({}, (sample.report || sample).insights.score, { overall }) }) });
const doc = { sector: "hotels", place: "Cartagena, Colombia", hosts: ["one.co", "two.co"], ids: ["aa11", "bb22"], tokens: { tok1: "one.co", tok2: "two.co" } };
const rows = { aa11: { report: report("one.co", 61) }, bb22: { report: report("two.co", 48) } };

test("a token opens its own site's column, and an unknown token opens none", () => {
  assert.equal(peers.viewerOf(doc, "tok2"), "two.co");
  assert.equal(peers.viewerOf(doc, "nope"), "");
  assert.equal(peers.viewerOf(doc, ""), "");
  assert.equal(peers.viewerOf(doc, "constructor"), "");
});

test("the reader's column keeps its security details; the other peers' are left out but their score stays", () => {
  const made = peers.payloadOf("abc123", doc, rows, "two.co");
  const [other, own] = made.columns;
  assert.equal(own.own, true);
  assert.equal(other.own, false);
  assert.ok(own.report.insights.security);
  assert.ok(own.report.insights.findings.some((f) => f.area === "Security"));
  assert.equal(other.report.insights.security, undefined);
  assert.equal(other.report.alerts.length, 0);
  assert.equal(other.report.observed, undefined);
  assert.ok(!other.report.insights.findings.some((f) => f.area === "Security"));
  assert.ok(!other.report.cases.some((c) => c.layer === "Security"));
  assert.equal(typeof other.report.insights.score.areas.Security.score, "number");
  assert.equal(made.paid, true);
  assert.equal(made.from, "peers");
  assert.deepEqual(made.peers, { sector: "hotels", place: "Cartagena, Colombia", viewer: "two.co" });
});

test("every column shows its findings in the open, but only the top case whole", () => {
  const [col] = peers.payloadOf("abc123", doc, rows, "one.co").columns;
  const original = (sample.report || sample).insights.findings.find((f) => f.evidence);
  const shown = col.report.insights.findings.find((f) => f.id === original.id && f.title === original.title);
  assert.equal(shown.evidence, original.evidence);
  assert.equal(col.report.cases[0].sample, true);
  assert.ok(col.report.cases.slice(1).every((c) => !c.steps && !c.script && !c.scripts));
  assert.equal(col.report.contacts, undefined);
  assert.equal(col.report.log, undefined);
});

test("a deleted review stays in the group as a missing column", () => {
  const made = peers.payloadOf("abc123", doc, { aa11: rows.aa11 }, "one.co");
  assert.equal(made.columns[1].missing, true);
  assert.equal(made.columns[1].host, "two.co");
});
