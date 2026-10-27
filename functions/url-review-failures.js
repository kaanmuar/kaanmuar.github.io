// Saved logs of failed and stopped URL reviews, and the daily diagnosis of each failure.

const KEEP_DAYS = 90;
const MAX_LINES = 1500;
const LINE_CHARS = 400;
const RECHECK_DAYS = 7;
const RERUN_DAYS = 14;
const RERUN_LINES = 400;

// A PR that fixes a cause class adds a row here, with its merge time; failures of that class it does not cover are re-run.
// Each attempt keeps the rows of the code that ran it (`fixes`), so a run between a fix's merge and its deploy is not covered.
const FIXES = [
  { cause: "bot-protection", at: "2026-10-21T20:45:53Z", ref: "#319", label: "Sites behind bot protection are read in headless Chrome" },
  { cause: "too-large", at: "2026-10-21T20:45:53Z", ref: "#319", label: "A start page past 2 MB is read up to 2 MB" },
  { cause: "unknown", at: "2026-10-21T22:20:00Z", ref: "#329", label: "A re-run of a failure with no saved frameworks reviews with Playwright" },
  { cause: "browser", at: "2026-10-22T19:15:54Z", ref: "#365", label: "A refused page finishes as a refusal instead of a browser timeout" },
  { cause: "timeout", at: "2026-10-23T19:50:00Z", ref: "#582", label: "A start page past 8 s keeps the part that arrived, or is read in headless Chrome" },
  { cause: "save", at: "2026-10-23T23:30:00Z", ref: "#640", label: "A finished report with an empty optional field is saved" },
  { cause: "tls", at: "2026-10-24T12:13:00Z", ref: "#736", label: "A server that leaves out its intermediate certificate is read with the intermediate from its AIA address" },
  { cause: "timeout", at: "2026-10-24T12:18:01Z", ref: "#737", label: "A page whose load event stalls after its document arrived is read in headless Chrome as it stands" },
  { cause: "browser", at: "2026-10-24T19:07:34Z", ref: "#883", label: "A phone visit still running when the browser's budget ends is cut, so the page Chrome read is kept" },
  { cause: "timeout", at: "2026-10-24T20:45:00Z", ref: "#894", label: "A host that accepts no connection is named as down and kept on the desk without a bug" },
  { cause: "status", at: "2026-10-24T20:45:00Z", ref: "#894", label: "A 4xx other than 401, 403 and 429 that headless Chrome gets too is the site's own answer, kept on the desk without a bug" },
  { cause: "headers", at: "2026-10-25T00:40:00Z", ref: "#1102", label: "Response headers up to 64 KB are read, and a start page past that is opened in headless Chrome" },
  { cause: "redirect-loop", at: "2026-10-25T12:37:39Z", ref: "#1181", label: "A start page up to 10 redirects away is read, as Chrome reads it" },
  { cause: "timeout", at: "2026-10-25T12:39:27Z", ref: "#1182", label: "A host that cuts Chrome off for the review tag is read as plain Chrome" },
  { cause: "http-redirect", at: "2026-10-25T12:50:11Z", ref: "#1194", label: "An http:// redirect is read over https first, as Chrome does" },
  { cause: "http-redirect", at: "2026-10-26T13:46:16Z", ref: "#1554", label: "An https copy of an http:// redirect that refuses the review or is slow is opened in headless Chrome" },
  { cause: "unknown", at: "2026-10-27T12:43:07Z", ref: "#1841", label: "A finished report whose page data Firestore refuses (an empty key, an array in an array, nesting past 20 levels) is saved" }
];
const fixKey = (fix) => fix.cause + " " + fix.ref;
const runningFixes = () => FIXES.map(fixKey);
// The review form's default when a failure kept no frameworks (one taken from an alert).
const RERUN_FRAMEWORKS = ["Playwright"];

const clip = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

// Order matters: a message that names both a refused plain read and a browser that did not finish is a browser cause.
const CAUSES = [
  ["save", "The finished report could not be saved", /not a valid Firestore document|as a Firestore value|invalid nested entity|field name .+ is reserved/i],
  ["input", "The address could not be reviewed", /^Enter a|Only https URLs|Remove the username|standard https port|not a public website|private address/i],
  ["headers", "The site's response headers are past the review's limit", /Header overflow|HPE_HEADER_OVERFLOW|response headers are past/i],
  ["dns", "The host name did not resolve", /did not resolve|ENOTFOUND|EAI_AGAIN/i],
  ["http-redirect", "The site redirected to http://", /an http:\/\/ address/i],
  ["redirect-loop", "The site redirected too many times", /redirected too many times/i],
  ["browser", "Headless Chrome did not finish", /headless Chrome did not finish/i],
  ["bot-protection", "The site's bot protection refused the review", /bot protection|bot check|returned status (?:401|403|429)\b/i],
  ["status", "The site answered with an error status", /returned status \d+/i],
  ["not-html", "The address is not an HTML page", /did not return an HTML page/i],
  ["too-large", "The page is larger than the review limit", /larger than the review limit/i],
  ["down", "The site accepted no connection", /accepted no connection/i],
  ["timeout", "The site took too long", /took too long|timed? ?out|ETIMEDOUT|aborted/i],
  ["tls", "The site's certificate or TLS failed", /certificate|CERT_|SSL|TLS|self[- ]signed|EPROTO/i],
  ["connection", "The connection to the site failed", /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|socket hang up/i]
];

