/**
 * Sign-in for URL reviews. A run needs a session, and a session belongs to the
 * device that asked for it: the browser keeps a random device key, the server
 * keeps only its hash, and an email code or link opened anywhere else is refused.
 * The account (keyed by email) is where a paid plan will hang.
 */
const crypto = require("crypto");

const PROVIDERS = [
  { id: "email", label: "Email" },
  { id: "google.com", label: "Google" },
  { id: "microsoft.com", label: "Microsoft" },
  { id: "apple.com", label: "Apple" },
  { id: "github.com", label: "GitHub" },
  { id: "yahoo.com", label: "Yahoo" },
  { id: "facebook.com", label: "Facebook" },
  { id: "twitter.com", label: "X" },
  { id: "linkedin", label: "LinkedIn", oauth: true },
  { id: "gitlab", label: "GitLab", oauth: true },
  { id: "discord", label: "Discord", oauth: true },
  { id: "twitch", label: "Twitch", oauth: true },
  { id: "slack", label: "Slack", oauth: true }
];
const DEFAULT_PROVIDERS = "email,google.com";
const CODE_MS = 15 * 60 * 1000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_MS = 365 * 24 * 60 * 60 * 1000;
const RUN_MS = 24 * 60 * 60 * 1000;
const PEOPLE_FIELDS = "emailAddresses,organizations,birthdays,phoneNumbers,addresses,genders";
const MAX_TRIES = 5;
const SENDS_PER_EMAIL = 5;
const SENDS_PER_IP = 15;
const SEND_WINDOW_MS = 60 * 60 * 1000;

const OTHER_DEVICE = "This sign-in was asked for on another device or browser. Finish it there, or ask for a new code here.";

function hashOf(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function deviceHash(key) {
  const clean = String(key || "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(clean) ? hashOf("device:" + clean) : "";
}

function cleanEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (value.length > 160 || value.includes("..")) return "";
  return /^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9.\-]*[a-z0-9])?\.[a-z]{2,}$/.test(value) ? value : "";
}

function maskEmail(email) {
  const [user, host] = String(email || "").split("@");
  if (!host) return "";
  return user.slice(0, 2) + "•••@" + host;
}

// A server-side OAuth provider is offered only once its client id and secret are set.
function enabledProviders(setting, ready) {
  const wanted = String(setting || DEFAULT_PROVIDERS).split(",").map((part) => part.trim()).filter(Boolean);
  const keyed = ready || [];
  return PROVIDERS.filter((item) => item.id === "email" || (wanted.indexOf(item.id) !== -1 && (!item.oauth || keyed.indexOf(item.id) !== -1)));
}

function fail(status, error, extra) {
  return Object.assign({ ok: false, status, error }, extra || {});
}

function firestoreStore(db) {
  return {
    async get(col, id) {
      const snap = await db.collection(col).doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    async set(col, id, data) { await db.collection(col).doc(id).set(data, { merge: true }); },
    async replace(col, id, data) { await db.collection(col).doc(id).set(data); },
    async remove(col, id) { await db.collection(col).doc(id).delete(); },
    async where(col, field, value, limit) {
      const snap = await db.collection(col).where(field, "==", value).limit(limit || 50).get();
      return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
    }
  };
}

function memoryStore() {
  const cols = new Map();
  const col = (name) => {
    if (!cols.has(name)) cols.set(name, new Map());
    return cols.get(name);
  };
  return {
    cols,
    async get(name, id) { return col(name).has(id) ? Object.assign({}, col(name).get(id)) : null; },
    async set(name, id, data) { col(name).set(id, Object.assign({}, col(name).get(id) || {}, data)); },
    async replace(name, id, data) { col(name).set(id, Object.assign({}, data)); },
    async remove(name, id) { col(name).delete(id); },
    async where(name, field, value, limit) {
      return Array.from(col(name).entries())
        .filter(([, row]) => row[field] === value)
        .slice(0, limit || 50)
        .map(([id, row]) => Object.assign({ id }, row));
    }
  };
}

async function recentSends(store, field, value, now) {
  if (!value) return 0;
  const rows = await store.where("url_review_sign_ins", field, value, 50);
  return rows.filter((row) => now - Date.parse(row.createdAt || 0) < SEND_WINDOW_MS).length;
}

async function startEmail(store, input) {
  const now = input.now || Date.now();
  const email = cleanEmail(input.email);
  if (!email) return fail(400, "Enter a valid email.", { field: "email" });
  const device = deviceHash(input.deviceKey);
  if (!device) return fail(400, "This browser did not send its device key. Reload the page and try again.");
  const ip = String(input.ip || "").slice(0, 80);
  if (await recentSends(store, "email", email, now) >= SENDS_PER_EMAIL || await recentSends(store, "ip", ip, now) >= SENDS_PER_IP) {
    return fail(429, "Too many sign-in emails in the last hour. Use the last code you got, or try again later.");
  }
  const id = crypto.randomBytes(12).toString("hex");
  const code = String(crypto.randomInt(100000, 1000000));
  const token = crypto.randomBytes(24).toString("hex");
  await store.set("url_review_sign_ins", id, {
    email,
    ip,
    provider: input.provider || "email",
    uid: input.uid || "",
    deviceHash: device,
    codeHash: hashOf(id + ":" + code),
    tokenHash: hashOf(id + ":" + token),
    tries: 0,
    used: false,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CODE_MS).toISOString(),
    // Firestore TTL deletes the row; it must outlive the hourly send limit that counts it.
    expireAt: new Date(now + Math.max(CODE_MS, SEND_WINDOW_MS))
  });
  return { ok: true, id, code, token, email };
}

