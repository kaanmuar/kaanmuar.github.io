#!/usr/bin/env node
/* Publishes rendered social batches on the QA-lab Instagram account (the professional account linked to the
   Facebook Page) through the Instagram Graph API. Buffer's free plan has no room for an Instagram channel.

     FACEBOOK_PAGE_ID=... FACEBOOK_PAGE_TOKEN=... node scripts/instagram-queue.js --since <ISO> [--until <ISO>] [--dry-run]
     ... node scripts/instagram-queue.js --check   the account, its publishing quota, and the next slots

   The API cannot schedule ahead, so .github/workflows/instagram.yml runs this every 20 minutes and passes the
   previous run's start as --since and its own as --until, so the windows tile. Each run publishes, from every
   batch's calendar.csv and captions.json:
   - instagram: the feed image with its instagram caption and alt text, for slots in the last 24 hours whose
     caption is not on the account yet, so a failed post is retried by the next runs;
   - instagram-story: the story image, for slots in (--since, --until]. Stories carry no caption to match on.
   Slots whose image the site does not serve are skipped. The Page token needs instagram_basic and
   instagram_content_publish. Exits 1 when any post failed, after trying all of them. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const GRAPH = "https://graph.facebook.com/" + (process.env.FACEBOOK_GRAPH_VERSION || "v23.0");
const RETRY_MS = 24 * 3600e3;

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

async function call(method, edge, params) {
  const qs = new URLSearchParams(Object.assign({}, params, { access_token: process.env.FACEBOOK_PAGE_TOKEN }));
  const res = method === "GET" ? await fetch(GRAPH + "/" + edge + "?" + qs) : await fetch(GRAPH + "/" + edge, { method, body: qs });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error("Graph " + res.status + ": " + ((json.error && json.error.message) || JSON.stringify(json)).slice(0, 300));
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (text) => String(text || "").replace(/\s+/g, " ").trim();

async function account(page) {
  const json = await call("GET", page, { fields: "instagram_business_account{id,username}" });
  if (!json.instagram_business_account) throw new Error("The Facebook Page has no linked Instagram professional account.");
  return json.instagram_business_account;
}

// Captions of the account's latest posts, so a rerun never posts the same feed caption twice.
async function published(ig) {
  const json = await call("GET", ig + "/media", { fields: "caption,timestamp", limit: "100" });
  return new Set((json.data || []).map((m) => key(m.caption)));
}

// calendar.csv times are Bogotá wall-clock (UTC-5, no daylight saving).
function slots() {
  const root = path.join(ROOT, "media/social-posts");
  const out = [];
  for (const batch of fs.readdirSync(root).sort()) {
    const dir = path.join(root, batch);
    if (!fs.existsSync(path.join(dir, "captions.json")) || !fs.existsSync(path.join(dir, "calendar.csv"))) continue;
    const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
    for (const line of fs.readFileSync(path.join(dir, "calendar.csv"), "utf8").trim().split("\n").slice(1)) {
      const [date, time, channel, slug, asset] = line.split(",");
      if ((channel !== "instagram" && channel !== "instagram-story") || !captions[slug] || !asset) continue;
      out.push({ batch, slug, channel, cap: captions[slug], at: new Date(date + "T" + time + ":00-05:00").getTime(),
        url: SITE + "/media/social-posts/" + batch + "/" + asset });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

async function publish(ig, params) {
  const container = await call("POST", ig + "/media", params);
  for (let i = 0; ; i += 1) {
    const { status_code: status } = await call("GET", container.id, { fields: "status_code" });
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED" || i === 20) throw new Error("media container " + container.id + " is " + status);
    await sleep(3000);
  }
  return call("POST", ig + "/media_publish", { creation_id: container.id });
}

async function check(page) {
  const ig = await account(page);
  const info = await call("GET", ig.id, { fields: "username,media_count,followers_count" });
  const quota = await call("GET", ig.id + "/content_publishing_limit", { fields: "quota_usage,config" });
  const q = (quota.data || [])[0] || {};
  console.log("@" + info.username + ": " + info.media_count + " posts, " + info.followers_count + " followers; "
    + (q.quota_usage || 0) + " of " + ((q.config && q.config.quota_total) || "?") + " API posts used in the last 24 hours");
  const next = slots().filter((s) => s.at > Date.now()).slice(0, 4);
  for (const s of next) console.log("next " + new Date(s.at).toISOString() + " " + s.channel + " " + s.batch + "/" + s.slug);
}

async function main() {
  const opts = args();
  const page = process.env.FACEBOOK_PAGE_ID;
  const live = !opts["dry-run"];
  if ((live || opts.check) && !(page && process.env.FACEBOOK_PAGE_TOKEN)) throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN must be set.");
  if (opts.check) return check(page);
  const until = opts.until ? Date.parse(opts.until) : Date.now();
  const since = Math.max(opts.since ? Date.parse(opts.since) : until - 3600e3, until - RETRY_MS);
  if (Number.isNaN(until) || Number.isNaN(since)) throw new Error("--since and --until take ISO times");

  const due = slots().filter((s) => s.at <= until && (s.channel === "instagram" ? s.at > until - RETRY_MS : s.at > since));
  console.log("Window " + new Date(since).toISOString() + " to " + new Date(until).toISOString() + ": " + due.length + " slots");
  if (!due.length) return;
  const ig = live ? await account(page) : { id: "dry" };
  const done = live ? await published(ig.id) : new Set();
  let failed = 0;
  let posted = 0;
  let already = 0;
  let missing = 0;
  for (const s of due) {
    const name = s.channel + " " + s.batch + "/" + s.slug;
    if (s.channel === "instagram" && done.has(key(s.cap.instagram))) { already += 1; continue; }
    const head = await fetch(s.url, { method: "HEAD" }).catch(() => null);
    if (!head || !head.ok) { missing += 1; console.log("skipped", name, "- the site does not serve", s.url); continue; }
    const params = s.channel === "instagram"
      ? { image_url: s.url, caption: s.cap.instagram, alt_text: s.cap.alt || "" }
      : { image_url: s.url, media_type: "STORIES" };
    if (!live) { console.log("dry-run", name, new Date(s.at).toISOString(), s.url); continue; }
    try {
      const r = await publish(ig.id, params);
      posted += 1;
      if (s.channel === "instagram") done.add(key(s.cap.instagram));
      console.log("published", name, r.id);
    } catch (error) {
      failed += 1;
      console.log("failed", name, "-", error.message);
    }
  }
  console.log(posted + " published, " + already + " already on Instagram, " + missing + " without an image, " + failed + " failed");
  if (failed) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
