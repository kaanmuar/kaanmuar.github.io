"use strict";
/* Mail that ImprovMX posts to the mailInbound webhook (#1898, part of #1897). The qa@ alias and the
   per-channel aliases (tiktok@, youtube@, x@, ...) forward to Gmail and to this webhook, which pulls the
   sign-in or verification code out of each mail and pushes it to Jarvis on the phone and in the browser.
   Rules only, no model:

   code   a 4 to 10 character code with a digit, next to a word like code, PIN or código, or on a line of its own
   link   no code, but a confirm or verify link from a sender that passed SPF or DKIM, pointing at that same service
   none   anything else (newsletters, notices): left to Gmail

   A confirm link is only taken from a checked sender, so a forged mail cannot push a phishing link. */
const crypto = require("crypto");

const KEEP_MS = 24 * 3600 * 1000;

const SERVICES = [
  { key: "tiktok", label: "TikTok", domains: ["tiktok.com", "tiktokv.com", "tiktokglobalshop.com", "bytedance.com"] },
  { key: "google", label: "Google / YouTube", domains: ["google.com", "youtube.com", "googlemail.com"] },
  { key: "x", label: "X", domains: ["x.com", "twitter.com"] },
  { key: "meta", label: "Meta", domains: ["facebookmail.com", "facebook.com", "instagram.com", "meta.com", "threads.net"] },
  { key: "linkedin", label: "LinkedIn", domains: ["linkedin.com"] },
  { key: "bluesky", label: "Bluesky", domains: ["bsky.app", "bsky.social", "blueskyweb.xyz"] },
  { key: "mastodon", label: "Mastodon", domains: ["mastodon.social", "joinmastodon.org"] },
  { key: "buffer", label: "Buffer", domains: ["buffer.com"] },
  { key: "github", label: "GitHub", domains: ["github.com"] },
  { key: "cloudflare", label: "Cloudflare", domains: ["cloudflare.com"] },
  { key: "improvmx", label: "ImprovMX", domains: ["improvmx.com"] }
];

const TOPIC = /\b(codes?|c[oó]digo|pin|otp|passcode|verif\w*|confirm\w*|sign[- ]?in|log[- ]?in|inicio de sesi[oó]n|iniciar sesi[oó]n|2fa|two[- ]factor|security|seguridad|one[- ]time)\b/i;
const LINK_TOPIC = /\b(verif\w*|confirm\w*|activat\w*|activar|magic link|sign[- ]?in link|log[- ]?in link)\b/i;
const LINK_PATH = /verif|confirm|activat|token|magic|login|signin|sign-in|auth/i;
const KEYWORD = /\bcodes?\b|c[oó]digo|\bpin\b|\botp\b|passcode/gi;
const TOKEN = /\b(\d{3}[ -]\d{3}|[A-Za-z0-9]{4,10})\b/g;
const LEADING = /^\s*(?:G-)?(\d{4,8})\b/;
const ALONE = /^[ \t]*(\d{3}[ -]\d{3}|[A-Za-z0-9]{4,10})[ \t]*$/gm;

