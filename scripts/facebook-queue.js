#!/usr/bin/env node
/* Schedules a rendered social batch on the QA-lab Facebook Page through the Graph API. Buffer's free
   plan has no room for a Facebook channel, so the Page is posted to directly.

     FACEBOOK_PAGE_ID=... FACEBOOK_PAGE_TOKEN=... node scripts/facebook-queue.js --batch auto-2026-10-22 [--dry-run]
     ... node scripts/facebook-queue.js --all     every batch; slots more than 29 days out wait for a later run
     ... node scripts/facebook-queue.js --check   how many posts the Page has scheduled
     ... node scripts/facebook-queue.js --reslot [--dry-run]   move queued posts to the later calendar.csv slots
       scripts/facebook-reslot.js --write gave them (delete and re-create)

   Reads the same captions.json and calendar.csv as buffer-queue.js and posts each feed image with its
   facebook caption and alt text at its calendar time, skipping captions already scheduled or published on
   the Page. Meta Business Suite's Planificador does not list posts scheduled through the API; --check reads
   them. The token is a Page access token with pages_manage_posts. A post whose image the site does not serve
   yet is left for the next run. Exits 1 when any post failed, after trying all of them.

   Every post it schedules or finds on the Page goes into the ledger assets/social/facebook.json
   (scripts/social-ledger.js), and each run first asks the Page whether the queued ones whose time has passed went out.
   Hub first (scripts/hub-gate.js): a post whose hub page does not answer 200, or whose slot is before its day on
   the hub, is not scheduled and goes into the ledger as failed with the reason. Each caption ends with its hub post's
   address, tagged utm_source=facebook&utm_medium=social&utm_campaign=<batch>; a post the Page took before that is
   still recognised by its caption without the address.

   Faces (scripts/face-route.js, #2310): es/pt posts go to @qaurlreview's Page once FACEBOOK_PAGE_ID_ES and
   FACEBOOK_PAGE_TOKEN_ES are set (FACE=es node scripts/meta-token.js page), and to the QA-lab Page until then. When
   they are, each run first deletes the es/pt posts the QA-lab Page still has scheduled (ledger: moved) and then
   schedules them on the other Page. A post queued or sent on either Page is not scheduled on the other.

   The Page token never expires, but changing the Facebook password or removing the "QA-lab Page Publisher"
   app (1097031042944706) revokes it. To renew it, generate a user token in Graph API Explorer on that app
   with pages_manage_posts and pages_read_engagement, copy the app secret from App settings > Basic, then:

     FACEBOOK_USER_TOKEN=... FACEBOOK_APP_SECRET=... FACEBOOK_PAGE_ID=... node scripts/facebook-queue.js --renew

   It exchanges the user token for a long-lived one, reads the Page token from it, checks that the Page token
   never expires, and stores it in the FACEBOOK_PAGE_TOKEN repo secret with gh. Reset the app secret after. */

const fs = require("fs");
const path = require("path");
const ledger = require("./social-ledger");
const { createGate, withHubLink } = require("./hub-gate");
const faceRoute = require("./face-route");
const { FACES } = require("./brand-kit/faces");

const ROOT = path.resolve(__dirname, "..");
// The Page token of the face being posted; main() sets it per face.
let TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const profileOf = faceRoute.pageProfile;
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const GRAPH = "https://graph.facebook.com/" + (process.env.FACEBOOK_GRAPH_VERSION || "v23.0");
// The Graph API only schedules between 10 minutes and 30 days ahead.
const MIN_LEAD_MS = 20 * 60e3;
const MAX_LEAD_MS = 29 * 24 * 3600e3;

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
function facebookSlots(dir) {
  const when = {};
  const lines = fs.readFileSync(path.join(dir, "calendar.csv"), "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [date, time, channel, slug] = line.split(",");
    if (channel === "facebook") when[slug] = new Date(date + "T" + time + ":00-05:00").getTime();
  }
  return when;
}

async function served(url) {
  const res = await fetch(url, { method: "HEAD" }).catch(() => null);
  return Boolean(res && res.ok);
}

