#!/usr/bin/env node
// Queues and sends the owner notice (#351) for every site on Live Reports, through the same
// queueOwnerNotice and sendOwnerNotice the desk uses, so every hold-back rule applies.
// A batch-run card with no review record gets one from its saved report first (#515).
// Dry run by default; pass --send to queue and send. Uses the signed-in gcloud account.
// Writes a CSV of every site and its outcome to --out (default: ./owner-notices-<date>.csv)
// and mails a summary with that CSV to the review alert address.
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { execSync } = require("child_process");

const PROJECT = process.env.GCLOUD_PROJECT || "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");
const SEND = process.argv.includes("--send");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : "owner-notices-" + new Date().toISOString().slice(0, 10) + ".csv";
const PAUSE_MS = 1500;

fs.readFileSync(path.join(FN, ".env"), "utf8").split("\n").forEach((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
});
const gcloud = (args) => execSync("gcloud " + args, { encoding: "utf8" }).trim();
if (SEND && !process.env.SENDGRID_API_KEY) {
  process.env.SENDGRID_API_KEY = gcloud("secrets versions access latest --secret=SENDGRID_API_KEY --project " + PROJECT);
}

const fnRequire = Module.createRequire(path.join(FN, "index.js"));
const { Firestore, Timestamp } = fnRequire("@google-cloud/firestore");
const { OAuth2Client } = fnRequire("google-auth-library");
const fresh = () => ({ access_token: gcloud("auth print-access-token"), expiry_date: Date.now() + 45 * 60000 });
const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
authClient.refreshHandler = async () => fresh();
authClient.setCredentials(fresh());
const db = new Firestore({ projectId: PROJECT, authClient });

fnRequire("firebase-admin/firestore").getFirestore = () => db;

const file = path.join(FN, "index.js");
const indexModule = new Module(file, module);
indexModule.filename = file;
indexModule.paths = Module._nodeModulePaths(FN);
indexModule._compile(fs.readFileSync(file, "utf8") +
  "\nmodule.exports.__notices = { queueOwnerNotice, sendQueuedNotice, liveReportIndex, keepUntil, unlistedHosts, ownerStops, sgMail, REVIEW_ALERT_TO };\n", file);
const fn = indexModule.exports.__notices;
const ownerNotice = fnRequire("./url-review-owner-notice");
const publish = fnRequire("./url-review-publish");
const liveReports = require("./build-live-reports");

// Batch-run cards (runs-3, runs-100, ...) were built from saved reports, not from a review, so they have
// no url_reviews record for the claim link to open (#515). Their report file, by card id.
function savedReports() {
  const byId = new Map();
  liveReports.RUN_FILES.forEach(({ file }) => {
    let runs = [];
    try { runs = liveReports.loadRuns(file); } catch (error) { runs = []; }
    runs.forEach((run) => {
      if (run && run.id && run.report && !byId.has(run.id)) byId.set(run.id, path.join(liveReports.REPORTS, run.report + "-current.json"));
    });
  });
  return byId;
}

