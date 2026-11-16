"use strict";
/*
 * Comments on our posts, and replies to our comments, out of each network's notifications JSON (#2452). Each mapper
 * takes the JSON the page loaded and returns posts in the scout's shape with liked, answered, on (our post's id) and
 * ours (what we wrote, "" when the notification does not carry it). The agent sends them to Jarvis as comments.
 */

const iso = (s) => (Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString() : "");

/** Every object in a JSON tree that test(o) accepts, without looking inside the ones it accepts. */
function collect(j, test, into = []) {
  if (!j || typeof j !== "object") return into;
  if (!Array.isArray(j) && test(j)) { into.push(j); return into; }
  (Array.isArray(j) ? j : Object.values(j)).forEach((v) => collect(v, test, into));
  return into;
}

const once = (list) => list.filter((c, i) => c && list.findIndex((d) => d && d.id === c.id) === i);

/** Threads' activity rows (XTHNotificationFeedRow): the reply is a post of its own, and subtitle is our post's text. */
function threads(j, me) {
  return once(collect(j, (o) => o.__typename === "XTHNotificationFeedRow").map((row) => {
    const m = row.ufi_media || {};
    const info = m.text_post_app_info || {};
    const user = (m.user || {}).username || "";
    if (!m.code || !user || user.toLowerCase() === me || !info.reply_to_post_id) return null;
    return {
      network: "threads", id: m.code, url: "https://www.threads.com/@" + user + "/post/" + m.code, author: { handle: user, name: user, id: String((m.user || {}).pk || "") },
      text: (row.body || {}).text || "", createdAt: iso(m.taken_at || row.timestamp), isReply: true,
      metrics: { likes: m.like_count || 0, replies: info.direct_reply_count || 0, reposts: info.repost_count || 0, views: 0 },
      liked: m.has_liked === true, answered: info.has_viewer_replied === true, on: String(info.reply_to_post_id), ours: (row.subtitle || {}).text || ""
    };
  }));
}

/** Instagram's /api/v1/news/inbox/ stories that name a comment: its id, the post's shortcode, and "name commented: text". */
function instagram(j, me) {
  const stories = [].concat((j || {}).priority_stories || [], (j || {}).new_stories || [], (j || {}).old_stories || []);
  return once(stories.map((s) => {
    const a = s.args || {};
    const id = String(a.comment_id || (a.comment_ids || [])[0] || "");
    const media = (a.media || [])[0] || {};
    const name = a.profile_name || "";
    if (!id || !media.shortcode || !name || name.toLowerCase() === me) return null;
    const said = String(a.text || "");
    const at = said.indexOf(": ");
    return {
      network: "instagram", id, url: "https://www.instagram.com/p/" + media.shortcode + "/c/" + id + "/", author: { handle: name, name, id: String(a.profile_id || "") },
      text: at >= 0 ? said.slice(at + 2) : said, createdAt: iso(Math.floor(a.timestamp || 0)), isReply: true,
      metrics: { likes: 0, replies: 0, reposts: 0, views: 0 }, liked: false, answered: false, on: String(media.id || "").split("_")[0], ours: ""
    };
  }));
}

/**
 * TikTok's /api/notice/multi/ notices that carry a comment ({ comment, aweme, user_info } under the notice's type
 * key). Only comments on our videos and replies to our comments: a mention of us under someone else's video is not ours to answer.
 */
function tiktok(j, me) {
  const notices = [].concat(...(((j || {}).notice_lists) || []).map((l) => l.notice_list || []));
  return once(notices.map((n) => {
    const box = Object.values(n).find((v) => v && typeof v === "object" && v.comment && v.comment.cid);
    if (!box) return null;
    const c = box.comment;
    const aw = box.aweme || {};
    const owner = String((aw.author || {}).unique_id || "");
    const to = (box.reply_comment && box.reply_comment.cid) ? box.reply_comment : null;
    const toUs = !!to && String((to.user || {}).unique_id || "").toLowerCase() === me;
    const who = box.user_info || c.user || {};
    const handle = String(who.unique_id || "");
    if (!handle || handle.toLowerCase() === me || !aw.aweme_id || !(owner.toLowerCase() === me || toUs)) return null;
    return {
      network: "tiktok", id: String(c.cid), url: "https://www.tiktok.com/@" + owner + "/video/" + aw.aweme_id, author: { handle, name: who.nickname || handle, id: String(who.uid || "") },
      text: c.text || "", createdAt: iso(n.create_time), isReply: true, metrics: { likes: 0, replies: 0, reposts: 0, views: 0 },
      liked: c.user_digged === 1, answered: false, on: String(aw.aweme_id), ours: toUs ? to.text || "" : aw.desc || ""
    };
  }));
}

