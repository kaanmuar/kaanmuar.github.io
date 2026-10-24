#!/usr/bin/env node
/* Schedules a rendered social batch on the QA-lab Facebook Page through the Graph API. Buffer's free
   plan has no room for a Facebook channel, so the Page is posted to directly.

     FACEBOOK_PAGE_ID=... FACEBOOK_PAGE_TOKEN=... node scripts/facebook-queue.js --batch auto-2026-10-22 [--dry-run]
     ... node scripts/facebook-queue.js --all     every batch; slots more than 29 days out wait for a later run
     ... node scripts/facebook-queue.js --check   how many posts the Page has scheduled

   Reads the same captions.json and calendar.csv as buffer-queue.js and posts each feed image with its
   facebook caption and alt text at its calendar time, skipping captions already scheduled or published on
   the Page. Meta Business Suite's Planificador does not list posts scheduled through the API; --check reads
   them. The token is a Page access token with pages_manage_posts. Exits 1 when any post failed, after
   trying all of them.

   The Page token never expires, but changing the Facebook password or removing the "QA-lab Page Publisher"
   app (1097031042944706) revokes it. To renew it, generate a user token in Graph API Explorer on that app
   with pages_manage_posts and pages_read_engagement, copy the app secret from App settings > Basic, then:

     FACEBOOK_USER_TOKEN=... FACEBOOK_APP_SECRET=... FACEBOOK_PAGE_ID=... node scripts/facebook-queue.js --renew

   It exchanges the user token for a long-lived one, reads the Page token from it, checks that the Page token
   never expires, and stores it in the FACEBOOK_PAGE_TOKEN repo secret with gh. Reset the app secret after. */

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

// Code 190 is an expired or revoked token; "on behalf of user" means the user revoked the app's access.
function graphError(status, json) {
  const error = json.error || {};
  const message = "Graph " + status + ": " + (error.message || JSON.stringify(json)).slice(0, 300);
  const revoked = error.code === 190 || /on behalf of user|session has been invalidated/i.test(error.message || "");
  return new Error(revoked ? message + "\nFACEBOOK_PAGE_TOKEN was revoked. Renew it with node scripts/facebook-queue.js --renew (steps at the top of that file)." : message);
}

