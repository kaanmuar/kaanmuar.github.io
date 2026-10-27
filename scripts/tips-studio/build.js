#!/usr/bin/env node
/* Renders the daily tips series: a feed card, a story, and a 30 to 45 s clip per tip, plus captions,
   a seeded random daily schedule, and Buffer CSVs.
   node scripts/tips-studio/build.js [--tips hsts,contrast] [--skip-video] [--start 2026-10-26]
     [--batch tips-2026-10] [--seed 7] [--every 1] [--per-day 2] [--after 0] [--schedule-only]
   --per-day N posts N a day per channel, each in its own part of the channel window; --after N
   counts posts already ahead of this batch in the stream; --schedule-only rewrites the calendar,
   captions, and Buffer CSVs without rendering. --captions-only x[,linkedin] rewrites only those networks'
   captions, for posts dated today or later, and their Buffer CSVs, keeping the calendar as it is.
   Buffer CSVs leave Tags blank: bulk upload rejects any tag the account doesn't have. Bulk upload takes
   no alt text outside Pinterest, so buffer/alt-text.csv lists it per post to paste in the composer.
   node scripts/tips-studio/build.js --source runs --start 2026-10-28 --every 4
     renders the real-run scorecards from runs.js, in their listed order, one every 4 days.
   --source runs-100 loads runs-100.js the same way; its batch defaults to the module name.
   A clip is a run of narrated scenes (#1619): the hook (title), why it matters (body), the visual (tip.say or the
   visual's note), a related fact (tip.more, or one read off a scorecard), the fix (action) and the end card. Each
   line is spoken on its own in a neural voice (edge-tts) over the launch reels' bed (media/url-review-demos/bed.wav),
   and its scene lasts as long as the line.
   Each post shows the official marks of what it covers (#1917): a reviewed site's own icon, its home page scrolling on a
   phone, its benchmark among the Live Reports and a six-area radar; each competitor's icon and a score race; or the
   marks of the products a tip names. The end card lists the networks we post on.
   Clips take six languages in turn (en, es, pt, de, fr, it; woman, then man), starting --lang-offset N
   along that cycle: the card, voice, and TikTok/YouTube captions are all in the clip's language.
   A render exports the strings and runs translate.py first (--no-translate skips it); a clip still
   untranslated speaks English, and a clip that comes out silent stops the build. A translation in the wrong
   register (usted, du) stops it too, except in CI, where that clip goes out in English.
   To translate by hand or by agent instead, fill <batch>/i18n.json in translate.py's format, then rebuild its
   cache with translate.py <batch> --seed so a later render does not send every string back to the translator:
     node scripts/tips-studio/build.js --source runs-100 --export-strings
     node scripts/tips-studio/build.js --source runs-100 --rotate [--shard 0/2] [--resume]
   Captions take their hashtags from scripts/social-tags.js; every run first refreshes the day's trending
   tags (scripts/trending-tags.js) unless they were already fetched today.
   A source can also write a post in its own language (tip.lang, tip.voice "w" or "m"): it is drawn, voiced and
   captioned as written, with no translation, and its UI strings come from studio.UI[lang]. Such a source can set
   tip.date, tip.times ({ network: "HH:MM" }, a calendar slot), tip.alt, tip.hold (in the hub, never queued),
   tip.pin (the calendar keeps it on its date), studio.WINDOWS, studio.hostFor(tip), studio.BATCH and studio.LANG_OFFSET.
   A source names its social hub kind with studio.KIND or tip.kind (trick, news, advice, compare, myth, quiz, term,
   skit, series); a quiz sets tip.answer to the id of the tip that reveals it, tip.steps and tip.term are optional.
   --rotate writes voiced/<slug>.mp4 and voiced/<slug>.json (language, speech, TikTok and YouTube copy)
   for clips already queued, and leaves the stills, calendar, and Buffer CSVs alone. */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("../playwright-sandbox");
const { chromium } = require("playwright");
const brands = require("./brands");
const assets = require("./site-assets");
const ROOT = path.resolve(__dirname, "../..");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = FFMPEG.replace(/ffmpeg$/, "ffprobe");
// Microsoft neural voices through edge-tts (pip install edge-tts): warm and upbeat, never the Piper ones.
// macOS clears /tmp, so the studio's virtualenv lives under ~/.local/share; EDGE_TTS or one on the PATH also works.
const TTS_HOME = path.join(require("os").homedir(), ".local/share/review-tts");
const TTS_INSTALL = "python3 -m venv " + TTS_HOME + " && " + TTS_HOME + "/bin/pip install edge-tts";
const EDGE_TTS = process.env.EDGE_TTS || [path.join(TTS_HOME, "bin/edge-tts"), "/tmp/review-tts/bin/edge-tts", "edge-tts"]
  .find((bin) => spawnSync(bin, ["--version"]).status === 0) || path.join(TTS_HOME, "bin/edge-tts");
