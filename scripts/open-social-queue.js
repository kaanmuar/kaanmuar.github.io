#!/usr/bin/env node
/* Posts each rendered social batch to Bluesky and Mastodon through their own APIs (#1621). Buffer's free plan has
   no room for them, and neither needs it.

     BLUESKY_HANDLE=... BLUESKY_APP_PASSWORD=... MASTODON_URL=https://mastodon.social MASTODON_TOKEN=... \
       node scripts/open-social-queue.js [--network bluesky|mastodon] [--batch <name>] [--dry-run]

   Bluesky cannot schedule a post, so neither network is scheduled ahead: open-social.yml runs this every 30 minutes
   and it posts each feed image with its x caption once the post's calendar.csv x slot has come, at most PER_RUN per
   network a run. A slot more than MISSED_MS old is left alone, so connecting a network does not flood it with the
   backlog. A network whose secrets are missing is skipped.

   Every post goes into the ledger assets/social/open-social.json (scripts/social-ledger.js) as sent or failed. A
   failed post is tried again on the next run while its slot is within reach. Before posting, each run reads the
   account's latest posts and skips a post one of them already links to, so a ledger that never reached main does
   not post twice. Hub first (scripts/hub-gate.js), as for Buffer and the Facebook Page. Exits 1 when a network
   refused a login or a post, after trying the rest.

   Bluesky: an app password (Settings > Privacy and security > App passwords); BLUESKY_SERVICE when the account is
   not on bsky.social. Mastodon: the instance address and an application token with write:statuses, write:media and
   read:accounts, read:statuses (Preferences > Development > New application). */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const { createGate, withHubLink } = require("./hub-gate");

const ROOT = path.resolve(__dirname, "..");
const PER_RUN = 4;
const MISSED_MS = 12 * 3600e3;

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
function xSlots(dir) {
  const when = {};
  const file = path.join(dir, "calendar.csv");
  if (!fs.existsSync(file)) return when;
  fs.readFileSync(file, "utf8").trim().split("\n").slice(1).forEach((line) => {
    const [date, time, channel, slug] = line.split(",");
    if (channel === "x") when[slug] = new Date(date + "T" + time + ":00-05:00").getTime();
  });
  return when;
}

function allBatches(root = ROOT) {
  const dir = path.join(root, "media/social-posts");
  return fs.readdirSync(dir).filter((name) => /^[\w-]+$/.test(name)
    && fs.existsSync(path.join(dir, name, "captions.json")) && fs.existsSync(path.join(dir, name, "calendar.csv"))).sort();
}

function posts(batch, root = ROOT) {
  const dir = path.join(root, "media/social-posts", batch);
  const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  const when = xSlots(dir);
  return Object.keys(captions).filter((slug) => captions[slug].x && !captions[slug].hold && when[slug])
    .map((slug) => ({ batch, slug, cap: captions[slug], at: when[slug], image: path.join(dir, "feed", slug + ".jpg") }));
}

// Slots that have come and are not MISSED_MS old, oldest first.
function due(list, now) {
  return list.filter((post) => post.at <= now && now - post.at <= MISSED_MS).sort((a, b) => a.at - b.at);
}

const marker = (post) => "/social/" + post.batch + "/" + post.slug + ".html";

// The x caption's own links are tagged utm_source=x.
function caption(post, network) {
  const text = String(post.cap.x).replace(/utm_source=x\b/g, "utm_source=" + network);
  return withHubLink(text, { batch: post.batch, slug: post.slug, network });
}

/* Bluesky links only what a post's facets mark, by UTF-8 byte range. Only addresses with a scheme or a path are
   links: "robots.txt" and "llms.txt" look like hosts. */
