/* Which brand face posts a social post (#2310): en/de/fr/it go to @qalaburlreview, es/pt to @qaurlreview
   (scripts/brand-kit/faces.js). A post's language is its captions.json lang, a clip's voice in voiced.json for
   TikTok and YouTube (a runs or tips clip speaks the rotation's language under an English caption), or the
   launch set's <lang>/<topic>; a post with none is English.

   A face posts on a network only once its account there is connected; until then the default face posts its
   languages too, as before the split, so connecting an account moves its languages over (Carlos, 2026-11-02).
   Each face's secrets carry its env suffix: BLUESKY_HANDLE for @qalaburlreview, BLUESKY_HANDLE_ES for @qaurlreview. */

const fs = require("fs");
const path = require("path");
const { FACES, NETWORKS } = require("./brand-kit/faces");

const ROOT = path.resolve(__dirname, "..");
const IDS = Object.keys(FACES);
const DEFAULT = "en";
const CLIPS = new Set(["tiktok", "youtube"]);

const faceOf = (lang) => IDS.find((id) => FACES[id].langs.includes(lang)) || DEFAULT;

const voicedCache = new Map();
function voiced(batch, root = ROOT) {
  const key = root + "|" + batch;
  if (!voicedCache.has(key)) {
    const file = path.join(root, "media/social-posts", batch, "voiced.json");
    const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    voicedCache.set(key, Array.isArray(raw) ? Object.fromEntries(raw) : raw);
  }
  return voicedCache.get(key);
}

// slot is the calendar channel: x, linkedin, facebook, tiktok, youtube, instagram, instagram-story.
function postLang(batch, slug, cap, slot, root = ROOT) {
  const [own, topic] = String(slug).split("/");
  if (topic && /^[a-z]{2}$/.test(own)) return own;
  if (CLIPS.has(slot)) {
    const clip = voiced(batch, root)[slug];
    if (clip && clip.lang) return clip.lang;
  }
  return (cap && cap.lang) || "en";
}

// The face that posts in this language on a network where the faces in connected have an account.
function route(lang, connected) {
  const face = faceOf(lang);
  return connected.has(face) ? face : DEFAULT;
}

const postFace = (batch, slug, cap, slot, connected, root = ROOT) => route(postLang(batch, slug, cap, slot, root), connected);

// The account secrets a face holds under its suffix; anything else in the environment is shared.
const SECRETS = ["BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD", "BLUESKY_SERVICE", "MASTODON_URL", "MASTODON_TOKEN",
  "THREADS_TOKEN", "INSTAGRAM_USER_ID", "FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_TOKEN"];

// A face's view of the environment: its own secrets under their plain names, never another face's.
function faceEnv(face, env = process.env) {
  const sfx = FACES[face].env;
  const out = Object.assign({}, env);
  SECRETS.forEach((name) => {
    IDS.forEach((id) => { if (FACES[id].env) delete out[name + FACES[id].env]; });
    if (env[name + sfx]) out[name] = env[name + sfx];
    else delete out[name];
  });
  return out;
}

/* The face a Buffer channel belongs to, by its name: the face's handle, its display name or its LinkedIn page
   slug. A channel that names no face is skipped, so a new account never takes the wrong face's posts. */
const LINKEDIN = NETWORKS.find((n) => n.id === "linkedin");
function channelFace(channel) {
  const name = String(channel.name || "").trim().toLowerCase();
  return IDS.find((id) => {
    const f = FACES[id];
    const slug = LINKEDIN.profile(f.handle).split("/").pop();
    return [f.handle, f.name.toLowerCase(), slug].includes(name);
  }) || null;
}

// The Facebook ledger profile of a face's Page.
const pageProfile = (face) => "Facebook Page" + (face === DEFAULT ? "" : " (" + FACES[face].handle + ")");

module.exports = { DEFAULT, SECRETS, pageProfile, faceOf, postLang, route, postFace, faceEnv, channelFace, voiced };
