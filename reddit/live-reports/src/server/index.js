// Posts the live reports in the subreddit: one on install, one from the moderator menu, and one a day for each new
// batch, pinned. The batch comes from dist/summary.json, written by scripts/build.mjs with the data of this version.
import { once } from "node:events";
import { createServer, getServerPort, context, reddit, redis } from "@devvit/web/server";
import summary from "../../dist/summary.json";
import campaign from "../../dist/campaign.json";
import approved from "../../dist/engagement.json";

const SITE = "https://carlosandmunoz.com/qa-review.html?utm_source=reddit&utm_medium=social&utm_campaign=live-reports#live-reports";
const POSTED = "posted-batch";
// One log line per batch post and per daily run, read back by reddit-live.yml through `devvit logs` into
// assets/social/reddit.json (scripts/reddit-ledger.js, #2571). Reddit does not approve fetch to a personal domain,
// so the app reports nothing over the network. Keep the prefix and fields in step with scripts/reddit-ledger.js.
const LEDGER = "qalab-ledger ";
// Batch posts by id (field) and posted time (value), so the daily run logs each one's score and comments (#2602).
const BATCHES = "batch-posts";
const NUMBERS_DAYS = 30;

async function members() {
  try {
    const sub = await reddit.getCurrentSubreddit();
    return { subreddit: sub.name, subscribers: sub.numberOfSubscribers };
  } catch (error) {
    console.error("subreddit info failed; " + error.message);
    return { subreddit: context.subredditName || "", subscribers: null };
  }
}

async function ledger(post, key = "live/" + summary.newest) {
  const line = Object.assign({ kind: post ? "post" : "members", at: new Date().toISOString() }, await members());
  if (post) Object.assign(line, { key, id: post.id, url: "https://www.reddit.com" + post.permalink, posted: post.createdAt.toISOString() });
  console.log(LEDGER + JSON.stringify(line));
  if (post) await redis.hSet(BATCHES, { [post.id]: post.createdAt.toISOString() });
}

async function numbers() {
  const known = await redis.hGetAll(BATCHES);
  const since = Date.now() - NUMBERS_DAYS * 24 * 3600000;
  const old = Object.keys(known).filter((id) => !(Date.parse(known[id]) >= since));
  if (old.length) await redis.hDel(BATCHES, old);
  const posts = [];
  for (const id of Object.keys(known).filter((k) => !old.includes(k))) {
    try {
      const post = await reddit.getPostById(id);
      posts.push({ id, score: post.score, comments: post.numberOfComments });
    } catch (error) {
      console.error("post " + id + " numbers failed; " + error.message);
    }
  }
  if (posts.length) console.log(LEDGER + JSON.stringify({ kind: "numbers", at: new Date().toISOString(), posts }));
}

function fallback() {
  const lines = summary.top.map((r) => `- ${r.name} (${r.host}): ${r.overall}, grade ${r.grade}`);
  return { text: `Live reports: ${summary.count} public sites, each analyzed by the same review anyone can run.\n\nNewest batch (${summary.newest}):\n\n${lines.join("\n")}\n\nTurn the ring at ${SITE}` };
}

async function submit(title) {
  return reddit.submitCustomPost({ title, entry: "default", textFallback: fallback() });
}

function evergreenTitle() {
  return `Live reports: ${summary.count} public sites, analyzed by the same review anyone can run. Turn the ring and open any of them.`;
}

function batchTitle() {
  const top = summary.top[0];
  const lead = top ? ` ${top.name} leads with ${top.overall}.` : "";
  return `${summary.fresh} new live reports (${summary.newest}).${lead} ${summary.count} sites in the ring.`;
}

// The campaign posts bundled by scripts/build.mjs (#2606): each goes out once, as a link to its hub page, when its
// slot comes; a slot more than MISSED_MS old is left alone, and a run posts at most PER_RUN.
const CAMPAIGN = "campaign:";
const MISSED_MS = 12 * 3600000;
const PER_RUN = 4;

async function postCampaign() {
  const now = Date.now();
  let posted = 0;
  for (const item of campaign.filter((p) => p.at <= now && now - p.at <= MISSED_MS)) {
    if (posted >= PER_RUN) break;
    if (await redis.get(CAMPAIGN + item.key)) continue;
    try {
      const post = await reddit.submitPost({ title: item.title, url: item.url });
      await redis.set(CAMPAIGN + item.key, post.id, { expiration: new Date(now + 30 * 24 * 3600000) });
      await ledger(post, item.key);
      posted += 1;
    } catch (error) {
      console.error("campaign post " + item.key + " failed; " + error.message);
    }
  }
}

// Comments under our posts (#2614), for the engagement routine: reddit-engagement.yml reads these log lines every hour
// and sends them to Jarvis, and ships the replies Carlos approved back in dist/engagement.json with a new version.
// A comment is logged on every run while it is under COMMENT_HOURS old, so a sync that reads two hours of logs never
// misses one. Keep the kinds and fields in step with functions/engagement-reddit.js.
const HOUR = 3600000;
const COMMENT_DAYS = 7;
const COMMENT_HOURS = 6;
const COMMENT_POSTS = 15;
const PER_LINE = 5;
const REPLIED = "replied:";
const TRIED = "reply-tries:";
const MAX_TRIES = 3;

const log = (rec) => console.log(LEDGER + JSON.stringify(Object.assign({ at: new Date().toISOString() }, rec)));

