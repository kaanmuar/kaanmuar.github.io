/* Signs that a site was hacked for search spam (#3088):
   - spam pages on the domain in web search: one Brave query per review (site:<domain> with spam words);
   - cloaking: the start page and up to two more, requested as Googlebot and as a phone browser at the same moment.
     Only the user agent differs, so a geo or language redirect answers both alike. Googlebot's verified IPs cannot
     be faked, so cloaking by IP is out of reach;
   - spam links or text in the HTML, hidden with CSS or not.
   Matches are phrases spammers use, not bare topic words, so a news story about Viagra or a casino does not count.
   A site whose own subject (schema type, title, description, h1) is pharmacy, gambling, lending, crypto or adult
   content does not count that topic, and a Japanese or Chinese site does not count Japanese text. */
"use strict";

const { URL } = require("url");
const { say, some } = require("./url-review-findings-en");
const { registrable } = require("./url-review-suffix");

const GOOGLEBOT = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.116 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const BUDGET_MS = 20000;
const EXTRA_PAGES = 2;
// Below this share of shared words, with a changed title, the two copies are different pages. A/B tests and
// rotating teasers keep the title and most of the text.
const SAME_TEXT = 0.5;
const NEW_HOSTS = 5;
const KANA_MIN = 6;

const DRUGS = "viagra|cialis|levitra|kamagra|tadalafil|sildenafil|vardenafil|xanax|tramadol|valium|ambien|oxycodone|adderall|phentermine";
const SPAM = [
  ["pharma", new RegExp("\\b(?:buy|order|cheap|generic|discount)\\s+(?:\\w+\\s+){0,2}(?:" + DRUGS + ")\\b", "i")],
  ["pharma", new RegExp("\\b(?:" + DRUGS + ")\\s+(?:online|without\\s+(?:a\\s+)?prescription|no\\s+prescription|for\\s+sale|pills?|price|kaufen|rezeptfrei|comprar|sin\\s+receta|acheter|sans\\s+ordonnance|senza\\s+ricetta)\\b", "i")],
  ["pharma", /\bkamagra\b/i],
  ["gambling", /\b(?:slot\s*gacor|maxwin|togel|sbobet|judi\s+(?:online|slot|bola)|situs\s+(?:slot|judi|togel|gacor)|bandar\s+(?:togel|judi|slot|bola)|rtp\s+slot|scatter\s+hitam|slot\s+(?:online\s+)?terpercaya|slot88|slot777)\b/i],
  ["gambling", /\b(?:online\s+casino|casino\s+online)\b[^.]{0,40}\b(?:bonus|free\s+spins|no\s+deposit|real\s+money)\b/i],
  ["gambling", /\bno\s+deposit\s+(?:casino\s+)?bonus\b/i],
  ["lending", /\b(?:payday\s+loans?|instant\s+(?:cash\s+)?loans?\s+online|loans?\s+(?:online\s+)?(?:with\s+)?no\s+credit\s+check|guaranteed\s+loan\s+approval)\b/i],
  ["replica", /\b(?:replica|fake|knock-?off|imitation)\s+(?:rolex|omega|cartier|patek|hublot|louis\s+vuitton|gucci|chanel|herm[eè]s|prada|dior|watch(?:es)?|handbags?|bags?|designer)\b/i],
  ["replica", /\bcheap\s+(?:nfl\s+|nba\s+|mlb\s+)?(?:jerseys|uggs?|oakleys?|ray-?bans?|michael\s+kors|louboutins?|jordans)\b/i],
  ["replica", /スーパーコピー|ブランドコピー|コピー品|偽物|[nN]級品/],
  ["crypto", /\b(?:crypto|bitcoin|btc|eth|usdt)\s+(?:casino|doubler|giveaway|airdrop)\b|\bclaim\s+(?:your\s+)?airdrop\b|\b(?:binance|coinbase|metamask|trust\s+wallet)\s+(?:customer\s+)?(?:support|helpline)\s+(?:number|phone)\b/i],
  ["adult", /\b(?:porn(?:o|hub)?|xvideos|xnxx|sex\s+(?:cams?|dating|videos?)|escort\s+(?:service|girls|agency)|hot\s+singles|onlyfans\s+leaks?)\b/i]
];
const SEARCH_WORDS = ["viagra", "cialis", "casino", "\"slot gacor\"", "togel", "replica", "\"payday loan\"", "crypto", "porn", "スーパーコピー", "激安"];

