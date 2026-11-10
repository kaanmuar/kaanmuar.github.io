"use strict";
/*
 * Outreach trials (#3136): the social, student and company routines hand a person a TRY- link; signed in on the review
 * page it opens a short Freelancer pass at no charge; when that ends, the person gets an AFTER- code off the next
 * review. Every step moves the person on in the outreach ledger (outreach-people.js).
 *
 *   url_review_coupons/TRY-XXXXXX    { trial: true, percent: 0, purposes: ["trial"], maxUses 1, perEmail 1, validUntil
 *                                      +codeDays, kind, person, lang, email, domain, locked, network, handle, by }
 *                                      percent 0 keeps it closed at checkout (couponOpen)
 *   url_reviews/trial-<code>          the pass row: offers.passPurchase with priceUsd 0, paid false, trial true,
 *                                      TRIAL.runs runs for TRIAL.days; followup "" until endTrials mints its AFTER code
 *   url_review_trials/email:<addr>    one trial per address, and domain:<host> one per locked student or company domain
 *   url_review_coupons/AFTER-XXXXXX  { percent: TRIAL.followup[kind], perEmail 1, maxUses 1, validUntil +followupDays,
 *                                      purposes new-run and report, the ones a checkout takes a code for }
 *
 * The Mac agent and scripts call, signed with the Mac's paired token (engagement-mac.js verify):
 *   outreach-mint   { kind, person?, lang, email, domain, network, handle, name, by }  -> { ok, code, url, person }
 *   outreach-touch  { id, patch }                                                   -> { ok, person }
 *   outreach-due    { kind, stage, before, limit }                                  -> { ok, people }
 */
const crypto = require("crypto");
const offers = require("./url-review-offers");
const people = require("./outreach-people");

// The follow-up percentages wait for Carlos's numbers; they live only here.
const TRIAL = { days: 2, plan: "freelancer", runs: 3, followup: { social: 20, company: 20, student: 40 }, followupDays: 7, codeDays: 14 };

const DAY = 24 * 3600000;
const SITE = "https://carlosandmunoz.com";
const PAGES = { en: "qa-review.html", es: "qa-review-es.html", pt: "qa-review-pt.html", de: "qa-review-de.html", fr: "qa-review-fr.html", it: "qa-review-it.html" };
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TRY = /^TRY-[A-Z0-9]{6}$/;
const AFTER = /^AFTER-[A-Z0-9]{6}$/;
const LOCKED_KINDS = ["student", "company"];
const AFTER_PURPOSES = ["new-run", "report"];

const iso = (ms) => new Date(ms).toISOString();
const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const langOf = (v) => (PAGES[String(v || "").slice(0, 2).toLowerCase()] ? String(v).slice(0, 2).toLowerCase() : "en");
const emailOf = (v) => { const e = clip(v, 200).toLowerCase(); return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e) ? e : ""; };
const domainOf = (v) => clip(v, 200).toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "");
const pick = (rand) => rand || ((n) => crypto.randomInt(n));
const codeOf = (prefix, rand) => prefix + Array.from({ length: 6 }, () => ALPHABET[pick(rand)(ALPHABET.length)]).join("");
const cleanTry = (v) => { const c = clip(v, 24).toUpperCase(); return TRY.test(c) ? c : ""; };

class TrialError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

/** The review page in the person's language, with params. */
function pageUrl(lang, params) {
  const url = new URL(SITE + "/" + PAGES[langOf(lang)]);
  Object.entries(params || {}).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  return url.toString();
}

/** A coupon under a fresh code, retried on the rare taken code. */
async function createCoupon(db, prefix, coupon, rand) {
  for (let tries = 0; tries < 5; tries += 1) {
    const code = codeOf(prefix, rand);
    try {
      await db.collection("url_review_coupons").doc(code).create(coupon);
      return code;
    } catch (error) {
      if (error.code !== 6 && !/ALREADY_EXISTS/.test(String(error.message))) throw error;
    }
  }
  throw new TrialError("No free code after five tries.", 500);
}

/**
 * A trial link for one person: { code, url }. person is the ledger id; without it, idFor(network, handle), or
 * web:<domain> for a company. A student or company trial with a domain opens only for an address on that domain.
 */