// Single-language voices only: a Multilingual one guesses the language of every request, and a clip sends one per
// scene, so a French clip switched to English on a line of hosts. Spanish speaks in a LATAM voice.
const VOICES = [
  ["en-w", "en-US-AvaNeural"], ["en-m", "en-US-AndrewNeural"],
  ["es-w", "es-MX-DaliaNeural"], ["es-m", "es-MX-JorgeNeural"],
  ["pt-w", "pt-BR-FranciscaNeural"], ["pt-m", "pt-BR-AntonioNeural"],
  ["de-w", "de-DE-KatjaNeural"], ["de-m", "de-DE-ConradNeural"],
  ["fr-w", "fr-FR-DeniseNeural"], ["fr-m", "fr-FR-HenriNeural"],
  ["it-w", "it-IT-IsabellaNeural"], ["it-m", "it-IT-DiegoNeural"]
].map(([file, voice]) => ({ file, voice, lang: file.slice(0, 2) }));
// How a voice reads an English term it says wrong as written, so a LATAM voice says "deploy" the English way. Only the
// voice gets these; card text stays as written. The es-MX voices already say most tech words right (release,
// JavaScript, Search Console, header names), so list a term only when its respelling is heard as the English word
// more often. Longer terms first, since each matches a whole word, case aside.
const SAY_AS = {
  es: [
    ["Report-Only", "Report Ounli"], ["robots.txt", "róbots punto te equis te"], ["llms.txt", "ele ele eme ese punto te equis te"],
    ["QA-lab", "kiu ei lab"], ["Consent Mode", "Cónsent Moud"], ["Safe Browsing", "Séif Bráusin"], ["Open Graph", "Óupen Graf"],
    ["smoke tests", "smóuk tests"], ["smoke test", "smóuk test"], ["lazy-load", "léisi lóud"], ["lazy load", "léisi lóud"],
    ["Lighthouse", "Láit Jáus"], ["Analytics", "Anályticks"], ["Googlebot", "Gúgol bot"], ["GitHub", "Git Hub"],
    ["Playwright", "Pléirait"], ["Stripe", "Straip"], ["deployments", "diplóiments"], ["deployed", "deplóid"],
    ["deploys", "deplóis"], ["deploy", "deplói"], ["snippets", "snípets"], ["sitemaps", "sáitmaps"], ["sitemap", "sáitmap"],
    ["headers", "jéders"], ["header", "jéder"], ["plugins", "plóguins"], ["screenshots", "scrínshots"],
    ["screenshot", "scrínshot"], ["browser", "bráuser"], ["crawlers", "królers"], ["crawler", "króler"]
  ]
};
const SAY_AS_RE = Object.fromEntries(Object.entries(SAY_AS).map(([lang, pairs]) =>
  [lang, pairs.map(([term, said]) => [new RegExp("(^|[^\\p{L}\\d])" + term.replace(/[.+]/g, "\\$&") + "(?![\\p{L}\\d])", "giu"), said])]));
function sayAs(lang, text) {
  return (SAY_AS_RE[lang] || []).reduce((out, [re, said]) => out.replace(re, (m, before) => before + said), text);
}
// The bed is git-ignored: a worktree from scripts/ticket-worktree.sh borrows the main checkout's, and a fresh
// clone downloads it from the studio-assets release the way auto-live-reports.yml does.
const BED_REL = "media/url-review-demos/bed.wav";
function findBed() {
  const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const found = [path.join(ROOT, BED_REL), common && path.join(path.dirname(common), BED_REL)].find((file) => file && fs.existsSync(file));
  if (found) return found;
  spawnSync("gh", ["release", "download", "studio-assets", "-p", "bed.wav", "-D", path.dirname(path.join(ROOT, BED_REL))], { cwd: ROOT, stdio: "inherit" });
  if (fs.existsSync(path.join(ROOT, BED_REL))) return path.join(ROOT, BED_REL);
  throw new Error(BED_REL + " is missing here and in the main checkout, and `gh release download studio-assets -p bed.wav` failed; it is git-ignored, so copy it in (or pass --skip-video)");
}
let BED;
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const LOCALES = { en: "en-US", es: "es-ES", pt: "pt-BR", de: "de-DE", fr: "fr-FR", it: "it-IT" };
const UI_EN = { tryThis: "Try this", tip: "Tip", guided: "Guided tour", never: "Never runs your tests",
  end: "Let your page do the talking.", endNote: "How a public-page review works, step by step.",
  why: "Why it matters", more: "Did you know?", strongest: "Strongest area", weakest: "Weakest area" };
