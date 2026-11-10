/**
 * Launch and outreach mail for the URL review release (#3393), in six languages (copy in launch-mail-copy.js):
 *   launchMail       the launch note to past reviewers with their 50% code, in three designs: glass, night, editorial.
 *                    Sent only by scripts/launch-campaign.js once Carlos approves (launch-campaign.js gate).
 *   outreachMail     the cold note to a site's listed contact; studentOutreachMail the note to a student
 *   fixableMail      "your report found something we can fix", after a report with findings a package covers;
 *                    off until FIXABLE_FOLLOWUP_MAIL=on
 * The animated heroes are GIFs under assets/mail/launch/ (scripts/render-launch-emails.js draws them); their first
 * frame reads on its own, since Outlook on Windows shows only that frame. Buttons are VML in Outlook, links elsewhere.
 */
const base = require("./url-review-customer-mail");
const fusion = require("./url-review-fusion");
const booking = require("./booking");
const fixOffers = require("./url-review-fix-offers");
const COPY = require("./launch-mail-copy");

const { SITE, POSTAL, esc, fill, langOf, pageUrl } = base;
const ASSETS = SITE + "/assets/mail/launch/";
const LEGAL_URL = SITE + "/qa-review-legal.html";
const ACCOUNT_URL = SITE + "/qa-review-account.html";
const OPTIONS = ["glass", "night", "editorial"];
const HERO = { glass: "glass-shield.gif", night: "night-radar.gif", editorial: "editorial-stack.gif" };
const HERO_SIZE = { width: 600, height: 320 };
const SANS = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;";
const SERIF = "font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:normal;";
const MONO = "font-family:'Fira Code',Menlo,Consolas,'Courier New',monospace;";

// Each design's palette. Text colours meet AA on their own card; `dark` designs look the same in dark mode.
const THEMES = {
  glass: {
    page: "#d9eff2", pageImg: "background-image:linear-gradient(165deg,#effeff 0%,#d3f0f3 48%,#bde2e9 100%);", card: "#f7fdfd", line: "#bfe4e8",
    strong: "#0b2a30", body: "#2a474d", muted: "#4f6970", accent: "#0b6870", chip: "#e2f7f8", btn: "#0b6870", btnText: "#ffffff",
    btn2: "#ffffff", btn2Text: "#0b6870", hero: "#cfeef1", title: SERIF, radius: 22, dark: false
  },
  night: {
    page: "#03080c", pageImg: "background-image:radial-gradient(circle at 50% 0%,#0b2630 0%,#03080c 62%);", card: "#08141a", line: "#163641",
    strong: "#effdff", body: "#b9d2d7", muted: "#86a3aa", accent: "#7ef6fb", chip: "#0d2129", btn: "#7ef6fb", btnText: "#03080c",
    btn2: "#03080c", btn2Text: "#7ef6fb", hero: "#03080c", title: SANS + "font-weight:800;letter-spacing:-0.02em;", radius: 14, dark: true
  },
  editorial: {
    page: "#f3eee5", pageImg: "", card: "#fffdf8", line: "#e4d9c6",
    strong: "#1a1610", body: "#3b3429", muted: "#6b604f", accent: "#7a571c", chip: "#f6efe2", btn: "#1a1610", btnText: "#fffdf8",
    btn2: "#fffdf8", btn2Text: "#1a1610", hero: "#f3eee5", title: SERIF, radius: 4, dark: false
  }
};