async function waitFor(url, minutes) {
  const until = Date.now() + minutes * 60e3;
  while (Date.now() < until) {
    if (await served(url)) return true;
    await new Promise((r) => setTimeout(r, 20e3));
  }
  return false;
}

// Code 190 is an expired or revoked token; "on behalf of user" means the user revoked the app's access.
function graphError(status, json) {
  const error = json.error || {};
  const message = "Graph " + status + ": " + (error.message || JSON.stringify(json)).slice(0, 300);
  const revoked = error.code === 190 || /on behalf of user|session has been invalidated/i.test(error.message || "");
  return Object.assign(new Error(revoked ? message + "\nFACEBOOK_PAGE_TOKEN was revoked. Renew it with node scripts/facebook-queue.js --renew (steps at the top of that file)." : message),
    { revoked, subcode: error.error_subcode });
}

async function graph(edge, params) {
  const body = new URLSearchParams(Object.assign({}, params, { access_token: TOKEN }));
  const res = await fetch(GRAPH + "/" + edge, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw graphError(res.status, json);
  return json;
}

async function graphGet(edge, params, token = TOKEN) {
  const qs = new URLSearchParams(Object.assign({}, params, token ? { access_token: token } : {}));
  const res = await fetch(GRAPH + "/" + edge + "?" + qs);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw graphError(res.status, json);
  return json;
}

async function graphDelete(id) {
  const res = await fetch(GRAPH + "/" + id + "?" + new URLSearchParams({ access_token: TOKEN }), { method: "DELETE" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error || json.success === false) throw graphError(res.status, json);
}

// Every page of a Graph edge, following paging.next.
async function graphAll(edge, params) {
  const out = [];
  let json = await graphGet(edge, Object.assign({ limit: "100" }, params));
  for (;;) {
    out.push(...(json.data || []));
    if (!(json.paging && json.paging.next)) return out;
    const res = await fetch(json.paging.next);
    json = await res.json();
    if (json.error) throw new Error("Graph: " + json.error.message);
  }
}

const key = (text) => String(text || "").replace(/\s+/g, " ").trim();

// Captions already on the Page, scheduled or published in the last 40 days, so a rerun never posts twice.
async function onPage(page) {
  const since = String(Math.floor(Date.now() / 1000) - 40 * 86400);
  const scheduled = await graphAll(page + "/scheduled_posts", { fields: "message,scheduled_publish_time" });
  const published = await graphAll(page + "/posts", { fields: "message,created_time,permalink_url", since });
  const keys = new Map();
  scheduled.forEach((p) => keys.set(key(p.message), { id: p.id, at: new Date(p.scheduled_publish_time * 1000).toISOString(), result: "queued" }));
  published.forEach((p) => keys.set(key(p.message), { id: p.id, at: new Date(p.created_time).toISOString(), result: "sent", url: p.permalink_url }));
  return { scheduled, published, keys };
}

// Code 100 with subcode 33 is a post the Page no longer has. Any other error leaves the entry queued for the next run.
async function lookup(entry, published) {
  const seen = published.find((p) => p.id === entry.id);
  if (seen) return ledger.fromGraph({ is_published: true, permalink_url: seen.permalink_url });
  try {
    return ledger.fromGraph(await graphGet(entry.id, { fields: "is_published,permalink_url" }));
  } catch (error) {
    if (error.revoked) throw error;
    if (error.subcode === 33) return ledger.fromGraph(null);
    console.log("could not look up", entry.id, "-", error.message);
    return null;
  }
}

async function check(page) {
  const { scheduled } = await onPage(page);
  const times = scheduled.map((p) => p.scheduled_publish_time * 1000).sort((a, b) => a - b);
  console.log(scheduled.length + " scheduled on the Page" + (times.length ? ", " + new Date(times[0]).toISOString() + " to " + new Date(times[times.length - 1]).toISOString() : ""));
}

// Explorer user token -> long-lived user token -> Page token, which then has no expiry date.
async function renew(page) {
  const app = process.env.FACEBOOK_APP_ID || "1097031042944706";
  const secret = process.env.FACEBOOK_APP_SECRET;
  const user = process.env.FACEBOOK_USER_TOKEN;
  if (!(page && secret && user)) throw new Error("FACEBOOK_PAGE_ID, FACEBOOK_APP_SECRET and FACEBOOK_USER_TOKEN must be set.");
  const long = await graphGet("oauth/access_token", { grant_type: "fb_exchange_token", client_id: app, client_secret: secret, fb_exchange_token: user }, null);
  const { access_token: token, name } = await graphGet(page, { fields: "access_token,name" }, long.access_token);
  if (!token) throw new Error("No Page token for " + page + ": the user is not an admin of the Page, or pages_manage_posts was not granted.");
  const { data } = await graphGet("debug_token", { input_token: token }, app + "|" + secret);
  const scopes = data.scopes || [];
  if (!data.is_valid || data.expires_at !== 0 || !scopes.includes("pages_manage_posts")) {
    throw new Error("The Page token is not a never-expiring pages_manage_posts token: " + JSON.stringify({ valid: data.is_valid, expires_at: data.expires_at, scopes }));
  }
  const repo = process.env.GITHUB_REPO || "kaanmuar/kaanmuar.github.io";
  const set = require("child_process").spawnSync("gh", ["secret", "set", "FACEBOOK_PAGE_TOKEN", "-R", repo], { input: token, stdio: ["pipe", "inherit", "inherit"] });
  if (set.status !== 0) throw new Error("gh secret set FACEBOOK_PAGE_TOKEN failed");
  console.log("FACEBOOK_PAGE_TOKEN renewed for " + name + " (" + page + "), no expiry, scopes " + scopes.join(" ") + ". Reset the app secret now.");
}

// Batches with Facebook captions and a calendar, oldest first.
function allBatches() {
  const root = path.join(ROOT, "media/social-posts");
  return fs.readdirSync(root).filter((name) => /^[\w-]+$/.test(name)
    && fs.existsSync(path.join(root, name, "captions.json")) && fs.existsSync(path.join(root, name, "calendar.csv"))).sort();
}

function posts(batch) {
  const dir = path.join(ROOT, "media/social-posts", batch);
  const captions = JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  const when = facebookSlots(dir);
  return Object.keys(captions).filter((slug) => captions[slug].facebook && !captions[slug].hold)
    .map((slug) => ({ batch, slug, cap: captions[slug], at: when[slug] || 0 }));
}

const photo = (post, caption, due) => ({
  url: SITE + "/media/social-posts/" + post.batch + "/feed/" + post.slug + ".jpg",
  caption,
  alt_text_custom: post.cap.alt || "",
  published: "false",
  scheduled_publish_time: String(Math.floor(due / 1000)),
});

/* --reslot (#1140): the Page app cannot edit a scheduled post, so each queued Page post whose calendar.csv facebook
   row is now later than its Page time (scripts/facebook-reslot.js --write) is deleted and scheduled again at the row.
   The run stops at the first delete the Page refuses. A post whose re-create fails is no longer on the Page, so the
   next --all run schedules it at its row. */
async function reslot({ page, profile }, live) {
  const book = ledger.read(ledger.FACEBOOK);
  const gate = createGate();
  const moves = [];
  for (const post of allBatches().flatMap(posts)) {
    const name = post.batch + "/" + post.slug;
    const entry = ledger.find(book, name, "facebook", profile);
    if (!entry || entry.result !== "queued" || !entry.id || !post.at) continue;
    const was = Date.parse(entry.at);
    if (post.at - was >= 60e3 && was > Date.now() + 60 * 60e3) moves.push({ post, name, entry });
  }
  console.log((live ? "Moving " : "Would move ") + moves.length + " Page posts to their later calendar.csv slots");
  let moved = 0;
  let failed = 0;
  for (const { post, name, entry } of moves) {
    const at = new Date(post.at).toISOString();
    const params = photo(post, withHubLink(post.cap.facebook, { batch: post.batch, slug: post.slug, network: "facebook" }), post.at);
    const hub = await gate(post.batch, post.slug, post.cap, at);
    const why = hub.why ? "Hub first: " + hub.why : !(await served(params.url)) ? "image not served: " + params.url : null;
    if (!live) { console.log("  " + name + " " + entry.at + " -> " + at + (why ? " HELD: " + why : "")); continue; }
    if (why) { failed += 1; console.log("  held " + name + " - " + why); continue; }
    try {
      await graphDelete(entry.id);
    } catch (error) {
      failed += 1;
      console.log("  the Page refused to delete " + entry.id + " (" + name + "), stopping: " + error.message.split("\n")[0]);
      break;
    }
    const record = (fields) => ledger.record(book, name, Object.assign({ channel: "facebook", profile, checked: new Date().toISOString(), at }, fields));
    try {
      const r = await graph(page + "/photos", params);
      moved += 1;
      console.log("  moved " + name + " " + entry.at + " -> " + at + " " + (r.post_id || r.id));
      record({ id: r.post_id || r.id, result: "queued" });
    } catch (error) {
      failed += 1;
      console.log("  deleted " + entry.id + " but could not schedule " + name + " again, the next --all run does: " + error.message.split("\n")[0]);
      record({ result: "failed", error: "Deleted " + entry.id + " to move it; " + error.message.split("\n")[0] });
    }
  }
  if (live) ledger.write(ledger.FACEBOOK, book);
  console.log(moved + " moved, " + failed + " failed");
  return failed;
}

// The default face's scheduled posts whose language another connected face now posts: deleted from this Page and
// marked moved, so that face's run schedules them on its own Page.
async function moveAway({ face, profile }, all, book, connected, live) {
  if (face !== faceRoute.DEFAULT) return 0;
  let failed = 0;
  for (const post of all) {
    const name = post.batch + "/" + post.slug;
    const entry = ledger.find(book, name, "facebook", profile);
    const to = faceRoute.postFace(post.batch, post.slug, post.cap, "facebook", connected);
    if (to === face || !entry || entry.result !== "queued" || !entry.id || Date.parse(entry.at) <= Date.now() + 60 * 60e3) continue;
    if (!live) { console.log("would move", name, entry.at, "to", profileOf(to)); continue; }
    try {
      await graphDelete(entry.id);
      ledger.record(book, name, Object.assign({}, entry, { result: "moved", error: "Moved to " + profileOf(to), checked: new Date().toISOString() }));
      console.log("moved", name, entry.at, "to", profileOf(to));
    } catch (error) {
      failed += 1;
      console.log("the Page refused to delete " + entry.id + " (" + name + "), stopping: " + error.message.split("\n")[0]);
      break;
    }
  }
  return failed;
}

async function main() {
  const opts = args();
  if (opts.renew) return renew(process.env.FACEBOOK_PAGE_ID);
  const live = !opts["dry-run"];
  const pages = Object.keys(FACES).map((face) => {
    const env = faceRoute.faceEnv(face);
    return { face, page: env.FACEBOOK_PAGE_ID, token: env.FACEBOOK_PAGE_TOKEN, profile: profileOf(face) };
  });
  const connected = new Set(pages.filter((p) => p.page && p.token).map((p) => p.face));
  if ((live || opts.check) && !connected.has(faceRoute.DEFAULT)) throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN must be set.");
  const batch = String(opts.batch || "");
  if (!opts.check && !opts.reslot && !opts.all && !/^[\w-]+$/.test(batch)) throw new Error("--batch <name> or --all is required");
  let failed = 0;
  for (const p of pages.filter((p) => connected.has(p.face) || p.face === faceRoute.DEFAULT)) {
    TOKEN = p.token;
    if (connected.size > 1) console.log("== " + p.profile);
    if (opts.check) await check(p.page);
    else if (opts.reslot) failed += await reslot(p, live);
    else failed += await queue(p, { batch, all: !!opts.all, live, connected });
  }
  if (failed) process.exit(1);
}

async function queue(p, { batch, all, live, connected }) {
  const { face, page, profile } = p;
  const every = (all ? allBatches() : [batch]).flatMap(posts);
  const list = every.filter((post) => faceRoute.postFace(post.batch, post.slug, post.cap, "facebook", connected) === face);
  if (!list.length && face !== faceRoute.DEFAULT) { console.log("nothing to post"); return 0; }
  if (!every.length) { console.log("nothing to post"); return 0; }

  // A batch the daily job just pushed may take a few minutes to reach the site.
  if (live && !all) {
    const first = SITE + "/media/social-posts/" + batch + "/feed/" + every[0].slug + ".jpg";
    console.log("Waiting up to 60 minutes for the site to serve " + first);
    if (!(await waitFor(first, 60))) {
      console.log("::warning::The site did not serve " + first + " within 60 minutes. The daily Facebook Page queue (facebook-page.yml) schedules " + batch + " once it does.");
      return 0;
    }
  }
  const found = live || TOKEN ? await onPage(page) : { published: [], keys: new Map() };
  const done = found.keys;
  const book = ledger.read(ledger.FACEBOOK);
  if (live) {
    const counts = await ledger.upgrade(book, Date.now(), (entry) => (entry.profile === profile ? lookup(entry, found.published) : null));
    console.log("ledger: " + counts.sent + " sent, " + counts.failed + " failed, " + counts.queued + " still queued");
  }
  let failed = await moveAway(p, every, book, connected, live);
  const horizon = Date.now() + MAX_LEAD_MS;
  const gate = createGate();
  const record = (name, entry) => ledger.record(book, name, Object.assign({ channel: "facebook", profile, checked: new Date().toISOString() }, entry));
  const elsewhere = (name) => (book.posts[name] || []).some((e) => e.channel === "facebook" && e.profile !== profile && (e.result === "queued" || e.result === "sent"));
  let queued = 0;
  let already = 0;
  let later = 0;
  let unserved = 0;
  let late = 0;
  for (const post of list) {
    const name = post.batch + "/" + post.slug;
    const caption = withHubLink(post.cap.facebook, { batch: post.batch, slug: post.slug, network: "facebook" });
    const there = done.get(key(caption)) || done.get(key(post.cap.facebook));
    if (there) {
      already += 1;
      const known = ledger.find(book, name, "facebook", profile);
      if (live && !(known && known.id === there.id && known.result !== "queued")) record(name, there);
      continue;
    }
    if (elsewhere(name)) { already += 1; continue; }
    if (post.at > horizon) { later += 1; continue; }
    // The Graph API fetches the image from the site, so a batch merged minutes ago waits for its Pages deploy.
    const image = SITE + "/media/social-posts/" + post.batch + "/feed/" + post.slug + ".jpg";
    if (!(await served(image))) {
      unserved += 1;
      console.log("not on the site yet", name, image);
      continue;
    }
    // A missed slot goes out 20 minutes from now, the next one 30 minutes after that, and so on.
    const due = post.at < Date.now() + MIN_LEAD_MS ? Date.now() + MIN_LEAD_MS + 30 * 60e3 * late++ : post.at;
    const params = photo(post, caption, due);
    const at = new Date(due).toISOString();
    const hub = await gate(post.batch, post.slug, post.cap, at);
    if (!live) { console.log("dry-run", name, at, hub.why ? "HELD: " + hub.why : "hub ok", params.url, caption.split("\n").pop()); continue; }
    if (hub.why) {
      failed += 1;
      console.log("held", name, "-", hub.why, hub.url);
      record(name, { at, result: "failed", error: "Hub first: " + hub.why });
      continue;
    }
    try {
      const r = await graph(page + "/photos", params);
      queued += 1;
      console.log("scheduled", name, at, r.id);
      record(name, { id: r.post_id || r.id, at, result: "queued" });
    } catch (error) {
      failed += 1;
      console.log("failed", name, "-", error.message);
      record(name, { at, result: "failed", error: error.message.split("\n")[0] });
    }
  }
  if (live) ledger.write(ledger.FACEBOOK, book);
  console.log(queued + " scheduled, " + already + " already on the Page, " + later + " more than 29 days out, " + unserved + " not on the site yet, " + failed + " failed");
  return failed;
}

main().catch((error) => { console.error(error); process.exit(1); });
