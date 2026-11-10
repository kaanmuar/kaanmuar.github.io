/**
 * The fix-request routes of reviewUrl (#3082): the packages the report page shows, the request a report's
 * owner sends, and the desk's status change. Firestore, sign-in and mail come in `deps`, so tests run them in memory.
 *
 * deps: { db, access(body, row) -> { ok, email } | { ok: false, status, error, code }, mailOwner(notice),
 *         mailCustomer(lang, email, mail, category), deskUrl }
 */
const fixOffers = require("./url-review-fix-offers");
const fixMail = require("./url-review-fix-mail");

const cleanId = (value, pattern, max) => String(value || "").replace(pattern, "").slice(0, max);

function fail(res, status, error, extra) {
  res.status(status).json(Object.assign({ error }, extra || {}));
}

async function sendRequest(req, res, deps) {
  const body = req.body || {};
  const id = cleanId(body.id, /[^a-f0-9]/g, 32);
  const snap = id ? await deps.db.collection("url_reviews").doc(id).get() : null;
  const row = snap && snap.exists ? Object.assign({}, snap.data()) : null;
  if (row && row.report && !row.report.id) row.report = Object.assign({ id }, row.report);
  const access = await deps.access(body, row);
  if (!access.ok) return fail(res, access.status, access.error, { code: access.code || "", signIn: !!access.signIn });
  const requests = deps.db.collection(fixOffers.COLLECTION);
  const mine = await requests.where("email", "==", access.email).limit(50).get();
  if (fixOffers.overLimit(mine.docs.map((doc) => doc.data()), Date.now())) return fail(res, 429, "You sent several requests today. Write to qa@carlosandmunoz.com for more.", { code: "limit" });
  const record = fixOffers.requestRecord(body, row, access.email, Date.now());
  if (record.error) return fail(res, 400, record.error, { code: "invalid" });
  const ref = await requests.add(record);
  const mailed = await Promise.allSettled([
    deps.mailOwner(fixOffers.ownerNotice(record, deps.deskUrl)),
    deps.mailCustomer(record.lang, record.email, fixMail.confirmMail(record), "url-review-fix-request")
  ]);
  const failed = mailed.filter((out) => out.status === "rejected").map((out) => String((out.reason && out.reason.message) || out.reason).slice(0, 200));
  if (failed.length) {
    console.error("Fix request mail failed:", failed.join("; "));
    await ref.update({ mailError: failed.join("; ") }).catch(() => {});
  }
  res.status(200).json({ ok: true, id: ref.id, email: record.email, status: record.status });
}

/** The client routes; true when the path was one of them. */
async function route(req, res, pathName, deps) {
  if (pathName.endsWith("/review/fix/offers") && req.method === "GET") {
    res.set("Cache-Control", "public, max-age=600");
    res.status(200).json({ packages: fixOffers.publicPackages() });
    return true;
  }
  if (pathName.endsWith("/review/fix/request") && req.method === "POST") {
    await sendRequest(req, res, deps);
    return true;
  }
  return false;
}

async function deskRows(db) {
  const snap = await db.collection(fixOffers.COLLECTION).orderBy("createdAt", "desc").limit(100).get();
  return fixOffers.deskOrder(snap.docs.map((doc) => fixOffers.deskRow(doc.id, doc.data())));
}

/** POST /desk/fix from the desk: { id, status, quoteUsd, payUrl, note }. */
async function deskUpdate(req, res, operator, deps) {
  const body = req.body || {};
  const id = cleanId(body.id, /[^A-Za-z0-9]/g, 40);
  const ref = id ? deps.db.collection(fixOffers.COLLECTION).doc(id) : null;
  const snap = ref ? await ref.get() : null;
  if (!snap || !snap.exists) return fail(res, 404, "That fix request is not saved.");
  const before = snap.data() || {};
  const patch = fixOffers.statusPatch(before, body, operator, Date.now());
  if (patch.error) return fail(res, 400, patch.error);
  const after = Object.assign({}, before, patch);
  if (fixOffers.quoteMailDue(before, after)) {
    try {
      await deps.mailCustomer(after.lang, after.email, fixMail.quoteMail(after), "url-review-fix-quote");
      patch.quoteMailedAt = patch.updatedAt;
      patch.mailError = "";
    } catch (error) {
      patch.mailError = String((error && error.message) || error).slice(0, 200);
    }
  }
  await ref.update(patch);
  res.status(200).json({ ok: true, request: fixOffers.deskRow(id, Object.assign(after, patch)) });
}

module.exports = { route, deskRows, deskUpdate };
