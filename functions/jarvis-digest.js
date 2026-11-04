"use strict";
/*
 * The evening digest (#1672): one email at 20:00 Bogotá in place of the owner emails that moved to Jarvis
 * pushes. It lists what Jarvis pushed in the last 24 hours by kind, what still waits for a decision, and
 * what Jarvis or Carlos ran (jarvis_actions). An empty day sends nothing.
 */

const KIND_LABELS = { inbox: "Inbox", desk: "Review desk", alerts: "Alerts", money: "Money", reviews: "Reviews", review: "Reviews", briefing: "Briefing", outreach: "Outreach", social: "Social", update: "App updates" };
const PER_KIND = 15;

const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
const kindLabel = (kind) => KIND_LABELS[kind] || String(kind || "Other");

function clock(iso) {
  const at = new Date(iso);
  if (isNaN(at)) return "--:--";
  return at.toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
}

function byKind(pushes) {
  const groups = new Map();
  pushes.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach((p) => {
    const kind = kindLabel(p.kind);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(p);
  });
  return groups;
}

// Top proposals pushed with the briefing that are not marked done or dismissed since.
function openProposals(pushes, marked) {
  const seen = new Map();
  pushes.forEach((p) => {
    const m = /^proposal:(.+)$/.exec(String(p.ref || ""));
    if (m && !marked.has(m[1])) seen.set(m[1], p.title);
  });
  return Array.from(seen, ([key, title]) => ({ key, title }));
}

function waitingLines(waiting) {
  const w = waiting || {};
  const list = (rows, name) => (rows || []).slice(0, 10).map(name).filter(Boolean).join(", ") + ((rows || []).length > 10 ? ", +" + (rows.length - 10) + " more" : "");
  return [
    { n: (w.reruns || []).length, label: plural((w.reruns || []).length, "held re-run"), names: list(w.reruns, (r) => r.host) },
    { n: (w.ownerReplies || []).length, label: plural((w.ownerReplies || []).length, "owner reply", "owner replies"), names: list(w.ownerReplies, (r) => r.domain) },
    { n: (w.notices || []).length, label: plural((w.notices || []).length, "owner notice") + " to send", names: list(w.notices, (r) => r.domain) },
    { n: (w.proposals || []).length, label: plural((w.proposals || []).length, "proposal"), names: list(w.proposals, (r) => r.title) }
  ].filter((row) => row.n);
}

function digestMail({ pushes, waiting, actions, marked }) {
  const pushed = (pushes || []).filter((p) => p && p.kind !== "test");
  const ran = (actions || []).filter((a) => a && a.status !== "skipped");
  const open = waitingLines(Object.assign({}, waiting, { proposals: openProposals(pushed, marked || new Set()) }));
  if (!pushed.length && !ran.length && !open.length) return null;

  const groups = byKind(pushed);
  const byJarvis = ran.filter((a) => a.mode === "auto").length;
  const rows = [
    { label: "Pushed", value: pushed.length ? Array.from(groups, ([kind, list]) => kind + " " + list.length).join(" · ") : "nothing" },
    { label: "Waiting", value: open.length ? open.map((row) => row.label).join(" · ") : "nothing" },
    { label: "Ran", value: ran.length ? plural(byJarvis, "action") + " by Jarvis, " + (ran.length - byJarvis) + " by you" : "nothing" }
  ];
  const body = [];
  if (pushed.length) {
    body.push("PUSHED IN THE LAST 24 HOURS");
    groups.forEach((list, kind) => {
      body.push("", kind + " (" + list.length + ")");
      list.slice(-PER_KIND).forEach((p) => body.push("- " + clock(p.at) + " " + p.title + (p.body ? " — " + p.body : "")));
      if (list.length > PER_KIND) body.push("- and " + (list.length - PER_KIND) + " earlier");
    });
  }
  if (open.length) {
    body.push("", "STILL WAITING FOR YOU");
    open.forEach((row) => body.push("- " + row.label + (row.names ? ": " + row.names : "")));
  }
  if (ran.length) {
    body.push("", "WHAT RAN");
    ran.slice(-30).forEach((a) => body.push("- " + clock(a.at) + " " + a.action + (a.target ? " " + a.target : "") + ", " + a.status + " (" + (a.mode === "auto" ? "Jarvis" : a.by || "you") + ")"));
  }
  const waitingCount = open.reduce((n, row) => n + row.n, 0);
  return {
    subject: "Jarvis digest: " + plural(pushed.length, "push", "pushes") + (waitingCount ? ", " + waitingCount + " waiting" : ""),
    intro: "What Jarvis pushed today, what still waits for a decision, and what ran.",
    rows,
    body: body.join("\n")
  };
}

module.exports = { KIND_LABELS, clock, openProposals, waitingLines, digestMail };
