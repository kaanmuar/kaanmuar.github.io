"use strict";

// SPF and DMARC read past "is there a record" (#3089). SPF is walked the way a receiver walks it: include, a, mx,
// ptr, exists and redirect each cost a DNS lookup, includes and redirects are followed, and past 10 lookups the
// receiver returns permerror (RFC 7208 4.6.4), so SPF fails for every message. Two SPF records, an include that
// leads to no SPF record, and two DMARC records are errors of the same kind.

const crypto = require("crypto");
const dns = require("dns").promises;
const { say } = require("./url-review-findings-en");

const SPF_LIMIT = 10;
const LOOKUP_TERMS = new Set(["include", "a", "mx", "ptr", "exists"]);
// A review never waits on a slow provider: each query, the whole walk, its depth and its query count are capped.
const QUERY_MS = 3000;
const WALK_MS = 8000;
const MAX_QUERIES = 40;
const MAX_DEPTH = 10;

const isSpf = (row) => /^v=spf1(\s|$)/i.test(String(row).trim());
const isDmarc = (row) => /^v=DMARC1\s*(;|$)/i.test(String(row).trim());
const cut = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

function spfTerms(record) {
  return String(record || "").trim().split(/\s+/).slice(1).filter(Boolean).map((raw) => {
    const modifier = raw.match(/^([a-z][\w.-]*)=(.*)$/i);
    if (modifier) return { raw, modifier: true, name: modifier[1].toLowerCase(), value: modifier[2] };
    const mechanism = raw.match(/^([+\-~?]?)([a-z][\w.-]*)(?::([^/]*))?/i) || [];
    return { raw, modifier: false, qualifier: mechanism[1] || "+", name: (mechanism[2] || "").toLowerCase(), value: mechanism[3] || "" };
  });
}

function dmarcTags(record) {
  const tags = {};
  String(record || "").split(";").forEach((part) => {
    const pair = part.match(/^\s*([a-z]+)\s*=\s*(.*?)\s*$/i);
    if (pair && !(pair[1].toLowerCase() in tags)) tags[pair[1].toLowerCase()] = pair[2];
  });
  return tags;
}

const dmarcPolicy = (record) => (dmarcTags(record).p || "").toLowerCase();

function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(resolve, Math.max(ms, 0), null); })]).finally(() => clearTimeout(timer));
}

// [] when the name has no TXT records, null when the answer did not come (a timeout, a server failure, or the budget ran out).
function txtRows(name, budget) {
  if (budget.rows.has(name)) return budget.rows.get(name);
  if (budget.queries >= MAX_QUERIES || Date.now() >= budget.until || budget.halt()) {
    budget.cut = true;
    return Promise.resolve(null);
  }
  budget.queries += 1;
  const read = within(dns.resolveTxt(name).then((rows) => rows.map((parts) => parts.join(""))), Math.min(QUERY_MS, budget.until - Date.now()))
    .catch((error) => (/^(ENODATA|ENOTFOUND)$/.test(error && error.code) ? [] : null));
  budget.rows.set(name, read);
  return read;
}

async function follow(target, chain, budget) {
  const name = target.toLowerCase().replace(/\.$/, "");
  // A macro (%{i}, %{d}) names a different host for every sender, so it costs its one lookup and is not followed.
  if (!name || name.includes("%")) return { lookups: 0, all: null, broken: [], unread: false };
  if (chain.includes(name) || chain.length > MAX_DEPTH) return { lookups: 0, all: null, broken: [], unread: true };
  const rows = await txtRows(name, budget);
  if (!rows) return { lookups: 0, all: null, broken: [], unread: true };
  const records = rows.filter(isSpf);
  if (records.length !== 1) return { lookups: 0, all: null, broken: [], unread: false, missing: true };
  return walk(records[0], chain.concat(name), budget);
}

