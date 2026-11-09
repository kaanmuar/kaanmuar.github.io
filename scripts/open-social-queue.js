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
   secrets are missing is skipped. Threads also uses its composer (scripts/threads-compose.js, #2701): a topic, the
   clip from the batch's release when it speaks the caption's language, polls in our reply under a quiz, GIFs,
   quotes, spoilers, location tags and long-form text.
   Bluesky, Mastodon, Telegram and Instagram use theirs (scripts/open-social-compose.js): videos and reels, polls,
   quotes and replies, content warnings and link cards, each falling back to the plain card.

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
   threads_basic and threads_content_publish, plus threads_manage_replies for our replies and threads_location_tagging
   for places; it lasts 60 days, and scripts/meta-token.js renews it. Instagram: the
   professional account's id and the Facebook Page token with instagram_basic and instagram_content_publish
   (scripts/meta-token.js sets both). Threads and Instagram fetch the image from the site, so it must be live. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const { createGate, withHubLink, hubUrl } = require("./hub-gate");
const faceRoute = require("./face-route");
const threadsCompose = require("./threads-compose");
const compose = require("./open-social-compose");
const { FACES } = require("./brand-kit/faces");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const GRAPH = "https://graph.facebook.com/" + (process.env.FACEBOOK_GRAPH_VERSION || "v23.0");
const THREADS = "https://graph.threads.net/v1.0";
const BSKY_VIDEO = "https://video.bsky.app";
const CLIPS = "https://github.com/" + (process.env.GITHUB_REPOSITORY || "kaanmuar/kaanmuar.github.io") + "/releases/download/";
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
  const clips = faceRoute.voiced(batch, root);
  return Object.keys(captions).filter((slug) => captions[slug].x && !captions[slug].hold && when[slug] && (!route.caption || captions[slug][route.caption]))
    .map((slug) => {
      const asset = when[slug].asset || "feed/" + slug + ".jpg";
      const quiz = Object.keys(captions).find((other) => captions[other].answer === slug);
      const answer = captions[slug].answer && captions[captions[slug].answer];
      const clip = { url: CLIPS + batch + "/" + slug + ".mp4", lang: (clips[slug] && clips[slug].lang) || captions[slug].lang || "en" };
      return Object.assign({ batch, slug, cap: captions[slug], at: when[slug].at, image: path.join(dir, asset), url: SITE + "/media/social-posts/" + batch + "/" + asset, clip },
        quiz ? { quiz, quizCap: captions[quiz] } : {}, answer ? { answerCap: answer } : {});
    });
}

// Slots that have come and are not MISSED_MS old, oldest first.
function due(list, now) {
  return list.filter((post) => post.at <= now && now - post.at <= MISSED_MS).sort((a, b) => a.at - b.at);
}

const marker = (post) => "/social/" + post.batch + "/" + post.slug + ".html";

// The x caption's own links are tagged utm_source=x. A face posts the caption in its own language when the hub
// has translated it (scripts/face-route.js captionFor, #2346). Threads carries a topic instead of the hashtags.
function caption(post, network, face = faceRoute.DEFAULT) {
  const key = (ROUTES[network] || ROUTES.bluesky).caption;
  if (!key) return "";
  const own = String(faceRoute.captionFor(post.cap, key, face));
  const tagged = key === "x" ? own.replace(/utm_source=x\b/g, "utm_source=" + network) : own;
  const text = network === "threads" ? threadsCompose.withoutHashtags(tagged) : tagged;
  return withHubLink(text, { batch: post.batch, slug: post.slug, network });
}

// What a Threads post adds to its card (scripts/threads-compose.js): topic, clip, the quiz it answers, the long caption.
function threadsExtras(post, face, book) {
  const quiz = post.quiz && (book.posts[post.batch + "/" + post.quiz] || []).find((e) => e.channel === "threads" && e.result === "sent" && e.id);
  const long = post.cap.linkedin ? String(faceRoute.captionFor(post.cap, "linkedin", face)).replace(/utm_source=linkedin\b/g, "utm_source=threads") : "";
  return {
    cap: post.cap, clip: post.clip, long, quote: quiz ? quiz.id : "", place: post.cap.place || "",
    topic: threadsCompose.topicOf(faceRoute.captionFor(post.cap, "x", face), post.cap.cat || ""),
    hub: hubUrl(post.batch, post.slug) + "?utm_source=threads&utm_medium=social&utm_campaign=" + post.batch
  };
}

