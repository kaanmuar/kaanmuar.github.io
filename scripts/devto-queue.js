#!/usr/bin/env node
/* Posts Live Report write-ups and tips from the social hub to dev.to as articles, one face per language (#2326).

     DEVTO_API_KEY=... DEVTO_API_KEY_ES=... node scripts/devto-queue.js [--dry-run]

   dev.to takes articles, not captions. Each review or tip on the hub (assets/social/feed*.json) becomes one article
   in its post's language: the language its clip speaks (captions.json lang), else the language it was written in,
   with the hub's translation of the text. A post the translator left without that language goes out in English. A
   post whose text is under MIN_PROSE characters, without links and hashtags, is too thin for an article.

   The article is the hub page's text in markdown with the card, its canonical_url is the hub page, so the site
   keeps the search credit, and its tags are the first four of the post's hashtags. devto.yml runs this once a day
   and each face posts at most PER_DAY articles a Bogotá day: the newest post whose hub day has come in the last
   WINDOW_DAYS. Older posts are left alone, so connecting a face does not post its backlog.

   en/de/fr/it go to @qalaburlreview with DEVTO_API_KEY, es/pt to @qaurlreview with DEVTO_API_KEY_ES
   (scripts/face-route.js, #2310). Each run logs every key in and gives it to the face whose username it logs in
   as, whichever secret holds it; until @qaurlreview has a key, @qalaburlreview posts its languages too. Without a
   key nothing posts. --dry-run logs nothing in and prints the articles each face would post, as if both faces had
   their key when neither has one.

   Every article goes into the ledger assets/social/devto.json (scripts/social-ledger.js) under its hub post as sent
   or failed; a post sent from either face, in any language, is not posted again. Before posting, each run reads
   the account's articles and skips a post one of them already points to. Hub first (scripts/hub-gate.js). Exits 1
   when a key was refused or an article failed.

   A key: dev.to > Settings > Extensions > DEV Community API Keys, stored as the DEVTO_API_KEY secret
   (DEVTO_API_KEY_ES for @qaurlreview). */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const { createGate, hubUrl, bogotaDay } = require("./hub-gate");
const faceRoute = require("./face-route");
const { FACES } = require("./brand-kit/faces");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const API = "https://dev.to/api";
const CHANNEL = "devto";
const KINDS = new Set(["review", "tip"]);
const MIN_PROSE = 300;
const PER_DAY = 1;
const WINDOW_DAYS = 7;
const FEEDS = ["en", "es", "pt", "de", "fr", "it"];
// dev.to tags are lowercase letters and digits, at most four; the brand tag says nothing about the topic.
const TAG = /^[a-z0-9]{2,30}$/;
const BRAND_TAGS = new Set(["qalab"]);
const FALLBACK_TAGS = ["qa", "webdev"];
const HASHTAG = /#([\p{L}\p{N}_]+)/gu;
const URL_RE = /https?:\/\/[^\s<>]+/g;
const FOOTER = {
  en: "First published on the [QA-lab URL Review social hub]({url}).",
  es: "Publicado primero en el [hub social de QA-lab URL Review]({url}).",
  pt: "Publicado primeiro no [hub social do QA-lab URL Review]({url}).",
  de: "Zuerst erschienen im [Social Hub von QA-lab URL Review]({url}).",
  fr: "Publié d'abord sur le [hub social de QA-lab URL Review]({url}).",
  it: "Pubblicato per la prima volta sull'[hub social di QA-lab URL Review]({url})."
};

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

// Every post on the hub, each language's variant once.
function feedPosts(root = ROOT) {
  const seen = new Map();
  FEEDS.forEach((lang) => {
    const file = path.join(root, "assets/social/feed" + (lang === "en" ? "" : "-" + lang) + ".json");
    if (!fs.existsSync(file)) return;
    (JSON.parse(fs.readFileSync(file, "utf8")).posts || []).forEach((post) => {
      if (post.id && !seen.has(post.id)) seen.set(post.id, post);
    });
  });
  return [...seen.values()];
}

// The hub gives a translated variant the id <post>-<lang>; the post itself keeps the plain id.
function baseId(post, ids) {
  const sfx = "-" + post.lang;
  return post.lang !== "en" && post.id.endsWith(sfx) && ids.has(post.id.slice(0, -sfx.length)) ? post.id.slice(0, -sfx.length) : post.id;
}

// One article per hub post, in its clip's language when the hub has that variant.
function articles(posts) {
  const ids = new Set(posts.map((post) => post.id));
  const groups = new Map();
  posts.forEach((post) => {
    const key = baseId(post, ids);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(post);
  });
  return [...groups].map(([key, list]) => {
    const base = list.find((post) => post.id === key) || list[0];
    const want = base.clipLang || base.lang || "en";
    const post = list.find((p) => p.lang === want) || base;
    const cut = post.id.indexOf("/");
    return {
      key, id: post.id, batch: post.id.slice(0, cut), slug: post.id.slice(cut + 1), lang: post.lang || "en", kind: post.kind,
      date: post.date || "", title: post.title || "", text: post.text || "", image: post.image || "", alt: post.alt || post.title || "",
      held: !!post.held, urls: list.map((p) => hubUrl(p.id.slice(0, p.id.indexOf("/")), p.id.slice(p.id.indexOf("/") + 1)))
    };
  });
}

