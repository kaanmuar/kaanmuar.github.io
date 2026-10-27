/* The owner's edits to the social hub, shared by the Social hub pane in admin.html (js/social-hub-editor.js)
   and scripts/build-social-hub.js. The pane saves them to Firestore socialHub/live as one JSON string; the
   build pulls that into assets/social/edits.json and applies it, so the daily Live Reports run publishes them.

   { version: 1,
     edits: { "<post id>": { captions: { linkedin: "...", ... }, date: "YYYY-MM-DD", hidden: true } },
     items: [{ id: "pick/<slug>", date, lang, title, text, url, image, youtube, cat }],   added by hand
     decisions: { "<proposal id>": "approved" | "dismissed" } }   field sweep proposals (scripts/field-sweep.js) already handled */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SocialHubAdmin = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const NETS = ["linkedin", "x", "instagram", "facebook", "tiktok", "youtube"];
  const LANGS = ["en", "es", "pt", "de", "fr", "it"];
  // Calendar channels in the order a post goes out. Facebook goes through the Graph API, Bluesky and Mastodon
  // straight to their APIs, the rest through Buffer.
  const CHANNELS = [["linkedin", "LinkedIn"], ["x", "X"], ["bluesky", "Bluesky"], ["mastodon", "Mastodon"], ["instagram", "Instagram"], ["instagram-story", "Story"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["tiktok", "TikTok"]];
  // Bluesky and Mastodon have no calendar slot of their own: scripts/open-social-queue.js posts the X caption at
  // the x slot, and leaves a slot it missed by more than 12 hours.
  const DIRECT = { bluesky: "Bluesky", mastodon: "Mastodon" };
  const DIRECT_MISSED_MS = 12 * 3600000;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const HTTPS = /^https:\/\/[^\s<>"'`]+$/;
  const REPO_IMAGE = /^(assets|media)\/[\w/.-]+\.(jpe?g|png|webp)$/i;
  const CAPTION_MAX = 5000;
  const TEXT_MAX = 3000;
  const TITLE_MAX = 200;
  const PROPOSAL_ID = /^[a-f0-9]{12}$/;
  const DECISIONS = ["approved", "dismissed"];
  const PROPOSAL_IMAGE = "assets/share/qa-review-social.jpg";

  function empty() {
    return { version: 1, edits: {}, items: [] };
  }

  function text(value, max) {
    return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
  }

  function remote(src) {
    return /^https:\/\//.test(src || "");
  }

  function imageOk(src) {
    return typeof src === "string" && (HTTPS.test(src) || (REPO_IMAGE.test(src) && !src.includes("..")));
  }

  function videoId(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})(?![\w-])/) || raw.match(/^([\w-]{11})$/);
    return match ? match[1] : "";
  }

  function slug(title) {
    return String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
  }

  function newId(title, items) {
    const base = "pick/" + slug(title);
    const taken = new Set((items || []).map((item) => item.id));
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = base + "-" + n;
    return id;
  }

  function cleanItem(item) {
    if (!item || typeof item !== "object") return null;
    const title = text(item.title, TITLE_MAX);
    if (!title || !/^pick\/[a-z0-9-]{1,80}$/.test(item.id || "") || !DAY.test(item.date || "") || !imageOk(item.image)) return null;
    return {
      id: item.id,
      date: item.date,
      lang: LANGS.includes(item.lang) ? item.lang : "en",
      title,
      text: text(item.text, TEXT_MAX),
      url: HTTPS.test(item.url || "") ? item.url : "",
      image: item.image,
      youtube: videoId(item.youtube),
      cat: text(item.cat, 40)
    };
  }

  // Anything that is not a known field in the right shape is dropped, whoever wrote the document.
  function clean(raw) {
    const out = empty();
    const src = raw && typeof raw === "object" ? raw : {};
    const edits = src.edits && typeof src.edits === "object" ? src.edits : {};
    Object.keys(edits).sort().forEach((id) => {
      const edit = edits[id];
      if (id.length > 200 || !edit || typeof edit !== "object") return;
      const entry = {};
      const captions = {};
      NETS.forEach((net) => {
        const value = text(edit.captions && edit.captions[net], CAPTION_MAX);
        if (value) captions[net] = value;
      });
      if (Object.keys(captions).length) entry.captions = captions;
      if (DAY.test(edit.date || "")) entry.date = edit.date;
      if (edit.hidden === true) entry.hidden = true;
      if (Object.keys(entry).length) out.edits[id] = entry;
    });
    (Array.isArray(src.items) ? src.items : []).forEach((item) => {
      const kept = cleanItem(item);
      if (kept && !out.items.some((other) => other.id === kept.id)) out.items.push(kept);
    });
    const decisions = src.decisions && typeof src.decisions === "object" ? src.decisions : {};
    Object.keys(decisions).sort().forEach((id) => {
      if (PROPOSAL_ID.test(id) && DECISIONS.includes(decisions[id])) (out.decisions || (out.decisions = {}))[id] = decisions[id];
    });
    return out;
  }

  function same(a, b) {
    return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  }

  function itemCaption(item) {
    return [item.title, item.text, item.url].filter(Boolean).join("\n\n");
  }

  function itemPost(item) {
    const caption = itemCaption(item);
    return {
      id: item.id, kind: "pick", batch: "pick", date: item.date, lang: item.lang, clipLang: item.youtube ? item.lang : null,
      cat: item.cat, title: item.title, text: [item.text, item.url].filter(Boolean).join("\n\n"), image: item.image, alt: item.title,
      report: null, ytTitle: "", youtube: item.youtube || null, captions: { linkedin: caption, facebook: caption }
    };
  }

  // has(path) tells whether a repo image is committed; an item whose image is not stays off the hub.
  function apply(posts, state, has) {
    const edits = state.edits || {};
    const picks = (state.items || []).filter((item) => remote(item.image) || has(item.image)).map(itemPost);
    return posts.concat(picks).filter((post) => !(edits[post.id] && edits[post.id].hidden)).map((post) => {
      const edit = edits[post.id];
      if (!edit) return post;
      const captions = Object.assign({}, post.captions, edit.captions);
      const body = edit.captions && (edit.captions.linkedin || edit.captions.facebook);
      return Object.assign({}, post, { captions, date: edit.date || post.date, text: body || post.text });
    });
  }

  function batchOf(id) {
    return String(id || "").split("/")[0];
  }

  // calendar.csv times are Bogotá wall-clock (UTC-5, no daylight saving). A launch set post is <lang>/<topic>.
  function parseCalendar(csv, batch) {
    const [head, ...rows] = String(csv || "").trim().split("\n").map((line) => line.split(",").map((cell) => cell.trim()));
    const slots = {};
    if (!head) return slots;
    rows.forEach((cells) => {
      const row = Object.fromEntries(head.map((key, i) => [key, cells[i] || ""]));
      const channel = row.Channel;
      if (!channel || !row.Post || !DAY.test(row.Date)) return;
      const id = batch + "/" + row.Post;
      const at = row.Date + "T" + (/^\d{2}:\d{2}$/.test(row.Time) ? row.Time : "00:00") + ":00-05:00";
      const post = slots[id] || (slots[id] = {});
      if (!post[channel] || at < post[channel]) post[channel] = at;
    });
    return slots;
  }

  // A post's entries in the Buffer, Facebook Page and Bluesky/Mastodon ledgers (assets/social/buffer.json,
  // facebook.json and open-social.json, written by scripts/social-ledger.js).
  function ledgerEntries(ledgers, id) {
    return (ledgers || []).flatMap((ledger) => (ledger && ledger.posts && Array.isArray(ledger.posts[id]) ? ledger.posts[id] : []));
  }

  // A channel with ledger entries says what Buffer or the Page did: failed if any profile failed, queued while any
  // is, sent once all are. Without one, the calendar slot is only Scheduled. YouTube is confirmed by the uploads
  // ledger (assets/social/youtube.json, matched into feed.json). scripts/facebook-queue.js only schedules 29 days
  // ahead; later Facebook slots wait for a later run.
  function channels(slots, youtube, now, entries) {
    return CHANNELS.map(([net, name]) => {
      let slot = (slots && slots[net]) || "";
      if (DIRECT[net]) {
        const x = (slots && slots.x) || "";
        slot = x && new Date(x).getTime() > now - DIRECT_MISSED_MS ? x : "";
      }
      const via = net === "facebook" ? "Facebook Page" : DIRECT[net] ? DIRECT[net] + " API" : "Buffer";
      const time = slot ? new Date(slot).getTime() : 0;
      const mine = (entries || []).filter((entry) => entry.channel === net);
      const failed = mine.filter((entry) => entry.result === "failed");
      const at = mine.map((entry) => entry.at || "").filter(Boolean).sort()[0] || slot;
      const error = failed.map((entry) => entry.error).filter(Boolean).join("; ");
      let state = "none";
      if (net === "youtube" && youtube) state = "live";
      else if (failed.length) state = "failed";
      else if (mine.some((entry) => entry.result === "queued")) state = "queued";
      else if (mine.length) state = "sent";
      else if (slot && time <= now && net === "youtube") state = "missing";
      else if (slot) state = net === "facebook" && time - now > 29 * 86400000 ? "planned" : "scheduled";
      return Object.assign({ net, name, via, state, at }, error ? { error } : {});
    });
  }

  function when(at, withTime) {
    const options = { month: "short", day: "numeric", timeZone: "America/Bogota" };
    if (withTime) Object.assign(options, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return new Intl.DateTimeFormat("en", options).format(new Date(at));
  }

  function statusLabel(channel) {
    const on = (word, withTime) => word + (channel.at ? " " + when(channel.at, withTime) : "");
    if (channel.state === "live") return "On YouTube";
    if (channel.state === "sent") return on("Sent", false);
    if (channel.state === "failed") return on("Failed", false);
    if (channel.state === "queued") return on("Queued", true);
    if (channel.state === "scheduled") return on("Scheduled", true);
    if (channel.state === "planned") return on("Planned", true);
    if (channel.state === "missing") return "Not on YouTube";
    return "Not planned";
  }

  // One address per article, however a feed or a share link spells it.
  function canonUrl(value) {
    let url;
    try {
      url = new URL(String(value || "").trim());
    } catch (error) {
      return "";
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.protocol = "https:";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    [...url.searchParams.keys()].filter((key) => /^(utm_\w+|ref|ref_src|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)).forEach((key) => url.searchParams.delete(key));
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  }

  // Proposals still waiting: not approved or dismissed, and not already a hub item under the same address.
  function pendingProposals(proposals, state) {
    const decided = (state && state.decisions) || {};
    const shared = new Set(((state && state.items) || []).map((item) => canonUrl(item.url)).filter(Boolean));
    return (Array.isArray(proposals) ? proposals : []).filter((proposal) => proposal && PROPOSAL_ID.test(proposal.id || "") && !decided[proposal.id] && !shared.has(canonUrl(proposal.url)));
  }

  // The hand-added item a proposal starts as. The credit line keeps the source, author and date with it.
  function proposalDraft(proposal, today) {
    const credit = "Via " + [proposal.source, proposal.author && "by " + proposal.author, proposal.date].filter(Boolean).join(", ") + ".";
    return {
      title: text(proposal.title, TITLE_MAX),
      url: HTTPS.test(proposal.url || "") ? proposal.url : "",
      image: imageOk(proposal.image) ? proposal.image : PROPOSAL_IMAGE,
      lang: LANGS.includes(proposal.lang) ? proposal.lang : "en",
      date: today,
      cat: text(proposal.topic, 40),
      text: text([text(proposal.summary, TEXT_MAX), credit].filter(Boolean).join("\n\n"), TEXT_MAX)
    };
  }

  return { NETS, LANGS, CHANNELS, PROPOSAL_ID, canonUrl, pendingProposals, proposalDraft, empty, clean, cleanItem, same, apply, itemPost, remote, imageOk, videoId, slug, newId, batchOf, parseCalendar, ledgerEntries, channels, statusLabel };
});
