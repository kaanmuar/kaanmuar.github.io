#!/usr/bin/env node
/* The daily PageSpeed routine (#1978), one step per command; .github/workflows/pagespeed-daily.yml runs them in order.

   check    --out check.json [--limit n] [--only url,...]   PageSpeed, mobile and desktop, on every sitemap page (PAGESPEED_KEY)
   safe     --check check.json --report safe.json            the safe fixes (scripts/pagespeed/fixes.js) on the 6 worst pages under 90
   ai       --check check.json --report ai.json              Gemini's edits on the worst pages (GEMINI_API_KEY)
   measure  --check check.json --report x.json --base dir [--branch b]
                                                            local Lighthouse on main (base) and this checkout for the pages the
                                                            diff touches, and the verdict; fixes on pages the builders rewrote
                                                            are dropped from the report
   record   [--check check.json] [--safe s.json] [--ai a.json] [--error text]
                                                            writes data/pagespeed/latest.json and adds the run to runs.json */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const pagesLib = require("./pagespeed/pages");
const psi = require("./pagespeed/psi");
const fixes = require("./pagespeed/fixes");
const routine = require("./pagespeed/routine");
const ai = require("./pagespeed/ai");

const ROOT = process.cwd();
const DATA = "data/pagespeed";
const COMPRESSED = DATA + "/compressed.json";

function args(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].startsWith("--")) {
      const k = list[i].slice(2);
      const v = list[i + 1] && !list[i + 1].startsWith("--") ? list[++i] : true;
      out[k] = v;
    } else out._.push(list[i]);
  }
  return out;
}

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n"); };
const readText = (rel) => { const f = path.join(ROOT, rel); try { return fs.statSync(f).isFile() ? fs.readFileSync(f, "utf8") : null; } catch (error) { return null; } };
const log = (...a) => console.log(...a);

function runInfo() {
  const id = process.env.GITHUB_RUN_ID;
  return id ? { id: Number(id), url: (process.env.GITHUB_SERVER_URL || "https://github.com") + "/" + process.env.GITHUB_REPOSITORY + "/actions/runs/" + id } : null;
}

async function check(o) {
  let list = pagesLib.pages(ROOT);
  if (o.only) { const only = String(o.only).split(","); list = list.filter((p) => only.includes(p.url)); }
  if (o.limit) list = list.slice(0, Number(o.limit));
  const key = process.env.PAGESPEED_KEY;
  if (!key) log("PAGESPEED_KEY is not set; PageSpeed allows only a few calls without it.");
  const jobs = list.flatMap((p) => psi.MODES.map((mode) => ({ p, mode })));
  let done = 0;
  const results = await psi.pool(jobs, Number(o.concurrency) || 12, async ({ p, mode }) => {
    const r = await psi.run(fetch, p.url, mode, key, { tries: 2 });
    done += 1;
    if (done % 50 === 0 || !r.ok) log(done + "/" + jobs.length + " " + p.url + " " + mode + ": " + (r.ok ? r.score : r.error));
    return r;
  });
  const pages = list.map((p) => Object.assign({}, p));
  jobs.forEach((j, i) => { pages[list.indexOf(j.p)][j.mode] = results[i]; });
  const out = { at: new Date().toISOString(), run: runInfo(), pages };
  writeJson(o.out, out);
  const row = routine.runRow({ check: out });
  log("Checked " + row.pages + " pages: " + row.below + " under " + routine.THRESHOLD + ", " + row.failed + " without a score; average mobile " + row.avg.mobile + ", desktop " + row.avg.desktop + ".");
}

async function safe(o) {
  const data = readJson(o.check, { pages: [] });
  const todo = routine.toFix(data.pages);
  const report = { kind: "safe", fixes: [], images: [] };
  const lazyCandidates = todo.filter((p) => fixes.lazyCandidates(readText(p.file) || "")).map((p) => p.file);
  let places = {};
  if (lazyCandidates.length) {
    try {
      places = await require("./pagespeed/lighthouse").positions({ root: ROOT, files: lazyCandidates, log });
    } catch (error) {
      log("Chrome could not place the images, so nothing is lazy-loaded: " + error.message);
    }
  }
  todo.forEach((p) => {
    const html = readText(p.file);
    if (html === null) return;
    const r = fixes.fixPage(html, { url: p.url, psi: { mobile: p.mobile, desktop: p.desktop }, readLocal: readText, places: places[p.file] });
    if (r.html !== html) {
      fs.writeFileSync(path.join(ROOT, p.file), r.html);
      r.fixes.forEach((f) => report.fixes.push(Object.assign({ page: p.file }, f)));
    }
  });
  const done = readJson(path.join(ROOT, COMPRESSED), { files: {} });
  const images = Array.from(new Set(todo.flatMap((p) => fixes.imagesToCompress({ url: p.url, psi: { mobile: p.mobile, desktop: p.desktop } })))).filter((f) => !done.files[f] && fs.existsSync(path.join(ROOT, f)));
  if (images.length) {
    let sharp = null;
    try { sharp = require("sharp"); } catch (error) { log("sharp is not installed; images are left as they are."); }
    for (const f of sharp ? images : []) {
      try {
        const out = await fixes.compress(sharp, fs.readFileSync(path.join(ROOT, f)), f);
        done.files[f] = new Date().toISOString().slice(0, 10);
        if (!out) continue;
        fs.writeFileSync(path.join(ROOT, f), out.buf);
        report.images.push({ file: f, before: out.before, after: out.after });
        report.fixes.push({ page: f, kind: "image", detail: "Compressed " + f + " from " + Math.round(out.before / 1024) + " KB to " + Math.round(out.after / 1024) + " KB." });
      } catch (error) {
        log("Could not compress " + f + ": " + error.message);
      }
    }
    writeJson(path.join(ROOT, COMPRESSED), done);
  }
  writeJson(o.report, report);
  const below = data.pages.filter(routine.needsFix).length;
  log(report.fixes.length + " safe fixes on the " + todo.length + " worst of " + below + " pages under " + routine.THRESHOLD + ".");
}

