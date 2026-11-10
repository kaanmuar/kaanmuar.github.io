"use strict";
/* Company prospects (#3139): site-dependency companies (site-dependency.js) found by the Places night, reviewed by
   the outreach sweep, offered the 2-day trial (#3136) on their published contacts, and tracked in outreach_people.

   found     the Places night queued the host in a site-dependency sector (ledger stage found)
   reviewed  the outreach sweep reviewed it and contacts were read from its own site (company-contacts.js): not a
             ledger stage, the row's reviewedAt
   offered   a domain-locked trial was minted and the email row written for Instantly (sequence T) and/or a social
             message queued in the profile campaign (engagement-profiles.js, tone "trial") (stage offered)
   claimed   someone on the domain redeemed the trial (outreach-trials.js; stages claimed, trial_ended, discount_sent)
   paid      the domain paid, usually with the after-trial discount (TRIAL.followup.company; stage paid)

   outreach-people.js touch keeps only its own fields, so sector, country, emails, phones, reviewedAt and the cited
   findings are merged onto the same outreach_people row after it.

   Never offered: a domain on the do-not-contact list or that asked to stop, one that paid before, one the profile
   campaign is already courting with its domain offer, one with no published address or profile, or a review with no
   real finding to cite. The offer cites one or two findings from the review, the ones in the areas the sector's site
   lives on first (site-dependency.js areasOf). */
const SD = require("./site-dependency");
const P = require("./engagement-profiles");
const E = require("./engagement");
const people = require("./outreach-people");
const trials = require("./outreach-trials");

const FUNNEL = ["found", "reviewed", "offered", "claimed", "paid"];
const CLAIMED = ["claimed", "trial_ended", "discount_sent"];
const STOPPED = ["declined", "blocked"];
const SEQUENCE = "T";
const SEVERITY = { critical: 4, high: 3, medium: 2, low: 1 };
const SOCIAL_NETS = ["linkedin", "instagram", "facebook", "tiktok", "x", "threads", "bluesky", "mastodon", "youtube"];
const SOCIAL_PER_COMPANY = 2;
// Countries where B2B cold email needs prior consent (UWG §7 in Germany, TKG §174 in Austria, UWG art. 3 in Switzerland):
// their companies get the social message only.
const NO_COLD_EMAIL = new Set(["de", "at", "ch"]);
const LEAD_HEADER = ["segment", "sector", "org", "host", "cc", "country", "language", "email", "email_kind", "phone", "linkedin_url", "instagram_url", "facebook_url",
  "tiktok_url", "x_url", "source", "sequence", "sender", "finding_1", "finding_2", "finding_1_en", "finding_2_en", "reason", "trial_code", "trial_url", "trial_days",
  "after_percent", "live_report_url", "status"];

const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "").replace(/^www\./, "");

/** The trial's terms: { days, after } from outreach-trials TRIAL. */
const terms = () => ({ days: trials.TRIAL.days, after: trials.TRIAL.followup.company });

/** The ledger id of a company: web:<domain>. */
const idOf = (domain) => people.idFor("web", bare(domain));

const stageAt = (stage) => people.STAGES.indexOf(String(stage || ""));

/** Whether a ledger row was already offered a trial (offered or any later stage, or an offer on file). */
const offeredYet = (row) => !!row && ((stageAt(row.stage) >= stageAt("offered") && !STOPPED.includes(row.stage)) || (row.offers || []).length > 0);

/**
 * The one or two findings to cite, best first: failed or risky checks, by severity, then by how much the sector's
 * site depends on the area; the second from another area when there is one. findings: [{ area, verdict, severity,
 * title }] as review insights and Live Report fix lists hold them.
 */
function findingsFor(findings, sector, n) {
  const want = n || 2;
  const areas = SD.areasOf(sector);
  const weight = (f) => (SEVERITY[String(f.severity || "").toLowerCase()] || 1) * 10 + (areas.includes(f.area) ? (areas.length - areas.indexOf(f.area)) * 4 : 0);
  const list = (findings || []).filter((f) => f && f.title && (!f.verdict || f.verdict === "fail" || f.verdict === "risk"))
    .map((f, i) => ({ f, w: weight(f), i })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.f);
  const out = list.slice(0, 1);
  if (want > 1 && list.length > 1) out.push(list.find((f) => f.area !== out[0].area) || list[1]);
  return out.map((f) => ({ area: String(f.area || ""), severity: String(f.severity || ""), title: String(f.title).slice(0, 140) }));
}