// Card labels of the logo and chart scenes, written here in every clip language rather than sent to the translator.
const UI_MARKS = {
  en: { bench: "Better than {pct} of {n} sites we reviewed", benchTop: "Top score of {n} sites we reviewed", reviewed: "Reviewed", follow: "Follow" },
  es: { bench: "Mejor que el {pct} de {n} sitios que analizamos", benchTop: "La mejor puntuación de {n} sitios que analizamos", reviewed: "Analizado", follow: "Síguenos" },
  pt: { bench: "Melhor que {pct} de {n} sites que analisamos", benchTop: "A maior nota entre {n} sites que analisamos", reviewed: "Analisado", follow: "Siga-nos" },
  de: { bench: "Besser als {pct} von {n} geprüften Websites", benchTop: "Bestwert unter {n} geprüften Websites", reviewed: "Geprüft", follow: "Folgen Sie uns" },
  fr: { bench: "Mieux que {pct} des {n} sites analysés", benchTop: "Meilleur score sur {n} sites analysés", reviewed: "Analysé", follow: "Suivez-nous" },
  it: { bench: "Meglio del {pct} di {n} siti analizzati", benchTop: "Il punteggio più alto su {n} siti analizzati", reviewed: "Analizzato", follow: "Seguici" }
};
const VOICE_AT = 0.7;
// Scene order and the shortest each may run, in seconds; a longer line stretches its scene.
const SCENES = { hook: 3, why: 3.5, look: 5, more: 3.5, fix: 4, end: 3.4 };
const LEAD = 0.45;
const TAIL = 0.7;

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

const opts = args();
const SOURCE = typeof opts.source === "string" && /^[\w-]+$/.test(opts.source) ? opts.source : "tips";
const RUNS = SOURCE !== "tips";
const studio = require("./" + SOURCE);
const BATCH = opts.batch || studio.BATCH || (SOURCE === "runs" ? "runs-2026-10" : RUNS ? SOURCE : "tips-2026-10");
const EVERY = Number(opts.every || 1);
const PER_DAY = Number(opts["per-day"] || 1);
const AFTER = Number(opts.after || 0);
const OUT = path.join(ROOT, "media/social-posts", BATCH);
const IMAGE_BASE = studio.SITE + "/media/social-posts/" + BATCH;
const START = opts.start || "2026-10-26";
const SEED = Number(opts.seed || 7);
const PICK = opts.tips ? String(opts.tips).split(",") : null;
const FPS = 30;
const GUIDE_HOST = "carlosandmunoz.com/qa-review-guide.html";

const WINDOWS = {
  linkedin: ["07:30", "11:00"], x: ["08:00", "21:00"], facebook: ["12:00", "19:00"], instagram: ["11:00", "20:00"],
  "instagram-story": ["09:00", "21:00"], tiktok: ["17:00", "22:00"], youtube: ["16:00", "21:00"]
};

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function order(tips, rand) {
  const pool = tips.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = [];
  while (pool.length) {
    const prev = out[out.length - 1];
    const at = pool.findIndex((t) => !prev || t.cat !== prev.cat);
    out.push(pool.splice(at === -1 ? 0 : at, 1)[0]);
  }
  return out;
}

function minutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function day(start, offset) { const d = new Date(start + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
function randomTime(window, rand, slot) {
  const part = (minutes(window[1]) - minutes(window[0])) / PER_DAY;
  const a = minutes(window[0]) + slot * part;
  return hhmm(Math.round((a + rand() * part * 0.75) / 5) * 5);
}
function csvCell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }

const MARK_WORDS = { pass: "pass", fail: "fail", risk: "warning" };
function describe(v) {
  const note = v.note ? ". " + v.note.replace(/ · /g, ", ") : "";
  const code = (lines) => lines.map((l) => l.trim()).filter(Boolean).join(" ");
  if (v.type === "scores") return "Overall score " + v.overall + " of 100. " + v.areas.map((a) => a[0] + " " + a[1]).join(", ") + note;
  if (v.type === "code") return "Code: " + code(v.lines) + note;
  if (v.type === "versus") return [v.left, v.right].map((s) => s.label + " (" + MARK_WORDS[s.mark] + "): " + s.lines.join(", ")).join(". ");
  if (v.type === "check") return "Checklist: " + v.items.map((r) => r[0] + ", " + r[1] + " (" + MARK_WORDS[r[2]] + ")").join("; ");
  if (v.type === "bars") return "Bar chart: " + v.items.map((i) => i[0] + " " + i[1].toLocaleString("en-US") + " " + v.unit).join(", ") + note;
  if (v.type === "stat") return v.value + ", " + v.caption;
  if (v.type === "quiz") return "Quiz: " + v.sides.map((s) => s.label + " (" + s.host + ")").join(" or ") + ", scores hidden" + note;
  if (v.type === "myth") return "Myth: " + v.myth + " Fact: " + v.fact;
  if (v.type === "term") return "Term: " + v.value + ", " + v.group + (v.lines ? ". Example: " + code(v.lines) : "") + note;
  if (v.type === "list") return v.items.map((item, i) => (i + 1) + ". " + item.title + " (" + item.by + ")").join("; ");
  if (v.type === "matrix") return "Scores side by side: " + v.rows.map((r) => r[0] + " " + r.slice(1).map((n, i) => v.cols[i] + " " + (n == null ? "none" : n)).join(", ")).join("; ") + note;
  return "";
}
// LinkedIn caps image alt text at 300 characters, the lowest of the networks Buffer posts to.
function sentences(parts) { return parts.filter(Boolean).map((p) => /[.?!…]$/.test(p) ? p : p + ".").join(" "); }
function altText(tip) {
  const head = sentences([studio.CATS[tip.cat].label.replace(/ · /g, ", ") + " card", studio.plainTitle(tip), describe(tip.visual)]);
  const full = sentences([head, (tip.actionLabel || "Try this") + ": " + tip.action]);
  if (full.length <= 300) return full;
  return head.length <= 300 ? head : head.slice(0, 299).replace(/\s+\S*$/, "") + "…";
}

// The social hub's post kind (scripts/social-hub/copy.js) and what that kind's page needs: a quiz names the
// tip that answers it, a trick or best practice lists its steps, a glossary post names its term.
function hubFields(tip, slugOf) {
  const out = {};
  const kind = tip.kind || studio.KIND;
  if (kind) out.kind = kind;
  if (tip.answer) {
    if (!slugOf[tip.answer]) throw new Error(tip.id + ": its answer " + tip.answer + " is not in this batch");
    out.answer = slugOf[tip.answer];
  }
  const steps = tip.steps || (["trick", "advice"].includes(kind) && tip.action ? [tip.action] : null);
  if (steps) out.steps = steps;
  if (tip.term) out.term = tip.term;
  return out;
}

// Card text worth translating: code lines, ids, tags and check marks stay as they are.
const KEEP_KEYS = new Set(["id", "kind", "answer", "term", "steps", "alt", "host", "cat", "report", "scope", "tags", "lines", "mark", "type", "analyzed", "overall", "value", "by", "url", "date", "edition"]);
function strings(node, at, out) {
  if (typeof node === "string") { if (/[a-z]{2}/i.test(node) && !MARK_WORDS[node]) out[at] = node; }
  else if (node && typeof node === "object") Object.keys(node).forEach((key) => { if (!KEEP_KEYS.has(key)) strings(node[key], at ? at + "." + key : key, out); });
  return out;
}
function setPath(obj, at, value) { const keys = at.split("."); const last = keys.pop(); keys.reduce((o, k) => o[k], obj)[last] = value; }

const LANG_OFFSET = Number(opts["lang-offset"] || studio.LANG_OFFSET || 0);
function voiceFor(index, tip) {
  if (tip && tip.lang) return VOICES.find((v) => v.file === tip.lang + "-" + (tip.voice || "w"));
  const turn = index + LANG_OFFSET;
  const lang = LANGS[turn % LANGS.length];
  return VOICES.find((v) => v.file === lang + "-" + (Math.floor(turn / LANGS.length) % 2 ? "m" : "w"));
}
function translated(tip, lang, i18n) { return lang === "en" || tip.lang === lang || !!(i18n.clips[tip.id] && i18n.ui[lang]); }
function uiFor(lang, i18n) { return Object.assign({}, UI_MARKS[lang], lang === "en" ? {} : i18n.ui[lang], (studio.UI || {})[lang], { locale: LOCALES[lang] }); }

// The official marks a post shows (scripts/tips-studio/brands.js, site-assets.js): the reviewed site's icon, its
// home page on a phone and its benchmark, every competitor's icon, or the marks of the products a tip names.
const EXTRAS = new Map();
async function extrasFor(tip, browser) {
  if (EXTRAS.has(tip.id)) return EXTRAS.get(tip.id);
  const v = tip.visual || {};
  const host = tip.host || (v.type === "scores" && v.note ? v.note.split(" · ")[0].trim() : "");
  const x = { nets: brands.networks(), handle: brands.HANDLE };
  if (v.type === "matrix") {
    x.logos = {};
    for (const row of v.rows) x.logos[row[0]] = await assets.siteKind(row[0]) ? "" : await assets.siteLogo(row[0]);
  } else if (/^[\w.-]+\.[a-z]{2,}$/i.test(host)) {
    x.host = assets.bare(host);
    x.sensitive = await assets.siteKind(host);
    x.logo = x.sensitive ? "" : await assets.siteLogo(host);
    const shot = browser && !x.sensitive ? await assets.siteShot(browser, host) : "";
    if (shot) x.shot = "file://" + shot;
    x.bench = assets.bench(host, v.overall);
  } else x.brands = brands.brandsIn(tip);
  EXTRAS.set(tip.id, x);
  return x;
}
function hostFor(tip) { return studio.hostFor ? studio.hostFor(tip) : GUIDE_HOST; }
function loadI18n() {
  const file = path.join(OUT, "i18n.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { ui: {}, clips: {} };
}

// A clip whose translation is missing speaks English in the same voice slot rather than go out muted, and a
// translated clip never voices an English line: one missing its title, body or action goes out in English as a
// whole, and an untranslated fact, note or area name drops out of the voice-over.
const SAID = /^(title|body|action|more|say|visual\.note|visual\.areas)(\.|$)/;
const MUST_SAY = /^(title|body|action)(\.|$)/;
function untranslated(tip, tr) {
  return Object.entries(strings(tip, "", {})).filter(([at, text]) => SAID.test(at) && !(at in tr) && /[a-z]{3}/.test(text)).map(([at]) => at);
}
function localize(tip, index, total, i18n) {
  let voice = voiceFor(index, tip);
  let tr = voice.lang === "en" || tip.lang ? {} : i18n.clips[tip.id] || {};
  let unsaid = voice.lang === "en" || tip.lang ? [] : untranslated(tip, tr);
  if (!translated(tip, voice.lang, i18n) || unsaid.some((at) => MUST_SAY.test(at))) {
    voice = VOICES.find((v) => v.file === "en-" + voice.file.slice(3));
    tr = {};
    unsaid = [];
  }
  const local = Object.assign(JSON.parse(JSON.stringify(tip)), { lang: voice.lang });
  const cat = Object.assign({}, studio.CATS[tip.cat]);
  Object.keys(tr).forEach((at) => { if (at === "cat.label") cat.label = tr[at]; else if (!at.startsWith("cap.")) setPath(local, at, tr[at]); });
  const cap = studio.captions(local, index, total);
  const ui = uiFor(voice.lang, i18n);
  const voiced = JSON.parse(JSON.stringify(local));
  unsaid.forEach((at) => setPath(voiced, at, ""));
  const lines = narration(voiced, ui);
  local.more = lines.fact;
  delete lines.fact;
  return { tip: local, cat, ui, voice, lang: voice.lang, lines,
    speech: Object.values(lines).filter(Boolean).join(" "),
    tiktok: cap.tiktok, youtubeTitle: cap.youtubeTitle, youtube: withTags(tr["cap.youtube"], cap.youtube) };
}

// What each scene says. A UI word missing in the clip's language drops out rather than be spoken in English.
function narration(tip, ui) {
  const say = (key) => ui[key] || (tip.lang === "en" ? UI_EN[key] : "");
  const v = tip.visual || {};
  const fact = tip.more || related(v, say);
  return { hook: studio.plainTitle(tip), why: tip.body || "", look: tip.say || (v.note || "").replace(/ · /g, ", "),
    more: fact ? [say("more"), fact].filter(Boolean).join(" ") : "", fix: tip.action || "", end: say("end"), fact };
}

// A scorecard's own related fact: its strongest and weakest area. A comparison's title already names its leader.
function related(v, say) {
  if (v.type !== "scores" || !say("strongest") || !say("weakest") || v.areas.some((a) => !a[0])) return "";
  const areas = v.areas.filter((a) => typeof a[1] === "number").sort((a, b) => b[1] - a[1]);
  const hi = areas[0];
  const lo = areas[areas.length - 1];
  return hi && hi[1] !== lo[1] ? say("strongest") + ": " + hi[0] + ", " + hi[1] + ". " + say("weakest") + ": " + lo[0] + ", " + lo[1] + "." : "";
}

// The translated description ends with the English tag line; the clip's language gets its own tags.
function withTags(translated, own) {
  if (!translated) return own;
  const tags = own.split("\n").pop();
  if (!tags.startsWith("#")) return translated;
  const lines = translated.replace(/\s+$/, "").split("\n");
  if (lines[lines.length - 1].startsWith("#")) lines.pop(); else lines.push("");
  return lines.concat(tags).join("\n");
}

function exportStrings(all) {
  const clips = {};
  all.forEach((tip, index) => {
    const lang = voiceFor(index, tip).lang;
    const out = strings(tip, "", {});
    out["cat.label"] = studio.CATS[tip.cat].label;
    out["cap.youtube"] = studio.captions(tip, index, all.length).youtube;
    clips[tip.id] = { lang, strings: out };
  });
  fs.writeFileSync(path.join(OUT, "i18n-src.json"), JSON.stringify({ ui: UI_EN, clips }, null, 1));
  console.log("wrote", Object.keys(clips).length, "clips to", path.relative(ROOT, path.join(OUT, "i18n-src.json")));
}

function seconds(file) {
  return parseFloat(spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout) || 0;
}

function speak(voice, text, file) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const run = spawnSync(EDGE_TTS, ["--voice", voice.voice, "--rate=+6%", "--pitch=+2Hz", "--text", text, "--write-media", file], { encoding: "utf8" });
    if (run.status === 0 && seconds(file) > 0.5) return seconds(file);
    if (run.error || /ModuleNotFoundError|No module named/.test(run.stderr)) break;
    spawnSync("sleep", [String(3 + attempt * 5)]);
  }
  if (spawnSync(EDGE_TTS, ["--version"]).status !== 0) throw new Error("edge-tts does not run at " + EDGE_TTS + "; install it with: " + TTS_INSTALL);
  throw new Error("voice failed for " + voice.file);
}

