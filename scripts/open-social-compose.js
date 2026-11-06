/* What a scheduled post uses of the Bluesky, Mastodon, Telegram and Instagram composers (#2701). As for Threads
   (scripts/threads-compose.js), scripts/open-social-queue.js posts the first plan the network accepts, so a feature
   the API refuses costs that feature, never the post. A clip goes out only where it speaks the caption's language;
   a poll, a content warning or a quiz's winner only where its title is written in that language.

   - Bluesky (#2704): the clip as a video; the weekly digest as a link card to its hub page (a post embeds one of
     images, a video, a link card or a quote, so the card only goes where no image does); the answer to a quiz
     quotes it with its own card or clip.
   - Mastodon (#2705): the clip as a video with the card as its thumbnail; a compare quiz as text with a 24-hour poll
     (a poll carries no media); the answer behind a content warning that asks the quiz's question.
   - Telegram (#2706): a compare quiz as a poll carrying the card and the caption, in quiz mode when the answer's
     scores name the winner; the clip as a video with the card as its cover; the answer replies to the quiz, its
     scores behind a spoiler.
   - Instagram (#2702): the clip as a reel shared to the feed with the card as its cover, else a carousel of the
     card and the clip. Stories stay a single image.

   Not used: Bluesky threadgates (replies stay open), Instagram collaborators, music and location (a pick per post). */
const { pollOf } = require("./threads-compose");

const POLL_SECONDS = 86400;

// The title of a caption in lang: its translation, or its own title when the caption is written in lang.
function titleIn(cap, lang) {
  if (!cap) return "";
  if (cap.i18n && cap.i18n[lang] && cap.i18n[lang].title) return cap.i18n[lang].title;
  return (cap.textLang || "en") === lang ? cap.title || "" : "";
}

/* The poll option that won, from the answer's first line ("Berlin 86, Vienna 85. One point apart."), or -1 when a
   tie, a missing score or a name that fits both or neither option leaves it in doubt. */
const SCORES = /^(.+?)\s+(\d{1,3})\s*,\s*(.+?)\s+(\d{1,3})(?!\d)/u;
const fold = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
function winnerOf(poll, line) {
  const m = SCORES.exec(String(line || "").split("\n")[0]);
  if (!poll || !m || Number(m[2]) === Number(m[4])) return -1;
  const options = [poll.option_a, poll.option_b].map(fold);
  const pick = (name) => {
    const n = fold(name);
    const hits = options.map((o, i) => (n && (o.includes(n) || n.includes(o)) ? i : -1)).filter((i) => i >= 0);
    return hits.length === 1 ? hits[0] : -1;
  };
  const a = pick(m[1]);
  const b = pick(m[3]);
  if (a < 0 || b < 0 || a === b) return -1;
  return Number(m[2]) > Number(m[4]) ? a : b;
}

const firstLine = (text) => String(text || "").split("\n")[0];
const voiced = (clip, lang) => Boolean(clip && clip.url && clip.lang === lang);
const dedupe = (out) => out.filter((plan, i) => !out.slice(0, i).some((p) => JSON.stringify(p) === JSON.stringify(plan)));

// Each plan names the embed (video, image or card) and whether it quotes the quiz; the client uploads what it names.
function bluesky({ lang, cap = {}, clip, quote, hub }) {
  const media = voiced(clip, lang) ? ["video", "image"] : cap.kind === "news" && hub ? ["card", "image"] : ["image"];
  const out = [];
  if (quote) media.filter((m) => m !== "card").forEach((m) => out.push({ uses: [m, "quote"], media: m, quote: true }));
  media.forEach((m) => out.push({ uses: [m], media: m }));
  return out;
}

