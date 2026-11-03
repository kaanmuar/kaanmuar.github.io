"use strict";
/*
 * The engagement poster (#1990): carries the scout's plan out on Bluesky, Mastodon and YouTube through their APIs,
 * as the accounts connected in Jarvis > Engagement > Accounts.
 *
 *   engagement_private/bluesky       { handle, did, password }         an app password saved from Jarvis
 *   engagement_private/mastodon      { base, token, acct, bot }        Connect Mastodon (OAuth; marks the account a bot)
 *   engagement_private/mastodon_app  { base, clientId, clientSecret }  the OAuth app, registered on first connect
 *   engagement_private/youtube       { refresh, channelId, channel }   Connect YouTube (Google OAuth, the brand channel)
 *   engagement_private/state         { state, network, at }            the OAuth round trip in flight
 *
 * After each scout run, planned likes, reposts and follows from the last ACT_WINDOW go out, at most PER_RUN per
 * network a GAP apart; in a dry run (settings.live off) they turn "dry" instead. A plan older than the window, or on
 * a network that is not connected by then, turns "missed". Approved replies go out at once on approval and are
 * retried on the next runs, MAX_TRIES in all. A pause stops all of it.
 *
 * Before a reply goes out, the network is asked whether our account already answered that post (#2421); if it did,
 * the reply turns "replied" with a link to ours and is not sent. A report reply (#2465) carries its mini report card
 * (report-card.js, #2466); when the card cannot be drawn or uploaded, the reply goes as text with its link and
 * actions.reply.card says "text", with cardError saying why. pendingChains reads the comments under the replies
 * we posted in the last CHAIN_DAYS, each reply at most once per CHAIN_EVERY, for jarvis-engagement to like and answer.
 */
const crypto = require("crypto");
const E = require("./engagement");
const Sources = require("./engagement-sources");
const Card = require("./report-card");

const HOUR = 3600000;
const CHAIN_DAYS = 7;
const CHAIN_EVERY = HOUR;
const CHAIN_PER_RUN = 10;
const ACT_WINDOW = 6 * HOUR;
const PER_RUN = 20;
const GAP = 1500;
const MAX_TRIES = 3;
const MEDIA_POLLS = 5;
const MEDIA_POLL_MS = 1000;
const STATE_MS = 10 * 60 * 1000;
const TIMEOUT = 20000;
const CARRIED = ["like", "repost", "follow"];
const API = Object.keys(E.NETWORKS).filter((k) => E.NETWORKS[k].api);

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const YT = "https://www.googleapis.com/youtube/v3/";
const YT_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const MASTODON_SCOPES = "read write:favourites write:statuses write:follows write:accounts";
const APP_PASSWORD = /^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/i;

/** fatal: the account or the network refused us (sign-in, permission, rate limit), so the rest of the run waits. */
class ActError extends Error {
  constructor(message, fatal) { super(message); this.fatal = !!fatal; }
}

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

