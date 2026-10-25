#!/usr/bin/env node
/* One social calendar across every batch (#1039): five posts a day per network, one per content lane (#1037).

     node scripts/social-calendar.js [--from 2026-10-26]                 print the plan, change nothing
     node scripts/social-calendar.js --write [--from ...] [--batch B]    rewrite calendar.csv and the captions' dates
     BUFFER_API_KEY=... FACEBOOK_PAGE_TOKEN=... node scripts/social-calendar.js --sync [--dry-run]
       move the posts Buffer and the Facebook Page already hold to their calendar slots (editPost and
       scheduled_publish_time), never queueing or deleting any, and record the new times in the ledgers

   Lanes: 1 site review, 2 tip or trick, 3 news or pick, 4 best practice, 5 promo. Each day the lanes take the five
   parts of each network's window (the tips studio's windows), in an order that moves on one part a day, at a
   seeded random minute. Lane 1 is kept for the day's top Live Report (post 01 of the daily auto batch); the other
   reviews wait in a backlog that takes the lane 3 and lane 4 slots while news and best practice have nothing.
   Only posts not yet sent anywhere and not before --from (default tomorrow, Bogotá) move; seasonal series keep
   their day. A post's hub date (captions.json date) follows its slot day, so it is live on the hub first.
   --batch B plans that batch alone into the free slots, as the daily Live Reports job does for its new batch;
   the batch's other reviews stay on the hub only, on the top post's day. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");

const ROOT = path.resolve(__dirname, "..");
const POSTS = "media/social-posts";
const NETWORKS = ["linkedin", "x", "facebook", "tiktok", "youtube"];
const WINDOWS = { linkedin: ["07:30", "11:00"], x: ["08:00", "21:00"], facebook: ["12:00", "19:00"], tiktok: ["17:00", "22:00"], youtube: ["16:00", "21:00"] };
const LANES = { review: 1, tip: 2, trick: 2, term: 2, news: 3, pick: 3, advice: 4, compare: 4, myth: 4, quiz: 4, skit: 5, series: 5, launch: 5 };
const BORROWED = [3, 4];
const PINNED = new Set(["series"]);
const BUFFER_API = "https://api.buffer.com";
const GRAPH = "https://graph.facebook.com/v21.0";
const EDIT_AHEAD = 30 * 60e3;
const PACE = 400;

const minutes = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayNumber = (day) => Math.round(Date.parse(day + "T12:00:00Z") / 86400e3);
const bogotaDay = (ms) => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10);
const slotIso = (day, time) => new Date(day + "T" + time + ":00-05:00").toISOString();

function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Lane L takes part (L - 1 + day) % 5 of the window, at a minute in the middle 70% of the part, so a
// network's slots never sit back to back.
function slotTime(day, network, lane) {
  const [from, to] = WINDOWS[network].map(minutes);
  const part = (to - from) / 5;
  const at = (lane - 1 + dayNumber(day)) % 5;
  const r = hash(day + "|" + network + "|" + lane) / 4294967296;
  return hhmm(Math.round(from + part * at + part * (0.15 + 0.7 * r)));
}

function kindOf(batch, c) {
  if (LANES[c.kind]) return c.kind;
  return batch.startsWith("tips") ? "tip" : batch.startsWith("promo") ? "launch" : "review";
}

// Batches with captions.json and a calendar.csv of Date,Time,Channel,Post,Asset. The launch set has its own
// six-language calendar and is left out.
function load(root = ROOT) {
  const books = { buffer: ledger.read(path.join(root, ledger.BUFFER)), facebook: ledger.read(path.join(root, ledger.FACEBOOK)) };
  const batches = [];
  const posts = [];
  for (const batch of fs.readdirSync(path.join(root, POSTS)).sort()) {
    const dir = path.join(root, POSTS, batch);
    const capFile = path.join(dir, "captions.json");
    const calFile = path.join(dir, "calendar.csv");
    if (!fs.existsSync(capFile) || !fs.existsSync(calFile)) continue;
    const [head, ...lines] = fs.readFileSync(calFile, "utf8").trim().split("\n");
    if (head.trim() !== "Date,Time,Channel,Post,Asset") continue;
    const captions = JSON.parse(fs.readFileSync(capFile, "utf8"));
    batches.push(batch);
    const rows = {};
    lines.forEach((line) => {
      const [date, time, channel, slug, asset] = line.split(",");
      (rows[slug] = rows[slug] || []).push({ date, time, channel, asset });
    });
    Object.entries(captions).forEach(([slug, c]) => {
      const kind = kindOf(batch, c);
      const id = batch + "/" + slug;
      const entries = (books.buffer.posts[id] || []).concat(books.facebook.posts[id] || []);
      posts.push({ id, batch, slug, kind, lane: LANES[kind], date: c.date, hold: !!c.hold, rows: rows[slug] || [], sent: entries.some((e) => e.result === "sent") });
    });
  }
  return { batches, posts };
}

// The lane a post's rows on that day were slotted in, or null for times set before this calendar.
function laneOf(post, day) {
  const row = post.rows.find((r) => r.date === day && NETWORKS.includes(r.channel));
  if (!row) return null;
  return [1, 2, 3, 4, 5].find((lane) => slotTime(day, row.channel, lane) === row.time) || null;
}

const isTop = (post) => post.batch.startsWith("auto-") && /^01-/.test(post.slug);
const firstDay = (post) => post.rows.filter((r) => NETWORKS.includes(r.channel)).map((r) => r.date).sort()[0] || post.date;

// Days from --from on, each with five lanes. Returns { moves, held, days }: moves carry the post, its new day and
// the lane it was slotted in; held are hub-only posts of --batch that move to the top post's day.
function plan(posts, { from, batch } = {}) {
  const days = new Map();
  const take = (day, lane, post) => {
    if (!days.has(day)) days.set(day, {});
    days.get(day)[lane] = post.id;
  };
  const free = (day, lane) => !(days.get(day) || {})[lane];
  const onNetworks = (post) => !post.hold && post.rows.some((r) => NETWORKS.includes(r.channel));
  const movable = (post) => onNetworks(post) && !post.sent && firstDay(post) >= from && !PINNED.has(post.kind) && (!batch || post.batch === batch);

  const stay = posts.filter((post) => onNetworks(post) && !movable(post) && firstDay(post) >= from);
  // Staying posts keep their day and the lane their slot times were planned in; others sit in their own lane, a
  // review other than the top one in a borrowed lane first, and double up when none is free.
  stay.sort((a, b) => firstDay(a).localeCompare(firstDay(b)) || a.id.localeCompare(b.id)).forEach((post) => {
    const day = firstDay(post);
    const prefer = post.lane === 1 && !isTop(post) ? BORROWED.concat(1) : [post.lane].concat(BORROWED);
    const lane = laneOf(post, day) || prefer.find((l) => free(day, l)) || prefer[0];
    take(day, lane, post);
  });

  const queue = {};
  const order = (a, b) => firstDay(a).localeCompare(firstDay(b)) || a.id.localeCompare(b.id);
  const go = posts.filter(movable).sort(order);
  const tops = go.filter(isTop);
  go.filter((post) => !isTop(post)).forEach((post) => { (queue[post.lane] = queue[post.lane] || []).push(post); });

  const moves = [];
  const put = (day, lane, post) => { take(day, lane, post); moves.push({ post, day, lane }); };
  // The day's top Live Report: the first free lane 1 slot on or after its own day.
  tops.forEach((post) => {
    let day = firstDay(post) > from ? firstDay(post) : from;
    while (!free(day, 1)) day = addDays(day, 1);
    put(day, 1, post);
  });
  for (let day = from; Object.values(queue).some((q) => q.length); day = addDays(day, 1)) {
    [2, 3, 4, 5].forEach((lane) => { if (free(day, lane) && queue[lane] && queue[lane].length) put(day, lane, queue[lane].shift()); });
    BORROWED.forEach((lane) => { if (free(day, lane) && queue[1] && queue[1].length) put(day, lane, queue[1].shift()); });
  }

  const held = [];
  if (batch) {
    const top = moves.find((m) => m.post.batch === batch && isTop(m.post));
    if (top) posts.filter((post) => post.batch === batch && post.hold && post.date !== top.day).forEach((post) => held.push({ post, day: top.day }));
  }
  return { moves, held, days };
}

// A moved post's rows: the five networks at their lane's slot that day, any other channel on the same day at its time.
function rowsFor(move) {
  return move.post.rows.map((row) => Object.assign({}, row, NETWORKS.includes(row.channel)
    ? { date: move.day, time: slotTime(move.day, row.channel, move.lane) }
    : { date: move.day }));
}

function write(result, root = ROOT) {
  const byBatch = {};
  result.moves.concat(result.held).forEach((m) => { (byBatch[m.post.batch] = byBatch[m.post.batch] || []).push(m); });
  Object.entries(byBatch).forEach(([batch, list]) => {
    const dir = path.join(root, POSTS, batch);
    const capFile = path.join(dir, "captions.json");
    const raw = fs.readFileSync(capFile, "utf8");
    const captions = JSON.parse(raw);
    list.forEach((m) => { captions[m.post.slug].date = m.day; });
    fs.writeFileSync(capFile, JSON.stringify(captions, null, 2) + (raw.endsWith("\n") ? "\n" : ""));

    const calFile = path.join(dir, "calendar.csv");
    const [head, ...lines] = fs.readFileSync(calFile, "utf8").trim().split("\n");
    const moved = new Map(list.filter((m) => m.lane).map((m) => [m.post.slug, rowsFor(m)]));
    const kept = lines.filter((line) => !moved.has(line.split(",")[3]));
    const all = kept.concat([...moved.entries()].flatMap(([slug, rows]) => rows.map((r) => [r.date, r.time, r.channel, slug, r.asset].join(","))));
    all.sort((a, b) => a.slice(0, 16).localeCompare(b.slice(0, 16)));
    fs.writeFileSync(calFile, [head].concat(all).join("\n") + "\n");
  });
  return Object.keys(byBatch);
}

// Network slots per day and lane, for the printed plan.
function summary(result) {
  const counts = {};
  result.moves.forEach((m) => { counts[m.post.batch] = (counts[m.post.batch] || 0) + 1; });
  const last = result.moves.reduce((max, m) => (m.day > max ? m.day : max), "");
  const borrowed = result.moves.filter((m) => m.post.lane === 1 && BORROWED.includes(m.lane)).length;
  return { planned: result.moves.length, held: result.held.length, byBatch: counts, borrowed, last };
}

/* --sync: each queued ledger entry whose time differs from its calendar slot is edited to that slot. */
function targets(root = ROOT, now = Date.now()) {
  const { posts } = load(root);
  const slots = new Map();
  posts.forEach((post) => post.rows.forEach((row) => slots.set(post.id + "|" + row.channel, slotIso(row.date, row.time))));
  const out = [];
  [["buffer", ledger.BUFFER], ["facebook", ledger.FACEBOOK]].forEach(([service, file]) => {
    const book = ledger.read(path.join(root, file));
    Object.entries(book.posts).forEach(([id, entries]) => entries.forEach((entry) => {
      const at = slots.get(id + "|" + entry.channel);
      if (entry.result !== "queued" || !entry.id || !at || at === new Date(entry.at).toISOString()) return;
      if (Date.parse(at) < now + EDIT_AHEAD || Date.parse(entry.at) < now + EDIT_AHEAD) return;
      out.push({ service, id, channel: entry.channel, profile: entry.profile, postId: entry.id, from: entry.at, to: at });
    }));
  });
  return out.sort((a, b) => a.to.localeCompare(b.to) || a.id.localeCompare(b.id));
}

