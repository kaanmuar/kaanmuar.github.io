/**
 * A fix package paid through the review checkout: who may pay for a request, its price from the package table,
 * the payment row, and what the payment changes on the request. Custom quotes are not paid here; the desk sends their pay link.
 */
const fixOffers = require("./url-review-fix-offers");
const reviewOffers = require("./url-review-offers");

const PAYABLE = ["new", "quoted"];

function cleanId(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

function refused(status, error, extra) {
  return Object.assign({ ok: false, status, error }, extra || {});
}

/** Whether the signed-in address may pay for this request now, and the package it pays for. */
function payable(row, email, reportId) {
  if (!row) return refused(404, "That fix request was not found. No charge was made.");
  if (!email) return refused(401, "Sign in with the address on the report to pay for the fix. No charge was made.", { signIn: true });
  if (String(row.email || "").toLowerCase() !== String(email).toLowerCase()) return refused(403, "Only the address that asked for this fix can pay for it. No charge was made.");
  if (reportId && row.reportId !== reportId) return refused(400, "That fix request belongs to another report. No charge was made.");
  if (row.paidAt) return refused(409, "This fix is already paid. No charge was made.");
  if (PAYABLE.indexOf(row.status) === -1) return refused(409, "This fix request is past payment. No charge was made.");
  const pkg = fixOffers.packageById(row.package);
  if (!pkg) return refused(400, "This request asks for a quote, not a package. The price comes by email. No charge was made.");
  return { ok: true, package: pkg.id, usd: pkg.usd, host: row.host || "", reportId: row.reportId || "" };
}

/** The pay page's figures for one package, with its name in every language. */
function quote(packageId) {
  const pkg = fixOffers.packageById(packageId);
  return pkg ? { usd: pkg.usd, count: 1, fixPackage: { id: pkg.id, days: pkg.days, name: pkg.name } } : null;
}

/** The request after its payment: accepted, with the payment on it. Null when it was already paid. */
function paidPatch(row, payment, now) {
  if (!row || row.paidAt) return null;
  const at = new Date(now || Date.now()).toISOString();
  return {
    status: "accepted",
    paidAt: at,
    paid: { reference: payment.reference || "", priceUsd: Number(payment.priceUsd) || 0, provider: payment.provider || "", test: !!payment.test },
    updatedAt: at,
    history: (row.history || []).concat([{ status: "accepted", at, by: "payment" }]).slice(-20)
  };
}

/** The payment row kept with the other add-on payments, so refunds and the revenue count see it. */
function paymentRow(row, open, payment) {
  return reviewOffers.addonPayment({ email: row && row.email }, Object.assign({
    purpose: "fix",
    fixId: cleanId(open.fixId),
    fixPackage: String(open.fixPackage || ""),
    reportId: String(open.reportId || ""),
    host: (row && row.host) || ""
  }, payment));
}

function paidNotice(row, payment, deskUrl) {
  const pkg = fixOffers.packageById(row.package);
  const name = pkg ? pkg.name.en : row.package;
  return {
    subject: "Fix paid: " + name + " for " + (row.host || "a report") + " (US$" + (Number(payment.priceUsd) || 0) + ")" + (payment.test ? " [test]" : ""),
    intro: (row.name || row.email) + " paid for the " + name + " package. Start the work; mark it done on the desk to run the free re-review.",
    rows: [
      { label: "From", value: row.name ? row.name + " (" + row.email + ")" : row.email },
      { label: "Site", value: row.host },
      { label: "Report", value: fixOffers.reportUrl(row) },
      { label: "Package", value: pkg ? name + ", about " + pkg.days + " working days" : name },
      { label: "Paid", value: "US$" + (Number(payment.priceUsd) || 0) + " via " + (payment.provider || "PayPal") },
      { label: "Reference", value: payment.reference || "" },
      { label: "Deadline", value: row.deadline || "" }
    ],
    body: row.access ? "Access notes:\n" + row.access : "",
    respondUrl: deskUrl,
    buttonLabel: "Open the review desk"
  };
}

/** Writes the payment row, accepts the request once, and tells the owner. Returns the payment row. */
async function recordPayment(db, open, payment, deps) {
  const ref = db.collection(fixOffers.COLLECTION).doc(cleanId(open.fixId) || "-");
  let row = null;
  let accepted = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    row = snap.exists ? snap.data() : null;
    const patch = paidPatch(row, payment, payment.createdAt);
    if (!patch) return;
    tx.update(ref, patch);
    accepted = true;
  });
  const addon = paymentRow(row, open, payment);
  await db.collection("url_reviews").doc("paid-fix-" + String(payment.reference || payment.sessionId).replace(/[^A-Za-z0-9-]/g, "").slice(0, 64)).set(addon);
  if (accepted && deps && deps.mailOwner) {
    await deps.mailOwner(paidNotice(row, payment, deps.deskUrl)).catch((error) => console.error("Fix payment notice failed:", error));
  }
  return addon;
}

module.exports = { PAYABLE, cleanId, payable, quote, paidPatch, paymentRow, paidNotice, recordPayment };