// Dark mode for the light designs (Apple Mail, iOS, Outlook.com). Gmail inverts by itself and ignores these.
const DARK_CSS = "@media (prefers-color-scheme:dark){.lm-page{background:#071116!important;background-image:none!important}.lm-card{background:#0d1d22!important;border-color:#1f3a40!important}" +
  ".lm-strong{color:#effdff!important}.lm-body{color:#c6dcdf!important}.lm-muted{color:#9db6bb!important}.lm-accent{color:#7ef6fb!important}.lm-chip{background:#12272d!important}}" +
  "[data-ogsc] .lm-strong{color:#effdff!important}[data-ogsc] .lm-body{color:#c6dcdf!important}[data-ogsc] .lm-muted{color:#9db6bb!important}[data-ogsc] .lm-accent{color:#7ef6fb!important}" +
  "[data-ogsb] .lm-page{background:#071116!important}[data-ogsb] .lm-card{background:#0d1d22!important}";
const PHONE_CSS = "@media only screen and (max-width:620px){.lm-col{display:block!important;width:100%!important;box-sizing:border-box}.lm-px{padding-left:20px!important;padding-right:20px!important}" +
  ".lm-h1{font-size:31px!important;line-height:36px!important}.lm-hero{width:100%!important;height:auto!important}.lm-price{text-align:left!important;padding-top:6px!important}.lm-code{font-size:20px!important;letter-spacing:0.05em!important;padding:12px 16px!important}.lm-pct{display:none!important}}";

function copyOf(lang) {
  return COPY[langOf(lang)];
}

function shell(lang, theme, preheader, inner) {
  const t = THEMES[theme];
  const scheme = t.dark ? "dark" : "light dark";
  return "<!DOCTYPE html><html lang=\"" + esc(lang) + "\" xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:v=\"urn:schemas-microsoft-com:vml\" xmlns:o=\"urn:schemas-microsoft-com:office:office\"><head>" +
    "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">" +
    "<meta name=\"color-scheme\" content=\"" + scheme + "\"><meta name=\"supported-color-schemes\" content=\"" + scheme + "\"><meta name=\"x-apple-disable-message-reformatting\">" +
    "<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->" +
    "<title>QA-lab URL Review</title><style>:root{color-scheme:" + scheme + ";supported-color-schemes:" + scheme + "}body{margin:0;padding:0;-webkit-text-size-adjust:100%}a{text-decoration:none}" +
    PHONE_CSS + (t.dark ? "" : DARK_CSS) + "</style></head>" +
    "<body class=\"lm-page\" style=\"margin:0;padding:0;background:" + t.page + ";\">" +
    "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;color:" + t.page + ";\">" + esc(preheader) + "&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>" +
    "<table role=\"presentation\" class=\"lm-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"" + t.page + "\" style=\"background:" + t.page + ";" + t.pageImg + "\"><tr><td align=\"center\" style=\"padding:24px 10px;\">" +
    "<!--[if mso]><table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\"><tr><td><![endif]-->" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"max-width:600px;\">" + inner + "</table>" +
    "<!--[if mso]></td></tr></table><![endif]-->" +
    "</td></tr></table></body></html>";
}

/** A button that holds in Outlook (VML) and everywhere else (a padded link). */
function button(href, label, bg, fg, border) {
  const width = Math.max(190, Math.min(420, Math.round(String(label).length * 9.2 + 64)));
  return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"display:inline-table;margin:0 10px 10px 0;\"><tr><td align=\"center\" bgcolor=\"" + bg + "\" style=\"border-radius:999px;background:" + bg + ";" + (border ? "border:1px solid " + border + ";" : "") + "\">" +
    "<!--[if mso]><v:roundrect xmlns:v=\"urn:schemas-microsoft-com:vml\" xmlns:w=\"urn:schemas-microsoft-com:office:word\" href=\"" + esc(href) + "\" style=\"height:48px;v-text-anchor:middle;width:" + width + "px;\" arcsize=\"50%\" " +
    (border ? "strokecolor=\"" + border + "\"" : "stroke=\"f\"") + " fillcolor=\"" + bg + "\"><w:anchorlock/><center style=\"color:" + fg + ";font-family:Arial,sans-serif;font-size:16px;font-weight:bold;\">" + esc(label) + "</center></v:roundrect><![endif]-->" +
    "<!--[if !mso]><!--><a href=\"" + esc(href) + "\" style=\"display:inline-block;padding:14px 26px;" + SANS + "font-size:16px;font-weight:bold;line-height:20px;color:" + fg + ";text-decoration:none;border-radius:999px;mso-hide:all;\">" + esc(label) + "</a><!--<![endif]-->" +
    "</td></tr></table>";
}

