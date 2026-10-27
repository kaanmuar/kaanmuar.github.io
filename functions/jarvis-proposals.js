/* Jarvis proposals and the weekly strategy (#1336).

   rank       the rule proposals (jarvis-core proposalRules) go to Gemini with the numbers; Gemini keeps or reorders
              3-5 of them by impact and may add up to two the numbers clearly support. Each row carries its evidence.
              Without Gemini the rules' own order stands.
   saved      jarvis_proposals/<key>: Done hides a proposal for 7 days, Dismiss for 30 (core.openProposals filters).
   history    four 7-day weeks ending at today's UTC midnight (Sunday 19:00 in Bogotá), oldest first: Firestore counts per
              week, the 28-day daily rows of money, email, Search Console and social split by week, GA4 with four date
              ranges, and point-in-time numbers (readiness, open bugs, Brave) that only the saved weekly snapshots
              (jarvis_weekly/<last day>) can show for past weeks. */

const core = require("./jarvis-core");

const DAY = 24 * 60 * 60 * 1000;
const PROPERTY = "495572902";
const HIDE_DAYS = { done: 7, dismissed: 30 };
const EFFORTS = ["minutes", "hours", "days"];

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const text = (value, max) => String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

// --- proposals ------------------------------------------------------------------------------------------------

function docId(key) {
  return text(key, 140).replace(/[^\w:.@-]/g, "_") || "-";
}

// A candidate sent by the page is the owner's own, but it is still cut to the fields and lengths the panel shows.
function cleanCandidates(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map((p) => ({
    key: text(p && p.key, 140), product: text(p && p.product, 20), impact: Math.max(1, Math.min(5, Math.round(Number(p && p.impact) || 1))),
    level: ["alert", "warn", "good", "info"].includes(p && p.level) ? p.level : "info", title: text(p && p.title, 120),
    evidence: (Array.isArray(p && p.evidence) ? p.evidence : []).map((e) => text(e, 240)).filter(Boolean).slice(0, 4),
    source: "rules", action: core.SAFE_ACTIONS.includes(p && p.action) ? p.action : null,
    jobs: Array.isArray(p && p.jobs) ? p.jobs.filter((j) => /^[A-Za-z][A-Za-z0-9]{2,60}$/.test(j)).slice(0, 6) : null, tab: text(p && p.tab, 20) || null, link: /^https:\/\//.test((p && p.link) || "") ? text(p.link, 200) : null
  })).filter((p) => p.key && p.title);
}

async function saved(db) {
  const snap = await db.collection("jarvis_proposals").limit(500).get().catch(() => null);
  return snap ? snap.docs.map((doc) => doc.data()) : [];
}

async function mark(db, { key, status, title }, by, now) {
  const k = text(key, 140);
  if (!k) throw new Error("Which proposal?");
  const ref = db.collection("jarvis_proposals").doc(docId(k));
  if (status === "open") {
    await ref.delete();
    return { key: k, status: "open" };
  }
  if (!HIDE_DAYS[status]) throw new Error("Mark a proposal done or dismissed.");
  const row = { key: k, status, title: text(title, 120), at: new Date(now).toISOString(), until: new Date(now + HIDE_DAYS[status] * DAY).toISOString(), by: text(by, 120) };
  await ref.set(row);
  return row;
}

// Briefing lines (#1695): jarvis_brief_marks/<key>, snoozed for a day or a week, dismissed for 30 days (core.openBrief).
async function savedBrief(db) {
  const snap = await db.collection("jarvis_brief_marks").limit(500).get().catch(() => null);
  return snap ? snap.docs.map((doc) => doc.data()) : [];
}

async function markBrief(db, { key, status, text: line }, by, now) {
  const k = text(key, 140);
  if (!k) throw new Error("Which briefing line?");
  const ref = db.collection("jarvis_brief_marks").doc(docId(k));
  if (status === "open") {
    await ref.delete();
    return { key: k, status: "open" };
  }
  const days = core.BRIEF_HIDE_DAYS[status];
  if (!days) throw new Error("Snooze or dismiss the line.");
  const row = { key: k, status, text: text(line, 240), at: new Date(now).toISOString(), until: new Date(now + days * DAY).toISOString(), by: text(by, 120) };
  await ref.set(row);
  return row;
}

