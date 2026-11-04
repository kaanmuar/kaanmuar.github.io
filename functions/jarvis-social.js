"use strict";
/*
 * Jarvis social hub (#1420): the queue per channel from the Buffer, Facebook, open-social (Bluesky, Mastodon, Threads, Instagram)
 * and Telegram ledgers (the @qalab_live channel post of each Live Reports batch, #2549), the field-sweep
 * proposals still waiting for a decision, approving or dismissing one in socialHub/live the way the hub
 * editor does, and starting the posting workflows now instead of at their nightly slot.
 */
const Admin = require("./social-hub-admin");

const WORKFLOWS = [
  { file: "buffer-batch.yml", name: "Buffer", inputs: { mode: "retry" } },
  { file: "facebook-page.yml", name: "Facebook Page" },
  { file: "open-social.yml", name: "Bluesky, Mastodon, Threads and Instagram" },
  // The Reddit app's upload after each batch (#2549); the app posts in r/QALabLiveReports on its own daily task, and
  // the same workflow's ledger job reads the app's logs into assets/social/reddit.json (#2571). Post now leaves it
  // alone: watch only.
  { file: "reddit-live.yml", name: "Reddit app (r/QALabLiveReports)", watch: true }
];

// Channels that post once per Live Reports batch rather than per post, after the calendar channels.
const LIVE_CHANNELS = [["telegram", "Telegram"], ["reddit", "Reddit"]];

/** Every channel in calendar order, with what is scheduled next, what went out last and what failed in the window. */
function byChannel(books, now, since) {
  const rows = {};
  Admin.CHANNELS.concat(LIVE_CHANNELS).forEach(([key, name]) => { rows[key] = { channel: key, name, scheduled: 0, sent: 0, failed: 0, next: [], last: null }; });
  books.forEach((book) => {
    Object.keys((book && book.posts) || {}).forEach((post) => {
      (book.posts[post] || []).forEach((r) => {
        const at = Date.parse(r.at || "");
        const row = rows[r.channel];
        if (!row || !Number.isFinite(at) || r.result === "moved") return;
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

const TELEGRAM_SETUP = "Add the TELEGRAM_BOT_TOKEN repo secret and the TELEGRAM_CHANNEL repo variable (@qalab_live); scripts/social-metrics.js reads the count each morning in auto-live-reports.yml.";

/**
 * The Telegram channel's members from the metrics ledger (#2570): the count now, its change since the range began
 * (against the last daily point on or before the range start, else the oldest point), the points in the range, and a
 * need line when there is no count or the last run skipped or failed.
 */
function telegramMembers(metrics, since) {
  const t = metrics && metrics.channels && metrics.channels.telegram;
  if (!t || !Number.isFinite(Number(t.members))) {
    const why = t && t.error ? "the Bot API refused it (" + String(t.error).slice(0, 200) + "). The bot must be an admin of the channel." : t && t.skipped ? "the daily social numbers skipped it (" + t.skipped + "). " + TELEGRAM_SETUP : "the daily social numbers have no member count for the channel yet. " + TELEGRAM_SETUP;
    return { members: null, change: null, need: "Telegram members: " + why };
  }
  const history = (Array.isArray(t.history) ? t.history : []).filter((p) => p && typeof p.date === "string" && Number.isFinite(Number(p.members)))
    .map((p) => ({ date: p.date, members: Number(p.members) })).sort((a, b) => a.date.localeCompare(b.date));
  const start = new Date(since).toISOString().slice(0, 10);
  const before = history.filter((p) => p.date <= start);
  const from = before.length ? before[before.length - 1] : history[0];
  const latest = history[history.length - 1];
  const members = Number(t.members);
  const stale = t.error ? "the last run failed (" + String(t.error).slice(0, 200) + "). The bot must be an admin of the channel." : t.skipped ? "the last run skipped it (" + t.skipped + "). " + TELEGRAM_SETUP : "";
  return {
    channel: t.chat || "",
    members,
    at: t.at || "",
    change: from && latest && from.date < latest.date ? members - from.members : null,
    from: from && latest && from.date < latest.date ? from : null,
    history: history.filter((p) => p.date >= start),
    need: stale ? "Telegram members: showing the count from " + String(t.at || "").slice(0, 10) + " because " + stale : ""
  };
}

module.exports = { WORKFLOWS, LIVE_CHANNELS, byChannel, state, pending, decide, telegramMembers };
