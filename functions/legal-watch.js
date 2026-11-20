// Weekly change watch for the sources the legal page cites (#4004). legal/clauses.json lists, per clause, the official pages
// (cites[].url) its wording rests on. Once a week this fetches each one, hashes its normalized text and compares it with the
// hash stored in Firestore legal_watch/<sha-256 of the url>. The first run only records baselines. A changed page is written
// to legal_watch_changes and filed as ONE GitHub issue for the owner; a page that did not load is recorded and tried again next
// week, never counted as a change. The watch only reads: it never edits legal/clauses.json, legal/signoff.json or the legal
// page, and it publishes nothing. The owner decides what a change means and signs the new text off (legal/README.md).
const crypto = require("crypto");

const CLAUSES_URL = "https://raw.githubusercontent.com/kaanmuar/kaanmuar.github.io/main/legal/clauses.json";
const USER_AGENT = "QA-lab-legal-watch/1.0 (+https://carlosandmunoz.com/qa-review-legal.html; weekly check that cited law pages did not change)";
const TIMEOUT_MS = 20000;
const MAX_CHARS = 2000000;
// Pages fetched per run (the oldest-checked first) and the pause between two fetches, so no host sees a burst.
const CAP = 60;
const PAUSE_MS = 1500;

const sha = (text) => crypto.createHash("sha256").update(String(text), "utf8").digest("hex");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// The words of a page: scripts, styles, comments and markup gone, entities decoded, whitespace collapsed. A page whose only
// change is its markup, a nonce or a cookie banner script hashes the same.
function normalize(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, name) => {
      const lower = name.toLowerCase();
      if (lower[0] === "#") {
        const code = lower[1] === "x" ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[lower] || " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

const hashOf = (html) => sha(normalize(html));
const docId = (url) => sha(url);

// Each unique cited url with the clauses that cite it, in first-seen order.
function sources(clauses) {
  const byUrl = new Map();
  (clauses || []).forEach((clause) =>
    (clause.cites || []).forEach((cite) => {
      if (!cite || !/^https?:\/\//.test(cite.url || "")) return;
      if (!byUrl.has(cite.url)) byUrl.set(cite.url, { url: cite.url, names: [], clauses: [] });
      const row = byUrl.get(cite.url);
      if (cite.name && !row.names.includes(cite.name)) row.names.push(cite.name);
      if (!row.clauses.some((c) => c.id === clause.id)) row.clauses.push({ id: clause.id, lastChecked: clause.lastChecked, status: clause.status });
    })
  );
  return [...byUrl.values()];
}

// What one check means. prev is the stored doc (or undefined); result is { ok: true, hash } or { ok: false, error }.
function decide(prev, result) {
  if (!result || !result.ok) return "error";
  if (!prev || !prev.hash) return "baseline";
  return prev.hash === result.hash ? "unchanged" : "changed";
}

// The sources to look at this run: never checked first, then the longest unchecked, at most cap.
function pick(rows, stored, cap) {
  const seen = (row) => (stored.get(row.url) && stored.get(row.url).checkedAt) || "";
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (seen(a.row) < seen(b.row) ? -1 : seen(a.row) > seen(b.row) ? 1 : a.i - b.i))
    .slice(0, cap)
    .map((item) => item.row);
}

async function fetchPage(fetchImpl, url, options) {
  const opts = options || {};
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs || TIMEOUT_MS)
    });
    if (!res.ok) return { ok: false, error: "HTTP " + res.status };
    const text = String(await res.text()).slice(0, MAX_CHARS);
    if (!normalize(text)) return { ok: false, error: "empty page" };
    return { ok: true, hash: hashOf(text) };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error).slice(0, 160) };
  }
}

const day = (iso) => String(iso).slice(0, 10);

// The one issue a run files for all the pages that changed.
function issueFor(changes, now) {
  const when = day(now);
  const lines = changes.map((change) => {
    const cites = change.clauses.map((c) => "`" + c.id + "` (lastChecked " + c.lastChecked + ", " + c.status + ")").join(", ");
    return [
      "- " + change.url + (change.names.length ? " (" + change.names.join("; ") + ")" : ""),
      "  - changed between " + day(change.previousCheckedAt) + " and " + when,
      "  - cited by " + change.clauses.length + " clause" + (change.clauses.length === 1 ? "" : "s") + ": " + cites
    ].join("\n");
  });
  return {
    title: "Legal watch: " + changes.length + " cited source" + (changes.length === 1 ? "" : "s") + " changed (" + when + ")",
    body: [
      "The weekly legal watch (#4004) found that the text of " + (changes.length === 1 ? "a page" : "these pages") + " cited by legal/clauses.json differs from the last check.",
      "",
      ...lines,
      "",
      "Nothing was edited or published: the watch never touches legal/clauses.json, legal/signoff.json or the legal page.",
      "",
      "The owner decides: read the source, and if a clause needs new wording, edit it in legal/clauses.json, run `node scripts/build-legal-html.js`, then re-sign with `node scripts/legal-signoff.js --sign ...` and `--apply` in the same PR (see legal/README.md). If the change does not matter, close this issue; the new text is already the baseline for next week.",
      "",
      "Findings are also in Firestore legal_watch_changes."
    ].join("\n")
  };
}