const TOPIC_WORDS = {
  pharma: /\b(?:pharmac\w*|drugstore|apothe[ck]\w*|farm[aá]c\w*|droguer\w*|medications?|prescriptions?|urolog\w*|men'?s\s+health)\b/i,
  gambling: /\b(?:casinos?|cassinos?|casin[oò]|betting|bookmakers?|sportsbook|poker|slot\s+machines?|online\s+slots|lotter\w*|lotto|gambling|wetten|apuestas|scommesse|paris\s+sportifs|apostas)\b/i,
  lending: /\b(?:loans?|lending|lenders?|credit|mortgages?|bank\w*|kredit\w*|darlehen|pr[eé]stamos?|cr[eé]ditos?|prestit[oi]|pr[eê]ts?|empr[eé]stimos?|finance|financial|finanz\w*)\b/i,
  crypto: /\b(?:crypto\w*|bitcoin|blockchain|krypto\w*|cripto\w*|web3|defi|nfts?)\b/i,
  adult: /\b(?:porn\w*|xxx|adult|escorts?|erotic\w*|sex\w*|dating)\b/i
};
const TOPIC_TYPES = {
  pharma: /^(?:Pharmacy|Drugstore)$/,
  gambling: /^Casino$/,
  lending: /^(?:FinancialService|BankOrCreditUnion|LoanOrCredit|MortgageLoan|CreditCard|AutomatedTeller)$/,
  adult: /^AdultEntertainment$/
};

function decode(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex) => { const code = parseInt(hex, 16); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity; })
    .replace(/&#(\d+);/g, (entity, dec) => { const code = Number(dec); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity; })
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp("[\\s\"'/]" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match ? decode(match[2] || match[3] || match[4] || "") : "";
}

const stripTags = (html) => decode(String(html || "").replace(/<[^>]+>/g, " "));

function visibleText(html) {
  return stripTags(String(html || "")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " "));
}

const hostOf = (href) => { try { return new URL(href).hostname.toLowerCase(); } catch (error) { return ""; } };
const pathOf = (href) => { try { const url = new URL(href); return url.pathname + url.search; } catch (error) { return String(href || ""); } };
const pathWords = (href) => { try { return decodeURIComponent(pathOf(href)).replace(/[-_/+=?&.]+/g, " "); } catch (error) { return pathOf(href).replace(/[-_/+=?&.]+/g, " "); } };

// The topics the site is about, so its own pharmacy, casino or loan pages are not read as spam.
function siteTopics(site) {
  const facts = site || {};
  const text = [facts.title, facts.description].concat(facts.h1 || []).join(" ");
  const types = facts.types || [];
  const topics = Object.keys(TOPIC_WORDS).filter((topic) => TOPIC_WORDS[topic].test(text) || (TOPIC_TYPES[topic] && types.some((type) => TOPIC_TYPES[topic].test(type))));
  if (/^(?:ja|zh)\b/i.test(String(facts.lang || ""))) topics.push("japanese");
  return topics;
}

// The spam phrases in a text, one per kind, leaving out the site's own topics.
function spamTerms(text, skip) {
  const value = String(text || "");
  const leave = skip || [];
  const terms = [];
  const found = new Set();
  SPAM.forEach(([topic, re]) => {
    if (leave.includes(topic) || found.has(topic)) return;
    const hit = value.match(re);
    if (!hit) return;
    found.add(topic);
    terms.push(hit[0].replace(/\s+/g, " ").toLowerCase().slice(0, 60));
  });
  if (!leave.includes("japanese") && (value.match(/[\u3040-\u30ff]/g) || []).length >= KANA_MIN) {
    terms.push((value.match(/[\u3040-\u30ff\u3400-\u9fff]+/g) || []).join(" ").slice(0, 30));
  }
  return terms;
}

function spamQuery(domain) {
  return "site:" + domain + " " + SEARCH_WORDS.join(" OR ");
}

// Search rows on the domain that carry spam phrases. Rows from other sites are dropped, since the query's operators
// are only a hint to the search engine.
function spamResults(rows, domain, skip) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const host = hostOf(row && row.url);
    if (!host || registrable(host) !== domain || seen.has(row.url)) return null;
    seen.add(row.url);
    const terms = spamTerms([row.title, pathWords(row.url), row.description].join(" "), skip);
    return terms.length ? { url: row.url, title: String(row.title || "").slice(0, 160), terms } : null;
  }).filter(Boolean);
}

