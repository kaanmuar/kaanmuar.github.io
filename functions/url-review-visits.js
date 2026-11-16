/* Visits of signed-in URL Review people (#1976). A review page with a session in its browser notes a view, then a
   beat every 30 s while the tab is visible, a hide when it goes out of sight and a show when it comes back.
   Time on site is the gap before a beat or a hide, capped, so a tab left in the background counts nothing.
   A visit ends after 30 minutes without a ping; the next ping opens a new one, which is a return.
   Nobody without a sign-in is recorded here. Rows go after 12 months, or with the account. */
const crypto = require("crypto");
const reviewAuth = require("./url-review-auth");

const COLLECTION = "url_review_visits";
const GAP_MS = 30 * 60 * 1000;
const BEAT_MS = 30 * 1000;
const STEP_MS = 45 * 1000;
const KEEP_MS = 365 * 24 * 60 * 60 * 1000;
const PAGES = 30;
const KINDS = new Set(["view", "beat", "hide", "show"]);
const TIMED = new Set(["beat", "hide"]);

function cleanPage(page) {
  const name = String(page || "").split(/[?#]/)[0].split("/").pop();
  return /^qa-review(?:-[a-z]{2,8})*\.html$/.test(name) ? name : "";
}

function cleanLang(lang) {
  const value = String(lang || "").slice(0, 12);
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(value) ? value : "";
}

async function note(store, input) {
  const now = input.now || Date.now();
  const kind = KINDS.has(input.kind) ? input.kind : "view";
  const signedIn = await reviewAuth.checkSession(store, Object.assign({}, input, { touch: false, now }));
  if (!signedIn.ok) return signedIn;
  const session = (await store.get("url_review_sessions", signedIn.sessionId)) || {};
  const at = new Date(now).toISOString();
  const page = cleanPage(input.page);
  const last = Date.parse(session.visitAt || "");
  const open = !!session.visitId && Number.isFinite(last) && now - last < GAP_MS
    ? await store.get(COLLECTION, session.visitId)
    : null;
  let visitId = session.visitId;
  if (open && open.email === signedIn.email) {
    const pages = (open.pages || []).slice();
    if (page && !pages.includes(page) && pages.length < PAGES) pages.push(page);
    await store.set(COLLECTION, visitId, {
      lastAt: at,
      activeMs: (Number(open.activeMs) || 0) + (TIMED.has(kind) ? Math.max(0, Math.min(now - last, STEP_MS)) : 0),
      views: (Number(open.views) || 0) + (kind === "view" ? 1 : 0),
      pages
    });
  } else {
    visitId = crypto.randomBytes(10).toString("hex");
    await store.set(COLLECTION, visitId, {
      email: signedIn.email,
      startedAt: at,
      lastAt: at,
      activeMs: 0,
      views: kind === "view" ? 1 : 0,
      pages: page ? [page] : [],
      entry: page,
      lang: cleanLang(input.lang),
      screen: input.screen === "phone" ? "phone" : "desktop",
      expireAt: new Date(now + KEEP_MS)
    });
  }
  await store.set("url_review_sessions", signedIn.sessionId, { visitId, visitAt: at, lastSeenAt: at });
  return { ok: true, visitId, fresh: !(open && open.email === signedIn.email) };
}

module.exports = { COLLECTION, GAP_MS, BEAT_MS, STEP_MS, KEEP_MS, cleanPage, note };
