// Saved logs of failed and stopped URL reviews, and the daily diagnosis of each failure.

const KEEP_DAYS = 90;
const MAX_LINES = 1500;
const LINE_CHARS = 400;

const clip = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

// Order matters: a message that names both a refused plain read and a browser that did not finish is a browser cause.
const CAUSES = [
  ["input", "The address could not be reviewed", /^Enter a|Only https URLs|Remove the username|standard https port|not a public website|private address/i],
  ["dns", "The host name did not resolve", /did not resolve|ENOTFOUND|EAI_AGAIN/i],
  ["http-redirect", "The site redirected to http://", /an http:\/\/ address/i],
  ["redirect-loop", "The site redirected too many times", /redirected too many times/i],
  ["browser", "Headless Chrome did not finish", /headless Chrome did not finish/i],
  ["bot-protection", "The site's bot protection refused the review", /bot protection|bot check/i],
  ["status", "The site answered with an error status", /returned status \d+/i],
  ["not-html", "The address is not an HTML page", /did not return an HTML page/i],
  ["too-large", "The page is larger than the review limit", /larger than the review limit/i],
  ["timeout", "The site took too long", /took too long|timed? ?out|ETIMEDOUT|aborted/i],
  ["tls", "The site's certificate or TLS failed", /certificate|CERT_|SSL|TLS|self[- ]signed|EPROTO/i],
  ["connection", "The connection to the site failed", /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|socket hang up/i]
];

const READABLE = {
  readable: "The plain read gets the page now",
  "browser-read": "The plain read is refused, and headless Chrome reads the page",
  "browser-untagged": "The plain read and tagged Chrome are refused, and plain Chrome reads the page"
};

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
      frameworks: Array.isArray(run.frameworks) ? run.frameworks.slice(0, 12).map((name) => clip(name, 40)) : []
    },
    expireAt: new Date(ended + KEEP_DAYS * 86400000)
  };
  if (record.kind === "failed") record.diagnosedAt = null;
  return record;
}

// A failed alert written before logs were saved (or whose log write failed) still gets a diagnosis, with no lines.
function failureFromAlert(alert) {
  const row = alert || {};
  const reason = (String(row.detail || "").match(/^Reason: (.*)$/m) || [])[1] || "";
  const ended = Date.parse(row.at) || Date.now();
  const record = failureRecord({ kind: "failed", runId: row.runId || row.id, url: row.url, name: row.name, email: row.email, error: reason || "The review failed.", startedAt: ended, endedAt: ended });
  record.fromAlert = clip(row.id, 40);
  return record;
}

function stateOf(probe) {
  const run = probe || {};
  if (run.dns && run.dns.error) return { id: "dns", label: "The host name does not resolve (" + run.dns.error + ")" };
  const plain = run.plain || {};
  if (plain.httpRedirect) return { id: "http-redirect", label: "The site redirects to " + plain.httpRedirect };
  if (plain.error) {
    const cause = causeOf(plain.error + " " + (plain.code || ""));
    return { id: cause.id, label: "The plain read fails: " + plain.error };
  }
  const refused = (plain.status >= 400 && plain.status < 500) || !!plain.challenge;
  if (!refused) {
    if (plain.status >= 500) return { id: "status", status: plain.status, label: "The site answers status " + plain.status };
    if (!plain.html) return { id: "not-html", label: "The address answers " + (plain.contentType || "something other than HTML") };
    return { id: "readable", label: READABLE.readable + " (status " + plain.status + ")" };
  }
  const browser = run.browser;
  const guarded = (status) => [401, 403, 429].includes(status);
  const refusal = "The plain read is refused (status " + plain.status + (plain.challenge ? ", " + plain.challenge : "") + ")";
  if (!browser) return { id: plain.challenge || guarded(plain.status) ? "bot-protection" : "status", status: plain.status, label: refusal + "; headless Chrome was not tried" };
  if (!browser.ok) return { id: "browser", label: refusal + ", and headless Chrome did not finish (" + (browser.error || "no answer") + ")" };
  if (browser.docStatus >= 400 || browser.challenge) {
    const bot = !!(plain.challenge || browser.challenge) || guarded(browser.docStatus);
    return { id: bot ? "bot-protection" : "status", status: browser.docStatus, label: refusal + ", and headless Chrome is refused too (status " + browser.docStatus + (browser.challenge ? ", " + browser.challenge : "") + ")" };
  }
  const id = browser.untagged ? "browser-untagged" : "browser-read";
  return { id, label: READABLE[id] + " (status " + (browser.docStatus || browser.status) + ")" };
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
    rerun: cleared && cause.id !== "input",
    summary: cause.label + ". " + (cleared ? "Cleared: " : unchanged ? "Still: " : "Now: ") + now.label + "."
  };
}

module.exports = { KEEP_DAYS, MAX_LINES, causeOf, failureRecord, failureFromAlert, stateOf, diagnose };
