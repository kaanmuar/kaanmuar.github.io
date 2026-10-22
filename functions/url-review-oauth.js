/**
 * Sign-in with providers Firebase has no button for. The server keeps the
 * client secret: start stores the device hash and a PKCE verifier under a
 * random state, the provider sends the browser back to the review page with
 * that state and a code, and finish exchanges the code only for the device
 * that started it.
 */
const crypto = require("crypto");
const reviewAuth = require("./url-review-auth");

const COL = "url_review_oauth";
const STATE_MS = 10 * 60 * 1000;

const oidcUser = (user) => ({
  uid: user.sub,
  email: user.email,
  verified: user.email_verified === true,
  name: user.name || user.preferred_username,
  picture: user.picture,
  givenName: user.given_name,
  familyName: user.family_name,
  locale: typeof user.locale === "string" ? user.locale : ""
});

// PKCE is sent only where the provider documents it for confidential web apps:
// LinkedIn's OpenID flow refuses the parameters, and Slack's turns the app public.
const OAUTH = {
  linkedin: {
    authorize: "https://www.linkedin.com/oauth/v2/authorization",
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    user: "https://api.linkedin.com/v2/userinfo",
    scope: "openid profile email",
    read: oidcUser
  },
  gitlab: {
    authorize: "https://gitlab.com/oauth/authorize",
    token: "https://gitlab.com/oauth/token",
    user: "https://gitlab.com/oauth/userinfo",
    scope: "openid profile email",
    pkce: true,
    read: oidcUser
  },
  discord: {
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    user: "https://discord.com/api/users/@me",
    scope: "identify email",
    pkce: true,
    read: (user) => ({
      uid: user.id,
      email: user.email,
      verified: user.verified === true,
      name: user.global_name || user.username,
      picture: user.avatar && /^\d+$/.test(String(user.id)) && /^[a-z0-9_]+$/i.test(String(user.avatar)) ? "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png" : ""
    })
  },
  twitch: {
    authorize: "https://id.twitch.tv/oauth2/authorize",
    token: "https://id.twitch.tv/oauth2/token",
    user: "https://id.twitch.tv/oauth2/userinfo",
    scope: "openid user:read:email",
    claims: JSON.stringify({ userinfo: { email: null, email_verified: null, picture: null, preferred_username: null } }),
    read: oidcUser
  },
  slack: {
    authorize: "https://slack.com/openid/connect/authorize",
    token: "https://slack.com/api/openid.connect.token",
    user: "https://slack.com/api/openid.connect.userInfo",
    scope: "openid profile email",
    read: oidcUser
  }
};

function fail(status, error, extra) {
  return Object.assign({ ok: false, status, error }, extra || {});
}

function credentials(env, id) {
  const key = "REVIEW_OAUTH_" + String(id).toUpperCase();
  const clientId = String((env || {})[key + "_ID"] || "").trim();
  const secret = String((env || {})[key + "_SECRET"] || "").trim();
  return OAUTH[id] && clientId && secret ? { clientId, secret } : null;
}

function ready(env) {
  return Object.keys(OAUTH).filter((id) => credentials(env, id));
}

function challengeOf(verifier) {
  return crypto.createHash("sha256").update(String(verifier)).digest("base64url");
}

function isOpen(id, input) {
  return reviewAuth.enabledProviders(input.enabled, ready(input.env)).some((item) => item.id === id && item.oauth);
}

function labelOf(id) {
  return (reviewAuth.PROVIDERS.find((item) => item.id === id) || { label: "The provider" }).label;
}

async function startOAuth(store, input) {
  const now = input.now || Date.now();
  const id = String(input.provider || "");
  if (!isOpen(id, input)) return fail(400, "This sign-in option is not open yet. Use email instead.");
  const device = reviewAuth.deviceHash(input.deviceKey);
  if (!device) return fail(400, "This browser did not send its device key. Reload the page and try again.");
  const provider = OAUTH[id];
  const state = crypto.randomBytes(24).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  await store.set(COL, state, {
    provider: id,
    deviceHash: device,
    verifier,
    redirectUri: input.redirectUri,
    ip: String(input.ip || "").slice(0, 80),
    used: false,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + STATE_MS).toISOString()
  });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: credentials(input.env, id).clientId,
    redirect_uri: input.redirectUri,
    scope: provider.scope,
    state
  });
  if (provider.pkce) {
    params.set("code_challenge", challengeOf(verifier));
    params.set("code_challenge_method", "S256");
  }
  if (provider.claims) params.set("claims", provider.claims);
  return { ok: true, state, url: provider.authorize + "?" + params };
}

async function readUser(id, keys, pending, code, fetcher) {
  const provider = OAUTH[id];
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: keys.clientId,
    client_secret: keys.secret
  });
  if (provider.pkce) form.set("code_verifier", pending.verifier);
  const tokenRes = await fetcher(provider.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString(),
    signal: AbortSignal.timeout(10000)
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) throw new Error(id + " token " + tokenRes.status + " " + String(token.error || ""));
  const userRes = await fetcher(provider.user, {
    headers: { authorization: "Bearer " + token.access_token, accept: "application/json" },
    signal: AbortSignal.timeout(10000)
  });
  const user = await userRes.json().catch(() => ({}));
  if (!userRes.ok || !user || user.ok === false) throw new Error(id + " user " + userRes.status + " " + String(user.error || ""));
  return provider.read(user);
}

async function finishOAuth(store, input) {
  const now = input.now || Date.now();
  const state = String(input.state || "").replace(/[^a-f0-9]/g, "").slice(0, 48);
  const pending = state.length === 48 ? await store.get(COL, state) : null;
  if (!pending || pending.used || Date.parse(pending.expiresAt) < now) {
    return fail(410, "This sign-in has expired. Start it again.", { code: "expired" });
  }
  const device = reviewAuth.deviceHash(input.deviceKey);
  if (!reviewAuth.sameHash(device, pending.deviceHash)) {
    await store.set(COL, state, { used: true, otherDeviceAt: new Date(now).toISOString() });
    return fail(403, reviewAuth.OTHER_DEVICE, { code: "other-device" });
  }
  await store.set(COL, state, { used: true, usedAt: new Date(now).toISOString() });
  const id = pending.provider;
  const label = labelOf(id);
  const code = String(input.code || "").slice(0, 2000);
  if (input.error || !code) return fail(400, "The " + label + " sign-in was cancelled. Try again, or use email.", { code: "cancelled" });
  if (!isOpen(id, input)) return fail(400, "This sign-in option is not open yet. Use email instead.");
  let user;
  try {
    user = await readUser(id, credentials(input.env, id), pending, code, input.fetch || fetch);
  } catch (error) {
    console.error("OAuth sign-in failed:", error.message);
    return fail(502, label + " did not confirm the sign-in. Try again, or use email.");
  }
  const email = reviewAuth.cleanEmail(user.email);
  if (!email) return fail(400, "That account did not share an email address. Use email instead.");
  const uid = String(user.uid || "").slice(0, 128);
  if (user.verified !== true) return { ok: false, status: 200, verifyEmail: true, email, provider: id, uid };
  const profile = reviewAuth.profileFrom(user, { givenName: user.givenName, familyName: user.familyName, locale: user.locale }, email);
  return reviewAuth.openSession(store, { email, provider: id, uid, deviceHash: device, profile, now });
}

module.exports = {
  OAUTH,
  STATE_MS,
  credentials,
  ready,
  challengeOf,
  startOAuth,
  finishOAuth
};
