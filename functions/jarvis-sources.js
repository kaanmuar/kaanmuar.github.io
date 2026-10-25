/* Jarvis connectors: the sources beyond the product numbers. Each returns {ok, ...data, needs[]} where needs lists
   what Carlos has to grant before a part of the source works; a missing grant never fails the whole source.

   money      paid URL reviews (Firestore url_reviews), PayPal disputes and transactions, Stripe mode
   email      SendGrid delivery, bounces, blocks, spam reports and opens
   search     Brave rankings for the brand queries, Search Console clicks and queries
   social     posts per network from the published ledgers, YouTube views
   safety     Web Risk, SPF, DKIM, DMARC, MX, CAA, domain expiry (RDAP), TLS
   platform   real function failures (5xx, crash, timeout), executions, Gemini calls, Firestore reads and writes

   index.js passes ctx = {fetch, env, db, now, days, settings, paypal, tls, listUsers} and caches each source in
   jarvis_cache through TTL. */

const ORIGIN = "https://carlosandmunoz.com";
const DOMAIN = "carlosandmunoz.com";
const PROJECT = "carlosm-interactive-cv";
const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TTL = { money: 10 * MINUTE, email: 30 * MINUTE, search: 24 * HOUR, social: HOUR, safety: 6 * HOUR, platform: 10 * MINUTE };
const { SEARCH_QUERIES } = require("./jarvis-core");
const FIRESTORE_FREE = { reads: 50000, writes: 20000, deletes: 20000 };

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const clean = (error) => String((error && error.message) || error || "failed").slice(0, 200);
const round = (n, places) => { const f = Math.pow(10, places || 0); return Math.round((Number(n) || 0) * f) / f; };

function tally(map, key, by) {
  const name = String(key || "unknown").slice(0, 80);
  map[name] = (map[name] || 0) + (by === undefined ? 1 : by);
  return map;
}

function listOf(map, limit) {
  return Object.keys(map).map((label) => ({ label, value: round(map[label], 2) })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, limit || 12);
}

async function getJson(fetchImpl, url, options, label) {
  const res = await fetchImpl(url, Object.assign({ signal: AbortSignal.timeout(15000) }, options || {}));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error((label || "request") + " " + res.status + ": " + String((data.error && (data.error.message || data.error)) || data.message || (data.errors && data.errors[0] && data.errors[0].message) || "no answer").slice(0, 160));
    error.status = res.status;
    error.name = String(data.name || (data.error && data.error.status) || "");
    throw error;
  }
  return data;
}

