/* Viewer comments for the live studio (#3140): a site address commented on stream becomes a review on stream.
     tiktok:@user   TikTok LIVE chat through the unofficial tiktok-live-connector package (npm i --no-save
                    tiktok-live-connector). It signs through Euler Stream's server: TIKTOK_SIGN_API_KEY lifts its free
                    rate limit. It reads public chat only and needs the account to be live.
     instagram      Instagram Graph API: polls the comments of the account's live video (IG_USER_ID, IG_ACCESS_TOKEN with
                    instagram_basic and instagram_manage_comments on a professional account). Live Producer streams count.
     stdin          lines typed in the runner's terminal, "user site.com", for a helper reading comments off a phone.
   Every source calls onComment({ user, text, url, host, from }) only for a comment that names a public web address. */

const readline = require("readline");

const GRAPH = "https://graph.facebook.com/v21.0";
const TLD = /\.(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/i;

// The first public web address in a comment, as https://host/path, or null. Addresses, localhost and bare words are not.
function extractUrl(text) {
  const match = String(text || "").match(/(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}(?::\d{2,5})?(?:\/[^\s]*)?/i);
  if (!match) return null;
  const word = String(text).slice(0, match.index).split(/\s/).pop();
  if (word.includes("@")) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(match[0]) ? match[0] : "https://" + match[0]);
  } catch (error) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!TLD.test(host) || /^\d+(\.\d+){3}$/.test(host) || /(^|\.)(localhost|local|internal|lan|home|test|example|invalid)$/.test(host)) return null;
  if (url.href.length > 200 || url.username || url.password) return null;
  url.hash = "";
  return { url: url.href.replace(/[).,!?]+$/, ""), host };
}

function emit(onComment, from, user, text) {
  const found = extractUrl(text);
  if (found) onComment(Object.assign({ user: String(user || "viewer").replace(/^@/, "").slice(0, 40), text: String(text).slice(0, 300), from }, found));
}

async function tiktok(username, onComment, log) {
  let lib;
  try {
    lib = require("tiktok-live-connector");
  } catch (error) {
    throw new Error("tiktok-live-connector is not installed: npm i --no-save tiktok-live-connector");
  }
  const options = process.env.TIKTOK_SIGN_API_KEY ? { signApiKey: process.env.TIKTOK_SIGN_API_KEY } : {};
  const user = username.replace(/^@/, "");
  if (lib.TikTokLiveConnection) {
    const conn = new lib.TikTokLiveConnection(user, options);
    conn.on(lib.WebcastEvent.CHAT, (data) => emit(onComment, "tiktok", data.user && data.user.uniqueId, data.comment));
    conn.on(lib.WebcastEvent.STREAM_END || "streamEnd", () => log("TikTok: the live ended"));
    const state = await conn.connect();
    log("TikTok: reading chat in room " + state.roomId);
    return () => conn.disconnect();
  }
  const conn = new lib.WebcastPushConnection(user, options);
  conn.on("chat", (data) => emit(onComment, "tiktok", data.uniqueId, data.comment));
  const state = await conn.connect();
  log("TikTok: reading chat in room " + state.roomId);
  return () => conn.disconnect();
}

async function graph(pathname, token) {
  const res = await fetch(GRAPH + pathname + (pathname.includes("?") ? "&" : "?") + "access_token=" + encodeURIComponent(token));
  const body = await res.json();
  if (!res.ok) throw new Error("Instagram: " + ((body.error && body.error.message) || res.status));
  return body;
}

async function instagram(onComment, log) {
  const userId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!userId || !token) throw new Error("Set IG_USER_ID and IG_ACCESS_TOKEN to read Instagram live comments");
  const seen = new Set();
  let media = "";
  let stopped = false;
  const poll = async () => {
    if (stopped) return;
    try {
      if (!media) {
        const live = await graph("/" + userId + "/live_media?fields=id,media_product_type", token);
        media = live.data && live.data[0] ? live.data[0].id : "";
        if (media) log("Instagram: reading comments on live video " + media);
      }
      if (media) {
        const page = await graph("/" + media + "/comments?fields=id,text,username,timestamp&limit=50", token);
        (page.data || []).forEach((c) => {
          if (seen.has(c.id)) return;
          seen.add(c.id);
          emit(onComment, "instagram", c.username, c.text);
        });
      }
    } catch (error) {
      log(error.message);
    }
    setTimeout(poll, 4000);
  };
  poll();
  return () => { stopped = true; };
}

// Typed lines: "user site.com" is a comment; y or n answers the approval run.js is waiting for.
function stdin(onComment, onAnswer) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const text = line.trim();
    if (/^(y|yes|n|no)$/i.test(text)) return onAnswer && onAnswer(/^y/i.test(text));
    const [user, ...rest] = text.split(/\s+/);
    if (rest.length) emit(onComment, "stdin", user, rest.join(" "));
    else emit(onComment, "stdin", "studio", text);
  });
  return () => rl.close();
}

module.exports = { extractUrl, tiktok, instagram, stdin };
