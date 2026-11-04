#!/usr/bin/env node
// Feeds the pre-flight brain (#1970, workers/preflight): source files in 200-line windows and the repo's tickets.
//   node scripts/preflight-index.js --full                 every tracked source file and every ticket
//   node scripts/preflight-index.js --changed <base> <head> files changed between two commits
//   node scripts/preflight-index.js --issues-since <ISO>   tickets updated since a date
// PREFLIGHT_URL and PREFLIGHT_TOKEN come from the environment or ~/.cursor/preflight/{config.json,token}.
// A changed file drops only windows the base revision had indexed. Deleting every unused window up to the cap
// turned one day of edits into ~134k Vectorize deletes, and one dropped connection failed the nightly run (#2543).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WINDOW = 200;
const MAX_WINDOWS = 60;
const MAX_BYTES = 500000;
const SOURCE = /\.(js|mjs|ts|html|css|kt|kts|py|sh|yml|yaml|mdc|md|rules)$/;
const SKIP = /(^|\/)(node_modules|media|generated|dist|build|vendor|\.cloudflare|\.worktrees)\/|\.min\.|package-lock|^data\/|^reports\//;
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".cursor/preflight/config.json"), "utf8")); } catch { return {}; } })();
const URL_ = process.env.PREFLIGHT_URL || cfg.url || "https://preflight.carlosandmunoz.com";
const TOKEN = process.env.PREFLIGHT_TOKEN || cfg.token;
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const id = (s) => crypto.createHash("sha1").update(s).digest("hex");
const retryWait = (attempt) => Number(process.env.PREFLIGHT_RETRY_MS ?? 2000) * attempt;

async function post(route, body) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${URL_}${route}`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) return res.json();
      const text = (await res.text()).slice(0, 200);
      if (res.status === 429) throw Object.assign(new Error(`${route} 429: ${text}`), { quota: true });
      last = new Error(`${route} ${res.status}: ${text}`);
    } catch (e) {
      if (e.quota) throw e;
      const cause = e.cause && (e.cause.code || e.cause.message);
      last = String(e.message || "").startsWith(route) ? e : new Error(`${route} ${e.message}${cause ? `: ${cause}` : ""}`);
    }
    if (attempt < 3) {
      console.error(`${last.message} (retry ${attempt})`);
      await new Promise((r) => setTimeout(r, retryWait(attempt)));
    }
  }
  throw last;
}

function header(lines) {
  const top = [];
  const MARKS = ["/**", "/*", "//", "*", "#", "<" + "!--"];
  for (const l of lines.slice(0, 20)) {
    const t = l.trim();
    const mark = t.startsWith("#!") ? null : MARKS.find((m) => t.startsWith(m));
    if (mark) { const text = t.slice(mark.length).trim(); if (text) top.push(text); } else if (top.length || t) break;
  }
  return top.join(" ").slice(0, 300);
}

const SYMBOL = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function|\w+\s*=>)|exports\.(\w+)\s*=|class\s+(\w+)|fun\s+(\w+)|def\s+(\w+)|id="([\w-]+)")/g;

function windowsOf(text) {
  if (text == null || text === false) return 0;
  return Math.min(MAX_WINDOWS, Math.ceil(String(text).split("\n").length / WINDOW));
}

function textItems(file, text) {
  if (text == null || text === false) return [];
  const lines = String(text).split("\n");
  const title = header(lines) || file;
  const items = [];
  for (let start = 0; start < lines.length && items.length < MAX_WINDOWS; start += WINDOW) {
    const chunk = lines.slice(start, start + WINDOW).join("\n");
    const symbols = [...new Set([...chunk.matchAll(SYMBOL)].map((m) => m.slice(1).find(Boolean)))].slice(0, 40).join(", ");
    const ref = start ? `${file}#L${start + 1}` : file;
    items.push({
      id: id(`${file}:${start}`),
      text: `${file} lines ${start + 1}-${start + WINDOW}\n${title}\nSymbols: ${symbols}\n${chunk.replace(/\s+/g, " ").slice(0, 1200)}`,
      meta: { kind: "file", ref, title: title.slice(0, 120) },
    });
  }
  return items;
}

function readText(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return null;
  if (fs.statSync(full).size > MAX_BYTES) return false;
  return fs.readFileSync(full, "utf8");
}

const fileItems = (file) => textItems(file, readText(file));