async function walk(record, chain, budget) {
  const terms = spfTerms(record);
  const all = terms.find((term) => !term.modifier && term.name === "all");
  // RFC 7208 6.1: redirect is ignored when the record has an all mechanism.
  const counted = terms.filter((term) => (term.modifier ? term.name === "redirect" && !all : LOOKUP_TERMS.has(term.name)));
  const out = { lookups: 0, all: all ? all.qualifier : "", costs: [], broken: [], unread: false };
  const steps = await Promise.all(counted.map((term) => (term.name === "include" || term.name === "redirect")
    ? follow(term.value, chain, budget).then((child) => ({ term, child }))
    : { term, child: null }));
  steps.forEach(({ term, child }) => {
    const cost = 1 + (child ? child.lookups : 0);
    out.lookups += cost;
    out.costs.push({ term: term.raw, lookups: cost });
    if (!child) return;
    out.broken.push(...child.broken);
    if (child.missing) out.broken.push(term.raw);
    if (child.unread) out.unread = true;
    if (term.name === "redirect") out.all = child.missing ? "" : child.all;
  });
  return out;
}

// What the root SPF and DMARC records say once every include is followed. Kept small, because it is saved with the report.
async function readMailAuth(domain, halt) {
  const budget = { queries: 0, until: Date.now() + WALK_MS, halt: halt || (() => false), cut: false, rows: new Map() };
  const [root, dmarc] = await Promise.all([txtRows(domain, budget), txtRows("_dmarc." + domain, budget)]);
  const spf = root ? root.filter(isSpf) : [];
  const out = {
    spfRecords: root ? spf.length : null,
    spfList: spf.slice(0, 3).map((row) => cut(row, 160)),
    dmarcRecords: dmarc ? dmarc.filter(isDmarc).length : null
  };
  if (spf.length !== 1) return out;
  const walked = await walk(spf[0], [domain.toLowerCase()], budget);
  return Object.assign(out, {
    lookups: walked.lookups,
    complete: !walked.unread && !budget.cut,
    all: walked.all,
    costs: walked.costs.filter((row) => row.lookups > 1 || walked.lookups > SPF_LIMIT).sort((a, b) => b.lookups - a.lookups).slice(0, 5)
      .map((row) => ({ term: cut(row.term, 120), lookups: row.lookups })),
    broken: Array.from(new Set(walked.broken)).slice(0, 3).map((term) => cut(term, 120))
  });
}

