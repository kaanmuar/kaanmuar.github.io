/* Jarvis > Business media (#2018): plays, reach, likes, shares and comments of every clip we posted, per network and
   per clip, in one place.

   Reads the posting ledgers (assets/social/buffer.json, facebook.json, open-social.json), the numbers
   scripts/social-metrics.js writes each day (assets/social/metrics.json: Buffer for LinkedIn, TikTok, X and YouTube,
   the Graph API for Facebook, the public APIs for Bluesky and Mastodon) and the YouTube Data API's views per video.
   Networks we cannot read numbers from say so instead of showing zeros. */

const NETWORKS = [
  { key: "youtube", name: "YouTube", api: true },
  { key: "tiktok", name: "TikTok", api: true },
  { key: "instagram", name: "Instagram", api: false },
  { key: "facebook", name: "Facebook", api: true },
  { key: "linkedin", name: "LinkedIn", api: true },
  { key: "x", name: "X", api: true },
  { key: "threads", name: "Threads", api: false },
  { key: "bluesky", name: "Bluesky", api: true },
  { key: "mastodon", name: "Mastodon", api: true }
];
const COUNTS = ["plays", "reach", "likes", "shares", "comments"];

const zero = () => ({ plays: 0, reach: 0, likes: 0, shares: 0, comments: 0 });
const add = (into, n) => { COUNTS.forEach((k) => { into[k] += n[k] || 0; }); return into; };
const youtubeId = (url) => (/youtube\.com\/(?:shorts\/|watch\?v=)([\w-]{6,})/.exec(String(url || "")) || [])[1] || "";
// "auto-2026-10-21/01-u-teaminternational-com" → "teaminternational-com"
const titleOf = (post) => String(post || "").split("/").pop().replace(/^\d+-/, "").replace(/^u-/, "").slice(0, 80);

function fromMetrics(m) {
  const n = m || {};
  return { plays: Number(n.views) || 0, reach: Number(n.impressions) || 0, likes: Number(n.likes) || 0, shares: Number(n.shares) || 0, comments: Number(n.comments) || 0 };
}

// ledgers: [buffer, facebook, open-social]; metrics: metrics.json; videos: [{ id, title, published, views, likes, comments }]
function mediaStats(ledgers, metrics, videos) {
  const numbers = (metrics && metrics.posts) || {};
  const byVideo = {};
  (videos || []).forEach((v) => { if (v && v.id) byVideo[v.id] = v; });
  const seenVideos = new Set();
  const clips = {};
  (ledgers || []).forEach((book) => {
    Object.keys((book && book.posts) || {}).forEach((post) => {
      (book.posts[post] || []).forEach((row) => {
        if (!row || row.result !== "sent" || !row.channel) return;
        const clip = clips[post] || (clips[post] = { key: post, title: titleOf(post), at: row.at || "", networks: {} });
        if (row.at && (!clip.at || row.at < clip.at)) clip.at = row.at;
        const n = fromMetrics((numbers[post] || {})[row.channel]);
        const vid = row.channel === "youtube" ? youtubeId(row.url) : "";
        const v = vid && byVideo[vid];
        if (v) {
          seenVideos.add(vid);
          n.plays = Math.max(n.plays, Number(v.views) || 0);
          n.likes = Math.max(n.likes, Number(v.likes) || 0);
          n.comments = Math.max(n.comments, Number(v.comments) || 0);
          if (v.title) clip.title = String(v.title).slice(0, 80);
        }
        const measured = !!((numbers[post] || {})[row.channel]) || !!v;
        clip.networks[row.channel] = Object.assign({ url: row.url || "", measured }, n);
      });
    });
  });
  // Videos on the channel that no ledger posted (uploaded by hand) still count on YouTube.
  Object.keys(byVideo).filter((id) => !seenVideos.has(id)).forEach((id) => {
    const v = byVideo[id];
    clips["youtube/" + id] = { key: "youtube/" + id, title: String(v.title || id).slice(0, 80), at: v.published || "",
      networks: { youtube: { url: "https://www.youtube.com/watch?v=" + id, measured: v.views != null, plays: Number(v.views) || 0, reach: 0, likes: Number(v.likes) || 0, shares: 0, comments: Number(v.comments) || 0 } } };
  });
  const list = Object.values(clips).map((c) => Object.assign(c, { total: Object.values(c.networks).reduce((t, n) => add(t, n), zero()) }));
  const networks = NETWORKS.map((net) => {
    const rows = list.map((c) => c.networks[net.key]).filter(Boolean);
    const measured = rows.filter((r) => r.measured).length;
    const t = rows.reduce((s, r) => add(s, r), zero());
    const state = !net.api ? (rows.length ? "no stats yet" : "no posts yet, no stats yet") : !rows.length ? "no posts yet" : !measured ? "waiting for the first numbers" : "";
    return Object.assign({ network: net.key, name: net.name, api: net.api, posts: rows.length, measured, state }, t);
  });
  const total = networks.reduce((s, n) => add(s, n), zero());
  return {
    updatedAt: (metrics && metrics.updatedAt) || "",
    networks,
    total: Object.assign({ clips: list.length }, total),
    clips: list.sort((a, b) => b.total.plays - a.total.plays || (b.total.likes + b.total.shares) - (a.total.likes + a.total.shares) || String(b.at).localeCompare(String(a.at))).slice(0, 60)
      .map((c) => ({ key: c.key, title: c.title, at: c.at, total: c.total, networks: Object.keys(c.networks).map((k) => Object.assign({ network: k }, c.networks[k])) }))
  };
}

module.exports = { NETWORKS, mediaStats, youtubeId, titleOf };
