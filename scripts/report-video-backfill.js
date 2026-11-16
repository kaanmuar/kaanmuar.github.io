#!/usr/bin/env node
/* Inventory and apply plan for upgrading already-posted image-only Live Report posts to voiced
   clips where each network allows (#3590, child of #3586 B). Uses clip metadata from #3589
   (social-clip.js) and network composers (#2701).

     node scripts/report-video-backfill.js [--dry-run] [--apply] [--limit N] [--channel linkedin]
       [--json] [--check-release] [--sent-only] [--queued-too]

   Default is dry-run (inventory + would-apply lines only). --apply performs upgrades on networks
   with a wired path: Buffer editPost (LinkedIn), Page Reel (Facebook), open-social video post
   (Bluesky, Mastodon, Threads, Telegram). X, TikTok, YouTube, Buffer Instagram stay skip; see MATRIX.

   Reads batch captions (media/social-posts/<batch>/captions.json), cross-checks sent rows in
   assets/social/buffer.json, facebook.json and open-social.json, and lists each post/network
   that could take a clip from the batch's GitHub release (<batch>/<slug>.mp4, with voiced.json
   as the language source). Summary counts and a per-network action matrix print at the end. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const faceRoute = require("./face-route");
const socialClip = require("./social-clip");
const { withUrl } = require("./buffer-remedia");
const { gql } = require("./buffer-queue");
const { budget, bufferGql, EDIT, editInput } = require("./social-calendar");
const fbQueue = require("./facebook-queue");
const openSocial = require("./open-social-queue");
const { createGate, withHubLink } = require("./hub-gate");
const { FACES } = require("./brand-kit/faces");
const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const REPO = process.env.GITHUB_REPOSITORY || "kaanmuar/kaanmuar.github.io";
const OPEN_CHANNELS = new Set(["bluesky", "mastodon", "threads", "telegram", "instagram"]);
const BACKFILL_SUFFIX = " · voiced-clip";
const APPLY_CHANNELS = new Set(["linkedin", "facebook", "bluesky", "mastodon", "threads", "telegram"]);

// What we would do on each channel for a sent image-only report post when a matching clip exists.
const MATRIX = {
  linkedin: { action: "edit", note: "Buffer editPost swaps image for release video (queued or sent)." },
  x: { action: "skip", note: "Buffer schedules X with a card image only; no in-place video." },
  facebook: { action: "new-post", note: "Page photo posts cannot become Reels (Graph has no edit); schedule a Reel via facebook-compose." },
  instagram: { action: "skip", note: "Buffer Instagram feed posts are still images; Reels go through open-social when wired." },
  tiktok: { action: "skip", note: "Native video channel — image-only sends are unexpected; skip unless Buffer shows an image asset." },
  youtube: { action: "skip", note: "Native video channel — same as TikTok." },
  bluesky: { action: "new-post", note: "Published posts cannot replace an image embed with video; post anew with the clip." },
  mastodon: { action: "new-post", note: "Same as Bluesky." },
  threads: { action: "new-post", note: "Published Threads posts are not editable to video." },
  telegram: { action: "new-post", note: "sendVideo is a new message; the image post stays." }
};

const BUFFER_CHANNELS = new Set(["linkedin", "x", "facebook", "instagram", "tiktok", "youtube"]);
const TEXT_KEY = { x: "x", linkedin: "linkedin", facebook: "facebook", instagram: "instagram", bluesky: "bluesky", mastodon: "mastodon", threads: "threads", telegram: "telegram" };

const BUFFER_POST =
  "id status dueAt sentAt text channelId channelService schedulingType tags { id }" +
  " assets { type source thumbnail ... on ImageAsset { image { altText } } ... on VideoAsset { video { thumbnailOffset title } } ... on DocumentAsset { document { title } } }" +
  " metadata { __typename" +
  " ... on LinkedInPostMetadata { firstComment } ... on FacebookPostMetadata { type firstComment } }";

function args(argv) {
  const out = {};
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
  const capFile = path.join(root, "media/social-posts", batch, "captions.json");
  const cap = fs.existsSync(capFile) ? JSON.parse(fs.readFileSync(capFile, "utf8"))[slug] : null;
  const voicedMap = faceRoute.voiced(batch, root);
  const from = socialClip.fromBatch(batch, slug, cap, voicedMap);
  if (!from) return null;
  const local = path.join(root, "media/social-posts", batch, "voiced", slug + ".mp4");
  return Object.assign({ local: fs.existsSync(local) ? local : null }, from);
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
      profile: led.entry.profile || "",
      lang,
      cap: post.cap,
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

function backfillProfile(profile) {
  return (profile || "default") + BACKFILL_SUFFIX;
}

function clipBackfillSent(book, postId, channel, profile) {
  return (book.posts[postId] || []).some((e) => e.channel === channel && e.profile === backfillProfile(profile) && (e.result === "sent" || e.result === "queued"));
}

function facebookReelSent(book, postId) {
  return (book.posts[postId] || []).some((e) => e.channel === "facebook" && fbQueue.isReel(e) && (e.result === "sent" || e.result === "queued"));
}

// Rows --apply may touch: clear action, clip, release, apply channel, not already backfilled.
function applyTargets(rows, { channel, limit, books, checkRelease } = {}) {
  const out = [];
  for (const row of rows) {
    if (row.action !== "edit" && row.action !== "new-post") continue;
    if (!APPLY_CHANNELS.has(row.channel)) continue;
    if (channel && row.channel !== channel) continue;
    if (!row.clip) continue;
    if (checkRelease && row.releaseOk === false) continue;
    const book = books && books[row.ledger];
    if (book) {
      if (row.channel === "facebook" && facebookReelSent(book, row.post)) {
        row.applySkip = "Page already has a Reel ledger entry for this post";
        continue;
      }
      if (clipBackfillSent(book, row.post, row.channel, row.profile)) {
        row.applySkip = "voiced-clip backfill already recorded";
        continue;
      }
    }
    out.push(row);
    if (limit && out.length >= limit) break;
  }
  return out;
}

async function releaseOk(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "follow" }).catch(() => null);
  return Boolean(res && res.ok);
}

async function fetchBufferPost(id) {
  const data = await gql("query($id: PostId!) { post(input: { id: $id }) { " + BUFFER_POST + " } }", { id });
  return data && data.post;
}

async function applyLinkedIn(row, { call, root }) {
  if (!process.env.BUFFER_API_KEY) return { ok: false, skip: "BUFFER_API_KEY is not set" };
  if (!row.id) return { ok: false, skip: "ledger has no Buffer post id" };
  const live = await releaseOk(row.clip.url);
  if (!live) return { ok: false, skip: "clip release URL does not answer" };
  let post;
  try {
    post = await fetchBufferPost(row.id);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!post) return { ok: false, skip: "Buffer post not found" };
  if (post.channelService !== "linkedin") return { ok: false, skip: "ledger id is not a LinkedIn post" };
  const dueAt = post.sentAt || post.dueAt;
  const input = withUrl(editInput(Object.assign({}, post, { assets: (post.assets || []).map((a) => Object.assign({}, a, { type: a.type || (a.video ? "video" : "image") })) }), dueAt), row.clip.url);
  input.assets = [{ video: { url: row.clip.url, metadata: { thumbnailOffset: 0 } } }];
  let r;
  try {
    r = await call(EDIT, { input });
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!r || !r.editPost || !r.editPost.post) return { ok: false, error: (r && r.editPost && r.editPost.message) || "editPost rejected" };
  const book = ledger.read(ledger.BUFFER);
  ledger.record(book, row.post, {
    channel: "linkedin", profile: backfillProfile(row.profile), id: row.id, at: r.editPost.post.dueAt || dueAt,
    result: post.status === "sent" ? "sent" : "queued", url: row.url, checked: new Date().toISOString(),
    error: "Backfill edit: image to release video (#3590)"
  });
  ledger.write(ledger.BUFFER, book);
  return { ok: true, mode: "edit", id: row.id };
}

function fbFaceFor(row, root) {
  const connected = new Set(Object.keys(FACES).filter((face) => {
    const env = faceRoute.faceEnv(face);
    return env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_TOKEN;
  }));
  return faceRoute.postFace(row.batch, row.slug, row.cap, "facebook", connected);
}

async function applyFacebook(row, { root, gate }) {
  const env = faceRoute.faceEnv(fbFaceFor(row, root));
  if (!env.FACEBOOK_PAGE_ID || !env.FACEBOOK_PAGE_TOKEN) return { ok: false, skip: "FACEBOOK_PAGE_TOKEN / PAGE_ID not set for this post's face" };
  const live = await releaseOk(row.clip.url);
  if (!live) return { ok: false, skip: "clip release URL does not answer" };
  const face = fbFaceFor(row, root);
  const post = { batch: row.batch, slug: row.slug, cap: row.cap, clip: row.clip, at: Date.now() + 20 * 60e3 };
  const caption = withHubLink(faceRoute.captionFor(row.cap, "facebook", face), { batch: row.batch, slug: row.slug, network: "facebook" });
  const at = new Date().toISOString();
  const hub = await gate(row.batch, row.slug, row.cap, at);
  if (hub.why) return { ok: false, skip: "Hub first: " + hub.why };
  fbQueue.usePageToken(env.FACEBOOK_PAGE_TOKEN);
  const plans = await fbQueue.compose(post, caption, post.at, face);
  if (!plans.length || !plans[0].uses.includes("reel")) return { ok: false, skip: "facebook-compose returned no Reel plan for this clip" };
  const r = await fbQueue.publish(env.FACEBOOK_PAGE_ID, plans);
  const book = ledger.read(ledger.FACEBOOK);
  ledger.record(book, row.post, {
    channel: "facebook", profile: backfillProfile(row.profile || "facebook"), id: r.id, at, result: "queued",
    checked: new Date().toISOString(), error: "Backfill Reel alongside image post " + row.id + " (#3590)"
  });
  ledger.write(ledger.FACEBOOK, book);
  return { ok: true, mode: "new-post", id: r.id, uses: r.uses };
}

function openExtras(network, row, face, book) {
  const hub = SITE + "/social/" + row.batch + "/" + row.slug + ".html?utm_source=" + network + "&utm_medium=social&utm_campaign=" + row.batch;
  if (network === "threads") {
    return { cap: row.cap, clip: row.clip, long: "", quote: "", place: row.cap.place || "", topic: "", hub };
  }
  return { cap: row.cap, clip: row.clip, hub, quizCap: null, answerCap: null, quote: "" };
}

async function applyOpenSocial(row, { root, gate, book }) {
  const network = row.channel;
  const clientFactory = openSocial.NETWORKS[network];
  if (!clientFactory) return { ok: false, skip: "no open-social client for " + network };
  const face = faceRoute.postFace(row.batch, row.slug, row.cap, openSocial.ROUTES[network].slot || "x", new Set(Object.keys(FACES)));
  const client = clientFactory(faceRoute.faceEnv(face));
  if (!client.ready) return { ok: false, skip: "no credentials for " + network + " @" + (FACES[face] && FACES[face].handle) };
  const live = await releaseOk(row.clip.url);
  if (!live) return { ok: false, skip: "clip release URL does not answer" };
  const image = path.join(root, "media/social-posts", row.batch, "feed", row.slug + ".jpg");
  if (!fs.existsSync(image)) return { ok: false, skip: "feed image missing locally" };
  const at = new Date().toISOString();
  const hub = await gate(row.batch, row.slug, row.cap, at);
  if (hub.why) return { ok: false, skip: "Hub first: " + hub.why };
  const key = openSocial.ROUTES[network].caption || "x";
  const captionLang = faceRoute.captionLang(row.cap, key, face);
  const lang = socialClip.mediaLang(row.clip, captionLang);
  const text = withHubLink(faceRoute.captionFor(row.cap, key, face), { batch: row.batch, slug: row.slug, network });
  const url = SITE + "/media/social-posts/" + row.batch + "/feed/" + row.slug + ".jpg";
  const more = openExtras(network, row, face, book);
  await client.login();
  const r = await client.post(Object.assign({
    text, image, url, alt: row.cap.alt || row.cap.title || "", lang, key: row.post + BACKFILL_SUFFIX
  }, more));
  ledger.record(book, row.post, {
    channel: network, profile: backfillProfile(row.profile), id: r.id, url: r.url, at, result: "sent",
    checked: new Date().toISOString(), error: "Backfill video post alongside image " + row.id + " (#3590)"
  });
  return { ok: true, mode: "new-post", id: r.id, url: r.url, uses: r.uses };
}

async function applyRows(targets, { live, root = ROOT, windows = 1 } = {}) {
  const books = {
    buffer: readLedger(ledger.BUFFER, root),
    "facebook-page": readLedger(ledger.FACEBOOK, root),
    "open-social": readLedger(ledger.OPEN_SOCIAL, root)
  };
  const gate = createGate();
  const counts = { would: 0, applied: 0, skipped: 0, failed: 0 };
  const lines = [];
  let call = null;
  if (live && targets.some((t) => t.channel === "linkedin")) {
    call = budget({ windows, gql: bufferGql, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now() });
  }
  const openLedgers = {};
  const openBook = (network) => {
    const file = openSocial.LEDGERS[network] || ledger.OPEN_SOCIAL;
    if (!openLedgers[file]) openLedgers[file] = Object.assign(ledger.read(file), { _file: file, _dirty: false });
    return openLedgers[file];
  };
  for (const row of targets) {
    const label = row.action + " " + row.channel + " " + row.post;
    if (!live) {
      counts.would += 1;
      lines.push("would " + label + " clip=" + row.clip.lang + " " + row.clip.url.split("/").slice(-2).join("/"));
      continue;
    }
    let result;
    try {
      if (row.channel === "linkedin") result = await applyLinkedIn(row, { call, root });
      else if (row.channel === "facebook") result = await applyFacebook(row, { root, gate });
      else if (OPEN_CHANNELS.has(row.channel)) result = await applyOpenSocial(row, { root, gate, book: openBook() });
      else result = { ok: false, skip: MATRIX[row.channel] && MATRIX[row.channel].note };
    } catch (error) {
      result = { ok: false, error: error.message };
    }
    if (result.ok) {
      counts.applied += 1;
      lines.push("applied " + label + " → " + result.mode + " id=" + result.id);
    } else if (result.skip) {
      counts.skipped += 1;
      lines.push("skip " + label + " — " + result.skip);
    } else {
      counts.failed += 1;
      lines.push("failed " + label + " — " + (result.error || "unknown error"));
    }
  }
  if (live && books["open-social"]._live) ledger.write(ledger.OPEN_SOCIAL, books["open-social"]);
  return { counts, lines };
}

function skipReport(rows) {
  const skip = {};
  for (const row of rows) {
    if (row.action === "edit" || row.action === "new-post") continue;
    skip[row.action] = (skip[row.action] || 0) + 1;
  }
  const applySkip = {};
  rows.filter((r) => r.applySkip).forEach((r) => { applySkip[r.applySkip] = (applySkip[r.applySkip] || 0) + 1; });
  return { skip, applySkip };
}

async function main() {
  const opts = args(process.argv.slice(2));
  const live = Boolean(opts.apply) && !opts["dry-run"];
  const dryRun = !live;
  const sentOnly = opts["queued-too"] ? false : true;
  const rows = plan({ sentOnly: sentOnly !== false && sentOnly !== "false" });
  const checkRelease = Boolean(opts["check-release"]) || live;
  if (checkRelease) {
    const cache = new Map();
    for (const row of rows) {
      if (!row.clip) continue;
      if (!cache.has(row.clip.url)) cache.set(row.clip.url, await releaseOk(row.clip.url));
      row.releaseOk = cache.get(row.clip.url);
      if (!row.releaseOk && (row.action === "edit" || row.action === "new-post")) row.action = "skip-no-release";
    }
  }
  const books = {
    buffer: readLedger(ledger.BUFFER, ROOT),
    "facebook-page": readLedger(ledger.FACEBOOK, ROOT),
    "open-social": readLedger(ledger.OPEN_SOCIAL, ROOT)
  };
  const limit = opts.limit ? Number(opts.limit) : (live ? 5 : undefined);
  const channel = opts.channel ? String(opts.channel) : "";
  const targets = applyTargets(rows, { channel: channel || undefined, limit, books, checkRelease });
  const summary = summarize(rows);
  const applied = await applyRows(targets, { live, root: ROOT, windows: Number(opts.windows || 1) });
  const skips = skipReport(rows);

  if (opts.json) {
    console.log(JSON.stringify({ summary, matrix: MATRIX, rows, apply: { targets: targets.length, ...applied.counts, lines: applied.lines }, skips }, null, 2));
    return;
  }

  console.log("Report video backfill (#3590)" + (dryRun ? " — dry run" : " — APPLY"));
  console.log(summary.total + " ledger slots on Live Report posts (" + summary.withClip + " with a voiced clip in voiced.json).");
  console.log("\nLedgers:");
  Object.entries(summary.byLedger).forEach(([k, n]) => console.log("  " + k + ": " + n));
  console.log("\nActions:");
  Object.keys(summary.byAction).sort().forEach((k) => console.log("  " + String(summary.byAction[k]).padStart(4) + "  " + k));
  console.log("\nPer network (inventory):");
  Object.keys(summary.byChannel).sort().forEach((ch) => {
    const rule = MATRIX[ch] || { action: "?", note: "" };
    const apply = APPLY_CHANNELS.has(ch) ? "apply wired" : "no --apply path";
    console.log("  " + ch + ": " + summary.byChannel[ch] + " — default " + rule.action + "; " + apply);
  });
  if (targets.length || applied.lines.length) {
    console.log("\n" + (dryRun ? "Would apply (--apply to run)" : "Apply run") + " (" + targets.length + " targets" + (limit ? ", limit " + limit : "") + "):");
    applied.lines.forEach((line) => console.log("  " + line));
    if (!dryRun) console.log("\n" + applied.counts.applied + " applied, " + applied.counts.skipped + " skipped, " + applied.counts.failed + " failed");
  }
  if (!opts.quiet) {
    console.log("\nEligible upgrades still in inventory (edit / new-post):");
    rows.filter((r) => r.action === "edit" || r.action === "new-post").slice(0, 40).forEach((r) => {
      console.log("  " + r.action + "  " + r.channel + "  " + r.post + "  clip=" + (r.clip && r.clip.lang) + "  postLang=" + r.lang);
    });
    if (rows.filter((r) => r.action === "edit" || r.action === "new-post").length > 40) console.log("  …");
  }
  console.log("\nSkipped (no --apply path or blocked):");
  Object.keys(skips.skip).sort().forEach((k) => console.log("  " + String(skips.skip[k]).padStart(4) + "  " + k));
  Object.keys(skips.applySkip).sort().forEach((k) => console.log("  " + String(skips.applySkip[k]).padStart(4) + "  apply: " + k));
  if (applied.counts.failed) process.exit(1);
}

module.exports = {
  isReportPost, kindOf, clipFor, clipMatchesPost, actionFor, plan, summarize, MATRIX,
  APPLY_CHANNELS, backfillProfile, applyTargets, applyRows, releaseOk
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}