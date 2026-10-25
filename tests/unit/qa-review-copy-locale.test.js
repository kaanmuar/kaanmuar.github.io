const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Glossary = require("../../js/site-glossary.js");

const FILES = ["qa-review-report-copy", "qa-review-compare-copy", "qa-review-multi", "qa-review-pay-copy", "qa-review-findings-copy", "qa-review-account-copy"];
const LANGS = ["es", "pt", "de", "fr", "it"];
// The glossary fixes machine translation; these catch the regional forms a person writing by hand slips into.
const REGIONAL = {
  es: [/\bvosotros\b/i, /\bten[ée]is\b/i, /\bvuestr[oa]s?\b/i, /\bA[ñn]adir\b/i, /\bordenador/i],
  pt: [/\bguardad[oa]s?\b/i, /\bA guardar\b/, /\bA abrir\b/, /\bA preparar\b/, /\bdescarreg/i, /\bpartilh/i, /\bregist[oa]\b/i, /\bregistad[oa]\b/i,
    /\bpara si\b/i, /\bpor si\b/i, /\bInicie sessão\b/i, /\bdentro de momentos\b/i, /\becrã\b/i, /\btelemóve/i, /\bficheir/i, /\butilizador/i]
};

function copyOf(file) {
  const source = fs.readFileSync(path.join(__dirname, "../../js/" + file + ".js"), "utf8").replace("const book = ", "window.__COPY = COPY; const book = ");
  const sandbox = { window: {}, document: { documentElement: { lang: "en" }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} }, location: { search: "", pathname: "/" }, URLSearchParams };
  sandbox.window.addEventListener = () => {};
  vm.runInNewContext(source, sandbox);
  assert.ok(sandbox.window.__COPY, file + " has no COPY");
  return sandbox.window.__COPY;
}

function strings(node, prefix, out) {
  Object.keys(node).forEach((key) => {
    if (node[key] && typeof node[key] === "object") strings(node[key], prefix + key + ".", out);
    else out[prefix + key] = String(node[key]);
  });
  return out;
}

for (const file of FILES) {
  test(file + " is written in es-419 and pt-BR and follows the site glossary (#1274)", () => {
    const copy = copyOf(file);
    for (const lang of LANGS) {
      if (!copy[lang]) continue;
      for (const [key, text] of Object.entries(strings(copy[lang], "", {}))) {
        assert.deepEqual(Glossary.check(text, lang), [], file + " " + lang + "." + key + ": " + text);
        for (const pattern of REGIONAL[lang] || []) assert.ok(!pattern.test(text), file + " " + lang + "." + key + " matches " + pattern + ": " + text);
      }
    }
  });
}

test("the report copy has every English key, with the same slots, in each language (#1209)", () => {
  const copy = copyOf("qa-review-report-copy");
  const en = strings(copy.en, "", {});
  const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join(" ");
  for (const lang of LANGS) {
    const book = strings(copy[lang], "", {});
    for (const [key, text] of Object.entries(en)) {
      assert.ok(book[key] != null, lang + " is missing " + key);
      assert.equal(slots(book[key]), slots(text), lang + "." + key);
    }
  }
});

test("the findings copy has every English finding template, with the same slots, in each language (#1297)", () => {
  const { EN } = require("../../functions/url-review-findings-en.js");
  const copy = copyOf("qa-review-findings-copy");
  const slots = (text) => [...new Set(text.match(/\{\w+\}/g) || [])].sort().join(" ");
  for (const lang of LANGS) {
    const book = copy[lang];
    assert.ok(book, "no " + lang + " findings copy");
    for (const [key, text] of Object.entries(EN)) {
      assert.ok(book[key] != null, lang + " is missing " + key);
      assert.equal(slots(book[key]), slots(text), lang + "." + key);
    }
    for (const key of Object.keys(book)) assert.ok(key in EN, lang + " has " + key + ", which English does not");
  }
});

test("a finding message renders in the page language and falls back to the English line (#1297)", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-findings-copy.js"), "utf8");
  const load = (lang) => {
    const sandbox = { window: {}, document: { documentElement: { lang } } };
    vm.runInNewContext(source, sandbox);
    return sandbox.window.QAReviewFindingsCopy;
  };
  const { say, some, english } = require("../../functions/url-review-findings-en.js");
  const message = say("seo-broken-links.title", { n: 2 });
  const evidence = say("listDot", { list: some([say("pathNote", { path: "/a", note: "404" }), say("pathNote", { path: "/b", note: "500" })], 1) });
  assert.equal(load("es").line(message, "x"), "2 enlaces internos llevan a un error");
  assert.equal(load("de").line(say("seo-broken-links.title", { n: 1 }), "x"), "1 interner Link führt zu einem Fehler");
  assert.equal(load("pt").line(evidence, "x"), "/a (404) e mais 1.");
  assert.equal(load("en").line(message, english(message)), english(message));
  assert.equal(load("fr").line({ id: "no-such-line" }, "English"), "English");
  assert.equal(load("it").line(undefined, "English"), "English");
});

