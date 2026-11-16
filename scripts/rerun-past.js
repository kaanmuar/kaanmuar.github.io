#!/usr/bin/env node
/* Bootstrap / control the finished-report re-run (#3458).

   node scripts/rerun-past.js --dry-run              count hosts from a JSON dump of url_reviews
   node scripts/rerun-past.js --start                set campaign status to running (no hosts yet)
   node scripts/rerun-past.js --pause | --resume
   node scripts/rerun-past.js --bootstrap <file.json> [--write]
     file.json is an array of url_reviews-like rows (or { reviews: [...] }).
     Without --write, prints counts only. With --write, upserts pending host docs and sets hosts.

   Live reviews need PAST_RERUN_LIVE=1 and SWEEP_LIVE=1 on the functions. */
"use strict";

const fs = require("fs");
const path = require("path");
const past = require("../functions/url-review-rerun-past");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
};

function loadRows(file) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  return Array.isArray(raw) ? raw : (raw.reviews || raw.rows || []);
}

function summarize(hosts) {
  const by = { visitor: 0, rival: 0, sweep: 0 };
  let withMail = 0;
  hosts.forEach((h) => {
    by[h.kind] = (by[h.kind] || 0) + 1;
    if (past.mailAddress(h, { stops: new Set(), contacted: h.kind === "visitor" ? new Set([h.email]) : new Set(h.contacted ? [h.email] : []) })) withMail += 1;
  });
  return { hosts: hosts.length, by, withMail };
}

async function main() {
  if (flag("--dry-run") && argValue("--dry-run")) {
    // allow `--dry-run file` or `--bootstrap file` without write
  }

  if (flag("--start") || flag("--pause") || flag("--resume")) {
    const { Firestore } = require("@google-cloud/firestore");
    const db = new Firestore({ projectId: process.env.GCLOUD_PROJECT || "carlosm-interactive-cv" });
    const ref = past.campaignRef(db);
    const status = flag("--pause") ? "paused" : flag("--resume") || flag("--start") ? "running" : "running";
    await ref.set({ status, updatedAt: new Date().toISOString(), ticket: 3458 }, { merge: true });
    console.log(JSON.stringify({ ok: true, status, id: past.ID }));
    return;
  }

  const file = argValue("--bootstrap") || argValue("--dry-run") || args.find((a) => a.endsWith(".json"));
  if (!file) {
    console.error("Usage: node scripts/rerun-past.js --bootstrap <reviews.json> [--write] | --start | --pause | --resume");
    process.exit(1);
  }
  const hosts = past.hostsFromReviews(loadRows(file)).map((h) => Object.assign({}, h, {
    contacted: h.kind === "visitor" && !!h.email
  }));
  const summary = summarize(hosts);
  console.log(JSON.stringify(summary, null, 2));
  if (!flag("--write")) return;

  const { Firestore } = require("@google-cloud/firestore");
  const db = new Firestore({ projectId: process.env.GCLOUD_PROJECT || "carlosm-interactive-cv" });
  const ref = past.campaignRef(db);
  let written = 0;
  for (const host of hosts) {
    const doc = past.hostRef(db, host.bare);
    const snap = await doc.get();
    if (snap.exists && snap.get("state") && snap.get("state") !== "pending") continue;
    await doc.set({
      host: host.host,
      bare: host.bare,
      kind: host.kind,
      email: host.email || "",
      lang: host.lang || "en",
      priorId: host.priorId || "",
      contacted: host.contacted === true,
      state: "pending",
      at: new Date(host.at || Date.now()).toISOString()
    }, { merge: true });
    written += 1;
  }
  await ref.set({
    status: "running",
    hosts: hosts.length,
    reviewed: 0,
    mailed: 0,
    skipped: 0,
    ticket: 3458,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log(JSON.stringify({ written, hosts: hosts.length, status: "running" }));
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
