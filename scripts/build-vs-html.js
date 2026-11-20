#!/usr/bin/env node
/**
 * Writes the default English comparison table and tool cards of qa-review-vs.html into its HTML,
 * so search engines, AI answer engines, and visitors without JavaScript receive the full comparison.
 * The page's own script re-renders in the visitor's chosen language on load.
 *
 *   node scripts/build-vs-html.js          rewrites qa-review-vs.html
 *   node scripts/build-vs-html.js --check  exits 1 when the HTML no longer matches the script
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HTML_FILE = path.join(ROOT, "qa-review-vs.html");
const JS_FILE = path.join(ROOT, "js/qa-review-vs.js");
const START = '<div id="vs" translate="no" class="notranslate">';
const END = '</div>\n    <p class="vs-note">';

function rendered(jsSource) {
  const vsNode = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  const windowObj = {};
  const context = {
    window: windowObj,
    document: {
      documentElement: { lang: "en" },
      title: "",
      getElementById: (id) => (id === "vs" ? vsNode : null),
      querySelectorAll: () => []
    },
    location: { search: "" },
    navigator: { language: "en" },
    localStorage: { getItem: () => null },
    URLSearchParams
  };
  vm.runInNewContext(jsSource, context);
  if (!vsNode.innerHTML) throw new Error("js/qa-review-vs.js rendered empty #vs content.");
  return vsNode.innerHTML;
}

function build(html, jsSource) {
  const startAt = html.indexOf(START);
  const endAt = html.indexOf(END, startAt);
  if (startAt === -1 || endAt === -1) throw new Error("Could not find #vs container markers in qa-review-vs.html.");
  const inner = rendered(jsSource);
  return html.slice(0, startAt + START.length) + "\n        " + inner + "\n    " + html.slice(endAt);
}

if (require.main === module) {
  const html = fs.readFileSync(HTML_FILE, "utf8");
  const jsSource = fs.readFileSync(JS_FILE, "utf8");
  const next = build(html, jsSource);
  if (process.argv.includes("--check")) {
    if (next !== html) {
      console.error("qa-review-vs.html is out of date. Run node scripts/build-vs-html.js");
      process.exit(1);
    }
    console.log("qa-review-vs.html matches js/qa-review-vs.js.");
  } else {
    fs.writeFileSync(HTML_FILE, next);
    console.log("qa-review-vs.html: static English comparison written.");
  }
}

module.exports = { build, rendered };
