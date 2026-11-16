// The rescue of a failed URL review that the rules and the fixes do not settle (#3080): what stands in the way, an ordered
// ladder of read strategies from cheap to expensive, a Gemini diagnosis that may reorder it, and a per-host hint of what worked.
//
//   url_review_rescues/{id}     one per address and asker: { url, host, failedAt, group, diagnosis, attempts, status, day, ... }
//                               status: trying, mac-wanted (scripts/review-rescue.js takes it), rescued, site, exhausted, settled,
//                               given-up (its promise ran out, url-review-promise.js PROMISE_GIVE_UP_DAYS)
//   url_review_read_hints/{h}   one per bare host: { strategy, step, url, at, wins } so the next rescue tries it first
//
// From Google's network most bot walls refuse every header profile, while a home connection reads the same sites (#3080),
// so the ladder ends on Carlos's Mac.

const Gemini = require("./gemini");
const reviewPromise = require("./url-review-promise");

const RESCUE_DAYS = 14;
const RESCUES_PER_DAY = 6;
const ATTEMPTS_PER_DAY = 3;
const AI_PER_DAY = 10;
const AI_PER_FAILURE_DAY = 1;
const MAC_PER_RUN = 8;
// Promised rescues (#3079) the Mac takes in one hourly run, ahead of the others and outside the daily caps: those inside the
// 48-hour deadline first, then those past it, still owed until PROMISE_GIVE_UP_DAYS (#3257).
const MAC_PROMISED_PER_HOUR = 4;
// Hours a promised rescue waits after a failed Mac read before the Mac tries it again, inside the deadline and past it.
const MAC_RETRY_H = 3;
const MAC_LATE_RETRY_H = 12;
const MAC_TRIES = 2;
const HINT_DAYS = 60;
const AI_LINES = 30;

const STRATEGIES = {
  "chrome-headers": { where: "cloud", label: "Read as a person's Chrome from the cloud" },
  "alt-host": { where: "cloud", label: "Read the other host name (with or without www)" },
  mac: { where: "mac", label: "Read from Carlos's Mac on a home connection, up to a real Chrome window" }
};
// What the Mac tries, in order; the step that read the page is kept on the hint.
const MAC_STEPS = {
  "mac-plain": "The review's own read from a home connection",
  "mac-chrome-headers": "A person's Chrome headers from a home connection",
  "mac-chrome-window": "A real Chrome window that clears the challenge before the review reads it"
};
const BLOCKERS = {
  "waf-ip": "A bot wall that refuses data-center addresses",
  "waf-ua": "A bot wall that refuses the review's user agent",
  "js-challenge": "A JavaScript challenge page",
  "interactive-challenge": "A challenge that asks for a click or a captcha",
  "geo-block": "The site answers only some countries",
  "consent-wall": "A consent or cookie wall in front of the page",
  "rate-limit": "The site limits how often it is read",
  "slow-origin": "The site's server is slow to answer",
  "http2": "The site breaks Chrome's HTTP/2 connection",
  "tls-broken": "The site's TLS or certificate fails",
  "wrong-host": "The address is the wrong host name (www or bare)",
  "site-down": "The site accepts no connection",
  "site-error": "The site answers every client with an error",
  unknown: "Not clear yet"
};
const VENDORS = ["Cloudflare", "Akamai", "DataDome", "PerimeterX", "Imperva", "AWS WAF", "Radware", "Sucuri", "F5", "Kasada", "Vercel", "other", "none"];
// Causes a rescue reads again. input and dns are the asker's or the site's; save and unknown are our code, settled by fixes.
const RESCUABLE = ["bot-protection", "status", "timeout", "down", "connection", "tls", "browser", "http-redirect", "redirect-loop"];
const SITE_CERT = /CERT_HAS_EXPIRED|certificate has expired|ERR_TLS_CERT_ALTNAME_INVALID|altnames|SELF_SIGNED_CERT|self[- ]signed/i;

const clip = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
const msOf = (value) => Date.parse(value) || 0;
const dayOf = (now) => new Date(Number(now) || Date.now()).toISOString().slice(0, 10);
const bare = (host) => String(host || "").toLowerCase().replace(/^www\./, "");
const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch (error) { return ""; } };
const hintId = (host) => bare(host).replace(/[^a-z0-9.-]/g, "").slice(0, 120) || "-";