async function bufferEdit(postId, dueAt) {
  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.BUFFER_API_KEY },
    body: JSON.stringify({ query: "mutation($input: EditPostInput!) { editPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }", variables: { input: { id: postId, mode: "customScheduled", dueAt } } })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) throw new Error("Buffer " + res.status + ": " + JSON.stringify(json.errors || json).slice(0, 300));
  const r = json.data.editPost;
  if (!r.post) throw new Error("Buffer: " + (r.message || "no post"));
  return r.post.dueAt || dueAt;
}

async function bufferLimit() {
  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.BUFFER_API_KEY },
    body: JSON.stringify({ query: "query { account { organizations { id name limits { scheduledPosts } } } }" })
  });
  const json = await res.json().catch(() => ({}));
  return ((json.data && json.data.account && json.data.account.organizations) || []).map((o) => o.name + ": " + JSON.stringify(o.limits)).join("; ");
}

async function facebookEdit(postId, iso) {
  const body = new URLSearchParams({ scheduled_publish_time: String(Math.floor(Date.parse(iso) / 1000)), access_token: process.env.FACEBOOK_PAGE_TOKEN });
  const res = await fetch(GRAPH + "/" + postId, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error("Graph " + res.status + ": " + JSON.stringify(json.error || json).slice(0, 300));
  return iso;
}

async function sync({ dryRun, root = ROOT } = {}) {
  const list = targets(root);
  const counts = {};
  list.forEach((t) => { counts[t.channel] = (counts[t.channel] || 0) + 1; });
  console.log((dryRun ? "Would move " : "Moving ") + list.length + " queued posts to their calendar slots: " + JSON.stringify(counts));
  if (process.env.BUFFER_API_KEY) console.log("Buffer limits: " + (await bufferLimit()));
  list.forEach((t) => console.log("  " + t.channel.padEnd(8) + " " + t.id + "  " + t.from + " -> " + t.to));
  if (dryRun) return { list, failed: 0 };
  const books = { buffer: ledger.read(path.join(root, ledger.BUFFER)), facebook: ledger.read(path.join(root, ledger.FACEBOOK)) };
  let failed = 0;
  for (const t of list) {
    const key = t.service === "buffer" ? "BUFFER_API_KEY" : "FACEBOOK_PAGE_TOKEN";
    if (!process.env[key]) { console.log("skipped " + t.channel + " " + t.id + ": no " + key); continue; }
    try {
      const at = t.service === "buffer" ? await bufferEdit(t.postId, t.to) : await facebookEdit(t.postId, t.to);
      const entry = books[t.service].posts[t.id].find((e) => e.id === t.postId);
      Object.assign(entry, { at: new Date(at).toISOString(), checked: new Date().toISOString() });
    } catch (error) {
      failed += 1;
      console.log("failed " + t.channel + " " + t.id + ": " + error.message);
      if (/\b429\b|rate limit/i.test(error.message)) { console.log("rate limited: stopped here; run --sync again later for the rest"); break; }
    }
    await new Promise((r) => setTimeout(r, PACE));
  }
  ledger.write(path.join(root, ledger.BUFFER), books.buffer);
  ledger.write(path.join(root, ledger.FACEBOOK), books.facebook);
  console.log("moved " + list.filter((t) => books[t.service].posts[t.id].some((e) => e.id === t.postId && new Date(e.at).toISOString() === t.to)).length + ", failed " + failed);
  return { list, failed };
}

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

async function main() {
  const opts = args();
  if (opts.sync) {
    const { failed } = await sync({ dryRun: !!opts["dry-run"] });
    process.exit(failed ? 1 : 0);
  }
  const from = typeof opts.from === "string" ? opts.from : addDays(bogotaDay(Date.now()), 1);
  const batch = typeof opts.batch === "string" ? opts.batch : null;
  const { posts } = load();
  const result = plan(posts, { from, batch });
  console.log("Plan from " + from + (batch ? " for " + batch : "") + ": " + JSON.stringify(summary(result)));
  if (opts.write) console.log("rewrote " + write(result).join(", "));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { NETWORKS, WINDOWS, LANES, slotTime, kindOf, load, plan, rowsFor, write, summary, targets, sync };
