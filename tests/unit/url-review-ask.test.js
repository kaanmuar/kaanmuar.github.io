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
  const files = result.parts.filter((part) => part.kind === "code");
  assert.equal(files.length, 1);
  assert.equal(files[0].label, "Cloudflare Transform Rule");
  assert.match(files[0].text, /Response Header Transform Rule/);
  assert.match(files[0].text, /Header name: Strict-Transport-Security\nValue: max-age=31536000; includeSubDomains/);
  assert.doesNotMatch(files[0].text, /^\/\*/m);
  const bare = report({ technologies: sample.technologies.filter((row) => !/cloudflare/i.test(row.name)) });
  const direct = ask.answer(bare, "fix F-01");
  assert.match(words(direct), /Put a CDN such as Cloudflare in front and set the header there/);
  assert.deepEqual(direct.parts.filter((part) => part.kind === "code").map((part) => part.label), ["netlify-or-cloudflare-pages/_headers"]);
});

test("the frame fix sends CSP frame-ancestors and X-Frame-Options, on every host", () => {
  const proxied = ask.answer(report(), "Show me the fix for F-02 on GitHub Pages");
  const rule = proxied.parts.filter((part) => part.kind === "code");
  assert.deepEqual(rule.map((part) => part.label), ["Cloudflare Transform Rule"]);
  assert.match(rule[0].text, /Header name: Content-Security-Policy\nValue: frame-ancestors 'self'\n\nHeader name: X-Frame-Options\nValue: SAMEORIGIN/);
  const onNginx = report();
  onNginx.insights.fixkit.hosting = "nginx";
  const nginx = ask.answer(onNginx, "fix F-02").parts.find((part) => part.kind === "code").text;
  assert.match(nginx, /add_header Content-Security-Policy "frame-ancestors 'self'" always;/);
  assert.match(nginx, /add_header X-Frame-Options "SAMEORIGIN" always;/);
  assert.doesNotMatch(nginx, /Report-Only/);
  const deny = report();
  deny.insights.fixkit.csp = "default-src 'self'";
  deny.insights.fixkit.headers = deny.insights.fixkit.headers.map((row) => (row.name === "X-Frame-Options" ? Object.assign({}, row, { value: "DENY" }) : row));
  assert.match(ask.answer(deny, "fix F-02").parts.find((part) => part.kind === "code").text, /Value: frame-ancestors 'none'\n\nHeader name: X-Frame-Options\nValue: DENY/);
  Object.keys(ask.T).forEach((lang) => {
    const asked = ask.suggestions(report(), lang)[1].replace("F-01", "F-02");
    assert.deepEqual(ask.answer(report(), asked, { lang }).parts.filter((part) => part.kind === "code"), rule, lang);
  });
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

test("a case left to a person gets real steps in its fixme, with the trackers this report saw", () => {
  const an = ask.answer(report(), "write the playwright case for AN-01").parts.find((part) => part.kind === "code").text;
  assert.match(an, /\/\/ An analytics marker was seen/);
  assert.match(an, /Fill in any TODO, then change test\.fixme to test\./);
  assert.match(an, /const TRACKERS = \["googletagmanager\.com","google-analytics\.com","analytics\.google\.com"\];/);
  assert.match(an, /page\.on\("request"/);
  assert.match(an, /expect\(await stored\(\), "analytics cookies before a choice"\)\.toEqual\(\[\]\);/);
  assert.match(an, /await page\.locator\(ACCEPT\)\.click\(\);/);
  assert.doesNotMatch(an, /A person runs this case/);
  const noScript = ask.answer(report(), "playwright case for CMP-01").parts.find((part) => part.kind === "code").text;
  assert.match(noScript, /test\.fixme\("CMP-01 · [^"]+", async \(\{ browser \}\) => \{/);
  assert.match(noScript, /javaScriptEnabled: false/);
  assert.match(ask.answer(report(), "playwright case for A11Y-03").parts.find((part) => part.kind === "code").text, /skips a level/);
  const generic = ask.answer(report(), "playwright case for SEO-01").parts.find((part) => part.kind === "code").text;
  assert.match(generic, /await page\.goto\(BASE \+ "\/"\);/);
  assert.match(generic, /test-results\/seo-01\.png/);
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

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const PAGES = { en: "qa-review.html", es: "qa-review-es.html", pt: "qa-review-pt.html", de: "qa-review-de.html", fr: "qa-review-fr.html", it: "qa-review-it.html" };

function slots(value) {
  return (String(value).match(/\{\w+\}/g) || []).sort().join(" ");
}

test("every panel key exists in all six languages, with the same placeholders, and none is left in English", () => {
  const keys = Object.keys(ask.T.en);
  LANGS.forEach((lang) => {
    const book = ask.T[lang];
    assert.ok(book, lang);
    assert.deepEqual(Object.keys(book).sort(), keys.slice().sort(), lang);
    keys.forEach((key) => {
      if (typeof ask.T.en[key] === "object") {
        assert.deepEqual(Object.keys(book[key]).sort(), Object.keys(ask.T.en[key]).sort(), lang + "." + key);
        Object.keys(ask.T.en[key]).forEach((sub) => assert.ok(String(book[key][sub]).trim(), lang + "." + key + "." + sub));
        return;
      }
      assert.ok(String(book[key]).trim(), lang + "." + key);
      assert.equal(slots(book[key]), slots(ask.T.en[key]), lang + "." + key);
      const cognate = lang === "fr" && (key === "pageOne" || key === "pageMany");
      if (lang !== "en" && !cognate) assert.notEqual(book[key], ask.T.en[key], lang + "." + key + " is still English");
    });
  });
});

test("each review page carries the panel copy in its own language, marked so the page translator leaves it alone", () => {
  const fs = require("fs");
  const path = require("path");
  LANGS.forEach((lang) => {
    const html = fs.readFileSync(path.join(__dirname, "../..", PAGES[lang]), "utf8");
    const book = ask.T[lang];
    const panel = html.match(/<aside class="ask-panel[^>]*>[\s\S]*?<\/aside>/)[0];
    const opener = html.match(/<button[^>]*id="ask-open"[^>]*>([^<]*)<\/button>/);
    const mark = lang === "en" ? null : 'lang="' + lang + '" translate="no"';
    assert.equal(opener[1], book.open, lang);
    if (mark) {
      assert.ok(opener[0].includes(mark), lang + " button");
      assert.ok(panel.split(">")[0].includes(mark), lang + " panel");
    } else {
      assert.ok(!/translate="no"/.test(opener[0]) && !/translate="no"/.test(panel.split(">")[0]), "English stays translatable");
    }
    const shown = [...panel.matchAll(/data-ask-text="(\w+)">([^<]*)</g)].map((match) => [match[1], match[2].replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&amp;/g, "&")]);
    assert.deepEqual(shown.map(([key]) => key).sort(), ["close", "inputLabel", "note", "open", "repo", "send", "title"], lang);
    shown.forEach(([key, value]) => assert.equal(value, book[key], lang + "." + key));
    assert.ok(panel.includes('placeholder="' + book.placeholder.replace(/"/g, "&quot;") + '"'), lang + " placeholder");
  });
});

test("every suggestion in every language is understood as the question it offers", () => {
  const expected = ["why", "fix", "playwright", "export"];
  const refs = ["F-01", "F-01", "SEC-02", "F-01"];
  LANGS.forEach((lang) => {
    const asks = ask.suggestions(report(), lang);
    assert.equal(asks.length, 4, lang);
    asks.forEach((question, index) => {
      const result = ask.answer(report(), question, { lang });
      assert.equal(result.intent, expected[index], lang + ": " + question);
      assert.equal(result.ref, refs[index], lang + ": " + question);
    });
    ask.answer(report(), ask.T[lang].askWhy.replace("{id}", "F-02"), { lang }).suggest.forEach((question, index) => {
      const result = ask.answer(report(), question, { lang });
      assert.deepEqual([result.intent, result.ref], [["fix", "F-02"], ["playwright", "SEC-04"], ["export", "F-02"]][index], lang + ": " + question);
    });
    ["why", "fix", "playwright", "export"].forEach((intent) => {
      const picked = ask.answer(report(), { why: "why is this high?", fix: "show me the fix", playwright: "write a playwright test", export: "export to jira" }[intent], { lang });
      picked.suggest.forEach((question) => assert.equal(ask.answer(report(), question, { lang }).intent, intent, lang + ": " + question));
    });
  });
});

test("answers keep code, ids and report data as they are, and write the fixed sentences in the page language", () => {
  const es = ask.answer(report(), "Muéstrame la corrección de F-01 en GitHub Pages", { lang: "es" });
  const en = ask.answer(report(), "Show me the fix for F-01 on GitHub Pages", { lang: "en" });
  assert.equal(es.title, "Corrección de F-01 · HSTS is not sent");
  assert.match(words(es), /Esta revisión vio el sitio servido desde GitHub Pages\./);
  assert.match(words(es), /Corrección: Send Strict-Transport-Security/);
  assert.deepEqual(es.parts.filter((part) => part.kind === "code"), en.parts.filter((part) => part.kind === "code"));
  const de = ask.answer(report(), "Warum ist F-01 hoch?", { lang: "de" });
  assert.match(words(de), /^Schlägt jetzt fehl, Schweregrad mittel im Bereich Security\./);
  assert.match(words(de), /Der Schweregrad ist mittel, nicht hoch\./);
  assert.match(words(de), /Er steht auf Platz 1 von \d+ Fehlern und Risiken, mit Priorität 61\.1\..*\(10 Seiten\).*\(Minuten\)/);
  const fr = ask.answer(report(), "Écrivez le cas Playwright pour SEC-02", { lang: "fr" });
  assert.equal(fr.title, "Cas Playwright pour SEC-02");
  assert.deepEqual(fr.parts.find((part) => part.kind === "code"), ask.answer(report(), "Write the Playwright case for SEC-02").parts.find((part) => part.kind === "code"));
  const it = ask.answer(report(), "Esporta F-01 come issue GitHub o Jira", { lang: "it" });
  assert.equal(it.issue.body, ask.answer(report(), "Export F-01 as a GitHub issue").issue.body);
  assert.match(words(ask.answer(report(), "Qual é o tempo hoje?", { lang: "pt" })), /^Respondo só a partir deste relatório/);
  assert.match(words(ask.answer(report(), "Pourquoi F-99 ?", { lang: "fr" })), /^Ce rapport n’a pas de F-99\. Ses constats vont de F-01 à F-\d+\./);
  assert.equal(ask.answer(report(), "why F-01", { lang: "ja" }).parts[0].text, ask.answer(report(), "why F-01").parts[0].text);
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
  assert.equal(anonymous.code, "sign-in");
  assert.doesNotMatch(anonymous.error, /run a review/);

  const otherDevice = await auth.askAccess(store, { session: ana.session, deviceKey: PHONE }, row, false);
  assert.equal(otherDevice.status, 401);
  assert.equal(otherDevice.code, "sign-in");

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
