/**
 * Owner proofs besides the mailbox (#667): a desk-recorded credentials run and the owner's
 * qa-lab-verify token in DNS or on the homepage. Each one unlocks the chat conversation; nothing else does.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const proofs = require("../../functions/url-review-owner-proof");
const accountData = require("../../functions/url-review-account-data");
const auth = require("../../functions/url-review-auth");

const KEY = "test-verify-key";
const ANA = "ana@gmail.com";
const SHOP = "https://shop.example.com/";
const HEADERS = { "content-type": "text/html" };
const DAY = 24 * 60 * 60 * 1000;
const token = (email, host) => proofs.siteToken(KEY, email, host);
const tag = (value) => "<meta name=\"qa-lab-verify\" content=\"" + value + "\">";
const page = (head, body) => "<!doctype html><html lang=\"en\"><head><title>Shop</title>" + (head || "") + "</head><body><main><h1>Tools</h1>" + (body || "<p>Basic plan 19.99 a month.</p>") + "<a href=\"/about\">About</a></main></body></html>";

function fakeNetwork(routes, txt) {
  const { EventEmitter } = require("node:events");
  const dnsPromises = require("node:dns").promises;
  const libs = [require("node:http"), require("node:https")];
  const saved = { lookup: dnsPromises.lookup, resolveTxt: dnsPromises.resolveTxt, requests: libs.map((lib) => lib.request) };
  const asked = { txt: [], paths: [] };
  dnsPromises.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  dnsPromises.resolveTxt = async (name) => {
    asked.txt.push(name);
    if (!(txt || {})[name]) throw Object.assign(new Error("no data"), { code: "ENODATA" });
    return txt[name];
  };
  libs.forEach((lib) => {
    lib.request = (options, onResponse) => {
      const req = new EventEmitter();
      req.destroy = () => {};
      req.end = () => setImmediate(() => {
        asked.paths.push(options.hostname + options.path);
        const route = routes[options.protocol + "//" + options.hostname + options.path] || { status: 404 };
        const res = new EventEmitter();
        Object.assign(res, { statusCode: route.status, headers: route.headers || {}, socket: null });
        onResponse(res);
        if (route.body) res.emit("data", Buffer.from(route.body));
        res.emit("end");
      });
      return req;
    };
  });
  return {
    asked,
    restore() {
      dnsPromises.lookup = saved.lookup;
      dnsPromises.resolveTxt = saved.resolveTxt;
      libs.forEach((lib, index) => { lib.request = saved.requests[index]; });
    }
  };
}

const ROUTES = {
  [SHOP]: { status: 200, headers: HEADERS, body: page() },
  [SHOP + "about"]: { status: 200, headers: HEADERS, body: page("", "<p>We sell tools.</p>") }
};

async function review(asker, options) {
  const opts = options || {};
  const jobs = [];
  const net = fakeNetwork(opts.routes || ROUTES, opts.txt);
  try {
    const report = await core.reviewTarget(opts.start || SHOP, {
      asker,
      maxPages: 10,
      maxDepth: 1,
      mentions: false,
      browse: async (job) => {
        jobs.push(job);
        if (job.kind !== "chat") return { ok: false, error: "not in this test" };
        return { ok: true, status: "talked", vendor: "Chatbase", ai: false, turns: job.turns.filter((turn) => !turn.ai).map((turn) => ({ id: turn.id, sent: turn.text, reply: "Hello, we sell tools.", ms: 1200 })), ms: 9000 };
      }
    });
    return { report, chatJobs: jobs.filter((job) => job.kind === "chat"), asked: net.asked };
  } finally {
    net.restore();
  }
}

const siteAsker = (email, extra) => Object.assign({ reasonCode: "client", email: email || ANA, siteToken: (host) => token(email || ANA, host) }, extra || {});

test.describe("the site token", () => {
  test("is the same for the same account and host, and differs for another email, another host, or another key", () => {
    const mine = token(ANA, "shop.example.com");
    assert.match(mine, /^[0-9a-f]{32}$/);
    assert.equal(token(" Ana@Gmail.com ", "https://www.Shop.Example.com/path"), token(ANA, "www.shop.example.com"));
    assert.equal(token(ANA, "www.shop.example.com"), mine);
    assert.notEqual(token("bob@gmail.com", "shop.example.com"), mine);
    assert.notEqual(token(ANA, "other.example.com"), mine);
    assert.notEqual(proofs.siteToken("another-key", ANA, "shop.example.com"), mine);
  });

  test("is not issued without the server key, an email, or a public host", () => {
    assert.equal(proofs.siteToken("", ANA, "shop.example.com"), "");
    assert.equal(proofs.siteToken(KEY, "not-an-email", "shop.example.com"), "");
    assert.equal(proofs.siteToken(KEY, ANA, "10.0.0.1"), "");
    assert.equal(proofs.siteToken(KEY, ANA, "localhost"), "");
  });
});

test.describe("checking the site", () => {
  const mine = token(ANA, "shop.example.com");
  const deps = (txt, html) => ({
    resolveTxt: async (name) => { if (!txt[name]) throw new Error("ENODATA"); return txt[name]; },
    fetchHome: async () => html || "",
    registrable: core.registrable
  });

  test("a TXT record on the host or on its registrable domain proves it, also when split into chunks", async () => {
    assert.deepEqual(await proofs.checkSite(mine, "shop.example.com", deps({ "shop.example.com": [["v=spf1 -all"], ["qa-lab-verify=" + mine]] })), { ok: true, how: "dns", name: "shop.example.com" });
    assert.deepEqual(await proofs.checkSite(mine, "shop.example.com", deps({ "example.com": [["qa-lab-verify=", mine]] })), { ok: true, how: "dns", name: "example.com" });
  });

  test("the meta tag on the homepage proves it", async () => {
    assert.deepEqual(await proofs.checkSite(mine, "shop.example.com", deps({}, page(tag(mine)))), { ok: true, how: "meta", name: "shop.example.com" });
    assert.deepEqual(await proofs.checkSite(mine, "shop.example.com", deps({}, page("<meta content='" + mine + "' name='qa-lab-verify' />"))), { ok: true, how: "meta", name: "shop.example.com" });
  });

  test("a wrong token, or one made for another email or host, does not", async () => {
    for (const other of ["0".repeat(32), token("bob@gmail.com", "shop.example.com"), token(ANA, "other.example.com")]) {
      const txt = { "shop.example.com": [["qa-lab-verify=" + other]], "example.com": [["qa-lab-verify=" + other]] };
      assert.equal((await proofs.checkSite(mine, "shop.example.com", deps(txt, page(tag(other))))).ok, false, other);
    }
    assert.equal((await proofs.checkSite(mine, "shop.example.com", deps({ "shop.example.com": [["qa-lab-verify=" + mine + "x"]] }))).ok, false);
    assert.equal((await proofs.checkSite(mine, "shop.example.com", deps({}, page("<meta name=\"description\" content=\"" + mine + "\">")))).ok, false);
    assert.equal((await proofs.checkSite("", "shop.example.com", deps({ "shop.example.com": [["qa-lab-verify="]] }))).ok, false);
  });

  test("the homepage is fetched through the safe fetch and only counts when it stays on the host", async () => {
    const net = fakeNetwork({
      [SHOP]: { status: 200, headers: HEADERS, body: page(tag(mine)) },
      "https://moved.example.com/": { status: 301, headers: { location: "https://elsewhere.example.org/" } },
      "https://elsewhere.example.org/": { status: 200, headers: HEADERS, body: page(tag(mine)) }
    });
    try {
      assert.match(await core.fetchHomepage("shop.example.com"), /qa-lab-verify/);
      assert.equal(await core.fetchHomepage("moved.example.com"), "");
      assert.equal(await core.fetchHomepage("missing.example.com"), "");
    } finally {
      net.restore();
    }
  });
});

test.describe("stored proofs", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  const operator = proofs.operatorRecord({ email: ANA, host: "https://www.shop.example.com/", by: "kaanmuar@gmail.com" }, now);
  const site = proofs.siteRecord({ email: ANA, host: "shop.example.com", how: "meta" }, now);

  test("an operator record keeps who, when, the host and the account email, and nothing else", () => {
    assert.deepEqual(Object.keys(operator).sort(), ["at", "by", "email", "expireAt", "host", "kind"]);
    assert.deepEqual([operator.email, operator.host, operator.by, operator.at], [ANA, "shop.example.com", "kaanmuar@gmail.com", "2026-10-23T12:00:00.000Z"]);
    assert.equal(operator.expireAt.getTime() - now, 365 * DAY);
    assert.equal(site.expireAt.getTime() - now, 30 * DAY);
    assert.equal(proofs.docId("operator", ANA, "www.shop.example.com"), proofs.docId("operator", " ANA@gmail.com", "shop.example.com"));
    assert.notEqual(proofs.docId("operator", ANA, "shop.example.com"), proofs.docId("site", ANA, "shop.example.com"));
  });

  test("count only for the same account and host, until they expire", () => {
    assert.equal(proofs.validFor([operator], ANA, "shop.example.com", now + DAY), "credentials");
    assert.equal(proofs.validFor([site], ANA, "www.shop.example.com", now + DAY), "site");
    assert.equal(proofs.validFor([site, operator], ANA, "shop.example.com", now + DAY), "credentials");
    assert.equal(proofs.validFor([operator], ANA, "shop.example.com", now + 366 * DAY), "");
    assert.equal(proofs.validFor([site], ANA, "shop.example.com", now + 31 * DAY), "");
    assert.equal(proofs.validFor([operator, site], "bob@gmail.com", "shop.example.com", now + DAY), "");
    assert.equal(proofs.validFor([operator, site], ANA, "other.example.com", now + DAY), "");
    const stamped = Object.assign({}, operator, { expireAt: { toDate: () => new Date(now + DAY) } });
    assert.equal(proofs.validFor([stamped], ANA, "shop.example.com", now), "credentials");
    assert.equal(proofs.validFor([stamped], ANA, "shop.example.com", now + 2 * DAY), "");
  });

  test("the credentials dropdown alone is not a proof; a recorded run for the account is", () => {
    assert.equal(core.ownerProof({ reasonCode: "credentials", email: ANA }, "shop.example.com"), "");
    assert.equal(core.ownerProof({ reasonCode: "credentials", email: ANA, proofs: [] }, "shop.example.com"), "");
    assert.equal(core.ownerProof({ reasonCode: "client", email: ANA, proofs: [operator] }, "shop.example.com", now + DAY), "credentials");
    assert.equal(core.ownerProof({ reasonCode: "credentials", email: "bob@gmail.com", proofs: [operator] }, "shop.example.com", now + DAY), "");
  });

  test("the desk view carries only the stored fields, and the account export and delete include the proofs", async () => {
    assert.deepEqual(Object.keys(proofs.publicRow("operator-x", operator)).sort(), ["at", "by", "email", "host", "how", "id", "kind", "until"]);
    assert.equal(proofs.publicRow("x", site).until, new Date(now + 30 * DAY).toISOString());
    const store = auth.memoryStore();
    await store.set(proofs.COLLECTION, proofs.docId("operator", ANA, "shop.example.com"), operator);
    const data = await accountData.exportAccount(store, ANA, now);
    assert.equal(data.ownerProofs.length, 1);
    assert.equal(data.ownerProofs[0].host, "shop.example.com");
    await accountData.deleteAccount(store, ANA, { now });
    assert.equal(await store.get(proofs.COLLECTION, proofs.docId("operator", ANA, "shop.example.com")), null);
  });
});

test.describe("the review", () => {
  test("a desk-recorded credentials run sends the chat job with proof credentials", async () => {
    const operator = proofs.operatorRecord({ email: ANA, host: "shop.example.com", by: "kaanmuar@gmail.com" });
    const run = await review({ reasonCode: "credentials", email: ANA, proofs: [operator] });
    assert.equal(run.chatJobs.length, 1);
    assert.equal(run.chatJobs[0].proof, "credentials");
    assert.equal(run.report.chatTalk.proof, "credentials");
    assert.deepEqual(run.report.ownerProof, { kind: "credentials", how: "", host: "shop.example.com", checked: false });
  });

  test("an expired operator record, or the dropdown alone, sends none", async () => {
    const expired = proofs.operatorRecord({ email: ANA, host: "shop.example.com", by: "kaanmuar@gmail.com" }, Date.now() - 400 * DAY);
    for (const asker of [{ reasonCode: "credentials", email: ANA, proofs: [expired] }, { reasonCode: "credentials", email: ANA }]) {
      const run = await review(asker);
      assert.equal(run.chatJobs.length, 0);
      assert.equal(run.report.ownerProof, undefined);
    }
  });

  test("the owner's TXT record or homepage tag sends the chat job with proof site", async () => {
    const mine = token(ANA, "shop.example.com");
    const byDns = await review(siteAsker(), { txt: { "example.com": [["qa-lab-verify=" + mine]] } });
    assert.equal(byDns.chatJobs.length, 1);
    assert.equal(byDns.chatJobs[0].proof, "site");
    assert.deepEqual(byDns.report.ownerProof, { kind: "site", how: "dns", host: "shop.example.com", checked: true });

    const byMeta = await review(siteAsker(), { routes: Object.assign({}, ROUTES, { [SHOP]: { status: 200, headers: HEADERS, body: page(tag(mine)) } }) });
    assert.equal(byMeta.chatJobs[0].proof, "site");
    assert.equal(byMeta.report.ownerProof.how, "meta");
  });

  test("a tag for another account or host, or a wrong one, sends none", async () => {
    for (const other of ["f".repeat(32), token("bob@gmail.com", "shop.example.com"), token(ANA, "other.example.com")]) {
      const run = await review(siteAsker(), {
        routes: Object.assign({}, ROUTES, { [SHOP]: { status: 200, headers: HEADERS, body: page(tag(other)) } }),
        txt: { "shop.example.com": [["qa-lab-verify=" + other]] }
      });
      assert.equal(run.chatJobs.length, 0, other);
      assert.equal(run.report.ownerProof, undefined);
    }
  });

  test("a tag on a page other than the homepage does not count, even when the review starts there", async () => {
    const mine = token(ANA, "shop.example.com");
    const run = await review(siteAsker(), {
      start: SHOP + "about",
      routes: Object.assign({}, ROUTES, { [SHOP + "about"]: { status: 200, headers: HEADERS, body: page(tag(mine), "<p>We sell tools.</p>") } })
    });
    assert.equal(run.asked.paths.filter((asked) => asked === "shop.example.com/").length > 0, true);
    assert.equal(run.chatJobs.length, 0);
    assert.equal(run.report.ownerProof, undefined);
  });

  test("a site proof remembered within 30 days counts without checking again", async () => {
    const remembered = proofs.siteRecord({ email: ANA, host: "shop.example.com", how: "dns" });
    const txt = { "shop.example.com": [["qa-lab-verify=" + token(ANA, "shop.example.com")]] };
    const run = await review(siteAsker(ANA, { proofs: [remembered] }), { txt });
    assert.equal(run.chatJobs[0].proof, "site");
    assert.deepEqual(run.report.ownerProof, { kind: "site", how: "", host: "shop.example.com", checked: false });
    assert.equal(run.asked.txt.filter((name) => name === "shop.example.com").length, 0);
  });

  test("without the server key no token is checked", async () => {
    const txt = { "shop.example.com": [["qa-lab-verify=" + token(ANA, "shop.example.com")]] };
    const run = await review({ reasonCode: "client", email: ANA, siteToken: null }, { txt });
    assert.equal(run.chatJobs.length, 0);
    assert.equal(run.asked.txt.filter((name) => name === "shop.example.com").length, 0);
  });
});