async function finishEmail(store, input) {
  const now = input.now || Date.now();
  const id = String(input.id || "").replace(/[^a-f0-9]/g, "").slice(0, 24);
  const pending = id ? await store.get("url_review_sign_ins", id) : null;
  if (!pending || pending.used || Date.parse(pending.expiresAt) < now) {
    return fail(410, "This sign-in has expired. Ask for a new code.", { code: "expired" });
  }
  if (pending.tries >= MAX_TRIES) return fail(429, "Too many wrong codes. Ask for a new one.", { code: "expired" });
  const device = deviceHash(input.deviceKey);
  if (!sameHash(device, pending.deviceHash)) {
    await store.set("url_review_sign_ins", id, { tries: pending.tries + 1, otherDeviceAt: new Date(now).toISOString() });
    return fail(403, OTHER_DEVICE, { code: "other-device" });
  }
  const code = String(input.code || "").replace(/\D/g, "");
  const token = String(input.token || "").replace(/[^a-f0-9]/g, "");
  const matches = token
    ? sameHash(hashOf(id + ":" + token), pending.tokenHash)
    : code.length === 6 && sameHash(hashOf(id + ":" + code), pending.codeHash);
  if (!matches) {
    await store.set("url_review_sign_ins", id, { tries: pending.tries + 1 });
    return fail(401, "That code does not match. Check the latest email.", { code: "wrong-code" });
  }
  await store.set("url_review_sign_ins", id, { used: true, usedAt: new Date(now).toISOString() });
  return openSession(store, { email: pending.email, provider: pending.provider || "email", uid: pending.uid, deviceHash: device, now });
}

async function providerSignIn(store, decoded, input) {
  const now = input.now || Date.now();
  const provider = String((decoded && decoded.firebase && decoded.firebase.sign_in_provider) || "");
  const allowed = enabledProviders(input.enabled).some((item) => item.id === provider && item.id !== "email");
  if (!allowed) return fail(400, "This sign-in option is not open yet. Use email instead.");
  const email = cleanEmail(decoded.email);
  if (!email) return fail(400, "That account did not share an email address. Use email instead.");
  const device = deviceHash(input.deviceKey);
  if (!device) return fail(400, "This browser did not send its device key. Reload the page and try again.");
  if (decoded.email_verified !== true) return { ok: false, status: 200, verifyEmail: true, email, provider, uid: String(decoded.uid || "") };
  const people = provider === "google.com" ? await googlePeople(input.googleAccessToken, googleIdOf(decoded), input.fetch) : null;
  const profile = Object.assign(profileFrom(decoded, input.profile, email), people || {});
  return openSession(store, { email, provider, uid: decoded.uid, deviceHash: device, profile, now });
}

function googleIdOf(decoded) {
  const ids = decoded && decoded.firebase && decoded.firebase.identities && decoded.firebase.identities["google.com"];
  return /^\d{5,40}$/.test(String((ids && ids[0]) || "")) ? String(ids[0]) : "";
}

