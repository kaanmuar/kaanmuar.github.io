/**
 * Adds the Schedule a call button (#1971) to the two CV reply templates in SendGrid, which live only in SendGrid.
 * functions/index.js sends booking_url and booking_label with each reply; the button shows only when booking_url is
 * set. Each template gets a new active version, so the old one stays in SendGrid to switch back to.
 *
 *   SENDGRID_API_KEY=... node scripts/sendgrid-booking-button.js --dry-run   shows where the button goes
 *   SENDGRID_API_KEY=... node scripts/sendgrid-booking-button.js             adds it
 */
const TEMPLATES = {
  "d-44eba8ad4165473a81c1154d398ef82f": "CV message reply",
  "d-8d630958ddd4407eb0d5b2f88a87d07b": "CV rating reply"
};
const API = "https://api.sendgrid.com/v3/templates/";
const BUTTON = "{{#if booking_url}}<p style=\"margin:20px 0 8px;\"><a href=\"{{booking_url}}\" style=\"display:inline-block;background:#0d6e76;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:20px;padding:12px 22px;border-radius:999px;\">{{booking_label}}</a></p>{{/if}}";
const PLAIN = "{{#if booking_url}}\n{{booking_label}}: {{booking_url}}\n{{/if}}";

// Right after the element that holds the reply; inside its table cell when the reply sits straight in a <td>.
function withButton(html) {
  const at = html.search(/\{\{\{?\s*admin_response\s*\}?\}\}/);
  if (at < 0) throw new Error("no {{admin_response}} in the template");
  const rest = html.slice(at);
  const close = /<\/(p|div|td)>/i.exec(rest);
  if (!close) throw new Error("no closing tag after {{admin_response}}");
  const index = at + close.index + (close[1].toLowerCase() === "td" ? 0 : close[0].length);
  return { html: html.slice(0, index) + BUTTON + html.slice(index), index };
}

function withPlain(text) {
  const src = String(text || "");
  const at = src.search(/\{\{\{?\s*admin_response\s*\}?\}\}/);
  if (at < 0) return src + "\n\n" + PLAIN;
  const end = src.indexOf("\n", at);
  return end < 0 ? src + "\n\n" + PLAIN : src.slice(0, end + 1) + "\n" + PLAIN + "\n" + src.slice(end + 1);
}

async function sendgrid(path, init) {
  const res = await fetch(API + path, Object.assign({}, init, { headers: { Authorization: "Bearer " + process.env.SENDGRID_API_KEY, "Content-Type": "application/json" } }));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(path + ": SendGrid " + res.status + " " + JSON.stringify(body.errors || body).slice(0, 300));
  return body;
}

async function main() {
  if (!process.env.SENDGRID_API_KEY) throw new Error("Set SENDGRID_API_KEY.");
  const dry = process.argv.includes("--dry-run");
  for (const [id, name] of Object.entries(TEMPLATES)) {
    const template = await sendgrid(id);
    const active = (template.versions || []).find((v) => v.active === 1);
    if (!active) { console.log(name + ": no active version, skipped"); continue; }
    if (/booking_url/.test(active.html_content || "")) { console.log(name + ": already has the button"); continue; }
    const next = withButton(active.html_content || "");
    if (dry) {
      console.log(name + " (" + active.name + "), button goes here:\n…" + next.html.slice(Math.max(0, next.index - 240), next.index + BUTTON.length + 120) + "…\n");
      continue;
    }
    const made = await sendgrid(id + "/versions", {
      method: "POST",
      body: JSON.stringify({ name: (active.name + " + call button").slice(0, 100), subject: active.subject, html_content: next.html, plain_content: withPlain(active.plain_content), active: 1, editor: "code" })
    });
    console.log(name + ": version " + made.id + " is active; " + active.id + " stays to switch back to");
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { withButton, withPlain, BUTTON };
