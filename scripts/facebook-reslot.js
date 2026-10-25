#!/usr/bin/env node
/* Plans the Facebook Page back down to five posts a Bogotá day (#1140).

     node scripts/facebook-reslot.js [--from 2026-10-26] [--cap 5]   print the moves, change nothing
     node scripts/facebook-reslot.js --write [...]                    also rewrite the moved posts' calendar.csv facebook rows

   The Page app cannot edit a scheduled post (Graph error #10), so a move is a delete and a re-create, which
   scripts/facebook-queue.js --reslot makes for every queued Page post whose calendar.csv row is now later than its
   Page time. The committed calendar.csv diff is the list Carlos approves before that run.
   On a day over the cap the posts that stay are, in order: pinned posts, series and skits (they keep their day), posts on
   the same day as their other networks, then the earlier ones. The rest move to the next day after it with room, at
   that day's first lane slot (social-calendar.js slotTime) at least 30 minutes from every other Page post, and never
   past the Graph API's 29-day horizon. Only days from --from (default tomorrow, Bogotá) are planned. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const { load, slotTime } = require("./social-calendar");

const ROOT = path.resolve(__dirname, "..");
const POSTS = "media/social-posts";
const GAP = 30 * 60e3;
const HORIZON = 29 * 24 * 3600e3;
const KEEP_DAY = new Set(["series", "skit"]);

const bogotaDay = (ms) => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const slotMs = (day, time) => Date.parse(day + "T" + time + ":00-05:00");

// queued: [{ post, at (ms), keep (0 to 2) }]. Returns [{ post, from (ms), to (ms) }].
function plan(queued, { cap = 5, from, now = Date.now() }) {
  const days = new Map();
  queued.filter((q) => bogotaDay(q.at) >= from).forEach((q) => {
    const day = bogotaDay(q.at);
    days.set(day, (days.get(day) || []).concat(Object.assign({}, q)));
  });
  const last = bogotaDay(now + HORIZON);
  const moves = [];
  const room = (day) => (days.get(day) || []).length < cap;
  const slot = (day) => {
    const taken = (days.get(day) || []).map((q) => q.at);
    for (let lane = 1; lane <= 5; lane += 1) {
      const at = slotMs(day, slotTime(day, "facebook", lane));
      if (at > now + GAP && taken.every((t) => Math.abs(t - at) >= GAP)) return at;
    }
    return null;
  };
  for (let day = from; day <= last; day = addDays(day, 1)) {
    const list = days.get(day) || [];
    if (list.length <= cap) continue;
    list.sort((a, b) => b.keep - a.keep || a.at - b.at);
    days.set(day, list.slice(0, cap));
    for (const q of list.slice(cap)) {
      let to = null;
      for (let next = addDays(day, 1); next <= last && to === null; next = addDays(next, 1)) {
        const at = room(next) ? slot(next) : null;
        if (at !== null) { to = at; days.get(next) ? days.get(next).push(Object.assign({}, q, { at })) : days.set(next, [Object.assign({}, q, { at })]); }
      }
      moves.push({ post: q.post, from: q.at, to });
    }
  }
  return moves;
}

// The Page's queued posts from the ledger, scored by what keeps them on their day.
function queuedOnPage(root = ROOT) {
  const book = ledger.read(path.join(root, ledger.FACEBOOK));
  const posts = new Map(load(root).posts.map((p) => [p.id, p]));
  const out = [];
  Object.entries(book.posts).forEach(([id, list]) => list.forEach((e) => {
    if (e.channel !== "facebook" || e.result !== "queued" || !e.id) return;
    const at = Date.parse(e.at);
    const p = posts.get(id);
    const onDay = !!p && p.rows.some((r) => r.channel !== "facebook" && r.date === bogotaDay(at));
    out.push({ post: id, at, keep: p && (p.pin || KEEP_DAY.has(p.kind)) ? 2 : onDay ? 1 : 0 });
  }));
  return out;
}

function write(moves, root = ROOT) {
  const byBatch = new Map();
  moves.filter((m) => m.to).forEach((m) => {
    const [batch, slug] = m.post.split("/");
    byBatch.set(batch, (byBatch.get(batch) || new Map()).set(slug, m.to));
  });
  for (const [batch, slugs] of byBatch) {
    const file = path.join(root, POSTS, batch, "calendar.csv");
    const lines = fs.readFileSync(file, "utf8").split("\n").map((line) => {
      const cells = line.split(",");
      if (cells[2] !== "facebook" || !slugs.has(cells[3])) return line;
      const local = new Date(slugs.get(cells[3]) - 5 * 3600e3).toISOString();
      return [local.slice(0, 10), local.slice(11, 16)].concat(cells.slice(2)).join(",");
    });
    fs.writeFileSync(file, lines.join("\n"));
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : fallback; };
  const from = opt("from", addDays(bogotaDay(Date.now()), 1));
  const moves = plan(queuedOnPage(), { cap: Number(opt("cap", 5)), from });
  const local = (ms) => new Date(ms - 5 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  console.log(moves.length + " Facebook Page posts over five a day from " + from + (argv.includes("--write") ? ", calendar.csv rewritten:" : " (print only):"));
  moves.forEach((m) => console.log("  " + m.post.padEnd(52) + " " + local(m.from) + " -> " + (m.to ? local(m.to) : "NO ROOM within 29 days, stays")));
  if (argv.includes("--write")) write(moves);
}

module.exports = { plan, queuedOnPage, write };