function readPage(html, pageUrl) {
  const body = String(html || "");
  const titleMatch = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const metas = body.match(/<meta\b[^>]*>/gi) || [];
  const robots = metas.filter((tag) => /^(?:robots|googlebot)$/i.test(attr(tag, "name"))).map((tag) => attr(tag, "content").toLowerCase()).join(",");
  const links = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = re.exec(body)) && links.length < 2000) {
    let href = "";
    try { href = new URL(attr(match[1], "href"), pageUrl).toString(); } catch (error) { href = ""; }
    if (/^https?:/i.test(href)) links.push({ href, text: stripTags(match[2]).slice(0, 200), attrs: match[1] });
  }
  const text = visibleText(body);
  return {
    title: titleMatch ? stripTags(titleMatch[1]) : "",
    noindex: /\bnoindex\b|\bnone\b/.test(robots),
    links,
    text,
    words: new Set((text.toLowerCase().match(/\p{L}{3,}/gu) || []))
  };
}

function overlap(a, b) {
  if (!a.size && !b.size) return 1;
  let both = 0;
  a.forEach((word) => { if (b.has(word)) both += 1; });
  return both / (a.size + b.size - both);
}

const linkWords = (link) => link.text + " " + hostOf(link.href) + " " + pathWords(link.href);
const spamOf = (page, skip) => spamTerms([page.title, page.text, page.links.map(linkWords).join(" ")].join(" "), skip);

// One page as a phone browser and as Googlebot saw it: "spam" when Googlebot alone gets spam phrases, "differs" when
// it gets another page, "same" otherwise.
function compare(browser, bot, opts) {
  const options = opts || {};
  const skip = options.skip || [];
  const domain = options.domain || registrable(hostOf(browser.url));
  const seen = readPage(browser.body, browser.url);
  const served = readPage(bot.body, bot.url);
  const shown = new Set(spamOf(seen, skip));
  const terms = spamOf(served, skip).filter((term) => !shown.has(term));
  const similarity = overlap(seen.words, served.words);
  const hosts = (page) => new Set(page.links.map((link) => registrable(hostOf(link.href))).filter((host) => host && host !== domain));
  const shownHosts = hosts(seen);
  const newHosts = [...hosts(served)].filter((host) => !shownHosts.has(host));
  const fields = [];
  if (registrable(hostOf(bot.url)) !== registrable(hostOf(browser.url))) fields.push("address");
  if (seen.title.toLowerCase() !== served.title.toLowerCase() && similarity < SAME_TEXT) fields.push("content");
  if (seen.noindex !== served.noindex) fields.push("robots");
  if (newHosts.length >= NEW_HOSTS) fields.push("links");
  return {
    verdict: terms.length ? "spam" : fields.length ? "differs" : "same",
    terms,
    fields,
    newHosts: newHosts.slice(0, 5),
    similarity: Math.round(similarity * 100) / 100,
    titles: { browser: seen.title.slice(0, 120), bot: served.title.slice(0, 120) }
  };
}

const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|(?:left|top|text-indent|margin-left)\s*:\s*-\d{3,}(?:px|em)|font-size\s*:\s*[01](?:px)?\s*(?:;|$|!)|opacity\s*:\s*0\s*(?:;|$|!)|(?:height|width)\s*:\s*[01](?:px)?\s*;[^"']*overflow\s*:\s*hidden|overflow\s*:\s*hidden\s*;[^"']*(?:height|width)\s*:\s*[01](?:px)?\s*(?:;|$)/i;
const hiddenTag = (attrs) => HIDDEN_STYLE.test(attr(attrs, "style")) || /(?:^|\s)hidden(?:\s|=|$)/i.test(String(attrs).replace(/"[^"]*"|'[^']*'/g, "\"\""));

// Links and text with spam phrases in a page's HTML, marked hidden when CSS or the hidden attribute keeps them
// from visitors.
function spamLinks(html, pageUrl, skip) {
  const body = String(html || "").replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const rows = [];
  const seen = new Set();
  const push = (row) => {
    const key = row.href || row.text;
    if (seen.has(key) || rows.length >= 20) return;
    seen.add(key);
    rows.push(row);
  };
  const opens = /<(div|span|p|section|aside|footer|font|small|ul|li|ins|marquee)\b([^>]*)>/gi;
  let open;
  let scanned = 0;
  while ((open = opens.exec(body)) && scanned < 200) {
    if (!hiddenTag(open[2])) continue;
    scanned += 1;
    const inner = readPage(innerOf(body, open[1], opens.lastIndex), pageUrl);
    const links = inner.links.map((link) => ({ link, terms: spamTerms(linkWords(link), skip) })).filter((row) => row.terms.length);
    links.forEach(({ link, terms }) => push({ href: link.href, text: link.text.slice(0, 80), terms, hidden: true }));
    const terms = spamTerms(inner.text, skip);
    if (!links.length && terms.length) push({ href: "", text: inner.text.slice(0, 80), terms, hidden: true });
  }
  readPage(body, pageUrl).links.forEach((link) => {
    const terms = spamTerms(linkWords(link), skip);
    if (terms.length) push({ href: link.href, text: link.text.slice(0, 80), terms, hidden: hiddenTag(link.attrs) });
  });
  return rows;
}

