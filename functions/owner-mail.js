/**
 * The layout of mail to the site owner: notifications, period reports, the ops digest.
 * QA-lab URL Review mail wears the Fusion band; CV and Jarvis mail keep the plain card.
 */
const fusion = require("./url-review-fusion");

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

// rows: { label, value } or { heading }. A heading with no filled row under it is dropped.
function ownerRows(rows) {
  const kept = (rows || []).filter((row) => row && (row.heading || row.value));
  return kept.filter((row, index) => !row.heading || (kept[index + 1] && !kept[index + 1].heading));
}

const FONT = "font-family:Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums;";

function ownerMail({ intro, rows, body, respondUrl, buttonLabel, eyebrow }) {
  const safeRows = ownerRows(rows);
  const text = [
    intro,
    "",
    ...safeRows.map((row, index) => row.heading ? (index ? "\n" : "") + row.heading.toUpperCase() : row.label + ": " + row.value),
    body ? "\n" + body : "",
    respondUrl ? "\nRespond: " + respondUrl : ""
  ].join("\n");
  const review = /^QA-lab URL Review/.test(eyebrow || "");
  const accent = review ? fusion.TEXT.link : "#0e7490";
  const rowHtml = safeRows.map((row, index) => row.heading
    ? "<tr><td colspan=\"2\" style=\"padding:" + (index ? "18px" : "0") + " 0 6px;border-bottom:1px solid " + (review ? fusion.LINE : "#d7e0e6") + ";" + FONT + "font-size:11px;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;color:" + accent + ";\">" + escapeHtml(row.heading) + "</td></tr>"
    : "<tr>" +
      "<td style=\"padding:7px 16px 7px 0;" + FONT + "color:" + (review ? fusion.TEXT.muted : "#5c6b7a") + ";font-size:13px;line-height:20px;vertical-align:top;white-space:nowrap;\">" + escapeHtml(row.label) + "</td>" +
      "<td style=\"padding:7px 0;" + FONT + "color:" + (review ? fusion.TEXT.strong : "#1c2833") + ";font-size:14px;line-height:20px;\">" + escapeHtml(row.value) + "</td>" +
      "</tr>"
  ).join("");
  const bodyHtml = body
    ? "<div style=\"margin-top:20px;padding:16px;background:" + (review ? "#f3f8f8" : "#f4f7f8") + ";border-radius:8px;" + FONT + "color:" + (review ? fusion.TEXT.strong : "#1c2833") + ";font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;\">" + escapeHtml(body) + "</div>"
    : "";
  const buttonHtml = respondUrl
    ? review
      ? "<div style=\"margin-top:22px;\">" + fusion.button(escapeHtml(respondUrl), escapeHtml(buttonLabel || "Respond"), true) + "</div>"
      : "<a href=\"" + escapeHtml(respondUrl) + "\" style=\"display:inline-block;margin-top:22px;background:#0e7490;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px;\">" + escapeHtml(buttonLabel || "Respond") + "</a>"
    : "";
  const content = "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\">" + rowHtml + "</table>" + bodyHtml + buttonHtml;
  const html = review
    ? "<!DOCTYPE html><html><body style=\"margin:0;padding:24px;background:" + fusion.PAGE_BG + ";font-family:Georgia,'Times New Roman',serif;\">" +
      "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:640px;margin:0 auto;\">" +
      fusion.band(escapeHtml(eyebrow), escapeHtml(intro), "", { size: 24 }) +
      "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:24px 28px 28px;\">" + content + "</td></tr>" +
      "</table></body></html>"
    : "<!DOCTYPE html><html><body style=\"margin:0;padding:24px;background:#eef2f4;font-family:Georgia,'Times New Roman',serif;\">" +
      "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;\">" +
      "<tr><td style=\"padding:28px;\">" +
      "<p style=\"margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0e7490;\">" + escapeHtml(eyebrow || "Carlos Muñoz CV") + "</p>" +
      "<h1 style=\"margin:0 0 20px;font-size:22px;line-height:1.3;color:#102027;font-weight:normal;\">" + escapeHtml(intro) + "</h1>" +
      content +
      "</td></tr></table></body></html>";
  return { text, html };
}

module.exports = { escapeHtml, ownerRows, ownerMail };