/**
 * Whether and how to offer the trial: { ok, why, lang, channels, email, socials, findings, sector, reason }.
 * c: { person: personOf fields plus the ledger's stage, offers and stopped, findings, sector, dnc, paid,
 * profileCampaign (the host already has a domain offer from engagement_profiles) }. why: stopped, paid, claimed,
 * offered, profile-campaign, sector, no-findings, no-contact, or "" when ok.
 */
function offerFor(c) {
  const person = c.person || {};
  const no = (why) => ({ ok: false, why, lang: person.lang || "en", channels: [], email: "", socials: [], findings: [], sector: c.sector || "", reason: "" });
  if (c.dnc || person.stopped || STOPPED.includes(person.stage)) return no("stopped");
  if (c.paid || person.stage === "paid") return no("paid");
  if (CLAIMED.includes(person.stage)) return no("claimed");
  if (offeredYet(person)) return no("offered");
  if (c.profileCampaign) return no("profile-campaign");
  const sector = SD.sectorOf(SD.matchSector(c.sector));
  if (!sector) return no("sector");
  const findings = findingsFor(c.findings, sector.key);
  if (!findings.length) return no("no-findings");
  const email = NO_COLD_EMAIL.has(String(person.country || "").toLowerCase()) ? "" : ((person.emails || [])[0] || {}).email || "";
  const socials = (person.socials || []).filter((s) => SOCIAL_NETS.includes(s.network))
    .sort((a, b) => SOCIAL_NETS.indexOf(a.network) - SOCIAL_NETS.indexOf(b.network)).slice(0, SOCIAL_PER_COMPANY);
  const channels = [email ? "email" : "", socials.length ? "social" : ""].filter(Boolean);
  if (!channels.length) return no("no-contact");
  return { ok: true, why: "", lang: person.lang || "en", channels, email, socials, findings, sector: sector.key, reason: sector.reason };
}

/** The outreach_people fields for a company from its prospect row and its contacts. */
function personOf(row, contacts, sector) {
  const c = contacts || {};
  return {
    kind: "company", domain: bare(row.host), sector: SD.matchSector(sector || row.sector) || String(sector || row.sector || ""),
    name: c.name || "", lang: c.lang || "en", country: c.country || String(row.cc || "").toLowerCase(),
    emails: (c.emails || []).map((e) => ({ email: e.email, kind: e.kind, url: e.url })), phones: c.phones || [],
    socials: (c.socials || []).map((s) => ({ network: s.network, handle: s.handle, url: s.url })), source: row.source || "places"
  };
}

/** The Instantly lead row (prospects/week<N>-companies.csv) for an offer; findings are English until translated. */
function leadRow(row, person, offer, trial, extra) {
  const x = extra || {};
  const net = (n) => ((person.socials || []).find((s) => s.network === n) || {}).url || "";
  const t = terms();
  const e = (person.emails || []).find((m) => m.email === offer.email) || {};
  return {
    segment: "company", sector: offer.sector, org: person.name || bare(row.host), host: bare(row.host), cc: person.country, country: x.country || person.country.toUpperCase(),
    language: offer.lang, email: offer.email, email_kind: e.kind || "", phone: (person.phones || [])[0] || "",
    linkedin_url: net("linkedin"), instagram_url: net("instagram"), facebook_url: net("facebook"), tiktok_url: net("tiktok"), x_url: net("x"),
    source: e.url || "", sequence: SEQUENCE, sender: "carlos",
    finding_1: x.finding_1 || offer.findings[0].title, finding_2: x.finding_2 || (offer.findings[1] || {}).title || "",
    finding_1_en: offer.findings[0].title, finding_2_en: (offer.findings[1] || {}).title || "", reason: offer.reason,
    trial_code: trial.code, trial_url: trial.url, trial_days: String(t.days), after_percent: String(t.after), live_report_url: x.liveReport || "", status: "new"
  };
}

/** The profile-campaign items (engagement-profiles.js prompt and doc) for an offer's socials, tone "trial". */
function socialItems(person, offer, trial) {
  const t = terms();
  const target = { host: person.domain, id: "", name: person.name || person.domain, score: null, sector: offer.sector, country: String(person.country || "").toUpperCase(), weakest: offer.findings[0].area };
  return offer.socials.map((pr) => ({
    key: E.keyOf(pr.network, "trial:" + person.domain + ":" + pr.url), network: pr.network, mode: "copy", post: null, profile: pr, target,
    touch: 1, tone: "trial", lang: offer.lang, offer: { code: trial.code, percent: t.after, days: t.days, trial: true }, profiles: offer.socials
  }));
}

/**
 * Whether trial messages wait for Carlos. Carlos (2026-11-09): approval for the first week after launch, then they
 * send on their own within each network's daily cap.
 * TODO(#3137): read the shared send-mode switch once it is on main; until then every message waits.
 */
