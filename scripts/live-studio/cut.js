#!/usr/bin/env node
/* After a live (#3140): cuts a run.js recording into its scenes for the media stock.

     node scripts/live-studio/cut.js media/live-studio/recordings/<file>.mp4 [--min 4]

   Reads <file>.chapters.json and writes, next to it in <file>-clips/:
     NN-<scene>.mp4     one clip per scene (H.264 + AAC, re-encoded on the scene's own frames); a viewer's review is
                        cut too, named after the site, and scenes shorter than --min seconds are skipped
     highlight.mp4      the hook, score, fix and call to action back to back, 30 to 55 s, the length of a social clip;
                        a recording of several episodes gets highlight-<episode>.mp4 for each
     chapters.mp4       the whole recording with its scenes as mp4 chapters (stream copy)
     chapters.txt       "0:00 Title" lines for a YouTube description
     clips.json         each clip's file, episode, scene, start, length, language and line
   A live that showed a trial code (chapters.json "trial", #3176) expires a day after it ends, so its clips never show it
   (#3254): run.js evergreen renders, in the live's language and voice, each episode's call to action with the review page
   and "comment or DM for your free 2-day pass", and the ticker band with the same; every clip plays under that ticker,
   each episode's call to action is that render, and a viewer's call to action (or any, when Carlos voiced the live) is
   left out. chapters.mp4 keeps the code, so it stays local (clips.json "trial", publish.js).
   scripts/live-studio/publish.js runs this when a recording has no clips yet, then posts the highlights.
   Every clip keeps the session's one language and voice. Clips whose peak is not above -30 dB are listed and exit 2. */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const studio = require("./studio");

const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";

function ff(args) {
  const out = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y"].concat(args), { encoding: "utf8" });
  if (out.status !== 0) throw new Error("ffmpeg failed: " + out.stderr);
}

function peakDb(file) {
  const out = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" });
  const m = (out.stderr || "").match(/max_volume: (-?[\d.]+) dB/);
  return m ? parseFloat(m[1]) : -Infinity;
}

const RUN = path.join(__dirname, "run.js");

// The evergreen renders for a live that showed a trial code, made by run.js evergreen when missing: { ticker, cta: {
// episode: { file, dur } } }, or null for a live with no code.
function evergreen(meta, dir, render = renderEvergreen) {
  if (!meta.trial) return null;
  const out = path.join(dir, "evergreen");
  const file = path.join(out, "evergreen.json");
  const fits = (m) => m && m.lang === meta.lang && m.voice === meta.voice && (meta.voice === "carlos" || (meta.episodes || []).every((e) => m.cta[e]));
  let m = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  if (!fits(m)) {
    render(meta, out);
    m = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!fits(m)) throw new Error("run.js evergreen did not render every episode's call to action in " + meta.lang);
  }
  const cta = {};
  Object.entries(m.cta).forEach(([id, c]) => { cta[id] = { file: path.join(out, c.file), dur: c.dur, line: c.line }; });
  return { ticker: path.join(out, m.ticker), cta };
}

function renderEvergreen(meta, out) {
  const voice = meta.voice === "carlos" ? ["--voice", "carlos", "--lang", meta.lang] : ["--voice-name", meta.voice];
  const done = spawnSync(process.execPath, [RUN, "evergreen", "--episode", (meta.episodes || []).join(","), "--out", out].concat(voice), { stdio: "inherit" });
  if (done.status !== 0) throw new Error("run.js evergreen failed");
}

// One piece of a clip: a stretch of the recording (under the evergreen ticker when there is one), or the evergreen call
// to action in place of the episode's own; null when the piece must not be posted.
function piece(c, ever) {
  const own = { start: c.start, len: c.end - c.start, line: c.line };
  if (!ever) return own;
  if (c.scene !== "cta") return Object.assign(own, { ticker: ever.ticker });
  const swap = !c.viewer && ever.cta[c.episode];
  return swap ? { file: swap.file, len: swap.dur, line: swap.line } : null;
}

