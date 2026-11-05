// Posts the live reports in the subreddit: one on install, one from the moderator menu, and one a day for each new
// batch, pinned. The batch comes from dist/summary.json, written by scripts/build.mjs with the data of this version.
import { once } from "node:events";
import { createServer, getServerPort, context, reddit, redis } from "@devvit/web/server";
import summary from "../../dist/summary.json";

const SITE = "https://carlosandmunoz.com/qa-review.html?utm_source=reddit&utm_medium=social&utm_campaign=live-reports#live-reports";
const POSTED = "posted-batch";
// One log line per batch post and per daily run, read back by reddit-live.yml through `devvit logs` into
// assets/social/reddit.json (scripts/reddit-ledger.js, #2571). Reddit does not approve fetch to a personal domain,
// so the app reports nothing over the network. Keep the prefix and fields in step with scripts/reddit-ledger.js.
const LEDGER = "qalab-ledger ";

async function members() {
  try {
    const sub = await reddit.getCurrentSubreddit();
    return { subreddit: sub.name, subscribers: sub.numberOfSubscribers };
  } catch (error) {
    console.error("subreddit info failed; " + error.message);
    return { subreddit: context.subredditName || "", subscribers: null };
  }
}

async function ledger(post) {
  const line = Object.assign({ kind: post ? "post" : "members", at: new Date().toISOString() }, await members());
  if (post) Object.assign(line, { key: "live/" + summary.newest, id: post.id, url: "https://www.reddit.com" + post.permalink, posted: post.createdAt.toISOString() });
  console.log(LEDGER + JSON.stringify(line));
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
        return {};
      }
      const post = await submit(batchTitle());
      await pin(post);
      await redis.set(POSTED, summary.newest);
      await ledger(post);
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
