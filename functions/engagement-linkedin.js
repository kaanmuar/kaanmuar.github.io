"use strict";
/*
 * LinkedIn connection requests from the Mac's browser agent (#3576): Jarvis queues who to connect with from the
 * Marketing tab or the day's list; the Mac runs scripts/engagement-browser/linkedin-connect.js, reports back here,
 * marks sent through jarvis_commands, and pushes Carlos.
 */
const crypto = require("crypto");
const marketing = require("./jarvis-marketing");

const CAP = 15;
const LEASE = 20 * 60 * 1000;
const REF = (db) => db.collection("jarvis_settings").doc("linkedin_connect");

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const keyOf = (date, name) => clip(date, 10) + ":" + clip(name, 120);

function linkedinLine(person, label) {
  const head = String(label || "").toLowerCase() + ":";
  const line = ((person && person.lines) || []).map((l) => String(l).trim()).find((l) => l.toLowerCase().startsWith(head));
  return line ? line.slice(head.length).trim() : "";
}

function personOf(sync, date, name) {
  const items = ((sync && sync.linkedin) || {}).items || [];
  return items.find((p) => p && p.name === name && (!date || String((sync.linkedin || {}).date) === date)) || null;
}

function itemFields(person, extra) {
  const p = person || {};
  return {
    profile: clip(extra && extra.profile ? extra.profile : p.profile, 500),
    note: clip(extra && extra.note != null ? extra.note : linkedinLine(p, "Note"), 280),
    checkFirst: clip(extra && extra.checkFirst != null ? extra.checkFirst : linkedinLine(p, "Check first"), 200),
    title: clip(p.title, 120),
    org: clip(p.org, 120)
  };
}

function sentToday(sync) {
  const li = (sync && sync.linkedin) || {};
  return (li.items || []).filter((p) => p && p.sent).length;
}

function slotsLeft(sync, tasks) {
  const running = (tasks || []).filter((t) => t && t.status === "running").length;
  return Math.max(0, CAP - sentToday(sync) - running);
}

function freshLease(task, now) {
  return task && task.status === "running" && task.leasedAt && Date.parse(task.leasedAt) > now - LEASE;
}

/** Fields the Marketing tab merges onto each linkedIn row: queued | running | failed. */
function flagsFor(sync, tasks) {
  const date = String(((sync && sync.linkedin) || {}).date || "");
  const byName = {};
  (tasks || []).forEach((t) => {
    if (!t || t.date !== date || t.status === "done" || t.status === "cancelled") return;
    const cur = byName[t.name];
    if (!cur || ["queued", "running", "failed"].indexOf(t.status) < ["queued", "running", "failed"].indexOf(cur)) byName[t.name] = t.status;
  });
  return byName;
}

async function readTasks(db) {
  const snap = await REF(db).get();
  const tasks = snap.exists && Array.isArray(snap.data().tasks) ? snap.data().tasks : [];
  return { tasks, updatedAt: snap.exists ? snap.data().updatedAt || "" : "" };
}

async function writeTasks(db, tasks, now) {
  await REF(db).set({ tasks: tasks.slice(-120), updatedAt: new Date(now).toISOString() }, { merge: true });
}

/** Queue one person from Jarvis (Marketing Send). */
async function queueSend(db, args, now) {
  const date = clip(args.date, 10);
  const name = clip(args.name, 120);
  const profile = clip(args.profile, 500);
  if (!date || !name || !/^https:\/\/(www\.)?linkedin\.com\//.test(profile)) throw new Error("Give the list date, name and profile URL.");
  const sync = (await db.collection("jarvis_settings").doc("marketing_sync").get()).data() || {};
  const person = personOf(sync, date, name);
  const fields = itemFields(person, { profile, note: args.note, checkFirst: args.checkFirst });
  const key = keyOf(date, name);
  const at = new Date(now).toISOString();
  let queued = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(REF(db));
    const tasks = snap.exists && Array.isArray(snap.data().tasks) ? snap.data().tasks.slice() : [];
    const hit = tasks.find((t) => t && t.key === key);
    if (hit && (hit.status === "queued" || freshLease(hit, now))) return;
    if (hit) Object.assign(hit, Object.assign({ status: "queued", leasedAt: "", error: "", at }, fields));
    else tasks.push(Object.assign({ key, date, name, status: "queued", leasedAt: "", error: "", at }, fields));
    tx.set(REF(db), { tasks, updatedAt: at });
    queued = true;
  });
  return { queued, key, name, date };
}

function buildTasks(sync, stored, now, auto) {
  const date = String(((sync && sync.linkedin) || {}).date || "");
  const tasks = (stored || []).slice();
  const out = [];
  const seen = new Set();
  const slot = () => slotsLeft(sync, tasks);
  const take = (row) => {
    if (!row || !row.profile || seen.has(row.key) || slot() <= 0) return;
    seen.add(row.key);
    out.push(row);
  };

  tasks.filter((t) => t && t.date === date && t.status === "queued").sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .forEach((t) => take(Object.assign({}, t)));

  if (auto) {
    const items = ((sync.linkedin || {}).items || []).filter((p) => p && !p.sent && p.profile);
    items.forEach((p) => {
      const key = keyOf(date, p.name);
      if (seen.has(key)) return;
      const live = tasks.find((t) => t && t.key === key);
      if (live && (live.status === "queued" || live.status === "running" || live.status === "done")) return;
      const fields = itemFields(p, {});
      take(Object.assign({ key, date, name: p.name, status: "queued", at: new Date(now).toISOString() }, fields));
    });
  }

  return { tasks: out, remaining: slot() - out.length, date, cap: CAP };
}