const READABLE = {
  readable: "The plain read gets the page now",
  "browser-read": "The plain read is refused, and headless Chrome reads the page",
  "browser-untagged": "The plain read and tagged Chrome are refused, and plain Chrome reads the page",
  "browser-unread": "The plain read fails, and headless Chrome reads the page"
};

// Chrome reached the host, and the host cut the connection or never answered it (not Chrome's own navigation timeout).
const HOST_BROKE = /net::ERR_(?:CONNECTION_(?:RESET|CLOSED|REFUSED|TIMED_OUT)|HTTP2_PROTOCOL_ERROR|EMPTY_RESPONSE|TIMED_OUT|ADDRESS_UNREACHABLE)\b/;
// The review's own error when the plain read and headless Chrome both got a 4xx that is not a bot wall (401, 403 and 429 are).
const SITE_REFUSAL = /^The URL returned status (?!40[13]\b|429\b)4\d\d, in the plain (?:request|read) and in headless Chrome\./;

function causeOf(message) {
  const text = String(message || "");
  const found = CAUSES.find(([, , pattern]) => pattern.test(text));
  if (!found) return { id: "unknown", label: "The review failed for a reason with no class yet" };
  const status = (text.match(/status (\d{3})/) || [])[1];
  const vendor = (text.match(/\b(?:a|an) (.+?) bot check/) || [])[1];
  return Object.assign({ id: found[0], label: found[1] }, status ? { status: Number(status) } : {}, vendor ? { vendor } : {});
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (error) { return ""; }
}

function keptLines(lines) {
  const rows = (Array.isArray(lines) ? lines : []).map((row) => ({ t: Math.max(0, Math.round(Number(row && row.t) || 0)), text: clip(row && row.text, LINE_CHARS) }));
  if (rows.length <= MAX_LINES) return { lines: rows, cut: 0 };
  const head = rows.slice(0, 300);
  const tail = rows.slice(rows.length - (MAX_LINES - 300));
  return { lines: head.concat(tail), cut: rows.length - MAX_LINES };
}

function failureRecord(input) {
  const run = input || {};
  const error = run.error || {};
  const message = clip(typeof error === "string" ? error : error.message || "The review failed.", 600);
  const started = Number(run.startedAt) || Date.now();
  const ended = Number(run.endedAt) || Date.now();
  const kept = keptLines(run.lines);
  const record = {
    kind: run.kind === "stopped" ? "stopped" : "failed",
    runId: clip(run.runId, 40),
    at: new Date(ended).toISOString(),
    url: clip(run.url, 300),
    host: hostOf(run.url),
    name: clip(run.name, 120),
    email: clip(run.email, 120),
    error: run.kind === "stopped" ? null : {
      message,
      status: Number(error.status) || 0,
      code: clip(error.code, 40),
      stack: String(error.stack || "").split("\n").slice(1, 7).map((line) => clip(line, 200)).filter(Boolean)
    },
    cause: run.kind === "stopped" ? null : causeOf(message),
    lines: kept.lines,
    lineCount: (Array.isArray(run.lines) ? run.lines.length : 0),
    linesCut: kept.cut,
    timings: {
      startedAt: new Date(started).toISOString(),
      endedAt: new Date(ended).toISOString(),
      ms: Math.max(0, ended - started),
      lastLineMs: kept.lines.length ? kept.lines[kept.lines.length - 1].t : 0
    },
    options: {
      pages: Number(run.pages) || 0,
      depth: Number(run.depth) || 0,
      pageLang: clip(run.pageLang, 2),
      section: run.section === true,
      frameworks: Array.isArray(run.frameworks) ? run.frameworks.slice(0, 12).map((name) => clip(name, 40)) : []
    },
    intake: {
      lang: clip(run.lang, 8),
      pageLang: clip(run.pageLang, 2),
      section: run.section === true,
      reason: clip(run.reason, 600),
      reasonCode: clip(run.reasonCode, 40),
      clientName: clip(run.clientName, 120),
      clientEmail: clip(run.clientEmail, 160),
      clientUrl: clip(run.clientUrl, 300),
      ownership: clip(run.ownership, 40),
      termsVersion: clip(run.termsVersion, 20),
      followUp: run.followUp === true,
      unlisted: run.unlisted === true,
      deviceId: clip(run.deviceId, 80)
    },
    fixes: runningFixes(),
    expireAt: new Date(ended + KEEP_DAYS * 86400000)
  };
  if (record.kind === "failed") record.diagnosedAt = null;
  if (run.source === "sweep") {
    const target = run.sweep || {};
    record.source = "sweep";
    record.cc = clip(target.cc, 2).toLowerCase();
    record.sweep = { host: clip(target.host, 120), cc: record.cc, month: clip(target.month, 10), rank: Number(target.rank) || 0 };
    if (target.outreach) Object.assign(record.sweep, { outreach: true, sector: clip(target.sector, 40) });
  }
  return record;
}

// A failed alert written before logs were saved (or whose log write failed) still gets a diagnosis, with no lines.
function failureFromAlert(alert) {
  const row = alert || {};
  const reason = (String(row.detail || "").match(/^Reason: (.*)$/m) || [])[1] || "";
  const ended = Date.parse(row.at) || Date.now();
  const record = failureRecord({ kind: "failed", runId: row.runId || row.id, url: row.url, name: row.name, email: row.email, error: reason || "The review failed.", startedAt: ended, endedAt: ended });
  record.fromAlert = clip(row.id, 40);
  delete record.fixes;
  return record;
}

