#!/usr/bin/env node
/* Inventory and dry-run plan for upgrading already-posted image-only Live Report posts to voiced
   clips where each network allows (#3590, child of #3586 B). Depends on clip metadata on feed posts
   (#3589) and network composers (#2701). Does not post anything unless --apply is added after #3589
   lands the video-first queue paths.

     node scripts/report-video-backfill.js [--dry-run] [--json] [--check-release] [--sent-only]

   Reads batch captions (media/social-posts/<batch>/captions.json), cross-checks sent rows in
   assets/social/buffer.json, facebook.json and open-social.json, and lists each post/network
   that could take a clip from the batch's GitHub release (<batch>/<slug>.mp4, with voiced.json
   as the language source). Summary counts and a per-network action matrix print at the end.

   Actions:
     edit      — in-place media swap (Buffer editPost; LinkedIn once video is wired)
     new-post  — publish a Reel/video alongside or instead of the card (Page, Bluesky, …)
     skip      — network never takes video for this post class, or already a native video channel
     skip-*    — no clip, language mismatch, or nothing sent to upgrade */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const faceRoute = require("./face-route");

const ROOT = path.resolve(__dirname, "..");
const REPO = process.env.GITHUB_REPOSITORY || "kaanmuar/kaanmuar.github.io";
const OPEN_CHANNELS = new Set(["bluesky", "mastodon", "threads", "telegram", "instagram"]);

// What we would do on each channel for a sent image-only report post when a matching clip exists.
const MATRIX = {
  linkedin: { action: "edit", note: "Buffer editPost can swap media once the post is built with a release video URL (#3589)." },
  x: { action: "skip", note: "Buffer schedules X with a card image only; no in-place video." },
  facebook: { action: "new-post", note: "Page photo posts cannot become Reels (Graph has no edit); schedule a Reel via facebook-compose." },
  instagram: { action: "skip", note: "Buffer Instagram feed posts are still images; Reels go through open-social when wired." },
  tiktok: { action: "skip", note: "Native video channel — image-only sends are unexpected; skip unless Buffer shows an image asset." },
  youtube: { action: "skip", note: "Native video channel — same as TikTok." },
  bluesky: { action: "new-post", note: "Published posts cannot replace an image embed with video; post anew with the clip." },
  mastodon: { action: "new-post", note: "Same as Bluesky." },
  threads: { action: "new-post", note: "Published Threads posts are not editable to video." },
  telegram: { action: "new-post", note: "sendVideo is a new message unless we delete the old one (out of scope here)." }
};

const BUFFER_CHANNELS = new Set(["linkedin", "x", "facebook", "instagram", "tiktok", "youtube"]);
const TEXT_KEY = { x: "x", linkedin: "linkedin", facebook: "facebook", instagram: "instagram", bluesky: "bluesky", mastodon: "mastodon", threads: "threads", telegram: "telegram" };

function args(argv) {
  const out = { "dry-run": true };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else out[key] = true;
  }
  return out;
}

function kindOf(batch, cap) {
  if (cap.kind) return cap.kind;
  if (batch.startsWith("tips")) return "tip";
  if (batch.startsWith("promo")) return "launch";
  return "review";
}

function isReportPost(batch, cap) {
  return kindOf(batch, cap) === "review";
}

function readCaptions(root) {
  const dir = path.join(root, "media/social-posts");
  if (!fs.existsSync(dir)) return [];
  const posts = [];
  for (const batch of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, batch, "captions.json");
    if (!fs.existsSync(file)) continue;
    const captions = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [slug, cap] of Object.entries(captions)) {
      if (!isReportPost(batch, cap)) continue;
      const image = path.join(dir, batch, "feed", slug + ".jpg");
      if (!fs.existsSync(image)) continue;
      posts.push({ id: batch + "/" + slug, batch, slug, cap });
    }
  }
  return posts;
}

function clipFor(batch, slug, root, repo = REPO) {
  const v = faceRoute.voiced(batch, root)[slug];
  if (!v || !v.lang) return null;
  const local = path.join(root, "media/social-posts", batch, "voiced", slug + ".mp4");
  return {
    lang: v.lang,
    url: "https://github.com/" + repo + "/releases/download/" + batch + "/" + slug + ".mp4",
    local: fs.existsSync(local) ? local : null
  };
}

function postLangFor(batch, slug, cap, channel, root) {
  if (faceRoute.voiced(batch, root)[slug] && (channel === "tiktok" || channel === "youtube")) {
    return faceRoute.postLang(batch, slug, cap, channel, root);
  }
  return faceRoute.textLang(cap, TEXT_KEY[channel] || "x");
}

function clipMatchesPost(clip, lang) {
  return Boolean(clip && clip.lang === lang);
}

function policy(channel) {
  return MATRIX[channel] || { action: "skip", note: "unknown channel" };
}

function readLedger(file, root) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    return json && json.posts ? json : { version: 1, posts: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, posts: {} };
    throw error;
  }
}

