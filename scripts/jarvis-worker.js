#!/usr/bin/env node
"use strict";
/* One task of Jarvis's worker (#2957), run by .github/workflows/jarvis-worker.yml: Gemini CLI edits a fresh checkout, the unit
   tests must pass (one repair round on Pro when they do not), and the branch is pushed with the deploy key. Every step reports
   to Jarvis (op worker-report) with the run's OIDC token; Jarvis opens the PR (functions/jarvis-worker.js).
   When the change touches pages, styles, front-end scripts or a page builder, the run screenshots the affected pages before
   and after the commit, offline, and sends them with the report for Carlos's Approve (#2959).

   node scripts/jarvis-worker.js          in the workflow, from TASK_* env
   node scripts/jarvis-worker.js --dry    anywhere: edits and tests in the current checkout, reports and pushes nothing
   Env: TASK_ID, TASK_TITLE, TASK_PROMPT, TASK_TIER (pro|flash), TASK_BRANCH, TASK_PR, TASK_ISSUE, GEMINI_API_KEY,
        MODEL_PRO, MODEL_FLASH, GITHUB_TOKEN (reads the issue or PR), JARVIS_URL */

const { spawn, spawnSync } = require("child_process");
const os = require("os");
const path = require("path");

const REPO = "kaanmuar/kaanmuar.github.io";
const DRY = process.argv.includes("--dry");
const env = process.env;
const ID = env.TASK_ID || "dry";
const TITLE = (env.TASK_TITLE || "Jarvis task").slice(0, 90);
const MODELS = { pro: env.MODEL_PRO || "gemini-pro-latest", flash: env.MODEL_FLASH || "gemini-flash-latest" };
const TIER = MODELS[env.TASK_TIER] ? env.TASK_TIER : "pro";
const JARVIS = env.JARVIS_URL || "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis";
const AGENT_MS = 40 * 60000;
const TEST_MS = 20 * 60000;
const TAIL = 6000;
const QUOTA = /quota|RESOURCE_EXHAUSTED|\b429\b|rate.?limit/i;
const QUOTA_WAITS = [60000, 180000];
const SHOT_PAGES = 4;
const SHOT_DEFAULT = ["index.html", "qa-review.html"];
const SHOT_BYTES = 400000;
const SHOT_INSTALL_MS = 8 * 60000;

const PREAMBLE = `You are Jarvis's worker, an autonomous coding agent in a checkout of ${REPO}: the QA-lab URL Review site, its Firebase
functions (functions/), the admin assistant Jarvis (js/admin-jarvis*.js, functions/jarvis*.js) and its Android app (android/).
Nobody will answer questions: decide and act.

Rules:
- Make the smallest change that fully solves the task. Match the surrounding code's style, naming and comment density; write a
  comment only for a constraint the code cannot show.
- The repo's conventions are in .cursor/rules/*.mdc. Read the ones that apply to the files you touch; any Jarvis change also
  lands in android/ (jarvis-mobile-parity.mdc).
- Leave .github/workflows/, firebase config, lock files and secrets alone unless the task is about them. Never print a secret.
- Do not commit, push, or open branches or PRs: the run does that after you finish.
- Run \`npm run test:review\` before you finish and fix what you broke. After editing js/admin-jarvis-core.js run
  \`node scripts/build-jarvis-core.js\`.
- End with a short plain summary: the cause, what you changed and why, and anything you left undone.

Task:
`;

