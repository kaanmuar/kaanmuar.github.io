"use strict";

// The review arena maps each progress line to a stage (#3862). A stage-specific timeout line must win over
// the generic "did not answer in time" rule, which has no stage, or the failed check stays unmarked.
const test = require("node:test");
const assert = require("node:assert/strict");

require("../../js/qa-review-arena-facts.js");
const { matchFact } = globalThis.ReviewArenaFacts;

test("the hacked-site timeout marks the security stage failed", () => {
	const fact = matchFact("The hacked-site checks did not answer in time.");
	assert.equal(fact.stage, "security");
	assert.equal(fact.status, "fail");
	assert.equal(fact.anomaly, "timeout");
});

test("the attack and exploit source timeout marks the malware stage failed", () => {
	const fact = matchFact("The attack and exploit sources did not answer in time.");
	assert.equal(fact.stage, "malware");
	assert.equal(fact.status, "fail");
	assert.equal(fact.anomaly, "timeout");
});

test("a line with no stage still gets the generic timeout", () => {
	const fact = matchFact("Something finished late, timed out after 30 s");
	assert.equal(fact.anomaly, "timeout");
	assert.equal(fact.stage, undefined);
});

test("robots.txt could not paints risk, not done (#4106)", () => {
	const fact = matchFact("robots.txt could not be read. Linked pages were still capped.");
	assert.equal(fact.stage, "robots");
	assert.equal(fact.status, "risk");
	assert.equal(fact.anomaly, "fail");
});

test("robots.txt was read still paints done (#4106)", () => {
	const fact = matchFact("robots.txt was read (12 rules). Linked pages that disallow this agent are skipped.");
	assert.equal(fact.stage, "robots");
	assert.equal(fact.status, "done");
});

test("no sitemap skips crawl (#4106)", () => {
	const fact = matchFact("No sitemap with URLs was found.");
	assert.equal(fact.stage, "crawl");
	assert.equal(fact.status, "skip");
});

test("Safe Browsing flag stays risk (#4106)", () => {
	const fact = matchFact("Google's Safe Browsing lists flag example.com.");
	assert.equal(fact.stage, "webrisk");
	assert.equal(fact.status, "risk");
	assert.equal(fact.anomaly, "fail");
});

test("stop was requested maps to stop bay (#4108)", () => {
	const fact = matchFact("Stop was requested. Waiting for the pages already open.");
	assert.equal(fact.anomaly, "stop");
	assert.equal(fact.pose, "stop");
});

test("preview failed maps to fail (#4108)", () => {
	const fact = matchFact("The preview failed. Try another public URL.");
	assert.equal(fact.anomaly, "fail");
	assert.equal(fact.status, "fail");
});
