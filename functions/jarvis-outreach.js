/* Jarvis outreach source (#1405, data for the outreach plan in #1278). One call returns:

   pipeline   prospects queued for the nightly sweep (url_review_sweep/outreach), how far the sweep got, the outreach
              reviews in range (url_reviews with sweep.outreach) by segment and result, and which have a Live Report
   instantly  campaigns by status, sent, opens, replies, positive replies, bounces, meetings, and mailbox warm-up
   plan       the private 90-day plan (jarvis_settings/outreach, uploaded by scripts/jarvis-outreach-plan.js):
              phase today, next milestone, deadlines, weekly funnel targets and the 90-day targets
   mail       the sending domain's MX, SPF, DKIM and DMARC

   The plan, prospect names and email copy stay out of the repo; only counts reach the dashboard. */

const ORIGIN = "https://carlosandmunoz.com";
const DAY = 24 * 60 * 60 * 1000;
const INSTANTLY = "https://api.instantly.ai/api/v2/";
const CAMPAIGN_STATUS = { 0: "draft", 1: "active", 2: "paused", 3: "completed", 4: "running subsequences", "-1": "accounts unhealthy", "-2": "bounce protect", "-99": "suspended" };

const clean = (error) => String((error && error.message) || error || "failed").slice(0, 200);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const toMs = (v) => (v && typeof v.toDate === "function" ? v.toDate().getTime() : Date.parse(v || "") || 0);
const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

function tally(map, key) { const k = String(key || "unknown").slice(0, 60); map[k] = (map[k] || 0) + 1; return map; }
const listOf = (map) => Object.keys(map).map((label) => ({ label, value: map[label] })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

// Monday 00:00 in Bogota (UTC-5, no DST) for the week holding `now`.
function weekStart(now) {
  const local = new Date(now - 5 * 3600 * 1000);
  const back = (local.getUTCDay() + 6) % 7;
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back) + 5 * 3600 * 1000;
}

function pipelineRows(queue, state, reviews, published, ctx) {
  const hosts = (queue && Array.isArray(queue.hosts) ? queue.hosts : []);
  const bySegment = {};
  hosts.forEach((h) => tally(bySegment, h.sector));
  const start = ctx.now - ctx.days * DAY;
  const week = weekStart(ctx.now);
  const live = new Set((published || []).map(bare));
  const mine = reviews.filter((r) => r.sweep && r.sweep.outreach);
  const inRange = mine.filter((r) => toMs(r.createdAt) >= start);
  const result = {};
  const segments = {};
  inRange.forEach((r) => {
    const status = /complete|done|ready/.test(r.status || "") ? "reviewed" : /fail|error|blocked/.test(r.status || "") ? "failed" : String(r.status || "queued");
    tally(result, status);
    tally(segments, r.sweep.sector);
  });
  const reviewedHosts = new Set(mine.map((r) => bare(r.sweep.host || r.requestedUrl)));
  const days = (state && state.days) || {};
  const daily = Object.keys(days).sort().filter((d) => Date.parse(d + "T12:00:00Z") >= start).map((date) => ({ date, reviews: Number(days[date].outreach) || 0 }));
  const scores = inRange.map((r) => Number(r.score)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    queued: hosts.length,
    swept: Math.min(Number(state && state.outreachAt) || 0, hosts.length),
    left: Math.max(0, hosts.length - (Number(state && state.outreachAt) || 0)),
    bySegment: listOf(bySegment),
    reviews: inRange.length,
    thisWeek: mine.filter((r) => toMs(r.createdAt) >= week).length,
    results: listOf(result),
    segments: listOf(segments),
    avgScore: scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null,
    withLiveReport: hosts.filter((h) => live.has(bare(h.host))).length,
    reviewedWithLiveReport: Array.from(reviewedHosts).filter((h) => live.has(h)).length,
    daily
  };
}