// The browser hands over the access token and nothing it read with it; the
// server asks Google itself, and only for the account the ID token belongs to.
async function googlePeople(accessToken, googleId, fetcher) {
  const token = String(accessToken || "");
  if (!googleId || !/^[\w.\-~+/]{20,4096}=*$/.test(token)) return null;
  try {
    const res = await (fetcher || fetch)("https://people.googleapis.com/v1/people/me?personFields=" + PEOPLE_FIELDS, {
      headers: { authorization: "Bearer " + token },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const person = await res.json();
    return person && person.resourceName === "people/" + googleId ? peopleProfile(person) : null;
  } catch (error) {
    return null;
  }
}

// Every field is written, empty when Google no longer shares it, so a scope the
// visitor unticks on a later sign-in also clears what was kept from it.
function peopleProfile(person) {
  const list = (key) => (Array.isArray(person[key]) ? person[key] : []);
  const date = (list("birthdays").find((item) => item.date && item.date.month && item.date.day) || {}).date;
  const pad = (n) => String(n).padStart(2, "0");
  const unique = (items) => items.filter((item, i) => item && items.indexOf(item) === i).slice(0, 5);
  const gender = list("genders")[0] || {};
  return {
    emails: unique(list("emailAddresses").map((item) => cleanEmail(item.value))),
    birthday: date ? (date.year ? date.year + "-" : "--") + pad(date.month) + "-" + pad(date.day) : "",
    gender: cleanText(gender.value === "unspecified" ? "" : gender.value, 40),
    phones: unique(list("phoneNumbers").map((item) => cleanText(item.canonicalForm || item.value, 40))),
    addresses: list("addresses").slice(0, 5).map((item) => ({
      type: cleanText(item.type, 20),
      formatted: cleanText(String(item.formattedValue || "").replace(/\s*\n\s*/g, ", "), 300),
      city: cleanText(item.city, 80),
      region: cleanText(item.region, 80),
      postalCode: cleanText(item.postalCode, 20),
      countryCode: /^[A-Z]{2}$/i.test(String(item.countryCode || "")) ? String(item.countryCode).toUpperCase() : ""
    })).filter((item) => item.formatted || item.city || item.countryCode),
    organizations: list("organizations").slice(0, 5).map((item) => ({
      name: cleanText(item.name, 120),
      title: cleanText(item.title, 120),
      department: cleanText(item.department, 120)
    })).filter((item) => item.name || item.title)
  };
}

function cleanText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

// Name and photo come from the verified ID token. The rest is what the provider
// showed the browser; a Workspace domain counts only when it is the email's own.
function profileFrom(decoded, reported, email) {
  const sent = reported && typeof reported === "object" ? reported : {};
  const domain = String(sent.workspaceDomain || "").toLowerCase();
  const locale = String(sent.locale || "");
  const profile = {
    name: cleanText(decoded.name, 120),
    givenName: cleanText(sent.givenName, 80),
    familyName: cleanText(sent.familyName, 80),
    picture: /^https:\/\/[^\s"'<>]+$/.test(String(decoded.picture || "")) ? String(decoded.picture).slice(0, 500) : "",
    locale: /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i.test(locale) ? locale : "",
    workspaceDomain: domain && email.endsWith("@" + domain) ? domain : ""
  };
  return Object.keys(profile).reduce((kept, key) => (profile[key] ? Object.assign(kept, { [key]: profile[key] }) : kept), {});
}

async function openSession(store, input) {
  const now = input.now || Date.now();
  const session = crypto.randomBytes(32).toString("hex");
  const at = new Date(now).toISOString();
  await store.set("url_review_sessions", hashOf(session), {
    email: input.email,
    provider: input.provider,
    uid: String(input.uid || ""),
    deviceHash: input.deviceHash,
    createdAt: at,
    lastSeenAt: at,
    expiresAt: new Date(now + SESSION_MS).toISOString(),
    expireAt: new Date(now + SESSION_MS)
  });
  const account = await store.get("url_review_accounts", input.email);
  const providers = ((account && account.providers) || []).filter((item) => item !== input.provider).concat(input.provider);
  const profile = Object.assign({}, (account && account.profile) || {}, input.profile || {});
  await store.set("url_review_accounts", input.email, {
    email: input.email,
    providers,
    profile,
    createdAt: (account && account.createdAt) || at,
    lastSignInAt: at,
    retainUntil: new Date(now + ACCOUNT_MS).toISOString(),
    expireAt: new Date(now + ACCOUNT_MS),
    plan: (account && account.plan) || null
  });
  return { ok: true, session, email: input.email, provider: input.provider, name: profile.name || "", picture: profile.picture || "" };
}

async function checkSession(store, input) {
  const now = input.now || Date.now();
  const session = String(input.session || "").replace(/[^a-f0-9]/g, "");
  if (session.length !== 64) return fail(401, "Sign in to run a review.", { signIn: true });
  const id = hashOf(session);
  const row = await store.get("url_review_sessions", id);
  if (!row || Date.parse(row.expiresAt) < now) return fail(401, "Your sign-in has expired. Sign in again to run a review.", { signIn: true });
  if (!sameHash(deviceHash(input.deviceKey), row.deviceHash)) {
    return fail(401, "This sign-in belongs to another device. Sign in on this one to run a review here.", { signIn: true });
  }
  if (input.touch !== false) await store.set("url_review_sessions", id, { lastSeenAt: new Date(now).toISOString() });
  return { ok: true, email: row.email, provider: row.provider, uid: row.uid || "" };
}

function cleanRunId(runId) {
  return String(runId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
}

function ownsRun(row, email, device) {
  return !!row && row.email === email && sameHash(row.deviceHash, device);
}

// A run's stop row names the email and device that started it; only that pair can stop it.
async function claimRun(store, input) {
  const now = input.now || Date.now();
  const runId = cleanRunId(input.runId);
  if (!runId) return { ok: true, runId: "" };
  const device = deviceHash(input.deviceKey);
  const row = await store.get("url_review_stops", runId);
  if (row && !ownsRun(row, input.email, device)) return fail(409, "That run id is already in use. Start the review again.");
  await store.replace("url_review_stops", runId, {
    email: input.email,
    deviceHash: device,
    stopped: false,
    at: new Date(now).toISOString(),
    expireAt: new Date(now + RUN_MS)
  });
  return { ok: true, runId };
}

async function stopRun(store, input) {
  const signedIn = await checkSession(store, Object.assign({}, input, { touch: false }));
  if (!signedIn.ok) return signedIn;
  const runId = cleanRunId(input.runId);
  const row = runId ? await store.get("url_review_stops", runId) : null;
  if (!ownsRun(row, signedIn.email, deviceHash(input.deviceKey))) return fail(404, "No review started on this device is running under that id.");
  await store.set("url_review_stops", runId, { stopped: true, stoppedAt: new Date(input.now || Date.now()).toISOString() });
  return { ok: true };
}

// Ask the report opens for the account that ran the report, once that report is paid or free.
async function askAccess(store, input, row, free) {
  const signedIn = await checkSession(store, Object.assign({}, input, { touch: false }));
  if (!signedIn.ok) return signedIn;
  if (!row || !row.report || row.report.preview) return fail(404, "That report was not found.");
  if (!row.email || row.email !== signedIn.email) return fail(403, "Only the account that ran this report can ask it.");
  if (row.paid !== true && free !== true) return fail(402, "Ask the report opens once this report is paid.");
  return { ok: true, email: signedIn.email };
}

async function closeSession(store, session) {
  const clean = String(session || "").replace(/[^a-f0-9]/g, "");
  if (clean.length === 64) await store.remove("url_review_sessions", hashOf(clean));
}

// A provider sign-in also leaves a Firebase Auth user under the same email; it
// goes with the account. Bounded, in case the project allows several per email.
async function dropAuthUsers(authApi, email) {
  const key = cleanEmail(email);
  let dropped = 0;
  while (key && dropped < 10) {
    let user = null;
    try {
      user = await authApi.getUserByEmail(key);
    } catch (error) {
      if (error && error.code === "auth/user-not-found") break;
      throw error;
    }
    await authApi.deleteUser(user.uid);
    dropped += 1;
  }
  return dropped;
}

// For the local server, which has no Admin SDK credentials: Identity Toolkit
// answers with the user the ID token belongs to, or an error if it is not valid.
function lookupIdToken(apiKey) {
  return async (idToken) => {
    const res = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(10000)
    });
    const body = await res.json();
    const user = body && body.users && body.users[0];
    if (!res.ok || !user) throw new Error("The sign-in token was not accepted.");
    const linked = (user.providerUserInfo || [])[0] || {};
    const identities = linked.providerId && linked.rawId ? { [linked.providerId]: [linked.rawId] } : {};
    return { uid: user.localId, email: user.email || linked.email, email_verified: user.emailVerified === true, firebase: { sign_in_provider: linked.providerId || "", identities } };
  };
}

module.exports = {
  PROVIDERS,
  CODE_MS,
  SESSION_MS,
  ACCOUNT_MS,
  MAX_TRIES,
  OTHER_DEVICE,
  sameHash,
  deviceHash,
  cleanEmail,
  maskEmail,
  enabledProviders,
  profileFrom,
  firestoreStore,
  memoryStore,
  startEmail,
  finishEmail,
  providerSignIn,
  openSession,
  checkSession,
  claimRun,
  stopRun,
  askAccess,
  closeSession,
  dropAuthUsers,
  lookupIdToken
};