test("health warnings and Fix first read in the page language, also from a saved report's English (#1355)", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-findings-copy.js"), "utf8");
  const load = (lang) => {
    const sandbox = { window: {}, document: { documentElement: { lang } } };
    vm.runInNewContext(source, sandbox);
    return sandbox.window.QAReviewFindingsCopy;
  };
  const { EN, say, english } = require("../../functions/url-review-findings-en.js");
  const vars = {
    "warn.challenge": { check: say("botCheck.an", { vendor: "Akamai" }) },
    "warn.partial": { blocked: 4, linked: say("linkedPagesN", { n: 5 }) }
  };
  const sent = Object.keys(EN).filter((id) => id.startsWith("warn.")).map((id) => say(id, vars[id]));
  const englishText = sent.map(english).join(" ");
  const es = load("es");
  const fromMessages = es.warnings(sent, englishText);
  assert.equal(es.warnings([], englishText), fromMessages, "a saved report's English warnings read back to the same messages");
  assert.match(fromMessages, /^La protección antibots del sitio rechazó la solicitud normal;/);
  assert.match(fromMessages, /una verificación antibots de Akamai en lugar del sitio/);
  assert.match(fromMessages, /Análisis parcial: 4 de 5 páginas enlazadas respondieron/);
  assert.equal(es.warnings([], "A warning written by an older server."), null);
  assert.equal(load("en").warnings(sent, englishText), null);

  const finding = (id, vars) => ({ rank: 1, msg: { title: say(id, vars) } });
  assert.equal(es.fixFirst(finding("geo-h1-rendered.title")), "Arregla primero: el encabezado principal aparece solo después de JavaScript.");
  assert.equal(load("fr").fixFirst(finding("geo-h1-rendered.title")), "À corriger d’abord : le titre principal n’apparaît qu’après JavaScript.");
  assert.equal(load("de").fixFirst(finding("geo-h1-rendered.title")), "Zuerst beheben: Die Hauptüberschrift erscheint erst nach JavaScript.");
  assert.equal(es.fixFirst(finding("sec-safebrowsing.title", { threats: "phishing" })), "Arregla primero: Google marca el sitio como phishing.");
  assert.match(es.fixFirst(finding("an-consent-mode.missing.title", { tools: "Cookiebot" })), /^Arregla primero: Cookiebot está presente/);
  assert.equal(load("pt").fixFirst(finding("seo-title-missing.title", { n: 2 })), "Corrija primeiro: " + load("pt").line(say("seo-title-missing.title", { n: 2 }), "") + ".");
  assert.equal(es.fixFirst({ rank: 1, title: "English only" }), null);
  assert.equal(load("en").fixFirst(finding("geo-h1-rendered.title")), null);
});

// The sign-in copy lives inside qa-review-auth.js, which needs a page to run, so only its COPY object is read.
function authCopy() {
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-auth.js"), "utf8");
  const block = source.match(/const COPY = (\{[\s\S]*?\n  \});/);
  assert.ok(block, "qa-review-auth.js has no COPY");
  return vm.runInNewContext("(" + block[1] + ")");
}

test("the account page and sign-in copy have every English key, with the same slots, in es-419, pt-BR and the glossary (#1305 #1365)", () => {
  const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join(" ");
  for (const [name, copy] of [["account", copyOf("qa-review-account-copy")], ["sign-in", authCopy()]]) {
    const en = strings(copy.en, "", {});
    for (const lang of LANGS) {
      const book = strings(copy[lang], "", {});
      for (const [key, text] of Object.entries(en)) {
        assert.ok(book[key] != null, name + " " + lang + " is missing " + key);
        assert.equal(slots(book[key]), slots(text), name + " " + lang + "." + key);
      }
      for (const key of Object.keys(book)) assert.ok(key in en, name + " " + lang + " has " + key + ", which English does not");
      if (name !== "sign-in") continue;
      for (const [key, text] of Object.entries(book)) {
        assert.deepEqual(Glossary.check(text, lang), [], "sign-in " + lang + "." + key + ": " + text);
        for (const pattern of REGIONAL[lang] || []) assert.ok(!pattern.test(text), "sign-in " + lang + "." + key + " matches " + pattern + ": " + text);
      }
    }
  }
});

test("the account page paints the picked language and keeps machine translation off only for hand-written ones (#1305)", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-account-copy.js"), "utf8");
  const node = (key) => ({ attrs: {}, getAttribute: (name) => (name === "data-account-copy" ? key : null), setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; } });
  const title = node("savedTitle");
  const main = node(null);
  const sandbox = { window: {}, document: { title: "", querySelectorAll: (selector) => (selector === "[data-account-copy]" ? [title] : selector === "main, .topbar, .foot" ? [main] : []) } };
  vm.runInNewContext(source, sandbox);
  const copy = sandbox.window.QAAccountCopy;
  copy.use("de-CH");
  assert.equal(title.textContent, "Gespeicherte Prüfungen");
  assert.equal(sandbox.document.title, "Ihre Prüfungen · QA-lab URL Review");
  assert.deepEqual(main.attrs, { lang: "de", translate: "no" });
  assert.equal(copy.t("count", { n: 1 }), "1 Prüfung");
  assert.equal(copy.t("count", { n: 3 }), "3 Prüfungen");
  assert.equal(copy.area("Security"), "Sicherheit");
  copy.use("ja");
  assert.equal(copy.lang(), "en");
  assert.equal(title.textContent, "Saved reviews");
  assert.deepEqual(main.attrs, {}, "a language without hand-written copy is left to machine translation");
});
