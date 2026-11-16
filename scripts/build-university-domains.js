#!/usr/bin/env node
"use strict";
/*
 * Builds functions/university-domains.json (#3138) from Hipo's open university-domains-list (MIT,
 * https://github.com/Hipo/university-domains-list): { "<domain>": "<CC>|<school>" }, which functions/student-check.js
 * reads to tell a school email. Run it to refresh: node scripts/build-university-domains.js [file.json]
 */
const fs = require("fs");
const path = require("path");

const SOURCE = "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
const OUT = path.join(__dirname, "..", "functions", "university-domains.json");
const LICENSE = "MIT License, Copyright (c) 2014-2025 Hipo, https://github.com/Hipo/university-domains-list/blob/master/LICENSE.txt";

async function main() {
  const file = process.argv[2];
  const list = file ? JSON.parse(fs.readFileSync(file, "utf8")) : await (await fetch(SOURCE)).json();
  const domains = {};
  list.forEach((u) => (u.domains || []).forEach((d) => {
    const host = String(d || "").trim().toLowerCase().replace(/^www\./, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && !domains[host]) domains[host] = String(u.alpha_two_code || "").toUpperCase() + "|" + String(u.name || "").replace(/\|/g, " ").trim();
  }));
  const sorted = Object.fromEntries(Object.keys(domains).sort().map((k) => [k, domains[k]]));
  fs.writeFileSync(OUT, JSON.stringify({ source: SOURCE, license: LICENSE, built: new Date().toISOString().slice(0, 10), domains: sorted }) + "\n");
  console.log(Object.keys(sorted).length + " school domains written to " + path.relative(process.cwd(), OUT));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
