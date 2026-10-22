#!/usr/bin/env node
/* Schedules a rendered social batch on the QA-lab Facebook Page through the Graph API. Buffer's free
   plan has no room for a Facebook channel, so the Page is posted to directly.

     FACEBOOK_PAGE_ID=... FACEBOOK_PAGE_TOKEN=... node scripts/facebook-queue.js --batch auto-2026-10-22 [--dry-run]

   Reads the same captions.json and calendar.csv as buffer-queue.js and posts each feed image with its
   facebook caption and alt text at its calendar time. The token is a Page access token with
   pages_manage_posts. Exits 1 when any post failed, after trying all of them. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const GRAPH = "https://graph.facebook.com/" + (process.env.FACEBOOK_GRAPH_VERSION || "v23.0");
// The Graph API only schedules between 10 minutes and 30 days ahead.
const MIN_LEAD_MS = 20 * 60e3;
const MAX_LEAD_MS = 29 * 24 * 3600e3;

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

// calendar.csv times are Bogotá wall-clock (UTC-5, no daylight saving).
function facebookSlots(dir) {
  const when = {};
  const lines = fs.readFileSync(path.join(dir, "calendar.csv"), "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [date, time, channel, slug] = line.split(",");
    if (channel === "facebook") when[slug] = new Date(date + "T" + time + ":00-05:00").getTime();
  }
  return when;
}

async function waitFor(url, minutes) {
  const until = Date.now() + minutes * 60e3;
  while (Date.now() < until) {
    const res = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (res && res.ok) return true;
    await new Promise((r) => setTimeout(r, 20e3));
  }
  return false;
}

async function graph(edge, params) {
  const body = new URLSearchParams(Object.assign({}, params, { access_token: process.env.FACEBOOK_PAGE_TOKEN }));
  const res = await fetch(GRAPH + "/" + edge, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error("Graph " + res.status + ": " + ((json.error && json.error.message) || JSON.stringify(json)).slice(0, 300));
  return json;
}

// A slot already past (or under the Graph API's 10-minute floor) goes out in 20 minutes.
function photoParams(slug, cap, base, at) {
  const params = { url: base + "/feed/" + slug + ".jpg", caption: cap.facebook, alt_text_custom: cap.alt || "" };
  const due = Math.max(at || 0, Date.now() + MIN_LEAD_MS);
  if (due - Date.now() > MAX_LEAD_MS) throw new Error("slot " + new Date(due).toISOString() + " is more than 29 days out");
  return Object.assign(params, { published: "false", scheduled_publish_time: String(Math.floor(due / 1000)) });
}

async function main() {
  const opts = args();
  const batch = String(opts.batch || "");
  if (!/^[\w-]+$/.test(batch)) throw new Error("--batch is required");
  const dir = path.join(ROOT, "media/social-posts", batch);
  const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  const slugs = Object.keys(captions).filter((slug) => captions[slug].facebook);
  if (!slugs.length) { console.log("nothing to post"); return; }
  const when = facebookSlots(dir);
  const base = SITE + "/media/social-posts/" + batch;
  const page = process.env.FACEBOOK_PAGE_ID;
  if (!opts["dry-run"] && !(page && process.env.FACEBOOK_PAGE_TOKEN)) throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN must be set.");

  if (!opts["dry-run"]) {
    const first = base + "/feed/" + slugs[0] + ".jpg";
    if (!(await waitFor(first, 20))) throw new Error("The site never served " + first);
  }
  let failed = 0;
  let queued = 0;
  for (const slug of slugs) {
    try {
      const params = photoParams(slug, captions[slug], base, when[slug]);
      const due = new Date(Number(params.scheduled_publish_time) * 1000).toISOString();
      if (opts["dry-run"]) { console.log("dry-run", slug, due, params.url); continue; }
      const r = await graph(page + "/photos", params);
      queued += 1;
      console.log("scheduled", slug, due, r.id);
    } catch (error) {
      failed += 1;
      console.log("failed", slug, "-", error.message);
    }
  }
  console.log(queued + " scheduled, " + failed + " failed");
  if (failed) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
