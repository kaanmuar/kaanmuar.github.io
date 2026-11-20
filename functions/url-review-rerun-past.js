"use strict";
/* The pass over reviews that already finished (#3458, Carlos 2026-11-11).

   One new review per site, for visitor reviews, country sweeps and rival runs, sharing the country
   sweep's daily browser cap. One mail goes out after that report is ready, and only to an address we
   already wrote to who did not opt out. The code is half off, two uses (a re-review of that site, and
   a later review), until the launch ends, and it does not apply to fix packages. Cold owner notices
   stay on their own daily cap and are a different mail.

   Progress, once the run writes it, lives at url_review_campaigns/rerun-past-2026:
   { status: running|done|paused, hosts, reviewed, mailed, skipped, updatedAt }.
   Per-host queue rows live under .../hosts/<bare>: { host, bare, kind, email, lang, priorId, state,
   reviewId, code, mailedAt, ... }. */
const crypto = require("crypto");
const fixOffers = require("./url-review-fix-offers");
const ops = require("./ops-schedule");
const customerMail = require("./url-review-customer-mail");

const ID = "rerun-past-2026";
const COLLECTION = "url_review_campaigns";
const STATUSES = ["running", "done", "paused"];
const PREFIX = "RERUN-";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DAY = 24 * 3600000;
const OWN_DOMAINS = ["carlosandmunoz.com", "qalabreview.com", "example.com", "example.org", "test.com"];
const DONE = ["complete", "stopped"];
const NOT_A_SITE = ["jarvis", "batch", "desk"];
const KIND_RANK = { visitor: 0, rival: 1, sweep: 2 };

const emailOf = (value) => {
  const e = String(value || "").trim().toLowerCase();
  return /^[^\s@/]+@[^\s@/][^\s@/.]*\.[^\s@/]+$/.test(e) && e.length <= 200 ? e : "";
};
const domainOf = (email) => email.slice(email.indexOf("@") + 1);
const hashOf = (email) => crypto.createHash("sha256").update(emailOf(email)).digest("hex").slice(0, 40);
const msOf = (value) => (value && typeof value.toDate === "function" ? value.toDate().getTime() : Date.parse(value || "") || 0);

function bareOf(host) {
  return String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(":")[0];
}

function kindOf(row) {
  const source = String((row && row.source) || "");
  if (source === "rivals" || source === "competitor" || (row && row.rivalsAt)) return "rival";
  if (source === "sweep" || source === "outreach" || (row && row.sweep)) return "sweep";
  return "visitor";
}

function describe(doc, env) {
  const d = doc || {};
  const plan = {
    id: ID,
    ticket: 3458,
    status: STATUSES.includes(d.status) ? d.status : "not-started",
    perDay: ops.budget("sweepPerDay", env),
    onePerHost: true,
    includes: ["visitor reviews", "country sweeps", "rival runs"],
    mailWhen: "after the new report is ready",
    mailTo: "addresses we already wrote to, who did not opt out",
    coldNoticesPerDay: ops.budget("ownerNoticesPerDay", env),
    sendBatch: 150,
    pauseSec: 3,
    percent: 50,
    uses: 2,
    useFor: ["a re-review of that site", "a later review"],
    packages: false,
    until: fixOffers.LAUNCH.until,
    hosts: Number(d.hosts) || 0,
    reviewed: Number(d.reviewed) || 0,
    mailed: Number(d.mailed) || 0,
    skipped: Number(d.skipped) || 0,
    updatedAt: d.updatedAt || ""
  };
  plan.line = "Finished reports are run again, one new review per site (" + plan.includes.join(", ") + "), up to " + plan.perDay
    + " a day on the sweep browser. One mail goes out " + plan.mailWhen + ", to " + plan.mailTo
    + ". It carries " + plan.percent + "% off, " + plan.uses + " uses: " + plan.useFor.join(" and ")
    + ", until " + plan.until + ", and it does not apply to fix packages. Cold owner notices stay at "
    + plan.coldNoticesPerDay + " a day and are a different mail.";
  return plan;
}

/** One sentence for the Jarvis panel and Ask. `plan` is a describe() result or a progress doc. */
function line(plan) {
  return plan && plan.line ? plan.line : describe(plan).line;
}

/** Whether the scheduled job may spend a review browser slot. */
function gate(input) {
  const o = input || {};
  const progress = o.progress || {};
  if (!o.env || o.env.PAST_RERUN_LIVE !== "1") return { ok: false, why: "env-off" };
  if (progress.status === "paused") return { ok: false, why: "paused" };
  if (progress.status === "done") return { ok: false, why: "done" };
  if (progress.status !== "running") return { ok: false, why: "not-started" };
  return { ok: true };
}

/** Slots left today under the shared sweep daily cap. */
function roomLeft(sweepDone, cap) {
  const used = Math.max(0, Number(sweepDone) || 0);
  const limit = Math.max(0, Number(cap) || 0);
  return Math.max(0, limit - used);
}

