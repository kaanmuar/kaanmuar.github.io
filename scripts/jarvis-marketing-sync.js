#!/usr/bin/env node
/* Syncs the private outreach folder with Jarvis > Marketing (#1730). The kaanmuar/qa-lab-outreach Action runs it
   every 3 hours, after each job, and at once when Jarvis queues a command (`scripts/outreach-weekly.js sync`, #1980):
     1. runs the commands queued from Jarvis in jarvis_commands, oldest first, and marks each done or failed;
     2. uploads the folder to jarvis_settings/marketing_sync: leads per week, replies with their drafts, the LinkedIn
        day, do-not-contact, each job's last run, the campaigns paused for holidays and the weekly KPIs.

     node scripts/jarvis-marketing-sync.js --dir <outreach folder> [--state <outreach-weekly folder>] [--dry]
     node scripts/jarvis-marketing-sync.js --requeue <JARVIS_APPLIED file>   # the Action's commit failed: run them again

   While an agent run holds <state>/lock, commands that edit the folder wait for the next sync.
   The folder's rows stay out of this repo; only the owner-only Firestore document and the jarvis function see them.
   Uses GOOGLE_APPLICATION_CREDENTIALS in the Action, else the gcloud login, like scripts/jarvis-outreach-plan.js. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { execSync, execFileSync, spawn } = require("child_process");
const autopilot = require("./marketing-leads-autopilot");

const PROJECT = "carlosm-interactive-cv";
const FN = path.join(__dirname, "..", "functions");
const R = require(path.join(FN, "engagement-reports"));
const YES = /^(yes|y|x|1)$/i;
const JOBS = ["prospects", "leads", "replies"];
const REPLY_DAYS = 14;
const LEAD_FIELDS = ["campaign", "email", "org", "host", "cc", "language", "sequence", "first_name", "last_name", "title", "score",
  "top_finding", "top_finding_en", "missing", "live_report_url", "report_read"];
const EDITS = new Set(["approve", "approve-week", "upload", "linkedin", "dnc", "run", "lead-set", "lead-drop", "allow-personal"]);
// Commands whose only record is the folder, safe to run twice (uploads skip leads already in Instantly): when the
// Action's commit cannot reach main they are queued again (#2519).
const SAVES = new Set([...EDITS, "replied"].filter((a) => a !== "run"));

// --- CSV: quoted fields may hold commas, quotes and line breaks; the newline style of the file is kept. -----------
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const lines = rows.filter((r) => r.some((v) => v !== ""));
  const header = lines[0] || [];
  return { header, rows: lines.slice(1).map((v) => Object.fromEntries(header.map((h, i) => [h, v[i] || ""]))), eol: /\r\n/.test(text) ? "\r\n" : "\n" };
}

function toCsv(header, rows, eol) {
  const cell = (v) => (/[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  return [header, ...rows.map((r) => header.map((h) => r[h] || ""))].map((r) => r.map(cell).join(",")).join(eol || "\n") + (eol || "\n");
}

const read = (file, fallback) => { try { return fs.readFileSync(file, "utf8"); } catch (error) { return fallback; } };
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; } };

// --- What the folder holds ----------------------------------------------------------------------------------------
const leadFile = (dir, week) => path.join(dir, "prospects", "week" + String(week).replace(/^W/i, "") + "-leads.csv");

function leadFiles(dir) {
  const folder = path.join(dir, "prospects");
  return (fs.existsSync(folder) ? fs.readdirSync(folder) : []).filter((f) => /^week\d+-leads\.csv$/.test(f))
    .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10))
    .map((f) => ({ week: "W" + parseInt(f.slice(4), 10), file: path.join(folder, f) }));
}

// Each row says what Jarvis is doing with it (`wait`) or why it needs Carlos (`ask`, #2016).
function leads(dir, state, now) {
  const weeks = [], rows = [];
  const reruns = state ? readJson(path.join(state, "lead-reruns.json"), {}) || {} : {};
  leadFiles(dir).forEach(({ week, file }) => {
    const list = parseCsv(read(file, "")).rows;
    list.forEach((r) => {
      const d = autopilot.decide(r, reruns, now || Date.now());
      rows.push(Object.assign({ week }, Object.fromEntries(LEAD_FIELDS.map((k) => [k, String(r[k] || "").slice(0, 400)])),
        { approved: YES.test(String(r.approved || "").trim()), dropped: /^no$/i.test(String(r.approved || "").trim()), uploaded: r.uploaded || "",
          ask: d.kind === "ask" ? d.why : "", wait: d.kind === "wait" ? d.why : d.kind === "rerun" || d.kind === "translate" ? "Jarvis is on it." : "" }));
    });
    const mine = rows.filter((r) => r.week === week);
    weeks.push({
      week, total: mine.length, complete: mine.filter((r) => !r.missing).length, missing: mine.filter((r) => r.missing).length,
      approved: mine.filter((r) => r.approved).length, uploaded: mine.filter((r) => r.uploaded).length,
      ready: mine.filter((r) => r.approved && !r.missing && !r.uploaded).length, ask: mine.filter((r) => r.ask).length, dropped: mine.filter((r) => r.dropped).length
    });
  });
  return { weeks, rows };
}

function replies(dir, now) {
  const folder = path.join(dir, "tracker", "replies");
  const since = new Date(now - REPLY_DAYS * 86400000).toISOString().slice(0, 10);
  const sent = readJson(path.join(dir, "tracker", "replies-sent.json"), {});
  const days = (fs.existsSync(folder) ? fs.readdirSync(folder) : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= since).sort();
  const items = [];
  const drafts = {};
  days.forEach((f) => (readJson(path.join(folder, f.replace(".json", ".drafts.json")), []) || []).forEach((d) => { if (d && d.id) drafts[d.id] = d; }));
  days.forEach((f) => {
    (readJson(path.join(folder, f), []) || []).forEach((e) => {
      const d = drafts[e.id] || {};
      items.push({
        id: e.id, at: e.at || "", from: e.from || "", to: e.to || "", subject: String(e.subject || "").slice(0, 200), campaign: e.campaign || "",
        text: String(e.text || "").slice(0, 1500), category: d.category || "", summary: String(d.summary || "").slice(0, 300),
        lang: d.lang || "", draft: String(d.draft || "").slice(0, 4000), sent: sent[e.id] || ""
      });
    });
  });
  return { items: items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80) };
}

// "## [ ] Name, Title (Org, CC)": the organisation may hold parentheses of its own.
function linkedinHeading(line) {
  const m = /^## \[( |x|X)\] (.+), ([A-Z]{2})\)\s*$/.exec(line);
  if (!m) return null;
  const body = m[2];
  let depth = 0, open = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i] === ")") depth++;
    else if (body[i] === "(") { if (depth === 0) { open = i; break; } depth--; }
  }
  if (open < 0) return null;
  const who = body.slice(0, open).trim();
  const comma = who.indexOf(", ");
  return { sent: m[1] !== " ", name: comma < 0 ? who : who.slice(0, comma), title: comma < 0 ? "" : who.slice(comma + 2), org: body.slice(open + 1).trim(), cc: m[3] };
}

function linkedinFiles(dir) {
  const folder = path.join(dir, "linkedin");
  return (fs.existsSync(folder) ? fs.readdirSync(folder) : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
}

function linkedin(dir) {
  const date = (linkedinFiles(dir).pop() || "").slice(0, 10);
  if (!date) return { date: "", items: [] };
  const items = [];
  read(path.join(dir, "linkedin", date + ".md"), "").split(/\r?\n/).forEach((line) => {
    const h = linkedinHeading(line);
    if (h) { items.push(Object.assign(h, { profile: "", lines: [] })); return; }
    const last = items[items.length - 1];
    if (!last || !/^- /.test(line)) return;
    const url = /https:\/\/(www\.)?linkedin\.com\/[^\s)\]]+/.exec(line);
    if (url && !last.profile) last.profile = url[0];
    if (last.lines.length < 8) last.lines.push(line.slice(2).slice(0, 300));
  });
  return { date, items: items.slice(0, 80) };
}

// Each working day from 07:00 local time (the Action sets TZ=America/Bogota), writes the day's LinkedIn list once; the tool skips people listed before.
// No run writes linkedin/, so a held lock does not stop it (#2240); it only waits for that run's prospect CSVs to settle.
// Without a lock the mtimes say nothing (a fresh checkout dates every file now), so they are not read.
const SETTLE = 10 * 60 * 1000;
function linkedinDay(dir, now, run, locked) {
  const at = new Date(now);
  if (at.getDay() === 0 || at.getDay() === 6 || at.getHours() < 7) return "";
  const date = at.toLocaleDateString("en-CA");
  if (fs.existsSync(path.join(dir, "linkedin", date + ".md"))) return "";
  const folder = path.join(dir, "prospects");
  const csvs = locked && fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => /^week.*\.csv$/.test(f)) : [];
  if (csvs.some((f) => now - fs.statSync(path.join(folder, f)).mtimeMs < SETTLE)) return "";
  run(["tools/linkedin-day.py", date]);
  return "LinkedIn list for " + date + " written";
}

function dnc(dir) {
  return { items: parseCsv(read(path.join(dir, "prospects", "do-not-contact.csv"), "")).rows.map((r) => ({ value: r.email_or_domain, at: r.added_utc, reason: r.reason })).slice(-400) };
}

function jobs(state) {
  const logs = path.join(state, "logs");
  return JOBS.map((mode) => {
    const file = path.join(logs, "last-" + mode + ".txt");
    if (!fs.existsSync(file)) return { mode, at: "", notify: "", tail: [] };
    const lines = read(file, "").split(/\r?\n/).filter((l) => l.trim());
    const notify = lines.find((l) => /^NOTIFY:/.test(l));
    return { mode, at: fs.statSync(file).mtime.toISOString(), notify: notify ? notify.replace(/^NOTIFY:\s*/, "").slice(0, 300) : "", failed: lines.some((l) => /^exit \d+$/.test(l)), tail: lines.slice(-8).map((l) => l.slice(0, 200)) };
  });
}