function card(theme, inner, padding, extra) {
  const t = THEMES[theme];
  return "<tr><td style=\"padding:0 0 14px;\"><table role=\"presentation\" class=\"lm-card\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"" + t.card + "\" style=\"background:" + t.card + ";border:1px solid " + t.line + ";border-radius:" + t.radius + "px;" + (extra || "") + "\">" +
    "<tr><td class=\"lm-px\" style=\"padding:" + (padding || "28px 32px") + ";" + SANS + "\">" + inner + "</td></tr></table></td></tr>";
}

function p(theme, text, cls, style) {
  const t = THEMES[theme];
  const color = cls === "lm-muted" ? t.muted : cls === "lm-strong" ? t.strong : t.body;
  return "<p class=\"" + (cls || "lm-body") + "\" style=\"margin:0 0 14px;" + SANS + "font-size:16px;line-height:25px;color:" + color + ";" + (style || "") + "\">" + text + "</p>";
}

function topBar(theme, eyebrow) {
  const t = THEMES[theme];
  const label = theme === "night" ? "&gt;_ " + esc(eyebrow) : esc(eyebrow);
  return "<tr><td style=\"padding:0 4px 16px;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>" +
    "<td width=\"40\" style=\"padding:0 12px 0 0;vertical-align:middle;\">" + fusion.logoCell(40) + "</td>" +
    "<td class=\"lm-accent\" style=\"vertical-align:middle;" + (theme === "night" ? MONO : SANS) + "font-size:12px;line-height:16px;letter-spacing:0.14em;text-transform:uppercase;font-weight:bold;color:" + t.accent + ";\">" + label + "</td>" +
    "</tr></table></td></tr>";
}

function hero(theme, src, alt) {
  const t = THEMES[theme];
  return "<tr><td style=\"padding:0 0 14px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" bgcolor=\"" + t.hero + "\" style=\"background:" + t.hero + ";border-radius:" + t.radius + "px;overflow:hidden;\"><tr><td align=\"center\" style=\"padding:0;font-size:0;line-height:0;\">" +
    "<img class=\"lm-hero\" src=\"" + esc(src) + "\" width=\"" + HERO_SIZE.width + "\" height=\"" + HERO_SIZE.height + "\" alt=\"" + esc(alt) + "\" style=\"display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;border-radius:" + t.radius + "px;" + SANS + "font-size:16px;line-height:22px;color:" + t.strong + ";\">" +
    "</td></tr></table></td></tr>";
}

function money(n) {
  return "US$" + Number(n || 0);
}

// The checks as a grid of two columns (one on a phone). Each design marks them its own way.
function checksGrid(theme, checks) {
  const t = THEMES[theme];
  const mark = (i) => theme === "night"
    ? "<span style=\"" + MONO + "font-size:12px;font-weight:bold;color:" + t.btnText + ";background:" + t.accent + ";border-radius:4px;padding:2px 6px;\">0" + (i + 1) + "</span>"
    : theme === "editorial"
      ? "<span class=\"lm-accent\" style=\"" + SERIF + "font-size:26px;line-height:26px;color:" + t.accent + ";\">0" + (i + 1) + "</span>"
      : "<span style=\"display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:" + t.accent + ";color:#ffffff;font-size:14px;font-weight:bold;\">&#10003;</span>";
  const cell = (item, i) => "<td class=\"lm-col\" width=\"50%\" valign=\"top\" style=\"padding:0 8px 18px 0;" + SANS + "\">" +
    "<div style=\"margin:0 0 8px;\">" + mark(i) + "</div>" +
    "<p class=\"lm-strong\" style=\"margin:0 0 4px;" + SANS + "font-size:16px;line-height:22px;font-weight:bold;color:" + t.strong + ";\">" + esc(item[0]) + "</p>" +
    "<p class=\"lm-muted\" style=\"margin:0;" + SANS + "font-size:14px;line-height:21px;color:" + t.muted + ";\">" + esc(item[1]) + "</p></td>";
  let rows = "";
  for (let i = 0; i < checks.length; i += 2) rows += "<tr>" + cell(checks[i], i) + (checks[i + 1] ? cell(checks[i + 1], i + 1) : "<td class=\"lm-col\" width=\"50%\"></td>") + "</tr>";
  return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">" + rows + "</table>";
}