function sh(cmd, args, opts) {
  const res = spawnSync(cmd, args, Object.assign({ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, opts || {}));
  return { code: res.status === null ? 1 : res.status, out: String(res.stdout || "") + String(res.stderr || ""), stdout: String(res.stdout || ""), error: res.error };
}

function git(...args) {
  const res = sh("git", args);
  if (res.code !== 0) throw new Error("git " + args[0] + " failed: " + res.out.trim().slice(-400));
  return res.stdout.trim();
}

const tail = (s, n) => { const t = String(s || ""); return t.length > n ? "…" + t.slice(-n) : t; };

/** Gemini CLI's JSON stats -> [{ model, input, output }]; thinking tokens count as output. */
function usage(stats) {
  const models = (stats && stats.models) || {};
  return Object.keys(models).map((model) => {
    const t = models[model].tokens || {};
    return { model, input: Number(t.input !== undefined ? t.input : t.prompt) || 0, output: (Number(t.candidates) || 0) + (Number(t.thoughts) || 0) };
  });
}

function gemini(prompt, model) {
  const res = sh("gemini", ["-p", prompt, "-m", model, "--approval-mode", "yolo", "-o", "json"], { timeout: AGENT_MS, env: Object.assign({}, env, { CI: "1", GEMINI_CLI_TRUST_WORKSPACE: "true" }) });
  let parsed = null;
  const start = res.stdout.indexOf("{");
  try { parsed = start >= 0 ? JSON.parse(res.stdout.slice(start)) : null; } catch (error) { parsed = null; }
  const used = usage(parsed && parsed.stats);
  if (res.error && res.error.code === "ETIMEDOUT") return { ok: false, used, text: "", error: "Gemini CLI ran past " + AGENT_MS / 60000 + " minutes." };
  if (!parsed || res.code !== 0 || parsed.error) {
    const error = "Gemini CLI: " + ((parsed && parsed.error && parsed.error.message) || tail(res.out, 600) || "exit " + res.code);
    return { ok: false, used, text: "", error, quota: QUOTA.test(error) };
  }
  return { ok: true, used, text: String(parsed.response || "") };
}

/* Gemini, waiting out a request-quota error twice, then on Flash when Pro's quota stays used (#3064). Every attempt's
   tokens go into used. */
async function agent(prompt, model, used, run = gemini, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  let res = run(prompt, model);
  used.push(...res.used);
  for (const ms of QUOTA_WAITS) {
    if (res.ok || !res.quota) return res;
    console.log("Gemini's request quota is used; trying " + model + " again in " + ms / 1000 + "s.");
    await sleep(ms);
    res = run(prompt, model);
    used.push(...res.used);
  }
  if (res.ok || !res.quota || model === MODELS.flash) return res;
  const flash = run(prompt, MODELS.flash);
  used.push(...flash.used);
  return flash.ok ? Object.assign(flash, { fellBack: true }) : flash;
}

async function oidc() {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL, token = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !token) throw new Error("The run has no OIDC token: the workflow needs permissions id-token: write.");
  const res = await fetch(url + "&audience=jarvis-worker", { headers: { Authorization: "bearer " + token } });
  if (!res.ok) throw new Error("GitHub's OIDC token request answered " + res.status + ".");
  return (await res.json()).value;
}

async function tell(body) {
  if (DRY) { console.log("report:", JSON.stringify(Object.assign({}, body, { summary: tail(body.summary, 300) }))); return {}; }
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(JARVIS, { method: "POST", headers: { "Content-Type": "application/json", "x-worker-oidc": await oidc() },
        body: JSON.stringify(Object.assign({ op: "worker-report", id: ID }, body)), signal: AbortSignal.timeout(60000) });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok !== false) return out;
      last = new Error("Jarvis answered " + res.status + ": " + (out.error || ""));
      if (res.status === 403 || res.status === 404) break;
    } catch (error) { last = error; }
    await new Promise((r) => setTimeout(r, attempt * 5000));
  }
  throw last;
}

