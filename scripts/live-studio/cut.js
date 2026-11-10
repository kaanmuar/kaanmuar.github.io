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
  studio.withEpisodes(meta.chapters, episodes).forEach((c, i) => {
    const len = c.end - c.start;
    if (len < min) return;
    const name = String(i + 1).padStart(2, "0") + "-" + (c.viewer ? slug(c.title.split(" · ").pop()) + "-" : "") + c.scene + ".mp4";
    ff(["-ss", c.start.toFixed(3), "-i", file, "-t", len.toFixed(3)].concat(ENCODE, [path.join(dir, name)]));
    clips.push({ file: name, episode: c.episode, scene: c.scene, viewer: c.viewer, start: +c.start.toFixed(2), length: +len.toFixed(2), lang: meta.lang, voice: meta.voice, line: c.line });
  });
  const reels = studio.highlights(meta.chapters, episodes);
  reels.forEach(({ episode, scenes: reel }) => {
    const name = reels.length > 1 ? "highlight-" + episode + ".mp4" : "highlight.mp4";
    const inputs = [];
    reel.forEach((c) => inputs.push("-ss", c.start.toFixed(3), "-t", (c.end - c.start).toFixed(3), "-i", file));
    const graph = reel.map((c, i) => "[" + i + ":v][" + i + ":a]").join("") + "concat=n=" + reel.length + ":v=1:a=1[v][a]";
    ff(inputs.concat(["-filter_complex", graph, "-map", "[v]", "-map", "[a]"], ENCODE, [path.join(dir, name)]));
    clips.push({ file: name, episode, scene: "highlight", start: 0, length: +reel.reduce((n, c) => n + c.end - c.start, 0).toFixed(2), lang: meta.lang, voice: meta.voice,
      line: reel.map((c) => c.line).join(" "), scenes: reel.map((c) => c.scene) });
  });
  const metaFile = path.join(dir, "chapters.ffmeta");
  fs.writeFileSync(metaFile, studio.chapterMeta(meta.chapters));
  ff(["-i", file, "-i", metaFile, "-map_metadata", "1", "-map_chapters", "1", "-c", "copy", "-movflags", "+faststart", path.join(dir, "chapters.mp4")]);
  fs.writeFileSync(path.join(dir, "chapters.txt"), studio.chapterList(meta.chapters) + "\n");
  fs.writeFileSync(path.join(dir, "clips.json"), JSON.stringify({ recording: path.basename(file), episodes, lang: meta.lang, voice: meta.voice, clips }, null, 1));
  const quiet = clips.filter((c) => !(peakDb(path.join(dir, c.file)) > -30));
  clips.forEach((c) => console.log(c.file.padEnd(40), c.length + " s"));
  console.log("wrote", clips.length, "clips to", dir);
  if (quiet.length) {
    console.error("peak not above -30 dB:", quiet.map((c) => c.file).join(", "));
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