const needsApproval = () => true;

/** The engagement_posts document for a trial message, waiting for Carlos like every profile message. */
function socialDoc(item, message, link, now) {
  const d = P.doc(item, message, link, now);
  d.report.offerKind = "trial";
  d.report.approval = needsApproval();
  return d;
}

/** The engagement_profiles patch after a trial touch: it holds the trial and stops the domain-offer touches. */
function profileLedger(led, host, profiles, code, keys, now) {
  return Object.assign(P.ledgerPatch(led, host, profiles, (led && led.code) || null, 1, keys, now), { trial: code, stopped: "company-trial" });
}

/** The funnel steps a ledger row reached: { found, reviewed, offered, claimed, paid } as 0 or 1. */
function funnelOf(r) {
  const paid = r.stage === "paid";
  const claimed = paid || CLAIMED.includes(r.stage);
  const offered = claimed || offeredYet(r);
  const reviewed = offered || !!r.reviewedAt;
  return { found: 1, reviewed: +reviewed, offered: +offered, claimed: +claimed, paid: +paid };
}

/**
 * The dashboard funnel: per sector, how many companies reached each step (a paid company counts in every step before
 * it too), highest priority sector first, then a total row. rows: outreach_people companies { sector, stage,
 * reviewedAt, offers }.
 */
function stageCounts(rows) {
  const by = {};
  const zero = () => Object.fromEntries(FUNNEL.map((s) => [s, 0]));
  (rows || []).forEach((r) => {
    if (!r || stageAt(r.stage) < 0) return;
    const key = SD.matchSector(r.sector) || "other";
    const row = by[key] || (by[key] = zero());
    const f = funnelOf(r);
    FUNNEL.forEach((s) => { row[s] += f[s]; });
  });
  const order = SD.ranked().map((s) => s.key).concat("other");
  const list = order.filter((k) => by[k]).map((k) => Object.assign({ sector: k, label: (SD.sectorOf(k) || { label: "Other" }).label }, by[k]));
  const total = Object.assign({ sector: "total", label: "All segments" }, zero());
  list.forEach((r) => FUNNEL.forEach((s) => { total[s] += r[s]; }));
  return { stages: FUNNEL.slice(), rows: list, total };
}

/** The outreach-people touch patch for a company: its own fields, profiles as links, and the stage when given. */
function ledgerPatch(person, stage, extra) {
  const x = extra || {};
  const links = Object.fromEntries((person.socials || []).map((s) => [s.network, s.url]));
  return Object.assign({ kind: "company", domain: person.domain, name: person.name || "", lang: person.lang || "", email: ((person.emails || [])[0] || {}).email || "", links },
    stage ? { stage } : {}, x.offers ? { offers: x.offers } : {}, { by: x.by || "outreach-companies", note: x.note || "" });
}

/** The company fields outreach-people does not keep, merged onto the same row. */
function companyFields(person, extra) {
  return Object.assign({ sector: person.sector || "", country: person.country || "", emails: person.emails || [], phones: person.phones || [], source: person.source || "" }, extra || {});
}

/** Records a company: outreach-people touch (stages only move forward), then its company fields. */
async function record(db, person, stage, extra, fields) {
  const id = idOf(person.domain);
  const out = await people.touch(db, id, ledgerPatch(person, stage, extra));
  await db.collection(people.COLLECTION).doc(id).set(companyFields(person, fields), { merge: true });
  return out;
}

/** A domain-locked company trial: { code, url }. */
function mint(db, person, offer, by) {
  return trials.mintTrial(db, { kind: "company", person: idOf(person.domain), lang: offer.lang, email: offer.email, domain: person.domain,
    network: offer.channels.includes("email") ? "email" : (offer.socials[0] || {}).network || "", handle: (offer.socials[0] || {}).handle || "", by: by || "outreach-companies" });
}

/** The dashboard source: outreach_people companies counted by sector and funnel step (counts only, no names). */
async function dashboard(db) {
  const snap = await db.collection(people.COLLECTION).where("kind", "==", "company").select("sector", "stage", "reviewedAt", "offers").limit(20000).get();
  return Object.assign({ ok: true }, stageCounts(snap.docs.map((d) => d.data())));
}

module.exports = { FUNNEL, SEQUENCE, LEAD_HEADER, SOCIAL_NETS, NO_COLD_EMAIL, terms, idOf, offeredYet, funnelOf, needsApproval, findingsFor, offerFor, personOf, ledgerPatch, companyFields, leadRow, socialItems, socialDoc, profileLedger, stageCounts, record, mint, dashboard };
