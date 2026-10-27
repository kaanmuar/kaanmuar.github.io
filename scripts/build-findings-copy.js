#!/usr/bin/env node
/* js/qa-review-findings-copy.js holds the hand-written finding copy in every language. From it this writes:
   - functions/url-review-findings-copy.js, an exact copy, because functions/ deploys on its own (report emails, PDF);
   - js/qa-review-findings-copy.<lang>.js, one per review page, with only that page's dictionary, so a page does not
     download the other four. English has no dictionary (the server's text is English), so the en file has none.
   --check fails when any of them is stale. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SOURCE = "js/qa-review-findings-copy.js";
const LANGS = ["en", "es", "pt", "de", "fr", "it"];

function perLanguage(source, lang) {
  const lines = source.split("\n");
  const open = lines.indexOf("  const COPY = {");
  const close = lines.indexOf("  };", open);
  if (open < 0 || close < 0) throw new Error(`${SOURCE}: no top-level "const COPY = {" ... "};" block`);
  const blocks = {};
  let code = null;
  let start = 0;
  for (let i = open + 1; i < close; i++) {
    const head = lines[i].match(/^ {4}([a-z]{2}): \{$/);
    if (head) { code = head[1]; start = i; continue; }
    if (code && /^ {4}\},?$/.test(lines[i])) {
      blocks[code] = lines.slice(start, i).concat("    }");
      code = null;
    }
  }
  const missing = LANGS.filter((l) => l !== "en" && !blocks[l]);
  if (missing.length) throw new Error(`${SOURCE}: COPY has no ${missing.join(", ")} block`);
  const body = lang === "en" ? ["  const COPY = {};"] : ["  const COPY = {", ...blocks[lang], "  };"];
  return [
    `// Generated from ${SOURCE} by scripts/build-findings-copy.js with only the ${lang} dictionary; edit the source.`,
    ...lines.slice(0, open),
    ...body,
    ...lines.slice(close + 1),
  ].join("\n");
}

const source = fs.readFileSync(path.join(root, SOURCE), "utf8");
const targets = { "functions/url-review-findings-copy.js": source };
for (const lang of LANGS) targets[`js/qa-review-findings-copy.${lang}.js`] = perLanguage(source, lang);

const check = process.argv.includes("--check");
const stale = [];
for (const [file, want] of Object.entries(targets)) {
  const target = path.join(root, file);
  const have = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (want === have) continue;
  if (check) stale.push(file);
  else {
    fs.writeFileSync(target, want);
    console.log(`Wrote ${file}`);
  }
}
if (stale.length) {
  console.error(`Stale: ${stale.join(", ")}; run node scripts/build-findings-copy.js`);
  process.exit(1);
}
console.log(`${Object.keys(targets).length} files match ${SOURCE}`);