const prose = (text) => String(text).split("\n").filter((line) => !isTagLine(line)).join("\n").replace(URL_RE, "").replace(HASHTAG, "").trim();
const isTagLine = (line) => /^\s*#[\p{L}\p{N}_]/u.test(line) && line.replace(HASHTAG, "").trim() === "";

function eligible(article) {
  return KINDS.has(article.kind) && !article.held && article.title && [...prose(article.text)].length >= MIN_PROSE;
}

// Posts whose hub day came within the last WINDOW_DAYS, newest first.
function due(list, now) {
  const today = bogotaDay(now);
  const first = bogotaDay(now - WINDOW_DAYS * 86400e3);
  return list.filter((a) => a.date && a.date <= today && a.date >= first).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

function tags(text) {
  const found = [...String(text).matchAll(HASHTAG)].map((m) => m[1].toLowerCase()).filter((tag) => TAG.test(tag) && !BRAND_TAGS.has(tag));
  return [...new Set(found.concat(FALLBACK_TAGS))].slice(0, 4);
}

const imageUrl = (image) => (/^https?:\/\//.test(image) ? image : SITE + "/" + String(image).replace(/^\//, ""));

// The hub's translated text still links the English report page; each language has its own.
const REPORT_PAGES = new Set(["es", "pt", "de", "fr", "it"]);
const link = (url, lang) => {
  const tagged = url.replace(/utm_source=[\w-]+/, "utm_source=devto");
  return REPORT_PAGES.has(lang) ? tagged.replace(/\/qa-review\.html(?=[?#]|$)/, "/qa-review-" + lang + ".html") : tagged;
};

// A line of caption text in markdown: its links tagged for dev.to and kept whole, any other angle bracket shown as text.
function mdLine(line, lang) {
  const out = [];
  let last = 0;
  for (const match of line.matchAll(URL_RE)) {
    out.push(escape(line.slice(last, match.index)), "<" + link(match[0], lang) + ">");
    last = match.index + match[0].length;
  }
  out.push(escape(line.slice(last)));
  return out.join("");
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The hub text a line per paragraph, the card after its opening paragraph, and where it was first published.
function markdown(article) {
  const lines = String(article.text).split("\n").map((line) => line.trim()).filter((line) => line && !isTagLine(line)).map((line) => mdLine(line, article.lang));
  const hub = hubUrl(article.batch, article.slug) + "?utm_source=devto&utm_medium=social&utm_campaign=" + article.batch;
  const card = article.image ? "![" + String(article.alt).replace(/[[\]\n]/g, " ").trim() + "](" + imageUrl(article.image) + ")" : null;
  const body = lines.slice(0, 1).concat(card ? [card] : [], lines.slice(1));
  return body.join("\n\n") + "\n\n---\n\n*" + (FOOTER[article.lang] || FOOTER.en).replace("{url}", hub) + "*\n";
}

function payload(article) {
  const out = { title: article.title, body_markdown: markdown(article), published: true, tags: tags(article.text), canonical_url: hubUrl(article.batch, article.slug) };
  if (article.image) out.main_image = imageUrl(article.image);
  return out;
}

async function reply(res, label) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(label + " " + res.status + ": " + String(json.error || json.message || JSON.stringify(json)).slice(0, 300));
  return json;
}

function devto(env = process.env, fetchImpl = fetch) {
  const call = async (method, route, body) => reply(await fetchImpl(API + route, {
    method,
    headers: Object.assign({ "api-key": env.DEVTO_API_KEY || "", Accept: "application/vnd.forem.api-v1+json", "User-Agent": "qa-lab-devto-poster" }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined
  }), "dev.to " + method + " " + route.split("?")[0]);
  return {
    ready: Boolean(env.DEVTO_API_KEY),
    async login() {
      const me = await call("GET", "/users/me");
      return "dev.to/" + me.username;
    },
    async recent() {
      const list = await call("GET", "/articles/me/all?per_page=1000");
      return (list || []).map((a) => ({ id: a.id, url: a.url || "", canonical: String(a.canonical_url || "").split("?")[0], body: a.body_markdown || "", at: a.published_at || "" }));
    },
    async post(article) {
      const a = await call("POST", "/articles", { article });
      return { id: a.id, url: a.url || "" };
    }
  };
}

const sentAnywhere = (book, key) => (book.posts[key] || []).some((e) => e.channel === CHANNEL && e.result === "sent");

// The account already has this post when one of its articles points at the post's hub page in any language.
function onAccount(recent, article) {
  return recent.find((r) => article.urls.includes(r.canonical) || article.urls.some((url) => r.body.includes(url.slice(SITE.length)))) || null;
}

function print(face, article, body, why) {
  console.log("\n=== dry-run devto @" + FACES[face].handle + " " + article.id + " (" + article.lang + ", hub day " + article.date + ") " + (why ? "HELD: " + why : "hub ok"));
  if (why) return;
  console.log("title: " + body.title + "\ntags: " + body.tags.join(", ") + "\ncanonical_url: " + body.canonical_url + "\nmain_image: " + (body.main_image || "-") + "\n---\n" + body.body_markdown);
}

async function run(face, client, list, book, { live, now, gate }) {
  const today = bogotaDay(now);
  const counts = { posted: 0, already: 0, held: 0, failed: 0, waiting: 0 };
  const todo = due(list, now).filter((a) => !sentAnywhere(book, a.key));
  if (!todo.length) return counts;
  const mine = (e) => e.channel === CHANNEL && e.profile === client.profile && e.result === "sent" && e.at && bogotaDay(e.at) === today;
  let room = PER_DAY - Object.values(book.posts).flat().filter(mine).length;
  const recent = live ? await client.recent() : [];
  const record = (a, entry) => ledger.record(book, a.key, Object.assign({ channel: CHANNEL, profile: client.profile, checked: new Date().toISOString() }, entry));
  for (const a of todo) {
    if (room <= 0) { counts.waiting += 1; continue; }
    const there = onAccount(recent, a);
    if (there) {
      counts.already += 1;
      const at = there.at || new Date(now).toISOString();
      record(a, { id: String(there.id), url: there.url, at, result: "sent" });
      if (bogotaDay(at) === today) room -= 1;
      continue;
    }
    const at = new Date().toISOString();
    const hub = await gate(a.batch, a.slug, { date: a.date }, at);
    const body = payload(a);
    if (!live) {
      print(face, a, body, hub.why);
      if (hub.why) counts.held += 1;
      else { counts.posted += 1; room -= 1; }
      continue;
    }
    if (hub.why) {
      counts.held += 1;
      console.log("held devto " + a.id + " - Hub first: " + hub.why);
      record(a, { at, result: "failed", error: "Hub first: " + hub.why });
      continue;
    }
    try {
      const r = await client.post(body);
      counts.posted += 1;
      room -= 1;
      console.log("posted devto " + a.id + " " + r.url);
      record(a, { id: String(r.id), url: r.url, at, result: "sent" });
    } catch (error) {
      counts.failed += 1;
      console.log("failed devto " + a.id + " - " + error.message);
      record(a, { at, result: "failed", error: error.message.split("\n")[0] });
      break;
    }
  }
  return counts;
}

async function main() {
  const opts = args();
  const live = !opts["dry-run"];
  const book = ledger.read(ledger.DEVTO);
  const before = JSON.stringify(book);
  const gate = createGate();
  const now = Date.now();
  let broken = false;
  const sets = Object.keys(FACES).map((set) => ({ set, client: devto(faceRoute.faceEnv(set)) }));
  const anyKey = sets.some((s) => s.client.ready);
  const clients = [];
  for (const { set, client } of sets) {
    if (!live) {
      if (client.ready || !anyKey) clients.push({ face: set, client: Object.assign(client, { profile: "dev.to/" + FACES[set].handle }) });
      continue;
    }
    if (!client.ready) continue;
    try {
      client.profile = await client.login();
    } catch (error) {
      broken = true;
      console.log("devto: " + error.message);
      continue;
    }
    const face = faceRoute.accountFace(client.profile);
    if (!face || clients.some((c) => c.face === face)) {
      broken = true;
      console.log("devto: " + client.profile + (face ? " is held by two keys; the first posts" : " is no face's account (scripts/brand-kit/faces.js), skipped"));
      continue;
    }
    clients.push({ face, client });
  }
  if (!clients.length) {
    console.log("devto: no key connected, skipped");
    if (broken) process.exit(1);
    return;
  }
  if (!live && !anyKey) console.log("devto: no key set, so each face's articles show as if both faces had their key");
  const connected = new Set(clients.map((c) => c.face));
  const list = articles(feedPosts()).filter(eligible);
  for (const { face, client } of clients) {
    const label = "devto @" + FACES[face].handle;
    try {
      const c = await run(face, client, list.filter((a) => faceRoute.route(a.lang, connected) === face), book, { live, now, gate });
      console.log("\n" + label + ": " + c.posted + (live ? " posted, " : " would post, ") + c.already + " already on the account, " + c.held + " held, " + c.failed + " failed, " + c.waiting + " more from the last " + WINDOW_DAYS + " days wait their turn");
      if (c.failed) broken = true;
    } catch (error) {
      broken = true;
      console.log(label + ": " + error.message);
    }
  }
  if (live && JSON.stringify(book) !== before) ledger.write(ledger.DEVTO, book);
  if (broken) process.exit(1);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { MIN_PROSE, PER_DAY, WINDOW_DAYS, feedPosts, articles, eligible, due, tags, markdown, payload, devto, run, onAccount };