function parseJson(raw) {
  const body = String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini did not answer in JSON.");
  return JSON.parse(body.slice(start, end + 1));
}

function rankPrompt(candidates, snapshot) {
  const room = Math.max(2, 3 - candidates.length);
  return "Rank what Carlos should do next. Candidates from the rules, most urgent first:\n" + JSON.stringify(candidates.map((c) => ({ key: c.key, title: c.title, impact: c.impact, evidence: c.evidence })))
    + "\n\nPick the 3 to 5 with the most impact on revenue, customers, reach and risk, best first. Keep a candidate's key, or add at most " + room
    + " new proposals the numbers clearly support, with key \"ai:<short-slug>\". Each needs 1 to 3 evidence lines that quote exact numbers from the JSON below; drop anything you cannot back with a number."
    + " If fewer than 3 are worth doing, return fewer.\nAnswer with JSON only: {\"proposals\":[{\"key\":\"\",\"title\":\"imperative, under 80 characters\",\"why\":\"one sentence on the impact\",\"evidence\":[\"\"],\"impact\":1,\"effort\":\"minutes|hours|days\"}]}"
    + "\n\nNumbers:\n" + JSON.stringify(snapshot || {}).slice(0, 50000);
}

function mergeRanked(candidates, answer) {
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const rows = Array.isArray(answer && answer.proposals) ? answer.proposals : [];
  const seen = new Set();
  let added = 0;
  const out = [];
  rows.forEach((row) => {
    const key = text(row && row.key, 140);
    if (!key || seen.has(key)) return;
    const base = byKey.get(key);
    if (!base && (!/^ai:[\w-]{2,60}$/.test(key) || added >= Math.max(2, 3 - candidates.length))) return;
    const evidence = (Array.isArray(row.evidence) ? row.evidence : []).map((e) => text(e, 240)).filter(Boolean).slice(0, 3);
    if (!evidence.length && !base) return;
    seen.add(key);
    if (!base) added += 1;
    out.push(Object.assign({}, base || { key, product: "overview", level: "info", source: "gemini", action: null, tab: null, link: null }, {
      title: text(row.title, 120) || (base && base.title) || key,
      why: text(row.why, 240),
      evidence: evidence.length ? evidence : base.evidence,
      impact: Math.max(1, Math.min(5, Math.round(Number(row.impact) || (base && base.impact) || 1))),
      effort: EFFORTS.includes(row.effort) ? row.effort : null,
      source: base ? "gemini+rules" : "gemini"
    }));
  });
  candidates.forEach((c) => { if (out.length < 3 && !seen.has(c.key)) { seen.add(c.key); out.push(c); } });
  return out.slice(0, 5).map((p, i) => Object.assign({ rank: i + 1 }, p));
}

// gemini(prompt, maxTokens) -> text; null skips Gemini and returns the rules' top five.
async function rank({ candidates, snapshot, savedRows, gemini, now }) {
  const at = new Date(now);
  const open = core.openProposals(candidates, savedRows, at);
  const hidden = candidates.length - open.length;
  const rulesOnly = (error) => ({ ok: true, proposals: open.slice(0, 5).map((p, i) => Object.assign({ rank: i + 1 }, p)), gemini: false, error: error || "", hidden, at: at.toISOString() });
  if (!gemini) return rulesOnly("");
  try {
    const merged = mergeRanked(open, parseJson(await gemini(rankPrompt(open, snapshot), 1500)));
    return { ok: true, proposals: core.openProposals(merged, savedRows, at), gemini: true, hidden, at: at.toISOString() };
  } catch (error) {
    return rulesOnly(text(error.message || error, 200));
  }
}

function mailLines(list) {
  return (list || []).map((p, i) => (i + 1) + ". " + p.title + " (impact " + p.impact + "/5" + (p.effort ? ", " + p.effort : "") + ")"
    + (p.why ? "\n   " + p.why : "") + (p.evidence || []).map((e) => "\n   - " + e).join(""));
}

// --- weekly history -------------------------------------------------------------------------------------------

