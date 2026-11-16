"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const urlReview = require("../../functions/url-review-core");
const secrets = require("../../functions/secrets");

const KEY = "mcp-test-key-at-least-24-chars!!";

describe("QA_LAB_MCP_KEY Turnstile exemption (#3480 A)", () => {
  it("binds QA_LAB_MCP_KEY on reviewUrl and reviewRun", () => {
    assert.ok(secrets.reviewUrl.includes("QA_LAB_MCP_KEY"));
    assert.ok(secrets.reviewRun.includes("QA_LAB_MCP_KEY"));
  });

  it("accepts a matching MCP key the same way as QA_TEST_KEY", () => {
    assert.equal(urlReview.testKeyMatches(KEY, KEY), true);
    assert.equal(urlReview.testKeyMatches("wrong", KEY), false);
    assert.equal(urlReview.testKeyMatches(KEY, ""), false);
    assert.equal(urlReview.testKeyMatches("short", "short"), false);
  });

  it("skips Turnstile in runSoftPreview when the MCP key matches", () => {
    const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
    assert.match(index, /x-qa-lab-mcp-key/);
    assert.match(index, /QA_LAB_MCP_KEY/);
    assert.match(index, /if \(secret && !mcpOk\)/);
  });
});
