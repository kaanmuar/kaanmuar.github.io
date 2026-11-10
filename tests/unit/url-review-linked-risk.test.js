const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const insights = require("../../functions/url-review-insights");
const publish = require("../../functions/url-review-publish");
const linked = require("../../functions/url-review-linked-risk");

// Google's Safe Browsing test site; the lookups are mocked, so nothing leaves the machine.
const TEST = "testsafebrowsing.appspot.com";
const SITE = "https://shop.example/";
const NOW = Date.parse("2026-11-09T12:00:00Z");

function page(path, html) {
  return { url: SITE.replace(/\/$/, path), path, status: 200, depth: 0, inspect: core.analyzeHtml(html, {}, SITE.replace(/\/$/, path)) };
}

const HOME = page("/", "<html lang=\"en\"><head><title>Shop</title>" +
  "<script src=\"https://" + TEST + "/s/malware.js\"></script><script src=\"https://cdn.shop.example/app.js\"></script><script src=\"/local.js\"></script>" +
  "</head><body><h1>Shop</h1><iframe src=\"https://widget.example/frame\"></iframe>" +
  "<a href=\"https://phish." + TEST + "/s/phishing.html\">Deal</a><a href=\"https://partner.example/\">Partner</a><a href=\"https://www.shop.example/about\">About</a></body></html>");
const CHECKOUT = page("/checkout", "<html><body><form action=\"https://pay.example/charge\"><input name=\"card\"></form>" +
  "<script src=\"https://" + TEST + "/again.js\"></script></body></html>");

const LISTED = { [TEST]: ["MALWARE"], ["phish." + TEST]: ["SOCIAL_ENGINEERING"] };
function lookup(asked) {
  return async (url) => {
    asked.push(url);
    const host = new URL(url).hostname;
    return { ok: true, url, threats: LISTED[host] || [] };
  };
}

test("linked hosts are scripts first, then iframes, forms and links, each once and never the site's own domain (#3090)", () => {
  const browser = { ok: true, start: { finalPath: "/", thirdParty: { scripts: [TEST, "tags.example"], frames: ["video.example"] } } };
  const rows = linked.collect([HOME, CHECKOUT], browser, "shop.example");
  assert.deepEqual(rows.map((row) => row.element + " " + row.host + " " + row.page), [
    "script " + TEST + " /",
    "script tags.example /",
    "frame widget.example /",
    "frame video.example /",
    "form pay.example /checkout",
    "link phish." + TEST + " /",
    "link partner.example /"
  ]);
});

test("a listed script host and a listed link are critical findings that name the page, the element and the threat (#3090)", async () => {
  const asked = [];
  const result = await linked.check(linked.collect([HOME, CHECKOUT], null, "shop.example"), lookup(asked), { store: linked.memoryStore(), now: NOW });
  assert.equal(asked.length, 5);
  assert.ok(asked.every((url) => /^https:\/\/[a-z0-9.-]+\/$/.test(url)));
  assert.deepEqual([result.found, result.checked, result.unchecked], [5, 5, 0]);
  assert.deepEqual(result.hits.map((hit) => hit.element + " " + hit.host), ["script " + TEST, "link phish." + TEST]);

  const report = insights.analyze({ pages: [HOME, CHECKOUT], extras: { linkedRisk: result } });
  const script = report.findings.find((row) => row.key === "sec-linked-script");
  const other = report.findings.find((row) => row.key === "sec-linked-risk");
  assert.deepEqual([script.verdict, script.severity, other.verdict, other.severity], ["fail", "critical", "fail", "critical"]);
  assert.equal(script.title, "Google lists a script host on the site as malware");
  assert.match(script.evidence, new RegExp("^Google's Safe Browsing lists, read through the Web Risk API, flag a script from " + TEST.replace(/\./g, "\\.") + " on / \\(malware\\)\\. "));
  assert.equal(other.title, "Google lists a host the site embeds or links to as phishing");
  assert.match(other.evidence, /flag a link to phish\.testsafebrowsing\.appspot\.com on \/ \(phishing\)\./);
  assert.deepEqual(script.pages, ["/"]);
  assert.match(linked.note(result), /read for 5 of 5 hosts .*: testsafebrowsing\.appspot\.com \(MALWARE\), phish\.testsafebrowsing\.appspot\.com \(SOCIAL_ENGINEERING\) flagged\.$/);

  const record = (findings) => ({ status: "complete", report: { host: "shop-demo.com", status: "complete", insights: { score: { overall: 70, areas: {} }, findings } } });
  assert.equal(publish.heldReason(record([script])), "safe-browsing-flagged");
  assert.notEqual(publish.heldReason(record([other])), "safe-browsing-flagged");
});

