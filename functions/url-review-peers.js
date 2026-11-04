/**
 * Peer groups (#2363): 2 to 6 natural competitors in one sector and place (hotels in Cartagena, clinics in Porto),
 * each reviewed by the nightly sweep, then sent the same comparison by the outreach Action (scripts/peer-groups.js).
 * Firestore url_review_peer_groups/<id>: { sector, place, cc, lang, hosts: [], ids: [review ids], tokens: { token: host }, createdAt }.
 * Each recipient's link carries its own token, so the page knows whose column is "yours". Every column shows its
 * findings in the open; the cases past the top one stay frosted (they are what a paid report adds), and the other
 * peers' security details (alerts, headers, mail records, exposed responses, security findings) are left out, so no
 * one's gaps reach a rival. Their security score stays.
 */
const compare = require("./url-review-compare");
const core = require("./url-review-core");
const multi = require("./url-review-multi");

const COLLECTION = "url_review_peer_groups";
const PEERS_MIN = 2;
const PEERS_MAX = multi.MULTI_MAX;
const CASE_KEYS = ["steps", "expected", "script", "scripts", "data", "selectors", "check"];

function token(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

function frostCase(item) {
  const out = Object.assign({}, item, { title: core.frostText(item.title), why: core.frostText(item.why) });
  delete out.msg;
  CASE_KEYS.forEach((key) => { delete out[key]; });
  return out;
}

function isSecurity(item) {
  return /^security$/i.test(String((item && (item.area || item.layer)) || ""));
}

// One column of the peer comparison. own: the recipient's site, which keeps its security section.
function peerReport(report, own) {
  const copy = JSON.parse(JSON.stringify(report || {}));
  const cases = copy.cases || [];
  const top = cases.shift();
  copy.cases = (top && (own || !isSecurity(top)) ? [Object.assign(top, { sample: true })] : [])
    .concat(cases.filter((item) => own || !isSecurity(item)).map(frostCase));
  delete copy.compare;
  delete copy.contacts;
  delete copy.log;
  const ins = copy.insights || {};
  if (ins.fixkit) {
    const kit = ins.fixkit;
    ins.fixkit = own ? {
      hosting: kit.hosting || "",
      headers: (kit.headers || []).map((row) => ({ name: row && row.name, missing: !!(row && row.missing) })),
      dns: (kit.dns || []).map((row) => ({ type: row && row.type })),
      jsonLd: !!kit.jsonLd, llmsTxt: !!kit.llmsTxt, securityTxt: !!kit.securityTxt
    } : { hosting: kit.hosting || "", jsonLd: !!kit.jsonLd, llmsTxt: !!kit.llmsTxt };
  }
  if (!own) {
    copy.alerts = [];
    delete copy.observed;
    delete ins.security;
    ins.findings = (ins.findings || []).filter((item) => !isSecurity(item));
  }
  copy.peerView = own ? "own" : "peer";
  return copy;
}

// The benchmark (js/qa-review-benchmark.js) reads every "you" line from the first column, so each reader's copy puts
// their own site first and keeps the others in group order.
function readerFirst(doc, viewer) {
  const pairs = (doc.ids || []).map((reviewId, index) => ({ reviewId, host: (doc.hosts || [])[index] || "" }));
  const at = pairs.findIndex((pair) => compare.sameSite(pair.host, viewer));
  return at > 0 ? [pairs[at]].concat(pairs.slice(0, at), pairs.slice(at + 1)) : pairs;
}

// rows: url_reviews records by review id. viewer: the host the token names, or "" for a token that names none.
function payloadOf(id, doc, rows, viewer) {
  const byId = rows || {};
  const columns = readerFirst(doc, viewer).map(({ reviewId, host }) => {
    const clean = compare.cleanId(reviewId);
    const row = byId[clean];
    if (!row || !row.report) return { id: clean, host, missing: true, paid: true };
    const own = compare.sameSite(row.report.host || host, viewer);
    return Object.assign({
      id: clean,
      host: row.report.host || host,
      at: String(row.createdAt || row.report.fetchedAt || ""),
      paid: true,
      own,
      frameworks: row.frameworks || [],
      report: Object.assign(peerReport(row.report, own), { id: clean })
    }, multi.faceOf(row.report, row.report.host || host));
  });
  return {
    id: multi.docId(id),
    at: String(doc.createdAt || ""),
    from: "peers",
    peers: { sector: String(doc.sector || ""), place: String(doc.place || ""), phrase: phrases(doc.phrase), viewer },
    paid: true,
    locked: [],
    columns,
    summary: multi.summaryOf(columns)
  };
}

// The group's name in each reader's language, such as "hotels in Bogotá, Colombia" or "airlines worldwide".
function phrases(value) {
  const out = {};
  Object.keys(value && typeof value === "object" ? value : {}).forEach((lang) => {
    if (/^[a-z]{2}$/.test(lang) && typeof value[lang] === "string") out[lang] = value[lang].slice(0, 160);
  });
  return out;
}

function viewerOf(doc, given) {
  const key = token(given);
  return key && doc && doc.tokens && Object.prototype.hasOwnProperty.call(doc.tokens, key) ? String(doc.tokens[key]) : "";
}

module.exports = { COLLECTION, PEERS_MIN, PEERS_MAX, token, peerReport, payloadOf, viewerOf };
