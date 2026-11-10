const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../js/qa-review-vs.js"), "utf8"), {
    window, document: { getElementById: () => null }, location: { search: "" }, navigator: { language: "en" }, localStorage: { getItem: () => null }, URLSearchParams
  });
  return window.QAReviewVs;
}

test("every tool has a mark for every check, and every language has every label and tool text", () => {
  const vs = load();
  assert.deepEqual(Array.from(vs.LANGS), ["en", "es", "pt", "de", "fr", "it"]);
  vs.TOOLS.forEach((tool) => {
    assert.match(tool.marks, new RegExp("^[ypn]{" + vs.ROWS.length + "}$"), tool.id);
    if (tool.id !== "us") assert.ok(tool.sources.length && tool.sources.every((url) => url.startsWith("https://")), tool.id);
  });
  vs.LANGS.forEach((lang) => {
    const book = vs.COPY[lang];
    ["title", "intro", "glance", "caption", "check", "details", "price", "sources", "ours", "note", "cta", "lang"].forEach((key) => assert.ok(book[key], lang + " " + key));
    vs.ROWS.forEach((row) => assert.ok(book.rows[row], lang + " " + row));
    ["y", "p", "n"].forEach((code) => assert.ok(book.marks[code], lang + " " + code));
    vs.TOOLS.forEach((tool) => ["kind", "summary", "price"].forEach((key) => assert.ok(book.tools[tool.id][key], lang + " " + tool.id + " " + key)));
  });
});

test("our own row claims only what is live: the WordPress check waits on the stored feed", () => {
  const vs = load();
  const us = vs.TOOLS.find((tool) => tool.id === "us");
  assert.equal(us.marks[vs.ROWS.indexOf("wordpress")], "p");
  vs.LANGS.forEach((lang) => {
    const text = vs.COPY[lang].tools.us.summary + vs.COPY[lang].tools.us.price;
    assert.doesNotMatch(text, /PhishStats|URLhaus|Stripe/, lang);
    assert.match(text, /48/, lang);
  });
});

test("the language comes from the address, then the saved choice, then the browser, and falls back to English", () => {
  const window = {};
  const run = (search, saved, language) => {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../js/qa-review-vs.js"), "utf8"), {
      window, document: { getElementById: () => null }, location: { search }, navigator: { language }, localStorage: { getItem: () => saved }, URLSearchParams
    });
    return window.QAReviewVs.pickLang();
  };
  assert.equal(run("?lang=de", "fr", "it-IT"), "de");
  assert.equal(run("", "fr", "it-IT"), "fr");
  assert.equal(run("", null, "pt-BR"), "pt");
  assert.equal(run("?lang=ja", "zh", "ja-JP"), "en");
});