async function googleToken(fetchImpl, scope) {
  const res = await fetchImpl(METADATA + "token?scopes=" + encodeURIComponent(scope), { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("No Google token (" + res.status + ")");
  return (await res.json()).access_token;
}

async function serviceAccount(fetchImpl) {
  try {
    const res = await fetchImpl(METADATA + "email", { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) });
    return res.ok ? (await res.text()).trim() : "";
  } catch (error) { return ""; }
}

// --- money -----------------------------------------------------------------------------------------------------

function moneyRows(rows, { start, priorStart }) {
  // A paid review run carries no price; the money sits on the purchase or credit row it used.
  const now = { usd: 0, count: 0, runs: 0 };
  const prior = { usd: 0, count: 0, runs: 0 };
  const providers = {};
  const purposes = {};
  const daily = {};
  let refunds = 0;
  rows.forEach((row) => {
    if (row.test === true || !row.paid) return;
    const at = Date.parse(row.createdAt || "");
    if (!Number.isFinite(at) || at < priorStart) return;
    const usd = Number(row.priceUsd) || 0;
    const bucket = at >= start ? now : prior;
    if (!usd) {
      bucket.runs += 1;
      return;
    }
    bucket.usd += usd;
    bucket.count += 1;
    if (at < start) return;
    tally(providers, row.provider || "unknown", usd);
    tally(purposes, row.purpose || (String(row.id || "").startsWith("credit-") || /credit/.test(row.status || "") ? "credit" : "review"), usd);
    tally(daily, isoDay(at), usd);
    refunds += Number(row.refundedUsd) || (/refunded/.test(row.status || "") ? usd : 0);
  });
  return {
    revenue: { usd: round(now.usd, 2), count: now.count, avgUsd: now.count ? round(now.usd / now.count, 2) : 0, paidRuns: now.runs },
    prior: { usd: round(prior.usd, 2), count: prior.count, paidRuns: prior.runs },
    refundsUsd: round(refunds, 2),
    byProvider: listOf(providers),
    byPurpose: listOf(purposes),
    daily: Object.keys(daily).sort().map((date) => ({ date, usd: round(daily[date], 2) }))
  };
}

async function paypalPart(ctx, { start, end }) {
  const out = { ok: false, disputesOpen: null, transactions: null, needs: [] };
  if (!ctx.paypal) { out.error = "PayPal is not set up."; return out; }
  let token;
  try { token = await ctx.paypal.token(); } catch (error) { out.error = clean(error); return out; }
  const host = "https://" + ctx.paypal.host;
  const auth = { headers: { Authorization: "Bearer " + token } };
  try {
    const disputes = await getJson(ctx.fetch, host + "/v1/customer/disputes?page_size=50", auth, "PayPal disputes");
    out.disputesOpen = (disputes.items || []).filter((d) => !["RESOLVED"].includes(String(d.status || "").toUpperCase())).length;
    out.ok = true;
  } catch (error) { out.error = clean(error); }
  try {
    const from = new Date(Math.max(start, end - 31 * DAY + MINUTE)).toISOString().replace(/\.\d+Z$/, "-0000");
    const to = new Date(end).toISOString().replace(/\.\d+Z$/, "-0000");
    const data = await getJson(ctx.fetch, host + "/v1/reporting/transactions?fields=transaction_info&page_size=500&start_date=" + encodeURIComponent(from) + "&end_date=" + encodeURIComponent(to), auth, "PayPal transactions");
    let gross = 0, fees = 0, count = 0;
    (data.transaction_details || []).forEach((row) => {
      const info = row.transaction_info || {};
      const amount = Number((info.transaction_amount || {}).value) || 0;
      if (amount <= 0) return;
      gross += amount;
      fees += Math.abs(Number((info.fee_amount || {}).value) || 0);
      count += 1;
    });
    out.transactions = { count, grossUsd: round(gross, 2), feesUsd: round(fees, 2), netUsd: round(gross - fees, 2) };
  } catch (error) {
    if (error.status === 403 || /NOT_AUTHORIZED/i.test(error.name + error.message)) out.needs.push("PayPal: turn on Transaction search for the live app (developer.paypal.com > Apps & Credentials > the app > Features) so Jarvis can read fees and payouts.");
    else out.transactionsError = clean(error);
  }
  return out;
}

async function money(ctx) {
  const days = ctx.days;
  const start = ctx.now - days * DAY;
  const priorStart = ctx.now - 2 * days * DAY;
  const snap = await ctx.db.collection("url_reviews").where("paid", "==", true).where("createdAt", ">=", new Date(priorStart).toISOString()).limit(3000).get();
  const out = Object.assign({ ok: true, days }, moneyRows(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())), { start, priorStart }));
  out.paypal = await paypalPart(ctx, { start, end: ctx.now });
  const stripe = String((ctx.env || {}).STRIPE_SECRET_KEY || "");
  out.stripe = { mode: /^(sk|rk)_live_/.test(stripe) ? "live" : /^(sk|rk)_test_/.test(stripe) ? "test" : "none" };
  out.needs = out.paypal.needs.slice();
  return out;
}

// --- email -----------------------------------------------------------------------------------------------------