async function call(fetchImpl, url, opts) {
  const o = opts || {};
  const headers = Object.assign({}, o.headers || {});
  let body;
  if (o.json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(o.json); }
  else if (o.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(o.form).toString(); }
  else if (o.raw) { headers["Content-Type"] = o.type; body = o.raw; }
  else if (o.multipart) body = o.multipart;
  const res = await fetchImpl(url, { method: o.method || (body ? "POST" : "GET"), headers, body, signal: AbortSignal.timeout(TIMEOUT) });
  const text = res.text ? await res.text().catch(() => "") : JSON.stringify(await res.json().catch(() => ({})));
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (error) { data = {}; }
  if (!res.ok) {
    const err = data.error;
    const why = (err && typeof err === "object" ? err.message || (err.errors && err.errors[0] && err.errors[0].reason) : err) || data.message || data.error_description || "";
    const where = url.replace(/[?#].*$/, "").replace(/^https:\/\//, "");
    throw new ActError(where + " answered " + res.status + (why ? ": " + clip(why, 160) : ""), res.status === 401 || res.status === 403 || res.status === 429);
  }
  return data;
}

/** Bluesky shows a link as plain text unless a facet marks its bytes. */
function linkFacets(text) {
  const out = [];
  for (const m of String(text).matchAll(/https?:\/\/[^\s]+/g)) {
    const uri = m[0].replace(/[.,;:!?)\]"'»”]+$/, "");
    const start = Buffer.byteLength(text.slice(0, m.index));
    out.push({ index: { byteStart: start, byteEnd: start + Buffer.byteLength(uri) }, features: [{ $type: "app.bsky.richtext.facet#link", uri }] });
  }
  return out.length ? out : undefined;
}

// --- The three clients: like, repost, follow and reply on one post document ------------------------------------
// reply(d, text, lang, card) attaches card ({ png, type, alt, width, height }, report-card.js) when the network takes
// it; an upload that fails leaves the reply as text and says why in cardError.

async function blueskyClient(cred, f, now) {
  const service = String(cred.service || "https://bsky.social").replace(/\/+$/, "");
  const s = await call(f, service + "/xrpc/com.atproto.server.createSession", { json: { identifier: cred.handle, password: cred.password } });
  const auth = { Authorization: "Bearer " + s.accessJwt };
  const at = new Date(now).toISOString();
  const create = (collection, record) => call(f, service + "/xrpc/com.atproto.repo.createRecord", { headers: auth, json: { repo: s.did, collection, record: Object.assign({ $type: collection, createdAt: at }, record) } });
  const post = async (d) => {
    const got = await call(f, service + "/xrpc/app.bsky.feed.getPosts?uris=" + encodeURIComponent(d.id), { headers: auth });
    const p = (got.posts || [])[0];
    if (!p) throw new ActError("The post is gone.");
    return p;
  };
  const subject = async (d) => (d.cid ? { uri: d.id, cid: d.cid } : post(d).then((p) => ({ uri: p.uri, cid: p.cid })));
  const link = (uri) => "https://bsky.app/profile/" + s.handle + "/post/" + String(uri || "").split("/").pop();
  const replies = async (uri, depth) => ((await call(f, service + "/xrpc/app.bsky.feed.getPostThread?depth=" + depth + "&parentHeight=0&uri=" + encodeURIComponent(uri), { headers: auth })).thread || {}).replies || [];
  const below = (t) => (t.replies || []).filter((x) => x && x.post);
  const ours = (x) => ((x.post || {}).author || {}).did === s.did;
  return {
    account: s.handle,
    replied: async (d) => {
      const mine = (await replies(d.id, 1)).filter((x) => x && x.post).find(ours);
      return mine ? { uri: mine.post.uri, url: link(mine.post.uri) } : null;
    },
    under: async (r) => (await replies(r.uri, 2)).filter((x) => x && x.post && !ours(x))
      .map((x) => Object.assign(Sources.blueskyPost(x.post), { liked: !!(x.post.viewer || {}).like, answered: below(x).some(ours) })),
    inbox: async (since) => {
      const got = await call(f, service + "/xrpc/app.bsky.notification.listNotifications?limit=50&reasons=reply&reasons=mention&reasons=quote", { headers: auth });
      const notes = (got.notifications || []).filter((n) => ["reply", "mention", "quote"].includes(n.reason) && (n.author || {}).did !== s.did && String(n.indexedAt || "") >= since);
      const seen = {};
      for (let i = 0; i < notes.length; i += 25) {
        const got2 = await call(f, service + "/xrpc/app.bsky.feed.getPosts?" + notes.slice(i, i + 25).map((n) => "uris=" + encodeURIComponent(n.uri)).join("&"), { headers: auth });
        (got2.posts || []).forEach((p) => { seen[p.uri] = p; });
      }
      return notes.filter((n) => seen[n.uri]).map((n) => Object.assign(Sources.blueskyPost(seen[n.uri]), {
        liked: !!(seen[n.uri].viewer || {}).like, on: (((n.record || {}).reply || {}).parent || {}).uri || (((n.record || {}).embed || {}).record || {}).uri || ""
      }));
    },
    detail: async (c) => {
      const had = (await replies(c.id, 1)).filter((x) => x && x.post).some(ours);
      if (!c.on) return { answered: had, ours: "" };
      const p = ((await call(f, service + "/xrpc/app.bsky.feed.getPosts?uris=" + encodeURIComponent(c.on), { headers: auth })).posts || [])[0];
      return { answered: had, ours: p && ((p.author || {}).did === s.did) ? String((p.record || {}).text || "") : "", ourId: c.on };
    },
    like: async (d) => ({ uri: (await create("app.bsky.feed.like", { subject: await subject(d) })).uri }),
    repost: async (d) => ({ uri: (await create("app.bsky.feed.repost", { subject: await subject(d) })).uri }),
    follow: async (d) => {
      if (!(d.author || {}).id) throw new ActError("The post has no author DID.");
      return { uri: (await create("app.bsky.graph.follow", { subject: d.author.id })).uri };
    },
    reply: async (d, text, lang, card) => {
      const p = await post(d);
      const parent = { uri: p.uri, cid: p.cid };
      const root = ((p.record || {}).reply || {}).root || parent;
      let embed;
      let cardError = "";
      if (card) {
        try {
          const up = await call(f, service + "/xrpc/com.atproto.repo.uploadBlob", { headers: auth, raw: card.png, type: card.type });
          if (!up.blob) throw new Error("Bluesky kept no image.");
          embed = { $type: "app.bsky.embed.images", images: [{ alt: card.alt, image: up.blob, aspectRatio: { width: card.width, height: card.height } }] };
        } catch (error) { cardError = error.message; }
      }
      const out = await create("app.bsky.feed.post", { text, facets: linkFacets(text), langs: lang ? [lang] : undefined, reply: { root, parent }, embed });
      return { id: out.uri, uri: out.uri, url: link(out.uri), card: embed ? "attached" : "", cardError };
    }
  };
}

async function mastodonClient(cred, f) {
  const base = String(cred.base).replace(/\/+$/, "");
  const auth = { Authorization: "Bearer " + cred.token };
  // The scout reads posts from every server; ours finds its own copy (and the author's account id) by the post's URI.
  const found = new Map();
  const status = async (d) => {
    const q = d.id || d.url;
    if (found.has(q)) return found.get(q);
    const got = await call(f, base + "/api/v2/search?type=statuses&resolve=true&limit=1&q=" + encodeURIComponent(q), { headers: auth });
    const st = (got.statuses || [])[0];
    if (!st) throw new ActError(base.replace(/^https:\/\//, "") + " could not find the post.");
    found.set(q, st);
    return st;
  };
  const on = (path) => async (d) => { const st = await status(d); await call(f, base + "/api/v1/statuses/" + st.id + path, { method: "POST", headers: auth }); return { url: st.url || "" }; };
  // Statuses as our server sees them: acct is the bare username for our own account, and favourited is ours.
  const context = async (id) => (await call(f, base + "/api/v1/statuses/" + id + "/context", { headers: auth })).descendants || [];
  const ours = (x) => (x.account || {}).acct === cred.acct;
  return {
    account: cred.acct || "",
    replied: async (d) => {
      const st = await status(d);
      const mine = (await context(st.id)).find((x) => x.in_reply_to_id === st.id && ours(x));
      return mine ? { uri: mine.uri || "", url: mine.url || "" } : null;
    },
    under: async (r) => {
      const id = r.id || (await status({ id: r.uri, url: r.url })).id;
      const all = await context(id);
      return all.filter((x) => x.in_reply_to_id === id && !ours(x) && !(x.account || {}).bot)
        .map((x) => Object.assign(Sources.mastodonPost(x), { liked: x.favourited === true, answered: all.some((y) => y.in_reply_to_id === x.id && ours(y)) }));
    },
    inbox: async (since) => {
      const got = await call(f, base + "/api/v1/notifications?types%5B%5D=mention&limit=40", { headers: auth });
      return (Array.isArray(got) ? got : []).filter((n) => n.status && !(n.account || {}).bot && !ours(n.status) && String(n.created_at || "") >= since)
        .map((n) => Object.assign(Sources.mastodonPost(n.status), { liked: n.status.favourited === true, on: String(n.status.in_reply_to_id || "") }));
    },
    detail: async (c) => {
      const had = (await context(c.localId)).some((y) => y.in_reply_to_id === c.localId && ours(y));
      if (!c.on) return { answered: had, ours: "" };
      const p = await call(f, base + "/api/v1/statuses/" + encodeURIComponent(c.on), { headers: auth }).catch(() => null);
      return { answered: had, ours: p && ours(p) ? Sources.plain(p.content) : "", ourId: p ? p.uri || "" : "" };
    },
    like: on("/favourite"),
    repost: on("/reblog"),
    follow: async (d) => { const st = await status(d); await call(f, base + "/api/v1/accounts/" + st.account.id + "/follow", { method: "POST", headers: auth }); return {}; },
    reply: async (d, text, lang, card) => {
      const st = await status(d);
      const mention = "@" + st.account.acct;
      const body = text.toLowerCase().includes(mention.toLowerCase()) ? text : mention + " " + text;
      let media;
      let cardError = "";
      if (card) {
        try {
          const form = new FormData();
          form.append("file", new Blob([card.png], { type: card.type }), "report-card.png");
          form.append("description", card.alt);
          let m = await call(f, base + "/api/v2/media", { headers: auth, multipart: form });
          // A status naming media still being processed is refused, so wait for its url.
          for (let i = 0; m.id && !m.url && i < MEDIA_POLLS; i += 1) {
            if (i) await new Promise((r) => setTimeout(r, MEDIA_POLL_MS));
            m = await call(f, base + "/api/v1/media/" + m.id, { headers: auth });
          }
          if (!m.id || !m.url) throw new Error(base.replace(/^https:\/\//, "") + " did not finish the image.");
          media = [String(m.id)];
        } catch (error) { cardError = error.message; }
      }
      const out = await call(f, base + "/api/v1/statuses", { headers: Object.assign({ "Idempotency-Key": "engage-" + d.key }, auth), json: { status: body, in_reply_to_id: st.id, language: lang || undefined, visibility: "public", media_ids: media } });
      return { id: String(out.id || ""), uri: out.uri || "", url: out.url || "", card: media ? "attached" : "", cardError };
    }
  };
}

async function youtubeClient(cred, f, now, keys) {
  if (!keys.clientId || !keys.secret) throw new ActError("YouTube needs GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET.", true);
  const tok = await call(f, GOOGLE_TOKEN, { form: { client_id: keys.clientId, client_secret: keys.secret, refresh_token: cred.refresh, grant_type: "refresh_token" } })
    .catch((error) => { throw new ActError("YouTube sign-in: " + error.message + ". Connect YouTube again in Jarvis.", true); });
  const auth = { Authorization: "Bearer " + tok.access_token };
  const watch = (video, comment) => "https://www.youtube.com/watch?v=" + encodeURIComponent(video) + (comment ? "&lc=" + encodeURIComponent(comment) : "");
  const ours = (sn) => ((sn || {}).authorChannelId || {}).value === cred.channelId;
  // Answers inside a comment thread are flat on YouTube, oldest first: who answered whom is told by time alone.
  const answers = async (thread) => (await call(f, YT + "comments?part=snippet&maxResults=100&textFormat=plainText&parentId=" + encodeURIComponent(thread), { headers: auth })).items || [];
  const after = (c, at) => String((c.snippet || {}).publishedAt || "") > String(at || "");
  return {
    account: cred.channel || "",
    replied: async (d) => {
      if (d.parentId) {
        const mine = (await answers(d.parentId)).find((c) => ours(c.snippet) && after(c, d.createdAt));
        return mine ? { url: watch(d.videoId, mine.id) } : null;
      }
      const got = await call(f, YT + "commentThreads?part=snippet&maxResults=100&order=time&textFormat=plainText&videoId=" + encodeURIComponent(d.id), { headers: auth });
      const mine = (got.items || []).find((t) => ours(((t.snippet || {}).topLevelComment || {}).snippet));
      return mine ? { url: watch(d.id, mine.id) } : null;
    },
    under: async (r, doc) => {
      const thread = doc.parentId || r.id || (String(r.url || "").match(/[?&]lc=([^&#]+)/) || [])[1];
      if (!thread) return [];
      const video = doc.videoId || doc.id;
      const all = await answers(decodeURIComponent(thread));
      return all.filter((c) => !ours(c.snippet) && after(c, r.postedAt)).map((c) => {
        const sn = c.snippet || {};
        return {
          network: "youtube", id: c.id, url: watch(video, c.id), parentId: decodeURIComponent(thread), videoId: video,
          author: { handle: sn.authorDisplayName || "", name: sn.authorDisplayName || "", id: (sn.authorChannelId || {}).value || "", followers: 0 },
          text: sn.textOriginal || sn.textDisplay || "", lang: "", createdAt: sn.publishedAt || "", isReply: true,
          metrics: { likes: Number(sn.likeCount) || 0, replies: 0, reposts: 0, views: 0 }, tags: [],
          liked: false, answered: all.some((y) => ours(y.snippet) && after(y, sn.publishedAt))
        };
      });
    },
    // Comments on our own videos: each thread's top comment, answered inside its thread.
    inbox: async (since) => {
      const got = await call(f, YT + "commentThreads?part=snippet&order=time&maxResults=50&textFormat=plainText&allThreadsRelatedToChannelId=" + encodeURIComponent(cred.channelId), { headers: auth });
      return (got.items || []).map((t) => {
        const sn = ((t.snippet || {}).topLevelComment || {}).snippet || {};
        const video = (t.snippet || {}).videoId || sn.videoId || "";
        return {
          network: "youtube", id: t.id, url: watch(video, t.id), parentId: t.id, videoId: video, on: video,
          author: { handle: sn.authorDisplayName || "", name: sn.authorDisplayName || "", id: (sn.authorChannelId || {}).value || "", followers: 0 },
          text: sn.textOriginal || sn.textDisplay || "", lang: "", createdAt: sn.publishedAt || "", isReply: true,
          metrics: { likes: Number(sn.likeCount) || 0, replies: Number((t.snippet || {}).totalReplyCount) || 0, reposts: 0, views: 0 }, tags: [], liked: false
        };
      }).filter((c) => c.videoId && !ours({ authorChannelId: { value: c.author.id } }) && c.createdAt >= since);
    },
    detail: async (c) => {
      const had = (await answers(c.parentId)).some((y) => ours(y.snippet));
      const v = (((await call(f, YT + "videos?part=snippet&id=" + encodeURIComponent(c.videoId), { headers: auth })).items) || [])[0];
      return { answered: had, ours: v ? (v.snippet || {}).title || "" : "", ourId: c.videoId };
    },
    like: async (d) => { await call(f, YT + "videos/rate?rating=like&id=" + encodeURIComponent(d.id), { method: "POST", headers: auth }); return {}; },
    follow: async (d) => {
      if (!(d.author || {}).id) throw new ActError("The video has no channel id.");
      try { await call(f, YT + "subscriptions?part=snippet", { headers: auth, json: { snippet: { resourceId: { kind: "youtube#channel", channelId: d.author.id } } } }); }
      catch (error) { if (!/subscriptionDuplicate|already/i.test(error.message)) throw error; }
      return {};
    },
    reply: async (d, text) => {
      if (d.parentId) {
        const out = await call(f, YT + "comments?part=snippet", { headers: auth, json: { snippet: { parentId: d.parentId, textOriginal: text } } });
        return { id: out.id || "", url: watch(d.videoId, out.id || "") };
      }
      const out = await call(f, YT + "commentThreads?part=snippet", { headers: auth, json: { snippet: { videoId: d.id, topLevelComment: { snippet: { textOriginal: text } } } } });
      return { id: out.id || "", url: watch(d.id, out.id || "") };
    }
  };
}

const CLIENTS = { bluesky: blueskyClient, mastodon: mastodonClient, youtube: youtubeClient };

// --- Connections ----------------------------------------------------------------------------------------------

const privateRef = (db, id) => db.collection("engagement_private").doc(id);

async function readCreds(db) {
  const snaps = await db.getAll(...API.map((k) => privateRef(db, k)));
  return Object.fromEntries(API.map((k, i) => [k, snaps[i].exists ? snaps[i].data() : null]).filter(([, v]) => v && (v.password || v.token || v.refresh)));
}

const HELP = {
  bluesky: "Bluesky: paste an app password in Engagement > Accounts (bsky.app > Settings > Privacy and security > App passwords).",
  mastodon: "Mastodon: Connect Mastodon in Engagement > Accounts while signed in to the brand account.",
  youtube: "YouTube: Connect YouTube in Engagement > Accounts and pick the QA-lab URL Review channel."
};

/** What Jarvis shows per API network: connected, as whom, the last error. Never a secret. */
async function connections(db) {
  const snaps = await db.getAll(...API.map((k) => privateRef(db, k)));
  return API.map((k, i) => {
    const d = snaps[i].exists ? snaps[i].data() : {};
    const connected = !!(d.password || d.token || d.refresh);
    return {
      network: k, name: E.NETWORKS[k].name, connected, account: clip(d.handle || d.acct || d.channel, 120), bot: d.bot === true,
      connectedAt: clip(d.connectedAt, 30), error: clip(d.error, 200), errorAt: clip(d.errorAt, 30), help: connected ? "" : HELP[k]
    };
  });
}

/** Bluesky: an app password, checked by signing in before it is kept. */
async function saveBluesky(deps, body) {
  const handle = clip(body.handle, 120).replace(/^@/, "").toLowerCase();
  const password = String(body.password || "").trim();
  if (!handle) throw new Error("Write the Bluesky handle, like qalaburlreview.bsky.social.");
  if (!APP_PASSWORD.test(password)) throw new Error("Use an app password (xxxx-xxxx-xxxx-xxxx from bsky.app > Settings > Privacy and security > App passwords), never the account password.");
  const s = await call(deps.fetch, "https://bsky.social/xrpc/com.atproto.server.createSession", { json: { identifier: handle, password } })
    .catch((error) => { throw new Error("Bluesky refused the sign-in: " + error.message); });
  await privateRef(deps.db, "bluesky").set({ handle: s.handle || handle, did: s.did || "", password, connectedAt: new Date(deps.now).toISOString(), error: "" });
  return { network: "bluesky", account: s.handle || handle, message: "Bluesky is connected as @" + (s.handle || handle) + "." };
}

async function mastodonApp(deps, base, redirect) {
  const ref = privateRef(deps.db, "mastodon_app");
  const snap = await ref.get();
  const app = snap.exists ? snap.data() : null;
  if (app && app.base === base && app.redirect === redirect && app.scopes === MASTODON_SCOPES) return app;
  const got = await call(deps.fetch, base + "/api/v1/apps", { json: { client_name: "QA-lab engagement", redirect_uris: redirect, scopes: MASTODON_SCOPES, website: "https://carlosandmunoz.com" } });
  const next = { base, redirect, scopes: MASTODON_SCOPES, clientId: got.client_id, clientSecret: got.client_secret, at: new Date(deps.now).toISOString() };
  await ref.set(next);
  return next;
}

/** The sign-in page for Connect YouTube or Connect Mastodon; it comes back to redirect (the booking function's /callback). */
async function connectUrl(deps, network, redirect, keys) {
  const state = crypto.randomBytes(16).toString("hex");
  await privateRef(deps.db, "state").set({ state, network, at: deps.now });
  if (network === "youtube") {
    if (!keys.clientId) throw new Error("Set GOOGLE_CALENDAR_CLIENT_ID in functions/.env first.");
    const url = new URL(GOOGLE_AUTH);
    Object.entries({ client_id: keys.clientId, redirect_uri: redirect, response_type: "code", scope: YT_SCOPE, access_type: "offline", prompt: "consent select_account", state })
      .forEach(([k, v]) => url.searchParams.set(k, v));
    return { url: url.toString() };
  }
  if (network === "mastodon") {
    const base = String((deps.env || {}).MASTODON_URL || "https://mastodon.social").replace(/\/+$/, "");
    const app = await mastodonApp(deps, base, redirect);
    const url = new URL(base + "/oauth/authorize");
    Object.entries({ client_id: app.clientId, redirect_uri: redirect, response_type: "code", scope: MASTODON_SCOPES, state, force_login: "false" }).forEach(([k, v]) => url.searchParams.set(k, v));
    return { url: url.toString() };
  }
  throw new Error("Connect works for YouTube and Mastodon; Bluesky takes an app password.");
}

/** The OAuth return. null when the state is not ours (the calendar's connect uses the same callback). */
async function connectCallback(deps, query, redirect, keys) {
  const ref = privateRef(deps.db, "state");
  const snap = await ref.get();
  const s = snap.exists ? snap.data() : {};
  const state = String((query || {}).state || "");
  if (!state || state !== s.state) return null;
  await ref.delete();
  if (deps.now - Number(s.at) > STATE_MS) return { ok: false, message: "This link expired. Connect " + E.NETWORKS[s.network].name + " again from Jarvis." };
  if (query.error) return { ok: false, message: E.NETWORKS[s.network].name + " did not connect: " + clip(query.error, 80) + "." };
  const code = String(query.code || "");
  const at = new Date(deps.now).toISOString();
  if (s.network === "youtube") {
    const tok = await call(deps.fetch, GOOGLE_TOKEN, { form: { code, client_id: keys.clientId, client_secret: keys.secret, redirect_uri: redirect, grant_type: "authorization_code" } });
    if (!tok.refresh_token) return { ok: false, message: "Google sent no refresh token. Remove the app's access at myaccount.google.com/permissions and connect again." };
    const ch = (((await call(deps.fetch, YT + "channels?part=snippet&mine=true", { headers: { Authorization: "Bearer " + tok.access_token } })).items) || [])[0];
    if (!ch) return { ok: false, message: "That Google account has no YouTube channel. Connect again and pick the QA-lab URL Review channel." };
    await privateRef(deps.db, "youtube").set({ refresh: tok.refresh_token, channelId: ch.id, channel: (ch.snippet || {}).title || "", scope: String(tok.scope || ""), connectedAt: at, error: "" });
    return { ok: true, network: "youtube", message: "YouTube is connected as " + ((ch.snippet || {}).title || ch.id) + ". Likes, subscribes and approved comments go out from that channel." };
  }
  if (s.network === "mastodon") {
    const app = (await privateRef(deps.db, "mastodon_app").get()).data() || {};
    const tok = await call(deps.fetch, app.base + "/oauth/token", { form: { grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirect, scope: MASTODON_SCOPES } });
    const auth = { Authorization: "Bearer " + tok.access_token };
    const me = await call(deps.fetch, app.base + "/api/v1/accounts/verify_credentials", { headers: auth });
    // An account that likes and follows by itself says so (Carlos, #1988): Mastodon shows it as a bot.
    const bot = me.bot === true || await call(deps.fetch, app.base + "/api/v1/accounts/update_credentials", { method: "PATCH", headers: auth, form: { bot: "true" } }).then((x) => x.bot === true, () => false);
    await privateRef(deps.db, "mastodon").set({ base: app.base, token: tok.access_token, acct: me.acct || me.username || "", bot, connectedAt: at, error: "" });
    return { ok: true, network: "mastodon", message: "Mastodon is connected as @" + (me.acct || me.username) + (bot ? ", marked as an automated account." : ". Mark it as a bot in Preferences > Profile; the flag did not save.") };
  }
  return { ok: false, message: "Unknown network." };
}

async function disconnect(db, network) {
  if (!API.includes(network)) throw new Error("Only Bluesky, Mastodon and YouTube connect here.");
  await privateRef(db, network).delete();
  return { network, message: E.NETWORKS[network].name + " is disconnected; nothing goes out there until you connect it again." };
}

// --- Carrying the plan out --------------------------------------------------------------------------------------

const plannedAt = (doc) => Date.parse(doc.decidedAgainAt || doc.seenAt || 0) || 0;

async function client(deps, network, cred) {
  try { return { c: await CLIENTS[network](cred, deps.fetch, deps.now, deps.keys || {}) }; }
  catch (error) { return { error: error.message, fatal: true }; }
}

async function count(deps, network, key) {
  await deps.db.collection("engagement_daily").doc(E.bogotaDay(deps.now)).set({ n: { [network]: { [key]: deps.inc(1) } } }, { merge: true });
}

async function noteError(db, network, message, now) {
  await privateRef(db, network).set({ error: clip(message, 200), errorAt: new Date(now).toISOString() }, { merge: true }).catch(() => null);
}

/** The mini report card for a report reply on a network that takes one: { card } or { error }; {} for other replies. */
async function drawCard(deps, doc) {
  if (!Card.wants(doc)) return {};
  try { return { card: await (deps.card || Card.render)(doc) }; }
  catch (error) { return { error: "The card was not drawn: " + error.message }; }
}

/** What a posted report reply records of its card: attached, or text with why. */
function cardFields(doc, attached, error) {
  if (!Card.wants(doc)) return {};
  return { "actions.reply.card": attached ? "attached" : "text", "actions.reply.cardError": attached ? "" : clip(error || "The card did not go with it.", 200) };
}

/** One approved reply out, unless our account already answered there. Returns { status, url, error }. */
async function sendReply(deps, c, task) {
  const r = task.doc.actions.reply;
  const tries = (r.tries || 0) + 1;
  const at = new Date(deps.now).toISOString();
  const d = Object.assign({ key: task.key }, task.doc);
  try {
    const had = await c.replied(d);
    if (had) {
      await task.ref.update({ "actions.reply.status": "replied", "actions.reply.at": at, "actions.reply.url": had.url || "", "actions.reply.uri": had.uri || "", "actions.reply.error": "We had already replied there, so this one was not sent.", updatedAt: at });
      await count(deps, task.doc.network, "already");
      return { status: "replied", url: had.url || "" };
    }
    const card = await drawCard(deps, task.doc);
    const out = await c.reply(d, r.draft, r.lang || task.doc.lang, card.card);
    await task.ref.update(Object.assign({ "actions.reply.status": "posted", "actions.reply.postedAt": at, "actions.reply.url": out.url || "", "actions.reply.uri": out.uri || "", "actions.reply.id": out.id || "", "actions.reply.tries": tries, "actions.reply.error": "", updatedAt: at },
      cardFields(task.doc, out.card === "attached", card.error || out.cardError)));
    await count(deps, task.doc.network, "posted");
    if (task.doc.campaign === "report-reply") await deps.db.collection("engagement_daily").doc(E.bogotaDay(deps.now)).set({ report: { posted: deps.inc(1) } }, { merge: true });
    return { status: "posted", url: out.url || "" };
  } catch (error) {
    const last = !error.fatal && tries >= MAX_TRIES;
    await task.ref.update(Object.assign({ "actions.reply.error": clip(error.message, 200), "actions.reply.tries": error.fatal ? tries - 1 : tries, updatedAt: at }, last ? { "actions.reply.status": "failed" } : {}));
    if (last) await count(deps, task.doc.network, "failed");
    return { status: last ? "failed" : "approved", error: error.message, fatal: error.fatal };
  }
}

async function sendAction(deps, c, task) {
  const at = new Date(deps.now).toISOString();
  const k = "actions." + task.action + ".";
  try {
    const out = await c[task.action](Object.assign({ key: task.key }, task.doc));
    await task.ref.update({ [k + "status"]: "done", [k + "at"]: at, [k + "url"]: (out && out.url) || "", [k + "uri"]: (out && out.uri) || "", updatedAt: at });
    await count(deps, task.doc.network, task.action + "_done");
    return { status: "done" };
  } catch (error) {
    if (error.fatal) return { status: "planned", error: error.message, fatal: true };
    await task.ref.update({ [k + "status"]: "failed", [k + "at"]: at, [k + "error"]: clip(error.message, 200), updatedAt: at });
    await count(deps, task.doc.network, "act_failed");
    return { status: "failed", error: error.message };
  }
}

async function mark(deps, task, status, error) {
  const at = new Date(deps.now).toISOString();
  const k = "actions." + task.action + ".";
  await task.ref.update(Object.assign({ [k + "status"]: status, [k + "at"]: at, updatedAt: at }, error ? { [k + "error"]: error } : {}));
  if (status === "dry") await count(deps, task.doc.network, task.action + "_dry");
}

/**
 * One pass over the plan. deps: { db, fetch, now, inc, keys: { clientId, secret }, sleep }.
 * Returns per network what happened: { done, dry, missed, failed, posted, error }.
 */
async function carryOut(deps, conf) {
  const { db, now } = deps;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const out = Object.fromEntries(API.map((k) => [k, { done: 0, dry: 0, missed: 0, failed: 0, posted: 0, already: 0, error: "" }]));
  if (conf.paused) return out;
  const docs = (snap) => snap.docs.map((d) => ({ key: d.id, ref: d.ref, doc: d.data() })).filter((t) => API.includes(t.doc.network));
  const planned = (await Promise.all(CARRIED.map((a) => db.collection("engagement_posts").where("actions." + a + ".status", "==", "planned").limit(300).get().then((s) => docs(s).map((t) => Object.assign(t, { action: a }))))))
    .flat().sort((a, b) => (b.doc.score || 0) - (a.doc.score || 0));
  const replies = docs(await db.collection("engagement_posts").where("actions.reply.status", "==", "approved").limit(50).get());
  const creds = await readCreds(db);

  for (const network of API) {
    const tally = out[network];
    const mine = planned.filter((t) => t.doc.network === network);
    const fresh = [];
    for (const t of mine) {
      if (plannedAt(t.doc) < now - ACT_WINDOW) { await mark(deps, t, "missed", creds[network] ? "The 6-hour window passed." : E.NETWORKS[network].name + " was not connected."); tally.missed += 1; }
      else if (!conf.live) { await mark(deps, t, "dry"); tally.dry += 1; }
      else fresh.push(t);
    }
    const waiting = replies.filter((t) => t.doc.network === network);
    if (!creds[network] || (!fresh.length && !waiting.length)) continue;
    const got = await client(deps, network, creds[network]);
    if (got.error) { tally.error = got.error; await noteError(db, network, got.error, now); continue; }
    let sent = 0;
    for (const t of waiting) {
      const r = await sendReply(deps, got.c, t);
      if (r.status === "posted") tally.posted += 1;
      else if (r.status === "replied") tally.already += 1;
      else if (r.status === "failed") tally.failed += 1;
      if (r.fatal) { tally.error = r.error; break; }
      sent += 1;
      await sleep(GAP);
    }
    if (tally.error) { await noteError(db, network, tally.error, now); continue; }
    for (const t of fresh.slice(0, Math.max(0, PER_RUN - sent))) {
      const r = await sendAction(deps, got.c, t);
      if (r.status === "done") tally.done += 1;
      else if (r.status === "failed") tally.failed += 1;
      if (r.fatal) { tally.error = r.error; await noteError(db, network, r.error, now); break; }
      await sleep(GAP);
    }
    if (!tally.error && creds[network].error) await privateRef(db, network).set({ error: "" }, { merge: true });
  }
  return out;
}

/** An approved reply out at once, so Carlos sees it posted in the toast. */
async function replyNow(deps, key) {
  const ref = deps.db.collection("engagement_posts").doc(key);
  const snap = await ref.get();
  const doc = snap.exists ? snap.data() : null;
  if (!doc || !E.NETWORKS[doc.network] || !E.NETWORKS[doc.network].api) return { status: "approved" };
  if (((doc.actions || {}).reply || {}).status !== "approved") return { status: ((doc.actions || {}).reply || {}).status || "" };
  const cred = (await readCreds(deps.db))[doc.network];
  if (!cred) return { status: "approved", error: E.NETWORKS[doc.network].name + " is not connected" };
  const got = await client(deps, doc.network, cred);
  if (got.error) { await noteError(deps.db, doc.network, got.error, deps.now); return { status: "approved", error: got.error }; }
  return sendReply(deps, got.c, { key, ref, doc });
}

/**
 * The comments under our posted replies that we have not both liked and answered, for the chain pass in
 * jarvis-engagement. Returns { found: [{ parent: { key, ...doc }, comments }], checked, errors: { network: message } };
 * each comment is a post in the scout's shape with liked and answered as our account sees them.
 */
async function pendingChains(deps) {
  const { db, now } = deps;
  const at = new Date(now).toISOString();
  const since = new Date(now - CHAIN_DAYS * 24 * HOUR).toISOString();
  const recheck = new Date(now - CHAIN_EVERY).toISOString();
  const snap = await db.collection("engagement_posts").where("actions.reply.status", "==", "posted").limit(300).get();
  const posted = snap.docs.map((d) => ({ key: d.id, ref: d.ref, doc: d.data() }))
    .filter((t) => API.includes(t.doc.network) && String(t.doc.actions.reply.postedAt || "") >= since && String(t.doc.chainAt || "") < recheck)
    .sort((a, b) => String(b.doc.actions.reply.postedAt).localeCompare(String(a.doc.actions.reply.postedAt)));
  const out = { found: [], checked: 0, errors: {} };
  if (!posted.length) return out;
  const creds = await readCreds(db);
  for (const network of API) {
    const mine = posted.filter((t) => t.doc.network === network).slice(0, CHAIN_PER_RUN);
    if (!creds[network] || !mine.length) continue;
    const got = await client(deps, network, creds[network]);
    if (got.error) { out.errors[network] = got.error; continue; }
    for (const t of mine) {
      try {
        const comments = (await got.c.under(t.doc.actions.reply, t.doc)).filter((c) => c && c.id && !(c.liked && c.answered));
        await t.ref.update({ chainAt: at });
        out.checked += 1;
        if (comments.length) out.found.push({ parent: Object.assign({ key: t.key }, t.doc), comments });
      } catch (error) {
        if (error.fatal) { out.errors[network] = error.message; break; }
      }
    }
  }
  return out;
}

/**
 * Comments on our own posts and clips (#2447): each network's notifications (Bluesky replies, mentions and quotes,
 * Mastodon mentions, YouTube comment threads on our channel), read at most once per CHAIN_EVERY. handled(keys)
 * answers the keys already stored, which are not looked at again. Same { found, checked, errors } as pendingChains;
 * each found parent is our post ({ own: true }), with what we wrote as the reply's draft.
 */
async function pendingInbox(deps, handled) {
  const { db, now } = deps;
  const at = new Date(now).toISOString();
  const since = new Date(now - CHAIN_DAYS * 24 * HOUR).toISOString();
  const stateRef = privateRef(db, "inbox");
  const state = ((await stateRef.get()).data() || {}).at || {};
  const out = { found: [], checked: 0, errors: {} };
  const due = API.filter((k) => String(state[k] || "") < new Date(now - CHAIN_EVERY).toISOString());
  if (!due.length) return out;
  const creds = await readCreds(db);
  for (const network of due) {
    if (!creds[network]) continue;
    const got = await client(deps, network, creds[network]);
    if (got.error) { out.errors[network] = got.error; continue; }
    try {
      const items = (await got.c.inbox(since)).filter((c) => c && c.id);
      const skip = await handled(items.map((c) => E.keyOf(network, c.id)));
      for (const c of items.filter((x) => !skip.has(E.keyOf(network, x.id))).slice(0, CHAIN_PER_RUN)) {
        const d = await got.c.detail(c);
        out.checked += 1;
        if (c.liked && d.answered) continue;
        const parent = { key: "", own: true, network, id: d.ourId || c.on || "", thread: c.thread || c.id, text: "", score: 0, actions: { reply: { draft: d.ours } } };
        out.found.push({ parent, comments: [Object.assign({}, c, { answered: d.answered })] });
      }
      state[network] = at;
    } catch (error) {
      out.errors[network] = error.message;
    }
  }
  await stateRef.set({ at: state }, { merge: true });
  return out;
}

module.exports = {
  ACT_WINDOW, PER_RUN, MAX_TRIES, MASTODON_SCOPES, YT_SCOPE, API, ActError, CHAIN_DAYS, CHAIN_PER_RUN,
  carryOut, replyNow, pendingChains, pendingInbox, connections, saveBluesky, connectUrl, connectCallback, disconnect, readCreds, CLIENTS, call,
  linkFacets, drawCard, cardFields
};