const LI_COMMENT = /^urn:li:comment:\((\w+:\d+),(\d+)\)$/;

/** LinkedIn's page notification cards for a comment on our post or a reply to ours: the comment, our post's text, and its link. */
function linkedin(j, company) {
  return once(collect(j, (o) => /notifications\.Card$/.test(o.$type || "")).map((card) => {
    const kind = (String(card.entityUrn || "").match(/^urn:li:fsd_notificationCard:\(([A-Z_]+),/) || [])[1] || "";
    const m = String(card.objectUrn || "").match(LI_COMMENT);
    if (!m || !/^(COMMENT|[A-Z_]*REPLY[A-Z_]*)$/.test(kind)) return null;
    const target = String((card.cardAction || {}).actionTarget || "");
    let url = "";
    try { url = new URL(target, "https://www.linkedin.com").searchParams.get("url") || ""; } catch (error) { url = ""; }
    if (!/^https:\/\/www\.linkedin\.com\/feed\/update\//.test(url)) {
      url = "https://www.linkedin.com/feed/update/urn:li:" + m[1] + "/?dashCommentUrn=" + encodeURIComponent("urn:li:fsd_comment:(" + m[2] + ",urn:li:" + m[1] + ")") + "&actorCompanyId=" + company;
    }
    const name = String((card.headline || {}).text || "").replace(/\s+(ha comentado|ha respondido|commented|replied)\b.*$/i, "").trim();
    return {
      network: "linkedin", id: card.objectUrn, url, author: { handle: "", name, id: "" },
      text: ((card.contentPrimaryText || [])[0] || {}).text || "", createdAt: card.publishedAt ? new Date(card.publishedAt).toISOString() : "", isReply: true,
      metrics: { likes: 0, replies: 0, reposts: 0, views: 0 }, liked: false, answered: false, on: "urn:li:" + m[1], ours: ((card.contentSecondaryText || [])[0] || {}).text || ""
    };
  }).filter((c) => c && c.text));
}

/**
 * Facebook's notifications that point at a comment (the url carries comment_id), newest first. They name the
 * commenter but not what was said, so the agent opens each one's url to read it. read: Facebook already marks it read.
 */
function facebook(j) {
  return once(collect(j, (o) => o.notif_type && o.url && o.notif_id).map((n) => {
    let u;
    try { u = new URL(n.url); } catch (error) { return null; }
    const id = u.searchParams.get("reply_comment_id") || u.searchParams.get("comment_id") || "";
    if (!id || !/comment|reply|mention/i.test(n.notif_type)) return null;
    const actor = (((n.body || {}).ranges || [])[0] || {}).entity || {};
    const on = u.searchParams.get("story_fbid") || u.searchParams.get("fbid") || (u.pathname.match(/\/(?:posts|videos|reel)\/([\w.-]+)/) || [])[1] || "";
    return { id, url: n.url, on, read: n.seen_state === "SEEN_AND_READ", at: ((n.creation_time || {}).timestamp) || 0, author: { handle: String(actor.url || "").replace(/^https:\/\/www\.facebook\.com\//, "").split(/[/?]/)[0], name: String((n.body || {}).text || "").slice(0, ((((n.body || {}).ranges || [])[0]) || {}).length || 0), id: String(actor.id || "") } };
  }).filter(Boolean)).sort((a, b) => b.at - a.at);
}

/** A Facebook comment url without the notification's tracking, so the stored link opens the comment. */
const fbClean = (url) => { const u = new URL(url); ["notif_id", "notif_t", "ref", "__tn__"].forEach((k) => u.searchParams.delete(k)); return u.toString(); };

module.exports = { collect, threads, instagram, tiktok, linkedin, facebook, fbClean };
