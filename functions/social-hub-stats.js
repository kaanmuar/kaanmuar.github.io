/* Numbers for the social hub: the Social hub pane in admin.html and the hub's public Trending filter.

   site_events (js/site-analytics.js) is the main source: hub_view and post_view on every page load, and opens,
   plays, copies, shares and downloads per post and per network. GA4 only sees visitors who allowed analytics
   (js/qa-review-consent.js), so it adds where they came from (UTM source and campaign) and its own view counts.
   The functions service account reads GA4 property 495572902 ("Interactive CV") as a Viewer.

   socialHubStats/latest   owner only (firestore.rules): every number, for the admin pane.
   socialHub/trends        public: post ids ranked by the last 7 days, no counts. scripts/build-social-hub.js pulls it. */

const PROPERTY = "495572902";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta/properties/" + PROPERTY + ":runReport";
const TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes="
  + encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly");
const HUB_PATHS = "^/(social/|qa-review-social)";
const DAY = 24 * 60 * 60 * 1000;
const POSTS_KEPT = 300;
const TRENDING = 30;

// What each event says about a post, and how much it counts towards Trending.
const EVENTS = {
  post_view: ["views", 1],
  hub_open: ["opens", 2], hub_play: ["plays", 2], hub_copy: ["copies", 3], hub_share: ["shares", 3], hub_download: ["downloads", 3], hub_report: ["reports", 1],
  post_play: ["plays", 2], post_copy: ["copies", 3], post_share: ["shares", 3], post_download: ["downloads", 3], post_report: ["reports", 1], post_related: ["opens", 1]
};
const NETWORKED = new Set(["hub_copy", "hub_share", "post_copy", "post_share"]);
const COUNTS = ["views", "views7", "gaViews", "gaViews7", "gaUsers", "opens", "plays", "copies", "shares", "downloads", "reports"];

// /social/<id>.html is a post page; the hub pages are qa-review-social[-xx].html.
function postIdFromPath(path) {
  const match = /^\/social\/(.+)\.html$/.exec(String(path || "").split("?")[0]);
  return match ? decodeURIComponent(match[1]) : "";
}

// hub_copy / hub_share / post_copy / post_share are labelled "<network>:<post id>"; the rest carry the post id.
function readLabel(name, label) {
  const text = String(label || "");
  if (!NETWORKED.has(name)) return { id: text, network: "" };
  const at = text.indexOf(":");
  return at < 0 ? { id: "", network: text } : { id: text.slice(at + 1), network: text.slice(0, at) };
}

async function token(fetchImpl) {
  const res = await fetchImpl(TOKEN_URL, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("No analytics token (" + res.status + ")");
  return (await res.json()).access_token;
}

async function report(fetchImpl, bearer, body) {
  const res = await fetchImpl(DATA_API, {
    method: "POST",
    headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("GA4 " + res.status + ": " + String((data.error && data.error.message) || "no answer").slice(0, 200));
  return (data.rows || []).map((row) => ({
    dims: (row.dimensionValues || []).map((value) => value.value),
    mets: (row.metricValues || []).map((value) => Number(value.value) || 0)
  }));
}

function regex(field, value) {
  return { filter: { fieldName: field, stringFilter: { matchType: "PARTIAL_REGEXP", value } } };
}

// Three GA4 reports over the hub and post pages, 28 days (and 7 for page views).
async function readGa(fetchImpl) {
  const bearer = await token(fetchImpl);
  const range28 = { startDate: "28daysAgo", endDate: "today" };
  const range7 = { startDate: "7daysAgo", endDate: "today" };
  const [pages, sources, events] = await Promise.all([
    report(fetchImpl, bearer, { dateRanges: [range28, range7], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], dimensionFilter: regex("pagePath", HUB_PATHS), limit: 2000 }),
    report(fetchImpl, bearer, { dateRanges: [range28], dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }], metrics: [{ name: "sessions" }], dimensionFilter: regex("landingPage", HUB_PATHS), orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 25 }),
    report(fetchImpl, bearer, { dateRanges: [range28], dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: regex("eventName", "^(hub|post)_"), limit: 50 })
  ]);
  return { pages, sources, events };
}

function blank(id) {
  const row = { id };
  COUNTS.forEach((key) => { row[key] = 0; });
  row.score = 0;
  return row;
}

