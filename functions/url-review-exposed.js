"use strict";

/* Exposed files (#3085): a public /.git/, .env, backup, database dump, phpinfo page, server status or folder listing.
   Carlos, 2026-11-09: the probes run only after the asker proved the site is theirs (core.proveOwner). Without proof the
   report gets one neutral note at most, and Live Reports never carry any of it (url-review-publish.js).
   Each probe is one GET with Range, read up to MAX_BYTES and never redirected. A hit needs the file's own signature and a
   body unlike the made-up path's, so a site that answers 200 for every path finds nothing. A finding keeps only the
   key name or header that proves the exposure; values are never kept. */
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { say, some } = require("./url-review-findings-en");

const RANGE_END = 2047;
const MAX_BYTES = 4096;
const MAX_REQUESTS = 20;
const BUDGET_MS = 15000;
const REQUEST_MS = 5000;
const PARALLEL = 3;
const HIDDEN = "•••";

const SEVERITY = { git: "critical", svn: "critical", env: "critical", config: "critical", dump: "critical", archive: "critical", json: "high", phpinfo: "high", status: "medium", dsstore: "medium", listing: "medium" };

const looksHtml = (text) => /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(text);
const clip = (text, max) => String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

function envProof(text) {
  if (looksHtml(text)) return "";
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !/^\s*#/.test(line));
  const keys = lines.map((line) => (line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{1,63})\s*=/) || [])[1]).filter(Boolean);
  if (keys.length < 2 || keys.length < lines.length / 2) return "";
  return (keys.find((key) => /PASS|SECRET|KEY|TOKEN/.test(key)) || keys[0]) + "=" + HIDDEN;
}

