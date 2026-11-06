/* What a scheduled Page post uses of the Facebook composer (#2701, #2703). scripts/facebook-queue.js schedules the
   first plan the Page accepts, so a feature the Graph API refuses costs that feature, never the post:

   - a post whose clip speaks the caption's language: a Page Reel of the clip, scheduled with the caption as its
     description (POST /{page}/video_reels start, upload by file_url on rupload.facebook.com, finish SCHEDULED);
   - the weekly digest: a link post to its hub page (POST /{page}/feed with link), so it carries the preview card;
   - everything else, compare quizzes included (Pages have no poll API): the card photo the queue has always posted.

   Not used: polls, music and stickers (no Page API), Stories (no caption for a rerun to recognise). */

// Reels take 3 to 90 seconds of 9:16 video; the batch clips are 1080x1920 and under a minute.
function plans({ caption, image, alt, due, cap = {}, clip, lang, hub }) {
  const when = { published: "false", scheduled_publish_time: String(Math.floor(due / 1000)) };
  const photo = { uses: ["photo"], edge: "photos", params: Object.assign({ url: image, caption, alt_text_custom: alt || "" }, when) };
  const out = [];
  if (cap.kind === "news" && hub) out.push({ uses: ["link"], edge: "feed", params: Object.assign({ message: caption, link: hub }, when) });
  else if (cap.kind !== "quiz" && clip && clip.url && clip.lang === lang) {
    out.push({ uses: ["reel"], edge: "video_reels", file: clip.url, params: { description: caption, video_state: "SCHEDULED", scheduled_publish_time: when.scheduled_publish_time } });
  }
  out.push(photo);
  return out;
}

module.exports = { plans };