async function email(ctx) {
  const key = (ctx.env || {}).SENDGRID_API_KEY;
  if (!key) return { ok: false, error: "SENDGRID_API_KEY is not mounted on this function.", needs: [] };
  const auth = { headers: { Authorization: "Bearer " + key } };
  const base = "https://api.sendgrid.com/v3/";
  const since = ctx.now - ctx.days * DAY;
  const stats = await getJson(ctx.fetch, base + "stats?aggregated_by=day&start_date=" + isoDay(since), auth, "SendGrid stats");
  const keys = ["requests", "processed", "delivered", "bounces", "blocks", "deferred", "spam_reports", "unsubscribes", "opens", "unique_opens", "clicks", "unique_clicks", "invalid_emails"];
  const totals = keys.reduce((m, k) => { m[k] = 0; return m; }, {});
  const daily = (Array.isArray(stats) ? stats : []).map((day) => {
    const m = ((day.stats || [])[0] || {}).metrics || {};
    keys.forEach((k) => { totals[k] += Number(m[k]) || 0; });
    return { date: day.date, processed: m.processed || 0, delivered: m.delivered || 0, bad: (m.bounces || 0) + (m.blocks || 0) + (m.spam_reports || 0), opens: m.unique_opens || 0 };
  });
  const pct = (a, b) => (b ? round((a / b) * 100, 1) : null);
  const suppressed = async (kind) => {
    try {
      const rows = await getJson(ctx.fetch, base + "suppression/" + kind + "?limit=200&start_time=" + Math.floor(since / 1000), auth, "SendGrid " + kind);
      return (Array.isArray(rows) ? rows : []).map((r) => ({ domain: String(r.email || "").split("@")[1] || "", reason: String(r.reason || r.status || "").slice(0, 120), at: r.created ? new Date(r.created * 1000).toISOString() : "" }));
    } catch (error) { return null; }
  };
  const [bounces, blocks, spam] = await Promise.all([suppressed("bounces"), suppressed("blocks"), suppressed("spam_reports")]);
  return {
    ok: true,
    days: ctx.days,
    totals,
    rates: { delivered: pct(totals.delivered, totals.processed), bad: pct(totals.bounces + totals.blocks + totals.spam_reports, totals.processed), opened: pct(totals.unique_opens, totals.delivered), clicked: pct(totals.unique_clicks, totals.delivered) },
    daily,
    suppressions: { bounces, blocks, spam },
    needs: []
  };
}

// --- search ----------------------------------------------------------------------------------------------------

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (error) { return ""; }
}

async function brave(ctx, queries) {
  const key = (ctx.env || {}).BRAVE_SEARCH_KEY;
  if (!key) return { ok: false, error: "BRAVE_SEARCH_KEY is not set." };
  const rows = [];
  for (const q of queries) {
    try {
      const data = await getJson(ctx.fetch, "https://api.search.brave.com/res/v1/web/search?count=20&q=" + encodeURIComponent(q), { headers: { "X-Subscription-Token": key, Accept: "application/json" } }, "Brave");
      const results = ((data.web || {}).results || []);
      const at = results.findIndex((r) => hostOf(r.url).endsWith(DOMAIN));
      rows.push({ query: q, position: at >= 0 ? at + 1 : null, url: at >= 0 ? results[at].url : "", leader: results[0] ? hostOf(results[0].url) : "" });
    } catch (error) {
      rows.push({ query: q, position: null, error: clean(error) });
    }
  }
  return { ok: true, queries: rows };
}

async function searchConsole(ctx) {
  const site = "sc-domain:" + DOMAIN;
  let token;
  try { token = await googleToken(ctx.fetch, "https://www.googleapis.com/auth/webmasters.readonly"); } catch (error) { return { ok: false, error: clean(error) }; }
  const end = isoDay(ctx.now - 2 * DAY);
  const start = isoDay(ctx.now - (ctx.days + 2) * DAY);
  const url = "https://searchconsole.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(site) + "/searchAnalytics/query";
  const post = (body) => getJson(ctx.fetch, url, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ startDate: start, endDate: end }, body)) }, "Search Console");
  try {
    const [byDay, byQuery, byPage] = await Promise.all([post({ dimensions: ["date"], rowLimit: 400 }), post({ dimensions: ["query"], rowLimit: 15 }), post({ dimensions: ["page"], rowLimit: 10 })]);
    const rows = byDay.rows || [];
    const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const impressions = sum("impressions");
    return {
      ok: true,
      clicks: sum("clicks"),
      impressions,
      ctr: impressions ? round((sum("clicks") / impressions) * 100, 2) : 0,
      position: impressions ? round(rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions, 1) : null,
      daily: rows.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
      queries: (byQuery.rows || []).map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: round(r.position, 1) })),
      pages: (byPage.rows || []).map((r) => ({ page: r.keys[0].replace(ORIGIN, "") || "/", clicks: r.clicks, impressions: r.impressions }))
    };
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      const sa = await serviceAccount(ctx.fetch);
      return { ok: false, error: "No access to " + site + ".", need: "Search Console: Settings > Users and permissions > Add user " + (sa || "the functions service account") + " with Restricted permission for " + site + "." };
    }
    return { ok: false, error: clean(error) };
  }
}

