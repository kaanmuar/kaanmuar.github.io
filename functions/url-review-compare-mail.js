/**
 * Owner notice when someone compares sites. The rows are the comparison itself:
 * who ran it, the scores and indicators, the problems only one site has, the ones both have,
 * and how present each site is. The layout is owner-mail.js.
 */
const reviewCompare = require("./url-review-compare");
const reviewMulti = require("./url-review-multi");

const PAGE = "https://carlosandmunoz.com/qa-review.html";

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function row(label, value) {
  const text = clip(value, 500);
  return text ? { label, value: text } : null;
}

function keep(rows) {
  return rows.filter(Boolean);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function shown(value, unit) {
  if (typeof value !== "number" || !isFinite(value)) return "–";
  const n = round(value);
  if (unit === "/100" || unit === "%") return n + unit;
  return unit ? n + " " + unit : String(n);
}

function when(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? match[1] + " " + match[2] + " UTC" : clip(value, 40);
}

function who(meta) {
  const email = clip(meta && meta.email, 120);
  const name = clip(meta && meta.name, 80);
  if (name && email) return name + " (" + email + ")";
  return name || email || "Someone";
}

function reportUrl(id) {
  const clean = reviewCompare.cleanId(id);
  return clean ? PAGE + "?report=" + clean : "";
}

function versusUrl(ownId, rivalId) {
  const own = reviewCompare.cleanId(ownId);
  const rival = reviewCompare.cleanId(rivalId);
  return own && rival ? PAGE + "?report=" + own + "&vs=" + rival : "";
}

function comparisonUrl(id) {
  const clean = reviewMulti.docId(id);
  return clean ? PAGE + "?comparison=" + clean : "";
}

function hostsLine(base, hosts) {
  const rest = (hosts || []).map((host) => clip(host, 80)).filter(Boolean);
  if (!rest.length) return clip(base, 80) || "another site";
  if (rest.length === 1) return clip(base, 80) + " with " + rest[0];
  return clip(base, 80) + " with " + rest.slice(0, 3).join(", ") + (rest.length > 3 ? " and " + (rest.length - 3) + " more" : "");
}

function subjectOf(base, hosts, scores) {
  const rest = (hosts || []).map((host) => clip(host, 80)).filter(Boolean);
  const named = rest[0] || "another site";
  const more = rest.length > 1 ? " and " + (rest.length - 1) + " more" : "";
  return (clip(base, 80) || "a site") + " vs " + named + more + (scores || "");
}

function scorePair(cmp) {
  const own = cmp && cmp.overall && cmp.overall.own;
  const rival = cmp && cmp.overall && cmp.overall.rival;
  return typeof own === "number" && typeof rival === "number" ? ", " + own + "–" + rival : "";
}

function gap(own, rival) {
  if (typeof own !== "number" || typeof rival !== "number") return "";
  const diff = round(own - rival);
  return " · gap " + (diff > 0 ? "+" : "") + diff;
}

function sides(cmp, own, rival, unit) {
  return cmp.ownHost + " " + shown(own, unit) + " · " + cmp.rivalHost + " " + shown(rival, unit) + gap(own, rival);
}

function verdict(cmp) {
  const wins = cmp.dominance || {};
  const own = wins.own || 0;
  const rival = wins.rival || 0;
  const tie = wins.tie || 0;
  const decided = own + rival + tie;
  if (!decided) return "";
  const lead = own === rival
    ? "The two sites lead the same number of lines. "
    : (own > rival ? cmp.ownHost : cmp.rivalHost) + " leads " + Math.max(own, rival) + " of " + decided + " decided lines. ";
  return lead + cmp.ownHost + " " + own + ", " + cmp.rivalHost + " " + rival + ", level " + tie + ".";
}

function problemTitle(item) {
  const title = (item.msg && item.msg.title) || item.title || item.key || "Untitled";
  const bits = [item.area, item.severity, item.verdict].filter(Boolean).join(" · ");
  return clip((bits ? bits + " — " : "") + title, 240);
}

function problemRows(items, count) {
  const rows = (items || []).map((item) => row("Problem", problemTitle(item)));
  const more = (Number(count) || 0) - (items || []).length;
  if (more > 0) rows.push(row("And", more + " more"));
  return rows;
}

function marketLine(side) {
  if (!side) return "";
  const rank = side.rank ? "Tranco #" + Number(side.rank).toLocaleString("en-US") : "outside the Tranco top million";
  const change = typeof side.change === "number" ? ", rank change " + (side.change > 0 ? "+" : "") + side.change : "";
  const presence = side.score == null ? "presence not scored" : "presence " + side.score + "/100";
  const signals = (side.signals || [])
    .filter((signal) => signal && signal.value != null && signal.key !== "rank")
    .map((signal) => signal.label + " " + signal.value + (signal.points == null ? "" : " (" + signal.points + " points)"));
  return [presence, rank + change].concat(signals).join(" · ");
}

function trailLine(rows) {
  return (rows || []).map((point) => point.at + " " + point.overall).join(", ");
}

// One pair: the scores, every indicator, the problems, and market presence.
function pairSection(cmp, links) {
  if (!cmp || !cmp.overall) {
    return keep([
      { heading: "Comparison" },
      row("Result", "No scores were saved, so there is nothing to compare.")
    ]);
  }
  const extra = links || {};
  const rows = [{ heading: cmp.ownHost + " vs " + cmp.rivalHost }];
  if (cmp.ownAt) rows.push(row("Base review", when(cmp.ownAt)));
  rows.push(row("Health score", sides(cmp, cmp.overall.own, cmp.overall.rival, "/100")));
  (cmp.areas || []).forEach((area) => {
    const note = area.level ? " · level" : "";
    const open = area.ownOpen == null && area.rivalOpen == null ? "" : " · open problems " + shown(area.ownOpen) + " and " + shown(area.rivalOpen);
    rows.push(row(area.area, sides(cmp, area.own, area.rival, "/100") + note + open));
  });
  (cmp.kpis || []).filter((kpi) => kpi.key !== "overall").forEach((kpi) => {
    const lead = kpi.winner === "tie" ? " · level" : kpi.winner === "own" ? " · leads " + cmp.ownHost : kpi.winner === "rival" ? " · leads " + cmp.rivalHost : "";
    rows.push(row(kpi.label, sides(cmp, kpi.own, kpi.rival, kpi.unit) + lead));
  });
  rows.push(row("Indicators", verdict(cmp)));
  if (cmp.ownOnlyCount) {
    rows.push({ heading: "Problems only " + cmp.ownHost + " has (" + cmp.ownOnlyCount + ")" });
    rows.push.apply(rows, problemRows(cmp.ownOnly, cmp.ownOnlyCount));
  }
  if (cmp.rivalOnlyCount) {
    rows.push({ heading: "Problems only " + cmp.rivalHost + " has (" + cmp.rivalOnlyCount + ")" });
    rows.push.apply(rows, problemRows(cmp.rivalOnly, cmp.rivalOnlyCount));
  }
  if (cmp.shared) {
    rows.push({ heading: "Problems both have (" + cmp.shared + ")" });
    rows.push.apply(rows, problemRows(cmp.sharedList, cmp.shared));
  }
  if (cmp.market) {
    rows.push({ heading: "Market presence" });
    rows.push(row(cmp.ownHost, marketLine(cmp.market.own)));
    rows.push(row(cmp.rivalHost, marketLine(cmp.market.rival)));
    if (cmp.market.share != null) rows.push(row("Share", cmp.ownHost + " holds " + cmp.market.share + "% of the two presence scores"));
  }
  const ownTrail = trailLine(cmp.trail && cmp.trail.own);
  const rivalTrail = trailLine(cmp.trail && cmp.trail.rival);
  if (ownTrail) rows.push(row("Score history, " + cmp.ownHost, ownTrail));
  if (rivalTrail) rows.push(row("Score history, " + cmp.rivalHost, rivalTrail));
  if (cmp.passive) rows.push(row("Checks", "Public checks only. This competitor run does not type into a form or open the chat."));
  rows.push(row("Base report", extra.ownUrl || reportUrl(cmp.ownId)));
  rows.push(row("Competitor report", extra.rivalUrl || reportUrl(extra.rivalId)));
  rows.push(row("Full comparison", extra.versus || versusUrl(cmp.ownId, extra.rivalId)));
  return keep(rows);
}

function personRows(meta) {
  const source = meta || {};
  const place = [source.city, source.region, source.country].filter(Boolean).join(", ");
  const client = [source.clientName, source.clientEmail, source.clientUrl].filter(Boolean).join(" · ");
  return keep([
    row("Account", source.email),
    row("Name", source.name),
    row("Client", client),
    row("Language", source.lang),
    row("Place", place),
    row("Status", source.status),
    row("Report opens in full", source.paid == null ? "" : source.paid ? "Yes" : "No"),
    row("Frameworks", Array.isArray(source.frameworks) ? source.frameworks.join(", ") : ""),
    row("Scope", source.pages || source.depth ? (source.pages || "–") + " pages, " + (source.depth || "–") + " links deep" : ""),
    row("Reason", source.reason),
    row("Started from", source.from),
    row("Compared at", when(source.at))
  ]);
}

function skipReason(item) {
  if (!item) return "That review was not compared.";
  if (item.missing) return "That review is not saved under this account.";
  if (item.same) return "Same site. Its report shows the history between the two reviews.";
  if (item.stopped) return "This review stopped early.";
  if (item.locked) return "This report is not open in full yet.";
  return "No scores were saved, so there is nothing to compare.";
}

// The account page sets saved reviews side by side. One mail covers every site in that comparison.
function accountNotice(made, meta) {
  if (!made || made.error || !made.base) return null;
  const list = Array.isArray(made.list) ? made.list : [];
  if (!list.length) return null;
  const compared = list.filter((item) => item && item.compare);
  const hosts = list.map((item) => item && item.host).filter(Boolean);
  const intro = who(meta) + " compared " + hostsLine(made.base.host, hosts) + ".";
  const rows = personRows(Object.assign({}, meta, { from: "Account page", at: made.base.at }));
  rows.push(row("Base site", made.base.host));
  rows.push(row("Base report", reportUrl(made.base.id)));
  list.forEach((item) => {
    if (item && item.compare) rows.push.apply(rows, pairSection(item.compare, { rivalId: item.id, versus: versusUrl(made.base.id, item.id) }));
    else rows.push({ heading: (item && item.host) || "A review" }, row("Result", skipReason(item)));
  });
  const first = compared[0];
  return {
    subject: "Comparison: " + subjectOf(made.base.host, hosts, compared.length === 1 ? scorePair(first.compare) : ""),
    intro,
    rows: keep(rows),
    respondUrl: first ? versusUrl(made.base.id, first.id) : reportUrl(made.base.id),
    buttonLabel: first ? "Open the comparison" : "Open the base report"
  };
}

// A competitor run stores the comparison on the competitor's report.
function runNotice(record) {
  const report = record && record.report;
  const cmp = report && report.compare;
  if (!cmp || !cmp.overall) return null;
  const rivalId = report.id || record.id;
  const intro = who(record) + " compared " + (cmp.ownHost || "a site") + " with " + (cmp.rivalHost || report.host || "a competitor") + ".";
  const rows = personRows({
    email: record.email,
    name: record.name,
    clientName: record.clientName,
    clientEmail: record.clientEmail,
    clientUrl: record.clientUrl,
    lang: record.lang,
    city: record.city,
    region: record.region,
    country: record.country,
    status: record.status,
    paid: record.paid === true || record.free === true,
    frameworks: record.frameworks,
    pages: record.pages,
    depth: record.depth,
    reason: record.reason,
    from: "A review of " + (cmp.ownHost || "the base site"),
    at: record.createdAt
  });
  rows.push(row("Competitor address", record.requestedUrl || report.finalUrl));
  rows.push.apply(rows, pairSection(cmp, { rivalId, rivalUrl: reportUrl(rivalId) }));
  return {
    subject: "Comparison: " + subjectOf(cmp.ownHost, [cmp.rivalHost || report.host], scorePair(cmp)),
    intro,
    rows: keep(rows),
    respondUrl: versusUrl(cmp.ownId, rivalId),
    buttonLabel: "Open the comparison"
  };
}

function summaryLine(line, hosts) {
  const parts = (line.values || []).map((value, index) => (hosts[index] || "Site " + (index + 1)) + " " + shown(value, line.unit));
  const leaders = (line.leads || []).map((index) => hosts[index]).filter(Boolean);
  const tail = leaders.length === 1 ? " · leads " + leaders[0] : leaders.length > 1 ? " · level" : "";
  return parts.join(" · ") + tail;
}

// A saved full comparison: the summary of every site, then each pair against the first.
function savedNotice(id, doc, records, meta) {
  if (!doc || !Array.isArray(doc.ids) || doc.ids.length < 2) return null;
  const source = meta || {};
  const open = source.open || new Set();
  const full = reviewMulti.payloadOf(id, doc, records, () => true);
  const columns = full.columns || [];
  const hosts = (doc.hosts || []).map(String);
  const names = columns.map((col, index) => col.host || hosts[index] || "");
  const baseRow = (records || []).find((row) => reviewCompare.cleanId(row && row.id) === reviewCompare.cleanId(doc.ids[0]));
  const intro = who({ email: source.email || doc.email, name: baseRow && baseRow.name }) + " saved a comparison of " + names.filter(Boolean).join(", ") + ".";
  const unpaid = columns.filter((col, index) => col.id && !col.missing && !open.has(col.id) && !open.has((doc.ids || [])[index])).map((col) => col.host || col.id);
  const rows = personRows({
    email: source.email || doc.email,
    name: baseRow && baseRow.name,
    from: doc.from === "review" ? "Review page" : "Account page",
    at: doc.createdAt
  });
  rows.push(row("Comparison", comparisonUrl(id)));
  rows.push(row("Reviews", String(doc.ids.length)));
  rows.push(row("Reports not paid", unpaid.join(", ")));
  const summary = full.summary || { rows: [], wins: [] };
  if (summary.rows && summary.rows.length) {
    rows.push({ heading: "Side by side" });
    summary.rows.forEach((line) => rows.push(row(line.label, summaryLine(line, names))));
    if (summary.wins && summary.wins.some((count) => count)) {
      rows.push(row("Indicators won", summary.wins.map((count, index) => (names[index] || "Site " + (index + 1)) + " " + count).join(" · ")));
    }
  }
  const present = columns.filter((col) => col.report && !col.missing);
  const base = present[0];
  present.slice(1).forEach((col) => {
    const cmp = base ? reviewCompare.compareSites(base.report, col.report) : null;
    rows.push.apply(rows, pairSection(cmp, {
      ownUrl: reportUrl(base && base.id),
      rivalId: col.id,
      rivalUrl: reportUrl(col.id),
      versus: versusUrl(base && base.id, col.id)
    }));
  });
  const overall = (summary.rows || []).find((line) => line.key === "overall");
  const scores = names.length === 2 && overall && typeof overall.values[0] === "number" && typeof overall.values[1] === "number"
    ? ", " + overall.values[0] + "–" + overall.values[1]
    : "";
  return {
    subject: "Comparison saved: " + subjectOf(names[0], names.slice(1), scores),
    intro,
    rows: keep(rows),
    respondUrl: comparisonUrl(id),
    buttonLabel: "Open the comparison"
  };
}

module.exports = { accountNotice, runNotice, savedNotice };