// ffmpeg arguments that join pieces into one clip: inputs, then a graph ending in [v] and [a].
function joinArgs(pieces, recording) {
  const args = [];
  const parts = [];
  let n = 0;
  pieces.forEach((p, i) => {
    if (p.file) args.push("-t", p.len.toFixed(3), "-i", p.file);
    else args.push("-ss", p.start.toFixed(3), "-t", p.len.toFixed(3), "-i", recording);
    const at = n++;
    if (p.ticker) {
      args.push("-stream_loop", "-1", "-i", p.ticker);
      parts.push("[" + at + ":v][" + n++ + ":v]overlay=0:" + studio.TICKER.y + ":shortest=1,setpts=PTS-STARTPTS[v" + i + "]");
    } else parts.push("[" + at + ":v]setpts=PTS-STARTPTS[v" + i + "]");
    parts.push("[" + at + ":a]asetpts=PTS-STARTPTS[a" + i + "]");
  });
  const graph = parts.join(";") + ";" + pieces.map((p, i) => "[v" + i + "][a" + i + "]").join("") + "concat=n=" + pieces.length + ":v=1:a=1[v][a]";
  return args.concat(["-filter_complex", graph, "-map", "[v]", "-map", "[a]"]);
}

const ENCODE = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart"];

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => a.endsWith(".mp4"));
  const minAt = args.indexOf("--min");
  const min = minAt >= 0 ? Number(args[minAt + 1]) : 4;
  if (!file || !fs.existsSync(file)) throw new Error("usage: node scripts/live-studio/cut.js <recording.mp4> [--min 4]");
  const meta = JSON.parse(fs.readFileSync(file + ".chapters.json", "utf8"));
  const dir = file.replace(/\.mp4$/, "-clips");
  fs.mkdirSync(dir, { recursive: true });
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const clips = [];
  const episodes = meta.episodes || [];
  const ever = evergreen(meta, dir);
  const flag = ever ? { evergreen: true } : {};
  studio.withEpisodes(meta.chapters, episodes).forEach((c, i) => {
    const p = piece(c, ever);
    if (!p || c.end - c.start < min) return;
    const name = String(i + 1).padStart(2, "0") + "-" + (c.viewer ? slug(c.title.split(" · ").pop()) + "-" : "") + c.scene + ".mp4";
    ff(joinArgs([p], file).concat(ENCODE, [path.join(dir, name)]));
    clips.push(Object.assign({ file: name, episode: c.episode, scene: c.scene, viewer: c.viewer, start: +c.start.toFixed(2), length: +p.len.toFixed(2), lang: meta.lang, voice: meta.voice, line: p.line }, flag));
  });
  const reels = studio.highlights(meta.chapters, episodes);
  reels.forEach(({ episode, scenes }) => {
    const reel = scenes.map((c) => ({ c, p: piece(c, ever) })).filter((x) => x.p);
    if (!reel.length) return;
    const name = reels.length > 1 ? "highlight-" + episode + ".mp4" : "highlight.mp4";
    ff(joinArgs(reel.map((x) => x.p), file).concat(ENCODE, [path.join(dir, name)]));
    clips.push(Object.assign({ file: name, episode, scene: "highlight", start: 0, length: +reel.reduce((n, x) => n + x.p.len, 0).toFixed(2), lang: meta.lang, voice: meta.voice,
      line: reel.map((x) => x.p.line).join(" "), scenes: reel.map((x) => x.c.scene) }, flag));
  });
  const metaFile = path.join(dir, "chapters.ffmeta");
  fs.writeFileSync(metaFile, studio.chapterMeta(meta.chapters));
  ff(["-i", file, "-i", metaFile, "-map_metadata", "1", "-map_chapters", "1", "-c", "copy", "-movflags", "+faststart", path.join(dir, "chapters.mp4")]);
  fs.writeFileSync(path.join(dir, "chapters.txt"), studio.chapterList(meta.chapters) + "\n");
  fs.writeFileSync(path.join(dir, "clips.json"), JSON.stringify({ recording: path.basename(file), episodes, lang: meta.lang, voice: meta.voice, trial: meta.trial || "", evergreen: !!ever, clips }, null, 1));
  const quiet = clips.filter((c) => !(peakDb(path.join(dir, c.file)) > -30));
  clips.forEach((c) => console.log(c.file.padEnd(40), c.length + " s"));
  console.log("wrote", clips.length, "clips to", dir);
  if (quiet.length) {
    console.error("peak not above -30 dB:", quiet.map((c) => c.file).join(", "));
    process.exitCode = 2;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { evergreen, piece, joinArgs };
