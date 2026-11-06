/* What a scheduled post uses of the Threads composer (#2701). scripts/open-social-queue.js posts the first plan
   Threads accepts, so a feature the API refuses costs that feature, never the post:

   - every post: the caption's first hashtag but the brand's is the post's topic, and the hashtag lines leave the text;
   - a post whose clip speaks the caption's language: a carousel of the card and the clip;
   - a compare quiz: a text post with a poll of the two sites, read from its title (polls are text-only);
   - the answer to a quiz: quotes the quiz, with the scores on its first line behind a spoiler;
   - the weekly digest: a text post with the long caption as a text attachment linked to its hub page.

   Not used: location (threads_location_tagging and a place per run), GIFs (text-only, and a GIPHY pick per post),
   replies under our own posts (threads_manage_replies), music and stickers (no API). */
const BRAND_TAGS = new Set(["qalab"]);
const TAG = /#([\p{L}\p{N}_]+)/gu;
const HASHTAG_LINE = /^\s*(?:#[\p{L}\p{N}_]+\s*)+$/u;

// A caption without a hashtag of its own takes its card category's topic; runs (Requested, Local, ...) are web quality.
const CAT_TOPICS = { perf: "Web Performance", a11y: "Accessibility", seo: "SEO", security: "Web Security", geo: "GEO", analytics: "Analytics" };
const DEFAULT_TOPIC = "Web Quality";

// The topic is the first hashtag but the brand's, its words spaced: #WebPerformance is "Web Performance".
function topicOf(text, cat) {
  for (const [, tag] of String(text || "").matchAll(TAG)) {
    if (BRAND_TAGS.has(tag.toLowerCase())) continue;
    const topic = tag.replace(/_/g, " ").replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2").replace(/[.&]/g, "").trim().slice(0, 50);
    if (topic) return topic;
  }
  if (cat === undefined) return "";
  return CAT_TOPICS[String(cat).toLowerCase()] || DEFAULT_TOPIC;
}

const withoutHashtags = (text) => String(text || "").split("\n").filter((line) => !HASHTAG_LINE.test(line)).join("\n").replace(/\n{3,}/g, "\n\n").trim();

/* A compare quiz's title asks "A or B: ...": the poll's two options, each within Threads' 25 characters. "Metro de
   Medellín o de Bogotá" gives "Metro de Bogotá" as the second. */
const OR = /^(.+?)\s+(?:or|o|ou|oder|oppure)\s+(.+?)\s*:/iu;
function pollOf(title) {
  const m = OR.exec(String(title || ""));
  if (!m) return null;
  const a = m[1].trim();
  let b = m[2].trim();
  if (/^(?:de|do|da|di|du)\s/iu.test(b)) b = a.split(/\s+/)[0] + " " + b;
  if (!a || !b || [...a].length > 25 || [...b].length > 25) return null;
  return { option_a: a, option_b: b };
}

const spoilFirstLine = (text) => {
  const line = String(text).split("\n")[0];
  return line.trim() ? [{ entity_type: "SPOILER", offset: 0, length: line.length }] : null;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* The plans to try, richest first, ending with the plain card the queue has always posted. Each plan is { uses,
   params } for one container, or { uses, items, params } for a carousel whose items are created first. */
function plans({ text, url, alt, lang, topic, cap = {}, quote, clip, long, hub }) {
  const image = { media_type: "IMAGE", image_url: url, alt_text: alt };
  const plain = { uses: ["image"], params: Object.assign({ text }, image) };
  const extra = {};
  const uses = [];
  if (topic) { extra.topic_tag = topic; uses.push("topic"); }
  const out = [];
  const poll = cap.kind === "quiz" ? pollOf(cap.title && cap.i18n && cap.i18n[lang] ? cap.i18n[lang].title : cap.title) : null;
  if (poll) out.push({ uses: ["poll"].concat(uses), params: Object.assign({ media_type: "TEXT", text, poll_attachment: JSON.stringify(poll) }, extra) });
  else if (cap.kind === "news" && long) {
    const attachment = { plaintext: [...long].slice(0, 10000).join("") };
    if (hub) attachment.link_attachment_url = hub;
    out.push({ uses: ["long-form"].concat(uses), params: Object.assign({ media_type: "TEXT", text, text_attachment: JSON.stringify(attachment) }, extra) });
  } else {
    const own = Object.assign({}, extra);
    const ownUses = uses.slice();
    if (quote) {
      own.quote_post_id = quote;
      ownUses.push("quote");
      const spoiler = spoilFirstLine(text);
      if (spoiler) { own.text_entities = JSON.stringify(spoiler); ownUses.push("spoiler"); }
    }
    if (clip && clip.lang === lang) {
      out.push({
        uses: ["carousel", "video"].concat(ownUses),
        items: [Object.assign({ is_carousel_item: "true" }, image), { is_carousel_item: "true", media_type: "VIDEO", video_url: clip.url, alt_text: alt }],
        params: Object.assign({ media_type: "CAROUSEL", text }, own)
      });
    }
    out.push({ uses: ["image"].concat(ownUses), params: Object.assign({ text }, image, own) });
  }
  if (uses.length) out.push({ uses: ["image"].concat(uses), params: Object.assign({ text }, image, extra) });
  out.push(plain);
  return out.filter((plan, i) => !out.slice(0, i).some((p) => same(p.params, plan.params) && same(p.items, plan.items)));
}

module.exports = { BRAND_TAGS, topicOf, withoutHashtags, pollOf, plans };
