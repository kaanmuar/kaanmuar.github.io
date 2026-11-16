"use strict";

/* Registered lookalikes of the reviewed domain (#3084): letters left out, doubled, swapped or replaced by a keyboard
   neighbour, bit flips, lookalike characters (IDN homographs), hyphens, vowel swaps, added words and other endings,
   after the fuzzers in dnstwist (github.com/elceef/dnstwist, Apache-2.0). Each one is asked over DNS-over-HTTPS; those
   with an address or a mail server are kept, and the closest few are opened and checked with Web Risk and RDAP.
   Every stage stops at its share of LIMITS.budgetMs, so a slow resolver shortens the list instead of the review. */

const net = require("net");
const url = require("url");
const { registrable, registryDomain } = require("./url-review-suffix");

const LIMITS = { candidates: 400, concurrency: 16, queryMs: 2500, budgetMs: 25000, registered: 40, inspected: 15, shown: 10, minLabel: 4 };

const RESOLVERS = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];
const TYPE = { A: 1, NS: 2, MX: 15, AAAA: 28 };

// dnstwist's qwerty, qwertz and azerty layouts, merged: each key with the keys around it.
const LAYOUTS = [
  "1:2q 2:3wq1 3:4ew2 4:5re3 5:6tr4 6:7yt5 7:8uy6 8:9iu7 9:0oi8 0:po9 q:12wa w:3esaq2 e:4rdsw3 r:5tfde4 t:6ygfr5 y:7uhgt6 u:8ijhy7 i:9okju8 o:0plki9 p:lo0 a:qwsz s:edxzaw d:rfcxse f:tgvcdr g:yhbvft h:ujnbgy j:ikmnhu k:olmji l:kop z:asx x:zsdc c:xdfv v:cfgb b:vghn n:bhjm m:njk",
  "6:7zt5 7:8uz6 t:6zgfr5 z:7uhgt6 u:8ijhz7 a:qwsy s:edxyaw g:zhbvft h:ujnbgz y:asx x:ysdc",
  "1:2a 2:3za1 3:4ez2 a:2zq1 z:3esqa2 e:4rdsz3 p:lo0m q:zswa s:edxwqz j:iknhu k:olji l:kopm m:lp w:sxq x:wsdc n:bhj"
];
const NEIGHBOURS = {};
LAYOUTS.forEach((layout) => layout.split(" ").forEach((pair) => {
  const [key, near] = pair.split(":");
  NEIGHBOURS[key] = Array.from(new Set(Array.from((NEIGHBOURS[key] || "") + near))).filter((c) => c !== key).join("");
}));

// Single characters that read as another: digits, Latin accents, and Cyrillic and Greek letters registries accept in IDNs.
const GLYPHS = {
  a: "àáâäаɑ", b: "dƅ", c: "çсϲ", d: "bԁ", e: "éèêëе", g: "qɡ", h: "һ", i: "1líïіı", j: "ј", k: "κ", l: "1iı", n: "ñ",
  o: "0óöôοо", p: "р", q: "gԛ", s: "ѕ5", u: "vúüυ", v: "uν", w: "ѡ", x: "х", y: "уý", z: "2", 0: "o", 1: "li", 5: "s"
};
const GLYPH_PAIRS = [["m", "rn"], ["rn", "m"], ["m", "nn"], ["nn", "m"], ["w", "vv"], ["vv", "w"], ["d", "cl"], ["cl", "d"]];
const VOWELS = "aeiou";
const WORDS = ["login", "secure", "account", "verify", "support", "online", "mail", "pay", "my", "shop", "portal", "help", "signin", "app"];
const TLDS = ["com", "net", "org", "co", "io", "info", "biz", "eu", "de", "es", "fr", "it", "pt", "co.uk", "ch", "at", "nl", "mx", "com.br", "app", "online", "shop", "site", "xyz"];
const PARKING = /sedoparking|parkingcrew|bodis|above\.com|parklogic|dan\.com|afternic|hugedomains|uniregistrymarket|cashparking|smartname|domainmarket|namebrightdns|ztomy|parking/i;
// Registrars that serve only companies protecting their brands, so a lookalike held there is a defensive registration.
const BRAND_REGISTRARS = /markmonitor|csc corporate|corporation service company|com laude|safenames|nameshield|lexsynergy|brandsight|ports group|corsearch|authentic web|gandi corporate|tucows corporate|ebrand/i;
const PARKED_PAGE = /\b(this domain (is|may be) for sale|buy this domain|domain is parked|parked free|domain for sale)\b/i;

function validLabel(label) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) && (label.slice(2, 4) !== "--" || label.startsWith("xn--"));
}

