#!/usr/bin/env node
/* The live studio's runner (#3140): drives scripts/live-studio/show.html at 1080x1920, voices each scene, mixes the bed,
   records the show and can push it live to TikTok and Instagram over RTMP.

     node scripts/live-studio/run.js --episode hotel-high-season --lang en --record
         one episode, recorded to media/live-studio/recordings/<episode>-<lang>-<time>.mp4 (H.264 + AAC) with its
         chapters in <file>.chapters.json for cut.js
     node scripts/live-studio/run.js --loop --live tiktok,instagram --comments tiktok:@carlosandmunoz,stdin
         every episode in turn until Ctrl-C, recorded and streamed; a site address commented on stream is reviewed
         after the next "your turn" scene, once approved in this terminal (y or n; --auto-approve skips that)
     node scripts/live-studio/run.js --obs [--loop]
         no capture: serves the show for OBS's browser source (scripts/live-studio/obs.js writes the scene collection),
         which plays the voices and the bed itself
     node scripts/live-studio/run.js still [--episode id] [--scenes intro,score] [--lang en]
         one PNG per scene in media/live-studio/stills, for covers and review
     node scripts/live-studio/run.js evergreen --episode a,b (--voice-name <voice> | --voice carlos --lang xx) --out <dir>
         the evergreen call to action and ticker that cut.js splices into the clips of a live that showed a trial code
     node scripts/live-studio/run.js --list
     node scripts/live-studio/run.js translate [--lang es,pt] [--seed]
         every episode's strings through scripts/tips-studio/translate.py into scripts/live-studio/i18n (committed);
         a line in the wrong register (usted, du) stops it: fix it in i18n.json's cache by agent, then rerun with --seed

   --lang en|es|pt|de|fr|it and --voice w|m pick the session's one language and voice; without them the session takes the
   next turn of the six languages, a woman's voice then a man's (media/live-studio/turn.json), as the clips do.
   --voice carlos: Carlos speaks (no neural voice); the captions follow the script, the terminal shows the next line,
   and --mic <avfoundation device, e.g. :0> mixes his microphone over the bed.
   --live names RTMP targets read from env: TIKTOK_RTMP_URL + TIKTOK_RTMP_KEY, INSTAGRAM_RTMP_URL + INSTAGRAM_RTMP_KEY.
   A live (--live or --obs) opens with a free trial code of its own (scripts/live-studio/trial.js): shared by every viewer,
   one trial per address, valid for the show plus 24 hours (--hours, default 2 with --loop, else 1; --trial-uses caps it),
   shown as the QR and the link on the call to action and in the ticker, and logged in media/live-studio/lives.jsonl.
   --trial mints one for a recording too; --trial TRY-XXXXXX shows a code already minted; --no-trial and --coupon CODE
   leave the trial out, --coupon showing that code instead. A still shows a demo trial code.
   --fps 30; --port 8793; --headed shows the browser.
   A recording whose peak is not above -30 dB exits 2. After a live, scripts/live-studio/publish.js posts it (#3173). */

require("../playwright-sandbox");
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync, execFile } = require("child_process");
const { promisify } = require("util");
const studio = require("./studio");
const reviews = require("./review");
const comments = require("./comments");
const trial = require("./trial");

const run = promisify(execFile);
const { ROOT, OUT, UI } = studio;
const CACHE = path.join(OUT, "cache");
const I18N = path.join(__dirname, "i18n");
const LIVES = path.join(OUT, "lives.jsonl");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = FFMPEG.replace(/ffmpeg$/, "ffprobe");
const TTS_HOME = path.join(require("os").homedir(), ".local/share/review-tts");
const EDGE_TTS = process.env.EDGE_TTS || [path.join(TTS_HOME, "bin/edge-tts"), "/tmp/review-tts/bin/edge-tts", "edge-tts"]
  .find((bin) => spawnSync(bin, ["--version"]).status === 0);
const RATE = 44100;
const MIN_SCENE = { intro: 7, run: 9, score: 8, findings: 9, fix: 10, beforeafter: 7.5, ask: 7, cta: 8 };
const LEAD = 0.5;
const TAIL = 0.9;
const BED_GAIN = 0.3;
const BED_DUCK = 0.13;
const CARLOS_WPS = 2.5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const say = (...parts) => console.log("[studio]", ...parts);

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { opts._.push(arg); continue; }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return opts;
}

