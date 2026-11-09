#!/usr/bin/env node
"use strict";
/* Cursor chats in Jarvis's live Processes (#2548): a prompt marks the chat running, the end of a turn marks it done,
   or waiting on Carlos when the last answer ends in a question. Signed with the Mac's paired token
   (scripts/engagement-browser/agent.js pair); without it, or with JARVIS_PROCESSES=0, it does nothing.

   node .cursor/hooks/jarvis-process.js <beforeSubmitPrompt|afterAgentResponse|stop>   (hook input on stdin)
   The send runs in a detached child, so a slow network never holds a turn. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CONFIG = path.join(os.homedir(), "Library/Application Support/QALab/engagement-browser/config.json");
const ENDPOINT = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis";
const STATE = path.join(os.homedir(), "Library/Caches/jarvis-processes");
const KEEP_MS = 2 * 24 * 3600000;

const clip = (value, max) => String(value || "").replace(/[`*#>_[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

/** The chat's name: its worktree when it works in one, else the first line of its first prompt. */
function nameOf(input, prompt) {
  const root = String(((input.workspace_roots || [])[0]) || "");
  const tree = root.match(/\.worktrees\/([^/]+)/);
  if (tree) return tree[1];
  const line = String(prompt || "").split("\n").map((l) => l.trim()).find(Boolean);
  return clip(line, 70) || "Cursor chat";
}

/** The row to send for this event, or null; keeps what later events need in a small file per chat. */
function step(event, input, kept) {
  if (event === "beforeSubmitPrompt") {
    const name = kept.name || nameOf(input, input.prompt);
    return { kept: { name, asks: false }, row: { state: "running", name, step: clip(input.prompt, 100) || "Working" } };
  }
  if (event === "afterAgentResponse") {
    const tail = String(input.text || "").trim().split(/\n\s*\n/).pop() || "";
    return { kept: Object.assign({}, kept, { asks: /\?\s*\**\s*$/.test(tail) }), row: null };
  }
  if (event === "stop") {
    const name = kept.name || "Cursor chat";
    const status = String(input.status || "completed");
    const row = status === "aborted" ? { state: "cancelled", step: "Stopped" }
      : status === "error" ? { state: "failed", step: "The turn ended in an error" }
      : kept.asks ? { state: "waiting", needsYou: true, step: "Waiting for your answer" }
      : { state: "done", step: "Turn finished" };
    return { kept, row: Object.assign({ name }, row) };
  }
  return { kept, row: null };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return null; }
}

function tidy() {
  try {
    fs.readdirSync(STATE).forEach((f) => {
      const file = path.join(STATE, f);
      if (Date.now() - fs.statSync(file).mtimeMs > KEEP_MS) fs.rmSync(file, { force: true });
    });
  } catch (error) { /* nothing kept yet */ }
}

async function send(body) {
  const c = readJson(CONFIG) || {};
  if (!c.token) return;
  await fetch(c.endpoint || ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json", "x-mac-token": c.token },
    body: JSON.stringify({ op: "process-report", row: body }), signal: AbortSignal.timeout(15000)
  }).catch(() => null);
}

function main() {
  const event = process.argv[2];
  if (event === "--send") return send(JSON.parse(process.argv[3] || "{}"));
  let raw = "";
  process.stdin.on("data", (d) => { raw += d; });
  process.stdin.on("end", () => {
    process.stdout.write(event === "beforeSubmitPrompt" ? JSON.stringify({ continue: true }) : "{}");
    if (process.env.JARVIS_PROCESSES === "0" || !(readJson(CONFIG) || {}).token) return;
    let input = {};
    try { input = JSON.parse(raw || "{}"); } catch (error) { return; }
    const id = String(input.conversation_id || "").replace(/[^\w-]/g, "").slice(0, 60);
    if (!id) return;
    fs.mkdirSync(STATE, { recursive: true });
    const file = path.join(STATE, id + ".json");
    const out = step(event, input, readJson(file) || {});
    fs.writeFileSync(file, JSON.stringify(out.kept));
    if (event === "stop") tidy();
    if (!out.row) return;
    // Each turn counts its own time: a prompt starts the clock again.
    const row = Object.assign({ id, kind: "agent" }, out.row, event === "beforeSubmitPrompt" ? { startedAt: new Date().toISOString() } : {});
    spawn(process.execPath, [__filename, "--send", JSON.stringify(row)], { detached: true, stdio: "ignore" }).unref();
  });
  return null;
}

if (require.main === module) main();

module.exports = { nameOf, step };