async function search(ctx) {
  const queries = ((ctx.settings || {}).searchQueries || []).length ? ctx.settings.searchQueries : SEARCH_QUERIES;
  const [ranks, gsc] = await Promise.all([brave(ctx, queries.slice(0, 8)), searchConsole(ctx)]);
  return { ok: true, brave: ranks, console: gsc, needs: gsc.need ? [gsc.need] : [] };
}

// --- social ----------------------------------------------------------------------------------------------------

async function social(ctx) {
  const since = ctx.now - ctx.days * DAY;
  const ledger = async (name) => {
    try { return await getJson(ctx.fetch, ORIGIN + "/assets/social/" + name + ".json?t=" + Math.floor(ctx.now / HOUR), {}, name + " ledger"); } catch (error) { return null; }
  };
  const [buffer, facebook, youtube] = await Promise.all([ledger("buffer"), ledger("facebook"), ledger("youtube")]);
  const channels = {};
  const results = {};
  const daily = {};
  const latest = [];
  [buffer, facebook].forEach((book) => {
    Object.keys((book && book.posts) || {}).forEach((post) => {
      (book.posts[post] || []).forEach((row) => {
        const at = Date.parse(row.at || "");
        if (!Number.isFinite(at) || at < since) return;
        const key = (row.channel || "other") + ":" + (row.result || "unknown");
        tally(results, key);
        if (row.result === "sent") { tally(channels, row.channel || "other"); tally(daily, isoDay(at)); }
        latest.push({ at: row.at, channel: row.channel, result: row.result, post, url: row.url || "" });
      });
    });
  });
  const videos = Object.keys((youtube && youtube.videos) || {}).map((id) => Object.assign({ id }, youtube.videos[id]));
  const needs = [];
  let views = null;
  const key = (ctx.env || {}).YOUTUBE_KEY;
  if (key && videos.length) {
    try {
      const ids = videos.slice(0, 50).map((v) => v.id).join(",");
      const data = await getJson(ctx.fetch, "https://www.googleapis.com/youtube/v3/videos?part=statistics&id=" + ids + "&key=" + key, {}, "YouTube");
      const stats = {};
      (data.items || []).forEach((item) => { stats[item.id] = item.statistics || {}; });
      videos.forEach((v) => { const s = stats[v.id] || {}; v.views = Number(s.viewCount) || 0; v.likes = Number(s.likeCount) || 0; v.comments = Number(s.commentCount) || 0; });
      views = videos.reduce((s, v) => s + (v.views || 0), 0);
    } catch (error) { needs.push("YouTube: " + clean(error)); }
  } else if (!key) needs.push("YouTube: set YOUTUBE_KEY (an API key limited to the YouTube Data API v3) in functions/.env.");
  if (!(ctx.env || {}).FACEBOOK_PAGE_TOKEN) needs.push("Facebook: copy FACEBOOK_PAGE_TOKEN from the GitHub secrets into functions/.env so Jarvis can read post reach.");
  const failed = Object.keys(results).filter((k) => /:failed$/.test(k)).reduce((s, k) => s + results[k], 0);
  return {
    ok: !!(buffer || facebook),
    error: buffer || facebook ? "" : "The social ledgers could not be read from the site.",
    days: ctx.days,
    sent: Object.keys(channels).reduce((s, k) => s + channels[k], 0),
    failed,
    channels: listOf(channels),
    results: listOf(results, 24),
    daily: Object.keys(daily).sort().map((date) => ({ date, posts: daily[date] })),
    latest: latest.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 15),
    youtube: { videos: videos.sort((a, b) => (b.views || 0) - (a.views || 0) || Date.parse(b.published || 0) - Date.parse(a.published || 0)).slice(0, 10), views },
    needs
  };
}