async function renderStill(page, tip, fmt, index, total, file, ui, cat, extras) {
  const size = fmt === "feed" ? { width: 1080, height: 1350 } : { width: 1080, height: 1920 };
  await page.setViewportSize(size);
  await page.evaluate(([t, c, f, i, n, h, u, x]) => window.paint(t, c, f, i, n, h, u, x), [tip, cat || studio.CATS[tip.cat], fmt, index, total, hostFor(tip), ui || {}, extras || {}]);
  await page.waitForTimeout(150);
  await page.locator("#c").screenshot({ path: file, type: "jpeg", quality: 92 });
}

// Each line is voiced first, so every scene knows how long it runs before a frame is drawn.
function timeline(said, tmp) {
  const scenes = [];
  let at = 0;
  for (const id of Object.keys(SCENES)) {
    const text = said.lines[id];
    if (id === "more" && !text) continue;
    const audio = text ? path.join(tmp, id + ".mp3") : null;
    const voiceDur = text ? speak(said.voice, sayAs(said.lang, text), audio) : 0;
    const lead = id === "hook" ? VOICE_AT : LEAD;
    const dur = Math.max(SCENES[id], text ? lead + voiceDur + TAIL : 0);
    scenes.push({ id, start: at, dur, voiceAt: at + lead, voiceDur, audio });
    at += dur;
  }
  return { scenes, length: at };
}

