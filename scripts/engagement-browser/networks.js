"use strict";
/*
 * How the Mac's browser agent (#1991) reads and acts on each network, signed in as our accounts in its own Chrome
 * profile. Each network: home (where a signed-in check starts), signedIn(page) => account name or "", read(page,
 * query) => posts in the scout's shape (functions/engagement-mac.js cleans them), and the actions it takes, each
 * act(page, task) => { url } or a throw. A Refused throw means the network refused us for now (signed out, a
 * check, a limit): the task stays queued and the agent leaves that network alone for a day.
 * replied(page, task) => { url } of our earlier reply on the post, or null, runs before every reply (#2424);
 * inbox(page) => comments on our posts and replies to ours, as posts with liked, answered, on (our post's id) and ours
 * (its text); inbox-map.js reads each network's notifications JSON (#2452). A comment task (task.chain) runs
 * likeComment or replyComment where the network has them; on X and Threads a comment is a post, so like and reply serve.
 * X, Threads, Instagram, TikTok, LinkedIn and Facebook have latest(page, task, since) => { id, url } of the newest own
 * post on the profile task.url, or null (an owner reply, #2638); on Facebook, LinkedIn and TikTok reply types
 * task.mentions as accounts picked from the comment box's menu and returns them with linked (#2637). A Threads reply
 * adds task.extras (a GIF, a topic, a card image) where the composer has them and returns what came of each (#2710).
 * Telegram and Reddit (#2614) also have groups(page, query) => groups a topic search finds ({ network, id, name, url,
 * members, lang, about, kind, member }), join(page, task) => { members, already }, and places: where the field is read
 * besides the topic searches (placesOnly: Telegram has no post search, only channels and groups). LinkedIn (#3138) has
 * groups and join too, as Carlos's personal profile; its join and Reddit's return the group's rules and pending (asked).
 * Both carry the student routine's approved drafts as Carlos (#3138): publish(page, task) posts task.title and
 * task.draft in a group or task.sr, dm(page, task) messages task.to, and a LinkedIn reply with task.as "self" skips
 * acting as the page.
 *
 * The selectors are the networks' own accessibility labels and test ids where they have them; when a network
 * changes its page, `agent.js check --read` shows which reader came back empty and saves a screenshot.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Inbox = require("./inbox-map");

class Refused extends Error {}

const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = (a, b) => sleep(rand(a, b));
const enc = encodeURIComponent;

// A network's check page or a captcha: the agent stops there and says so in Jarvis.
const CHECK_URL = /\/(checkpoint|challenge|captcha|account\/access|account\/suspended|i\/flow\/login|login|authwall|uas\/login|accounts\/login|suspended)\b/i;
const CHECK_EL = 'iframe[src*="captcha"], iframe[src*="arkose"], iframe[src*="recaptcha"], #captcha-verify-image, [class*="captcha_verify"], [id*="captcha-container"]';

async function checked(page, net) {
  if (CHECK_URL.test(new URL(page.url()).pathname) || (net.check && net.check.test(page.url()))) throw new Refused(net.name + " sent us to a sign-in or check page (" + new URL(page.url()).pathname + ").");
  if (await page.locator(net.checkEl || CHECK_EL).count().catch(() => 0)) throw new Refused(net.name + " is showing a captcha.");
}

async function go(page, net, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pause(2500, 5000);
  await checked(page, net);
}

async function scroll(page, times) {
  for (let i = 0; i < times; i += 1) {
    await page.mouse.wheel(0, rand(600, 1100));
    await pause(1200, 2600);
  }
}

async function click(loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => null);
  await pause(500, 1400);
  await loc.click({ delay: rand(40, 120), timeout: 10000 });
  await pause(1200, 2500);
}

async function keys(page, text) {
  for (const part of String(text).match(/.{1,12}/gsu) || []) {
    await page.keyboard.type(part, { delay: rand(35, 85) });
    await pause(80, 400);
  }
}

// end: the box already holds the name of the person answered, so the text goes after it.
async function type(page, loc, text, end) {
  await click(loc);
  if (end) await page.keyboard.press("Meta+ArrowDown");
  await keys(page, text);
  await pause(800, 1800);
}

const has = async (loc) => (await loc.count().catch(() => 0)) > 0;
const visible = (loc, ms) => loc.first().waitFor({ state: "visible", timeout: ms || 15000 }).then(() => true, () => false);
const need = async (loc, what) => { if (!(await visible(loc))) throw new Error(what + " was not on the page."); return loc.first(); };

// --- Owner tags (#2637, #2638) ---------------------------------------------------------------------------------------
// On Facebook, LinkedIn and TikTok a mention is an account picked from the comment box's menu: task.mentions
// [{ token, handle, name }] names the tokens in the draft to swap for one.

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ \t]+/g, " ").trim();
const tokenAt = (s, t) => {
  for (let i = s.indexOf(t); i >= 0; i = s.indexOf(t, i + 1)) {
    const next = s.charAt(i + t.length);
    if (!/[\w-]/.test(next) && !(next === "." && /\w/.test(s.charAt(i + t.length + 1)))) return i;
  }
  return -1;
};

/** A draft cut at its mentions' tokens: [{ text } | { mention }], each mention once, in the draft's order. */
function splitDraft(draft, mentions) {
  const out = [];
  const left = (mentions || []).filter((m) => m && m.token);
  let rest = String(draft || "");
  while (rest) {
    let at = -1;
    let m = null;
    left.forEach((x) => { const i = tokenAt(rest, x.token); if (i >= 0 && (at < 0 || i < at)) { at = i; m = x; } });
    if (!m) { out.push({ text: rest }); break; }
    if (at) out.push({ text: rest.slice(0, at) });
    out.push({ mention: m });
    rest = rest.slice(at + m.token.length);
    left.splice(left.indexOf(m), 1);
  }
  return out;
}

// Facebook's and LinkedIn's mention menus are listboxes.
const MENU = '[role="listbox"] [role="option"]';

