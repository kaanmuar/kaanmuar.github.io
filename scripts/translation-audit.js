#!/usr/bin/env node
/*
 * Translation audit: opens the machine-translated pages in each language,
 * waits for Google Translate to finish, and lists the words and phrases the
 * glossary says are wrong for that language and this site.
 *
 *   node scripts/translation-audit.js                 # es pt de fr it, writes previews/translation-audit/
 *   node scripts/translation-audit.js es --raw        # Spanish only, glossary switched off (the "before" view)
 *
 * Needs the static server (python3 scripts/static-server.py 8642) and network
 * access to translate.googleapis.com.
 */
const fs = require("fs");
const path = require("path");
require("./playwright-sandbox");
const { chromium } = require("@playwright/test");
const Glossary = require("../js/site-glossary.js");

const BASE = process.env.AUDIT_BASE_URL || "http://127.0.0.1:8642/";
const OUT = path.join(__dirname, "..", "previews", "translation-audit");
const args = process.argv.slice(2);
const raw = args.includes("--raw");
const langs = args.filter((a) => !a.startsWith("--"));
const LANGS = langs.length ? langs : ["es", "pt", "de", "fr", "it"];
const TERMS = fs.readFileSync(path.join(__dirname, "..", "js", "qa-review.js"), "utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];
const REVIEW_PAGE = { es: "qa-review-es.html", pt: "qa-review-pt.html", de: "qa-review-de.html", fr: "qa-review-fr.html", it: "qa-review-it.html" };

function cell(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function pages(lang) {
  return [
    ["URL Review + sample report", REVIEW_PAGE[lang] + "?sample=1"],
    ["URL Review guide", "qa-review-guide.html?lang=" + lang],
    ["URL Review disclaimers", "qa-review-legal.html?lang=" + lang],
    ["Regression lab", "qa-lab.html?lang=" + lang]
  ];
}

async function settle(page) {
  let last = -1;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(750);
    const n = await page.evaluate(() => document.querySelectorAll("font").length);
    if (n > 0 && n === last) return n;
    last = n;
  }
  return last;
}

async function harvest(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const host = node.parentElement;
      if (!host || host.closest("script, style, noscript, pre, code")) continue;
      const text = node.nodeValue.replace(/\s+/g, " ").trim();
      if (text.length < 3 || seen.has(text)) continue;
      const mt = !!host.closest("font");
      const curated = !mt && !!host.closest("[translate='no'], .notranslate");
      if (!mt && !curated) continue;
      seen.add(text);
      out.push({ text, source: mt ? "machine" : "curated" });
    }
    return out;
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const summary = [];
  for (const lang of LANGS) {
    const lines = ["# Translation audit · " + lang + (raw ? " · glossary off" : ""), "", "Generated " + new Date().toISOString() + " from " + BASE, ""];
    let langHits = 0;
    let langNodes = 0;
    for (const [label, url] of pages(lang)) {
      const context = await browser.newContext({ locale: lang, viewport: { width: 1280, height: 900 } });
      await context.addInitScript(([code, off, terms]) => {
        try {
          localStorage.setItem("site-translate", "picked");
          localStorage.setItem("hasSeenReviewTour", "true");
          localStorage.setItem("hasSeenTour", "true");
          localStorage.setItem("qa-review-analytics", "necessary");
          localStorage.setItem("site-analytics", "necessary");
          localStorage.setItem("cv-preferred-lang", code);
          sessionStorage.setItem("qa-review-terms", terms);
          if (off) window.__glossaryOff = true;
        } catch (e) { /* storage is optional */ }
      }, [lang, raw, TERMS]);
      const page = await context.newPage();
      await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
      const fonts = await settle(page);
      await page.waitForTimeout(1500);
      const nodes = await harvest(page);
      const hits = [];
      nodes.forEach((node) => {
        Glossary.check(node.text, lang).forEach((rule) => hits.push({ rule, text: node.text, source: node.source }));
      });
      langHits += hits.length;
      langNodes += nodes.length;
      lines.push("## " + label, "", "`" + url + "` · " + nodes.length + " translated strings (" + fonts + " machine-translated runs) · **" + hits.length + " flagged**", "");
      if (hits.length) {
        lines.push("| Rule | Text |", "| --- | --- |");
        hits.forEach((h) => lines.push("| " + cell(h.rule) + " | " + cell(h.text.slice(0, 180)) + (h.source === "curated" ? " *(curated)*" : "") + " |"));
        lines.push("");
      }
      fs.writeFileSync(path.join(OUT, lang + "-" + url.split(/[.?]/)[0] + (raw ? "-raw" : "") + ".json"), JSON.stringify(nodes, null, 1));
      await context.close();
    }
    lines.splice(3, 0, "**" + langHits + " flagged** in " + langNodes + " translated strings.", "");
    fs.writeFileSync(path.join(OUT, lang + (raw ? "-raw" : "") + ".md"), lines.join("\n") + "\n");
    summary.push(lang + ": " + langHits + " flagged / " + langNodes + " strings");
  }
  await browser.close();
  console.log(summary.join("\n"));
})().catch((error) => { console.error(error); process.exit(1); });
