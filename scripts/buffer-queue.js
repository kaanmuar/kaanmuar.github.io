#!/usr/bin/env node
/* Adds a rendered social batch to every Buffer queue through the Buffer API (api.buffer.com).

     BUFFER_API_KEY=... CLIP_BASE=https://.../download/auto-2026-10-22 \
       node scripts/buffer-queue.js --batch auto-2026-10-22 [--dry-run]
     BUFFER_API_KEY=... node scripts/buffer-queue.js --check   only look up the queued posts in the ledger

   Reads media/social-posts/<batch>/captions.json from scripts/tips-studio/build.js. Feed and story
   images are served by the site, so the script waits until the first one answers 200 (the Pages
   deploy). Clips come from CLIP_BASE (the batch's GitHub release). Each post is scheduled at its
   calendar.csv time (mode customScheduled). Paused channels are skipped.
   Every post, queued or failed, goes into the ledger assets/social/buffer.json (scripts/social-ledger.js),
   and each run first asks Buffer whether the queued ones whose time has passed were sent.
   Exits 1 when any post failed, after trying all of them; the log names each one. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");

const ROOT = path.resolve(__dirname, "..");
const API = "https://api.buffer.com";
const SITE = process.env.SITE || "https://carlosandmunoz.com";

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

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.BUFFER_API_KEY },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const error = new Error("Buffer " + res.status + ": " + JSON.stringify(json.errors || json).slice(0, 300));
    error.code = json.errors && json.errors[0] && json.errors[0].extensions && json.errors[0].extensions.code;
    throw error;
  }
  return json.data;
}

async function lookup(entry) {
  try {
    const data = await gql("query($id: PostId!) { post(input: { id: $id }) { status sentAt externalLink error { message } } }", { id: entry.id });
    return ledger.fromBuffer(data.post);
  } catch (error) {
    if (error.code === "NOT_FOUND") return ledger.fromBuffer(null);
    console.log("could not look up", entry.id, "-", error.message);
    return null;
  }
}

async function settle(book) {
  const counts = await ledger.upgrade(book, Date.now(), lookup);
  console.log("ledger: " + counts.sent + " sent, " + counts.failed + " failed, " + counts.queued + " still queued");
}

async function channels() {
  const orgs = process.env.BUFFER_ORG_ID ? [{ id: process.env.BUFFER_ORG_ID }] : (await gql("query { account { organizations { id } } }")).account.organizations;
  const out = [];
  for (const org of orgs) {
    const data = await gql("query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name service isQueuePaused } }", { o: org.id });
    out.push(...data.channels.filter((c) => !c.isQueuePaused));
  }
  return out;
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

// calendar.csv times are Bogotá wall-clock (UTC-5, no daylight saving).
function readCalendar(dir) {
  const when = {};
  const lines = fs.readFileSync(path.join(dir, "calendar.csv"), "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [date, time, channel, slug] = line.split(",");
    when[slug + "|" + channel] = new Date(date + "T" + time + ":00-05:00").toISOString();
  }
  return when;
}

// One channel, one slug: the post inputs, each with its calendar slot (none when this network takes nothing
// from the batch). Each post keeps its calendar slot; the queues already hold months of imported posts, so
// addToQueue would land it behind them. A slot already past goes out in 20 minutes.
function inputsFor(channel, slug, cap, base, clipBase, when) {
  const image = (dir) => ({ image: { url: base + "/" + dir + "/" + slug + ".jpg", metadata: { altText: cap.alt } } });
  const video = () => ({ video: { url: clipBase + "/" + slug + ".mp4", metadata: { thumbnailOffset: 0 } } });
  const soon = new Date(Date.now() + 20 * 60e3).toISOString();
  const post = (slot, text, assets, metadata) => {
    const at = when[slug + "|" + slot];
    return { slot, input: Object.assign({ channelId: channel.id, schedulingType: "automatic", text, assets },
      at ? { mode: "customScheduled", dueAt: at > soon ? at : soon } : { mode: "addToQueue" }, metadata ? { metadata } : {}) };
  };
  switch (channel.service) {
    case "linkedin": return [post("linkedin", cap.linkedin, [image("feed")])];
    case "facebook": return [post("facebook", cap.facebook, [image("feed")], { facebook: { type: "post" } })];
    case "instagram": return [
      post("instagram", cap.instagram, [image("feed")], { instagram: { type: "post", shouldShareToFeed: true } }),
      post("instagram-story", cap.title, [image("story")], { instagram: { type: "story", shouldShareToFeed: false } })
    ];
    case "twitter": case "threads": case "bluesky": case "mastodon": return [post("x", cap.x, [image("feed")])];
    case "tiktok": return clipBase ? [post("tiktok", cap.tiktok, [video()])] : [];
    case "youtube": return clipBase ? [post("youtube", cap.youtube, [video()], { youtube: { title: cap.youtubeTitle, categoryId: "28" } })] : [];
    default: return [];
  }
}

async function main() {
  const opts = args();
  if (opts.check) {
    if (!process.env.BUFFER_API_KEY) throw new Error("BUFFER_API_KEY is not set.");
    const book = ledger.read(ledger.BUFFER);
    await settle(book);
    ledger.write(ledger.BUFFER, book);
    return;
  }
  const batch = String(opts.batch || "");
  if (!/^[\w-]+$/.test(batch)) throw new Error("--batch is required");
  const dir = path.join(ROOT, "media/social-posts", batch);
  const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  const slugs = Object.keys(captions);
  const when = readCalendar(dir);
  if (!slugs.length) { console.log("nothing to post"); return; }
  const base = SITE + "/media/social-posts/" + batch;
  const clipBase = process.env.CLIP_BASE || "";
  if (!opts["dry-run"] && !process.env.BUFFER_API_KEY) throw new Error("BUFFER_API_KEY is not set.");

  const list = opts["dry-run"] ? [{ id: "dry", service: "linkedin" }, { id: "dry", service: "instagram" }, { id: "dry", service: "youtube" }] : await channels();
  if (!opts["dry-run"]) {
    const first = base + "/feed/" + slugs[0] + ".jpg";
    if (!(await waitFor(first, 20))) throw new Error("The site never served " + first);
  }
  const book = ledger.read(ledger.BUFFER);
  if (!opts["dry-run"]) await settle(book);
  let failed = 0;
  let queued = 0;
  for (const slug of slugs) {
    for (const channel of list) {
      for (const { slot, input } of inputsFor(channel, slug, captions[slug], base, clipBase, when)) {
        const profile = channel.service + (channel.name ? " (" + channel.name + ")" : "");
        const label = slug + " → " + profile;
        if (opts["dry-run"]) { console.log("dry-run", label, JSON.stringify(input).slice(0, 160)); continue; }
        const entry = { channel: slot, profile, at: input.dueAt, checked: new Date().toISOString() };
        try {
          const data = await gql("mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }", { input });
          const r = data.createPost;
          if (r.post) {
            queued += 1;
            console.log("queued", label, r.post.dueAt);
            Object.assign(entry, { id: r.post.id, at: r.post.dueAt || input.dueAt, result: "queued" });
          } else {
            failed += 1;
            console.log("failed", label, "-", r.message);
            Object.assign(entry, { result: "failed", error: r.message });
          }
        } catch (error) {
          failed += 1;
          console.log("failed", label, "-", error.message);
          Object.assign(entry, { result: "failed", error: error.message });
        }
        ledger.record(book, batch + "/" + slug, entry);
      }
    }
  }
  if (!opts["dry-run"]) ledger.write(ledger.BUFFER, book);
  console.log(queued + " queued, " + failed + " failed");
  if (failed) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