// from is the first window the new text no longer has; to is how many the base revision indexed.
const staleIds = (file, from, to = MAX_WINDOWS) => Array.from({ length: Math.max(0, to - from) }, (_, i) => id(`${file}:${(from + i) * WINDOW}`));

function planFile(file, oldText, newText) {
  const items = textItems(file, newText);
  return { items, deletes: staleIds(file, items.length, windowsOf(oldText)) };
}

// One git process for every base blob. null: the path was new. false: it was over the size cap and was never indexed.
function textsAt(rev, files) {
  const out = new Map();
  if (!files.length) return out;
  const buf = execFileSync("git", ["cat-file", "--batch"], {
    cwd: ROOT,
    input: files.map((f) => `${rev}:${f}`).join("\n") + "\n",
    maxBuffer: 256 << 20,
  });
  let off = 0;
  for (const file of files) {
    const nl = buf.indexOf(10, off);
    if (nl < 0) break;
    const headerLine = buf.toString("utf8", off, nl);
    off = nl + 1;
    if (headerLine.endsWith(" missing")) { out.set(file, null); continue; }
    const size = Number(headerLine.slice(headerLine.lastIndexOf(" ") + 1));
    if (!Number.isFinite(size)) throw new Error(`git cat-file: ${headerLine}`);
    const body = buf.subarray(off, off + size);
    off += size + 1;
    out.set(file, size > MAX_BYTES ? false : body.toString("utf8"));
  }
  if (out.size !== files.length) throw new Error(`git cat-file returned ${out.size} objects for ${files.length} paths`);
  return out;
}

function collectChanged(base, head) {
  const files = [];
  for (const row of git("diff", "--name-status", "--no-renames", base, head).split("\n").filter(Boolean)) {
    const tab = row.indexOf("\t");
    if (tab < 0) continue;
    const file = row.slice(tab + 1);
    if (SOURCE.test(file) && !SKIP.test(file)) files.push(file);
  }
  const old = textsAt(base, files);
  const items = [];
  const deletes = [];
  for (const file of files) {
    const plan = planFile(file, old.get(file), readText(file));
    items.push(...plan.items);
    deletes.push(...plan.deletes);
  }
  return { files, items, deletes };
}

async function issueItems(since) {
  const items = [];
  for (let page = 1; page < 60; page++) {
    const q = `repos/kaanmuar/kaanmuar.github.io/issues?state=all&per_page=100&page=${page}${since ? `&since=${since}` : ""}`;
    const rows = JSON.parse(execFileSync("gh", ["api", q], { encoding: "utf8", maxBuffer: 64 << 20 }));
    for (const i of rows) {
      if (i.pull_request) continue;
      items.push({
        id: `issue-${i.number}`,
        text: `Ticket #${i.number} (${i.state}): ${i.title}\n${(i.body || "").replace(/\s+/g, " ").slice(0, 1500)}`,
        meta: { kind: "issue", ref: String(i.number), title: i.title.slice(0, 140), state: i.state },
      });
    }
    if (rows.length < 100) break;
  }
  return items;
}

async function send(items) {
  let done = 0;
  for (let i = 0; i < items.length; i += 50) {
    const r = await post("/index", { items: items.slice(i, i + 50) });
    done += r.upserted;
    if (process.stdout.isTTY) process.stdout.write(`\rindexed ${done}/${items.length}`);
  }
  console.log(`\nindexed ${done} vectors`);
}

async function main() {
  if (!TOKEN) throw new Error("PREFLIGHT_TOKEN is not set");
  const [mode, a, b] = process.argv.slice(2);
  const items = [];
  const deletes = [];
  if (mode === "--full") {
    for (const f of git("ls-files").split("\n").filter((f) => SOURCE.test(f) && !SKIP.test(f))) items.push(...fileItems(f));
  }
  if (mode === "--changed") {
    const changed = collectChanged(a, b);
    items.push(...changed.items);
    deletes.push(...changed.deletes);
  }
  if (mode === "--full") items.push(...await issueItems());
  if (mode === "--issues-since") items.push(...await issueItems(a));
  for (let i = 0; i < deletes.length; i += 100) await post("/delete", { ids: deletes.slice(i, i + 100) });
  await send(items);
}

// Workers AI's daily allocation running out is not a failure: the nightly run re-indexes the day's changed files after the reset.
if (require.main === module) {
  main().catch((e) => {
    if (e.quota) { console.log(`::warning::Pre-flight index skipped, ${e.message}`); return; }
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { planFile, windowsOf, staleIds, collectChanged, post, id };
