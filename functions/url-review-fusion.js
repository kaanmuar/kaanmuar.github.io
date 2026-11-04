/**
 * The Fusion look of QA-lab URL Review mail: a night header band with the mark over a light body.
 * Mail clients drop CSS gradients, so every gradient sits over a solid bgcolor that reads on its own.
 */
const FUSION = { night: "#071116", ink: "#102226", deep: "#0d6e76", teal: "#4db3bb", cyan: "#7ef6fb", gold: "#e2c48a", mint: "#6fe3b1", coral: "#f39a8b", violet: "#b9a8ff", pearl: "#e9fdff" };

// Text on the white body. The accents are too light for AA there, so each has a darker reading shade.
const TEXT = { strong: "#102226", body: "#2c4248", muted: "#56707a", link: "#0d6e76", pass: "#13795b", risk: "#8a5a12", fail: "#b3412f", critical: "#9b2f22", rival: "#5b45b8" };

// Text on the night band.
const ON_NIGHT = { title: "#ffffff", eyebrow: "#7ef6fb", meta: "#a9c4c8", soft: "#c6dcdf" };

const PAGE_BG = "#eef4f5";
const LINE = "#dbe7e9";
const TRACK = "#e3edef";
const SERIF = "font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:normal;";
const LOGO = "https://carlosandmunoz.com/assets/qa-review-logo.png";
const BAND = "background:#071116;background-image:linear-gradient(135deg,#071116 0%,#102226 58%,#0d6e76 100%);";
const PANEL = "background:#071116;background-image:linear-gradient(120deg,#071116 0%,#102226 70%,#0d4f55 100%);";

function logoCell(size) {
  return "<img src=\"" + LOGO + "\" width=\"" + size + "\" height=\"" + size + "\" alt=\"QA-lab URL Review\" style=\"display:block;width:" + size + "px;height:" + size + "px;border:0;outline:none;text-decoration:none;border-radius:" + Math.round(size * 0.23) + "px;\">";
}

// The cyan, teal and gold of the mark's spectrum fan, as a hairline under the band.
function spectrum() {
  const cell = (color, width) => "<td width=\"" + width + "%\" bgcolor=\"" + color + "\" style=\"background:" + color + ";height:4px;line-height:4px;font-size:0;\">&nbsp;</td>";
  return "<tr><td style=\"padding:0;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>" +
    cell(FUSION.cyan, 34) + cell(FUSION.teal, 33) + cell(FUSION.gold, 33) + "</tr></table></td></tr>";
}

// eyebrow and title are HTML already escaped; rest is more band content under the title.
function band(eyebrow, title, rest, opts) {
  const o = opts || {};
  return "<tr><td bgcolor=\"" + FUSION.night + "\" style=\"" + BAND + "border-radius:16px 16px 0 0;padding:" + (o.padding || "26px 28px 24px") + ";font-family:Arial,Helvetica,sans-serif;\">" +
    "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 16px;\"><tr>" +
    "<td width=\"48\" style=\"padding:0 14px 0 0;vertical-align:middle;\">" + logoCell(48) + "</td>" +
    "<td style=\"vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;letter-spacing:0.12em;text-transform:uppercase;color:" + ON_NIGHT.eyebrow + ";\">" + eyebrow + "</td>" +
    "</tr></table>" +
    "<p style=\"margin:0" + (o.titleGap ? " 0 " + o.titleGap : "") + ";" + SERIF + "font-size:" + (o.size || 28) + "px;line-height:" + Math.round((o.size || 28) * 1.2) + "px;color:" + ON_NIGHT.title + ";\">" + title + "</p>" +
    (rest || "") +
    "</td></tr>" + spectrum();
}

function button(href, label, primary) {
  const style = primary
    ? "display:inline-block;background:" + FUSION.teal + ";color:" + FUSION.night + ";border:1px solid #3a9aa2;"
    : "display:inline-block;background:#ffffff;color:" + TEXT.link + ";border:1px solid " + FUSION.teal + ";";
  return "<a href=\"" + href + "\" style=\"" + style + "text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:20px;padding:13px 22px;border-radius:999px;margin:0 8px 10px 0;\">" + label + "</a>";
}

module.exports = { FUSION, TEXT, ON_NIGHT, PAGE_BG, LINE, TRACK, SERIF, LOGO, BAND, PANEL, logoCell, spectrum, band, button };
