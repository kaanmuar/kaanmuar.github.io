const test = require("node:test");
const assert = require("node:assert/strict");
const ask = require("../../js/qa-review-ask.js");
const auth = require("../../functions/url-review-auth");
const sample = require("../../assets/qa-review-sample.json").report;

const DESKTOP = "a".repeat(64);
const PHONE = "b".repeat(64);

function report(changes) {
  return Object.assign(JSON.parse(JSON.stringify(sample)), changes || {});
}

function words(result) {
  return result.parts.map((part) => part.text || (part.items || []).join("\n")).join("\n");
}

async function signedIn(store, email, deviceKey) {
  const started = await auth.startEmail(store, { email, deviceKey, ip: "1.1.1.1" });
  return auth.finishEmail(store, { id: started.id, code: started.code, deviceKey });
}

test("why a finding is rated as it is comes from its own evidence, rank and priority", () => {
  const result = ask.answer(report(), "Why is F-01 high?");
  assert.equal(result.intent, "why");
  assert.equal(result.ref, "F-01");
  const text = words(result);
  assert.match(text, /Fails now, rated medium in Security/);
  assert.match(text, /Its severity is medium, not high/);
  assert.match(text, /strict-transport-security was absent/);
  assert.match(text, /ranks 1 of \d+ fails and risks, with priority 61\.1/);
  assert.match(text, /reach \(10 pages\)/);
  assert.match(text, /Test cases: SEC-02/);
});

test("a case is explained with the finding that backs it", () => {
  const text = words(ask.answer(report(), "explain SEC-02"));
  assert.match(text, /SEC-02 is a Security case\. Fails now, rated medium/);
  assert.match(text, /backed by F-01, HSTS is not sent/);
});

