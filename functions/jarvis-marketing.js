/* Jarvis marketing source (#1722): what the Marketing tab adds on top of the outreach, social, email, search, money
   and GA4 sources.

   campaigns  every Instantly campaign with its id, week, sequence, language, region, start date, sending window and
              stats, so the tab can pause or activate one, plus the mix by language, region, sequence and status
   prospects  the sweep list (url_review_sweep/outreach) by country and segment
   notes      follow-up notes to askers (url_review_notes): sent and stopped per day, by kind and scene

   And the owner actions behind the tab's buttons: pause or activate a campaign, block an address or domain in
   Instantly, and append prospects to the sweep list the way scripts/sweep-outreach.js does. */

const sweep = require("./url-review-sweep");

const DAY = 24 * 60 * 60 * 1000;
const INSTANTLY = "https://api.instantly.ai/api/v2/";
const CAMPAIGN_STATUS = { 0: "draft", 1: "active", 2: "paused", 3: "completed", 4: "running subsequences", "-1": "accounts unhealthy", "-2": "bounce protect", "-99": "suspended" };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const QUEUE_MAX = 200;

const clean = (error) => String((error && error.message) || error || "failed").slice(0, 200);
const toMs = (v) => (v && typeof v.toDate === "function" ? v.toDate().getTime() : Date.parse(v || "") || 0);
function tally(map, key) { const k = String(key || "unknown").slice(0, 60); map[k] = (map[k] || 0) + 1; return map; }
const listOf = (map) => Object.keys(map).map((label) => ({ label, value: map[label] })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

// "W1 E-pt Brazil" → { week: "W1", sequence: "E", lang: "pt", region: "Brazil" }; other names keep only the name.
function parseName(name) {
  const m = /^(W\d+)\s+([A-Z])-([a-z]{2})\s+(.+)$/.exec(String(name || "").trim());
  return m ? { week: m[1], sequence: m[2], lang: m[3], region: m[4] } : { week: "", sequence: "", lang: "", region: "" };
}

function windowOf(schedule) {
  const s = ((schedule && schedule.schedules) || [])[0];
  if (!s) return "";
  const on = Object.keys(s.days || {}).filter((d) => s.days[d]).map(Number).filter((d) => d >= 0 && d < 7).sort();
  const runs = on.length > 2 && on[on.length - 1] - on[0] === on.length - 1;
  const span = runs ? WEEKDAY[on[0]] + "-" + WEEKDAY[on[on.length - 1]] : on.map((d) => WEEKDAY[d]).join(", ");
  return [span, s.timing ? s.timing.from + "-" + s.timing.to : "", s.timezone || ""].filter(Boolean).join(" ");
}

function campaignRows(campaigns, analytics, now) {
  const stats = {};
  (analytics || []).forEach((a) => { if (a && a.campaign_id) stats[a.campaign_id] = a; });
  const rows = (campaigns || []).map((c) => {
    const a = stats[c.id] || {};
    const schedule = c.campaign_schedule || {};
    return Object.assign({ id: String(c.id || ""), name: String(c.name || "").slice(0, 80) }, parseName(c.name), {
      status: CAMPAIGN_STATUS[String(c.status)] || "status " + c.status,
      start: schedule.start_date || "",
      window: windowOf(schedule),
      dailyLimit: Number(c.daily_limit) || 0,
      steps: ((c.sequences || [])[0] || {}).steps ? c.sequences[0].steps.length : 0,
      leads: Number(a.leads_count) || 0,
      contacted: Number(a.contacted_count) || 0,
      sent: Number(a.emails_sent_count) || 0,
      opened: Number(a.open_count_unique || a.open_count) || 0,
      replies: Number(a.reply_count_unique || a.reply_count) || 0,
      bounced: Number(a.bounced_count) || 0,
      interested: Number(a.total_opportunities) || 0
    });
  }).sort((x, y) => x.name.localeCompare(y.name));
  const mix = (key) => listOf(rows.reduce((m, r) => tally(m, r[key] || "other"), {}));
  const upcoming = rows.filter((r) => r.start && (r.status === "draft" || r.status === "active" || r.status === "paused") && Date.parse(r.start + "T23:59:59Z") >= now).map((r) => r.start).sort();
  return {
    rows,
    byStatus: mix("status"),
    byLang: mix("lang"),
    byRegion: mix("region"),
    bySequence: mix("sequence"),
    byWeek: mix("week"),
    firstStart: upcoming[0] || "",
    leads: rows.reduce((s, r) => s + r.leads, 0),
    steps: rows.reduce((s, r) => s + r.steps, 0)
  };
}

function prospectRows(queue) {
  const hosts = (queue && Array.isArray(queue.hosts)) ? queue.hosts : [];
  return {
    total: hosts.length,
    byCountry: listOf(hosts.reduce((m, h) => tally(m, String(h.cc || "").toUpperCase() || "??"), {})),
    bySegment: listOf(hosts.reduce((m, h) => tally(m, h.sector || "other"), {})),
    updated: (queue && queue.updated) || ""
  };
}

function noteRows(notes, ctx) {
  const start = ctx.now - ctx.days * DAY;
  const inRange = (notes || []).filter((n) => toMs(n.createdAt) >= start);
  const days = {};
  for (let t = start; t <= ctx.now; t += DAY) days[new Date(t).toISOString().slice(0, 10)] = { sent: 0, stopped: 0 };
  inRange.forEach((n) => {
    const d = new Date(toMs(n.createdAt)).toISOString().slice(0, 10);
    if (!days[d]) days[d] = { sent: 0, stopped: 0 };
    if (n.status === "follow-stop") days[d].stopped += 1; else if (n.status === "follow-note") days[d].sent += 1;
  });
  const sent = inRange.filter((n) => n.status === "follow-note");
  return {
    sent: sent.length,
    stopped: inRange.filter((n) => n.status === "follow-stop").length,
    people: new Set(sent.map((n) => String(n.email || "").toLowerCase())).size,
    byKind: listOf(sent.reduce((m, n) => tally(m, n.kind), {})),
    byScene: listOf(sent.reduce((m, n) => tally(m, n.scene), {})),
    daily: Object.keys(days).sort().map((date) => ({ date, sent: days[date].sent, stopped: days[date].stopped }))
  };
}

async function instantly(ctx, path, init) {
  const res = await ctx.fetch(INSTANTLY + path, Object.assign({ signal: AbortSignal.timeout(15000) }, init || {}, {
    headers: Object.assign({ Authorization: "Bearer " + ctx.env.INSTANTLY_API_KEY, "User-Agent": "qalab-jarvis" }, init && init.body ? { "Content-Type": "application/json" } : {})
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Instantly " + res.status + ": " + String(data.message || data.error || "").slice(0, 120));
  return data;
}

const needKey = (ctx) => { if (!(ctx.env || {}).INSTANTLY_API_KEY) throw new Error("INSTANTLY_API_KEY is not set in functions/.env."); };

async function marketing(ctx) {
  const out = { ok: true, needs: [], days: ctx.days };
  const part = async (name, run) => { try { out[name] = Object.assign({ ok: true }, await run()); } catch (error) { out[name] = { ok: false, error: clean(error) }; } };
  await Promise.all([
    part("campaigns", async () => {
      needKey(ctx);
      const [list, analytics] = await Promise.all([instantly(ctx, "campaigns?limit=100"), instantly(ctx, "campaigns/analytics").catch(() => [])]);
      return campaignRows(list.items, Array.isArray(analytics) ? analytics : analytics.items, ctx.now);
    }),
    part("prospects", async () => {
      const snap = await ctx.db.collection("url_review_sweep").doc("outreach").get();
      return prospectRows(snap.exists ? snap.data() : null);
    }),
    part("notes", async () => {
      const since = new Date(ctx.now - ctx.days * DAY).toISOString();
      const snap = await ctx.db.collection("url_review_notes").where("createdAt", ">=", since).limit(5000).get();
      return noteRows(snap.docs.map((d) => d.data()), ctx);
    })
  ]);
  if (out.campaigns.ok === false && /INSTANTLY_API_KEY/.test(out.campaigns.error)) out.needs.push("Instantly: put the API key in functions/.env as INSTANTLY_API_KEY.");
  return out;
}

async function campaignAct(ctx, body) {
  needKey(ctx);
  const id = String((body && body.id) || "");
  const action = String((body && body.action) || "");
  if (!ID.test(id)) throw new Error("That is not a campaign id.");
  if (action !== "pause" && action !== "activate") throw new Error("Pause or activate only.");
  await instantly(ctx, "campaigns/" + id + "/" + action, { method: "POST", body: "{}" });
  const after = await instantly(ctx, "campaigns/" + id);
  return { id, name: String(after.name || ""), status: CAMPAIGN_STATUS[String(after.status)] || "status " + after.status };
}

async function block(ctx, body) {
  needKey(ctx);
  const value = String((body && body.value) || "").trim().toLowerCase();
  if (!EMAIL.test(value) && !DOMAIN.test(value)) throw new Error("Give an email address or a domain.");
  await instantly(ctx, "block-lists-entries", { method: "POST", body: JSON.stringify({ bl_value: value }) });
  return { blocked: value };
}

// Lines of "host[, cc[, segment]]" (or a URL); the form's cc and segment fill what a line leaves out.
function prospectLines(text, defaults) {
  const d = defaults || {};
  const out = [], skipped = [];
  String(text || "").split(/[\n;]+/).map((l) => l.trim()).filter(Boolean).slice(0, QUEUE_MAX).forEach((line) => {
    const [raw, cc, sector] = line.split(/[,\t]/).map((s) => (s || "").trim());
    const lower = raw.toLowerCase();
    const host = sweep.hostOf(/^https?:\/\//.test(lower) ? lower.replace(/^http:/, "https:") : "https://" + lower);
    const country = String(cc || d.cc || "").toLowerCase();
    if (!host || !host.includes(".")) { skipped.push({ line, why: "no host" }); return; }
    if (sweep.BLOCKED.test(host) || sweep.RESERVED.test(host)) { skipped.push({ line, why: "blocked" }); return; }
    if (!/^[a-z]{2}$/.test(country)) { skipped.push({ line, why: "no two-letter country" }); return; }
    out.push({ host, cc: country, sector: String(sector || d.sector || "").toLowerCase().slice(0, 40) });
  });
  return { hosts: out, skipped };
}

async function queueProspects(db, body, now) {
  const parsed = prospectLines(body && body.hosts, { cc: body && body.cc, sector: body && body.sector });
  if (!parsed.hosts.length) throw new Error(parsed.skipped.length ? "Nothing to add: " + parsed.skipped.map((s) => s.line + " (" + s.why + ")").slice(0, 3).join(", ") : "Add at least one host.");
  const ref = db.collection("url_review_sweep").doc("outreach");
  const added = await db.runTransaction(async (tx) => {
    const hosts = ((await tx.get(ref)).data() || {}).hosts || [];
    const known = new Set(hosts.map((h) => h.host));
    const fresh = parsed.hosts.filter((h) => !known.has(h.host) && known.add(h.host));
    if (fresh.length) tx.set(ref, { hosts: hosts.concat(fresh), updated: new Date(now).toISOString() });
    return fresh;
  });
  return { added: added.length, already: parsed.hosts.length - added.length, skipped: parsed.skipped };
}

module.exports = { marketing, campaignRows, prospectRows, noteRows, parseName, windowOf, campaignAct, block, prospectLines, queueProspects, TTL: 10 * 60 * 1000 };
