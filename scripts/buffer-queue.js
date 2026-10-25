#!/usr/bin/env node
/* Adds a rendered social batch to every Buffer queue through the Buffer API (api.buffer.com).

     BUFFER_API_KEY=... CLIP_BASE=https://.../download/auto-2026-10-22 \
       node scripts/buffer-queue.js --batch auto-2026-10-22 [--dry-run]
     BUFFER_API_KEY=... node scripts/buffer-queue.js --check   only look up the queued posts in the ledger
     BUFFER_API_KEY=... node scripts/buffer-queue.js --seed    read Buffer's scheduled and sent posts into the
       ledger, matched to their batch post by image address or caption, and list the ones no batch has; it
       queues nothing
     BUFFER_API_KEY=... node scripts/buffer-queue.js --delete-unmatched [--dry-run]   delete the scheduled posts
       dated after now that match no batch post and that the ledger does not know (not on the hub)

   Reads media/social-posts/<batch>/captions.json from scripts/tips-studio/build.js. Feed and story
   images are served by the site, so the script waits until the first one answers 200 (the Pages
   deploy). Clips come from CLIP_BASE (the batch's GitHub release). Each post is scheduled at its
   calendar.csv time (mode customScheduled). Paused channels are skipped.
   Every post, queued or failed, goes into the ledger assets/social/buffer.json (scripts/social-ledger.js),
   and each run first asks Buffer whether the queued ones whose time has passed were sent. A post the ledger
   already has queued or sent on a profile is not queued there again.
   Hub first (scripts/hub-gate.js): a post whose hub page does not answer 200, or whose slot is before its day
   on the hub, is not queued and goes into the ledger as failed with the reason.
   Exits 1 when any post failed, after trying all of them; the log names each one. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const { createGate } = require("./hub-gate");

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

async function channels(paused) {
  const orgs = process.env.BUFFER_ORG_ID ? [{ id: process.env.BUFFER_ORG_ID }] : (await gql("query { account { organizations { id } } }")).account.organizations;
  const out = [];
  for (const org of orgs) {
    const data = await gql("query($o: OrganizationId!) { channels(input: { organizationId: $o }) { id name service isQueuePaused } }", { o: org.id });
    out.push(...data.channels.filter((c) => paused || !c.isQueuePaused).map((c) => Object.assign({ org: org.id }, c)));
  }
  return out;
}

const SLOT = { linkedin: "linkedin", facebook: "facebook", instagram: "instagram", twitter: "x", threads: "x", bluesky: "x", mastodon: "x", tiktok: "tiktok", youtube: "youtube" };
const NETS = ["linkedin", "x", "facebook", "instagram", "tiktok", "youtube"];
const squash = (text) => String(text || "").replace(/\s+/g, " ").trim();

const CALENDAR_SLOT = { linkedin: "linkedin", x: "x", facebook: "facebook", tiktok: "tiktok", youtube: "youtube", "youtube shorts": "youtube" };

// Every batch post by the addresses of its images and clips, by its captions and their opening words, and by its
// calendar slots, for --seed. The launch set keeps a captions file per language and topic, and its six languages
// share each slot. Opening words or a slot two posts share match neither. Opening words match only a sent post: a
// scheduled one whose caption matches none exactly is stale and --delete-unmatched removes it (#1044).
const lead = (text) => squash(text).slice(0, 60);
function batchIndex(root = path.join(ROOT, "media/social-posts")) {
  const index = new Map();
  const share = (key, name) => index.set(key, index.has(key) && index.get(key) !== name ? null : name);
  const slot = (key, name) => index.set(key, [...new Set((index.get(key) || []).concat(name))]);
  const texts = (cap, name) => NETS.forEach((net) => {
    if (!cap[net]) return;
    index.set("text " + squash(cap[net]), name);
    share("lead " + lead(cap[net]), name);
  });
  for (const batch of fs.readdirSync(root).filter((name) => /^[\w-]+$/.test(name)).sort()) {
    const dir = path.join(root, batch);
    if (fs.existsSync(path.join(dir, "captions.json"))) {
      const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
      for (const [slug, cap] of Object.entries(captions)) {
        const name = batch + "/" + slug;
        ["feed", "story"].forEach((sub) => index.set("/media/social-posts/" + batch + "/" + sub + "/" + slug + ".jpg", name));
        index.set("/releases/download/" + batch + "/" + slug + ".mp4", name);
        texts(cap, name);
      }
    }
    fs.readdirSync(dir).filter((lang) => /^[a-z]{2}$/.test(lang) && fs.statSync(path.join(dir, lang)).isDirectory()).forEach((lang) => {
      fs.readdirSync(path.join(dir, lang)).filter((file) => file.endsWith("-captions.json")).forEach((file) => {
        texts(JSON.parse(fs.readFileSync(path.join(dir, lang, file), "utf8")), batch + "/" + lang + "/" + file.replace(/-captions\.json$/, ""));
      });
    });
    if (!fs.existsSync(path.join(dir, "calendar.csv"))) continue;
    const [head, ...rows] = fs.readFileSync(path.join(dir, "calendar.csv"), "utf8").trim().split("\n").map((line) => line.split(","));
    const col = (key) => head.indexOf(key);
    rows.forEach((cells) => {
      const net = CALENDAR_SLOT[(cells[col("Channel")] || "").toLowerCase()];
      if (!net) return;
      const at = new Date(cells[col("Date")] + "T" + cells[col("Time")] + ":00-05:00");
      if (!isNaN(at)) slot("slot " + net + " " + at.toISOString(), batch + "/" + cells[col("Post")]);
    });
  }
  return index;
}

// A slot match does not count when taken(name) says the ledger already ties that batch post to another Buffer post
// on this profile: two posts can share a slot after the calendar moves, and only the asset or caption tells them apart.
function matchPost(index, post, net, taken = () => false) {
  for (const asset of post.assets || []) {
    const source = String(asset.source || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").replace(/^.*(?=\/releases\/download\/)/, "");
    if (index.has(source)) return index.get(source);
  }
  const text = index.get("text " + squash(post.text));
  if (text) return text;
  const opening = post.status === "sent" && index.get("lead " + lead(post.text));
  if (opening) return opening;
  const due = post.dueAt && new Date(post.dueAt);
  const slot = (net && due && !isNaN(due) && index.get("slot " + net + " " + due.toISOString())) || [];
  return slot.length === 1 && !taken(slot[0]) ? slot[0] : null;
}

function takenBy(book, item) {
  return (name) => {
    const entry = ledger.find(book, name, item.slot, item.profile);
    return Boolean(entry && entry.id && entry.id !== item.node.id);
  };
}

// Every post Buffer holds with one of these statuses, on a channel with a network slot.
async function bufferPosts(statuses) {
  const list = await channels(true);
  const out = [];
  for (const org of [...new Set(list.map((c) => c.org))]) {
    const byId = new Map(list.filter((c) => c.org === org).map((c) => [c.id, c]));
    const filter = "{ channelIds: " + JSON.stringify([...byId.keys()]) + ", status: [" + statuses.join(", ") + "] }";
    let after = null;
    do {
      const data = await gql("query($o: OrganizationId!, $a: String) { posts(first: 100, after: $a, input: { organizationId: $o, filter: " + filter + " }) { pageInfo { hasNextPage endCursor } edges { node { id status dueAt sentAt text channelId externalLink assets { source } } } } }", { o: org, a: after });
      for (const { node } of data.posts.edges) {
        const channel = byId.get(node.channelId);
        const slot = channel && SLOT[channel.service];
        if (slot) out.push({ node, slot, profile: channel.service + (channel.name ? " (" + channel.name + ")" : "") });
      }
      after = data.posts.pageInfo.hasNextPage ? data.posts.pageInfo.endCursor : null;
    } while (after);
  }
  return out;
}

const describe = ({ node, profile }) => node.status + " " + (node.sentAt || node.dueAt || "") + " " + profile + ": " + squash(node.text).slice(0, 90);

async function seed() {
  const index = batchIndex();
  const book = ledger.read(ledger.BUFFER);
  const statuses = String(process.env.BUFFER_SEED_STATUS || "scheduled,sent,error").split(",").filter((s) => /^[a-z_]+$/.test(s));
  const unmatched = [];
  let matched = 0;
  for (const item of await bufferPosts(statuses)) {
    const { node, slot, profile } = item;
    const name = matchPost(index, node, slot, takenBy(book, item));
    if (!name) { unmatched.push(describe(item)); continue; }
    matched += 1;
    const result = node.status === "sent" ? "sent" : node.status === "error" ? "failed" : "queued";
    ledger.record(book, name, { channel: slot, profile, id: node.id, at: node.sentAt || node.dueAt, result, url: node.externalLink, checked: new Date().toISOString() });
  }
  ledger.write(ledger.BUFFER, book);
  console.log(matched + " Buffer posts matched to a batch post, " + unmatched.length + " match no batch (not on the hub):");
  unmatched.sort().forEach((line) => console.log("  " + line));
}

// The scheduled posts --delete-unmatched may delete: still to go out, matching no batch post, and unknown to the
// ledger. A sent post, or one dated before now, is never picked.
function staleScheduled(index, items, book, now) {
  const known = new Set(Object.values(book.posts || {}).flat().map((entry) => entry.id).filter(Boolean));
  return items.filter((item) => {
    const { node, slot } = item;
    const due = Date.parse(node.dueAt || "");
    return node.status === "scheduled" && !isNaN(due) && due > now && !known.has(node.id) && !matchPost(index, node, slot, takenBy(book, item));
  });
}

async function deleteUnmatched(dry) {
  const book = ledger.read(ledger.BUFFER);
  const stale = staleScheduled(batchIndex(), await bufferPosts(["scheduled"]), book, Date.now());
  console.log(stale.length + " scheduled Buffer posts match no batch post" + (dry ? " (dry run, nothing deleted):" : ":"));
  let failed = 0;
  for (const item of stale.sort((a, b) => describe(a).localeCompare(describe(b)))) {
    if (dry) { console.log("  would delete " + item.node.id + " " + describe(item)); continue; }
    try {
      const data = await gql("mutation($input: DeletePostInput!) { deletePost(input: $input) { __typename ... on DeletePostSuccess { id } ... on MutationError { message } } }", { input: { id: item.node.id } });
      const r = data.deletePost;
      if (r.id) console.log("  deleted " + r.id + " " + describe(item));
      else { failed += 1; console.log("  failed " + item.node.id + " " + describe(item) + " - " + (r.message || r.__typename)); }
    } catch (error) {
      failed += 1;
      console.log("  failed " + item.node.id + " " + describe(item) + " - " + error.message);
    }
  }
  if (failed) process.exit(1);
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
  if (opts.seed) {
    if (!process.env.BUFFER_API_KEY) throw new Error("BUFFER_API_KEY is not set.");
    return seed();
  }
  if (opts["delete-unmatched"]) {
    if (!process.env.BUFFER_API_KEY) throw new Error("BUFFER_API_KEY is not set.");
    return deleteUnmatched(Boolean(opts["dry-run"]));
  }
  const batch = String(opts.batch || "");
  if (!/^[\w-]+$/.test(batch)) throw new Error("--batch is required");
  const dir = path.join(ROOT, "media/social-posts", batch);
  const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  const slugs = Object.keys(captions).filter((slug) => !captions[slug].hold);
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
  const gate = createGate();
  let failed = 0;
  let queued = 0;
  let already = 0;
  for (const slug of slugs) {
    for (const channel of list) {
      for (const { slot, input } of inputsFor(channel, slug, captions[slug], base, clipBase, when)) {
        const profile = channel.service + (channel.name ? " (" + channel.name + ")" : "");
        const label = slug + " → " + profile;
        const known = ledger.find(book, batch + "/" + slug, slot, profile);
        if (known && (known.result === "queued" || known.result === "sent")) { already += 1; continue; }
        const hub = await gate(batch, slug, captions[slug], input.dueAt || new Date().toISOString());
        if (opts["dry-run"]) { console.log("dry-run", label, hub.why ? "HELD: " + hub.why : "hub ok", JSON.stringify(input).slice(0, 160)); continue; }
        const entry = { channel: slot, profile, at: input.dueAt, checked: new Date().toISOString() };
        if (hub.why) {
          failed += 1;
          console.log("held", label, "-", hub.why, hub.url);
          ledger.record(book, batch + "/" + slug, Object.assign(entry, { result: "failed", error: "Hub first: " + hub.why }));
          continue;
        }
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
  console.log(queued + " queued, " + already + " already in Buffer, " + failed + " failed");
  if (failed) process.exit(1);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { batchIndex, matchPost, staleScheduled };