function codeOf(rand) {
  const pick = rand || ((n) => crypto.randomInt(n));
  return PREFIX + Array.from({ length: 8 }, () => ALPHABET[pick(ALPHABET.length)]).join("");
}

/** Coupon for one address: half off two review uses until launch ends; packages never take it. */
function couponFor(person, now) {
  const at = now == null ? Date.now() : now;
  return {
    percent: 50,
    purposes: ["new-run", "report"],
    maxUses: 2,
    uses: 0,
    email: emailOf(person && person.email),
    host: bareOf(person && person.host),
    source: "rerun-past",
    campaign: ID,
    validUntil: fixOffers.LAUNCH.endsAt,
    createdAt: new Date(at).toISOString(),
    expireAt: new Date(Date.parse(fixOffers.LAUNCH.endsAt) + 90 * DAY)
  };
}

/** Opt-out check: address or @domain keys, lower case. */
function optedOut(email, stops) {
  const e = emailOf(email);
  if (!e) return true;
  const set = stops instanceof Set ? stops : new Set(stops || []);
  return set.has(e) || set.has("@" + domainOf(e));
}

/**
 * One queue row per bare host from finished url_reviews rows. Prefer visitor over rival over sweep;
 * keep the newest row of that kind. Own domains and desk/jarvis sources are dropped.
 */
function hostsFromReviews(rows) {
  const byBare = new Map();
  (rows || []).forEach((row) => {
    if (!row || DONE.indexOf(row.status) === -1) return;
    if (row.test === true) return;
    const source = String(row.source || "");
    if (NOT_A_SITE.indexOf(source) !== -1) return;
    const bare = bareOf(row.report && row.report.host || row.requestedUrl || "");
    if (!bare || OWN_DOMAINS.indexOf(bare) !== -1 || OWN_DOMAINS.some((d) => bare.endsWith("." + d))) return;
    const kind = kindOf(row);
    const email = emailOf(row.email);
    if (email && (email.endsWith("@carlosandmunoz.com") || OWN_DOMAINS.indexOf(domainOf(email)) !== -1)) return;
    const at = msOf(row.createdAt || row.at);
    const next = {
      host: bare,
      bare,
      kind,
      email,
      lang: String(row.lang || (row.report && row.report.lang) || "en").slice(0, 2) || "en",
      priorId: String(row.id || ""),
      at,
      state: "pending"
    };
    const prev = byBare.get(bare);
    if (!prev) {
      byBare.set(bare, next);
      return;
    }
    const betterKind = KIND_RANK[kind] < KIND_RANK[prev.kind];
    const sameKindNewer = kind === prev.kind && at > prev.at;
    const fillsEmail = !prev.email && !!email && KIND_RANK[kind] <= KIND_RANK[prev.kind];
    if (betterKind || sameKindNewer || fillsEmail) {
      byBare.set(bare, Object.assign({}, next, {
        email: email || prev.email,
        lang: next.lang || prev.lang,
        // Keep the higher-priority kind when only filling an email onto a sweep row.
        kind: betterKind || sameKindNewer ? kind : prev.kind,
        priorId: betterKind || sameKindNewer ? next.priorId : prev.priorId,
        at: Math.max(at, prev.at)
      }));
    }
  });
  return Array.from(byBare.values()).sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.at - a.at);
}

/**
 * Who may get the follow-up note. Visitors with an email already got a report. Sweeps and rivals only
 * when `contacted` names that address (owner notice, launch mail, note). Opt-outs never.
 */
function mailAddress(entry, { stops, contacted } = {}) {
  const email = emailOf(entry && entry.email);
  if (!email || optedOut(email, stops)) return "";
  if (entry.kind === "visitor") return email;
  const set = contacted instanceof Set ? contacted : new Set(contacted || []);
  return set.has(email) || set.has(hashOf(email)) ? email : "";
}

/** Progress counters after one host settles. */
function progressAfter(doc, outcome, now) {
  const d = doc || {};
  const next = {
    status: d.status === "running" || d.status === "paused" || d.status === "done" ? d.status : "running",
    hosts: Number(d.hosts) || 0,
    reviewed: Number(d.reviewed) || 0,
    mailed: Number(d.mailed) || 0,
    skipped: Number(d.skipped) || 0,
    updatedAt: new Date(now == null ? Date.now() : now).toISOString()
  };
  if (outcome === "reviewed" || outcome === "mailed") next.reviewed += 1;
  if (outcome === "mailed") next.mailed += 1;
  if (outcome === "skipped" || outcome === "failed") next.skipped += 1;
  if (next.hosts > 0 && next.reviewed + next.skipped >= next.hosts && next.status === "running") next.status = "done";
  return next;
}