async function github(path) {
  const res = await fetch("https://api.github.com/repos/" + REPO + path, { headers: Object.assign({ Accept: "application/vnd.github+json", "User-Agent": "jarvis-worker" },
    env.GITHUB_TOKEN ? { Authorization: "Bearer " + env.GITHUB_TOKEN } : {}) });
  if (!res.ok) throw new Error("GitHub " + path + " answered " + res.status + ".");
  return res.json();
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "task";

async function prepare() {
  let prompt = String(env.TASK_PROMPT || "").trim();
  const issue = Number(env.TASK_ISSUE) || 0;
  const pr = Number(env.TASK_PR) || 0;
  if (issue) {
    const i = await github("/issues/" + issue);
    prompt += "\n\nGitHub issue #" + issue + ": " + i.title + "\n" + String(i.body || "").slice(0, 8000);
  }
  if (DRY) return { prompt, branch: git("branch", "--show-current") };
  if (pr) {
    const p = await github("/pulls/" + pr);
    if (!p.head || !p.head.repo || p.head.repo.full_name !== REPO) throw new Error("PR #" + pr + " comes from a fork; the worker only pushes to this repo.");
    git("fetch", "-q", "origin", p.head.ref);
    git("checkout", "-q", "-B", p.head.ref, "origin/" + p.head.ref);
    return { prompt: prompt + "\n\nYou are on PR #" + pr + "'s branch " + p.head.ref + ": " + p.title, branch: p.head.ref, pr };
  }
  const base = env.TASK_BRANCH || "main";
  git("fetch", "-q", "origin", base);
  // jarvis/<issue>-… is the <type>/<n>- branch the daily fix agent reads as the bug's open PR (fix-review-failures.js triage).
  const branch = "jarvis/" + (issue ? issue + "-" + slug(TITLE) + "-" + ID : ID + "-" + slug(TITLE));
  git("checkout", "-q", "-B", branch, "origin/" + base);
  return { prompt, branch };
}

// Porcelain lines start with a two-letter status that may begin with a space, so this output is not trimmed.
function porcelain(out) {
  return String(out || "").split("\n").map((l) => l.slice(3).trim()).filter((f) => f && !f.startsWith(".gemini/"));
}

function changed() {
  const res = sh("git", ["status", "--porcelain", "--untracked-files=all"]);
  if (res.code !== 0) throw new Error("git status failed: " + res.out.trim().slice(-400));
  return porcelain(res.stdout);
}

// CI builds the social hub before the tests; pull requests leave its outputs to the bots (#2242), so main's copies go back after.
function tests() {
  if (changed().includes("js/admin-jarvis-core.js")) sh("node", ["scripts/build-jarvis-core.js"]);
  if (!DRY) sh("scripts/social-hub-build.sh", []);
  const res = sh("npm", ["run", "-s", "test:review"], { timeout: TEST_MS });
  if (!DRY) sh("node", ["scripts/social-hub-outputs.js", "--restore"]);
  return { ok: res.code === 0, out: tail(res.out, TAIL) };
}

/* The pages to screenshot: changed site pages, then the home and review pages when shared styles, front-end scripts, images
   or a page builder changed. Admin pages and the app need a sign-in, so they get a note instead. */
function pagesFor(files) {
  const list = Array.isArray(files) ? files : [];
  const pages = list.filter((f) => /\.html$/i.test(f) && !/^(tests|android|functions|scripts|\.cursor|\.github)\//.test(f) && !/^admin/.test(f)).slice(0, SHOT_PAGES);
  const shared = list.some((f) => (/^(css|js|images|img|fonts|assets|locales|i18n|lang)\//.test(f) && !/^(js|css)\/admin-/.test(f)) || /^scripts\/build-/.test(f));
  if (shared) for (const p of SHOT_DEFAULT) if (pages.length < SHOT_PAGES && !pages.includes(p)) pages.push(p);
  return pages;
}

const signedIn = (files) => (files || []).some((f) => /^admin\.html$|^(js|css)\/admin-|^android\//.test(f));

async function serve(root, port) {
  const proc = spawn("python3", [path.join(root, "scripts/static-server.py"), String(port)], { cwd: root, stdio: "ignore" });
  const url = "http://127.0.0.1:" + port + "/";
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).status < 500) return { proc, url }; } catch (error) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  proc.kill();
  throw new Error("The static server on port " + port + " did not start.");
}

// Only the local server answers: fonts, analytics and APIs are cut off, as in the Playwright suite (#2995).
async function shot(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  try {
    await context.route("**/*", (r) => (/^http:\/\/127\.0\.0\.1:/.test(r.request().url()) ? r.continue() : r.abort()));
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "load", timeout: 20000 }).catch(() => null);
    if (!res || res.status() >= 400) return null;
    await page.waitForTimeout(600);
    const buf = await page.screenshot({ type: "jpeg", quality: 60 });
    return buf.length <= SHOT_BYTES ? buf.toString("base64") : null;
  } finally { await context.close(); }
}

