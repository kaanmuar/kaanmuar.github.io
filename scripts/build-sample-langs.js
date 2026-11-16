#!/usr/bin/env node
/* assets/qa-review-sample.json is the English sample report (scripts/review-snapshot.js --sample). From it and the
   hand-written dictionaries in scripts/qa-review-sample-copy/<lang>.json this writes assets/qa-review-sample.<lang>.json,
   the sample each review page opens in its own language. Only the sentences the server writes in English are swapped;
   ids, numbers, URLs, selectors, header names, page titles and every other field stay as they are.
   A dictionary maps each English sentence to its translation. A sentence it lacks, or one the sample no longer has,
   fails the build, so a regenerated sample cannot ship half in English. --check fails when an output file is stale. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SOURCE = "assets/qa-review-sample.json";
const LANGS = ["es", "pt", "de", "fr", "it"];

const copyFile = (lang) => `scripts/qa-review-sample-copy/${lang}.json`;
const outFile = (lang) => `assets/qa-review-sample.${lang}.json`;

// Each place in the report that holds a server sentence. A case with a findings message (msg) is translated by the
// page's findings copy instead, so its English text stays.
function eachSentence(report, visit) {
  (report.cases || []).forEach((item) => {
    ["title", "why"].forEach((part) => {
      if (!(item.msg && item.msg[part]) && item[part]) visit(item, part);
    });
  });
  (report.alerts || []).forEach((item) => ["title", "detail"].forEach((part) => item[part] && visit(item, part)));
  (report.tools || []).forEach((item) => item.why && visit(item, "why"));
  if (report.limits && report.limits.robotsNote) visit(report.limits, "robotsNote");
  (report.log || []).forEach((line) => line.text && visit(line, "text"));
}

function sentences(report) {
  const out = [];
  eachSentence(report, (node, key) => { if (out.indexOf(node[key]) === -1) out.push(node[key]); });
  return out;
}

function translate(sample, dictionary) {
  const out = JSON.parse(JSON.stringify(sample));
  const missing = [];
  eachSentence(out.report, (node, key) => {
    const text = dictionary[node[key]];
    if (typeof text === "string" && text) node[key] = text;
    else if (missing.indexOf(node[key]) === -1) missing.push(node[key]);
  });
  const wanted = new Set(sentences(sample.report));
  const unused = Object.keys(dictionary).filter((english) => !wanted.has(english));
  return { out, missing, unused };
}

function build() {
  const raw = fs.readFileSync(path.join(root, SOURCE), "utf8");
  const sample = JSON.parse(raw);
  const trailing = raw.endsWith("\n") ? "\n" : "";
  const files = {};
  const problems = [];
  for (const lang of LANGS) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(root, copyFile(lang)), "utf8"));
    const { out, missing, unused } = translate(sample, dictionary);
    missing.forEach((text) => problems.push(`${copyFile(lang)} has no translation for: ${text}`));
    unused.forEach((text) => problems.push(`${copyFile(lang)} translates a sentence the sample no longer has: ${text}`));
    files[outFile(lang)] = JSON.stringify(out) + trailing;
  }
  return { sample, files, problems };
}

module.exports = { LANGS, SOURCE, eachSentence, sentences, translate, build, outFile, copyFile };

if (require.main === module) {
  const { files, problems } = build();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const check = process.argv.includes("--check");
  const stale = [];
  for (const [file, want] of Object.entries(files)) {
    const target = path.join(root, file);
    const have = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (want === have) continue;
    if (check) stale.push(file);
    else fs.writeFileSync(target, want);
  }
  if (stale.length) {
    console.error(`Stale: ${stale.join(", ")}. Run node scripts/build-sample-langs.js`);
    process.exit(1);
  }
  console.log(check ? "Sample languages are current." : `Wrote ${Object.keys(files).length} sample files.`);
}
