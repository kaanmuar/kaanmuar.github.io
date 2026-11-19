/* Owner-notice offer when a paid report has critical attack-source findings (#3926).
   The asker clicks on the report; nothing is queued or sent with attack details until then. */

const { say } = require("./url-review-findings-en");
const ownerNotice = require("./url-review-owner-notice");

const ATTACK_KEY = /^sec-(kev|osv|drop|feodo|breach-news|cert-anomaly|targeted)$/;

const SOURCE_BY_KEY = {
  "sec-kev": "CISA KEV",
  "sec-osv": "OSV.dev",
  "sec-drop": "Network DROP",
  "sec-feodo": "Feodo Tracker",
  "sec-breach-news": "GDELT Project",
  "sec-cert-anomaly": "Certificate check",
  "sec-targeted": "Attack and exploit sources"
};

function criticalAttackFindings(report) {
  return ((report && report.insights && report.insights.findings) || []).filter((row) =>
    row && ATTACK_KEY.test(String(row.key || "")) && row.severity === "critical" && row.verdict !== "pass"
  );
}

// Same surface as the paid-only "Was it targeted?" section (#3818).
function showOffer(report, ctx) {
  const opts = ctx || {};
  if (opts.paid !== true || opts.preview || opts.live || opts.sample) return false;
  if (!report || report.preview) return false;
  return criticalAttackFindings(report).length > 0;
}

function attackMailFindings(report) {
  return criticalAttackFindings(report).map((row) => {
    const key = String(row.key || "");
    const fix = String(row.fix || "").trim() || say(key + ".fix");
    return {
      title: String(row.title || "").trim() || key,
      level: String(row.severity || "critical"),
      source: SOURCE_BY_KEY[key] || "",
      fix: fix
    };
  });
}

function refuseReason(record, email) {
  const row = record || {};
  const report = row.report;
  if (!report || !report.host) return "That report was not found.";
  if (!row.paid) return "Only a paid report can send this notice.";
  if (String(row.email || "").trim().toLowerCase() !== String(email || "").trim().toLowerCase()) {
    return "Only the account that ran this review can send the owner notice.";
  }
  if (!showOffer(report, { paid: true })) return "This report has no critical attack-source finding to send.";
  const held = ownerNotice.skipReason(row, {});
  if (held) return held;
  return "";
}

async function sendFromAsker(record, email, deps) {
  const d = deps || {};
  const problem = refuseReason(record, email);
  if (problem) return { error: problem };
  const db = d.db;
  const queue = d.queueOwnerNotice;
  const decide = d.decideOwnerNotice;
  if (!db || !queue || !decide) return { error: "The owner notice is not available right now." };
  const report = record.report;
  const domain = ownerNotice.domainOf(report.host);
  const ref = db.collection("url_review_owner_notices").doc(domain);
  const attackFindings = attackMailFindings(report);
  await queue(record, { search: false });
  await ref.set({
    attackOffer: true,
    attackFindings,
    critical: true,
    attackOfferAt: new Date().toISOString(),
    attackOfferBy: String(email || "").trim().toLowerCase()
  }, { merge: true });
  const out = await decide(domain, true, "", "report:" + String(email || "").trim().toLowerCase());
  if (out.error) return out;
  if (d.markSent && record.id) await d.markSent(record.id);
  return out;
}

function autoSendPaths() {
  return [
    { file: "functions/ops-schedule.js", job: "sendOwnerNotices" }
  ];
}

module.exports = {
  ATTACK_KEY,
  SOURCE_BY_KEY,
  criticalAttackFindings,
  showOffer,
  attackMailFindings,
  refuseReason,
  sendFromAsker,
  autoSendPaths
};