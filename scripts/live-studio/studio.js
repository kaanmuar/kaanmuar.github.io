/* The live studio's pieces that need no browser (#3140): voices, the episode's strings, stream targets and chapters.
   run.js, cut.js and obs.js share them; tests/unit/live-studio.test.js checks them. */

const fs = require("fs");
const path = require("path");
const { EPISODES, LINES, UI, VIEWER, SCENES, SCENE_TITLES } = require("./episodes");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "media/live-studio");
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const SITE = "https://carlosandmunoz.com";
const PRESENTERS = { carlos: { mark: "CM", name: "Carlos Muñoz", role: "QA engineer" } };

// The tips studio's voice list and SAY_AS, read from its source so both studios speak with the same voices.
function studioVoices() {
  const src = fs.readFileSync(path.join(ROOT, "scripts/tips-studio/build.js"), "utf8");
  const list = new Function("return " + src.match(/const VOICES = (\[[\s\S]*?\])\.map/)[1])();
  const sayAs = new Function("return " + src.match(/const SAY_AS = (\{[\s\S]*?\n\});/)[1])();
  return { voices: list.map(([file, voice]) => ({ file, voice, lang: file.slice(0, 2), gender: file.slice(3) })), sayAs };
}

function sayAs(table, lang, text) {
  return (table[lang] || []).reduce((out, [term, said]) =>
    out.replace(new RegExp("(^|[^\\p{L}\\d])" + term.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&") + "(?![\\p{L}\\d])", "giu"), (m, before) => before + said), text);
}

const SLASH = { en: "slash", es: "barra", pt: "barra", de: "Schrägstrich", fr: "slash", it: "slash" };

// How a voice reads the review page's address, which captions show as written.
function spoken(lang, text) {
  return String(text).replace(/carlosandmunoz\.com\/qa-review/g, "carlosandmunoz.com " + (SLASH[lang] || SLASH.en) + " QA review");
}

// The language and voice of the turn-th session: six languages in turn, a woman's voice, then a man's.
function turnVoice(turn) {
  return { lang: LANGS[turn % LANGS.length], gender: Math.floor(turn / LANGS.length) % 2 ? "m" : "w" };
}

function pickVoice(voices, lang, gender) {
  const voice = voices.find((v) => v.file === lang + "-" + gender);
  if (!voice) throw new Error("No studio voice for " + lang + "-" + gender);
  if (/Multilingual/i.test(voice.voice)) throw new Error(voice.voice + " is multilingual; the studio speaks single-language voices only");
  return voice;
}

function episode(id) {
  const ep = EPISODES.find((e) => e.id === id);
  if (!ep) throw new Error("No episode " + id + "; one of " + EPISODES.map((e) => e.id).join(", "));
  return ep;
}

function fill(text, vals) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, key) => (vals[key] == null ? m : String(vals[key])));
}

function trimTitle(title) {
  return String(title || "").replace(/\.$/, "");
}

// Every English string a session of ep shows or speaks, keyed for translate.py; picked is the finding the fix explains.
function episodeStrings(ep, report, picked) {
  const vals = {
    host: report.host, name: report.name, score: report.overall, grade: report.grade, pages: report.pages, read: report.read,
    fails: report.fails, risks: report.risks, passes: report.passes,
    f1: trimTitle(report.fix[0] && report.fix[0].title), f2: trimTitle(report.fix[1] && report.fix[1].title), f3: trimTitle(report.fix[2] && report.fix[2].title)
  };
  const s = {
    chip: ep.chip, hook0: ep.hook[0], hook1: ep.hook[1], title: ep.title,
    say_intro: fill(ep.intro, vals), say_run: fill(LINES.run, vals), say_score: fill(LINES.score, vals), say_findings: fill(LINES.findings, vals),
    say_fix: fill(ep.fix.say, vals), say_beforeafter: fill(ep.beforeafter, vals), say_ask: fill(LINES.ask, vals), say_cta: fill(LINES.cta, vals),
    fixTitle: picked ? picked.title : "", metricLabel: ep.fix.metric.label, metricBefore: ep.fix.metric.before, metricAfter: ep.fix.metric.after,
    metricUnit: ep.fix.metric.unit, headline: report.headline || ""
  };
  ep.fix.steps.forEach((step, i) => { s["step" + i] = step; });
  report.fix.forEach((f, i) => { s["f" + i + "_title"] = f.title; s["f" + i + "_evidence"] = f.evidence; });
  return s;
}

