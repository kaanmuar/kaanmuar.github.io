"use strict";

// Removal guidance for the attack-source lists (#3850). Spamhaus removes a DROP range only through the
// registered owner or its ISP, from an IP in the range and not through a VPN; abuse.ch removes a Feodo C2
// only when its administrators decide, so the report asks them with evidence after the server is clean.
const test = require("node:test");
const assert = require("node:assert/strict");

const { EN } = require("../../functions/url-review-findings-en");

test("the DROP fix names the owner or ISP as the only party that can ask Spamhaus", () => {
	const text = EN["sec-drop.fix"];
	assert.match(text, /registered owner/);
	assert.match(text, /ISP/);
	assert.match(text, /not through a VPN/);
	assert.match(text, /SBL removal request/);
});

test("the Feodo fix sends the removal request to abuse.ch after the server is clean", () => {
	const text = EN["sec-feodo.fix"];
	assert.match(text, /abuse\.ch/);
	assert.match(text, /rotate its keys/);
	assert.match(text, /Do not ask for removal before the server is clean/);
});