// A clip runs about 1,300 frames, so each worker page paints the clip and draws every WORKERS-th frame.
const WORKERS = Math.max(1, Math.min(Number(process.env.CLIP_WORKERS) || require("os").cpus().length, 4));
async function framePages(browser, page) {
  const pages = [page];
  while (pages.length < WORKERS) {
    const extra = await browser.newPage({ deviceScaleFactor: 1 });
    await extra.goto("file://" + path.join(__dirname, "frame.html"));
    pages.push(extra);
  }
  return Promise.all(pages.map(async (p) => ({ page: p, cdp: await p.context().newCDPSession(p) })));
}

async function renderClip(workers, tip, index, total, file, cover, said, extras) {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "tip-"));
  const { scenes, length } = timeline(said, tmp);
  const frames = Math.ceil(length * FPS);
  const size = { width: 1080, height: 1920 };
  await Promise.all(workers.map(async ({ page, cdp }, k) => {
    await page.setViewportSize(size);
    await page.evaluate(([t, c, i, n, h, u, s, x]) => window.paintClip(t, c, i, n, h, u, s, x),
      [said.tip, said.cat, index, total, hostFor(tip), said.ui, scenes.map(({ audio, ...s }) => s), extras || {}]);
    for (let f = k; f < frames; f += workers.length) {
      await page.evaluate((s) => window.seek(s), f / FPS);
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip: Object.assign({ x: 0, y: 0, scale: 1 }, size) });
      fs.writeFileSync(path.join(tmp, String(f).padStart(5, "0") + ".jpg"), Buffer.from(shot.data, "base64"));
    }
  }));
  const page = workers[0].page;
  // Buffer previews and TikTok's default cover use the first frame, so it shows the finished story card.
  await renderStill(page, said.tip, "story", index, total, cover, said.ui, said.cat, extras);
  fs.copyFileSync(cover, path.join(tmp, "00000.jpg"));
  // Same bed level, fades and loudness as the launch reels in post-studio.
  const voiced = scenes.filter((s) => s.audio);
  const delay = (s) => Math.round(s.voiceAt * 1000);
  const run = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "%05d.jpg")]
    .concat(...voiced.map((s) => ["-i", s.audio]), ["-stream_loop", "-1", "-i", BED, "-filter_complex",
    voiced.map((s, i) => "[" + (i + 1) + ":a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=" + delay(s) + "|" + delay(s) + ",apad[v" + i + "];").join("") +
    "[" + (voiced.length + 1) + ":a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.16,afade=t=in:d=1.2,afade=t=out:st=" + (length - 1.6).toFixed(3) + ":d=1.6[ba];" +
    voiced.map((s, i) => "[v" + i + "]").join("") + "[ba]amix=inputs=" + (voiced.length + 1) + ":duration=first:normalize=0,atrim=0:" + length.toFixed(3) +
    ",loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[a]",
    "-map", "0:v", "-map", "[a]", "-t", length.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", file]), { encoding: "utf8" });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (run.status !== 0) throw new Error("ffmpeg failed for " + tip.id + ": " + run.stderr);
  const peak = parseFloat((spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/max_volume: (-?[\d.]+) dB/) || [])[1]);
  if (!(peak > -30)) throw new Error("clip " + tip.id + " is silent (peak " + peak + " dB); never post a muted clip");
}