// The package table with today's price, and the list price struck through while the launch holds.
function packageRows(theme, lang, words, now, only) {
  const t = THEMES[theme];
  const launch = fixOffers.launchOn(now);
  const items = fixOffers.PACKAGES.filter((pkg) => !only || only[pkg.id]);
  return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">" + items.map((pkg, i) => {
    const price = fixOffers.usdOf(pkg, now);
    const sub = only ? only[pkg.id] : fill(words.fixDays, { days: pkg.days });
    return "<tr><td class=\"lm-col\" valign=\"top\" style=\"padding:12px 0;" + (i ? "border-top:1px " + (theme === "editorial" ? "dotted" : "solid") + " " + t.line + ";" : "") + SANS + "\">" +
      "<p class=\"lm-strong\" style=\"margin:0;" + SANS + "font-size:16px;line-height:22px;font-weight:bold;color:" + t.strong + ";\">" + esc(pkg.name[lang] || pkg.name.en) + "</p>" +
      "<p class=\"lm-muted\" style=\"margin:2px 0 0;" + SANS + "font-size:13px;line-height:19px;color:" + t.muted + ";\">" + esc(sub) + "</p></td>" +
      "<td class=\"lm-col lm-price\" valign=\"top\" align=\"right\" style=\"padding:12px 0;white-space:nowrap;" + (i ? "border-top:1px " + (theme === "editorial" ? "dotted" : "solid") + " " + t.line + ";" : "") + SANS + "\">" +
      "<span class=\"lm-accent\" style=\"" + (theme === "editorial" ? SERIF + "font-size:26px;" : (theme === "night" ? MONO : SANS) + "font-size:20px;font-weight:bold;") + "line-height:26px;color:" + t.accent + ";\">" + money(price) + "</span>" +
      (launch && pkg.listUsd > price ? "<br><span class=\"lm-muted\" style=\"" + SANS + "font-size:12px;line-height:18px;color:" + t.muted + ";text-decoration:line-through;\">" + esc(fill(words.listLabel, { usd: pkg.listUsd })) + "</span>" : "") +
      "</td></tr>";
  }).join("") + "</table>";
}

function codeBox(theme, words, code) {
  const t = THEMES[theme];
  const box = theme === "night"
    ? "border:2px solid " + t.accent + ";background:#03080c;color:" + t.accent + ";" + MONO
    : theme === "editorial"
      ? "border-top:2px solid " + t.strong + ";border-bottom:2px solid " + t.strong + ";background:" + t.card + ";color:" + t.strong + ";" + MONO
      : "border:1px solid #7ad3da;background:#ffffff;color:" + t.strong + ";border-radius:14px;" + MONO;
  return "<p class=\"lm-muted\" style=\"margin:0 0 10px;" + SANS + "font-size:13px;line-height:18px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;color:" + t.muted + ";\">" + esc(words.codeTitle) + "</p>" +
    "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:0 0 14px;\"><tr><td class=\"lm-code\" style=\"padding:14px 22px;white-space:nowrap;" + box + "font-size:28px;line-height:34px;letter-spacing:0.12em;font-weight:bold;\">" + esc(code) + "</td>" +
    "<td style=\"padding:0 0 0 14px;" + (theme === "editorial" ? SERIF + "font-size:48px;line-height:48px;" : SANS + "font-size:40px;line-height:40px;font-weight:800;") + "color:" + t.accent + ";\" class=\"lm-accent lm-pct\">50%</td></tr></table>" +
    p(theme, esc(words.codeNote), "lm-muted", "font-size:14px;line-height:21px;");
}

