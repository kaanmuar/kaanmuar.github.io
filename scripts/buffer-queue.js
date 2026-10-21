#!/usr/bin/env node
/* Adds a rendered social batch to every Buffer queue through the Buffer API (api.buffer.com).

     BUFFER_API_KEY=... CLIP_BASE=https://.../download/auto-2026-10-22 \
       node scripts/buffer-queue.js --batch auto-2026-10-22 [--dry-run]

   Reads media/social-posts/<batch>/captions.json from scripts/tips-studio/build.js. Feed and story
   images are served by the site, so the script waits until the first one answers 200 (the Pages
   deploy). Clips come from CLIP_BASE (the batch's GitHub release). Each post goes to the next free
   slot of that channel's posting schedule (mode addToQueue). Paused channels are skipped.
   Exits 1 when any post failed, after trying all of them; the log names each one. */

const fs = require("fs");
const path = require("path");

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
  if (!res.ok || json.errors) throw new Error("Buffer " + res.status + ": " + JSON.stringify(json.errors || json).slice(0, 300));
  return json.data;
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

// One channel, one slug: the post input, or null when this network takes nothing from the batch.
function inputsFor(channel, slug, cap, base, clipBase) {
  const image = (dir) => ({ image: { url: base + "/" + dir + "/" + slug + ".jpg", metadata: { altText: cap.alt } } });
  const video = () => ({ video: { url: clipBase + "/" + slug + ".mp4", metadata: { thumbnailOffset: 0 } } });
  const post = (text, assets, metadata) => Object.assign({ channelId: channel.id, schedulingType: "automatic", mode: "addToQueue", text, assets }, metadata ? { metadata } : {});
  switch (channel.service) {
    case "linkedin": return [post(cap.linkedin, [image("feed")])];
    case "facebook": return [post(cap.facebook, [image("feed")], { facebook: { type: "post" } })];
    case "instagram": return [
      post(cap.instagram, [image("feed")], { instagram: { type: "post", shouldShareToFeed: true } }),
      post(cap.title, [image("story")], { instagram: { type: "story", shouldShareToFeed: false } })
    ];
    case "twitter": case "threads": case "bluesky": case "mastodon": return [post(cap.x, [image("feed")])];
    case "tiktok": return clipBase ? [post(cap.tiktok, [video()])] : [];
    case "youtube": return clipBase ? [post(cap.youtube, [video()], { youtube: { title: cap.youtubeTitle, categoryId: "28" } })] : [];
    default: return [];
  }
}

async function main() {
  const opts = args();
  const batch = String(opts.batch || "");
  if (!/^[\w-]+$/.test(batch)) throw new Error("--batch is required");
  const dir = path.join(ROOT, "media/social-posts", batch);
  const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  const slugs = Object.keys(captions);
  if (!slugs.length) { console.log("nothing to post"); return; }
  const base = SITE + "/media/social-posts/" + batch;
  const clipBase = process.env.CLIP_BASE || "";
  if (!opts["dry-run"] && !process.env.BUFFER_API_KEY) throw new Error("BUFFER_API_KEY is not set.");

  const list = opts["dry-run"] ? [{ id: "dry", service: "linkedin" }, { id: "dry", service: "instagram" }, { id: "dry", service: "youtube" }] : await channels();
  if (!opts["dry-run"]) {
    const first = base + "/feed/" + slugs[0] + ".jpg";
    if (!(await waitFor(first, 20))) throw new Error("The site never served " + first);
  }
  let failed = 0;
  let queued = 0;
  for (const slug of slugs) {
    for (const channel of list) {
      for (const input of inputsFor(channel, slug, captions[slug], base, clipBase)) {
        const label = slug + " → " + channel.service + (channel.name ? " (" + channel.name + ")" : "");
        if (opts["dry-run"]) { console.log("dry-run", label, JSON.stringify(input).slice(0, 160)); continue; }
        try {
          const data = await gql("mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }", { input });
          const r = data.createPost;
          if (r.post) { queued += 1; console.log("queued", label, r.post.dueAt); } else { failed += 1; console.log("failed", label, "-", r.message); }
        } catch (error) {
          failed += 1;
          console.log("failed", label, "-", error.message);
        }
      }
    }
  }
  console.log(queued + " queued, " + failed + " failed");
  if (failed) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
