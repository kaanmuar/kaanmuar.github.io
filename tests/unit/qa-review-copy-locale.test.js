const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Glossary = require("../../js/site-glossary.js");

const FILES = ["qa-review-report-copy", "qa-review-compare-copy", "qa-review-multi", "qa-review-benchmark", "qa-review-pay-copy", "qa-review-findings-copy", "qa-review-auth"];
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

test("every reason on the form has a label in each page language, and the form code writes no English of its own (#2802)", () => {
  const copy = copyOf("qa-review-report-copy");
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review.js"), "utf8");
  const ids = JSON.parse(source.match(/const REASONS = (\[[^\]]*\]);/)[1]);
  const server = require("../../functions/url-review-core.js").REASONS.filter((item) => item.id !== "compare");
  assert.deepEqual(ids, server.map((item) => item.id), "the form's reasons match the server's");
  for (const item of server) assert.equal(copy.en.reason[item.id], item.label, "en.reason." + item.id);
  for (const lang of LANGS) {
    for (const id of ids) {
      const text = copy[lang].reason[id];
      assert.ok(text && text !== copy.en.reason[id], lang + ".reason." + id + " is missing or still English");
    }
  }
  const body = (name) => {
    const start = source.indexOf("function " + name + "(");
    return source.slice(start, source.indexOf("\n  }\n", start));
  };
  for (const name of ["paintReasons", "syncSection", "scopeSummary", "clientErrors"]) {
    const english = body(name).match(/"[^"\n]*[A-Za-z]{2,} [a-z]{2,}[^"\n]*"|"[A-Z][^"\n]*\."/g);
    assert.equal(english, null, name + " writes English: " + english);
  }
  const errors = body("clientErrors");
  assert.equal(errors.match(/message: (?!say\()/g), null, "a form error does not read from the copy");
  for (const [, id] of errors.matchAll(/say\("(\w+)"\)/g)) assert.ok(copy.en.fieldError[id], "clientErrors reads fieldError." + id + ", which the copy lacks");
});

test("every field error the server sends reads in each page language (#2837)", () => {
  const copy = copyOf("qa-review-report-copy");
  const core = fs.readFileSync(path.join(__dirname, "../../functions/url-review-core.js"), "utf8");
  const sent = new Set();
  for (const name of ["validateIntake", "screenIntake", "preformatUrl", "normalizeUrl"]) {
    const start = core.search(new RegExp("function " + name + "\\("));
    const text = core.slice(start, core.indexOf("\n}\n", start));
    for (const [, message] of text.matchAll(/(?:fieldError\(errors, "\w+", (?:[\w.]+ \|\| )?|message: |new Error\()"([^"]+)"/g)) sent.add(message);
  }
  assert.ok(sent.size >= 20, "found only " + sent.size + " server field errors");
  const english = Object.values(copy.en.fieldError);
  for (const message of sent) assert.ok(english.includes(message), "the server's field error has no copy: " + message);
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-report-copy.js"), "utf8");
  for (const lang of LANGS) {
    for (const [id, text] of Object.entries(copy.en.fieldError)) {
      assert.ok(copy[lang].fieldError[id] && copy[lang].fieldError[id] !== text, lang + ".fieldError." + id + " is missing or still English");
    }
    const sandbox = { window: {}, document: { documentElement: { lang }, querySelectorAll: () => [] } };
    vm.runInNewContext(source, sandbox);
    const rc = sandbox.window.QAReviewReportCopy;
    for (const message of sent) assert.notEqual(rc.field(message), message, lang + " shows the server's English: " + message);
    assert.equal(rc.field("A sentence the copy does not know."), "A sentence the copy does not know.");
  }
});

test("the sample report's notice and the cover's cases line read in the page language, not in English (#2935)", () => {
  const review = fs.readFileSync(path.join(__dirname, "../../js/qa-review.js"), "utf8");
  const start = review.indexOf('const sampleNote = document.getElementById("sample-note")');
  const notice = review.slice(start, review.indexOf("dash.classList.add(\"open\")", start));
  assert.ok(start > 0 && notice.includes('rc.t("sampleNote"') && notice.includes('rc.t("sampleNoteUndated"'), "the sample notice does not read from the report copy");
  assert.equal(notice.match(/"[^"\n]*[A-Za-z]{2,} [a-z]{2,}[^"\n]*"/g), null, "the sample notice writes English");
  const cover = review.slice(review.indexOf('slot("report-cover").innerHTML'), review.indexOf('if (!slotRoot) document.getElementById("print-mark")'));
  assert.ok(!cover.includes("report.statement"), "the cover prints the report's English statement");
  assert.ok(cover.includes('"coverStatementStopped"') && cover.includes('"coverStatement"'), "the cover does not read its cases line from the report copy");

  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-report-copy.js"), "utf8");
  const load = (lang) => {
    const sandbox = { window: {}, document: { documentElement: { lang }, querySelectorAll: () => [] } };
    vm.runInNewContext(source, sandbox);
    return sandbox.window.QAReviewReportCopy;
  };
  const vars = { host: "automationexercise.com", date: "2 nov 2026" };
  const keys = ["sampleNote", "sampleNoteUndated", "coverStatement", "coverStatementStopped"];
  const en = load("en");
  assert.match(en.t("sampleNote", vars), /^Sample report\. This is the review of automationexercise\.com from 2 nov 2026, /);
  assert.equal(en.t("coverStatement"), "These cases are proposed from a public analysis. None of them were executed.");
  for (const lang of LANGS) {
    const rc = load(lang);
    for (const key of keys) {
      const text = rc.t(key, vars);
      assert.notEqual(text, en.t(key, vars), lang + "." + key + " is still English");
      assert.ok(!/\b(Sample report|the review of|None of them|was stopped|blurred|disclaimers)\b/.test(text), lang + "." + key + " reads English: " + text);
      assert.ok(!/\{\w+\}/.test(text), lang + "." + key + " leaves a slot unfilled: " + text);
    }
    assert.ok(rc.t("sampleNote", vars).includes("automationexercise.com") && rc.t("sampleNote", vars).includes("2 nov 2026"), lang + ".sampleNote drops the host or the date");
  }
  assert.match(load("es").t("sampleNote", vars), /Ciérralo .* tu propia dirección\.$/, "es speaks to the reader as tú (#2909)");
  assert.match(load("it").t("sampleNote", vars), /Chiudilo .* del tuo indirizzo\.$/, "it speaks to the reader as tu (#2909)");
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

test("each review page loads only its own findings dictionary, which renders like the full copy (#1769)", () => {
  const { EN, say } = require("../../functions/url-review-findings-en.js");
  const run = (file, lang) => {
    const sandbox = { window: {}, document: { documentElement: { lang } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../js/" + file), "utf8"), sandbox);
    return sandbox.window.QAReviewFindingsCopy;
  };
  for (const lang of ["en", ...LANGS]) {
    const page = fs.readFileSync(path.join(__dirname, "../../qa-review" + (lang === "en" ? "" : "-" + lang) + ".html"), "utf8");
    assert.deepEqual(page.match(/js\/qa-review-findings-copy[^"?]*/g), ["js/qa-review-findings-copy." + lang + ".js"], "qa-review " + lang);
    const full = run("qa-review-findings-copy.js", lang);
    const one = run("qa-review-findings-copy." + lang + ".js", lang);
    assert.equal(one.translated, full.translated, lang);
    for (const id of Object.keys(EN)) assert.equal(one.line(say(id, { n: 2 }), "x"), full.line(say(id, { n: 2 }), "x"), lang + " " + id);
  }
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
