"use strict";
/*
 * Comment chains that turn into friends (#3137, part of #3135): what the chain pass (jarvis-engagement takeChains)
 * does for the person behind each comment, without I/O except through deps, so tests/unit can run it.
 *
 *   tone      Gemini's read of a comment as nice, neutral, hostile or spam (tone), checked against its flags
 *   ladder    how far our answer to a person may go: none (pure value and wit), soft (a light mention that we built
 *             a free URL review, no link), link (one hook to their site or post with the qa-review link). A person
 *             climbs one rung per friendly exchange (soft from TRIALS.soft, link from TRIALS.link); after the link
 *             we go back to plain answers for linkGapDays, and a person who has a pass is never pitched again
 *   ledger    every comment touches the person in outreach_people (functions/outreach-people.js, #3136): stage,
 *             and the thread (by its root post's url) with lastAt, theirLast and ourLast; what the comment was goes in
 *             the history note. The ladder's own counts (friendly exchanges, tones, lastAt, softAt, linkAt) live
 *             beside it in engagement_people/<the same id>, since the ledger keeps only its own fields
 *   offer     a nice comment from someone whose post we commented on mints a 2-day pass (outreach-trials.js
 *             mintTrial, kind social) and drafts a cheerful DM in their language with the pass link (their language's
 *             review page) and a card (functions/dm-card.js) as actions.dm on the chain post
 *   sending   functions/outreach-send.js decides: the DM and the answer wait for Carlos for the first days after
 *             launch, then go out on their own (in a live run) within each network's daily cap
 *
 * Settings (jarvis_settings/engagement trials, see trialSettings): offers, soft, link, linkGapDays, activeDays (how
 * long a thread with an active person keeps being read past the 7 chain days), answerAll (an active person's comment
 * always gets an answer drafted) and dmTtlHours.
 */
const crypto = require("crypto");
const Send = require("./outreach-send");

const HOUR = 3600000;
const DAY = 24 * HOUR;
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const TONES = ["nice", "neutral", "hostile", "spam"];
const RUNGS = ["none", "soft", "link"];
const REVIEW_URL = "https://carlosandmunoz.com/qa-review.html";
// Where the Mac's browser can send a DM; a Threads DM goes through the same person's Instagram inbox.
const DM_NETS = ["x", "linkedin", "facebook", "instagram", "threads", "tiktok", "telegram", "reddit"];
const DM_VIA = { threads: "instagram" };
const STAGE_ORDER = ["found", "engaged", "replied", "nice", "offered", "claimed", "trial_ended", "discount_sent", "paid"];
const PITCHED = ["offered", "claimed", "trial_ended", "discount_sent", "paid"];
const STOPPED = ["declined", "blocked"];
// The DM card's looks (functions/dm-card.js); a person keeps the same one.
const LOOKS = ["confetti", "ticket", "sunrise"];

const TRIALS = {
  offers: true,
  soft: 2,
  link: 4,
  linkGapDays: 30,
  activeDays: 21,
  answerAll: true,
  dmTtlHours: 48
};

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const iso = (ms) => new Date(ms).toISOString();
const lang2 = (v) => String(v || "").toLowerCase().slice(0, 2);
const handleOf = (a) => clip((a || {}).handle, 120).replace(/^@/, "").toLowerCase() || clip((a || {}).id, 200);

/** The stored trials settings with every field present and in range. */
function trialSettings(doc) {
  const d = doc || {};
  const between = (v, lo, hi, fb) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : fb);
  const soft = between(d.soft, 0, 20, TRIALS.soft);
  return {
    offers: d.offers === undefined ? TRIALS.offers : d.offers === true,
    soft,
    link: Math.max(soft + 1, between(d.link, 1, 30, TRIALS.link)),
    linkGapDays: between(d.linkGapDays, 1, 365, TRIALS.linkGapDays),
    activeDays: between(d.activeDays, 7, 90, TRIALS.activeDays),
    answerAll: d.answerAll === undefined ? TRIALS.answerAll : d.answerAll === true,
    dmTtlHours: between(d.dmTtlHours, 6, 168, TRIALS.dmTtlHours)
  };
}