function day(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/* Folds site_events rows and GA4 rows into the owner doc and the public ranking. With two date ranges GA4
   appends a dateRange dimension ("date_range_0" = 28 days, "date_range_1" = 7 days). */
function summarize({ ga, events, now }) {
  const posts = new Map();
  const post = (id) => posts.get(id) || posts.set(id, blank(id)).get(id);
  const hub = new Map();
  const hubPage = (lang) => hub.get(lang) || hub.set(lang, { lang, views: 0, views7: 0, gaViews: 0, gaViews7: 0 }).get(lang);
  const networks = { copy: {}, share: {} };
  const daily = new Map();
  const weekAgo = now - 7 * DAY;
  let interactions = 0;

  events.forEach(({ name, label, at }) => {
    const week = at >= weekAgo;
    if (name === "hub_view" || name === "post_view") daily.set(day(at), (daily.get(day(at)) || 0) + 1);
    if (name === "hub_view") {
      const page = hubPage(String(label || "en").slice(0, 2));
      page.views += 1;
      if (week) page.views7 += 1;
      return;
    }
    const meaning = EVENTS[name];
    if (!meaning) return;
    const { id, network } = readLabel(name, label);
    if (name !== "post_view") interactions += 1;
    if (network) {
      const bucket = networks[name.endsWith("_copy") ? "copy" : "share"];
      bucket[network] = (bucket[network] || 0) + 1;
    }
    if (!id) return;
    const row = post(id);
    row[meaning[0]] += 1;
    if (name === "post_view" && week) row.views7 += 1;
    if (week && name !== "post_view") row.score += meaning[1];
  });

  (ga ? ga.pages : []).forEach(({ dims: [path, range], mets: [views, users] }) => {
    const week = range === "date_range_1";
    const id = postIdFromPath(path);
    if (id) {
      const row = post(id);
      if (week) row.gaViews7 += views;
      else { row.gaViews += views; row.gaUsers += users; }
      return;
    }
    const lang = (/qa-review-social-([a-z]{2})\.html/.exec(path) || [])[1] || "en";
    const page = hubPage(lang);
    if (week) page.gaViews7 += views;
    else page.gaViews += views;
  });

  // A visitor who allowed analytics is counted by both; the larger count stands for the week.
  posts.forEach((row) => { row.score += Math.max(row.views7, row.gaViews7); });

  const ranked = [...posts.values()].sort((a, b) => b.score - a.score || b.views - a.views || a.id.localeCompare(b.id));
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
  const hubPages = [...hub.values()].sort((a, b) => b.views - a.views || b.gaViews - a.gaViews);
  return {
    stats: {
      property: PROPERTY,
      ga: { ok: Boolean(ga) },
      totals: {
        hubViews: sum(hubPages, "views"),
        postViews: sum(ranked, "views"),
        postViews7: sum(ranked, "views7"),
        gaViews: sum(hubPages, "gaViews") + sum(ranked, "gaViews"),
        interactions
      },
      hubPages,
      posts: ranked.slice(0, POSTS_KEPT),
      networks,
      sources: ga ? ga.sources.map(({ dims: [source, medium, campaign], mets: [sessions] }) => ({ source, medium, campaign, sessions })) : [],
      events: ga ? ga.events.map(({ dims: [name], mets: [count] }) => ({ name, count })).sort((a, b) => b.count - a.count) : [],
      daily: [...daily.entries()].map(([date, views]) => ({ date, views })).sort((a, b) => a.date.localeCompare(b.date))
    },
    trends: { ids: ranked.filter((row) => row.score > 0).slice(0, TRENDING).map((row) => row.id) }
  };
}

// site_events from the last 28 days that are about the hub. Filtered here so no composite index is needed.
async function readEvents(db, now) {
  const since = new Date(now - 28 * DAY);
  const snap = await db.collection("site_events").where("createdAt", ">=", since).select("name", "label", "createdAt").get();
  return snap.docs.map((doc) => doc.data()).filter((row) => EVENTS[row.name] || row.name === "hub_view").map((row) => ({
    name: row.name,
    label: row.label,
    at: row.createdAt && row.createdAt.toMillis ? row.createdAt.toMillis() : now
  }));
}

async function refresh(db, { fetchImpl = fetch, now = Date.now() } = {}) {
  let ga = null;
  let gaError = "";
  try {
    ga = await readGa(fetchImpl);
  } catch (error) {
    gaError = String((error && error.message) || error).slice(0, 300);
    console.error("Social hub stats: GA4 not read:", gaError);
  }
  const events = await readEvents(db, now);
  const { stats, trends } = summarize({ ga, events, now });
  if (gaError) stats.ga.error = gaError;
  const updatedAt = new Date(now).toISOString();
  await db.collection("socialHubStats").doc("latest").set(Object.assign({ updatedAt }, stats));
  await db.collection("socialHub").doc("trends").set({ json: JSON.stringify(Object.assign({ updatedAt }, trends)), updatedAt });
  return stats.posts.length + " posts, " + trends.ids.length + " trending" + (gaError ? ", GA4 failed" : "");
}

module.exports = { refresh, summarize, postIdFromPath, readLabel, EVENTS };