// Findings from readMailAuth's result. Returns what the summary rows and the existing SPF and DMARC findings need to know.
function mailAuthChecks(dnsInfo, dnsRead, add) {
  const auth = dnsInfo.mailAuth || {};
  const domain = dnsInfo.domain;
  const state = { spf: "", dmarcBroken: false };
  const worse = (verdict) => { if (state.spf !== "fail") state.spf = verdict; };
  if (dnsRead("spf") && dnsInfo.spf) {
    if (auth.spfRecords > 1) {
      add("Security", "fail", "high", "sec-spf-multiple", say("sec-spf-multiple.title", { n: auth.spfRecords }),
        say("sec-spf-multiple.evidence", { domain, n: auth.spfRecords, list: { items: auth.spfList || [], sep: " | " } }),
        say("sec-spf-multiple.fix"), { effort: "minutes" });
      worse("fail");
    }
    if (auth.lookups > SPF_LIMIT) {
      const costs = (auth.costs || []).map((row) => say("sec-spf-lookups.cost", { term: row.term, n: row.lookups }));
      add("Security", "fail", "high", "sec-spf-lookups", say("sec-spf-lookups.title"),
        say("sec-spf-lookups.evidence", { domain, count: say(auth.complete ? "sec-spf-lookups.count" : "sec-spf-lookups.atLeast", { n: auth.lookups }) }),
        say("sec-spf-lookups.fix", { list: { items: costs.slice(0, 3), join: "and" } }), { effort: "hours", count: auth.lookups });
      worse("fail");
    }
    if ((auth.broken || []).length) {
      add("Security", "fail", "high", "sec-spf-include", say("sec-spf-include.title", { n: auth.broken.length }),
        say("sec-spf-include.evidence", { domain, list: { items: auth.broken, join: "and" } }), say("sec-spf-include.fix"), { effort: "minutes" });
      worse("fail");
    }
    if (auth.all === "+") {
      add("Security", "fail", "high", "sec-spf-all", say("sec-spf-all.open.title", { domain }), say("sec-spf-all.open.evidence"), say("sec-spf-all.fix"), { effort: "minutes" });
      worse("fail");
    } else if (auth.all === "?" || auth.all === "") {
      add("Security", "risk", "medium", "sec-spf-all", say("sec-spf-all.neutral.title"),
        say(auth.all === "?" ? "sec-spf-all.neutral.evidence" : "sec-spf-all.none.evidence"), say("sec-spf-all.fix"), { effort: "minutes" });
      worse("risk");
    }
  }
  if (!dnsRead("dmarc") || !dnsInfo.dmarc) return state;
  if (auth.dmarcRecords > 1) {
    add("Security", "fail", "high", "sec-dmarc-multiple", say("sec-dmarc-multiple.title", { n: auth.dmarcRecords }),
      say("sec-dmarc-multiple.evidence", { domain, n: auth.dmarcRecords }), say("sec-dmarc-multiple.fix"), { effort: "minutes" });
    state.dmarcBroken = true;
    return state;
  }
  const tags = dmarcTags(dnsInfo.dmarc);
  const p = (tags.p || "").toLowerCase();
  const enforced = p === "reject" || p === "quarantine";
  if (!tags.rua) add("Security", "risk", "low", "sec-dmarc-rua", say("sec-dmarc-rua.title"), say("sec-dmarc-rua.evidence", { domain }), say("sec-dmarc-rua.fix", { domain }), { effort: "minutes" });
  if (enforced && (tags.sp || "").toLowerCase() === "none") {
    add("Security", "risk", "medium", "sec-dmarc-sp", say("sec-dmarc-sp.title"), say("sec-dmarc-sp.evidence", { p, domain }), say("sec-dmarc-sp.fix", { p }), { effort: "minutes" });
  }
  const pct = /^\d+$/.test(tags.pct || "") ? Number(tags.pct) : 100;
  if (enforced && pct < 100) {
    add("Security", "risk", "medium", "sec-dmarc-pct", say("sec-dmarc-pct.title", { pct }), say("sec-dmarc-pct." + p, { pct }), say("sec-dmarc-pct.fix"), { effort: "minutes" });
  }
  return state;
}

// DKIM (#3409): a key lives at <selector>._domainkey.<domain> and nothing in DNS lists the selectors, so the review asks
// the ones mail services use by default, the mail provider's own first. A key it does not find may sit at a custom selector.
const DKIM_SELECTORS = ["google", "selector1", "selector2", "default", "k1", "k2", "k3", "s1", "s2", "mail", "dkim", "smtp", "mx",
  "everlytickey1", "everlytickey2", "mandrill", "mxvault", "zoho", "protonmail", "protonmail2", "protonmail3", "fm1", "fm2", "fm3",
  "sig1", "cm", "pm", "mailjet", "amazonses"];
const MAIL_PROVIDERS = [
  { name: "Google Workspace", mx: /(^|\.)(google|googlemail)\.com\.?$/i, spf: /\binclude:_spf\.google\.com\b/i, selectors: ["google"] },
  { name: "Microsoft 365", mx: /\.mail\.protection\.outlook\.com\.?$/i, spf: /\binclude:spf\.protection\.outlook\.com\b/i, selectors: ["selector1", "selector2"] },
  { name: "Proton Mail", mx: /(^|\.)protonmail\.ch\.?$/i, spf: /\binclude:_spf\.protonmail\.ch\b/i, selectors: ["protonmail", "protonmail2", "protonmail3"] },
  { name: "Fastmail", mx: /(^|\.)messagingengine\.com\.?$/i, spf: /\binclude:spf\.messagingengine\.com\b/i, selectors: ["fm1", "fm2", "fm3"] }
];
const DKIM_QUERY_MS = 2500;
const DKIM_MS = 6000;
const DKIM_PARALLEL = 10;
// RFC 8301 3.2: verifiers must not accept RSA keys below 1024 bits; 2048 is what providers issue today.
const DKIM_MIN_BITS = 1024;
const DKIM_GOOD_BITS = 2048;

