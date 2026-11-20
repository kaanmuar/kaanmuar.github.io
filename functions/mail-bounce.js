"use strict";
/* Bounce classifier for the outreach mail path (#3837). Takes a raw DSN/ARF message (string) or a parsed
   message ({ from, subject, text, headers }) and returns { kind, status, recipient }:

   hard        permanent failure (DSN Status 5.x.x, or an SMTP 5xx reply)
   soft        temporary failure (4.x.x, Action: delayed) or a permanent code that means "try later" (mailbox full, too big)
   auto-reply  out-of-office or other automatic answer that is not a delivery failure
   complaint   abuse-report feedback loop mail (RFC 5965 ARF)
   none        anything else

   The result carries no message text. status is the enhanced code ("5.1.1") when present, else a class derived
   from a plain SMTP reply ("5.0.0" / "4.0.0"), else "". recipient is the failed address from the DSN fields,
   lower-cased, or "". Callers decide what to keep: nothing here stores or suppresses anything.

   Written for this repo from RFC 3464 (DSN), RFC 3463 (enhanced status codes) and RFC 5965 (ARF). The field
   names follow the standards; no code is copied from crisp-oss/email-bounce-parser (MIT) or postalsys/mailauth,
   which were only read for the field list. */

const MAX = 200000;

// Permanent codes that really mean "try again later" (RFC 3463): mailbox full, message too big for the mailbox or system.
const SOFT_PERMANENT = new Set(["5.2.2", "5.2.3", "5.3.4"]);

const AUTO_SUBJECT = /auto-?reply|automatic reply|autorespond|out of (the )?office|respuesta autom|fuera de la oficina|abwesenheit|automatische antwort|r[ée]ponse automatique|risposta automatica|resposta autom/i;
const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon)@/i;
const BOUNCE_SUBJECT = /undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|no se pudo entregar|non remis|unzustellbar|non recapitat|n[ãa]o entregue/i;

const lower = (value) => String(value == null ? "" : value).toLowerCase();

/** Header map (lower-case name -> joined value) from a raw header block, with folded lines joined. */
function parseHeaders(block) {
  const out = {};
  let name = "";
  for (const line of String(block).split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && name) {
      out[name] += " " + line.trim();
      continue;
    }
    const at = line.indexOf(":");
    if (at < 1 || /\s/.test(line.slice(0, at))) {
      name = "";
      continue;
    }
    name = line.slice(0, at).toLowerCase();
    out[name] = (out[name] ? out[name] + "\n" : "") + line.slice(at + 1).trim();
  }
  return out;
}

function headerMap(headers) {
  if (typeof headers === "string") return parseHeaders(headers);
  const out = {};
  for (const key of Object.keys(headers || {})) {
    const v = headers[key];
    out[key.toLowerCase()] = (Array.isArray(v) ? v : [v]).map((one) => String(one == null ? "" : one)).join("\n");
  }
  return out;
}

/** { headers, from, subject, text } from either input shape. */
function normalize(input) {
  if (typeof input === "string") {
    const raw = input.slice(0, MAX);
    const split = raw.search(/\r?\n\r?\n/);
    const headers = parseHeaders(split < 0 ? raw : raw.slice(0, split));
    return { headers, from: headers.from || "", subject: headers.subject || "", text: raw };
  }
  const p = input || {};
  const headers = headerMap(p.headers);
  const from = p.from && typeof p.from === "object" ? p.from.email : p.from;
  return {
    headers,
    from: String(from || headers.from || ""),
    subject: String(p.subject || headers.subject || ""),
    text: String(p.text || "").slice(0, MAX)
  };
}

