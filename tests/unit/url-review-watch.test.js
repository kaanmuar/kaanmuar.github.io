/**
 * Watch cases for the Cases card (#3391): each retest exists only with its open finding, a fix re-review leaves regression
 * pins, the six languages are complete, and every generated script parses (bash -n, node --check, py_compile, JSON, YAML).
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { stripTypeScriptTypes } = require("node:module");
const yaml = require("js-yaml");

const watchCases = require("../../functions/url-review-watch");
const blocklists = require("../../functions/url-review-blocklists");
const fixRereview = require("../../functions/url-review-fix-rereview");
const core = require("../../functions/url-review-core");
const watch = require("../../js/qa-review-watch.js");
const scripts = require("../../js/qa-review-scripts.js");

const HOST = "shop.example.com";
const BASE = "https://" + HOST;
let seq = 0;
const finding = (key, verdict, extra) => Object.assign({ id: "F-" + String(++seq).padStart(2, "0"), key, area: "Security", verdict, severity: verdict === "fail" ? "high" : "medium", title: key + " title", evidence: "", fix: "" }, extra);

// One open finding per kind, keyed by the kind it should produce.
const OPEN = {
  lists: [finding("sec-threatlists", "fail"), finding("sec-safebrowsing", "fail")],
  linked: [finding("sec-linked-script", "fail", { pages: ["/"] })],
  hacked: [finding("sec-seo-spam", "fail"), finding("sec-cloaking", "risk", { pages: ["/shop"] }), finding("sec-spam-links", "fail", { pages: ["/blog"] })],
  lookalike: [finding("sec-lookalike", "fail")],
  exposed: [finding("sec-exposed-env", "fail", { pages: ["/.env", "/.git/config"] })],
  mail: [finding("sec-dmarc", "risk"), finding("sec-spf-all", "fail")],
  blocklist: [finding("sec-blocklist-0", "fail")],
  headers: [finding("sec-csp", "risk"), finding("sec-hsts", "fail"), finding("sec-cookies", "risk")],
  tls: [finding("sec-tls", "risk")],
  a11y: [finding("a11y-contrast", "fail", { area: "Accessibility", pages: ["/", "/contact"] }), finding("ax-image-alt", "fail", { area: "Accessibility", pages: ["/gallery"] })]
};

const EXTRAS = {
  threatLists: { host: HOST, sources: [
    { source: "urlhaus", ok: true, listed: true, delist: "https://urlhaus.abuse.ch/host/shop.example.com/" },
    { source: "cloudflare", ok: true, listed: true, delist: "https://radar.cloudflare.com/domains/feedback/example.com", report: "https://radar.cloudflare.com/scan/abc" },
    { source: "phishstats", ok: true, listed: false }
  ] },
  linkedRisk: { checked: 9, hits: [{ host: "evil-cdn.example.net", element: "script", page: "/", threats: ["MALWARE"] }, { host: "bad form.example", element: "form", page: "/contact", threats: ["SOCIAL_ENGINEERING"] }] },
  hackSigns: {
    domain: "example.com",
    search: { rows: [{ url: "https://shop.example.com/cheap-pills", path: "/cheap-pills", terms: ["viagra", "casino"], signs: ["slug"] }] },
    pages: [{ path: "/shop", verdict: "differs", fields: ["scripts"], terms: [] }],
    links: [{ path: "/blog", href: "https://spam.example/", terms: ["casino"], hidden: true }]
  },
  lookalikes: { domain: "example.com", checked: 120, found: 2, rows: [{ domain: "examp1e.com", web: true, mx: false }, { domain: "xn--exmple-cua.com", shown: "exämple.com", web: false, mx: true }] },
  dns: {
    domain: "example.com",
    mailAuth: { spfRecords: 1, lookups: 7 },
    blocklists: { domain: "example.com", targets: [{ ip: "192.0.2.10", hosts: ["mx.example.com"], web: false }, { ip: "198.51.100.7", hosts: [], web: true }], listed: [{ list: "spamcop", target: "192.0.2.10", codes: ["127.0.0.2"] }], read: [], unread: [] }
  },
  tls: { validTo: "2026-11-25", daysLeft: 15 }
};
const BROWSER = { ok: true, axe: { pages: [{ path: "/contact", violations: [{ id: "color-contrast" }] }, { path: "/", violations: [] }] } };
const CTX = { host: HOST, base: BASE, browser: BROWSER };
const ALL = [].concat(...Object.values(OPEN));

function report(built, extra) {
  return Object.assign({ id: "rep123", host: HOST, finalUrl: BASE + "/", cases: [], watch: built }, extra);
}

test.describe("watch cases on the server", () => {
  test("nothing is written without an open finding", () => {
    assert.equal(watchCases.build([], EXTRAS, CTX), null);
    const passing = ALL.map((f) => Object.assign({}, f, { verdict: "pass" }));
    assert.equal(watchCases.build(passing, EXTRAS, CTX), null);
    const person = ALL.map((f) => Object.assign({}, f, { verdict: "person" }));
    assert.equal(watchCases.build(person, EXTRAS, CTX), null, "a finding that needs a person is not evidence");
  });

  Object.keys(OPEN).forEach((kind) => {
    test("the " + kind + " case appears only with its own finding", () => {
      const built = watchCases.build(OPEN[kind], EXTRAS, CTX);
      assert.ok(built, kind + " wrote nothing");
      assert.deepEqual(built.cases.map((item) => item.kind), [kind]);
      assert.deepEqual(built.cases[0].findings, OPEN[kind].map((f) => f.id));
      assert.deepEqual(built.cases[0].tools, watchCases.KIND_TOOLS[kind]);
      const others = ALL.filter((f) => OPEN[kind].indexOf(f) === -1);
      assert.ok(!(watchCases.build(others, EXTRAS, CTX) || { cases: [] }).cases.some((item) => item.kind === kind), kind + " appeared without its finding");
    });
  });

  test("facts come from the raw check results", () => {
    const built = watchCases.build(ALL, EXTRAS, CTX);
    const of = (kind) => built.cases.find((item) => item.kind === kind).data;
    assert.deepEqual(of("lists").lists.map((row) => row.name), ["URLhaus", "Cloudflare URL Scanner", "Google Safe Browsing"]);
    assert.equal(of("lists").lists[2].review, watchCases.SAFE_BROWSING_REVIEW);
    assert.deepEqual(of("lookalike").rows.map((row) => row.domain), ["examp1e.com", "xn--exmple-cua.com"]);
    assert.deepEqual(of("exposed").paths, ["/.env", "/.git/config"]);
    assert.ok(built.cases.find((item) => item.kind === "exposed").owners);
    assert.deepEqual(of("blocklist").lists.map((row) => row.name), blocklists.LISTS.map((row) => row.name));
    assert.deepEqual(of("blocklist").lists.filter((row) => row.kind === "ip").map((row) => row.name), ["SpamCop", "Barracuda", "Mailspike", "PSBL", "0spam", "NordSpam"]);
    assert.deepEqual(of("hacked").terms, ["viagra", "casino"]);
    assert.deepEqual(of("a11y").paths, ["/contact", "/", "/gallery"]);
    assert.deepEqual(of("a11y").rules, ["image-alt"]);
    assert.equal(of("tls").validTo, "2026-11-25");
    assert.deepEqual(built.cases.map((item) => item.id), built.cases.map((item, index) => "WT-" + String(index + 1).padStart(2, "0")));
  });

  test("the stored record has no nested arrays or undefined values (Firestore refuses both)", () => {
    const built = watchCases.build(ALL, EXTRAS, CTX);
    const walk = (value, inArray) => {
      assert.notEqual(value, undefined);
      if (Array.isArray(value)) { assert.ok(!inArray, "nested array"); value.forEach((item) => walk(item, true)); } else if (value && typeof value === "object") Object.values(value).forEach((item) => walk(item, false));
    };
    walk(built, false);
  });

  test("a frosted preview keeps kinds and counts, never hosts, paths or terms", () => {
    const full = report(watchCases.build(ALL, EXTRAS, CTX));
    const frosted = core.previewReport(full);
    const text = JSON.stringify(frosted.watch);
    ["evil-cdn", "/.env", "examp1e", "viagra", "192.0.2.10", "urlhaus.abuse.ch"].forEach((secret) => assert.ok(text.indexOf(secret) === -1, secret + " leaked into the preview"));
    assert.equal(frosted.watch.cases.length, full.watch.cases.length);
    assert.equal(frosted.watch.cases.find((item) => item.kind === "exposed").count, 2);
  });

  test("a fix re-review pins every finding it marked fixed", () => {
    const before = report(watchCases.build(ALL, EXTRAS, CTX), {
      insights: { findings: [OPEN.headers[0], OPEN.mail[1], finding("seo-title-missing", "fail")], score: { overall: 60, grade: "D" } },
      cases: [{ id: "SEC-03", finding: OPEN.headers[0].id }, { id: "SEO-01" }]
    });
    const after = { id: "rep456", host: HOST, finalUrl: BASE + "/", insights: { findings: [Object.assign({}, OPEN.headers[0], { id: "F-90", verdict: "pass" }), finding("seo-title-missing", "fail")], score: { overall: 80, grade: "B" } }, cases: [{ id: "SEC-03", finding: "F-90" }] };
    const asked = [OPEN.headers[0], OPEN.mail[1], before.insights.findings[2]].map((f) => ({ id: f.id, key: f.key, title: f.title, verdict: f.verdict }));
    const result = fixRereview.beforeAfter(before, after, asked);
    const pins = watchCases.regressions(before, after, result);
    assert.deepEqual(pins.map((pin) => pin.key), ["sec-csp", "sec-spf-all"]);
    assert.deepEqual(pins[0].cases, ["SEC-03"]);
    assert.equal(pins[0].after, "pass");
    assert.equal(pins[1].after, "gone");
    assert.equal(pins[1].kind, "mail");
    assert.equal(pins[1].data.domain, "example.com", "the pin keeps the facts of the case before the fix");
    const saved = watchCases.withRegressions(after, pins);
    assert.equal(saved.watch.regressions.length, 2);
    assert.equal(saved.watch.host, HOST);
    assert.equal(watchCases.withRegressions(after, []), after);
  });
});

test.describe("the watch subsection on the page", () => {
  const full = report(watchCases.build(ALL, EXTRAS, CTX));

  test("every language has every line English has", () => {
    const shape = (value) => (typeof value === "string" ? "s" : Array.isArray(value) ? value.map(shape) : Object.keys(value).sort().map((key) => key + ":" + JSON.stringify(shape(value[key]))));
    ["de", "es", "fr", "it", "pt"].forEach((lang) => assert.deepEqual(shape(watch.COPY[lang]), shape(watch.COPY.en), lang + " differs from en"));
    Object.values(watch.COPY).forEach((book) => watch.KINDS.forEach((kind) => assert.equal(book[kind].length, 2)));
  });

  test("each language renders its own title, every case and the tool chips", () => {
    Object.keys(watch.COPY).forEach((lang) => {
      const markup = watch.html(full, { lang, paid: true });
      assert.ok(markup.indexOf(watch.COPY[lang].title.replace(/&/g, "&amp;")) !== -1, lang);
      assert.equal((markup.match(/class="case watch-case"/g) || []).length, full.watch.cases.length);
      ["OWASP ZAP", "Nuclei", "checkdmarc", "dig", "curl", "axe", "Pa11y", "GitHub Actions"].forEach((tool) => assert.ok(markup.indexOf("assets/frameworks/" + watch.LOGOS[tool]) !== -1, tool + " has no icon"));
      assert.ok(markup.indexOf('id="watch-download"') !== -1);
    });
  });

  test("counts read as words, one or many, in every language", () => {
    const one = report(watchCases.build(OPEN.lookalike, { lookalikes: { rows: [{ domain: "examp1e.com", web: true, mx: false }] } }, CTX));
    const two = report(watchCases.build(OPEN.lookalike, EXTRAS, CTX));
    assert.match(watch.html(one, { lang: "en", paid: true }), /Watch 1 lookalike domain of/);
    assert.match(watch.html(two, { lang: "en", paid: true }), /Watch 2 lookalike domains of/);
    assert.match(watch.html(one, { lang: "es", paid: true }), /Vigilar 1 dominio parecido a/);
    Object.keys(watch.COPY).forEach((lang) => {
      [one, two].forEach((row) => assert.doesNotMatch(watch.html(row, { lang, paid: true }), /\(s\)|\{n|\(en\)|\(n\)|\/i |\/e /, lang));
    });
  });

  test("the logos exist", () => {
    Object.values(watch.LOGOS).forEach((file) => assert.ok(fs.existsSync(path.join(__dirname, "../../assets/frameworks", file)), file));
  });

  test("an unpaid or frosted report shows no review links and no download", () => {
    const unpaid = watch.html(full, { lang: "en", paid: false });
    assert.ok(unpaid.indexOf("watch-download") === -1);
    assert.ok(unpaid.indexOf("urlhaus.abuse.ch") === -1);
    const frosted = watch.html(core.previewReport(full), { lang: "en", paid: true });
    assert.ok(frosted.indexOf("watch-download") === -1);
    assert.ok(frosted.indexOf("Off every phishing and malware list") !== -1);
  });

  test("lists link to their review pages", () => {
    const markup = watch.html(full, { lang: "en", paid: true });
    assert.ok(markup.indexOf('href="https://urlhaus.abuse.ch/host/shop.example.com/"') !== -1);
    assert.ok(markup.indexOf('href="' + watchCases.SAFE_BROWSING_REVIEW + '"') !== -1);
  });

  test("a report without watch facts renders nothing", () => {
    assert.equal(watch.html({ host: HOST, cases: [] }, { lang: "en", paid: true }), "");
    assert.deepEqual(watch.files({ host: HOST, cases: [] }), []);
  });
});

function syntaxError(file, content, dir) {
  const target = path.join(dir, file.replace(/\.ts$/, ".mjs"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (/\.json$/.test(file)) {
    try { JSON.parse(content); return ""; } catch (error) { return error.message; }
  }
  if (/\.ya?ml$/.test(file)) {
    try { yaml.load(content); return ""; } catch (error) { return error.message; }
  }
  const source = /\.ts$/.test(file) ? stripTypeScriptTypes(content) : content;
  fs.writeFileSync(target, source);
  let run = null;
  if (/\.m?js$/.test(target)) run = spawnSync(process.execPath, ["--check", target]);
  else if (/\.py$/.test(target)) run = spawnSync("python3", ["-m", "py_compile", target]);
  else if (/\.sh$/.test(target)) run = spawnSync("bash", ["-n", target]);
  if (!run) return "";
  if (run.error) return run.error.code === "ENOENT" ? "" : String(run.error);
  return run.status === 0 ? "" : String(run.stderr).split("\n").slice(0, 3).join(" ");
}

test.describe("watch scripts", () => {
  const pinned = { id: "RG-01", key: "sec-csp", title: "CSP is not sent", before: "risk", after: "pass", cases: ["SEC-03"], kind: "headers", tools: ["OWASP ZAP", "Nuclei"], data: { keys: ["sec-csp"] } };
  const caseRow = { id: "SEC-03", layer: "Security", title: "CSP is sent", why: "No CSP header was seen. The header is present.", fw: ["Playwright"], check: { kind: "headers", path: "/", rules: [{ name: "content-security-policy" }] } };
  const full = report(Object.assign(watchCases.build(ALL, EXTRAS, CTX), { regressions: [pinned] }), { cases: [caseRow], signature: { mark: "QA-lab URL Review · test" } });
  const files = watch.files(full, { lang: "es", scripts });
  const byPath = new Map(files.map((file) => [file.path, file.content]));

  test("every tool gets its files", () => {
    ["README.md", "dig/qa-lab-dns.sh", "curl/qa-lab-http.sh", "checkdmarc/check_mail.py", "zap/zap-baseline.sh", "zap/qa-lab-rules.tsv", "nuclei/nuclei.sh", "nuclei/qa-lab-exposed.yaml",
      "axe/qa-lab-axe.spec.js", "pa11y/.pa11yci.json", "pa11y/qa-lab-pa11y.js", "playwright/qa-lab-watch.spec.js", "regressions/qa-lab-fixed.spec.ts", ".github/workflows/qa-lab-watch.yml"].forEach((file) => assert.ok(byPath.has(file), file + " is missing"));
    files.forEach((file) => assert.ok(file.content.trim(), file.path + " is empty"));
    assert.ok(byPath.get("README.md").indexOf("Cómo ejecutarlos") !== -1, "the README follows the page language");
  });

  test("bash, JavaScript, TypeScript, Python, JSON and YAML files parse", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-review-watch-"));
    try {
      const broken = files.filter((file) => /\.(sh|m?js|ts|py|json|ya?ml)$/.test(file.path)).map((file) => ({ file: file.path, error: syntaxError(file.path, file.content, dir) })).filter((row) => row.error);
      assert.deepEqual(broken, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the DNS script asks every free blocklist about every address", () => {
    const dns = byPath.get("dig/qa-lab-dns.sh");
    blocklists.LISTS.forEach((list) => assert.ok(dns.indexOf("'" + list.zone + "'") !== -1, list.zone));
    ["'192.0.2.10'", "'198.51.100.7'", "examp1e.com yes no", "xn--exmple-cua.com no yes", "_dmarc.$DOMAIN"].forEach((part) => assert.ok(dns.indexOf(part) !== -1, part));
    ["healthy \"2.0.0.127.$zone\"", "healthy \"test.$zone\""].forEach((probe) => assert.ok(dns.indexOf(probe) !== -1, "a list that misses its RFC 5782 test point is never read: " + probe));
  });

  test("ZAP fails on the flagged rules and the owner gate guards ZAP and Nuclei", () => {
    const tsv = byPath.get("zap/qa-lab-rules.tsv");
    ["10038\tFAIL", "10035\tFAIL", "10010\tFAIL", "10011\tFAIL", "10054\tFAIL"].forEach((rule) => assert.ok(tsv.indexOf(rule) !== -1, rule));
    ["zap/zap-baseline.sh", "nuclei/nuclei.sh"].forEach((file) => assert.ok(byPath.get(file).indexOf("OWNER_APPROVED") !== -1, file));
    const flow = yaml.load(byPath.get(".github/workflows/qa-lab-watch.yml"));
    assert.deepEqual(Object.keys(flow.jobs).sort(), ["browser", "dns", "http", "mail", "nuclei", "pa11y", "zap"]);
    assert.equal(flow.jobs.zap.if, "vars.OWNER_APPROVED == 'yes'");
    assert.ok(flow.on.schedule[0].cron);
  });

  test("the pinned fix reruns its case in Playwright", () => {
    assert.ok(byPath.get("regressions/qa-lab-fixed.spec.ts").indexOf("SEC-03") !== -1);
    assert.ok(byPath.get("README.md").indexOf("RG-01") !== -1);
  });

  test("values a site could plant never reach a script", () => {
    const planted = report({
      host: HOST, base: BASE, domain: "example.com",
      cases: [
        { id: "WT-01", kind: "exposed", tools: ["curl"], data: { paths: ["/.env", "/x'$(touch /tmp/pwned)'", "/ok path"] } },
        { id: "WT-02", kind: "linked", tools: ["curl"], data: { hosts: [{ host: "a.example; rm -rf ~" }, { host: "good.example" }], pages: ["/"] } },
        { id: "WT-03", kind: "hacked", tools: ["curl"], data: { domain: "example.com", search: true, terms: ["casino", "x\"; rm -rf ~; \""], cloaking: ["/"], links: ["/"] } },
        { id: "WT-04", kind: "lookalike", tools: ["dig"], data: { rows: [{ domain: "evil.example\nrm -rf ~", web: true }, { domain: "examp1e.com", web: false }] } }
      ]
    });
    const all = watch.files(planted).map((file) => file.content).join("\n");
    ["touch /tmp/pwned", "rm -rf", "/ok path"].forEach((bad) => assert.ok(all.indexOf(bad) === -1, bad + " reached a script"));
    ["'/.env'", "good.example", "casino", "examp1e.com no no"].forEach((good) => assert.ok(all.indexOf(good) !== -1, good + " was dropped"));
  });
});