async function mintTrial(db, opts, now, rand) {
  const o = opts || {};
  if (!people.KINDS.includes(o.kind)) throw new TrialError("kind is social, student or company.");
  const at = now == null ? Date.now() : Number(now);
  const domain = domainOf(o.domain);
  const person = clip(o.person, 200) || (o.kind === "company" && domain ? people.idFor("web", domain) : people.idFor(o.network, o.handle));
  if (!person) throw new TrialError("Name the person: person, network and handle, or a company's domain.");
  const lang = langOf(o.lang);
  const coupon = {
    trial: true, percent: 0, kind: o.kind, person, lang, email: emailOf(o.email), domain, locked: !!domain && LOCKED_KINDS.includes(o.kind),
    network: clip(o.network, 30).toLowerCase(), handle: clip(o.handle, 120).replace(/^@+/, ""), by: clip(o.by, 60),
    maxUses: 1, uses: 0, perEmail: 1, validFrom: iso(at), validUntil: iso(at + TRIAL.codeDays * DAY), purposes: ["trial"],
    source: "outreach-trial", createdAt: iso(at)
  };
  const code = await createCoupon(db, "TRY-", coupon, rand);
  return { code, url: pageUrl(lang, { trial: code }) };
}

/** Why a trial coupon cannot be claimed now, or "": gone, expired or used. */
function closed(coupon, now) {
  if (!coupon || coupon.trial !== true) return "gone";
  if (Date.parse(coupon.validFrom || "") > now) return "gone";
  if (Date.parse(coupon.validUntil || "") <= now) return "expired";
  if (Number(coupon.uses || 0) >= Number(coupon.maxUses || 1)) return "used";
  return "";
}

/** What the review page's banner may show of a trial code: no address and no person. */
function trialView(code, coupon, now) {
  const why = closed(coupon, now);
  const plan = offers.planById(TRIAL.plan);
  return {
    code, open: !why, why, days: TRIAL.days, runs: TRIAL.runs, plan: plan.id, planName: plan.name,
    validUntil: coupon && coupon.validUntil ? coupon.validUntil : "", domain: coupon && coupon.locked ? coupon.domain : ""
  };
}

/** The trial's public view, or null when the code is not a trial code. */
async function view(db, code, now) {
  const key = cleanTry(code);
  if (!key) return null;
  const snap = await db.collection("url_review_coupons").doc(key).get();
  return trialView(key, snap.exists ? snap.data() : null, now == null ? Date.now() : Number(now));
}

