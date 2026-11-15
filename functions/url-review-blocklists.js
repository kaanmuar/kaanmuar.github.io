"use strict";

/* Spam blocklists for the URL review (#3087): the registrable domain against a domain list, and the IPv4 addresses
   of the MX hosts and the web host against IP lists. Only lists free for commercial use without a key or a paid plan
   (checked Nov 2026; Spamhaus, SURBL and URIBL need paid terms). Barracuda answers only resolvers registered with it,
   and many lists refuse large public resolvers, so before a list is read it must pass its RFC 5782 test points:
   the always-listed entry answers 127.0.0.x and the never-listed one answers NXDOMAIN. An answer outside
   127.0.0.2-127.0.0.254 (127.255.255.x refusals, ad servers of resolvers that rewrite NXDOMAIN) leaves the
   pair unread, never listed. */

const dns = require("dns");
const net = require("net");
const { ipBlocked } = require("./url-review-ip");
const { say } = require("./url-review-findings-en");

const LISTS = [
  { id: "spamcop", name: "SpamCop", zone: "bl.spamcop.net", kind: "ip" },
  { id: "barracuda", name: "Barracuda", zone: "b.barracudacentral.org", kind: "ip" },
  { id: "mailspike", name: "Mailspike", zone: "bl.mailspike.net", kind: "ip" },
  { id: "psbl", name: "PSBL", zone: "psbl.surriel.com", kind: "ip" },
  { id: "0spam", name: "0spam", zone: "bl.0spam.org", kind: "ip" },
  // NordSpam asks to be contacted above 10,000 queries a day.
  { id: "nordspam", name: "NordSpam", zone: "bl.nordspam.com", kind: "ip" },
  { id: "nordspam-dbl", name: "NordSpam DBL", zone: "dbl.nordspam.com", kind: "domain" }
];
const TEST_POINTS = { ip: ["127.0.0.2", "127.0.0.1"], domain: ["test", "invalid"] };
const QUERY_MS = 2000;
const DEADLINE_MS = 8000;
const PARALLEL = 4;
const MX_HOSTS = 3;
const IPS_PER_HOST = 2;
const MAX_IPS = 4;
const HEALTHY_KEEP_MS = 60 * 60 * 1000;
const SICK_KEEP_MS = 10 * 60 * 1000;
const health = new Map();
const SLOW = Symbol("slow");

// Resolvers drop or refuse a burst of a few dozen queries, so at most PARALLEL run at once.
function resolverOf(options) {
  const resolver = (options && options.resolver) || new dns.promises.Resolver({ timeout: QUERY_MS, tries: 1 });
  const waiting = [];
  let running = 0;
  const next = () => {
    if (running >= PARALLEL || !waiting.length) return;
    running += 1;
    const { name, resolve } = waiting.shift();
    const job = timed(Promise.resolve().then(() => resolver.resolve4(name)), QUERY_MS + 500, SLOW)
      .then((rows) => (rows === SLOW ? Promise.reject(Object.assign(new Error("no answer in time"), { code: "ETIMEOUT" })) : rows));
    resolve(job);
    job.catch(() => {}).finally(() => { running -= 1; next(); });
  };
  return { resolve4: (name) => new Promise((resolve) => { waiting.push({ name, resolve }); next(); }) };
}

function timed(promise, ms, fallback) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]).finally(() => clearTimeout(timer));
}

function queryName(target, list) {
  return (list.kind === "ip" ? target.split(".").reverse().join(".") : target) + "." + list.zone;
}

// { listed: true, codes } or { listed: false }; null when the answer says nothing about the target.
// A refused or lost query is asked once more; a bogus answer is not.
async function ask(resolver, name, again) {
  const answer = await resolver.resolve4(name).then((codes) => ({ codes }), (error) => ({ code: (error && error.code) || "" }));
  if (answer.codes) {
    const codes = answer.codes.slice().sort();
    const real = codes.length && codes.every((code) => /^127\.0\.0\.(\d+)$/.test(code) && +code.split(".")[3] >= 2 && +code.split(".")[3] <= 254);
    return real ? { listed: true, codes } : null;
  }
  if (/^(ENOTFOUND|ENODATA)$/.test(answer.code)) return { listed: false };
  return again ? null : ask(resolver, name, true);
}

function healthy(resolver, list, now) {
  const kept = health.get(list.zone);
  if (kept && kept.until > now) return kept.result;
  const [always, never] = TEST_POINTS[list.kind];
  const result = Promise.all([ask(resolver, queryName(always, list)), ask(resolver, queryName(never, list))])
    .then(([yes, no]) => !!(yes && yes.listed && no && !no.listed), () => false);
  health.set(list.zone, { until: now + HEALTHY_KEEP_MS, result });
  result.then((ok) => { if (!ok) health.set(list.zone, { until: Date.now() + SICK_KEEP_MS, result }); });
  return result;
}

async function ipv4(resolver, host) {
  if (net.isIP(host) === 4) return ipBlocked(host) ? [] : [host];
  const rows = await resolver.resolve4(host).catch(() => []);
  return rows.filter((ip) => !ipBlocked(ip));
}

