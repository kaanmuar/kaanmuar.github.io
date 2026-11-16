// The inline post: the newest batch at a glance, and a button that opens the ring in Reddit's expanded view.
import { requestExpandedMode } from "@devvit/web/client";

const T = {
  en: { eyebrow: "Live reports · QA-lab", title: "Real sites. Real reviews.", em: "Open any of them.", open: "Turn the ring →", fine: "One automated analysis of public pages each. A starting point, not a verdict.", stat: "<b>{n}</b> public sites · <b>{f}</b> added {d}", top: "Top of the newest batch" },
  es: { eyebrow: "Reportes en vivo · QA-lab", title: "Sitios reales. Revisiones reales.", em: "Abre cualquiera.", open: "Gira el anillo →", fine: "Un análisis automático de páginas públicas cada uno. Un punto de partida, no un veredicto.", stat: "<b>{n}</b> sitios públicos · <b>{f}</b> nuevos el {d}", top: "Lo mejor del lote más reciente" },
  pt: { eyebrow: "Relatórios ao vivo · QA-lab", title: "Sites reais. Análises reais.", em: "Abra qualquer um.", open: "Gire o anel →", fine: "Uma análise automática de páginas públicas cada. Um ponto de partida, não um veredito.", stat: "<b>{n}</b> sites públicos · <b>{f}</b> novos em {d}", top: "Destaques do lote mais recente" },
  de: { eyebrow: "Live-Berichte · QA-lab", title: "Echte Websites. Echte Prüfungen.", em: "Öffnen Sie jede.", open: "Ring drehen →", fine: "Jeweils eine automatische Prüfung öffentlicher Seiten. Ein Ausgangspunkt, kein Urteil.", stat: "<b>{n}</b> öffentliche Websites · <b>{f}</b> neu am {d}", top: "Spitze der neuesten Runde" },
  fr: { eyebrow: "Rapports en direct · QA-lab", title: "De vrais sites. De vraies analyses.", em: "Ouvrez-les.", open: "Faire tourner l’anneau →", fine: "Une analyse automatique de pages publiques chacun. Un point de départ, pas un verdict.", stat: "<b>{n}</b> sites publics · <b>{f}</b> ajoutés le {d}", top: "En tête du dernier lot" },
  it: { eyebrow: "Report dal vivo · QA-lab", title: "Siti reali. Analisi reali.", em: "Aprili tutti.", open: "Gira l’anello →", fine: "Un’analisi automatica di pagine pubbliche ciascuno. Un punto di partenza, non un verdetto.", stat: "<b>{n}</b> siti pubblici · <b>{f}</b> aggiunti il {d}", top: "In testa all’ultimo lotto" }
};
const lang = T[String(navigator.language || "en").slice(0, 2).toLowerCase()] ? String(navigator.language).slice(0, 2).toLowerCase() : "en";
const t = T[lang];
document.documentElement.lang = lang;

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Same bands as the ring's cards (js/qa-review-live.js).
function color(score) {
  if (score >= 90) return "#6fe3b1";
  if (score >= 80) return "#7ef6fb";
  if (score >= 70) return "#e2c48a";
  if (score >= 60) return "#f2b37a";
  return "#f39a8b";
}
function ring(score) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" fill="none" stroke="rgba(159,214,220,.18)" stroke-width="4"/>` +
    `<circle cx="20" cy="20" r="${r}" fill="none" stroke="${color(score)}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 20 20)"/>` +
    `<text x="20" y="24.5" text-anchor="middle" fill="#f4fafb" font-size="12.5" font-weight="700" font-family="Inter, sans-serif">${score}</text></svg>`;
}
function day(iso) {
  try { return new Date(iso + "T12:00:00Z").toLocaleDateString(lang, { month: "short", day: "numeric" }); } catch (error) { return iso; }
}

document.querySelector('[data-t="eyebrow"]').textContent = t.eyebrow;
document.querySelector('[data-t="title"]').innerHTML = esc(t.title) + " <em>" + esc(t.em) + "</em>";
document.querySelector('[data-t="open"]').textContent = t.open;
document.querySelector('[data-t="fine"]').textContent = t.fine;
document.querySelector("[data-top]").setAttribute("aria-label", t.top);

const open = (event) => requestExpandedMode(event, "live");
document.querySelector("[data-open]").addEventListener("click", open);
document.querySelector("[data-top]").addEventListener("click", open);

fetch("summary.json").then((res) => res.json()).then((s) => {
  document.querySelector("[data-stat]").innerHTML = t.stat.replace("{n}", s.count).replace("{f}", s.fresh).replace("{d}", esc(day(s.newest)));
  document.querySelector("[data-top]").innerHTML = s.top.map((r) =>
    `<li>${ring(r.overall)}<span class="name" translate="no"><b>${esc(r.flag)} ${esc(r.name)}</b>${r.host && r.host !== r.name ? `<small>${esc(r.host)}</small>` : ""}</span><span class="grade">${esc(r.grade)}</span></li>`).join("");
}).catch(() => {});
