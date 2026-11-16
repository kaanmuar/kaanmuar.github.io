"use strict";
/* Lighthouse on a local copy of the site (#1978): main and the fix branch are each served from a checkout, and every
   page is scored in both modes, base and head taking turns, so the two meet the same machine load. PageSpeed only
   tests live URLs, so this is how a fix branch is scored before it merges.
   lighthouse and chrome-launcher are not in package.json: the workflow installs them under LH_PREFIX. */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");
const { ORIGIN } = require("./pages");
const { summarize } = require("./psi");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".mp4": "video/mp4", ".webm": "video/webm", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
// Analytics and beacons vary run to run and are the same on both sides, so they are blocked.
const BLOCKED = ["*googletagmanager.com*", "*google-analytics.com*", "*cloudflareinsights.com*", "*clarity.ms*"];

// The path GitHub Pages would serve for a request, or null.
function servedFile(root, urlPath) {
  let p;
  try { p = decodeURIComponent(String(urlPath).split(/[?#]/)[0]); } catch (error) { return null; }
  const rel = path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
  const full = path.join(root, rel);
  if (!full.startsWith(path.resolve(root))) return null;
  const tries = [full, path.join(full, "index.html"), full + ".html"];
  return tries.find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) || null;
}

function serve(root) {
  const server = http.createServer((req, res) => {
    const file = servedFile(root, req.url);
    if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
    const ext = path.extname(file).toLowerCase();
    let body = fs.readFileSync(file);
    // Absolute links to the live site would load the live files, not this checkout's.
    if (ext === ".html" || ext === ".css") body = Buffer.from(body.toString("utf8").split(ORIGIN + "/").join("/"));
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "max-age=3600" });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

async function load(prefix) {
  const req = createRequire(path.join(prefix || process.env.LH_PREFIX || process.cwd(), "_.js"));
  const lighthouse = (await import(pathToFileURL(req.resolve("lighthouse")).href)).default;
  const desktop = (await import(pathToFileURL(path.join(path.dirname(req.resolve("lighthouse")), "config", "desktop-config.js")).href)).default;
  const launcher = await import(pathToFileURL(req.resolve("chrome-launcher")).href);
  return { lighthouse, desktop, launcher };
}

const median = (list) => {
  const v = list.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};

/* files: repo paths of the pages; base, head: checkout roots. Returns [{ file, mobile: { before, after, runs }, desktop }]
   where before and after are the median scores (0-100) of `runs` runs. */
async function measure({ files, base, head, runs, modes, prefix, log }) {
  const lib = await load(prefix);
  const chrome = await lib.launcher.launch({ chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
  const sides = { before: await serve(base), after: await serve(head) };
  const scores = {};
  const say = log || (() => {});
  try {
    for (let r = 0; r < (runs || 5); r += 1) {
      for (const file of files) {
        for (const mode of modes || ["mobile", "desktop"]) {
          for (const side of r % 2 ? ["after", "before"] : ["before", "after"]) {
            const url = "http://127.0.0.1:" + sides[side].port + "/" + file.replace(/(^|\/)index\.html$/, "$1");
            let score = null;
            try {
              const out = await lib.lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance"], blockedUrlPatterns: BLOCKED }, mode === "desktop" ? lib.desktop : undefined);
              score = summarize(out && out.lhr).score;
            } catch (error) {
              say("lighthouse failed on " + file + " (" + mode + ", " + side + "): " + error.message);
            }
            const k = file + "|" + mode + "|" + side;
            (scores[k] = scores[k] || []).push(score);
            say(file + " " + mode + " " + side + " run " + (r + 1) + ": " + score);
          }
        }
      }
    }
  } finally {
    Object.values(sides).forEach((s) => s.server.close());
    await chrome.kill();
  }
  return files.map((file) => (modes || ["mobile", "desktop"]).reduce((row, mode) => {
    const b = scores[file + "|" + mode + "|before"] || [];
    const a = scores[file + "|" + mode + "|after"] || [];
    row[mode] = { before: median(b), after: median(a), runs: Math.min(b.length, a.length) };
    return row;
  }, { file }));
}

// --- where images sit -------------------------------------------------------------------------------------------

const VIEWPORTS = { mobile: { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true }, desktop: { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false } };

async function devtools(port) {
  const target = await (await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("DevTools did not connect.")); });
  let id = 0;
  const waits = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    const w = d.id && waits.get(d.id);
    if (!w) return;
    waits.delete(d.id);
    if (d.error) w.reject(new Error(d.error.message)); else w.resolve(d.result);
  };
  const send = (method, params) => new Promise((resolve, reject) => { id += 1; waits.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  return { send, close: () => ws.close() };
}

const PLACES = "(() => Array.from(document.querySelectorAll('img,iframe')).map((el) => { const r = el.getBoundingClientRect(); "
  + "return { tag: el.tagName.toLowerCase(), src: el.getAttribute('src') || '', top: Math.round(r.top + scrollY), shown: r.width > 0 && r.height > 0 }; }))()";

/* Where each <img> and <iframe> starts on the page, in both viewports, after load: { file: { mobile: [], desktop: [],
   vh: { mobile, desktop } } }. The safe fixer lazy-loads only what starts below 1.5 screens in both. */
async function positions({ root, files, prefix, log }) {
  const lib = await load(prefix);
  const chrome = await lib.launcher.launch({ chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
  const site = await serve(root);
  const tab = await devtools(chrome.port);
  const out = {};
  try {
    await tab.send("Page.enable");
    for (const file of files) {
      out[file] = { vh: {} };
      for (const mode of Object.keys(VIEWPORTS)) {
        try {
          await tab.send("Emulation.setDeviceMetricsOverride", VIEWPORTS[mode]);
          await tab.send("Page.navigate", { url: "http://127.0.0.1:" + site.port + "/" + file.replace(/(^|\/)index\.html$/, "$1") });
          const until = Date.now() + 15000;
          while (Date.now() < until) {
            const s = await tab.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
            if (s.result.value === "complete") break;
            await new Promise((r) => setTimeout(r, 250));
          }
          await new Promise((r) => setTimeout(r, 400));
          out[file][mode] = (await tab.send("Runtime.evaluate", { expression: PLACES, returnByValue: true })).result.value || [];
          out[file].vh[mode] = VIEWPORTS[mode].height;
        } catch (error) {
          (log || (() => {}))("Could not place the images on " + file + " (" + mode + "): " + error.message);
        }
      }
    }
  } finally {
    tab.close();
    site.server.close();
    await chrome.kill();
  }
  return out;
}

module.exports = { BLOCKED, VIEWPORTS, servedFile, serve, median, measure, positions };
