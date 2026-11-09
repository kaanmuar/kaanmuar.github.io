#!/usr/bin/env node
// Open work on the same files (#2969): two chats once rewrote the same function in parallel (#2938, #2888), and a
// ticket was filed for something an open PR had already fixed (#2954). This finds that overlap before the edit.
//   node scripts/open-work.js files <file>...               open PRs, other ticket worktrees and open issues on them
//   node scripts/open-work.js ticket <n> [--branch <b>]     open work naming #n, or touching the files its body names
//   node scripts/open-work.js dups <title> [text]           open issues that may be the same ticket, as "#n title" lines
// REST only, with gh's token. The open PR list is cached for OPEN_WORK_TTL seconds (300) in ~/.cursor/preflight, each PR's
// files by head commit, worktree diffs for 2 minutes and searches for 10. Every call is time-boxed, a failed refresh
// keeps the old cache for a minute instead of retrying each turn, and any failure prints nothing and exits 0.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const REPO = "kaanmuar/kaanmuar.github.io";
const R = `repos/${REPO}`;
const ROOT = path.resolve(__dirname, "..");
const STATE = process.env.PREFLIGHT_STATE || path.join(os.homedir(), ".cursor", "preflight");
const TTL = (Number(process.env.OPEN_WORK_TTL) || 300) * 1000;
const WORKTREE_TTL = 120000;
const SEARCH_TTL = 600000;
const RETRY = 60000;
const LIVE = (Number(process.env.WORKTREE_LOCK_STALE) || 1800) * 1000;
const TIMEOUT = Number(process.env.OPEN_WORK_TIMEOUT) || 6000;

const FILE_RE = /(?:[\w.-]+\/)*[\w-][\w.-]*\.(?:js|mjs|cjs|ts|tsx|html|css|json|kt|kts|py|sh|yml|yaml|mdc|md|xml|java|rb|robot|feature)\b/g;
const STOP = new Set(("a an and are as at be but by can could did do does for from had has have how in into is it its of on " +
  "once or so than that the their then there these they this to too was were when where which while who why will with " +
  "without would not no after before still only also same just more until under over again our you your we us all any " +
  "each every one two get gets got make makes because since").split(" "));
