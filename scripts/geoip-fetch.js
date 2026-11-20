#!/usr/bin/env node
// Download the PDDL ip-location-db .mmdb files and upload them to R2 with the cf CLI (#4031).
//   node scripts/geoip-fetch.js --bucket <name> [--prefix geoip/] [--dry-run] [--keep <dir>]
// Bucket defaults to $GEOIP_BUCKET. No Wrangler config exists in workers/ (they use cloudflare.config.ts), so the
// repo rule applies: cf CLI. Files go to a temp dir (or --keep <dir>), are checked with the Worker's own reader, and
// are never written inside the repo. *.mmdb is also in .gitignore. Does not deploy a Worker; the Worker only needs an
// R2 binding named GEOIP on the bucket (see workers/shared/geoip.js).
// Licenses: README of sapics/ip-location-db grants PDDL-1.0 for iptoasn-*, origin-asn, user-country, server-country.
// Never add geolite2-* (MaxMind license) or dbip-* (CC BY 4.0) here (.cursor/rules/tool-arsenal.mdc).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ASN_KEY, DEFAULT_COUNTRY_KEY, parseMmdb } from "../workers/shared/geoip.js";

const BASE = "https://github.com/sapics/ip-location-db/releases/download/latest";
export const FILES = [
  { name: "iptoasn-country.mmdb", key: DEFAULT_COUNTRY_KEY },
  { name: "iptoasn-asn.mmdb", key: DEFAULT_ASN_KEY },
];

export function parseArgs(argv, env = process.env) {
  const out = { bucket: env.GEOIP_BUCKET || "", prefix: "geoip/", dryRun: false, keep: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--bucket") out.bucket = argv[++i] || "";
    else if (a === "--prefix") out.prefix = argv[++i] ?? "";
    else if (a === "--keep") out.keep = argv[++i] || "";
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

// Object key for a file: the default keys carry "geoip/", so a custom --prefix replaces it.
export const keyFor = (file, prefix) => `${prefix}${file.key.replace(/^geoip\//, "")}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bucket) throw new Error("pass --bucket <name> or set GEOIP_BUCKET");
  const dir = args.keep ? (mkdirSync(args.keep, { recursive: true }), args.keep) : mkdtempSync(join(tmpdir(), "geoip-"));
  try {
    for (const file of FILES) {
      const res = await fetch(`${BASE}/${file.name}`, { redirect: "follow" });
      if (!res.ok) throw new Error(`${file.name}: HTTP ${res.status}`);
      const path = join(dir, file.name);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
      const reader = parseMmdb(readFileSync(path)); // throws on a bad download, before anything is uploaded
      const key = keyFor(file, args.prefix);
      console.log(`${file.name}: ${statSync(path).size} bytes, ${reader.metadata.database_type}, built ${new Date(reader.metadata.build_epoch * 1000).toISOString().slice(0, 10)} -> r2://${args.bucket}/${key}`);
      const cmd = ["r2", "buckets", "objects", "upload", key, "--bucket-name", args.bucket, "--file", path, "--content-type", "application/octet-stream"];
      if (args.dryRun) cmd.push("--dry-run");
      const run = spawnSync("cf", cmd, { stdio: "inherit" });
      if (run.status !== 0) throw new Error(`cf upload of ${key} failed (exit ${run.status ?? run.error?.message})`);
    }
  } finally {
    if (!args.keep) rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`geoip-fetch: ${err.message}`); process.exit(1); });
}