/** The menu entry ({ text, href }) that is the mention's account: its handle in the link or the text, else its name; -1 for none. */
function pickOption(options, m) {
  const handle = fold(String((m || {}).handle || "").split("/").pop()).replace(/^@/, "");
  const name = fold((m || {}).name);
  const lines = (o) => String(o.text || "").split("\n").map(fold).filter(Boolean);
  const tests = [
    (o) => handle && fold(o.href).split(/[/?#]/).includes(handle),
    (o) => handle && lines(o).some((l) => l.split(/[\s·•|]+/).map((w) => w.replace(/^@/, "")).includes(handle)),
    (o) => name && lines(o).includes(name),
    (o) => name && (lines(o)[0] || "").startsWith(name)
  ];
  for (const t of tests) {
    const i = (options || []).findIndex(t);
    if (i >= 0) return i;
  }
  return -1;
}

/** The owner's newest own post read off their profile ([{ url, at, pinned, repost }]) since a time (ms), or null. */
function newest(list, since) {
  return (list || []).filter((p) => p && p.url && !p.pinned && !p.repost && Date.parse(p.at) > since).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
}

/** A LinkedIn activity's time, from its urn's id. */
function liAt(urn) {
  const id = String(urn || "").split(":").pop();
  return /^\d{10,}$/.test(id) ? new Date(Number(BigInt(id) >> 22n)).toISOString() : "";
}

const fbUrl = (link) => {
  const u = new URL(link);
  return u.pathname.includes("permalink.php") ? u.origin + u.pathname + "?story_fbid=" + u.searchParams.get("story_fbid") + "&id=" + (u.searchParams.get("id") || "") : u.origin + u.pathname;
};

/** The stories in a Facebook page's JSON with their creation time, as newest() takes them; another page's are reposts. */
function fbStories(j, handle, into = []) {
  if (!j || typeof j !== "object") return into;
  const link = typeof j.url === "string" ? j.url : typeof j.permalink_url === "string" ? j.permalink_url : "";
  if (typeof j.creation_time === "number" && /^https:\/\/(www\.)?facebook\.com\/.+(\/posts\/|\/videos\/|\/reel\/|permalink\.php|story_fbid=)/.test(link)) {
    const url = fbUrl(link);
    if (!into.some((s) => s.url === url)) into.push({ url, at: new Date(j.creation_time * 1000).toISOString(), pinned: false, repost: !fold(url).includes("facebook.com/" + fold(handle) + "/") && !url.includes("permalink.php") });
  }
  (Array.isArray(j) ? j : Object.values(j)).forEach((v) => fbStories(v, handle, into));
  return into;
}

// Facebook pages and LinkedIn companies are found in the menu by name: one the account has no name for yet takes the
// heading of its profile page.
async function named(page, net, mentions, urlOf) {
  const out = [];
  for (const m of mentions || []) {
    let name = m.name || "";
    if (!name) {
      try {
        await go(page, net, urlOf(m));
        name = ((await page.locator('[role="main"] h1, main h1, h1').first().innerText({ timeout: 8000 })).split("\n")[0] || "").trim().slice(0, 80);
      } catch (error) { if (error instanceof Refused) throw error; }
    }
    out.push(Object.assign({}, m, { name }));
  }
  return out;
}

// Types the draft into loc, each mention as "@" and query(m) until the menu shows its account, which is picked; with no
// match the typed text stays as plain text. Returns each mention with linked and the name it went by.
async function typeMentions(page, loc, draft, mentions, menu, query) {
  await click(loc);
  const out = [];
  for (const part of splitDraft(draft, mentions)) {
    if (!part.mention) { await keys(page, part.text); continue; }
    const m = part.mention;
    await keys(page, "@" + String(query(m)).slice(0, 40));
    const options = page.locator(menu).filter({ visible: true });
    let i = -1;
    if (await visible(options, 6000)) {
      await pause(1200, 2200);
      i = pickOption(await options.evaluateAll((els) => els.map((e) => ({ text: e.innerText || "", href: (e.querySelector("a[href]") || e.closest("a[href]") || {}).href || "" }))).catch(() => []), m);
    }
    if (i >= 0) {
      const name = ((await options.nth(i).innerText().catch(() => "")).split("\n")[0] || "").trim();
      await click(options.nth(i));
      out.push({ token: m.token, handle: m.handle, name: name || m.name, linked: true });
    } else {
      if (await has(options)) await page.keyboard.press("Escape");
      out.push({ token: m.token, handle: m.handle, name: m.name || "", linked: false });
    }
  }
  await pause(800, 1800);
  return out;
}

// In-page helper source: "1,234", "1.2K", "3M" and aria-labels like "57 Likes. Like" as numbers.
const NUM = "const num = (s) => { const m = String(s || '').replace(/,/g, '').match(/([\\d.]+)\\s*([KkMm])?/); if (!m) return 0; const v = parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[(m[2] || '').toLowerCase()] || 1); return Number.isFinite(v) ? Math.round(v) : 0; };";
const evaluate = (page, body, arg) => page.evaluate(new Function("arg", NUM + body), arg);

// A comment task's comment: find (in-page source returning the comment's own box, given arg) marks it, so the like and
// the reply stay inside that comment and never touch the post or another comment.
async function commentBox(page, find, arg) {
  for (let i = 0; i < 6; i += 1) {
    const ok = await evaluate(page, `document.querySelectorAll('[data-qalab-comment]').forEach((e) => e.removeAttribute('data-qalab-comment'));
      const box = (() => {` + find + `})(); if (box) box.setAttribute('data-qalab-comment', '1'); return !!box;`, arg);
    if (ok) return page.locator("[data-qalab-comment]").first();
    await pause(1500, 2500);
  }
  throw new Error("The comment was not on the page.");
}

// The reply box keeps our text until it sends.
async function sent(box, draft) {
  await pause(3000, 5000);
  const left = await box.innerText({ timeout: 2000 }).catch(() => "");
  if (left.includes(String(draft).slice(0, 20))) throw new Error("The reply did not send.");
}

// On LinkedIn and Facebook the agent acts as our page, never as the person signed in (Carlos, #1991).
const PAGES = { linkedin: "146731408", facebook: "qalaburlreview" };
const PAGE_NAME = /QA-?lab/i;

// Meta's pages follow the account's language (ours are in Spanish), and Threads names its icons with an svg <title>.
const SAYS = { like: ["Like", "Me gusta"], unlike: ["Unlike", "Ya no me gusta", "Quitar me gusta"], reply: ["Reply", "Comment", "Responder", "Comentar"], repost: ["Repost", "Republicar"], profile: ["Profile", "Perfil"], home: ["Home", "Inicio"] };
const icon = (names, extra) => names.flatMap((n) => ['svg[aria-label="' + n + '"]' + (extra || ""), 'svg' + (extra || "") + ':has(> title:text-is("' + n + '"))']).join(", ");
const button = (scope, names, extra) => scope.locator('[role="button"], button').filter({ has: scope.page().locator(icon(names, extra)) });
const words = (names) => new RegExp("^(" + names.join("|") + ")$");

/** Every tweet in an X GraphQL response, wherever its timeline nests it, as { id: text }. A reply's text starts after its @mentions; a long post's is in note_tweet. */
function xTexts(j, into = {}) {
  if (!j || typeof j !== "object") return into;
  const t = j.tweet_results && j.tweet_results.result;
  if (t) {
    const w = t.tweet || t;
    const l = w.legacy || {};
    const long = ((((w.note_tweet || {}).note_tweet_results || {}).result || {}).text) || "";
    const text = long || Array.from(String(l.full_text || "")).slice((l.display_text_range || [0])[0]).join("");
    if (w.rest_id && text.trim()) into[w.rest_id] = text.trim();
  }
  (Array.isArray(j) ? j : Object.values(j)).forEach((v) => xTexts(v, into));
  return into;
}

const GENERAL = ["web accessibility", "WCAG", "core web vitals", "technical SEO", "Playwright testing", "test automation", "AI Overviews SEO", "web performance", "GA4", "software testing", "a11y", "Google Search Console", "QA engineer", "Lighthouse performance"];

const x = {
  name: "X", account: "qalaburlreview", home: "https://x.com/home", queries: GENERAL,
  async signedIn(page) {
    const btn = page.locator('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (!(await visible(btn, 15000))) return "";
    return ((await btn.first().innerText().catch(() => "")).match(/@\w+/) || ["X"])[0];
  },
  async read(page, q) {
    await go(page, this, "https://x.com/search?q=" + enc(q + " -filter:replies") + "&src=typed_query&f=top");
    await visible(page.locator('article[data-testid="tweet"]'), 20000);
    await scroll(page, 3);
    return evaluate(page, `
      const label = (a, id) => { const el = a.querySelector('[data-testid="' + id + '"]'); return el ? num(el.getAttribute('aria-label')) : 0; };
      return Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((a) => {
        const time = a.querySelector('time');
        const href = time && time.closest('a') ? time.closest('a').getAttribute('href') : '';
        const m = href.match(/^\\/([^/]+)\\/status\\/(\\d+)/);
        if (!m) return null;
        const text = a.querySelector('[data-testid="tweetText"]');
        const name = a.querySelector('[data-testid="User-Name"] span');
        const views = a.querySelector('a[href$="/analytics"]');
        return { network: 'x', id: m[2], url: 'https://x.com' + href.split('?')[0], author: { handle: m[1], name: name ? name.textContent : m[1] },
          text: text ? text.innerText : '', lang: text ? text.getAttribute('lang') || '' : '', createdAt: time.getAttribute('datetime'),
          isReply: /Replying to/.test(a.innerText.slice(0, 300)),
          metrics: { likes: label(a, 'like') || label(a, 'unlike'), replies: label(a, 'reply'), reposts: label(a, 'retweet') || label(a, 'unretweet'), views: views ? num(views.getAttribute('aria-label')) : 0 } };
      }).filter(Boolean);`);
  },
  async post(page, task) {
    await go(page, this, task.url);
    return need(page.locator('article[data-testid="tweet"]').filter({ has: page.locator('a[href*="/status/' + task.id + '"] time') }), "The post");
  },
  async like(page, task) {
    const art = await this.post(page, task);
    if (await has(art.locator('[data-testid="unlike"]'))) return {};
    await click(art.locator('[data-testid="like"]').first());
    if (!(await visible(art.locator('[data-testid="unlike"]'), 8000))) throw new Error("The like did not stick.");
    return {};
  },
  async repost(page, task) {
    const art = await this.post(page, task);
    if (await has(art.locator('[data-testid="unretweet"]'))) return {};
    await click(art.locator('[data-testid="retweet"]').first());
    await click(await need(page.locator('[data-testid="retweetConfirm"]'), "Repost in the menu"));
    return {};
  },
  async follow(page, task) {
    await go(page, this, "https://x.com/" + enc(task.author.handle));
    if (await visible(page.locator('[data-testid$="-unfollow"]'), 6000)) return {};
    await click(await need(page.locator('[data-testid$="-follow"]'), "Follow"));
    return {};
  },
  // Our earlier reply under the post: a tweet in the conversation whose permalink is ours.
  async replied(page, task) {
    await this.post(page, task);
    await scroll(page, 1);
    const href = await evaluate(page, `
      const hrefs = Array.from(document.querySelectorAll('article[data-testid="tweet"] a[href*="/status/"] time')).map((t) => t.closest('a').getAttribute('href'));
      const at = hrefs.findIndex((h) => h.includes('/status/' + arg.id));
      return hrefs.slice(at + 1).find((h) => h.toLowerCase().startsWith('/' + arg.me + '/status/')) || '';`, { me: this.account, id: task.id });
    return href ? { url: "https://x.com" + href.split("?")[0] } : null;
  },
  // An owner's newest post on their profile: a repost's permalink is another account's, the pinned one says so above it.
  async latest(page, task, since) {
    await go(page, this, task.url);
    if (!(await visible(page.locator('article[data-testid="tweet"]'), 20000))) return null;
    await scroll(page, 1);
    const list = await evaluate(page, `
      return Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((a) => {
        const time = a.querySelector('time');
        const href = time && time.closest('a') ? time.closest('a').getAttribute('href') : '';
        const m = href.match(/^\\/([^/]+)\\/status\\/(\\d+)/);
        if (!m) return null;
        const said = (a.querySelector('[data-testid="socialContext"]') || {}).textContent || '';
        return { id: m[2], url: 'https://x.com' + href.split('?')[0], at: time.getAttribute('datetime'), pinned: /pinned|fijad/i.test(said), repost: m[1].toLowerCase() !== arg.toLowerCase() };
      }).filter(Boolean);`, task.author.handle);
    const p = newest(list, since);
    return p && { id: p.id, url: p.url };
  },
  // Replies and mentions of us, as the notifications page loads them: { ...post, liked, on, ours } with on our post's id
  // and ours its text. The notifications rarely carry our post, so its text comes from our replies tab.
  async inbox(page) {
    const found = [];
    const texts = {};
    const on = async (r) => {
      if (!/\/i\/api\/graphql\/[^/]+\/NotificationsTimeline/.test(r.url())) return;
      const j = await r.json().catch(() => null);
      xTexts(j, texts);
      const tl = (((((((j || {}).data || {}).viewer_v2 || {}).user_results || {}).result || {}).notification_timeline || {}).timeline || {}).instructions || [];
      tl.forEach((ins) => (ins.entries || []).forEach((e) => {
        const t = ((((e.content || {}).itemContent || {}).tweet_results || {}).result) || null;
        if (t) found.push(t.tweet || t);
      }));
    };
    page.on("response", on);
    try { await go(page, this, "https://x.com/notifications/mentions"); await pause(4000, 6000); await scroll(page, 1); } finally { page.off("response", on); }
    const me = this.account;
    const got = found.filter((t, i) => found.findIndex((u) => u.rest_id === t.rest_id) === i).map((t) => {
      const who = ((((t.core || {}).user_results || {}).result || {}).core) || {};
      const l = t.legacy || {};
      if (!t.rest_id || !who.screen_name || who.screen_name.toLowerCase() === me) return null;
      return {
        network: "x", id: t.rest_id, url: "https://x.com/" + who.screen_name + "/status/" + t.rest_id, author: { handle: who.screen_name, name: who.name || who.screen_name },
        text: l.full_text || "", lang: l.lang || "", createdAt: l.created_at ? new Date(l.created_at).toISOString() : "", isReply: !!l.in_reply_to_status_id_str,
        metrics: { likes: l.favorite_count || 0, replies: l.reply_count || 0, reposts: l.retweet_count || 0, views: 0 },
        liked: l.favorited === true, on: String(l.in_reply_to_screen_name || "").toLowerCase() === me ? l.in_reply_to_status_id_str || "" : ""
      };
    }).filter(Boolean);
    if (got.some((c) => c.on && !texts[c.on])) {
      const mine = async (r) => { if (/\/i\/api\/graphql\/[^/]+\/(UserRepliesTimeline|UserTweetsAndReplies)\b/.test(r.url())) xTexts(await r.json().catch(() => null), texts); };
      page.on("response", mine);
      try { await go(page, this, "https://x.com/" + me + "/with_replies"); await pause(3000, 5000); await scroll(page, 1); } catch (error) { if (error instanceof Refused) throw error; } finally { page.off("response", mine); }
    }
    got.forEach((c) => { c.ours = (c.on && texts[c.on]) || ""; });
    return got;
  },
  async reply(page, task) {
    const art = await this.post(page, task);
    await click(art.locator('[data-testid="reply"]').first());
    await type(page, await need(page.locator('[data-testid="tweetTextarea_0"]'), "The reply box"), task.draft);
    // A draft ending in an @handle leaves X's suggestions open over the Reply button; a space closes them.
    if (/@\w+$/.test(String(task.draft).trim())) {
      await page.keyboard.type(" ");
      await page.locator('[role="listbox"]').first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);
    }
    const card = task.cardFile ? await this.attach(page, task) : null;
    await click(await need(page.locator('[data-testid="tweetButton"]'), "Reply"));
    await page.locator('[data-testid="tweetTextarea_0"]').first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => { throw new Error("The reply did not send."); });
    return Object.assign({ url: task.url }, card ? { card: card.ok ? "attached" : "text", cardError: card.error || "" } : {});
  },
  // The report card (#2466) through the reply box's file input, with its alt text when X offers the description
  // editor. Anything that goes wrong takes the image off again, so the reply goes as text with its link.
  async attach(page, task) {
    const box = page.locator('[role="dialog"]:has([data-testid="tweetTextarea_0"])');
    const scope = (await has(box)) ? box.first() : page;
    const media = scope.locator('[data-testid="attachments"]');
    try {
      await scope.locator('input[data-testid="fileInput"]').first().setInputFiles(task.cardFile, { timeout: 10000 });
      if (!(await visible(media, 20000))) throw new Error("X did not take the image.");
      let alt = false;
      const describe = scope.getByRole("link", { name: /^(Add description|Agregar descripción|Añadir descripción)$/i })
        .or(scope.getByRole("button", { name: /^(Add description|Agregar descripción|Añadir descripción)$/i }));
      if (task.alt && await visible(describe, 4000)) {
        await click(describe.first());
        const input = page.locator('textarea[name="altTextInput"], [data-testid="altTextInput"] textarea, [data-testid="altTextInput"]');
        if (await visible(input, 6000)) {
          await input.first().fill(task.alt.slice(0, 1000));
          await click(page.locator('[data-testid="endEditingButton"]').or(page.getByRole("button", { name: /^(Save|Guardar|Done|Listo)$/ })).first());
          alt = true;
        }
      }
      await pause(800, 1600);
      return { ok: true, error: alt ? "" : "X offered no description editor, so the card went without alt text." };
    } catch (error) {
      await media.locator('[aria-label="Remove media"], [aria-label="Quitar contenido multimedia"], [aria-label="Eliminar contenido multimedia"]').first().click({ timeout: 3000 }).catch(() => null);
      return { ok: false, error: String(error.message || error).slice(0, 160) };
    }
  }
};

// --- Threads composer extras (#2710) ------------------------------------------------------------------------------------
// A reply may bring extras { gif, topic, image }: a GIF picked from a search, the "Community or topic" field beside our
// name, and one of our cards (agent.js downloads extras.image to task.imageFile) through the composer's file input.
// Each is best-effort: a control not there within EXTRA_MS is skipped with why, and the text reply goes either way.
// They run before the text, so a step that closes the dialog costs the extras, never the reply: it opens again bare.

const EXTRA_MS = 5000;
const TH = {
  gif: ["Add a GIF", "Add GIF", "GIF", "Añadir un GIF", "Agregar un GIF", "Agregar GIF"],
  search: ["Search", "Search GIFs", "Search GIPHY", "Buscar", "Buscar GIF", "Buscar GIFs", "Buscar en GIPHY"],
  topic: ["Add a topic", "Community or topic", "Topic", "Añadir un tema", "Agregar un tema", "Comunidad o tema", "Tema"],
  media: ["Attach media", "Add media", "Adjuntar contenido multimedia", "Adjuntar archivo multimedia", "Agregar contenido multimedia"]
};
const GIPHY = 'img[src*="giphy" i]';
const control = (scope, names) => scope.getByRole("button", { name: words(names) }).or(button(scope, names));
const grows = async (loc, n, ms) => {
  for (let t = 0; t < ms; t += 500) {
    if ((await loc.count().catch(() => 0)) > n) return true;
    await sleep(500);
  }
  return false;
};

async function thGif(page, dialog, term) {
  const open = control(dialog, TH.gif);
  if (!(await visible(open, EXTRA_MS))) return "no GIF button";
  await page.evaluate((sel) => document.querySelectorAll(sel).forEach((i) => i.setAttribute("data-qalab-seen", "")), GIPHY).catch(() => null);
  await click(open.first());
  const search = page.getByRole("searchbox").or(page.getByPlaceholder(words(TH.search))).or(page.getByRole("textbox", { name: words(TH.search) }));
  if (!(await visible(search, EXTRA_MS))) { await page.keyboard.press("Escape"); return "no GIF search"; }
  await click(search.last());
  await keys(page, term);
  // Each result is a button named "Select GIF" in every UI language (#2736); the picker shows trending ones until the search answers.
  await sleep(1500);
  const named = page.getByRole("button", { name: "Select GIF" });
  const found = (await visible(named, EXTRA_MS)) ? named : page.locator(GIPHY + ":not([data-qalab-seen])");
  if (!(await visible(found, EXTRA_MS))) { await page.keyboard.press("Escape"); return "no GIF for \"" + term + "\""; }
  await click(found.first());
  return (await visible(dialog.locator(GIPHY + ":not([data-qalab-seen])"), EXTRA_MS)) ? "added" : "Threads did not attach the GIF";
}

async function thTopic(page, dialog, topic) {
  const field = dialog.getByPlaceholder(words(TH.topic)).or(dialog.getByRole("textbox", { name: words(TH.topic) }));
  if (!(await visible(field, EXTRA_MS))) {
    const open = control(dialog, TH.topic);
    if (!(await visible(open, 1000))) return "no topic field";
    await click(open.first());
    if (!(await visible(field, EXTRA_MS))) return "no topic field";
  }
  await click(field.first());
  await keys(page, topic);
  const options = page.getByRole("option");
  if (await visible(options, 3000)) {
    const texts = await options.allInnerTexts().catch(() => []);
    const at = texts.findIndex((t) => fold(t.split("\n")[0]) === fold(topic));
    await click(options.nth(Math.max(0, at)));
  }
  const box = dialog.locator('[contenteditable="true"]').first();
  if (fold(await box.innerText().catch(() => "")).includes(fold(topic))) {
    await click(box);
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");
    return "the topic went into the reply box, so it was cleared";
  }
  return "added";
}

async function thImage(page, dialog, file) {
  const shown = dialog.locator("img, video");
  const before = await shown.count().catch(() => 0);
  const input = dialog.locator('input[type="file"]');
  if (await has(input)) await input.first().setInputFiles(file, { timeout: EXTRA_MS });
  else {
    const attach = control(dialog, TH.media);
    if (!(await visible(attach, EXTRA_MS))) return "no attach button";
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: EXTRA_MS }), click(attach.first())]);
    await chooser.setFiles(file);
  }
  return (await grows(shown, before, 20000)) ? "added" : "Threads showed no preview of the image";
}

