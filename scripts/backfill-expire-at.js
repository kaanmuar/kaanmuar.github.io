#!/usr/bin/env node
// Gives rows written before the Firestore TTL policies an `expireAt` timestamp, so TTL deletes them too.
// Dry run by default; pass --write to update. Uses the signed-in gcloud account.
const { execSync } = require("child_process");
const core = require("../functions/url-review-core");
const auth = require("../functions/url-review-auth");

const PROJECT = process.env.GCLOUD_PROJECT || "carlosm-interactive-cv";
const BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";
const FIELDS = ["retainUntil", "status", "createdAt", "lastSignInAt", "expiresAt", "expireAt"];
const HOUR = 60 * 60 * 1000;
const at = (iso, plus) => (Date.parse(iso || "") ? new Date(Date.parse(iso) + (plus || 0)) : null);
const RULES = {
  url_reviews: (row) => row.retainUntil ? at(row.retainUntil)
    : ["blocked", "payment-due"].includes(row.status) ? at(row.createdAt, core.RETAIN_MS) : null,
  url_review_accounts: (row) => at(row.retainUntil) || at(row.lastSignInAt, auth.ACCOUNT_MS),
  url_review_sign_ins: (row) => at(row.createdAt, Math.max(auth.CODE_MS, HOUR)) || at(row.expiresAt),
  url_review_sessions: (row) => at(row.expiresAt),
  url_review_oauth: (row) => at(row.expiresAt)
};

const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

async function call(url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer " + token, "content-type": "application/json", "x-goog-user-project": PROJECT },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(url + ": " + JSON.stringify(data.error || data));
  return data;
}

async function* rows(name) {
  let page = "";
  do {
    const query = FIELDS.map((field) => "mask.fieldPaths=" + field).concat("pageSize=300", page ? "pageToken=" + page : []).join("&");
    const data = await call(BASE + "/" + name + "?" + query);
    for (const doc of data.documents || []) {
      const fields = doc.fields || {};
      const row = {};
      FIELDS.forEach((field) => { if (fields[field]) row[field] = fields[field].stringValue || fields[field].timestampValue || ""; });
      yield { path: doc.name, row };
    }
    page = data.nextPageToken || "";
  } while (page);
}

async function main() {
  const write = process.argv.includes("--write");
  for (const [name, rule] of Object.entries(RULES)) {
    const tally = { rows: 0, set: 0, past: 0, kept: 0, had: 0 };
    let writes = [];
    const flush = async () => {
      if (write && writes.length) await call(BASE + ":batchWrite", { writes });
      writes = [];
    };
    for await (const { path, row } of rows(name)) {
      tally.rows += 1;
      if (row.expireAt) { tally.had += 1; continue; }
      const when = rule(row);
      if (!when) { tally.kept += 1; continue; }
      tally.set += 1;
      if (when.getTime() < Date.now()) tally.past += 1;
      writes.push({
        update: { name: path, fields: { expireAt: { timestampValue: when.toISOString() } } },
        updateMask: { fieldPaths: ["expireAt"] },
        currentDocument: { exists: true }
      });
      if (writes.length === 400) await flush();
    }
    await flush();
    console.log(name, JSON.stringify(tally));
  }
  if (!write) console.log("Dry run. Pass --write to update.");
}

main().catch((error) => { console.error(error.message); process.exit(1); });