function ledgerEntries(root, sentOnly) {
  const books = [
    { file: ledger.BUFFER, source: "buffer", channels: BUFFER_CHANNELS },
    { file: ledger.FACEBOOK, source: "facebook-page", channels: new Set(["facebook"]) },
    { file: ledger.OPEN_SOCIAL, source: "open-social", channels: OPEN_CHANNELS }
  ];
  const rows = [];
  for (const { file, source, channels } of books) {
    const book = readLedger(file, root);
    for (const [postId, list] of Object.entries(book.posts || {})) {
      for (const entry of list) {
        if (!channels.has(entry.channel)) continue;
        if (sentOnly && entry.result !== "sent") continue;
        if (!sentOnly && entry.result !== "sent" && entry.result !== "queued") continue;
        rows.push({ postId, source, channel: entry.channel, entry });
      }
    }
  }
  return rows;
}

function actionFor(channel, clip, lang, sent) {
  const rule = policy(channel);
  if (rule.action === "skip") return { action: "skip", why: rule.note };
  if (!clip) return { action: "skip-no-clip", why: "no voiced.json clip for this slug" };
  if (!clipMatchesPost(clip, lang)) return { action: "skip-lang", why: "clip speaks " + clip.lang + ", post goes out in " + lang };
  if (!sent) return { action: "edit", why: "queued — swap media before send" };
  return { action: rule.action, why: rule.note };
}

// One plan row per ledger slot that matches a report caption.
function plan({ root = ROOT, repo = REPO, sentOnly = true } = {}) {
  const caps = new Map(readCaptions(root).map((p) => [p.id, p]));
  const rows = [];
  for (const led of ledgerEntries(root, sentOnly)) {
    const post = caps.get(led.postId);
    if (!post) continue;
    const clip = clipFor(post.batch, post.slug, root, repo);
    const lang = postLangFor(post.batch, post.slug, post.cap, led.channel, root);
    const act = actionFor(led.channel, clip, lang, led.entry.result === "sent");
    rows.push({
      post: post.id,
      batch: post.batch,
      slug: post.slug,
      channel: led.channel,
      ledger: led.source,
      lang,
      clip: clip ? { lang: clip.lang, url: clip.url } : null,
      sent: led.entry.result === "sent",
      at: led.entry.at,
      url: led.entry.url || "",
      id: led.entry.id || "",
      ...act
    });
  }
  rows.sort((a, b) => a.post.localeCompare(b.post) || a.channel.localeCompare(b.channel));
  return rows;
}

function summarize(rows) {
  const byAction = {};
  const byChannel = {};
  const byLedger = { buffer: 0, "facebook-page": 0, "open-social": 0 };
  let withClip = 0;
  for (const row of rows) {
    byAction[row.action] = (byAction[row.action] || 0) + 1;
    byChannel[row.channel] = (byChannel[row.channel] || 0) + 1;
    byLedger[row.ledger] = (byLedger[row.ledger] || 0) + 1;
    if (row.clip) withClip += 1;
  }
  return { total: rows.length, withClip, byAction, byChannel, byLedger };
}

async function releaseOk(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "follow" }).catch(() => null);
  return Boolean(res && res.ok);
}

async function main() {
  const opts = args(process.argv.slice(2));
  if (opts.apply) {
    console.error("--apply is not implemented until #3589 wires clip-aware composers on main; use --dry-run.");
    process.exit(2);
  }
  const sentOnly = !opts["queued-too"];
  const rows = plan({ sentOnly: sentOnly !== false && sentOnly !== "false" });
  if (opts["check-release"]) {
    const cache = new Map();
    for (const row of rows) {
      if (!row.clip) continue;
      if (!cache.has(row.clip.url)) cache.set(row.clip.url, await releaseOk(row.clip.url));
      row.releaseOk = cache.get(row.clip.url);
      if (!row.releaseOk && row.action === "edit") row.action = "skip-no-release";
    }
  }
  const summary = summarize(rows);
  if (opts.json) {
    console.log(JSON.stringify({ summary, matrix: MATRIX, rows }, null, 2));
    return;
  }
  console.log("Report video backfill (#3590)" + (opts["dry-run"] !== false ? " — dry run" : ""));
  console.log(summary.total + " sent ledger slots on Live Report posts (" + summary.withClip + " with a voiced clip in voiced.json).");
  console.log("\nLedgers:");
  Object.entries(summary.byLedger).forEach(([k, n]) => console.log("  " + k + ": " + n));
  console.log("\nActions:");
  Object.keys(summary.byAction).sort().forEach((k) => console.log("  " + String(summary.byAction[k]).padStart(4) + "  " + k));
  console.log("\nPer network:");
  Object.keys(summary.byChannel).sort().forEach((ch) => {
    const rule = MATRIX[ch] || { action: "?", note: "" };
    console.log("  " + ch + ": " + summary.byChannel[ch] + " sent — default " + rule.action + " (" + rule.note + ")");
  });
  if (!opts.quiet) {
    console.log("\nEligible upgrades (edit / new-post):");
    rows.filter((r) => r.action === "edit" || r.action === "new-post").forEach((r) => {
      console.log("  " + r.action + "  " + r.channel + "  " + r.post + "  clip=" + (r.clip && r.clip.lang) + "  postLang=" + r.lang);
    });
  }
  console.log("\nDepends on #3589 for feed clip fields and queue video plans; #2701 composers define new-post vs edit.");
}

module.exports = { isReportPost, kindOf, clipFor, clipMatchesPost, actionFor, plan, summarize, MATRIX };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}