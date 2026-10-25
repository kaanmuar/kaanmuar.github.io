/**
 * Owner mail for QA-lab URL Review opens and period reports.
 * Summaries only: no page HTML.
 */
const PAGES = new Set([
  "qa-review.html",
  "qa-review-es.html",
  "qa-review-pt.html",
  "qa-review-de.html",
  "qa-review-fr.html",
  "qa-review-it.html",
  "qa-review-pay.html",
  "qa-review-pay-es.html",
  "qa-review-pay-pt.html",
  "qa-review-pay-de.html",
  "qa-review-pay-fr.html",
  "qa-review-pay-it.html",
  "qa-review-account.html",
  "qa-review-guide.html",
  "qa-review-legal.html"
]);

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function decodePlace(value) {
  const raw = String(value || "").replace(/\+/g, " ");
  try { return decodeURIComponent(raw); } catch (error) { return raw; }
}

function openRecord(body, meta) {
  const page = String((body && body.page) || "");
  if (!PAGES.has(page)) return null;
  const query = String((body && body.query) || "");
  const safeQuery = /^[A-Za-z0-9=&%_.?+-]{0,120}$/.test(query) ? query : "";
  const source = meta || {};
  return {
    page: page,
    query: safeQuery,
    lang: clip(body.lang || "en", 12) || "en",
    referrerHost: clip(body.referrerHost || "", 80),
    screen: body.screen === "phone" ? "phone" : "desktop",
    timezone: clip(body.timezone || "", 60),
    languages: clip(body.languages || "", 80),
    title: clip(body.title || "", 120),
    ip: clip(source.ip || "", 80),
    userAgent: clip(source.userAgent || "", 300),
    acceptLanguage: clip(source.acceptLanguage || "", 120),
    country: clip(source.country || "", 8),
    region: clip(decodePlace(source.region || ""), 80),
    city: clip(decodePlace(source.city || ""), 80)
  };
}

