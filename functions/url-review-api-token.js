/**
 * Per-account API tokens for MCP / IDE full crawl (#3626).
 * Separate from the shared QA_LAB_MCP_KEY Turnstile skip (#3480 A).
 * Mint while signed in; Bearer / x-qa-lab-api-token authenticates deeper tools.
 */
const crypto = require("crypto");

const PREFIX = "qlat_";
const ID_RE = /^[a-f0-9]{16}$/;
const SECRET_RE = /^[a-f0-9]{48}$/;
const TOKEN_RE = /^qlat_([a-f0-9]{16})_([a-f0-9]{48})$/;

function hashOf(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function mint(termsVersion) {
  const id = crypto.randomBytes(8).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");
  const token = PREFIX + id + "_" + secret;
  return {
    id,
    hash: hashOf(token),
    prefix: PREFIX + id,
    termsVersion: String(termsVersion || "").slice(0, 40),
    createdAt: new Date().toISOString(),
    token
  };
}

function parseToken(raw) {
  const value = String(raw || "").trim();
  const match = TOKEN_RE.exec(value);
  if (!match) return null;
  return { id: match[1], secret: match[2], token: value };
}

function extractToken(input, headers) {
  const body = input || {};
  const h = headers || {};
  const header =
    h["x-qa-lab-api-token"] ||
    h["X-QA-Lab-Api-Token"] ||
    "";
  if (header) return String(header).trim();
  const auth = String(h.authorization || h.Authorization || "").trim();
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth);
  if (bearer) return bearer[1];
  return String(body.apiToken || body.qaLabApiToken || "").trim();
}

function publicToken(row) {
  const tok = row && row.apiToken;
  if (!tok || !ID_RE.test(tok.id)) return null;
  return {
    id: tok.id,
    prefix: tok.prefix || PREFIX + tok.id,
    createdAt: tok.createdAt || null,
    termsVersion: tok.termsVersion || "",
    hasToken: true
  };
}

function storedRow(made) {
  return {
    id: made.id,
    hash: made.hash,
    prefix: made.prefix,
    termsVersion: made.termsVersion,
    createdAt: made.createdAt
  };
}

function verifyStored(row, rawToken) {
  const tok = row && row.apiToken;
  const parsed = parseToken(rawToken);
  if (!tok || !parsed || tok.id !== parsed.id || !tok.hash) return false;
  return sameHash(tok.hash, hashOf(parsed.token));
}

module.exports = {
  PREFIX,
  ID_RE,
  SECRET_RE,
  TOKEN_RE,
  mint,
  parseToken,
  extractToken,
  publicToken,
  storedRow,
  verifyStored,
  hashOf
};
