"use strict";
// The Mac's notifications readers (#2452): each network's JSON, trimmed from what the pages loaded on 2026-11-03.
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../../scripts/engagement-browser/inbox-map.js");

test("Threads: a reply row is a post of its own, with our post's id and text, and whether we liked or answered it", () => {
  const row = (code, user, extra) => Object.assign({
    __typename: "XTHNotificationFeedRow", timestamp: 1793732251, notif_name: "text_post_app_reply",
    body: { text: "Thank you, it worked" }, subtitle: { text: "Combine the word-count regex with question stems." },
    ufi_media: { pk: "1", code, user: { pk: "77", username: user }, has_liked: false, taken_at: 1793732245, like_count: 0,
      text_post_app_info: { is_reply: true, reply_to_post_id: "4022368134212768937", has_viewer_replied: false, direct_reply_count: 0, repost_count: 0 } }
  }, extra);
  const page = { require: [[0, 0, 0, { __bbox: { result: { data: { notifications: { edges: [{ node: row("DfSk_Bb", "ana_qa") }, { node: row("Own1", "qaurlreview") }, { node: { __typename: "XTHNotificationFeedRow", ufi_media: null } }] } } } } }]] };
  const got = I.threads([page, page], "qaurlreview");
  assert.equal(got.length, 1, "our own row, a row with no post and the same row twice are left out");
  assert.deepEqual(got[0], {
    network: "threads", id: "DfSk_Bb", url: "https://www.threads.com/@ana_qa/post/DfSk_Bb", author: { handle: "ana_qa", name: "ana_qa", id: "77" },
    text: "Thank you, it worked", createdAt: "2026-11-03T18:57:25.000Z", isReply: true, metrics: { likes: 0, replies: 0, reposts: 0, views: 0 },
    liked: false, answered: false, on: "4022368134212768937", ours: "Combine the word-count regex with question stems."
  });
});

test("Instagram: a story that names a comment gives its link and text; follows and notices are not comments", () => {
  const j = {
    new_stories: [
      { story_type: 101, args: { text: "tiger started following you.", profile_name: "tiger", timestamp: 1793700000 } },
      { story_type: 12, args: { text: "bo.dev commented: Does it check focus order?", profile_name: "bo.dev", profile_id: 9, comment_id: "1799", media: [{ id: "3311_6677", shortcode: "Cx1" }], timestamp: 1793700000.5 } }
    ],
    old_stories: [{ story_type: 12, args: { text: "qaurlreview commented: thanks", profile_name: "qaurlreview", comment_id: "1800", media: [{ id: "3311_6677", shortcode: "Cx1" }] } }]
  };
  const [c, ...rest] = I.instagram(j, "qaurlreview");
  assert.equal(rest.length, 0);
  assert.equal(c.url, "https://www.instagram.com/p/Cx1/c/1799/");
  assert.equal(c.text, "Does it check focus order?");
  assert.equal(c.on, "3311");
  assert.equal(c.createdAt, "2026-11-03T10:00:00.000Z");
  assert.deepEqual(I.instagram(null, "x"), []);
});

test("TikTok: comments on our videos and replies to ours; a mention of us under someone else's video is not ours to answer", () => {
  const notice = (key, aweme, comment, extra) => ({ type: 45, create_time: 1793700000, [key]: Object.assign({ aweme, comment, user_info: { unique_id: comment.user.unique_id, nickname: "Ana", uid: "5" } }, extra) });
  const ours = { aweme_id: "761", author: { unique_id: "qalaburlreview" }, desc: "Three checks before you ship #qa" };
  const theirs = { aweme_id: "767", author: { unique_id: "natj" }, desc: "My desk setup" };
  const j = { notice_lists: [{ group: 500, notice_list: [
    { type: 41, digg: { from_user: [] } },
    notice("comment", ours, { cid: "c1", text: "Which tool for contrast?", user: { unique_id: "ana" }, user_digged: 0 }),
    notice("at", theirs, { cid: "c2", text: "Try it @QA-lab URL Review", user: { unique_id: "car.an.mun" }, user_digged: 0 }),
    notice("comment", theirs, { cid: "c3", text: "Fair point", user: { unique_id: "bo" }, user_digged: 1 }, { reply_comment: { cid: "c0", text: "Contrast first, then focus.", user: { unique_id: "qalaburlreview" } } })
  ] }] };
  const got = I.tiktok(j, "qalaburlreview");
  assert.deepEqual(got.map((c) => c.id), ["c1", "c3"]);
  assert.equal(got[0].url, "https://www.tiktok.com/@qalaburlreview/video/761");
  assert.equal(got[0].ours, "Three checks before you ship #qa", "a comment on our video quotes its caption");
  assert.equal(got[1].ours, "Contrast first, then focus.", "a reply to our comment quotes our comment");
  assert.equal(got[1].liked, true);
});