function findBed() {
  const rel = "media/url-review-demos/bed.wav";
  const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const found = [path.join(ROOT, rel), common && path.join(path.dirname(common), rel)].find((file) => file && fs.existsSync(file));
  if (found) return found;
  spawnSync("gh", ["release", "download", "studio-assets", "-p", "bed.wav", "-D", path.dirname(path.join(ROOT, rel))], { cwd: ROOT, stdio: "inherit" });
  if (fs.existsSync(path.join(ROOT, rel))) return path.join(ROOT, rel);
  throw new Error(rel + " is missing here and in the main checkout, and the studio-assets release download failed");
}

function probe(file) {
  return parseFloat(spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout) || 0;
}

function pcm(file) {
  const out = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-f", "s16le", "-ac", "2", "-ar", String(RATE), "-"], { maxBuffer: 1 << 30 });
  if (out.status !== 0) throw new Error("could not decode " + file);
  return new Int16Array(out.stdout.buffer, out.stdout.byteOffset, out.stdout.length / 2);
}

// --- Translation: the session's strings through translate.py, cached in media/live-studio/i18n ---

// The committed translations (scripts/live-studio/i18n, filled by `run.js translate` and fixed by agent) seed the runtime
// cache, so a session only sends a viewer's new strings to the translator.
function seedCache(dir) {
  const seed = path.join(I18N, "i18n.json");
  if (!fs.existsSync(seed)) return;
  const file = path.join(dir, "i18n.json");
  const done = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const committed = JSON.parse(fs.readFileSync(seed, "utf8"));
  done.cache = Object.assign({}, done.cache, committed.cache);
  if (committed.registerOk) done.registerOk = committed.registerOk;
  fs.writeFileSync(file, JSON.stringify(done, null, 1));
}

async function localize(lang, clips) {
  if (lang === "en") return { lang, ui: UI, clips };
  const dir = path.join(OUT, "i18n");
  fs.mkdirSync(dir, { recursive: true });
  seedCache(dir);
  const src = { ui: UI, clips: {} };
  Object.entries(clips).forEach(([slug, strings]) => { src.clips[slug] = { lang, strings }; });
  fs.writeFileSync(path.join(dir, "i18n-src.json"), JSON.stringify(src, null, 1));
  try {
    await run("python3", [path.join(ROOT, "scripts/tips-studio/translate.py"), dir], { cwd: ROOT, maxBuffer: 1 << 24 });
  } catch (error) {
    say("translate.py failed (" + String(error.stderr || error.message).trim().split("\n").pop() + "); the session goes out in English");
    return null;
  }
  const done = JSON.parse(fs.readFileSync(path.join(dir, "i18n.json"), "utf8"));
  const out = { lang, ui: Object.assign({}, UI, done.ui && done.ui[lang]), clips: {} };
  for (const [slug, strings] of Object.entries(clips)) {
    const got = done.clips && done.clips[slug];
    if (!got || Object.keys(strings).some((k) => strings[k] && !got[k])) { say("translation of " + slug + " is incomplete; the session goes out in English"); return null; }
    out.clips[slug] = got;
  }
  return out;
}

// --- Voices: edge-tts lines cached by voice and text ---

async function speak(text, voice, table) {
  if (!text) throw new Error("a scene has no line to voice");
  if (!EDGE_TTS) throw new Error("edge-tts is missing; install it with: python3 -m venv " + TTS_HOME + " && " + TTS_HOME + "/bin/pip install edge-tts");
  const said = studio.sayAs(table, voice.lang, studio.spoken(voice.lang, text));
  const key = crypto.createHash("sha1").update(voice.voice + "\n" + said).digest("hex").slice(0, 16);
  const file = path.join(CACHE, "voice", key + ".mp3");
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (let tries = 0; ; tries++) {
      try {
        await run(EDGE_TTS, ["--voice", voice.voice, "--rate", "+4%", "--text", said, "--write-media", file]);
        break;
      } catch (error) {
        if (tries >= 2) throw new Error("edge-tts failed for " + voice.voice + ": " + (error.stderr || error.message));
        await sleep(1500);
      }
    }
  }
  return { file, dur: probe(file), url: "/" + path.relative(ROOT, file).split(path.sep).join("/") };
}

