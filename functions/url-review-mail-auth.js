"use strict";

// SPF and DMARC read past "is there a record" (#3089). SPF is walked the way a receiver walks it: include, a, mx,
// ptr, exists and redirect each cost a DNS lookup, includes and redirects are followed, and past 10 lookups the
// receiver returns permerror (RFC 7208 4.6.4), so SPF fails for every message. Two SPF records, an include that
// leads to no SPF record, and two DMARC records are errors of the same kind.

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

module.exports = { readMailAuth, mailAuthChecks, dmarcRepair, dmarcTags, dmarcPolicy, spfTerms, SPF_LIMIT };