test("LinkedIn: page notification cards for a comment give the comment, our post's text and the link that acts as the page", () => {
  const card = (kind, obj, extra) => Object.assign({ $type: "com.linkedin.voyager.dash.identity.notifications.Card", entityUrn: "urn:li:fsd_notificationCard:(" + kind + "," + obj + ")", objectUrn: obj, publishedAt: 1793731651328 }, extra);
  const j = { included: [
    card("LIKE", "urn:li:activity:7523410117875273728", { headline: { text: "Ana ha reaccionado a la actualización de tu empresa" } }),
    card("COMMENT", "urn:li:comment:(activity:7523410117875273728,7523455839509348352)", {
      headline: { text: "Ana Pérez ha comentado la actualización de tu empresa" },
      contentPrimaryText: [{ text: "Do website issues affect enquiries?" }], contentSecondaryText: [{ text: "Medellín 85, Bogotá 79." }],
      cardAction: { actionTarget: "/p1-route/web-view?url=https%3A%2F%2Fwww%2Elinkedin%2Ecom%2Ffeed%2Fupdate%2Furn%3Ali%3Aactivity%3A7523410117875273728%3FdashCommentUrn%3Durn%253Ali%253Afsd%5Fcomment%253A%25287523455839509348352%252Curn%253Ali%253Aactivity%253A7523410117875273728%2529%26actorCompanyId%3D146731408" }
    }),
    card("COMMENT_MENTION", "urn:li:comment:(ugcPost:7502893353596907520,7523178383178903552)", { headline: { text: "Bo ha mencionado a tu empresa en un comentario" }, contentPrimaryText: [{ text: "cc QA-lab" }] }),
    card("COMMENT", "urn:li:comment:(activity:1,2)", { headline: { text: "Cy commented on your company's update" }, contentPrimaryText: [{ text: "Nice" }] })
  ] };
  const got = I.linkedin(j, "146731408");
  assert.equal(got.length, 2, "reactions and mentions on other posts are left out");
  assert.equal(got[0].id, "urn:li:comment:(activity:7523410117875273728,7523455839509348352)");
  assert.equal(got[0].url, "https://www.linkedin.com/feed/update/urn:li:activity:7523410117875273728?dashCommentUrn=urn%3Ali%3Afsd_comment%3A%287523455839509348352%2Curn%3Ali%3Aactivity%3A7523410117875273728%29&actorCompanyId=146731408");
  assert.equal(got[0].author.name, "Ana Pérez");
  assert.equal(got[0].text, "Do website issues affect enquiries?");
  assert.equal(got[0].ours, "Medellín 85, Bogotá 79.");
  assert.equal(got[0].on, "urn:li:activity:7523410117875273728");
  assert.equal(got[1].author.name, "Cy");
  assert.match(got[1].url, /^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:1\/\?dashCommentUrn=.+&actorCompanyId=146731408$/, "a card without a link gets one built from the comment's urn");
});

test("Facebook: notifications that point at a comment, newest first, with the commenter and whether Facebook marks them read", () => {
  const n = (type, url, at, seen) => ({ notif_id: String(at), notif_type: type, seen_state: seen || "SEEN_BUT_UNREAD", url, creation_time: { timestamp: at },
    body: { text: "Ana Pérez commented on your photo.", ranges: [{ offset: 0, length: 9, entity: { id: "108", url: "https://www.facebook.com/ana.perez" } }] } });
  const page = { data: { viewer: { notifications_page: { edges: [
    { node: { notif: n("feedback_reaction_generic", "https://www.facebook.com/photo/?fbid=122&set=a.1", 1793125074) } },
    { node: { notif: n("photo_comment", "https://www.facebook.com/photo/?fbid=122&set=a.1&comment_id=1764&notif_id=9&notif_t=photo_comment&ref=notif", 1793125278) } },
    { node: { notif: n("comment_reply", "https://www.facebook.com/qalaburlreview/posts/pfbid0x?comment_id=1764&reply_comment_id=1900", 1793200000, "SEEN_AND_READ") } }
  ] } } } };
  const got = I.facebook(page);
  assert.deepEqual(got.map((c) => [c.id, c.on, c.read]), [["1900", "pfbid0x", true], ["1764", "122", false]]);
  assert.deepEqual(got[1].author, { handle: "ana.perez", name: "Ana Pérez", id: "108" });
  assert.equal(I.fbClean(got[1].url), "https://www.facebook.com/photo/?fbid=122&set=a.1&comment_id=1764");
});
