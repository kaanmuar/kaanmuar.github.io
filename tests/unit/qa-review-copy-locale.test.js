const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Glossary = require("../../js/site-glossary.js");

const FILES = ["qa-review-report-copy", "qa-review-compare-copy", "qa-review-multi", "qa-review-pay-copy", "qa-review-findings-copy"];
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