const clip = (value, max) => {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

const domainOf = (email) => String(email || "").toLowerCase().split("@").pop().replace(/[>\s]+$/, "");
const inFamily = (domain, list) => list.some((d) => domain === d || domain.endsWith("." + d));
const serviceOf = (domain) => SERVICES.find((s) => inFamily(domain, s.domains)) || null;

function header(headers, name) {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  const v = key ? headers[key] : "";
  return Array.isArray(v) ? v.join("\n") : String(v || "");
}

/** Domains that passed DKIM (header.d) or SPF (smtp.mailfrom) in the Authentication-Results ImprovMX adds. */
function passedDomains(headers) {
  const out = new Set();
  const auth = header(headers, "Authentication-Results");
  for (const m of auth.matchAll(/dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/gi)) out.add(m[1].toLowerCase());
  for (const m of auth.matchAll(/spf=pass[^;]*?smtp\.mailfrom=(?:[^@\s;]*@)?([a-z0-9.-]+)/gi)) out.add(m[1].toLowerCase());
  return [...out];
}

function htmlText(html) {
  return String(html || "").replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|td|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
}

/** The parts of an ImprovMX webhook payload the rules use. */
function read(payload, alias) {
  const p = payload || {};
  const from = p.from && typeof p.from === "object" ? p.from : { email: String(p.from || "") };
  const to = (Array.isArray(p.to) ? p.to : []).map((t) => String((t && t.email) || "").toLowerCase()).filter(Boolean);
  const ours = to.find((t) => t.endsWith("@carlosandmunoz.com")) || "";
  return {
    id: clip(p["message-id"] || "", 300) || (p.timestamp || "") + ":" + clip(p.subject, 80),
    fromEmail: String(from.email || "").toLowerCase(),
    fromName: clip(from.name, 80),
    alias: clean(alias) || ours.split("@")[0],
    subject: clip(p.subject, 300),
    text: String(p.text || "") || htmlText(p.html),
    html: String(p.html || ""),
    passed: passedDomains(p.headers),
    at: p.timestamp ? new Date(Number(p.timestamp) * 1000).toISOString() : ""
  };
}

const clean = (alias) => String(alias || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);

const looksLikeCode = (s) => /\d/.test(s) && !/^(19|20)\d\d$/.test(s) && !/^\d{11,}$/.test(s.replace(/[ -]/g, ""));

function findCode(subject, text) {
  if (TOPIC.test(subject)) {
    const lead = subject.match(LEADING);
    if (lead && looksLikeCode(lead[1])) return lead[1];
  }
  for (const source of [subject, text]) {
    for (const k of source.matchAll(KEYWORD)) {
      const after = source.slice(k.index + k[0].length, k.index + k[0].length + 60);
      const hit = [...after.matchAll(TOKEN)].find((m) => looksLikeCode(m[1]));
      if (hit) return hit[1].replace(/[ -]/g, "");
    }
  }
  if (!TOPIC.test(subject + "\n" + text)) return "";
  for (const m of text.matchAll(ALONE)) if (looksLikeCode(m[1])) return m[1].replace(/[ -]/g, "");
  return "";
}

function findLink(mail, service) {
  const urls = [...mail.html.matchAll(/href=["'](https:\/\/[^"'\s>]+)/gi), ...mail.text.matchAll(/(https:\/\/[^\s<>"')\]]+)/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  return urls.find((u) => {
    try {
      const url = new URL(u);
      return inFamily(url.hostname.toLowerCase(), service.domains) && LINK_PATH.test(url.pathname + url.search);
    } catch (error) {
      return false;
    }
  }) || "";
}

/** What Jarvis pushes for one mail, or null when it is not a code or a checked confirm link. */
function codeOf(mail) {
  const domain = domainOf(mail.fromEmail);
  const service = serviceOf(domain);
  const trusted = !!service && mail.passed.some((d) => inFamily(d, service.domains));
  const base = {
    service: service ? service.key : domain,
    label: service ? service.label : domain || "Unknown sender",
    trusted,
    alias: mail.alias,
    from: clip((mail.fromName ? mail.fromName + " <" + mail.fromEmail + ">" : mail.fromEmail), 160),
    subject: clip(mail.subject, 200)
  };
  const code = findCode(mail.subject, mail.text);
  if (code) return Object.assign(base, { code, link: "" });
  if (!trusted || !LINK_TOPIC.test(mail.subject + "\n" + mail.text)) return null;
  const link = findLink(mail, service);
  return link ? Object.assign(base, { code: "", link }) : null;
}

const docId = (mail) => crypto.createHash("sha256").update(mail.id || mail.subject).digest("hex").slice(0, 32);

function message(row) {
  const to = row.alias ? row.alias + "@" : "";
  return {
    kind: "codes",
    title: row.code ? row.label + " code: " + row.code : row.label + ": confirm link",
    body: row.subject || (row.code ? "Sign-in code" : "Tap to open the link."),
    lines: [row.from, (to ? "To " + to : "") + (row.trusted ? "" : (to ? ", " : "") + "sender not checked")].filter(Boolean),
    tab: "systems",
    tag: "jarvis-code-" + row.service,
    url: row.link || "",
    code: row.code || ""
  };
}

/** Rows for the Jarvis snapshot and the mail-codes op: the last day's codes, newest first. */
function rows(docs, now) {
  return (docs || []).filter((d) => d && Date.parse(d.at || 0) > now - KEEP_MS)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10)
    .map((d) => ({ service: d.service, label: d.label, code: d.code || "", link: d.link || "", alias: d.alias || "", from: d.from || "", subject: d.subject || "", trusted: !!d.trusted, at: d.at }));
}

module.exports = { KEEP_MS, SERVICES, passedDomains, htmlText, read, codeOf, docId, message, rows };