function weekWindows(now, count) {
  const n = count || 4;
  const last = Math.floor(now / DAY) * DAY;
  return Array.from({ length: n }, (_, i) => {
    const end = last - (n - 1 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    return { start, end, from: isoDay(start), to: isoDay(end - DAY), key: isoDay(end - DAY) };
  });
}

const WEEK_ROWS = [
  { key: "cv.visits", label: "CV visits", goal: { product: "cv", metric: "visits" } },
  { key: "studio.visits", label: "QA Studio visits", goal: { product: "studio", metric: "visits" } },
  { key: "lab.visits", label: "QA Lab visits", goal: { product: "lab", metric: "visits" } },
  { key: "review.opens", label: "URL Review opens", goal: { product: "review", metric: "opens" } },
  { key: "review.reviews", label: "URL reviews run", goal: { product: "review", metric: "reviews" } },
  { key: "review.paid", label: "Paid reviews", goal: { product: "review", metric: "paid" } },
  { key: "money.usd", label: "Revenue (USD)", daily: ["money", "usd"] },
  { key: "inbox.messages", label: "Messages", goal: { product: "inbox", metric: "messages" } },
  { key: "ga4.sessions", label: "GA4 sessions", ga4: 0 },
  { key: "ga4.users", label: "GA4 users", ga4: 1 },
  { key: "gsc.clicks", label: "Google search clicks", daily: ["search", "clicks"] },
  { key: "gsc.impressions", label: "Google search impressions", daily: ["search", "impressions"] },
  { key: "email.processed", label: "Emails sent", daily: ["email", "processed"] },
  { key: "email.bad", label: "Emails bounced, blocked or reported", daily: ["email", "bad"] },
  { key: "social.posts", label: "Social posts", daily: ["social", "posts"] },
  { key: "ops.readiness", label: "Systems readiness (%)", point: "readiness" },
  { key: "github.bugs", label: "Open bugs", point: "openBugs" },
  { key: "search.brave", label: "Brave searches in the top 20", point: "braveTop20" },
  { key: "outreach.reviewed", label: "Outreach prospects reviewed this week", point: "outreachWeek" }
];

function weekSum(daily, field, week) {
  if (!Array.isArray(daily)) return null;
  return Math.round(daily.filter((d) => d.date >= week.from && d.date <= week.to).reduce((s, d) => s + (Number(d[field]) || 0), 0) * 100) / 100;
}

// The numbers that exist only at the moment they are read; a past week shows them only from its saved snapshot.
function pointValues(external) {
  const e = external || {};
  const brave = e.search && e.search.ok && e.search.brave && e.search.brave.ok ? e.search.brave.queries.filter((q) => !q.error) : null;
  const pipe = e.outreach && e.outreach.ok && e.outreach.pipeline && e.outreach.pipeline.ok ? e.outreach.pipeline : null;
  return {
    readiness: core.readiness(e),
    openBugs: e.github && e.github.ok ? e.github.openBugs : null,
    braveTop20: brave ? brave.filter((q) => q.position !== null).length : null,
    outreachWeek: pipe ? pipe.thisWeek : null
  };
}

async function ga4Weeks(fetchImpl, token, weeks) {
  const res = await fetchImpl("https://analyticsdata.googleapis.com/v1beta/properties/" + PROPERTY + ":runReport", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ dateRanges: weeks.map((w) => ({ startDate: w.from, endDate: w.to })), metrics: [{ name: "sessions" }, { name: "totalUsers" }] }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("GA4 " + res.status + ": " + text((data.error || {}).message, 160));
  const out = weeks.map(() => null);
  (data.rows || []).forEach((row) => {
    const dims = (row.dimensionValues || []).map((v) => v.value);
    const which = /date_range_(\d)/.exec(dims[dims.length - 1] || "date_range_0");
    out[Number(which[1])] = (row.metricValues || []).map((v) => Number(v.value) || 0);
  });
  return out;
}

/* db, weeks, count(goal, start, end) -> number, sources {money, email, search, social} as 28-day answers with daily rows,
   ga4() -> [[sessions, users] per week], point = pointValues(now). Saves the newest week to jarvis_weekly. */
async function history({ db, weeks, count, sources, ga4, point, now }) {
  const savedDocs = await Promise.all(weeks.map((w) => db.collection("jarvis_weekly").doc(w.key).get().then((s) => (s.exists ? s.data() : null)).catch(() => null)));
  let ga = weeks.map(() => null);
  try { ga = await ga4(); } catch (error) { ga = weeks.map(() => null); }
  const src = sources || {};
  const rows = await Promise.all(WEEK_ROWS.map(async (row) => {
    const values = await Promise.all(weeks.map(async (w, i) => {
      const was = savedDocs[i] && savedDocs[i].values ? savedDocs[i].values[row.key] : undefined;
      let value = null;
      if (row.goal) value = await count(row.goal, new Date(w.start), new Date(w.end)).catch(() => null);
      else if (row.daily) { const s = src[row.daily[0]]; value = s && s.ok ? weekSum(s.daily, row.daily[1], w) : null; }
      else if (row.ga4 !== undefined) value = ga[i] ? ga[i][row.ga4] : null;
      else if (row.point) value = i === weeks.length - 1 ? (point || {})[row.point] : null;
      if ((value === null || value === undefined) && was !== undefined) value = was;
      return value === undefined ? null : value;
    }));
    const [prior, last] = values.slice(-2);
    const change = prior === null || last === null || prior === undefined ? null : core.delta(last, prior);
    return { key: row.key, label: row.label, values, change: change && change.text ? change.text : null };
  }));
  const newest = weeks[weeks.length - 1];
  await db.collection("jarvis_weekly").doc(newest.key).set({
    from: newest.from, to: newest.to, at: new Date(now).toISOString(),
    values: rows.reduce((m, r) => { m[r.key] = r.values[r.values.length - 1]; return m; }, {})
  }).catch(() => null);
  return { weeks: weeks.map((w) => ({ from: w.from, to: w.to })), rows };
}

const shortDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const cell = (v) => (v === null || v === undefined ? "—" : String(v));

function strategyPrompt(hist, proposals) {
  return "Four weeks side by side, oldest first (" + hist.weeks.map((w) => w.from + ".." + w.to).join(", ") + "). A null means the number was not read that week; Search Console lags two days.\n"
    + JSON.stringify(hist.rows.map((r) => ({ metric: r.label, weeks: r.values })))
    + "\n\nThis week's proposals:\n" + JSON.stringify((proposals || []).map((p) => ({ title: p.title, impact: p.impact, evidence: p.evidence })))
    + "\n\nWrite the weekly strategy in at most 250 words, plain text with short paragraphs:"
    + " 1) what changed across the four weeks, naming the numbers; 2) what worked and what did not; 3) 'Next week:' then the three priorities, each tied to a number and to a proposal when one fits.";
}

function weeklyMail({ hist, proposals, aiText }) {
  const range = shortDay(hist.weeks[0].from) + " to " + shortDay(hist.weeks[hist.weeks.length - 1].to);
  const head = "Weeks: " + hist.weeks.map((w) => shortDay(w.from)).join(" · ");
  const rows = [{ label: "Week of", value: hist.weeks.map((w) => shortDay(w.from)).join(" · ") }].concat(hist.rows.map((r) => ({
    label: r.label, value: r.values.map(cell).join(" · ") + (r.change ? "  (" + r.change + " vs the week before)" : "")
  })));
  const lines = mailLines(proposals);
  const body = (aiText ? aiText.trim() + "\n\n" : "") + (lines.length ? "Proposals, by impact:\n" + lines.join("\n") : "No proposals this week.") + "\n\n" + head;
  const top = (proposals || [])[0];
  return {
    subject: "Jarvis weekly strategy, " + range + (top ? ": " + top.title.slice(0, 70) : ""),
    intro: "Four weeks side by side (oldest first), what changed and what to do next week.",
    rows, body: body.slice(0, 12000)
  };
}

module.exports = { HIDE_DAYS, WEEK_ROWS, docId, cleanCandidates, saved, mark, savedBrief, markBrief, parseJson, rankPrompt, mergeRanked, rank, mailLines, weekWindows, weekSum, pointValues, ga4Weeks, history, strategyPrompt, weeklyMail };
