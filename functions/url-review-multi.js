/**
 * Many reviews of one account side by side, saved as their own comparison: a summary table of the scores
 * and indicators, then the full report of every URL. A report the account has not opened in full is sent
 * the way its shared link shows it, under the frost, and the comparison counts as paid only when every
 * report in it is open.
 */
const compare = require("./url-review-compare");
const core = require("./url-review-core");

const MULTI_MAX = 6;
const LISTED_MAX = 40;
const PDF_HTML_MAX = 6000000;

// Firestore ids of saved comparisons are letters and digits; review ids are hex.
function docId(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

function address(email) {
  return String(email || "").trim().toLowerCase();
}

function ownedBy(row, email) {
  return !!row && address(row.email) === address(email) && !!address(email);
}

function stopped(row) {
  return row.status === "stopped" || (row.report && row.report.status === "stopped");
}

function wantedIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(compare.cleanId).filter(Boolean))];
}

// The reviews to save as one comparison, in the order picked: the first is the asker's own site.
function pickProblem(records, email, ids) {
  const wanted = wantedIds(ids);
  if (wanted.length < 2) return { error: "Pick at least two of your reviews to compare." };
  if (wanted.length > MULTI_MAX) return { error: "Compare up to " + MULTI_MAX + " reviews at a time." };
  const mine = new Map((records || []).filter((row) => ownedBy(row, email)).map((row) => [compare.cleanId(row.id), row]));
  for (const id of wanted) {
    const row = mine.get(id);
    if (!row || !row.report) return { error: "One of those reviews is not saved under this account." };
    const host = row.report.host || "a site";
    if (stopped(row)) return { error: "The review of " + host + " stopped early. Compare finished reviews." };
    if (!row.report.insights || !row.report.insights.score) return { error: "The review of " + host + " is not saved with scores, so there is nothing to compare." };
  }
  return { ids: wanted, hosts: wanted.map((id) => mine.get(id).report.host || "") };
}

function savedRecord(email, picked, from, now) {
  return {
    email: address(email),
    ids: picked.ids,
    hosts: picked.hosts,
    from: from === "review" ? "review" : "account",
    createdAt: new Date(now || Date.now()).toISOString()
  };
}

function listLine(id, doc) {
  return {
    id: docId(id),
    at: String(doc.createdAt || ""),
    from: doc.from || "account",
    ids: (doc.ids || []).map(compare.cleanId),
    hosts: (doc.hosts || []).map(String)
  };
}

// The account's saved comparisons, newest first.
function listOf(docs, email) {
  return (docs || [])
    .filter((doc) => ownedBy(doc, email))
    .map((doc) => listLine(doc.id, doc))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, LISTED_MAX);
}

function areaScore(report, name) {
  const area = (((report.insights || {}).score || {}).areas || {})[name];
  return area && typeof area.score === "number" ? area.score : null;
}

// One line per indicator: each column's value and which columns lead it. A line with fewer than two
// values, or where every column is level, has no leader.
function summaryOf(columns) {
  const scored = columns.map((col) => (col.report && col.report.insights && col.report.insights.score ? col.report : null));
  const lines = [{ key: "overall", label: "Health score", unit: "/100", better: "high", kind: "score", read: (r) => r.insights.score.overall }]
    .concat(compare.AREAS.map((name) => ({ key: "area:" + name, area: name, label: name, unit: "/100", better: "high", kind: "score", read: (r) => areaScore(r, name) })))
    .concat(compare.KPIS.filter((kpi) => kpi.key !== "overall").map((kpi) => ({ key: kpi.key, label: kpi.label, unit: kpi.unit, better: kpi.better, kind: "kpi", close: kpi.close, read: kpi.read })));
  const rows = lines.map((line) => {
    const values = scored.map((report) => {
      if (!report) return null;
      const value = line.read(report);
      return typeof value === "number" && isFinite(value) ? value : null;
    });
    const known = values.filter((value) => value != null);
    const top = known.length > 1 ? (line.better === "high" ? Math.max(...known) : Math.min(...known)) : null;
    const leads = top == null || known.every((value) => value === top) ? [] : values.map((value, index) => (value === top ? index : -1)).filter((index) => index !== -1);
    return { key: line.key, label: line.label, area: line.area || "", unit: line.unit, better: line.better, kind: line.kind, values, leads };
  }).filter((row) => row.values.some((value) => value != null));
  const wins = columns.map((col, index) => rows.filter((row) => row.key !== "overall" && row.leads.length === 1 && row.leads[0] === index).length);
  return { rows, wins };
}

// What the comparison page draws. isOpen(row) says whether the account reads that report in full.
function payloadOf(id, doc, records, isOpen) {
  const mine = new Map((records || []).filter((row) => ownedBy(row, doc.email)).map((row) => [compare.cleanId(row.id), row]));
  const columns = (doc.ids || []).map((reviewId, index) => {
    const clean = compare.cleanId(reviewId);
    const row = mine.get(clean);
    const host = (doc.hosts || [])[index] || "";
    if (!row || !row.report) return { id: clean, host, missing: true, paid: true };
    const open = !!isOpen(row);
    return {
      id: clean,
      host: row.report.host || host,
      at: String(row.createdAt || row.report.fetchedAt || ""),
      paid: open,
      frameworks: row.frameworks || [],
      report: open ? Object.assign({}, row.report, { id: clean }) : Object.assign(core.previewReport(row.report), { id: clean })
    };
  });
  const present = columns.filter((col) => !col.missing);
  return {
    id: docId(id),
    at: String(doc.createdAt || ""),
    from: doc.from || "account",
    paid: present.length > 0 && present.every((col) => col.paid),
    locked: present.filter((col) => !col.paid).map((col) => ({ id: col.id, host: col.host, frameworks: col.frameworks })),
    columns,
    summary: summaryOf(columns)
  };
}

// The page sends the comparison as it is drawn; the PDF is printed from it with no script and no network.
function pdfProblem(made, html) {
  if (!made || made.error) return (made && made.error) || "That comparison was not found.";
  if (!made.paid) return "Every report in this comparison must be paid to download it as a PDF.";
  const text = String(html || "");
  if (!text || text.length > PDF_HTML_MAX) return "The comparison is too large to print. Print it from the page instead.";
  return "";
}

function pdfName(made) {
  const hosts = made.columns.filter((col) => !col.missing).map((col) => col.host.replace(/[^a-z0-9.-]/gi, "")).slice(0, 3);
  return "qa-review-comparison-" + (hosts.join("-vs-") || made.id) + "-" + String(made.at || "").slice(0, 10) + ".pdf";
}

module.exports = { MULTI_MAX, LISTED_MAX, PDF_HTML_MAX, docId, pickProblem, savedRecord, listOf, summaryOf, payloadOf, pdfProblem, pdfName };
