#!/usr/bin/env node
/* Outreach sequence F (#2158): the natural competitors of real URL Review askers, as candidate hosts.
     node scripts/rival-prospects.js --dir <outreach folder> --out <csv> [--max 40]
   Reads url_reviews (customer runs only: no source, not a test, not a test or owner email) and each report's
   rivals and per-field rivals, then leaves out webmail, social and AI platforms, government portals, global
   sites, the askers themselves and every host or domain already in the outreach folder's prospects/week*-*.csv,
   warm-education.csv or do-not-contact.csv. Writes host,cc,language,segment,rank,rival_of; rival_of stays in the
   private outreach folder and never goes into an email. The list still needs a read before prospects/week<N>-rivals.csv:
   the finder also returns suppliers, sister domains of the asker and same-name sites in other markets. Emails are
   found by hand, as for the other sequences.
   Uses the signed-in gcloud account. */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { execSync } = require("child_process");
const sweep = require("../functions/url-review-sweep");
const rivals = require("../functions/url-review-rivals");
const { isCustomer } = require("../functions/jarvis-notify");
const { isTestEmail } = require("../functions/jarvis-core");
const { parseCsv } = require("./sweep-outreach");

const PROJECT = process.env.GCLOUD_PROJECT || "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");
const OWNER = /@carlosandmunoz\.com$/i;
// Search results name these next to almost any site; none of them is anyone's competitor.
const PLATFORM = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|aol|proton|chatgpt|openai|tumblr|lnkd|medium|blogspot|wordpress|wix|substack|github|t|bit|tinyurl)\.[a-z.]+$/;
const PUBLIC = /(^|\.)(gov|gob|mil|int)(\.[a-z]{2})?$|unglobalcompact\.org$/;
const TLD_CC = { uk: "gb" };

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

function db() {
  const fnRequire = Module.createRequire(path.join(FN, "index.js"));
  const { Firestore } = fnRequire("@google-cloud/firestore");
  const { OAuth2Client } = fnRequire("google-auth-library");
  const token = () => execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
  authClient.setCredentials({ access_token: token() });
  return new Firestore({ projectId: PROJECT, authClient });
}

function ccOf(host, fallback) {
  const tld = host.split(".").pop();
  if (tld.length === 2) return TLD_CC[tld] || tld;
  return String(fallback || "").toLowerCase();
}

// Hosts and registrable domains already contacted or ruled out, from every CSV in prospects/.
function known(dir, own) {
  const out = new Set();
  const folder = path.join(dir, "prospects");
  const files = fs.existsSync(folder) ? fs.readdirSync(folder)
    .filter((f) => /^(week\d+-.+|warm-education|do-not-contact)\.csv$/.test(f) && !/-rival-candidates\.csv$/.test(f) && f !== own) : [];
  for (const f of files) {
    const [head, ...rows] = parseCsv(fs.readFileSync(path.join(folder, f), "utf8"));
    const cols = head.map((k) => k.trim().toLowerCase());
    for (const row of rows) {
      cols.forEach((k, i) => {
        if (!["host", "email", "email_or_domain"].includes(k) || !row[i]) return;
        const value = rivals.bare(row[i].split("@").pop());
        out.add(value);
        out.add(sweep.suffixRegistrable(value));
      });
    }
  }
  return out;
}

// [{ host, cc, language, segment, rank, rival_of }] from the url_reviews documents, plus why the others were left out.
function candidates(docs, skip) {
  const askers = new Map();
  for (const doc of docs) {
    if (!isCustomer(doc) || isTestEmail(doc.email || "") || OWNER.test(doc.email || "")) continue;
    const host = rivals.bare(doc.report.host);
    const lists = [doc.report.rivals, ...Object.values(doc.report.rivalsBy || {})].filter(Boolean).map((r) => r.list || []);
    const a = askers.get(host) || { cc: doc.country, list: [] };
    a.list.push(...lists.flat());
    askers.set(host, a);
  }
  const seen = new Map();
  const left = {};
  const out = (why) => { left[why] = (left[why] || 0) + 1; };
  for (const [asker, { cc, list }] of askers) {
    for (const entry of list) {
      const host = rivals.bare(entry.host);
      const rank = entry.rank && entry.rank.rank;
      if (!host || seen.has(host)) continue;
      seen.set(host, true);
      if (askers.has(host)) out("an asker");
      else if (rivals.NOISE.some((item) => host === item || host.endsWith("." + item)) || PLATFORM.test(host) || rivals.shady(host) || sweep.BLOCKED.test(host) || sweep.RESERVED.test(host)) out("platform");
      else if (PUBLIC.test(host)) out("public body");
      else if (rank && rank <= sweep.GLOBAL_RANK) out("global site");
      else if (skip.has(host) || skip.has(sweep.suffixRegistrable(host))) out("already in outreach");
      else {
        const hostCc = ccOf(host, cc);
        seen.set(host, { host, cc: hostCc, language: sweep.langOf(hostCc), segment: /(^|\.)(edu|ac)(\.[a-z]{2})?$/.test(host) ? "university" : "company", rank: rank || "", rival_of: asker });
      }
    }
  }
  return { rows: [...seen.values()].filter((v) => v !== true), left };
}

function toCsv(rows) {
  const cols = ["host", "cc", "language", "segment", "rank", "rival_of"];
  const cell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((k) => cell(r[k] ?? "")).join(","))].join("\n") + "\n";
}

async function main() {
  const dir = arg("--dir");
  const file = arg("--out");
  if (!dir || !file) throw new Error("Usage: node scripts/rival-prospects.js --dir <outreach folder> --out <csv> [--max 40]");
  const snap = await db().collection("url_reviews").select("source", "test", "email", "country", "report.host", "report.rivals", "report.rivalsBy").get();
  const { rows, left } = candidates(snap.docs.map((d) => d.data()), known(dir, path.basename(file)));
  const picked = rows.slice(0, Number(arg("--max", 40)));
  fs.writeFileSync(file, toCsv(picked));
  console.log(`${picked.length} candidates written to ${path.basename(file)}; left out: ${JSON.stringify(left)}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message || error); process.exit(1); });

module.exports = { candidates, ccOf, toCsv };
