/* Voiced clip metadata for hub feed cards and the queues that post them (#3589). A batch's clips live on its GitHub
   release as <slug>.mp4; the hub names them from clipLang in captions.json or a tracked clip/ file. */

const REPO = process.env.GITHUB_REPOSITORY || "kaanmuar/kaanmuar.github.io";

function releaseUrl(batch, slug) {
  return "https://github.com/" + REPO + "/releases/download/" + batch + "/" + slug + ".mp4";
}

// A feed post's clip when the batch rendered one (clipLang) or the mp4 is committed under clip/.
function ofPost({ batch, slug, clipLang }, files) {
  if (!batch || !slug) return null;
  const tracked = files && files.has("media/social-posts/" + batch + "/clip/" + slug + ".mp4");
  const lang = clipLang || null;
  if (!tracked && !lang) return null;
  return { url: releaseUrl(batch, slug), lang: lang || "en" };
}

// What open-social and the Facebook Page pass to their composers: the clip when captions.json or voiced.json names its language.
function fromBatch(batch, slug, cap, voicedMap) {
  const lang = (voicedMap && voicedMap[slug] && voicedMap[slug].lang) || (cap && (cap.clipLang || cap.lang)) || null;
  if (!lang) return null;
  return { url: releaseUrl(batch, slug), lang };
}

// Video embed plans match the clip's voice, not the English caption on a Live Report (#3589).
function mediaLang(clip, captionLang) {
  return clip && clip.url && clip.lang ? clip.lang : captionLang;
}

module.exports = { REPO, releaseUrl, ofPost, fromBatch, mediaLang };