// --- safety ----------------------------------------------------------------------------------------------------

async function dns(ctx, name, type) {
  const data = await getJson(ctx.fetch, "https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=" + type, {}, "DNS");
  return (data.Answer || []).filter((a) => a.type === { TXT: 16, MX: 15, CNAME: 5, CAA: 257 }[type]).map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/" "/g, ""));
}

function dmarcPolicy(record) {
  const tag = (k) => ((new RegExp("(?:^|;)\\s*" + k + "=([^;]+)", "i").exec(record) || [])[1] || "").trim();
  return { p: tag("p").toLowerCase(), pct: tag("pct") ? Number(tag("pct")) : 100, rua: !!tag("rua") };
}

async function safety(ctx) {
  const checks = [];
  const add = (name, level, detail, key) => checks.push({ name, level, ok: level === "good" || level === "info", detail, key: key || name.toLowerCase().replace(/\W+/g, "-") });
  const step = async (name, run) => { try { await run(); } catch (error) { add(name, "warn", "Could not check: " + clean(error)); } };
  await Promise.all([
    step("Web Risk", async () => {
      const key = (ctx.env || {}).WEBRISK_KEY;
      if (!key) { add("Web Risk", "info", "WEBRISK_KEY is not set."); return; }
      const data = await getJson(ctx.fetch, "https://webrisk.googleapis.com/v1/uris:search?threatTypes=MALWARE&threatTypes=SOCIAL_ENGINEERING&threatTypes=UNWANTED_SOFTWARE&uri=" + encodeURIComponent(ORIGIN + "/") + "&key=" + key, {}, "Web Risk");
      if (data.threat) add("Web Risk", "alert", "Google lists " + DOMAIN + " as " + (data.threat.threatTypes || []).join(", ") + ".", "webrisk");
      else add("Web Risk", "good", "Not on Google's malware or phishing lists.", "webrisk");
    }),
    step("SPF", async () => {
      const spf = (await dns(ctx, DOMAIN, "TXT")).filter((r) => /^v=spf1/i.test(r));
      if (!spf.length) add("SPF", "alert", "No SPF record: mail from " + DOMAIN + " can be spoofed and lands in spam.", "spf");
      else if (spf.length > 1) add("SPF", "alert", "Two SPF records; receivers treat that as no SPF.", "spf");
      else add("SPF", /sendgrid\.net/.test(spf[0]) ? "good" : "warn", spf[0].slice(0, 120) + (/sendgrid\.net/.test(spf[0]) ? "" : " (SendGrid is not included)"), "spf");
    }),
    step("DMARC", async () => {
      const rec = (await dns(ctx, "_dmarc." + DOMAIN, "TXT")).find((r) => /^v=DMARC1/i.test(r));
      if (!rec) { add("DMARC", "alert", "No DMARC record.", "dmarc"); return; }
      const d = dmarcPolicy(rec);
      if (d.p === "none") add("DMARC", "warn", "DMARC is monitor-only (p=none).", "dmarc");
      else if (d.pct < 100) add("DMARC", "info", "DMARC p=" + d.p + " applies to " + d.pct + "% of failing mail.", "dmarc");
      else add("DMARC", "good", "DMARC p=" + d.p + " on all mail" + (d.rua ? ", with reports." : "."), "dmarc");
    }),
    step("DKIM", async () => {
      const [s1, s2] = await Promise.all([dns(ctx, "s1._domainkey." + DOMAIN, "CNAME"), dns(ctx, "s2._domainkey." + DOMAIN, "CNAME")]);
      if (s1.length && s2.length) add("DKIM", "good", "SendGrid signing keys s1 and s2 are published.", "dkim");
      else add("DKIM", "warn", "SendGrid DKIM key " + (s1.length ? "s2" : "s1") + " is missing.", "dkim");
    }),
    step("MX", async () => {
      const mx = await dns(ctx, DOMAIN, "MX");
      add("MX", mx.length ? "good" : "alert", mx.length ? mx.join(", ").slice(0, 120) : "No MX record: replies to " + DOMAIN + " addresses bounce.", "mx");
    }),
    step("CAA", async () => {
      const caa = await dns(ctx, DOMAIN, "CAA");
      add("CAA", "info", caa.length ? "Certificates limited to " + Array.from(new Set(caa.map((r) => (/issue(?:wild)? "([^;"]+)/.exec(r) || [])[1]).filter(Boolean))).join(", ") + "." : "No CAA record: any authority may issue certificates.", "caa");
    }),
    step("Domain", async () => {
      const data = await getJson(ctx.fetch, "https://rdap.verisign.com/com/v1/domain/" + DOMAIN, { headers: { Accept: "application/rdap+json" } }, "RDAP");
      const exp = (data.events || []).find((e) => e.eventAction === "expiration");
      if (!exp) { add("Domain", "warn", "The registry did not give an expiry date.", "domain"); return; }
      const left = Math.floor((Date.parse(exp.eventDate) - ctx.now) / DAY);
      const min = (ctx.thresholds || {}).domainDays || 30;
      add("Domain", left < min ? "alert" : "good", DOMAIN + " expires " + exp.eventDate.slice(0, 10) + " (" + left + " days).", "domain");
    }),
    step("TLS", async () => {
      const left = ctx.tls ? await ctx.tls(DOMAIN, ctx.now) : null;
      if (left === null || left === undefined) add("TLS", "warn", "Could not read the certificate.", "tls-cert");
      else add("TLS", left < ((ctx.thresholds || {}).tlsDays || 21) ? "alert" : "good", "Certificate valid for " + left + " more days.", "tls-cert");
    })
  ]);
  const order = { alert: 0, warn: 1, info: 2, good: 3 };
  checks.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name));
  return { ok: true, checks, score: Math.round((checks.filter((c) => c.ok).length / Math.max(1, checks.length)) * 100), needs: [] };
}

