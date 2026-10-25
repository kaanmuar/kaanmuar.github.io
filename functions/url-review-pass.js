/**
 * The Firestore writes behind the 30-day passes: one pass row per paid checkout, and pass runs spent and given back
 * inside transactions. `db` is a Firestore instance; the rules are in url-review-offers.js.
 */
const offers = require("./url-review-offers");

// One pass row per checkout reference, so a replayed webhook or a second confirm writes nothing more.
// `rows` are the payer's passes read before the transaction; the open one is read again inside it.
async function writePass(db, open, payment, rows, now) {
  const col = db.collection("url_reviews");
  const at = now == null ? Date.now() : Number(now);
  const email = String((open && open.email) || "").trim().toLowerCase();
  const ref = col.doc("pass-" + String(payment.reference || payment.sessionId || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64));
  return db.runTransaction(async (tx) => {
    const done = await tx.get(ref);
    if (done.exists) return null;
    const current = offers.passFor(rows, email, at);
    const currentSnap = current ? await tx.get(col.doc(current.id)) : null;
    const fresh = currentSnap && currentSnap.exists ? [Object.assign({ id: current.id }, currentSnap.data())] : [];
    const made = offers.passPurchase(open.plan, fresh, email, at, Object.assign({ priceUsd: open.priceUsd }, payment));
    tx.set(ref, made.row);
    if (made.replaces) tx.update(col.doc(made.replaces), { replacedBy: ref.id, replacedAt: new Date(at).toISOString() });
    return Object.assign({ id: ref.id }, made.row);
  });
}

// Spends one run of the pass, with the extras credit the run asks for, only while the pass is open with a run left;
// parallel runs read and write it in one transaction each, so they cannot overspend it.
async function takePassRun(db, passId, creditId, now) {
  const col = db.collection("url_reviews");
  const at = now == null ? Date.now() : Number(now);
  return db.runTransaction(async (tx) => {
    const passRef = col.doc(passId);
    const creditRef = creditId ? col.doc(creditId) : null;
    const snap = await tx.get(passRef);
    const creditSnap = creditRef ? await tx.get(creditRef) : null;
    const row = snap.exists ? Object.assign({ id: passId }, snap.data()) : null;
    if (!offers.passLive(row, at) || offers.passLeft(row) <= 0) return false;
    if (creditSnap && (!creditSnap.exists || creditSnap.get("usedAt"))) return false;
    const when = new Date(at).toISOString();
    tx.update(passRef, { runs: offers.passRuns(row), runsUsed: (Number(row.runsUsed) || 0) + 1, lastRunAt: when });
    if (creditRef) tx.update(creditRef, { usedAt: when });
    return true;
  });
}

// A pass run that did not start, or failed on this side, gives its run and its extras credit back.
async function giveBackPassRun(db, passId, creditId) {
  const col = db.collection("url_reviews");
  return db.runTransaction(async (tx) => {
    const ref = col.doc(passId);
    const snap = await tx.get(ref);
    if (snap.exists && Number(snap.get("runsUsed")) > 0) tx.update(ref, { runsUsed: Number(snap.get("runsUsed")) - 1 });
    if (creditId) tx.update(col.doc(creditId), { usedAt: "" });
  });
}

module.exports = { writePass, takePassRun, giveBackPassRun };
