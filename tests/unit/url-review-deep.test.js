"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const deep = require("../../functions/url-review-deep");

const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const RECORD = { addons: ["deep"], report: { host: "shop.example.com" } };

function certRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    not_before: new Date(NOW - i * 3600 * 1000).toISOString(),
    dns_names: ["shop.example.com"]
  }));
}

function okFetch(rows) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), headers: (init && init.headers) || {} });
    return { ok: true, json: async () => rows };
  };
  impl.calls = calls;
  return impl;
}

const NEWS = {
  gdelt: {
    mentions: [
      { url: "https://news.example.net/leak?site=shop.example.com&x=1", date: "2026-11-18", source: "News", orgs: [], themes: ["CYBER_ATTACK"] }
    ]
  }
};

test("bought and done read the report's add-on and stored result, nothing else", () => {
  assert.equal(deep.bought(RECORD), true);
  assert.equal(deep.bought({ addons: ["fixlist"] }), false);
  assert.equal(deep.bought(null), false);
  assert.equal(deep.done(RECORD), false);
  assert.equal(deep.done({ deep: { checkedAt: "2026-11-19T12:00:00.000Z" } }), true);
});

test("a certificate issuance spike and a breach-news match become findings with translatable messages", async () => {
  const fetch = okFetch(certRows(30));
  const result = await deep.run(RECORD, { now: NOW, feeds: NEWS, fetch, certspotterKey: "k" });
  assert.deepEqual(result.sourcesRead.sort(), ["CertSpotter CT", "GDELT Project"]);
  assert.deepEqual(result.sourcesSkipped, []);
  assert.equal(result.host, "shop.example.com");
  assert.equal(result.checkedAt, "2026-11-19T12:00:00.000Z");
  const keys = result.findings.map((item) => item.key).sort();
  assert.deepEqual(keys, ["sec-breach-news", "sec-cert-anomaly"]);
  assert.ok(result.findings.every((item) => item.msg && item.msg.title && item.msg.evidence));
  assert.ok(result.findings.find((item) => item.key === "sec-cert-anomaly").evidence.includes("issued in the last 7 days"));
  assert.equal(result.level, "medium");
  assert.ok(result.attributions[0].includes("GDELT"));
  // CertSpotter gets the registrable domain only, with the key, never the host's page.
  assert.match(fetch.calls[0].url, /domain=example\.com/);
});

test("no CertSpotter key is said so; nothing is invented for the source that was skipped", async () => {
  const result = await deep.run(RECORD, { now: NOW, feeds: NEWS, fetch: okFetch([]) });
  assert.deepEqual(result.sourcesRead, ["GDELT Project"]);
  assert.deepEqual(result.sourcesSkipped, ["CertSpotter CT (no key)"]);
  assert.equal(result.certCheck.ctChecked, false);
});

test("a clean host reads as a pass over the sources that answered, not as a finding", async () => {
  const result = await deep.run(RECORD, { now: NOW, feeds: { gdelt: { mentions: [] } }, fetch: okFetch(certRows(2)), certspotterKey: "k" });
  assert.equal(result.level, "info");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].verdict, "pass");
  assert.deepEqual(result.breachNews, []);
});

test("a report without a usable host is not checked", async () => {
  assert.equal(await deep.run({ addons: ["deep"], report: { host: "localhost" } }, { feeds: NEWS, fetch: false }), null);
  assert.equal(await deep.run({ addons: ["deep"] }, { feeds: NEWS, fetch: false }), null);
});