const addressIn = (s) => {
  // Split on the characters an address cannot hold, then take the first piece with an @ inside (linear, no backtracking).
  for (const piece of String(s || "").slice(0, 400).split(/[\s<>;,"'()]+/)) {
    const at = piece.indexOf("@");
    if (at < 1 || at === piece.length - 1) continue;
    let end = piece.length;
    while (end > at + 1 && (piece[end - 1] === "." || piece[end - 1] === ">")) end--;
    return piece.slice(0, end).toLowerCase();
  }
  return "";
};
const field = (text, name) => {
  const m = new RegExp("^[ \\t]*" + name + ":[ \\t]*([^\\r\\n]*)", "im").exec(text);
  return m ? m[1].trim().slice(0, 400) : "";
};

/** Failed recipient from the DSN or ARF fields, falling back to the X-Failed-Recipients header. */
function recipientOf(n) {
  for (const name of ["Final-Recipient", "Original-Recipient", "Original-Rcpt-To"]) {
    const found = addressIn(field(n.text, name));
    if (found) return found;
  }
  return addressIn(n.headers["x-failed-recipients"]);
}

const enhanced = (s) => {
  const m = /(?<![\d.])([245])\.(\d{1,3})\.(\d{1,3})(?!\.?\d)/.exec(String(s || ""));
  return m ? m[1] + "." + m[2] + "." + m[3] : "";
};

/** Enhanced status: the Status field, else one next to an SMTP reply, else the class of a plain 4xx/5xx reply. */
function statusOf(n) {
  const direct = enhanced(field(n.text, "Status"));
  if (direct) return direct;
  const diag = field(n.text, "Diagnostic-Code");
  const near = /(?:^|[^\d])[45]\d\d[ -]+(?:\(?#?)([245]\.\d{1,3}\.\d{1,3})(?!\.?\d)/m.exec(n.text);
  const fromDiag = enhanced(diag) || (near ? near[1] : "");
  if (fromDiag) return fromDiag;
  const plain = /\bsmtp; ?([45])\d\d\b/i.exec(diag);
  if (plain) return plain[1] + ".0.0";
  for (const line of n.text.split(/\r?\n/)) {
    const m = /^ {0,8}([45])\d\d[ -]\d/.exec(line);
    if (m) return m[1] + ".0.0";
  }
  return "";
}

const isDsn = (n) => {
  const type = lower(n.headers["content-type"]);
  return /report-type="?delivery-status/.test(type) || /^[ \t]*Final-Recipient:/im.test(n.text) ||
    BOUNCE_FROM.test(addressIn(n.from)) || BOUNCE_SUBJECT.test(n.subject);
};

function classifyDsn(n) {
  const action = lower(field(n.text, "Action"));
  const status = statusOf(n);
  const recipient = recipientOf(n);
  if (["delivered", "relayed", "expanded"].includes(action) || status.startsWith("2.")) return { kind: "none", status, recipient };
  let kind = "soft"; // a DSN with no status at all is not proof of a permanent failure
  if (action === "delayed" || status.startsWith("4.")) kind = "soft";
  else if (status.startsWith("5.")) kind = SOFT_PERMANENT.has(status) ? "soft" : "hard";
  return { kind, status, recipient };
}

/**
 * Classify one mail. Order matters: a feedback report first, then a delivery status (which itself carries
 * Auto-Submitted), then auto-replies.
 * @param {string|{from?:any,subject?:string,text?:string,headers?:object|string}} input
 * @returns {{kind:"hard"|"soft"|"auto-reply"|"complaint"|"none", status:string, recipient:string}}
 */
function classify(input) {
  const n = normalize(input);
  const type = lower(n.headers["content-type"]);
  if (/report-type="?feedback-report/.test(type) || /^[ \t]*Feedback-Type:/im.test(n.text)) {
    return { kind: "complaint", status: "", recipient: recipientOf(n) };
  }
  if (isDsn(n)) return classifyDsn(n);
  const auto = lower(n.headers["auto-submitted"]);
  if ((auto && auto !== "no") || n.headers["x-autoreply"] != null || n.headers["x-autorespond"] != null ||
      /^auto[_-]?reply/.test(lower(n.headers.precedence)) || AUTO_SUBJECT.test(n.subject)) {
    return { kind: "auto-reply", status: "", recipient: "" };
  }
  return { kind: "none", status: "", recipient: "" };
}

/** Short, personal-text-free label for logs and webhook replies: "hard 5.1.1", "auto-reply", or "". */
function label(result) {
  const r = result || {};
  return !r.kind || r.kind === "none" ? "" : r.kind + (r.status ? " " + r.status : "");
}

module.exports = { classify, label, SOFT_PERMANENT };