async function graph(edge, params) {
  const body = new URLSearchParams(Object.assign({}, params, { access_token: process.env.FACEBOOK_PAGE_TOKEN }));
  const res = await fetch(GRAPH + "/" + edge, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw graphError(res.status, json);
  return json;
}

async function graphGet(edge, params, token = process.env.FACEBOOK_PAGE_TOKEN) {
  const qs = new URLSearchParams(Object.assign({}, params, token ? { access_token: token } : {}));
  const res = await fetch(GRAPH + "/" + edge + "?" + qs);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw graphError(res.status, json);
  return json;
}

// Every page of a Graph edge, following paging.next.
async function graphAll(edge, params) {
  const out = [];
  let json = await graphGet(edge, Object.assign({ limit: "100" }, params));
  for (;;) {
    out.push(...(json.data || []));
    if (!(json.paging && json.paging.next)) return out;
    const res = await fetch(json.paging.next);
    json = await res.json();
    if (json.error) throw new Error("Graph: " + json.error.message);
  }
}

const key = (text) => String(text || "").replace(/\s+/g, " ").trim();

// Captions already on the Page, scheduled or published in the last 40 days, so a rerun never posts twice.
async function onPage(page) {
  const since = String(Math.floor(Date.now() / 1000) - 40 * 86400);
  const scheduled = await graphAll(page + "/scheduled_posts", { fields: "message,scheduled_publish_time" });
  const published = await graphAll(page + "/posts", { fields: "message", since });
  return { scheduled, keys: new Set(scheduled.concat(published).map((p) => key(p.message))) };
}

async function check(page) {
  const { scheduled } = await onPage(page);
  const times = scheduled.map((p) => p.scheduled_publish_time * 1000).sort((a, b) => a - b);
  console.log(scheduled.length + " scheduled on the Page" + (times.length ? ", " + new Date(times[0]).toISOString() + " to " + new Date(times[times.length - 1]).toISOString() : ""));
}

// Explorer user token -> long-lived user token -> Page token, which then has no expiry date.
async function renew(page) {
  const app = process.env.FACEBOOK_APP_ID || "1097031042944706";
  const secret = process.env.FACEBOOK_APP_SECRET;
  const user = process.env.FACEBOOK_USER_TOKEN;
  if (!(page && secret && user)) throw new Error("FACEBOOK_PAGE_ID, FACEBOOK_APP_SECRET and FACEBOOK_USER_TOKEN must be set.");
  const long = await graphGet("oauth/access_token", { grant_type: "fb_exchange_token", client_id: app, client_secret: secret, fb_exchange_token: user }, null);
  const { access_token: token, name } = await graphGet(page, { fields: "access_token,name" }, long.access_token);
  if (!token) throw new Error("No Page token for " + page + ": the user is not an admin of the Page, or pages_manage_posts was not granted.");
  const { data } = await graphGet("debug_token", { input_token: token }, app + "|" + secret);
  const scopes = data.scopes || [];
  if (!data.is_valid || data.expires_at !== 0 || !scopes.includes("pages_manage_posts")) {
    throw new Error("The Page token is not a never-expiring pages_manage_posts token: " + JSON.stringify({ valid: data.is_valid, expires_at: data.expires_at, scopes }));
  }
  const repo = process.env.GITHUB_REPO || "kaanmuar/kaanmuar.github.io";
  const set = require("child_process").spawnSync("gh", ["secret", "set", "FACEBOOK_PAGE_TOKEN", "-R", repo], { input: token, stdio: ["pipe", "inherit", "inherit"] });
  if (set.status !== 0) throw new Error("gh secret set FACEBOOK_PAGE_TOKEN failed");
  console.log("FACEBOOK_PAGE_TOKEN renewed for " + name + " (" + page + "), no expiry, scopes " + scopes.join(" ") + ". Reset the app secret now.");
}

// Batches with Facebook captions and a calendar, oldest first.
function allBatches() {
  const root = path.join(ROOT, "media/social-posts");
  return fs.readdirSync(root).filter((name) => /^[\w-]+$/.test(name)
    && fs.existsSync(path.join(root, name, "captions.json")) && fs.existsSync(path.join(root, name, "calendar.csv"))).sort();
}

function posts(batch) {
  const dir = path.join(ROOT, "media/social-posts", batch);
  const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  const when = facebookSlots(dir);
  return Object.keys(captions).filter((slug) => captions[slug].facebook && !captions[slug].hold)
    .map((slug) => ({ batch, slug, cap: captions[slug], at: when[slug] || 0 }));
}

async function main() {
  const opts = args();
  const page = process.env.FACEBOOK_PAGE_ID;
  if (opts.renew) return renew(page);
  const live = !opts["dry-run"];
  if ((live || opts.check) && !(page && process.env.FACEBOOK_PAGE_TOKEN)) throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN must be set.");
  if (opts.check) return check(page);
  const batch = String(opts.batch || "");
  if (!opts.all && !/^[\w-]+$/.test(batch)) throw new Error("--batch <name> or --all is required");
  const list = (opts.all ? allBatches() : [batch]).flatMap(posts);
  if (!list.length) { console.log("nothing to post"); return; }

  // A batch the daily job just pushed may take a few minutes to reach the site.
  if (live && !opts.all) {
    const first = SITE + "/media/social-posts/" + batch + "/feed/" + list[0].slug + ".jpg";
    console.log("Waiting up to 20 minutes for the site to serve " + first);
    if (!(await waitFor(first, 20))) throw new Error("The site never served " + first);
  }
  const done = live || process.env.FACEBOOK_PAGE_TOKEN ? (await onPage(page)).keys : new Set();
  const horizon = Date.now() + MAX_LEAD_MS;
  let failed = 0;
  let queued = 0;
  let already = 0;
  let later = 0;
  let late = 0;
  for (const post of list) {
    const name = post.batch + "/" + post.slug;
    if (done.has(key(post.cap.facebook))) { already += 1; continue; }
    if (post.at > horizon) { later += 1; continue; }
    // A missed slot goes out 20 minutes from now, the next one 30 minutes after that, and so on.
    const due = post.at < Date.now() + MIN_LEAD_MS ? Date.now() + MIN_LEAD_MS + 30 * 60e3 * late++ : post.at;
    const params = {
      url: SITE + "/media/social-posts/" + post.batch + "/feed/" + post.slug + ".jpg",
      caption: post.cap.facebook,
      alt_text_custom: post.cap.alt || "",
      published: "false",
      scheduled_publish_time: String(Math.floor(due / 1000)),
    };
    const at = new Date(due).toISOString();
    if (!live) { console.log("dry-run", name, at, params.url); continue; }
    try {
      const r = await graph(page + "/photos", params);
      queued += 1;
      console.log("scheduled", name, at, r.id);
    } catch (error) {
      failed += 1;
      console.log("failed", name, "-", error.message);
    }
  }
  console.log(queued + " scheduled, " + already + " already on the Page, " + later + " more than 29 days out, " + failed + " failed");
  if (failed) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
