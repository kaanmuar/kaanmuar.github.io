#!/usr/bin/env node
/* After a live (#3173): one command turns a live studio recording into a social batch and adds its clips to the stock.

     node scripts/live-studio/publish.js media/live-studio/recordings/<file>.mp4 [--dry-run] [--keep] [--start YYYY-MM-DD]
       [--ticket n]

   1. Cuts the recording with cut.js unless <file>-clips/clips.json is there.
   2. Holds it to .cursor/rules/social-clips.mdc. An AI-voiced recording speaks one of the six languages in the studio's
      single-language voice of that language, and its language should be the six-language turn's (a warning names the
      turn when it is not). One Carlos voiced himself (run.js --voice carlos) is an owner share: his language, no turn.
      A highlight posts only when it runs MIN_S to MAX_S and peaks above -30 dB.
   3. Writes media/social-posts/live-<recording> in a throwaway worktree off origin/main, so the checkout it runs in is
      never switched: one post per episode's highlight, every caption, title and alt text in the recording's language
      (textLang, so no network puts an English caption on it), feed and story cards from the clip's hook frame (the show
      draws its text in that language) on a blurred backdrop, clip/<slug>.mp4, and a calendar slotted into the free
      lanes by social-calendar.js --write --batch.
   4. Uploads every clip (scenes, highlights, the chaptered recording) to the live-stock release and lists them in
      assets/social/live-stock.json (stock.js), each highlight with the batch post it became.
   5. Uploads the highlights to the batch's own prerelease and opens a studio/ PR. Merging it runs studio-render.yml's
      publish job: the release goes live and buffer-batch.yml queues TikTok, YouTube Shorts, LinkedIn, X and Instagram;
      the Facebook Page queue (facebook-page.yml, a Reel when the clip speaks the caption's language) and open-social.yml
      (Threads, Bluesky, Mastodon, Telegram, Instagram Reels) take it from main on their next runs.
   --dry-run does steps 1 to 3, runs buffer-queue.js and facebook-queue.js with --dry-run on the batch, and prints the
   stock rows; it uploads, pushes and opens nothing. --keep leaves the throwaway worktree for a look. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const studio = require("./studio");
const stock = require("./stock");

const ROOT = studio.ROOT;
const REPO = "kaanmuar/kaanmuar.github.io";
const SITE = studio.SITE;
const TICKET = 3173;
const MIN_S = 28;
const MAX_S = 57;
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FEED = [1080, 1350];
const STORY = [1080, 1920];
// Channels a post starts on; social-calendar.js moves the five networks to their lane's slot and the rest to that day.
const CHANNELS = [["linkedin", "09:00", "feed"], ["x", "12:00", "feed"], ["facebook", "13:00", "feed"], ["instagram-story", "15:00", "story"],
  ["instagram", "15:30", "feed"], ["youtube", "18:00", "clip"], ["tiktok", "19:00", "clip"]];
const TAGS = "#QA #WebPerformance #SEO #Accessibility #LiveReview #QAlab";

// The few words a live post adds around the show's own lines, written by agent: tú, você and tu, but Sie and vous.
const PHRASES = {
  en: { live: "Recorded live on the QA-lab show: a real site reviewed, and its fix walked through.", review: "Review your site", bio: "Link in bio.", alt: "Clip from the QA-lab live show" },
  es: { live: "Grabado en vivo en el show de QA-lab: revisamos un sitio real y explicamos la corrección paso a paso.", review: "Revisa tu sitio", bio: "Enlace en la bio.", alt: "Clip del show en vivo de QA-lab" },
  pt: { live: "Gravado ao vivo no show do QA-lab: um site real revisado e a correção explicada passo a passo.", review: "Revise o seu site", bio: "Link na bio.", alt: "Clipe do show ao vivo do QA-lab" },
  de: { live: "Live aufgezeichnet in der QA-lab-Show: eine echte Website geprüft und die Korrektur Schritt für Schritt erklärt.", review: "Prüfen Sie Ihre Website", bio: "Link in der Bio.", alt: "Clip aus der QA-lab-Live-Show" },
  fr: { live: "Enregistré en direct dans l'émission QA-lab : un vrai site analysé et sa correction expliquée pas à pas.", review: "Analysez votre site", bio: "Lien en bio.", alt: "Extrait de l'émission en direct QA-lab" },
  it: { live: "Registrato dal vivo nello show di QA-lab: un sito reale analizzato e la correzione spiegata passo dopo passo.", review: "Analizza il tuo sito", bio: "Link in bio.", alt: "Clip dello show dal vivo di QA-lab" }
};

function cut(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  return head.slice(0, Math.max(head.lastIndexOf(" "), max * 0.6)).trimEnd() + "…";
}

const plain = (text) => String(text || "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// .cursor/rules/social-clips.mdc for a recording: { speaker: "ai" | "owner", lang }, or an error saying what breaks it.
function checkRule(meta, voices = studio.studioVoices().voices) {
  const lang = meta.lang;
  if (meta.voice === "carlos") return { speaker: "owner", lang };
  if (!studio.LANGS.includes(lang)) throw new Error("an AI-voiced live speaks one of " + studio.LANGS.join(", ") + "; this one is " + lang);
  if (/Multilingual/i.test(meta.voice)) throw new Error(meta.voice + " is multilingual; a clip speaks one single-language voice");
  const voice = voices.find((v) => v.voice === meta.voice);
  if (!voice) throw new Error(meta.voice + " is not one of the studio's voices (scripts/tips-studio/build.js)");
  if (voice.lang !== lang) throw new Error("the voice " + meta.voice + " speaks " + voice.lang + ", but the recording's captions are " + lang);
  return { speaker: "ai", lang };
}

// Why a highlight may not post, or "" when it may.
function unpostable(clip, peak) {
  if (!(clip.length >= MIN_S && clip.length <= MAX_S)) return clip.file + " runs " + clip.length + " s; a social clip runs " + MIN_S + " to " + MAX_S + " s";
  if (!(peak > -30)) return clip.file + " peaks at " + peak + " dB; a clip must be heard, above -30 dB";
  return "";
}

// An episode's title and hook in lang, as the show drew them (scripts/live-studio/i18n), English when it has none.
function episodeText(id, lang, i18n = readI18n()) {
  const ep = studio.episode(id);
  const t = lang === "en" ? null : (i18n.clips || {})[id + "-" + lang];
  return { title: plain((t && t.title) || ep.title), hook: plain([t ? t.hook0 : ep.hook[0], t ? t.hook1 : ep.hook[1]].join(" ")), translated: lang === "en" || !!t };
}

function readI18n() {
  const file = path.join(__dirname, "i18n", "i18n.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

const link = (net, batch, slug) => SITE + "/qa-review.html?utm_source=" + net + "&utm_medium=social&utm_campaign=" + batch + "&utm_content=" + slug;

// One captions.json entry: the highlight's post, every text in lang.
function caption({ batch, slug, lang, speaker, voice, episode, title, hook, score, date }) {
  const p = PHRASES[lang] || PHRASES.en;
  const body = [title + ".", score].filter(Boolean).join(" ");
  return {
    date, cat: "QA", kind: "live", lang, textLang: lang, voice: speaker === "owner" ? "carlos" : voice, episode,
    title: cut(hook, 80),
    alt: cut(p.alt + ": " + title + ". " + score, 200),
    linkedin: cut(hook + "\n\n" + body + "\n\n" + p.live + "\n\n" + p.review + ": " + link("linkedin", batch, slug) + "\n\n" + TAGS, 2800),
    x: cut(hook, 250 - 60) + "\n\n" + link("x", batch, slug) + "\n#QA #QAlab",
    instagram: cut(hook + "\n\n" + body + "\n\n" + p.live + "\n\n" + p.bio + "\n\n" + TAGS, 2000),
    facebook: cut(hook + "\n\n" + body + "\n\n" + p.live + "\n\n" + p.review + ": " + link("facebook", batch, slug) + "\n\n" + TAGS, 5000),
    tiktok: cut(hook + " " + p.review + ". #QA #LiveReview #TechTok #SDET #QAlab", 2000),
    youtubeTitle: cut(hook, 80) + " #Shorts",
    youtube: cut(body + "\n\n" + p.live + "\n\n" + p.review + ": " + link("youtube", batch, slug) + "\n\n" + TAGS + " #Shorts", 4500)
  };
}

function calendarCsv(slugs, start) {
  const day = (i) => new Date(Date.parse(start + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10);
  const rows = slugs.flatMap((slug, i) => CHANNELS.map(([ch, time, kind]) => [day(i), time, ch, slug, kind + "/" + slug + (kind === "clip" ? ".mp4" : ".jpg")]));
  return "Date,Time,Channel,Post,Asset\n" + rows.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])).map((r) => r.join(",")).join("\n") + "\n";
}

function bogotaDay(offset = 0) {
  return new Date(Date.now() - 5 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
}

function ff(args) {
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
}

function peak(file) {
  const out = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" });
  const m = (out.stderr || "").match(/max_volume:\s*(-?[\d.]+) dB/);
  return m ? Number(m[1]) : -Infinity;
}

function backdrop(w, h) {
  return `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40:2,eq=brightness=-0.12[bg];` +
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, Object.assign({ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }, opts)).trim();
}

function tryGh(args) {
  try { return sh("gh", args); } catch { return null; }
}

function parseArgs(argv) {
  const opts = { file: argv.find((a) => a.endsWith(".mp4")) };
  argv.forEach((a, i) => { if (a.startsWith("--")) opts[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") && !argv[i + 1].endsWith(".mp4") ? argv[i + 1] : true; });
  return opts;
}

// The cut recording: cut.js's clips.json, cutting first when there is none.
function cutRecording(file) {
  const dir = file.replace(/\.mp4$/, "-clips");
  if (!fs.existsSync(path.join(dir, "clips.json"))) {
    const done = spawnSync(process.execPath, [path.join(__dirname, "cut.js"), file], { stdio: "inherit" });
    if (done.status === 1) throw new Error("cut.js failed on " + file);
  }
  return { dir, cut: JSON.parse(fs.readFileSync(path.join(dir, "clips.json"), "utf8")) };
}

// The batch's posts in dir: clip, cards, captions and calendar. Returns { posts: [{ slug, clip }], skipped }.
function writeBatch({ dir, batch, cut: c, clipsDir, rule, start, peaks }) {
  ["feed", "story", "clip"].forEach((d) => fs.mkdirSync(path.join(dir, d), { recursive: true }));
  const i18n = readI18n();
  const captions = {};
  const posts = [];
  const skipped = [];
  c.clips.filter((x) => x.scene === "highlight").forEach((clip) => {
    const why = unpostable(clip, peaks[clip.file]);
    if (why) return skipped.push(why);
    const text = episodeText(clip.episode, rule.lang, i18n);
    if (!text.translated) return skipped.push(clip.file + ": " + clip.episode + " has no " + rule.lang + " title in scripts/live-studio/i18n (run.js translate)");
    const slug = String(posts.length + 1).padStart(2, "0") + "-" + clip.episode + "-" + rule.lang;
    const src = path.join(clipsDir, clip.file);
    fs.copyFileSync(src, path.join(dir, "clip", slug + ".mp4"));
    const still = path.join(os.tmpdir(), "live-" + slug + "-" + process.pid + ".png");
    ff(["-ss", "2.5", "-i", src, "-frames:v", "1", still]);
    ff(["-i", still, "-filter_complex", backdrop(...FEED), "-frames:v", "1", "-q:v", "3", path.join(dir, "feed", slug + ".jpg")]);
    ff(["-i", still, "-filter_complex", backdrop(...STORY), "-frames:v", "1", "-q:v", "3", path.join(dir, "story", slug + ".jpg")]);
    fs.rmSync(still, { force: true });
    const score = (c.clips.find((x) => x.episode === clip.episode && x.scene === "score" && !x.viewer) || {}).line || "";
    captions[slug] = caption({ batch, slug, lang: rule.lang, speaker: rule.speaker, voice: c.voice, episode: clip.episode, title: text.title, hook: text.hook, score, date: start });
    posts.push({ slug, clip });
  });
  if (posts.length) {
    fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify(captions, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, "calendar.csv"), calendarCsv(posts.map((p) => p.slug), start));
  }
  return { posts, skipped };
}

function runIn(wt, script, args, env = {}) {
  const done = spawnSync(process.execPath, [path.join(wt, script), ...args], {
    cwd: wt, encoding: "utf8", env: Object.assign({}, process.env, { NODE_PATH: path.join(ROOT, "node_modules") }, env)
  });
  return { ok: done.status === 0, out: ((done.stdout || "") + (done.stderr || "")).trim() };
}

function release(tag) {
  const raw = tryGh(["api", "repos/" + REPO + "/releases/tags/" + tag]);
  return raw ? JSON.parse(raw) : null;
}

function upload(tag, files, notes, prerelease) {
  if (release(tag)) sh("gh", ["release", "upload", tag, ...files, "--clobber", "-R", REPO]);
  else sh("gh", ["release", "create", tag, ...files, "-R", REPO, "--target", "main", "--latest=false", "--title", tag, "--notes", notes].concat(prerelease ? ["--prerelease"] : []));
}

function prBody({ batch, rule, posts, cut: c, ticket }) {
  const clip = (p) => "- [" + p.slug + ".mp4](https://github.com/" + REPO + "/releases/download/" + batch + "/" + p.slug + ".mp4) (" + p.clip.length + " s)";
  return [
    "Live studio recording `" + c.recording + "` into `media/social-posts/" + batch + "`: " + posts.length + " post(s) in " + rule.lang +
      (rule.speaker === "owner" ? ", voiced by Carlos (owner share: his language, no six-language turn)" : ", voiced by " + c.voice) + ".",
    "",
    "Ticket: #" + ticket + ".",
    "",
    "## Review",
    posts.map(clip).join("\n"),
    "",
    "Every clip of the recording is in the [" + stock.RELEASE + " release](https://github.com/" + REPO + "/releases/tag/" + stock.RELEASE + ") and `" + stock.MANIFEST + "`.",
    "Merging makes the clips live and queues the batch in Buffer (studio-render.yml, publish); the Facebook Page and open-social queues take it from main.",
    "",
    "<!-- studio-render " + JSON.stringify({ kind: "live", name: c.episodes.join(","), mode: "render", batch, ticket: String(ticket) }) + " -->"
  ].join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dry = !!opts["dry-run"];
  if (!opts.file || !fs.existsSync(opts.file)) throw new Error("usage: node scripts/live-studio/publish.js <recording.mp4> [--dry-run] [--keep] [--start YYYY-MM-DD] [--ticket n]");
  const file = path.resolve(opts.file);
  const meta = JSON.parse(fs.readFileSync(file + ".chapters.json", "utf8"));
  const rule = checkRule(meta);
  const { dir: clipsDir, cut: c } = cutRecording(file);
  c.episodes = c.episodes && c.episodes.length ? c.episodes : meta.episodes || [];
  const recorded = fs.statSync(file).mtime.toISOString();
  const batch = "live-" + slugify(path.basename(file, ".mp4"));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(opts.start || "") ? opts.start : bogotaDay(1);
  const ticket = Number(opts.ticket) || TICKET;
  const peaks = Object.fromEntries(c.clips.map((x) => [x.file, peak(path.join(clipsDir, x.file))]));

  const current = stock.read();
  if (rule.speaker === "ai" && stock.nextLang(current) !== rule.lang) {
    console.log("warning: the six-language turn is at " + stock.nextLang(current) + "; this live speaks " + rule.lang + " (run.js without --lang keeps the turn)");
  }

  sh("git", ["-C", ROOT, "fetch", "-q", "origin", "main"]);
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "live-publish-"));
  sh("git", ["-C", ROOT, "worktree", "add", "-q", "--detach", wt, "origin/main"]);
  let branch = "";
  try {
    const out = path.join(wt, "media/social-posts", batch);
    if (fs.existsSync(path.join(out, "captions.json"))) throw new Error(batch + " is already on main; its posts may be queued");
    const { posts, skipped } = writeBatch({ dir: out, batch, cut: c, clipsDir, rule, start, peaks });
    skipped.forEach((why) => console.log("not posted: " + why));
    if (posts.length) {
      const cal = runIn(wt, "scripts/social-calendar.js", ["--write", "--from", start, "--batch", batch]);
      if (!cal.ok) throw new Error("social-calendar.js failed:\n" + cal.out);
    }
    const postOf = Object.fromEntries(posts.map((p) => [p.clip.file, batch + "/" + p.slug]));
    const rows = stock.rows(c, { recorded, peaks, posts: postOf });
    stock.write(stock.merge(stock.read(wt), rows), wt);

    console.log("batch " + batch + ": " + posts.length + " post(s) in " + rule.lang + " (" + (rule.speaker === "owner" ? "owner share, Carlos's voice" : c.voice) + ")");
    if (posts.length) console.log(fs.readFileSync(path.join(out, "calendar.csv"), "utf8").trim());
    console.log("stock: " + rows.length + " clips -> " + stock.RELEASE + " release, " + stock.MANIFEST);
    rows.forEach((r) => console.log("  " + [r.lang, r.speaker, r.episode, r.scene, r.duration == null ? "full" : r.duration + " s", r.file, r.post || "stock only"].join("  ")));

    const clipBase = "https://github.com/" + REPO + "/releases/download/" + batch;
    if (dry) {
      if (posts.length) {
        for (const [script, label] of [["scripts/buffer-queue.js", "Buffer"], ["scripts/facebook-queue.js", "Facebook Page"]]) {
          const r = runIn(wt, script, ["--batch", batch, "--dry-run"], { CLIP_BASE: clipBase });
          console.log("\n" + label + " dry run" + (r.ok ? "" : " (exit non-zero)") + ":\n" + r.out.split("\n").filter((l) => /dry-run|queued|failed|skip|error/i.test(l)).slice(0, 40).join("\n"));
        }
      }
      console.log("\ndry run: nothing uploaded, pushed or opened." + (opts.keep ? " Worktree kept at " + wt : ""));
      return;
    }

    const all = c.clips.map((x) => x.file).concat("chapters.mp4");
    const staged = fs.mkdtempSync(path.join(os.tmpdir(), "live-stock-"));
    const assets = all.map((f) => { const to = path.join(staged, stock.assetName(c.recording, f)); fs.copyFileSync(path.join(clipsDir, f), to); return to; });
    upload(stock.RELEASE, assets, "Live studio media stock (#" + TICKET + "): every clip cut from a live. Index: " + stock.MANIFEST + ".", false);
    fs.rmSync(staged, { recursive: true, force: true });
    if (posts.length) upload(batch, posts.map((p) => path.join(out, "clip", p.slug + ".mp4")), "Live studio clips of " + c.recording + " for review.", true);

    branch = "studio/render/" + batch + "-" + Date.now();
    const git = (args) => sh("git", ["-C", wt, ...args]);
    git(["checkout", "-q", "-b", branch]);
    // Forced: this Mac's .git/info/exclude ignores media/social-posts/, and story/ is gitignored but served. clip/ stays out.
    const keep = ["captions.json", "calendar.csv", "feed", "story"].filter((f) => fs.existsSync(path.join(out, f))).map((f) => "media/social-posts/" + batch + "/" + f);
    git(["add", "-f", "--", ...keep, stock.MANIFEST]);
    if (git(["branch", "--show-current"]) !== branch) throw new Error("the throwaway worktree is not on " + branch);
    const title = "Studio: live " + c.episodes.join(", ") + " (" + rule.lang + ") into " + batch;
    git(["commit", "-q", "-m", title]);
    git(["push", "-q", "origin", branch]);
    const pr = JSON.parse(sh("gh", ["api", "repos/" + REPO + "/pulls", "-f", "title=" + title, "-f", "head=" + branch, "-f", "base=main", "-f", "body=" + prBody({ batch, rule, posts, cut: c, ticket })]));
    console.log("opened " + pr.html_url + "; merging it publishes " + batch + ".");
  } finally {
    if (!opts.keep) {
      spawnSync("git", ["-C", ROOT, "worktree", "remove", "--force", wt]);
      fs.rmSync(wt, { recursive: true, force: true });
      if (branch) spawnSync("git", ["-C", ROOT, "branch", "-D", branch]);
    }
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { PHRASES, MIN_S, MAX_S, checkRule, unpostable, episodeText, caption, calendarCsv, prBody };
