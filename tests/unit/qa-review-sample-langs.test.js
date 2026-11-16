const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Glossary = require("../../js/site-glossary.js");
const build = require("../../scripts/build-sample-langs.js");

const root = path.join(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const english = JSON.parse(read(build.SOURCE));
const sample = (lang) => JSON.parse(read(build.outFile(lang)));

// What a translation keeps exactly as the English has it: numbers, URLs, header names, axe rules.
const kept = (text) => {
  const urls = (text.match(/https?:\/\/[^\s,)"]+/g) || []).map((url) => url.replace(/\.$/, ""));
  const numbers = text.replace(/https?:\/\/\S+/g, " ").match(/(?<![\p{L}\d.])\d+(?:\.\d+)*/gu) || [];
  const headers = text.match(/\b[a-z]+(?:-[a-z]+){2,}\b/g) || [];
  return { urls: urls.sort(), numbers: numbers.sort(), headers: headers.sort() };
};
const sentenceCount = (text) => (text.match(/\.\s/g) || []).length;
// Page titles, link labels and descriptions are the site's own words and stay quoted as they are.
const ownWords = (text) => text.replace(/"[^"]*"|“[^”]*”|https?:\/\/\S+/g, " ");
const ENGLISH = /\b(the|were|would|which|should|could|with|this|that|there)\b/i;

function fields(report) {
  const out = [];
  build.eachSentence(report, (node, key) => out.push([node, key]));
  return out;
}

test("each page language has a fresh sample file built from the English one (#2937)", () => {
  const { files, problems } = build.build();
  assert.deepEqual(problems, [], "a dictionary misses a sentence of the sample or has one it no longer uses");
  for (const [file, want] of Object.entries(files)) assert.equal(read(file), want, file + " is stale: run node scripts/build-sample-langs.js");
  const review = read("js/qa-review.js");
  const langs = JSON.parse(review.match(/const SAMPLE_LANGS = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(langs, build.LANGS, "the page loads a sample language the build does not write, or skips one it writes");
});

for (const lang of build.LANGS) {
  test(lang + " sample has the English structure, ids and numbers, and its sentences read in " + lang + " (#2937)", () => {
    const local = sample(lang);
    const theirs = fields(local.report);
    const ours = fields(english.report);
    assert.equal(theirs.length, ours.length, "the translated sample has a different set of sentences");
    const restored = JSON.parse(JSON.stringify(local));
    fields(restored.report).forEach(([node, key], index) => { node[key] = ours[index][0][ours[index][1]]; });
    assert.deepStrictEqual(restored, english, "outside its sentences, the " + lang + " sample differs from the English one");

    theirs.forEach(([node, key], index) => {
      const en = ours[index][0][ours[index][1]];
      const text = node[key];
      const where = lang + " " + key + ": " + text;
      assert.notEqual(text, en, "still English: " + en);
      assert.deepEqual(kept(text), kept(en), "a number, URL or header name changed in " + where);
      assert.equal(sentenceCount(text), sentenceCount(en), "the sentence count changed, so the sample case splits its step wrongly: " + where);
      assert.ok(!ENGLISH.test(ownWords(text)), "reads English: " + where);
      assert.deepEqual(Glossary.check(text, lang), [], where);
      const rule = /breaking ([a-z0-9-]+) \(/.exec(en);
      if (rule) assert.ok(text.includes(rule[1]), "drops the axe rule " + rule[1] + ": " + where);
      (ours[index][0].selectors || []).filter((selector) => en.includes(selector)).forEach((selector) => assert.ok(text.includes(selector), "drops the selector " + selector + ": " + where));
    });
  });
}

test("a translated AXE case still builds a script for its rule (#2937)", () => {
  const scripts = require("../../js/qa-review-scripts.js");
  for (const lang of build.LANGS) {
    const report = sample(lang).report;
    const item = report.cases.find((one) => /^AXE-\d+$/.test(one.id));
    const code = scripts.snippets(report, item, ["Playwright"]).map((one) => one.code).join("\n");
    assert.match(code, /link-name/, lang + " AXE case lost its rule");
  }
});

test("the sample's case, signal and page notes come from the report copy, never English in the code (#2937)", () => {
  const review = read("js/qa-review.js");
  const body = (start, end) => {
    const from = review.indexOf(start);
    assert.ok(from > 0, "no " + start);
    return review.slice(from, end ? review.indexOf(end, from) : review.indexOf("\n  }\n", from));
  };
  const parts = {
    paintAlarm: body("function paintAlarm("),
    paintMentions: body("function paintMentions("),
    paintFacts: body("function paintFacts("),
    verdictBadge: body("function verdictBadge("),
    openSample: body("async function openSample("),
    cases: body("const urgent = [\"P1\", \"P2\"]", "const link = location.origin")
  };
  for (const [name, code] of Object.entries(parts)) {
    const literals = code.match(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g) || [];
    const english = literals.filter((literal) => /[A-Za-z]{2,} [a-z]{2,}/.test(literal));
    const prose = english.filter((literal) => !/^["']\s*<|class=|style=|href=|rel=|target=|title=|colspan=/.test(literal) && !/^["'][a-z-]+ [a-z-]+["']$/.test(literal));
    assert.deepEqual(prose, [], name + " writes English");
  }

  const source = read("js/qa-review-report-copy.js");
  const load = (lang) => {
    const sandbox = { window: {}, document: { documentElement: { lang }, querySelectorAll: () => [] } };
    vm.runInNewContext(source, sandbox);
    return sandbox.window.QAReviewReportCopy;
  };
  const vars = { n: 86, count: "64", host: "HOST_SLOT", p1: 9, p2: 15, list: "LIST_SLOT", more: 3, risk: 100, read: 20, max: 20, depth: 2, lang: "en", section: "/x", h1: 3, forms: 1, images: 44, noAlt: 0, scripts: 11, bytes: 52348 };
  const keys = ["caseNote", "caseNotePaid", "caseRanked", "casesNone", "casePagesMore", "specialistTools", "alarmNote", "alarmNoteOpen", "mentionsNone",
    "observedNoTitle", "observedNoDescription", "observedLine", "askedOwn", "askedLang", "askedSection", "observedTimedOut", "pagesFound", "pagesFoundRead",
    "pagesFoundReadCap", "sampleOpenFailed", "factsNoLayers", "factsNoTech", "factsNoPages", "factsNoLog"];
  const en = load("en");
  assert.match(en.t("caseNote", vars), /^86 cases were identified /);
  assert.equal(en.t("caseNote", Object.assign({}, vars, { n: 1 })).indexOf("1 case was identified"), 0);
  for (const lang of build.LANGS) {
    const rc = load(lang);
    for (const key of keys) {
      const text = rc.t(key, vars);
      assert.notEqual(text, en.t(key, vars), lang + "." + key + " is still English");
      assert.ok(!ENGLISH.test(text) && !/\b(cases|identified|blurred|signals stay|pages were)\b/.test(text.replace(/\{email\}/, "")), lang + "." + key + " reads English: " + text);
      assert.ok(!/\{(?!email\})\w+\}/.test(text), lang + "." + key + " leaves a slot unfilled: " + text);
    }
    for (const [group, words] of [["severity", ["critical", "high", "medium", "low"]], ["alertLevel", ["Exposure", "Leak"]], ["mentionTone", ["Mention", "Unfavorable"]]]) {
      for (const word of words) assert.notEqual(rc.word(group, word), word, lang + "." + group + "." + word + " is still English");
    }
    assert.match(rc.t("observedTimedOut", vars), /\{email\}/, lang + ".observedTimedOut drops the address");
  }
  assert.match(load("es").t("observedTimedOut", vars), /escribe a \{email\}/, "es speaks to the reader as tú (#2909)");
  assert.match(load("it").t("observedTimedOut", vars), /scrivi a \{email\}/, "it speaks to the reader as tu (#2909)");
});