/** A comment's tone from Gemini's read: its flags win over the tone it named, so a friendly-sounding ad is spam. */
function tone(ai) {
  const a = ai || {};
  if (a.promo) return "spam";
  if (a.argument || a.sentiment === "angry") return "hostile";
  const said = TONES.includes(a.tone) ? a.tone : a.sentiment === "positive" ? "nice" : "neutral";
  return said === "nice" && (a.political || a.sentiment === "negative") ? "neutral" : said;
}

/** Whether the comment's author wrote the post we answered (not our own post): the people a pass goes to. */
function theirPost(comment) {
  const c = comment || {};
  const parent = c.parent || {};
  if (parent.own) return false;
  const root = (parent.chain || {}).rootAuthor || handleOf(parent.author);
  return !!root && root === handleOf(c.author);
}

/** Whether a person has talked with us lately: their last comment within the chain days of an active thread. */
const active = (person, conf, now) => !!person && !STOPPED.includes(person.stage) && (person.friendly || 0) >= 1
  && Date.parse(person.lastAt || 0) > now - trialSettings(conf).activeDays * DAY;

/** How far our next answer to this person may go: "none", "soft" or "link". */
function rung(person, conf, now) {
  const t = trialSettings(conf);
  const p = person || {};
  if (STOPPED.includes(p.stage) || PITCHED.includes(p.stage)) return "none";
  if (p.linkAt && Date.parse(p.linkAt) > now - t.linkGapDays * DAY) return "none";
  const n = p.friendly || 0;
  return n >= t.link ? "link" : n >= t.soft ? "soft" : "none";
}

/** What the chain prompt learns about a comment's author: the rung, the site to hook to, and whether they are active. */
function ladderFor(comment, person, conf, now) {
  const p = person || {};
  const site = clip(p.domain || p.site || "", 120).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return Object.assign({ invite: rung(p, conf, now), active: active(p, conf, now) }, site ? { site } : {});
}

/** The rung a drafted answer really used: what Gemini said it used, never above the rung it was allowed. */
function used(allowed, said, reply) {
  const cap = Math.max(0, RUNGS.indexOf(allowed));
  const claim = RUNGS.includes(said) ? RUNGS.indexOf(said) : 0;
  const linked = /carlosandmunoz\.com/i.test(String(reply || "")) ? 2 : 0;
  return RUNGS[Math.min(cap, Math.max(claim, linked))];
}

/** A stage never goes back, except to declined or blocked; spam blocks, hostility declines, a nice comment on their own post is nice. */
function nextStage(cur, t, theirs, own) {
  if (STOPPED.includes(cur)) return cur;
  if (t === "spam") return "blocked";
  if (t === "hostile") return PITCHED.includes(cur) ? cur : "declined";
  const want = t === "nice" && theirs ? "nice" : own ? "engaged" : "replied";
  return STAGE_ORDER.indexOf(cur) >= STAGE_ORDER.indexOf(want) ? cur : want;
}

/** The conversation's url in the ledger: the root post's, or the comment's own under our post. */
function threadUrl(comment) {
  const c = comment || {};
  const parent = c.parent || {};
  const root = (parent.chain || {}).rootUrl || (parent.own ? "" : parent.url);
  return /^https?:\/\//.test(String(root || "")) ? clip(root, 500) : /^https?:\/\//.test(String(c.url || "")) ? clip(c.url, 500) : "";
}

/**
 * What one chain comment (comment with parent, as takeChains reads it) and the chain post stored for it (doc, with
 * tone and actions) change: { ledger, ladder }. ledger is the outreach-people touch patch; ladder is merged into
 * engagement_people. person is the stored person (ledger and ladder fields together) or null.
 */
function personPatch(comment, doc, person, now) {
  const p = person || {};
  const c = comment || {};
  const parent = c.parent || {};
  const at = iso(now);
  const t = doc.tone || "neutral";
  const reply = (doc.actions || {}).reply || {};
  const url = threadUrl(c);
  const ledger = {
    kind: "social", network: c.network, handle: handleOf(c.author), name: clip((c.author || {}).name, 120), lang: LANGS.includes(doc.lang) ? doc.lang : "",
    stage: nextStage(p.stage || "found", t, theirPost(c), !!parent.own),
    threads: url ? [Object.assign({ url, lastAt: at, theirLast: clip(c.text, 500) }, clip(reply.draft, 500) ? { ourLast: clip(reply.draft, 500) } : {})] : [],
    by: "chain", note: "Comment (" + t + ")" + (reply.draft ? ", answer drafted" + (reply.invite && reply.invite !== "none" ? " with a " + reply.invite + " invite" : "") : "") + ": " + clip(c.text, 160)
  };
  const ladder = {
    friendly: (p.friendly || 0) + (t === "nice" || t === "neutral" ? 1 : 0), lastAt: at,
    tones: Object.assign({}, p.tones, { [t]: ((p.tones || {})[t] || 0) + 1 })
  };
  if (reply.invite === "soft") ladder.softAt = at;
  if (reply.invite === "link") ladder.linkAt = at;
  return { ledger, ladder };
}