/** Adds task.extras to the open reply dialog; { dialog, extras: { gif|topic|image: "added" or why not } }. Never throws but for reopening. */
async function thExtras(page, dialog, task, reopen) {
  const x = task.extras || {};
  const out = {};
  const steps = [];
  if (x.gif && task.imageFile) out.gif = "the image went instead";
  else if (x.gif) steps.push(["gif", (d) => thGif(page, d, String(x.gif).slice(0, 40))]);
  if (x.topic) steps.push(["topic", (d) => thTopic(page, d, String(x.topic).slice(0, 50))]);
  if (task.imageFile) steps.push(["image", (d) => thImage(page, d, task.imageFile)]);
  else if (x.image) out.image = task.imageError || "the image did not download";
  for (const [k, step] of steps) {
    try { out[k] = await step(dialog); } catch (error) {
      out[k] = String(error.message || error).split("\n")[0].slice(0, 120);
      if (k === "gif") await page.keyboard.press("Escape").catch(() => null);
    }
    if (await visible(dialog.locator('[contenteditable="true"]'), 3000)) continue;
    Object.keys(out).forEach((j) => { if (out[j] === "added") out[j] = "lost when the reply box closed"; });
    await page.keyboard.press("Escape").catch(() => null);
    dialog = await reopen();
  }
  return { dialog, extras: out };
}

// Only our own cards, so a draft can never make the agent fetch anything else.
const CARD_IMAGE = /^https:\/\/carlosandmunoz\.com\/media\/social-posts\/[\w-]+(\/[\w-]+)*\.(jpe?g|png|webp)$/i;

/** extras.image as a temp file for the composer: { file }, { error }, or {} without one. */
async function downloadImage(task, fetchFn, dir) {
  const url = String((task.extras || {}).image || "");
  if (!url) return {};
  if (!CARD_IMAGE.test(url)) return { error: "not one of our card images" };
  try {
    const res = await (fetchFn || fetch)(url, { signal: AbortSignal.timeout(20000) });
    const kind = String((res.headers && res.headers.get("content-type")) || "");
    if (!res.ok || !kind.startsWith("image/")) throw new Error("it answered " + res.status + (kind ? " " + kind : ""));
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 8e6) throw new Error("it is " + buf.length + " bytes");
    const file = path.join(dir || os.tmpdir(), "qalab-reply-image-" + String(task.key || Date.now()).replace(/[^\w-]/g, "") + path.extname(new URL(url).pathname));
    fs.writeFileSync(file, buf);
    return { file };
  } catch (error) { return { error: "the image did not download: " + String(error.message || error).slice(0, 120) }; }
}

const threads = {
  name: "Threads", account: "qaurlreview", home: "https://www.threads.com/", queries: GENERAL,
  async signedIn(page) {
    const me = page.locator('a[href^="/@"]').filter({ has: page.locator(icon(SAYS.profile)) }).filter({ visible: true });
    if (!(await visible(me, 15000))) return "";
    return "@" + String(await me.first().getAttribute("href")).replace(/^\/@/, "").split("/")[0];
  },
  async read(page, q) {
    await go(page, this, "https://www.threads.com/search?q=" + enc(q) + "&serp_type=default");
    await visible(page.locator('div[data-pressable-container="true"]'), 20000);
    await scroll(page, 3);
    return evaluate(page, `
      return Array.from(document.querySelectorAll('div[data-pressable-container="true"]')).map((c) => {
        const time = c.querySelector('time');
        const href = time && time.closest('a') ? time.closest('a').getAttribute('href') : '';
        const m = href.match(/^\\/@([^/]+)\\/post\\/([^/?]+)/);
        if (!m) return null;
        const count = (l) => { const s = Array.from(c.querySelectorAll('svg')).find((x) => arg[l].includes(x.getAttribute('aria-label') || (x.querySelector('title') || {}).textContent)); const b = s && s.closest('[role="button"], button'); return b ? num(b.innerText) : 0; };
        const text = Array.from(c.querySelectorAll('span[dir="auto"]')).map((s) => s.innerText.trim()).filter((t) => t && t !== m[1]).sort((a, b) => b.length - a.length)[0] || '';
        return { network: 'threads', id: m[2], url: 'https://www.threads.com' + href.split('?')[0], author: { handle: m[1], name: m[1] }, text, createdAt: time.getAttribute('datetime'),
          metrics: { likes: count('like') || count('unlike'), replies: count('reply'), reposts: count('repost'), views: 0 } };
      }).filter(Boolean);`, SAYS);
  },
  async post(page, task) {
    await go(page, this, task.url);
    return need(page.locator('div[data-pressable-container="true"]'), "The post");
  },
  async like(page, task) {
    const main = await this.post(page, task);
    if (await has(main.locator(icon(SAYS.unlike)))) return {};
    await click(button(main, SAYS.like).first());
    return {};
  },
  async repost(page, task) {
    const main = await this.post(page, task);
    await click(button(main, SAYS.repost).first());
    const item = page.getByText(words(SAYS.repost));
    if (!(await visible(item, 5000))) return {};
    await click(item.last());
    return {};
  },
  async follow(page, task) {
    await go(page, this, "https://www.threads.com/@" + enc(task.author.handle));
    if (await visible(page.getByRole("button", { name: /^(Following|Siguiendo)$/ }), 6000)) return {};
    await click(await need(page.getByRole("button", { name: /^(Follow|Seguir)$/ }), "Follow"));
    return {};
  },
  // The page has several /@ours nav links; only a post's own time link counts.
  async replied(page, task) {
    await this.post(page, task);
    await scroll(page, 1);
    const href = await evaluate(page, `
      const hrefs = Array.from(document.querySelectorAll('div[data-pressable-container="true"] a[href*="/post/"] time')).map((t) => t.closest('a').getAttribute('href'));
      const at = hrefs.findIndex((h) => h.includes('/post/' + arg.id));
      return hrefs.slice(at + 1).find((h) => h.toLowerCase().startsWith('/@' + arg.me + '/post/')) || '';`, { me: this.account, id: task.id });
    return href ? { url: "https://www.threads.com" + href.split("?")[0] } : null;
  },
  // An owner's newest thread on their profile: a repost links another account's post, the pinned one carries its icon.
  async latest(page, task, since) {
    await go(page, this, task.url);
    if (!(await visible(page.locator('div[data-pressable-container="true"]'), 20000))) return null;
    const list = await evaluate(page, `
      const pin = /^(Pinned|Fijad[oa])$/i;
      return Array.from(document.querySelectorAll('div[data-pressable-container="true"]')).map((c) => {
        const time = c.querySelector('time');
        const href = time && time.closest('a') ? time.closest('a').getAttribute('href') : '';
        const m = href.match(/^\\/@([^/]+)\\/post\\/([^/?]+)/);
        if (!m) return null;
        const pinned = Array.from(c.querySelectorAll('svg')).some((s) => pin.test(s.getAttribute('aria-label') || (s.querySelector('title') || {}).textContent || '')) || c.innerText.slice(0, 200).split('\\n').some((l) => pin.test(l.trim()));
        return { id: m[2], url: 'https://www.threads.com' + href.split('?')[0], at: time.getAttribute('datetime'), pinned, repost: m[1].toLowerCase() !== arg.toLowerCase() };
      }).filter(Boolean);`, task.author.handle);
    const p = newest(list, since);
    return p && { id: p.id, url: p.url };
  },
  async reply(page, task) {
    const main = await this.post(page, task);
    const open = async () => { await click(button(main, SAYS.reply).first()); return page.locator('[role="dialog"]'); };
    let dialog = await open();
    let extras = null;
    if (task.extras || task.imageFile) ({ dialog, extras } = await thExtras(page, dialog, task, open));
    await type(page, await need(dialog.locator('[contenteditable="true"]'), "The reply box"), task.draft);
    await click(await need(dialog.getByRole("button", { name: /^(Post|Publicar)$/ }), "Post"));
    await dialog.first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => { throw new Error("The reply did not send."); });
    return Object.assign({ url: task.url }, extras && Object.keys(extras).length ? { extras } : {});
  },
  // The Replies tab of the activity page: its first rows come in the page's own JSON, the next ones from its GraphQL.
  async inbox(page) {
    const got = [];
    const on = async (r) => {
      if (!/\/(api\/graphql|graphql\/query)/.test(r.url())) return;
      const t = await r.text().catch(() => "");
      if (t.includes("XTHNotificationFeedRow")) try { got.push(JSON.parse(t)); } catch (error) { /* not JSON */ }
    };
    page.on("response", on);
    try { await go(page, this, "https://www.threads.com/activity/replies"); await pause(3000, 5000); await scroll(page, 1); } finally { page.off("response", on); }
    const embedded = await page.evaluate(() => Array.from(document.querySelectorAll('script[type="application/json"]')).map((s) => s.textContent).filter((t) => t.includes("XTHNotificationFeedRow")));
    embedded.forEach((t) => { try { got.push(JSON.parse(t)); } catch (error) { /* not JSON */ } });
    return Inbox.threads(got, this.account);
  }
};

/** Every Instagram media item in a JSON response, by its code. */
function igMedia(o, into) {
  if (!o || typeof o !== "object") return into;
  if (o.code && o.taken_at && o.user && o.user.username) { into.set(o.code, o); return into; }
  Object.values(o).forEach((v) => igMedia(v, into));
  return into;
}