async function appUser() {
  try {
    const user = await reddit.getAppUser();
    if (user) return user.username.toLowerCase();
  } catch (error) {
    console.error("app user failed; " + error.message);
  }
  return String(context.appName || "").toLowerCase();
}

const mine = (c, me) => String(c.authorName || "").toLowerCase() === me;

function commentLine(c, parent, ours, answered) {
  return {
    id: c.id, post: c.postId, parent, author: c.authorName, body: String(c.body || "").slice(0, 1200), created: c.createdAt.toISOString(),
    permalink: c.permalink, score: c.score, answered, ours: String(ours || "").slice(0, 500)
  };
}

async function comments() {
  const known = await redis.hGetAll(BATCHES);
  const since = Date.now() - COMMENT_DAYS * 24 * HOUR;
  const fresh = Date.now() - COMMENT_HOURS * HOUR;
  const me = await appUser();
  const ids = Object.keys(known).filter((id) => Date.parse(known[id]) >= since).sort((a, b) => known[b].localeCompare(known[a])).slice(0, COMMENT_POSTS);
  const items = [];
  for (const id of ids) {
    try {
      const post = await reddit.getPostById(id);
      if (!post.numberOfComments) continue;
      for (const c of await reddit.getComments({ postId: id, limit: 100, depth: 3 }).all()) {
        const ours = mine(c, me);
        if (!ours && c.createdAt.getTime() < fresh) continue;
        const replies = await c.replies.all();
        if (!ours) items.push(commentLine(c, id, post.title, replies.some((r) => mine(r, me))));
        else {
          for (const r of replies.filter((x) => !mine(x, me) && x.createdAt.getTime() >= fresh)) {
            items.push(commentLine(r, c.id, c.body, (await r.replies.all()).some((x) => mine(x, me))));
          }
        }
      }
    } catch (error) {
      console.error("comments on " + id + " failed; " + error.message);
    }
  }
  for (let i = 0; i < items.length; i += PER_LINE) log({ kind: "comments", items: items.slice(i, i + PER_LINE) });
}

// Each approved reply goes out once, unless the app already answered that comment; it is logged as replied on every
// run while this version carries it, and a failing one is tried on MAX_TRIES runs.
async function sendReplies() {
  if (!approved.length) return;
  const me = await appUser();
  for (const item of approved) {
    if (!item || !/^t1_\w+$/.test(item.id || "") || !item.text) continue;
    const done = await redis.get(REPLIED + item.key);
    if (done) { log(Object.assign({ kind: "replied", key: item.key }, JSON.parse(done))); continue; }
    const tries = Number(await redis.get(TRIED + item.key)) || 0;
    if (tries >= MAX_TRIES) continue;
    try {
      const target = await reddit.getCommentById(item.id);
      const had = (await target.replies.all()).find((r) => mine(r, me));
      const out = had ? { id: had.id, url: "https://www.reddit.com" + had.permalink, already: true }
        : await reddit.submitComment({ id: item.id, text: item.text, runAs: "APP" }).then((c) => ({ id: c.id, url: "https://www.reddit.com" + c.permalink }));
      await redis.set(REPLIED + item.key, JSON.stringify(out), { expiration: new Date(Date.now() + 30 * 24 * HOUR) });
      log(Object.assign({ kind: "replied", key: item.key }, out));
    } catch (error) {
      await redis.set(TRIED + item.key, String(tries + 1), { expiration: new Date(Date.now() + 7 * 24 * HOUR) });
      log({ kind: "reply-failed", key: item.key, error: String((error && error.message) || error).slice(0, 200) });
    }
  }
}

async function pin(post) {
  try { await post.sticky(1); } catch (error) { console.error("sticky failed; " + error.message); }
}

async function routes(url) {
  switch (url) {
    case "/internal/menu/post": {
      const post = await submit(evergreenTitle());
      return { showToast: { text: "Live reports posted.", appearance: "success" }, navigateTo: post.url };
    }
    case "/internal/on/app/install": {
      const post = await submit(evergreenTitle());
      await pin(post);
      await redis.set(POSTED, summary.newest);
      await ledger(post);
      return {};
    }
    case "/internal/scheduler/daily": {
      // A day without a new upload keeps the same batch: no second post for it, only the member count.
      if (!summary.newest || (await redis.get(POSTED)) === summary.newest) {
        await ledger(null);
        await numbers();
        return {};
      }
      const post = await submit(batchTitle());
      await pin(post);
      await redis.set(POSTED, summary.newest);
      await ledger(post);
      await numbers();
      return {};
    }
    case "/internal/scheduler/campaign": {
      for (const task of [postCampaign, sendReplies, comments]) {
        try { await task(); } catch (error) { console.error(task.name + " failed; " + error.message); }
      }
      return {};
    }
    default:
      return null;
  }
}

async function onReq(req, res) {
  let status = 200;
  let body;
  try {
    req.resume();
    await once(req, "end");
    body = await routes((req.url || "").split("?")[0]);
    if (body === null) { status = 404; body = { error: "not found", status }; }
  } catch (error) {
    status = 500;
    body = { error: String(error && error.stack || error), status };
    console.error(`${context.subredditName || ""} ${req.url}: ${body.error}`);
  }
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

const server = createServer(onReq);
server.on("error", (error) => console.error(`server error; ${error.stack}`));
server.listen(getServerPort());
