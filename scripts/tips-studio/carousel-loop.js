#!/usr/bin/env node
/* Four feed carousel stills → one 9:16 Reels loop under the launch bed (#3498).
   Additive to the voiced 30–55s clip product; not a mute 7s gauge loop (refused on #3475).
   Usage: node scripts/tips-studio/carousel-loop.js <out.mp4> <slide.jpg>... --bed <bed.wav> */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const W = 1080;
const H = 1920;
const FPS = 30;
/** Hold each carousel still this long; four slides ≈ 14s (Reels allow 3–90s). */
const SLIDE_SEC = 3.5;

function ffmpegBin(bin) {
  if (bin) return bin;
  return fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
}

/** Fit a 4:5 feed still into 9:16 over a blurred, dimmed copy of itself (same idea as social-inbox). */
function slideGraph(i) {
  return "[" + i + ":v]scale=" + W + ":" + H + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H +
    ",boxblur=40:2,eq=brightness=-0.12[bg" + i + "];" +
    "[" + i + ":v]scale=" + W + ":" + H + ":force_original_aspect_ratio=decrease[fg" + i + "];" +
    "[bg" + i + "][fg" + i + "]overlay=(W-w)/2:(H-h)/2,fps=" + FPS + ",format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v" + i + "]";
}

function filterComplex(n, length) {
  const parts = [];
  for (let i = 0; i < n; i += 1) parts.push(slideGraph(i));
  parts.push(Array.from({ length: n }, (_, i) => "[v" + i + "]").join("") + "concat=n=" + n + ":v=1:a=0[v]");
  parts.push("[" + n + ":a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.16," +
    "afade=t=in:d=0.8,afade=t=out:st=" + (length - 1.2).toFixed(3) + ":d=1.2," +
    "atrim=0:" + length.toFixed(3) + ",loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[a]");
  return parts.join(";");
}

function durationFor(slideCount, slideSec = SLIDE_SEC) {
  return Number(slideCount) * slideSec;
}

function peakOf(ffmpeg, file) {
  const run = spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(String(run.stderr || ""));
  return m ? Number(m[1]) : null;
}

function encodeCarouselLoop(slides, out, opts = {}) {
  const files = (slides || []).filter((f) => f && fs.existsSync(f));
  if (files.length < 2) return null;
  const bed = opts.bed;
  if (!bed || !fs.existsSync(bed)) throw new Error("carousel loop needs the launch bed wav (#3498)");
  const ffmpeg = ffmpegBin(opts.ffmpeg);
  const slideSec = opts.slideSec || SLIDE_SEC;
  const length = durationFor(files.length, slideSec);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const inputs = [];
  for (const file of files) {
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(slideSec), "-i", file);
  }
  inputs.push("-stream_loop", "-1", "-i", bed);

  const args = ["-y", "-hide_banner", "-loglevel", "error"].concat(inputs, [
    "-filter_complex", filterComplex(files.length, length),
    "-map", "[v]", "-map", "[a]", "-t", length.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out
  ]);
  const run = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error("ffmpeg carousel loop failed: " + (run.stderr || String(run.error || "")));
  const peak = peakOf(ffmpeg, out);
  if (!(peak > -30)) throw new Error("carousel loop is silent (peak " + peak + " dB); never post a muted clip");
  return { file: out, length, slides: files.length, peak };
}

function parseArgs(argv) {
  const bedAt = argv.indexOf("--bed");
  let bed = null;
  const rest = argv.slice();
  if (bedAt >= 0) {
    bed = rest[bedAt + 1];
    rest.splice(bedAt, 2);
  }
  return { out: rest[0], slides: rest.slice(1), bed };
}

if (require.main === module) {
  const { out, slides, bed } = parseArgs(process.argv.slice(2));
  if (!out || slides.length < 2 || !bed) {
    console.error("usage: node scripts/tips-studio/carousel-loop.js <out.mp4> <slide.jpg>... --bed <bed.wav>");
    process.exit(2);
  }
  const result = encodeCarouselLoop(slides, path.resolve(out), { bed: path.resolve(bed) });
  console.log(JSON.stringify(result));
}

module.exports = { encodeCarouselLoop, filterComplex, durationFor, peakOf, SLIDE_SEC, W, H, FPS };
