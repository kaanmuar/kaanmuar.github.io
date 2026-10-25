#!/usr/bin/env node
/* Outreach prospects for the nightly sweep (#1280): Firestore url_review_sweep/outreach { hosts: [{ host, cc, sector }] }.
     node scripts/sweep-outreach.js add prospects.csv [--dry]   # CSV with host (or url), cc and segment/sector columns
     node scripts/sweep-outreach.js status                      # how many are queued, reviewed, and tonight's share
   The sweep reviews the list in order before the country lap, up to OUTREACH_PER_DAY a night, and keeps a cursor,
   so hosts are only ever appended; a host already on the list is skipped. Only hosts, countries and sectors are
   stored, never a name or an email. Uses the signed-in gcloud account. */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { execSync } = require("child_process");
const sweep = require("../functions/url-review-sweep");

const PROJECT = process.env.GCLOUD_PROJECT || "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// A CSV row as { host, cc, sector }, or a reason it was left out.
function prospectOf(row) {
  const raw = String(row.host || row.url || "").trim().toLowerCase();
  const host = sweep.hostOf(/^https?:\/\//.test(raw) ? raw.replace(/^http:/, "https:") : "https://" + raw);
  const cc = String(row.cc || "").trim().toLowerCase();
  if (!host || !host.includes(".")) return { skip: "no host" };
  if (sweep.BLOCKED.test(host) || sweep.RESERVED.test(host)) return { skip: "blocked" };
  if (!/^[a-z]{2}$/.test(cc)) return { skip: "no two-letter cc" };
  return { host, cc, sector: String(row.sector || row.segment || "").trim().toLowerCase().slice(0, 40) };
}

function readProspects(file) {
  const [head, ...rows] = parseCsv(fs.readFileSync(file, "utf8"));
  const keys = head.map((k) => k.trim().toLowerCase());
  return rows.map((cells) => prospectOf(Object.fromEntries(keys.map((k, i) => [k, cells[i] || ""]))));
}

function db() {
  const fnRequire = Module.createRequire(path.join(FN, "index.js"));
  const { Firestore } = fnRequire("@google-cloud/firestore");
  const { OAuth2Client } = fnRequire("google-auth-library");
  const fresh = () => ({ access_token: execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim(), expiry_date: Date.now() + 45 * 60000 });
  const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
  authClient.refreshHandler = async () => fresh();
  authClient.setCredentials(fresh());
  return new Firestore({ projectId: PROJECT, authClient });
}

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "add" && file) {
    const read = readProspects(file);
    const skipped = read.filter((p) => p.skip);
    const store = db();
    const ref = store.collection("url_review_sweep").doc("outreach");
    const added = await store.runTransaction(async (tx) => {
      const hosts = ((await tx.get(ref)).data() || {}).hosts || [];
      const known = new Set(hosts.map((h) => h.host));
      const fresh = read.filter((p) => !p.skip && !known.has(p.host) && known.add(p.host));
      if (!process.argv.includes("--dry")) tx.set(ref, { hosts: hosts.concat(fresh), updated: new Date().toISOString() });
      return fresh;
    });
    console.log((process.argv.includes("--dry") ? "Would add " : "Added ") + added.length + " hosts; " + skipped.length + " rows left out" +
      (skipped.length ? " (" + [...new Set(skipped.map((s) => s.skip))].join(", ") + ")" : ""));
    return;
  }
  if (cmd === "status") {
    const store = db();
    const [list, state] = await Promise.all(["outreach", "state"].map((id) => store.collection("url_review_sweep").doc(id).get()));
    const hosts = (list.data() || {}).hosts || [];
    const s = state.data() || {};
    const day = new Date().toISOString().slice(0, 10);
    const at = Math.min(Number(s.outreachAt) || 0, hosts.length);
    console.log(hosts.length + " on the list, " + at + " taken by the sweep, " + (hosts.length - at) + " waiting; " +
      ((((s.days || {})[day] || {}).outreach) || 0) + " of " + sweep.OUTREACH_PER_DAY + " reviewed today (" + day + ")");
    return;
  }
  console.error("usage: node scripts/sweep-outreach.js add <file.csv> [--dry] | status");
  process.exit(2);
}

if (require.main === module) main().catch((error) => { console.error(error.message || error); process.exit(1); });

module.exports = { parseCsv, prospectOf };
