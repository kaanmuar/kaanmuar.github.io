/* Search index coverage (#2480): which of our sitemap pages Brave has indexed, and the weekly push for the rest.

   check(ctx)  Brave's site: search against both live sitemaps (the daily jarvisIndexCheck job). Page one each day (one
               call); pages 2-5 only weekly, and only once page one is full. Kept in jarvis_cache/brave-index with
               zeroSince, the day Brave last had none.
   read(ctx)   that last check for the search source, without a Brave call.
   gaps(ctx)   the sitemap pages missing from the last check (no Brave call), main sitemap first.
   push(ctx)   every missing page to IndexNow (Bing, Yandex, Seznam, Naver) in one call, and up to BRAVE_WEEK of them
               through Brave's Submit URL form (reviewBrowser "brave-submit"), none sent to Brave again within
               RESEND_DAYS (the Monday jarvisIndexPush job). Kept in jarvis_cache/index-push.
   Both are rows in ops-schedule.js, so opsWatchdog reports a missed run and Jarvis re-runs a failed one.

   ctx = { fetch, env, db, now, browse(job) -> reviewBrowser's answer } */

const ORIGIN = "https://carlosandmunoz.com";
const DOMAIN = "carlosandmunoz.com";
const SITEMAPS = [{ path: "/sitemap.xml", main: true }, { path: "/sitemap-social.xml", main: false }];
const INDEXNOW_KEY = "c1ab1d693aa44efeae5463b429a4813e";
const PAGE = 20;
const PAGES = 5;
const DAY = 24 * 60 * 60 * 1000;
const DEEP_EVERY = 7 * DAY;
const FRESH = 2 * DAY;
const BRAVE_WEEK = 24;
const BRAVE_BATCH = 8;
const RESEND_DAYS = 28;

const clean = (error) => String((error && error.message) || error || "").replace(/\s+/g, " ").slice(0, 200);

// The same page however Brave or the sitemap writes it: no www, no trailing slash, no .html, no index.
function pageKey(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== DOMAIN) return "";
    return u.pathname.replace(/\/index\.html$|\.html$/, "").replace(/\/+$/, "") || "/";
  } catch (error) {
    return "";
  }
}