const PLANS = { threads: threadsCompose.plans, bluesky: compose.bluesky, mastodon: compose.mastodon, telegram: compose.telegram, instagram: compose.instagram };

// What a post adds to its card on a network with a composer: the clip, both halves of a quiz, the quiz's own post there.
function extras(network, post, face, book) {
  if (network === "threads") return threadsExtras(post, face, book);
  if (!PLANS[network]) return {};
  const quiz = post.quiz && (book.posts[post.batch + "/" + post.quiz] || []).find((e) => e.channel === network && e.result === "sent" && e.id);
  return {
    cap: post.cap, clip: post.clip, quizCap: post.quizCap, answerCap: post.answerCap, quote: quiz ? quiz.id : "",
    hub: hubUrl(post.batch, post.slug) + "?utm_source=" + network + "&utm_medium=social&utm_campaign=" + post.batch
  };
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
  if (!res.ok || (json.error && json.error.message)) {
    throw Object.assign(new Error(label + " " + res.status + ": " + String(why || JSON.stringify(json)).slice(0, 300)), { status: res.status });
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bluesky and Mastodon take the clip's bytes; the release download redirects to GitHub's storage.
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("no clip at " + url + " (" + res.status + ")");
  return Buffer.from(await res.arrayBuffer());
}

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

/* GitHub's robots.txt disallows release downloads and Meta refuses a video_url its robots.txt blocks (#2728), so
   Threads and Instagram fetch the clip from the signed release-assets address the download redirects to, which
   lasts some minutes. null when the batch's release has no such clip. */
async function released(clip) {
  const res = await fetch(clip.url, { method: "HEAD", redirect: "manual" }).catch(() => null);
  if (!res) return null;
  if (res.status >= 300 && res.status < 400) return res.headers.get("location") ? Object.assign({}, clip, { url: res.headers.get("location") }) : null;
  return res.ok ? clip : null;
}

// A media container is ready once the network has fetched and processed the image or the clip.
async function ready(status, id, tries = 20, wait = 3000) {
  for (let i = 0; ; i += 1) {
    const s = await status(id);
    if (s === "FINISHED") return;
    if (s === "ERROR" || s === "EXPIRED" || i === tries) throw new Error("media container " + id + " is " + s);
    await sleep(wait);
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
    /* Tries each plan of scripts/open-social-compose.js, richest first. A media upload that fails, or a record
       Bluesky refuses as invalid (400), moves to the next plan; any other failure may have created the post, so it
       is not retried as a plainer one. */
    async post(args) {
      const { text, image, alt, lang } = args;
      const once = {};
      const get = (name, make) => once[name] || (once[name] = make());
      const imageBlob = async () => (await xrpc("com.atproto.repo.uploadBlob", { body: fs.readFileSync(image), type: "image/jpeg" })).blob;
      // The video service processes the clip before the post goes out, and stores it on our PDS with a service token.
      const video = async () => {
        const bytes = await download(args.clip.url);
        const pds = ((session.didDoc && session.didDoc.service) || []).find((s) => String(s.id).endsWith("#atproto_pds"));
        const { token } = await xrpc("com.atproto.server.getServiceAuth", {
          query: { aud: "did:web:" + new URL(pds ? pds.serviceEndpoint : service).host, lxm: "com.atproto.repo.uploadBlob", exp: String(Math.floor(Date.now() / 1000) + 1800) }
        });
        const res = await fetch(BSKY_VIDEO + "/xrpc/app.bsky.video.uploadVideo?" + new URLSearchParams({ did: session.did, name: args.key.replace(/\W+/g, "-") + ".mp4" }), {
          method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "video/mp4" }, body: bytes
        });
        const first = await res.json().catch(() => ({}));
        let job = first.jobStatus || first;
        for (let i = 0; !job.blob; i += 1) {
          if (!job.jobId || job.state === "JOB_STATE_FAILED" || i === 90) throw new Error("Bluesky video " + (job.error || job.message || job.state || res.status));
          await sleep(2000);
          const status = await fetch(BSKY_VIDEO + "/xrpc/app.bsky.video.getJobStatus?jobId=" + encodeURIComponent(job.jobId)).then((r) => r.json()).catch(() => ({}));
          job = Object.assign({ jobId: job.jobId }, status.jobStatus || { error: status.message || status.error });
        }
        const aspectRatio = compose.aspectOf(bytes);
        return Object.assign({ video: job.blob }, aspectRatio ? { aspectRatio } : {});
      };
      const quoted = async () => {
        const { posts } = await xrpc("app.bsky.feed.getPosts", { query: { uris: args.quote } });
        const p = (posts || [])[0];
        if (!p || !p.cid) throw new Error("Bluesky has no quiz post " + args.quote);
        return { uri: p.uri, cid: p.cid };
      };
      const embeds = {
        image: async () => ({ $type: "app.bsky.embed.images", images: [{ alt, image: await get("image", imageBlob) }] }),
        video: async () => Object.assign({ $type: "app.bsky.embed.video", alt }, await get("video", video)),
        card: async () => {
          const lead = text.split("\n")[0];
          const title = compose.titleIn(args.cap, lang) || lead;
          return { $type: "app.bsky.embed.external", external: { uri: args.hub, title, description: lead === title ? "" : lead, thumb: await get("image", imageBlob) } };
        }
      };
      const links = facets(text);
      let refused = null;
      for (const plan of compose.bluesky(args)) {
        const record = { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), langs: [lang] };
        if (links.length) record.facets = links;
        try {
          const media = await embeds[plan.media]();
          record.embed = plan.quote ? { $type: "app.bsky.embed.recordWithMedia", record: { $type: "app.bsky.embed.record", record: await get("quote", quoted) }, media } : media;
        } catch (error) {
          refused = error;
          console.log("Bluesky could not add " + plan.uses.join(", ") + " - " + error.message);
          continue;
        }
        try {
          const { uri } = await xrpc("com.atproto.repo.createRecord", { body: { repo: session.did, collection: "app.bsky.feed.post", record } });
          return { id: uri, url: "https://bsky.app/profile/" + session.handle + "/post/" + uri.split("/").pop(), uses: plan.uses };
        } catch (error) {
          if (error.status !== 400) throw error;
          refused = error;
          console.log("Bluesky refused " + plan.uses.join(", ") + " - " + error.message);
        }
      }
      throw refused;
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
    /* Tries each plan of scripts/open-social-compose.js, richest first. A failed upload, or a status Mastodon refuses
       as invalid (422), moves to the next plan; any other failure is not retried as a plainer post. A large image or
       a video is still processing when /api/v2/media answers; the status needs its url. */
    async post(args) {
      const { text, image, alt, lang, key } = args;
      const uploads = {};
      const card = () => new Blob([fs.readFileSync(image)], { type: "image/jpeg" });
      const upload = (kind) => uploads[kind] || (uploads[kind] = (async () => {
        const form = new FormData();
        if (kind === "video") {
          form.append("file", new Blob([await download(args.clip.url)], { type: "video/mp4" }), path.basename(new URL(args.clip.url).pathname));
          form.append("thumbnail", card(), path.basename(image));
        } else form.append("file", card(), path.basename(image));
        form.append("description", alt);
        let media = await call("POST", "/api/v2/media", form);
        for (let i = 0; !media.url && i < (kind === "video" ? 60 : 15); i += 1) {
          await sleep(kind === "video" ? 3000 : 2000);
          media = await call("GET", "/api/v1/media/" + media.id);
        }
        if (kind === "video" && !media.url) throw new Error("Mastodon is still processing video " + media.id);
        return media.id;
      })());
      let refused = null;
      for (const plan of compose.mastodon(args)) {
        let body;
        try {
          body = Object.assign({ visibility: "public", language: lang }, plan.status, plan.media ? { media_ids: [await upload(plan.media)] } : {});
        } catch (error) {
          refused = error;
          console.log("Mastodon could not add " + plan.uses.join(", ") + " - " + error.message);
          continue;
        }
        try {
          const status = await call("POST", "/api/v1/statuses", body, { "Idempotency-Key": key });
          return { id: status.id, url: status.url, uses: plan.uses };
        } catch (error) {
          if (error.status !== 422) throw error;
          refused = error;
          console.log("Mastodon refused " + plan.uses.join(", ") + " - " + error.message);
        }
      }
      throw refused;
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
  // A token without threads_location_tagging finds no place, so the post goes without one.
  const places = new Map();
  const place = (name) => {
    if (!places.has(name)) {
      places.set(name, call("GET", "location_search", { q: name.split(",")[0].trim(), fields: "id,name,address,city,country" })
        .then(({ data }) => threadsCompose.pickLocation(name, data))
        .catch((error) => { console.log("Threads location search for " + name + " - " + error.message); return ""; }));
    }
    return places.get(name);
  };
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
    /* Tries each plan of scripts/threads-compose.js, richest first, until Threads accepts a container. A refused
       publish is not retried as a plainer post: it may have gone out, and the next run finds it in recent(). */
    async post(args) {
      await served(args.url);
      const clip = args.clip && args.clip.lang === args.lang ? await released(args.clip) : null;
      const container = async (params) => {
        const box = await call("POST", "me/threads", params);
        const video = params.media_type === "VIDEO" || params.media_type === "CAROUSEL";
        await ready(async (id) => (await call("GET", id, { fields: "status" })).status, box.id, video ? 18 : 20, video ? 10000 : 3000);
        return box.id;
      };
      const location = args.place ? await place(args.place) : "";
      let creation = "";
      let uses = [];
      let reply = null;
      let refused = null;
      for (const plan of threadsCompose.plans(Object.assign({}, args, { clip, location }))) {
        try {
          const params = Object.assign({}, plan.params);
          if (plan.items) {
            const children = [];
            for (const item of plan.items) children.push(await container(item));
            params.children = children.join(",");
          }
          creation = await container(params);
          uses = plan.uses;
          reply = plan.reply || null;
          break;
        } catch (error) {
          refused = error;
          console.log("Threads refused " + plan.uses.join(", ") + " - " + error.message);
        }
      }
      if (!creation) throw refused;
      const { id } = await call("POST", "me/threads_publish", { creation_id: creation });
      const { permalink } = await call("GET", id, { fields: "permalink" }).catch(() => ({}));
      // The post is out: a reply that fails costs only the reply.
      for (const answer of reply || []) {
        let box = "";
        try {
          box = await container(Object.assign({ reply_to_id: id }, answer.params));
        } catch (error) {
          console.log("Threads refused the reply " + answer.uses.join(", ") + " - " + error.message);
          continue;
        }
        try {
          await call("POST", "me/threads_publish", { creation_id: box });
          uses = uses.concat(answer.uses.map((u) => "reply " + u));
        } catch (error) {
          console.log("Threads reply not published - " + error.message);
        }
        break;
      }
      return { id, url: permalink || "", uses };
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
    /* The feed tries each plan of scripts/open-social-compose.js, richest first, until Instagram accepts a container;
       as for Threads, a refused publish is not retried as a plainer post. */
    async post(args) {
      const { url } = args;
      await served(url);
      const container = async (params) => {
        const box = await call("POST", ig + "/media", params);
        const video = ["REELS", "VIDEO", "CAROUSEL"].includes(params.media_type);
        await ready(async (id) => (await call("GET", id, { fields: "status_code" })).status_code, box.id, video ? 30 : 20, video ? 10000 : 3000);
        return box.id;
      };
      let creation = "";
      let uses = [];
      if (story) creation = await container({ image_url: url, media_type: "STORIES" });
      else {
        const clip = args.clip && args.clip.lang === args.lang ? await released(args.clip) : null;
        let refused = null;
        for (const plan of compose.instagram(Object.assign({}, args, { clip }))) {
          try {
            const params = Object.assign({}, plan.params);
            if (plan.items) {
              const children = [];
              for (const item of plan.items) children.push(await container(item));
              params.children = children.join(",");
            }
            creation = await container(params);
            uses = plan.uses;
            break;
          } catch (error) {
            refused = error;
            console.log("Instagram refused " + plan.uses.join(", ") + " - " + error.message);
          }
        }
        if (!creation) throw refused;
      }
      const { id } = await call("POST", ig + "/media_publish", { creation_id: creation });
      const { permalink } = await call("GET", id, { fields: "permalink" }).catch(() => ({}));
      return Object.assign({ id, url: permalink || "" }, story ? {} : { uses });
    }
  };
}

// A bot uploads files up to 50 MB; Telegram fetches one by URL only up to 20 MB.
const TELEGRAM_UPLOAD_MAX = 50 * 1024 * 1024;

/* Telegram cannot fetch a release clip by URL: the download redirects to a signed release-assets address that serves
   it as an application/octet-stream attachment (#3004). The plan's fields as a form, with the clip's bytes as the
   video; null when the release has no such clip or it is over the upload limit. */
async function telegramUpload(chat, body) {
  const res = await fetch(body.video).catch(() => null);
  if (!res || !res.ok) return null;
  if (Number(res.headers.get("content-length")) > TELEGRAM_UPLOAD_MAX) {
    if (res.body) await res.body.cancel().catch(() => {});
    return null;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > TELEGRAM_UPLOAD_MAX) return null;
  const form = new FormData();
  form.append("chat_id", chat);
  for (const [key, value] of Object.entries(body)) {
    if (key === "video") form.append(key, new Blob([bytes], { type: "video/mp4" }), path.basename(new URL(value).pathname));
    else form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return form;
}

// The @qalab_live channel (TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL), where scripts/telegram-live.js posts the Live Reports.
// A bot cannot read a channel's history, so the ledger alone keeps a post from going out twice.
function telegram(env = process.env) {
  const chat = env.TELEGRAM_CHANNEL || "";
  let user = "";
  async function call(method, body) {
    const form = body instanceof FormData;
    const res = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method,
      form ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw Object.assign(new Error("Telegram " + method + " " + res.status + ": " + String(json.description || "no answer").slice(0, 200)), { status: json.error_code || res.status });
    }
    return json.result;
  }
  // A clip Telegram refuses to fetch by URL is uploaded instead.
  async function send(plan) {
    try {
      return await call(plan.method, Object.assign({ chat_id: chat }, plan.body));
    } catch (error) {
      if (error.status !== 400 || !plan.body.video) throw error;
      const form = await telegramUpload(chat, plan.body);
      if (!form) throw Object.assign(new Error(error.message + "; no clip under 50 MB to upload"), { status: 400 });
      console.log("Telegram could not fetch the clip, uploading it - " + error.message);
      return call(plan.method, form);
    }
  }
  return {
    ready: Boolean(env.TELEGRAM_BOT_TOKEN && chat),
    async login() {
      const me = await call("getChat", { chat_id: chat });
      user = me.username || "";
      return "Telegram @" + (user || String(chat).replace(/^@/, ""));
    },
    async recent() { return []; },
    /* Tries each plan of scripts/open-social-compose.js, richest first. A request Telegram refuses as bad (400: a
       parameter, or a clip it can neither fetch nor take as an upload; 413: an upload too large) moves to the next
       plan; any other failure is not retried as a plainer post. */
    async post(args) {
      await served(args.url);
      let refused = null;
      for (const plan of compose.telegram(args)) {
        try {
          const m = await send(plan);
          return { id: String(m.message_id), url: user ? "https://t.me/" + user + "/" + m.message_id : "", uses: plan.uses };
        } catch (error) {
          if (error.status !== 400 && error.status !== 413) throw error;
          refused = error;
          console.log("Telegram refused " + plan.uses.join(", ") + " - " + error.message);
        }
      }
      throw refused;
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
      const lang = faceRoute.captionLang(post.cap, key, f);
      const uses = PLANS[network] ? PLANS[network](Object.assign({ text, url: post.url, alt: "", lang }, extras(network, post, f, book)))[0].uses.join("+") : "";
      console.log("dry-run", "@" + FACES[f].handle, lang, network, post.batch + "/" + post.slug, new Date(post.at).toISOString(), hub.why ? "HELD: " + hub.why : "hub ok", [...text].length + " chars", uses, text.split("\n").pop());
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
      const more = extras(network, post, f, book);
      const r = await client.post(Object.assign({ text: caption(post, network, f), image: post.image, url: post.url, alt: post.cap.alt || post.cap.title || "", lang: faceRoute.captionLang(post.cap, key, f), key: name }, more));
      counts.posted += 1;
      console.log("posted", network, name, r.url, r.uses ? "(" + r.uses.join(", ") + ")" : "");
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
