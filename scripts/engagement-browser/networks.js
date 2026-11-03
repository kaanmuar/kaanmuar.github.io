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

// On LinkedIn and Facebook the agent acts as our page, never as the person signed in (Carlos, #1991).
const PAGES = { linkedin: "146731408", facebook: "qalaburlreview" };
const PAGE_NAME = /QA-?lab/i;

// Meta's pages follow the account's language (ours are in Spanish), and Threads names its icons with an svg <title>.
const SAYS = { like: ["Like", "Me gusta"], unlike: ["Unlike", "Ya no me gusta", "Quitar me gusta"], reply: ["Reply", "Comment", "Responder", "Comentar"], repost: ["Repost", "Republicar"], profile: ["Profile", "Perfil"], home: ["Home", "Inicio"] };
const icon = (names, extra) => names.flatMap((n) => ['svg[aria-label="' + n + '"]' + (extra || ""), 'svg' + (extra || "") + ':has(> title:text-is("' + n + '"))']).join(", ");
const button = (scope, names, extra) => scope.locator('[role="button"], button').filter({ has: scope.page().locator(icon(names, extra)) });
const words = (names) => new RegExp("^(" + names.join("|") + ")$");

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
  async reply(page, task) {
    const main = await this.post(page, task);
    await click(button(main, SAYS.reply).first());
    const dialog = page.locator('[role="dialog"]');
    await type(page, await need(dialog.locator('[contenteditable="true"]'), "The reply box"), task.draft);
    await click(await need(dialog.getByRole("button", { name: /^(Post|Publicar)$/ }), "Post"));
    await dialog.first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => { throw new Error("The reply did not send."); });
    return { url: task.url };
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
  async reply(page, task) {
    await go(page, this, task.url);
    const box = await need(page.locator('textarea[aria-label^="Add a comment"], textarea[aria-label^="Añade un comentario"]'), "The comment box");
    await type(page, box, task.draft);
    await click(await need(page.getByRole("button", { name: /^(Post|Publicar)$/ }), "Post"));
    await pause(3000, 5000);
    if ((await box.inputValue().catch(() => "")).trim()) throw new Error("The comment did not send.");
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

// LinkedIn's search page renders server-driven markup with no post ids in it, so the agent reads through the
// signed-in session's own Voyager API. The query id is LinkedIn's; when it rotates, `check linkedin --read` fails here.
const LI_SEARCH = "voyagerSearchDashClusters.ef3d0937fb65bd7812e32e5a85028e79";
const LI_API = "const csrf = (document.cookie.match(/JSESSIONID=\"?([^\";]+)/) || [])[1] || ''; const api = (path) => fetch(path, { credentials: 'include', headers: { 'csrf-token': csrf, accept: 'application/vnd.linkedin.normalized+json+2.1', 'x-restli-protocol-version': '2.0.0' } });";
// LinkedIn sometimes renders without its data-view-name hooks, so the agent goes by accessibility labels.
const LI_LIKE = 'button[aria-label^="Estado del botón de reacción"], button[aria-label^="Reaction button state"]';
const LI_PAGE = 'input[type="radio"][aria-label*="QA-lab" i], [role="radio"][aria-label*="QA-lab" i]';
// The reactions menu opens on hovering the reaction button. Its buttons end in the reaction's name ("React Celebrate",
// "Celebrar"), in English or the Spanish our account uses.
const LI_REACT = {
  celebrate: ["Celebrate", "Celebrar"], support: ["Support", "Apoyar"], love: ["Love", "Encantar", "Me encanta"],
  insightful: ["Insightful", "Interesante"], funny: ["Funny", "Divertido", "Hacer gracia", "Me hace gracia"]
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
  async reply(page, task) {
    const main = await this.post(page, task);
    await this.asPage(page, main);
    const box = main.locator('[contenteditable="true"][aria-label*="coment" i], [contenteditable="true"][aria-label*="comment" i]');
    if (!(await visible(box, 4000))) await click(await need(main.locator('button[aria-label="Comentar"], button[aria-label="Comment"]'), "Comment"));
    await type(page, await need(box, "The comment box"), task.draft);
    await click(await need(main.locator("button:not([aria-label])").filter({ hasText: /^\s*(Comentar|Comment|Publicar|Post)\s*$/ }), "Post"));
    await pause(3000, 5000);
    return { url: task.url };
  }
};

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
  async reply(page, task) {
    await go(page, this, task.url);
    if (!(await this.asPage(page))) throw new Refused("Facebook is not acting as the " + PAGES.facebook + " page.");
    const box = await need(page.locator('[contenteditable="true"][role="textbox"][aria-label^="Write a"], [contenteditable="true"][role="textbox"][aria-label^="Comment"], [contenteditable="true"][role="textbox"][aria-label^="Escribe"], [contenteditable="true"][role="textbox"][aria-label^="Comenta"], [contenteditable="true"][role="textbox"]'), "The comment box");
    await type(page, box, task.draft);
    await page.keyboard.press("Enter");
    await pause(3000, 5000);
    return { url: task.url };
  }
};

module.exports = { NETWORKS: { x, linkedin, facebook, instagram, threads, tiktok }, Refused, checked, pause, rand, sleep };
