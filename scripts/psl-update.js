#!/usr/bin/env node
// Refreshes the Public Suffix List bundled with Functions (url-review-suffix.js reads it): node scripts/psl-update.js
// Keeps the license header, the section markers and the rules; drops the other comments.
const fs = require("fs");
const path = require("path");
const suffix = require("../functions/url-review-suffix");

const SOURCE = "https://publicsuffix.org/list/public_suffix_list.dat";
const OUT = path.join(__dirname, "..", "functions", "assets", "public_suffix_list.dat");

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error("The Public Suffix List answered " + res.status);
  const text = await res.text();
  const lines = text.split("\n");
  const header = lines.slice(0, lines.findIndex((line) => /===BEGIN ICANN DOMAINS===/.test(line))).filter((line) => /^\/\/ (This Source|License|file, You|VERSION|COMMIT)/.test(line));
  const body = lines.filter((line) => /===(BEGIN|END) (ICANN|PRIVATE) DOMAINS===/.test(line) || (line.trim() && !line.trim().startsWith("//")));
  const out = header.concat(["// Source: " + SOURCE + ", fetched " + new Date().toISOString().slice(0, 10)], body).join("\n") + "\n";
  const registrable = suffix.suffixRegistrable(out, true);
  const registry = suffix.suffixRegistrable(out);
  if (registry("gv.at") || registry("www.oesterreich.gv.at") !== "oesterreich.gv.at" || registrable("a.b.github.io") !== "b.github.io") {
    throw new Error("The Public Suffix List has no ICANN or private section to read");
  }
  fs.writeFileSync(OUT, out);
  console.log(body.length + " lines, " + Math.round(fs.statSync(OUT).size / 1024) + " KB written to " + path.relative(process.cwd(), OUT));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
