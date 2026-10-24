/* Proof that the asker may talk to a site (the chat conversation, form testing), besides "own" from a mailbox
   on the site's domain (core.ownerProof):
   - "credentials": the operator recorded on the review desk that this account's signed-in run for the host is verified.
   - "site": the owner put qa-lab-verify=<token> in a DNS TXT record of the host or its registrable domain,
     or <meta name="qa-lab-verify" content="<token>"> on the homepage. The token is an HMAC of (account email, host)
     under REVIEW_VERIFY_KEY, so it cannot be reused for another account or host.
   Rows live in Firestore url_review_owner_proofs and carry expireAt for the TTL policy. No password or secret is stored. */
const crypto = require("crypto");

const COLLECTION = "url_review_owner_proofs";
const SITE_MS = 30 * 24 * 60 * 60 * 1000;
const OPERATOR_MS = 365 * 24 * 60 * 60 * 1000;
const PREFIX = "qa-lab-verify=";

function bare(host) {
  return String(host || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

// A public host name from what an owner or operator typed: a bare host or an https address.
function hostOf(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return "";
  if (!/^[a-z]+:\/\//.test(value)) value = "https://" + value;
  let host = "";
  try { host = new URL(value).hostname; } catch (error) { return ""; }
  host = bare(host);
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : "";
}

function emailOf(input) {
  const value = String(input || "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(value) ? value : "";
}

function siteToken(secret, email, host) {
  const who = emailOf(email);
  const where = hostOf(host);
  if (!secret || !who || !where) return "";
  return crypto.createHmac("sha256", String(secret)).update("qa-lab-verify\n" + who + "\n" + where).digest("hex").slice(0, 32);
}

function docId(kind, email, host) {
  return kind + "-" + crypto.createHash("sha256").update(emailOf(email) + "\n" + hostOf(host)).digest("hex").slice(0, 40);
}

function operatorRecord(input, now) {
  const at = now || Date.now();
  return { kind: "operator", email: emailOf(input.email), host: hostOf(input.host), by: emailOf(input.by), at: new Date(at).toISOString(), expireAt: new Date(at + OPERATOR_MS) };
}

function siteRecord(input, now) {
  const at = now || Date.now();
  return { kind: "site", email: emailOf(input.email), host: hostOf(input.host), how: input.how === "meta" ? "meta" : "dns", at: new Date(at).toISOString(), expireAt: new Date(at + SITE_MS) };
}

function expiry(row) {
  const value = row && row.expireAt;
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return new Date(value).getTime() || 0;
}

// "credentials" or "site" when a stored, unexpired row proves this account for this host, else "".
function validFor(rows, email, host, now) {
  const who = emailOf(email);
  const where = hostOf(host);
  if (!who || !where) return "";
  const live = (rows || []).filter((row) => row && emailOf(row.email) === who && hostOf(row.host) === where && expiry(row) > (now || Date.now()));
  if (live.some((row) => row.kind === "operator")) return "credentials";
  if (live.some((row) => row.kind === "site")) return "site";
  return "";
}

function metaTokens(html) {
  const out = [];
  for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    if (!/\bname\s*=\s*["']?qa-lab-verify["'\s/>]/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    if (content) out.push((content[1] || content[2] || content[3] || "").trim());
  }
  return out;
}

// deps: { resolveTxt(name) -> [[chunk]], fetchHome(host) -> homepage HTML or "", registrable(host) -> domain }.
async function checkSite(token, host, deps) {
  const where = hostOf(host);
  if (!token || !where) return { ok: false, how: "" };
  const names = [...new Set([where, deps.registrable ? bare(deps.registrable(where)) : where].filter(Boolean))];
  for (const name of names) {
    let records = [];
    try { records = await deps.resolveTxt(name); } catch (error) { records = []; }
    if ((records || []).some((chunks) => [].concat(chunks).join("").trim() === PREFIX + token)) return { ok: true, how: "dns", name };
  }
  let html = "";
  try { html = deps.fetchHome ? await deps.fetchHome(where) : ""; } catch (error) { html = ""; }
  if (metaTokens(html).indexOf(token) !== -1) return { ok: true, how: "meta", name: where };
  return { ok: false, how: "" };
}

// What an owner or the desk may see of a row.
function publicRow(id, row) {
  return { id, kind: row.kind === "operator" ? "operator" : "site", email: emailOf(row.email), host: hostOf(row.host), how: row.how || "", by: row.by || "", at: row.at || "", until: expiry(row) ? new Date(expiry(row)).toISOString() : "" };
}

module.exports = { COLLECTION, SITE_MS, OPERATOR_MS, PREFIX, hostOf, emailOf, siteToken, docId, operatorRecord, siteRecord, validFor, metaTokens, checkSite, publicRow };