const instagram = {
  name: "Instagram", account: "qaurlreview", home: "https://www.instagram.com/",
  queries: ["webaccessibility", "accessibility", "seo", "technicalseo", "softwaretesting", "qatesting", "webperformance", "webdevelopment", "wcag", "testautomation", "a11y", "googleanalytics"],
  async signedIn(page) {
    if (!(await visible(page.locator(icon(SAYS.home)), 15000))) return "";
    // This endpoint sometimes answers with an HTML page that still carries the username.
    const me = await page.evaluate(() => fetch("/api/v1/accounts/current_user/?edit=true", { headers: { "x-ig-app-id": "936619743392459" }, credentials: "include" })
      .then((r) => (r.ok ? r.text() : "")).then((t) => (t.match(/"username":"([^"]+)"/) || [])[1] || "", () => ""));
    return me ? "@" + me : "Instagram";
  },
  // The posts Instagram's own keyword search page loads through its GraphQL calls. A one-word query is a hashtag;
  // a domain or a name with spaces (a reviewed site, #2467) is searched as typed.
  async read(page, tag) {
    if (!page.url().startsWith("https://www.instagram.com/")) await go(page, this, this.home);
    const found = new Map();
    const on = async (r) => {
      if (!/\/(api\/graphql|graphql\/query)/.test(r.url())) return;
      igMedia(await r.json().catch(() => null), found);
    };
    page.on("response", on);
    try { await go(page, this, "https://www.instagram.com/explore/search/keyword/?q=" + enc(/^[\p{L}\p{N}_]+$/u.test(tag) ? "#" + tag : tag)); await pause(4000, 6000); await scroll(page, 2); } finally { page.off("response", on); }
    return Array.from(found.values()).map((m) => ({
      network: "instagram", id: String(m.pk || m.id || m.code), url: "https://www.instagram.com/p/" + m.code + "/",
      author: { handle: m.user.username, name: m.user.full_name || m.user.username, id: String(m.user.pk || m.user.id || "") },
      text: (m.caption && m.caption.text) || "", createdAt: new Date(m.taken_at * 1000).toISOString(),
      metrics: { likes: m.like_count || 0, replies: m.comment_count || 0, reposts: 0, views: m.play_count || m.view_count || 0 }
    }));
  },
  async like(page, task) {
    await go(page, this, task.url);
    if (await visible(page.locator(icon(SAYS.unlike, '[height="24"]')), 6000)) return {};
    await click(await need(button(page.locator("body"), SAYS.like, '[height="24"]'), "Like"));
    return {};
  },
  async follow(page, task) {
    await go(page, this, task.url);
    const header = page.locator("header");
    if (await visible(header.getByText(/^(Following|Siguiendo)$/), 6000)) return {};
    await click(await need(header.getByRole("button", { name: /^(Follow|Seguir)$/ }), "Follow"));
    return {};
  },
  // The post's first comments arrive in the page's own JSON; ours is one whose user is our account.
  async replied(page, task) {
    await go(page, this, task.url);
    const mine = await evaluate(page, `
      const re = new RegExp('"user":\\\\{[^{}]*"username":"' + arg.me + '"');
      return Array.from(document.querySelectorAll('script[type="application/json"]')).some((s) => s.textContent.includes('comments__connection') && re.test(s.textContent));`, { me: this.account });
    return mine ? { url: task.url } : null;
  },
  // An owner's newest post, from the media their profile loads (in its own JSON and its GraphQL calls); a pinned item
  // names who pinned it, a collab another account's is not theirs.
  async latest(page, task, since) {
    const found = new Map();
    const on = async (r) => {
      if (!/\/(api\/graphql|graphql\/query|api\/v1\/feed\/user)/.test(r.url())) return;
      igMedia(await r.json().catch(() => null), found);
    };
    page.on("response", on);
    try { await go(page, this, task.url); await pause(3000, 5000); await scroll(page, 1); } finally { page.off("response", on); }
    const embedded = await page.evaluate(() => Array.from(document.querySelectorAll('script[type="application/json"]')).map((s) => s.textContent).filter((t) => t.includes('"taken_at"')));
    embedded.forEach((t) => { try { igMedia(JSON.parse(t), found); } catch (error) { /* not JSON */ } });
    const me = String(task.author.handle).toLowerCase();
    const p = newest(Array.from(found.values()).map((m) => ({
      url: "https://www.instagram.com/p/" + m.code + "/", at: new Date(m.taken_at * 1000).toISOString(),
      pinned: (m.timeline_pinned_user_ids || []).length > 0 || m.is_pinned === true, repost: String(m.user.username).toLowerCase() !== me
    })), since);
    return p && { id: p.url, url: p.url };
  },
  async reply(page, task) {
    await go(page, this, task.url);
    const box = await need(page.locator('textarea[aria-label^="Add a comment"], textarea[aria-label^="Añade un comentario"]'), "The comment box");
    await type(page, box, task.draft);
    await click(await need(page.getByRole("button", { name: /^(Post|Publicar)$/ }), "Post"));
    await pause(3000, 5000);
    if ((await box.inputValue().catch(() => "")).trim()) throw new Error("The comment did not send.");
    return { url: task.url };
  },
  async inbox(page) {
    if (!page.url().startsWith("https://www.instagram.com/")) await go(page, this, this.home);
    const j = await page.evaluate(() => fetch("/api/v1/news/inbox/", { headers: { "x-ig-app-id": "936619743392459" }, credentials: "include" }).then((r) => (r.ok ? r.json() : null), () => null).catch(() => null));
    if (!j) throw new Error("Instagram's activity feed did not answer.");
    return Inbox.instagram(j, this.account);
  },
  // A comment's own link (/p/<code>/c/<id>/) opens the post with that comment; its row holds the small heart.
  async comment(page, task) {
    await go(page, this, task.url);
    return commentBox(page, `const a = document.querySelector('a[href*="/c/' + arg.id + '/"]'); let b = a;
      while (b && !b.querySelector('svg[height="16"]')) b = b.parentElement; return b;`, { id: task.id });
  },
  async likeComment(page, task) {
    const box = await this.comment(page, task);
    if (await has(box.locator(icon(SAYS.unlike, '[height="16"]')))) return {};
    await click(await need(button(box, SAYS.like, '[height="16"]'), "The comment's like"));
    if (!(await visible(box.locator(icon(SAYS.unlike, '[height="16"]')), 6000))) throw new Error("The like did not stick.");
    return {};
  },
  async replyComment(page, task) {
    const box = await this.comment(page, task);
    await click(await need(box.getByRole("button", { name: /^(Reply|Responder)$/ }).or(box.getByText(/^(Reply|Responder)$/)), "The comment's Reply"));
    const input = await need(page.locator('textarea[aria-label^="Add a comment"], textarea[aria-label^="Añade un comentario"]'), "The comment box");
    await type(page, input, task.draft, true);
    await click(await need(page.getByRole("button", { name: /^(Post|Publicar)$/ }), "Post"));
    await pause(3000, 5000);
    if ((await input.inputValue().catch(() => "")).includes(String(task.draft).slice(0, 20))) throw new Error("The reply did not send.");
    return { url: task.url };
  }
};

const TT_MENU = '[data-e2e="comment-at-user"], [data-e2e^="comment-at-list"] > div, [data-e2e^="comment-at"] [role="option"], [role="listbox"] [role="option"]';

const tiktok = {
  name: "TikTok", account: "qalaburlreview", home: "https://www.tiktok.com/",
  queries: ["seo tips", "web accessibility", "software testing", "qa tester", "website speed", "google analytics 4", "playwright testing", "technical seo"],
  async signedIn(page) {
    if (await visible(page.locator('[data-e2e="top-login-button"]'), 6000)) return "";
    const me = page.locator('a[data-e2e="nav-profile"]');
    if (!(await visible(me, 10000)) || await has(page.locator('[data-e2e="top-login-button"]'))) return "";
    const handle = String(await me.first().getAttribute("href")).replace(/^.*\/@/, "").split(/[/?]/)[0];
    return handle ? "@" + handle : "";
  },
  // TikTok's search page loads its results as JSON; the agent keeps what the page itself asked for.
  async read(page, q) {
    const items = [];
    const on = async (r) => {
      if (!/\/api\/search\/(general|item)\/full/.test(r.url())) return;
      const j = await r.json().catch(() => null);
      ((j && (j.item_list || (j.data || []).map((d) => d.item))) || []).filter(Boolean).forEach((it) => items.push(it));
    };
    page.on("response", on);
    try { await go(page, this, "https://www.tiktok.com/search/video?q=" + enc(q)); await pause(4000, 6000); await scroll(page, 2); } finally { page.off("response", on); }
    return items.filter((it) => it.id && it.author).map((it) => ({
      network: "tiktok", id: String(it.id), url: "https://www.tiktok.com/@" + it.author.uniqueId + "/video/" + it.id,
      author: { handle: it.author.uniqueId, name: it.author.nickname || it.author.uniqueId, id: String(it.author.id || ""), followers: (it.authorStats || {}).followerCount || 0 },
      text: it.desc || "", lang: it.textLanguage || "", createdAt: it.createTime ? new Date(it.createTime * 1000).toISOString() : "",
      metrics: { likes: (it.stats || {}).diggCount || 0, replies: (it.stats || {}).commentCount || 0, reposts: (it.stats || {}).shareCount || 0, views: (it.stats || {}).playCount || 0 },
      tags: (it.textExtra || []).map((t) => t.hashtagName).filter(Boolean)
    }));
  },
  async like(page, task) {
    await go(page, this, task.url);
    const btn = await need(page.locator('button:has([data-e2e="like-icon"]), [role="button"]:has([data-e2e="like-icon"])'), "Like");
    if ((await btn.getAttribute("aria-pressed")) === "true") return {};
    await click(btn);
    return {};
  },
  async follow(page, task) {
    await go(page, this, task.url);
    const btn = await need(page.locator('[data-e2e="follow-button"], [data-e2e="browse-follow"]'), "Follow");
    if (!/^\s*follow\s*$/i.test(await btn.innerText().catch(() => ""))) return {};
    await click(btn);
    return {};
  },
  // The comments the video page loads when its comment panel opens; ours is one by our account.
  async replied(page, task) {
    const comments = [];
    const on = async (r) => {
      if (!r.url().includes("/api/comment/list/")) return;
      const j = await r.json().catch(() => null);
      if (j && Array.isArray(j.comments)) comments.push(...j.comments);
    };
    page.on("response", on);
    try {
      await go(page, this, task.url);
      const icon = page.locator('[data-e2e="comment-icon"]');
      if (await has(icon)) await click(icon.first());
      await pause(3000, 5000);
    } finally { page.off("response", on); }
    return comments.some((c) => String((c.user || {}).unique_id || "").toLowerCase() === this.account) ? { url: task.url } : null;
  },
  // An owner's newest video, from the list their profile page loads, which marks the pinned ones.
  async latest(page, task, since) {
    const items = [];
    const on = async (r) => {
      if (!/\/api\/(post|creator)\/item_list\//.test(r.url())) return;
      const j = await r.json().catch(() => null);
      ((j && (j.itemList || j.item_list)) || []).filter(Boolean).forEach((it) => items.push(it));
    };
    page.on("response", on);
    try { await go(page, this, task.url); await pause(4000, 6000); await scroll(page, 1); } finally { page.off("response", on); }
    const me = String(task.author.handle).toLowerCase();
    const p = newest(items.filter((it) => it.id).map((it) => {
      const who = String((it.author || {}).uniqueId || me);
      return { url: "https://www.tiktok.com/@" + who + "/video/" + it.id, at: it.createTime ? new Date(it.createTime * 1000).toISOString() : "", pinned: it.isPinnedItem === true, repost: who.toLowerCase() !== me };
    }), since);
    return p && { id: p.url, url: p.url };
  },
  // Mentions (#2637) are picked from the list that opens on "@", by handle.
  async reply(page, task) {
    await go(page, this, task.url);
    const icon = page.locator('[data-e2e="comment-icon"]');
    if (await has(icon)) await click(icon.first());
    const box = await need(page.locator('[data-e2e="comment-input"] [contenteditable="true"], div[contenteditable="true"][data-e2e="comment-text"]'), "The comment box");
    let mentions = null;
    if ((task.mentions || []).length) mentions = await typeMentions(page, box, task.draft, task.mentions, TT_MENU, (m) => m.handle);
    else await type(page, box, task.draft);
    await click(await need(page.locator('[data-e2e="comment-post"]'), "Post"));
    await pause(3000, 5000);
    return Object.assign({ url: task.url }, mentions ? { mentions } : {});
  },
  // The activity panel loads its notices as JSON: all activity first, then the Comments tab. Its tabs count as
  // hidden to Playwright while the panel slides in, so they get a plain DOM click.
  async inbox(page) {
    const got = [];
    const on = async (r) => {
      if (!r.url().includes("/api/notice/multi/")) return;
      const j = await r.json().catch(() => null);
      if (j) got.push(j);
    };
    page.on("response", on);
    try {
      if (!page.url().startsWith("https://www.tiktok.com/")) await go(page, this, this.home);
      await click(await need(page.locator('[data-e2e="nav-activity"]'), "Activity"));
      await pause(2500, 4000);
      await page.locator('button[data-e2e="comments"]').first().dispatchEvent("click").catch(() => null);
      await pause(3000, 5000);
    } finally { page.off("response", on); }
    return got.flatMap((j) => Inbox.tiktok(j, this.account)).filter((c, i, all) => all.findIndex((d) => d.id === c.id) === i);
  },
  // The video's comment panel; the comment is the one whose text starts as the task's does.
  async comment(page, task) {
    await go(page, this, task.url);
    const open = page.locator('[data-e2e="comment-icon"]');
    if (await has(open)) await click(open.first());
    await pause(2000, 3500);
    return commentBox(page, `const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim(); const want = norm(arg.text).slice(0, 30);
      const t = want && Array.from(document.querySelectorAll('[data-e2e^="comment-level"]')).find((e) => norm(e.innerText).startsWith(want));
      let b = t; while (b && !b.querySelector('[data-key-interaction="comment_like"]')) b = b.parentElement; return b || null;`, { text: task.text });
  },
  async likeComment(page, task) {
    const box = await this.comment(page, task);
    const btn = await need(box.locator('[data-key-interaction="comment_like"][role="button"]'), "The comment's like");
    if ((await btn.getAttribute("aria-pressed")) === "true") return {};
    await click(btn);
    if ((await btn.getAttribute("aria-pressed")) !== "true") throw new Error("The like did not stick.");
    return {};
  },
  async replyComment(page, task) {
    const box = await this.comment(page, task);
    await click(await need(box.locator('[data-e2e="comment-reply-1"]'), "The comment's Reply"));
    const input = await need(page.locator('[data-e2e="comment-input"] [contenteditable="true"]').last(), "The reply box");
    await type(page, input, task.draft, true);
    await click(await need(page.locator('[data-e2e="comment-post"]').last(), "Post"));
    await sent(input, task.draft);
    return { url: task.url };
  }
};

// LinkedIn's search page renders server-driven markup with no post ids in it, so the agent reads through the
// signed-in session's own Voyager API. The query id is LinkedIn's; when it rotates, `check linkedin --read` fails here.
const LI_SEARCH = "voyagerSearchDashClusters.ef3d0937fb65bd7812e32e5a85028e79";
const LI_NOTICES = "voyagerOrganizationDashNotificationCards.1752a459d1c9560beeca963a0d1e5fde";
const LI_API = "const csrf = (document.cookie.match(/JSESSIONID=\"?([^\";]+)/) || [])[1] || ''; const api = (path) => fetch(path, { credentials: 'include', headers: { 'csrf-token': csrf, accept: 'application/vnd.linkedin.normalized+json+2.1', 'x-restli-protocol-version': '2.0.0' } });";
// LinkedIn sometimes renders without its data-view-name hooks, so the agent goes by accessibility labels.
const LI_LIKE = 'button[aria-label^="Estado del botón de reacción"], button[aria-label^="Reaction button state"]';
const LI_PAGE = 'input[type="radio"][aria-label*="QA-lab" i], [role="radio"][aria-label*="QA-lab" i]';
// The reactions menu opens on hovering the reaction button. Its buttons are labelled with the reaction's name, in the
// Spanish our account uses (Recomendar, Celebrar, Apoyar, Encantar, Interesar, Hacer gracia) or in English.
const LI_REACT = {
  celebrate: ["Celebrate", "Celebrar"], support: ["Support", "Apoyar"], love: ["Love", "Encantar"],
  insightful: ["Insightful", "Interesar"], funny: ["Funny", "Hacer gracia"]
};
const liReact = (names) => new RegExp("(^|\\s)(" + names.join("|") + ")$", "i");
// Group search results and a group's page (#3138). Counts read "12K members", "1.234 miembros"; a group asking for
// approval shows Requested once joined.
const LI_MEMBERS = "const members = (t) => { const m = String(t || '').replace(/(\\d)[.,](?=\\d{3}\\b)/g, '$1').match(/([\\d.,]+\\s*[KkMm]?)\\s*(members|miembros|membros|Mitglieder|membres|membri)/i); return m ? num(m[1]) : 0; };";
const LI_GROUP_CARDS = LI_MEMBERS + `
  const seen = {};
  return Array.from(document.querySelectorAll('main a[href*="/groups/"]')).map((a) => {
    const id = (String(a.href).match(/\\/groups\\/(\\d{3,12})(?:\\/|$|\\?)/) || [])[1];
    const name = String(a.innerText || '').split('\\n')[0].trim();
    if (!id || !name || seen[id]) return null;
    seen[id] = 1;
    const card = a.closest('li') || a.parentElement;
    const text = String((card && card.innerText) || '').replace(/\\s+/g, ' ').trim();
    return { network: 'linkedin', id, name, url: 'https://www.linkedin.com/groups/' + id + '/', members: members(text), lang: '', about: text.replace(name, '').trim().slice(0, 400),
      kind: 'group', member: /\\b(Joined|Unido|Membro|Mitglied|Membre|Iscritto)\\b/i.test(text), open: true };
  }).filter(Boolean);`;
const LI_GROUP_ABOUT = LI_MEMBERS + `
  const main = document.querySelector('main') || document.body;
  const heads = Array.from(main.querySelectorAll('h2, h3')).filter((h) => /^(About|Acerca|Sobre|Info|À propos|Informazioni|Rules|Group rules|Reglas|Regras|Regeln|Règles|Regole)/i.test(h.innerText.trim()));
  const rules = heads.map((h) => String((h.closest('section') || h.parentElement).innerText || '')).join('\\n').trim() || String(main.innerText || '').slice(0, 2000);
  return { members: members(main.innerText), rules: rules.replace(/[ \\t]+/g, ' ').slice(0, 2000) };`;
const LI_START = /(Start a post|Comenzar una publicación|Crear publicación|Começar uma publicação|Beitrag beginnen|Commencer un post|Inizia un post)/i;
const LI_JOIN = /^\s*(Join|Unirse|Participar|Entrar|Beitreten|Rejoindre|Iscriviti|Partecipa)\s*$/i;
const LI_ASKED = /^\s*(Requested|Request sent|Solicitad[oa]|Pendiente|Solicitação enviada|Angefragt|Demandé|Demande envoyée|Richiesta inviata)\s*$/i;

const linkedin = {
  name: "LinkedIn", home: "https://www.linkedin.com/feed/", queries: GENERAL,
  async signedIn(page) {
    if (!(await page.context().cookies("https://www.linkedin.com")).some((c) => c.name === "li_at" && c.value)) return "";
    const me = await evaluate(page, LI_API + `
      return api('/voyager/api/me').then(async (r) => {
        if (!r.ok) return '';
        const p = ((await r.json()).included || []).find((e) => e.firstName) || {};
        return [p.firstName, p.lastName].filter(Boolean).join(' ');
      }, () => '');`);
    return me ? me + ", acting as the QA-lab URL Review page (company " + PAGES.linkedin + ")" : "";
  },
  // The post's identity dialog lists Carlos and every page he admins; the agent picks QA-lab or does nothing. Its
  // opener is the unlabelled avatar link just before the like button.
  async asPage(page, scope) {
    const open = scope.locator(LI_LIKE).first().locator("xpath=preceding::a[1]");
    if (!(await visible(open, 8000))) throw new Error("LinkedIn offered no way to act as the QA-lab page on this post.");
    await click(open);
    const radio = page.locator(LI_PAGE).first();
    if (!(await radio.waitFor({ state: "attached", timeout: 10000 }).then(() => true, () => false))) throw new Error("The QA-lab page was not in LinkedIn's identity dialog.");
    if (!(await radio.isChecked())) {
      const label = page.locator('label[for="' + (await radio.getAttribute("id")) + '"]');
      const name = page.locator('dialog[open], [role="dialog"]').getByText("QA-lab URL Review", { exact: true });
      if (await visible(label, 1500)) await click(label.first());
      else if (await visible(name, 1500)) await click(name.first());
      else await radio.dispatchEvent("click");
    }
    if (!(await radio.isChecked())) throw new Error("LinkedIn did not select the QA-lab page.");
    const save = page.getByRole("button", { name: /^(Guardar|Save)$/ });
    if (await save.isEnabled().catch(() => false)) await click(save);
    else await click(page.getByRole("button", { name: /^(Cancelar|Cancel)$/ }));
    await radio.waitFor({ state: "detached", timeout: 10000 }).catch(() => { throw new Error("LinkedIn's identity dialog did not close."); });
    await pause(1500, 2500);
  },
  async read(page, q) {
    if (!page.url().startsWith("https://www.linkedin.com/")) await go(page, this, this.home);
    const out = await evaluate(page, LI_API + `
      const vars = '(start:0,origin:FACETED_SEARCH,query:(keywords:' + encodeURIComponent(arg.q.replace(/[(),:]/g, ' ')) + ',flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:datePosted,value:List(past-24h)),(key:resultType,value:List(CONTENT))),includeFiltersInResponse:false))';
      return api('/voyager/api/graphql?variables=' + vars + '&queryId=' + arg.id).then(async (r) => {
        if (!r.ok) return { error: 'LinkedIn search answered ' + r.status };
        const inc = (await r.json()).included || [];
        const by = {};
        inc.forEach((e) => { if (e.entityUrn) by[e.entityUrn] = e; });
        return { posts: inc.filter((u) => /feed\\.Update$/.test(u.$type) && /^urn:li:activity:\\d+$/.test((u.metadata || {}).backendUrn || '')).map((u) => {
          const urn = u.metadata.backendUrn, a = u.actor || {};
          const href = String((a.navigationContext || {}).actionTarget || '').split('?')[0];
          const handle = (href.match(/linkedin\\.com\\/(?:in|company)\\/([^/]+)/) || [])[1] || '';
          const counts = by[(by[u['*socialDetail']] || {})['*totalSocialActivityCounts']] || {};
          return { network: 'linkedin', id: urn, url: 'https://www.linkedin.com/feed/update/' + urn + '/', author: { handle, name: ((a.name || {}).text || handle).trim(), id: href },
            text: ((u.commentary || {}).text || {}).text || '', createdAt: new Date(Number(BigInt(urn.split(':').pop()) >> 22n)).toISOString(),
            metrics: { likes: counts.numLikes || 0, replies: counts.numComments || 0, reposts: counts.numShares || 0, views: counts.numImpressions || 0 } };
        }).filter((p) => p.text) };
      }, (e) => ({ error: 'LinkedIn search failed: ' + e.message }));`, { q, id: LI_SEARCH });
    if (out.error) throw new Error(out.error);
    return out.posts;
  },
  async post(page, task) {
    await go(page, this, task.url);
    const main = page.locator("main").first();
    if (!(await visible(main.locator(LI_LIKE), 20000))) throw new Error("LinkedIn did not show the post.");
    return main;
  },
  // task.reaction (functions/engagement-mac.js) picks Celebrate, Support, Love, Insightful or Funny from the menu;
  // when the menu does not open or does not name it, the post gets a plain Like.
  async like(page, task) {
    const main = await this.post(page, task);
    await this.asPage(page, main);
    const btn = await need(main.locator(LI_LIKE), "Like");
    const none = /ninguna reacci|no reaction/i;
    if (!none.test((await btn.getAttribute("aria-label")) || "")) return {};
    let reaction = "like";
    if (LI_REACT[task.reaction]) {
      await btn.scrollIntoViewIfNeeded().catch(() => null);
      await pause(400, 1000);
      await btn.hover({ timeout: 10000 });
      const pick = page.getByRole("button", { name: liReact(LI_REACT[task.reaction]) });
      if (await visible(pick, 5000)) {
        await click(pick.first());
        reaction = task.reaction;
      }
    }
    if (reaction === "like") await click(btn);
    if (none.test((await btn.getAttribute("aria-label")) || "")) throw new Error("LinkedIn did not take the " + reaction + " reaction.");
    return { reaction };
  },
  // A comment component on the post whose author link is our company page.
  async replied(page, task) {
    const main = await this.post(page, task);
    const mine = main.locator('[componentkey^="CommentComponentReference_urn:li:comment:("]').filter({ has: page.locator('a[href*="/company/qalab-url-review/"], a[href*="/company/' + PAGES.linkedin + '/"]') });
    return (await has(mine)) ? { url: task.url } : null;
  },
  // An owner's newest post on their company page's posts or a member's activity; the header says pinned or reposted.
  // Without the activity urns on the page it finds none, rather than answer someone else's post.
  async latest(page, task, since) {
    const h = String(task.author.handle);
    await go(page, this, "https://www.linkedin.com/" + h + (h.startsWith("in/") ? "/recent-activity/all/" : "/posts/?feedView=all"));
    await pause(3000, 5000);
    await scroll(page, 1);
    const list = await evaluate(page, `
      return Array.from(document.querySelectorAll('[data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]')).map((e) => {
        const head = String(e.innerText || '').slice(0, 300);
        return { urn: e.getAttribute('data-urn') || e.getAttribute('data-id'), pinned: /\\b(Pinned|Fijad[oa]|Destacad[oa]|Anclad[oa])\\b/i.test(head),
          repost: /(reposted this|ha compartido esto|ha republicado|republicó esto|compartió esto)/i.test(head) };
      });`);
    const p = newest(list.map((x) => ({ url: "https://www.linkedin.com/feed/update/" + x.urn + "/", at: liAt(x.urn), pinned: x.pinned, repost: x.repost })), since);
    return p && { id: p.url, url: p.url };
  },
  // Mentions (#2637) are picked from the menu that opens on "@", by the company's or member's name.
  async reply(page, task) {
    const tags = (task.mentions || []).length ? await named(page, this, task.mentions, (m) => "https://www.linkedin.com/" + m.handle + "/") : null;
    const main = await this.post(page, task);
    if (task.as !== "self") await this.asPage(page, main);
    const box = main.locator('[contenteditable="true"][aria-label*="coment" i], [contenteditable="true"][aria-label*="comment" i]');
    if (!(await visible(box, 4000))) await click(await need(main.locator('button[aria-label="Comentar"], button[aria-label="Comment"]'), "Comment"));
    let mentions = null;
    if (tags) mentions = await typeMentions(page, await need(box, "The comment box"), task.draft, tags, MENU, (m) => m.name || String(m.handle).split("/").pop().replace(/-/g, " "));
    else await type(page, await need(box, "The comment box"), task.draft);
    await click(await need(main.locator("button:not([aria-label])").filter({ hasText: /^\s*(Comentar|Comment|Publicar|Post)\s*$/ }), "Post"));
    await pause(3000, 5000);
    return Object.assign({ url: task.url }, mentions ? { mentions } : {});
  },
  // The page's notifications (the admin view's own query): comments on our posts and replies to our comments.
  async inbox(page) {
    if (!page.url().startsWith("https://www.linkedin.com/")) await go(page, this, this.home);
    const out = await evaluate(page, LI_API + `
      const vars = '(count:20,organization:urn%3Ali%3Afsd_company%3A' + arg.company + ',secondaryPaginationStart:0,start:0,types:List())';
      return api('/voyager/api/graphql?includeWebMetadata=true&variables=' + vars + '&queryId=' + arg.id).then(async (r) => (r.ok ? { json: await r.json() } : { error: 'LinkedIn notifications answered ' + r.status }), (e) => ({ error: 'LinkedIn notifications failed: ' + e.message }));`,
    { company: PAGES.linkedin, id: LI_NOTICES });
    if (out.error) throw new Error(out.error);
    return Inbox.linkedin(out.json, PAGES.linkedin);
  },
  // The comment's link carries actorCompanyId, so the post opens acting as the page; the comment is its replaceableComment.
  async comment(page, task) {
    await go(page, this, task.url);
    const box = page.locator('[componentkey="replaceableComment_' + task.id + '"]');
    if (!(await visible(box, 20000))) throw new Error("LinkedIn did not show the comment.");
    if (!(await page.locator('[data-placeholder*="como QA-lab" i], [data-placeholder*="as QA-lab" i]').first().waitFor({ state: "attached", timeout: 8000 }).then(() => true, () => false))) throw new Error("LinkedIn is not acting as the QA-lab page here.");
    return box.first();
  },
  async likeComment(page, task) {
    const box = await this.comment(page, task);
    const btn = await need(box.locator('[data-view-name="comment-reaction-button"]'), "The comment's like");
    const liked = async () => !(await has(btn.locator('svg[id*="outline"]')));
    if (await liked()) return {};
    await click(btn);
    if (!(await liked())) throw new Error("LinkedIn did not take the like.");
    return {};
  },
  async replyComment(page, task) {
    const box = await this.comment(page, task);
    await click(await need(box.locator('button[data-view-name="comment-reply"]'), "The comment's Reply"));
    const form = page.locator("div").filter({ has: page.locator('button[data-view-name="comment-reply-post"]') }).filter({ has: page.locator('[contenteditable="true"]') }).last();
    const input = await need(form.locator('[contenteditable="true"]'), "The reply box");
    await type(page, input, task.draft, true);
    await click(await need(form.locator('button[data-view-name="comment-reply-post"]'), "Reply"));
    await sent(input, task.draft);
    return { url: task.url };
  },
  // Groups a keyword search finds (#3138), for joins (functions/engagement-joins.js). Only a member joins a group, not
  // a company page: these run in Carlos's personal session, and the group's rules come back with the join.
  async groups(page, q) {
    await go(page, this, "https://www.linkedin.com/search/results/groups/?keywords=" + enc(q));
    await pause(2500, 4500);
    await scroll(page, 1);
    return evaluate(page, LI_GROUP_CARDS);
  },
  async join(page, task) {
    await go(page, this, "https://www.linkedin.com/groups/" + enc(task.id) + "/");
    await pause(2500, 4000);
    const main = page.locator("main").first();
    if (!(await visible(main, 20000))) throw new Error("LinkedIn did not show the group.");
    const about = await evaluate(page, LI_GROUP_ABOUT);
    const join = main.getByRole("button", { name: LI_JOIN });
    const asked = main.getByRole("button", { name: LI_ASKED });
    if (await visible(asked, 1500)) return { already: false, pending: true, members: about.members, rules: about.rules };
    if (!(await visible(join, 6000))) return { already: true, members: about.members, rules: about.rules };
    await click(join.first());
    await pause(2500, 4000);
    if (await visible(asked, 6000)) return { pending: true, members: about.members, rules: about.rules };
    await join.first().waitFor({ state: "hidden", timeout: 12000 }).catch(() => { throw new Error("The join did not stick."); });
    return { members: about.members, rules: about.rules };
  },
  // A student community post (#3138) in a group Carlos joined, as himself: title, a blank line, the body.
  async publish(page, task) {
    await go(page, this, task.url);
    const main = page.locator("main").first();
    await click(await need(main.getByRole("button", { name: LI_START }).or(main.getByText(LI_START)), "Start a post"));
    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('[contenteditable="true"]') }).last();
    await type(page, await need(dialog.locator('[contenteditable="true"]'), "The post box"), [task.title, task.draft].filter(Boolean).join("\n\n"));
    await click(await need(dialog.getByRole("button", { name: /^\s*(Post|Publicar|Publier|Posten|Veröffentlichen|Pubblica)\s*$/i }), "Post"));
    await dialog.waitFor({ state: "hidden", timeout: 20000 }).catch(() => { throw new Error("LinkedIn did not take the post."); });
    return { url: task.url };
  },
  // A student invite (#3138) from Carlos's profile: Message on theirs, typed and sent. Members outside his network
  // without open messages have no Message button, so it fails rather than buy InMail.
  async dm(page, task) {
    await go(page, this, "https://www.linkedin.com/" + String(task.to).replace(/^\/+/, "") + "/");
    const main = page.locator("main").first();
    await click(await need(main.getByRole("button", { name: /^\s*(Message|Enviar mensaje|Mensaje|Mensagem|Nachricht|Message privé|Messaggio)\b/i }), "Message"));
    const form = page.locator(".msg-form, form").filter({ has: page.locator('[contenteditable="true"]') }).last();
    const input = await need(form.locator('[contenteditable="true"]'), "The message box");
    await type(page, input, task.draft);
    await click(await need(form.getByRole("button", { name: /^\s*(Send|Enviar|Senden|Envoyer|Invia)\s*$/i }), "Send"));
    await sent(input, task.draft);
    return { url: page.url() };
  }
};

// A Facebook comment is the innermost article holding a link whose last comment id is the comment's (a reply's links
// carry its parent's comment_id too). FB_READ reads the marked one: its own text and like, a reply by our page under
// it, and the post's text.
const FB_OPEN = 4;
const FB_FIND = `const own = (a) => Array.from(a.querySelectorAll('a[href*="comment_id="]')).some((l) => { try { const u = new URL(l.href); return (u.searchParams.get('reply_comment_id') || u.searchParams.get('comment_id')) === arg.id; } catch (e) { return false; } });
  const all = Array.from(document.querySelectorAll('div[role="article"]')).filter(own);
  return all.filter((a) => !all.some((b) => b !== a && a.contains(b))).pop() || null;`;
const FB_READ = `const box = document.querySelector('[data-qalab-comment]');
  const nested = Array.from(box.querySelectorAll('div[role="article"]'));
  const mine = (e) => !nested.some((a) => a.contains(e));
  const text = Array.from(box.querySelectorAll('div[dir="auto"]')).filter(mine).filter((d) => !d.querySelector('div[dir="auto"]')).map((d) => d.innerText.trim()).filter(Boolean).join('\\n');
  const liked = Array.from(box.querySelectorAll('[aria-label="Quitar Me gusta"], [aria-label="Remove Like"]')).some(mine);
  let up = box.parentElement;
  for (let i = 0; i < 3 && up && !(up.querySelectorAll('div[role="article"]').length > 1 && up.querySelector('div[role="article"]') === box); i += 1) up = up.parentElement;
  const thread = up && up.querySelector('div[role="article"]') === box ? Array.from(up.querySelectorAll('div[role="article"]')) : nested;
  const answered = thread.some((a) => a !== box && /^(Respuesta de|Reply by) QA-lab/i.test(a.getAttribute('aria-label') || ''));
  const msg = document.querySelector('[data-ad-rendering-role="story_message"], [data-ad-preview="message"], [data-ad-comet-preview="message"]');
  return { text, liked, answered, mine: /^(Comentario de|Respuesta de|Comment by|Reply by) QA-lab/i.test(box.getAttribute('aria-label') || ''), ours: msg ? msg.innerText.trim() : '' };`;

const facebook = {
  name: "Facebook", home: "https://www.facebook.com/", queries: GENERAL,
  // Switched into the page, Facebook keeps the page's id in the i_user cookie and everything acts as the page.
  async asPage(page) { return (await page.context().cookies("https://www.facebook.com")).some((c) => c.name === "i_user" && c.value); },
  async signedIn(page) {
    if (await visible(page.locator('input[name="email"]'), 5000)) return "";
    const me = page.locator('[aria-label="Your profile"], [aria-label="Account controls and settings"], [aria-label="Tu perfil"], [aria-label="Controles y configuración de la cuenta"]');
    if (!(await visible(me, 10000))) return "";
    if (!(await this.asPage(page))) {
      await go(page, this, "https://www.facebook.com/" + PAGES.facebook);
      const sw = page.getByRole("button", { name: /^(Switch( now)?|Cambiar( ahora)?)$/ });
      if (await visible(sw, 8000)) {
        await click(sw.first());
        const ok = page.locator('[role="dialog"]').getByRole("button", { name: /^(Switch|Cambiar)$/ });
        if (await visible(ok, 4000)) await click(ok.first());
        await pause(4000, 6000);
      }
    }
    if (!(await this.asPage(page))) throw new Error("Facebook is signed in but not switched to the " + PAGES.facebook + " page, and offered no Switch button there.");
    return "page " + PAGES.facebook;
  },
  // Search's "Recent posts" filter; Facebook fills a post's permalink only once its timestamp link is hovered.
  async read(page, q) {
    await go(page, this, "https://www.facebook.com/search/posts/?q=" + enc(q) + "&filters=" + enc(Buffer.from(JSON.stringify({ "recent_posts:0": JSON.stringify({ name: "recent_posts", args: "" }) })).toString("base64")));
    await visible(page.locator('div[role="feed"]'), 20000);
    await scroll(page, 2);
    const items = page.locator('div[role="feed"] > div');
    const posts = [];
    for (let i = 0; i < Math.min(await items.count(), 10); i += 1) {
      const it = items.nth(i);
      const links = it.locator('a[role="link"]:not([href*="/hashtag/"])');
      for (let j = 0; j < Math.min(await links.count(), 12); j += 1) await links.nth(j).hover({ timeout: 3000 }).then(() => pause(100, 250), () => null);
      const p = await it.evaluate(new Function("c", NUM + `
        const link = Array.from(c.querySelectorAll('a[href]')).map((a) => a.href).find((h) => /\\/posts\\/|permalink\\.php|story_fbid=|\\/videos\\/|\\/reel\\//.test(h) && !/search\\/posts/.test(h));
        const msg = c.querySelector('[data-ad-rendering-role="story_message"], [data-ad-preview="message"], [data-ad-comet-preview="message"]');
        if (!link || !msg) return null;
        const u = new URL(link);
        const url = u.pathname.includes('permalink.php') ? u.origin + u.pathname + '?story_fbid=' + u.searchParams.get('story_fbid') + '&id=' + (u.searchParams.get('id') || '') : u.origin + u.pathname;
        const h = c.querySelector('h2 a, h3 a, h4 a, strong a');
        const ahref = h ? h.href.split('?')[0] : '';
        const t = c.innerText;
        const pick = (re) => { const m = t.match(re); return m ? num(m[1]) : 0; };
        return { network: 'facebook', id: url, url, author: { handle: (ahref.match(/facebook\\.com\\/([^/?]+)/) || [])[1] || '', name: h ? h.innerText.split('\\n')[0].trim() : '', id: ahref },
          text: msg.innerText.replace(/…\\s*(Ver más|See more)\\s*$/, '').trim(), createdAt: '',
          metrics: { likes: pick(/(?:All reactions|Todas las reacciones):\\s*([\\d.,]+\\s*[KM]?)/i), replies: pick(/([\\d.,]+\\s*[KM]?)\\s+(?:comments?|comentarios?)/i), reposts: pick(/([\\d.,]+\\s*[KM]?)\\s+(?:shares?|veces compartido|compartidos?)/i), views: 0 } };`)).catch(() => null);
      if (p && !posts.some((x) => x.url === p.url)) posts.push(p);
    }
    return posts;
  },
  async like(page, task) {
    await go(page, this, task.url);
    if (!(await this.asPage(page))) throw new Refused("Facebook is not acting as the " + PAGES.facebook + " page.");
    if (await visible(page.locator('[aria-label="Remove Like"], [aria-label="Quitar Me gusta"]'), 6000)) return {};
    await click(await need(page.locator('[aria-label="Like"][role="button"], [aria-label="Me gusta"][role="button"]'), "Like"));
    return {};
  },
  // Comments are articles labelled with their author's name; ours carry the page's name.
  async replied(page, task) {
    await go(page, this, task.url);
    const mine = page.locator(["Comentario de", "Respuesta de", "Comment by", "Reply by"].map((w) => 'div[role="article"][aria-label^="' + w + ' QA-lab"]').join(", "));
    if (!(await visible(mine, 6000))) return null;
    return { url: (await mine.first().locator('a[href*="comment_id="]').first().getAttribute("href", { timeout: 3000 }).catch(() => "")) || task.url };
  },
  // An owner's newest post, from the stories (with their creation time) the page's JSON and GraphQL calls carry.
  async latest(page, task, since) {
    const got = [];
    const on = async (r) => {
      if (!r.url().includes("/api/graphql")) return;
      const t = await r.text().catch(() => "");
      if (t.includes("creation_time")) t.split("\n").forEach((l) => { try { got.push(JSON.parse(l)); } catch (error) { /* not JSON */ } });
    };
    page.on("response", on);
    try { await go(page, this, task.url); await pause(3000, 5000); await scroll(page, 2); } finally { page.off("response", on); }
    const embedded = await page.evaluate(() => Array.from(document.querySelectorAll('script[type="application/json"]')).map((s) => s.textContent).filter((t) => t.includes("creation_time")));
    embedded.forEach((t) => { try { got.push(JSON.parse(t)); } catch (error) { /* not JSON */ } });
    const p = newest(fbStories(got, task.author.handle), since);
    return p && { id: p.url, url: p.url };
  },
  // Mentions (#2637) are picked from the menu that opens on "@", by the page's name.
  async reply(page, task) {
    const tags = (task.mentions || []).length ? await named(page, this, task.mentions, (m) => "https://www.facebook.com/" + enc(m.handle)) : null;
    await go(page, this, task.url);
    if (!(await this.asPage(page))) throw new Refused("Facebook is not acting as the " + PAGES.facebook + " page.");
    const box = await need(page.locator('[contenteditable="true"][role="textbox"][aria-label^="Write a"], [contenteditable="true"][role="textbox"][aria-label^="Comment"], [contenteditable="true"][role="textbox"][aria-label^="Escribe"], [contenteditable="true"][role="textbox"][aria-label^="Comenta"], [contenteditable="true"][role="textbox"]'), "The comment box");
    let mentions = null;
    if (tags) mentions = await typeMentions(page, box, task.draft, tags, MENU, (m) => m.name || m.handle);
    else await type(page, box, task.draft);
    await page.keyboard.press("Enter");
    await pause(3000, 5000);
    return Object.assign({ url: task.url }, mentions ? { mentions } : {});
  },
  // The notifications name the commenter but not what was said, so each unread one in the last week is opened (which
  // marks it read, so the next hour skips it), at most FB_OPEN a run.
  async inbox(page) {
    const got = [];
    const on = async (r) => {
      if (!r.url().includes("/api/graphql")) return;
      const t = await r.text().catch(() => "");
      if (t.includes("notif_type")) t.split("\n").forEach((l) => { try { got.push(JSON.parse(l)); } catch (error) { /* not JSON */ } });
    };
    page.on("response", on);
    try { await go(page, this, "https://www.facebook.com/notifications"); await pause(3000, 5000); } finally { page.off("response", on); }
    if (!(await this.asPage(page))) throw new Refused("Facebook is not acting as the " + PAGES.facebook + " page.");
    const embedded = await page.evaluate(() => Array.from(document.querySelectorAll('script[type="application/json"]')).map((s) => s.textContent).filter((t) => t.includes("notifications_page")));
    embedded.forEach((t) => { try { got.push(JSON.parse(t)); } catch (error) { /* not JSON */ } });
    const since = Date.now() / 1000 - 7 * 86400;
    const out = [];
    for (const n of Inbox.facebook(got).filter((x) => !x.read && x.at > since).slice(0, FB_OPEN)) {
      try {
        const c = await this.readComment(page, n);
        if (c) out.push(c);
      } catch (error) { if (error instanceof Refused) throw error; }
    }
    return out;
  },
  async readComment(page, n) {
    await go(page, this, n.url);
    await commentBox(page, FB_FIND, { id: n.id });
    const r = await evaluate(page, FB_READ);
    if (!r.text || r.mine) return null;
    return {
      network: "facebook", id: n.id, url: Inbox.fbClean(n.url), author: n.author, text: r.text, createdAt: n.at ? new Date(n.at * 1000).toISOString() : "", isReply: true,
      metrics: { likes: 0, replies: 0, reposts: 0, views: 0 }, liked: r.liked, answered: r.answered, on: n.on, ours: r.ours
    };
  },
  async comment(page, task) {
    await go(page, this, task.url);
    if (!(await this.asPage(page))) throw new Refused("Facebook is not acting as the " + PAGES.facebook + " page.");
    return commentBox(page, FB_FIND, { id: task.id });
  },
  async likeComment(page, task) {
    const box = await this.comment(page, task);
    if ((await evaluate(page, FB_READ)).liked) return {};
    await click(await need(box.locator('[role="button"][aria-label="Me gusta"], [role="button"][aria-label="Like"]'), "The comment's like"));
    if (!(await evaluate(page, FB_READ)).liked) throw new Error("The like did not stick.");
    return {};
  },
  async replyComment(page, task) {
    const box = await this.comment(page, task);
    await click(await need(box.locator('[role="button"]').filter({ hasText: /^(Responder|Reply)$/ }), "The comment's Reply"));
    const input = await need(page.locator('[contenteditable="true"][role="textbox"][aria-label^="Responde a "], [contenteditable="true"][role="textbox"][aria-label^="Reply to "]').last(), "The reply box");
    await type(page, input, task.draft, true);
    await page.keyboard.press("Enter");
    await sent(input, task.draft);
    return { url: task.url };
  }
};

// --- Reddit (#2614) ------------------------------------------------------------------------------------------------
// www.reddit.com as Carlos's account. old.reddit.com no longer takes this session (it sends every page to
// /login?reason=lor2), and www's own JSON listings answer 403. What works is the API the site itself calls,
// oauth.reddit.com with the session's token_v2 cookie, for listings, subreddit search, about pages, votes, comments,
// subscriptions and crossposts. Post search, /api/info and /comments are blocked there too, so topic searches read
// www's search page and our earlier comments are read off the post page.
const RD = "https://www.reddit.com";
const RD_API = "https://oauth.reddit.com";
const RD_OWN = "qalablivereports";
const RD_SUBS = ["QualityAssurance", "softwaretesting", "Playwright", "Cypress", "selenium", "TechSEO", "SEO", "bigseo", "accessibility", "webdev", "webperf", "GoogleAnalytics", "GoogleTagManager", "netsec"];

// token_v2 is httpOnly and lasts a day; a www page view renews it.
async function rdToken(page) {
  if (!page.url().startsWith(RD)) await go(page, reddit, RD + "/");
  const t = (await page.context().cookies(RD)).find((c) => c.name === "token_v2");
  if (!t || !t.value) throw new Refused("Reddit is signed out in the agent's Chrome.");
  return t.value;
}

async function rdApi(page, path, form) {
  const token = await rdToken(page);
  const out = await page.evaluate(async ({ url, token, form }) => {
    const init = { headers: { authorization: "Bearer " + token } };
    if (form) Object.assign(init, { method: "POST", body: new URLSearchParams(Object.assign({ api_type: "json" }, form)) });
    try {
      const r = await fetch(url, init);
      return { status: r.status, body: await r.json().catch(() => null) };
    } catch (error) { return { status: 0, body: null }; }
  }, { url: RD_API + path, token, form: form || null });
  const what = path.split("?")[0];
  if (out.status === 401) throw new Refused("Reddit is signed out in the agent's Chrome.");
  if (out.status === 429 || out.status === 403) throw new Refused("Reddit answered " + out.status + " to " + what + ".");
  if (!out.body) throw new Error("Reddit answered " + (out.status || "nothing") + " to " + what + ".");
  return out.body;
}

const rdJson = (page, path) => rdApi(page, path);

async function rdCall(page, path, form) {
  const j = (await rdApi(page, path, form)).json || {};
  const errors = (j.errors || []).map((e) => e.join(": "));
  if (errors.some((e) => /RATELIMIT/.test(e))) throw new Refused("Reddit rate-limited us: " + errors[0] + ".");
  if (errors.length) throw new Error("Reddit refused " + path + ": " + errors[0] + ".");
  return j.data || {};
}

const rdPosts = (listing) => (((listing || {}).data || {}).children || []).map((c) => c.data)
  .filter((d) => d && d.name && !d.over_18 && !d.stickied && !d.locked && !d.archived && d.author !== "[deleted]" && String(d.subreddit).toLowerCase() !== RD_OWN)
  .map((d) => ({
    network: "reddit", id: d.name, url: RD + d.permalink, author: { handle: d.author, name: d.author }, title: d.title || "", text: d.selftext || "", lang: "",
    createdAt: new Date(d.created_utc * 1000).toISOString(), isReply: false, metrics: { likes: d.score || 0, replies: d.num_comments || 0, reposts: d.num_crossposts || 0, views: 0 },
    tags: d.link_flair_text ? [d.link_flair_text] : []
  }));

// A result on www's search page: its tracking context carries the ids and names, the counter row the numbers.
const RD_SEARCH = `
  return Array.from(document.querySelectorAll('search-telemetry-tracker[data-testid="search-sdui-post"]')).map((u) => {
    let ctx = {};
    try { ctx = JSON.parse(u.getAttribute('data-faceplate-tracking-context') || '{}'); } catch (e) { /* no context */ }
    const post = ctx.post || {}, sub = ctx.subreddit || {};
    const link = u.querySelector('a[href*="/comments/"]');
    const nums = Array.from(u.querySelectorAll('[data-testid="search-counter-row"] faceplate-number')).map((n) => Number(n.getAttribute('number')) || 0);
    const time = u.querySelector('faceplate-timeago[ts]');
    return { id: post.id || u.getAttribute('data-thingid') || '', title: post.title || '', nsfw: post.nsfw === true || sub.nsfw === true, author: (ctx.profile || {}).name || '',
      sub: sub.name || '', href: link ? link.getAttribute('href') : '', ts: time ? time.getAttribute('ts') : '', likes: nums[0] || 0, replies: nums[1] || 0 };
  });`;

const reddit = {
  name: "Reddit", home: RD + "/", queries: GENERAL, places: RD_SUBS.map((s) => "r/" + s), sample: "test automation",
  // Every www page carries reCAPTCHA's invisible anchor frame; only its challenge frame (bframe) is a check.
  checkEl: 'iframe[src*="arkose"], iframe[src*="recaptcha"][src*="bframe"]',
  async signedIn(page) {
    const me = await rdJson(page, "/api/v1/me").catch(() => ({}));
    this.me = String(me.name || "");
    return this.me ? "u/" + this.me : "";
  },
  // A topic search (most relevant this week), or "r/<name>": that subreddit's hot posts.
  async read(page, q) {
    if (/^r\//.test(q)) {
      await go(page, this, RD + "/" + q + "/");
      await scroll(page, 1);
      return rdPosts(await rdJson(page, "/" + q + "/hot?limit=40&raw_json=1"));
    }
    await go(page, this, RD + "/search/?q=" + enc(q) + "&type=posts&sort=relevance&t=week");
    await scroll(page, 2);
    return (await evaluate(page, RD_SEARCH)).filter((d) => /^t3_/.test(d.id) && d.href && !d.nsfw && d.author && String(d.sub).toLowerCase() !== RD_OWN).map((d) => ({
      network: "reddit", id: d.id, url: RD + d.href, author: { handle: d.author, name: d.author }, title: d.title, text: "", lang: "",
      createdAt: d.ts ? new Date(d.ts.replace(/\+0000$/, "Z")).toISOString() : "", isReply: false, metrics: { likes: d.likes, replies: d.replies, reposts: 0, views: 0 }, tags: []
    }));
  },
  // Subreddits a topic search finds, for joins (functions/engagement-joins.js).
  async groups(page, q) {
    const j = await rdJson(page, "/subreddits/search?q=" + enc(q) + "&limit=25&raw_json=1");
    return ((j.data || {}).children || []).map((c) => c.data).filter((d) => d && d.display_name).map((d) => ({
      network: "reddit", id: d.display_name, name: "r/" + d.display_name, url: RD + "/r/" + d.display_name + "/", members: d.subscribers || 0, lang: d.lang || "",
      about: d.public_description || d.title || "", kind: "subreddit", member: d.user_is_subscriber === true, nsfw: d.over18 === true, open: d.subreddit_type === "public"
    }));
  },
  async post(page, task) {
    await go(page, this, RD + new URL(task.url).pathname);
    return need(page.locator('shreddit-post[id="' + task.id + '"]'), "The post");
  },
  async like(page, task) {
    await this.post(page, task);
    await pause(1500, 4000);
    await rdCall(page, "/api/vote", { id: task.id, dir: "1" });
    return {};
  },
  async follow(page, task) {
    await go(page, this, RD + "/user/" + enc(task.author.handle) + "/");
    await rdCall(page, "/api/subscribe", { action: "sub", sr_name: "u_" + task.author.handle, skip_initial_defaults: "true" });
    return {};
  },
  // A crosspost to our r/QALabLiveReports, under the post's own title.
  async repost(page, task) {
    await this.post(page, task);
    const d = await rdCall(page, "/api/submit", { kind: "crosspost", sr: "QALabLiveReports", crosspost_fullname: task.id, title: String(task.title || "").slice(0, 300) || "Crosspost", resubmit: "true", sendreplies: "false" });
    return { url: d.url || "" };
  },
  async replied(page, task) {
    if (!this.me) await this.signedIn(page);
    await this.post(page, task);
    await scroll(page, 1);
    const url = this.me ? await page.locator('shreddit-comment[author="' + this.me + '"]').first().getAttribute("permalink", { timeout: 3000 }).catch(() => "") : "";
    return url ? { url: RD + url } : null;
  },
  async reply(page, task) {
    await this.post(page, task);
    await pause(3000, 7000);
    const d = await rdCall(page, "/api/comment", { thing_id: task.id, text: task.draft });
    const c = (((d.things || [])[0] || {}).data) || {};
    if (!c.id) throw new Error("The comment did not post.");
    return { url: RD + (c.permalink || new URL(task.url).pathname) };
  },
  // A student community post (#3138), as Carlos: a text post in task.sr.
  async publish(page, task) {
    await go(page, this, RD + "/r/" + enc(task.sr) + "/");
    await pause(3000, 7000);
    const d = await rdCall(page, "/api/submit", { kind: "self", sr: task.sr, title: String(task.title || "").slice(0, 300), text: task.draft, sendreplies: "true", resubmit: "true" });
    if (!d.url) throw new Error("The post did not go up.");
    return { url: d.url };
  },
  // A student invite (#3138) as a private message.
  async dm(page, task) {
    await go(page, this, RD + "/user/" + enc(task.to) + "/");
    await pause(2000, 5000);
    await rdCall(page, "/api/compose", { to: task.to, subject: String(task.subject || "Your trial").slice(0, 100), text: task.draft });
    return { url: RD + "/message/sent/" };
  },
  async join(page, task) {
    await go(page, this, RD + "/r/" + enc(task.id) + "/");
    const before = (await rdJson(page, "/r/" + enc(task.id) + "/about?raw_json=1")).data || {};
    if (before.user_is_subscriber) return { already: true, members: before.subscribers || 0 };
    await rdCall(page, "/api/subscribe", { action: "sub", sr_name: task.id, skip_initial_defaults: "true" });
    await pause(2000, 3500);
    const after = (await rdJson(page, "/r/" + enc(task.id) + "/about?raw_json=1")).data || {};
    if (!after.user_is_subscriber) throw new Error("The join did not stick.");
    const rules = await rdJson(page, "/r/" + enc(task.id) + "/about/rules?raw_json=1").catch(() => ({}));
    return { members: after.subscribers || before.subscribers || 0, rules: (rules.rules || []).map((r) => r.short_name + ": " + String(r.description || "").replace(/\s+/g, " ")).join("\n").slice(0, 2000) };
  }
};

// --- Telegram (#2614) ----------------------------------------------------------------------------------------------
// Public channels read from their t.me preview, which needs no account; Telegram's web client (WebK), signed in as
// Carlos, reads the groups he joined, reacts, forwards to @qalab_live, comments, searches for groups and joins them.
// A message is "<username>/<id>" as in its t.me link; WebK opens it through a tg:// address.
const TG = "https://web.telegram.org/k/";
const TG_OWN = "qalab_live";
const tgOpen = (name, post) => TG + "#?tgaddr=" + enc("tg://resolve?domain=" + name + (post ? "&post=" + post : ""));
const TG_MENU = (names) => new RegExp("^\\s*(" + names.join("|") + ")\\s*$", "i");
const TG_CHOSEN = ".reaction.is-chosen, reaction-element.is-chosen";
const TG_INPUT = '.input-message-input[contenteditable="true"]';

const telegram = {
  name: "Telegram", home: TG, queries: GENERAL, placesOnly: true, places: [], sample: "@telegram",
  async signedIn(page) {
    if (!(await visible(page.locator("#column-left .chatlist"), 25000))) return "";
    const id = await page.evaluate(() => { try { return String(JSON.parse(localStorage.getItem("user_auth") || "{}").id || ""); } catch (e) { return ""; } });
    return id ? "user " + id : "signed in";
  },
  // "@name": a channel's latest posts from its t.me preview, or a group we joined, read in WebK.
  async read(page, q) {
    const name = String(q).replace(/^@/, "");
    if (name.toLowerCase() === TG_OWN) return [];
    await go(page, this, "https://t.me/s/" + name);
    if (!/\/s\//.test(page.url()) || !(await visible(page.locator(".tgme_widget_message[data-post]"), 8000))) return this.readChat(page, name);
    return evaluate(page, `
      const title = ((document.querySelector('.tgme_channel_info_header_title') || {}).textContent || arg).trim();
      const counter = Array.from(document.querySelectorAll('.tgme_channel_info_counter')).find((c) => /subscriber|member|suscriptor|miembro/i.test(c.textContent));
      const followers = counter ? num(counter.querySelector('.counter_value').textContent) : 0;
      return Array.from(document.querySelectorAll('.tgme_widget_message[data-post]')).map((m) => {
        const post = m.getAttribute('data-post');
        const text = m.querySelector('.tgme_widget_message_text');
        const time = m.querySelector('.tgme_widget_message_date time');
        const views = m.querySelector('.tgme_widget_message_views');
        const reacts = Array.from(m.querySelectorAll('.tgme_reaction')).reduce((s, r) => s + num(r.textContent.replace(/[^\\d.,KkMm]/g, '')), 0);
        return { network: 'telegram', id: post, url: 'https://t.me/' + post, author: { handle: post.split('/')[0], name: title, followers }, text: text ? text.innerText : '', lang: '',
          createdAt: time ? time.getAttribute('datetime') : '', isReply: !!m.querySelector('.tgme_widget_message_reply'), metrics: { likes: reacts, replies: 0, reposts: 0, views: views ? num(views.textContent) : 0 } };
      }).filter((p) => p.text && /^[\\w]+\\/\\d+$/.test(p.id));`, name);
  },
  async readChat(page, name) {
    await go(page, this, tgOpen(name));
    if (!(await visible(page.locator(".bubbles-inner .bubble[data-mid]"), 20000))) return [];
    await pause(1500, 3000);
    return evaluate(page, `
      return Array.from(document.querySelectorAll('.bubbles-inner .bubble[data-mid]:not(.is-out):not(.service)')).slice(-30).map((b) => {
        const mid = b.getAttribute('data-mid');
        const ts = Number(b.getAttribute('data-timestamp')) || 0;
        const body = b.querySelector('.translatable-message') || b.querySelector('.message');
        const who = b.querySelector('.name .peer-title, .peer-title');
        const text = body ? body.innerText.trim() : '';
        if (!text || !/^\\d+$/.test(mid)) return null;
        return { network: 'telegram', id: arg + '/' + mid, url: 'https://t.me/' + arg + '/' + mid, author: { handle: arg, name: who ? who.textContent.trim() : arg }, text, lang: '',
          createdAt: ts ? new Date(ts * 1000).toISOString() : '', isReply: !!b.querySelector('.reply'), metrics: { likes: b.querySelectorAll('.reaction').length, replies: 0, reposts: 0, views: 0 } };
      }).filter(Boolean);`, name);
  },
  // Channels and groups WebK's global search finds for a topic, with their member counts, for joins.
  async groups(page, q) {
    await go(page, this, TG);
    const input = await need(page.locator("#column-left .input-search input").filter({ visible: true }), "The search box");
    await type(page, input, q);
    await pause(3000, 5000);
    const found = await evaluate(page, `
      return Array.from(document.querySelectorAll('#search-container [data-peer-id]')).map((r) => {
        if (!(Number(r.getAttribute('data-peer-id')) < 0)) return null;
        const title = ((r.querySelector('.peer-title') || {}).textContent || '').trim();
        const sub = ((r.querySelector('.row-subtitle, .dialog-subtitle') || {}).textContent || '');
        const user = (sub.match(/@([A-Za-z]\\w{3,31})/) || [])[1];
        const m = sub.match(/(\\d[\\d\\s.,]*\\s?[KkMm]?)\\s*(subscribers?|members?|suscriptores|miembros)/i);
        if (!user || !m) return null;
        return { network: 'telegram', id: user, name: title, url: 'https://t.me/' + user, members: num(m[1].replace(/\\s/g, '')), kind: /subscri|suscrip/i.test(m[2]) ? 'channel' : 'group', about: '' };
      }).filter(Boolean);`);
    await page.keyboard.press("Escape").catch(() => null);
    return found.filter((g, i) => found.findIndex((h) => h.id === g.id) === i);
  },
  async bubble(page, task) {
    const [name, mid] = String(task.id).split("/");
    await go(page, this, tgOpen(name, mid));
    return need(page.locator('.bubble[data-mid="' + mid + '"]'), "The message");
  },
  async menu(page, b, names, what) {
    await b.locator(".bubble-content").first().click({ button: "right", timeout: 10000 });
    await pause(600, 1400);
    await click(await need(page.locator(".btn-menu-item").filter({ visible: true, hasText: TG_MENU(names) }), what + " in the menu"));
  },
  async like(page, task) {
    const b = await this.bubble(page, task);
    if (await has(b.locator(TG_CHOSEN))) return {};
    await b.locator(".bubble-content").first().dblclick({ delay: rand(40, 90), timeout: 10000 });
    if (!(await visible(b.locator(TG_CHOSEN), 8000))) throw new Error("The reaction did not stick; the chat may have reactions off.");
    return {};
  },
  // A forward to our channel: the picker must show @qalab_live and nothing else before it is chosen.
  async repost(page, task) {
    const b = await this.bubble(page, task);
    await this.menu(page, b, ["Forward", "Reenviar"], "Forward");
    const pop = await need(page.locator(".popup-forward"), "The forward picker");
    await type(page, await need(pop.locator("input").filter({ visible: true }), "The picker's search"), TG_OWN);
    await pause(2000, 3500);
    const rows = pop.locator("[data-peer-id]").filter({ visible: true, hasText: /QA-?lab/i });
    if ((await rows.count()) !== 1) throw new Error("The forward picker did not show @" + TG_OWN + " alone, so nothing was forwarded.");
    await click(rows.first());
    await click(await need(page.locator(".btn-send").filter({ visible: true }), "Send"));
    return { url: "https://t.me/" + TG_OWN };
  },
  // Our earlier comment under a channel post: a message of ours in its comment thread.
  async replied(page, task) {
    const b = await this.bubble(page, task);
    const thread = b.locator(".replies-footer");
    if (!(await has(thread))) return null;
    await click(thread.first());
    await pause(2500, 4000);
    return (await has(page.locator(".bubbles-inner .bubble.is-out"))) ? { url: task.url } : null;
  },
  // Under a channel post, in its comments; in a group, as a reply to the message. Both need the account to be let in.
  async reply(page, task) {
    const b = await this.bubble(page, task);
    const thread = b.locator(".replies-footer");
    if (await has(thread)) { await click(thread.first()); await pause(2500, 4000); }
    else await this.menu(page, b, ["Reply", "Responder"], "Reply");
    const input = await need(page.locator(TG_INPUT).filter({ visible: true }), "The message box (the group may need a join first)");
    await type(page, input, task.draft);
    await page.keyboard.press("Enter");
    await pause(2000, 3500);
    if ((await input.innerText().catch(() => "")).includes(String(task.draft).slice(0, 20))) throw new Error("The reply did not send.");
    return { url: task.url };
  },
  async members(page) {
    const info = await page.locator(".chat-info .info, .top .info").first().innerText({ timeout: 4000 }).catch(() => "");
    const m = info.match(/(\d[\d\s.,]*)\s*(subscribers?|members?|suscriptores|miembros)/i);
    return m ? Number(m[1].replace(/[\s.,]/g, "")) || 0 : 0;
  },
  async join(page, task) {
    await go(page, this, tgOpen(task.id));
    await pause(2000, 4000);
    const members = await this.members(page);
    const join = page.locator(".chat-join, .chat-input button").filter({ visible: true, hasText: TG_MENU(["Join", "Join Channel", "Join Group", "Subscribe", "Unirse", "Unirse al grupo", "Unirse al canal", "Suscribirse"]) });
    if (!(await visible(join, 8000))) {
      if (await visible(page.locator(TG_INPUT + ", .chat-input .btn-unmute, .chat-input .btn-mute").filter({ visible: true }), 3000)) return { already: true, members };
      throw new Error("Telegram showed no Join button for @" + task.id + ".");
    }
    await click(join.first());
    await join.first().waitFor({ state: "hidden", timeout: 12000 }).catch(() => { throw new Error("The join did not stick."); });
    return { members };
  }
};

const NETWORKS = { x, linkedin, facebook, instagram, threads, tiktok, telegram, reddit };
// dm(page, task) on each network: a 2-day pass DM Carlos approved (#3137, dms.js).
require("./dms").install(NETWORKS, { go, click, type, need, visible, has, pause, Refused, rdCall });

module.exports = { NETWORKS, Refused, checked, pause, rand, sleep, xTexts, rdPosts, splitDraft, pickOption, newest, liAt, fbStories, igMedia, thExtras, downloadImage };