// The HTML inside an element that opens just before `from`, up to its own closing tag.
function innerOf(html, name, from) {
  const tags = new RegExp("<(/?)" + name + "\\b[^>]*>", "gi");
  tags.lastIndex = from;
  let depth = 1;
  let tag;
  while ((tag = tags.exec(html)) && tag.index - from < 20000) {
    depth += tag[1] ? -1 : 1;
    if (!depth) return html.slice(from, tag.index);
  }
  return html.slice(from, from + 20000);
}

function within(promise, ms, fallback) {
  let timer = null;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]).finally(() => clearTimeout(timer));
}

const usable = (res, challenge) => !!res && res.status >= 200 && res.status < 300 && !(challenge && challenge(res));

/* opts: url and html of the start page; site: { title, description, h1, types, lang } of the start page;
   paths: other same-site addresses; fetch(url, agent) answers { url, status, headers, body };
   search(query) answers [{ title, url, description }] or is missing when web search is off;
   challenge(res) names a bot check page. Never rejects; parts that do not answer in time are null. */
async function look(opts) {
  const host = hostOf(opts.url);
  const domain = registrable(host);
  const skip = siteTopics(opts.site);
  const fetchAs = (url, agent) => Promise.resolve().then(() => opts.fetch(url, agent)).catch(() => null);
  const urls = [opts.url].concat((opts.paths || []).filter((url) => hostOf(url) === host && url !== opts.url).slice(0, EXTRA_PAGES));
  const searchJob = typeof opts.search === "function"
    ? Promise.resolve().then(() => opts.search(spamQuery(domain))).then((rows) => ({ query: spamQuery(domain), rows: spamResults(rows, domain, skip) })).catch(() => null)
    : Promise.resolve(null);
  const pageJob = Promise.all(urls.map(async (url) => {
    const [browser, bot] = await Promise.all([fetchAs(url, BROWSER), fetchAs(url, GOOGLEBOT)]);
    if (!usable(browser, opts.challenge)) return { url, path: pathOf(url), verdict: "unread", status: browser ? browser.status : 0 };
    if (!usable(bot, opts.challenge)) return { url, path: pathOf(url), verdict: "blocked", status: bot ? bot.status : 0, browser };
    return Object.assign({ url, path: pathOf(url), browser }, compare(browser, bot, { skip, domain }));
  }));
  const budget = opts.budgetMs || BUDGET_MS;
  const [search, pages] = await Promise.all([within(searchJob, budget, null), within(pageJob, budget, null)]);
  const links = [];
  const scanned = [{ url: opts.url, body: opts.html }].concat((pages || []).filter((page) => page.browser && page.url !== opts.url).map((page) => page.browser));
  scanned.forEach((page) => spamLinks(page.body, page.url, skip).forEach((row) => { if (links.length < 20 && !links.some((item) => item.href && item.href === row.href)) links.push(Object.assign({ path: pathOf(page.url) }, row)); }));
  return {
    domain,
    topics: skip,
    search,
    pages: pages ? pages.map((page) => { const out = Object.assign({}, page); delete out.browser; return out; }) : null,
    links,
    linksRead: scanned.map((page) => pathOf(page.url))
  };
}