function footer(theme, lang, why, stopUrl, stopLabel) {
  const t = THEMES[theme];
  const b = base.COPY[langOf(lang)];
  const a = (href, label) => "<a href=\"" + esc(href) + "\" class=\"lm-accent\" style=\"color:" + t.accent + ";text-decoration:underline;\">" + esc(label) + "</a>";
  return "<tr><td class=\"lm-muted\" style=\"padding:10px 12px 0;" + SANS + "font-size:12px;line-height:18px;color:" + t.muted + ";text-align:center;\">" +
    esc(why) + "<br>" + (stopUrl ? a(stopUrl, stopLabel) + " &middot; " : "") + a(ACCOUNT_URL, b.account) + " &middot; " + a(SITE + "/qa-review.html", "QA-lab URL Review") + "<br>" +
    esc(fill(b.controller, { postal: POSTAL })) + " " + a(LEGAL_URL, b.legal) + "</td></tr>";
}

function footerText(lang, why, stopUrl, stopLabel) {
  const b = base.COPY[langOf(lang)];
  return [why, stopUrl ? stopLabel + ": " + stopUrl : "", b.account + ": " + ACCOUNT_URL, fill(b.controller, { postal: POSTAL }) + " " + b.legal + ": " + LEGAL_URL].filter(Boolean).join("\n");
}

function heroUrl(option, opts) {
  return ((opts && opts.assetBase) || ASSETS) + HERO[option];
}

/**
 * The launch note in one of the three designs. vars: { code, stopUrl }; opts: { now, assetBase } (assetBase points
 * the hero at local files for previews). Returns { subject, preheader, html, text }.
 */
function launchMail(option, lang, vars, opts) {
  const theme = OPTIONS.indexOf(option) === -1 ? "glass" : option;
  const code = langOf(lang);
  const w = copyOf(code).L;
  const t = THEMES[theme];
  const v = vars || {};
  const o = opts || {};
  const reviewUrl = pageUrl(code, { coupon: v.code, utm_campaign: "launch-2026-12-" + theme });
  const callUrl = booking.bookUrl("intro", code, { from: "launch-" + theme });
  const title = w.titles[theme];
  const preheader = fill(w.preheader, { code: v.code || "" });
  const titleHtml = "<h1 class=\"lm-strong lm-h1\" style=\"margin:0 0 14px;" + t.title + "font-size:" + (theme === "night" ? 36 : 42) + "px;line-height:" + (theme === "night" ? 42 : 46) + "px;color:" + t.strong + ";\">" + esc(title) + "</h1>";
  const ctas = button(reviewUrl, w.cta, t.btn, t.btnText) + button(callUrl, w.cta2, t.btn2, t.btn2Text, t.accent);
  const sectionTitle = (text) => "<h2 class=\"lm-strong\" style=\"margin:0 0 18px;" + (theme === "night" ? MONO + "font-size:15px;line-height:20px;letter-spacing:0.08em;text-transform:uppercase;font-weight:bold;" : t.title + "font-size:26px;line-height:31px;") + "color:" + t.strong + ";\">" + esc(text) + "</h2>";
  const inner = topBar(theme, w.eyebrow) +
    hero(theme, heroUrl(theme, o), w.heroAlt[theme]) +
    card(theme, titleHtml + p(theme, esc(w.lead)) + "<div style=\"height:8px;line-height:8px;font-size:0;\">&nbsp;</div>" + codeBox(theme, w, v.code || "") + ctas, "32px 32px 22px", theme === "night" ? "border-top:3px solid " + t.accent + ";" : "") +
    card(theme, sectionTitle(w.checksTitle) + checksGrid(theme, w.checks), "28px 32px 12px") +
    card(theme, sectionTitle(w.fixTitle) + p(theme, esc(w.fixLead), "lm-muted", "font-size:15px;line-height:23px;") + packageRows(theme, code, w, o.now) +
      p(theme, esc(copyOf(code).F.noCoupon), "lm-muted", "margin:14px 0 0;font-size:13px;line-height:19px;"), "28px 32px 20px") +
    footer(theme, code, w.why, v.stopUrl, w.stop);
  const text = [
    title, "", w.lead, "", w.codeTitle + ": " + (v.code || ""), w.codeNote, w.cta + ": " + reviewUrl, "",
    w.checksTitle + ":", ...w.checks.map((c) => "- " + c[0] + ": " + c[1]), "",
    w.fixTitle + ":", w.fixLead,
    ...fixOffers.PACKAGES.map((pkg) => "- " + (pkg.name[code] || pkg.name.en) + ": " + money(fixOffers.usdOf(pkg, o.now)) + (fixOffers.launchOn(o.now) ? " (" + fill(w.listLabel, { usd: pkg.listUsd }) + ")" : "") + ", " + fill(w.fixDays, { days: pkg.days })),
    copyOf(code).F.noCoupon, "", w.cta2 + ": " + callUrl, "", footerText(code, w.why, v.stopUrl, w.stop)
  ].join("\n");
  return { subject: w.subjects[theme], preheader, html: shell(code, theme, preheader, inner), text, option: theme, lang: code };
}

