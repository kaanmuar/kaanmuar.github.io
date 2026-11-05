#!/usr/bin/env node
/* Posts each rendered social batch to Bluesky, Mastodon, Threads, Instagram and the Telegram channel through their own
   APIs (#1621, #526, #2606). Buffer's free plan has no room for them, and none needs it.

     BLUESKY_HANDLE=... BLUESKY_APP_PASSWORD=... MASTODON_URL=https://mastodon.social MASTODON_TOKEN=... \
     THREADS_TOKEN=... INSTAGRAM_USER_ID=... FACEBOOK_PAGE_TOKEN=... TELEGRAM_BOT_TOKEN=... TELEGRAM_CHANNEL=@qalab_live \
       node scripts/open-social-queue.js [--network <one of NETWORKS>] [--batch <name>] [--dry-run]

   Bluesky, Threads and Instagram cannot schedule a post, so no network is scheduled ahead: open-social.yml runs this
   every 30 minutes and it posts what has come due, at most PER_RUN per network a run. Bluesky, Mastodon and Threads
   post each feed image with its x caption at the post's calendar.csv x slot; Instagram posts the feed image with its
   instagram caption at the instagram slot, and the story image at the instagram-story slot (ROUTES). A slot more
   than MISSED_MS old is left alone, so connecting a network does not flood it with the backlog. A network whose
   secrets are missing is skipped.

   Telegram is one channel for every language (BRAND): it posts the feed image with the x caption at the x slot, each
   post in its own language, and records it in assets/social/telegram.json beside the Live Reports posts. The launch
   set (one <lang>/<topic>-captions.json per post) goes to every network but Mastodon (NO_LAUNCH).

   Each post goes to the face of its language (scripts/face-route.js, #2310): en/de/fr/it to @qalaburlreview with
   the secrets above, es/pt to @qaurlreview with the same names ending in _ES (BLUESKY_HANDLE_ES, ...). Each run
   logs every account in and gives it to the face whose handle it logs in as, whichever set holds it (#2332): the
   Threads token is @qaurlreview's, so en/de/fr/it skip Threads until @qalaburlreview has an account there. Until
   @qaurlreview has an account on a network, @qalaburlreview posts its languages there. A post sent from either
   face is not posted again.

   Every post goes into the ledger assets/social/open-social.json (scripts/social-ledger.js) as sent or failed. A
   failed post is tried again on the next run while its slot is within reach. Before posting, each run reads the
   account's latest posts and skips a post one of them already links to, so a ledger that never reached main does
   not post twice. Hub first (scripts/hub-gate.js), as for Buffer and the Facebook Page. Exits 1 when a network
   refused a login or a post, after trying the rest.

   Bluesky: an app password (Settings > Privacy and security > App passwords); BLUESKY_SERVICE when the account is
   not on bsky.social. Mastodon: the instance address and an application token with write:statuses, write:media and
   read:accounts, read:statuses (Preferences > Development > New application). Threads: a long-lived user token with
   threads_basic and threads_content_publish; it lasts 60 days, and scripts/meta-token.js renews it. Instagram: the
   professional account's id and the Facebook Page token with instagram_basic and instagram_content_publish
   (scripts/meta-token.js sets both). Threads and Instagram fetch the image from the site, so it must be live. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const { createGate, withHubLink } = require("./hub-gate");
const faceRoute = require("./face-route");
const { FACES } = require("./brand-kit/faces");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const GRAPH = "https://graph.facebook.com/" + (process.env.FACEBOOK_GRAPH_VERSION || "v23.0");
const THREADS = "https://graph.threads.net/v1.0";
const PER_RUN = 4;
const MISSED_MS = 12 * 3600e3;
// The calendar.csv slot and the captions.json caption each network posts; a story carries no caption.
const ROUTES = {
  bluesky: { slot: "x", caption: "x" },
  mastodon: { slot: "x", caption: "x" },
  threads: { slot: "x", caption: "x" },
  instagram: { slot: "instagram", caption: "instagram" },
  "instagram-story": { slot: "instagram-story", caption: null },
  telegram: { slot: "x", caption: "x" }
};
// Networks with one account for every language: each post goes out in its own language (#2606).
const BRAND = new Set(["telegram"]);
// Networks whose ledger is their own file, shared with the Live Reports posts.
const LEDGERS = { telegram: "assets/social/telegram.json" };
// Networks that skip the launch set (#2606).
const NO_LAUNCH = new Set(["mastodon"]);

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
function slots(dir, channel) {
  const when = {};
  const file = path.join(dir, "calendar.csv");
  if (!fs.existsSync(file)) return when;
  fs.readFileSync(file, "utf8").trim().split("\n").slice(1).forEach((line) => {
    const [date, time, ch, slug, asset] = line.split(",");
    if (ch === channel) when[slug] = { at: new Date(date + "T" + time + ":00-05:00").getTime(), asset: (asset || "").trim() };
  });
  return when;
}

const xSlots = (dir) => Object.fromEntries(Object.entries(slots(dir, "x")).map(([slug, s]) => [slug, s.at]));

// The launch set has no captions.json: each post keeps <lang>/<topic>-captions.json, written in its own language.
const isLaunch = (dir) => !fs.existsSync(path.join(dir, "captions.json")) && fs.readdirSync(dir).some((d) => /^[a-z]{2}$/.test(d)
  && fs.statSync(path.join(dir, d)).isDirectory() && fs.readdirSync(path.join(dir, d)).some((f) => f.endsWith("-captions.json")));

function allBatches(root = ROOT) {
  const dir = path.join(root, "media/social-posts");
  return fs.readdirSync(dir).filter((name) => /^[\w-]+$/.test(name) && fs.existsSync(path.join(dir, name, "calendar.csv"))
    && (fs.existsSync(path.join(dir, name, "captions.json")) || isLaunch(path.join(dir, name)))).sort();
}

function captionsOf(dir, when) {
  if (fs.existsSync(path.join(dir, "captions.json"))) return JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  return Object.fromEntries(Object.keys(when).filter((slug) => fs.existsSync(path.join(dir, slug + "-captions.json"))).map((slug) => {
    const own = JSON.parse(fs.readFileSync(path.join(dir, slug + "-captions.json"), "utf8"));
    return [slug, Object.assign({ kind: "launch", textLang: slug.split("/")[0], title: String(own.x || "").split("\n")[0] }, own)];
  }));
}

function posts(batch, root = ROOT, network = "bluesky") {
  const route = ROUTES[network];
  const dir = path.join(root, "media/social-posts", batch);
  const when = slots(dir, route.slot);
  if (NO_LAUNCH.has(network) && isLaunch(dir)) return [];
  const captions = captionsOf(dir, when);
  return Object.keys(captions).filter((slug) => captions[slug].x && !captions[slug].hold && when[slug] && (!route.caption || captions[slug][route.caption]))
    .map((slug) => {
      const asset = when[slug].asset || "feed/" + slug + ".jpg";
      return { batch, slug, cap: captions[slug], at: when[slug].at, image: path.join(dir, asset), url: SITE + "/media/social-posts/" + batch + "/" + asset };
    });
}

// Slots that have come and are not MISSED_MS old, oldest first.
function due(list, now) {
  return list.filter((post) => post.at <= now && now - post.at <= MISSED_MS).sort((a, b) => a.at - b.at);
}

const marker = (post) => "/social/" + post.batch + "/" + post.slug + ".html";

// The x caption's own links are tagged utm_source=x. A face posts the caption in its own language when the hub
// has translated it (scripts/face-route.js captionFor, #2346).
function caption(post, network, face = faceRoute.DEFAULT) {
  const key = (ROUTES[network] || ROUTES.bluesky).caption;
  if (!key) return "";
  const own = String(faceRoute.captionFor(post.cap, key, face));
  const text = key === "x" ? own.replace(/utm_source=x\b/g, "utm_source=" + network) : own;
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
  const why = json.error && json.error.message ? json.error.message : json.message || json.error;
  if (!res.ok || (json.error && json.error.message)) throw new Error(label + " " + res.status + ": " + String(why || JSON.stringify(json)).slice(0, 300));
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The Graph APIs of Instagram and Threads, with the token as a parameter.
function graph(base, token, label) {
  return async (method, edge, params = {}) => {
    const qs = new URLSearchParams(Object.assign({}, params, { access_token: token || "" }));
    const res = method === "GET" ? await fetch(base + "/" + edge + "?" + qs) : await fetch(base + "/" + edge, { method, body: qs });
    return reply(res, label + " " + edge.split("/").pop());
  };
}

// Instagram and Threads fetch the image themselves: a slot whose image the site does not serve yet fails and is retried.
async function served(url) {
  const res = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (!res || !res.ok) throw new Error("the site does not serve " + url + " yet");
}

// A media container is ready once the network has fetched and processed the image.
async function ready(status, id) {
  for (let i = 0; ; i += 1) {
    const s = await status(id);
    if (s === "FINISHED") return;
    if (s === "ERROR" || s === "EXPIRED" || i === 20) throw new Error("media container " + id + " is " + s);
    await sleep(3000);
  }
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
    },
    // putRecord replaces the whole profile record, so the name, bio and other fields are carried over from the current one.
    async profile({ avatar, banner }) {
      const current = await xrpc("com.atproto.repo.getRecord", { query: { repo: session.did, collection: "app.bsky.actor.profile", rkey: "self" } })
        .catch((error) => { if (/RecordNotFound|Could not locate record/i.test(error.message)) return null; throw error; });
      const record = Object.assign({ $type: "app.bsky.actor.profile" }, current ? current.value : {});
      record.avatar = (await xrpc("com.atproto.repo.uploadBlob", { body: fs.readFileSync(avatar), type: "image/jpeg" })).blob;
      record.banner = (await xrpc("com.atproto.repo.uploadBlob", { body: fs.readFileSync(banner), type: "image/jpeg" })).blob;
      const body = { repo: session.did, collection: "app.bsky.actor.profile", rkey: "self", record };
      if (current && current.cid) body.swapRecord = current.cid;
      await xrpc("com.atproto.repo.putRecord", { body });
      return "https://bsky.app/profile/" + session.handle;
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
    },
    async profile({ avatar, banner }) {
      const form = new FormData();
      form.append("avatar", new Blob([fs.readFileSync(avatar)], { type: "image/jpeg" }), path.basename(avatar));
      form.append("header", new Blob([fs.readFileSync(banner)], { type: "image/jpeg" }), path.basename(banner));
      const account = await call("PATCH", "/api/v1/accounts/update_credentials", form);
      return account.url;
    }
  };
}

function threads(env = process.env) {
  const call = graph(THREADS, env.THREADS_TOKEN, "Threads");
  return {
    ready: Boolean(env.THREADS_TOKEN),
    async login() {
      const me = await call("GET", "me", { fields: "id,username" });
      return "threads.net/@" + me.username;
    },
    async recent() {
      const { data } = await call("GET", "me/threads", { fields: "id,text,permalink", limit: "100" });
      return (data || []).map((t) => ({ id: t.id, text: t.text || "", url: t.permalink || "" }));
    },
    async post({ text, url, alt }) {
      await served(url);
      const box = await call("POST", "me/threads", { media_type: "IMAGE", image_url: url, text, alt_text: alt });
      await ready(async (id) => (await call("GET", id, { fields: "status" })).status, box.id);
      const { id } = await call("POST", "me/threads_publish", { creation_id: box.id });
      const { permalink } = await call("GET", id, { fields: "permalink" }).catch(() => ({}));
      return { id, url: permalink || "" };
    }
  };
}

// The feed and the stories of the Instagram professional account linked to the Facebook Page.
function instagram(env = process.env, story = false) {
  const call = graph(GRAPH, env.FACEBOOK_PAGE_TOKEN, "Instagram");
  const ig = env.INSTAGRAM_USER_ID;
  return {
    ready: Boolean(ig && env.FACEBOOK_PAGE_TOKEN),
    async login() {
      const me = await call("GET", ig, { fields: "username" });
      return "instagram.com/" + me.username;
    },
    // Stories carry no caption to match on; the ledger alone keeps one from going out twice.
    async recent() {
      if (story) return [];
      const { data } = await call("GET", ig + "/media", { fields: "id,caption,permalink", limit: "100" });
      return (data || []).map((m) => ({ id: m.id, text: m.caption || "", url: m.permalink || "" }));
    },
    async post({ text, url, alt }) {
      await served(url);
      const box = await call("POST", ig + "/media", story ? { image_url: url, media_type: "STORIES" } : { image_url: url, caption: text, alt_text: alt });
      await ready(async (id) => (await call("GET", id, { fields: "status_code" })).status_code, box.id);
      const { id } = await call("POST", ig + "/media_publish", { creation_id: box.id });
      const { permalink } = await call("GET", id, { fields: "permalink" }).catch(() => ({}));
      return { id, url: permalink || "" };
    }
  };
}

// The @qalab_live channel (TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL), where scripts/telegram-live.js posts the Live Reports.
// A bot cannot read a channel's history, so the ledger alone keeps a post from going out twice.
function telegram(env = process.env) {
  const chat = env.TELEGRAM_CHANNEL || "";
  let user = "";
  async function call(method, body) {
    const res = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error("Telegram " + method + " " + res.status + ": " + String(json.description || "no answer").slice(0, 200));
    return json.result;
  }
  return {
    ready: Boolean(env.TELEGRAM_BOT_TOKEN && chat),
    async login() {
      const me = await call("getChat", { chat_id: chat });
      user = me.username || "";
      return "Telegram @" + (user || String(chat).replace(/^@/, ""));
    },
    async recent() { return []; },
    async post({ text, url }) {
      await served(url);
      const m = await call("sendPhoto", { chat_id: chat, photo: url, caption: text });
      return { id: String(m.message_id), url: user ? "https://t.me/" + user + "/" + m.message_id : "" };
    }
  };
}

const NETWORKS = { bluesky, mastodon, threads, instagram: (env) => instagram(env, false), "instagram-story": (env) => instagram(env, true), telegram };

// The face whose language a post speaks, for a brand network that posts every language.
const ownFace = (post) => faceRoute.postFace(post.batch, post.slug, post.cap, "x", new Set(Object.keys(FACES)));

/* What the Reddit app posts in r/QALabLiveReports (#2606): every post on its x slot, each in its own language, as a
   link to its hub page. Reddit lets the app fetch nothing from the site, so reddit/live-reports/scripts/build.mjs
   bundles the slots from MISSED_MS ago to ahead with each daily upload; hub first means only posts whose hub page is
   already in the site. The title is the caption's first line, without links or hashtags, cut to Reddit's 300. */