function stateOf(probe) {
  const run = probe || {};
  if (run.dns && run.dns.error) return { id: "dns", label: "The host name does not resolve (" + run.dns.error + ")" };
  const plain = run.plain || {};
  if (plain.httpRedirect) return { id: "http-redirect", label: "The site redirects to " + plain.httpRedirect };
  if (plain.error) return unreadState(run, plain);
  const refused = (plain.status >= 400 && plain.status < 500) || !!plain.challenge;
  if (!refused) {
    if (plain.status >= 500) return { id: "status", status: plain.status, label: "The site answers status " + plain.status };
    if (!plain.html) return { id: "not-html", label: "The address answers " + (plain.contentType || "something other than HTML") };
    return { id: "readable", label: READABLE.readable + " (status " + plain.status + ")" };
  }
  const browser = run.browser;
  const refusal = "The plain read is refused (status " + plain.status + (plain.challenge ? ", " + plain.challenge : "") + ")";
  if (!browser) return { id: plain.challenge || guarded(plain.status) ? "bot-protection" : "status", status: plain.status, label: refusal + "; headless Chrome was not tried" };
  if (!browser.ok) return { id: "browser", label: refusal + ", and headless Chrome did not finish (" + (browser.error || "no answer") + ")" };
  if (browser.docStatus >= 400 || browser.challenge) return chromeRefused(browser, plain, refusal + ", and headless Chrome is refused too");
  const id = browser.untagged ? "browser-untagged" : "browser-read";
  return { id, label: READABLE[id] + " (status " + (browser.docStatus || browser.status) + ")" };
}

const guarded = (status) => [401, 403, 429].includes(status);

// A real browser's refusal. Only an error page (a 4xx that is not a bot wall) that the plain read got too is the site's own answer;
// `site` keeps it out of the failure bugs.
function chromeRefused(browser, plain, lead) {
  const bot = !!plain.challenge || !!browser.challenge || guarded(browser.docStatus);
  const both = plain.status >= 400 && plain.status < 500 && browser.docStatus >= 400 && browser.docStatus < 500;
  return { id: bot ? "bot-protection" : "status", status: browser.docStatus, site: !bot && both, label: lead + " (status " + browser.docStatus + (browser.challenge ? ", " + browser.challenge : "") + ")" };
}

function unreadState(run, plain) {
  const cause = causeOf(plain.error + " " + (plain.code || ""));
  const failed = "The plain read fails: " + plain.error;
  const tcp = run.tcp;
  const browser = run.browser;
  if (tcp && tcp.open === false) return { id: "down", site: true, label: "The host accepts no connection on port 443 (" + (tcp.error || "no answer") + "), so the site looks down" };
  if (!browser) return { id: cause.id, label: failed };
  if (browser.ok && (browser.docStatus >= 400 || browser.challenge)) return chromeRefused(browser, plain, failed + ", and headless Chrome is refused");
  if (browser.ok) return { id: "browser-unread", label: READABLE["browser-unread"] + " (status " + (browser.docStatus || browser.status) + ")" };
  if (HOST_BROKE.test(browser.error || "")) return { id: "no-answer", label: "The host accepts a connection, but it answers neither the plain read (" + plain.error + ") nor headless Chrome (" + browser.error + ")" };
  return { id: cause.id, label: failed + ", and headless Chrome did not finish (" + (browser.error || "no answer") + ")" };
}

// The daily probe checks the connection after a plain read that timed out or lost its connection,
// and opens headless Chrome for a refused plain read or for a host that accepts a connection.
function probeNeedsTcp(plain) {
  const read = plain || {};
  return !!read.error && !read.httpRedirect && ["down", "timeout", "connection"].includes(causeOf(read.error + " " + (read.code || "")).id);
}

function probeNeedsBrowser(plain, tcp) {
  const read = plain || {};
  if (read.httpRedirect) return false;
  if (!read.error) return (read.status >= 400 && read.status < 500) || !!read.challenge;
  return probeNeedsTcp(read) && !!tcp && tcp.open === true;
}

// The address the plain read was on when it failed: the last redirect it followed, or the address it started from.
function unreadUrl(plain, url) {
  const last = ((plain && plain.hops) || []).slice(-1)[0];
  try { return last && last.location ? new URL(last.location, last.url).toString() : String(url || ""); } catch (error) { return String(url || ""); }
}

function diagnose(failure, probe) {
  const cause = (failure && failure.cause) || causeOf(failure && failure.error && failure.error.message);
  const now = stateOf(probe);
  const cleared = Object.prototype.hasOwnProperty.call(READABLE, now.id);
  const unchanged = now.id === cause.id;
  return {
    cause: cause.id,
    causeLabel: cause.label,
    now: now.id,
    nowLabel: now.label,
    cleared,
    site: !!now.site,
    rerun: cleared && cause.id !== "input",
    summary: cause.label + ". " + (cleared ? "Cleared: " : unchanged ? "Still: " : "Now: ") + now.label + "."
  };
}

const msOf = (value) => Date.parse(value) || 0;
const bare = (host) => String(host || "").toLowerCase().replace(/^www\./, "");

