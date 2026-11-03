"use strict";
/* The pages the daily PageSpeed routine (#1978) checks: every <loc> in sitemap.xml and sitemap-social.xml, once each,
   with the file in this repo that serves it. */
const fs = require("fs");
const path = require("path");

const ORIGIN = "https://carlosandmunoz.com";
const SITEMAPS = ["sitemap.xml", "sitemap-social.xml"];

function locs(xml) {
  return Array.from(String(xml || "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g), (m) => m[1].replace(/&amp;/g, "&"));
}

// "/" and "/dir/" serve index.html; anything else is the file at that path. Off-site URLs have no file.
function fileFor(url) {
  let u;
  try { u = new URL(url); } catch (error) { return null; }
  if (u.origin !== ORIGIN) return null;
  let p = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  if (!p || p.endsWith("/")) p += "index.html";
  if (p.split("/").includes("..")) return null;
  return p;
}

function urlFor(file) {
  const f = String(file).replace(/\\/g, "/").replace(/^\/+/, "");
  return ORIGIN + "/" + (f === "index.html" ? "" : f.replace(/(^|\/)index\.html$/, "$1"));
}

function pages(root) {
  const seen = new Set();
  const out = [];
  SITEMAPS.forEach((name) => {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) return;
    locs(fs.readFileSync(file, "utf8")).forEach((url) => {
      if (seen.has(url)) return;
      seen.add(url);
      const local = fileFor(url);
      out.push({ url, file: local && fs.existsSync(path.join(root, local)) ? local : null, sitemap: name });
    });
  });
  return out;
}

module.exports = { ORIGIN, SITEMAPS, locs, fileFor, urlFor, pages };
