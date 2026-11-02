/**
 * A read pinned to an address the host cannot reach rejects instead of ending the process (#2092).
 *
 *   node --test tests/unit/url-review-pinned-lookup.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const dns = require("node:dns").promises;
const { pinnedLookup, assertPublic } = require("../../functions/url-review-core");

test("a host with IPv4 and IPv6 records is pinned to IPv4; an IPv6-only host to IPv6", async (t) => {
  const records = {
    "dual.example": [{ address: "2606:4700::6812:1852", family: 6 }, { address: "104.18.24.82", family: 4 }],
    "six.example": [{ address: "2801:160:0:2:8000::19", family: 6 }]
  };
  t.mock.method(dns, "lookup", async (hostname) => records[hostname]);
  assert.equal(await assertPublic("dual.example"), "104.18.24.82");
  assert.equal(await assertPublic("six.example"), "2801:160:0:2:8000::19");
});

test("the pinned lookup answers on a later tick, in both callback forms", async () => {
  const lookup = pinnedLookup("2001:db8::1");
  const order = [];
  const all = new Promise((resolve) => lookup("example.com", { all: true }, (error, list) => { order.push("all"); resolve(list); }));
  const one = new Promise((resolve) => lookup("example.com", (error, address, family) => { order.push("one"); resolve([address, family]); }));
  order.push("sync");
  assert.deepEqual(await all, [{ address: "2001:db8::1", family: 6 }]);
  assert.deepEqual(await one, ["2001:db8::1", 6]);
  assert.equal(order[0], "sync");
});

test("an unreachable IPv6 address rejects the request", async () => {
  const outcome = await new Promise((resolve) => {
    const req = https.request({ hostname: "example.com", port: 443, path: "/", timeout: 3000, lookup: pinnedLookup("2001:db8::1") }, (res) => {
      res.resume();
      resolve("answered");
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve("rejected"));
    req.end();
  });
  assert.equal(outcome, "rejected");
});