const LINK = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;
function facets(text) {
  const out = [];
  for (const match of text.matchAll(LINK)) {
    const url = match[0].replace(/[.,;:!?)\]…]+$/u, "");
    if (!/^https?:\/\//i.test(url) && !url.includes("/")) continue;
    const byteStart = Buffer.byteLength(text.slice(0, match.index));
    out.push({
      index: { byteStart, byteEnd: byteStart + Buffer.byteLength(url) },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: /^https?:\/\//i.test(url) ? url : "https://" + url }]
    });
  }
  return out;
}

async function reply(res, label) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(label + " " + res.status + ": " + String(json.message || json.error || JSON.stringify(json)).slice(0, 300));
  return json;
}

function bluesky(env = process.env) {
  const service = (env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/$/, "");
  let session = null;
  const xrpc = async (method, { query, body, type } = {}) => {
    const headers = session ? { Authorization: "Bearer " + session.accessJwt } : {};
    if (body !== undefined) headers["Content-Type"] = type || "application/json";
    const res = await fetch(service + "/xrpc/" + method + (query ? "?" + new URLSearchParams(query) : ""), {
      method: body === undefined ? "GET" : "POST", headers, body: body === undefined || type ? body : JSON.stringify(body)
    });
    return reply(res, "Bluesky " + method);
  };
  return {
    ready: Boolean(env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD),
    async login() {
      session = await xrpc("com.atproto.server.createSession", { body: { identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_APP_PASSWORD } });
      return session.handle;
    },
    async recent() {
      const { feed } = await xrpc("app.bsky.feed.getAuthorFeed", { query: { actor: session.did, limit: "100", filter: "posts_no_replies" } });
      return (feed || []).map(({ post }) => ({ id: post.uri, text: JSON.stringify(post.record || {}), url: "https://bsky.app/profile/" + session.handle + "/post/" + post.uri.split("/").pop() }));
    },
    async post({ text, image, alt, lang }) {
      const { blob } = await xrpc("com.atproto.repo.uploadBlob", { body: fs.readFileSync(image), type: "image/jpeg" });
      const record = { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), langs: [lang], embed: { $type: "app.bsky.embed.images", images: [{ alt, image: blob }] } };
      const links = facets(text);
      if (links.length) record.facets = links;
      const { uri } = await xrpc("com.atproto.repo.createRecord", { body: { repo: session.did, collection: "app.bsky.feed.post", record } });
      return { id: uri, url: "https://bsky.app/profile/" + session.handle + "/post/" + uri.split("/").pop() };
    }
  };
}

function mastodon(env = process.env) {
  const base = String(env.MASTODON_URL || "").replace(/\/$/, "");
  const call = async (method, route, body, headers = {}) => {
    const form = body instanceof FormData;
    const res = await fetch(base + route, {
      method,
      headers: Object.assign({ Authorization: "Bearer " + env.MASTODON_TOKEN }, body && !form ? { "Content-Type": "application/json" } : {}, headers),
      body: form ? body : body ? JSON.stringify(body) : undefined
    });
    return reply(res, "Mastodon " + route);
  };
  let me = null;
  return {
    ready: Boolean(base && env.MASTODON_TOKEN),
    async login() {
      me = await call("GET", "/api/v1/accounts/verify_credentials");
      return me.acct + "@" + new URL(base).host;
    },
    async recent() {
      const list = await call("GET", "/api/v1/accounts/" + me.id + "/statuses?limit=40&exclude_replies=true&exclude_reblogs=true");
      return list.map((status) => ({ id: status.id, text: status.content || "", url: status.url }));
    },
    // A large image is still processing when /api/v2/media answers; the status needs its url.
    async post({ text, image, alt, lang, key }) {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(image)], { type: "image/jpeg" }), path.basename(image));
      form.append("description", alt);
      let media = await call("POST", "/api/v2/media", form);
      for (let i = 0; !media.url && i < 15; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        media = await call("GET", "/api/v1/media/" + media.id);
      }
      const status = await call("POST", "/api/v1/statuses", { status: text, media_ids: [media.id], visibility: "public", language: lang }, { "Idempotency-Key": key });
      return { id: status.id, url: status.url };
    }
  };
}

