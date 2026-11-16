"use strict";
/* Gemini's PageSpeed fixes (#1978): for the worst pages the safe fixes leave under the threshold, Gemini reads the page,
   the local scripts and styles PageSpeed flags, and what each audit found, and answers with exact find/replace edits.
   An edit lands only when its text occurs once in a file it was shown. Its branch always goes to Proposals. */
const { ORIGIN } = require("./pages");
const routine = require("./routine");

const API = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL = "gemini-flash-latest";
const PAGES = 3;
const PAGE_MAX = 60000;
const ASSET_MAX = 40000;
const EDITS_MAX = 6;
const ASSET_AUDITS = ["render-blocking-insight", "unused-javascript", "unused-css-rules", "unminified-css", "unminified-javascript", "legacy-javascript-insight", "forced-reflow-insight"];

const dir = (file) => file.split("/").slice(0, -1).join("/");

/** The worst pages under the threshold, one per folder (pages in one folder usually share a template). */
function pick(pages, readText) {
  const seen = new Set();
  return pages.filter((p) => routine.needsFix(p)).sort(routine.worstFirst).filter((p) => {
    const html = readText(p.file);
    if (!html || html.length > PAGE_MAX || seen.has(dir(p.file))) return false;
    seen.add(dir(p.file));
    return true;
  }).slice(0, PAGES);
}

function assets(page, readText) {
  const out = new Set();
  ["mobile", "desktop"].forEach((m) => ASSET_AUDITS.forEach((id) => ((((page[m] || {}).audits || {})[id] || {}).items || []).forEach((i) => {
    let u;
    try { u = new URL(i.url || "", page.url); } catch (error) { return; }
    if (u.origin !== ORIGIN || !/\.(m?js|css)$/i.test(u.pathname)) return;
    const f = decodeURIComponent(u.pathname).replace(/^\//, "");
    const text = readText(f);
    if (text && text.length <= ASSET_MAX && !/\.min\./.test(f)) out.add(f);
  })));
  return Array.from(out).slice(0, 3);
}

function findings(page) {
  return ["mobile", "desktop"].map((m) => {
    const r = page[m] || {};
    if (r.ok === false) return m + ": no result";
    return m + " score " + r.score + " (LCP " + r.lcp + " ms, TBT " + r.tbt + " ms, CLS " + r.cls + ")\n" + Object.keys(r.audits || {}).map((id) => {
      const a = r.audits[id];
      return "- " + id + ": " + a.title + (a.items || []).slice(0, 5).map((i) => "\n    " + [i.url, i.node && i.node.snippet, i.wastedMs ? i.wastedMs + " ms" : "", i.wastedBytes ? i.wastedBytes + " B" : ""].filter(Boolean).join(" · ")).join("");
    }).join("\n");
  }).join("\n\n");
}

function prompt(page, files) {
  return "You speed up one page of carlosandmunoz.com, a static site on GitHub Pages behind Cloudflare. PageSpeed (Lighthouse 13) found:\n\n"
    + findings(page) + "\n\nFiles (path, then content):\n"
    + Object.keys(files).map((f) => "=== " + f + "\n" + files[f]).join("\n\n")
    + "\n\nPropose at most " + EDITS_MAX + " edits that raise the PageSpeed score in both mobile and desktop without changing what a visitor sees or can do."
    + " Rules: each edit is an exact find/replace inside one of the files above; `find` must be copied character for character and occur exactly once in that file;"
    + " keep the Content-Security-Policy, analytics, consent, structured data, translations and accessibility as they are; add no new third-party requests;"
    + " skip anything you are not sure is safe. Return no edits if nothing is safe.\n"
    + "Answer with JSON only: {\"summary\":\"one sentence\",\"edits\":[{\"file\":\"\",\"find\":\"\",\"replace\":\"\",\"why\":\"under 120 characters\"}]}";
}

function parse(text) {
  const body = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const a = body.indexOf("{");
  const b = body.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Gemini did not answer in JSON.");
  return JSON.parse(body.slice(a, b + 1));
}

const count = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

/** Applies the edits whose find text occurs once in a file Gemini was shown. texts: { path: content }. */
function apply(texts, edits) {
  const out = Object.assign({}, texts);
  const applied = [];
  const skipped = [];
  (Array.isArray(edits) ? edits : []).slice(0, EDITS_MAX).forEach((e) => {
    const file = String((e && e.file) || "");
    const find = String((e && e.find) || "");
    const replace = String((e && e.replace) === undefined ? "" : e.replace);
    const why = String((e && e.why) || "").slice(0, 160);
    if (!(file in out)) return skipped.push({ file, reason: "not a file it was shown" });
    if (!find || find === replace) return skipped.push({ file, reason: "empty or no change" });
    const n = count(out[file], find);
    if (n !== 1) return skipped.push({ file, reason: n ? "the text occurs " + n + " times" : "the text is not in the file" });
    out[file] = out[file].replace(find, () => replace);
    applied.push({ file, why });
  });
  return { texts: out, applied, skipped };
}

async function ask(fetchImpl, env, text) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  const res = await fetchImpl(API + (env.GEMINI_MODEL || MODEL) + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8000, responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(180000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Gemini " + res.status + ": " + String((data.error || {}).message || "no answer").slice(0, 160));
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  return parts.map((p) => p.text || "").join("");
}

module.exports = { MODEL, PAGES, EDITS_MAX, pick, assets, findings, prompt, parse, apply, ask };
