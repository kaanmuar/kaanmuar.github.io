/**
 * The fix-request routes of reviewUrl (#3082): the packages the report page shows, the request a report's
 * owner sends, and the desk's status change. Firestore, sign-in and mail come in `deps`, so tests run them in memory.
 *
 * deps: { db, access(body, row) -> { ok, email } | { ok: false, status, error, code }, mailOwner(notice),
 *         paidAccess(body, row), mailCustomer(lang, email, mail, category), deskUrl }
 */
const fixOffers = require("./url-review-fix-offers");
const fixMail = require("./url-review-fix-mail");
const fixRereview = require("./url-review-fix-rereview");

const cleanId = (value, pattern, max) => String(value || "").replace(pattern, "").slice(0, max);

function fail(res, status, error, extra) {
  res.status(status).json(Object.assign({ error }, extra || {}));
}

async function reportRow(db, id) {
  const snap = id ? await db.collection("url_reviews").doc(id).get() : null;
  const row = snap && snap.exists ? Object.assign({}, snap.data()) : null;
  if (row && row.report && !row.report.id) row.report = Object.assign({ id }, row.report);
  return row;
}

async function sendRequest(req, res, deps) {
  const body = req.body || {};
  const row = await reportRow(deps.db, cleanId(body.id, /[^a-f0-9]/g, 32));
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
  res.status(200).json({ ok: true, id: ref.id, email: record.email, status: record.status, package: record.package, priceUsd: record.priceUsd || 0 });
}

// One free re-check per paid report; the doc id makes a second ask fail instead of running again.
async function sendRecheck(req, res, deps) {
  const body = req.body || {};
  const id = cleanId(body.id, /[^a-f0-9]/g, 32);
  const row = await reportRow(deps.db, id);
  const access = await deps.paidAccess(body, row);
  if (!access.ok) return fail(res, access.status, access.error, { code: access.code || "", signIn: !!access.signIn });
  const record = fixRereview.selfRecord(row, access.email, body.lang, Date.now());
  if (record.error) return fail(res, 400, record.error, { code: "invalid" });
  const ref = deps.db.collection(fixOffers.COLLECTION).doc("self-" + id);
  try {
    await ref.create(record);
  } catch (error) {
    if (error && (error.code === 6 || /already exists/i.test(String(error.message)))) return fail(res, 409, "The free re-check of this report was already used.", { code: "used" });
    throw error;
  }
  res.status(200).json({ ok: true, id: ref.id, email: record.email, status: record.status });
}

/** The client routes; true when the path was one of them. */
async function route(req, res, pathName, deps) {
  if (pathName.endsWith("/review/fix/offers") && req.method === "GET") {
    // The cache never outlives the launch price, so the cards switch to list prices when checkout does.
    const left = Math.floor((Date.parse(fixOffers.LAUNCH.endsAt) - Date.now()) / 1000);
    res.set("Cache-Control", "public, max-age=" + (left > 0 ? Math.min(600, left) : 600));
    res.status(200).json({ packages: fixOffers.publicPackages() });
    return true;
  }
  if (pathName.endsWith("/review/fix/request") && req.method === "POST") {
    await sendRequest(req, res, deps);
    return true;
  }
  if (pathName.endsWith("/review/fix/recheck") && req.method === "POST") {
    await sendRecheck(req, res, deps);
    return true;
  }
  return false;
}

async function deskRows(db) {
  const snap = await db.collection(fixOffers.COLLECTION).orderBy("createdAt", "desc").limit(100).get();
  return fixOffers.deskOrder(snap.docs.map((doc) => fixOffers.deskRow(doc.id, doc.data())));
}

/** POST /desk/fix from the desk: { id, status, quoteUsd, payUrl, note, rereview }. Marking a fix done queues its re-review. */
async function deskUpdate(req, res, operator, deps) {
  const body = req.body || {};
  const id = cleanId(body.id, /[^A-Za-z0-9]/g, 40);
  const ref = id ? deps.db.collection(fixOffers.COLLECTION).doc(id) : null;
  const snap = ref ? await ref.get() : null;
  if (!snap || !snap.exists) return fail(res, 404, "That fix request is not saved.");
  const before = snap.data() || {};
  const patch = fixOffers.statusPatch(before, body, operator, Date.now());
  if (patch.error) return fail(res, 400, patch.error);
  Object.assign(patch, fixRereview.queuePatch(before, patch, body, Date.now()));
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