// --- The show server: static files and the server-sent events that drive show.html ---

function startServer(port, bed) {
  const clients = new Set();
  const last = {};
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".jpg": "image/jpeg",
    ".png": "image/png", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/live/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*" });
      ["init", "report", "queue", "scene"].forEach((fn) => { if (last[fn]) res.write("data: " + JSON.stringify(last[fn]) + "\n\n"); });
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    const isBed = url.pathname === "/live/bed.wav";
    const file = isBed ? bed : path.join(ROOT, decodeURIComponent(url.pathname));
    if (!(isBed || file.startsWith(ROOT + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "access-control-allow-origin": "*" });
    fs.createReadStream(file).pipe(res);
  });
  const send = (fn, ...args) => {
    const msg = { fn, args };
    if (fn === "init") { delete last.report; delete last.scene; }
    if (["init", "report", "queue", "scene"].includes(fn)) last[fn] = msg;
    const line = "data: " + JSON.stringify(msg) + "\n\n";
    clients.forEach((res) => res.write(line));
  };
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, send, clients })));
}

// --- Capture: the page's screencast and the mixed audio, both clocked by the wall clock, into one ffmpeg ---

class Engine {
  constructor({ page, file, targets, fps, mic, bed }) {
    Object.assign(this, { page, file, targets, fps, mic, bed: bed ? pcm(bed) : null });
    this.voice = null;
    this.gain = BED_GAIN;
    this.bedPos = 0;
    this.samples = 0;
    this.frames = 0;
    this.latest = null;
  }

  async start() {
    const args = ["-hide_banner", "-loglevel", "error", "-y",
      "-thread_queue_size", "1024", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(this.fps), "-i", "pipe:0",
      "-thread_queue_size", "1024", "-f", "s16le", "-ar", String(RATE), "-ac", "2", "-i", "pipe:3"];
    if (this.mic) args.push("-thread_queue_size", "1024", "-f", "avfoundation", "-i", this.mic);
    args.push("-filter_complex", "[0:v]format=yuv420p[v]" + (this.mic ? ";[2:a]aformat=channel_layouts=stereo,aresample=" + RATE + "[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]" : ";[1:a]anull[a]"),
      "-map", "[v]", "-map", "[a]");
    args.push(...studio.outputArgs(this.file, this.targets, this.fps));
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.ff = spawn(FFMPEG, args, { stdio: ["pipe", "inherit", "inherit", "pipe"] });
    this.exited = new Promise((resolve) => this.ff.on("close", resolve));
    this.ff.stdin.on("error", () => {});
    this.ff.stdio[3].on("error", () => {});
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
      this.latest = Buffer.from(data, "base64");
      this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
    while (!this.latest) await sleep(20);
    this.t0 = Date.now();
    this.videoTimer = setInterval(() => this.pumpVideo(), 1000 / this.fps / 2);
    this.audioTimer = setInterval(() => this.pumpAudio(), 20);
  }

  now() { return (Date.now() - this.t0) / 1000; }

  pumpVideo() {
    const due = Math.floor(this.now() * this.fps) + 1;
    while (this.frames < due) { this.ff.stdin.write(this.latest); this.frames++; }
  }

  pumpAudio() {
    const due = Math.floor(this.now() * RATE);
    const n = due - this.samples;
    if (n <= 0) return;
    const out = new Int16Array(n * 2);
    const bed = this.bed;
    for (let i = 0; i < n; i++) {
      const v = this.voice;
      const talking = v && v.pos < v.pcm.length && this.samples + i >= v.at;
      this.gain += ((talking ? BED_DUCK : BED_GAIN) - this.gain) * 0.0004;
      for (let c = 0; c < 2; c++) {
        let s = bed ? bed[(this.bedPos + c) % bed.length] * this.gain : 0;
        if (talking) s += v.pcm[v.pos + c];
        out[i * 2 + c] = Math.max(-32768, Math.min(32767, s));
      }
      if (bed) this.bedPos = (this.bedPos + 2) % bed.length;
      if (talking) v.pos += 2;
    }
    this.samples = due;
    this.ff.stdio[3].write(Buffer.from(out.buffer));
  }

