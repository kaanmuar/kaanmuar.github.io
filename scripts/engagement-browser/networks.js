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
 *
 * The selectors are the networks' own accessibility labels and test ids where they have them; when a network
 * changes its page, `agent.js check --read` shows which reader came back empty and saves a screenshot.
 */

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
  if (await page.locator(CHECK_EL).count().catch(() => 0)) throw new Refused(net.name + " is showing a captcha.");
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

// end: the box already holds the name of the person answered, so the text goes after it.
async function type(page, loc, text, end) {
  await click(loc);
  if (end) await page.keyboard.press("Meta+ArrowDown");
  for (const part of String(text).match(/.{1,12}/gsu) || []) {
    await page.keyboard.type(part, { delay: rand(35, 85) });
    await pause(80, 400);
  }
  await pause(800, 1800);
}

const has = async (loc) => (await loc.count().catch(() => 0)) > 0;
const visible = (loc, ms) => loc.first().waitFor({ state: "visible", timeout: ms || 15000 }).then(() => true, () => false);
const need = async (loc, what) => { if (!(await visible(loc))) throw new Error(what + " was not on the page."); return loc.first(); };

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
    await click(await need(page.locator('[data-testid="tweetButton"]'), "Reply"));
    await page.locator('[data-testid="tweetTextarea_0"]').first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => { throw new Error("The reply did not send."); });
    return { url: task.url };
  }
};

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
  async reply(page, task) {
    const main = await this.post(page, task);
    await click(button(main, SAYS.reply).first());
    const dialog = page.locator('[role="dialog"]');
    await type(page, await need(dialog.locator('[contenteditable="true"]'), "The reply box"), task.draft);
    await click(await need(dialog.getByRole("button", { name: /^(Post|Publicar)$/ }), "Post"));
    await dialog.first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => { throw new Error("The reply did not send."); });
    return { url: task.url };
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
  // The posts Instagram's own keyword search page loads through its GraphQL calls.
  async read(page, tag) {
    if (!page.url().startsWith("https://www.instagram.com/")) await go(page, this, this.home);
    const found = new Map();
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (o.code && o.taken_at && o.user && o.user.username) { found.set(o.code, o); return; }
      Object.values(o).forEach(walk);
    };
    const on = async (r) => {
      if (!/\/(api\/graphql|graphql\/query)/.test(r.url())) return;
      walk(await r.json().catch(() => null));
    };
    page.on("response", on);
    try { await go(page, this, "https://www.instagram.com/explore/search/keyword/?q=" + enc("#" + tag)); await pause(4000, 6000); await scroll(page, 2); } finally { page.off("response", on); }
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
  async reply(page, task) {
    await go(page, this, task.url);
    const icon = page.locator('[data-e2e="comment-icon"]');
    if (await has(icon)) await click(icon.first());
    await type(page, await need(page.locator('[data-e2e="comment-input"] [contenteditable="true"], div[contenteditable="true"][data-e2e="comment-text"]'), "The comment box"), task.draft);
    await click(await need(page.locator('[data-e2e="comment-post"]'), "Post"));
    await pause(3000, 5000);
    return { url: task.url };
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
  async reply(page, task) {
    const main = await this.post(page, task);
    await this.asPage(page, main);
    const box = main.locator('[contenteditable="true"][aria-label*="coment" i], [contenteditable="true"][aria-label*="comment" i]');
    if (!(await visible(box, 4000))) await click(await need(main.locator('button[aria-label="Comentar"], button[aria-label="Comment"]'), "Comment"));
    await type(page, await need(box, "The comment box"), task.draft);
    await click(await need(main.locator("button:not([aria-label])").filter({ hasText: /^\s*(Comentar|Comment|Publicar|Post)\s*$/ }), "Post"));
    await pause(3000, 5000);
    return { url: task.url };
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
    if (!(await visible(page.locator('[aria-label*="como QA-lab" i], [aria-label*="as QA-lab" i], [placeholder*="QA-lab" i]').or(page.getByText(/(Comentar como|Comment as) QA-lab/i)), 6000))) throw new Error("LinkedIn is not acting as the QA-lab page here.");
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
  async reply(page, task) {
    await go(page, this, task.url);
    if (!(await this.asPage(page))) throw new Refused("Facebook is not acting as the " + PAGES.facebook + " page.");
    const box = await need(page.locator('[contenteditable="true"][role="textbox"][aria-label^="Write a"], [contenteditable="true"][role="textbox"][aria-label^="Comment"], [contenteditable="true"][role="textbox"][aria-label^="Escribe"], [contenteditable="true"][role="textbox"][aria-label^="Comenta"], [contenteditable="true"][role="textbox"]'), "The comment box");
    await type(page, box, task.draft);
    await page.keyboard.press("Enter");
    await pause(3000, 5000);
    return { url: task.url };
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

module.exports = { NETWORKS: { x, linkedin, facebook, instagram, threads, tiktok }, Refused, checked, pause, rand, sleep, xTexts };
