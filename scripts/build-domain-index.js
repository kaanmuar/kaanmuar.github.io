#!/usr/bin/env node
/*
 * Builds the host index behind the URL Review "Public page" suggestions.
 *
 *   node scripts/build-domain-index.js            # downloads both lists, writes assets/domains/
 *   node scripts/build-domain-index.js 50000      # keep the top 50,000 origins instead of 100,000
 *   node scripts/build-domain-index.js --force    # write even if the new index is much smaller
 *
 * .github/workflows/domain-index.yml runs it monthly, after the CrUX lists come
 * out around the 10th. It refuses to write an index under 90% of the current
 * one, so a broken download never empties the suggestions.
 *
 * Hosts come from the Chrome UX Report top origins (sites Chrome users really
 * open, https only, bucketed by popularity). Inside each bucket they are
 * ordered by the Tranco rank of their domain, so google.com comes before
 * google.co.ao. Each shard holds the hosts whose key (host without a leading
 * www. or m.) starts with the same two characters, most popular first.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const CRUX_URL = "https://raw.githubusercontent.com/zakird/crux-top-lists/main/data/global/current.csv.gz";
const TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip";
const OUT = path.join(__dirname, "..", "assets", "domains");
const ARGS = process.argv.slice(2);
const LIMIT = Number(ARGS.find((arg) => /^\d+$/.test(arg))) || 100000;
const FORCE = ARGS.includes("--force");
const TOP = 5000;
const MIN_KEPT = 0.9;

function currentCount() {
  if (!fs.existsSync(OUT)) return 0;
  return fs.readdirSync(OUT).filter((name) => name.endsWith(".txt") && name !== "top.txt")
    .reduce((sum, name) => sum + fs.readFileSync(path.join(OUT, name), "utf8").split("\n").filter(Boolean).length, 0);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " answered " + res.status);
  return Buffer.from(await res.arrayBuffer());
}

function keyOf(host) {
  return host.replace(/^(www|m)\./, "");
}

function shardOf(key) {
  return key.slice(0, 2).replace(/\./g, "_");
}

async function main() {
  const crux = zlib.gunzipSync(await download(CRUX_URL)).toString("utf8").split("\n");
  const zip = path.join(os.tmpdir(), "tranco-top-1m.zip");
  fs.writeFileSync(zip, await download(TRANCO_URL));
  const tranco = new Map();
  execFileSync("unzip", ["-p", zip], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8").split("\n").forEach((line) => {
    const [rank, domain] = line.trim().split(",");
    if (domain && !tranco.has(domain)) tranco.set(domain, Number(rank));
  });

  const rows = [];
  crux.slice(1).forEach((line) => {
    const [origin, bucket] = line.trim().split(",");
    if (!origin || !origin.startsWith("https://") || Number(bucket) > LIMIT) return;
    const host = origin.slice(8).toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return;
    const labels = host.split(".");
    let rank = 2e6;
    let main = 1;
    for (let i = 0; i < labels.length - 1; i += 1) {
      const domain = labels.slice(i).join(".");
      const hit = tranco.get(domain);
      if (hit) { rank = hit; main = domain === keyOf(host) ? 0 : 1; break; }
    }
    rows.push({ host, bucket: Number(bucket), rank, main });
  });
  rows.sort((a, b) => a.bucket - b.bucket || a.rank - b.rank || a.main - b.main || a.host.length - b.host.length || (a.host < b.host ? -1 : 1));

  const seen = new Set();
  const hosts = rows.map((row) => row.host).filter((host) => {
    const key = keyOf(host);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const shards = new Map();
  hosts.forEach((host) => {
    const name = shardOf(keyOf(host));
    if (!shards.has(name)) shards.set(name, []);
    shards.get(name).push(host);
  });

  const before = currentCount();
  if (!FORCE && hosts.length < before * MIN_KEPT) {
    throw new Error("The new index has " + hosts.length + " hosts against " + before + " now; kept the current one (--force writes it anyway).");
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  shards.forEach((list, name) => fs.writeFileSync(path.join(OUT, name + ".txt"), list.join("\n") + "\n"));
  fs.writeFileSync(path.join(OUT, "top.txt"), hosts.slice(0, TOP).join("\n") + "\n");
  console.log(hosts.length + " hosts in " + shards.size + " shards, top " + TOP + " in top.txt (" + before + " before)");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "hosts=" + hosts.length + "\nbefore=" + before + "\n");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