async function instantlyGet(ctx, path) {
  const res = await ctx.fetch(INSTANTLY + path, { headers: { Authorization: "Bearer " + ctx.env.INSTANTLY_API_KEY }, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Instantly " + res.status + ": " + String(data.message || data.error || "").slice(0, 120));
  return data;
}

function instantlyRows(campaigns, overview, perCampaign, accounts) {
  const status = {};
  (campaigns || []).forEach((c) => tally(status, CAMPAIGN_STATUS[String(c.status)] || "status " + c.status));
  const o = overview || {};
  const sent = Number(o.emails_sent_count) || 0;
  const contacted = Number(o.contacted_count) || 0;
  const replies = Number(o.reply_count_unique) || 0;
  return {
    campaigns: (campaigns || []).length,
    status: listOf(status),
    sent,
    contacted,
    opened: Number(o.open_count_unique) || 0,
    replies,
    autoReplies: Number(o.reply_count_automatic_unique) || 0,
    interested: Number(o.total_interested) || 0,
    meetings: Number(o.total_meeting_booked) || 0,
    bounced: Number(o.bounced_count) || 0,
    unsubscribed: Number(o.unsubscribed_count) || 0,
    rates: { open: pct(Number(o.open_count_unique) || 0, contacted), reply: pct(replies, contacted), positive: pct(Number(o.total_interested) || 0, contacted), bounce: pct(Number(o.bounced_count) || 0, sent) },
    byCampaign: (perCampaign || []).filter((c) => (c.emails_sent_count || 0) > 0).map((c) => ({
      name: String(c.campaign_name || "").slice(0, 60), sent: c.emails_sent_count || 0, opened: c.open_count_unique || c.open_count || 0,
      replies: c.reply_count_unique || c.reply_count || 0, bounced: c.bounced_count || 0
    })).sort((a, b) => b.sent - a.sent).slice(0, 12),
    accounts: (accounts || []).map((a) => ({
      email: String(a.email || ""), status: a.status === 1 ? "active" : a.status === 2 ? "paused" : a.status < 0 ? "error" : "status " + a.status,
      warmup: a.warmup_status === 1 ? "on" : a.warmup_status === 0 ? "off" : "status " + a.warmup_status, score: a.stat_warmup_score == null ? null : Number(a.stat_warmup_score),
      dailyLimit: a.daily_limit || null
    }))
  };
}

async function instantly(ctx) {
  if (!(ctx.env || {}).INSTANTLY_API_KEY) return { ok: false, error: "INSTANTLY_API_KEY is not set.", need: "Instantly: put the API key (Settings > Integrations > API keys) in Secret Manager as INSTANTLY_API_KEY." };
  const from = new Date(ctx.now - ctx.days * DAY).toISOString().slice(0, 10);
  const to = new Date(ctx.now).toISOString().slice(0, 10);
  const [campaigns, overview, per, accounts] = await Promise.all([
    instantlyGet(ctx, "campaigns?limit=100"),
    instantlyGet(ctx, "campaigns/analytics/overview?start_date=" + from + "&end_date=" + to),
    instantlyGet(ctx, "campaigns/analytics?start_date=" + from + "&end_date=" + to).catch(() => []),
    instantlyGet(ctx, "accounts?limit=50")
  ]);
  return Object.assign({ ok: true }, instantlyRows(campaigns.items, overview, Array.isArray(per) ? per : per.items, accounts.items));
}

// The plan as of `now`: phase, next milestone, deadlines with days left.
function planNow(plan, now) {
  if (!plan || !plan.start) return null;
  const at = (d) => Date.parse(d + "T12:00:00Z");
  const phase = (plan.phases || []).find((p) => now >= at(p.start) - 12 * 3600 * 1000 && now <= at(p.end) + 12 * 3600 * 1000) || null;
  const next = (plan.milestones || []).filter((m) => at(m.date) >= now - 12 * 3600 * 1000).sort((a, b) => at(a.date) - at(b.date))[0] || null;
  const daysTo = (d) => Math.ceil((at(d) - now) / DAY);
  return {
    start: plan.start, end: plan.end,
    day: Math.max(0, Math.floor((now - at(plan.start)) / DAY) + 1), length: Math.round((at(plan.end) - at(plan.start)) / DAY) + 1,
    phase: phase ? { name: phase.name, end: phase.end, daysLeft: daysTo(phase.end) } : null,
    next: next ? { date: next.date, label: next.label, daysLeft: daysTo(next.date) } : null,
    phases: (plan.phases || []).map((p) => ({ name: p.name, start: p.start, end: p.end })),
    milestones: (plan.milestones || []).map((m) => ({ date: m.date, label: m.label, past: at(m.date) < now - 12 * 3600 * 1000 })),
    deadlines: (plan.deadlines || []).map((d) => ({ date: d.date, label: d.label, daysLeft: daysTo(d.date) })).sort((a, b) => a.daysLeft - b.daysLeft),
    weekly: plan.weekly || {},
    targets: plan.targets || [],
    tracker: plan.tracker || null,
    mailDomain: plan.mailDomain || "",
    updatedAt: plan.updatedAt || ""
  };
}

async function dnsTxt(ctx, name, type) {
  const res = await ctx.fetch("https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=" + type, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  const code = { TXT: 16, MX: 15, CNAME: 5 }[type];
  return (data.Answer || []).filter((a) => a.type === code).map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/" "/g, ""));
}

async function mailHealth(ctx, domain) {
  const [txt, dmarc, mx, s1, s2] = await Promise.all([
    dnsTxt(ctx, domain, "TXT"), dnsTxt(ctx, "_dmarc." + domain, "TXT"), dnsTxt(ctx, domain, "MX"),
    dnsTxt(ctx, "selector1._domainkey." + domain, "CNAME"), dnsTxt(ctx, "selector2._domainkey." + domain, "CNAME")
  ]);
  const spf = txt.filter((r) => /^v=spf1/i.test(r));
  const dm = dmarc.find((r) => /^v=DMARC1/i.test(r)) || "";
  const p = (/;\s*p=([a-z]+)/i.exec(dm) || [])[1] || "";
  const checks = [
    { name: "MX", ok: mx.length > 0, detail: mx.length ? mx.join(", ").slice(0, 100) : "No MX record: replies bounce." },
    { name: "SPF", ok: spf.length === 1, detail: spf.length === 1 ? spf[0].slice(0, 100) : spf.length ? "Two SPF records." : "No SPF record." },
    { name: "DKIM", ok: s1.length > 0 && s2.length > 0, detail: s1.length && s2.length ? "selector1 and selector2 are published." : "Microsoft 365 DKIM selector " + (s1.length ? "2" : "1") + " is missing." },
    { name: "DMARC", ok: !!dm && p !== "none", detail: dm ? "p=" + (p || "?") + (p === "none" ? " (monitor only)" : "") : "No DMARC record." }
  ];
  return { domain, checks, ok: checks.every((c) => c.ok) };
}

async function outreach(ctx) {
  const needs = [];
  const out = { ok: true, needs, days: ctx.days };
  const part = async (name, run) => { try { out[name] = await run(); } catch (error) { out[name] = { ok: false, error: clean(error) }; } };
  let planDoc = null;
  await Promise.all([
    part("pipeline", async () => {
      const since = new Date(Math.min(ctx.now - ctx.days * DAY, weekStart(ctx.now))).toISOString();
      const [queue, state, reviews, index] = await Promise.all([
        ctx.db.collection("url_review_sweep").doc("outreach").get(),
        ctx.db.collection("url_review_sweep").doc("state").get(),
        ctx.db.collection("url_reviews").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(3000).get(),
        ctx.fetch(ORIGIN + "/assets/live-reports/index.json", { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => ({ reports: [] }))
      ]);
      return Object.assign({ ok: true }, pipelineRows(queue.exists ? queue.data() : null, state.exists ? state.data() : null, reviews.docs.map((d) => d.data()), (index.reports || []).map((r) => r.host), ctx));
    }),
    part("instantly", () => instantly(ctx)),
    part("plan", async () => {
      const snap = await ctx.db.collection("jarvis_settings").doc("outreach").get();
      planDoc = snap.exists ? snap.data() : null;
      return planNow(planDoc, ctx.now) || { ok: false, error: "No plan uploaded." };
    })
  ]);
  if (out.instantly && out.instantly.need) needs.push(out.instantly.need);
  if (out.plan && out.plan.ok === false) needs.push("Outreach plan: run node scripts/jarvis-outreach-plan.js <plan.json> to upload the private 90-day plan (dates, milestones, targets).");
  const domain = (planDoc && planDoc.mailDomain) || "qalabreview.com";
  await part("mail", () => mailHealth(ctx, domain));
  return out;
}

module.exports = { outreach, pipelineRows, instantlyRows, planNow, mailHealth, weekStart, TTL: 30 * 60 * 1000 };
