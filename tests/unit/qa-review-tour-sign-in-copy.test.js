const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const LANGS = ["es", "pt", "de", "fr", "it"];
const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const slots = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(",");

function copyOf(file) {
  const source = read(file).replace("const book = ", "window.__COPY = COPY; const book = ");
  const sandbox = { window: {}, document: { documentElement: { lang: "en" }, querySelectorAll: () => [], getElementById: () => null }, location: { search: "", pathname: "/" } };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.__COPY;
}

test("the review tour has every step and button in each page language, with the same slots (#2768)", () => {
  const copy = copyOf("js/qa-review-report-copy.js");
  const en = copy.en.tour;
  for (const lang of LANGS) {
    const own = copy[lang].tour;
    assert.deepEqual(Object.keys(own).sort(), Object.keys(en).sort(), lang + " tour keys");
    for (const [key, text] of Object.entries(en)) {
      if (Array.isArray(text)) {
        assert.equal(own[key].length, 2, lang + ".tour." + key + " is a title and a body");
        own[key].forEach((part) => assert.ok(part.trim(), lang + ".tour." + key + " is empty"));
      } else assert.equal(slots(own[key]), slots(text), lang + ".tour." + key + " slots");
      assert.doesNotMatch(JSON.stringify(own[key]), /[<>&]/, lang + ".tour." + key);
    }
  }
  assert.doesNotMatch(JSON.stringify(en), /\b(read|reads)\b/, "a review analyzes pages, it does not read them");
});

test("the tour steps in qa-review.js all come from the copy book (#2768)", () => {
  const source = read("js/qa-review.js");
  const body = source.slice(source.indexOf("function reviewTour()"), source.indexOf("function bootLanguageAndTour()"));
  const used = [...body.matchAll(/step\("[^"]+", "(\w+)"/g)].map((match) => match[1]);
  const steps = Object.keys(copyOf("js/qa-review-report-copy.js").en.tour).filter((key) => !["back", "close", "next", "finish", "step", "progress", "wait"].includes(key));
  assert.deepEqual(used.slice().sort(), steps.slice().sort());
  assert.doesNotMatch(body, /title: "|body: "/);
});

test("the sign-in box has every message in each page language, with the same slots (#2768)", () => {
  const copy = copyOf("js/qa-review-auth.js");
  const flat = (node, prefix, out) => {
    Object.keys(node).forEach((key) => (typeof node[key] === "object" ? flat(node[key], prefix + key + ".", out) : (out[prefix + key] = node[key])));
    return out;
  };
  const en = flat(copy.en, "", {});
  for (const lang of LANGS) {
    const own = flat(copy[lang], "", {});
    assert.deepEqual(Object.keys(own).sort(), Object.keys(en).sort(), lang + " sign-in keys");
    for (const [key, text] of Object.entries(en)) assert.equal(slots(own[key]), slots(text), lang + "." + key + " slots");
  }
});

test("each server sentence the sign-in box translates is still sent by the server (#2768)", () => {
  const server = ["functions/url-review-auth.js", "functions/url-review-oauth.js", "functions/url-review-core.js", "functions/index.js"].map(read).join("\n");
  for (const [key, text] of Object.entries(copyOf("js/qa-review-auth.js").en.server)) {
    for (const part of text.split("{name}").map((piece) => piece.trim()).filter(Boolean)) {
      assert.ok(server.includes(part), "server." + key + " is no longer sent: " + part);
    }
  }
});
