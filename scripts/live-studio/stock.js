#!/usr/bin/env node
/* The live studio's media stock (#3173): every clip cut from a live, where its file is and where it went out.

     node scripts/live-studio/stock.js [--episode hotel-high-season] [--lang es] [--json]

   assets/social/live-stock.json (written by publish.js and committed with its batch) lists one row per clip: episode,
   language, voice and speaker (ai, or owner when Carlos voiced it himself), scene, length, peak, the recording it was cut
   from, and its file, an asset of the live-stock GitHub release named <recording>-<clip file>. A highlight that went to
   the networks names its batch post (post: "<batch>/<slug>"); this command joins that with the Buffer, Facebook Page and
   open-social ledgers to say where it was sent, queued or failed. The mp4s themselves never go into git. */

const fs = require("fs");
const path = require("path");
const ledger = require("../social-ledger");
const { LANGS } = require("./studio");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = "assets/social/live-stock.json";
const RELEASE = "live-stock";
const REPO = "kaanmuar/kaanmuar.github.io";

function read(root = ROOT) {
  const file = path.join(root, MANIFEST);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { version: 1, release: RELEASE, clips: [] };
}

function write(manifest, root = ROOT) {
  fs.mkdirSync(path.join(root, path.dirname(MANIFEST)), { recursive: true });
  fs.writeFileSync(path.join(root, MANIFEST), JSON.stringify(manifest, null, 1) + "\n");
}

const stem = (recording) => String(recording).replace(/\.mp4$/, "");
const assetName = (recording, file) => stem(recording) + "-" + file;
const assetUrl = (name) => "https://github.com/" + REPO + "/releases/download/" + RELEASE + "/" + name;

// The stock rows of one cut recording (cut.js's clips.json); posts maps a clip file to its batch post.
function rows(cut, { recorded, peaks = {}, posts = {} } = {}) {
  const speaker = cut.voice === "carlos" ? "owner" : "ai";
  const list = cut.clips.map((c) => ({
    id: stem(cut.recording) + "/" + c.file,
    recording: cut.recording,
    recorded: recorded || null,
    episode: c.episode || (cut.episodes || [])[0] || "",
    lang: c.lang || cut.lang,
    voice: c.voice || cut.voice,
    speaker,
    scene: c.scene,
    viewer: c.viewer || "",
    duration: c.length,
    peak: peaks[c.file] == null ? null : peaks[c.file],
    file: assetName(cut.recording, c.file),
    url: assetUrl(assetName(cut.recording, c.file)),
    post: posts[c.file] || null
  }));
  // A live's trial code expires, and the chaptered recording still shows it (#3254).
  if (!cut.trial) list.push({ id: stem(cut.recording) + "/chapters.mp4", recording: cut.recording, recorded: recorded || null, episode: (cut.episodes || []).join(","),
    lang: cut.lang, voice: cut.voice, speaker, scene: "full", viewer: "", duration: null, peak: null,
    file: assetName(cut.recording, "chapters.mp4"), url: assetUrl(assetName(cut.recording, "chapters.mp4")), post: null });
  return list;
}

// Rows replace the ones with the same id; the stock stays in recording order.
function merge(manifest, list) {
  const byId = new Map(manifest.clips.map((c) => [c.id, c]));
  list.forEach((c) => byId.set(c.id, c));
  return Object.assign({}, manifest, { clips: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) });
}

// Where a stock clip went: each ledger entry of its batch post, by network and profile.
function posted(clip, books) {
  if (!clip.post) return [];
  return Object.entries(books).flatMap(([book, data]) => ((data.posts || {})[clip.post] || [])
    .map((e) => ({ book, channel: e.channel, profile: e.profile, result: e.result, at: e.at, url: e.url || "" })));
}

function books(root = ROOT) {
  return { buffer: ledger.read(path.join(root, ledger.BUFFER)), facebook: ledger.read(path.join(root, ledger.FACEBOOK)), open: ledger.read(path.join(root, ledger.OPEN_SOCIAL)) };
}

// The language the next AI-voiced live takes in the six-language turn, after the last one in the stock. Owner shares
// keep Carlos's language and do not move the turn.
function nextLang(manifest) {
  const ai = manifest.clips.filter((c) => c.speaker === "ai" && c.recorded).sort((a, b) => a.recorded.localeCompare(b.recorded)).pop();
  return ai ? LANGS[(LANGS.indexOf(ai.lang) + 1) % LANGS.length] : LANGS[0];
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
  const manifest = read();
  const all = books();
  const list = manifest.clips.filter((c) => (!opt("episode") || c.episode === opt("episode")) && (!opt("lang") || c.lang === opt("lang")))
    .map((c) => Object.assign({}, c, { posted: posted(c, all) }));
  if (args.includes("--json")) return console.log(JSON.stringify(list, null, 1));
  list.forEach((c) => {
    const where = c.posted.map((p) => p.channel + ":" + p.result).join(" ") || (c.post ? "batch " + c.post + ", not queued yet" : "stock only");
    console.log([c.lang, c.speaker, c.episode, c.scene + (c.viewer ? "@" + c.viewer : ""), c.duration == null ? "full" : c.duration + " s", c.file, where].join("  "));
  });
  console.log(list.length + " clips in the " + RELEASE + " release; the next AI-voiced live speaks " + nextLang(manifest) + ".");
}

if (require.main === module) main();

module.exports = { MANIFEST, RELEASE, read, write, rows, merge, posted, books, nextLang, assetName, assetUrl };
