#!/usr/bin/env node
// Gives rows written before the Firestore TTL policies an `expireAt` timestamp, so TTL deletes them too.
// Dry run by default; pass --write to update. Uses the signed-in gcloud account.
const { execSync } = require("child_process");
const core = require("../functions/url-review-core");
const auth = require("../functions/url-review-auth");

const PROJECT = process.env.GCLOUD_PROJECT || "carlosm-interactive-cv";
const BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";
// url_review_free_runs and coupons the operator made by hand (no `validUntil`) are never given one: they must not expire.
const FIELDS = ["retainUntil", "status", "createdAt", "lastSignInAt", "expiresAt", "expireAt", "at", "sentAt", "validUntil"];
const HOUR = 60 * 60 * 1000;
const at = (iso, plus) => (Date.parse(iso || "") ? new Date(Date.parse(iso) + (plus || 0)) : null);
// A row with no date of its own is kept 12 months from this run.
const year = (iso) => at(iso, core.RETAIN_MS) || new Date(Date.now() + core.RETAIN_MS);
const PAYMENTS = ["monthly-pass", "run-credit", "run-credit-used"];
const paid = (iso) => core.paymentExpireAt(Date.parse(iso || "") ? iso : undefined);
const RULES = {
  url_reviews: (row) => PAYMENTS.includes(row.status) ? paid(row.createdAt) : at(row.retainUntil) || year(row.createdAt),
  url_review_accounts: (row) => at(row.retainUntil) || at(row.lastSignInAt, auth.ACCOUNT_MS),
  url_review_sign_ins: (row) => at(row.createdAt, Math.max(auth.CODE_MS, HOUR)) || at(row.expiresAt),
  url_review_sessions: (row) => at(row.expiresAt),
  url_review_oauth: (row) => at(row.expiresAt),
  url_review_opens: (row) => year(row.createdAt),
  url_review_notes: (row) => row.status === "follow-stop" ? null : year(row.createdAt),
  url_review_stop_links: (row) => year(row.createdAt),
  url_review_redemptions: (row) => paid(row.at),
  url_review_alerts: (row) => year(row.at),
  url_review_captures: (row) => year(row.at),
  url_review_stops: (row) => at(row.at, auth.RUN_MS) || new Date(Date.now() + auth.RUN_MS),
  url_review_coupons: (row) => row.validUntil ? year(row.createdAt) : null,
  mail: (row) => year(row.sentAt || row.createdAt)
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
