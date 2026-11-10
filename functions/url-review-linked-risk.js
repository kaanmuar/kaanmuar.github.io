"use strict";
/* Google Web Risk for the hosts a reviewed site loads and links to (#3090): third-party script, iframe and form-action
   hosts from the HTML and the browser pass, then outbound link hosts. A card skimmer's script host, an injected
   phishing link or a hijacked widget domain is listed long before the site that carries it.

   Each host is looked up once as https://<host>/ with uris:search, the call the start URL already uses. Never call
   threatLists.computeDiff: it reprices every lookup to $50 per 1,000.

   webrisk_usage/<YYYY-MM> = { lookups, days: { "<DD>": n } }   linked-host lookups spent, the budget guard
   webrisk_hosts/<YYYY-MM-DD> = { hosts: { "<host>": { t, at } }, expireAt }   answers of that UTC day; t is the
   space-joined threat types ("" when clean), at the lookup time. A review reads today's and yesterday's.

   index.js gives Firestore with use(getFirestore, FieldValue); without it (unit tests, the local server) the cache
   and the counter live in memory. A ledger that cannot be read stops the lookups, so the guard never runs blind. */
const { registrable } = require("./url-review-suffix");
const { EN, say } = require("./url-review-findings-en");

// Web Risk: the first 100,000 lookups a month are free, then $0.50 per 1,000. Each review's start URL (~15,000 a
// month with the sweeps) and Jarvis's daily check take the rest of the free tier.
const FREE_PER_MONTH = 100000;
const PER_MONTH = 80000;
const PER_DAY = Math.ceil(PER_MONTH / 31);
const MAX_HOSTS = 60;
const AT_ONCE = 8;
const TIME_MS = 20000;
const CACHE_MS = 24 * 3600000;
const CACHE_MAX = 15000;
const ROWS = 6;
const USAGE = "webrisk_usage";
const CACHE = "webrisk_hosts";

const monthOf = (t) => new Date(t).toISOString().slice(0, 7);
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

function memoryStore() {
  const hosts = new Map();
  const spent = {};
  return {
    async load(now) {
      return { hosts, month: spent[monthOf(now)] || 0, day: spent[dayOf(now)] || 0 };
    },
    async save(now, answers, n) {
      Object.keys(answers).forEach((host) => hosts.set(host, answers[host]));
      if (hosts.size > CACHE_MAX) hosts.forEach((entry, host) => { if (now - entry.at >= CACHE_MS) hosts.delete(host); });
      spent[monthOf(now)] = (spent[monthOf(now)] || 0) + n;
      spent[dayOf(now)] = (spent[dayOf(now)] || 0) + n;
    }
  };
}

function firestoreStore(db, FieldValue) {
  const usage = (t) => db.collection(USAGE).doc(monthOf(t));
  const day = (t) => db.collection(CACHE).doc(dayOf(t));
  return {
    async load(now) {
      const [month, today, yesterday] = await db.getAll(usage(now), day(now), day(now - CACHE_MS));
      const hosts = new Map();
      [yesterday, today].forEach((snap) => {
        const map = (snap.exists && snap.data().hosts) || {};
        Object.keys(map).forEach((host) => hosts.set(host, map[host]));
      });
      const spent = month.exists ? month.data() : {};
      return {
        hosts,
        month: Number(spent.lookups) || 0,
        day: Number((spent.days || {})[dayOf(now).slice(8)]) || 0,
        first: !today.exists,
        size: today.exists ? Object.keys(today.data().hosts || {}).length : 0
      };
    },
    async save(now, answers, n, ledger) {
      const batch = db.batch();
      batch.set(usage(now), { lookups: FieldValue.increment(n), days: { [dayOf(now).slice(8)]: FieldValue.increment(n) } }, { merge: true });
      if (Object.keys(answers).length && ledger.size < CACHE_MAX) batch.set(day(now), { hosts: answers, expireAt: new Date(now + 3 * CACHE_MS) }, { merge: true });
      if (ledger.first) batch.delete(day(now - 3 * CACHE_MS));
      await batch.commit();
    }
  };
}

let backing = null;
let memory = null;

function use(getDb, FieldValue) {
  backing = typeof getDb === "function" && FieldValue ? { getDb, FieldValue } : null;
}

function store() {
  if (backing) {
    try { return firestoreStore(backing.getDb(), backing.FieldValue); } catch (error) { /* fall back to memory */ }
  }
  return memory || (memory = memoryStore());
}

// -> [{ host, element: script | frame | form | link, page }], scripts first, each host once, the site's own domain left out.
function collect(pages, browser, siteHost) {
  const own = String(siteHost || "").toLowerCase();
  const site = registrable(own);
  const rows = new Map();
  const add = (element, page) => (raw) => {
    const host = String(raw || "").toLowerCase().replace(/\.$/, "");
    if (!/^[a-z0-9.-]+$/.test(host) || rows.has(host) || host === own || registrable(host) === site) return;
    rows.set(host, { host, element, page: page || "/" });
  };
  const hostOf = (url) => { try { return new URL(url).hostname; } catch (error) { return ""; } };
  const read = (pages || []).filter((page) => page && page.inspect);
  const res = (page, kind) => ((page.inspect.resources || {})[kind]) || [];
  const start = browser && browser.ok && browser.start ? browser.start : {};
  const seen = start.thirdParty || {};
  const startPath = start.finalPath || (read[0] && read[0].path) || "/";
  read.forEach((page) => res(page, "scripts").forEach(add("script", page.path)));
  (seen.scripts || []).forEach(add("script", startPath));
  read.forEach((page) => res(page, "frames").forEach(add("frame", page.path)));
  (seen.frames || []).forEach(add("frame", startPath));
  read.forEach((page) => res(page, "forms").forEach(add("form", page.path)));
  read.forEach((page) => (page.inspect.outbound || []).map(hostOf).forEach(add("link", page.path)));
  return [...rows.values()];
}

