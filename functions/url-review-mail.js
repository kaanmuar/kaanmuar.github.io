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

function tally(map, limit) {
  const keys = Object.keys(map).sort((a, b) => map[b] - map[a] || a.localeCompare(b));
  if (!keys.length) return "None";
  return keys.slice(0, limit || 40).map((key) => key + " " + map[key]).join(", ");
}

function hostOf(row) {
  const report = row.report || {};
  try { return new URL(String(row.requestedUrl || row.url || "")).hostname; } catch (error) { /* fall through */ }
  return clip(report.host || "", 120);
}

function money(rows) {
  let usd = 0;
  let paidCount = 0;
  rows.forEach((row) => {
    if (row.paid === true) {
      paidCount += 1;
      usd += Number(row.priceUsd) || 0;
    }
  });
  return { usd: Math.round(usd * 100) / 100, paidCount };
}

// The LinkedIn app and many mail clients send no referrer, so a tagged link names the source better.
function openSource(row) {
  let tagged = "";
  try { tagged = new URLSearchParams(String((row && row.query) || "")).get("utm_source") || ""; } catch (error) { tagged = ""; }
  if (tagged) return tagged.toLowerCase().slice(0, 40) + " (tagged link)";
  return (row && row.referrerHost) || "Direct";
}

function line(parts) {
  return parts.filter(Boolean).join(" · ");
}

function summarizePeriod(opens, reviews, captures, alerts) {
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
  const paid = money(reviews || []);
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
      row.paid === true ? "paid" : row.paid === false ? "unpaid" : "",
      counts.cases != null ? counts.cases + " cases" : "",
      signals ? signals + " signals" : "",
      [row.city, row.country].filter(Boolean).join(", "),
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
    captureLines.length ? "\nCopies and prints\n" + captureLines.join("\n") : "",
    alertLines.length ? "\nAlerts already sent\n" + alertLines.join("\n") : ""
  ].filter(Boolean).join("\n").slice(0, 12000);
  return {
    opens: (opens || []).length,
    reviews: (reviews || []).length,
    captures: (captures || []).length,
    alerts: (alerts || []).length,
    paidUsd: paid.usd,
    paidCount: paid.paidCount,
    pages: pages,
    countries: countries,
    cities: cities,
    langs: langs,
    referrers: referrers,
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

function reportRows(summary, previous, phrase) {
  const prior = previous || { opens: 0, reviews: 0, paidUsd: 0 };
  const captures = String(summary.captures) + (Object.keys(summary.captureKinds).length ? " (" + tally(summary.captureKinds, 6) + ")" : "");
  return [
    { label: "Opens", value: String(summary.opens) },
    { label: "Reviews", value: String(summary.reviews) },
    { label: "Paid", value: summary.paidCount + " charges, " + summary.paidUsd + " USD" },
    { label: "Captures", value: captures },
    { label: "Alerts", value: String(summary.alerts) },
    { label: "Versus", value: "opens " + summary.opens + " vs " + prior.opens + ", reviews " + summary.reviews + " vs " + prior.reviews + ", paid " + summary.paidUsd + " vs " + prior.paidUsd + " USD (" + phrase + ")" },
    { label: "Pages", value: tally(summary.pages) },
    { label: "Statuses", value: tally(summary.statuses) },
    { label: "Hosts", value: tally(summary.hosts) },
    { label: "Frameworks", value: tally(summary.frameworks) },
    { label: "Reasons", value: tally(summary.reasons) },
    { label: "Countries", value: tally(summary.countries) },
    { label: "Cities", value: tally(summary.cities) },
    { label: "Languages", value: tally(summary.langs) },
    { label: "Sources", value: tally(summary.referrers) },
    { label: "Screens", value: tally(summary.screens) },
    { label: "Time zones", value: tally(summary.zones) },
    { label: "Hours", value: tally(summary.hours) + " America/Bogota" }
  ];
}

module.exports = {
  openRecord,
  openRows,
  openSource,
  reviewUrls,
  summarizePeriod,
  reportRows
};