function pushUrl(found, value) {
  const text = clip(value, 300);
  if (!text || !/^https?:\/\//i.test(text)) return;
  if (found.indexOf(text) === -1) found.push(text);
}

function reviewUrls(source) {
  const found = [];
  const row = source || {};
  const report = row.report || {};
  pushUrl(found, row.requestedUrl);
  pushUrl(found, row.url);
  pushUrl(found, row.clientUrl);
  pushUrl(found, report.finalUrl);
  const pages = Array.isArray(report.pages) ? report.pages : (Array.isArray(row.pagesRead) ? row.pagesRead : []);
  pages.forEach((page) => pushUrl(found, page && typeof page === "object" ? page.url : page));
  return found.slice(0, 40);
}

function openRows(record, grouped) {
  const place = [record.city, record.region, record.country].filter(Boolean).join(", ");
  const urls = Array.isArray(record.urls) ? record.urls : reviewUrls(record);
  const rows = [
    { label: "Page", value: record.page + (record.query || "") },
    { label: "Title", value: record.title },
    { label: "Name", value: record.name },
    { label: "Email", value: record.email },
    { label: "Language", value: record.lang },
    { label: "Languages", value: record.languages },
    { label: "Source", value: openSource(record) },
    { label: "Screen", value: record.screen },
    { label: "Time zone", value: record.timezone },
    { label: "Place", value: place },
    { label: "Network", value: record.ip },
    { label: "Browser", value: record.userAgent },
    { label: "Accept-Language", value: record.acceptLanguage }
  ];
  urls.forEach((url, index) => rows.push({ label: index === 0 ? "Sites" : "Site", value: url }));
  if (grouped) rows.push({ label: "Also", value: grouped + " more opens in the last 15 minutes" });
  return rows;
}

function whenOf(row) {
  const value = row && (row.createdAt || row.at);
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value._seconds) return new Date(value._seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function bogotaLabel(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function bogotaHour(date) {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(date);
  return text;
}

function bump(map, key) {
  const name = clip(key, 80);
  if (!name) return;
  map[name] = (map[name] || 0) + 1;
}

function tally(map, limit, byKey) {
  const keys = Object.keys(map).sort(byKey ? (a, b) => a.localeCompare(b) : (a, b) => map[b] - map[a] || a.localeCompare(b));
  if (!keys.length) return "None";
  return keys.slice(0, limit || 40).map((key) => key + " " + map[key]).join(", ");
}

function plural(count, word) {
  return count + " " + word + (count === 1 ? "" : "s");
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) + "%" : "n/a";
}

function delta(now, before, phrase, unit) {
  const diff = Math.round((now - before) * 100) / 100;
  return " (" + before + (unit || "") + " " + phrase + (diff ? ", " + (diff > 0 ? "+" : "") + diff : "") + ")";
}

function scoreOf(row) {
  const score = row && row.report && row.report.insights && row.report.insights.score;
  return score && typeof score.overall === "number" ? score : null;
}

function hostOf(row) {
  const report = row.report || {};
  try { return new URL(String(row.requestedUrl || row.url || "")).hostname; } catch (error) { /* fall through */ }
  return clip(report.host || "", 120);
}

// url_reviews also holds payments, owner claims and runs turned away; only runs are reviews.
const PAYMENTS = new Set(["paid-report", "paid-addon", "run-credit", "run-credit-used", "monthly-pass", "checkout-open"]);
const TURNED_AWAY = new Set(["payment-due", "blocked"]);
const REVENUE = { "paid-report": "report unlocks", "paid-addon": "report add-ons", "run-credit": "run credits", "monthly-pass": "passes" };

// Money is read from the payment rows: an unlocked run is also marked paid, and a free run is paid at 0 USD.
function money(payments) {
  let usd = 0;
  let paidCount = 0;
  let tests = 0;
  const kinds = {};
  payments.forEach((row) => {
    if (row.paid !== true || row.refunded === true || !REVENUE[row.status]) return;
    if (row.test) { tests += 1; return; }
    paidCount += 1;
    usd += (Number(row.priceUsd) || 0) - (Number(row.refundedUsd) || 0);
    bump(kinds, REVENUE[row.status]);
  });
  return { usd: Math.round(usd * 100) / 100, paidCount, tests, kinds };
}

// The LinkedIn app and many mail clients send no referrer, so a tagged link names the source better.
// The campaign stays in the label so links that share a source (a page button, a highlight, a post) read apart.
function openSource(row) {
  let tagged = "";
  let campaign = "";
  try {
    const params = new URLSearchParams(String((row && row.query) || ""));
    tagged = params.get("utm_source") || "";
    campaign = params.get("utm_campaign") || "";
  } catch (error) { tagged = ""; }
  if (tagged) return tagged.toLowerCase().slice(0, 40) + (campaign ? " / " + campaign.toLowerCase().slice(0, 40) : "") + " (tagged link)";
  return (row && row.referrerHost) || "Direct";
}

function line(parts) {
  return parts.filter(Boolean).join(" · ");
}

function summarizePeriod(opens, rows, captures, alerts) {
  const all = rows || [];
  const claims = all.filter((row) => row.status === "owner-claim");
  const payments = all.filter((row) => PAYMENTS.has(row.status));
  const away = all.filter((row) => TURNED_AWAY.has(row.status));
  const reviews = all.filter((row) => row.status !== "owner-claim" && !PAYMENTS.has(row.status) && !TURNED_AWAY.has(row.status));
  const turnedAway = {};
  away.forEach((row) => bump(turnedAway, row.status));
  const checkouts = payments.filter((row) => row.status === "checkout-open").length;
  const paidRuns = reviews.filter((row) => row.paid === true && !row.free && !row.test).length;
  const freeRuns = reviews.filter((row) => row.free === true).length;
  const visitors = new Set((opens || []).map((row) => row.ip).filter(Boolean)).size;
  const scored = reviews.map(scoreOf).filter(Boolean);
  const grades = {};
  scored.forEach((score) => bump(grades, score.grade || "?"));
  const askers = {};
  reviews.forEach((row) => bump(askers, String(row.email || "").toLowerCase()));
  const mailed = { sent: 0, pdf: 0, failed: 0, unrecorded: 0 };
  reviews.filter((row) => row.email && (row.status === "complete" || row.status === "stopped")).forEach((row) => {
    if (!row.mail) mailed.unrecorded += 1;
    else if (row.mail.sent) { mailed.sent += 1; if (row.mail.pdf) mailed.pdf += 1; }
    else mailed.failed += 1;
  });
  const pages = {};
  const countries = {};
  const cities = {};
  const langs = {};
  const referrers = {};
  const screens = {};
  const zones = {};
  const hours = {};
  const statuses = {};
  const hosts = {};
  const frameworks = {};
  const reasons = {};
  const captureKinds = {};
  (opens || []).forEach((row) => {
    bump(pages, row.page);
    bump(countries, row.country || "unknown");
    bump(cities, row.city || "unknown");
    bump(langs, row.lang || "en");
    bump(referrers, openSource(row));
    bump(screens, row.screen || "unrecorded");
    bump(zones, row.timezone || "unknown");
    const when = whenOf(row);
    if (when) bump(hours, bogotaHour(when));
  });
  (reviews || []).forEach((row) => {
    bump(statuses, row.status || "unknown");
    bump(hosts, hostOf(row) || "none");
    (Array.isArray(row.frameworks) ? row.frameworks : []).forEach((name) => bump(frameworks, name));
    bump(reasons, row.reasonCode || "");
  });
  (captures || []).forEach((row) => bump(captureKinds, row.kind || "capture"));
  const reviewSources = {};
  const sourceById = {};
  const sourceByEmail = {};
  reviews.forEach((row) => {
    const source = openSource(row);
    bump(reviewSources, source);
    if (row.id) sourceById[row.id] = source;
    const email = String(row.email || "").toLowerCase();
    if (email && !sourceByEmail[email]) sourceByEmail[email] = source;
  });
  // A payment takes the source of the review it unlocked, else of the asker's review in this period.
  const paidSources = {};
  payments.filter((row) => row.paid === true && row.refunded !== true && REVENUE[row.status] && !row.test).forEach((row) => {
    bump(paidSources, sourceById[row.reportId] || sourceByEmail[String(row.email || "").toLowerCase()] || "no review in this period");
  });
  const paid = money(payments);
  const openLines = (opens || []).slice(0, 120).map((row) => line([
    bogotaLabel(whenOf(row)),
    row.page,
    row.lang,
    [row.city, row.country].filter(Boolean).join(", ") || "place unrecorded",
    openSource(row),
    row.screen,
    row.ip,
    (Array.isArray(row.urls) ? row.urls : reviewUrls(row)).join(" | "),
    row.userAgent
  ]));
  const reviewLines = (reviews || []).slice(0, 80).map((row) => {
    const report = row.report || {};
    const counts = report.counts || {};
    const signals = Array.isArray(report.alerts) ? report.alerts.length : 0;
    return line([
      bogotaLabel(whenOf(row)),
      row.status,
      row.name,
      row.email,
      hostOf(row),
      Array.isArray(row.frameworks) ? row.frameworks.join(", ") : "",
      row.pages ? row.pages + " pages" : "",
      row.depth ? "depth " + row.depth : "",
      row.priceUsd != null && row.priceUsd !== "" ? String(row.priceUsd) + " USD" : "",
      row.free === true ? "free" : row.paid === true ? "paid" : row.paid === false ? "unpaid" : "",
      row.test ? "test" : "",
      counts.cases != null ? counts.cases + " cases" : "",
      scoreOf(row) ? "score " + scoreOf(row).overall + " " + (scoreOf(row).grade || "") : "",
      signals ? signals + " signals" : "",
      row.mail ? (row.mail.sent ? "mailed" + (row.mail.pdf ? " with PDF" : " without PDF") : "mail failed: " + clip(row.mail.error, 60)) : "",
      [row.city, row.country].filter(Boolean).join(", "),
      row.query || row.referrerHost ? "from " + openSource(row) : "",
      row.reasonCode || clip(row.reason, 80)
    ]);
  });
  const captureLines = (captures || []).slice(0, 40).map((row) => line([
    bogotaLabel(whenOf(row)),
    row.kind,
    row.reportId,
    row.deviceId
  ]));
  const alertLines = (alerts || []).slice(0, 40).map((row) => line([
    bogotaLabel(whenOf(row)),
    row.kind || row.status,
    row.title,
    row.email,
    row.url
  ]));
  const more = (shown, total, label) => shown < total ? "… and " + (total - shown) + " more " + label : "";
  const body = [
    openLines.length ? "Opens\n" + openLines.join("\n") : "Opens\nNone",
    more(openLines.length, (opens || []).length, "opens"),
    reviewLines.length ? "\nReviews\n" + reviewLines.join("\n") : "\nReviews\nNone",
    more(reviewLines.length, (reviews || []).length, "reviews"),
    payments.length ? "\nPayments\n" + payments.slice(0, 40).map((row) => line([bogotaLabel(whenOf(row)), row.status, row.email, row.reportId, row.priceUsd != null ? row.priceUsd + " USD" : "", row.provider, row.test ? "test" : ""])).join("\n") : "",
    away.length ? "\nTurned away\n" + away.slice(0, 40).map((row) => line([bogotaLabel(whenOf(row)), row.status, row.name, row.email, hostOf(row), row.priceUsd ? row.priceUsd + " USD due" : "", clip(row.reason, 80)])).join("\n") : "",
    claims.length ? "\nOwner claims\n" + claims.slice(0, 40).map((row) => line([bogotaLabel(whenOf(row)), hostOf(row), row.email, row.mail && !row.mail.sent ? "mail failed" : ""])).join("\n") : "",
    captureLines.length ? "\nCopies and prints\n" + captureLines.join("\n") : "",
    alertLines.length ? "\nAlerts already sent\n" + alertLines.join("\n") : ""
  ].filter(Boolean).join("\n").slice(0, 12000);
  return {
    opens: (opens || []).length,
    visitors,
    reviews: reviews.length,
    claims: claims.length,
    captures: (captures || []).length,
    alerts: (alerts || []).length,
    paidUsd: paid.usd,
    paidCount: paid.paidCount,
    paidKinds: paid.kinds,
    testPayments: paid.tests,
    checkouts,
    paidRuns,
    freeRuns,
    turnedAway,
    averageScore: scored.length ? Math.round(scored.reduce((sum, score) => sum + score.overall, 0) / scored.length) : null,
    grades,
    repeatAskers: Object.keys(askers).filter((key) => askers[key] > 1).length,
    mailed,
    pages: pages,
    countries: countries,
    cities: cities,
    langs: langs,
    referrers: referrers,
    reviewSources: reviewSources,
    paidSources: paidSources,
    screens: screens,
    zones: zones,
    hours: hours,
    statuses: statuses,
    hosts: hosts,
    frameworks: frameworks,
    reasons: reasons,
    captureKinds: captureKinds,
    body: body
  };
}

// extra: { failures: periodFailures().rows, followUp: { notes, stops, notices, unlisted, replies, redemptions }, sweep }.
// followUp and sweep are left out of the quarter-hour report.
function reportRows(summary, previous, phrase, extra) {
  const prior = previous || { opens: 0, reviews: 0, paidUsd: 0 };
  const more = extra || {};
  const follow = more.followUp;
  const mailed = summary.mailed || { sent: 0, pdf: 0, failed: 0, unrecorded: 0 };
  const captures = String(summary.captures) + (Object.keys(summary.captureKinds).length ? " (" + tally(summary.captureKinds, 6) + ")" : "");
  const replies = follow ? follow.replies + (follow.replies === 1 ? " reply" : " replies") : "";
  return [
    { heading: "Volume and money" },
    { label: "Opens", value: summary.opens + delta(summary.opens, prior.opens || 0, phrase) + "; " + plural(summary.visitors || 0, "network") },
    { label: "Reviews", value: summary.reviews + delta(summary.reviews, prior.reviews || 0, phrase) + (summary.reviews ? "; " + tally(summary.statuses) : "") + (summary.freeRuns ? "; " + summary.freeRuns + " free" : "") },
    { label: "Turned away", value: Object.keys(summary.turnedAway || {}).length ? tally(summary.turnedAway) : "" },
    { label: "Revenue", value: summary.paidUsd + " USD" + delta(summary.paidUsd, prior.paidUsd || 0, phrase, " USD") + " from " + plural(summary.paidCount, "payment") +
      (summary.paidCount ? " (" + tally(summary.paidKinds || {}) + ")" : "") + (summary.testPayments ? "; " + summary.testPayments + " test not counted" : "") },
    { label: "Checkouts", value: summary.checkouts ? summary.checkouts + " opened" : "" },
    { label: "Conversion", value: percent(summary.reviews, summary.opens) + " of opens ran a review, " + percent(summary.paidRuns || 0, summary.reviews) + " of reviews were paid for" },
    { label: "Scores", value: summary.averageScore == null ? "" : "average " + summary.averageScore + "; grades " + tally(summary.grades, 6, true) },
    { label: "Repeat askers", value: summary.repeatAskers ? String(summary.repeatAskers) : "" },
    { heading: "Delivery and follow-up" },
    { label: "Report mails", value: mailed.sent + " sent (" + mailed.pdf + " with PDF), " + mailed.failed + " failed" + (mailed.unrecorded ? ", " + mailed.unrecorded + " not recorded" : "") },
    { label: "Copies and prints", value: captures },
    { label: "Alerts", value: String(summary.alerts) },
    { label: "Follow-up notes", value: follow ? plural(follow.notes, "note") + " sent, " + follow.stops + " stopped" : "" },
    { label: "Owner notices", value: follow ? follow.notices + " sent, " + (summary.claims || 0) + " claimed, " + follow.unlisted + " taken off Live Reports, " + replies : "" },
    { label: "Coupons", value: follow ? follow.redemptions + " redeemed" : "" },
    { label: "Country sweep", value: more.sweep != null ? more.sweep + " reviewed, not counted above" : "" },
    { heading: "Failures" }
  ].concat(more.failures || [], [
    { heading: "Where people came from" },
    { label: "Sources", value: tally(summary.referrers) },
    { label: "Reviews by source", value: tally(summary.reviewSources || {}) },
    { label: "Payments by source", value: tally(summary.paidSources || {}) },
    { label: "Countries", value: tally(summary.countries) },
    { label: "Cities", value: tally(summary.cities) },
    { label: "Languages", value: tally(summary.langs) },
    { label: "Pages", value: tally(summary.pages) },
    { label: "Screens", value: tally(summary.screens) },
    { label: "Time zones", value: tally(summary.zones) },
    { label: "Hours", value: tally(summary.hours, 24, true) + " America/Bogota" },
    { heading: "What was reviewed" },
    { label: "Hosts", value: tally(summary.hosts) },
    { label: "Frameworks", value: tally(summary.frameworks) },
    { label: "Reasons", value: tally(summary.reasons) }
  ]);
}

// The subject line carries the numbers, so the inbox list is the summary.
function reportSubject(title, label, summary, failed) {
  const parts = [plural(summary.reviews, "review"), summary.paidCount ? summary.paidUsd + " USD" : "", failed ? failed + " failed" : ""].filter(Boolean);
  return title + " URL review — " + label + " · " + parts.join(", ");
}

module.exports = {
  money,
  openRecord,
  openRows,
  openSource,
  reviewUrls,
  summarizePeriod,
  reportRows,
  reportSubject
};