// A complete review record for a batch-run card, dated on its read day so the daily Live Reports job,
// which reads records created since its last run, does not publish it again.
function batchRecord(card, file) {
  const id = "batch-" + card.id;
  const read = new Date((card.read || "") + "T12:00:00Z");
  return {
    id,
    status: "complete",
    email: "",
    reasonCode: "batch-run",
    series: card.series || "",
    frameworks: [],
    lang: (card.langs && card.langs.lang) || "en",
    createdAt: Timestamp.fromDate(isNaN(read) ? new Date() : read),
    retainUntil: fn.keepUntil().toISOString(),
    expireAt: fn.keepUntil(),
    report: Object.assign(JSON.parse(fs.readFileSync(file, "utf8")), { id })
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const csv = (value) => /[",\n]/.test(String(value == null ? "" : value)) ? "\"" + String(value).replace(/"/g, "\"\"") + "\"" : String(value == null ? "" : value);

async function latestRecords() {
  const snap = await db.collection("url_reviews").select("report.host", "createdAt").get();
  const byHost = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const host = publish.bare(data.report && data.report.host);
    const at = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : String(data.createdAt || "");
    if (host && (!byHost.has(host) || byHost.get(host).at < at)) byHost.set(host, { id: doc.id, at });
  });
  return byHost;
}

function sendQueued(domain) {
  return fn.sendQueuedNotice(db.collection("url_review_owner_notices").doc(domain), "owner-notice-send-all");
}

async function main() {
  const [index, records, unlisted] = await Promise.all([fn.liveReportIndex(), latestRecords(), fn.unlistedHosts()]);
  const saved = savedReports();
  const cards = index.reports || [];
  console.log((SEND ? "SEND" : "DRY RUN") + ": " + cards.length + " Live Reports, " + records.size + " reviewed hosts");
  const rows = [];
  for (const card of cards) {
    const host = publish.bare(card.host);
    const domain = ownerNotice.domainOf(host);
    const row = { host, domain, cardId: card.id, outcome: "", reason: "", email: "", source: "", sourceUrl: "", sentAt: "" };
    rows.push(row);
    try {
      let hit = records.get(host);
      let record = null;
      if (!hit) {
        const file = saved.get(card.id);
        if (!file || !fs.existsSync(file)) { Object.assign(row, { outcome: "skipped", reason: "no-review-record" }); continue; }
        if (!SEND) { Object.assign(row, { outcome: "would-backfill" }); continue; }
        record = batchRecord(card, file);
        await db.collection("url_reviews").doc(record.id).set(record);
        hit = { id: record.id };
        row.reason = "backfilled";
      } else {
        record = (await db.collection("url_reviews").doc(hit.id).get()).data();
      }
      const [stopped, last] = await Promise.all([fn.ownerStops([], domain), db.collection("url_review_owner_notices").doc(domain).get()]);
      const lastNotice = last.exists ? last.data() : null;
      const held = ownerNotice.heldBack(record, { unlisted, stopped, notice: lastNotice });
      if (held && !(lastNotice && lastNotice.status === "pending")) { Object.assign(row, { outcome: "skipped", reason: held }); continue; }
      if (!SEND) {
        const contacts = ownerNotice.rankContacts((record.report.contacts && record.report.contacts.found) || [], host);
        Object.assign(row, { outcome: "would-send", reason: contacts.length ? "" : "needs-web-search", email: lastNotice && lastNotice.status === "pending" ? lastNotice.email : (contacts[0] ? contacts[0].email : "") });
        continue;
      }
      if (!lastNotice || lastNotice.status !== "pending") await fn.queueOwnerNotice(Object.assign({ id: hit.id }, record));
      Object.assign(row, await sendQueued(domain));
      if (row.outcome === "sent") await sleep(PAUSE_MS);
    } catch (error) {
      Object.assign(row, { outcome: "failed", reason: String((error && error.message) || error).slice(0, 200) });
    }
    console.log([row.outcome, host, row.email, row.reason].filter(Boolean).join("  "));
  }
  const head = ["host", "domain", "cardId", "outcome", "reason", "email", "source", "sourceUrl", "sentAt"];
  fs.writeFileSync(OUT, [head.join(",")].concat(rows.map((row) => head.map((key) => csv(row[key])).join(","))).join("\n") + "\n");
  const tally = {};
  rows.forEach((row) => { const key = row.outcome + (row.reason && row.outcome !== "sent" ? ": " + row.reason : ""); tally[key] = (tally[key] || 0) + 1; });
  const summary = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([key, n]) => n + "  " + key).join("\n");
  console.log("\n" + summary + "\n\nCSV: " + OUT);
  if (!SEND) return;
  const sentRows = rows.filter((row) => row.outcome === "sent");
  fn.sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  await fn.sgMail.send({
    to: fn.REVIEW_ALERT_TO,
    from: process.env.SENDGRID_FROM,
    subject: "Owner notices sent: " + sentRows.length + " of " + rows.length + " Live Reports",
    text: "Owner notices (#351) for every site on Live Reports, sent " + new Date().toISOString() + ".\n\n" + summary +
      "\n\nSent:\n" + sentRows.map((row) => row.host + "  ->  " + row.email + "  (" + row.source + ")").join("\n") +
      "\n\nEvery site and its outcome is in the attached CSV, and each send is in Firestore url_review_owner_notice_log.",
    attachments: [{ content: Buffer.from(fs.readFileSync(OUT)).toString("base64"), filename: path.basename(OUT), type: "text/csv", disposition: "attachment" }],
    categories: ["url-review-owner-notice-summary"]
  });
  console.log("Summary mailed to " + fn.REVIEW_ALERT_TO);
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
