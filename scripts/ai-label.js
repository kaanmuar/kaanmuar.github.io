/* The AI-generated label on a clip post (#3824). A clip's voice is synthetic (software, not a recording of Carlos) unless
   the operator voiced it himself; the live pipeline marks his as speaker "owner" (scripts/live-studio/stock.js).

   Buffer carries the label as isAiGenerated in each network's metadata: TikTok (the API's is_aigc), YouTube
   (status.containsSyntheticMedia), Instagram (is_ai_generated on the media container) and X. Facebook Pages and LinkedIn
   have no such field in Buffer's API, so their posts carry no label; the legal page names them. A still image is not
   labelled here: only video, which is the synthetic voice. */

// The networks whose Buffer metadata takes isAiGenerated.
const LABELED = new Set(["tiktok", "youtube", "instagram", "twitter"]);

/** A clip is synthetic unless its record says the operator voiced it. No record counts as synthetic. */
function isSynthetic(record) {
  const voice = String((record && (record.voice || record.speaker)) || "").toLowerCase();
  return voice !== "owner" && voice !== "carlos";
}

/** The Buffer metadata fragment that labels one post, or null when it needs no label. */
function aiLabel(service, { video = false, record = null } = {}) {
  if (!video || !LABELED.has(service) || !isSynthetic(record)) return null;
  return { isAiGenerated: true };
}

module.exports = { LABELED, isSynthetic, aiLabel };
