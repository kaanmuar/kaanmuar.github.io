"use strict";
/*
 * How the Mac's browser agent (#1991) reads and acts on each network, signed in as our accounts in its own Chrome
 * profile. Each network: home (where a signed-in check starts), signedIn(page) => account name or "", read(page,
 * query) => posts in the scout's shape (functions/engagement-mac.js cleans them), and the actions it takes, each
 * act(page, task) => { url } or a throw. A Refused throw means the network refused us for now (signed out, a
 * check, a limit): the task stays queued and the agent leaves that network alone for a day.
 *
 * The selectors are the networks' own accessibility labels and test ids where they have them; when a network
 * changes its page, `agent.js check --read` shows which reader came back empty and saves a screenshot.
 */

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

async function type(page, loc, text) {
  await click(loc);
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

const GENERAL = ["web accessibility", "WCAG", "core web vitals", "technical SEO", "Playwright testing", "test automation", "AI Overviews SEO", "web performance", "GA4", "software testing", "a11y", "Google Search Console", "QA engineer", "Lighthouse performance"];

const x = {
  name: "X", home: "https://x.com/home", queries: GENERAL,
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
  name: "Threads", home: "https://www.threads.com/", queries: GENERAL,
  async signedIn(page) {
    const me = page.locator('a[href^="/@"]:has(svg[aria-label="Profile"])');
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
        const count = (l) => { const s = c.querySelector('svg[aria-label="' + l + '"]'); const b = s && s.closest('[role="button"], button'); return b ? num(b.innerText) : 0; };
        const text = Array.from(c.querySelectorAll('span[dir="auto"]')).map((s) => s.innerText.trim()).filter((t) => t && t !== m[1]).sort((a, b) => b.length - a.length)[0] || '';
        return { network: 'threads', id: m[2], url: 'https://www.threads.com' + href.split('?')[0], author: { handle: m[1], name: m[1] }, text, createdAt: time.getAttribute('datetime'),
          metrics: { likes: count('Like') || count('Unlike'), replies: count('Reply') || count('Comment'), reposts: count('Repost'), views: 0 } };
      }).filter(Boolean);`);
  },
  async post(page, task) {
    await go(page, this, task.url);
    return need(page.locator('div[data-pressable-container="true"]'), "The post");
  },
  async like(page, task) {
    const main = await this.post(page, task);
    if (await has(main.locator('svg[aria-label="Unlike"]'))) return {};
    await click(main.locator('[role="button"]:has(svg[aria-label="Like"])').first());
    return {};
  },
  async repost(page, task) {
    const main = await this.post(page, task);
    await click(main.locator('[role="button"]:has(svg[aria-label="Repost"])').first());
    const item = page.getByText("Repost", { exact: true });
    if (!(await visible(item, 5000))) return {};
    await click(item.last());
    return {};
  },
  async follow(page, task) {
    await go(page, this, "https://www.threads.com/@" + enc(task.author.handle));
    if (await visible(page.getByRole("button", { name: "Following", exact: true }), 6000)) return {};
    await click(await need(page.getByRole("button", { name: "Follow", exact: true }), "Follow"));
    return {};
  },
  async reply(page, task) {
    const main = await this.post(page, task);
    await click(main.locator('[role="button"]:has(svg[aria-label="Reply"])').first());
    const dialog = page.locator('[role="dialog"]');
    await type(page, await need(dialog.locator('[contenteditable="true"]'), "The reply box"), task.draft);
    await click(await need(dialog.getByRole("button", { name: "Post", exact: true }), "Post"));
    await dialog.first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => { throw new Error("The reply did not send."); });
    return { url: task.url };
  }
};

const instagram = {
  name: "Instagram", home: "https://www.instagram.com/",
  queries: ["webaccessibility", "accessibility", "seo", "technicalseo", "softwaretesting", "qatesting", "webperformance", "webdevelopment", "wcag", "testautomation", "a11y", "googleanalytics"],
  async signedIn(page) {
    if (!(await visible(page.locator('svg[aria-label="Home"]'), 15000))) return "";
    const me = await page.evaluate(() => fetch("/api/v1/accounts/current_user/?edit=true", { headers: { "x-ig-app-id": "936619743392459" }, credentials: "include" })
      .then((r) => (r.ok ? r.json() : {})).then((j) => (j.user || {}).username || "", () => ""));
    return me ? "@" + me : "Instagram";
  },
  // Instagram's own web endpoint behind a hashtag page, called from the signed-in page.
  async read(page, tag) {
    if (!page.url().startsWith("https://www.instagram.com/")) await go(page, this, this.home);
    await go(page, this, "https://www.instagram.com/explore/search/keyword/?q=" + enc("#" + tag));
    const out = await evaluate(page, `
      return fetch('/api/v1/tags/web_info/?tag_name=' + encodeURIComponent(arg), { headers: { 'x-ig-app-id': '936619743392459' }, credentials: 'include' }).then(async (r) => {
        if (!r.ok) return { error: 'Instagram answered ' + r.status };
        const found = [];
        const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.code && o.taken_at && o.user) { found.push(o); return; } Object.values(o).forEach(walk); };
        walk(await r.json());
        return { posts: found.map((m) => ({ network: 'instagram', id: String(m.pk || m.id || m.code), url: 'https://www.instagram.com/p/' + m.code + '/',
          author: { handle: m.user.username, name: m.user.full_name || m.user.username, id: String(m.user.pk || m.user.id || '') },
          text: (m.caption && m.caption.text) || '', createdAt: new Date(m.taken_at * 1000).toISOString(),
          metrics: { likes: m.like_count || 0, replies: m.comment_count || 0, reposts: 0, views: m.play_count || m.view_count || 0 } })) };
      });`, tag);
    if (out.error) throw new Error(out.error);
    return out.posts;
  },
  async like(page, task) {
    await go(page, this, task.url);
    if (await visible(page.locator('svg[aria-label="Unlike"][height="24"]'), 6000)) return {};
    await click(await need(page.locator('[role="button"]:has(svg[aria-label="Like"][height="24"])'), "Like"));
    return {};
  },
  async follow(page, task) {
    await go(page, this, task.url);
    const header = page.locator("header");
    if (await visible(header.getByText("Following", { exact: true }), 6000)) return {};
    await click(await need(header.getByRole("button", { name: "Follow", exact: true }), "Follow"));
    return {};
  },
  async reply(page, task) {
    await go(page, this, task.url);
    const box = await need(page.locator('textarea[aria-label^="Add a comment"]'), "The comment box");
    await type(page, box, task.draft);
    await click(await need(page.getByRole("button", { name: "Post", exact: true }), "Post"));
    await pause(3000, 5000);
    if ((await box.inputValue().catch(() => "")).trim()) throw new Error("The comment did not send.");
    return { url: task.url };
  }
};

const tiktok = {
  name: "TikTok", home: "https://www.tiktok.com/",
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
  async reply(page, task) {
    await go(page, this, task.url);
    const icon = page.locator('[data-e2e="comment-icon"]');
    if (await has(icon)) await click(icon.first());
    await type(page, await need(page.locator('[data-e2e="comment-input"] [contenteditable="true"], div[contenteditable="true"][data-e2e="comment-text"]'), "The comment box"), task.draft);
    await click(await need(page.locator('[data-e2e="comment-post"]'), "Post"));
    await pause(3000, 5000);
    return { url: task.url };
  }
};

const linkedin = {
  name: "LinkedIn", home: "https://www.linkedin.com/feed/", queries: GENERAL,
  async signedIn(page) {
    const me = page.locator("img.global-nav__me-photo, .global-nav__me img");
    if (!(await visible(me, 15000))) return "";
    return (await me.first().getAttribute("alt").catch(() => "")) || "LinkedIn";
  },
  async read(page, q) {
    await go(page, this, "https://www.linkedin.com/search/results/content/?keywords=" + enc(q) + "&datePosted=%22past-24h%22&sortBy=%22relevance%22");
    await visible(page.locator('[data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]'), 20000);
    await scroll(page, 3);
    return evaluate(page, `
      const unit = { m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 2592e6, yr: 31536e6 };
      return Array.from(document.querySelectorAll('[data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]')).map((c) => {
        const urn = c.getAttribute('data-urn') || c.getAttribute('data-id');
        const text = (c.querySelector('.update-components-text, .feed-shared-update-v2__description, .feed-shared-inline-show-more-text') || {}).innerText || '';
        const actor = c.querySelector('a.update-components-actor__meta-link, a.update-components-actor__image, .update-components-actor__container a');
        const href = actor ? actor.href.split('?')[0] : '';
        const handle = (href.match(/linkedin\\.com\\/(?:in|company)\\/([^/]+)/) || [])[1] || '';
        const name = ((c.querySelector('.update-components-actor__title span[aria-hidden="true"], .update-components-actor__name span[aria-hidden="true"]') || {}).innerText || handle).trim();
        const age = ((c.querySelector('.update-components-actor__sub-description') || {}).innerText || '').match(/(\\d+)\\s*(mo|yr|m|h|d|w)\\b/);
        const btn = (re) => num(((Array.from(c.querySelectorAll('button[aria-label]')).find((b) => re.test(b.getAttribute('aria-label'))) || {}).innerText) || '');
        return { network: 'linkedin', id: urn, url: 'https://www.linkedin.com/feed/update/' + urn + '/', author: { handle, name, id: href }, text,
          createdAt: age ? new Date(Date.now() - Number(age[1]) * unit[age[2]]).toISOString() : '',
          metrics: { likes: num((c.querySelector('.social-details-social-counts__reactions-count') || {}).innerText), replies: btn(/comment/i), reposts: btn(/repost/i), views: 0 } };
      }).filter((p) => p.text);`);
  },
  async post(page, task) {
    await go(page, this, task.url);
    const main = page.locator('[data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]');
    return (await visible(main)) ? main.first() : page.locator("main");
  },
  async like(page, task) {
    const main = await this.post(page, task);
    const btn = await need(main.locator('button[aria-label^="React Like"], button.react-button__trigger'), "Like");
    if ((await btn.getAttribute("aria-pressed")) === "true") return {};
    await click(btn);
    return {};
  },
  async repost(page, task) {
    const main = await this.post(page, task);
    await click(await need(main.locator("button").filter({ hasText: /^\s*Repost\s*$/ }), "Repost"));
    await click(await need(page.locator('.artdeco-dropdown__item, [role="menuitem"], [role="button"]').filter({ hasText: /Instantly bring|^\s*Repost\s*$/ }), "Repost in the menu"));
    return {};
  },
  async follow(page, task) {
    const main = await this.post(page, task);
    if (await has(main.locator('button[aria-label^="Following"], button[aria-label^="Unfollow"]'))) return {};
    const btn = main.locator('button[aria-label^="Follow"]');
    if (!(await visible(btn, 6000))) throw new Error("No Follow button on the post (a connection already, or a company page).");
    await click(btn.first());
    return {};
  },
  async reply(page, task) {
    const main = await this.post(page, task);
    await click(await need(main.locator('button[aria-label="Comment"], button[aria-label^="Comment"]'), "Comment"));
    await type(page, await need(main.locator('.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"]'), "The comment box"), task.draft);
    await click(await need(main.locator("button.comments-comment-box__submit-button, button.comments-comment-box__submit-button--cr, button").filter({ hasText: /^\s*(Comment|Post)\s*$/ }), "Post"));
    await pause(3000, 5000);
    return { url: task.url };
  }
};

const facebook = {
  name: "Facebook", home: "https://www.facebook.com/", queries: GENERAL,
  async signedIn(page) {
    if (await visible(page.locator('input[name="email"]'), 5000)) return "";
    const me = page.locator('[aria-label="Your profile"], [aria-label="Account controls and settings"]');
    return (await visible(me, 10000)) ? "Facebook" : "";
  },
  async read(page, q) {
    await go(page, this, "https://www.facebook.com/search/posts/?q=" + enc(q));
    await visible(page.locator('div[role="feed"], div[role="article"]'), 20000);
    await scroll(page, 3);
    return evaluate(page, `
      const seen = new Set();
      return Array.from(document.querySelectorAll('div[role="feed"] > div, div[role="article"]')).map((c) => {
        const link = Array.from(c.querySelectorAll('a[href]')).map((a) => a.href).find((h) => /\\/posts\\/|permalink\\.php|story_fbid=|\\/videos\\/|\\/reel\\//.test(h));
        if (!link) return null;
        const url = /permalink\\.php|story_fbid=/.test(link) ? link.split('&__')[0] : link.split('?')[0];
        if (seen.has(url)) return null;
        seen.add(url);
        const msg = c.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"]');
        const a = c.querySelector('h2 a, h3 a, h4 a, strong a');
        const ahref = a ? a.href.split('?')[0] : '';
        const t = c.innerText;
        const pick = (re) => { const m = t.match(re); return m ? num(m[1]) : 0; };
        return { network: 'facebook', id: url, url, author: { handle: (ahref.match(/facebook\\.com\\/([^/?]+)/) || [])[1] || (a ? a.innerText : ''), name: a ? a.innerText : '', id: ahref },
          text: msg ? msg.innerText : '', createdAt: '',
          metrics: { likes: pick(/All reactions:\\s*([\\d.,]+\\s*[KM]?)/i), replies: pick(/([\\d.,]+\\s*[KM]?)\\s+comments?/i), reposts: pick(/([\\d.,]+\\s*[KM]?)\\s+shares?/i), views: 0 } };
      }).filter((p) => p && p.text);`);
  },
  async like(page, task) {
    await go(page, this, task.url);
    if (await visible(page.locator('[aria-label="Remove Like"]'), 6000)) return {};
    await click(await need(page.locator('[aria-label="Like"][role="button"]'), "Like"));
    return {};
  },
  async reply(page, task) {
    await go(page, this, task.url);
    const box = await need(page.locator('[contenteditable="true"][role="textbox"][aria-label^="Write a"], [contenteditable="true"][role="textbox"][aria-label^="Comment"], [contenteditable="true"][role="textbox"]'), "The comment box");
    await type(page, box, task.draft);
    await page.keyboard.press("Enter");
    await pause(3000, 5000);
    return { url: task.url };
  }
};

module.exports = { NETWORKS: { x, linkedin, facebook, instagram, threads, tiktok }, Refused, checked, pause, rand, sleep };
