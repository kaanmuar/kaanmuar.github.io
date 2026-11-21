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
	const fact = matchFact("robots.txt could not be checked. Linked pages were still capped.");
	assert.equal(fact.stage, "robots");
	assert.equal(fact.status, "risk");
	assert.equal(fact.anomaly, "fail");
});

test("robots.txt was checked still paints done (#4106, #281)", () => {
	const fact = matchFact("robots.txt was checked (12 rules). Linked pages that disallow this agent are skipped.");
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

test("Plain http answered maps to https, not pages (#4106)", () => {
	const fact = matchFact("Plain http answered 200.");
	assert.equal(fact.stage, "https");
	assert.equal(fact.status, "done");
});

test("RDAP timeout marks dns before generic timeout (#4107)", () => {
	const fact = matchFact("The RDAP registration did not answer in time.");
	assert.equal(fact.stage, "dns");
	assert.equal(fact.status, "fail");
	assert.equal(fact.anomaly, "timeout");
});

test("URLhaus could not maps to malware, not pages (#4106)", () => {
	const fact = matchFact("URLhaus could not be read (timeout).");
	assert.equal(fact.stage, "malware");
	assert.equal(fact.status, "fail");
});

test("hacked-site failed paints fail (#4106)", () => {
	const fact = matchFact("Hacked-site checks: 2 failed or did not answer.");
	assert.equal(fact.stage, "security");
	assert.equal(fact.status, "fail");
});

test("bot-recovery wait lights browser slow (#4108)", () => {
	const fact = matchFact("The plain request was refused (status 403). Waiting for headless Chrome to open the page.");
	assert.equal(fact.stage, "browser");
	assert.equal(fact.anomaly, "slow");
	assert.equal(fact.status, "wip");
});

test("linked Safe Browsing read maps webrisk (#4108)", () => {
	const fact = matchFact("Google's Safe Browsing lists were read for 3 of 5 hosts; none is flagged.");
	assert.equal(fact.stage, "webrisk");
	assert.equal(fact.status, "done");
});

test("truncated start page paints open risk (#4108)", () => {
	const fact = matchFact("The start page was still arriving after 8 s, so the review analyzed the part that had arrived.");
	assert.equal(fact.stage, "open");
	assert.equal(fact.status, "risk");
	assert.equal(fact.anomaly, "slow");
});

test("Cloudflare URL Scanner timeout marks malware (#4108)", () => {
	const fact = matchFact("Cloudflare's URL Scanner had not finished its scan in time.");
	assert.equal(fact.stage, "malware");
	assert.equal(fact.status, "fail");
	assert.equal(fact.anomaly, "timeout");
});

test("linked Safe Browsing flagged paints risk (#4108)", () => {
	const fact = matchFact("Google's Safe Browsing lists were read for 3 of 5 hosts; evil.com flagged.");
	assert.equal(fact.stage, "webrisk");
	assert.equal(fact.status, "risk");
});