function redditTitle(text) {
  const line = String(text || "").split("\n").map((l) => l.replace(/https?:\/\/\S+|#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim()).find(Boolean) || "";
  if ([...line].length <= 300) return line;
  return [...line].slice(0, 299).join("").replace(/\s+\S*$/u, "") + "…";
}

function redditPosts(now, ahead, root = ROOT) {
  return allBatches(root).flatMap((batch) => posts(batch, root, "telegram"))
    .filter((p) => p.at > now - MISSED_MS && p.at <= now + ahead && fs.existsSync(path.join(root, "social", p.batch, p.slug + ".html")))
    .sort((a, b) => a.at - b.at)
    .map((p) => {
      const face = ownFace(p);
      return {
        key: p.batch + "/" + p.slug, at: p.at, lang: faceRoute.captionLang(p.cap, "x", face),
        title: redditTitle(faceRoute.captionFor(p.cap, "x", face)) || p.cap.title || p.slug,
        url: SITE + "/social/" + p.batch + "/" + p.slug + ".html?utm_source=reddit&utm_medium=social&utm_campaign=" + p.batch
      };
    }).filter((p) => p.title);
}

async function run(network, client, list, book, { live, now, gate, face = faceRoute.DEFAULT }) {
  const faceFor = typeof face === "function" ? face : () => face;
  const key = (ROUTES[network] || ROUTES.bluesky).caption || "x";
  const todo = due(list, now).filter((post) => !(book.posts[post.batch + "/" + post.slug] || []).some((e) => e.channel === network && e.result === "sent"));
  const counts = { posted: 0, already: 0, held: 0, failed: 0, waiting: Math.max(0, todo.length - PER_RUN) };
  if (!live) {
    for (const post of todo.slice(0, PER_RUN)) {
      const hub = await gate(post.batch, post.slug, post.cap, new Date(now).toISOString());
      const f = faceFor(post);
      const text = caption(post, network, f);
      console.log("dry-run", "@" + FACES[f].handle, faceRoute.captionLang(post.cap, key, f), network, post.batch + "/" + post.slug, new Date(post.at).toISOString(), hub.why ? "HELD: " + hub.why : "hub ok", [...text].length + " chars", text.split("\n").pop());
    }
    return counts;
  }
  if (!todo.length) return counts;
  const profile = client.profile || await client.login();
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
      const f = faceFor(post);
      const r = await client.post({ text: caption(post, network, f), image: post.image, url: post.url, alt: post.cap.alt || post.cap.title || "", lang: faceRoute.captionLang(post.cap, key, f), key: name });
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
  const batches = batch ? [batch] : allBatches();
  const books = {};
  const bookOf = (network) => {
    const file = LEDGERS[network] || ledger.OPEN_SOCIAL;
    if (!books[file]) { const book = ledger.read(file); books[file] = { book, before: JSON.stringify(book) }; }
    return books[file].book;
  };
  const gate = createGate();
  const now = Date.now();
  let broken = false;
  for (const network of only ? [only] : Object.keys(NETWORKS)) {
    const book = bookOf(network);
    if (BRAND.has(network)) {
      const client = NETWORKS[network](faceRoute.faceEnv(faceRoute.DEFAULT));
      if (live && !client.ready) { console.log(network + ": no account connected, skipped"); continue; }
      try {
        if (live) client.profile = await client.login();
        const c = await run(network, client, batches.flatMap((name) => posts(name, ROOT, network)), book, { live, now, gate, face: ownFace });
        console.log(network + ": " + c.posted + " posted, " + c.held + " held, " + c.failed + " failed, " + c.waiting + " due for a later run");
        if (c.failed) broken = true;
      } catch (error) {
        broken = true;
        console.log(network + ": " + error.message);
      }
      continue;
    }
    const clients = [];
    for (const set of Object.keys(FACES)) {
      const client = NETWORKS[network](faceRoute.faceEnv(set));
      if (!live) { if (client.ready || set === faceRoute.DEFAULT) clients.push({ face: set, client }); continue; }
      if (!client.ready) continue;
      try {
        client.profile = await client.login();
      } catch (error) {
        broken = true;
        console.log(network + ": " + error.message);
        continue;
      }
      const face = faceRoute.accountFace(client.profile);
      if (!face || clients.some((c) => c.face === face)) {
        broken = true;
        console.log(network + ": " + client.profile + (face ? " is held by two sets of secrets; the first posts" : " is no face's account (scripts/brand-kit/faces.js), skipped"));
        continue;
      }
      clients.push({ face, client });
    }
    if (live && !clients.length) { console.log(network + ": no account connected, skipped"); continue; }
    const connected = new Set(clients.filter((c) => c.client.ready).map((c) => c.face));
    const all = batches.flatMap((name) => posts(name, ROOT, network));
    for (const { face, client } of clients) {
      const label = network + " @" + FACES[face].handle;
      const list = all.filter((post) => faceRoute.postFace(post.batch, post.slug, post.cap, ROUTES[network].slot, connected) === face);
      if (!live && !list.length) continue;
      try {
        const c = await run(network, client, list, book, { live, now, gate, face });
        console.log(label + ": " + c.posted + " posted, " + c.already + " already on the account, " + c.held + " held, " + c.failed + " failed, " + c.waiting + " due for a later run");
        if (c.failed) broken = true;
      } catch (error) {
        broken = true;
        console.log(label + ": " + error.message);
      }
    }
  }
  if (live) Object.entries(books).forEach(([file, b]) => { if (JSON.stringify(b.book) !== b.before) ledger.write(file, b.book); });
  if (broken) process.exit(1);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { PER_RUN, MISSED_MS, ROUTES, NETWORKS, BRAND, LEDGERS, NO_LAUNCH, xSlots, allBatches, posts, due, caption, ownFace, redditTitle, redditPosts, facets, run, bluesky, mastodon, telegram };
