#!/usr/bin/env node
/* One social calendar across every batch (#1039): five posts a day per network, one per content lane (#1037).

     node scripts/social-calendar.js [--from 2026-10-26]                 print the plan, change nothing
     node scripts/social-calendar.js --write [--from ...] [--batch B]    rewrite calendar.csv and the captions' dates
     node scripts/social-calendar.js --convert-launch launch-2026-10     rewrite the launch set's calendar in the common layout
       --write first sets every row Buffer or the Facebook Page already holds to its queued time, and posts that are
       queued anywhere stay where they are unless --move-queued. A moved post's Facebook Page row keeps its time:
       the Page app may not edit scheduled posts (Graph error #10), and Carlos keeps those (#1109).
     BUFFER_API_KEY=... node scripts/social-calendar.js --sync [--dry-run] [--windows N]
       move the posts Buffer holds to their calendar slots (editPost with the whole post, as Buffer validates it),
       never queueing or deleting any, and record each new time in the ledger. Buffer allows 100 calls in 15
       minutes and 250 or 500 a day per account, so each window makes at most WINDOW_CALLS and the next one waits,
       and it stops while DAILY_RESERVE of the day's calls is left; whatever is left is moved by running it again
       (the buffer-batch workflow does every night). --write --move-queued marks each post it moves with its new
       slot in the Buffer ledger until then. --dry-run lists the moves and re-saves one post per channel at its
       current time, so a payload Buffer rejects shows up before anything moves.

   Lanes: 1 site review, 2 tip or trick, 3 news or pick, 4 best practice, 5 promo. Each day the lanes take the five
   parts of each network's window (the tips studio's windows), in an order that moves on one part a day, at a
   seeded random minute. Lane 1 is kept for the day's top Live Report (post 01 of the daily auto batch); the other
   reviews wait in a backlog that takes the lane 3 and lane 4 slots while news and best practice have nothing.
   Only posts not yet sent anywhere and not before --from (default tomorrow, Bogotá) move; seasonal series keep
   their day. A post's hub date (captions.json date) follows its slot day, so it is live on the hub first.
   --batch B plans that batch alone into the free slots, as the daily Live Reports job does for its new batch:
   its top post in lane 1, its other reviews at the back of the backlog. */

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
const ROTATION = ["en", "es", "pt", "de", "fr", "it"];
const BUFFER_API = "https://api.buffer.com";
const EDIT_AHEAD = 30 * 60e3;
const PACE = 400;
const WINDOW = 15 * 60e3;
const WINDOW_CALLS = 95;
const DAILY_RESERVE = 0.4;

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

// The launch set's own calendar (Date,Time,Channel,Language,Post,Format,Asset,How,Caption key) in the common
// layout: one post per language (<lang>/<topic>, its ledger and hub id), channels named as the other batches name them.
const LAUNCH_CHANNELS = { linkedin: "linkedin", x: "x", facebook: "facebook", tiktok: "tiktok", "youtube shorts": "youtube", "instagram feed": "instagram", "instagram story": "instagram-story", "instagram reels": "instagram-reels" };
function launchCalendar(csv) {
  const [head, ...lines] = csv.trim().split("\n");
  const col = Object.fromEntries(head.split(",").map((key, i) => [key, i]));
  const rows = lines.map((line) => {
    const cells = line.split(",");
    let channel = LAUNCH_CHANNELS[cells[col.Channel].toLowerCase()];
    if (!channel) throw new Error("unknown launch channel " + cells[col.Channel]);
    if (/carousel/i.test(cells[col.Format])) channel += "-carousel";
    return [cells[col.Date], cells[col.Time], channel, cells[col.Language] + "/" + cells[col.Post], cells[col.Asset]].join(",");
  }).sort((a, b) => a.slice(0, 16).localeCompare(b.slice(0, 16)));
  return ["Date,Time,Channel,Post,Asset"].concat(rows).join("\n") + "\n";
}

