// GitHub access for the functions (#1734): hour-long installation tokens of the qa-lab-agents app, minted from
// GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY (scripts/functions-github-app-env.js writes both). "repo" acts on the site
// repo (Actions, Issues, Contents); "board" on the carlosandmunoz-hq project. Until the app key is set, or while the app
// is not installed where a scope needs it, both scopes use GITHUB_BUGS_TOKEN.
const crypto = require("crypto");

const REPO = "kaanmuar/kaanmuar.github.io";
const ORG = "carlosandmunoz-hq";
const INSTALLATION = { repo: "/repos/" + REPO + "/installation", board: "/orgs/" + ORG + "/installation" };
const EARLY = 5 * 60 * 1000;
const RETRY = 10 * 60 * 1000;
const cache = new Map();

function b64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

// The .env holds the PEM base64-encoded on one line; a raw PEM with \n escapes works too.
function privateKey(env) {
  const raw = String(env.GITHUB_APP_PRIVATE_KEY || "").trim();
  if (!raw) return "";
  return raw.includes("BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
}

function appJwt(id, key, now) {
  const at = Math.floor(now / 1000);
  const body = b64url({ alg: "RS256", typ: "JWT" }) + "." + b64url({ iat: at - 60, exp: at + 540, iss: String(id) });
  return body + "." + crypto.sign("RSA-SHA256", Buffer.from(body), key).toString("base64url");
}

async function call(fetchImpl, path, jwt, method) {
  const res = await fetchImpl("https://api.github.com" + path, {
    method: method || "GET",
    headers: { Authorization: "Bearer " + jwt, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-agents", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("GitHub " + path + " answered " + res.status + ": " + String(data.message || "").slice(0, 200));
  return data;
}

async function token(scope = "repo", { fetchImpl = fetch, env = process.env, now = Date.now() } = {}) {
  const fallback = String(env.GITHUB_BUGS_TOKEN || "");
  const id = String(env.GITHUB_APP_ID || "");
  const key = privateKey(env);
  if (!id || !key || !INSTALLATION[scope]) return fallback;
  const hit = cache.get(scope);
  if (hit && hit.until > now) return hit.token || fallback;
  try {
    const jwt = appJwt(id, key, now);
    const installation = await call(fetchImpl, INSTALLATION[scope], jwt);
    const minted = await call(fetchImpl, "/app/installations/" + installation.id + "/access_tokens", jwt, "POST");
    cache.set(scope, { token: minted.token, until: Date.parse(minted.expires_at) - EARLY });
    return minted.token;
  } catch (error) {
    console.warn("GitHub app token for " + scope + " failed, so GITHUB_BUGS_TOKEN is used:", error.message);
    cache.set(scope, { token: "", until: now + RETRY });
    return fallback;
  }
}

function reset() {
  cache.clear();
}

module.exports = { token, reset, REPO, ORG };
