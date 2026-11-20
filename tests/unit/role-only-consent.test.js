const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../functions/company-contacts");

// #3827: where consent is needed for an unsolicited marketing email to an individual, cold email goes to a role inbox only.
test("the EU, the UK, Canada and Australia need consent; Colombia and the US do not", () => {
	["es", "pt", "fr", "it", "ie", "gb", "ca", "au", "de", "nl"].forEach((cc) => assert.equal(C.roleOnly(cc), true, cc));
	["co", "us", "mx", "br", "pe", "cl", ""].forEach((cc) => assert.equal(C.roleOnly(cc), false, cc));
	assert.equal(C.roleOnly("ES"), true);
});

test("a role inbox is an organisation address; a named person's inbox is not", () => {
	assert.equal(C.isRoleEmail("info@uni.es"), true);
	assert.equal(C.isRoleEmail("admisiones@uni.es"), true);
	assert.equal(C.isRoleEmail("ana.perez@uni.es"), false);
	assert.equal(C.isRoleEmail("juan@uni.fr"), false);
});