function pushMessage(outcome, name, detail) {
  const tab = "products:outreach";
  if (outcome === "sent") return { kind: "outreach", title: "LinkedIn connect sent", body: name + (detail ? ": " + detail : ""), tab, tag: "jarvis-linkedin-connect" };
  if (outcome === "already") return { kind: "outreach", title: "LinkedIn already connected", body: name + (detail ? " · " + detail : ""), tab, tag: "jarvis-linkedin-connect" };
  if (outcome === "check-first") return { kind: "outreach", title: "LinkedIn needs a check first", body: name + (detail ? ": " + detail : ""), tab, tag: "jarvis-linkedin-check" };
  return { kind: "outreach", title: "LinkedIn connect failed", body: name + (detail ? ": " + detail : ""), tab, tag: "jarvis-linkedin-fail" };
}

async function markSent(deps, date, name, now) {
  const label = "LinkedIn request sent: " + name;
  await deps.db.collection("jarvis_commands").doc(crypto.randomBytes(12).toString("hex")).set({
    kind: "marketing", action: "linkedin", args: { date, name, sent: true }, label, status: "pending", createdAt: new Date(now).toISOString()
  });
  if (deps.githubToken) await marketing.startSync({ fetch: deps.fetch, githubToken: deps.githubToken, now }).catch(() => false);
}

/** Mac: lease the next connection tasks (queued rows and, with auto, unsent people on today's list). */
async function macQueue(deps, body) {
  const now = deps.now;
  const sync = (await deps.db.collection("jarvis_settings").doc("marketing_sync").get()).data() || {};
  const { tasks: stored } = await readTasks(deps.db);
  const plan = buildTasks(sync, stored, now, body && body.auto !== false);
  const leased = [];
  const next = stored.slice();
  for (const row of plan.tasks) {
    const i = next.findIndex((t) => t && t.key === row.key);
    const at = new Date(now).toISOString();
    const merged = Object.assign({}, row, { status: "running", leasedAt: at, error: "" });
    if (i >= 0) next[i] = Object.assign(next[i], merged);
    else next.push(merged);
    leased.push(Object.assign({}, merged, { action: "connect" }));
  }
  if (leased.length) await writeTasks(deps.db, next, now);
  return { ok: true, tasks: leased, remaining: plan.remaining, date: plan.date, cap: plan.cap };
}

/** Mac: one connect outcome; marks sent in outreach when it went out. */
async function macResult(deps, body) {
  const now = deps.now;
  const b = body || {};
  const date = clip(b.date, 10);
  const name = clip(b.name, 120);
  const key = clip(b.key, 140) || keyOf(date, name);
  const outcome = clip(b.outcome, 20) || (b.ok ? "sent" : "failed");
  const error = clip(b.error, 300);
  const url = clip(b.url, 500);
  const { tasks } = await readTasks(deps.db);
  const i = tasks.findIndex((t) => t && t.key === key);
  if (i < 0) return { ok: true, note: "No queue row for " + key + "." };
  const row = tasks[i];
  const at = new Date(now).toISOString();
  if (outcome === "sent" || outcome === "already") {
    tasks[i] = Object.assign(row, { status: "done", leasedAt: "", error: "", url, doneAt: at, outcome });
    await writeTasks(deps.db, tasks, now);
    if (outcome === "sent") await markSent(deps, row.date || date, row.name || name, now);
  } else if (outcome === "check-first") {
    tasks[i] = Object.assign(row, { status: "queued", leasedAt: "", error: error || row.checkFirst || "Check first", outcome, url });
    await writeTasks(deps.db, tasks, now);
  } else {
    tasks[i] = Object.assign(row, { status: "failed", leasedAt: "", error: error || "Failed", outcome, url, doneAt: at });
    await writeTasks(deps.db, tasks, now);
  }
  if (deps.push) await deps.push(pushMessage(outcome, row.name || name, error || (outcome === "check-first" ? row.checkFirst : ""))).catch(() => null);
  return { ok: true, key, outcome };
}

/** Marketing sync: who is queued or running on today's list. */
async function enrichLinkedin(db, linkedin) {
  const li = linkedin || { date: "", items: [] };
  const { tasks } = await readTasks(db);
  const flags = flagsFor({ linkedin: li }, tasks);
  return Object.assign({}, li, {
    items: (li.items || []).map((p) => (p ? Object.assign({}, p, { queue: flags[p.name] || "" }) : p))
  });
}

module.exports = {
  CAP, LEASE, linkedinLine, itemFields, keyOf, flagsFor, queueSend, macQueue, macResult, enrichLinkedin, pushMessage
};