// The strings a viewer's review speaks: its own intro, then the episode's score and findings lines.
function viewerStrings(user, report) {
  const vals = {
    user: "@" + user, host: report.host, score: report.overall, grade: report.grade, pages: report.pages,
    fails: report.fails, risks: report.risks, passes: report.passes,
    f1: trimTitle(report.fix[0] && report.fix[0].title), f2: trimTitle(report.fix[1] && report.fix[1].title), f3: trimTitle(report.fix[2] && report.fix[2].title)
  };
  const s = { say_intro: fill(VIEWER.intro, vals), say_score: fill(LINES.score, vals), say_findings: fill(LINES.findings, vals) };
  report.fix.forEach((f, i) => { s["f" + i + "_title"] = f.title; s["f" + i + "_evidence"] = f.evidence; });
  return s;
}

function queuedStrings(user, host) {
  return { say_queued: fill(VIEWER.queued, { user: "@" + user, host }) };
}

// The headline a Live Report draws as [{ t, em }], in the *em* form show.html styles.
function headline(report) {
  return Array.isArray(report.headline) ? report.headline.map((h) => (h.em ? "*" + h.t + "*" : h.t)).join(" ") : "";
}

// The finding whose title has ep.fix.pick, else the first one.
function pickFinding(ep, fixes) {
  const want = String(ep.fix.pick || "").toLowerCase();
  return fixes.find((f) => String(f.title).toLowerCase().includes(want)) || fixes[0] || null;
}

// RTMP outputs named in --live, from env: <NAME>_RTMP_URL and <NAME>_RTMP_KEY (TikTok LIVE Studio or a stream key,
// Instagram Live Producer). A missing pair is an error, so a show never goes out to half its platforms by surprise.
function rtmpTargets(names, env) {
  return names.filter(Boolean).map((name) => {
    const key = name.toUpperCase();
    const url = env[key + "_RTMP_URL"];
    const secret = env[key + "_RTMP_KEY"];
    if (!url || !secret) throw new Error("Set " + key + "_RTMP_URL and " + key + "_RTMP_KEY to stream to " + name);
    return { name, url: url.replace(/\/+$/, "") + "/" + secret.replace(/^\/+/, "") };
  });
}

function teeEscape(url) {
  return url.replace(/([\\|[\]])/g, "\\$1");
}

// ffmpeg's output arguments: one encode, written to the mp4 and pushed to each RTMP target. A stream that drops does not
// stop the recording.
function outputArgs(file, targets, fps) {
  const gop = String(fps * 2);
  const video = ["-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(fps),
    "-g", gop, "-keyint_min", gop, "-sc_threshold", "0"];
  const rate = targets.length ? ["-b:v", "6000k", "-maxrate", "6000k", "-bufsize", "12000k", "-tune", "zerolatency"] : ["-crf", "19", "-maxrate", "12M", "-bufsize", "24M"];
  const audio = ["-c:a", "aac", "-b:a", "160k", "-ar", "44100"];
  if (!targets.length) return video.concat(rate, audio, ["-movflags", "+faststart", file]);
  const tee = ["[f=mp4:movflags=+faststart]" + teeEscape(file)].concat(targets.map((t) => "[f=flv:onfail=ignore]" + teeEscape(t.url))).join("|");
  return video.concat(rate, audio, ["-flags", "+global_header", "-f", "tee", tee]);
}

function stamp(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// The chapters as ffmpeg metadata (embedded in the mp4) and as the "0:00 Title" list YouTube reads from a description.
function chapterMeta(chapters) {
  return ";FFMETADATA1\n" + chapters.map((c) => "[CHAPTER]\nTIMEBASE=1/1000\nSTART=" + Math.round(c.start * 1000) +
    "\nEND=" + Math.round(c.end * 1000) + "\ntitle=" + String(c.title).replace(/([=;#\\\n])/g, "\\$1") + "\n").join("");
}

function chapterList(chapters) {
  return chapters.map((c) => stamp(c.start) + " " + c.title).join("\n");
}

// The scenes a highlight reel keeps: the hook, the score, the fix and the call to action, dropping the score when
// that runs past max seconds, the longest a social clip runs.
function highlight(chapters, max = 55) {
  const picked = ["intro", "score", "fix", "cta"].map((id) => chapters.find((c) => c.scene === id && !c.viewer)).filter(Boolean);
  const total = picked.reduce((n, c) => n + (c.end - c.start), 0);
  return total > max ? picked.filter((c) => c.scene !== "score") : picked;
}

function reviewLink(episodeId, platform) {
  return SITE + "/qa-review.html?utm_source=" + encodeURIComponent(platform || "live") + "&utm_medium=live&utm_campaign=" + encodeURIComponent(episodeId);
}

module.exports = {
  ROOT, OUT, LANGS, SITE, PRESENTERS, SCENES, SCENE_TITLES, EPISODES, UI,
  studioVoices, sayAs, spoken, turnVoice, pickVoice, episode, fill, episodeStrings, viewerStrings, queuedStrings, headline, pickFinding,
  rtmpTargets, outputArgs, chapterMeta, chapterList, highlight, reviewLink, stamp
};