function altUrl(url) {
  try {
    const next = new URL(url);
    if (/^\d+(\.\d+){3}$/.test(next.hostname) || next.hostname.split(".").length < 2) return "";
    next.hostname = /^www\./i.test(next.hostname) ? next.hostname.slice(4) : "www." + next.hostname;
    return next.toString();
  } catch (error) {
    return "";
  }
}

// A plain read that got the page: an HTML answer under 400 with no challenge.
function readable(probe) {
  const read = probe || {};
  return !read.error && !read.httpRedirect && read.status >= 200 && read.status < 400 && !!read.html && !read.challenge;
}

function probeNote(probe) {
  const read = probe || {};
  if (read.error) return clip("fails: " + read.error, 160);
  if (read.httpRedirect) return clip("redirects to " + read.httpRedirect, 160);
  return "status " + (read.status || 0) + (read.challenge ? ", " + read.challenge + " bot check" : "") + (read.html ? "" : ", not HTML");
}

const VENDOR_SIGNS = [
  ["Cloudflare", /cloudflare|cf-ray|just a moment|un momento|attention required|challenge-platform/i],
  ["Akamai", /akamai|edgesuite|reference #\d+\.[0-9a-f]+/i],
  ["DataDome", /datadome|captcha-delivery/i],
  ["PerimeterX", /perimeterx|px-captcha|human security/i],
  ["Imperva", /imperva|incapsula|_incap_/i],
  ["AWS WAF", /aws waf|awswaf|cloudfront/i],
  ["Radware", /radware|shieldsquare/i],
  ["Sucuri", /sucuri/i],
  ["F5", /\bf5\b|big-?ip|volterra/i],
  ["Kasada", /kasada|kpsdk/i],
  ["Vercel", /vercel/i]
];

function vendorOf(failure) {
  const row = failure || {};
  const probe = row.probe || {};
  const named = (row.cause && row.cause.vendor) || (probe.plain && probe.plain.challenge) || (probe.browser && probe.browser.challenge) || "";
  const text = [named, row.error && row.error.message, probe.plain && probe.plain.server].join(" ");
  const found = VENDOR_SIGNS.find(([, pattern]) => pattern.test(text));
  return found ? found[0] : named ? "other" : "none";
}

// What the rules and Gemini read: the failure, its probe and the last log lines of it and of its failed re-run.
function evidenceOf(failure, rerun, probeLines) {
  const row = failure || {};
  const again = rerun || {};
  const lines = (Array.isArray(row.lines) ? row.lines : []).slice(-AI_LINES).map((line) => clip(line && line.text, 240));
  const rerunLines = (Array.isArray(again.lines) ? again.lines : []).slice(-15).map((line) => clip(line && line.text, 240));
  const probe = row.probe || {};
  const plain = probe.plain || {};
  return {
    url: clip(row.url, 300),
    host: row.host || hostOf(row.url),
    cause: (row.cause && row.cause.id) || "unknown",
    status: (row.cause && row.cause.status) || plain.status || 0,
    vendor: vendorOf(row),
    message: clip(row.error && row.error.message, 400),
    now: clip(row.diagnosis && row.diagnosis.nowLabel, 300),
    probe: (Array.isArray(probeLines) ? probeLines : []).map((line) => clip(line, 240)),
    tcpOpen: probe.tcp ? probe.tcp.open : null,
    browserOk: !!(probe.browser && probe.browser.ok && probe.browser.docStatus < 400 && !probe.browser.challenge),
    rerun: again.status ? clip((again.error && again.error.message) || again.status, 300) : "",
    lines,
    rerunLines
  };
}

// The rule-based diagnosis, also the fallback when Gemini is off, over its cap or answers out of schema.
function ruleDiagnosis(evidence) {
  const ev = evidence || {};
  const text = [ev.message, ev.now, ev.rerun].concat(ev.lines || [], ev.rerunLines || []).join(" ");
  const vendor = ev.vendor || "none";
  const out = (blocker, strategies, confidence, extra) => Object.assign({
    by: "rules",
    blocker,
    vendor,
    confidence,
    siteSide: false,
    strategies,
    summary: BLOCKERS[blocker] + (vendor !== "none" && vendor !== "other" ? " (" + vendor + ")" : "") + "."
  }, extra || {});
  if (ev.cause === "tls") return SITE_CERT.test(text) ? out("tls-broken", [], 0.9, { siteSide: true }) : out("tls-broken", ["mac"], 0.5);
  if (/ERR_HTTP2_PROTOCOL_ERROR/.test(text)) return out("http2", ["chrome-headers", "mac"], 0.7);
  if (ev.status === 429 || /status 429\b/.test(text)) return out("rate-limit", ["mac"], 0.6);
  if (ev.cause === "down" || ev.tcpOpen === false) return out(/\.co(\/|$)|\.gov\.co|\.edu\.co/.test(ev.url) ? "geo-block" : "site-down", ["alt-host", "mac"], 0.4);
  if (ev.cause === "timeout" || ev.cause === "connection") return out(/\.co(\/|$)/.test(ev.url) ? "geo-block" : "slow-origin", ["alt-host", "mac"], 0.4);
  if (ev.cause === "status" && ev.status >= 500) return out("site-error", ["mac"], 0.4);
  if (/captcha|turnstile|confirm(e)? (que es|you are) human|press (and|&) hold/i.test(text)) return out("interactive-challenge", ["mac"], 0.6);
  if (/just a moment|un momento|checking your browser|challenge/i.test(text)) return out("js-challenge", ["chrome-headers", "mac"], 0.6);
  if (/review tag|review's name/i.test(text)) return out("waf-ua", ["chrome-headers", "mac"], 0.6);
  if (ev.cause === "http-redirect" || ev.cause === "redirect-loop") return out("wrong-host", ["alt-host", "chrome-headers", "mac"], 0.4);
  if (ev.cause === "bot-protection" || ev.cause === "browser") return out("waf-ip", ["chrome-headers", "mac"], ev.browserOk ? 0.7 : 0.5);
  return out("unknown", ["chrome-headers", "alt-host", "mac"], 0.2);
}

const AI_SCHEMA = '{"blocker": one of ' + JSON.stringify(Object.keys(BLOCKERS)) + ', "vendor": one of ' + JSON.stringify(VENDORS) +
  ', "confidence": number 0..1, "siteSide": true only when no reader anywhere would get the page (expired certificate, site down for everyone, 404 for everyone), ' +
  '"strategies": ordered subset of ' + JSON.stringify(Object.keys(STRATEGIES)) + ', "summary": "one or two plain sentences for the review desk", "research": "what you found about this site or vendor, or empty"}';

function aiPrompt(evidence) {
  const ev = evidence || {};
  return [
    "A website review service failed to read a site. A person opening it in their own browser from Colombia often gets it at once.",
    "The service reads from Google Cloud (a data-center address): first a plain HTTPS request with its own user agent, then headless Chrome.",
    "Diagnose what blocks the reader and pick the read strategies to try next, cheapest first. Search the web for this host and its protection vendor if that helps.",
    "Strategies: " + Object.keys(STRATEGIES).map((id) => id + " = " + STRATEGIES[id].label).join("; ") + ".",
    "",
    "Address: " + ev.url,
    "Failure class: " + ev.cause + (ev.status ? " (status " + ev.status + ")" : "") + (ev.vendor && ev.vendor !== "none" ? ", vendor seen: " + ev.vendor : ""),
    "Error: " + ev.message,
    ev.now ? "Daily probe now: " + ev.now : "",
    (ev.probe || []).length ? "Probe:\n" + ev.probe.map((line) => "- " + line).join("\n") : "",
    ev.rerun ? "Last re-run: " + ev.rerun : "",
    (ev.lines || []).length ? "Last log lines:\n" + ev.lines.join("\n") : "",
    (ev.rerunLines || []).length ? "Re-run log lines:\n" + ev.rerunLines.join("\n") : "",
    "",
    "Answer with only one JSON object, no prose and no code fence: " + AI_SCHEMA
  ].filter(Boolean).join("\n");
}

// Gemini's answer, kept only when every field is in the schema; anything else falls back to the rules.
function parseAi(text) {
  const raw = String(text || "");
  const body = (raw.match(/\{[\s\S]*\}/) || [])[0];
  if (!body) return null;
  let data;
  try { data = JSON.parse(body); } catch (error) { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!Object.prototype.hasOwnProperty.call(BLOCKERS, data.blocker)) return null;
  if (!VENDORS.includes(data.vendor)) return null;
  const confidence = Number(data.confidence);
  if (!(confidence >= 0 && confidence <= 1)) return null;
  if (!Array.isArray(data.strategies) || data.strategies.some((id) => !Object.prototype.hasOwnProperty.call(STRATEGIES, id))) return null;
  if (typeof data.summary !== "string" || !data.summary.trim()) return null;
  return {
    by: "gemini",
    blocker: data.blocker,
    vendor: data.vendor,
    confidence: Math.round(confidence * 100) / 100,
    siteSide: data.siteSide === true,
    strategies: Array.from(new Set(data.strategies)),
    summary: clip(data.summary, 400),
    research: clip(data.research, 400)
  };
}

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

async function groundedCall(fetchImpl, url, headers, body, label) {
  const res = await fetchImpl(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), signal: AbortSignal.timeout(60000), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(label + " answered " + res.status + ": " + clip((data.error || {}).message, 160)), { status: res.status });
  return grounded(data, label);
}

function grounded(data, label) {
  const candidate = (data.candidates || [])[0] || {};
  const parsed = parseAi(((candidate.content || {}).parts || []).map((part) => part.text || "").join(""));
  if (!parsed) throw new Error(label + "'s answer was not in the schema.");
  const chunks = ((candidate.groundingMetadata || {}).groundingChunks || []).map((chunk) => chunk && chunk.web).filter(Boolean);
  return Object.assign(parsed, { sources: chunks.slice(0, 4).map((web) => ({ title: clip(web.title, 120), uri: clip(web.uri, 300) })) });
}

// Gemini through the AI Studio key, with Google Search grounding; the grounded sources are kept with the answer.
function aiDiagnose(evidence, deps) {
  const { fetch: fetchImpl, key, model } = deps || {};
  if (!key || typeof fetchImpl !== "function") return Promise.reject(new Error("Gemini is not configured."));
  return groundedCall(fetchImpl, GEMINI_URL + (model || "gemini-flash-latest") + ":generateContent", { "x-goog-api-key": key }, {
    contents: [{ role: "user", parts: [{ text: aiPrompt(evidence) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low" } }
  }, "Gemini");
}

// Gemini on Vertex AI through functions/gemini.js; deps.token() replaces the metadata server outside Google Cloud.
async function vertexDiagnose(evidence, deps) {
  const { fetch: fetchImpl, token, vertexModel } = deps || {};
  if (typeof fetchImpl !== "function") throw new Error("Vertex AI is not configured.");
  const data = await Gemini.vertex(fetchImpl, {
    contents: [{ role: "user", parts: [{ text: aiPrompt(evidence) }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" } }
  }, { token, vertexModel });
  return Object.assign(grounded(data, "Vertex AI Gemini"), { via: "vertex" });
}

// The AI Studio key first; Vertex AI when there is no key or the key is out of credits or rate-limited.
async function diagnoseWithFallback(evidence, deps) {
  if (deps && deps.key) {
    try {
      return await aiDiagnose(evidence, deps);
    } catch (error) {
      if (![402, 429].includes(error.status)) throw error;
    }
  }
  return vertexDiagnose(evidence, deps);
}

function hintFresh(hint, now) {
  return !!(hint && STRATEGIES[hint.strategy] && msOf(hint.at) >= (Number(now) || Date.now()) - HINT_DAYS * 86400000);
}

// The strategies to try, in order: the host's hint, then the diagnosis, then the rest; never one this rescue already lost,
// and the Mac only until it has tried MAC_TRIES times, unless the asker was promised the report. A site-side diagnosis ends the ladder.
function ladder(diagnosis, hint, attempts, now, promised) {
  const plan = diagnosis || {};
  if (plan.siteSide && plan.confidence >= 0.7) return [];
  const tried = Array.isArray(attempts) ? attempts : [];
  const lost = new Set(tried.filter((row) => row.ok === false && row.strategy !== "mac").map((row) => row.strategy));
  const macRuns = tried.filter((row) => row.strategy === "mac" && row.ok === false).length;
  const order = [].concat(hintFresh(hint, now) ? [hint.strategy] : [], plan.strategies || [], Object.keys(STRATEGIES));
  return Array.from(new Set(order)).filter((id) => STRATEGIES[id] && !lost.has(id) && (id !== "mac" || promised || macRuns < MAC_TRIES));
}

function rescuable(row) {
  const cause = (row.cause && row.cause.id) || "";
  if (!RESCUABLE.includes(cause)) return false;
  if (cause === "tls" && SITE_CERT.test(String((row.error && row.error.message) || ""))) return false;
  return !(cause === "status" && row.diagnosis && row.diagnosis.site);
}

// One rescue per address and asker, for a failure with no re-run yet or whose re-run failed. A failure whose asker is still owed
// a report (#3079, promise.state open or, past the deadline, apologized) goes first and past the daily caps. The daily re-runs go first, so a
// failure still without one here is one no fix covers, or one past their limit. `rescues` are url_review_rescues rows with their `id`.
function rescuePlan(failures, rescues, now) {
  const at = Number(now) || Date.now();
  const today = dayOf(at);
  const known = new Map((Array.isArray(rescues) ? rescues : []).filter(Boolean).map((row) => [row.key, row]));
  const groups = new Map();
  (Array.isArray(failures) ? failures : []).forEach((row) => {
    if (!row || row.kind !== "failed" || !row.url || !row.diagnosedAt || msOf(row.at) < at - RESCUE_DAYS * 86400000) return;
    if (!rescuable(row) || (row.rerun && row.rerun.status !== "failed")) return;
    const key = String(row.url).toLowerCase() + "|" + String(row.email || "").toLowerCase();
    groups.set(key, (groups.get(key) || []).concat(row));
  });
  const items = [];
  groups.forEach((rows, key) => {
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const latest = rows[0];
    const prior = known.get(key) || null;
    const promised = !!(latest.promise && reviewPromise.PENDING.includes(latest.promise.state));
    if (prior && ["rescued", "site", "mac-wanted", "settled", "given-up"].concat(promised ? [] : ["exhausted"]).includes(prior.status)) return;
    if (!promised && prior && prior.day === today && (prior.dayAttempts || 0) >= ATTEMPTS_PER_DAY) return;
    const group = {
      url: latest.url,
      host: latest.host || hostOf(latest.url),
      name: latest.name || "",
      email: latest.email || "",
      at: latest.at,
      failureIds: rows.map((row) => row.id),
      options: Object.assign({}, latest.options, { frameworks: ((latest.options || {}).frameworks || []).length ? latest.options.frameworks : ["Playwright"] }),
      intake: latest.intake || {}
    };
    if (latest.source === "sweep" && latest.sweep) Object.assign(group, { source: "sweep", sweep: latest.sweep });
    items.push({ id: prior ? prior.id : String(latest.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60), key, latest, prior, group, promised });
  });
  items.sort((a, b) => Number(b.promised) - Number(a.promised) || String(b.latest.at).localeCompare(String(a.latest.at)));
  const promised = items.filter((item) => item.promised);
  return promised.concat(items.filter((item) => !item.promised).slice(0, RESCUES_PER_DAY));
}

function aiDue(prior, now, usedToday) {
  if ((Number(usedToday) || 0) >= AI_PER_DAY) return false;
  const row = prior || {};
  return !(row.day === dayOf(now) && (row.dayAi || 0) >= AI_PER_FAILURE_DAY);
}

function trigger(strategy, step) {
  const label = step ? MAC_STEPS[step] : STRATEGIES[strategy].label;
  return { id: "rescue", ref: "#3080", label: "Rescue of a failed review: " + label + " (#3080)" };
}

function attemptRow(strategy, ok, note, now, step) {
  return Object.assign({ strategy, ok: ok === null ? null : !!ok, note: clip(note, 300), at: new Date(Number(now) || Date.now()).toISOString() }, step ? { step } : {});
}

// The rescue row after a pass. `attempts` are this pass's rows; the day counters reset on a new UTC day.
function rescueDoc(item, pass, now) {
  const at = Number(now) || Date.now();
  const today = dayOf(at);
  const prior = item.prior || {};
  const sameDay = prior.day === today;
  const added = (pass.attempts || []).filter((row) => row.ok !== null).length;
  return {
    key: item.key,
    url: clip(item.group.url, 300),
    host: clip(item.group.host, 120),
    failedAt: clip(item.group.at, 40),
    group: item.group,
    diagnosis: pass.diagnosis || prior.diagnosis || null,
    attempts: (prior.attempts || []).concat(pass.attempts || []).slice(-20),
    status: pass.status || "trying",
    rerunId: pass.rerunId || prior.rerunId || "",
    promised: !!item.promised,
    strategy: pass.strategy || prior.strategy || "",
    day: today,
    dayAttempts: (sameDay ? prior.dayAttempts || 0 : 0) + added,
    dayAi: (sameDay ? prior.dayAi || 0 : 0) + (pass.ai ? 1 : 0),
    at: new Date(at).toISOString(),
    expireAt: new Date(at + 90 * 86400000)
  };
}

function hintDoc(prior, strategy, step, url, now) {
  return { strategy, step: step || "", url: clip(url, 300), at: new Date(Number(now) || Date.now()).toISOString(), wins: ((prior && prior.wins) || 0) + 1 };
}

const STATUS_LINE = {
  trying: "Still trying",
  "mac-wanted": "Waiting for Carlos's Mac to read it from a home connection",
  rescued: "Rescued",
  site: "The site's own state, so the rescue stopped",
  exhausted: "Every strategy failed",
  settled: "A re-run settled the failure first",
  "given-up": "The promise ran out, so the rescue stopped"
};

// Lines for the review desk and the daily bug: what the diagnosis concluded and what the rescue tried.
function rescueLines(rescue) {
  const row = rescue || {};
  if (!row.status) return [];
  const plan = row.diagnosis || {};
  const out = [];
  if (plan.blocker) {
    out.push("Diagnosis (" + (plan.by === "gemini" ? (plan.via === "vertex" ? "Gemini on Vertex AI" : "Gemini") : "rules") + ", confidence " + Math.round((plan.confidence || 0) * 100) + "%): " +
      (BLOCKERS[plan.blocker] || plan.blocker) + (plan.vendor && !["none", "other"].includes(plan.vendor) ? ", " + plan.vendor : "") + ". " + clip(plan.summary, 300));
    if (plan.research) out.push("Research: " + clip(plan.research, 300));
    (plan.sources || []).forEach((source) => out.push("Source: " + source.title + " " + source.uri));
  }
  (row.attempts || []).forEach((attempt) => out.push("Tried " + attempt.strategy + (attempt.step ? " (" + attempt.step + ")" : "") + " on " + String(attempt.at).slice(0, 10) + ": " +
    (attempt.ok === null ? "queued" : attempt.ok ? "read the page" : "failed") + (attempt.note ? ", " + attempt.note : "")));
  out.push("Rescue: " + (STATUS_LINE[row.status] || row.status) + (row.strategy ? ", with " + row.strategy : "") + (row.rerunId ? ", re-run " + row.rerunId : "") + ".");
  return out;
}

// One rescue pass: diagnose, try the cloud strategies the ladder names, queue the rest for the Mac, and save the rescue.
// deps: { db, probeRead(url, options), rerun(group) -> re-run doc with id or null, probeLines(probe), gemini(evidence) or null,
//         until (ms), log }; budget: { ai } Gemini calls this run. Returns { doc, reruns }.
async function rescueItem(deps, item, budget) {
  const { db, probeRead, rerun, probeLines, gemini, until, log } = deps;
  const say = typeof log === "function" ? log : () => {};
  const now = Date.now();
  const hintRef = db.collection("url_review_read_hints").doc(hintId(item.group.host));
  const hint = (await hintRef.get()).data() || null;
  const rerunId = item.latest.rerun && item.latest.rerun.id;
  const rerunRow = rerunId ? (await db.collection("url_review_reruns").doc(String(rerunId)).get()).data() || null : null;
  const evidence = evidenceOf(item.latest, rerunRow, probeLines(item.latest.probe));
  let diagnosis = null;
  let ai = false;
  if (typeof gemini === "function" && aiDue(item.prior, now, budget.ai)) {
    budget.ai += 1;
    ai = true;
    diagnosis = await gemini(evidence).catch((error) => {
      say("Rescue diagnosis of " + item.group.host + " fell back to the rules: " + clip(error && error.message, 160));
      return null;
    });
  }
  diagnosis = diagnosis || (!ai && item.prior && item.prior.diagnosis) || ruleDiagnosis(evidence);
  const pass = { diagnosis, ai, attempts: [] };
  const reruns = [];
  const used = item.prior && item.prior.day === dayOf(now) ? item.prior.dayAttempts || 0 : 0;
  const room = () => item.promised || ATTEMPTS_PER_DAY - used - pass.attempts.filter((row) => row.ok !== null).length > 0;
  const order = ladder(diagnosis, hint, item.prior && item.prior.attempts, now, item.promised);
  if (!order.length) pass.status = diagnosis.siteSide ? "site" : "exhausted";
  for (const strategy of order) {
    if (STRATEGIES[strategy].where === "mac") {
      pass.status = "mac-wanted";
      pass.attempts.push(attemptRow(strategy, null, "Queued for the Mac", Date.now()));
      break;
    }
    if (!room() || Date.now() > until) break;
    const url = strategy === "alt-host" ? altUrl(item.group.url) : item.group.url;
    if (!url) {
      pass.attempts.push(attemptRow(strategy, false, "No other host name to try", Date.now()));
      continue;
    }
    const readAs = strategy === "chrome-headers" ? "chrome" : "";
    const probe = await Promise.resolve().then(() => probeRead(url, readAs ? { readAs } : {})).catch((error) => ({ error: clip(error && error.message, 160) || "The read failed." }));
    if (!readable(probe)) {
      pass.attempts.push(attemptRow(strategy, false, "The plain read " + probeNote(probe), Date.now()));
      continue;
    }
    const sweep = item.group.sweep ? { sweep: Object.assign({}, item.group.sweep, { host: hostOf(url) }) } : {};
    const doc = await rerun(Object.assign({}, item.group, { url, host: hostOf(url), trigger: trigger(strategy), readAs }, sweep));
    const ok = !!doc && doc.status !== "failed";
    pass.attempts.push(attemptRow(strategy, ok, ok ? "Report " + doc.reportId : doc ? (doc.error && doc.error.message) || "The re-run failed." : "The re-run was not saved.", Date.now()));
    if (doc) reruns.push(doc);
    if (ok) {
      Object.assign(pass, { status: "rescued", strategy, rerunId: doc.id || "" });
      await hintRef.set(hintDoc(hint, strategy, "", url, Date.now()));
      break;
    }
  }
  const doc = rescueDoc(item, pass, Date.now());
  await db.collection("url_review_rescues").doc(item.id).set(doc);
  await Promise.all(item.group.failureIds.map((id) => db.collection("url_review_failures").doc(id).update({ rescue: rescueMark(item.id, doc) })));
  return { doc, reruns };
}

// The cloud's daily pass, after the re-runs. deps as rescueItem's, and rows: the failures of the last RESCUE_DAYS.
async function runRescues(deps) {
  const now = Date.now();
  const since = new Date(now - (RESCUE_DAYS + 1) * 86400000).toISOString();
  const prior = (await deps.db.collection("url_review_rescues").where("failedAt", ">=", since).get()).docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const plan = rescuePlan(deps.rows, prior, now);
  const budget = { ai: 0 };
  const done = [];
  const notes = [];
  for (const item of plan) {
    if (Date.now() > deps.until) break;
    const { doc, reruns } = await rescueItem(deps, item, budget);
    done.push(...reruns);
    notes.push(item.group.host + " " + doc.status + (item.promised ? " (promised)" : "") + " (" + doc.diagnosis.by + ": " + doc.diagnosis.blocker + ")");
  }
  return { done, notes, planned: plan.length, ai: budget.ai };
}

// The step of a failure whose asker was promised a report (#3079): its frequent re-run calls this instead of a plain re-run.
// It returns the re-run doc to keep the promise with: a new one, or the one the Mac held since the last try; or, with no report
// yet, { status: "failed", rescue: "mac-wanted" } (or the rescue's other state). deps as rescueItem's; group as rerunPlan's, with its promise.
async function rescueGroup(deps, group) {
  const { db } = deps;
  const key = String(group.url).toLowerCase() + "|" + String(group.email || "").toLowerCase();
  const found = (await db.collection("url_review_rescues").where("key", "==", key).limit(1).get()).docs[0];
  const prior = found ? Object.assign({ id: found.id }, found.data()) : null;
  const waiting = { status: "failed", rescue: "mac-wanted", url: group.url, host: group.host || hostOf(group.url), failureIds: group.failureIds || [] };
  if (prior && prior.status === "rescued" && prior.rerunId) {
    const held = (await db.collection("url_review_reruns").doc(String(prior.rerunId)).get()).data();
    if (held) return Object.assign({ id: prior.rerunId }, held, group.promise ? { promise: group.promise } : {});
  }
  if (prior && prior.status === "mac-wanted") {
    if (!prior.promised) await db.collection("url_review_rescues").doc(prior.id).update({ promised: true });
    return waiting;
  }
  const latest = (await db.collection("url_review_failures").doc(String((group.failureIds || [])[0] || "-")).get()).data() || {};
  const item = { id: prior ? prior.id : String((group.failureIds || [])[0] || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60), key, latest, prior, group, promised: true };
  const { doc, reruns } = await rescueItem(deps, item, { ai: 0 });
  return reruns.find((row) => row.status !== "failed") || reruns[0] || Object.assign(waiting, { rescue: doc.status });
}

const promisedAt = (row) => msOf(((row.group || {}).promise || {}).failedAt) || msOf(row.failedAt);
const lastMacFail = (row) => Math.max(0, ...(row.attempts || []).filter((one) => one && one.strategy === "mac" && one.ok === false).map((one) => msOf(one.at)));

// The Mac's hourly pick from the mac-wanted rescues: promised ones inside the deadline (nearest first), then those past it
// (oldest first), MAC_PROMISED_PER_HOUR in all, each only once its retry wait passed; then MAC_PER_RUN others. A promised
// rescue past PROMISE_GIVE_UP_DAYS counts as any other.
function macQueue(rows, now) {
  const at = Number(now) || Date.now();
  const lanes = { window: [], late: [], other: [] };
  (Array.isArray(rows) ? rows : []).filter(Boolean).forEach((row) => {
    const age = at - promisedAt(row);
    const lane = !row.promised || !(age < reviewPromise.PROMISE_GIVE_UP_DAYS * 86400000) ? "other" : age < reviewPromise.PROMISE_DEADLINE_H * 3600000 ? "window" : "late";
    if (lane !== "other" && at - lastMacFail(row) < (lane === "window" ? MAC_RETRY_H : MAC_LATE_RETRY_H) * 3600000) return;
    lanes[lane].push(row);
  });
  const oldest = (a, b) => promisedAt(a) - promisedAt(b);
  return {
    promised: lanes.window.sort(oldest).concat(lanes.late.sort(oldest)).slice(0, MAC_PROMISED_PER_HOUR),
    others: lanes.other.slice(0, MAC_PER_RUN)
  };
}

// The rescue's status after the Mac read it: rescued, or, failed, still queued while a promise is owed; otherwise tried
// again by the cloud's daily pass until MAC_TRIES failed reads.
function macStatus(row, ok, now) {
  if (ok) return "rescued";
  const age = (Number(now) || Date.now()) - promisedAt(row || {});
  if (row && row.promised && age < reviewPromise.PROMISE_GIVE_UP_DAYS * 86400000) return "mac-wanted";
  const macRuns = ((row && row.attempts) || []).filter((one) => one && one.strategy === "mac" && one.ok === false).length + 1;
  return macRuns >= MAC_TRIES ? "exhausted" : "trying";
}

// The rescue as the failure keeps it, for the desk list, its detail and the daily bug.
function rescueMark(id, doc) {
  const plan = doc.diagnosis || {};
  return { id, status: doc.status, strategy: doc.strategy || "", blocker: plan.blocker || "", by: plan.by || "", at: doc.at, lines: rescueLines(doc).slice(-14) };
}

module.exports = {
  runRescues, rescueGroup, rescueMark, macQueue, macStatus,
  RESCUE_DAYS, RESCUES_PER_DAY, ATTEMPTS_PER_DAY, AI_PER_DAY, AI_PER_FAILURE_DAY, MAC_PER_RUN, MAC_PROMISED_PER_HOUR, MAC_RETRY_H, MAC_LATE_RETRY_H, MAC_TRIES, HINT_DAYS,
  STRATEGIES, MAC_STEPS, BLOCKERS, VENDORS,
  altUrl, readable, probeNote, vendorOf, evidenceOf, ruleDiagnosis, aiPrompt, parseAi, aiDiagnose, vertexDiagnose, diagnoseWithFallback, ladder, rescuePlan, aiDue,
  trigger, attemptRow, rescueDoc, hintDoc, hintId, rescueLines, dayOf
};
