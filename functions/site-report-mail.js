/**
 * Owner mail for CV visits and the daily, weekly, and monthly site reports.
 */
const { openSource } = require("./url-review-mail");

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function linkCode(label) {
  const code = String(label || "").trim().toLowerCase();
  if (!code || code.length > 40) return "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) return "";
  return code;
}

function linkFromQuery(query) {
  const match = String(query || "").match(/(?:^|[?&])cvref=([a-z0-9-]+)/i);
  return match ? linkCode(match[1]) : "";
}

// Same rule as a URL Review open: a tagged link names the source, then the referrer, then Direct.
function visitSource(row) {
  return openSource(row);
}

function visitRows(visit, grouped) {
  const row = visit || {};
  const place = [row.city, row.region, row.country].filter(Boolean).join(", ");
  const page = clip(row.page || "", 80);
  const query = /^[A-Za-z0-9=&%_.?+-]{0,120}$/.test(String(row.query || "")) ? String(row.query || "") : "";
  const rows = [
    { label: "Page", value: page ? page + query : "" },
    { label: "Title", value: clip(row.title, 120) },
    { label: "Language", value: clip(row.lang || "en", 12) },
    { label: "Languages", value: clip(row.languages, 80) },
    { label: "Referrer", value: clip(visitSource(row), 80) },
    { label: "Screen", value: row.screen === "phone" || row.screen === "desktop" ? row.screen : "" },
    { label: "Time zone", value: clip(row.timezone, 60) },
    { label: "Place", value: clip(place, 120) },
    { label: "Network", value: clip(row.ip, 80) },
    { label: "Browser", value: clip(row.userAgent, 300) },
    { label: "Accept-Language", value: clip(row.acceptLanguage, 120) },
    { label: "Link", value: linkCode(row.label) || linkFromQuery(row.query) }
  ];
  if (grouped) rows.push({ label: "Also", value: grouped + " more visits in the last 15 minutes" });
  return rows;
}

const SITE_NAMES = { cv: "CV", studio: "Studio", lab: "Lab", review: "Review" };

function whenOf(row) {
  const value = row && row.createdAt;
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
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

function eventLine(row, titleOf) {
  const place = [row.city, row.region, row.country].filter(Boolean).join(", ");
  const kind = row.kind === "visit" ? "" : (typeof titleOf === "function" ? titleOf(row) : clip(row.name, 40));
  const link = row.kind === "visit" ? (linkCode(row.label) || linkFromQuery(row.query)) : "";
  return [
    bogotaLabel(whenOf(row)),
    SITE_NAMES[row.site] || clip(row.site, 20) || "CV",
    kind,
    clip(row.page, 80),
    clip(row.title, 80),
    clip(row.lang, 12),
    place,
    row.kind === "visit" ? clip(visitSource(row), 80) : (row.referrerHost ? clip(row.referrerHost, 80) : ""),
    row.screen === "phone" || row.screen === "desktop" ? row.screen : "",
    clip(row.timezone, 60),
    link,
    clip(row.ip, 80),
    clip(row.userAgent, 180)
  ].filter(Boolean).join(" · ");
}

function section(title, rows, titleOf, limit) {
  const list = rows || [];
  const shown = list.slice(0, limit);
  const lines = shown.map((row) => eventLine(row, titleOf));
  const more = list.length > shown.length ? "… and " + (list.length - shown.length) + " more" : "";
  return [title, lines.length ? lines.join("\n") : "None", more].filter(Boolean).join("\n");
}

function reportBody(rows, titleOf) {
  const all = rows || [];
  const visits = all.filter((row) => row.kind === "visit");
  const exports = all.filter((row) => row.kind === "export");
  const runs = all.filter((row) => row.kind === "run");
  const clicks = all.filter((row) => row.kind !== "visit" && row.kind !== "export" && row.kind !== "run");
  return [
    section("Visits", visits, titleOf, 200),
    section("Clicks", clicks, titleOf, 200),
    section("Exports", exports, titleOf, 80),
    section("Runs", runs, titleOf, 80)
  ].join("\n\n").slice(0, 12000);
}

function inboxBody(messages, ratings) {
  const messageLines = (messages || []).slice(0, 60).map((row) => [
    bogotaLabel(whenOf(row)),
    clip(row.name, 80),
    clip(row.email, 120),
    clip(row.topic, 40),
    clip(row.message, 280)
  ].filter(Boolean).join(" · "));
  const ratingLines = (ratings || []).slice(0, 60).map((row) => [
    bogotaLabel(whenOf(row)),
    clip(row.name, 80),
    clip(row.email, 120),
    (Number(row.rating) || 0) + "/5",
    clip(row.comment, 280)
  ].filter(Boolean).join(" · "));
  const parts = [];
  if (messageLines.length) parts.push("Messages\n" + messageLines.join("\n"));
  if (ratingLines.length) parts.push("Ratings\n" + ratingLines.join("\n"));
  return parts.join("\n\n");
}

module.exports = {
  visitRows,
  visitSource,
  reportBody,
  inboxBody,
  linkFromQuery
};