/* After the commit: each page from the commit before (a detached worktree) and from HEAD, each tree on its own static server.
   -> { shots: [{ page, before, after }] in base64 JPEG, note }. A failure only costs the screenshots, never the task. */
async function previews(files) {
  const pages = pagesFor(files);
  if (!pages.length) return { shots: [], note: signedIn(files) ? "No screenshots: admin and app screens need a sign-in." : "" };
  const base = path.join(env.RUNNER_TEMP || os.tmpdir(), "jarvis-before-" + ID);
  const servers = [];
  try {
    require("./playwright-sandbox");
    const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
    const install = sh("node", [cli, "install", "--with-deps", "chromium"], { timeout: SHOT_INSTALL_MS });
    if (install.code !== 0) throw new Error("Chromium did not install: " + tail(install.out, 200));
    git("worktree", "add", "-q", "--detach", base, "HEAD~1");
    const after = await serve(process.cwd(), 8791);
    servers.push(after.proc);
    const before = await serve(base, 8792);
    servers.push(before.proc);
    const browser = await require("playwright").chromium.launch();
    try {
      const shots = [];
      for (const page of pages) shots.push({ page, before: await shot(browser, before.url + page), after: await shot(browser, after.url + page) });
      return { shots: shots.filter((s) => s.before || s.after), note: signedIn(files) ? "Admin and app screens need a sign-in, so they have no screenshots." : "" };
    } finally { await browser.close(); }
  } catch (error) {
    return { shots: [], note: "Screenshots failed: " + String(error.message || error).slice(0, 200) };
  } finally {
    servers.forEach((p) => p.kill());
    sh("git", ["worktree", "remove", "--force", base]);
  }
}

async function main() {
  const used = [];
  await tell({ state: "running" });
  const task = await prepare();
  if (task.prompt.length < 20) throw new Error("The task has no prompt.");
  let run = await agent(PREAMBLE + task.prompt, MODELS[TIER], used);
  if (!run.ok) return tell({ state: "failed", error: run.error, reason: run.quota ? "quota" : undefined, models: used });
  let summary = (run.fellBack ? "(Pro's request quota stayed used, so Flash made this change.)\n\n" : "") + run.text;
  if (!changed().length) return tell({ state: "nochange", summary, models: used });
  let t = tests();
  if (!t.ok) {
    run = await agent(PREAMBLE + task.prompt + "\n\nYour change is in the working tree, but `npm run test:review` fails:\n\n" + t.out
      + "\n\nFix the cause so the tests pass. Change a test only when the test itself is wrong, and say why.", MODELS.pro, used);
    if (run.ok) summary += "\n\nAfter the tests failed: " + run.text;
    else if (run.quota) return tell({ state: "failed", error: run.error, reason: "quota", summary: summary + "\n\nTest output:\n" + t.out, tests: "fail", models: used });
    t = tests();
  }
  if (!t.ok) return tell({ state: "failed", error: "npm run test:review still fails after a repair round.", summary: summary + "\n\nTest output:\n" + t.out, tests: "fail", models: used });
  const files = changed();
  if (DRY) return tell({ state: "done", branch: task.branch, summary, files, tests: "pass", models: used, shotNote: "Would screenshot: " + (pagesFor(files).join(", ") || "nothing") });
  git("add", "-A", "--", ".", ":(exclude).gemini");
  git("-c", "user.name=Jarvis worker", "-c", "user.email=kaanmuar@users.noreply.github.com", "commit", "-q", "-m", TITLE + "\n\nJarvis worker task " + ID + " (#2957).");
  const pics = await previews(files);
  git("push", "-q", ...(task.pr ? [] : ["-f"]), "origin", "HEAD:refs/heads/" + task.branch);
  return tell({ state: "done", branch: task.branch, summary, files, tests: "pass", models: used, shots: pics.shots, shotNote: pics.note });
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error.stack || error);
    await tell({ state: "failed", error: String(error.message || error).slice(0, 500) }).catch((e) => console.error("Jarvis did not take the report: " + e.message));
    process.exit(1);
  });
}

module.exports = { usage, slug, porcelain, agent, pagesFor, MODELS, PREAMBLE };