function sqlProof(text) {
  if (looksHtml(text)) return "";
  const dump = text.match(/^-- (MySQL dump|MariaDB dump|PostgreSQL database dump|phpMyAdmin SQL Dump)/m);
  if (dump) return "-- " + dump[1];
  const statement = text.match(/^\s*(CREATE TABLE(?: IF NOT EXISTS)?|INSERT INTO|DROP TABLE IF EXISTS)\s+([`"\w.]{1,64})/im);
  return statement ? statement[1].toUpperCase() + " " + statement[2] + " …" : "";
}

const PROBES = [
  { path: "/.git/HEAD", kind: "git", proof: (r) => looksHtml(r.text) ? "" : clip((r.text.match(/^ref: refs\/heads\/[^\s]{1,60}\s*$|^[0-9a-f]{40}\s*$/) || [])[0], 80) },
  { path: "/.git/config", kind: "git", proof: (r) => !looksHtml(r.text) && /^\s*\[core\]\s*$/m.test(r.text) && /repositoryformatversion|filemode\s*=|bare\s*=/i.test(r.text) ? "[core]" : "" },
  { path: "/.env", kind: "env", proof: (r) => envProof(r.text) },
  { path: "/.env.production", kind: "env", proof: (r) => envProof(r.text) },
  { path: "/.svn/entries", kind: "svn", proof: (r) => !looksHtml(r.text) && (/^\d{1,2}\s*$/.test(r.text) || /^\d{1,2}\n\ndir\n/.test(r.text) || /<wc-entries/.test(r.text)) ? say("sec-exposed.proof.svn") : "" },
  { path: "/wp-config.php.bak", kind: "config", proof: (r) => {
    if (!/<\?php/.test(r.text)) return "";
    const names = [...r.text.matchAll(/define\s*\(\s*['"](DB_NAME|DB_USER|DB_PASSWORD|DB_HOST|AUTH_KEY)['"]/g)].map((m) => m[1]);
    return names.length ? "define('" + (names.includes("DB_PASSWORD") ? "DB_PASSWORD" : names[0]) + "', " + HIDDEN + ")" : "";
  } },
  { path: "/backup.zip", kind: "archive", proof: (r) => r.bytes.length >= 4 && r.bytes[0] === 0x50 && r.bytes[1] === 0x4b && (r.bytes[2] === 3 || r.bytes[2] === 5) ? say("sec-exposed.proof.zip") : "" },
  { path: "/backup.sql", kind: "dump", proof: (r) => sqlProof(r.text) },
  { path: "/db.sql", kind: "dump", proof: (r) => sqlProof(r.text) },
  { path: "/.DS_Store", kind: "dsstore", proof: (r) => r.bytes.length >= 8 && r.bytes.subarray(0, 8).equals(Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31])) ? say("sec-exposed.proof.dsstore") : "" },
  { path: "/config.json", kind: "json", proof: (r) => {
    if (!/^\s*[{[]/.test(r.text)) return "";
    const key = r.text.match(/"((?:db_?|database_?|smtp_?|mail_?|admin_?)?pass(?:word|wd)?|[\w-]*secret[\w-]*|private_?key|aws_secret_access_key|connection_?string)"\s*:\s*"[^"]{3,}"/i);
    return key ? "\"" + key[1] + "\": \"" + HIDDEN + "\"" : "";
  } },
  { path: "/phpinfo.php", kind: "phpinfo", proof: (r) => clip((r.text.match(/PHP Version\s*[\d.]+/) || [])[0] || (/<title>\s*phpinfo\(\)\s*<\/title>/i.test(r.text) ? "phpinfo()" : ""), 40) },
  { path: "/server-status", kind: "status", proof: (r) => /Apache Server Status for/i.test(r.text) ? "Apache Server Status" : /Server uptime/i.test(r.text) && /requests currently being processed/i.test(r.text) ? "Server uptime" : "" }
].concat(["/wp-content/uploads/", "/uploads/", "/backup/"].map((path) => ({
  path,
  kind: "listing",
  proof: (r) => /<title>\s*Index of \//i.test(r.text) || /<h1>\s*Index of \//i.test(r.text) || /Directory listing for \//i.test(r.text) || /\[To Parent Directory\]/i.test(r.text) ? "Index of " + path : ""
})));

// One capped GET: Range for the first 2 KB, no redirect, no compression, cut at MAX_BYTES if the server ignores Range.
function read(target, opts) {
  const lib = target.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "http:" ? 80 : 443),
      path: target.pathname + target.search,
      method: "GET",
      timeout: REQUEST_MS,
      headers: { "user-agent": opts.agent, accept: "*/*", "accept-encoding": "identity", range: "bytes=0-" + RANGE_END, connection: "close" },
      lookup: opts.lookup
    }, (res) => {
      const chunks = [];
      let size = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve({ status: res.statusCode, type: String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase(), body: Buffer.concat(chunks).subarray(0, MAX_BYTES) });
      };
      res.on("data", (chunk) => {
        if (done) return;
        chunks.push(chunk);
        size += chunk.length;
        if (size >= MAX_BYTES) { finish(); req.destroy(); }
      });
      res.on("end", finish);
      res.on("error", reject);
    });
    const deadline = setTimeout(() => req.destroy(new Error("no answer in time")), REQUEST_MS + 1000);
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy(new Error("no answer in time")));
    req.on("error", reject);
    req.end();
  });
}

function shape(res, path) {
  const bytes = Buffer.isBuffer(res && res.body) ? res.body.subarray(0, MAX_BYTES) : Buffer.from(String((res && res.body) || "").slice(0, MAX_BYTES));
  const text = bytes.toString("latin1");
  return { status: (res && res.status) || 0, bytes, text, same: text.split(path).join("").slice(0, 1024) };
}

const answered = (r) => r.status === 200 || r.status === 206;

// deps: { get(url) -> { status, type, body: Buffer }, allowed(path) -> bool, halt() -> bool, now() -> ms }.
async function probe(origin, deps) {
  const now = deps.now || Date.now;
  const stop = now() + (deps.budgetMs || BUDGET_MS);
  const allowed = deps.allowed || (() => true);
  const halted = () => (deps.halt && deps.halt()) || now() > stop;
  let requests = 0;
  const get = async (path) => {
    requests += 1;
    try { return shape(await deps.get(origin + path), path); } catch (error) { return null; }
  };
  const missing = "/qa-lab-review-" + crypto.randomBytes(4).toString("hex") + "-not-found";
  const baseline = await get(missing);
  const out = { ran: true, checked: 0, skipped: 0, found: [] };
  const queue = PROBES.slice();
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!allowed(item.path) || halted() || requests >= MAX_REQUESTS) { out.skipped += 1; continue; }
      const res = await get(item.path);
      if (!res) { out.skipped += 1; continue; }
      out.checked += 1;
      if (!answered(res)) continue;
      if (baseline && answered(baseline) && baseline.same === res.same) continue;
      const proof = item.proof(res);
      if (proof) out.found.push({ kind: item.kind, path: item.path, proof });
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  out.requests = requests;
  out.found.sort((a, b) => PROBES.findIndex((p) => p.path === a.path) - PROBES.findIndex((p) => p.path === b.path));
  return out;
}

// Findings for insights.analyze: one per kind of exposure, a pass when nothing was exposed, or the locked note.
function checks(exposed, add) {
  if (!exposed) return;
  if (exposed.locked) {
    add("Security", "person", "info", "sec-exposed", say("sec-exposed-locked.title"), say("sec-exposed-locked.evidence"), say("sec-exposed-locked.fix"), { effort: "minutes" });
    return;
  }
  const found = exposed.found || [];
  const kinds = [...new Set(found.map((row) => row.kind))].filter((kind) => SEVERITY[kind]);
  kinds.forEach((kind) => {
    const rows = found.filter((row) => row.kind === kind);
    add("Security", "fail", SEVERITY[kind], "sec-exposed-" + kind, say("sec-exposed-" + kind + ".title"),
      say("sec-exposed.evidence", { list: some(rows.map((row) => say("pathNote", { path: row.path, note: row.proof })), 4) }),
      say("sec-exposed-" + kind + ".fix"), { pages: rows.map((row) => row.path), count: rows.length, effort: "hours" });
  });
  if (!kinds.length && exposed.checked) add("Security", "pass", "info", "sec-exposed", say("sec-exposed.pass.title"), say("sec-exposed.pass.evidence", { n: exposed.checked }), "");
}

module.exports = { PROBES, SEVERITY, MAX_BYTES, MAX_REQUESTS, BUDGET_MS, HIDDEN, read, probe, checks };
