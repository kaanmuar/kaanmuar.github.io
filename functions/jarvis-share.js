// Share to post (#1420): a photo or video shared from the phone or web Jarvis becomes a one-post batch,
// queued on Buffer and the Facebook Page by .github/workflows/social-inbox.yml. Shared with scripts/social-inbox.js.

const INBOX = "social-inbox/";
const KINDS = ["tip", "trick", "news", "advice", "launch", "review", "pick"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const FEED = ["linkedin", "x", "facebook"];
const CLIP = ["tiktok", "youtube"];
const LIMITS = { linkedin: 2800, x: 250, facebook: 5000, instagram: 2000, tiktok: 2000, youtube: 4500 };

function mediaKind(contentType) {
  const type = String(contentType || "").toLowerCase().split(";")[0].trim();
  if (IMAGE_TYPES.includes(type)) return "image";
  if (VIDEO_TYPES.includes(type)) return "video";
  return null;
}

function inboxPath(path) {
  const p = String(path || "");
  return p.startsWith(INBOX) && /^social-inbox\/[\w.-]+$/.test(p) && !p.includes("..") ? p : null;
}

function draftPrompt(caption, video) {
  return [
    "The owner of QA-lab (carlosandmunoz.com, website QA reviews) shared a " + (video ? "short video" : "photo") + " to post on social media, with this caption:",
    "<<<", String(caption || "").slice(0, 3000), ">>>",
    "Write the posts in the caption's own language. Keep the owner's meaning and facts; add nothing he did not say.",
    "Answer with JSON only, no code fence, with these keys:",
    '{"lang":"two-letter language of the caption","kind":"one of ' + KINDS.join("|") + '","title":"headline, at most 80 characters",',
    '"alt":"one sentence describing the media for screen readers, from the caption","linkedin":"professional, 2-4 short paragraphs, 3 hashtags",',
    '"x":"at most 240 characters, 1-2 hashtags","facebook":"friendly, 1-3 short paragraphs","instagram":"2-3 short lines, then 5-8 hashtags",',
    '"tiktok":"one or two punchy lines, 3-5 hashtags","youtube":"two-sentence description, 3 hashtags","youtubeTitle":"at most 90 characters",',
    '"es":' + '{"title","alt","linkedin","x","instagram","facebook"} in Spanish when the caption is in English, otherwise null}',
    "Do not put links in the posts; the hub link is added later."
  ].join("\n");
}

function cut(text, max) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  return head.slice(0, Math.max(head.lastIndexOf(" "), max * 0.6)).trimEnd() + "…";
}

// Gemini's answer (or the owner's edits) as a captions.json entry; every field falls back to the caption.
function cleanDraft(raw, caption, video) {
  let d = raw;
  if (typeof raw === "string") {
    const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try { d = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch (error) { d = {}; }
  }
  d = d && typeof d === "object" ? d : {};
  const base = String(caption || "").trim();
  const first = base.split(/\n|(?<=[.!?])\s/)[0] || "QA-lab";
  const out = {
    lang: /^[a-z]{2}$/.test(d.lang) ? d.lang : "en",
    kind: KINDS.includes(d.kind) ? d.kind : "tip",
    title: cut(d.title || first, 80),
    alt: cut(d.alt || first, 200)
  };
  for (const net of ["linkedin", "x", "facebook", "instagram"]) out[net] = cut(d[net] || base, LIMITS[net]);
  if (video) {
    out.tiktok = cut(d.tiktok || base, LIMITS.tiktok);
    out.youtube = cut(d.youtube || base, LIMITS.youtube);
    out.youtubeTitle = cut((d.youtubeTitle || out.title).replace(/\s*#shorts\b/ig, ""), 90) + " #Shorts";
  }
  if (out.lang !== "en") out.textLang = out.lang;
  const es = d.es && typeof d.es === "object" && out.lang === "en" ? d.es : null;
  if (es && es.title) {
    out.i18n = { es: { title: cut(es.title, 80), alt: cut(es.alt || es.title, 200) } };
    for (const net of ["linkedin", "x", "instagram", "facebook"]) if (es[net]) out.i18n.es[net] = cut(es[net], LIMITS[net]);
  }
  return out;
}

// Bogotá wall clock (UTC-5, no daylight saving), as the calendar and the hub read it.
function bogota(ms) {
  const d = new Date(ms - 5 * 3600000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

// One row per channel, all at the same slot: soon after the hub page is live.
function calendar(slug, video, now, leadMinutes) {
  const at = bogota(now + (leadMinutes || 30) * 60000);
  const rows = FEED.map((ch) => [at.date, at.time, ch, slug, "feed/" + slug + ".jpg"]);
  if (video) CLIP.forEach((ch) => rows.push([at.date, at.time, ch, slug, "clip/" + slug + ".mp4"]));
  return "Date,Time,Channel,Post,Asset\n" + rows.map((r) => r.join(",")).join("\n") + "\n";
}

function batchName(id, now) {
  return "inbox-" + bogota(now).date + "-" + String(id).replace(/[^\w]/g, "").slice(0, 8).toLowerCase();
}

module.exports = { INBOX, KINDS, LIMITS, mediaKind, inboxPath, draftPrompt, cleanDraft, bogota, calendar, batchName };