// The review log's line for what look() found.
function line(signs) {
  if (!signs) return "The hacked-site checks did not answer in time.";
  const parts = [];
  if (signs.search) parts.push("web search for spam on " + signs.domain + ": " + (signs.search.rows.length ? signs.search.rows.length + " page" + (signs.search.rows.length === 1 ? "" : "s") + " with spam phrases" : "nothing"));
  const pages = signs.pages || [];
  const compared = pages.filter((page) => page.verdict === "spam" || page.verdict === "differs" || page.verdict === "same");
  if (compared.length) parts.push(compared.length + " page" + (compared.length === 1 ? "" : "s") + " compared as Googlebot and as a phone browser: " + compared.map((page) => page.path + " " + page.verdict).join(", "));
  const blocked = pages.filter((page) => page.verdict === "blocked");
  if (blocked.length) parts.push(blocked.map((page) => page.path).join(", ") + " refused the Googlebot user agent (status " + blocked.map((page) => page.status || "none").join(", ") + "), as bot protection does for a Googlebot outside Google's addresses");
  parts.push(signs.links.length ? signs.links.length + " link" + (signs.links.length === 1 ? "" : "s") + " with spam phrases in the HTML" + (signs.links.some((row) => row.hidden) ? ", some hidden" : "") : "no spam links in the HTML");
  return "Hacked-site checks: " + parts.join("; ") + ".";
}

const termList = (terms) => ({ items: terms.slice(0, 3).map((term) => "“" + term + "”") });

function findings(signs, add) {
  if (!signs) return;
  const fix = say("hack.fix");
  const search = signs.search;
  if (search) {
    const rows = search.rows;
    if (rows.length) add("Security", rows.length > 1 ? "fail" : "risk", rows.length > 1 ? "high" : "medium", "sec-seo-spam", say("sec-seo-spam.title", { n: rows.length, domain: signs.domain }),
      say("sec-seo-spam.evidence", { domain: signs.domain, list: some(rows.map((row) => say("pathNote", { path: row.url, note: termList(row.terms) })), 5) }), fix,
      { effort: "days", pages: rows.map((row) => row.url), count: rows.length });
    else add("Security", "pass", "info", "sec-seo-spam", say("sec-seo-spam.pass.title", { domain: signs.domain }), say("sec-seo-spam.pass.evidence", { domain: signs.domain }), "");
  }
  const pages = signs.pages || [];
  const spam = pages.filter((page) => page.verdict === "spam");
  const differs = pages.filter((page) => page.verdict === "differs");
  const same = pages.filter((page) => page.verdict === "same");
  if (spam.length) add("Security", "fail", "high", "sec-cloaking", say("sec-cloaking.spam.title"),
    say("sec-cloaking.spam.evidence", { list: { items: spam.map((page) => say("pathNote", { path: page.path, note: termList(page.terms) })), sep: "; " } }), fix,
    { effort: "days", pages: spam.map((page) => page.path) });
  else if (differs.length) add("Security", "risk", "medium", "sec-cloaking", say("sec-cloaking.differs.title"),
    say("sec-cloaking.differs.evidence", { list: { items: differs.map((page) => say("pathNote", { path: page.path, note: { items: page.fields.map((field) => say("hack.field." + field, field === "content" ? page.titles : field === "links" ? { hosts: { items: page.newHosts } } : {})), join: "and" } })), sep: "; " } }),
    say("sec-cloaking.differs.fix"), { effort: "hours", pages: differs.map((page) => page.path) });
  else if (same.length) add("Security", "pass", "info", "sec-cloaking", say("sec-cloaking.pass.title"), say("sec-cloaking.pass.evidence", { n: same.length }), "");
  const hidden = signs.links.filter((row) => row.hidden);
  const shown = signs.links.filter((row) => !row.hidden);
  const rowOf = (row) => say("pathNote", { path: row.href ? row.path + " → " + row.href : row.path, note: termList(row.terms) });
  if (hidden.length) add("Security", "fail", "high", "sec-spam-links", say("sec-spam-links.hidden.title"),
    say("sec-spam-links.hidden.evidence", { list: some(hidden.map(rowOf), 5) }), fix, { effort: "hours", pages: [...new Set(hidden.map((row) => row.path))], count: hidden.length });
  else if (shown.length) add("Security", "risk", "medium", "sec-spam-links", say("sec-spam-links.shown.title"),
    say("sec-spam-links.shown.evidence", { list: some(shown.map(rowOf), 5) }), fix, { effort: "hours", pages: [...new Set(shown.map((row) => row.path))], count: shown.length });
  else if ((signs.linksRead || []).length) add("Security", "pass", "info", "sec-spam-links", say("sec-spam-links.pass.title"), say("sec-spam-links.pass.evidence", { n: signs.linksRead.length }), "");
}

module.exports = { look, line, findings, compare, spamTerms, spamResults, spamLinks, siteTopics, spamQuery, readPage, GOOGLEBOT, BROWSER, BUDGET_MS };