function recheckDue(failure, now) {
  const row = failure || {};
  const diagnosis = row.diagnosis;
  if (row.kind !== "failed" || !row.diagnosedAt || !diagnosis || diagnosis.cleared || diagnosis.cause === "input" || row.rerun) return false;
  const at = Number(now) || Date.now();
  return msOf(row.at) >= at - RECHECK_DAYS * 86400000 && msOf(row.diagnosedAt) <= at - 20 * 3600000;
}

// An attempt saved before attempts kept their `fixes` falls back to the fix's merge time.
function covers(attempt, fix) {
  const run = attempt || {};
  return Array.isArray(run.fixes) ? run.fixes.includes(fixKey(fix)) : msOf(fix.at) <= msOf(run.at);
}

function fixAfter(failure) {
  const row = failure || {};
  const cause = (row.rerun && row.rerun.cause) || (row.cause && row.cause.id) || "";
  const attempt = row.rerun || row;
  return FIXES.find((fix) => fix.cause === cause && !covers(attempt, fix)) || null;
}

// Once a re-run is held, sent, dropped or skipped, the failure is settled; a failed re-run waits for the next fix to its cause.
function rerunTrigger(failure) {
  const row = failure || {};
  if (row.kind !== "failed" || !row.diagnosedAt) return null;
  if (row.rerun && row.rerun.status !== "failed") return null;
  const fix = fixAfter(row);
  if (fix) return { id: "fix", ref: fix.ref, label: fix.label + " (" + fix.ref + ", shipped after the failure)" };
  if (!row.rerun && row.diagnosis && row.diagnosis.rerun) return { id: "cleared", ref: "", label: row.diagnosis.summary || "The cause has cleared." };
  return null;
}

// One re-run per address and asker. `reviewed` is the askers' own url_reviews rows (email, createdAt, status, report.host).
function rerunPlan(failures, reviewed, limit) {
  const groups = new Map();
  (Array.isArray(failures) ? failures : []).forEach((row) => {
    if (!row || !row.url || !rerunTrigger(row)) return;
    const key = String(row.url).toLowerCase() + "|" + String(row.email || "").toLowerCase();
    groups.set(key, (groups.get(key) || []).concat(row));
  });
  const reports = (Array.isArray(reviewed) ? reviewed : []).filter((row) => row && (row.status === "complete" || row.status === "stopped"));
  const runs = [];
  const skipped = [];
  groups.forEach((rows, key) => {
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const latest = rows[0];
    const email = String(latest.email || "").toLowerCase();
    const host = latest.host || hostOf(latest.url);
    const own = email ? reports.find((row) => String(row.email || "").toLowerCase() === email && bare(row.report && row.report.host) === bare(host) && String(row.createdAt) > String(latest.at)) : null;
    const item = {
      key,
      url: latest.url,
      host,
      name: latest.name || "",
      email: latest.email || "",
      at: latest.at,
      failureIds: rows.map((row) => row.id),
      trigger: rerunTrigger(latest),
      options: Object.assign({}, latest.options, { frameworks: ((latest.options || {}).frameworks || []).length ? latest.options.frameworks : RERUN_FRAMEWORKS }),
      intake: latest.intake || {}
    };
    if (latest.source === "sweep" && latest.sweep) Object.assign(item, { source: "sweep", sweep: latest.sweep });
    if (own) skipped.push(Object.assign(item, { skip: "The asker reviewed " + host + " again on " + String(own.createdAt).slice(0, 10) + "." }));
    else runs.push(item);
  });
  runs.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { runs: runs.slice(0, Number(limit) || 8), skipped };
}

function rerunDoc(group, outcome) {
  const run = outcome || {};
  const record = run.record || null;
  const started = Number(run.startedAt) || Date.now();
  const ended = Number(run.endedAt) || Date.now();
  const error = run.error || {};
  const message = record ? "" : clip(typeof error === "string" ? error : error.message || "The re-run failed.", 600);
  return {
    status: record ? (group.source === "sweep" ? "swept" : "held") : "failed",
    at: new Date(ended).toISOString(),
    failedAt: clip(group.at, 40),
    url: clip(group.url, 300),
    host: clip(group.host || hostOf(group.url), 120),
    name: clip(group.name, 120),
    email: clip(group.email, 120),
    failureIds: (group.failureIds || []).slice(0, 40),
    trigger: group.trigger || null,
    options: group.options || {},
    reportId: record ? clip(record.id, 40) : "",
    reportStatus: record ? clip(record.status, 20) : "",
    record,
    error: record ? null : { message },
    cause: record ? null : causeOf(message),
    lines: keptLines((Array.isArray(run.lines) ? run.lines : []).slice(-RERUN_LINES)).lines,
    timings: { startedAt: new Date(started).toISOString(), endedAt: new Date(ended).toISOString(), ms: Math.max(0, ended - started) },
    fixes: runningFixes(),
    expireAt: new Date(ended + KEEP_DAYS * 86400000)
  };
}

function rerunMark(id, doc) {
  return Object.assign({ at: doc.at, id, status: doc.status, trigger: doc.trigger ? doc.trigger.id : "", cause: doc.cause ? doc.cause.id : "" }, Array.isArray(doc.fixes) ? { fixes: doc.fixes } : {});
}

