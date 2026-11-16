#!/usr/bin/env node
// Pre-flight gatekeeper (#1970): runs before every chat turn so the expensive agent starts small and informed.
//   session  sessionStart: budget line and open worktrees
//   prompt   beforeSubmitPrompt: answers scripted requests itself, blocks once at half context or for an
//            expensive model on a small task over 70% of the plan, and starts the context pack in the background
//            (and, hourly, scripts/fix-review-failures-sync.js)
//   tool     postToolUse: hands the agent the context pack once per turn
//   stop     stop: writes the handoff once the chat passes half its context
//   pack     (background) builds the pack: local rule hints, referenced tickets, the Cloudflare brain, and open PRs
//            or other worktrees on the same files (scripts/open-work.js, #2969)
//   plan     `node .cursor/hooks/preflight.js plan "<prompt>"` prints the pack, for automations
// Every failure fails open: the prompt goes through untouched.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const HOME = os.homedir();
const STATE = process.env.PREFLIGHT_STATE || path.join(HOME, ".cursor", "preflight");
const ROOT = path.resolve(__dirname, "..", "..");
const R = "repos/kaanmuar/kaanmuar.github.io";
// Transcripts hold messages and tool calls but not tool results, so 200 KB is about 100k tokens of context.
const HANDOFF_BYTES = Number(process.env.PREFLIGHT_HANDOFF_BYTES) || 200000;
const CONFIG = path.join(HOME, ".cursor", "preflight", "config.json");
const EXPENSIVE = /opus|fable|-max|sol|ultra/i;
const COLUMNS = { backlog: "3f4ac4fe", next: "dc8fb26d", design: "a8250664", dev: "698df321", qa: "71ce1b86", stg: "727e0727", prod: "060490af", done: "bebf6b88" };

// Rules that only load on matching files; the pack names them when the prompt is about their subject.
const RULE_HINTS = [
  [/jarvis|android|admin-jarvis|snapshot/i, ".cursor/rules/jarvis-mobile-parity.mdc"],
  [/clip|tiktok|youtube|reel|skit|voice|social|video|short/i, ".cursor/rules/social-clips.mdc"],
  [/playwright|e2e|chromium|spec\b|screenshot/i, ".cursor/rules/playwright-sandbox.mdc"],
];

fs.mkdirSync(STATE, { recursive: true });
const file = (name) => path.join(STATE, name);
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } };
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const out = (v) => process.stdout.write(JSON.stringify(v));
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: 6000, stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const convState = (id) => readJson(file(`${id}.json`), {});
const saveConv = (id, s) => writeJson(file(`${id}.json`), s);

const plan = require(path.join(ROOT, "scripts", "cursor-plan.js"));
const planPercent = () => plan.planPercent(plan.readCache(), Date.now());

function budgetLine() {
  const pct = planPercent();
  if (pct == null) return "";
  const mode = pct >= 100 ? "on demand: every token is billed" : pct >= 70 ? "over 70%: prefer cheap models and subagents" : "inside included usage";
  return `Cursor plan ${pct.toFixed(0)}% used (${mode}).`;
}

function classify(prompt) {
  const p = prompt.trim();
  const words = p.split(/\s+/).length;
  if (/\b(build|implement|design|refactor|migrate|architecture|investigate|new (feature|page|app)|from scratch|end to end)\b/i.test(p) || p.length > 900) return "large";
  if (words <= 25 && /^(what|why|how|where|when|which|who|is|are|does|do|can|did|should)\b/i.test(p) && !/\b(fix|add|change|make|create|update|remove)\b/i.test(p)) return "question";
  if (p.length < 300 && /\b(typo|rename|copy|wording|text|label|colou?r|bump|tweak|spacing|padding|margin|translate|move .* to)\b/i.test(p)) return "small";
  return "medium";
}

