#!/usr/bin/env node
/* Builds the Reddit app from the site's own files (#2549): live.html, the ring script and styles, and the report data
   as of this build. Reddit does not let an app fetch a personal domain, so each upload carries that day's data and
   the Live Reports workflow uploads a new version after every batch.

     node scripts/build.mjs        public/ (the web view) and dist/server/index.cjs */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(APP, "../..");
const PUB = path.join(APP, "public");
const TOP = 3;

function copy(from, to) {
  fs.mkdirSync(path.dirname(path.join(PUB, to)), { recursive: true });
  fs.cpSync(path.join(ROOT, from), path.join(PUB, to), { recursive: true });
}

fs.rmSync(PUB, { recursive: true, force: true });
fs.mkdirSync(PUB, { recursive: true });

["js/qa-review-live.js", "js/live-host.js", "js/fusion/boot.js", "js/fusion/fx.js", "js/fusion/shaders.js",
  "css/qa-review-live.css", "css/live-app.css", "assets/qa-review-mark.svg", "assets/live-reports"].forEach((file) => copy(file, file));

// The web view only loads its own files, so the site's Google Fonts come from @fontsource.
const FONTS = [
  ["Inter", "inter", "normal", [400, 500, 600, 700]],
  ["Instrument Serif", "instrument-serif", "normal", [400]],
  ["Instrument Serif", "instrument-serif", "italic", [400]]
];
const faces = [];
fs.mkdirSync(path.join(PUB, "fonts"), { recursive: true });
FONTS.forEach(([family, pkg, style, weights]) => weights.forEach((weight) => ["latin", "latin-ext"].forEach((subset) => {
  const file = `${pkg}-${subset}-${weight}-${style}.woff2`;
  fs.copyFileSync(path.join(APP, "node_modules/@fontsource", pkg, "files", file), path.join(PUB, "fonts", file));
  faces.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;src:url(../fonts/${file}) format("woff2")}`);
})));
fs.writeFileSync(path.join(PUB, "css/fonts.css"), faces.join("\n") + "\n");

let html = fs.readFileSync(path.join(ROOT, "live.html"), "utf8");
const drop = [/^\s*<meta http-equiv="Content-Security-Policy"[^\n]*\n/m, /^\s*<script src="https:\/\/telegram\.org[^\n]*\n/m,
  /^\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n/m, /^\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^\n]*\n/m,
  /^\s*<meta name="live-telegram-app"[^\n]*\n/m];
drop.forEach((re) => {
  if (!re.test(html)) throw new Error("live.html changed: " + re + " no longer matches; update scripts/build.mjs");
  html = html.replace(re, "");
});
html = html.replace('<html lang="en">', '<html lang="en" data-live-host="reddit">')
  .replace(/(\s*)<script src="js\/live-host\.js/, '$1<script type="module" src="live-reddit.js"></script>$1<link rel="stylesheet" href="css/fonts.css">$1<script src="js/live-host.js');
fs.writeFileSync(path.join(PUB, "live.html"), html);
fs.copyFileSync(path.join(APP, "src/client/splash.html"), path.join(PUB, "splash.html"));

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/live-reports/index.json"), "utf8"));
const reports = index.reports || [];
const newest = reports.map((r) => r.read || "").sort().pop() || "";
const fresh = reports.filter((r) => r.read === newest);
const pick = (r) => ({ id: r.id, name: r.name, host: r.host, flag: r.flag, overall: r.overall, grade: r.grade });
const summary = {
  count: reports.length,
  newest,
  fresh: fresh.length,
  top: fresh.slice().sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name)).slice(0, TOP).map(pick)
};
fs.writeFileSync(path.join(PUB, "summary.json"), JSON.stringify(summary));
fs.mkdirSync(path.join(APP, "dist"), { recursive: true });
fs.writeFileSync(path.join(APP, "dist/summary.json"), JSON.stringify(summary));

// The campaign posts that come due before the next upload (#2606); the server posts each on its slot.
const CAMPAIGN_AHEAD = 48 * 3600e3;
const campaign = createRequire(import.meta.url)(path.join(ROOT, "scripts/open-social-queue.js")).redditPosts(Date.now(), CAMPAIGN_AHEAD, ROOT);
fs.writeFileSync(path.join(APP, "dist/campaign.json"), JSON.stringify(campaign));

// The replies Carlos approved for comments under our posts (#2614), written by scripts/reddit-engagement.js sync.
const approvedFile = path.join(APP, "engagement.json");
const approved = fs.existsSync(approvedFile) ? JSON.parse(fs.readFileSync(approvedFile, "utf8")) : [];
fs.writeFileSync(path.join(APP, "dist/engagement.json"), JSON.stringify(Array.isArray(approved) ? approved : []));

await esbuild.build({ entryPoints: [path.join(APP, "src/client/live-reddit.js"), path.join(APP, "src/client/splash.js")], bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, outdir: PUB, logLevel: "warning" });
await esbuild.build({ entryPoints: [path.join(APP, "src/server/index.js")], bundle: true, format: "cjs", platform: "node", target: "node22", outfile: path.join(APP, "dist/server/index.cjs"), logLevel: "warning" });

let bytes = 0;
let files = 0;
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p); else { bytes += fs.statSync(p).size; files += 1; }
  });
})(PUB);
console.log(`public/: ${files} files, ${(bytes / 1048576).toFixed(1)} MB. ${summary.count} reports, ${summary.fresh} from ${summary.newest}. ${campaign.length} campaign posts due in the next ${CAMPAIGN_AHEAD / 3600e3} h. ${approved.length} approved replies.`);
