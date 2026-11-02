#!/usr/bin/env node
/* Clip and skit renders run in GitHub Actions (#1981): a chat or the owner only asks for a render and reviews it.
   .github/workflows/studio-render.yml runs, in order:
     node scripts/studio-render.js plan            the renders the event asks for, as jobs=<JSON> in $GITHUB_OUTPUT
     node scripts/studio-render.js render <job>    fetch skit takes, record, render, check every clip is heard, slot the calendar
     node scripts/studio-render.js deliver <job>   clips to a release, the batch to a studio/ PR with its checks started,
                                                   and the review links on the ticket
     node scripts/studio-render.js failed <job>    a bug under the ticket with the run and the pre-flight plan, so a chat
                                                   starts only for what the script could not decide
     node scripts/studio-render.js publish         on a merged studio/ PR: the clips go live and a render is queued in Buffer
   Asking for a render:
     gh workflow run studio-render.yml -f kind=tips -f name=evergreen [-f mode=render|rotate|captions] [-f batch=...]
       [-f start=YYYY-MM-DD] [-f tips=a,b] [-f langs=en,es] [-f networks=x,linkedin] [-f ticket=1981]
     a comment by the owner on an issue, which becomes the ticket: /render tips evergreen --start 2026-11-03
     the Render action in Jarvis (op studio-render), on the web and in the app
     a merge to main that adds a tips-studio source or a skit. An edited source is not rendered on its own: its queued
     posts keep their dates, so the plan names its new posts and they are asked for with --tips.
   A skit renders from the Gemini takes in the skit-takes release, uploaded as <skit>-<lang>.mp4.
   Rotate re-voices queued clips into the <batch>-voiced release for review; swapping them into Buffer is #2007. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const REPO = process.env.GITHUB_REPOSITORY || "kaanmuar/kaanmuar.github.io";
const OWNER = "kaanmuar";
const PARENT = 1981;
const TAKES = "skit-takes";
const SITE = "https://carlosandmunoz.com";
const KINDS = ["tips", "skit"];
const MODES = ["render", "rotate", "captions"];
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const FLAGS = ["batch", "start", "tips", "langs", "mode", "networks"];
// tips-studio files that hold no posts, and runs-auto, which the daily Live Reports job renders itself.
const NOT_SOURCES = ["build", "brands", "buffer-voiced", "site-assets", "runs-auto"];
const TEXT_NETWORKS = "linkedin,x,facebook,instagram";
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const LIST = /^[a-z0-9-]+(,[a-z0-9-]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINKS = 12;
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const STATE = path.join(process.env.RUNNER_TEMP || os.tmpdir(), "studio-render.json");
const LOG = path.join(process.env.RUNNER_TEMP || os.tmpdir(), "studio-render.log");

function isSource(name) {
  return SLUG.test(name) && !NOT_SOURCES.includes(name) && fs.existsSync(path.join(ROOT, "scripts/tips-studio", name + ".js"));
}

function skitIds(file = path.join(ROOT, "scripts/skits-studio/skits.js")) {
  delete require.cache[require.resolve(file)];
  return require(file).SKITS.map((s) => s.id);
}

function job(input) {
  const j = { kind: input.kind || "tips", name: String(input.name || "").trim(), mode: input.mode || "render" };
  for (const key of ["batch", "start", "tips", "langs", "networks", "ticket", "by"]) if (input[key]) j[key] = String(input[key]).trim();
  if (!KINDS.includes(j.kind)) throw new Error("kind is tips or skit");
  if (!MODES.includes(j.mode)) throw new Error("mode is render, rotate or captions");
  if (!SLUG.test(j.name)) throw new Error("name a tips-studio source or a skit");
  if (j.kind === "tips" && !isSource(j.name)) throw new Error(j.name + " is not a tips-studio source");
  if (j.kind === "skit" && !skitIds().includes(j.name)) throw new Error(j.name + " is not a skit in scripts/skits-studio/skits.js");
  if (j.kind === "skit" && j.mode === "rotate") throw new Error("a skit keeps its actors' voices, so there is nothing to rotate");
  if (j.kind === "skit" && j.tips) throw new Error("--tips picks posts of a tips source; a skit takes --langs");
  if (j.kind === "tips" && j.langs) throw new Error("a tips clip's language follows the six-language cycle; --langs is for skits");
  if (j.batch && !SLUG.test(j.batch)) throw new Error("batch is lowercase letters, digits and dashes");
  if (j.start && !DAY.test(j.start)) throw new Error("start is YYYY-MM-DD");
  if (j.tips && !LIST.test(j.tips)) throw new Error("tips is a comma-separated list of post ids");
  if (j.langs && !(LIST.test(j.langs) && j.langs.split(",").every((l) => LANGS.includes(l)))) throw new Error("langs takes " + LANGS.join(","));
  if (j.networks && !LIST.test(j.networks)) throw new Error("networks is a comma-separated list, e.g. x,linkedin");
  if (j.ticket && !/^\d+$/.test(j.ticket)) throw new Error("ticket is an issue number");
  return j;
}

// "/render tips evergreen --start 2026-11-03" on the first line that starts with /render.
function parseCommand(body) {
  const line = String(body || "").split("\n").map((l) => l.trim()).find((l) => /^\/render(\s|$)/.test(l));
  if (!line) return null;
  const words = line.split(/\s+/).slice(1);
  const input = { kind: words.shift(), name: words.shift() };
  while (words.length) {
    const flag = words.shift();
    const key = flag.replace(/^--/, "");
    if (!flag.startsWith("--") || !FLAGS.includes(key) || !words.length) throw new Error("/render <tips|skit> <name> takes --" + FLAGS.join(", --") + ", each with a value");
    input[key] = words.shift();
  }
  return input;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, Object.assign({ cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }, opts)).trim();
}

function gh(args, opts) {
  return sh("gh", args, opts);
}

function tryGh(args) {
  try { return gh(args); } catch { return null; }
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, key + "=" + value + "\n");
  else console.log(key + "=" + value);
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  console.log(text);
}

function bogotaDay(offset = 0) {
  return new Date(Date.now() - 5 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);
}

// The issue a merged PR is for: the first #n in its body that is an issue, not a PR.
function ticketOfCommit(sha) {
  const pr = tryGh(["api", "repos/" + REPO + "/commits/" + sha + "/pulls", "-q", ".[0].body // \"\""]);
  for (const [, n] of String(pr || "").matchAll(/#(\d+)/g)) {
    if (tryGh(["api", "repos/" + REPO + "/issues/" + n, "-q", "if .pull_request then \"pr\" else \"issue\" end"]) === "issue") return n;
  }
  return "";
}

// A source at an older commit, required next to the current one so its own requires still resolve.
function idsAt(rev, file) {
  const copy = path.join(path.dirname(path.join(ROOT, file)), ".studio-before-" + path.basename(file));
  try {
    fs.writeFileSync(copy, sh("git", ["show", rev + ":" + file]));
    delete require.cache[require.resolve(copy)];
    const mod = require(copy);
    return (mod.SKITS || mod.TIPS || []).map((t) => t.id);
  } catch { return null; } finally { fs.rmSync(copy, { force: true }); }
}

function idsNow(file) {
  const mod = require(path.join(ROOT, file));
  return (mod.SKITS || mod.TIPS || []).map((t) => t.id);
}

// What a push to main asks for: every tips-studio source it adds and every skit it adds to skits.js.
function planPush(payload, changes) {
  const jobs = [];
  const notes = [];
  const ticket = changes.ticket || "";
  for (const { status, file } of changes.files) {
    const source = file.match(/^scripts\/tips-studio\/([a-z0-9-]+)\.js$/);
    if (source && isSource(source[1])) {
      if (status === "A") jobs.push(job({ kind: "tips", name: source[1], ticket, by: "merge" }));
      else if (status === "M") {
        const before = changes.idsAt(payload.before, file);
        const added = before ? changes.idsNow(file).filter((id) => !before.includes(id)) : [];
        if (added.length) notes.push("`" + source[1] + "` has new posts; its queued posts keep their dates, so render them by hand: `/render tips " + source[1] + " --tips " + added.join(",") + " --start <their first day>`");
      }
    }
    if (file === "scripts/skits-studio/skits.js" && (status === "A" || status === "M")) {
      const before = status === "A" ? [] : changes.idsAt(payload.before, file) || [];
      changes.idsNow(file).filter((id) => !before.includes(id)).forEach((id) => jobs.push(job({ kind: "skit", name: id, ticket, by: "merge" })));
    }
  }
  return { jobs, notes };
}

function changedFiles(before, after) {
  try { sh("git", ["cat-file", "-e", before + "^{commit}"]); } catch { spawnSync("git", ["fetch", "-q", "--depth=1", "origin", before], { cwd: ROOT }); }
  return sh("git", ["diff", "--name-status", "--no-renames", before, after]).split("\n").filter(Boolean)
    .map((line) => { const [status, file] = line.split("\t"); return { status, file }; });
}

function plan() {
  const event = process.env.GITHUB_EVENT_NAME || "workflow_dispatch";
  const payload = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  let jobs = [];
  let notes = [];
  if (event === "workflow_dispatch") jobs = [job(Object.assign({ by: "dispatch" }, payload.inputs || {}))];
  else if (event === "issue_comment") {
    const input = payload.comment && payload.comment.user.login === OWNER ? parseCommand(payload.comment.body) : null;
    if (input) {
      try { jobs = [job(Object.assign(input, { ticket: String(payload.issue.number), by: "comment" }))]; } catch (error) {
        gh(["api", "repos/" + REPO + "/issues/" + payload.issue.number + "/comments", "-f", "body=Render not started: " + error.message + "."]);
        throw error;
      }
    }
  } else if (event === "push" && !/^0+$/.test(payload.before || "0")) {
    ({ jobs, notes } = planPush(payload, { files: changedFiles(payload.before, payload.after), ticket: ticketOfCommit(payload.after), idsAt, idsNow }));
  }
  output("jobs", JSON.stringify(jobs));
  summary(jobs.length ? "Renders: " + jobs.map((j) => j.kind + " " + j.name + " (" + j.mode + ")").join(", ") : "Nothing to render.");
  notes.forEach((note) => summary("- " + note));
}

function batchOf(j) {
  if (j.batch) return j.batch;
  if (j.kind === "skit") return "skits-" + j.name;
  const studio = require(path.join(ROOT, "scripts/tips-studio", j.name));
  return studio.BATCH || { tips: "tips-2026-10", runs: "runs-2026-10" }[j.name] || j.name;
}

// A batch already on main keeps its days unless start is given: its first day is where the schedule starts.
function startOf(j, batch) {
  if (j.start) return j.start;
  const file = path.join(ROOT, "media/social-posts", batch, "captions.json");
  const days = fs.existsSync(file) ? Object.values(JSON.parse(fs.readFileSync(file, "utf8"))).map((c) => c.date).filter(Boolean).sort() : [];
  return days[0] || bogotaDay(1);
}

// build.js gives post i the voice at turn i + offset of the cycle en-w, es-w ... it-w, en-m ... it-m. A batch already
// on main keeps the offset its voices show, so a re-render or rotate speaks each post in the language it was queued in.
function offsetOf(captions) {
  for (const [slug, cap] of Object.entries(captions || {})) {
    const hit = slug.match(/^(\d+)-/);
    const voice = !cap.textLang && /^([a-z]{2})-([wm])$/.exec(cap.voice || "");
    if (!hit || !voice || !LANGS.includes(voice[1])) continue;
    const turn = LANGS.indexOf(voice[1]) + (voice[2] === "m" ? LANGS.length : 0);
    return ((turn - (Number(hit[1]) - 1)) % 12 + 12) % 12;
  }
  return null;
}

function langOffset(j, batch, studio) {
  if (studio.LANG_OFFSET) return null;
  const file = path.join(ROOT, "media/social-posts", batch, "captions.json");
  const kept = fs.existsSync(file) ? offsetOf(JSON.parse(fs.readFileSync(file, "utf8"))) : null;
  if (kept !== null) return kept;
  // A new batch: the day number moves the language cycle on, as in the daily run.
  return j.mode === "render" ? Math.floor(Date.now() / 864e5) : null;
}

function run(args) {
  const done = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  const text = (done.stdout || "") + (done.stderr || "");
  fs.appendFileSync(LOG, "$ node " + args.join(" ") + "\n" + text);
  process.stdout.write(text);
  if (done.status !== 0) throw new Error("node " + args.join(" ") + " exited " + done.status);
  return text;
}

function renderTips(j, batch) {
  const studio = require(path.join(ROOT, "scripts/tips-studio", j.name));
  const args = ["scripts/tips-studio/build.js", "--source", j.name, "--batch", batch];
  if (j.tips) args.push("--tips", j.tips);
  const offset = langOffset(j, batch, studio);
  if (offset !== null) args.push("--lang-offset", String(offset));
  if (j.mode === "rotate") args.push("--rotate");
  else if (j.mode === "captions") args.push("--captions-only", j.networks || TEXT_NETWORKS);
  else args.push("--start", startOf(j, batch));
  run(args);
}

function renderSkit(j, batch) {
  const build = "scripts/skits-studio/build.js";
  if (j.mode === "captions") return run([build, j.name, "--captions-only", "--batch", batch, "--start", startOf(j, batch)]);
  const raw = path.join(ROOT, "media/skits/raw");
  fs.mkdirSync(raw, { recursive: true });
  const assets = (tryGh(["release", "view", TAKES, "--json", "assets", "-q", ".assets[].name"]) || "").split("\n");
  const langs = (j.langs ? j.langs.split(",") : LANGS).filter((lang) => assets.includes(j.name + "-" + lang + ".mp4"));
  if (!langs.length) throw new Error("the " + TAKES + " release has no take for " + j.name + ": upload them as " + j.name + "-<lang>.mp4");
  langs.forEach((lang) => gh(["release", "download", TAKES, "-p", j.name + "-" + lang + ".mp4", "-D", raw, "--clobber"]));
  run(["scripts/skits-studio/record.js", j.name, "--langs", langs.join(",")]);
  run([build, j.name, "--langs", langs.join(","), "--batch", batch, "--start", startOf(j, batch)]);
}

function peak(file) {
  const done = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const hit = (done.stderr || "").match(/max_volume:\s*(-?[\d.]+|-inf) dB/);
  return hit && hit[1] !== "-inf" ? Number(hit[1]) : -Infinity;
}

// .cursor/rules/social-clips.mdc: no clip goes out unless its peak is above -30 dB.
function checkPeaks(files, measure = peak) {
  const quiet = files.map((file) => ({ file, db: measure(file) })).filter((c) => !(c.db > -30));
  if (quiet.length) throw new Error("silent clips (peak not above -30 dB): " + quiet.map((c) => path.basename(c.file) + " " + c.db + " dB").join(", "));
}

function newFiles(dir, since) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".mp4")).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).mtimeMs >= since).sort();
}

// A batch already on main may be queued, and the nightly sync moves queued posts to calendar.csv. So its captions and
// calendar stay as committed and only posts it did not have are added; a re-rendered post changes its media only.
function keepQueued(batch, head) {
  const dir = path.join(ROOT, "media/social-posts", batch);
  const read = (file) => fs.readFileSync(path.join(dir, file), "utf8");
  const fresh = JSON.parse(read("captions.json"));
  const added = Object.keys(fresh).filter((slug) => !head.captions[slug]);
  const captions = Object.assign({}, head.captions);
  added.forEach((slug) => { captions[slug] = fresh[slug]; });
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify(Object.fromEntries(Object.keys(captions).sort().map((k) => [k, captions[k]])), null, 2));
  const [header, ...rows] = head.calendar.trim().split("\n");
  const more = read("calendar.csv").trim().split("\n").slice(1).filter((line) => added.includes(line.split(",")[3]));
  fs.writeFileSync(path.join(dir, "calendar.csv"), [header].concat(rows.concat(more).sort()).join("\n") + "\n");
  spawnSync("git", ["checkout", "HEAD", "--", "media/social-posts/" + batch + "/buffer"], { cwd: ROOT });
  return added;
}

function headBatch(batch) {
  try {
    const at = (file) => sh("git", ["show", "HEAD:media/social-posts/" + batch + "/" + file]);
    return { captions: JSON.parse(at("captions.json")), calendar: at("calendar.csv") };
  } catch { return null; }
}

function render(j) {
  const since = Date.now() - 1000;
  const batch = batchOf(j);
  const head = j.mode === "render" ? headBatch(batch) : null;
  fs.writeFileSync(LOG, "");
  if (j.kind === "skit") renderSkit(j, batch);
  else renderTips(j, batch);
  const out = path.join(ROOT, "media/social-posts", batch);
  if (j.mode === "render") {
    run(["scripts/social-calendar.js", "--write", "--batch", batch]);
    // Sentences the phrasebooks lack go through Google's translator; if it refuses, the posts keep what the books cover.
    try { run(["scripts/social-hub/translate-captions.js", "--machine", batch]); } catch {
      console.log("::warning::Google's translator refused; " + batch + " keeps the languages the phrasebooks cover.");
      run(["scripts/social-hub/translate-captions.js", batch]);
    }
    if (head) summary(batch + " is on main: kept its captions and calendar; new posts: " + (keepQueued(batch, head).join(", ") || "none") + ".");
  }
  const clips = j.mode === "captions" ? [] : newFiles(path.join(out, j.mode === "rotate" ? "voiced" : "clip"), since);
  if (j.mode !== "captions" && !clips.length) throw new Error("the render wrote no clip for " + batch);
  checkPeaks(clips);
  fs.writeFileSync(STATE, JSON.stringify({ batch, clips: clips.map((f) => path.relative(ROOT, f)) }));
  output("batch", batch);
  summary("Rendered " + clips.length + " clip(s) into media/social-posts/" + batch + ".");
}

function runUrl() {
  return (process.env.GITHUB_SERVER_URL || "https://github.com") + "/" + REPO + "/actions/runs/" + (process.env.GITHUB_RUN_ID || "");
}

function release(tag) {
  const raw = tryGh(["api", "repos/" + REPO + "/releases/tags/" + tag]);
  return raw ? JSON.parse(raw) : null;
}

// Where a render's clips wait for review: a new batch's own release; a batch whose clips are already live gets a
// <batch>-review release, so its queued posts keep the old clips until the PR merges.
function releaseTag(j, batch) {
  if (j.mode === "rotate") return batch + "-voiced";
  const live = release(batch);
  return live && !live.prerelease ? batch + "-review" : batch;
}

function upload(tag, files, notes) {
  if (release(tag)) gh(["release", "upload", tag, ...files, "--clobber"]);
  else gh(["release", "create", tag, ...files, "--target", "main", "--prerelease", "--latest=false", "--title", tag, "--notes", notes]);
}

function clipLinks(tag, files) {
  const links = files.slice(0, MAX_LINKS).map((f) => "- [" + path.basename(f) + "](https://github.com/" + REPO + "/releases/download/" + tag + "/" + path.basename(f) + ")");
  if (files.length > MAX_LINKS) links.push("- and " + (files.length - MAX_LINKS) + " more in [the " + tag + " release](https://github.com/" + REPO + "/releases/tag/" + tag + ")");
  return links.join("\n");
}

function prBody(j, batch, tag, clips) {
  const merge = j.mode === "render"
    ? "Merging makes these clips live and queues the batch in Buffer (studio-render.yml, publish), once the social hub has its pages."
    : "Merging changes the captions only; posts already queued keep theirs until they are requeued (buffer-batch.yml, mode requeue).";
  return [
    "Studio render of `" + j.name + "` (" + j.kind + ", " + j.mode + ") into `media/social-posts/" + batch + "`, asked by " + (j.by || "dispatch") + ". [Run](" + runUrl() + ").",
    "",
    j.ticket ? "Ticket: #" + j.ticket + ". Part of #" + PARENT + "." : "Part of #" + PARENT + ".",
    "",
    clips.length ? "## Review\n" + clipLinks(tag, clips) + "\n" : "",
    merge,
    "",
    "<!-- studio-render " + JSON.stringify({ kind: j.kind, name: j.name, mode: j.mode, batch, ticket: j.ticket || "" }) + " -->"
  ].join("\n");
}

function openPr(j, batch, tag, clips) {
  const branch = "studio/" + j.mode + "/" + batch + "-" + (process.env.GITHUB_RUN_ID || Date.now());
  const dir = "media/social-posts/" + batch;
  sh("git", ["checkout", "-q", "-b", branch]);
  sh("git", ["add", "-A", "--", dir, ...["assets/social", "scripts/social-hub/phrases"].filter((p) => fs.existsSync(path.join(ROOT, p)))]);
  if (fs.existsSync(path.join(ROOT, dir, "story"))) sh("git", ["add", "-f", "--", dir + "/story"]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT }).status === 0) return null;
  const title = "Studio: " + (j.mode === "captions" ? "captions of " : "") + j.kind + " " + j.name + " into " + batch;
  sh("git", ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898299+github-actions[bot]@users.noreply.github.com", "commit", "-q", "-m", title]);
  sh("git", ["push", "-q", "origin", branch]);
  const pr = JSON.parse(gh(["api", "repos/" + REPO + "/pulls", "-f", "title=" + title, "-f", "head=" + branch, "-f", "base=main", "-f", "body=" + prBody(j, batch, tag, clips)]));
  // A PR opened with the workflow token starts no pull_request run, so the required checks are started on its branch.
  tryGh(["workflow", "run", "ci.yml", "--ref", branch]);
  return pr;
}

function comment(n, body) {
  if (n) tryGh(["api", "repos/" + REPO + "/issues/" + n + "/comments", "-f", "body=" + body]);
}

function deliver(j) {
  const { batch, clips } = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const tag = releaseTag(j, batch);
  if (clips.length) upload(tag, clips.map((f) => path.join(ROOT, f)), "Studio render of " + j.name + " for review. " + runUrl());
  if (j.mode === "rotate") {
    comment(j.ticket, "Re-voiced " + clips.length + " clip(s) of `" + batch + "` for review:\n" + clipLinks(tag, clips) + "\n\nSwapping them into their Buffer posts waits on #2007. [Run](" + runUrl() + ")");
    return summary("Voiced clips are in the " + tag + " release.");
  }
  const pr = openPr(j, batch, tag, clips);
  if (!pr) return summary("The render changed nothing in " + batch + "; no PR.");
  comment(j.ticket, "Render of `" + j.name + "` is ready for review: " + pr.html_url + (clips.length ? "\n\n" + clipLinks(tag, clips) : ""));
  summary("Opened " + pr.html_url);
}

function preflightPlan(prompt) {
  if (process.env.PREFLIGHT_TOKEN) {
    const dir = path.join(os.homedir(), ".cursor", "preflight");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ url: process.env.PREFLIGHT_URL || "https://preflight.carlosandmunoz.com", token: process.env.PREFLIGHT_TOKEN }));
  }
  const done = spawnSync(process.execPath, [".cursor/hooks/preflight.js", "plan", prompt], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  return (done.stdout || "").trim() || "(the pre-flight plan was not available)";
}

function bugBody(j, ticket, tail, plan) {
  return [
    "**Kind:** Bug",
    "**Area:** social",
    "**Found while:** #" + ticket,
    "**Where it stands:** Backlog. Opened by studio-render.yml; add it to the board with `scripts/ticket.sh move <n> backlog`.",
    "",
    "## What happened",
    "The studio render of `" + j.name + "` (" + j.kind + ", " + j.mode + (j.batch ? ", batch " + j.batch : "") + ") failed: [run](" + runUrl() + ").",
    "",
    "```",
    tail || "(no render log)",
    "```",
    "",
    "## Fix",
    "Re-run it once fixed: `gh workflow run studio-render.yml " + ["kind", "name", "mode", "batch", "start", "tips", "langs", "networks", "ticket"].filter((k) => j[k]).map((k) => "-f " + k + "=" + j[k]).join(" ") + "`.",
    "",
    "Pre-flight plan:",
    "",
    plan
  ].join("\n");
}

function failed(j) {
  const tail = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").trim().split("\n").slice(-30).join("\n") : "";
  const last = tail.split("\n").filter(Boolean).pop() || "no output";
  const isIssue = j.ticket && tryGh(["api", "repos/" + REPO + "/issues/" + j.ticket, "-q", "if .pull_request then \"pr\" else \"issue\" end"]) === "issue";
  const parent = isIssue ? j.ticket : String(PARENT);
  const plan = preflightPlan("Fix the failed studio render of " + j.kind + " " + j.name + " (" + j.mode + ") in scripts/tips-studio or scripts/skits-studio: " + last);
  const title = "Social: The studio render of " + j.name + " (" + j.mode + ") failed";
  const n = gh(["api", "repos/" + REPO + "/issues", "-f", "title=" + title, "-f", "body=" + bugBody(j, parent, tail, plan), "-f", "labels[]=bug", "-f", "labels[]=area:social", "-q", ".number"]);
  const id = tryGh(["api", "repos/" + REPO + "/issues/" + n, "-q", ".id"]);
  if (id) tryGh(["api", "repos/" + REPO + "/issues/" + parent + "/sub_issues", "-F", "sub_issue_id=" + id]);
  comment(j.ticket, "Render of `" + j.name + "` failed; logged as #" + n + ".");
  summary("Logged #" + n);
}

function marker(body) {
  const hit = String(body || "").match(/<!-- studio-render (\{.*?\}) -->/);
  return hit ? JSON.parse(hit[1]) : null;
}

function hubLive(batch) {
  const file = path.join(ROOT, "media/social-posts", batch, "captions.json");
  const slug = fs.existsSync(file) ? Object.keys(JSON.parse(fs.readFileSync(file, "utf8")))[0] : null;
  if (!slug) return true;
  const done = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", SITE + "/social/" + batch + "/" + slug + ".html"], { encoding: "utf8" });
  return done.stdout === "200";
}

async function publish() {
  const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = payload.pull_request;
  const m = pr && pr.merged && pr.head.ref.startsWith("studio/") ? marker(pr.body) : null;
  if (!m) return summary("Not a merged studio render.");
  if (m.mode !== "render") return comment(m.ticket, "The captions of `" + m.batch + "` are on main (#" + pr.number + ").");
  const review = release(m.batch + "-review");
  if (review) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
    gh(["release", "download", review.tag_name, "-D", dir]);
    const files = fs.readdirSync(dir).map((f) => path.join(dir, f));
    if (files.length) gh(["release", "upload", m.batch, ...files, "--clobber"]);
    gh(["release", "delete", review.tag_name, "--yes", "--cleanup-tag"]);
  } else if ((release(m.batch) || {}).prerelease) gh(["release", "edit", m.batch, "--prerelease=false", "--latest=false"]);
  // The hub is rebuilt by regen-generated.yml on the merge, and Buffer holds a post until its hub page answers.
  for (let i = 0; i < 30 && !hubLive(m.batch); i += 1) await new Promise((r) => setTimeout(r, 60000));
  gh(["workflow", "run", "buffer-batch.yml", "-f", "mode=queue", "-f", "batch=" + m.batch]);
  comment(m.ticket, "`" + m.batch + "` is live: its clips are in the " + m.batch + " release and buffer-batch.yml is queueing it. [Run](" + runUrl() + ")");
  summary("Published " + m.batch);
}

if (require.main === module) {
  const [cmd, raw] = process.argv.slice(2);
  const steps = { plan, publish, render: () => render(job(JSON.parse(raw))), deliver: () => deliver(job(JSON.parse(raw))), failed: () => failed(job(JSON.parse(raw))) };
  if (!steps[cmd]) { console.error("usage: node scripts/studio-render.js plan|render|deliver|failed|publish [job]"); process.exit(2); }
  Promise.resolve().then(steps[cmd]).catch((error) => { console.error("::error::" + error.message); process.exit(1); });
}

module.exports = { job, parseCommand, planPush, checkPeaks, offsetOf, prBody, bugBody, marker, isSource, LANGS };
