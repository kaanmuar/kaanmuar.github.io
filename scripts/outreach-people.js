#!/usr/bin/env node
/* The outreach ledger (#3136, functions/outreach-people.js): everyone the social, student and company routines reached,
   where they stand, and the trials and codes they got.

     node scripts/outreach-people.js list [--kind social|student|company|live] [--stage <stage>]
     node scripts/outreach-people.js show <id>               e.g. bluesky:ana.dev or web:example.com
     node scripts/outreach-people.js export --csv [--kind] [--stage] > people.csv

   Uses the gcloud login, like scripts/jarvis-outreach-plan.js. */

const path = require("path");
const Module = require("module");
const { execSync } = require("child_process");
const people = require("../functions/outreach-people");

const PROJECT = "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");
const USAGE = "Usage: node scripts/outreach-people.js list [--kind k] [--stage s] | show <id> | export --csv [--kind k] [--stage s]";

function firestore() {
  const fnRequire = Module.createRequire(path.join(FN, "index.js"));
  const { Firestore } = fnRequire("@google-cloud/firestore");
  const { OAuth2Client } = fnRequire("google-auth-library");
  const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
  authClient.setCredentials({ access_token: execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim(), expiry_date: Date.now() + 45 * 60000 });
  return new Firestore({ projectId: PROJECT, authClient });
}

const flag = (argv, name) => { const at = argv.indexOf("--" + name); return at >= 0 ? argv[at + 1] || "" : ""; };
const pad = (v, n) => String(v == null ? "" : v).slice(0, n).padEnd(n);

/** One line per person, then the count at each stage. */
function listText(rows) {
  const lines = rows.map((p) => [pad(p.id, 34), pad(p.kind, 8), pad(p.stage, 13), pad((p.offers || []).map((o) => o.code).join(" "), 28), pad(p.email, 28), String(p.updatedAt || "").slice(0, 16)].join(" "));
  const c = people.counts(rows);
  const stages = people.STAGES.filter((s) => c.stages[s]).map((s) => s + " " + c.stages[s]).join(", ");
  return lines.concat(["", c.total + " people" + (stages ? ": " + stages : "")]).join("\n");
}

async function main(argv, db) {
  const [cmd, arg] = argv;
  const opts = { kind: flag(argv, "kind"), stage: flag(argv, "stage") };
  if (opts.kind && !people.KINDS.includes(opts.kind)) throw new Error("--kind is one of " + people.KINDS.join(", "));
  if (opts.stage && !people.STAGES.includes(opts.stage)) throw new Error("--stage is one of " + people.STAGES.join(", "));
  if (cmd === "list") return listText(await people.listAll(db(), opts));
  if (cmd === "show" && arg) {
    const p = await people.get(db(), arg);
    if (!p) throw new Error("No one with id " + arg + ".");
    return JSON.stringify(p, null, 2);
  }
  if (cmd === "export" && argv.includes("--csv")) return people.toCsv(await people.listAll(db(), opts)).trimEnd();
  throw new Error(USAGE);
}

if (require.main === module) {
  main(process.argv.slice(2), firestore).then((out) => console.log(out)).catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { main, listText };
