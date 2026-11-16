const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const reel = require("../../scripts/tips-studio/carousel-reel");

test("carousel reel length is four holds minus three crossfades (~12.8s), not a 7s mute cut (#3498)", () => {
  assert.equal(reel.totalLength(), 4 * reel.HOLD - 3 * reel.XFADE);
  assert.ok(reel.totalLength() > 10);
  assert.ok(reel.totalLength() < 20);
  assert.notEqual(reel.totalLength(), 7);
});

test("ffmpeg args pad each feed slide onto 9:16, xfade, and loop the bed (#3498)", () => {
  const slides = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
  const args = reel.ffmpegArgs(slides, "bed.wav", "out.mp4");
  assert.ok(args.includes("-filter_complex"));
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /1080:1920/);
  assert.match(graph, /boxblur/);
  assert.match(graph, /xfade=transition=fade/);
  assert.match(graph, /loudnorm/);
  assert.equal((graph.match(/xfade=/g) || []).length, 3);
  assert.ok(args.includes("-stream_loop"));
  assert.ok(args.includes("bed.wav"));
  assert.equal(args[args.length - 1], "out.mp4");
  assert.equal(args.filter((a) => a === "-i").length, 5);
});

test("fewer than two slides refuse to encode", () => {
  assert.throws(() => reel.ffmpegArgs(["only.jpg"], "bed.wav", "out.mp4"), /at least 2/);
});

test("encodeCarouselReel writes an audible 9:16 mp4 from stills when ffmpeg and bed exist (#3498)", async () => {
  const ffmpeg = reel.FFMPEG;
  if (spawnSync(ffmpeg, ["-version"]).status !== 0) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carousel-reel-"));
  const bed = path.join(dir, "bed.wav");
  const makeBed = spawnSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ar", "48000", "-ac", "2", bed], { encoding: "utf8" });
  if (makeBed.status !== 0) return;
  const slides = [1, 2, 3, 4].map((i) => {
    const file = path.join(dir, "s" + i + ".jpg");
    const color = ["red", "green", "blue", "yellow"][i - 1];
    const run = spawnSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "color=c=" + color + ":s=1080x1350", "-frames:v", "1", file], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    return file;
  });
  const out = path.join(dir, "reel.mp4");
  const done = reel.encodeCarouselReel(slides, bed, out, { hold: 0.6, xfade: 0.1 });
  assert.ok(fs.existsSync(out));
  assert.ok(done.peak > -30);
  const probe = spawnSync(ffmpeg.replace(/ffmpeg$/, "ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out], { encoding: "utf8" });
  assert.match(String(probe.stdout || ""), /1080,1920/);
  fs.rmSync(dir, { recursive: true, force: true });
});