// The asker's run failed through no choice of theirs, so a re-run the owner sends opens without payment.
function sentRecord(doc, now) {
  return Object.assign({}, doc.record, {
    createdAt: now,
    paid: true,
    free: true,
    priceUsd: 0,
    rerunOf: (doc.failureIds || []).slice(0, 40),
    failedAt: doc.failedAt || "",
    rerunAt: doc.at
  });
}

const RERUN_LEAD = { held: "Held for you: ", swept: "Saved by the sweep: ", failed: "Failed again: " };

// A sweep re-run has no asker: its report is saved like any sweep review and goes public through Live Reports.
function rerunMail(done) {
  const held = done.filter((row) => row.status === "held");
  const swept = done.filter((row) => row.status === "swept");
  const failed = done.filter((row) => row.status === "failed");
  const blocks = done.map((row) => [
    (RERUN_LEAD[row.status] || RERUN_LEAD.failed) + row.host + " for " + (row.name || "an asker") + (row.email ? " <" + row.email + ">" : ""),
    "Why it ran: " + (row.trigger ? row.trigger.label : "—"),
    row.status === "failed"
      ? "Error: " + row.error.message
      : "Report " + row.reportId + (row.reportStatus === "stopped" ? ", stopped before the last page" : "")
  ].join("\n"));
  return {
    subject: "URL review re-runs: " + held.length + " held for you, " + (swept.length ? swept.length + " saved by the sweep, " : "") + failed.length + " failed again",
    intro: "Failed URL reviews were run again",
    rows: [{ label: "Held for you", value: String(held.length) }].concat(swept.length ? [{ label: "Saved by the sweep", value: String(swept.length) }] : [], [{ label: "Failed again", value: String(failed.length) }]),
    body: blocks.join("\n\n") + "\n\nNo asker was emailed. Send or drop each held report from the review desk."
  };
}

// The address itself is refused, its host does not resolve, or it accepts no connection: the asker or the site fixes these, not the review.
const SITE_SIDE = ["input", "dns", "down"];

// Also the site's own state: a 4xx other than 401, 403 and 429 in the plain read and in headless Chrome, or a host the probe finds down.
// They stay on the review desk and in the reports, without a bug. Bot walls and hosts that cut Chrome off are still filed.
function siteSide(doc, cause) {
  if (SITE_SIDE.includes(cause)) return true;
  if (SITE_REFUSAL.test(String((doc.error && doc.error.message) || ""))) return true;
  return !!(doc.diagnosis && doc.diagnosis.site);
}
const BUG_ROWS = 12;
const BUG_LOG_LINES = 15;

const labelOf = (cause) => (CAUSES.find(([id]) => id === cause) || [])[1] || "The review failed for a reason with no class yet";

function fixBefore(cause, attempt) {
  return FIXES.filter((fix) => fix.cause === cause && covers(attempt, fix)).sort((a, b) => msOf(b.at) - msOf(a.at))[0] || null;
}

// The issue is public: no asker names or emails, and no query strings, which can carry tokens.
const wordOf = (word) => new RegExp("(^|[^\\w@.])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w@])", "gi");
const scrubbed = (text, max, hidden) => clip((hidden || []).reduce((out, word) => out.replace(wordOf(word), "$1[asker]"), String(text == null ? "" : text))
  .replace(/[^\s@<>"'(),;]+@[^\s@<>"'(),;]+\.[a-z]{2,}/gi, "[email]")
  .replace(/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>)]*/gi, "$1?…"), max);