  play(file, delay) {
    this.voice = { pcm: pcm(file), pos: 0, at: Math.floor((this.now() + (delay || 0)) * RATE) };
  }

  async stop() {
    clearInterval(this.videoTimer);
    clearInterval(this.audioTimer);
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    this.ff.stdin.end();
    this.ff.stdio[3].end();
    return this.exited;
  }
}

function peakDb(file) {
  const out = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" });
  const m = (out.stderr || "").match(/max_volume: (-?[\d.]+) dB/);
  return m ? parseFloat(m[1]) : -Infinity;
}

// --- Sessions ---

function sessionVoice(opts, voices) {
  const named = opts["voice-name"] && voices.find((v) => v.voice === opts["voice-name"]);
  if (opts["voice-name"] && !named) throw new Error(opts["voice-name"] + " is not one of the studio's voices");
  if (named) return { lang: named.lang, carlos: false, voice: named, advance: () => {} };
  const turnFile = path.join(OUT, "turn.json");
  const turn = fs.existsSync(turnFile) ? JSON.parse(fs.readFileSync(turnFile, "utf8")).turn || 0 : 0;
  const auto = studio.turnVoice(turn);
  const lang = opts.lang || auto.lang;
  const carlos = opts.voice === "carlos";
  const gender = carlos ? "w" : opts.voice || (opts.lang ? "w" : auto.gender);
  if (!studio.LANGS.includes(lang)) throw new Error("--lang is one of " + studio.LANGS.join(", "));
  const advance = () => {
    if (opts.lang || opts.voice) return;
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(turnFile, JSON.stringify({ turn: turn + 1 }));
  };
  return { lang, carlos, voice: studio.pickVoice(voices, lang, gender), advance };
}

function livePlatform(opts) {
  return opts.platform || (opts.live && opts.live !== true ? String(opts.live).split(",")[0] : "live");
}

// The session's trial code: minted for a live, given with --trial CODE, a demo for stills, none with --coupon or --no-trial.
async function sessionTrial(opts, session, ids, still) {
  if (opts.coupon || opts["no-trial"]) return null;
  if (opts.trial && opts.trial !== true) return { code: String(opts.trial).toUpperCase() };
  if (still) return { code: trial.DEMO_CODE };
  if (!opts.live && !opts.obs && !opts.trial) return null;
  const platform = livePlatform(opts);
  const hours = Number(opts.hours) || (opts.loop ? 2 : 1);
  const name = ids.length === 1 ? studio.episode(ids[0]).title : "Live studio mix";
  try {
    const got = await trial.mintLive({ session: studio.liveSession(platform, ids), name, lang: session.lang, hours, uses: opts["trial-uses"] });
    say("trial code", got.code, "for", got.person, "until", got.validUntil, "(" + got.maxUses + " uses)");
    trial.logLive(LIVES, { event: "start", at: new Date().toISOString(), platform, lang: session.lang, episodes: ids, code: got.code, person: got.person, validUntil: got.validUntil, maxUses: got.maxUses });
    return got;
  } catch (error) {
    say("no trial code (" + error.message + "); the call to action shows the review page");
    return null;
  }
}