async function sitemapPages(fetchFn) {
  const pages = [];
  const seen = new Set();
  for (const map of SITEMAPS) {
    const res = await fetchFn(ORIGIN + map.path, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(map.path + " answered " + res.status);
    for (const m of (await res.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const key = pageKey(m[1]);
      if (key && !seen.has(key)) { seen.add(key); pages.push({ url: m[1], main: map.main }); }
    }
  }
  return pages;
}

async function braveSite(ctx, key, page) {
  const res = await ctx.fetch(`https://api.search.brave.com/res/v1/web/search?count=${PAGE}&offset=${page}&q=` + encodeURIComponent("site:" + DOMAIN),
    { headers: { "X-Subscription-Token": key, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error("Brave answered " + res.status);
  const data = await res.json();
  return { urls: ((data.web || {}).results || []).map((r) => r.url).filter((u) => pageKey(u)), more: (data.query || {}).more_results_available !== false };
}

const state = async (ctx, id) => {
  if (!ctx.db) return {};
  const snap = await ctx.db.collection("jarvis_cache").doc(id).get().catch(() => null);
  return snap && snap.exists ? snap.data() : {};
};
const save = (ctx, id, row) => (ctx.db ? ctx.db.collection("jarvis_cache").doc(id).set(row).catch(() => null) : null);

function coverage(pages, indexedUrls) {
  const indexed = new Set(indexedUrls.map(pageKey));
  const missing = pages.filter((p) => !indexed.has(pageKey(p.url)));
  return { total: pages.length, indexed: pages.length - missing.length, missing: missing.sort((a, b) => Number(b.main) - Number(a.main)) };
}

async function check(ctx) {
  const key = (ctx.env || {}).BRAVE_SEARCH_KEY;
  if (!key) return { ok: false, error: "BRAVE_SEARCH_KEY is not set." };
  const now = ctx.now || Date.now();
  let pages;
  try { pages = await sitemapPages(ctx.fetch); } catch (error) { return { ok: false, error: "Sitemap: " + clean(error) }; }
  const saved = await state(ctx, "brave-index");
  let first;
  try { first = await braveSite(ctx, key, 0); } catch (error) { return { ok: false, error: clean(error) }; }
  let deep = saved.deepUrls || [];
  let deepAt = saved.deepAt || null;
  if (first.urls.length >= PAGE && first.more && !(deepAt && now - Date.parse(deepAt) < DEEP_EVERY)) {
    deep = [];
    try {
      for (let page = 1; page < PAGES; page++) {
        const next = await braveSite(ctx, key, page);
        deep.push(...next.urls);
        if (next.urls.length < PAGE || !next.more) break;
      }
      deepAt = new Date(now).toISOString();
    } catch (error) {
      deep = saved.deepUrls || [];
    }
  }
  const urls = first.urls.length >= PAGE ? first.urls.concat(deep) : first.urls;
  const cov = coverage(pages, urls);
  const row = {
    at: new Date(now).toISOString(), urls: first.urls, deepUrls: deep, deepAt, zeroSince: cov.indexed ? null : saved.zeroSince || new Date(now).toISOString(),
    indexed: cov.indexed, total: cov.total, missing: cov.missing.length, mainMissing: cov.missing.filter((p) => p.main).map((p) => p.url)
  };
  await save(ctx, "brave-index", row);
  return view(row, await state(ctx, "index-push"));
}

function view(saved, pushed) {
  return { ok: true, at: saved.at, total: saved.total, indexed: saved.indexed, missing: saved.missing, mainMissing: saved.mainMissing || [], zeroSince: saved.zeroSince || null, pushedAt: pushed.at || null, pushed: pushed.last || null };
}

// The last check for the panel and the briefing, without a Brave call.
async function read(ctx) {
  const saved = await state(ctx, "brave-index");
  if (!saved.at || saved.total === undefined) return { ok: false, error: "Not checked yet: jarvisIndexCheck runs daily." };
  return view(saved, await state(ctx, "index-push"));
}

async function gaps(ctx) {
  const now = ctx.now || Date.now();
  const saved = await state(ctx, "brave-index");
  if (!saved.at || now - Date.parse(saved.at) > FRESH) return null;
  const urls = (saved.urls || []).length >= PAGE ? saved.urls.concat(saved.deepUrls || []) : saved.urls || [];
  return coverage(await sitemapPages(ctx.fetch), urls).missing;
}

async function indexNow(fetchFn, urls) {
  const res = await fetchFn("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: DOMAIN, key: INDEXNOW_KEY, keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(30000)
  });
  if (res.status !== 200 && res.status !== 202) throw new Error("IndexNow answered " + res.status);
  return res.status;
}

async function push(ctx, missing) {
  const now = ctx.now || Date.now();
  const list = missing || (await gaps(ctx)) || [];
  if (!list.length) return { detail: "Nothing missing from Brave's index." };
  const saved = await state(ctx, "index-push");
  const sent = Object.assign({}, saved.urls || {});
  const last = { at: new Date(now).toISOString(), missing: list.length, indexnow: null, brave: 0, braveFailed: 0 };
  const notes = [];
  try {
    last.indexnow = await indexNow(ctx.fetch, list.map((p) => p.url));
    notes.push(`IndexNow took ${list.length} pages`);
  } catch (error) {
    last.indexnow = clean(error);
    notes.push("IndexNow failed: " + last.indexnow);
  }
  const due = list.filter((p) => !sent[p.url] || now - Date.parse(sent[p.url]) >= RESEND_DAYS * DAY).slice(0, BRAVE_WEEK);
  if (due.length && ctx.browse) {
    const batches = [];
    for (let i = 0; i < due.length; i += BRAVE_BATCH) batches.push(due.slice(i, i + BRAVE_BATCH).map((p) => p.url));
    const answers = await Promise.all(batches.map((urls) => ctx.browse({ kind: "brave-submit", urls }).catch((error) => ({ ok: false, error: clean(error), urls }))));
    answers.forEach((answer, i) => {
      const rows = answer && answer.ok ? answer.results || [] : batches[i].map((url) => ({ url, ok: false, text: (answer && answer.error) || "no answer" }));
      for (const row of rows) {
        if (row.ok) { sent[row.url] = last.at; last.brave++; } else { last.braveFailed++; last.braveError = row.text; }
      }
    });
    notes.push(`Brave took ${last.brave} of ${due.length}` + (last.braveFailed ? ` (${last.braveError})` : ""));
  } else if (!due.length) notes.push(`Brave: all ${list.length} were sent within ${RESEND_DAYS} days`);
  await save(ctx, "index-push", { at: last.at, urls: sent, last });
  if (last.indexnow !== 200 && last.indexnow !== 202 && !last.brave) throw new Error(notes.join("; ") + ".");
  return { detail: list.length + " pages missing from Brave's index. " + notes.join("; ") + "." };
}

module.exports = { check, read, gaps, push, pageKey, coverage, sitemapPages, BRAVE_WEEK, RESEND_DAYS };
