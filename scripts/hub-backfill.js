#!/usr/bin/env node
/* Puts on the social hub the posts Buffer sent that no batch has (#1038), from the unmatched-sent artifact a
   buffer-batch seed run keeps (scripts/buffer-queue.js, BUFFER_SEED_EXPORT).

     gh run download <seed run> -n unmatched-sent -D /tmp/unmatched
     node scripts/hub-backfill.js /tmp/unmatched/unmatched-sent.json [--batch sent-2026-10] [--dry-run]
     node scripts/build-social-hub.js --offline

   Posts that share a clip or image are one hub post with a caption per network; a second post on the same network
   with other text gets its own. Each caption is the Buffer text as sent, so the next seed matches it. The hub date is
   the Bogotá day of the first send, the kind is launch (Product), and the language is guessed from the text. The
   feed image is the post's image, its clip's thumbnail or first second, or a plain title card for a text post.
   Each post goes into the Buffer ledger as sent with its link. Writes media/social-posts/<batch>/captions.json and
   feed/<slug>.jpg, adding to what an earlier run wrote. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ledger = require("./social-ledger");

const ROOT = path.resolve(__dirname, "..");
const NETS = { linkedin: "linkedin", x: "x", tiktok: "tiktok", youtube: "youtube", facebook: "facebook", instagram: "instagram" };
const STOP = {
  en: "the and is your you of to before what this with for it not are",
  es: "el la los las una que de para y tu lee es por con del se más",
  pt: "o os um uma que para você não já é do da dos das com em mais seu sua está ao",
  de: "der die das und ist eine nicht sie liest ein mit für auf den dem",
  fr: "le la les une et est vous des pas du ce qui pour sur votre",
  it: "il la che una è per non gli di del con sono questo tua della"
};
const squash = (text) => String(text || "").replace(/\s+/g, " ").trim();
const bogotaDay = (iso) => new Date(Date.parse(iso) - 5 * 3600e3).toISOString().slice(0, 10);
const plain = (url) => String(url || "").split("?")[0];

const LETTERS = { pt: /[ãõç]/g, es: /[ñ¿¡]/g, de: /[ßäöü]/g };

function language(text) {
  const lower = squash(text).toLowerCase().replace(/https?:\S+/g, "");
  const words = lower.split(/[^\p{L}]+/u);
  let best = "en";
  let top = 0;
  for (const [lang, list] of Object.entries(STOP)) {
    const set = new Set(list.split(" "));
    const n = words.filter((w) => set.has(w)).length + (LETTERS[lang] ? (lower.match(LETTERS[lang]) || []).length : 0);
    if (n > top) { best = lang; top = n; }
  }
  return best;
}

function title(text) {
  const clean = squash(String(text).replace(/https?:\S+/g, "").replace(/#\w+/g, ""));
  const first = clean.split(/(?<=[.!?])\s/)[0] || clean;
  return first.length <= 90 ? first : first.slice(0, 87).replace(/\s+\S*$/, "") + "…";
}

const slugWords = (text) => squash(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/https?:\S+/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 5).join("-") || "post";

// items: the exported Buffer posts. existing: captions.json so far. Returns { captions, posts: [{ slug, item }], images }.
function plan(items, existing = {}) {
  const captions = JSON.parse(JSON.stringify(existing));
  const known = new Map();
  Object.entries(captions).forEach(([slug, c]) => Object.keys(NETS).forEach((net) => c[net] && known.set(squash(c[net]), slug)));
  const groups = new Map(Object.entries(captions).filter(([, c]) => c.asset).map(([slug, c]) => [c.asset, [slug]]));
  let n = Object.keys(captions).length;
  const posts = [];
  const images = new Map();
  for (const item of [...items].filter((i) => NETS[i.slot]).sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)))) {
    const net = NETS[item.slot];
    const text = squash(item.text);
    if (known.has(text)) { posts.push({ slug: known.get(text), item }); continue; }
    const asset = (item.assets || []).find((a) => a.source);
    const key = asset ? plain(asset.source) : null;
    let slug = key && (groups.get(key) || []).find((s) => !captions[s][net]);
    if (!slug) {
      n += 1;
      slug = String(n).padStart(2, "0") + "-" + slugWords(item.text);
      captions[slug] = { date: bogotaDay(item.sentAt), kind: "launch", cat: "Social", title: title(item.text), alt: title(item.text), textLang: language(item.text) };
      if (key) { captions[slug].asset = key; groups.set(key, (groups.get(key) || []).concat(slug)); }
      images.set(slug, asset ? { type: asset.type, source: asset.source, thumbnail: asset.thumbnail } : { text: captions[slug].title });
    }
    captions[slug][net] = item.text;
    if (net === "youtube" && item.metadata && item.metadata.title) captions[slug].youtubeTitle = item.metadata.title;
    known.set(text, slug);
    posts.push({ slug, item });
  }
  return { captions, posts, images };
}

async function fetchTo(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + " " + url);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function feedImage(spec, out) {
  const sharp = require("sharp");
  const tmp = path.join(os.tmpdir(), "hub-backfill-" + process.pid);
  const video = spec.type === "video" || /\.(mp4|mov|webm)$/i.test(plain(spec.source));
  if (spec.source && video && spec.thumbnail) await fetchTo(spec.thumbnail, tmp);
  else if (spec.source && video) execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", spec.source, "-frames:v", "1", "-f", "image2", "-c:v", "png", tmp]);
  else if (spec.source) await fetchTo(spec.source, tmp);
  else {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const lines = (spec.text.match(/.{1,28}(\s|$)/g) || [spec.text]).slice(0, 5);
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1080'><rect width='100%' height='100%' fill='#0f172a'/>" +
      lines.map((l, i) => "<text x='90' y='" + (420 + i * 80) + "' font-family='Helvetica, Arial, sans-serif' font-size='64' font-weight='700' fill='#f8fafc'>" + esc(l.trim()) + "</text>").join("") +
      "<text x='90' y='980' font-family='Helvetica, Arial, sans-serif' font-size='36' fill='#94a3b8'>QA-lab URL Review</text></svg>";
    fs.writeFileSync(tmp, svg);
  }
  await sharp(tmp).resize({ width: 1080, height: 1080, fit: "cover" }).jpeg({ quality: 82 }).toFile(out);
  fs.rmSync(tmp, { force: true });
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--batch");
  const batch = argv.includes("--batch") ? argv[argv.indexOf("--batch") + 1] : "sent-2026-10";
  const dry = argv.includes("--dry-run");
  if (!file || !/^[\w-]+$/.test(batch)) throw new Error("usage: hub-backfill.js <unmatched-sent.json> [--batch name] [--dry-run]");
  const dir = path.join(ROOT, "media/social-posts", batch);
  const capFile = path.join(dir, "captions.json");
  const existing = fs.existsSync(capFile) ? JSON.parse(fs.readFileSync(capFile, "utf8")) : {};
  const { captions, posts, images } = plan(JSON.parse(fs.readFileSync(file, "utf8")), existing);
  console.log(posts.length + " sent posts, " + Object.keys(captions).length + " hub posts in " + batch + " (" + images.size + " new):");
  Object.entries(captions).forEach(([slug, c]) => console.log("  " + c.date + " " + c.textLang + " " + slug.padEnd(44) + " " + Object.keys(NETS).filter((k) => c[k]).join(",")));
  if (dry) return;
  fs.mkdirSync(path.join(dir, "feed"), { recursive: true });
  let failed = 0;
  for (const [slug, spec] of images) {
    try { await feedImage(spec, path.join(dir, "feed", slug + ".jpg")); } catch (error) {
      failed += 1;
      console.log("  no image for " + slug + " - " + error.message.split("\n")[0] + "; using a title card");
      await feedImage({ text: captions[slug].title }, path.join(dir, "feed", slug + ".jpg"));
    }
  }
  fs.writeFileSync(capFile, JSON.stringify(captions, null, 2) + "\n");
  const book = ledger.read(ledger.BUFFER);
  posts.forEach(({ slug, item }) => ledger.record(book, batch + "/" + slug, { channel: item.slot, profile: item.profile, id: item.id, at: item.sentAt, result: "sent", url: item.externalLink, checked: new Date().toISOString() }));
  ledger.write(ledger.BUFFER, book);
  console.log("wrote " + capFile + ", " + images.size + " images (" + failed + " as title cards), " + posts.length + " ledger entries");
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { plan, language, title };