function kpis(dir) {
  return { weeks: parseCsv(read(path.join(dir, "tracker", "weekly-kpis.csv"), "")).rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.week_start)).slice(-16) };
}

function paused(dir) {
  const p = readJson(path.join(dir, "tracker", "holiday-paused.json"), {}) || {};
  return Object.keys(p).map((name) => ({ name, why: String(typeof p[name] === "string" ? p[name] : JSON.stringify(p[name])).slice(0, 160) }));
}

function snapshot(dir, state, now) {
  return {
    at: new Date(now).toISOString(), host: process.env.GITHUB_ACTIONS ? "GitHub Actions" : os.hostname(), running: fs.existsSync(path.join(state, "lock")),
    leads: leads(dir, state, now), replies: replies(dir, now), linkedin: linkedin(dir), dnc: dnc(dir), jobs: jobs(state), paused: paused(dir), kpis: kpis(dir)
  };
}

// --- Commands from Jarvis -----------------------------------------------------------------------------------------
function editLeads(dir, week, change) {
  const file = leadFile(dir, week);
  if (!fs.existsSync(file)) throw new Error("No leads file for " + week + ".");
  const csv = parseCsv(read(file, ""));
  const result = change(csv.rows);
  fs.writeFileSync(file, toCsv(csv.header, csv.rows, csv.eol));
  return result;
}