/** Whether this comment earns a 2-day pass now. */
function offerable(comment, doc, person, conf) {
  const t = trialSettings(conf.trials);
  const p = person || {};
  return t.offers && !conf.paused && doc.tone === "nice" && theirPost(comment) && DM_NETS.includes(comment.network)
    && !PITCHED.includes(p.stage) && !STOPPED.includes(p.stage) && !(p.offers || []).some((o) => o && (o.kind === "trial" || /^TRY-/.test(String(o.code || ""))));
}

/** A chain post we drafted an answer for that expired unanswered: drafted once more while the person is still friendly. */
const owed = (doc, conf) => !!doc && !!doc.chain && !doc.redrafted && trialSettings(conf.trials).answerAll && ["nice", "neutral"].includes(doc.tone)
  && ((doc.actions || {}).reply || {}).status === "expired";

// --- The DM -----------------------------------------------------------------------------------------------------------

const FIRST = (name, handle) => {
  const first = clip(name, 60).split(/\s+/)[0].replace(/[^\p{L}\p{M}'’-]/gu, "");
  return first.length >= 2 ? first : handle ? "@" + handle : "";
};

// Used when Gemini cannot draft the DM: warm, short, the link once.
const hi = (word, sep, f, end) => word + (f.first ? sep + f.first : "") + end;
const DM_COPY = {
  en: (f) => hi("Hi", " ", f, "!") + " Thanks for such a great exchange. As a little thank-you, we unlocked 2 days of URL review for you, free: " + f.url + (f.host ? " Try it on " + f.host + " and see what it finds." : " Run it on any site you like.") + " Enjoy! 🎉",
  es: (f) => hi("¡Hola", ", ", f, "!") + " Gracias por una conversación tan buena. Como agradecimiento, te desbloqueamos 2 días gratis de URL review: " + f.url + (f.host ? " Pruébalo con " + f.host + " y mira lo que encuentra." : " Úsalo con el sitio que quieras.") + " ¡Que lo disfrutes! 🎉",
  pt: (f) => hi("Oi", ", ", f, "!") + " Obrigado pela ótima conversa. Como agradecimento, liberamos 2 dias grátis de URL review para você: " + f.url + (f.host ? " Experimente com " + f.host + " e veja o que ele encontra." : " Use com o site que quiser.") + " Aproveite! 🎉",
  de: (f) => hi("Hallo", " ", f, "!") + " Danke für den tollen Austausch. Als kleines Dankeschön haben wir Ihnen 2 Tage URL Review freigeschaltet, kostenlos: " + f.url + (f.host ? " Probieren Sie es mit " + f.host + " aus." : " Nutzen Sie es für jede Website, die Sie möchten.") + " Viel Freude! 🎉",
  fr: (f) => hi("Bonjour", " ", f, " !") + " Merci pour cet échange formidable. Pour vous remercier, nous vous avons débloqué 2 jours de URL review, gratuitement : " + f.url + (f.host ? " Essayez-le sur " + f.host + " pour voir ce qu'il trouve." : " Utilisez-le sur le site de votre choix.") + " Profitez-en ! 🎉",
  it: (f) => hi("Ciao", " ", f, "!") + " Grazie per il bellissimo scambio. Per ringraziarti, ti abbiamo sbloccato 2 giorni di URL review gratis: " + f.url + (f.host ? " Provalo su " + f.host + " e guarda cosa trova." : " Usalo con il sito che preferisci.") + " Buon divertimento! 🎉"
};

/** What a DM and its card say about one person: language, first name or handle, their site's host, the pass link. */
function dmFacts(comment, person, trial) {
  const p = person || {};
  const c = comment || {};
  const handle = handleOf(c.author) || p.handle || "";
  const want = lang2(c.lang || p.lang);
  const lang = LANGS.includes(want) ? want : "en";
  const host = clip(p.domain || p.site || "", 120).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const id = p.id || (c.network + ":" + handle);
  const look = LOOKS[parseInt(crypto.createHash("sha1").update(id).digest("hex").slice(0, 6), 16) % LOOKS.length];
  return { lang, handle, first: FIRST((c.author || {}).name || p.name, handle) || "", host, url: (trial || {}).url || "", code: (trial || {}).code || "", look };
}

const dmFallback = (f) => DM_COPY[f.lang](f);

/** The Gemini prompt for the cheerful DMs: one per offer, each in the person's language. */
function dmPrompt(items) {
  const list = items.map((x) => ({
    id: x.key, network: x.network, lang: x.facts.lang, name: x.facts.first, site: x.facts.host, link: x.facts.url,
    theySaid: clip(x.text, 400), weSaid: clip(x.ours, 300), post: clip(x.post, 300)
  }));
  return [
    "You write direct messages for Carlos & Munoz (carlosandmunoz.com), a small consultancy for QA, SEO, accessibility, web performance and web security, to people who just had a friendly exchange with us under their own post.",
    "Each person below gets a free 2-day pass to our URL review (it checks a site's SEO, accessibility, performance, security and more). For each, return one JSON object in a JSON array, same order:",
    '{"id": same id, "dm": the message, "english": the message in English when dm is not in English, else ""}',
    "Rules: write in lang (en, es, pt, de, fr or it), happy and cheering but genuine, two to four short sentences. Greet them by name when there is one. Thank them for the conversation and name one specific thing they said (theySaid). Say we unlocked 2 days of URL review for them, free, and put link once, exactly as given. When site is set, invite them to try it on that site. No pressure, no deadlines, no sales talk, no hashtags, at most two emoji, no em dashes.",
    "Address people as tú in Spanish, você in Portuguese, tu in Italian, Sie in German and vous in French.",
    "People:",
    JSON.stringify(list)
  ].join("\n");
}

/** Gemini's DMs by id; one without the pass link, or too short, falls back to the template. */
function parseDms(text, items) {
  let rows = [];
  try { rows = JSON.parse(String(text || "").replace(/^```(?:json)?|```$/gm, "").trim()); } catch (error) { rows = []; }
  const byId = Object.fromEntries((Array.isArray(rows) ? rows : []).filter((r) => r && r.id).map((r) => [r.id, r]));
  return Object.fromEntries(items.map((x) => {
    const r = byId[x.key] || {};
    const dm = clip(String(r.dm || "").replace(/\s*—\s*/g, ", ").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1"), 900);
    const ok = dm.length >= 40 && x.facts.url && dm.includes(x.facts.url);
    return [x.key, ok ? { draft: dm, english: x.facts.lang === "en" ? "" : clip(r.english, 900), by: "gemini" } : { draft: dmFallback(x.facts), english: "", by: "template" }];
  }));
}

/** actions.dm for a chain post: waiting for Carlos, or approved straight away when outreach-send says "auto" in a live run. */
function dmAction(dm, facts, trial, conf, now, mode) {
  const t = trialSettings(conf.trials);
  const auto = mode === "auto" && conf.live === true;
  return Object.assign({
    status: conf.paused ? "paused" : auto ? "approved" : "waiting", draft: dm.draft, lang: facts.lang, by: dm.by,
    trial: { code: clip(trial.code, 60), url: clip(trial.url, 300) }, card: { look: facts.look, host: facts.host, first: facts.first, handle: facts.handle },
    expiresAt: iso(now + t.dmTtlHours * HOUR)
  }, dm.english ? { english: dm.english } : {}, auto ? { auto: true, decidedAt: iso(now), decidedBy: "auto" } : {});
}

/** Approve, edit or dismiss a waiting DM; an edit that drops the pass link gets it back at the end. */
function decideDm(doc, decision, text, by, now) {
  const d = ((doc || {}).actions || {}).dm;
  if (!d) throw new Error("That post has no DM draft.");
  if (d.status !== "waiting") throw new Error("That DM is already " + d.status + ".");
  if (Date.parse(d.expiresAt) < now) throw new Error("That DM expired.");
  if (!["approve", "edit", "dismiss"].includes(decision)) throw new Error("Approve, edit or dismiss.");
  const at = iso(now);
  if (decision === "dismiss") return { dm: Object.assign({}, d, { status: "dismissed", decidedAt: at, by }), counter: "dm_dismissed" };
  let draft = d.draft;
  if (decision === "edit") {
    draft = String(text || "").trim();
    if (draft.length < 5) throw new Error("Write the message first.");
    if (d.trial && d.trial.url && !draft.includes(d.trial.url)) draft += " " + d.trial.url;
    if (draft.length > 1000) throw new Error("A DM takes at most 1000 characters here; this is " + draft.length + ".");
  }
  return { dm: Object.assign({}, d, { status: "approved", draft, edited: decision === "edit", decidedAt: at, by }, decision === "edit" ? { english: "", original: d.draft } : {}), counter: decision === "edit" ? "dm_edited" : "dm_approved" };
}

/** The push for a waiting DM, with Approve, Edit and Dismiss like a reply's. */
function dmPush(doc, name) {
  const d = (doc.actions || {}).dm || {};
  const who = clip((doc.author || {}).name || (doc.author || {}).handle, 60);
  return {
    kind: "engagement",
    title: "Send " + who + " a 2-day pass on " + (name || doc.network) + "?",
    body: clip(d.draft, 220),
    lines: [who + ": " + clip(doc.text, 140), "Pass " + ((d.trial || {}).code || "") + " · card " + ((d.card || {}).look || "") + " · " + (d.lang || "")].concat(d.english ? ["In English: " + clip(d.english, 220)] : []),
    tab: "products:engagement",
    tag: "jarvis-engage-dm-" + doc.key,
    url: /^https:\/\//.test(doc.url || "") ? doc.url : "",
    ref: "engagement-dm:" + doc.key,
    actions: [{ act: "approve", label: "Send" }, { act: "edit", label: "Edit", input: "Your message" }, { act: "dismiss", label: "Dismiss" }]
  };
}

/** The ledger patch once an offer is made, and once its DM went out (or failed). */
const offerPatch = (comment, doc, trial) => ({
  stage: "offered", offers: [{ code: clip(trial.code, 24), kind: "trial", url: clip(trial.url, 500) }],
  by: "chain", note: "2-day pass offered on " + comment.network + " after a nice reply"
});
const dmPatch = (doc, sent) => {
  const d = (doc.actions || {}).dm || {};
  const look = (d.card || {}).look || "";
  return Object.assign(sent.status === "sent" ? { dms: [{ network: doc.network, text: clip(d.draft, 2000), card: look ? look + (sent.card === "attached" ? "" : " (not attached)") : "" }] } : {},
    { by: "chain-dm", note: "DM " + sent.status + " on " + doc.network + ((d.trial || {}).code ? " with " + d.trial.code : "") + (sent.url ? ": " + clip(sent.url, 200) : "") });
};

// --- I/O through deps -----------------------------------------------------------------------------------------------

/** The outreach ledger (#3136): deps.outreach, or functions/outreach-people.js and outreach-trials.js, or null until they ship. */
function ledger(deps) {
  if (deps && deps.outreach !== undefined) return deps.outreach;
  try { return { people: require("./outreach-people"), trials: require("./outreach-trials") }; } catch (error) {
    if (error.code === "MODULE_NOT_FOUND" && /outreach-(people|trials)/.test(error.message)) return null;
    throw error;
  }
}

const LADDER = "engagement_people";

/** The stored person behind each comment, by comment key: { id, doc }, doc the ledger row with its ladder counts, or null. */
async function people(db, L, comments) {
  const out = new Map();
  if (!L || !comments.length) return out;
  const ids = Array.from(new Set(comments.map((c) => (handleOf(c.author) ? L.people.idFor(c.network, handleOf(c.author)) : "")).filter(Boolean)));
  if (!ids.length) return out;
  const snaps = await db.getAll(...ids.map((id) => db.collection(L.people.COLLECTION || "outreach_people").doc(id)), ...ids.map((id) => db.collection(LADDER).doc(id)));
  const byId = new Map(ids.map((id, i) => {
    const row = snaps[i].exists ? snaps[i].data() : null;
    const ladder = snaps[ids.length + i].exists ? snaps[ids.length + i].data() : null;
    return [id, row || ladder ? Object.assign({ id }, row, ladder) : null];
  }));
  comments.forEach((c) => {
    const id = handleOf(c.author) ? L.people.idFor(c.network, handleOf(c.author)) : "";
    if (id) out.set(c.key, { id, doc: byId.get(id) || null });
  });
  return out;
}

/**
 * After the chain pass decided its comments (fresh, with docs by key): offers minted and DMs drafted onto the docs
 * (before they are stored), then the people touched. Returns { offers, touched, errors }.
 * draftDms(items) => Gemini's text, or throws.
 */
async function offers(deps, conf, L, fresh, docs, persons, draftDms, send) {
  const out = { offers: 0, errors: [] };
  if (!L) return out;
  const byKey = new Map(docs.map((d) => [d.key, d]));
  const due = fresh.filter((c) => byKey.has(c.key) && persons.has(c.key) && offerable(c, byKey.get(c.key), (persons.get(c.key) || {}).doc, conf));
  const items = [];
  for (const c of due) {
    const per = persons.get(c.key);
    const doc = byKey.get(c.key);
    try {
      const facts0 = dmFacts(c, per.doc);
      const trial = await L.trials.mintTrial(deps.db, { kind: "social", person: per.id, lang: facts0.lang, network: c.network, handle: facts0.handle, domain: facts0.host, by: "chain" }, deps.now);
      if (!trial || !trial.url) throw new Error("mintTrial returned no link");
      items.push({ key: c.key, network: c.network, text: c.text, ours: ((c.parent.actions || {}).reply || {}).draft, post: (c.parent.chain || {}).post || c.parent.title || c.parent.text, facts: dmFacts(c, per.doc, trial), trial, comment: c, doc });
    } catch (error) {
      out.errors.push(c.key + ": " + clip(error.message || error, 160));
    }
  }
  if (!items.length) return out;
  let text = "";
  try { text = await draftDms(dmPrompt(items)); } catch (error) { out.errors.push("dm draft: " + clip(error.message || error, 160)); }
  const dms = parseDms(text, items);
  items.forEach((x) => {
    x.doc.actions = Object.assign({}, x.doc.actions, { dm: dmAction(dms[x.key], x.facts, x.trial, conf, deps.now, send ? Send.modeOf(send, { network: x.network, kind: "dm", now: deps.now }) : "approve") });
    x.doc.offer = { code: x.trial.code, at: iso(deps.now) };
    out.offers += 1;
  });
  out.made = items;
  return out;
}

/** Each comment's person touched in the ledger (with the offer when one was made) and their ladder counts kept. */
async function touchAll(deps, L, fresh, docs, persons, made) {
  const out = { touched: 0, errors: [] };
  if (!L) return out;
  const byKey = new Map(docs.map((d) => [d.key, d]));
  const offered = new Map((made || []).map((x) => [x.key, x.trial]));
  const seen = new Map();
  for (const c of fresh) {
    const per = persons.get(c.key);
    const doc = byKey.get(c.key);
    if (!per || !doc) continue;
    const before = seen.get(per.id) || per.doc;
    const { ledger, ladder } = personPatch(c, doc, before, deps.now);
    let patch = ledger;
    if (offered.has(c.key)) {
      const o = offerPatch(c, doc, offered.get(c.key));
      patch = Object.assign({}, ledger, { stage: o.stage, offers: o.offers, note: ledger.note + "; " + o.note });
    }
    try {
      const row = await L.people.touch(deps.db, per.id, patch, deps.now);
      await deps.db.collection(LADDER).doc(per.id).set(Object.assign({ updatedAt: iso(deps.now) }, ladder), { merge: true });
      seen.set(per.id, Object.assign({}, row, ladder));
      out.touched += 1;
    } catch (error) { out.errors.push(per.id + ": " + clip(error.message || error, 160)); }
  }
  return out;
}

module.exports = {
  TRIALS, TONES, RUNGS, LANGS, LOOKS, DM_NETS, DM_VIA, DM_COPY, STAGE_ORDER, REVIEW_URL,
  trialSettings, tone, theirPost, active, rung, ladderFor, used, nextStage, personPatch, offerable, owed,
  dmFacts, dmFallback, dmPrompt, parseDms, dmAction, decideDm, dmPush, offerPatch, dmPatch, ledger, people, offers, touchAll, handleOf, threadUrl, LADDER
};
