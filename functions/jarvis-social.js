"use strict";
/*
 * Jarvis social hub (#1420): the queue per channel from the Buffer and Facebook ledgers, the field-sweep
 * proposals still waiting for a decision, approving or dismissing one in socialHub/live the way the hub
 * editor does, and starting the posting workflows now instead of at their nightly slot.
 */
const Admin = require("./social-hub-admin");

const WORKFLOWS = [
  { file: "buffer-batch.yml", name: "Buffer", inputs: { mode: "retry" } },
  { file: "facebook-page.yml", name: "Facebook Page" }
];

/** Every channel in calendar order, with what is scheduled next, what went out last and what failed in the window. */
function byChannel(books, now, since) {
  const rows = {};
  Admin.CHANNELS.forEach(([key, name]) => { rows[key] = { channel: key, name, scheduled: 0, sent: 0, failed: 0, next: [], last: null }; });
  books.forEach((book) => {
    Object.keys((book && book.posts) || {}).forEach((post) => {
      (book.posts[post] || []).forEach((r) => {
        const at = Date.parse(r.at || "");
        const row = rows[r.channel];
        if (!row || !Number.isFinite(at)) return;
        if (at > now && r.result !== "failed") {
          row.scheduled += 1;
          row.next.push({ at: r.at, post });
        } else if (at >= since && r.result === "sent") {
          row.sent += 1;
          if (!row.last || at > Date.parse(row.last.at)) row.last = { at: r.at, post, url: r.url || "" };
        } else if (at >= since && r.result === "failed") row.failed += 1;
      });
    });
  });
  return Object.values(rows).map((row) => Object.assign(row, { next: row.next.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 3) }));
}

function state(doc) {
  try { return Admin.clean(JSON.parse((doc && doc.json) || "{}")); } catch (error) { return Admin.empty(); }
}

/** Undecided proposals, best first. */
function pending(proposals, live, limit) {
  return Admin.pendingProposals(proposals, live)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, limit || 12)
    .map((p) => ({ id: p.id, title: p.title, url: p.url, source: p.source, author: p.author || "", date: p.date || "", topic: p.topic || "", lang: p.lang || "en", summary: String(p.summary || "").slice(0, 400), why: p.why || "", image: p.image || "", score: p.score }));
}

/** The next socialHub/live state: dismissed records the decision; approved also adds the hub item, as the editor's Add form does. */
function decide(live, proposal, decision, today) {
  if (!Admin.PROPOSAL_ID.test((proposal && proposal.id) || "")) throw new Error("That proposal is no longer in the list.");
  if (decision !== "approved" && decision !== "dismissed") throw new Error("Decide approved or dismissed.");
  const next = Admin.clean(live);
  if (decision === "approved") {
    const draft = Admin.proposalDraft(proposal, today);
    const item = Admin.cleanItem(Object.assign({ id: Admin.newId(draft.title, next.items) }, draft));
    if (!item) throw new Error("That proposal has no title to publish.");
    next.items.push(item);
  }
  next.decisions = Object.assign({}, next.decisions, { [proposal.id]: decision });
  return Admin.clean(next);
}

module.exports = { WORKFLOWS, byChannel, state, pending, decide };