const NETWORKS = { bluesky, mastodon };

async function run(network, client, list, book, { live, now, gate }) {
  const todo = due(list, now).filter((post) => !(book.posts[post.batch + "/" + post.slug] || []).some((e) => e.channel === network && e.result === "sent"));
  const counts = { posted: 0, already: 0, held: 0, failed: 0, waiting: Math.max(0, todo.length - PER_RUN) };
  if (!live) {
    for (const post of todo.slice(0, PER_RUN)) {
      const hub = await gate(post.batch, post.slug, post.cap, new Date(now).toISOString());
      const text = caption(post, network);
      console.log("dry-run", network, post.batch + "/" + post.slug, new Date(post.at).toISOString(), hub.why ? "HELD: " + hub.why : "hub ok", [...text].length + " chars", text.split("\n").pop());
    }
    return counts;
  }
  if (!todo.length) return counts;
  const profile = await client.login();
  const recent = await client.recent();
  const record = (post, entry) => ledger.record(book, post.batch + "/" + post.slug, Object.assign({ channel: network, profile, checked: new Date().toISOString() }, entry));
  for (const post of todo) {
    if (counts.posted >= PER_RUN) break;
    const name = post.batch + "/" + post.slug;
    const there = recent.find((r) => r.text.includes(marker(post)));
    if (there) {
      counts.already += 1;
      record(post, { id: there.id, url: there.url, at: new Date(now).toISOString(), result: "sent" });
      continue;
    }
    const at = new Date().toISOString();
    const hub = await gate(post.batch, post.slug, post.cap, at);
    const why = hub.why ? "Hub first: " + hub.why : !fs.existsSync(post.image) ? "no feed image " + path.relative(ROOT, post.image) : null;
    if (why) {
      counts.held += 1;
      console.log("held", network, name, "-", why);
      record(post, { at, result: "failed", error: why });
      continue;
    }
    try {
      const r = await client.post({ text: caption(post, network), image: post.image, alt: post.cap.alt || post.cap.title || "", lang: post.cap.lang || "en", key: name });
      counts.posted += 1;
      console.log("posted", network, name, r.url);
      record(post, { id: r.id, url: r.url, at, result: "sent" });
    } catch (error) {
      counts.failed += 1;
      console.log("failed", network, name, "-", error.message);
      record(post, { at, result: "failed", error: error.message.split("\n")[0] });
    }
  }
  return counts;
}

async function main() {
  const opts = args();
  const live = !opts["dry-run"];
  const only = opts.network ? String(opts.network) : "";
  if (only && !NETWORKS[only]) throw new Error("--network must be one of " + Object.keys(NETWORKS).join(", "));
  const batch = opts.batch ? String(opts.batch) : "";
  if (batch && !/^[\w-]+$/.test(batch)) throw new Error("--batch takes a batch name");
  const list = (batch ? [batch] : allBatches()).flatMap((name) => posts(name));
  const book = ledger.read(ledger.OPEN_SOCIAL);
  const before = JSON.stringify(book);
  const gate = createGate();
  const now = Date.now();
  let broken = false;
  for (const network of only ? [only] : Object.keys(NETWORKS)) {
    const client = NETWORKS[network]();
    if (live && !client.ready) { console.log(network + ": no secrets, skipped"); continue; }
    try {
      const c = await run(network, client, list, book, { live, now, gate });
      console.log(network + ": " + c.posted + " posted, " + c.already + " already on the account, " + c.held + " held, " + c.failed + " failed, " + c.waiting + " due for a later run");
      if (c.failed) broken = true;
    } catch (error) {
      broken = true;
      console.log(network + ": " + error.message);
    }
  }
  if (live && JSON.stringify(book) !== before) ledger.write(ledger.OPEN_SOCIAL, book);
  if (broken) process.exit(1);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { PER_RUN, MISSED_MS, xSlots, posts, due, caption, facets, run };