const markerRef = (db, kind, value) => db.collection("url_review_trials").doc(kind + ":" + String(value).replace(/\//g, "_"));

/**
 * Claims a trial for a signed-in address in one transaction: { ok, why, id, pass, paidUntil }. why: code, gone, expired,
 * used, email (this address had a trial), domain (not an address on the locked domain), domain-used (that domain had
 * its trial) or pass (an open pass already). rows: the address's pass rows (index.js passRowsFor); matches:
 * core.mailboxMatchesHost. A second claim of the same code by the same address answers ok again.
 */
async function redeemTrial(db, opts) {
  const o = opts || {};
  const key = cleanTry(o.code);
  const email = emailOf(o.email);
  const at = o.now == null ? Date.now() : Number(o.now);
  if (!key) return { ok: false, why: "code" };
  if (!email) return { ok: false, why: "sign-in" };
  const col = db.collection("url_reviews");
  const ref = col.doc("trial-" + key);
  const couponRef = db.collection("url_review_coupons").doc(key);
  const out = await db.runTransaction(async (tx) => {
    const [done, couponSnap, mine] = await Promise.all([tx.get(ref), tx.get(couponRef), tx.get(markerRef(db, "email", email))]);
    if (done.exists) {
      const row = Object.assign({ id: ref.id }, done.data());
      return row.email === email ? { ok: true, row, again: true } : { ok: false, why: "used" };
    }
    const coupon = couponSnap.exists ? couponSnap.data() : null;
    const why = closed(coupon, at);
    if (why) return { ok: false, why };
    if (mine.exists) return { ok: false, why: "email" };
    if (coupon.locked && !o.matches(email, coupon.domain)) return { ok: false, why: "domain" };
    const site = coupon.locked ? await tx.get(markerRef(db, "domain", coupon.domain)) : null;
    if (site && site.exists) return { ok: false, why: "domain-used" };
    if (offers.passFor(o.rows || [], email, at)) return { ok: false, why: "pass" };
    const made = offers.passPurchase(TRIAL.plan, [], email, at, {
      priceUsd: 0, paid: false, trial: true, trialCode: key, kind: coupon.kind, person: coupon.person, lang: coupon.lang,
      runs: TRIAL.runs, paidUntil: iso(at + TRIAL.days * DAY), followup: "", createdAt: iso(at), expireAt: o.expireAt || null
    });
    tx.set(ref, made.row);
    tx.update(couponRef, { uses: Number(coupon.uses || 0) + 1, lastUsedAt: iso(at), redeemedBy: email });
    const mark = { code: key, at: iso(at), person: coupon.person, kind: coupon.kind };
    tx.set(markerRef(db, "email", email), mark);
    if (site) tx.set(markerRef(db, "domain", coupon.domain), Object.assign({ email }, mark));
    return { ok: true, row: Object.assign({ id: ref.id }, made.row) };
  });
  if (!out.ok) return out;
  if (!out.again && out.row.person) {
    await people.touch(db, out.row.person, { stage: "claimed", email, by: "trial-redeem", note: key }, at).catch((error) => console.error("Ledger claim failed:", error));
  }
  return { ok: true, why: "", id: out.row.id, pass: offers.passView(out.row), paidUntil: out.row.paidUntil };
}

const NOTE = {
  en: { subject: "Your QA-lab trial ended: {p}% off your next review", body: "Thanks for trying QA-lab URL Review. Your {days}-day trial has ended.\n\nCode {code} takes {p}% off your next review or report until {date}. It is already in this link:" },
  es: { subject: "Terminó tu prueba de QA-lab: {p}% de descuento en tu próxima revisión", body: "Gracias por probar QA-lab URL Review. Tu prueba de {days} días terminó.\n\nEl código {code} te da un {p}% de descuento en tu próxima revisión o informe hasta el {date}. Ya va en este enlace:" },
  pt: { subject: "Seu teste do QA-lab terminou: {p}% de desconto na próxima revisão", body: "Obrigado por testar o QA-lab URL Review. Seu teste de {days} dias terminou.\n\nO código {code} dá {p}% de desconto na sua próxima revisão ou relatório até {date}. Ele já está neste link:" },
  de: { subject: "Ihr QA-lab-Test ist beendet: {p} % Rabatt auf Ihre nächste Prüfung", body: "Danke, dass Sie QA-lab URL Review getestet haben. Ihr {days}-tägiger Test ist beendet.\n\nDer Code {code} gibt Ihnen bis {date} {p} % Rabatt auf Ihre nächste Prüfung oder Ihren nächsten Bericht. Er steckt schon in diesem Link:" },
  fr: { subject: "Votre essai QA-lab est terminé : {p} % sur votre prochain audit", body: "Merci d'avoir essayé QA-lab URL Review. Votre essai de {days} jours est terminé.\n\nLe code {code} vous donne {p} % sur votre prochain audit ou rapport jusqu'au {date}. Il est déjà dans ce lien :" },
  it: { subject: "La tua prova di QA-lab è finita: {p}% di sconto sulla prossima revisione", body: "Grazie per aver provato QA-lab URL Review. La tua prova di {days} giorni è finita.\n\nIl codice {code} ti dà il {p}% di sconto sulla prossima revisione o report fino al {date}. È già in questo link:" }
};

const STOP = { en: "No more notes like this: {stop}", es: "No recibir más avisos como este: {stop}", pt: "Não receber mais avisos como este: {stop}", de: "Keine solchen Hinweise mehr: {stop}", fr: "Ne plus recevoir ce type de message : {stop}", it: "Non ricevere più avvisi come questo: {stop}" };

/** The follow-up note, plain text in the person's language: { lang, subject, text, vars }; vars.stop adds the stop link. */
function followupNote(lang, vars) {
  const l = langOf(lang);
  const fill = (s) => s.replace(/\{(\w+)\}/g, (all, k) => (vars[k] == null ? all : String(vars[k])));
  const text = fill(NOTE[l].body) + "\n\n" + vars.url + "\n\nQA-lab URL Review" + (vars.stop ? "\n\n" + fill(STOP[l]) : "");
  return { lang: l, subject: fill(NOTE[l].subject), text, vars };
}

/** Whether a trial pass row has ended: past its end, or every run spent. */
function ended(row, now) {
  return !!row && row.trial === true && (Date.parse(row.paidUntil || "") <= now || offers.passLeft(row) <= 0);
}

/**
 * The scheduled pass over trials (outreachTrials): each ended trial without a follow-up gets its AFTER code, claimed in
 * the same transaction so a second run mints nothing more, and its person moves to trial_ended. mail(row, note) sends
 * the note and answers whether it went; a sent note moves the person to discount_sent. Returns a one-line summary.
 */
async function endTrials(db, opts) {
  const o = opts || {};
  const at = o.now == null ? Date.now() : Number(o.now);
  const snap = await db.collection("url_reviews").where("trial", "==", true).where("followup", "==", "").limit(300).get();
  const due = snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((row) => ended(row, at));
  let minted = 0;
  let mailed = 0;
  for (const row of due) {
    const percent = TRIAL.followup[row.kind] || TRIAL.followup.social;
    const until = at + TRIAL.followupDays * DAY;
    const code = codeOf("AFTER-", o.rand);
    const ref = db.collection("url_reviews").doc(row.id);
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists || fresh.get("followup")) return false;
      tx.set(db.collection("url_review_coupons").doc(code), {
        percent, perEmail: 1, maxUses: 1, uses: 0, email: row.email, kind: row.kind || "", person: row.person || "", trial: row.trialCode || "",
        validFrom: iso(at), validUntil: iso(until), purposes: AFTER_PURPOSES.slice(), source: "outreach-after", createdAt: iso(at)
      });
      tx.update(ref, { followup: code, followupAt: iso(at) });
      return true;
    });
    if (!claimed) continue;
    minted += 1;
    const url = pageUrl(row.lang, { coupon: code });
    if (row.person) await people.touch(db, row.person, { stage: "trial_ended", offers: [{ code, kind: "after", at: iso(at), url }], by: "outreachTrials" }, at).catch((error) => console.error("Ledger trial end failed:", error));
    const note = followupNote(row.lang, { code, p: percent, days: TRIAL.days, date: iso(until).slice(0, 10), url });
    const sent = o.mail ? await o.mail(row, note).catch((error) => { console.error("Trial follow-up mail failed:", error); return false; }) : false;
    if (!sent) continue;
    mailed += 1;
    await ref.update({ followupMailedAt: iso(at) });
    if (row.person) await people.touch(db, row.person, { stage: "discount_sent", by: "outreachTrials", note: "mailed " + code }, at).catch((error) => console.error("Ledger discount note failed:", error));
  }
  return due.length ? due.length + " trials ended, " + minted + " follow-up codes, " + mailed + " mailed" : "no trials ended";
}

