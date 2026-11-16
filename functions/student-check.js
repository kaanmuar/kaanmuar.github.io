"use strict";
/*
 * Is this person a student? (#3138) Students get a free trial and a discount after it (functions/outreach-trials.js,
 * kind "student"). studentCheck({ email, url, text, profile, community, now }) weighs what we know about them:
 *
 *   high    a school email: a domain in Hipo's world university list (functions/university-domains.json, MIT) or an
 *           academic suffix (.edu, .edu.xx, .ac.xx). The trial can be locked to that domain (lock).
 *   medium  what they say about themselves: "Student at ...", a current education entry or a graduation year still
 *           ahead, in en/es/pt/de/fr/it; or a student community plus a learning phrase. Offered, but the claim asks
 *           for a school email at redeem time.
 *   low     a hint only (a student community alone, an alumni address, a school email on a staff profile): not offered.
 *   none    nothing says student, or school pupils (k12), whom we never approach.
 *
 * Returns { student, confidence, why, school, domain, lock, signals }.
 */
const DOMAINS = require("./university-domains.json").domains;

const RANK = { none: 0, low: 1, medium: 2, high: 3 };
const FREEMAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|gmx|web|mail|yandex|zoho|uol|bol|terra|libero|orange|free|laposte|t-online|qq|163)\./;
const ACADEMIC = /(^|\.)(edu|edu\.[a-z]{2}|ac\.[a-z]{2})$/;
const PUPILS = /(^|\.)k12\.|(^|\.)(sch|school|schule|escola|escuela)\.[a-z.]+$/;
const ALUMNI = /(^|\.)(alumni|alum|alumnos-egresados|exalumnos)\./;
const FACULTY = /\b(professor|lecturer|faculty|dean|teacher|instructor|profesora?|docente|catedr[aá]tic[oa]|dozent(in)?|enseignante?|maître de conférences|insegnante|ricercat(ore|rice)|recruiter|talent acquisition|hiring manager)\b/i;