// Each plan is the status to post; media names the attachment the client uploads first.
function mastodon({ text, lang, cap = {}, quizCap, clip }) {
  const out = [];
  const poll = cap.kind === "quiz" ? pollOf(titleIn(cap, lang)) : null;
  if (poll) out.push({ uses: ["poll"], status: { status: text, poll: { options: [poll.option_a, poll.option_b], expires_in: POLL_SECONDS } } });
  const media = voiced(clip, lang) ? ["video", "image"] : ["image"];
  const warning = titleIn(quizCap, lang);
  if (warning) media.forEach((m) => out.push({ uses: [m, "content-warning"], media: m, status: { status: text, spoiler_text: warning } }));
  media.forEach((m) => out.push({ uses: [m], media: m, status: { status: text } }));
  return out;
}

// Each plan is a Bot API method and its body without the chat. Entity offsets count UTF-16 units, as JS lengths do.
function telegram({ text, url, lang, cap = {}, answerCap, clip, quote }) {
  const out = [];
  const question = cap.kind === "quiz" ? titleIn(cap, lang) : "";
  const poll = question ? pollOf(question) : null;
  if (poll && [...question].length <= 300) {
    const answer = titleIn(answerCap, lang);
    const won = winnerOf(poll, answer);
    const body = { question, options: [{ text: poll.option_a }, { text: poll.option_b }], description: text, media: { type: "photo", media: url } };
    if (won >= 0) Object.assign(body, { type: "quiz", correct_option_ids: [won], explanation: [...firstLine(answer)].slice(0, 200).join("") });
    out.push({ uses: [won >= 0 ? "quiz" : "poll", "image"], method: "sendPoll", body });
  }
  const own = {};
  const ownUses = [];
  if (quote) {
    own.reply_parameters = { message_id: Number(quote), allow_sending_without_reply: true };
    ownUses.push("reply");
    if (firstLine(text).trim()) { own.caption_entities = [{ type: "spoiler", offset: 0, length: firstLine(text).length }]; ownUses.push("spoiler"); }
  }
  if (voiced(clip, lang)) out.push({ uses: ["video"].concat(ownUses), method: "sendVideo", body: Object.assign({ video: clip.url, caption: text, cover: url, supports_streaming: true }, own) });
  out.push({ uses: ["image"].concat(ownUses), method: "sendPhoto", body: Object.assign({ photo: url, caption: text }, own) });
  out.push({ uses: ["image"], method: "sendPhoto", body: { photo: url, caption: text } });
  return dedupe(out);
}

// As for Threads: { uses, params } for one container, or { uses, items, params } for a carousel. Alt text is for images only.
function instagram({ text, url, alt, lang, clip }) {
  const image = { image_url: url, alt_text: alt };
  const out = [];
  if (voiced(clip, lang)) {
    out.push({ uses: ["reel"], params: { media_type: "REELS", video_url: clip.url, caption: text, share_to_feed: "true", cover_url: url } });
    out.push({
      uses: ["carousel", "video"],
      items: [Object.assign({ is_carousel_item: "true" }, image), { is_carousel_item: "true", media_type: "VIDEO", video_url: clip.url }],
      params: { media_type: "CAROUSEL", caption: text }
    });
  }
  out.push({ uses: ["image"], params: Object.assign({ caption: text }, image) });
  return out;
}

/* A Bluesky video embed needs its aspect ratio: the first track header (tkhd) of the mp4 with a width and a height,
   both 16.16 fixed point after the matrix. Version 1 headers carry 64-bit times. */
function aspectOf(buf) {
  for (let i = buf.indexOf("tkhd"); i >= 4; i = buf.indexOf("tkhd", i + 4)) {
    const at = i + 8 + (buf[i + 4] === 1 ? 32 : 20) + 16 + 36;
    if (at + 8 > buf.length) break;
    const width = buf.readUInt32BE(at) >>> 16;
    const height = buf.readUInt32BE(at + 4) >>> 16;
    if (width && height) return { width, height };
  }
  return null;
}

module.exports = { POLL_SECONDS, titleIn, winnerOf, aspectOf, bluesky, mastodon, telegram, instagram };