// A failure is a lead while the probe still sees its cause and no re-run or later fix has settled it; a re-run is one when it failed.
// A failure whose re-run failed is left to the re-run, so it is not listed twice or under a fix that shipped after it.
function bugLead(row, source) {
  const doc = row || {};
  const cause = (doc.cause && doc.cause.id) || "";
  if (!cause || siteSide(doc, cause)) return null;
  if (source === "failure") {
    if (doc.kind !== "failed" || !doc.diagnosedAt || !doc.diagnosis || doc.diagnosis.cleared || doc.rerun || fixAfter(doc)) return null;
  } else if (doc.status !== "failed" || FIXES.some((fix) => fix.cause === cause && !covers(doc, fix))) {
    return null;
  }
  const fix = fixBefore(cause, doc);
  const intake = doc.intake || {};
  const hidden = [doc.name, doc.email, intake.clientName, intake.clientEmail].map((word) => String(word || "").trim()).filter((word) => word.length > 2);
  const scrub = (text, max) => scrubbed(text, max, hidden);
  return {
    key: fix ? cause + "-" + fix.ref.replace(/\D/g, "") : cause,
    cause,
    fix,
    source,
    id: clip(doc.id, 40),
    at: String(doc.at || ""),
    host: doc.host || hostOf(doc.url),
    message: scrub(doc.error && doc.error.message, 300),
    now: source === "failure" ? scrub(doc.diagnosis.nowLabel, 300) : "",
    why: source === "rerun" && doc.trigger ? scrub(doc.trigger.label, 300) : "",
    failures: source === "rerun" ? (doc.failureIds || []).length : 0,
    probe: source === "failure" ? doc.probe || null : null,
    lines: (Array.isArray(doc.lines) ? doc.lines : []).slice(-BUG_LOG_LINES).map((line) => scrub(line && line.text, 200).replace(/```/g, "'''"))
  };
}

function probeLines(probe) {
  const run = probe || {};
  const out = [];
  if (run.dns) out.push("DNS: " + (run.dns.error ? "does not resolve (" + run.dns.error + ")" : (run.dns.addresses || []).length + " addresses"));
  const plain = run.plain;
  if (!plain) return out;
  const redirects = (plain.hops || []).filter((hop) => hop && hop.location).length;
  out.push("Plain read with the review UA: " + (plain.httpRedirect
    ? "redirects to " + scrubbed(plain.httpRedirect, 200)
    : plain.error
      ? "fails (" + scrubbed(plain.error, 160) + (plain.code ? ", " + plain.code : "") + ")"
      : "status " + plain.status + ", " + (plain.contentType || "no content type") + (plain.server ? ", server " + plain.server : "") + (plain.challenge ? ", " + plain.challenge + " bot check" : ""))
    + (redirects ? ", after " + redirects + " redirect" + (redirects === 1 ? "" : "s") : ""));
  const tcp = run.tcp;
  if (tcp) out.push("TCP connection to port 443: " + (tcp.open ? "opens in " + tcp.ms + " ms" : tcp.open === false ? "does not open (" + (tcp.error || "no answer") + ")" : "not checked (" + (tcp.error || "no address") + ")"));
  const browser = run.browser;
  if (!browser) out.push("Headless Chrome: not tried" + (tcp && tcp.open === false ? ", as the host accepts no connection" : ""));
  else if (!browser.ok) out.push("Headless Chrome: did not finish (" + scrubbed(browser.error || "no answer", 160) + ")");
  else out.push("Headless Chrome (" + (browser.untagged ? "untagged" : "tagged") + "): status " + (browser.docStatus || browser.status) + (browser.challenge ? ", " + browser.challenge + " bot check" : "") + ", " + (browser.words || 0) + " words");
  return out;
}

function bugTitle(cause, fix) {
  const label = labelOf(cause);
  const still = fix ? "still " : "";
  const reason = /^The review failed /.test(label)
    ? "URL reviews " + still + label.replace(/^The review /, "")
    : "URL reviews " + still + "failed because " + label.charAt(0).toLowerCase() + label.slice(1);
  return "BE: " + (fix ? "After " + fix.ref + ", " + reason : reason);
}

const plural = (count, word) => count + " " + word + (count === 1 ? "" : "s");
const hostsOf = (rows) => Array.from(new Set(rows.map((row) => row.host).filter(Boolean)));
const hostList = (hosts) => hosts.slice(0, 8).join(", ") + (hosts.length > 8 ? " and " + (hosts.length - 8) + " more" : "");

// Newest first: the runs, then the probe of the latest failure and the last log lines, as the issue and its comments list them.
function bugEvidence(rows) {
  const day = (at) => at.slice(0, 16).replace("T", " ");
  const listed = rows.slice(0, BUG_ROWS).map((row) => "- " + day(row.at) + " UTC, " + (row.source === "rerun"
    ? "failed re-run `" + row.id + "` of " + plural(row.failures, "failure")
    : "failed run `" + row.id + "`") + " on " + (row.host || "an unknown host") + ": " + (row.message || "no error text") + (row.now ? " Now: " + row.now : "") + (row.why ? " Why it ran: " + row.why : ""));
  const probed = rows.find((row) => row.probe);
  const logged = rows.find((row) => row.lines.length);
  return [
    listed.join("\n") + (rows.length > BUG_ROWS ? "\n- and " + (rows.length - BUG_ROWS) + " more" : ""),
    probed ? "\n### Probe of the latest failure (" + probed.host + ")\n" + probeLines(probed.probe).map((line) => "- " + line).join("\n") : null,
    logged ? "\n### Last log lines of `" + logged.id + "`\n```\n" + logged.lines.join("\n") + "\n```" : null
  ].filter((part) => part !== null);
}

function bugIssue(key, leads) {
  const rows = leads.slice().sort((a, b) => b.at.localeCompare(a.at));
  const { cause, fix } = rows[0];
  const hosts = hostsOf(rows);
  const first = rows[rows.length - 1].at.slice(0, 10);
  const last = rows[0].at.slice(0, 10);
  const body = [
    "**Kind:** Bug",
    "**Area:** BE",
    "**Found while:** #320, by the daily check of failed URL reviews",
    "**Where it stands:** Backlog",
    "",
    "## What happened",
    plural(rows.length, "URL review run") + " failed with the cause class `" + cause + "` (" + labelOf(cause) + ") " + (first === last ? "on " + first : "from " + first + " to " + last) + ", on " + plural(hosts.length, "site") + ": " + hostList(hosts) + "."
      + (fix ? " " + fix.ref + " (" + fix.label + ") shipped before these runs, so it does not cover them." : "")
      + " The daily probe still sees the cause, or a re-run failed again.",
    "",
    ...bugEvidence(rows),
    "",
    "## Fix",
    "Not written yet. The full logs and probes are in Firestore (`url_review_failures`, `url_review_reruns`) and on the review desk. The PR that fixes this class adds a row to `FIXES` in `functions/url-review-failures.js` with cause `" + cause + "`, so these runs are re-run."
  ].join("\n");
  return { key, cause, fix: fix ? fix.ref : "", title: bugTitle(cause, fix), body: body.slice(0, 60000), runs: rows.length, hosts, ids: rows.map((row) => row.id), firstAt: rows[rows.length - 1].at, lastAt: rows[0].at };
}

function bugLeads(failures, reruns) {
  const probes = new Map((Array.isArray(failures) ? failures : []).filter((row) => row && row.probe).map((row) => [row.id, row.probe]));
  const classes = new Map();
  [[failures, "failure"], [reruns, "rerun"]].forEach(([rows, source]) => (Array.isArray(rows) ? rows : []).forEach((row) => {
    const lead = bugLead(row, source);
    if (!lead) return;
    if (source === "rerun") lead.probe = (row.failureIds || []).map((id) => probes.get(id)).find(Boolean) || null;
    classes.set(lead.key, (classes.get(lead.key) || []).concat(lead));
  }));
  return classes;
}

// One bug per cause class, and per fix to that class: a class that fails again after its fix shipped is a new bug.
function bugPlan(failures, reruns, filed) {
  const known = new Set(Array.isArray(filed) ? filed : []);
  return Array.from(bugLeads(failures, reruns).entries()).filter(([key]) => !known.has(key)).map(([key, leads]) => bugIssue(key, leads));
}

// Later runs of a class whose bug is still open, as a comment on that bug. `bugs` are url_review_failure_bugs rows with their `key`.
// A bug keeps the `ids` of the runs it lists; one filed before it kept them counts the runs after its `lastAt` as new.
function bugFollowUps(failures, reruns, bugs) {
  const open = new Map((Array.isArray(bugs) ? bugs : []).filter((bug) => bug && bug.issue && !bug.closedAt).map((bug) => [bug.key, bug]));
  const notes = [];
  bugLeads(failures, reruns).forEach((leads, key) => {
    const bug = open.get(key);
    if (!bug) return;
    const listed = Array.isArray(bug.ids) ? new Set(bug.ids) : null;
    const rows = leads.filter((row) => listed ? !listed.has(row.id) : row.at > String(bug.lastAt || "")).sort((a, b) => b.at.localeCompare(a.at));
    if (!rows.length) return;
    const hosts = hostsOf(rows);
    const { cause } = rows[0];
    const body = [
      plural(rows.length, "more URL review run") + " failed with the cause class `" + cause + "` since this bug was last updated" + (bug.lastAt ? " (" + String(bug.lastAt).slice(0, 10) + ")" : "") + ", on " + plural(hosts.length, "site") + ": " + hostList(hosts) + ".",
      "",
      ...bugEvidence(rows)
    ].join("\n");
    const lastAt = [rows[0].at, String(bug.lastAt || "")].sort().pop();
    notes.push({ key, issue: bug.issue, body: body.slice(0, 60000), runs: rows.length, hosts, ids: (listed ? rows : leads).map((row) => row.id), lastAt });
  });
  return notes;
}

// The fields of a failure the reports and the desk list read; the log stays behind.
const SUMMARY_FIELDS = ["kind", "at", "url", "host", "name", "email", "cause", "error.message", "diagnosis", "diagnosedAt", "checks", "rerun", "lineCount", "timings.ms", "fromAlert", "source"];
const RERUN_FIELDS = ["status", "at", "host", "name", "trigger", "cause", "error.message", "decidedAt"];
const RERUN_STATES = [["held", "held for you"], ["swept", "saved by the sweep"], ["sent", "sent"], ["dropped", "dropped"], ["failed", "failed again"]];
const REPORT_ROWS = 60;

function countBy(rows, keyOf) {
  const counts = {};
  rows.forEach((row) => {
    const key = keyOf(row);
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

const ranked = (counts) => Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
const causeId = (row) => (row.cause && row.cause.id) || "unknown";
// The period report around this section reads in Bogotá time, so these lines do too.
const BOGOTA = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const minute = (at) => {
  const when = new Date(at || "");
  return isNaN(when) ? "" : BOGOTA.format(when);
};

function rerunState(row) {
  const rerun = row.rerun;
  if (!rerun) return row.diagnosis && row.diagnosis.rerun ? "re-run due" : "";
  if (rerun.status === "skipped") return "re-run skipped: " + (rerun.reason || "no reason");
  const label = (RERUN_STATES.find(([id]) => id === rerun.status) || [])[1] || rerun.status;
  return "re-run " + label + " " + String(rerun.at || "").slice(0, 10);
}

// `bugs` are url_review_failure_bugs rows, with `closedAt` once GitHub shows the issue closed.
function periodFailures(input) {
  const source = input || {};
  const rows = Array.isArray(source.failures) ? source.failures : [];
  const failed = rows.filter((row) => row.kind === "failed").sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const stopped = rows.length - failed.length;
  const before = (Array.isArray(source.previous) ? source.previous : []).filter((row) => row.kind === "failed");
  const reruns = Array.isArray(source.reruns) ? source.reruns : [];
  const bugs = (Array.isArray(source.bugs) ? source.bugs : []).filter((bug) => bug.issue).sort((a, b) => b.issue - a.issue);
  const open = bugs.filter((bug) => !bug.closedAt);
  const causes = countBy(failed, causeId);
  const priorCauses = countBy(before, causeId);
  const hosts = countBy(failed, (row) => row.host || hostOf(row.url));
  const rerunCounts = countBy(reruns, (row) => row.status);
  const cleared = failed.filter((row) => row.diagnosis && row.diagnosis.cleared).length;
  const waiting = failed.filter((row) => !row.diagnosedAt).length;
  const phrase = source.phrase || "previous period";
  const causeList = Array.from(new Set(ranked(causes).concat(ranked(priorCauses))))
    .map((id) => id + " " + (causes[id] || 0) + " (" + (priorCauses[id] || 0) + " before)");
  const lines = failed.slice(0, REPORT_ROWS).map((row) => [
    minute(row.at),
    row.host || hostOf(row.url),
    row.name,
    causeId(row),
    row.diagnosis ? (row.diagnosis.cleared ? "cleared: " : "now: ") + row.diagnosis.nowLabel : "not diagnosed yet",
    rerunState(row)
  ].filter(Boolean).join(" · "));
  const bugLines = open.map((bug) => "#" + bug.issue + " " + bug.title + " (" + bug.runs + " run" + (bug.runs === 1 ? "" : "s") + ", " + (bug.hosts || []).slice(0, 4).join(", ") + ")");
  const body = [
    "Failed reviews",
    lines.length ? lines.join("\n") : "None",
    failed.length > lines.length ? "… and " + (failed.length - lines.length) + " more failed runs" : "",
    "\nOpen failure bugs",
    bugLines.length ? bugLines.join("\n") : "None",
    source.deskUrl ? "\nEach run's full log and probe: " + source.deskUrl : ""
  ].filter(Boolean).join("\n");
  return {
    failed: failed.length,
    stopped,
    previous: before.length,
    cleared,
    causes,
    hosts,
    reruns: rerunCounts,
    openBugs: open.map((bug) => bug.issue),
    rows: [
      { label: "Failed runs", value: failed.length + " vs " + before.length + " (" + phrase + "); " + stopped + " stopped by the asker" },
      { label: "Failure causes", value: causeList.join(", ") || "None" },
      { label: "Diagnosis", value: cleared + " cleared since, " + (failed.length - cleared - waiting) + " still failing, " + waiting + " not probed yet" },
      { label: "Failed sites", value: ranked(hosts).slice(0, 20).map((host) => host + " " + hosts[host]).join(", ") || "None" },
      { label: "Re-runs", value: RERUN_STATES.filter(([id]) => id !== "swept" || rerunCounts[id]).map(([id, label]) => (rerunCounts[id] || 0) + " " + label).join(", ") },
      { label: "Failure bugs", value: open.length ? open.map((bug) => "#" + bug.issue + " " + bug.cause).join(", ") + " open" + (bugs.length > open.length ? ", " + (bugs.length - open.length) + " closed" : "") : bugs.length ? "None open, " + bugs.length + " closed" : "None filed" }
    ],
    body: body.slice(0, 8000)
  };
}

function failureRow(row) {
  const doc = row || {};
  return {
    id: clip(doc.id, 60),
    at: doc.at || "",
    kind: doc.kind === "stopped" ? "stopped" : "failed",
    url: clip(doc.url, 300),
    host: doc.host || hostOf(doc.url),
    name: clip(doc.name, 120),
    email: clip(doc.email, 160),
    cause: doc.kind === "stopped" ? "" : causeId(doc),
    causeLabel: doc.cause ? clip(doc.cause.label, 200) : "",
    message: clip(doc.error && doc.error.message, 600),
    now: doc.diagnosis ? clip(doc.diagnosis.summary, 600) : "",
    cleared: !!(doc.diagnosis && doc.diagnosis.cleared),
    diagnosedAt: doc.diagnosedAt || "",
    checks: Number(doc.checks) || 0,
    rerun: rerunState(doc),
    rerunId: doc.rerun && doc.rerun.id ? clip(doc.rerun.id, 40) : "",
    lineCount: Number(doc.lineCount) || 0,
    ms: Number(doc.timings && doc.timings.ms) || 0,
    fromAlert: !!doc.fromAlert
  };
}

const logLines = (lines) => (Array.isArray(lines) ? lines : []).map((line) => ({ t: Number(line && line.t) || 0, text: String((line && line.text) || "") }));

function failureDetail(doc, rerun) {
  const row = doc || {};
  const again = rerun || null;
  return Object.assign(failureRow(row), {
    error: row.error || null,
    diagnosis: row.diagnosis || null,
    probe: row.probe || null,
    probeLines: row.probe ? probeLines(row.probe) : [],
    lines: logLines(row.lines),
    linesCut: Number(row.linesCut) || 0,
    timings: row.timings || null,
    options: row.options || null,
    intake: row.intake || null,
    rerunDoc: again ? {
      id: clip(again.id, 40),
      at: again.at || "",
      status: clip(again.status, 20),
      why: clip(again.trigger && again.trigger.label, 300),
      reportId: clip(again.reportId, 40),
      error: clip(again.error && again.error.message, 600),
      lines: logLines(again.lines)
    } : null
  });
}

module.exports = {
  KEEP_DAYS, MAX_LINES, RECHECK_DAYS, RERUN_DAYS, FIXES, SUMMARY_FIELDS, RERUN_FIELDS,
  causeOf, failureRecord, failureFromAlert, stateOf, diagnose, probeNeedsTcp, probeNeedsBrowser, unreadUrl,
  recheckDue, rerunTrigger, rerunPlan, rerunDoc, rerunMark, sentRecord, rerunMail,
  bugPlan, bugFollowUps, periodFailures, failureRow, failureDetail
};