// The cheapest package today, for "from US$..." lines.
function fromUsd(now) {
  return Math.min.apply(null, fixOffers.PACKAGES.map((pkg) => fixOffers.usdOf(pkg, now)));
}

// Outreach and student notes read as a letter: one column, few images, one button.
function letter(lang, preheader, body, foot) {
  const t = THEMES.glass;
  const inner = "<tr><td style=\"padding:0 4px 14px;\">" + fusion.logoCell(36) + "</td></tr>" +
    card("glass", body, "30px 32px 18px", "border-top:4px solid " + fusion.FUSION.teal + ";") + foot;
  return shell(lang, "glass", preheader, inner).replace("background:" + t.page + ";" + t.pageImg, "background:" + t.page + ";");
}

function bullets(items) {
  const t = THEMES.glass;
  return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:0 0 14px;\">" + items.map((item) =>
    "<tr><td width=\"22\" valign=\"top\" style=\"padding:3px 0 8px;font-size:15px;line-height:22px;color:" + t.accent + ";\" class=\"lm-accent\">&#9679;</td>" +
    "<td valign=\"top\" class=\"lm-body\" style=\"padding:0 0 8px;" + SANS + "font-size:15px;line-height:22px;color:" + t.body + ";\"><b class=\"lm-strong\" style=\"color:" + t.strong + ";\">" + esc(item[0]) + "</b> &middot; " + esc(item[1]) + "</td></tr>").join("") + "</table>";
}