// Lookalikes of site in the order they are asked: the likeliest tricks first, so the cap drops the least likely.
function permutations(site) {
  const dot = site.indexOf(".");
  if (dot < 1) return [];
  const name = url.domainToUnicode(site).split(".")[0];
  const suffix = site.slice(dot + 1);
  const chars = Array.from(name);
  const seen = new Set([site]);
  const out = [];
  const keep = (label, fuzzer, tld) => {
    const domain = url.domainToASCII(label + "." + (tld || suffix));
    if (!domain || seen.has(domain) || !validLabel(domain.split(".")[0])) return;
    seen.add(domain);
    out.push({ domain, shown: url.domainToUnicode(domain), fuzzer });
  };
  const swap = (at, put, drop) => chars.slice(0, at).join("") + put + chars.slice(at + (drop || 0)).join("");
  TLDS.forEach((tld) => keep(name, "tld", tld));
  WORDS.forEach((word) => {
    keep(name + "-" + word, "word");
    keep(word + "-" + name, "word");
    keep(name + word, "word");
    keep(word + name, "word");
  });
  chars.forEach((c, at) => keep(swap(at, "", 1), "omission"));
  chars.forEach((c, at) => keep(swap(at, c), "repetition"));
  chars.forEach((c, at) => { if (at + 1 < chars.length) keep(swap(at, chars[at + 1] + c, 2), "transposition"); });
  chars.forEach((c, at) => Array.from(NEIGHBOURS[c] || "").forEach((near) => keep(swap(at, near, 1), "replacement")));
  chars.forEach((c, at) => Array.from(GLYPHS[c] || "").forEach((glyph) => keep(swap(at, glyph, 1), "homoglyph")));
  GLYPH_PAIRS.forEach(([from, to]) => {
    for (let at = name.indexOf(from); at >= 0; at = name.indexOf(from, at + 1)) keep(name.slice(0, at) + to + name.slice(at + from.length), "homoglyph");
  });
  for (let at = 1; at < chars.length; at += 1) keep(swap(at, "-"), "hyphenation");
  chars.forEach((c, at) => { if (VOWELS.includes(c)) Array.from(VOWELS).forEach((vowel) => keep(swap(at, vowel, 1), "vowel-swap")); });
  keep("www" + name, "various");
  keep("www-" + name, "various");
  keep(name + suffix.replace(/\./g, ""), "various");
  keep(name + "-" + suffix.replace(/\./g, "-"), "various");
  chars.forEach((c, at) => {
    const code = c.charCodeAt(0);
    if (code > 127) return;
    [1, 2, 4, 8, 16, 32, 64, 128].forEach((bit) => {
      const flipped = String.fromCharCode(code ^ bit);
      if (/^[a-z0-9-]$/.test(flipped)) keep(swap(at, flipped, 1), "bitsquatting");
    });
  });
  for (let at = 1; at < chars.length - 1; at += 1) {
    Array.from(NEIGHBOURS[chars[at]] || "").forEach((near) => {
      keep(swap(at, near), "insertion");
      keep(swap(at + 1, near), "insertion");
    });
  }
  Array.from("abcdefghijklmnopqrstuvwxyz0123456789").forEach((c) => keep(name + c, "addition"));
  return out;
}

// One DNS question as JSON; the second resolver answers when the first fails. Null when neither answered.
async function doh(name, type, ms) {
  for (const base of RESOLVERS) {
    try {
      const res = await fetch(base + "?name=" + encodeURIComponent(name) + "&type=" + type, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(ms || LIMITS.queryMs) });
      if (!res.ok) continue;
      const data = await res.json();
      if (typeof data.Status !== "number") continue;
      return { status: data.Status, answers: (data.Answer || []).filter((row) => row.type === TYPE[type]).map((row) => String(row.data || "").toLowerCase()) };
    } catch (error) { /* the next resolver */ }
  }
  return null;
}

const dotless = (name) => String(name || "").replace(/\.$/, "");

// Parking services sinkhole a name to 127.0.0.1 and "MX 0 localhost", which is neither a website nor a mailbox.
const PRIVATE = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1?$|f[cd]|fe80:)/;
const addresses = (answer) => ((answer && answer.answers) || []).filter((address) => !PRIVATE.test(address));

// RFC 7505: "0 ." is a null MX, a domain that takes no mail.
function mailHosts(answer) {
  return ((answer && answer.answers) || []).map((row) => dotless(row.split(/\s+/)[1])).filter((host) => host && host !== "localhost" && !PRIVATE.test(host));
}

