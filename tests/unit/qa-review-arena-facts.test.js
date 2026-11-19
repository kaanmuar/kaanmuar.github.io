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
