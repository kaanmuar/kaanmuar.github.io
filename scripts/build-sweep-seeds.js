#!/usr/bin/env node
/* Monthly: the country-sweep seeds, from the Chrome UX Report top lists (github.com/zakird/crux-top-lists).

     node scripts/build-sweep-seeds.js          # every country
     node scripts/build-sweep-seeds.js co mx    # only these, merged into the existing index

   For each country, the most visited https origins of its latest month, minus sites that are in the global
   top GLOBAL_RANK (everyone's sites, not that country's), adult, piracy and gambling hosts, endings that are
   neither the country's nor a common generic one, and duplicates of one registrable domain. Writes assets/sweep/<cc>.json ({ cc, month, hosts }) and assets/sweep/index.json
   ({ month, built, countries: { cc: n } }), which sweepReviews in functions/index.js reads from the site. */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { registrable } = require("../functions/url-review-core");
const sweep = require("../functions/url-review-sweep");

const REPO = "zakird/crux-top-lists";
const RAW = "https://raw.githubusercontent.com/" + REPO + "/main/";
const OUT = path.resolve(__dirname, "../assets/sweep");
const COUNTRY_RANK = 50000;

async function paths() {
  const headers = { "user-agent": "qa-lab-sweep-seeds", accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const res = await fetch("https://api.github.com/repos/" + REPO + "/git/trees/main?recursive=1", { headers });
  if (!res.ok) throw new Error("GitHub tree answered " + res.status);
  const data = await res.json();
  if (data.truncated) throw new Error("The crux-top-lists tree came back truncated; list the folders one by one.");
  return data.tree.map((item) => item.path);
}

function latest(all, pattern) {
  const out = {};
  all.forEach((file) => {
    const m = file.match(pattern);
    if (m && (!out[m[1]] || out[m[1]] < m[2])) out[m[1]] = m[2];
  });
  return out;
}

async function rows(file, maxRank) {
  const res = await fetch(RAW + file);
  if (!res.ok) throw new Error(file + " answered " + res.status);
  const text = zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  const out = [];
  for (const line of text.split("\n").slice(1)) {
    const comma = line.lastIndexOf(",");
    const rank = Number(line.slice(comma + 1));
    if (comma < 0 || !(rank > 0)) continue;
    if (rank > maxRank) break;
    out.push([line.slice(0, comma), rank]);
  }
  return out.sort((a, b) => a[1] - b[1]);
}

async function main() {
  const only = process.argv.slice(2).map((cc) => cc.toLowerCase());
  const all = await paths();
  const countries = latest(all, /^data\/country\/([a-z]{2})\/(\d{6})\.csv\.gz$/);
  const globalMonth = latest(all, /^data\/(global)\/(\d{6})\.csv\.gz$/).global;
  const globalDomains = new Set((await rows("data/global/" + globalMonth + ".csv.gz", sweep.GLOBAL_RANK)).map(([origin]) => {
    try { return registrable(new URL(origin).hostname); } catch (error) { return ""; }
  }));
  fs.mkdirSync(OUT, { recursive: true });
  const indexFile = path.join(OUT, "index.json");
  const index = only.length && fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : { countries: {} };
  const codes = Object.keys(countries).filter((cc) => !only.length || only.includes(cc)).sort();
  for (const cc of codes) {
    const month = countries[cc];
    try {
      const hosts = sweep.seedHosts(await rows("data/country/" + cc + "/" + month + ".csv.gz", COUNTRY_RANK), globalDomains, registrable, sweep.PER_COUNTRY, cc);
      fs.writeFileSync(path.join(OUT, cc + ".json"), JSON.stringify({ cc, month, hosts }) + "\n");
      index.countries[cc] = hosts.length;
      console.log(cc + " " + month + " " + hosts.length);
    } catch (error) {
      console.warn("skip " + cc + ": " + error.message);
    }
  }
  index.month = globalMonth;
  index.built = new Date().toISOString().slice(0, 10);
  index.source = "https://github.com/" + REPO;
  index.countries = Object.fromEntries(Object.entries(index.countries).sort());
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + "\n");
  const total = Object.values(index.countries).reduce((sum, n) => sum + n, 0);
  console.log(Object.keys(index.countries).length + " countries, " + total + " sites, CrUX " + globalMonth);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "month=" + globalMonth + "\nsites=" + total + "\n");
}

main().catch((error) => { console.error(error); process.exit(1); });