// The addresses to check: one or two per MX host, then the web host's first, at most MAX_IPS in all.
async function targetsOf(resolver, facts, hostname) {
  const mxHosts = (facts.mx || []).slice(0, MX_HOSTS);
  const [web, ...mx] = await Promise.all([hostname, ...mxHosts].map((host) => ipv4(resolver, host)));
  const byIp = new Map();
  mx.forEach((ips, index) => ips.slice(0, IPS_PER_HOST).forEach((ip) => {
    if (!byIp.has(ip) && byIp.size >= MAX_IPS - (web.length ? 1 : 0)) return;
    const row = byIp.get(ip) || { ip, hosts: [], web: false };
    row.hosts.push(mxHosts[index]);
    byIp.set(ip, row);
  }));
  if (web.length) {
    const row = byIp.get(web[0]) || { ip: web[0], hosts: [], web: false };
    row.web = true;
    byIp.set(web[0], row);
  }
  return Array.from(byIp.values());
}

/* check(facts, hostname): facts is the review's DNS read ({ domain, mx }). Resolves to null when there is nothing to
   check, else { domain, targets: [{ ip, hosts, web }], read: [list ids], unread: [list ids],
   listed: [{ list, target, codes }] }. A list is read when it passed its test points and answered every query. */
async function check(facts, hostname, options) {
  if (!facts) return null;
  const resolver = resolverOf(options);
  const now = Date.now();
  const work = (async () => {
    const targets = await targetsOf(resolver, facts, hostname);
    const domain = facts.domain || "";
    if (!targets.length && !domain) return null;
    const rows = await Promise.all(LISTS.map(async (list) => {
      const asked = list.kind === "ip" ? targets.map((row) => row.ip) : domain ? [domain] : [];
      if (!asked.length) return null;
      if (!(await healthy(resolver, list, now))) return { list, answers: null };
      const answers = await Promise.all(asked.map((target) => ask(resolver, queryName(target, list)).then((answer) => ({ target, answer }))));
      return { list, answers };
    }));
    const out = { domain, targets, read: [], unread: [], listed: [] };
    rows.filter(Boolean).forEach(({ list, answers }) => {
      const complete = !!answers && answers.every((row) => row.answer);
      out[complete ? "read" : "unread"].push(list.id);
      (answers || []).filter((row) => row.answer && row.answer.listed).forEach((row) => out.listed.push({ list: list.id, target: row.target, codes: row.answer.codes }));
    });
    return out;
  })();
  return timed(work.catch(() => null), DEADLINE_MS, null);
}

function nameOf(id) {
  return (LISTS.find((list) => list.id === id) || { name: id }).name;
}

function names(ids) {
  return { items: ids.map(nameOf), join: "and" };
}

function roleOf(row, domain) {
  if (!row) return domain;
  const host = { items: row.hosts.slice(), join: "and" };
  if (row.web && row.hosts.length) return say("sec-blocklist.webMx", { ip: row.ip, host });
  return row.web ? say("sec-blocklist.web", { ip: row.ip }) : say("sec-blocklist.mx", { ip: row.ip, host });
}

// One high finding per listed domain or address, naming each list with its delisting steps; a pass names the lists that answered.
function report(result, add) {
  if (!result || !(result.read.length || result.listed.length)) return;
  const rowOf = (target) => result.targets.find((row) => row.ip === target);
  const order = [];
  result.listed.forEach((hit) => { if (order.indexOf(hit.target) === -1) order.push(hit.target); });
  order.forEach((target, index) => {
    const hits = result.listed.filter((hit) => hit.target === target);
    const row = rowOf(target);
    const lists = hits.map((hit) => hit.list);
    const effects = !row ? ["domain"] : (row.hosts.length ? ["mail"] : []).concat(row.web ? ["web"] : []);
    const steps = { items: lists.map((id) => say("sec-blocklist.fix." + id, { target })), sep: " " };
    add("Security", "fail", "high", "sec-blocklist-" + index,
      say("sec-blocklist.title", { n: lists.length, target: roleOf(row, target), lists: names(lists) }),
      say("sec-blocklist.evidence", {
        target,
        answers: { items: hits.map((hit) => say("sec-blocklist.answer", { list: nameOf(hit.list), code: hit.codes.join(", ") })), join: "and" },
        effect: { items: effects.map((kind) => say("sec-blocklist.effect." + kind, { lists: names(lists) })), sep: "" }
      }),
      say(row ? "sec-blocklist.fix" : "sec-blocklist.fix.domain", { steps }),
      { effort: "hours", count: lists.length });
  });
  if (order.length) return;
  const checked = (result.domain ? [result.domain] : []).concat(result.targets.map((row) => roleOf(row)));
  add("Security", "pass", "info", "sec-blocklist", say("sec-blocklist.pass.title"),
    say("sec-blocklist.pass.evidence", {
      lists: names(result.read),
      targets: { items: checked, join: "and" },
      unread: result.unread.length ? say("sec-blocklist.unread", { lists: names(result.unread) }) : ""
    }), "");
}

// The progress line for the review log, in English.
function note(result) {
  if (!result) return "The spam blocklists could not be read.";
  const listed = result.listed.map((hit) => hit.target + " on " + nameOf(hit.list));
  return "Spam blocklists: " + (result.read.length ? result.read.map(nameOf).join(", ") + " answered" : "none answered") +
    (result.unread.length ? "; " + result.unread.map(nameOf).join(", ") + " not read" : "") +
    (listed.length ? "; listed: " + listed.join(", ") : "; nothing listed") + ".";
}

module.exports = { LISTS, check, report, note, queryName, _health: health };