// One episode's plan: what show.html draws, and each scene's line, voice and length.
async function prepareEpisode(ep, session, table, opts) {
  const raw = reviews.liveReport(ep.report);
  const report = reviews.showReport(raw, "live");
  report.headline = studio.headline(raw);
  const picked = studio.pickFinding(ep, raw.fix || []);
  const en = studio.episodeStrings(ep, report, picked);
  const slug = ep.id;
  let loc = await localize(session.lang, { [slug]: en });
  if (!loc) loc = { lang: "en", ui: UI, clips: { [slug]: en } };
  if (loc.lang !== session.voice.lang) session.voice = studio.pickVoice(session.voices, loc.lang, session.voice.gender);
  const t = loc.clips[slug];
  const platform = livePlatform(opts);
  const link = session.trial ? studio.trialLink(session.trial.code, loc.lang, ep.id, platform) : null;
  const ever = !!session.evergreen;
  report.fix = report.fix.map((f, i) => Object.assign({}, f, { title: t["f" + i + "_title"] || f.title, evidence: t["f" + i + "_evidence"] || f.evidence }));
  report.headline = t.headline;
  report.log = reviews.runLog(report, loc.lang);
  const scenes = [];
  for (const id of studio.SCENES) {
    const line = id === "cta" && link ? t.say_cta_trial : id === "cta" && ever ? t.say_cta_evergreen : t["say_" + id];
    let voiced = null;
    if (session.carlos || session.silent) voiced = { dur: line.split(/\s+/).length / CARLOS_WPS };
    else voiced = await speak(line, session.voice, table);
    scenes.push({ id, line, voice: voiced, dur: Math.max(MIN_SCENE[id], LEAD + voiced.dur + TAIL) });
  }
  const presenter = session.carlos ? studio.PRESENTERS.carlos : { mark: "AI", name: session.voice.voice.replace(/^\w\w-\w\w-|Neural$/g, ""), role: loc.ui.aiVoice };
  const init = {
    lang: loc.lang, ui: loc.ui, scenes: studio.SCENES, presenter,
    episode: { id: ep.id, chip: t.chip, hook: [t.hook0, t.hook1], title: t.title },
    report,
    fix: { title: t.fixTitle, steps: ep.fix.steps.map((s, i) => t["step" + i] || s), before: ep.fix.before, after: ep.fix.after,
      metric: { label: t.metricLabel, before: t.metricBefore, after: t.metricAfter, unit: t.metricUnit } },
    qr: link ? link.url : studio.reviewLink(ep.id, ever ? "live-clip" : platform),
    trial: link ? { code: session.trial.code, short: link.short } : null,
    evergreen: ever,
    coupon: opts.coupon && opts.coupon !== true ? String(opts.coupon).toUpperCase() : "",
    bed: "/live/bed.wav"
  };
  return { ep, init, scenes, lang: loc.lang };
}