/** The cold note to a site's listed contact. vars: { host, name, reportUrl, date, count, critical, stopUrl }. */
function outreachMail(lang, vars, opts) {
  const code = langOf(lang);
  const w = copyOf(code).O;
  const L = copyOf(code).L;
  const v = Object.assign({ host: "", name: "" }, vars || {});
  const now = opts && opts.now;
  const host = String(v.host || "").slice(0, 120);
  const checkUrl = pageUrl(code, { url: host ? "https://" + host + "/" : "", utm_campaign: "outreach-launch" });
  const fixes = fill(w.fixes, { from: fromUsd(now) });
  const prices = fixOffers.PACKAGES.map((pkg) => (pkg.name[code] || pkg.name.en) + " " + money(fixOffers.usdOf(pkg, now))).join(" · ");
  const report = v.reportUrl ? fill(w.report, { host, date: v.date || "", count: v.count || 0, critical: v.critical || 0 }) : "";
  const hello = v.name ? fill(w.hello, { name: v.name }) : w.helloAnon;
  const t = THEMES.glass;
  const body = p("glass", esc(hello), "lm-strong") + p("glass", esc(fill(w.intro, { host }))) + bullets(L.checks) +
    p("glass", esc(fixes)) + p("glass", esc(prices) + (fixOffers.launchOn(now) ? " &middot; <span class=\"lm-accent\" style=\"color:" + t.accent + ";font-weight:bold;\">" + esc(L.launchLabel) + "</span>" : ""), "lm-muted", "font-size:13px;line-height:20px;") +
    (report ? p("glass", esc(report) + " <a href=\"" + esc(v.reportUrl) + "\" class=\"lm-accent\" style=\"color:" + t.accent + ";text-decoration:underline;\">" + esc(w.reportCta) + "</a>") : "") +
    "<div style=\"margin:6px 0 8px;\">" + button(checkUrl, fill(w.cta, { host: host || "your site" }), t.btn, t.btnText) + "</div>" +
    p("glass", esc(w.sign), "lm-strong", "margin:8px 0 0;");
  const why = fill(w.why, { host });
  const subject = fill(w.subject, { host });
  const preheader = w.preheader;
  const text = [hello, "", fill(w.intro, { host }), ...L.checks.map((c) => "- " + c[0] + ": " + c[1]), "", fixes, prices, report ? report + " " + v.reportUrl : "",
    fill(w.cta, { host: host || "your site" }) + ": " + checkUrl, "", w.sign, "", footerText(code, why, v.stopUrl, w.stop)].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
  return { subject, preheader, html: letter(code, preheader, body, footer("glass", code, why, v.stopUrl, w.stop)), text, lang: code };
}

/** The note to a student. vars: { name, trialUrl, days, pct, stopUrl }; days and pct default to the outreach trial's. */
function studentOutreachMail(lang, vars, opts) {
  const code = langOf(lang);
  const w = copyOf(code).S;
  const L = copyOf(code).L;
  const trial = require("./outreach-trials").TRIAL;
  const v = Object.assign({ days: trial.days, pct: trial.followup.student }, vars || {});
  const now = opts && opts.now;
  const t = THEMES.glass;
  const url = v.trialUrl || pageUrl(code, { utm_campaign: "students-launch" });
  const hello = v.name ? fill(w.hello, { name: v.name }) : w.helloAnon;
  const checks = L.checks.slice(0, 3).concat(w.extra);
  const offer = fill(w.offer, { days: v.days, pct: v.pct });
  const fixes = fill(w.fixes, { from: fromUsd(now) });
  const body = p("glass", esc(hello), "lm-strong") + p("glass", esc(w.intro)) + bullets(checks) +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:0 0 14px;\"><tr><td class=\"lm-chip\" bgcolor=\"" + t.chip + "\" style=\"background:" + t.chip + ";border-radius:12px;padding:14px 16px;" + SANS + "font-size:16px;line-height:24px;font-weight:bold;color:" + t.strong + ";\"><span class=\"lm-strong\">" + esc(offer) + "</span></td></tr></table>" +
    p("glass", esc(fixes), "lm-muted", "font-size:14px;line-height:21px;") +
    "<div style=\"margin:6px 0 8px;\">" + button(url, w.cta, t.btn, t.btnText) + "</div>" + p("glass", esc(w.sign), "lm-strong", "margin:8px 0 0;");
  const preheader = fill(w.preheader, { days: v.days });
  const text = [hello, "", w.intro, ...checks.map((c) => "- " + c[0] + ": " + c[1]), "", offer, fixes, "", w.cta + ": " + url, "", w.sign, "", footerText(code, w.why, v.stopUrl, w.stop)].join("\n");
  return { subject: w.subject, preheader, html: letter(code, preheader, body, footer("glass", code, w.why, v.stopUrl, w.stop)), text, lang: code };
}