// A batch without captions.json keeps a captions file per post (the launch set: <lang>/<topic>-captions.json);
// its hub date is its first calendar day, as build-social-hub.js reads it.
function ownCaptions(dir, rows) {
  const slugs = Object.keys(rows).filter((slug) => fs.existsSync(path.join(dir, slug + "-captions.json")));
  return slugs.length ? Object.fromEntries(slugs.map((slug) => [slug, { kind: "launch", date: rows[slug].map((r) => r.date).sort()[0] }])) : null;
}

// Batches with a calendar.csv of Date,Time,Channel,Post,Asset and captions.json or a captions file per post.
function load(root = ROOT) {
  const books = { buffer: ledger.read(path.join(root, ledger.BUFFER)), facebook: ledger.read(path.join(root, ledger.FACEBOOK)) };
  const batches = [];
  const posts = [];
  for (const batch of fs.readdirSync(path.join(root, POSTS)).sort()) {
    const dir = path.join(root, POSTS, batch);
    const capFile = path.join(dir, "captions.json");
    const calFile = path.join(dir, "calendar.csv");
    if (!fs.existsSync(calFile)) continue;
    const [head, ...lines] = fs.readFileSync(calFile, "utf8").trim().split("\n");
    if (head.trim() !== "Date,Time,Channel,Post,Asset") continue;
    const rows = {};
    lines.forEach((line) => {
      const [date, time, channel, slug, asset] = line.split(",");
      (rows[slug] = rows[slug] || []).push({ date, time, channel, asset });
    });
    const captions = fs.existsSync(capFile) ? JSON.parse(fs.readFileSync(capFile, "utf8")) : ownCaptions(dir, rows);
    if (!captions) continue;
    batches.push(batch);
    Object.entries(captions).forEach(([slug, c]) => {
      const kind = kindOf(batch, c);
      const id = batch + "/" + slug;
      const entries = (books.buffer.posts[id] || []).concat(books.facebook.posts[id] || []);
      const queued = entries.filter((e) => e.result === "queued");
      posts.push({ id, batch, slug, kind, lane: LANES[kind], date: c.date, hold: !!c.hold, rows: rows[slug] || [],
        sent: entries.some((e) => e.result === "sent"), queued: queued.length > 0,
        queuedDay: queued.map((e) => Date.parse(e.at)).filter((at) => !isNaN(at)).map(bogotaDay).sort()[0] || null,
        kept: new Set((books.facebook.posts[id] || []).filter((e) => e.result === "queued").map((e) => e.channel)) });
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
// The launch set's languages of one topic go out in the clips' order: en, es, pt, de, fr, it.
const rotation = (post) => Math.max(0, ROTATION.indexOf(post.slug.split("/")[0]));
const firstDay = (post) => post.rows.filter((r) => NETWORKS.includes(r.channel)).map((r) => r.date).sort()[0] || post.date;

// Days from --from on, each with five lanes. Returns { moves, held, days }: moves carry the post, its new day and
// the lane it was slotted in; held are hub-only posts of --batch that move to the top post's day.
function plan(posts, { from, batch, moveQueued = false } = {}) {
  const days = new Map();
  const take = (day, lane, post) => {
    if (!days.has(day)) days.set(day, {});
    days.get(day)[lane] = post.id;
  };
  const free = (day, lane) => !(days.get(day) || {})[lane];
  const onNetworks = (post) => !post.hold && post.rows.some((r) => NETWORKS.includes(r.channel));
  const movable = (post) => onNetworks(post) && !post.sent && (moveQueued || !post.queued) && firstDay(post) >= from && !PINNED.has(post.kind) && (!batch || post.batch === batch);

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
  const order = (a, b) => firstDay(a).localeCompare(firstDay(b)) || rotation(a) - rotation(b) || a.id.localeCompare(b.id);
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

// A moved post's rows: the five networks at their lane's slot that day, any other channel on the same day at its
// time, and a channel whose queued post cannot be moved (the Facebook Page) where it is.
function rowsFor(move) {
  const kept = move.post.kept || new Set();
  return move.post.rows.map((row) => kept.has(row.channel) ? Object.assign({}, row) : Object.assign({}, row, NETWORKS.includes(row.channel)
    ? { date: move.day, time: slotTime(move.day, row.channel, move.lane) }
    : { date: move.day }));
}

// A moved post's hub date: its first network day, and no later than any time a network holds it now, so it is on
// the hub first both before and after --sync moves its queued posts.
function hubDay(move) {
  if (!move.lane) return move.day;
  const days = rowsFor(move).filter((r) => NETWORKS.includes(r.channel)).map((r) => r.date).concat(move.post.queuedDay || []);
  return days.sort()[0] || move.day;
}

function write(result, root = ROOT) {
  const byBatch = {};
  result.moves.concat(result.held).forEach((m) => { (byBatch[m.post.batch] = byBatch[m.post.batch] || []).push(m); });
  Object.entries(byBatch).forEach(([batch, list]) => {
    const dir = path.join(root, POSTS, batch);
    const capFile = path.join(dir, "captions.json");
    if (fs.existsSync(capFile)) {
      const raw = fs.readFileSync(capFile, "utf8");
      const captions = JSON.parse(raw);
      list.forEach((m) => { captions[m.post.slug].date = hubDay(m); });
      fs.writeFileSync(capFile, JSON.stringify(captions, null, 2) + (raw.endsWith("\n") ? "\n" : ""));
    }

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

// The calendar follows what the networks hold: each future queued ledger entry sets its channel's row, and a post's
// hub date is its earliest network day, so it is on the hub before any network has it.
function reconcile(root = ROOT, now = Date.now()) {
  const books = [ledger.read(path.join(root, ledger.BUFFER)), ledger.read(path.join(root, ledger.FACEBOOK))];
  const held = new Map();
  const earliest = new Map();
  books.forEach((book) => Object.entries(book.posts).forEach(([id, entries]) => entries.forEach((e) => {
    if (e.result !== "queued" || !e.at || Date.parse(e.at) <= now) return;
    held.set(id + "|" + e.channel, Date.parse(e.slot || e.at));
    earliest.set(id, Math.min(earliest.get(id) || Infinity, Date.parse(e.at)));
  })));
  const changed = [];
  load(root).batches.forEach((batch) => {
    const dir = path.join(root, POSTS, batch);
    const calFile = path.join(dir, "calendar.csv");
    const [head, ...lines] = fs.readFileSync(calFile, "utf8").trim().split("\n");
    let touched = false;
    const out = lines.map((line) => {
      const [date, time, channel, slug, asset] = line.split(",");
      const at = held.get(batch + "/" + slug + "|" + channel);
      if (!at) return line;
      const local = new Date(at - 5 * 3600e3).toISOString();
      const row = [local.slice(0, 10), local.slice(11, 16), channel, slug, asset].join(",");
      if (row !== line) touched = true;
      return row;
    }).sort((a, b) => a.slice(0, 16).localeCompare(b.slice(0, 16)));
    if (touched) fs.writeFileSync(calFile, [head].concat(out).join("\n") + "\n");

    const capFile = path.join(dir, "captions.json");
    if (!fs.existsSync(capFile)) {
      if (touched) changed.push(batch);
      return;
    }
    const raw = fs.readFileSync(capFile, "utf8");
    const captions = JSON.parse(raw);
    let dated = false;
    Object.entries(captions).forEach(([slug, c]) => {
      const mine = out.map((line) => line.split(",")).filter((r) => r[3] === slug && NETWORKS.includes(r[2]));
      if (!mine.some((r) => held.has(batch + "/" + slug + "|" + r[2]))) return;
      const first = mine.map((r) => r[0]).concat(bogotaDay(earliest.get(batch + "/" + slug))).sort()[0];
      if (c.date !== first) { c.date = first; dated = true; }
    });
    if (dated) fs.writeFileSync(capFile, JSON.stringify(captions, null, 2) + (raw.endsWith("\n") ? "\n" : ""));
    if (touched || dated) changed.push(batch);
  });
  return changed;
}

// Network slots per day and lane, for the printed plan.
function summary(result) {
  const counts = {};
  result.moves.forEach((m) => { counts[m.post.batch] = (counts[m.post.batch] || 0) + 1; });
  const last = result.moves.reduce((max, m) => (m.day > max ? m.day : max), "");
  const borrowed = result.moves.filter((m) => m.post.lane === 1 && BORROWED.includes(m.lane)).length;
  return { planned: result.moves.length, held: result.held.length, byBatch: counts, borrowed, last };
}

/* --sync: each post Buffer holds whose ledger time differs from its calendar slot is edited to that slot. The
   Facebook Page keeps its times. */
function targets(root = ROOT, now = Date.now()) {
  const { posts } = load(root);
  const slots = new Map();
  posts.forEach((post) => post.rows.forEach((row) => slots.set(post.id + "|" + row.channel, slotIso(row.date, row.time))));
  const out = [];
  const book = ledger.read(path.join(root, ledger.BUFFER));
  Object.entries(book.posts).forEach(([id, entries]) => entries.forEach((entry) => {
    const at = slots.get(id + "|" + entry.channel);
    if (entry.result !== "queued" || !entry.id || entry.channel === "facebook" || !at || at === new Date(entry.at).toISOString()) return;
    if (Date.parse(at) < now + EDIT_AHEAD || Date.parse(entry.at) < now + EDIT_AHEAD) return;
    out.push({ id, channel: entry.channel, profile: entry.profile, postId: entry.id, from: entry.at, to: at });
  }));
  const soonest = (t) => (t.from < t.to ? new Date(t.from).toISOString() : t.to);
  return out.sort((a, b) => soonest(a).localeCompare(soonest(b)) || a.id.localeCompare(b.id));
}

const POST_FIELDS = "id status dueAt text channelId channelService schedulingType tags { id }" +
  " assets { type source thumbnail ... on ImageAsset { image { altText } } ... on VideoAsset { video { thumbnailOffset title } } ... on DocumentAsset { document { title } } }" +
  " metadata { __typename" +
  " ... on YoutubePostMetadata { title category { categoryId } privacy license madeForKids notifySubscribers embeddable isAiGenerated }" +
  " ... on TiktokPostMetadata { title isAiGenerated }" +
  " ... on TwitterPostMetadata { isAiGenerated threadCount }" +
  " ... on LinkedInPostMetadata { firstComment }" +
  " ... on InstagramPostMetadata { type shouldShareToFeed firstComment link isAiGenerated }" +
  " ... on FacebookPostMetadata { type firstComment } }";

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== null && value !== undefined));

function assetInput(asset) {
  if (asset.type === "video") return { video: { url: asset.source, metadata: defined({ thumbnailOffset: asset.video && asset.video.thumbnailOffset, title: asset.video && asset.video.title }) } };
  if (asset.type === "document") return { document: { url: asset.source, thumbnailUrl: asset.thumbnail, title: (asset.document && asset.document.title) || "" } };
  return { image: { url: asset.source, metadata: { altText: (asset.image && asset.image.altText) || "" } } };
}

function metadataInput(service, m) {
  if (!m) return null;
  const picks = {
    youtube: () => ({ title: m.title, categoryId: m.category && m.category.categoryId, privacy: m.privacy, license: m.license, madeForKids: m.madeForKids, notifySubscribers: m.notifySubscribers, embeddable: m.embeddable, isAiGenerated: m.isAiGenerated }),
    tiktok: () => ({ title: m.title, isAiGenerated: m.isAiGenerated }),
    twitter: () => ({ isAiGenerated: m.isAiGenerated }),
    linkedin: () => ({ firstComment: m.firstComment }),
    instagram: () => ({ type: m.type, shouldShareToFeed: m.shouldShareToFeed, firstComment: m.firstComment, link: m.link, isAiGenerated: m.isAiGenerated }),
    facebook: () => ({ type: m.type, firstComment: m.firstComment })
  };
  const out = picks[service] ? defined(picks[service]()) : {};
  return Object.keys(out).length ? out : null;
}

// editPost validates the post that results as a whole, so the post goes back as Buffer holds it, with a new time.
function editInput(post, dueAt) {
  if (post.metadata && post.metadata.threadCount) throw new Error("a thread: edit it in Buffer");
  const input = { id: post.id, mode: "customScheduled", dueAt, text: post.text, assets: (post.assets || []).map(assetInput) };
  if (post.schedulingType) input.schedulingType = post.schedulingType;
  if (post.tags && post.tags.length) input.tagIds = post.tags.map((tag) => tag.id);
  const metadata = metadataInput(post.channelService, post.metadata);
  if (metadata) input.metadata = { [post.channelService]: metadata };
  return input;
}

// What is left of Buffer's daily calls, from the RateLimit headers of the last response (one policy per window).
const daily = { left: null, quota: null, reset: null };

function readLimits(headers) {
  const split = (name) => (headers.get(name) || "").split(/,\s*(?=")/).filter(Boolean);
  const policy = split("ratelimit-policy").find((p) => /;\s*w=86400\b/.test(p));
  if (!policy) return;
  const name = policy.match(/"([^"]+)"/)[1];
  const status = split("ratelimit").find((s) => s.includes('"' + name + '"'));
  if (!status) return;
  daily.quota = Number(policy.match(/q=(\d+)/)[1]);
  daily.left = Number(status.match(/r=(\d+)/)[1]);
  daily.reset = Number(status.match(/t=(\d+)/)[1]);
}

async function bufferGql(query, variables) {
  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.BUFFER_API_KEY },
    body: JSON.stringify({ query, variables })
  });
  readLimits(res.headers);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const error = new Error("Buffer " + res.status + ": " + JSON.stringify(json.errors || json).slice(0, 300));
    const limit = res.status === 429 && (json.errors || []).map((e) => e.extensions && e.extensions.window).find(Boolean);
    if (limit) Object.assign(error, { window: limit, retryAfter: Number(res.headers.get("retry-after")) || null });
    throw error;
  }
  return json.data;
}

const rateLimited = (error) => !!error.window || /\b429\b|RATE_LIMIT|rate limit/i.test(error.message);

/* Calls go through one budget: at most WINDOW_CALLS a window, then it waits for the next window, or stops after the
   last one. A 429 on the 15-minute window ends the window early. The daily and 30-day windows are shared with the
   Live Reports queue and every other job on the key, so it stops once the day's calls left fall to DAILY_RESERVE
   of the quota, or on a 429 for either; the next run picks up the rest. */
function budget({ windows, perWindow = WINDOW_CALLS, gql, sleep, now, limits = daily }) {
  let calls = 0;
  let left = windows;
  let start = now();
  const stop = (why) => { call.stopped = why; console.log("stopping: " + why); return null; };
  const next = async () => {
    left -= 1;
    if (left <= 0) return false;
    const wait = start + WINDOW - now();
    console.log("window full: waiting " + Math.ceil(Math.max(0, wait) / 60e3) + " min for the next one (" + left + " left)");
    if (wait > 0) await sleep(wait);
    calls = 0;
    start = now();
    return true;
  };
  async function call(query, variables) {
    for (;;) {
      if (call.stopped) return null;
      if (limits.left != null && limits.left <= Math.ceil(limits.quota * DAILY_RESERVE)) {
        return stop(limits.left + " of Buffer's " + limits.quota + " daily calls left, kept for the other jobs; the oldest frees up in " + Math.ceil(limits.reset / 3600) + " h");
      }
      if (calls >= perWindow && !(await next())) return null;
      calls += 1;
      try {
        return await gql(query, variables);
      } catch (error) {
        if (!rateLimited(error)) throw error;
        if (error.window && error.window !== "15m") return stop("Buffer's " + error.window + " limit is spent; retry in " + Math.ceil((error.retryAfter || 0) / 3600) + " h");
        console.log("rate limited after " + calls + " calls this window");
        calls = perWindow;
      }
    }
  }
  call.stopped = null;
  return call;
}

// The scheduled posts Buffer holds, whole, by id: one call per 100.
async function scheduledPosts(call) {
  const data = await call("query { account { organizations { id } } }");
  if (!data) return null;
  const out = new Map();
  for (const org of data.account.organizations) {
    let after = null;
    do {
      const page = await call("query($o: OrganizationId!, $a: String) { posts(first: 100, after: $a, input: { organizationId: $o, filter: { status: [scheduled] } }) { pageInfo { hasNextPage endCursor } edges { node { " + POST_FIELDS + " } } } }", { o: org.id, a: after });
      if (!page) return null;
      page.posts.edges.forEach(({ node }) => out.set(node.id, node));
      after = page.posts.pageInfo.hasNextPage ? page.posts.pageInfo.endCursor : null;
    } while (after);
  }
  return out;
}

const EDIT = "mutation($input: EditPostInput!) { editPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }";

async function sync({ dryRun, windows = 1, perWindow, limits, root = ROOT, gql = bufferGql, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, pace = PACE } = {}) {
  const list = targets(root, now());
  const counts = {};
  list.forEach((t) => { counts[t.channel] = (counts[t.channel] || 0) + 1; });
  console.log((dryRun ? "Would move " : "Moving ") + list.length + " queued Buffer posts to their calendar slots: " + JSON.stringify(counts) + " (the Facebook Page keeps its times)");
  list.forEach((t) => console.log("  " + t.channel.padEnd(8) + " " + t.id + "  " + t.from + " -> " + t.to));
  const result = { list, moved: {}, failed: 0, left: list.length, checked: {} };
  if (!list.length) return result;
  const call = budget({ windows: dryRun ? 1 : windows, perWindow, gql, sleep, now, limits });
  const held = await scheduledPosts(call);
  if (!held) { result.stopped = call.stopped || "ran out of calls reading Buffer's posts"; console.log(result.stopped + "; run --sync again"); return result; }

  if (dryRun) {
    // One real edit per channel, each post re-saved at the time it already has.
    for (const channel of Object.keys(counts)) {
      const t = list.find((x) => x.channel === channel && held.has(x.postId) && Date.parse(held.get(x.postId).dueAt) > now() + EDIT_AHEAD);
      if (!t) { result.checked[channel] = "no post to check"; continue; }
      const post = held.get(t.postId);
      try {
        const r = (await call(EDIT, { input: editInput(post, post.dueAt) })).editPost;
        result.checked[channel] = r.post ? "ok (" + t.id + ")" : "rejected: " + r.message;
      } catch (error) {
        result.checked[channel] = "rejected: " + error.message;
      }
      if (!/^ok/.test(result.checked[channel])) result.failed += 1;
      console.log("check " + channel.padEnd(8) + " " + result.checked[channel]);
    }
    return result;
  }

  const book = ledger.read(path.join(root, ledger.BUFFER));
  const entryOf = (t) => book.posts[t.id].find((e) => e.id === t.postId);
  const record = (t, at) => {
    const entry = entryOf(t);
    Object.assign(entry, { at: new Date(at).toISOString(), checked: new Date(now()).toISOString() });
    delete entry.slot;
    result.moved[t.channel] = (result.moved[t.channel] || 0) + 1;
    result.left -= 1;
  };
  const skip = (t, why) => {
    delete entryOf(t).slot;
    console.log("skipped " + t.channel + " " + t.id + ": " + why);
    result.left -= 1;
  };
  let done = 0;
  for (const t of list) {
    const post = held.get(t.postId);
    if (!post) { skip(t, "not scheduled in Buffer any more"); continue; }
    if (new Date(post.dueAt).toISOString() === t.to) { record(t, t.to); continue; }
    if (Date.parse(post.dueAt) < now() + EDIT_AHEAD || Date.parse(t.to) < now() + EDIT_AHEAD) { skip(t, "due within 30 minutes"); continue; }
    let r;
    try {
      r = await call(EDIT, { input: editInput(post, t.to) });
    } catch (error) {
      result.failed += 1;
      console.log("failed " + t.channel + " " + t.id + ": " + error.message);
      continue;
    }
    if (!r) break;
    if (r.editPost.post) record(t, r.editPost.post.dueAt || t.to);
    else { result.failed += 1; console.log("failed " + t.channel + " " + t.id + ": " + r.editPost.message); }
    if ((done += 1) % 25 === 0) ledger.write(path.join(root, ledger.BUFFER), book);
    await sleep(pace);
  }
  ledger.write(path.join(root, ledger.BUFFER), book);
  result.stopped = call.stopped;
  console.log("moved " + JSON.stringify(result.moved) + ", failed " + result.failed + ", left " + result.left + (result.left ? " (run --sync again for the rest)" : ""));
  return result;
}

// After a --move-queued plan: each Buffer post whose slot moved waits in the ledger for --sync, so the daily
// --write keeps its calendar row instead of setting it back to the time Buffer still has.
function mark(root = ROOT, now = Date.now()) {
  const file = path.join(root, ledger.BUFFER);
  const book = ledger.read(file);
  const list = targets(root, now);
  list.forEach((t) => { book.posts[t.id].find((e) => e.id === t.postId).slot = t.to; });
  if (list.length) ledger.write(file, book);
  return list.length;
}

// Posts a network holds before their day on the hub (#1038).
function hubLate(root = ROOT, now = Date.now()) {
  const late = [];
  load(root).posts.forEach((post) => {
    const entries = ["BUFFER", "FACEBOOK"].flatMap((key) => ledger.read(path.join(root, ledger[key])).posts[post.id] || []);
    const first = entries.filter((e) => e.result === "queued" && Date.parse(e.at) > now).map((e) => bogotaDay(Date.parse(e.at))).sort()[0];
    if (first && post.date > first) late.push(post.id + " hub " + post.date + ", on a network " + first);
  });
  return late;
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
  if (typeof opts["convert-launch"] === "string") {
    const file = path.join(ROOT, POSTS, opts["convert-launch"], "calendar.csv");
    fs.writeFileSync(file, launchCalendar(fs.readFileSync(file, "utf8")));
    console.log("converted " + path.relative(ROOT, file));
    return;
  }
  if (opts.sync) {
    const { failed } = await sync({ dryRun: !!opts["dry-run"], windows: Number(opts.windows) || 1 });
    const late = hubLate();
    console.log(late.length ? "on a network before the hub:\n  " + late.join("\n  ") : "every queued post is on the hub first");
    process.exit(failed || late.length ? 1 : 0);
  }
  const from = typeof opts.from === "string" ? opts.from : addDays(bogotaDay(Date.now()), 1);
  const batch = typeof opts.batch === "string" ? opts.batch : null;
  if (opts.write) console.log("matched the networks' queues in " + (reconcile().join(", ") || "no batch"));
  const { posts } = load();
  const result = plan(posts, { from, batch, moveQueued: !!opts["move-queued"] });
  console.log("Plan from " + from + (batch ? " for " + batch : "") + ": " + JSON.stringify(summary(result)));
  if (opts.write) {
    console.log("rewrote " + write(result).join(", "));
    if (opts["move-queued"]) console.log(mark() + " Buffer posts wait for --sync to move them");
    const late = hubLate();
    if (late.length) console.log("on a network before the hub:\n  " + late.join("\n  "));
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { NETWORKS, WINDOWS, LANES, WINDOW_CALLS, slotTime, kindOf, launchCalendar, load, plan, rowsFor, hubDay, write, reconcile, summary, targets, mark, editInput, daily, readLimits, sync, hubLate };