// lookup(url) -> { ok, threats } (core.webRisk). -> { found, checked, unchecked, budget, hits: [{ host, element, page, threats }] }
async function check(rows, lookup, options) {
  const opts = options || {};
  const now = opts.now || Date.now();
  const began = Date.now();
  const list = (rows || []).slice(0, MAX_HOSTS);
  const out = { found: (rows || []).length, checked: 0, unchecked: (rows || []).length - list.length, budget: false, hits: [] };
  if (!list.length || typeof lookup !== "function") return out;
  const db = opts.store || store();
  let ledger;
  try { ledger = await db.load(now); } catch (error) { ledger = null; }
  if (!ledger) return Object.assign(out, { unchecked: out.found, error: "the lookup ledger could not be read" });
  const entries = new Array(list.length);
  const ask = [];
  list.forEach((row, i) => {
    const hit = ledger.hosts.get(row.host);
    if (hit && now - hit.at < CACHE_MS) entries[i] = hit;
    else ask.push(i);
  });
  const room = Math.max(0, Math.min(PER_MONTH - ledger.month, PER_DAY - ledger.day));
  if (ask.length > room) out.budget = true;
  const asking = ask.slice(0, room);
  const answers = {};
  let spent = 0;
  for (let i = 0; i < asking.length; i += AT_ONCE) {
    if (Date.now() - began > TIME_MS) break;
    await Promise.all(asking.slice(i, i + AT_ONCE).map(async (at) => {
      spent += 1;
      let res = null;
      try { res = await lookup("https://" + list[at].host + "/"); } catch (error) { res = null; }
      if (!res || !res.ok) return;
      entries[at] = { t: (res.threats || []).join(" "), at: now };
      answers[list[at].host] = entries[at];
    }));
  }
  if (spent) {
    try { await db.save(now, answers, spent, ledger); } catch (error) { /* this report keeps the answers */ }
  }
  list.forEach((row, i) => {
    if (!entries[i]) { out.unchecked += 1; return; }
    out.checked += 1;
    if (entries[i].t) out.hits.push(Object.assign({}, row, { threats: entries[i].t.split(" ") }));
  });
  return out;
}

function note(result) {
  if (!result || !result.found) return "";
  const flagged = result.hits.map((hit) => hit.host + " (" + hit.threats.join(", ") + ")");
  return "Google's Safe Browsing lists were read for " + result.checked + " of " + result.found + " hosts the site loads or links to" +
    (flagged.length ? ": " + flagged.join(", ") + " flagged" : ", and none is flagged") +
    (result.error ? ". " + result.error[0].toUpperCase() + result.error.slice(1) : result.budget ? ". This month's lookup budget left the rest unread" : "") + ".";
}

const threatWord = (type) => EN["threat." + type] ? say("threat." + type) : type.toLowerCase().replace(/_/g, " ");

function findings(result, add) {
  if (!result || !(result.checked || result.hits.length)) return;
  const threats = (hits) => ({ items: [...new Set([].concat(...hits.map((hit) => hit.threats)))].map(threatWord), join: "and" });
  const rows = (hits) => ({
    items: hits.slice(0, ROWS).map((hit) => say("sec-linked-risk.row." + hit.element, { host: hit.host, page: hit.page, threats: threats([hit]) })),
    sep: "; ",
    more: hits.length - Math.min(hits.length, ROWS)
  });
  const pages = (hits) => [...new Set(hits.map((hit) => hit.page))];
  const scripts = result.hits.filter((hit) => hit.element === "script");
  const others = result.hits.filter((hit) => hit.element !== "script");
  if (scripts.length) add("Security", "fail", "critical", "sec-linked-script", say("sec-linked-script.title", { n: scripts.length, threats: threats(scripts) }),
    say("sec-linked-script.evidence", { rows: rows(scripts) }), say("sec-linked-script.fix"), { effort: "hours", pages: pages(scripts), count: scripts.length, cases: ["SEC-11"] });
  if (others.length) add("Security", "fail", "critical", "sec-linked-risk", say("sec-linked-risk.title", { n: others.length, threats: threats(others) }),
    say("sec-linked-risk.evidence", { rows: rows(others) }), say("sec-linked-risk.fix"), { effort: "hours", pages: pages(others), count: others.length, cases: ["SEC-11"] });
  if (!result.hits.length) add("Security", "pass", "info", "sec-linked-risk", say("sec-linked-risk.pass.title", { n: result.checked }),
    say("sec-linked-risk.pass.evidence", { n: result.checked, rest: result.unchecked ? say("sec-linked-risk.rest", { n: result.unchecked }) : "" }), "", { count: result.checked, cases: ["SEC-11"] });
}

module.exports = { FREE_PER_MONTH, PER_MONTH, PER_DAY, MAX_HOSTS, CACHE_MS, use, collect, check, note, findings, memoryStore, firestoreStore };