// Posts dated before today keep the caption they went out with; the calendar is left as the queues hold it.
function rewriteCaptions(all, networks) {
  const file = path.join(OUT, "captions.json");
  const captions = JSON.parse(fs.readFileSync(file, "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  const slugs = Object.keys(captions);
  let changed = 0;
  slugs.forEach((slug) => {
    const cap = captions[slug];
    const [, number, id] = slug.match(/^(\d+)-(.+)$/);
    const tip = all.find((t) => t.id === id);
    if (!tip) throw new Error(slug + " has no post in --source " + SOURCE);
    if (cap.date < today) return;
    const fresh = studio.captions(tip, Number(number) - 1, slugs.length);
    networks.forEach((network) => { if (fresh[network] && fresh[network] !== cap[network]) { cap[network] = fresh[network]; changed += 1; } });
  });
  fs.writeFileSync(file, JSON.stringify(captions, null, 2));
  const rows = fs.readFileSync(path.join(OUT, "calendar.csv"), "utf8").trim().split("\n").slice(1).map((line) => line.split(","));
  for (const channel of networks.filter((n) => ["linkedin", "x", "facebook", "instagram"].includes(n))) {
    const lines = ["Text,Image URL,Tags,Posting Time"].concat(rows.filter((r) => r[2] === channel).map(([date, time, , slug, asset]) =>
      [csvCell(captions[slug][channel]), csvCell(IMAGE_BASE + "/" + asset), csvCell(""), csvCell(date + " " + time)].join(",")));
    fs.writeFileSync(path.join(OUT, "buffer", "buffer-" + channel + ".csv"), lines.join("\n") + "\n");
  }
  console.log("rewrote", changed, networks.join("/"), "captions dated", today, "or later in", path.relative(ROOT, OUT));
}

(async () => {
  if (!opts["export-strings"]) spawnSync(process.execPath, [path.join(ROOT, "scripts/trending-tags.js"), "--if-stale"], { stdio: "inherit" });
  const rand = rng(SEED);
  const all = RUNS ? studio.TIPS.slice() : order(studio.TIPS, rand);
  const total = all.length;
  let tips = PICK ? all.filter((t) => PICK.includes(t.id)) : all;
  if (opts.shard) { const [k, n] = String(opts.shard).split("/").map(Number); tips = tips.filter((t, i) => i % n === k); }
  if (opts["export-strings"]) { fs.mkdirSync(OUT, { recursive: true }); exportStrings(all); return; }
  if (opts["captions-only"]) { rewriteCaptions(all, String(opts["captions-only"]).split(",")); return; }
  if (opts.rotate || !(opts["skip-video"] || opts["schedule-only"])) BED = findBed();
  for (const dir of ["feed", "story", "clip", "cover"]) fs.mkdirSync(path.join(OUT, dir), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "frame.html"));
  await page.evaluate(() => document.fonts.ready);
  const workers = opts.rotate || !(opts["skip-video"] || opts["schedule-only"]) ? await framePages(browser, page) : null;

  if (opts.rotate) {
    const i18n = loadI18n();
    fs.mkdirSync(path.join(OUT, "voiced", "cover"), { recursive: true });
    for (const tip of tips) {
      const index = all.indexOf(tip);
      const slug = String(index + 1).padStart(2, "0") + "-" + tip.id;
      const file = path.join(OUT, "voiced", slug + ".mp4");
      if (opts.resume && fs.existsSync(file.replace(/\.mp4$/, ".json"))) continue;
      if (!translated(tip, voiceFor(index, tip).lang, i18n)) { console.log("untranslated", slug); continue; }
      const said = localize(tip, index, total, i18n);
      await renderClip(workers, tip, index, total, file, path.join(OUT, "voiced", "cover", slug + ".jpg"), said, await extrasFor(tip, browser));
      fs.writeFileSync(file.replace(/\.mp4$/, ".json"), JSON.stringify({ slug, lang: said.lang, voice: said.voice.file,
        speech: said.speech, tiktok: said.tiktok, youtubeTitle: said.youtubeTitle, youtube: said.youtube }, null, 1));
      console.log("voiced", slug, said.voice.file);
    }
    await browser.close();
    return;
  }

  if (!opts["skip-video"] && !opts["schedule-only"] && !opts["no-translate"]) {
    exportStrings(all);
    const args = [path.join(__dirname, "translate.py"), OUT].concat(process.env.CI ? ["--drop-slips"] : []);
    const run = spawnSync(process.env.PYTHON || "python3", args, { stdio: "inherit" });
    if (run.status === 3) { console.error("translations speak in the wrong register; nothing was rendered"); process.exit(1); }
    if (run.status !== 0) console.warn("translation failed; untranslated clips speak English");
  }
  const i18n = loadI18n();
  for (const tip of opts["schedule-only"] ? [] : tips) {
    const index = all.indexOf(tip);
    const slug = String(index + 1).padStart(2, "0") + "-" + tip.id;
    const ui = tip.lang ? uiFor(tip.lang, i18n) : studio.UI ? uiFor("en", i18n) : {};
    const extras = await extrasFor(tip, opts["skip-video"] ? null : browser);
    await renderStill(page, tip, "feed", index, total, path.join(OUT, "feed", slug + ".jpg"), ui, null, extras);
    await renderStill(page, tip, "story", index, total, path.join(OUT, "story", slug + ".jpg"), ui, null, extras);
    const said = localize(tip, index, total, i18n);
    if (!opts["skip-video"]) await renderClip(workers, tip, index, total, path.join(OUT, "clip", slug + ".mp4"), path.join(OUT, "cover", slug + ".jpg"), said, extras);
    console.log("rendered", slug, said.voice.file);
  }
  await browser.close();

  const rows = [];
  const captions = {};
  const slugOf = Object.fromEntries(all.map((tip, index) => [tip.id, String(index + 1).padStart(2, "0") + "-" + tip.id]));
  all.forEach((tip, index) => {
    const slug = String(index + 1).padStart(2, "0") + "-" + tip.id;
    const date = tip.date || day(START, Math.floor((AFTER + index) / PER_DAY) * EVERY);
    const slot = (AFTER + index) % PER_DAY;
    const said = localize(tip, index, total, i18n);
    if (said.lang !== "en" && studio.OWN_LINE && said.tiktok.includes(studio.OWN_LINE.en)) throw new Error(slug + ": the " + said.lang + " TikTok caption carries the English call to action");
    const cap = Object.assign(studio.captions(tip, index, total), { tiktok: said.tiktok, youtubeTitle: said.youtubeTitle, youtube: said.youtube });
    // The networks restrict adult and gambling sites, so a post about one is held even if its source let it through.
    const held = tip.hold || !!(EXTRAS.get(tip.id) || {}).sensitive;
    captions[slug] = Object.assign({ date, cat: tip.cat, title: studio.plainTitle(tip), alt: tip.alt || altText(tip), lang: said.lang, voice: said.voice.file },
      tip.lang ? { textLang: tip.lang } : {}, held ? { hold: true } : {}, tip.pin ? { pin: true } : {}, hubFields(tip, slugOf), cap);
    const windows = studio.WINDOWS || WINDOWS;
    for (const channel of held ? [] : Object.keys(windows)) {
      const video = ["tiktok", "youtube"].includes(channel);
      rows.push({ date, time: (tip.times || {})[channel] || randomTime(windows[channel], rand, slot), channel, slug,
        asset: video ? "clip/" + slug + ".mp4" : channel === "instagram-story" ? "story/" + slug + ".jpg" : "feed/" + slug + ".jpg",
        text: channel === "youtube" ? cap.youtubeTitle : channel === "instagram-story" ? "" : cap[channel] });
    }
  });
  rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  fs.writeFileSync(path.join(OUT, "captions.json"), JSON.stringify(captions, null, 2));
  // The text captions in the other five languages, from the phrasebooks; the daily workflow also fills their gaps.
  require("child_process").execFileSync(process.execPath, [path.join(ROOT, "scripts/social-hub/translate-captions.js"), BATCH], { stdio: "inherit" });
  fs.writeFileSync(path.join(OUT, "calendar.csv"), ["Date,Time,Channel,Post,Asset"].concat(rows.map((r) => [r.date, r.time, r.channel, r.slug, r.asset].join(","))).join("\n") + "\n");

  fs.mkdirSync(path.join(OUT, "buffer"), { recursive: true });
  for (const channel of ["linkedin", "x", "facebook", "instagram"]) {
    const lines = ["Text,Image URL,Tags,Posting Time"].concat(rows.filter((r) => r.channel === channel).map((r) =>
      [csvCell(r.text), csvCell(IMAGE_BASE + "/" + r.asset), csvCell(""), csvCell(r.date + " " + r.time)].join(",")));
    fs.writeFileSync(path.join(OUT, "buffer", "buffer-" + channel + ".csv"), lines.join("\n") + "\n");
  }
  fs.writeFileSync(path.join(OUT, "buffer", "alt-text.csv"), ["Date,Post,Image URL,Alt Text"].concat(Object.keys(captions).map((slug) =>
    [captions[slug].date, slug, csvCell(IMAGE_BASE + "/feed/" + slug + ".jpg"), csvCell(captions[slug].alt)].join(","))).join("\n") + "\n");
  console.log("wrote", Object.keys(captions).length, "captions,", rows.length, "calendar rows to", path.relative(ROOT, OUT));
})().catch((err) => { console.error(err); process.exit(1); });
