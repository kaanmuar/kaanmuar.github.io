#!/usr/bin/env node
// Share to post (#1420): turns one shared photo or video into a one-post batch under media/social-posts/inbox-*.
// Run by .github/workflows/social-inbox.yml with ID, MEDIA_URL, MEDIA_TYPE (image|video) and ENTRY (the reviewed
// captions.json entry from the jarvis function). The owner's video posts as-is in its own language (the social-clips
// rule's exception for shared videos), but a silent one fails here: its loudest peak must be above -30 dB.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const share = require("../functions/jarvis-share");

const FEED = [1080, 1350];
const STORY = [1080, 1920];
const MAX_SECONDS = 180;

function ffmpeg(args) {
  return execFileSync("ffmpeg", ["-hide_banner", "-y", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

// The media fitted inside the frame over a blurred, dimmed copy of itself filling it.
function backdrop(w, h) {
  return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40:2,eq=brightness=-0.12[bg];` +
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`;
}

function peak(file) {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(String(run.stderr || ""));
  return m ? Number(m[1]) : null;
}

function slugOf(title, id) {
  const words = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
  return "01-" + (words || String(id).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8));
}

function output(values) {
  const line = Object.entries(values).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
  process.stdout.write(line);
}

async function main() {
  const { ID, MEDIA_URL, MEDIA_TYPE, ENTRY } = process.env;
  if (!ID || !MEDIA_URL || !/^https:\/\/firebasestorage\.googleapis\.com\//.test(MEDIA_URL)) throw new Error("ID and a Firebase Storage MEDIA_URL are required.");
  const video = MEDIA_TYPE === "video";
  const entry = share.cleanDraft(JSON.parse(ENTRY || "{}"), "", video);
  const now = Date.now();
  const batch = share.batchName(ID, now);
  const slug = slugOf(entry.title, ID);
  const dir = path.join("media", "social-posts", batch);
  ["feed", "story", "clip"].forEach((d) => fs.mkdirSync(path.join(dir, d), { recursive: true }));

  const res = await fetch(MEDIA_URL);
  if (!res.ok) throw new Error(`The shared media did not download (${res.status}).`);
  const src = path.join(os.tmpdir(), `inbox-${ID}`);
  fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));

  let still = src;
  if (video) {
    const loudest = peak(src);
    if (loudest === null || loudest <= -30) {
      throw new Error(`The video is silent (loudest peak ${loudest === null ? "none, no audio track" : loudest + " dB"}); clips posted to video channels must be heard, above -30 dB.`);
    }
    still = path.join(os.tmpdir(), `inbox-${ID}.png`);
    ffmpeg(["-ss", "1", "-i", src, "-frames:v", "1", still]);
    if (!fs.existsSync(still)) ffmpeg(["-i", src, "-frames:v", "1", still]);
    ffmpeg(["-i", src, "-t", String(MAX_SECONDS), "-filter_complex", backdrop(...STORY), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", path.join(dir, "clip", slug + ".mp4")]);
  }
  ffmpeg(["-i", still, "-filter_complex", backdrop(...FEED), "-frames:v", "1", "-q:v", "3", path.join(dir, "feed", slug + ".jpg")]);
  ffmpeg(["-i", still, "-filter_complex", backdrop(...STORY), "-frames:v", "1", "-q:v", "3", path.join(dir, "story", slug + ".jpg")]);

  const captions = { [slug]: Object.assign({ date: share.bogota(now).date }, entry) };
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify(captions, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "calendar.csv"), share.calendar(slug, video, now, 30));
  output({ batch, slug, video: video ? "1" : "0" });
}

main().catch((error) => { console.error("::error::" + error.message); process.exit(1); });