function leadRow(rows, a) {
  const r = rows.find((x) => String(x.email).toLowerCase() === a.email);
  if (!r) throw new Error(a.email + " is not in " + a.week + ".");
  if (r.uploaded) throw new Error(a.email + " was uploaded on " + r.uploaded + ".");
  return r;
}

const tool = (dir, args) => execFileSync("python3", [path.join(dir, "tools", "instantly_campaigns.py"), ...args], { cwd: dir, encoding: "utf8", timeout: 10 * 60000 });

// The upload tool skips a row with anything in missing, so a site answered with a report reply in the last 30 days
// carries HOLD there while it runs (#2470); the marker comes off again afterwards.
const HOLD = "held: report reply in the last 30 days";

/** Hosts of a week's rows not uploaded yet, for the report-reply check. */
function weekHosts(dir, week) {
  const file = leadFile(dir, week);
  return fs.existsSync(file) ? parseCsv(read(file, "")).rows.filter((r) => !r.uploaded).map((r) => r.host) : [];
}

const HANDLERS = {
  approve: (dir, a) => editLeads(dir, a.week, (rows) => {
    const r = rows.find((x) => String(x.email).toLowerCase() === a.email);
    if (!r) throw new Error(a.email + " is not in " + a.week + ".");
    if (r.uploaded) throw new Error(a.email + " was uploaded on " + r.uploaded + ".");
    if (a.on && r.missing) throw new Error(a.email + " still needs: " + r.missing + ".");
    r.approved = a.on ? "yes" : "no";
    return (a.on ? "approved " : "unapproved ") + a.email;
  }),
  "approve-week": (dir, a) => editLeads(dir, a.week, (rows) => {
    const fresh = rows.filter((r) => !r.uploaded && !r.missing && !YES.test(String(r.approved).trim()) && !/^no$/i.test(String(r.approved).trim()));
    fresh.forEach((r) => { r.approved = "yes"; });
    return fresh.length + " approved, " + rows.filter((r) => r.missing && !r.uploaded).length + " still missing something";
  }),
  upload: (dir, a, now, state, ctx) => {
    const answered = (ctx || {}).answered;
    if (!answered) throw new Error("The report replies could not be read, so nothing was uploaded.");
    const held = editLeads(dir, a.week, (rows) => rows.filter((r) => !r.uploaded && !r.missing && answered.has(R.bare(r.host))).map((r) => { r.missing = HOLD; return r; }).length);
    let out;
    try {
      out = ((ctx || {}).tool || tool)(dir, ["leads", "--upload", "--week", a.week]);
    } finally {
      if (held) editLeads(dir, a.week, (rows) => rows.filter((r) => r.missing === HOLD).forEach((r) => { r.missing = ""; }));
    }
    const n = out.split("\n").filter((l) => /^uploaded /.test(l)).length;
    const lost = out.split("\n").filter((l) => /^no campaign /.test(l)).length;
    return n + " uploaded to Instantly" + (lost ? ", " + lost + " without a campaign" : "") + (held ? ", " + held + " held for a report reply in the last 30 days" : "");
  },
  linkedin: (dir, a) => {
    const file = path.join(dir, "linkedin", a.date + ".md");
    if (!fs.existsSync(file)) throw new Error("No LinkedIn list for " + a.date + ".");
    let hit = false;
    const text = read(file, "").split("\n").map((line) => {
      const h = linkedinHeading(line.replace(/\r$/, ""));
      if (!h || h.name !== a.name || hit) return line;
      hit = true;
      return line.replace(/^## \[( |x|X)\]/, a.sent ? "## [x]" : "## [ ]");
    }).join("\n");
    if (!hit) throw new Error(a.name + " is not on the " + a.date + " list.");
    fs.writeFileSync(file, text);
    return (a.sent ? "marked sent: " : "marked not sent: ") + a.name;
  },
  dnc: (dir, a, now) => {
    const file = path.join(dir, "prospects", "do-not-contact.csv");
    const csv = parseCsv(read(file, "email_or_domain,added_utc,reason\n"));
    if (!csv.header.length) csv.header = ["email_or_domain", "added_utc", "reason"];
    if (csv.rows.some((r) => String(r.email_or_domain).toLowerCase() === a.value)) return a.value + " was already listed";
    csv.rows.push({ email_or_domain: a.value, added_utc: new Date(now).toISOString().slice(0, 10), reason: a.reason });
    fs.writeFileSync(file, toCsv(csv.header, csv.rows, csv.eol));
    return "added " + a.value;
  },
  replied: (dir, a) => {
    const file = path.join(dir, "tracker", "replies-sent.json");
    const sent = readJson(file, {}) || {};
    sent[a.id] = a.at;
    fs.writeFileSync(file, JSON.stringify(sent, null, 1));
    return "recorded the answer";
  },
  "lead-set": (dir, a) => editLeads(dir, a.week, (rows) => {
    const r = leadRow(rows, a);
    if (!autopilot.EDITABLE.includes(a.field)) throw new Error(a.field + " cannot be set from Jarvis.");
    r[a.field] = a.value;
    autopilot.dropMissing(r, a.field === "top_finding" ? [a.field, autopilot.TRANSLATE] : [a.field]);
    return "set " + a.field + " for " + a.email + (r.missing ? "; still needs " + r.missing : "");
  }),
  "lead-drop": (dir, a) => editLeads(dir, a.week, (rows) => {
    const r = leadRow(rows, a);
    r.approved = a.on ? "no" : "";
    return (a.on ? "dropped " : "brought back ") + a.email;
  }),
  "allow-personal": (dir, a) => {
    const file = path.join(dir, "prospects", "personal-email-ok.txt");
    const text = read(file, "");
    if (!text.split(/\r?\n/).some((l) => l.split("#")[0].trim().toLowerCase() === a.email)) fs.writeFileSync(file, text + (text && !text.endsWith("\n") ? "\n" : "") + a.email + "  # allowed from Jarvis\n");
    return editLeads(dir, a.week, (rows) => {
      autopilot.dropMissing(leadRow(rows, a), [autopilot.PERSONAL]);
      return "allowed the personal address " + a.email;
    });
  },
  run: (dir, a, now, state) => {
    if (!JOBS.includes(a.job)) throw new Error("Unknown job.");
    if (process.env.GITHUB_ACTIONS) {
      execFileSync("gh", ["workflow", "run", "outreach.yml", "-f", "mode=" + a.job], { cwd: dir, encoding: "utf8", timeout: 60000 });
      return "started " + a.job + " in the outreach Action";
    }
    const script = path.join(state, "run.sh");
    if (!fs.existsSync(script)) throw new Error("run.sh is not installed in " + state + ".");
    spawn("/bin/bash", [script, a.job], { detached: true, stdio: "ignore" }).unref();
    return "started " + a.job;
  }
};

// Runs one command; returns the fields to write back, or null to leave it pending for the next sync.
// ctx: { answered: host => when, of the sites answered with a report reply in the last 30 days }.
function runCommand(cmd, dir, state, now, ctx) {
  const handler = HANDLERS[cmd.action];
  if (!handler) return { status: "failed", result: "Unknown command " + cmd.action + ".", doneAt: new Date(now).toISOString() };
  if (EDITS.has(cmd.action) && fs.existsSync(path.join(state, "lock"))) return null;
  try {
    return { status: "done", result: String(handler(dir, cmd.args || {}, now, state, ctx)).slice(0, 300), doneAt: new Date(now).toISOString() };
  } catch (error) {
    return { status: "failed", result: String((error && error.message) || error).split("\n")[0].slice(0, 300), doneAt: new Date(now).toISOString() };
  }
}

// JARVIS_APPLIED names the file the Action reads back if its commit fails.
function noteApplied(file, cmd, out) {
  if (file && out && out.status === "done" && SAVES.has(cmd.action)) fs.appendFileSync(file, cmd.ref.id + "\n");
}

async function requeue(db, file) {
  const ids = [...new Set(read(file, "").split("\n").map((l) => l.trim()).filter(Boolean))];
  await Promise.all(ids.map((id) => db.collection("jarvis_commands").doc(id)
    .update({ status: "pending", doneAt: "", result: "The outreach folder could not be saved; queued again." })));
  return ids.length;
}

function firestore() {
  const fnRequire = Module.createRequire(path.join(FN, "index.js"));
  const { Firestore } = fnRequire("@google-cloud/firestore");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return new Firestore({ projectId: PROJECT });
  const { OAuth2Client } = fnRequire("google-auth-library");
  const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
  authClient.setCredentials({ access_token: execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim(), expiry_date: Date.now() + 45 * 60000 });
  return new Firestore({ projectId: PROJECT, authClient });
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ""; };
  if (arg("--requeue")) {
    console.log((await requeue(firestore(), arg("--requeue"))) + " commands queued again");
    return;
  }
  const dir = arg("--dir");
  if (!dir || !fs.existsSync(dir)) throw new Error("Usage: node scripts/jarvis-marketing-sync.js --dir <outreach folder> [--state <folder>] [--dry]");
  const state = arg("--state") || path.join(os.homedir(), "Library", "Application Support", "QALab", "outreach-weekly");
  const dry = argv.includes("--dry");
  if (dry) {
    const s = snapshot(dir, state, Date.now());
    console.log(`${s.leads.rows.length} leads in ${s.leads.weeks.length} weeks, ${s.replies.items.length} replies, ${s.linkedin.items.length} on LinkedIn ${s.linkedin.date}, ${s.dnc.items.length} do-not-contact, ${JSON.stringify(s).length} bytes`);
    return;
  }
  const db = firestore();
  const pending = await db.collection("jarvis_commands").where("status", "==", "pending").get();
  const cmds = pending.docs.map((d) => Object.assign({ ref: d.ref }, d.data())).filter((c) => c.kind === "marketing").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const uploads = cmds.filter((c) => c.action === "upload");
  const answered = uploads.length ? await R.answeredHosts(db, uploads.flatMap((c) => weekHosts(dir, (c.args || {}).week)), Date.now()).catch(() => null) : null;
  let ran = 0, waiting = 0;
  for (const c of cmds) {
    const out = runCommand(c, dir, state, Date.now(), { answered });
    if (!out) { waiting++; continue; }
    await c.ref.update(out);
    noteApplied(process.env.JARVIS_APPLIED, c, out);
    ran++;
    console.log(c.action, out.status, out.result);
  }
  const locked = fs.existsSync(path.join(state, "lock"));
  if (!locked) {
    const notes = await autopilot.run(dir, state, { parseCsv, toCsv, leadFiles, tool, fetch, db, now: Date.now() })
      .catch((error) => ["leads autopilot failed: " + String((error && error.message) || error).split("\n")[0].slice(0, 200)]);
    if (notes && notes.length) console.log("leads autopilot: " + notes.join("; "));
  }
  try {
    const note = linkedinDay(dir, Date.now(), (args) => execFileSync("python3", args, { cwd: dir, stdio: "pipe", timeout: 120000 }), locked);
    if (note) console.log(note);
  } catch (error) {
    console.log("LinkedIn list failed: " + String((error && error.message) || error).split("\n")[0].slice(0, 200));
  }
  const s = snapshot(dir, state, Date.now());
  await db.collection("jarvis_settings").doc("marketing_sync").set(s);
  await Promise.all([1, 7, 30, 90, 365].map((d) => db.collection("jarvis_cache").doc("marketing-sync-" + d).delete().catch(() => null)));
  console.log(`${new Date().toISOString()} synced: ${ran} commands run, ${waiting} waiting for the agent run, ${s.leads.rows.length} leads, ${s.replies.items.length} replies`);
}

if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { parseCsv, toCsv, leadFiles, leads, replies, linkedin, linkedinHeading, linkedinDay, dnc, jobs, kpis, snapshot, runCommand, HANDLERS, SAVES, noteApplied, requeue };