const dkimTags = (record) => dmarcTags(String(record || "").replace(/\s+/g, ""));
// A wildcard TXT answers every name, so only a row that reads as a DKIM key counts.
function isDkim(row) {
  const tags = dkimTags(row);
  return "v" in tags ? /^DKIM1$/i.test(tags.v) : "p" in tags;
}

function mailProvider(mx, spf) {
  return MAIL_PROVIDERS.find((row) => (mx || []).some((host) => row.mx.test(String(host)))) || MAIL_PROVIDERS.find((row) => row.spf.test(String(spf || ""))) || null;
}

function rsaBits(p) {
  const der = Buffer.from(p, "base64");
  for (const type of ["spki", "pkcs1"]) {
    try {
      const bits = crypto.createPublicKey({ key: der, format: "der", type }).asymmetricKeyDetails.modulusLength;
      if (bits) return bits;
    } catch (error) { /* the other encoding, then the length */ }
  }
  // An SPKI wrapper and the exponent add about 34 bytes to the modulus; keys come in multiples of 256 bits.
  return der.length > 34 ? Math.round((der.length - 34) * 8 / 256) * 256 : null;
}

function dkimKey(record) {
  const tags = dkimTags(record);
  const type = (tags.k || "rsa").toLowerCase().slice(0, 20);
  const p = tags.p || "";
  if (!p) return { type, revoked: true };
  return { type, bits: type === "rsa" ? rsaBits(p) : null };
}

// The DKIM keys at the provider's and the common selectors. Only for a domain that receives mail.
async function readDkim(domain, hints, halt) {
  const provider = mailProvider(hints && hints.mx, hints && hints.spf);
  const selectors = Array.from(new Set((provider ? provider.selectors : []).concat(DKIM_SELECTORS)));
  const until = Date.now() + DKIM_MS;
  const answers = new Array(selectors.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < selectors.length) {
      const index = next++;
      if (Date.now() >= until || (halt && halt())) continue;
      answers[index] = await within(dns.resolveTxt(selectors[index] + "._domainkey." + domain).then((rows) => rows.map((parts) => parts.join(""))), Math.min(DKIM_QUERY_MS, until - Date.now()))
        .catch((error) => (/^(ENODATA|ENOTFOUND)$/.test(error && error.code) ? [] : null));
    }
  };
  await Promise.all(Array.from({ length: DKIM_PARALLEL }, worker));
  const keys = [];
  selectors.forEach((selector, index) => {
    const record = (answers[index] || []).find(isDkim);
    if (record) keys.push(Object.assign({ selector }, dkimKey(record)));
  });
  return { provider: provider ? provider.name : "", probed: selectors.length, unread: answers.filter((rows) => !rows).length, keys: keys.slice(0, 8) };
}

// The selectors with a live key, for the mail retest.
const dkimSelectors = (dkim) => ((dkim && dkim.keys) || []).filter((key) => !key.revoked).map((key) => key.selector);