function linkedSites(html) {
  return new Set((String(html || "").match(/https?:\/\/[a-z0-9.-]+/gi) || []).map((link) => registrable(link.replace(/^https?:\/\//i, ""))));
}

function titleOf(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function within(job, ms) {
  let timer = null;
  return Promise.race([Promise.resolve().then(() => job()), new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); })])
    .catch(() => null).finally(() => clearTimeout(timer));
}

// Runs work over items, limit at a time, and starts no new item once open() is false; unstarted items stay null.
async function pool(items, limit, open, work) {
  const out = items.map(() => null);
  let next = 0;
  const lane = async () => {
    while (next < items.length && open()) {
      const at = next;
      next += 1;
      out[at] = await work(items[at]).catch(() => null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

const rank = (x, y) => Number(!!y.flagged) - Number(!!x.flagged) ||
  Number(y.clone || y.login) - Number(x.clone || x.login) ||
  Number(y.mx) - Number(x.mx) ||
  String(y.registered).localeCompare(String(x.registered));

/* deps: doh(name, type, ms) (required), halt(), home (the start page's HTML), fetchPage(url) → { status, url, body },
   fetchHttp(domain) → { status, location } over plain http, webrisk(url) → { ok, threats }, rdap(domain) → { read, registered, registrar }. */
async function find(hostname, deps, limits) {
  const cap = Object.assign({}, LIMITS, limits);
  const host = String(hostname || "").toLowerCase();
  const site = registrable(host);
  if (!site || net.isIP(site) || !site.includes(".")) return { domain: site, skipped: "it is not a registered domain" };
  if (site !== registryDomain(host)) return { domain: site, skipped: "it is a site on a shared hosting domain" };
  if (Array.from(url.domainToUnicode(site).split(".")[0]).length < cap.minLabel) return { domain: site, skipped: "the name is too short to tell lookalikes from other names" };
  const started = Date.now();
  const open = (share) => () => !(deps.halt && deps.halt()) && Date.now() < started + cap.budgetMs * share;
  const ask = (name, type) => within(() => deps.doh(name, type, cap.queryMs), cap.queryMs * RESOLVERS.length + 500);
  const candidates = permutations(site).slice(0, cap.candidates);
  const ownNs = ask(site, "NS");

  const exists = await pool(candidates, cap.concurrency, open(0.55), (item) => ask(item.domain, "A"));
  let unread = 0;
  const live = [];
  candidates.forEach((item, at) => {
    const answer = exists[at];
    if (!answer || (answer.status !== 0 && answer.status !== 3)) unread += 1;
    else if (answer.status === 0) live.push(Object.assign({ a: addresses(answer).length > 0 }, item));
  });

  const probed = live.slice(0, cap.registered);
  const records = await pool(probed, cap.concurrency, open(0.75), (item) => Promise.all([ask(item.domain, "MX"), ask(item.domain, "NS"), item.a ? null : ask(item.domain, "AAAA")]));
  const own = new Set((((await ownNs) || {}).answers || []).map(dotless));
  const linkedFromHome = linkedSites(deps.home);
  const rows = [];
  probed.forEach((item, at) => {
    if (!records[at] || linkedFromHome.has(item.domain)) return;
    const [mx, ns, aaaa] = records[at];
    const mail = mailHosts(mx);
    const servers = ((ns && ns.answers) || []).map(dotless);
    const web = item.a || addresses(aaaa).length > 0;
    if (!web && !mail.length) return;
    if (own.size && servers.length && servers.every((server) => own.has(server))) return;
    rows.push({ domain: item.domain, shown: item.shown, fuzzer: item.fuzzer, web, mx: mail.length > 0, parked: servers.some((server) => PARKING.test(server)), login: false, clone: false, flagged: null, registered: "" });
  });

  const homeTitle = titleOf(deps.home);
  const mentions = new RegExp("(^|[^a-z0-9.-])" + site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
  const left = () => Math.max(1000, started + cap.budgetMs - Date.now());
  // The brand's own name under another ending (decathlon-online.es → decathlon.com) counts as the site.
  const brand = site.split(".")[0];
  const sister = (other, from) => other === site || (other !== from && other.split(".")[0] === brand);
  const ours = (address, from) => {
    try { return sister(registrable(new URL(address).hostname), from); } catch (error) { return false; }
  };
  const inspected = rows.slice().sort((x, y) => Number(y.mx) - Number(x.mx)).slice(0, cap.inspected);
  await Promise.all(inspected.map(async (row) => {
    const address = "https://" + row.domain + "/";
    const [page, plain, risk, rdap] = await Promise.all([
      row.web && deps.fetchPage ? within(() => deps.fetchPage(address), left()) : null,
      row.web && deps.fetchHttp ? within(() => deps.fetchHttp(row.domain), left()) : null,
      row.web && deps.webrisk ? within(() => deps.webrisk(address), left()) : null,
      deps.rdap ? within(() => deps.rdap(row.domain), left()) : null
    ]);
    if (plain && plain.location && ours(plain.location, row.domain)) row.ours = true;
    if (row.web && deps.fetchPage && deps.fetchHttp && !(page && page.status) && !(plain && plain.status)) row.web = false;
    if (page && page.status) {
      if (ours(page.url || address, row.domain)) row.ours = true;
      const body = String(page.body || "");
      const title = titleOf(body);
      row.login = /<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(body);
      row.clone = (homeTitle.length >= 8 && title === homeTitle) || (body.match(mentions) || []).length >= 5;
      row.parked = row.parked || PARKED_PAGE.test(body);
      // A storefront of the same name in another country links to its sister sites (zalando.fr → zalando.de, zalando.be).
      if (row.domain.split(".")[0] === brand && Array.from(linkedSites(body)).some((other) => sister(other, row.domain))) row.ours = true;
    }
    if (rdap && rdap.read && BRAND_REGISTRARS.test(rdap.registrar || "")) row.ours = true;
    if (risk && risk.ok && (risk.threats || []).length) {
      row.flagged = risk.threats.slice(0, 3);
      row.ours = false;
    }
    if (rdap && rdap.read && rdap.registered) row.registered = rdap.registered;
  }));

  const kept = rows.filter((row) => !row.ours && (row.web || row.mx)).sort(rank);
  return {
    domain: site,
    tried: candidates.length,
    checked: candidates.length - unread,
    resolved: live.length,
    partial: unread > candidates.length / 10 || records.some((item) => !item),
    found: kept.length,
    rows: kept.slice(0, cap.shown).map((row) => {
      const out = { domain: row.domain, fuzzer: row.fuzzer, web: row.web, mx: row.mx, parked: row.parked && !row.clone && !row.login, login: row.login, clone: row.clone, registered: row.registered };
      if (row.shown !== row.domain) out.shown = row.shown;
      if (row.flagged) out.flagged = row.flagged;
      return out;
    })
  };
}

// The report's finding: high when a lookalike is flagged, copies the site or asks for a password, medium when one takes mail.
function checks(result, add, say) {
  if (!result || result.skipped || !result.domain) return;
  const domain = result.domain;
  const rows = result.rows || [];
  if (!rows.length) {
    if (!result.partial) add("Security", "pass", "info", "sec-lookalike", say("sec-lookalike.pass.title"), say("sec-lookalike.pass.evidence", { n: result.checked, domain }), "");
    return;
  }
  const notes = (row) => {
    const list = [];
    if (row.flagged) list.push(say("sec-lookalike.note.flagged", { threats: { items: row.flagged.map((item) => /^(MALWARE|SOCIAL_ENGINEERING|UNWANTED_SOFTWARE)$/.test(item) ? say("threat." + item) : item.toLowerCase().replace(/_/g, " ")), join: "and" } }));
    if (row.clone) list.push(say("sec-lookalike.note.clone"));
    if (row.login) list.push(say("sec-lookalike.note.login"));
    if (row.mx) list.push(say("sec-lookalike.note.mx"));
    if (row.web && !row.clone && !row.login) list.push(say(row.parked ? "sec-lookalike.note.parked" : "sec-lookalike.note.web"));
    if (row.registered) list.push(say("sec-lookalike.note.registered", { date: row.registered }));
    if (row.shown) list.push(say("sec-lookalike.note.idn", { ascii: row.domain }));
    return { items: list, sep: ", " };
  };
  const phishing = rows.filter((row) => row.flagged || row.clone || row.login).length;
  const mail = rows.filter((row) => row.mx).length;
  const level = phishing ? "high" : mail ? "medium" : "info";
  const title = phishing ? say("sec-lookalike.high.title", { n: phishing }) : mail ? say("sec-lookalike.mail.title", { n: mail }) : say("sec-lookalike.title", { n: result.found });
  const list = { items: rows.map((row) => say("sec-lookalike.row", { domain: row.shown || row.domain, notes: notes(row) })), more: Math.max(0, result.found - rows.length) };
  add("Security", phishing ? "fail" : "risk", level, "sec-lookalike", title,
    say("sec-lookalike.evidence", { list, n: result.found, checked: result.checked, domain, mail: mail ? say("sec-lookalike.mail") : "" }),
    say(level === "info" ? "sec-lookalike.watch.fix" : "sec-lookalike.fix"), { count: result.found, effort: "hours" });
}

module.exports = { LIMITS, permutations, doh, find, checks };