// --- platform --------------------------------------------------------------------------------------------------

async function monitoring(ctx, token, filter, { start, end, groupBy, period }) {
  const params = new URLSearchParams({
    filter,
    "interval.startTime": new Date(start).toISOString(),
    "interval.endTime": new Date(end).toISOString(),
    "aggregation.alignmentPeriod": (period || Math.max(60, Math.round((end - start) / 1000))) + "s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM"
  });
  (groupBy || []).forEach((g) => params.append("aggregation.groupByFields", g));
  const data = await getJson(ctx.fetch, "https://monitoring.googleapis.com/v3/projects/" + PROJECT + "/timeSeries?" + params.toString(), { headers: { Authorization: "Bearer " + token } }, "Monitoring");
  return (data.timeSeries || []).map((s) => ({
    labels: Object.assign({}, (s.metric || {}).labels, (s.resource || {}).labels),
    value: (s.points || []).reduce((sum, p) => sum + (Number(p.value.int64Value || p.value.doubleValue) || 0), 0)
  }));
}

async function realFailures(ctx, token, start) {
  const filter = 'resource.type="cloud_function" AND timestamp>="' + new Date(start).toISOString() + '" AND (textPayload:"finished with status: \'crash\'" OR textPayload:"finished with status: \'timeout\'" OR textPayload:"finished with status: \'error\'" OR textPayload:"finished with status code: 5" OR textPayload:"finished with status: \'connection error\'")';
  const data = await getJson(ctx.fetch, "https://logging.googleapis.com/v2/entries:list", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ resourceNames: ["projects/" + PROJECT], filter, orderBy: "timestamp desc", pageSize: 1000 })
  }, "Logging");
  const byFunction = {};
  const kinds = {};
  const latest = [];
  (data.entries || []).forEach((entry) => {
    const fn = ((entry.resource || {}).labels || {}).function_name || "unknown";
    const text = String(entry.textPayload || "");
    const kind = (/status code: (5\d\d)/.exec(text) || [])[1] || (/status: '([^']+)'/.exec(text) || [])[1] || "error";
    tally(byFunction, fn);
    tally(kinds, kind);
    if (latest.length < 10) latest.push({ at: entry.timestamp, fn, kind });
  });
  return { total: (data.entries || []).length, capped: !!data.nextPageToken, byFunction: listOf(byFunction), kinds: listOf(kinds), latest };
}