function dkimChecks(dnsInfo, add) {
  const dkim = dnsInfo.dkim;
  if (!dkim || !(dnsInfo.mx || []).length) return;
  const domain = dnsInfo.domain;
  const keys = dkim.keys || [];
  const name = (key) => key.selector + "._domainkey." + domain;
  const describe = (key) => (key.type === "rsa" && key.bits ? say("sec-dkim.key.rsa", { name: name(key), bits: key.bits })
    : key.type === "ed25519" ? say("sec-dkim.key.ed25519", { name: name(key) }) : say("sec-dkim.key.other", { name: name(key), type: key.type }));
  const list = (rows) => ({ list: { items: rows.slice(0, 4).map(describe), join: "and" } });
  if (!keys.length) {
    // Most selectors unanswered says nothing about the keys.
    if (dkim.unread > dkim.probed / 2) return;
    const provider = MAIL_PROVIDERS.find((row) => row.name === dkim.provider);
    add("Security", "person", "info", "sec-dkim-none", say("sec-dkim-none.title"),
      provider ? say("sec-dkim-none.provider", { domain, provider: provider.name, selectors: { items: provider.selectors, join: "and" } }) : say("sec-dkim-none.evidence", { domain, n: dkim.probed }),
      say("sec-dkim-none.fix"), { effort: "minutes" });
    return;
  }
  const live = keys.filter((key) => !key.revoked);
  const revoked = keys.filter((key) => key.revoked);
  const weak = live.filter((key) => key.type === "rsa" && key.bits && key.bits < DKIM_MIN_BITS);
  const short = live.filter((key) => key.type === "rsa" && key.bits >= DKIM_MIN_BITS && key.bits < DKIM_GOOD_BITS);
  const good = live.filter((key) => weak.indexOf(key) === -1 && short.indexOf(key) === -1);
  if (weak.length) {
    add("Security", "fail", "high", "sec-dkim-weak", say("sec-dkim-weak.title", { n: weak.length }), say("sec-dkim-weak.evidence", list(weak)), say("sec-dkim-weak.fix"), { effort: "minutes", count: weak.length });
  }
  if (short.length) {
    add("Security", "risk", "low", "sec-dkim-short", say("sec-dkim-short.title", { n: short.length }), say("sec-dkim-short.evidence", list(short)), say("sec-dkim-short.fix"), { effort: "minutes", count: short.length });
  }
  if (revoked.length) {
    const names = { list: { items: revoked.slice(0, 4).map(name), join: "and" } };
    add("Security", "risk", live.length ? "low" : "medium", "sec-dkim-revoked", say("sec-dkim-revoked.title", { n: revoked.length }),
      say(live.length ? "sec-dkim-revoked.evidence" : "sec-dkim-revoked.only", names), say("sec-dkim-revoked.fix"), { effort: "minutes", count: revoked.length });
  }
  if (good.length && !weak.length) add("Security", "pass", "info", "sec-dkim", say("sec-dkim.pass.title", { n: good.length }), say("sec-dkim.pass.evidence", list(good)), "");
}

// The DKIM row of the report's check summary.
function dkimState(findings) {
  const has = (key) => findings.some((item) => item.key === key);
  return has("sec-dkim-weak") ? "fail" : has("sec-dkim-short") || has("sec-dkim-revoked") ? "risk" : has("sec-dkim") ? "pass" : "unknown";
}

// The DMARC record with the gaps above closed, for the DNS records the report hands over.
function dmarcRepair(record, domain) {
  // dnsFacts keeps the first 300 characters, so a longer record cannot be rewritten whole.
  if (String(record || "").length >= 300) return "";
  const tags = dmarcTags(record);
  const enforced = /^(reject|quarantine)$/i.test(tags.p || "");
  const parts = String(record || "").split(";").map((part) => part.trim()).filter(Boolean);
  const kept = parts.filter((part) => !enforced || !(/^sp\s*=\s*none$/i.test(part) || /^pct\s*=\s*\d+$/i.test(part) && Number(part.split("=")[1]) < 100));
  if (!tags.rua) kept.push("rua=mailto:dmarc@" + domain);
  return kept.join("; ") === parts.join("; ") ? "" : kept.join("; ");
}

module.exports = { readMailAuth, mailAuthChecks, dmarcRepair, dmarcTags, dmarcPolicy, spfTerms, SPF_LIMIT, readDkim, dkimChecks, dkimState, dkimSelectors, mailProvider, DKIM_SELECTORS };