async function aiFix(o) {
  const data = readJson(o.check, { pages: [] });
  const report = { kind: "ai", fixes: [], summaries: [] };
  for (const p of ai.pick(data.pages, readText)) {
    const files = {};
    files[p.file] = readText(p.file);
    ai.assets(p, readText).forEach((f) => { files[f] = readText(f); });
    try {
      const answer = ai.parse(await ai.ask(fetch, process.env, ai.prompt(p, files)));
      const r = ai.apply(files, answer.edits);
      Object.keys(r.texts).forEach((f) => { if (r.texts[f] !== files[f]) fs.writeFileSync(path.join(ROOT, f), r.texts[f]); });
      r.applied.forEach((e) => report.fixes.push({ page: p.file, file: e.file, kind: "gemini", detail: e.file + ": " + e.why }));
      report.summaries.push({ page: p.file, summary: String(answer.summary || "").slice(0, 240), applied: r.applied.length, skipped: r.skipped.slice(0, 6) });
    } catch (error) {
      report.summaries.push({ page: p.file, error: String(error.message || error).slice(0, 200) });
    }
  }
  writeJson(o.report, report);
  log(report.fixes.length + " Gemini edits on " + report.summaries.length + " pages.");
}

function changedFiles() {
  const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""));
}

async function measure(o) {
  const data = readJson(o.check, { pages: [] });
  const report = readJson(o.report, { fixes: [] });
  const files = changedFiles();
  const kept = report.fixes.filter((f) => files.includes(f.file || f.page));
  const dropped = report.fixes.length - kept.length;
  report.fixes = kept;
  report.files = files;
  if (dropped) report.note = dropped + " fix" + (dropped === 1 ? " was" : "es were") + " dropped: the pages are generated, and their builder (scripts/regen-generated.sh) wrote them again. Those fixes belong in the builder.";
  const code = files.filter((f) => !f.startsWith(DATA + "/"));
  if (!code.length) {
    report.verdict = { up: false, reason: "Nothing to change.", drops: 0, rises: 0, missing: 0 };
    report.measured = [];
    writeJson(o.report, report);
    log("Nothing changed.");
    return;
  }
  const pages = routine.affected(code, data.pages, readText).slice(0, routine.PER_RUN);
  try {
    const lighthouse = require("./pagespeed/lighthouse");
    report.measured = await lighthouse.measure({ files: pages.map((p) => p.file), base: o.base, head: ROOT, runs: Number(o.runs) || 5, log });
    report.measured.forEach((row) => { row.url = (pages.find((p) => p.file === row.file) || {}).url || pagesLib.urlFor(row.file); });
    report.verdict = routine.verdict(report.measured);
  } catch (error) {
    report.measured = [];
    report.verdict = { up: false, reason: "Lighthouse did not run: " + String(error.message || error).slice(0, 160), drops: 0, rises: 0, missing: 0 };
  }
  if (o.branch) report.branch = String(o.branch);
  writeJson(o.report, report);
  log("Verdict: " + (report.verdict.up ? "up" : "not up") + ". " + report.verdict.reason);
}

function record(o) {
  const check = o.check ? readJson(o.check, null) : null;
  const safeRep = o.safe ? readJson(o.safe, null) : null;
  const aiRep = o.ai ? readJson(o.ai, null) : null;
  const dir = path.join(ROOT, DATA);
  const error = o.error && o.error !== true ? String(o.error) : !check ? "The PageSpeed check did not finish." : "";
  if (check) writeJson(path.join(dir, "latest.json"), routine.latest(check));
  const runs = readJson(path.join(dir, "runs.json"), { runs: [] });
  const row = routine.runRow({ check, safe: safeRep, ai: aiRep, run: runInfo(), at: new Date().toISOString(), error });
  writeJson(path.join(dir, "runs.json"), { runs: routine.record(runs.runs, row) });
  log("Recorded the run: " + row.pages + " pages, " + row.below + " under " + routine.THRESHOLD + (row.safe && row.safe.branch ? ", safe branch " + row.safe.branch : "") + (row.ai && row.ai.branch ? ", Gemini branch " + row.ai.branch : "") + ".");
}

const COMMANDS = { check, safe, ai: aiFix, measure, record };

if (require.main === module) {
  const o = args(process.argv.slice(2));
  const cmd = COMMANDS[o._[0]];
  if (!cmd) { console.error("Usage: node scripts/pagespeed-daily.js check|safe|ai|measure|record [options]"); process.exit(2); }
  Promise.resolve(cmd(o)).catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { args, changedFiles };