test("a clean pass says how many hosts were checked, and how many were left out (#3090)", async () => {
  const many = Array.from({ length: linked.MAX_HOSTS + 4 }, (_, i) => ({ host: "host" + i + ".example", element: "link", page: "/" }));
  const asked = [];
  const result = await linked.check(many, lookup(asked), { store: linked.memoryStore(), now: NOW });
  assert.equal(asked.length, linked.MAX_HOSTS);
  assert.deepEqual([result.checked, result.unchecked, result.hits.length], [linked.MAX_HOSTS, 4, 0]);
  const report = insights.analyze({ pages: [HOME], extras: { linkedRisk: result } });
  const pass = report.findings.find((row) => row.key === "sec-linked-risk");
  assert.equal(pass.verdict, "pass");
  assert.equal(pass.title, "Google's Safe Browsing lists flag none of the 60 hosts the site loads or links to");
  assert.equal(pass.evidence, "The Web Risk API checked 60 third-party script, iframe, form and link hosts and found none on a malware, phishing or unwanted-software list. 4 more hosts were not checked in this review.");
  assert.ok(!report.findings.some((row) => row.key === "sec-linked-script"));
  assert.ok(!insights.analyze({ pages: [HOME], extras: {} }).findings.some((row) => /^sec-linked/.test(row.key)));
});

test("each host is looked up once a day, and the monthly and daily budgets stop the lookups (#3090)", async () => {
  const store = linked.memoryStore();
  const rows = [{ host: TEST, element: "script", page: "/" }, { host: "clean.example", element: "link", page: "/" }];
  const asked = [];
  await linked.check(rows, lookup(asked), { store, now: NOW });
  const again = await linked.check(rows, lookup(asked), { store, now: NOW + 3600000 });
  assert.equal(asked.length, 2);
  assert.deepEqual([again.checked, again.hits.length], [2, 1]);
  await linked.check(rows, lookup(asked), { store, now: NOW + linked.CACHE_MS + 1 });
  assert.equal(asked.length, 4);

  const full = { load: async () => ({ hosts: new Map(), month: linked.PER_MONTH, day: 0 }), save: async () => { throw new Error("nothing to save"); } };
  const spent = await linked.check(rows, lookup(asked), { store: full, now: NOW });
  assert.equal(asked.length, 4);
  assert.deepEqual([spent.checked, spent.unchecked, spent.budget], [0, 2, true]);
  assert.match(linked.note(spent), /This month's lookup budget left the rest unread\.$/);
  const today = { load: async () => ({ hosts: new Map(), month: 0, day: linked.PER_DAY - 1 }), save: async () => {} };
  const one = await linked.check(rows, lookup(asked), { store: today, now: NOW });
  assert.deepEqual([asked.length, one.checked, one.unchecked], [5, 1, 1]);
  const blind = await linked.check(rows, lookup(asked), { store: { load: async () => { throw new Error("offline"); } }, now: NOW });
  assert.deepEqual([asked.length, blind.checked, blind.unchecked], [5, 0, 2]);
  assert.ok(linked.PER_MONTH < linked.FREE_PER_MONTH);
  assert.ok(linked.PER_DAY * 31 >= linked.PER_MONTH && linked.PER_DAY * 30 < linked.FREE_PER_MONTH);
});

test("a failed lookup is not cached or counted as checked (#3090)", async () => {
  const store = linked.memoryStore();
  const rows = [{ host: "down.example", element: "script", page: "/" }];
  const failed = await linked.check(rows, async () => ({ ok: false, error: "status 429" }), { store, now: NOW });
  assert.deepEqual([failed.checked, failed.unchecked], [0, 1]);
  const asked = [];
  await linked.check(rows, lookup(asked), { store, now: NOW });
  assert.equal(asked.length, 1);
});

test("the Firestore ledger reads today and yesterday, counts lookups with increments, and keeps the answers by day (#3090)", async () => {
  const docs = {
    "webrisk_usage/2026-11": { lookups: 120, days: { "09": 20 } },
    "webrisk_hosts/2026-11-08": { hosts: { [TEST]: { t: "MALWARE", at: NOW - 3600000 }, "stale.example": { t: "", at: NOW - linked.CACHE_MS - 1 } } }
  };
  const writes = [];
  const ref = (path) => ({ path });
  const db = {
    collection: (name) => ({ doc: (id) => ref(name + "/" + id) }),
    getAll: async (...refs) => refs.map((r) => ({ exists: !!docs[r.path], data: () => docs[r.path] })),
    batch: () => ({
      set: (r, value, opts) => writes.push(["set", r.path, value, opts]),
      delete: (r) => writes.push(["delete", r.path]),
      commit: async () => {}
    })
  };
  const FieldValue = { increment: (n) => ({ increment: n }) };
  const store = linked.firestoreStore(db, FieldValue);
  const ledger = await store.load(NOW);
  assert.deepEqual([ledger.month, ledger.day, ledger.first, ledger.size], [120, 20, true, 0]);
  const asked = [];
  const result = await linked.check([{ host: TEST, element: "script", page: "/" }, { host: "stale.example", element: "link", page: "/" }], lookup(asked), { store, now: NOW });
  assert.deepEqual(asked, ["https://stale.example/"]);
  assert.deepEqual(result.hits.map((hit) => hit.host), [TEST]);
  assert.deepEqual(writes[0], ["set", "webrisk_usage/2026-11", { lookups: { increment: 1 }, days: { "09": { increment: 1 } } }, { merge: true }]);
  assert.deepEqual(writes[1].slice(0, 2), ["set", "webrisk_hosts/2026-11-09"]);
  assert.deepEqual(writes[1][2].hosts, { "stale.example": { t: "", at: NOW } });
  assert.deepEqual(writes[2], ["delete", "webrisk_hosts/2026-11-06"]);
});