/** A payment that used an AFTER code moves its person to paid. */
async function afterPaid(db, code, now) {
  const key = clip(code, 24).toUpperCase();
  if (!AFTER.test(key)) return null;
  const snap = await db.collection("url_review_coupons").doc(key).get();
  const person = snap.exists ? snap.get("person") : "";
  return person ? people.touch(db, person, { stage: "paid", by: "payment", note: key }, now) : null;
}

/** outreach-mint: a trial link, and the person moved to offered with the offer on their row. */
async function opMint(deps, body) {
  const b = body || {};
  const minted = await mintTrial(deps.db, b, deps.now, deps.rand);
  const id = clip(b.person, 200) || (b.kind === "company" && domainOf(b.domain) ? people.idFor("web", b.domain) : people.idFor(b.network, b.handle));
  const person = await people.touch(deps.db, id, {
    kind: b.kind, network: b.network, handle: b.handle, name: b.name, lang: b.lang, domain: b.domain, email: b.email,
    stage: "offered", offers: [{ code: minted.code, kind: "trial", url: minted.url }], by: clip(b.by, 60) || "outreach-mint"
  }, deps.now);
  return { ok: true, code: minted.code, url: minted.url, person: { id: person.id, stage: person.stage, moved: person.moved } };
}

async function opTouch(deps, body) {
  const b = body || {};
  const person = await people.touch(deps.db, b.id, b.patch || {}, deps.now);
  return { ok: true, person };
}

async function opDue(deps, body) {
  const b = body || {};
  return { ok: true, people: await people.listDue(deps.db, { kind: b.kind, stage: b.stage, before: b.before, limit: b.limit }) };
}

const OPS = { "outreach-mint": opMint, "outreach-touch": opTouch, "outreach-due": opDue };

/** Runs one ledger op once the caller checked the Mac's token. deps: { db, now }. */
async function handle(deps, body) {
  const op = OPS[String((body || {}).op || "")];
  if (!op) throw new TrialError("Unknown outreach op.");
  return op(deps, body);
}

module.exports = { TRIAL, PAGES, OPS, TrialError, pageUrl, mintTrial, trialView, view, redeemTrial, followupNote, ended, endTrials, afterPaid, handle };