/** Whether the fixable follow-up goes out at all: off unless FIXABLE_FOLLOWUP_MAIL=on. */
function fixableOn(env) {
  return !!env && env.FIXABLE_FOLLOWUP_MAIL === "on";
}

/**
 * "Your report found something we can fix", for a url_reviews row with its report; null when no package covers an
 * open finding. opts: { stopUrl, now }.
 */
function fixableMail(record, opts) {
  const o = opts || {};
  const report = (record && record.report) || {};
  const offers = fixOffers.offersFor((report.insights && report.insights.findings) || [], o.now);
  if (!offers.length) return null;
  const code = langOf(record.lang);
  const w = copyOf(code).F;
  const L = copyOf(code).L;
  const b = base.COPY[code];
  const host = String(report.host || "").slice(0, 120) || "your site";
  const n = offers.reduce((sum, offer) => sum + offer.findings.length, 0);
  const only = {};
  offers.forEach((offer) => { only[offer.id] = offer.findings.length === 1 ? w.one : fill(w.many, { count: offer.findings.length }); });
  const url = pageUrl(code, { report: record.id || report.id, utm_campaign: "fixable-followup" }) + "#fix-offer";
  const vars = { host, n, from: Math.min.apply(null, offers.map((offer) => offer.usd)) };
  const t = THEMES.glass;
  const inner = fusion.band(esc(w.eyebrow), esc(w.title), "") +
    "<tr><td class=\"lm-card lm-px\" bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:26px 28px 18px;" + SANS + "\">" +
    p("glass", esc(fill(w.lead, vars))) +
    (fixOffers.launchOn(o.now) ? "<p class=\"lm-accent\" style=\"margin:0 0 6px;" + SANS + "font-size:12px;line-height:16px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;color:" + t.accent + ";\">" + esc(L.launchLabel) + "</p>" : "") +
    packageRows("glass", code, L, o.now, only) +
    "<div style=\"margin:16px 0 4px;\">" + button(url, w.cta, fusion.FUSION.teal, fusion.FUSION.night, "#3a9aa2") + "</div>" +
    p("glass", "<b class=\"lm-strong\" style=\"color:" + t.strong + ";\">" + esc(w.selfTitle) + "</b> " + esc(w.self), "lm-body", "font-size:15px;line-height:22px;") +
    p("glass", esc(w.noCoupon), "lm-muted", "margin:0;font-size:13px;line-height:19px;") +
    "</td></tr>";
  const why = fill(b.why, { host });
  const preheader = fill(w.preheader, vars);
  const shellHtml = shell(code, "glass", preheader, inner + "<tr><td style=\"height:12px;line-height:12px;font-size:0;\">&nbsp;</td></tr>" + footer("glass", code, why, o.stopUrl, b.stop))
    .replace("background:" + t.page + ";" + t.pageImg, "background:" + fusion.PAGE_BG + ";");
  const text = [w.title, "", fill(w.lead, vars), "",
    ...offers.map((offer) => { const pkg = fixOffers.packageById(offer.id); return "- " + (pkg.name[code] || pkg.name.en) + " (" + only[offer.id] + "): " + money(offer.usd) + (fixOffers.launchOn(o.now) ? ", " + L.launchLabel : ""); }),
    "", w.cta + ": " + url, "", w.selfTitle + " " + w.self, w.noCoupon, "", footerText(code, why, o.stopUrl, b.stop)].join("\n");
  return { subject: fill(w.subject, vars), preheader, html: shellHtml, text, lang: code, count: n };
}

module.exports = { OPTIONS, THEMES, HERO, HERO_SIZE, ASSETS, launchMail, outreachMail, studentOutreachMail, fixableMail, fixableOn, fromUsd, button };
