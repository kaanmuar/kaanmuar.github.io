/**
 * Exposed files (#3085): /.git/, .env, backups, dumps, phpinfo, server status and folder listings.
 * The probes run only for an owner who proved the site; a soft-404 site finds nothing; values never leave.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const exposed = require("../../functions/url-review-exposed");
const core = require("../../functions/url-review-core");
const proofs = require("../../functions/url-review-owner-proof");
const publish = require("../../functions/url-review-publish");
const { english } = require("../../functions/url-review-findings-en");

const ORIGIN = "https://shop.example.com";
const HTML = "<!doctype html><html><head><title>Shop</title></head><body><h1>Page not found</h1></body></html>";
const DS_STORE = Buffer.concat([Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31]), Buffer.alloc(32)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);

const EXPOSED = {
  "/.git/HEAD": "ref: refs/heads/main\n",
  "/.git/config": "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n[remote \"origin\"]\n\turl = https://deploy:ghp_SECRETTOKEN123@github.com/shop/site.git\n",
  "/.env": "# app\nAPP_ENV=production\nDB_HOST=10.0.0.5\nDB_PASSWORD=hunter2-very-secret\n",
  "/.env.production": "export STRIPE_SECRET_KEY=sk_live_abcdef123456\nexport APP_URL=https://shop.example.com\n",
  "/.svn/entries": "12\n",
  "/wp-config.php.bak": "<?php\ndefine( 'DB_NAME', 'shop' );\ndefine( 'DB_PASSWORD', 'p4ssw0rd-hidden' );\n",
  "/backup.zip": ZIP,
  "/backup.sql": "-- MySQL dump 10.13  Distrib 8.0.36\nINSERT INTO `wp_users` VALUES (1,'admin','$P$Bhashhash');\n",
  "/db.sql": "CREATE TABLE `orders` (\n  `id` int NOT NULL\n);\n",
  "/.DS_Store": DS_STORE,
  "/config.json": "{ \"name\": \"shop\", \"db_password\": \"json-secret-value\" }",
  "/phpinfo.php": "<!DOCTYPE html><html><head><title>PHP 8.2.1 - phpinfo()</title></head><body><h1 class=\"p\">PHP Version 8.2.1</h1></body></html>",
  "/server-status": "<html><head><title>Apache Status</title></head><body><h1>Apache Server Status for shop.example.com (via 10.0.0.5)</h1></body></html>",
  "/wp-content/uploads/": "<html><head><title>Index of /wp-content/uploads</title></head><body><h1>Index of /wp-content/uploads</h1></body></html>",
  "/uploads/": "<html><head><title>Index of /uploads</title></head><body><h1>Index of /uploads</h1></body></html>",
  "/backup/": "<html><head><title>Directory listing for /backup/</title></head><body></body></html>"
};
const SECRETS = ["ghp_SECRETTOKEN123", "hunter2-very-secret", "sk_live_abcdef123456", "p4ssw0rd-hidden", "$P$Bhashhash", "json-secret-value", "10.0.0.5"];

// A site as a map of path -> body (200), or a function (path) -> { status, body }.
function site(answer) {
  const asked = [];
  const get = async (url) => {
    const path = new URL(url).pathname;
    asked.push(path);
    const row = typeof answer === "function" ? answer(path) : path in answer ? { status: 200, body: answer[path] } : { status: 404, body: HTML };
    return { status: row.status, type: "", body: Buffer.isBuffer(row.body) ? row.body : Buffer.from(row.body || "") };
  };
  return { get, asked };
}

function collect(out) {
  const findings = [];
  exposed.checks(out, (area, verdict, severity, key, title, evidence, fix, opts) => findings.push({ area, verdict, severity, key, title, evidence, fix, opts }));
  return findings;
}

test.describe("the probes", () => {
  test("find every signature on a site that exposes them all, one finding per kind", async () => {
    const out = await exposed.probe(ORIGIN, { get: site(EXPOSED).get });
    assert.deepEqual(out.found.map((row) => row.path), exposed.PROBES.map((p) => p.path));
    const findings = collect(out);
    assert.deepEqual(findings.map((f) => f.key).sort(), Object.keys(exposed.SEVERITY).map((kind) => "sec-exposed-" + kind).sort());
    findings.forEach((f) => assert.equal(f.verdict, "fail"));
    assert.equal(findings.find((f) => f.key === "sec-exposed-git").severity, "critical");
    assert.equal(findings.find((f) => f.key === "sec-exposed-env").severity, "critical");
    assert.equal(findings.find((f) => f.key === "sec-exposed-listing").severity, "medium");
    assert.deepEqual(findings.find((f) => f.key === "sec-exposed-env").opts.pages, ["/.env", "/.env.production"]);
    assert.match(english(findings.find((f) => f.key === "sec-exposed-git").fix), /Block \/\.git\/ in the server config/);
  });

  test("keep only the line that proves it, with every value hidden", async () => {
    const out = await exposed.probe(ORIGIN, { get: site(EXPOSED).get });
    const proof = (path) => out.found.find((row) => row.path === path).proof;
    assert.equal(proof("/.git/HEAD"), "ref: refs/heads/main");
    assert.equal(proof("/.git/config"), "[core]");
    assert.equal(proof("/.env"), "DB_PASSWORD=•••");
    assert.equal(proof("/.env.production"), "STRIPE_SECRET_KEY=•••");
    assert.equal(proof("/wp-config.php.bak"), "define('DB_PASSWORD', •••)");
    assert.equal(proof("/backup.sql"), "-- MySQL dump");
    assert.equal(proof("/db.sql"), "CREATE TABLE `orders` …");
    assert.equal(proof("/config.json"), "\"db_password\": \"•••\"");
    assert.equal(proof("/phpinfo.php"), "PHP Version 8.2.1");
    assert.equal(proof("/server-status"), "Apache Server Status");
    const stored = JSON.stringify(out) + JSON.stringify(collect(out).map((f) => [english(f.title), english(f.evidence), english(f.fix)]));
    SECRETS.forEach((secret) => assert.ok(!stored.includes(secret), "kept " + secret));
  });

  test("find nothing on a soft-404 site that answers 200 with the same page for every path", async () => {
    const run = site(() => ({ status: 200, body: HTML }));
    const out = await exposed.probe(ORIGIN, { get: run.get });
    assert.equal(out.found.length, 0);
    assert.equal(out.checked, exposed.PROBES.length);
    assert.match(run.asked[0], /^\/qa-lab-review-[0-9a-f]{8}-not-found$/);
    const findings = collect(out);
    assert.deepEqual(findings.map((f) => [f.key, f.verdict]), [["sec-exposed", "pass"]]);
    assert.match(english(findings[0].evidence), new RegExp("^" + exposed.PROBES.length + " well-known paths were checked"));
  });

  test("find nothing on a catch-all that echoes the path, or that answers the same KEY=VALUE text everywhere", async () => {
    const echo = await exposed.probe(ORIGIN, { get: site((path) => ({ status: 200, body: "<html><body>Sorry, " + path + " is not here.</body></html>" })).get });
    assert.equal(echo.found.length, 0);
    const text = await exposed.probe(ORIGIN, { get: site(() => ({ status: 200, body: "APP_ENV=production\nAPP_DEBUG=false\n" })).get });
    assert.equal(text.found.length, 0);
  });

  test("still find a real .env on a site that soft-404s every other path", async () => {
    const out = await exposed.probe(ORIGIN, { get: site((path) => ({ status: 200, body: path === "/.env" ? EXPOSED["/.env"] : HTML })).get });
    assert.deepEqual(out.found.map((row) => row.path), ["/.env"]);
  });

  test("do not count an HTML page, a redirect or a login wall as an exposed file", async () => {
    const out = await exposed.probe(ORIGIN, { get: site((path) => {
      if (path === "/.env") return { status: 200, body: "<!doctype html><html><body>APP_KEY=a\nDB_PASSWORD=b</body></html>" };
      if (path === "/.git/HEAD") return { status: 302, body: "" };
      if (path === "/backup.zip") return { status: 403, body: ZIP };
      if (path === "/config.json") return { status: 200, body: "{ \"apiKey\": \"AIza-public-firebase-key\", \"projectId\": \"shop\" }" };
      return { status: 404, body: HTML };
    }).get });
    assert.equal(out.found.length, 0);
  });

  test("skip what robots.txt disallows without asking for it", async () => {
    const run = site(EXPOSED);
    const out = await exposed.probe(ORIGIN, { get: run.get, allowed: (path) => !path.startsWith("/.git/") });
    assert.ok(!run.asked.some((path) => path.startsWith("/.git/")));
    assert.equal(out.skipped, 2);
    assert.ok(!out.found.some((row) => row.kind === "git"));
  });

  test("stay inside the request cap and the time budget", async () => {
    const run = site(EXPOSED);
    const out = await exposed.probe(ORIGIN, { get: run.get });
    assert.ok(run.asked.length <= exposed.MAX_REQUESTS);
    assert.equal(out.requests, run.asked.length);
    let clock = 0;
    const slow = site(EXPOSED);
    const timed = await exposed.probe(ORIGIN, { get: async (url) => { clock += 4000; return slow.get(url); }, now: () => clock, budgetMs: 10000 });
    assert.ok(slow.asked.length < exposed.PROBES.length, "asked " + slow.asked.length);
    assert.ok(timed.skipped > 0);
  });

  test("count a path that does not answer as skipped, not as checked", async () => {
    const out = await exposed.probe(ORIGIN, { get: async () => { throw new Error("ECONNRESET"); } });
    assert.equal(out.checked, 0);
    assert.deepEqual(collect(out), []);
  });
});

test("the reader asks for 2 KB and keeps at most a few KB of a server that ignores Range", async () => {
  let range = "";
  const server = http.createServer((req, res) => {
    range = req.headers.range;
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(Buffer.alloc(200000, 0x41));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const res = await exposed.read(new URL("http://127.0.0.1:" + server.address().port + "/backup.zip"), { agent: "test" });
    assert.equal(range, "bytes=0-2047");
    assert.equal(res.status, 200);
    assert.ok(res.body.length <= exposed.MAX_BYTES, "kept " + res.body.length);
  } finally {
    server.close();
  }
});

test("Live Reports hold back a report with an exposed file and never carry the exposed-files lines", () => {
  const finding = (key, verdict) => ({ key, verdict, area: "Security", severity: "critical", title: "t", evidence: "e", fix: "f" });
  const record = (findings) => ({
    status: "complete",
    report: {
      host: "shop.example.com",
      status: "complete",
      limits: { pagesRead: 5, maxPages: 5 },
      pages: [{ status: 200 }, { status: 200 }],
      insights: { score: { overall: 70, areas: {} }, findings }
    }
  });
  assert.equal(publish.heldReason(record([finding("sec-exposed-env", "fail")]), []), "exposed-files");
  assert.equal(publish.heldReason(record([finding("sec-exposed", "pass")]), []), "");
  const shown = publish.publicReport(record([finding("sec-exposed", "person"), finding("sec-tls", "pass")]).report).insights.findings.map((f) => f.key);
  assert.deepEqual(shown, ["sec-tls"]);
});

test.describe("in a review", () => {
  const KEY = "test-verify-key";
  const ANA = "ana@gmail.com";
  const SHOP = ORIGIN + "/";
  const HEADERS = { "content-type": "text/html" };
  const page = (head) => "<!doctype html><html lang=\"en\"><head><title>Shop</title>" + (head || "") + "</head><body><main><h1>Tools</h1><a href=\"/about\">About</a></main></body></html>";
  const mine = proofs.siteToken(KEY, ANA, "shop.example.com");

  function fakeNetwork(routes) {
    const { EventEmitter } = require("node:events");
    const dnsPromises = require("node:dns").promises;
    const libs = [require("node:http"), require("node:https")];
    const saved = { lookup: dnsPromises.lookup, resolveTxt: dnsPromises.resolveTxt, requests: libs.map((lib) => lib.request) };
    const paths = [];
    dnsPromises.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    dnsPromises.resolveTxt = async () => { throw Object.assign(new Error("no data"), { code: "ENODATA" }); };
    libs.forEach((lib) => {
      lib.request = (options, onResponse) => {
        const req = new EventEmitter();
        req.destroy = () => {};
        req.end = () => setImmediate(() => {
          paths.push(options.path);
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
    return { paths, restore() { dnsPromises.lookup = saved.lookup; dnsPromises.resolveTxt = saved.resolveTxt; libs.forEach((lib, index) => { lib.request = saved.requests[index]; }); } };
  }

  async function review(controls, home) {
    const net = fakeNetwork({
      [SHOP]: { status: 200, headers: HEADERS, body: page(home) },
      [SHOP + "about"]: { status: 200, headers: HEADERS, body: page() },
      [ORIGIN + "/.env"]: { status: 200, headers: { "content-type": "text/plain" }, body: EXPOSED["/.env"] }
    });
    try {
      const report = await core.reviewTarget(SHOP, Object.assign({ maxPages: 2, maxDepth: 1, mentions: false }, controls));
      return { report, paths: net.paths, keys: ((report.insights && report.insights.findings) || []).filter((f) => /^sec-exposed/.test(f.key)) };
    } finally {
      net.restore();
    }
  }

  const asker = { reasonCode: "client", email: ANA, siteToken: (host) => proofs.siteToken(KEY, ANA, host) };

  test("an asker without proof gets no probe, only the neutral note", async () => {
    const run = await review({ asker });
    assert.ok(!run.paths.some((path) => /^\/(\.git|\.env|backup|\.DS_Store|phpinfo)/.test(path)), run.paths.join(" "));
    assert.deepEqual(run.keys.map((f) => [f.key, f.verdict, f.severity]), [["sec-exposed", "person", "info"]]);
    assert.match(run.keys[0].title, /needs a verified owner/);
  });

  test("a sweep, a competitor run or an anonymous run shows nothing about it", async () => {
    for (const controls of [{}, { asker, passive: true }]) {
      const run = await review(controls);
      assert.deepEqual(run.keys, []);
      assert.ok(!run.paths.includes("/.env"));
    }
  });

  test("a proven owner gets the probes and a critical finding without the value", async () => {
    const run = await review({ asker }, "<meta name=\"qa-lab-verify\" content=\"" + mine + "\">");
    assert.equal(run.report.ownerProof.kind, "site");
    assert.ok(run.paths.includes("/.git/HEAD") && run.paths.includes("/.env"));
    assert.deepEqual(run.keys.map((f) => [f.key, f.verdict, f.severity]), [["sec-exposed-env", "fail", "critical"]]);
    assert.match(run.keys[0].evidence, /^\/\.env \(DB_PASSWORD=•••\)\. Only the line that proves it is shown/);
    assert.ok(!JSON.stringify(run.report).includes("hunter2"));
  });
});
