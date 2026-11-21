/**
 * Account API tokens for MCP full crawl (#3626).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const apiToken = require("../../functions/url-review-api-token");
const reviewAuth = require("../../functions/url-review-auth");

describe("url-review-api-token (#3626)", () => {
  it("mints a qlat_ token and stores only the hash", () => {
    const made = apiToken.mint("2026-11-04b");
    assert.match(made.token, apiToken.TOKEN_RE);
    assert.equal(made.hash, apiToken.hashOf(made.token));
    assert.equal(made.termsVersion, "2026-11-04b");
    const stored = apiToken.storedRow(made);
    assert.equal(stored.token, undefined);
    assert.equal(apiToken.verifyStored({ apiToken: stored }, made.token), true);
    assert.equal(apiToken.verifyStored({ apiToken: stored }, made.token + "x"), false);
  });

  it("extracts Bearer and x-qa-lab-api-token headers", () => {
    // Fixture only (not a live secret): prefix + repeated hex.
    const token = ["qlat", "aabbccddeeff0011", "a".repeat(48)].join("_");
    assert.equal(apiToken.extractToken({}, { authorization: "Bearer " + token }), token);
    assert.equal(apiToken.extractToken({}, { "x-qa-lab-api-token": token }), token);
    assert.equal(apiToken.extractToken({ apiToken: token }, {}), token);
  });

  it("checkAuth accepts a stored account API token", async () => {
    const made = apiToken.mint("2026-11-04b");
    const row = { email: "dev@example.com", apiToken: apiToken.storedRow(made), profile: { name: "Dev" } };
    const store = reviewAuth.memoryStore();
    const signed = await reviewAuth.checkAuth(
      store,
      {},
      { authorization: "Bearer " + made.token },
      { lookup: async (id) => (id === made.id ? { email: "dev@example.com", row } : null) }
    );
    assert.equal(signed.ok, true);
    assert.equal(signed.email, "dev@example.com");
    assert.equal(signed.via, "api-token");
    assert.equal(signed.name, "Dev");
    assert.equal(signed.termsVersion, "2026-11-04b");
  });

  it("reportAccess unlocks with an account API token", async () => {
    const made = apiToken.mint("2026-11-04b");
    const row = { email: "owner@example.com", apiToken: apiToken.storedRow(made) };
    const store = reviewAuth.memoryStore();
    const report = { email: "owner@example.com", paid: true, report: { id: "abc", host: "ex.com", insights: {} } };
    const access = await reviewAuth.reportAccess(
      store,
      { apiToken: made.token },
      report,
      false,
      {
        headers: {},
        lookup: async (id) => (id === made.id ? { email: "owner@example.com", row } : null)
      }
    );
    assert.equal(access.ok, true);
    assert.equal(access.via, "api-token");
  });

  it("publicToken never returns the secret", () => {
    const made = apiToken.mint("2026-11-04b");
    const pub = apiToken.publicToken({ apiToken: apiToken.storedRow(made) });
    assert.equal(pub.hasToken, true);
    assert.equal(pub.token, undefined);
    assert.equal(pub.id, made.id);
  });
});
