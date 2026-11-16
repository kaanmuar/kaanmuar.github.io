#!/usr/bin/env node
/* The Reddit sync (#2614): the comments the Reddit app (reddit/live-reports) logged under our posts go to Jarvis, and
   the replies Carlos approved come back for the app's next upload. functions/engagement-reddit.js has the loop;
   .github/workflows/reddit-engagement.yml runs it every hour.

     node scripts/reddit-engagement.js pair             a new REDDIT_ENGAGEMENT_TOKEN: its hash into Firestore (with
                                                        this Mac's gcloud sign-in) and the token into the repo secret
     node scripts/reddit-engagement.js sync [logs]      the app's log lines (`devvit logs --json`) to Jarvis; writes the
                                                        approved replies to reddit/live-reports/engagement.json and
                                                        upload=true|false to GITHUB_OUTPUT (without logs, only the
                                                        replies, for the daily upload in reddit-live.yml)
     node scripts/reddit-engagement.js uploaded         tells Jarvis the replies in that file went out with a new version

   sync and uploaded sign with REDDIT_ENGAGEMENT_TOKEN. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const Ledger = require("./reddit-ledger");

const PROJECT = "carlosm-interactive-cv";
const REPO = "kaanmuar/kaanmuar.github.io";
const ENDPOINT = process.env.JARVIS_URL || "https://us-central1-" + PROJECT + ".cloudfunctions.net/jarvis";
const OUT = path.join(__dirname, "../reddit/live-reports/engagement.json");

/** The app's engagement lines in a log dump: comments (one per id, the latest line wins) and reply results. */
function records(text) {
  const comments = new Map();
  const results = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const msg = Ledger.textOf(line);
    const i = msg.indexOf(Ledger.PREFIX);
    if (i < 0) return;
    let rec;
    try { rec = JSON.parse(msg.slice(i + Ledger.PREFIX.length).trim()); } catch (error) { return; }
    if (!rec || !Number.isFinite(Date.parse(rec.at || ""))) return;
    if (rec.kind === "comments" && Array.isArray(rec.items)) {
      rec.items.forEach((c) => { if (c && c.id && (!comments.has(c.id) || comments.get(c.id).at <= rec.at)) comments.set(c.id, Object.assign({}, c, { at: rec.at })); });
    } else if (rec.kind === "replied" || rec.kind === "reply-failed") results.push(rec);
  });
  return { comments: [...comments.values()].map(({ at, ...c }) => c), results: results.sort((a, b) => a.at.localeCompare(b.at)) };
}

async function call(body) {
  const token = process.env.REDDIT_ENGAGEMENT_TOKEN || "";
  if (!token) throw new Error("Set REDDIT_ENGAGEMENT_TOKEN (node scripts/reddit-engagement.js pair).");
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "x-reddit-token": token }, body: JSON.stringify(Object.assign({ op: "engagement-reddit-sync" }, body)), signal: AbortSignal.timeout(120000) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error("Jarvis answered " + res.status + ": " + (out.error || "no answer"));
  return out;
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, key + "=" + value + "\n");
}

async function sync(file) {
  const got = records(file ? fs.readFileSync(file, "utf8") : "");
  const out = await call(got);
  fs.writeFileSync(OUT, JSON.stringify(out.queue || []));
  const upload = !!out.upload && (out.queue || []).length > 0;
  output("upload", upload);
  console.log(`Comments logged: ${got.comments.length}; new in Jarvis: ${out.chained} (${out.drafted} answers drafted). Replies confirmed posted: ${out.posted}. Approved, waiting for the app: ${(out.queue || []).length}; upload: ${upload ? "yes" : "no"}.` + (out.aiError ? " Gemini: " + out.aiError : ""));
}

async function uploaded() {
  const keys = JSON.parse(fs.readFileSync(OUT, "utf8")).map((x) => x.key);
  await call({ uploaded: keys });
  console.log(`Jarvis knows ${keys.length} approved replies went out with the new version.`);
}

async function pair() {
  const token = crypto.randomBytes(32).toString("hex");
  const access = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  const doc = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/engagement_private/reddit";
  const res = await fetch(doc + "?updateMask.fieldPaths=tokenHash&updateMask.fieldPaths=pairedAt", {
    method: "PATCH", headers: { Authorization: "Bearer " + access, "Content-Type": "application/json", "x-goog-user-project": PROJECT },
    body: JSON.stringify({ fields: { tokenHash: { stringValue: crypto.createHash("sha256").update(token).digest("hex") }, pairedAt: { stringValue: new Date().toISOString() } } })
  });
  if (!res.ok) throw new Error("Firestore answered " + res.status + ": " + (await res.text()).slice(0, 300) + "\nSign in with: gcloud auth login");
  execFileSync("gh", ["secret", "set", "REDDIT_ENGAGEMENT_TOKEN", "--repo", REPO], { input: token, stdio: ["pipe", "inherit", "inherit"] });
  console.log("Paired: reddit-engagement.yml now signs its syncs with the new REDDIT_ENGAGEMENT_TOKEN.");
}

if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  const run = cmd === "pair" ? pair() : cmd === "sync" ? sync(arg) : cmd === "uploaded" ? uploaded() : Promise.reject(new Error("usage: reddit-engagement.js pair | sync [logs] | uploaded"));
  run.catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { records, OUT };
