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

test("each reader's copy puts their own site first, so the benchmark's 'you' lines are about them", () => {
  const forOne = peers.payloadOf("abc123", doc, rows, "one.co");
  const forTwo = peers.payloadOf("abc123", doc, rows, "two.co");
  assert.deepEqual(forOne.columns.map((c) => c.host), ["one.co", "two.co"]);
  assert.deepEqual(forTwo.columns.map((c) => c.host), ["two.co", "one.co"]);
  assert.ok(forTwo.columns[0].own && !forTwo.columns[1].own);
  const three = Object.assign({}, doc, { hosts: ["a.co", "b.co", "c.co"], ids: ["aa11", "bb22", "cc33"] });
  const all = { aa11: { report: report("a.co", 50) }, bb22: { report: report("b.co", 70) }, cc33: { report: report("c.co", 60) } };
  assert.deepEqual(peers.payloadOf("x", three, all, "c.co").columns.map((c) => c.host), ["c.co", "a.co", "b.co"]);
});

test("the reader's column keeps its security details; the other peers' are left out but their score stays", () => {
  const made = peers.payloadOf("abc123", doc, rows, "two.co");
  const [own, other] = made.columns;
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
  assert.deepEqual(made.peers, { sector: "hotels", place: "Cartagena, Colombia", phrase: {}, viewer: "two.co" });
  const named = peers.payloadOf("abc123", Object.assign({}, doc, { phrase: { en: "hotels in Cartagena", es: "hoteles de Cartagena", bad: 1, "<x>": "y" } }), rows, "two.co");
  assert.deepEqual(named.peers.phrase, { en: "hotels in Cartagena", es: "hoteles de Cartagena" });
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
