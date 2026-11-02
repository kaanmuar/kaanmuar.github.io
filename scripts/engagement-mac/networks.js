"use strict";
/*
 * The Mac browser agent's networks (#1991): how it reads search results and clicks like, repost, follow and reply
 * on X, LinkedIn, Facebook, Instagram, Threads and TikTok, in its own Chrome profile, signed in as the brand.
 *
 * Each network: { home, login, cookie, search(q), queries, read(page, q), account(page), like, repost, follow, reply }.
 * An action takes (page, doc[, text]) and returns { url }; it opens the post first, and does nothing when the post
 * already shows the action done (liked, followed). A sign-in wall or a challenge throws a fatal ActError, so the
 * network waits until Carlos signs in again; a missing button throws a plain one, so only that post fails.
 * Labels match English and Spanish: Chrome runs in en-US, but an account set to Spanish keeps its own language.
 */
const { ActError } = require("../../functions/engagement-act");

const UNITS = { k: 1e3, mil: 1e3, tsd: 1e3, m: 1e6, mill: 1e6, mln: 1e6, mio: 1e6, b: 1e9 };

/** "1.2K", "12,345", "1,2 mil", "3 replies" as a number. */
function num(v) {
  const m = String(v == null ? "" : v).match(/(\d+(?:[.,]\d+)*)\s*(k|mil|mill|mln|tsd|mio|m|b)?(?![a-z])/i);
  if (!m) return 0;
  const mult = UNITS[String(m[2] || "").toLowerCase()] || 1;
  const n = parseFloat(mult > 1 ? m[1].replace(",", ".") : m[1].replace(/[.,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * mult) : 0;
}

/** LinkedIn activity ids carry their time in the top bits; TikTok video ids in the top 32. */
const linkedinTime = (id) => { try { return new Date(Number(BigInt(id) >> 22n)).toISOString(); } catch (error) { return ""; } };
const tiktokTime = (id) => { try { return new Date(Number(BigInt(id) >> 32n) * 1000).toISOString(); } catch (error) { return ""; } };
const tagsOf = (text) => Array.from(String(text || "").matchAll(/#([\p{L}\p{N}_]{2,40})/gu)).map((m) => m[1]).slice(0, 12);

function post(network, r) {
  return {
    network, id: String(r.id), url: r.url, author: { handle: String(r.handle || "").replace(/^@/, ""), name: r.name || r.handle || "", id: r.authorId || r.handle || "", followers: 0 },
    text: String(r.text || "").trim().slice(0, 3000), lang: r.lang || "", createdAt: r.createdAt || "", isReply: r.isReply === true,
    metrics: { likes: num(r.likes), replies: num(r.replies), reposts: num(r.reposts), views: num(r.views) }, tags: tagsOf(r.text)
  };
}

const wait = (min, max) => new Promise((r) => setTimeout(r, min + Math.floor(Math.random() * ((max || min) - min))));

const WALL = /\/(login|signin|uas\/login|checkpoint|challenge|captcha|accounts\/login|i\/flow\/login|authwall|consent)\b/i;

/** Opens url, waits like a person, and throws a fatal ActError on a sign-in wall or a challenge. */
async function go(page, url, name) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await wait(2500, 4500);
  const at = page.url();
  if (WALL.test(new URL(at).pathname)) throw new ActError(name + " asks to sign in again (" + new URL(at).pathname.slice(0, 40) + "). Press Sign in on the Mac in Jarvis.", true);
  const blocked = await page.locator("iframe[src*='captcha'], iframe[src*='challenge'], #captcha-verify-image, [id*='captcha' i]").count().catch(() => 0);
  if (blocked) throw new ActError(name + " shows a captcha. Press Sign in on the Mac in Jarvis and solve it once.", true);
}

/** Clicks the first visible match; false when none is there. */
async function click(scope, selectors) {
  for (const s of [].concat(selectors)) {
    const el = scope.locator(s).first();
    if (await el.count().catch(() => 0) && await el.isVisible().catch(() => false)) {
      await el.scrollIntoViewIfNeeded().catch(() => null);
      await wait(400, 1100);
      await el.click({ timeout: 8000 });
      return true;
    }
  }
  return false;
}

async function has(scope, selectors) {
  for (const s of [].concat(selectors)) if (await scope.locator(s).first().isVisible().catch(() => false)) return true;
  return false;
}

/** Waits until one of selectors shows, or throws: the click did not take. */
async function until(scope, selectors, what) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (await has(scope, selectors)) return; await wait(500); }
  throw new ActError(what + " did not take.");
}

async function type(page, text) {
  await page.keyboard.type(text, { delay: 25 + Math.floor(Math.random() * 35) });
  await wait(600, 1400);
}

async function need(scope, selectors, what) {
  if (!(await click(scope, selectors))) throw new ActError("No " + what + " button on the page.");
}

/** Scrolls a results page and collects what read() finds until n or three screens. */
async function collect(page, extract, n) {
  const seen = new Map();
  for (let i = 0; i < 3 && seen.size < n; i += 1) {
    (await page.evaluate(extract).catch(() => [])).forEach((r) => { if (r && r.id && !seen.has(r.id)) seen.set(r.id, r); });
    await page.mouse.wheel(0, 2200);
    await wait(1800, 3200);
  }
  return Array.from(seen.values()).slice(0, n);
}

const text = async (loc) => ((await loc.first().innerText({ timeout: 4000 }).catch(() => "")) || "").trim();
const role = (label) => "[role=button]:has(svg[aria-label='" + label + "']), [role=button]:has(svg[title='" + label + "'])";

// --- X ------------------------------------------------------------------------------------------------------------

const xFocal = (page) => page.locator("article[data-testid='tweet'][tabindex='-1'], article[data-testid='tweet']").first();

const x = {
  name: "X", home: "https://x.com/home", login: "https://x.com/i/flow/login", cookie: ["x.com", "auth_token"],
  queries: ["accessibility", "a11y", "\"core web vitals\"", "\"web performance\"", "\"technical seo\"", "playwright", "\"test automation\"", "WCAG", "\"AI overviews\"", "GA4", "\"software testing\"", "\"site speed\""],
  search: (q) => "https://x.com/search?q=" + encodeURIComponent(q + " min_faves:5 -filter:replies") + "&src=typed_query&f=top",
  async read(page, q) {
    await go(page, x.search(q), "X");
    const rows = await collect(page, () => Array.from(document.querySelectorAll("article[data-testid='tweet']")).map((a) => {
      const link = Array.from(a.querySelectorAll("a[href*='/status/']")).find((l) => l.querySelector("time"));
      const m = link && link.getAttribute("href").match(/^\/([^/]+)\/status\/(\d+)/);
      if (!m || a.querySelector("[data-testid='placementTracking']")) return null;
      const t = a.querySelector("[data-testid='tweetText']");
      const label = (id) => { const b = a.querySelector("[data-testid='" + id + "']"); return b ? b.getAttribute("aria-label") || b.innerText : ""; };
      const views = a.querySelector("a[href$='/analytics']");
      const who = a.querySelector("[data-testid='User-Name']");
      return {
        id: m[2], handle: m[1], url: "https://x.com/" + m[1] + "/status/" + m[2], name: who ? who.innerText.split("\n")[0] : m[1],
        text: t ? t.innerText : "", lang: t ? t.getAttribute("lang") || "" : "", createdAt: link.querySelector("time").getAttribute("datetime"),
        replies: label("reply"), reposts: label("retweet") || label("unretweet"), likes: label("like") || label("unlike"), views: views ? views.getAttribute("aria-label") : ""
      };
    }).filter(Boolean), 30);
    return rows.map((r) => post("x", r));
  },
  async account(page) {
    await go(page, x.home, "X");
    const m = (await text(page.locator("[data-testid='SideNav_AccountSwitcher_Button']"))).match(/@\w+/);
    return m ? m[0] : "";
  },
  async like(page, d) {
    await go(page, d.url, "X");
    const a = xFocal(page);
    if (!(await has(a, "[data-testid='unlike']"))) { await need(a, "[data-testid='like']", "like"); await until(a, "[data-testid='unlike']", "The like"); }
    return { url: d.url };
  },
  async repost(page, d) {
    await go(page, d.url, "X");
    const a = xFocal(page);
    if (!(await has(a, "[data-testid='unretweet']"))) {
      await need(a, "[data-testid='retweet']", "repost");
      await need(page, "[data-testid='retweetConfirm']", "repost menu");
      await until(a, "[data-testid='unretweet']", "The repost");
    }
    return { url: d.url };
  },
  async follow(page, d) {
    const url = "https://x.com/" + encodeURIComponent(d.author.handle);
    await go(page, url, "X");
    if (!(await has(page, "[data-testid$='-unfollow']"))) { await need(page, "[data-testid$='-follow']", "follow"); await until(page, "[data-testid$='-unfollow']", "The follow"); }
    return { url };
  },
  async reply(page, d, body) {
    await go(page, d.url, "X");
    await need(page, "[data-testid='tweetTextarea_0']", "reply box");
    await type(page, body);
    await need(page, "[data-testid='tweetButtonInline']", "Reply");
    await until(page, "[data-testid='toast']", "The reply");
    const href = await page.locator("[data-testid='toast'] a[href*='/status/']").first().getAttribute("href").catch(() => "");
    return { url: href ? "https://x.com" + href : d.url };
  }
};

// --- LinkedIn -----------------------------------------------------------------------------------------------------

const liPost = (page) => page.locator("div.feed-shared-update-v2, [data-urn*='urn:li:activity:'], main article").first();

const linkedin = {
  name: "LinkedIn", home: "https://www.linkedin.com/feed/", login: "https://www.linkedin.com/login", cookie: ["linkedin.com", "li_at"],
  queries: ["web accessibility", "core web vitals", "technical SEO", "playwright testing", "test automation", "WCAG", "AI overviews", "GA4", "website performance", "QA automation"],
  search: (q) => "https://www.linkedin.com/search/results/content/?keywords=" + encodeURIComponent(q) + "&datePosted=%22past-week%22&sortBy=%22relevance%22",
  async read(page, q) {
    await go(page, linkedin.search(q), "LinkedIn");
    const rows = await collect(page, () => {
      const boxes = new Set();
      document.querySelectorAll("[data-urn*='urn:li:activity:'], [data-id*='urn:li:activity:']").forEach((e) => boxes.add(e));
      document.querySelectorAll("a[href*='/feed/update/urn:li:activity:']").forEach((a) => boxes.add(a.closest("li") || a.closest("div[data-view-name]") || a.parentElement));
      return Array.from(boxes).filter(Boolean).map((b) => {
        const urn = ((b.getAttribute("data-urn") || b.getAttribute("data-id") || "") + " " + Array.from(b.querySelectorAll("a[href*='urn:li:activity:']")).map((a) => a.getAttribute("href")).join(" ")).match(/urn:li:activity:(\d+)/);
        if (!urn) return null;
        const actor = b.querySelector("a.update-components-actor__meta-link, a.app-aware-link[href*='/in/'], a[href*='/in/'], a[href*='/company/']");
        const href = actor ? actor.getAttribute("href") || "" : "";
        const handle = (href.match(/\/(in|company)\/([^/?]+)/) || [])[2] || "";
        const nameEl = b.querySelector(".update-components-actor__title span[aria-hidden='true'], .update-components-actor__name span[aria-hidden='true']");
        const body = b.querySelector(".update-components-text, .feed-shared-update-v2__description, .feed-shared-inline-show-more-text, [data-test-id='main-feed-activity-card__commentary']");
        const reactions = b.querySelector(".social-details-social-counts__reactions-count, [data-test-id='social-actions__reaction-count']");
        const comments = b.querySelector("button[aria-label*='comment' i], .social-details-social-counts__comments");
        const reposts = b.querySelector("button[aria-label*='repost' i], .social-details-social-counts__item--right-aligned");
        return {
          id: urn[1], handle, url: "https://www.linkedin.com/feed/update/urn:li:activity:" + urn[1] + "/", name: nameEl ? nameEl.innerText : handle,
          authorId: href.split("?")[0], text: body ? body.innerText : "", likes: reactions ? reactions.innerText : "",
          replies: comments ? comments.getAttribute("aria-label") || comments.innerText : "", reposts: reposts ? reposts.getAttribute("aria-label") || reposts.innerText : ""
        };
      }).filter(Boolean);
    }, 25);
    return rows.map((r) => Object.assign(post("linkedin", r), { createdAt: linkedinTime(r.id) }));
  },
  async account(page) {
    await go(page, linkedin.home, "LinkedIn");
    const alt = await page.locator("img.global-nav__me-photo").first().getAttribute("alt").catch(() => "");
    return String(alt || "").trim() || "signed in";
  },
  async like(page, d) {
    await go(page, d.url, "LinkedIn");
    const p = liPost(page);
    const btn = "button.react-button__trigger, button[aria-label*='React Like' i], button[aria-label*='Recomendar']";
    if (!(await has(p, "button.react-button__trigger[aria-pressed='true'], button[aria-label*='React Like' i][aria-pressed='true']"))) {
      await need(p, btn, "like");
      await until(p, "button[aria-pressed='true'].react-button__trigger, button[aria-pressed='true'][aria-label*='Like' i], button[aria-pressed='true'][aria-label*='Recomendar']", "The like");
    }
    return { url: d.url };
  },
  async repost(page, d) {
    await go(page, d.url, "LinkedIn");
    await need(liPost(page), "button.social-reshare-button, button[aria-label*='Repost' i], button[aria-label*='Compartir' i]", "repost");
    await need(page, "[role=menuitem]:has-text('Repost'), .artdeco-dropdown__item:has-text('Repost'), [role=menuitem]:has-text('Compartir'), .artdeco-dropdown__item:has-text('Compartir')", "Repost menu");
    await until(page, ".artdeco-toast-item, [role=alert]", "The repost");
    return { url: d.url };
  },
  async follow(page, d) {
    await go(page, d.url, "LinkedIn");
    const p = liPost(page);
    if (await has(p, "button[aria-label^='Following' i], button[aria-label^='Siguiendo' i]")) return { url: d.url };
    await need(p, "button[aria-label^='Follow' i], button[aria-label^='Seguir' i], button.follow", "follow");
    await until(p, "button[aria-label^='Following' i], button[aria-label^='Siguiendo' i], button[aria-label*='Unfollow' i]", "The follow");
    return { url: d.url };
  },
  async reply(page, d, body) {
    await go(page, d.url, "LinkedIn");
    const p = liPost(page);
    await click(p, "button[aria-label='Comment'], button.comment-button, button[aria-label='Comentar']");
    await need(page, ".comments-comment-box .ql-editor, div.ql-editor[contenteditable='true'], div[role='textbox'][contenteditable='true']", "comment box");
    await type(page, body);
    await need(page, "button.comments-comment-box__submit-button--cr, button.comments-comment-box__submit-button, form.comments-comment-box__form button[type='submit']", "Comment");
    await until(page, ".comments-comment-item, article.comments-comment-entity", "The comment");
    return { url: d.url };
  }
};

// --- Threads ------------------------------------------------------------------------------------------------------

const thPost = (page) => page.locator("[data-pressable-container]").filter({ has: page.locator("a[href*='/post/'] time") }).first();

const threads = {
  name: "Threads", home: "https://www.threads.com/", login: "https://www.threads.com/login", cookie: ["threads.com", "sessionid"],
  queries: ["web accessibility", "accessibility", "core web vitals", "technical seo", "playwright", "test automation", "WCAG", "web performance", "SEO", "software testing"],
  search: (q) => "https://www.threads.com/search?q=" + encodeURIComponent(q) + "&serp_type=default",
  async read(page, q) {
    await go(page, threads.search(q), "Threads");
    const rows = await collect(page, () => Array.from(document.querySelectorAll("[data-pressable-container]")).map((c) => {
      const link = Array.from(c.querySelectorAll("a[href*='/post/']")).find((a) => a.querySelector("time"));
      const m = link && link.getAttribute("href").match(/^\/@([^/]+)\/post\/([^/?]+)/);
      if (!m) return null;
      const count = (labels) => { const svg = Array.from(c.querySelectorAll("[role=button] svg")).find((s) => labels.includes(s.getAttribute("aria-label") || s.getAttribute("title"))); return svg ? svg.closest("[role=button]").innerText : ""; };
      const lines = c.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
      const body = lines.slice(2).filter((l) => !/^\d[\d.,]*\s*[KkMm]?$/.test(l)).join("\n");
      return {
        id: m[2], handle: m[1], url: "https://www.threads.com/@" + m[1] + "/post/" + m[2], name: m[1], text: body, createdAt: link.querySelector("time").getAttribute("datetime"),
        likes: count(["Like", "Unlike", "Me gusta", "Ya no me gusta"]), replies: count(["Comment", "Reply", "Comentar", "Responder"]), reposts: count(["Repost", "Republicar"])
      };
    }).filter(Boolean), 30);
    return rows.map((r) => post("threads", r));
  },
  async account(page) {
    await go(page, threads.home, "Threads");
    const href = await page.locator("a[href^='/@'][role=link]:has(svg)").first().getAttribute("href").catch(() => "");
    return href ? href.slice(1) : "signed in";
  },
  async like(page, d) {
    await go(page, d.url, "Threads");
    const p = thPost(page);
    if (!(await has(p, [role("Unlike"), role("Ya no me gusta")]))) { await need(p, [role("Like"), role("Me gusta")], "like"); await until(p, [role("Unlike"), role("Ya no me gusta")], "The like"); }
    return { url: d.url };
  },
  async repost(page, d) {
    await go(page, d.url, "Threads");
    await need(thPost(page), [role("Repost"), role("Republicar")], "repost");
    await need(page, "[role=menuitem]:has-text('Repost'), [role=button]:text-is('Repost'), [role=menuitem]:has-text('Republicar'), [role=button]:text-is('Republicar')", "Repost menu");
    await wait(2000, 3000);
    return { url: d.url };
  },
  async follow(page, d) {
    const url = "https://www.threads.com/@" + encodeURIComponent(d.author.handle);
    await go(page, url, "Threads");
    if (await has(page, "[role=button]:text-is('Following'), [role=button]:text-is('Siguiendo')")) return { url };
    await need(page, "[role=button]:text-is('Follow'), [role=button]:text-is('Seguir')", "follow");
    await until(page, "[role=button]:text-is('Following'), [role=button]:text-is('Siguiendo')", "The follow");
    return { url };
  },
  async reply(page, d, body) {
    await go(page, d.url, "Threads");
    await need(thPost(page), [role("Reply"), role("Comment"), role("Responder"), role("Comentar")], "reply");
    const box = page.locator("[role=dialog]").last();
    await need(box, "[contenteditable='true'][role='textbox']", "reply box");
    await type(page, body);
    await need(box, "[role=button]:text-is('Post'), [role=button]:text-is('Publicar')", "Post");
    await until(page, "a[href*='/post/']:has-text('View'), [role=alert], [role=status]", "The reply");
    return { url: d.url };
  }
};

// --- Instagram ----------------------------------------------------------------------------------------------------

const instagram = {
  name: "Instagram", home: "https://www.instagram.com/", login: "https://www.instagram.com/accounts/login/", cookie: ["instagram.com", "sessionid"],
  queries: ["webaccessibility", "accessibility", "webdevelopment", "seo", "technicalseo", "softwaretesting", "qa", "webdesign", "webperformance", "uxdesign"],
  search: (q) => "https://www.instagram.com/explore/tags/" + encodeURIComponent(q) + "/",
  async read(page, q) {
    await go(page, instagram.search(q), "Instagram");
    const links = (await page.$$eval("a[href*='/p/'], a[href*='/reel/']", (as) => as.map((a) => a.getAttribute("href")))).filter(Boolean);
    const out = [];
    for (const href of Array.from(new Set(links)).slice(0, 6)) {
      const m = href.match(/\/(p|reel)\/([^/?]+)/);
      if (!m) continue;
      const url = "https://www.instagram.com/" + m[1] + "/" + m[2] + "/";
      await go(page, url, "Instagram");
      const r = await page.evaluate(() => {
        const cap = document.querySelector("h1");
        const time = document.querySelector("time[datetime]");
        const owner = Array.from(document.querySelectorAll("header a[href^='/']")).map((a) => a.getAttribute("href").replace(/\//g, "")).find((h) => h && !/^(explore|reels|p)$/.test(h));
        const likes = (document.body.innerText.match(/([\d.,]+\s*[KkMm]?)\s+(likes|Me gusta)/) || [])[1] || "";
        return { text: cap ? cap.innerText : "", createdAt: time ? time.getAttribute("datetime") : "", handle: owner || "", likes };
      });
      out.push(post("instagram", Object.assign({ id: m[2], url, name: r.handle }, r)));
      await wait(1500, 3000);
    }
    return out;
  },
  async account(page) {
    await go(page, "https://www.instagram.com/accounts/edit/", "Instagram");
    const v = await page.locator("input[name='username']").first().inputValue().catch(() => "");
    return v ? "@" + v : "signed in";
  },
  async like(page, d) {
    await go(page, d.url, "Instagram");
    if (!(await has(page, [role("Unlike"), role("Ya no me gusta")]))) { await need(page, [role("Like"), role("Me gusta")], "like"); await until(page, [role("Unlike"), role("Ya no me gusta")], "The like"); }
    return { url: d.url };
  },
  async follow(page, d) {
    await go(page, d.url, "Instagram");
    const head = page.locator("header").first();
    if (await has(head, "[role=button]:text-is('Following'), button:text-is('Following'), [role=button]:text-is('Siguiendo'), button:text-is('Siguiendo')")) return { url: d.url };
    await need(head, "[role=button]:text-is('Follow'), button:text-is('Follow'), [role=button]:text-is('Seguir'), button:text-is('Seguir')", "follow");
    await until(head, "[role=button]:text-is('Following'), button:text-is('Following'), [role=button]:text-is('Siguiendo'), button:text-is('Siguiendo')", "The follow");
    return { url: d.url };
  },
  async reply(page, d, body) {
    await go(page, d.url, "Instagram");
    await need(page, "textarea[aria-label*='comment' i], textarea[aria-label*='comentario' i]", "comment box");
    await type(page, body);
    await need(page, "[role=button]:text-is('Post'), [role=button]:text-is('Publicar')", "Post");
    await wait(2500, 4000);
    return { url: d.url };
  }
};

// --- Facebook -----------------------------------------------------------------------------------------------------

const facebook = {
  name: "Facebook", home: "https://www.facebook.com/", login: "https://www.facebook.com/login", cookie: ["facebook.com", "c_user"],
  queries: ["web accessibility", "core web vitals", "technical SEO", "website speed", "software testing", "test automation", "WCAG", "Google AI overviews"],
  search: (q) => "https://www.facebook.com/search/posts?q=" + encodeURIComponent(q) + "&filters=eyJyZWNlbnRfcG9zdHM6MCI6IntcIm5hbWVcIjpcInJlY2VudF9wb3N0c1wiLFwiYXJnc1wiOlwiXCJ9In0%3D",
  async read(page, q) {
    await go(page, facebook.search(q), "Facebook");
    const rows = await collect(page, () => Array.from(document.querySelectorAll("[role=feed] [role=article], [role=feed] > div")).map((a) => {
      const link = Array.from(a.querySelectorAll("a[href]")).map((l) => l.href).find((h) => /\/posts\/|story_fbid=|\/permalink\/|\/videos\/|\/reel\//.test(h));
      if (!link) return null;
      const u = new URL(link);
      const id = u.searchParams.get("story_fbid") || (u.pathname.match(/\/(posts|permalink|videos|reel)\/([^/?]+)/) || [])[2];
      if (!id) return null;
      const who = a.querySelector("h2 a, h3 a, h4 a, strong a");
      const msg = a.querySelector("[data-ad-preview='message'], [data-ad-comet-preview='message']");
      const count = (re) => (a.innerText.match(re) || [])[1] || "";
      return {
        id, url: u.origin + u.pathname + (u.searchParams.get("story_fbid") ? "?story_fbid=" + id + "&id=" + u.searchParams.get("id") : ""), handle: who ? (who.getAttribute("href") || "").split("?")[0].replace(/^https:\/\/www\.facebook\.com\//, "").replace(/\/$/, "") : "",
        name: who ? who.innerText : "", text: msg ? msg.innerText : "", likes: count(/(?:All reactions|Todas las reacciones):?\s*([\d.,]+\s*[KkMm]?)/), replies: count(/([\d.,]+\s*[KkMm]?)\s+(?:comments|comentarios)/i), reposts: count(/([\d.,]+\s*[KkMm]?)\s+(?:shares|veces compartido)/i)
      };
    }).filter((r) => r && r.text), 20);
    return rows.map((r) => post("facebook", r));
  },
  async account(page) {
    await go(page, facebook.home, "Facebook");
    const label = await page.locator("[aria-label='Your profile'], [aria-label='Tu perfil']").first().getAttribute("aria-label").catch(() => "");
    return label ? "signed in" : "signed in";
  },
  async like(page, d) {
    await go(page, d.url, "Facebook");
    if (!(await has(page, "[role=button][aria-label='Remove Like'], [role=button][aria-label='Quitar Me gusta']"))) {
      await need(page, "[role=button][aria-label='Like'], [role=button][aria-label='Me gusta']", "like");
      await until(page, "[role=button][aria-label='Remove Like'], [role=button][aria-label='Quitar Me gusta']", "The like");
    }
    return { url: d.url };
  },
  async reply(page, d, body) {
    await go(page, d.url, "Facebook");
    await click(page, "[role=button][aria-label='Leave a comment'], [role=button][aria-label='Comment'], [role=button][aria-label='Comentar']");
    await need(page, "[contenteditable='true'][role='textbox']", "comment box");
    await type(page, body);
    await page.keyboard.press("Enter");
    await wait(2500, 4000);
    return { url: d.url };
  }
};

// --- TikTok -------------------------------------------------------------------------------------------------------

const tiktok = {
  name: "TikTok", home: "https://www.tiktok.com/foryou", login: "https://www.tiktok.com/login", cookie: ["tiktok.com", "sessionid"],
  queries: ["web accessibility", "core web vitals", "technical seo", "playwright testing", "qa testing", "website speed", "seo tips", "software testing"],
  search: (q) => "https://www.tiktok.com/search/video?q=" + encodeURIComponent(q),
  async read(page, q) {
    await go(page, tiktok.search(q), "TikTok");
    const rows = await collect(page, () => Array.from(document.querySelectorAll("[data-e2e='search_video-item'], [id^='grid-item-container'], [data-e2e='search_top-item']")).map((c) => {
      const link = c.querySelector("a[href*='/video/']") || (c.closest("div") || c).querySelector("a[href*='/video/']");
      const m = link && link.getAttribute("href").match(/@([^/]+)\/video\/(\d+)/);
      if (!m) return null;
      const box = c.parentElement || c;
      const cap = box.querySelector("[data-e2e='search-card-video-caption'], [data-e2e='search-card-desc'], [data-e2e='video-desc']");
      const views = box.querySelector("[data-e2e='video-views'], strong[data-e2e='video-views']");
      return { id: m[2], handle: m[1], url: "https://www.tiktok.com/@" + m[1] + "/video/" + m[2], name: m[1], text: cap ? cap.innerText : "", views: views ? views.innerText : "" };
    }).filter((r) => r && r.text), 24);
    return rows.map((r) => Object.assign(post("tiktok", r), { createdAt: tiktokTime(r.id) }));
  },
  async account(page) {
    await go(page, tiktok.home, "TikTok");
    const href = await page.locator("[data-e2e='nav-profile'] a, a[data-e2e='nav-profile']").first().getAttribute("href").catch(() => "");
    const m = String(href || "").match(/@([^/?]+)/);
    return m ? "@" + m[1] : "signed in";
  },
  async like(page, d) {
    await go(page, d.url, "TikTok");
    const btn = "button:has([data-e2e='like-icon']), button:has([data-e2e='browse-like-icon'])";
    if (!(await has(page, "button[aria-pressed='true']:has([data-e2e='like-icon']), button[aria-pressed='true']:has([data-e2e='browse-like-icon'])"))) {
      await need(page, btn, "like");
      await until(page, "button[aria-pressed='true']:has([data-e2e='like-icon']), button[aria-pressed='true']:has([data-e2e='browse-like-icon'])", "The like");
    }
    return { url: d.url };
  },
  async follow(page, d) {
    await go(page, d.url, "TikTok");
    const sel = "[data-e2e='browse-follow'], [data-e2e='follow-button'], button:text-is('Follow'), button:text-is('Seguir')";
    if (await has(page, "button:text-is('Following'), button:text-is('Siguiendo'), [data-e2e='browse-follow']:text-is('Following')")) return { url: d.url };
    await need(page, sel, "follow");
    await until(page, "button:text-is('Following'), button:text-is('Siguiendo'), button:text-is('Friends'), button:text-is('Amigos')", "The follow");
    return { url: d.url };
  },
  async reply(page, d, body) {
    await go(page, d.url, "TikTok");
    await click(page, "[data-e2e='comment-icon'], button:has([data-e2e='comment-icon'])");
    await need(page, "[data-e2e='comment-input'] [contenteditable='true'], div[contenteditable='true'][role='textbox']", "comment box");
    await type(page, body);
    await need(page, "[data-e2e='comment-post'], [role=button][data-e2e='comment-post']", "Post");
    await wait(2500, 4000);
    return { url: d.url };
  }
};

const NETWORKS = { x, linkedin, facebook, instagram, threads, tiktok };

module.exports = { NETWORKS, num, linkedinTime, tiktokTime, tagsOf, post, WALL };
