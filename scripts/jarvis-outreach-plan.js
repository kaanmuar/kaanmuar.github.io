#!/usr/bin/env node
/* Uploads the private outreach plan to Firestore jarvis_settings/outreach, where only the jarvis function reads it
   (Jarvis > Outreach, #1405). The plan stays out of this repo; keep the JSON in the private outreach folder.

     node scripts/jarvis-outreach-plan.js <plan.json> [--tracker <weekly-kpis.csv>] [--dry]

   plan.json: { start, end, mailDomain, phases[{name,start,end}], milestones[{date,label}], deadlines[{date,label}],
                weekly{prospects, liveReportPct, openPct, replyPct, positivePct}, targets[{key,label,target}] }
   The tracker CSV (week_start, new_prospects, emails_sent, linkedin_requests, positive_replies, calls, paid_reviews,
   partnerships, lectures_webinars, backlinks, clips_posted, ...) adds the weeks and each target's actual so far.
   Uses the gcloud login, like scripts/sweep-outreach.js. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { execSync } = require("child_process");

const PROJECT = "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");
const ACTUALS = { unlocks: "paid_reviews", partnerships: "partnerships", calls: "calls", talks: "lectures_webinars", links: "backlinks", clips: "clips_posted" };
const WEEK_FIELDS = ["new_prospects", "live_reports_ready", "emails_sent", "linkedin_requests", "positive_replies", "calls", "paid_reviews", "partnerships"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = []; let cur = ""; let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const head = split(lines[0] || "");
  return lines.slice(1).map((l) => { const v = split(l); const row = {}; head.forEach((h, i) => { row[h] = v[i] || ""; }); return row; });
}

function tracker(rows) {
  const weeks = rows.filter((r) => DATE.test(r.week_start)).map((r) => {
    const w = { week: r.week_start };
    WEEK_FIELDS.forEach((f) => { w[f] = r[f] === "" ? null : Number(r[f]) || 0; });
    return w;
  });
  const totals = {};
  rows.forEach((r) => Object.keys(r).forEach((k) => { const n = Number(r[k]); if (k !== "week_start" && r[k] !== "" && Number.isFinite(n)) totals[k] = (totals[k] || 0) + n; }));
  return { weeks, totals };
}

function build(plan, track) {
  if (!DATE.test(plan.start || "") || !DATE.test(plan.end || "")) throw new Error("plan.start and plan.end must be YYYY-MM-DD.");
  const dated = (list, keys) => (list || []).map((x) => { keys.forEach((k) => { if (!DATE.test(x[k] || "")) throw new Error("Bad date in " + JSON.stringify(x)); }); return x; });
  const doc = {
    start: plan.start, end: plan.end, mailDomain: String(plan.mailDomain || ""),
    phases: dated(plan.phases, ["start", "end"]).map((p) => ({ name: String(p.name), start: p.start, end: p.end })),
    milestones: dated(plan.milestones, ["date"]).map((m) => ({ date: m.date, label: String(m.label).slice(0, 140) })),
    deadlines: dated(plan.deadlines, ["date"]).map((d) => ({ date: d.date, label: String(d.label).slice(0, 140) })),
    weekly: plan.weekly || {},
    targets: (plan.targets || []).map((t) => {
      const field = ACTUALS[t.key];
      const actual = track && field && track.totals[field] !== undefined ? track.totals[field] : null;
      return { key: String(t.key), label: String(t.label), target: Number(t.target) || 0, actual };
    }),
    tracker: track ? { weeks: track.weeks.slice(-16), linkedinRequests: track.totals.linkedin_requests || 0, emailsSent: track.totals.emails_sent || 0 } : null,
    updatedAt: new Date().toISOString()
  };
  return doc;
}

function firestore() {
  const fnRequire = Module.createRequire(path.join(FN, "index.js"));
  const { Firestore } = fnRequire("@google-cloud/firestore");
  const { OAuth2Client } = fnRequire("google-auth-library");
  const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
  authClient.setCredentials({ access_token: execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim(), expiry_date: Date.now() + 45 * 60000 });
  return new Firestore({ projectId: PROJECT, authClient });
}

async function main(argv) {
  const file = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--tracker");
  if (!file) throw new Error("Usage: node scripts/jarvis-outreach-plan.js <plan.json> [--tracker <csv>] [--dry]");
  const at = argv.indexOf("--tracker");
  const track = at >= 0 ? tracker(parseCsv(fs.readFileSync(argv[at + 1], "utf8"))) : null;
  const doc = build(JSON.parse(fs.readFileSync(file, "utf8")), track);
  console.log(`${doc.phases.length} phases, ${doc.milestones.length} milestones, ${doc.deadlines.length} deadlines, ${doc.targets.length} targets` + (track ? `, ${track.weeks.length} tracker weeks` : ""));
  if (argv.includes("--dry")) return;
  await firestore().collection("jarvis_settings").doc("outreach").set(doc);
  console.log("Saved jarvis_settings/outreach.");
}

if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { parseCsv, tracker, build };
