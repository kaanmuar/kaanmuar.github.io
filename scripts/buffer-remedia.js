#!/usr/bin/env node
/* Points the scheduled Buffer posts that hold Buffer's own copy of their media (an image imported from a Buffer CSV,
   a clip uploaded in the composer) at their batch's re-rendered file on the site or its release, so they go out
   with it (#1847). Buffer fetches a site or release address when the post goes out; its own copy never changes.

     BUFFER_API_KEY=... node scripts/buffer-remedia.js --batches runs-100,tips-2026-10 [--dry-run] [--windows 4]

   Each post keeps its id, text, channel, time and metadata (editPost with the whole post, as --sync in
   scripts/social-calendar.js sends it); only the asset's address changes. Nothing is queued or deleted.
   Images: a post matched to its batch post (buffer-queue.js matchPost) takes <site>/media/social-posts/<batch>/feed/<slug>.jpg.
   Clips: a TikTok or YouTube post is matched by its text or title to the clip's voiced copy in <batch>/voiced.json,
   so the new clip speaks the language the post is written in, and takes <slug>.mp4 from the <batch> release.
   A post that matches nothing, has more than one asset, is due within 30 minutes, or whose new file does not answer
   200 is listed and left as it is. Calls share --sync's budget (15-minute windows, a reserve of the daily and 30-day calls). */

const fs = require("fs");
const path = require("path");
const { batchIndex, matchPost, mediaHost, SLOT } = require("./buffer-queue");
const { budget, bufferGql, scheduledPosts, editInput, EDIT, EDIT_AHEAD } = require("./social-calendar");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const REPO = process.env.GITHUB_REPOSITORY || "kaanmuar/kaanmuar.github.io";
const squash = (text) => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();

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

function readVoiced(batches, root) {
  const out = [];
  for (const batch of batches) {
    const file = path.join(root, "media/social-posts", batch, "voiced.json");
    if (!fs.existsSync(file)) continue;
    Object.entries(JSON.parse(fs.readFileSync(file, "utf8"))).forEach(([slug, v]) => out.push(Object.assign({ batch, slug }, v)));
  }
  return out;
}

function voicedMatch(voiced, post, slot) {
  const text = squash(post.text);
  const title = squash(post.metadata && post.metadata.title);
  const hits = voiced.filter((v) => slot === "tiktok"
    ? v.tiktok && (text === squash(v.tiktok) || text.startsWith(squash(v.tiktok)))
    : slot === "youtube" && v.youtubeTitle && title === squash(v.youtubeTitle));
  return hits.length === 1 ? hits[0] : null;
}

// What each scheduled post would take: { post, slot, name, url } or { post, slot, name, skip }.
function plan(posts, { batches, index, voiced, now, site = SITE, repo = REPO }) {
  const out = [];
  for (const post of posts) {
    const slot = SLOT[post.channelService];
    const assets = post.assets || [];
    const hosts = assets.map((a) => mediaHost(a.source));
    if (!slot || !assets.length || hosts.every((h) => h === "site" || h === "release")) continue;
    const row = { post, slot, name: null };
    const video = assets[0].type === "video";
    if (video) {
      const v = voicedMatch(voiced, post, slot);
      if (v) Object.assign(row, { name: v.batch + "/" + v.slug, url: "https://github.com/" + repo + "/releases/download/" + v.batch + "/" + v.slug + ".mp4" });
    } else {
      const name = matchPost(index, post, slot);
      const [batch, slug] = String(name || "").split("/");
      if (name && batches.includes(batch) && slug) Object.assign(row, { name, url: site + "/media/social-posts/" + batch + "/feed/" + slug + ".jpg" });
    }
    if (!row.url) row.skip = video ? "no voiced clip in " + batches.join(", ") + " matches its text" : "matches no post in " + batches.join(", ");
    else if (assets.length > 1) row.skip = assets.length + " assets";
    else if (Date.parse(post.dueAt) < now + EDIT_AHEAD) row.skip = "due within 30 minutes";
    if (row.skip) delete row.url;
    out.push(row);
  }
  return out;
}

function withUrl(input, url) {
  return Object.assign({}, input, { assets: input.assets.map((a) => a.video ? { video: Object.assign({}, a.video, { url }) } : a.image ? { image: Object.assign({}, a.image, { url }) } : a) });
}

async function main() {
  const opts = args();
  const batches = String(opts.batches || "").split(",").map((b) => b.trim()).filter(Boolean);
  if (!batches.length || batches.some((b) => !/^[\w-]+$/.test(b))) throw new Error("--batches takes batch,batch");
  if (!process.env.BUFFER_API_KEY) throw new Error("BUFFER_API_KEY is not set.");
  const dry = Boolean(opts["dry-run"]);
  const call = budget({ windows: dry ? 1 : Number(opts.windows || 1), gql: bufferGql, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now });
  const held = await scheduledPosts(call);
  if (!held) { console.log((call.stopped || "ran out of calls reading Buffer's posts") + "; run again"); return; }
  const rows = plan([...held.values()], { batches, index: batchIndex(), voiced: readVoiced(batches, ROOT), now: Date.now() });
  const live = new Map();
  const counts = {};
  const count = (row, what) => { const key = (row.name ? row.name.split("/")[0] : "(no batch)") + " " + row.slot + " " + what; counts[key] = (counts[key] || 0) + 1; };
  let failed = 0;
  for (const row of rows) {
    const label = row.slot + " " + row.post.id + " " + row.post.dueAt + " " + (row.name || "(no batch)");
    if (row.skip) { count(row, "left"); console.log("left " + label + ": " + row.skip); continue; }
    if (!live.has(row.url)) live.set(row.url, Boolean((await fetch(row.url, { method: "HEAD" }).catch(() => null) || {}).ok));
    if (!live.get(row.url)) { count(row, "left"); console.log("left " + label + ": " + row.url + " does not answer"); continue; }
    if (dry) { count(row, "would point"); console.log("would point " + label + " at " + row.url); continue; }
    let r;
    try {
      r = await call(EDIT, { input: withUrl(editInput(row.post, row.post.dueAt), row.url) });
    } catch (error) {
      r = { editPost: { message: error.message } };
    }
    if (!r) break;
    if (r.editPost.post) { count(row, "pointed"); console.log("pointed " + label + " at " + row.url); }
    else { failed += 1; count(row, "failed"); console.log("failed " + label + ": " + r.editPost.message); }
  }
  Object.keys(counts).sort().forEach((key) => console.log(String(counts[key]).padStart(4) + "  " + key));
  if (call.stopped) console.log(call.stopped + "; run again for the rest");
  if (failed) process.exit(1);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { plan, withUrl, voicedMatch };