const COPY = {
  en: {
    subject: "Your site again, with the new checks — 50% off",
    title: "We ran {host} again",
    body: "QA-lab URL Review has new checks since your last report. We ran {host} again. Open the new report below. Code {code} is 50% off a re-review of this site and one later review, until {until}. It does not apply to fix packages."
  },
  es: {
    subject: "Tu sitio de nuevo, con las revisiones nuevas — 50% de descuento",
    title: "Volvimos a revisar {host}",
    body: "QA-lab URL Review tiene revisiones nuevas desde tu último informe. Volvimos a pasar {host}. Abre el informe nuevo abajo. El código {code} es 50% de descuento en una nueva revisión de este sitio y en una revisión después, hasta el {until}. No vale para paquetes de arreglo."
  },
  pt: {
    subject: "Seu site de novo, com as novas verificações — 50% off",
    title: "Rodamos {host} de novo",
    body: "O QA-lab URL Review tem verificações novas desde o seu último relatório. Rodamos {host} de novo. Abra o relatório novo abaixo. O código {code} dá 50% de desconto numa nova revisão deste site e numa revisão depois, até {until}. Não vale para pacotes de correção."
  },
  de: {
    subject: "Ihre Website erneut, mit den neuen Checks — 50% Rabatt",
    title: "Wir haben {host} erneut geprüft",
    body: "QA-lab URL Review hat seit Ihrem letzten Bericht neue Checks. Wir haben {host} erneut geprüft. Öffnen Sie den neuen Bericht unten. Code {code} gibt 50% auf eine erneute Prüfung dieser Website und eine spätere Prüfung, bis {until}. Nicht für Fix-Pakete."
  },
  fr: {
    subject: "Votre site à nouveau, avec les nouveaux contrôles — −50%",
    title: "Nous avons relancé {host}",
    body: "QA-lab URL Review a de nouveaux contrôles depuis votre dernier rapport. Nous avons relancé {host}. Ouvrez le nouveau rapport ci-dessous. Le code {code} offre 50% sur une nouvelle revue de ce site et une revue plus tard, jusqu’au {until}. Pas pour les forfaits de correction."
  },
  it: {
    subject: "Di nuovo il tuo sito, con i nuovi controlli — 50% di sconto",
    title: "Abbiamo rieseguito {host}",
    body: "QA-lab URL Review ha nuovi controlli dal tuo ultimo report. Abbiamo rieseguito {host}. Apri il nuovo report qui sotto. Il codice {code} dà il 50% su una nuova revisione di questo sito e su una revisione dopo, fino al {until}. Non vale per i pacchetti di riparazione."
  }
};

function fill(template, vars) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => (vars && vars[key] != null ? String(vars[key]) : ""));
}

/** Follow-up note after the new report: results link + 50% code. Built on the customer note mail. */
function mailFor(record, { code, stopUrl } = {}) {
  const lang = customerMail.langOf(record && record.lang);
  const host = bareOf(record && record.report && record.report.host) || "your site";
  const t = COPY[lang] || COPY.en;
  const vars = { host, code: code || "", until: fixOffers.LAUNCH.until };
  const note = {
    lang,
    host,
    reportId: record && record.id,
    kind: "rerun-past",
    subject: fill(t.subject, vars),
    title: fill(t.title, vars),
    body: fill(t.body, vars)
  };
  return customerMail.noteMail(note, { coupon: code, stopUrl });
}

const campaignRef = (db) => db.collection(COLLECTION).doc(ID);
const hostRef = (db, bare) => campaignRef(db).collection("hosts").doc(bareOf(bare));
const sendRef = (db, email) => campaignRef(db).collection("sends").doc(hashOf(email));

/** Mint once per address; a second call returns the same code. */
async function mintFor(db, person, now, rand) {
  const email = emailOf(person && person.email);
  if (!email) throw new Error("No address to mint a re-run code for.");
  if (!fixOffers.launchOn(now)) throw new Error("The launch window ended, so no re-run code is minted.");
  return db.runTransaction(async (tx) => {
    const ref = sendRef(db, email);
    const snap = await tx.get(ref);
    if (snap.exists && snap.get("code")) return snap.get("code");
    const code = codeOf(rand);
    tx.create(db.collection("url_review_coupons").doc(code), couponFor(person, now));
    tx.set(ref, {
      emailHash: hashOf(email),
      code,
      host: bareOf(person && person.host),
      state: "minted",
      at: new Date(now == null ? Date.now() : now).toISOString()
    });
    return code;
  });
}

module.exports = {
  ID,
  COLLECTION,
  PREFIX,
  STATUSES,
  emailOf,
  hashOf,
  bareOf,
  kindOf,
  describe,
  line,
  gate,
  roomLeft,
  codeOf,
  couponFor,
  optedOut,
  hostsFromReviews,
  mailAddress,
  progressAfter,
  mailFor,
  mintFor,
  campaignRef,
  hostRef,
  COPY
};