async function platform(ctx) {
  const needs = [];
  const out = { ok: true, needs };
  let token;
  try { token = await googleToken(ctx.fetch, "https://www.googleapis.com/auth/cloud-platform"); } catch (error) { return { ok: false, error: clean(error), needs }; }
  const end = ctx.now;
  const day = end - DAY;
  const week = end - 7 * DAY;
  const part = async (name, run) => { try { out[name] = await run(); } catch (error) { out[name] = { error: clean(error) }; } };
  await Promise.all([
    part("functions", async () => {
      const [runs, failures] = await Promise.all([
        monitoring(ctx, token, 'metric.type="cloudfunctions.googleapis.com/function/execution_count"', { start: day, end, groupBy: ["metric.label.status"] }),
        realFailures(ctx, token, day)
      ]);
      const total = runs.reduce((s, r) => s + r.value, 0);
      const notOk = runs.filter((r) => r.labels.status !== "ok").reduce((s, r) => s + r.value, 0);
      return { executions: total, notOk, failures: failures.total, failureRate: total ? round((failures.total / total) * 100, 2) : 0, byFunction: failures.byFunction, kinds: failures.kinds, latest: failures.latest, capped: failures.capped };
    }),
    part("gemini", async () => {
      const rows = await monitoring(ctx, token, 'metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.labels.service="generativelanguage.googleapis.com"', { start: week, end, groupBy: ["metric.label.response_code_class", "resource.label.method"] });
      const byClass = {};
      const failedMethods = {};
      rows.forEach((r) => {
        tally(byClass, r.labels.response_code_class || "unknown", r.value);
        if (!/^2/.test(r.labels.response_code_class || "")) tally(failedMethods, String(r.labels.method || "").split(".").pop(), r.value);
      });
      const total = rows.reduce((s, r) => s + r.value, 0);
      const ok = byClass["2xx"] || 0;
      return { days: 7, requests: total, ok, errorRate: total ? round(((total - ok) / total) * 100, 1) : 0, byClass: listOf(byClass), failedMethods: listOf(failedMethods) };
    }),
    part("firestore", async () => {
      const kinds = { reads: "read_count", writes: "write_count", deletes: "delete_count" };
      const usage = {};
      await Promise.all(Object.keys(kinds).map(async (k) => {
        const rows = await monitoring(ctx, token, 'metric.type="firestore.googleapis.com/document/' + kinds[k] + '"', { start: day, end });
        usage[k] = rows.reduce((s, r) => s + r.value, 0);
      }));
      Object.keys(FIRESTORE_FREE).forEach((k) => { usage[k + "FreePct"] = round((usage[k] / FIRESTORE_FREE[k]) * 100, 1); });
      return usage;
    }),
    part("users", async () => {
      if (!ctx.listUsers) return null;
      const users = await ctx.listUsers();
      const since = end - ctx.days * DAY;
      return { total: users.length, newInRange: users.filter((u) => Date.parse(u.created || 0) >= since).length, activeInRange: users.filter((u) => Date.parse(u.lastSignIn || 0) >= since).length };
    })
  ]);
  needs.push("Costs: in the Cloud console open Billing > Billing export and turn on the detailed usage cost export to BigQuery (dataset jarvis_billing in " + PROJECT + "), so Jarvis can show spend and cost per review.");
  return out;
}

const SOURCES = { money, email, search, social, safety, platform };

async function run(name, ctx) {
  const source = SOURCES[name];
  if (!source) throw new Error("Unknown source.");
  try {
    return await source(ctx);
  } catch (error) {
    return { ok: false, error: clean(error), needs: [] };
  }
}

module.exports = { SOURCES, TTL, SEARCH_QUERIES, run, money, moneyRows, email, search, brave, searchConsole, social, safety, dmarcPolicy, platform, monitoring, realFailures, hostOf };
