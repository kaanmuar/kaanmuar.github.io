/* FFmpeg Reels loop from the four audit carousel stills (#3498).
   Feed-sized slides (1080×1350) sit on a blurred 9:16 backdrop with soft crossfades and the
   launch bed under them — never a mute 7s gauge cut. Voiced clip/ stays the long video product;
   this reel/ asset is additive for mute-friendly scroll and Instagram REELS fallback. */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const W = 1080;
const H = 1920;
const FPS = 30;
/** Seconds each slide is held before the crossfade starts. */
const HOLD = 3.5;
/** Crossfade between slides; total length is 4×HOLD − 3×XFADE ≈ 12.8s. */
const XFADE = 0.4;
const SLIDES = 4;

function totalLength(n = SLIDES, hold = HOLD, xfade = XFADE) {
  if (n < 1) return 0;
  return n * hold - Math.max(0, n - 1) * xfade;
}

/** Blurred fill + centered slide, matching social-inbox backdrop convention. */
function padSlide(index, label) {
  return "[" + index + ":v]scale=" + W + ":" + H + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H
    + ",boxblur=40:2,eq=brightness=-0.12[bg" + index + "];"
    + "[" + index + ":v]scale=" + W + ":" + H + ":force_original_aspect_ratio=decrease[fg" + index + "];"
    + "[bg" + index + "][fg" + index + "]overlay=(W-w)/2:(H-h)/2,fps=" + FPS
    + ",format=yuv420p,setsar=1,settb=AVTB[" + label + "]";
}

function filterComplex(n, length, hold = HOLD, xfade = XFADE) {
  const pads = [];
  for (let i = 0; i < n; i += 1) pads.push(padSlide(i, "s" + i));
  const fades = [];
  let last = "s0";
  for (let i = 1; i < n; i += 1) {
    const out = i === n - 1 ? "v" : "x" + i;
    const offset = (i * hold - i * xfade).toFixed(3);
    fades.push("[" + last + "][s" + i + "]xfade=transition=fade:duration=" + xfade + ":offset=" + offset + "[" + out + "]");
    last = out;
  }
  if (n === 1) fades.push("[s0]null[v]");
  const bed = n;
  const audio = "[" + bed + ":a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.16,"
    + "afade=t=in:d=0.8,afade=t=out:st=" + Math.max(0, length - 1.2).toFixed(3) + ":d=1.2,"
    + "atrim=0:" + length.toFixed(3) + ",loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[a]";
  return pads.concat(fades, [audio]).join(";");
}

function ffmpegArgs(slides, bed, out, opts = {}) {
  const list = (slides || []).slice(0, SLIDES);
  if (list.length < 2) throw new Error("carousel reel needs at least 2 slides");
  const hold = opts.hold == null ? HOLD : opts.hold;
  const xfade = opts.xfade == null ? XFADE : opts.xfade;
  const length = totalLength(list.length, hold, xfade);
  const inputs = [];
  for (const file of list) inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(hold), "-i", file);
  inputs.push("-stream_loop", "-1", "-i", bed);
  return ["-y", "-hide_banner", "-loglevel", "error"].concat(inputs, [
    "-filter_complex", filterComplex(list.length, length, hold, xfade),
    "-map", "[v]", "-map", "[a]", "-t", length.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out
  ]);
}

function peakOf(file, ffmpeg = FFMPEG) {
  const run = spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(String(run.stderr || ""));
  return m ? Number(m[1]) : null;
}

function encodeCarouselReel(slides, bed, out, opts = {}) {
  const ffmpeg = opts.ffmpeg || FFMPEG;
  const args = ffmpegArgs(slides, bed, out, opts);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const run = (opts.spawn || spawnSync)(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error("ffmpeg carousel reel failed for " + out + ": " + (run.stderr || run.error || ""));
  const peak = peakOf(out, ffmpeg);
  if (!(peak > -30)) throw new Error("carousel reel " + out + " is silent (peak " + peak + " dB); never post a muted clip");
  return { out, length: totalLength((slides || []).slice(0, SLIDES).length), peak };
}

module.exports = {
  FFMPEG, W, H, FPS, HOLD, XFADE, SLIDES,
  totalLength, filterComplex, ffmpegArgs, encodeCarouselReel, peakOf
};
