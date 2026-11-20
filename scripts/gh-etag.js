#!/usr/bin/env node
/* Conditional GET for the GitHub REST API (#3835): scripts/gh-budget.sh --cached-get <path> runs this with GH_TOKEN set.
 *   gh-etag.js <path>        prints the JSON body; a 304 serves the cached copy and spends no REST quota
 *   gh-etag.js --stats       prints the hit/miss counters kept in the cache directory
 * Cache directory: GH_ETAG_CACHE_DIR, else ~/.cache/gh-etag. Counters live in stats.json there (hits are 304s). */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { etagFetch, fileStore } = require("../functions/etag-cache");

const dir = process.env.GH_ETAG_CACHE_DIR || path.join(os.homedir(), ".cache", "gh-etag");
const statsFile = path.join(dir, "stats.json");
const readStats = () => { try { return JSON.parse(fs.readFileSync(statsFile, "utf8")); } catch (error) { return { calls: 0, hits: 0, misses: 0 }; } };

async function main(argv) {
  if (argv[0] === "--stats") {
    const s = readStats();
    console.log(`etag cache: ${s.hits} of ${s.calls} calls were 304 (0 quota), ${s.misses} spent quota`);
    return 0;
  }
  const target = argv[0];
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!target || !token) { console.error("usage: GH_TOKEN=... gh-etag.js <api path>"); return 64; }
  const url = /^https:/.test(target) ? target : "https://api.github.com/" + target.replace(/^\//, "");
  const stats = readStats();
  const get = etagFetch(fetch, fileStore(dir), token, stats);
  const res = await get(url, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-gh-etag", "X-GitHub-Api-Version": "2022-11-28" } });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(statsFile, JSON.stringify({ calls: stats.calls, hits: stats.hits, misses: stats.misses }), { mode: 0o600 });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("GitHub " + res.status + ": " + String((body && body.message) || "no answer").slice(0, 200)); return 1; }
  console.log(JSON.stringify(body));
  return 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code), (error) => { console.error(String(error.message || error)); process.exit(1); });
module.exports = { main };