// Words in so many titles here that they only rank a match, never make one.
const COMMON = new Set("url review reviews site sites page pages report reports test tests fix fixes fixed bug fails failed failing shows show run runs".split(" "));

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } };
const writeJson = (p, v) => { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); } catch {} };
const cacheFile = (name) => path.join(STATE, name);

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: TIMEOUT, maxBuffer: 16 << 20, ...opts }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
  });
}
// REST over fetch with gh's token: one process instead of one per PR. GH_HOST other than github.com is GitHub Enterprise.
let token;
async function api(route, params = {}) {
  if (token === undefined) token = await run("gh", ["auth", "token"], { timeout: 3000 }).catch(() => "");
  const host = process.env.GH_HOST && process.env.GH_HOST !== "github.com" ? `https://${process.env.GH_HOST}/api/v3` : "https://api.github.com";
  const url = new URL(`${host}/${route}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const offline = cacheFile("open-work-offline.json");
  if (Date.now() - readJson(offline, 0) < RETRY) throw new Error("offline");
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { accept: "application/vnd.github+json", "user-agent": "open-work", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  } catch (e) {
    writeJson(offline, Date.now());
    throw e;
  }
  if (!res.ok) throw new Error(`${res.status} ${route}`);
  return res.json();
}
const once = (fn) => { let p; return () => (p ||= fn()); };
const withDeadline = (promise, ms, fallback) => Promise.race([promise.catch(() => fallback), new Promise((r) => setTimeout(r, ms, fallback).unref())]);

// Files a prompt or issue names, as tracked paths: a full path, or a bare name with at most three tracked matches.
function resolveFiles(text, tracked, max = 12) {
  const set = tracked instanceof Set ? tracked : new Set(tracked);
  const found = [];
  for (let token of String(text || "").match(FILE_RE) || []) {
    token = token.replace(/^\.\//, "");
    let hits = set.has(token) ? [token] : [];
    if (!hits.length) {
      hits = [];
      for (const f of set) if (f.endsWith(`/${token}`)) { hits.push(f); if (hits.length > 3) break; }
      if (hits.length > 3) hits = [];
    }
    for (const h of hits) if (!found.includes(h)) found.push(h);
  }
  return found.slice(0, max);
}

// Items ({ files }) that touch any of the files, each with the shared ones as hits.
function overlaps(files, items) {
  const want = new Set(files);
  return items.map((it) => ({ ...it, hits: (it.files || []).filter((f) => want.has(f)) })).filter((it) => it.hits.length);
}

const ticketRefs = (...texts) => [...new Set(texts.join(" ").match(/#\d{2,6}\b/g) || [])].map((r) => Number(r.slice(1)));
const branchTicket = (branch) => Number((String(branch).match(/(?:^|\/)(\d{2,6})(?:-|$)/) || [])[1]) || null;
const namesTicket = (item, n) => item.branchTicket === n || (item.refs || []).includes(n);
const stem = (w) => w.toLowerCase().replace(/(?<=\w{3})(?:es|s)$/, "");

// Search words for a ticket: file names, `code`, 'quoted test names' and camelCase names first, then the title's
// most specific words. The area prefix ("BE:", "Process:") and ticket numbers are left out.
function keywords(title, text = "", max = 6) {
  const t = String(title || "").replace(/^\s*[A-Za-z]{2,12}:\s*/, "");
  const idents = (s, limit) => {
    const out = [];
    for (const m of String(s).matchAll(/`([^`]{3,60})`|(?<![\w'])'([^']{6,60})'(?![\w'])|"([^"]{6,60})"|((?:[\w.-]+\/)*[\w-][\w.-]*\.(?:js|mjs|ts|html|css|json|kt|py|sh|yml|mdc)\b)|\b([a-z]+[A-Z]\w{2,})\b/g)) {
      const v = (m[1] || m[2] || m[3] || m[4] || m[5]).trim();
      const key = m[4] ? path.basename(v) : v;
      if (!out.includes(key)) out.push(key);
      if (out.length >= limit) break;
    }
    return out;
  };
  const own = idents(t, max);
  const picked = [...own, ...idents(text, 3)];
  const words = t.replace(/`[^`]*`|(?<![\w'])'[^']*'(?![\w'])|"[^"]*"|#\d+/g, " ").split(/[^\w-]+/).map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !STOP.has(w.toLowerCase()) && !own.some((p) => p.toLowerCase().includes(w.toLowerCase())));
  const uniq = [...new Map(words.map((w) => [stem(w), w])).values()];
  const ranked = [...uniq.filter((w) => !COMMON.has(w.toLowerCase())).sort((a, b) => b.length - a.length), ...uniq.filter((w) => COMMON.has(w.toLowerCase()))];
  return [...new Set([...picked, ...ranked])].slice(0, max);
}

// Search results scored against the keywords: a title hit counts 2 (a code name 3), a body-only hit 1 (2).
// A match needs two specific words (outside COMMON; a code name counts twice) in its title, 5 points, and 60% of
// the best match's points.
function rankDuplicates(keys, issues, max = 3) {
  const isIdent = (k) => /[./`'"_]|[a-z][A-Z]|\s/.test(k);
  return issues.map((i) => {
    const title = String(i.title || "").toLowerCase();
    const titleWords = new Set(title.split(/[^\w-]+/).map(stem));
    const body = String(i.body || "").slice(0, 4000).toLowerCase();
    let score = 0, strong = 0;
    for (const k of keys) {
      const low = k.toLowerCase();
      const ident = isIdent(k);
      const inTitle = ident ? title.includes(low) : titleWords.has(stem(low));
      const inBody = !inTitle && body.includes(low);
      score += inTitle ? (ident ? 3 : 2) : inBody ? (ident ? 2 : 1) : 0;
      if (inTitle && !COMMON.has(low)) strong += ident ? 2 : 1;
    }
    return { number: i.number, title: i.title, score, strong };
  }).filter((i) => i.strong >= 2 && i.score >= 5).sort((a, b) => b.score - a.score || b.number - a.number)
    .filter((i, _, all) => i.score >= 0.6 * all[0].score).slice(0, max);
}

async function trackedFiles() {
  try { return new Set((await run("git", ["ls-files"], { timeout: 3000 })).split("\n").filter(Boolean)); } catch { return new Set(); }
}

const openPrs = once(async () => {
  const p = cacheFile("open-prs.json");
  const cache = readJson(p, { at: 0, prs: [] });
  const now = Date.now();
  const stale = () => (now - cache.at < 3600000 ? cache.prs : []);
  if (now - cache.at < TTL || now - (cache.failedAt || 0) < RETRY) return stale();
  try {
    const list = await api(`${R}/pulls`, { state: "open", per_page: 100 });
    const old = new Map(cache.prs.map((x) => [x.number, x]));
    const prs = await Promise.all(list.map(async (pr) => {
      const prev = old.get(pr.number);
      let sha = pr.head.sha;
      let files = prev && prev.sha === sha ? prev.files : null;
      if (!files) {
        try { files = (await api(`${R}/pulls/${pr.number}/files`, { per_page: 100 })).map((f) => f.filename); } catch { sha = null; files = prev ? prev.files : []; }
      }
      return { number: pr.number, title: pr.title, branch: pr.head.ref, sha, branchTicket: branchTicket(pr.head.ref), refs: ticketRefs(pr.title, (pr.body || "").slice(0, 3000)), files };
    }));
    writeJson(p, { at: now, prs });
    return prs;
  } catch {
    writeJson(p, { ...cache, failedAt: now });
    return stale();
  }
});

function lockOf(gitdir) {
  try {
    const lock = Object.fromEntries(fs.readFileSync(path.join(gitdir, "chat-lock"), "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
    return { chat: lock.chat || "", live: Date.now() - Number(lock.heartbeat) * 1000 < LIVE };
  } catch { return { chat: "", live: false }; }
}

// Ticket worktrees under .worktrees/ with the files their branch changed since main, committed or not.
const worktrees = once(async () => {
  const p = cacheFile("worktrees.json");
  const cache = readJson(p, { at: 0, list: [] });
  let list = cache.list;
  if (Date.now() - cache.at >= WORKTREE_TTL) {
    try {
      const porcelain = await run("git", ["worktree", "list", "--porcelain"], { timeout: 2000 });
      const entries = [];
      let dir = null;
      for (const line of porcelain.split("\n")) {
        if (line.startsWith("worktree ")) dir = line.slice(9);
        else if (line.startsWith("branch refs/heads/") && dir && dir.includes(`${path.sep}.worktrees${path.sep}`)) entries.push({ dir, branch: line.slice(18) });
      }
      list = await Promise.all(entries.map(async (e) => {
        const [committed, local] = await Promise.all([
          run("git", ["diff", "--name-only", `origin/main...refs/heads/${e.branch}`], { timeout: 3000 }).catch(() => ""),
          run("git", ["-C", e.dir, "diff", "--name-only", "HEAD"], { timeout: 3000 }).catch(() => ""),
        ]);
        let gitdir = "";
        try { gitdir = path.resolve(e.dir, fs.readFileSync(path.join(e.dir, ".git"), "utf8").replace(/^gitdir:\s*/, "").trim()); } catch {}
        const files = [...new Set(`${committed}\n${local}`.split("\n").filter(Boolean))];
        return { ...e, gitdir, branchTicket: branchTicket(e.branch), files: files.length > 300 ? [] : files };
      }));
      writeJson(p, { at: Date.now(), list });
    } catch {}
  }
  return list.map((w) => ({ ...w, ...lockOf(w.gitdir) }));
});

async function search(q, perPage = 20) {
  const p = cacheFile("open-work-search.json");
  const cache = readJson(p, {});
  const now = Date.now();
  if (cache[q] && now - cache[q].at < SEARCH_TTL) return cache[q].items;
  if (now - (cache._failedAt || 0) < RETRY) return [];
  let items;
  try {
    items = (await api("search/issues", { q, per_page: perPage })).items.map((i) => ({ number: i.number, title: i.title, body: (i.body || "").slice(0, 4000) }));
  } catch {
    writeJson(p, { ...cache, _failedAt: now });
    return [];
  }
  const kept = Object.entries(cache).filter(([k, v]) => k !== "_failedAt" && now - v.at < SEARCH_TTL).slice(-40);
  writeJson(p, { ...Object.fromEntries(kept), [q]: { at: now, items } });
  return items;
}

const orTerms = (terms) => terms.map((t) => (/[\s.:'-]/.test(t) ? `"${t.replace(/"/g, "")}"` : t)).join(" OR ");

// Open PRs and other chats' worktrees touching the files, and open issues that name them.
// exclude: { chat, branches, tickets } leaves out this chat's own worktrees and branches, and the tickets in hand.
async function openWork(files, exclude = {}) {
  const ownBranches = new Set(exclude.branches || []);
  const skipTickets = new Set((exclude.tickets || []).map(Number));
  const [prs, trees] = await Promise.all([openPrs(), worktrees()]);
  for (const w of trees) if (exclude.chat && w.chat === exclude.chat) ownBranches.add(w.branch);
  const cwd = process.cwd();
  for (const w of trees) if (cwd === w.dir || cwd.startsWith(w.dir + path.sep)) ownBranches.add(w.branch);
  const prList = overlaps(files, prs.filter((p) => !ownBranches.has(p.branch)));
  const prBranches = new Set(prs.map((p) => p.branch));
  const treeList = overlaps(files, trees.filter((w) => !ownBranches.has(w.branch) && !prBranches.has(w.branch)));
  let issues = [];
  const names = [...new Set(files.map((f) => path.basename(f)))].slice(0, 3);
  if (names.length) {
    const inFlight = new Set([...prList, ...treeList].flatMap((x) => [x.branchTicket, ...(x.refs || [])]));
    issues = (await search(`repo:${REPO} is:issue is:open ${orTerms(names)}`, 10))
      .filter((i) => !skipTickets.has(i.number) && !inFlight.has(i.number))
      .map((i) => ({ ...i, hits: names.filter((n) => `${i.title}\n${i.body}`.includes(n)) }))
      .filter((i) => i.hits.length).slice(0, 3);
  }
  return { prs: prList, worktrees: treeList, issues, prsKnown: prs.length > 0 };
}

function formatWork({ prs = [], worktrees: trees = [], issues = [], prsKnown }, heading = "Open work on the same files (#2969); read it, and coordinate or build on it, before editing:") {
  const lines = [
    ...prs.map((p) => `- PR #${p.number} (${p.branch}) ${p.title}: ${p.hits.join(", ")}`),
    ...trees.map((w) => `- Worktree ${w.branch}${prsKnown ? ", no PR yet" : ""}${w.live ? ", a live chat holds it" : ""}: ${w.hits.join(", ")}`),
    ...issues.map((i) => `- Open issue #${i.number} names ${i.hits.join(", ")}: ${i.title}`),
  ];
  return lines.length ? [heading, ...lines].join("\n") : "";
}

// Open work for a ticket: PRs and worktrees that already name #n, then those touching the files its issue names.
async function ticketWork(n, branch) {
  n = Number(n);
  const [issue, tracked] = await Promise.all([api(`${R}/issues/${n}`).catch(() => null), trackedFiles()]);
  const files = issue ? resolveFiles(`${issue.title}\n${issue.body}`, tracked) : [];
  const work = await openWork(files, { branches: [branch].filter(Boolean), tickets: [n] });
  const [prs, trees] = await Promise.all([openPrs(), worktrees()]);
  const own = (b) => b === branch;
  const namingPrs = prs.filter((p) => !own(p.branch) && namesTicket(p, n));
  const namingTrees = trees.filter((w) => !own(w.branch) && w.branchTicket === n && !prs.some((p) => p.branch === w.branch));
  const named = new Set([...namingPrs, ...namingTrees].map((x) => x.branch));
  const naming = [
    ...namingPrs.map((p) => `- PR #${p.number} (${p.branch}) ${p.title}`),
    ...namingTrees.map((w) => `- Worktree ${w.branch}${w.live ? ", a live chat holds it" : ""}`),
  ];
  const rest = { ...work, prs: work.prs.filter((p) => !named.has(p.branch)), worktrees: work.worktrees.filter((w) => !named.has(w.branch)), issues: [] };
  return [
    naming.length ? [`Open work already names #${n} (#2969):`, ...naming].join("\n") : "",
    formatWork(rest, `Open work touches files #${n} names (#2969):`),
  ].filter(Boolean).join("\n");
}

async function duplicates(title, text) {
  const keys = keywords(title, text);
  if (!keys.length) return [];
  const items = await search(`repo:${REPO} is:issue is:open ${orTerms(keys)}`);
  return rankDuplicates(keys, items);
}

const warm = () => Promise.all([openPrs(), worktrees()]);

module.exports = { resolveFiles, overlaps, keywords, rankDuplicates, branchTicket, ticketRefs, namesTicket, formatWork, openWork, ticketWork, duplicates, trackedFiles, withDeadline, warm };

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const budget = TIMEOUT + 2000;
  let text = "";
  if (mode === "files") {
    const tracked = await trackedFiles();
    const files = args.flatMap((a) => (tracked.has(a) ? [a] : resolveFiles(a, tracked)));
    text = formatWork(await withDeadline(openWork(files, { chat: process.env.CURSOR_CONVERSATION_ID }), budget, {}));
  } else if (mode === "ticket") {
    const i = args.indexOf("--branch");
    text = await withDeadline(ticketWork(args[0], i >= 0 ? args[i + 1] : ""), budget, "");
  } else if (mode === "dups") {
    text = (await withDeadline(duplicates(args[0], args.slice(1).join("\n")), budget, [])).map((d) => `#${d.number} ${d.title}`).join("\n");
  }
  if (text) console.log(text);
}

if (require.main === module) main().catch(() => {}).finally(() => process.exit(0));
