"use strict";
/*
 * Retention (#3823): deletes what has outlived its period, so the Retention paragraphs of qa-review-legal.html are true.
 *
 *   outreach_people   12 months after its last contact (the latest thread, DM, offer, history entry, next step or update).
 *                     A person who declined or is blocked keeps a stub only: address, handle, domain, network, stage.
 *                     That stub is the do-not-contact record, so nobody is written to after asking not to be.
 *   engagement_posts  12 months after the latest of seenAt, decidedAt, postedAt, updatedAt.
 *   messages          24 months after createdAt (contact-form and CV messages).
 *   ratings           24 months after createdAt.
 *   bookings          24 months after the latest of createdAt, start and end (the call and its follow-up).
 *   url_review_fix_requests  12 months after the last change, unless paid: a paid request is kept with its payment
 *                     record for the tax period (not deleted automatically yet).
 *
 * A row with no readable date is kept and counted as "undated". sweep() is a dry run unless apply is true; the
 * scheduled job (functions/index.js, retentionSweep) applies only when RETENTION_APPLY=on. Each run writes its counts,
 * never a person's name or text, to retention_runs/<time>.
 */

const STOPPED = ["declined", "blocked"];
const STUB_FIELDS = ["id", "kind", "network", "handle", "domain", "email", "stage"];
const PAGE = 300; // documents read per page; a page's deletes fit one batch (limit 500)
const MAX_WRITES = 5000; // deletes or stubs per run; the rest wait for the next run

const toMs = (v) => {
  if (v == null || v === "") return NaN;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return Date.parse(String(v));
};

/** The latest readable date among values, or NaN. */
function latest(values) {
  const ms = values.map(toMs).filter(Number.isFinite);
  return ms.length ? Math.max(...ms) : NaN;
}

/** `ms` plus whole months, in UTC. */
function addMonths(ms, months) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

const entries = (list, key) => (Array.isArray(list) ? list : []).map((x) => (x && typeof x === "object" ? x[key] : null));

/** Every date that counts as contact with a person in the ledger. */
function personDates(d) {
  return [d.updatedAt, d.createdAt, d.nextAt]
    .concat(entries(d.threads, "lastAt"), entries(d.dms, "at"), entries(d.offers, "at"), entries(d.history, "at"));
}

const POLICY = [
  { collection: "outreach_people", months: 12, dates: personDates, stopped: true },
  { collection: "engagement_posts", months: 12, dates: (d) => [d.seenAt, d.decidedAt, d.postedAt, d.updatedAt] },
  { collection: "messages", months: 24, dates: (d) => [d.createdAt] },
  { collection: "ratings", months: 24, dates: (d) => [d.createdAt] },
  { collection: "bookings", months: 24, dates: (d) => [d.createdAt, d.start, d.end] },
  { collection: "url_review_fix_requests", months: 12, dates: (d) => [d.createdAt, d.updatedAt], keep: (d) => !!(d.paid || d.paidAt) }
];

/** What happens to one document: keep, delete, trim (stop-list stub), or undated (kept). */
function decide(policy, data, now) {
  if (policy.stopped && data.trimmed) return "keep";
  if (policy.keep && policy.keep(data)) return "keep";
  const at = latest(policy.dates(data));
  if (!Number.isFinite(at)) return "undated";
  if (addMonths(at, policy.months) > now) return "keep";
  return policy.stopped && STOPPED.includes(data.stage) ? "trim" : "delete";
}

/** The stop-list stub kept in place of a declined or blocked person's row. */
function stubOf(data, now) {
  const stub = { trimmed: true, trimmedAt: new Date(now).toISOString() };
  STUB_FIELDS.forEach((k) => {
    if (data[k] != null && data[k] !== "") stub[k] = data[k];
  });
  return stub;
}

/**
 * Walks every policy collection and plans (or, with apply, makes) the deletes and stubs. Returns counts per
 * collection: seen, keep, delete, trim, undated, deferred (over the per-run cap).
 */
async function sweep(db, { now = Date.now(), apply = false, maxWrites = MAX_WRITES } = {}) {
  const report = { at: new Date(now).toISOString(), apply: apply === true, writes: 0, collections: {} };
  for (const policy of POLICY) {
    const counts = { seen: 0, keep: 0, delete: 0, trim: 0, undated: 0, deferred: 0 };
    let last = null;
    for (;;) {
      let query = db.collection(policy.collection).orderBy("__name__").limit(PAGE);
      if (last) query = query.startAfter(last);
      const snap = await query.get();
      if (snap.empty) break;
      const batch = db.batch();
      let staged = 0;
      for (const doc of snap.docs) {
        counts.seen++;
        const data = doc.data();
        const verdict = decide(policy, data, now);
        if (verdict === "delete" || verdict === "trim") {
          if (report.writes >= maxWrites) {
            counts.deferred++;
            continue;
          }
          report.writes++;
          counts[verdict]++;
          if (apply) {
            if (verdict === "delete") batch.delete(doc.ref);
            else batch.set(doc.ref, stubOf(data, now));
            staged++;
          }
        } else {
          counts[verdict]++;
        }
      }
      if (apply && staged) await batch.commit();
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE) break;
    }
    report.collections[policy.collection] = counts;
  }
  await db.collection("retention_runs").doc(report.at).set(report);
  return report;
}

module.exports = { POLICY, STOPPED, decide, stubOf, latest, addMonths, sweep, MAX_WRITES };