// One weekly run. db is Firestore, fetchImpl is fetch; openIssue({ title, body }) files the issue and returns { number, html_url }
// (absent or failing: the findings stay in legal_watch_changes and the run reports a warning).
async function run({ db, fetchImpl, clauses, now, cap, pause, openIssue }) {
  const at = now || new Date().toISOString();
  const rows = sources(clauses);
  const watch = db.collection("legal_watch");
  const stored = new Map();
  for (const row of rows) {
    const snap = await watch.doc(docId(row.url)).get();
    if (snap.exists) stored.set(row.url, snap.data());
  }
  const todo = pick(rows, stored, cap || CAP);
  const tally = { checked: 0, baselines: 0, unchanged: 0, changed: 0, errors: 0, skipped: rows.length - todo.length };
  const changes = [];
  for (let i = 0; i < todo.length; i++) {
    if (i && pause !== 0) await new Promise((resolve) => setTimeout(resolve, pause === undefined ? PAUSE_MS : pause));
    const row = todo[i];
    const prev = stored.get(row.url);
    const result = await fetchPage(fetchImpl, row.url);
    const verdict = decide(prev, result);
    tally.checked += 1;
    const ref = watch.doc(docId(row.url));
    if (verdict === "error") {
      tally.errors += 1;
      await ref.set({ url: row.url, hash: (prev && prev.hash) || null, checkedAt: at, status: "error", error: result.error }, { merge: true });
    } else if (verdict === "changed") {
      tally.changed += 1;
      changes.push({ ...row, hash: result.hash, previousHash: prev.hash, previousCheckedAt: prev.checkedAt || at });
    } else {
      tally[verdict === "baseline" ? "baselines" : "unchanged"] += 1;
      await ref.set({ url: row.url, hash: result.hash, checkedAt: at, status: "ok", error: null });
    }
  }
  let issue = null;
  let issueError = null;
  if (changes.length) {
    const changesRef = (change) => db.collection("legal_watch_changes").doc(docId(change.url) + "-" + change.hash.slice(0, 12));
    for (const change of changes) {
      // A finding already filed for this very page text (an earlier run died before it moved the baseline) is not filed twice.
      const known = await changesRef(change).get();
      change.filed = known.exists ? known.data().issue || null : null;
      if (!known.exists) {
        await changesRef(change).set({ url: change.url, names: change.names, clauses: change.clauses, previousHash: change.previousHash, hash: change.hash, previousCheckedAt: change.previousCheckedAt, detectedAt: at, issue: null, issueUrl: null });
      }
    }
    const fresh = changes.filter((change) => !change.filed);
    if (fresh.length && openIssue) {
      try {
        issue = await openIssue(issueFor(fresh, at));
        for (const change of fresh) await changesRef(change).set({ issue: issue.number, issueUrl: issue.html_url }, { merge: true });
      } catch (error) {
        issueError = String((error && error.message) || error).slice(0, 160);
        console.error("Legal watch issue was not opened:", error);
      }
    } else if (fresh.length) {
      issueError = "no GitHub token";
    }
    // The finding is stored either way, so the page's new text is the baseline from here on.
    for (const change of changes) {
      await watch.doc(docId(change.url)).set({ url: change.url, hash: change.hash, checkedAt: at, status: "changed", error: null, changedAt: at, previousHash: change.previousHash });
    }
  }
  const note =
    tally.checked + " of " + rows.length + " sources checked: " + tally.baselines + " baselines, " + tally.unchanged + " unchanged, " + tally.changed + " changed" +
    (issue ? " (issue #" + issue.number + ")" : "") + ", " + tally.errors + " failed to load" + (tally.skipped ? ", " + tally.skipped + " left for next week" : "");
  const warn = (tally.checked > 0 && tally.errors === tally.checked) || issueError;
  return Object.assign({ tally, changes: changes.length, issue }, warn ? { warn: true, note: note + (issueError ? "; changes stored, issue not filed: " + issueError : "; every fetch failed") } : { note });
}

// The clause list the watch reads: legal/clauses.json on main, so the function ships no copy that could drift.
async function loadClauses(fetchImpl) {
  const res = await fetchImpl(CLAUSES_URL, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error("legal/clauses.json answered " + res.status);
  const data = await res.json();
  if (!Array.isArray(data.clauses) || !data.clauses.length) throw new Error("legal/clauses.json has no clauses");
  return data.clauses;
}

module.exports = { CLAUSES_URL, USER_AGENT, CAP, normalize, hashOf, docId, sources, decide, pick, fetchPage, issueFor, run, loadClauses };