test("the fix is written for the host the review saw, and GitHub Pages is not read as an export", () => {
  const result = ask.answer(report(), "Show me the fix for F-01 on GitHub Pages");
  assert.equal(result.intent, "fix");
  const text = words(result);
  assert.match(text, /served from GitHub Pages/);
  assert.match(text, /Technologies seen: Tailwind, Google Tag Manager/);
  assert.match(text, /GitHub Pages cannot send custom headers, but this review also saw Cloudflare in front of the site\. Add the header there with a Response Header Transform Rule/);
  const bare = report({ technologies: sample.technologies.filter((row) => !/cloudflare/i.test(row.name)) });
  assert.match(words(ask.answer(bare, "fix F-01")), /Put a CDN such as Cloudflare in front and set the header there/);
  const files = result.parts.filter((part) => part.kind === "code");
  assert.equal(files.length, 1);
  assert.equal(files[0].label, "netlify-or-cloudflare-pages/_headers");
  assert.match(files[0].text, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
});

test("each host gets its own header file, and an unknown host gets the common ones", () => {
  const onNginx = report();
  onNginx.insights.fixkit.hosting = "nginx";
  const nginx = ask.answer(onNginx, "fix F-01").parts.filter((part) => part.kind === "code");
  assert.deepEqual(nginx.map((part) => part.label), ["nginx.conf"]);
  assert.match(nginx[0].text, /add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);
  const unknown = report();
  unknown.insights.fixkit.hosting = "";
  const files = ask.answer(unknown, "fix F-01").parts.filter((part) => part.kind === "code");
  assert.equal(files.length, 3);
  assert.match(words(ask.answer(unknown, "fix F-01")), /could not tell the host/);
});

test("a DNS finding gets the record from the fix kit", () => {
  const caa = sample.insights.findings.find((item) => item.key === "sec-caa");
  const result = ask.answer(report(), "How do I fix " + caa.id + "?");
  const record = result.parts.find((part) => part.kind === "code");
  assert.equal(record.label, "DNS records");
  assert.match(record.text, /CAA\t0 issue "letsencrypt\.org"/);
});

test("the Playwright case for a case id is the report's own script in a runnable file", () => {
  const result = ask.answer(report(), "Write the Playwright case for SEC-02");
  assert.equal(result.intent, "playwright");
  const file = result.parts.find((part) => part.kind === "code");
  assert.equal(file.label, "sec-02.spec.ts");
  assert.match(file.text, /import \{ test, expect \} from "@playwright\/test";/);
  assert.match(file.text, /const BASE = "https:\/\/carlosandmunoz\.com";/);
  assert.match(file.text, /test\("SEC-02 · HSTS is set"/);
  assert.match(file.text, /expect\(headers\["strict-transport-security"\]\)\.toBeTruthy\(\);/);
});

test("AN-01 is written as a fixme the person fills in, and a load case says it has no Playwright", () => {
  const an = ask.answer(report(), "write the playwright case for AN-01");
  assert.match(an.parts.find((part) => part.kind === "code").text, /test\.fixme\("AN-01 · Analytics tags wait/);
  assert.match(words(an), /marked fixme/);
  assert.match(words(ask.answer(report(), "Playwright test for LD-01")), /LD-01 is written for JMeter, Gatling, k6, not Playwright/);
  const viaFinding = ask.answer(report(), "playwright test for F-01");
  assert.match(words(viaFinding), /F-01 is a finding\. Its test case is SEC-02/);
});

test("an export drafts the issue as Markdown, a Jira CSV row and a prefilled GitHub link", () => {
  const result = ask.answer(report(), "Export F-01 as a GitHub issue", { repo: "acme/web", reportUrl: "https://carlosandmunoz.com/qa-review.html?report=" + sample.id });
  assert.equal(result.intent, "export");
  assert.equal(result.issue.title, "[carlosandmunoz.com] F-01: HSTS is not sent");
  assert.match(result.issue.body, /\*\*Finding:\*\* F-01 · Security · Fails now · severity medium · priority 61\.1, rank 1/);
  assert.match(result.issue.body, /\*\*Report:\*\* https:\/\/carlosandmunoz\.com\/qa-review\.html\?report=/);
  assert.match(result.issue.body, /## Fix\n\nSend Strict-Transport-Security/);
  const [head, row] = result.issue.csv.trim().split("\n\"").map((line, index) => (index ? "\"" + line : line));
  assert.equal(head, "\"Summary\",\"Description\",\"Issue Type\",\"Priority\",\"Labels\"");
  assert.match(row, /^"\[carlosandmunoz\.com\] F-01: HSTS is not sent","\*\*Finding/);
  assert.match(result.issue.csv, /"Bug","Medium","qa-review"\n$/);
  const link = ask.githubIssueUrl("https://github.com/acme/web.git", result.issue);
  assert.ok(link.startsWith("https://github.com/acme/web/issues/new?title=%5Bcarlosandmunoz.com%5D%20F-01"));
  assert.equal(decodeURIComponent(link.split("&body=")[1]), result.issue.body);
  assert.match(words(result), /opens a new issue in acme\/web/);
  assert.equal(ask.githubIssueUrl("not a repo", result.issue), "");
  assert.equal(ask.githubIssueUrl("", result.issue), "");
});

test("anything outside the report is refused, and an id the report lacks is named", () => {
  const outside = ask.answer(report(), "What is the weather in Bogotá?");
  assert.equal(outside.intent, "outside");
  assert.match(words(outside), /I answer only from this report/);
  assert.ok(outside.suggest.length >= 3);
  const missing = ask.answer(report(), "Why is F-99 high?");
  assert.match(words(missing), /This report has no F-99\. Its findings run from F-01 to F-\d+/);
  const vague = ask.answer(report(), "why is this high?");
  assert.equal(vague.title, "Which one?");
  assert.deepEqual(vague.suggest.slice(0, 1), ["Why is F-01 rated this way?"]);
});

test("questions in the other page languages find their intent and finding", () => {
  assert.equal(ask.intentOf("¿Por qué es alto?"), "why");
  assert.equal(ask.intentOf("Warum ist das hoch?"), "why");
  assert.equal(ask.intentOf("Pourquoi c'est élevé ?"), "why");
  assert.equal(ask.intentOf("Perché è alto?"), "why");
  assert.equal(ask.intentOf("Como corrigir F-01?"), "fix");
  assert.equal(ask.intentOf("Wie behebe ich F-01?"), "fix");
  assert.equal(ask.intentOf("Exporta F-01 a Jira"), "export");
  assert.equal(ask.answer(report(), "¿Por qué HSTS es alto?").ref, "F-01");
  assert.deepEqual(ask.idsIn("a11y-4 and f-1"), ["A11Y-04", "F-01"]);
});

test("suggestions start from the top-ranked finding and its Playwright case", () => {
  assert.deepEqual(ask.suggestions(report()), [
    "Why is F-01 rated medium?",
    "Show me the fix for F-01 on GitHub Pages",
    "Write the Playwright case for SEC-02",
    "Export F-01 as a GitHub or Jira issue"
  ]);
});

test("a blurred preview is never answered", () => {
  const result = ask.answer(Object.assign(report(), { preview: true }), "Why is F-01 high?");
  assert.equal(result.intent, "closed");
});

test("ask access needs the signed-in account that ran the report, on its device, and a paid or free report", async () => {
  const store = auth.memoryStore();
  const ana = await signedIn(store, "ana@example.com", DESKTOP);
  const bo = await signedIn(store, "bo@example.com", PHONE);
  const row = { email: "ana@example.com", paid: true, report: { id: "r1" } };
  const proof = { session: ana.session, deviceKey: DESKTOP };

  assert.deepEqual(await auth.askAccess(store, proof, row, false), { ok: true, email: "ana@example.com" });

  const anonymous = await auth.askAccess(store, { deviceKey: DESKTOP }, row, false);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.signIn, true);

  const otherDevice = await auth.askAccess(store, { session: ana.session, deviceKey: PHONE }, row, false);
  assert.equal(otherDevice.status, 401);

  const stranger = await auth.askAccess(store, { session: bo.session, deviceKey: PHONE }, row, false);
  assert.equal(stranger.status, 403);
  assert.match(stranger.error, /Only the account that ran this report/);

  const unpaid = await auth.askAccess(store, proof, Object.assign({}, row, { paid: false }), false);
  assert.equal(unpaid.status, 402);
  assert.equal((await auth.askAccess(store, proof, Object.assign({}, row, { paid: false }), true)).ok, true);

  assert.equal((await auth.askAccess(store, proof, Object.assign({}, row, { report: { id: "r1", preview: true } }), false)).status, 404);
  assert.equal((await auth.askAccess(store, proof, null, false)).status, 404);
  assert.equal((await auth.askAccess(store, proof, Object.assign({}, row, { email: "" }), true)).status, 403);
});