// The call to action and ticker a clip of a live posts instead of the show's own, which carried the live's trial code
// (#3254): the review page and "comment or DM for your free 2-day pass", which the outreach routines answer with a code
// of the person's own. Writes <out>/<episode>-cta.mp4 per episode (none when Carlos voiced the live), ticker.mp4 (the
// ticker band, one marquee loop) and evergreen.json, which cut.js reads.
async function renderEvergreen({ plans, page, send, bed, fps, session, opts }) {
  const dir = path.resolve(opts.out && opts.out !== true ? opts.out : path.join(OUT, "evergreen"));
  fs.mkdirSync(dir, { recursive: true });
  const record = async (file, plan, seconds, scene) => {
    send("init", plan.init);
    await sleep(800);
    const engine = new Engine({ page, file, targets: [], fps, mic: null, bed });
    await engine.start();
    if (scene) {
      send("scene", "cta", { line: scene.line, dur: scene.dur, speak: scene.voice.dur, lead: LEAD });
      if (scene.voice.file) engine.play(scene.voice.file, LEAD);
    }
    await sleep(seconds * 1000);
    await engine.stop();
  };
  const manifest = { lang: plans[0].lang, voice: session.carlos ? "carlos" : session.voice.voice, ticker: "ticker.mp4", cta: {} };
  if (!session.carlos) {
    for (const plan of plans) {
      const scene = plan.scenes.find((s) => s.id === "cta");
      const file = path.join(dir, plan.ep.id + "-cta.mp4");
      await record(file, plan, scene.dur, scene);
      manifest.cta[plan.ep.id] = { file: path.basename(file), dur: +scene.dur.toFixed(3), line: scene.line };
      say("evergreen", file);
    }
  }
  const full = path.join(dir, "ticker-full.mp4");
  await record(full, plans[plans.length - 1], studio.TICKER.loop + 1.2, null);
  const { y, h, loop } = studio.TICKER;
  const crop = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.6", "-t", String(loop), "-i", full, "-vf", "crop=1080:" + h + ":0:" + y,
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", path.join(dir, manifest.ticker)], { encoding: "utf8" });
  if (crop.status !== 0) throw new Error("ticker crop failed: " + crop.stderr);
  fs.rmSync(full, { force: true });
  fs.writeFileSync(path.join(dir, "evergreen.json"), JSON.stringify(manifest, null, 1));
  say("evergreen ticker", path.join(dir, manifest.ticker));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const command = opts._[0] || "show";
  if (opts.list) {
    studio.EPISODES.forEach((e) => console.log(e.id.padEnd(24), e.report.padEnd(14), e.title));
    return;
  }
  if (command === "translate") {
    const langs = opts.lang ? String(opts.lang).split(",") : studio.LANGS.filter((l) => l !== "en");
    const src = { ui: UI, clips: {} };
    for (const ep of studio.EPISODES) {
      const raw = reviews.liveReport(ep.report);
      const report = reviews.showReport(raw, "live");
      report.headline = studio.headline(raw);
      const strings = studio.episodeStrings(ep, report, studio.pickFinding(ep, raw.fix || []));
      langs.forEach((lang) => { src.clips[ep.id + "-" + lang] = { lang, strings }; });
    }
    fs.mkdirSync(I18N, { recursive: true });
    fs.writeFileSync(path.join(I18N, "i18n-src.json"), JSON.stringify(src, null, 1));
    const out = spawnSync("python3", [path.join(ROOT, "scripts/tips-studio/translate.py"), I18N].concat(opts.seed ? ["--seed"] : []), { cwd: ROOT, stdio: "inherit" });
    process.exitCode = out.status;
    return;
  }
  const { voices, sayAs: table } = studio.studioVoices();
  const session = sessionVoice(opts, voices);
  session.voices = voices;
  const fps = Number(opts.fps || 30);
  const port = Number(opts.port || 8793);
  const ids = opts.episode ? String(opts.episode).split(",") : opts.loop ? studio.EPISODES.map((e) => e.id) : [studio.EPISODES[0].id];
  const still = command === "still";
  const evergreen = command === "evergreen";
  if (still) session.silent = true;
  session.evergreen = evergreen;
  session.trial = evergreen ? null : await sessionTrial(opts, session, ids, still);

  say("session:", session.lang, session.carlos ? "Carlos speaks" : session.voice.voice, "· episodes:", ids.join(", "));
  const plans = [];
  for (const id of ids) plans.push(await prepareEpisode(studio.episode(id), session, table, opts));

  const bed = findBed();
  const { server, send, clients } = await startServer(port, bed);
  const showUrl = "http://127.0.0.1:" + port + "/scripts/live-studio/show.html?sse=/live/events";
  let browser = null;
  let page = null;
  if (!opts.obs) {
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: !opts.headed, args: ["--autoplay-policy=no-user-gesture-required", "--force-color-profile=srgb"] });
    page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(showUrl);
    await page.evaluate(() => document.fonts.ready);
  } else {
    say("OBS browser source:", showUrl + "&audio=1", "(1080x1920, 30 fps, control audio via OBS)");
    say("waiting for OBS to open the show…");
  }
  while (!clients.size) await sleep(100);

  if (still) {
    const dir = path.join(OUT, "stills");
    fs.mkdirSync(dir, { recursive: true });
    const want = opts.scenes ? String(opts.scenes).split(",") : studio.SCENES;
    for (const plan of plans) {
      send("init", plan.init);
      await sleep(800);
      for (const scene of plan.scenes.filter((s) => want.includes(s.id))) {
        send("scene", scene.id, { line: scene.line, dur: scene.dur, speak: scene.voice.dur });
        await sleep(Number(opts.hold || 4200));
        const file = path.join(dir, plan.ep.id + "-" + plan.lang + "-" + scene.id + ".png");
        await page.screenshot({ path: file });
        say("still", file);
      }
    }
    await browser.close();
    server.close();
    return;
  }

  if (evergreen) {
    await renderEvergreen({ plans, page, send, bed, fps, session, opts });
    await browser.close();
    server.close();
    return;
  }

  const targets = studio.rtmpTargets(opts.live && opts.live !== true ? String(opts.live).split(",") : [], process.env);
  const record = opts.record || targets.length;
  const stampName = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const file = opts.out && opts.out !== true ? path.resolve(opts.out) : path.join(OUT, "recordings", (opts.loop ? "live" : ids[0]) + "-" + plans[0].lang + "-" + stampName + ".mp4");
  let engine = null;
  if (record && page) {
    engine = new Engine({ page, file, targets, fps, mic: opts.mic && opts.mic !== true ? opts.mic : null, bed });
    send("init", plans[0].init);
    await sleep(600);
    await engine.start();
    say(targets.length ? "LIVE on " + targets.map((t) => t.name).join(" and ") + ", recording " + file : "recording " + file);
  }
  const t0 = Date.now();
  const clock = () => (engine ? engine.now() : (Date.now() - t0) / 1000);
  const chapters = [];

  // Viewer comments: approved addresses wait here until the next "your turn" scene.
  const queue = [];
  const seenUsers = new Set();
  const pending = [];
  let answer = null;
  const showQueue = () => send("queue", queue.map((q) => ({ user: q.user, host: q.host, state: q.state, label: q.state === "run" ? "reviewing" : "queued" })));
  const accept = (c) => {
    if (seenUsers.has(c.user) || queue.some((q) => q.host === c.host) || queue.length >= 6) return;
    seenUsers.add(c.user);
    queue.push(Object.assign(c, { state: "queued" }));
    say("queued", "@" + c.user, c.host);
    showQueue();
  };
  const askNext = () => {
    if (answer || !pending.length) return;
    const c = pending.shift();
    say("approve @" + c.user + " → " + c.host + " (" + c.from + ")? y/n");
    answer = (ok) => { answer = null; if (ok) accept(c); askNext(); };
  };
  const onComment = (c) => {
    if (opts["auto-approve"]) return accept(c);
    pending.push(c);
    askNext();
  };
  const stops = [];
  const sources = opts.comments && opts.comments !== true ? String(opts.comments).split(",") : [];
  if (sources.length && !sources.includes("stdin") && !opts["auto-approve"]) sources.push("stdin");
  for (const src of sources) {
    try {
      if (src.startsWith("tiktok:")) stops.push(await comments.tiktok(src.slice(7), onComment, say));
      else if (src === "instagram") stops.push(await comments.instagram(onComment, say));
      else if (src === "stdin") stops.push(comments.stdin(onComment, (ok) => answer && answer(ok)));
    } catch (error) {
      say("comments from " + src + " are off:", error.message);
    }
  }

  let stopping = false;
  process.on("SIGINT", () => { if (stopping) process.exit(130); stopping = true; say("finishing the current scene, then stopping (Ctrl-C again to quit now)"); });

  async function playScene(scene, viewer) {
    const start = clock();
    send("scene", scene.id, { line: scene.line, dur: scene.dur, speak: scene.voice.dur, lead: LEAD, audio: opts.obs && scene.voice.url ? scene.voice.url : "" });
    if (engine && scene.voice.file) engine.play(scene.voice.file, LEAD);
    if (session.carlos) say("SAY:", scene.line);
    await sleep(scene.dur * 1000);
    const title = (viewer ? "@" + viewer + " · " + scene.title : scene.title) + " · " + studio.SCENE_TITLES[scene.id];
    chapters.push({ scene: scene.id, title, start, end: clock(), line: scene.line, viewer: viewer || "" });
  }

  async function voiced(strings, key, slug) {
    let loc = await localize(session.voice.lang, { [slug]: strings });
    if (!loc) loc = { clips: { [slug]: strings } };
    const t = loc.clips[slug];
    const line = t[key];
    const v = session.carlos ? { dur: line.split(/\s+/).length / CARLOS_WPS } : await speak(line, session.voice, table);
    return { t, line, voice: v };
  }

  async function viewerSegment(item, plan) {
    item.state = "run";
    showQueue();
    let report = null;
    const known = reviews.findByHost(item.host);
    if (known) {
      report = reviews.showReport(known, "live");
      report.log = reviews.runLog(report, session.voice.lang);
    }
    else if (process.env.LIVE_REVIEW_EMAIL) {
      const intro = await voiced({ say_intro: studio.viewerStrings(item.user, { host: item.host, fix: [] }).say_intro }, "say_intro", "intro-" + item.host);
      send("report", { host: item.host, name: item.host, pages: 20, areas: [], fix: [], source: "run", liveLog: true, log: [] }, item.user);
      const started = clock();
      const runScene = { id: "run", title: item.host, line: intro.line, voice: intro.voice, dur: Math.max(MIN_SCENE.run, intro.voice.dur + TAIL) };
      const running = reviews.runReview(item.url, (text) => send("log", text)).catch((error) => { say("review of", item.host, "failed:", error.message); return null; });
      send("scene", "run", { line: intro.line, dur: 180, speak: intro.voice.dur, lead: LEAD, audio: opts.obs && intro.voice.url ? intro.voice.url : "" });
      if (engine && intro.voice.file) engine.play(intro.voice.file, LEAD);
      report = await running;
      chapters.push({ scene: "run", title: "@" + item.user + " · " + runScene.title + " · " + studio.SCENE_TITLES.run, start: started, end: clock(), line: intro.line, viewer: item.user });
    }
    if (!report) {
      const q = await voiced(studio.queuedStrings(item.user, item.host), "say_queued", "queued-" + item.host);
      send("init", plan.init);
      await playScene({ id: "cta", title: item.host, line: q.line, voice: q.voice, dur: Math.max(MIN_SCENE.cta, q.voice.dur + TAIL) }, item.user);
      item.state = "done";
      queue.splice(queue.indexOf(item), 1);
      showQueue();
      return;
    }
    const strings = studio.viewerStrings(item.user, report);
    const slug = "viewer-" + item.host;
    let loc = await localize(session.voice.lang, { [slug]: strings });
    const t = loc ? loc.clips[slug] : strings;
    report.fix = report.fix.map((f, i) => Object.assign({}, f, { title: t["f" + i + "_title"] || f.title, evidence: t["f" + i + "_evidence"] || f.evidence }));
    send("report", report, item.user);
    const ids = known ? ["run", "score", "findings"] : ["score", "findings"];
    for (const id of ids) {
      const line = t["say_" + (id === "run" ? "intro" : id)];
      const v = session.carlos ? { dur: line.split(/\s+/).length / CARLOS_WPS } : await speak(line, session.voice, table);
      await playScene({ id, title: item.host, line, voice: v, dur: Math.max(MIN_SCENE[id], LEAD + v.dur + TAIL) }, item.user);
    }
    item.state = "done";
    queue.splice(queue.indexOf(item), 1);
    showQueue();
    send("init", plan.init);
  }

  let round = 0;
  do {
    for (const plan of plans) {
      if (stopping) break;
      send("init", plan.init);
      showQueue();
      await sleep(400);
      for (const scene of plan.scenes) {
        if (stopping && scene.id !== "cta") continue;
        await playScene(Object.assign({ title: plan.ep.chip }, scene));
        if (scene.id === "ask") for (let n = 0; n < 2 && queue.length && !stopping; n++) await viewerSegment(queue[0], plan);
      }
    }
    round++;
  } while (opts.loop && !stopping);
  send("end");

  stops.forEach((stop) => { try { stop(); } catch (error) { /* already closed */ } });
  if (engine) {
    await sleep(800);
    await engine.stop();
    const meta = { file, episodes: ids, lang: plans[0].lang, voice: session.carlos ? "carlos" : session.voice.voice, fps, rounds: round, trial: session.trial ? session.trial.code : "", chapters };
    fs.writeFileSync(file + ".chapters.json", JSON.stringify(meta, null, 1));
    fs.writeFileSync(file + ".chapters.txt", studio.chapterList(chapters) + "\n");
    const peak = peakDb(file);
    say("wrote", file, "(" + probe(file).toFixed(1) + " s, peak " + peak + " dB)");
    if (!session.carlos || !opts.mic) {
      if (!(peak > -30)) { say("the recording's peak is not above -30 dB"); process.exitCode = 2; }
    }
  }
  if (session.trial && session.trial.person) {
    const uses = await trial.closeLive(session.trial.person).catch((error) => { say("trial uses not read (" + error.message + ")"); return null; });
    trial.logLive(LIVES, { event: "end", at: new Date().toISOString(), code: session.trial.code, person: session.trial.person, uses, file: engine ? file : "" });
    say("trial", session.trial.code, "claimed", uses == null ? "?" : uses, "times");
  }
  session.advance();
  if (browser) await browser.close();
  server.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
