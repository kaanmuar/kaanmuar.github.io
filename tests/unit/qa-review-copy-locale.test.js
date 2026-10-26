const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Glossary = require("../../js/site-glossary.js");

const FILES = ["qa-review-report-copy", "qa-review-compare-copy", "qa-review-multi", "qa-review-benchmark", "qa-review-pay-copy", "qa-review-findings-copy"];
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

test("the scripts ZIP README copy has every English key and slot, follows the glossary and the regional forms (#1401)", () => {
  const book = require("../../js/qa-review-scripts.js").README_COPY;
  const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join(",");
  const en = strings(book.en, "", {});
  for (const lang of LANGS) {
    const all = strings(book[lang], "", {});
    for (const [key, text] of Object.entries(en)) {
      assert.ok(key in all, "README_COPY " + lang + " is missing " + key);
      assert.equal(slots(all[key]), slots(text), "README_COPY " + lang + "." + key + " slots");
    }
    for (const [key, text] of Object.entries(all)) {
      assert.deepEqual(Glossary.check(text, lang), [], "README_COPY " + lang + "." + key + ": " + text);
      for (const pattern of REGIONAL[lang] || []) assert.ok(!pattern.test(text), "README_COPY " + lang + "." + key + " matches " + pattern + ": " + text);
    }
  }
});

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

test("axe-core titles keep axe's English and read in the page language (#1589)", () => {
  const { EN } = require("../../functions/url-review-findings-en.js");
  assert.equal(EN["ax-title.button-name"], "Buttons must have discernible text");
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-findings-copy.js"), "utf8");
  const sandbox = { window: {}, document: { documentElement: { lang: "es" } } };
  vm.runInNewContext(source, sandbox);
  assert.equal(sandbox.window.QAReviewFindingsCopy.line({ id: "ax-title.button-name" }, "x"), "Los botones deben tener un texto reconocible");
});

test("the comparison visuals have no English left in the report renderer (#1588)", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review.js"), "utf8");
  const body = source.slice(source.indexOf("function paintVisuals"), source.indexOf("const cc = window.QAReviewCompareCopy"));
  for (const english of ["Practices worth implementing", "Response time across", "Public marks", "Technology groups", "proposed cases", '"Present"', '"Missing"', "Send HSTS"]) {
    assert.ok(!body.includes(english), "paintVisuals still writes " + english);
  }
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