// "Student at X", "Estudiante de Ingeniería en la X", "Studentin an der X", "Étudiante à X", "Studentessa presso X":
// the word says student; the school is the capitalised name after at/en/na/an der/à/presso, or a named institution.
const STUDENT = /(?<!\p{L})(student(?:in|e|essa)?|estudiante|estudante|[ée]tudiante?|undergrad(?:uate)?|studying|studiere|cursando|graduando|universitári[oa]|universitari[oa]|(?:cs|computer science|software engineering|information systems) major)(?!\p{L})(?!\s+(?:mentor|success|affairs|services|recruit|advis|loans?|housing|support|experience|engagement|life|body)\b)/iu;
const NAME = "[\\p{Lu}\\d][\\p{L}\\d'’&.-]*";
const LINK = "de|del|la|las|los|da|do|dos|das|der|des|di|of|and|y|e|für|for|the";
const AT = new RegExp("(?:^|\\s)(?:at|@|en(?: la| el)?|na|no|em|an der|an|à|chez|presso(?: la| il| lo)?|alla|al)\\s+(" + NAME + "(?:\\s+(?:" + NAME + "|" + LINK + ")){0,8})", "u");
const INSTITUTION = /((?:Universi\p{L}*|Univ\.|College|Institut\p{L}*|Instituto|Polytechnic|Politecnico|Polit[ée]cnic\p{L}*|Hochschule|Fachhochschule|ETH|École|Escola|Escuela|Faculdade|Facultad|Akademie|Academy)(?:\s+(?:[\p{Lu}\d][\p{L}\d'’&.-]*|de|del|la|los|da|do|der|di|of|and|y|e|für|the)){0,8})/u;
const trimName = (s) => clean(s).replace(new RegExp("(\\s+(?:" + LINK + "))+$", "u"), "");
const LEARNING = /(?<!\p{L})(bootcamp|my (first|class|course|school|uni|college) (project|portfolio|assignment)|capstone|final[- ]year project|thesis|tfg|tcc|abschlussarbeit|mémoire|tesi|learning to code|aprendiendo a programar|aprendendo a programar|semest(er|re)|cuatrimestre|internship hunt|looking for (an )?internship|busco pr[aá]cticas|procuro est[aá]gio|praktikum|stage de fin d'études|tirocinio)(?!\p{L})/iu;
const GRAD_YEAR = /\b(?:class of|graduat(?:e|ing|ion)(?: in)?|expected|egreso|formatura|abschluss|promo(?:tion|ción|ção)?|diploma)\D{0,12}(20\d\d)\b|\b(20\d\d)\s*(?:grad|graduate)\b|\b20\d\d\s*[–-]\s*(20\d\d)\b/i;

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const hostOf = (v) => {
  try { return new URL(/^https?:\/\//i.test(v) ? v : "https://" + v).hostname.toLowerCase().replace(/^www\./, ""); } catch (error) { return ""; }
};

/** The school a domain belongs to, walking up from subdomains (cs.mit.edu, alumnos.unal.edu.co): { domain, school, cc } or null. */
function schoolOf(host) {
  const parts = String(host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    const d = parts.slice(i).join(".");
    if (DOMAINS[d]) {
      const [cc, school] = DOMAINS[d].split("|");
      return { domain: d, school, cc };
    }
  }
  return null;
}

/** What an email address says: { level, domain, school, why }. */
function emailSignal(email) {
  const m = clean(email).toLowerCase().match(/^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  const host = m[1];
  if (FREEMAIL.test(host)) return null;
  if (PUPILS.test(host)) return { level: "none", domain: host, school: "", why: "a school pupils' address (" + host + "), never approached", pupil: true };
  const hit = schoolOf(host);
  const academic = ACADEMIC.test(host);
  if (!hit && !academic) return null;
  const domain = hit ? hit.domain : host.split(".").slice(-(/\.(edu|ac)\.[a-z]{2}$/.test(host) ? 3 : 2)).join(".");
  if (ALUMNI.test(host)) return { level: "low", domain, school: hit ? hit.school : "", why: "an alumni address at " + domain };
  return { level: "high", domain, school: hit ? hit.school : "", why: hit ? "a school email at " + domain + " (" + hit.school + ")" : "an academic email domain (" + domain + ")" };
}

/** The profile as text, and its education entries: a LinkedIn-like object or a string. */
function profileText(p) {
  if (!p) return { text: "", education: [] };
  if (typeof p === "string") return { text: clean(p), education: [] };
  const education = (Array.isArray(p.education) ? p.education : []).map((e) => (typeof e === "string" ? { school: e } : e || {}));
  return { text: clean([p.headline, p.title, p.about, p.bio, p.name].filter(Boolean).join(" | ")), education };
}

/** What their own words say: { level, school, why } or null. */
function wordsSignal(text, education, year) {
  const out = [];
  const m = text.match(STUDENT);
  if (m) {
    const rest = text.slice(m.index).split(/[|·•\n]/)[0];
    const at = rest.match(AT) || rest.match(INSTITUTION);
    out.push({ level: "medium", school: at ? trimName(at[1]).slice(0, 80) : "", why: "says \"" + clean(rest).slice(0, 80) + "\"" });
  }
  const g = text.match(GRAD_YEAR);
  const gy = g && Number(g[1] || g[2] || g[3]);
  if (gy && gy >= year) out.push({ level: "medium", school: "", why: "graduates in " + gy });
  else if (gy) out.push({ level: "none", school: "", why: "graduated in " + gy, past: true });
  education.forEach((e) => {
    const end = Number(String(e.end || e.endYear || e.to || "").match(/20\d\d/) || 0);
    if (e.school && (e.current === true || end >= year)) out.push({ level: "medium", school: clean(e.school), why: "studies at " + clean(e.school) + (end ? " until " + end : " now") });
    else if (e.school && end && end < year) out.push({ level: "none", school: "", why: "graduated from " + clean(e.school) + " in " + end, past: true });
  });
  if (!out.length && LEARNING.test(text)) out.push({ level: "low", school: "", why: "talks like a learner (\"" + clean(text.match(LEARNING)[0]) + "\")", learning: true });
  return out;
}

/** Whether a community (or the url of a post in it) is a student one: { student, name } from the object or the curated list. */
function communitySignal(community, url) {
  if (community && typeof community === "object") return community.audience === "students" || community.student === true ? { name: clean(community.name) } : null;
  const list = require("./student-communities.json").communities;
  const at = clean(typeof community === "string" ? community : url).toLowerCase();
  if (!at) return null;
  const c = list.find((x) => x.url && at.startsWith(x.url.toLowerCase().replace(/\/$/, "")));
  return c ? { name: c.name } : null;
}

/**
 * Is this person a student? email: their address; url: their profile, site or the post where we met them; text: what
 * they wrote; profile: a headline string or { headline, about, education: [{ school, end, current }] }; community: where
 * they posted ({ name, audience: "students" } or its url).
 */
function studentCheck(input) {
  const o = input || {};
  const year = new Date(o.now || Date.now()).getUTCFullYear();
  const signals = [];
  const mail = emailSignal(o.email);
  if (mail) signals.push(mail);
  const site = hostOf(o.url);
  const siteSchool = site && schoolOf(site);
  if (siteSchool) signals.push({ level: "low", school: siteSchool.school, why: "a page on " + siteSchool.domain });
  const prof = profileText(o.profile);
  const text = clean([prof.text, o.text].filter(Boolean).join(" | "));
  const words = wordsSignal(text, prof.education, year);
  signals.push(...words);
  const comm = communitySignal(o.community, o.url);
  if (comm) signals.push({ level: words.some((w) => w.learning || w.level === "medium") ? "medium" : "low", school: "", why: "posted in a student community (" + comm.name + ")" });

  if (signals.some((s) => s.pupil)) return { student: false, confidence: "none", why: signals.find((s) => s.pupil).why, school: "", domain: "", lock: false, signals: signals.map((s) => s.why) };
  const faculty = FACULTY.test(prof.text || text) && !words.some((w) => w.level === "medium" && !w.past);
  const past = words.some((w) => w.past) && !words.some((w) => w.level === "medium");
  let level = signals.reduce((best, s) => (RANK[s.level] > RANK[best] ? s.level : best), "none");
  if (faculty) level = level === "high" ? "low" : "none";
  else if (past) level = level === "high" ? "medium" : "none";
  const why = signals.filter((s) => s.why).map((s) => s.why).concat(faculty ? ["the profile reads as staff, not a student"] : []);
  const school = (mail && mail.school) || (signals.find((s) => s.school) || {}).school || "";
  return {
    student: RANK[level] >= RANK.medium, confidence: level, why: why.join("; ") || "nothing says student", school,
    domain: mail && mail.level === "high" ? mail.domain : "", lock: !!(mail && mail.level === "high" && level === "high"), signals: why
  };
}

module.exports = { studentCheck, schoolOf, emailSignal, ACADEMIC, FREEMAIL };