const ADVICE = {
  question: "a question: Auto or a Haiku/Composer-class model answers it; no worktree or ticket needed unless it turns into work.",
  small: "a small edit: Auto or a Composer/Sonnet-class model; read only the named files, no codebase exploration.",
  medium: "a normal ticket: Sonnet-class model; use the pack's files before searching, and an explore subagent for wider searches.",
  large: "a large change: plan first (Plan mode), keep the strong model for design, hand searches and CI investigation to subagents.",
};

function transcriptBytes(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}

function writeHandoff(input) {
  const text = (() => { try { return fs.readFileSync(input.transcript_path, "utf8"); } catch { return ""; } })();
  const count = (re) => { const m = {}; for (const x of text.matchAll(re)) m[x[1]] = (m[x[1]] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]).map((e) => e[0]); };
  const branch = count(/\b((?:feat|fix|chore|design)\/\d+[\w.-]*)/g)[0] || "";
  const colour = /^(\d)\1\1$|^(\d)\2\2\2\2\2$/;
  const tickets = [...new Set([branch.match(/\/(\d+)/)?.[1], ...count(/(?:^|[\s(\[])#(\d{3,5})\b/gm).filter((n) => !colour.test(n))].filter(Boolean))].slice(0, 3);
  const prs = count(/kaanmuar\.github\.io\/pull\/(\d+)/g).slice(0, 2);
  const body = [
    `Continue ticket #${tickets[0] || "?"} in a new chat.`,
    branch && `Branch: ${branch} (worktree: scripts/ticket-worktree.sh ${branch}).`,
    prs.length && `PR: ${prs.map((n) => `#${n}`).join(", ")}.`,
    tickets.length > 1 && `Also mentioned: ${tickets.slice(1).map((n) => `#${n}`).join(", ")}.`,
    `Check what is left with: gh api ${R}/issues/${tickets[0] || "<n>"} -q .body`,
  ].filter(Boolean).join("\n");
  fs.writeFileSync(file(`handoff-${input.conversation_id}.md`), body);
  return body;
}

// Scripted requests: short, exact phrasings that need a script, not a model. Prefix "agent:" to skip.
const HANDLERS = [
  [/^(quota|usage|budget)\??$/i, () => plan.quotaLine(plan.readCache(), Date.now())],
  [/^move #?(\d+) to (backlog|next|design|dev|qa|stg|prod|done)$/i, (m) => {
    const item = sh("scripts/gh-budget.sh", ["--item", m[1]]);
    sh("scripts/gh-budget.sh", ["project", "item-edit", "--id", item, "--project-id", "PVT_kwDOFLbZIM4BokiS", "--field-id", "PVTSSF_lADOFLbZIM4BokiSzhnEBTE", "--single-select-option-id", COLUMNS[m[2].toLowerCase()]]);
    return `#${m[1]} moved to ${m[2]}.`;
  }],
  [/^(?:status|state) (?:of )?#?(\d+)\??$/i, (m) => {
    const i = JSON.parse(sh("gh", ["api", `${R}/issues/${m[1]}`]));
    const kind = i.pull_request ? (i.pull_request.merged_at ? "PR merged" : `PR ${i.state}`) : `issue ${i.state}`;
    return `#${m[1]} ${kind}: ${i.title}\nLabels: ${i.labels.map((l) => l.name).join(", ") || "none"}\n${i.html_url}`;
  }],
  [/^ci (?:for |of )?#?(\w+)\??$/i, (m) => {
    let sha = m[1];
    if (/^\d+$/.test(sha)) sha = sh("gh", ["api", `${R}/pulls/${sha}`, "-q", ".head.sha"]);
    const runs = JSON.parse(sh("gh", ["run", "list", "--commit", sha, "--json", "name,status,conclusion,url"]));
    if (!runs.length) return `No runs for ${sha.slice(0, 7)} yet.`;
    return runs.map((r) => `${r.conclusion || r.status}  ${r.name}${r.conclusion === "failure" ? `  ${r.url}` : ""}`).join("\n");
  }],
  [/^(worktrees|tickets in flight)\??$/i, () => sh("git", ["worktree", "list"]).split("\n").filter((l) => l.includes(".worktrees")).map((l) => l.replace(/^.*\.worktrees\//, "")).join("\n") || "No ticket worktrees."],
  // Renders run in studio-render.yml (#2056): "render evergreen --start 2026-11-10 for #1990", "render skit friday-release".
  [/^render (?:(tips|skit) )?([a-z0-9-]+)((?: --[a-z]+ [\w,.:-]+)*)(?: for #?(\d+))?$/, (m) => {
    const studio = require(path.join(ROOT, "scripts/studio-render.js"));
    const j = studio.job(Object.assign(studio.parseCommand(`/render ${m[1] || "tips"} ${m[2]}${m[3]}`), m[4] ? { ticket: m[4] } : {}));
    sh("gh", ["workflow", "run", "studio-render.yml", "-R", "kaanmuar/kaanmuar.github.io", ...Object.entries(j).flatMap(([k, v]) => ["-f", `${k}=${v}`])]);
    return `Render of ${j.kind} ${j.name} (${j.mode}) started: https://github.com/kaanmuar/kaanmuar.github.io/actions/workflows/studio-render.yml\nIts review PR opens when it finishes${j.ticket ? `, and #${j.ticket} gets the links` : ""}.`;
  }],
  [/^handoff$/i, (m, input) => fs.existsSync(file(`handoff-${input.conversation_id}.md`)) ? fs.readFileSync(file(`handoff-${input.conversation_id}.md`), "utf8") : writeHandoff(input)],
];

// Worktree locks (#2244, scripts/worktree-lock.sh): keeps this chat's heartbeat fresh, and returns the worktrees
// another chat took over from it, clearing that note once `report` is set.
function worktreeLocks(id, report) {
  const lost = [];
  if (!id || id === "none") return lost;
  let base, names;
  try {
    base = path.join(sh("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { timeout: 2000 }), "worktrees");
    names = fs.readdirSync(base);
  } catch { return lost; }
  const now = Math.floor(Date.now() / 1000);
  for (const name of names) {
    const p = path.join(base, name, "chat-lock");
    let lock;
    try { lock = Object.fromEntries(fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))); } catch { continue; }
    if (lock.chat === id && now - Number(lock.heartbeat) >= 60) lock.heartbeat = String(now);
    else if (lock.chat !== id && lock.previous === id && report) {
      let dir = name;
      try { dir = path.dirname(fs.readFileSync(path.join(base, name, "gitdir"), "utf8").trim()); } catch {}
      lost.push(`${dir} (now held by chat ${lock.chat})`);
      delete lock.previous;
    } else continue;
    try { fs.writeFileSync(p, Object.entries(lock).map(([k, v]) => `${k}=${v}\n`).join("")); } catch {}
  }
  return lost;
}

// Feeds the cloud daily fix from the Mac (#2419): its Cursor plan and work-log rows, at most once an hour.
function syncDailyFix() {
  const stamp = file("fix-review-sync.json");
  try { if (Date.now() - fs.statSync(stamp).mtimeMs < 3600000) return; } catch {}
  try {
    fs.utimesSync(stamp, new Date(), new Date());
  } catch {
    fs.writeFileSync(stamp, "{}");
  }
  spawn(process.execPath, [path.join(ROOT, "scripts", "fix-review-failures-sync.js")], { cwd: ROOT, detached: true, stdio: "ignore" }).unref();
}

function onPrompt(input) {
  const prompt = String(input.prompt || "").trim();
  const id = input.conversation_id || "none";
  const s = convState(id);
  worktreeLocks(id, false);
  try { syncDailyFix(); } catch {}
  if (/^agent:/i.test(prompt)) return out({ continue: true });

  if (prompt.length <= 60) {
    for (const [re, run] of HANDLERS) {
      const m = prompt.match(re);
      if (!m) continue;
      let result;
      try { result = run(m, input); } catch (e) { result = `Pre-flight could not run that (${String(e.message).split("\n")[0]}). Resend with "agent:" in front to ask the agent.`; }
      log({ id, kind: "scripted", prompt });
      return out({ continue: false, user_message: `${result}\n\n(Answered by the pre-flight script, no tokens spent. Start with "agent:" to ask the agent instead.)` });
    }
  }

  const bytes = transcriptBytes(input.transcript_path);
  if (bytes > HANDOFF_BYTES && !s.handoffShown) {
    s.handoffShown = true; saveConv(id, s);
    const body = s.handoff || writeHandoff(input);
    log({ id, kind: "handoff", bytes });
    return out({ continue: false, user_message: `This chat is past half its context (about ${Math.round(bytes / 2000)}k tokens); every turn now re-reads all of it. Paste this into a new chat:\n\n${body}\n\nOr resend your message to continue here.` });
  }

  const kind = classify(prompt);
  const pct = planPercent();
  if (pct != null && pct >= 70 && EXPENSIVE.test(input.model || "") && (kind === "question" || kind === "small") && !s.modelShown) {
    s.modelShown = true; saveConv(id, s);
    log({ id, kind: "model-advice", model: input.model, class: kind });
    return out({ continue: false, user_message: `The plan is ${pct.toFixed(0)}% used and this looks like ${ADVICE[kind]} You are on ${input.model}. Switch the model and resend, or resend as is to keep it.` });
  }

  s.generation = input.generation_id; s.class = kind; s.delivered = false; saveConv(id, s);
  fs.writeFileSync(file(`${id}.prompt`), prompt);
  try {
    spawn(process.execPath, [__filename, "pack", id, String(input.generation_id || ""), input.model || ""], { detached: true, stdio: "ignore" }).unref();
  } catch {}
  log({ id, kind: "pass", class: kind, model: input.model });
  out({ continue: true });
}

async function buildPack(prompt, model, chat) {
  const kind = classify(prompt);
  const lines = [`Pre-flight (#1970): this is ${ADVICE[kind]}`];
  const work = kind === "question" ? null : (() => { try { return require(path.join(ROOT, "scripts", "open-work.js")); } catch { return null; } })();
  const warm = work ? work.withDeadline(Promise.all([work.warm(), work.trackedFiles()]), 8000, []) : null;
  let likely = [];
  const budget = budgetLine();
  if (budget) lines.push(budget);
  const rules = RULE_HINTS.filter(([re]) => re.test(prompt)).map(([, r]) => r);
  const refs = [...new Set([...prompt.matchAll(/#(\d{3,5})\b/g)].map((m) => m[1]))].slice(0, 4);
  for (const n of refs) {
    try {
      const i = JSON.parse(sh("gh", ["api", `${R}/issues/${n}`], { timeout: 4000 }));
      lines.push(`#${n} (${i.pull_request ? "PR" : "issue"}, ${i.state}): ${i.title}`);
    } catch {}
  }
  const idents = [...new Set(prompt.match(/`[^`]{3,60}`|\b[\w-]+\.(?:js|html|css|kt|py|sh|yml|mdc)\b|\b[a-z]+[A-Z]\w+\b|\b\w+_\w+\b/g) || [])].map((x) => x.replace(/`/g, "")).slice(0, 5);
  for (const term of idents) {
    try {
      const hits = sh("git", ["grep", "-l", "-F", "--", term, ":!*.min.*", ":!media/*"], { timeout: 3000 }).split("\n").filter(Boolean);
      if (hits.length && hits.length <= 8) lines.push(`\`${term}\` appears in: ${hits.join(", ")}`);
    } catch {}
  }
  const cfg = readJson(CONFIG, {});
  if (cfg.url && cfg.token) {
    try {
      const res = await fetch(`${cfg.url}/triage`, {
        method: "POST", signal: AbortSignal.timeout(12000),
        headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.slice(0, 4000), model, class: kind }),
      });
      const t = res.ok ? await res.json() : null;
      if (t) {
        if (t.plan?.length && (kind === "medium" || kind === "large")) lines.push("Draft plan from a cheap model (a starting point; the repo rules win):", ...t.plan.map((x, i) => `${i + 1}. ${x}`));
        if (t.files?.length) lines.push("Likely files, from the repo index (check these before searching wider):", ...t.files.map((f) => `- ${f.ref}${f.why ? `: ${f.why}` : ""}`));
        likely = (t.files || []).map((f) => String(f.ref).replace(/#.*$/, ""));
        if (t.tickets?.length) lines.push("Related past tickets:", ...t.tickets.map((x) => `- #${x.ref} ${x.title}`));
        for (const r of t.rules || []) if (!rules.includes(r)) rules.push(r);
      }
    } catch {}
  }
  // Open PRs and other chats' worktrees on the same files (#2969); cached, time-boxed, silent on any failure.
  if (work) {
    try {
      const [, tracked] = await warm;
      if (tracked?.size) {
        const files = [...new Set([...work.resolveFiles(prompt, tracked), ...likely.filter((f) => tracked.has(f))])].slice(0, 12);
        const found = files.length ? await work.withDeadline(work.openWork(files, { chat, tickets: refs }), 4000, {}) : {};
        const text = work.formatWork(found);
        if (text) lines.push(text);
      }
    } catch {}
  }
  if (rules.length) lines.push(`Read before editing: ${rules.join(", ")}.`);
  return lines.join("\n");
}

async function onPack(id, generation, model) {
  const prompt = fs.readFileSync(file(`${id}.prompt`), "utf8");
  const pack = await buildPack(prompt, model, id);
  const s = convState(id);
  if (s.generation && generation && s.generation !== generation) return;
  s.pack = pack; saveConv(id, s);
}

function onTool(input) {
  const id = input.conversation_id || "none";
  const s = convState(id);
  const lost = worktreeLocks(id, true).map((w) => `Another chat took over the worktree ${w}, with --take or after this chat's lock lapsed (#2244). Stop editing, committing and pushing there; tell Carlos, and only take it back with scripts/ticket-worktree.sh <branch> --take if he says so.`);
  const due = s.pack && !s.delivered && !(s.generation && input.generation_id && s.generation !== input.generation_id);
  if (due) { s.delivered = true; saveConv(id, s); }
  const context = [due && s.pack, ...lost].filter(Boolean).join("\n");
  out(context ? { additional_context: context } : {});
}

function onSession(input) {
  const parts = [budgetLine()];
  try {
    const wt = sh("git", ["worktree", "list"]).split("\n").filter((l) => l.includes(".worktrees")).length;
    if (wt) parts.push(`${wt} ticket worktrees are open; \`git worktree list\` names them.`);
  } catch {}
  parts.push("Short requests like `quota`, `status #123`, `ci #123`, `move #123 to qa` are answered by the pre-flight hook without a model.");
  out({ additional_context: parts.filter(Boolean).join(" ") });
}

function onStop(input) {
  const id = input.conversation_id || "none";
  const s = convState(id);
  if (!s.handoff && transcriptBytes(input.transcript_path) > HANDOFF_BYTES) {
    s.handoff = writeHandoff(input); saveConv(id, s);
  }
  out({});
}

function log(row) {
  try { fs.appendFileSync(file("log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n"); } catch {}
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "pack") return onPack(...args);
  if (mode === "plan") {
    const pack = await buildPack(args.join(" ") || fs.readFileSync(0, "utf8"), process.env.PREFLIGHT_MODEL || "", process.env.CURSOR_CONVERSATION_ID);
    return process.stdout.write(`${pack}\n`, () => process.exit(0));
  }
  const raw = fs.readFileSync(0, "utf8");
  const input = raw ? JSON.parse(raw) : {};
  if (mode === "prompt") return onPrompt(input);
  if (mode === "tool") return onTool(input);
  if (mode === "session") return onSession(input);
  if (mode === "stop") return onStop(input);
  out({});
}

main().catch(() => { if (!process.argv.includes("pack") && !process.argv.includes("plan")) out(process.argv[2] === "prompt" ? { continue: true } : {}); });
