#!/usr/bin/env node
/* The Reddit ledger (#2571): what the Reddit app (reddit/live-reports) posted in r/QALabLiveReports, and the
   subreddit's members, so Jarvis confirms each Live Reports batch on Reddit the way it does Telegram (#2560).
   Reddit's Data API takes no new apps without approval and reddit.com answers 403 to the runners, so the app logs one
   line per batch post and per daily run, and reddit-live.yml reads them back with `devvit logs --json`:

     qalab-ledger {"kind":"post","key":"live/2026-11-04","id":"t3_abc","url":"https://www.reddit.com/r/...",
                   "posted":"<ISO>","at":"<ISO>","subreddit":"QALabLiveReports","subscribers":12}
     qalab-ledger {"kind":"members","at":"<ISO>","subreddit":"QALabLiveReports","subscribers":12}

     npx devvit logs QALabLiveReports qalab-live-reports --since 3d --json | node scripts/reddit-ledger.js [--dry-run]

   Each post goes into assets/social/reddit.json (scripts/social-ledger.js) under its batch key, and the member count
   into its members; scripts/commit-social-ledgers.sh commits it. */

const fs = require("fs");
const ledgers = require("./social-ledger");

const LEDGER = "assets/social/reddit.json";
const PREFIX = "qalab-ledger ";
const KEY = /^live\/\d{4}-\d{2}-\d{2}$/;

// `devvit logs --json` wraps each line in an object; plain output and stray CLI lines pass through as text.
function textOf(line) {
  const raw = String(line || "").trim();
  if (!raw.startsWith("{")) return raw;
  try {
    const json = JSON.parse(raw);
    return typeof json === "string" ? json : String(json.message || json.msg || json.log || json.text || (json.data && json.data.message) || raw);
  } catch (error) {
    return raw;
  }
}

/** The app's ledger records in a log dump, oldest first. */
function parse(text) {
  const out = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const msg = textOf(line);
    const i = msg.indexOf(PREFIX);
    if (i < 0) return;
    try {
      const rec = JSON.parse(msg.slice(i + PREFIX.length).trim());
      if (rec && (rec.kind === "post" || rec.kind === "members") && Number.isFinite(Date.parse(rec.at || ""))) out.push(rec);
    } catch (error) { /* a line cut by the log stream */ }
  });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function apply(book, records, now) {
  const checked = new Date(now).toISOString();
  const keys = new Set();
  records.forEach((rec) => {
    const chat = rec.subreddit ? "r/" + rec.subreddit : "";
    if (rec.kind === "post" && KEY.test(rec.key || "") && rec.id) {
      ledgers.record(book, rec.key, {
        channel: "reddit", profile: "Reddit " + (chat || "r/QALabLiveReports"), id: String(rec.id),
        at: Number.isFinite(Date.parse(rec.posted || "")) ? new Date(rec.posted).toISOString() : rec.at,
        result: "sent", url: rec.url || "", checked
      });
      keys.add(rec.key);
    }
    ledgers.count(book, chat, rec.subscribers, rec.at);
  });
  return [...keys].sort();
}

function run(text, opts) {
  const o = Object.assign({ now: Date.now(), dry: false, log: console.log, file: LEDGER }, opts);
  const records = parse(text);
  const book = ledgers.read(o.file);
  const keys = apply(book, records, o.now);
  if (!o.dry && records.length) ledgers.write(o.file, book);
  const m = book.members;
  o.log(records.length
    ? records.length + " ledger lines from the Reddit app: " + (keys.length ? keys.length + " batch posts (" + keys.join(", ") + ")" : "no batch post") + (m ? "; " + m.chat + " has " + m.members + " members" : "") + (o.dry ? ". Dry run: " + o.file + " not written." : ".")
    : "No ledger lines in the Reddit app's logs; " + o.file + " is unchanged.");
  return { records, keys, book };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  run(fs.readFileSync(file || 0, "utf8"), { dry: argv.includes("--dry-run") });
}

module.exports = { LEDGER, PREFIX, textOf, parse, apply, run };
