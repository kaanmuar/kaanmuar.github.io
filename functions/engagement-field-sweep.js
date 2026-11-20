"use strict";
/** Recent field-sweep proposals as read-only scout posts (#3613); missing file never fails the run. */
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const DAY = 24 * 3600000;

function toPost(item, now) {
  if (!item || !item.url || !/^https:\/\//.test(String(item.url))) return null;
  const topic = clip(item.topic, 40);
  // Tender notices stay discovery-only. Cyber items (CVE, advisories) reach the scouts like any other, and engagement.guard() still keeps AI replies off every field-sweep post (#3940).
  const tender = /procurement|tender/i.test(topic);
  const at = item.date ? (String(item.date).length === 10 ? item.date + "T12:00:00Z" : item.date) : new Date(now).toISOString();
  return {
    network: "fieldsweep",
    id: clip(item.id || item.url, 300),
    url: clip(item.url, 500),
    author: { handle: clip(item.source || "field-sweep", 80), name: clip(item.source || "Field sweep", 80), id: "", followers: 0 },
    title: clip(item.title, 300),
    text: clip(item.summary || item.title || "", 1200),
    lang: clip(item.lang, 8) || "en",
    createdAt: at,
    isReply: false,
    metrics: { likes: num(item.signal), replies: 0, reposts: 0, views: 0 },
    tags: topic ? [topic.toLowerCase()] : [],
    via: "field-sweep",
    credit: clip(item.credit, 120),
    topic,
    discoveryOnly: tender || item.discoveryOnly === true
  };
}

/** Pull today's proposals.json from the live site; returns posts and counts for the meta envelope. */
async function recentPosts(fetchImpl, site, now) {
  const base = String(site || "https://carlosandmunoz.com/").replace(/\/+$/, "");
  const empty = { posts: [], count: 0, tender: 0, at: "" };
  if (!fetchImpl) return empty;
  try {
    const res = await fetchImpl(base + "/assets/social/proposals.json?t=" + encodeURIComponent(now || Date.now()), { signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!res.ok) return empty;
    const data = await res.json();
    const list = (data.proposals || data.items || []).filter(Boolean);
    const fresh = list.filter((p) => {
      const d = Date.parse(p.date ? p.date + (String(p.date).length === 10 ? "T12:00:00Z" : "") : "");
      return !Number.isFinite(d) || now - d < 3 * DAY;
    });
    const posts = fresh.map((p) => toPost(p, now)).filter(Boolean);
    return {
      posts,
      count: posts.length,
      tender: posts.filter((p) => p.discoveryOnly).length,
      at: clip(data.generatedAt || data.at, 30)
    };
  } catch (error) {
    return Object.assign(empty, { error: String(error.message || error).slice(0, 120) });
  }
}

module.exports = { toPost, recentPosts };