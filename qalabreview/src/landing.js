/* The qalabreview.com landing (#1867): a home and one page per audience in six languages, static HTML from the Worker.
   Every button leaves for carlosandmunoz.com through `link`, which adds the utm tags Jarvis counts. */
import { LABELS, SEGMENTS } from "./copy.js";

export const ORIGIN = "https://qalabreview.com";
export const AUDIENCES = Object.keys(SEGMENTS);
const ASSETS = "https://carlosandmunoz.com/assets/";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const path = (lang, audience) => "/" + [lang, audience].filter(Boolean).join("/");
const list = (items, cls) => `<ul${cls ? ` class="${cls}"` : ""}>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

const CSS = `
:root{color-scheme:dark;--bg:#10161d;--panel:rgba(22,29,38,.72);--line:#2a3440;--text:#e8eef2;--muted:#a9b4bf;--cyan:#4db3bb;--em:#7ef6fb}
*{box-sizing:border-box}
body{margin:0;font:400 1rem/1.55 Inter,system-ui,sans-serif;color:var(--text);background:var(--bg) linear-gradient(165deg,#2a2118 0%,#10161d 46%,#0e2430 100%) fixed}
a{color:var(--em)}
a:focus-visible{outline:2px solid var(--em);outline-offset:3px;border-radius:4px}
.wrap{max-width:68rem;margin:0 auto;padding:0 1.25rem}
.top{display:flex;flex-wrap:wrap;gap:.75rem 1rem;align-items:center;justify-content:space-between;padding:1rem 0}
.brand{display:flex;gap:.6rem;align-items:center;color:var(--text);text-decoration:none;font-family:"Instrument Serif",Georgia,serif;font-size:1.5rem;line-height:1}
.brand small{display:block;font:600 .68rem/1.4 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.langs{display:flex;flex-wrap:wrap;gap:.25rem}
.langs a{padding:.35rem .55rem;border-radius:999px;color:var(--muted);text-decoration:none;font-size:.85rem;font-weight:600}
.langs a[aria-current]{color:var(--text);background:var(--panel);box-shadow:inset 0 0 0 1px var(--line)}
.eyebrow{margin:2rem 0 .5rem;color:var(--em);font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
h1{margin:0;font:400 clamp(2.4rem,9vw,4.2rem)/1.02 "Instrument Serif",Georgia,serif;letter-spacing:-.01em;max-width:18ch}
h1 em{color:var(--em)}
.lede{max-width:40rem;margin:1rem 0 0;font-size:1.08rem;color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;align-items:center;margin:1.5rem 0}
.btn{display:inline-block;padding:.85rem 1.4rem;border-radius:999px;background:linear-gradient(135deg,#7ef6fb,#4db3bb);color:#071116;font-weight:700;text-decoration:none}
.btn:hover{filter:brightness(1.08)}
.areas{display:flex;flex-wrap:wrap;gap:.4rem;margin:0;padding:0;list-style:none}
.areas li{padding:.3rem .7rem;border-radius:999px;border:1px solid var(--line);font-size:.85rem;color:var(--muted)}
.panel{margin:2rem 0;padding:1.25rem;border:1px solid var(--line);border-radius:1rem;background:var(--panel)}
.panel p{margin:.25rem 0}
.steps{margin:2rem 0;padding:0;list-style:none;counter-reset:s;display:grid;gap:.75rem}
.steps li{counter-increment:s;display:flex;gap:.75rem;align-items:baseline}
.steps li::before{content:counter(s);flex:none;width:1.8rem;height:1.8rem;border-radius:50%;display:grid;place-items:center;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line);color:var(--em);font-weight:700}
h2{margin:0 0 .6rem;font:400 1.6rem/1.15 "Instrument Serif",Georgia,serif}
.cols{display:grid;gap:1rem;margin:2rem 0}
.cols .panel{margin:0}
.cols ul{margin:0;padding-left:1.1rem}
.cols li{margin:.3rem 0}
.cards{display:grid;gap:.75rem;margin:0;padding:0;list-style:none}
.cards a{display:block;height:100%;padding:1rem 1.1rem;border:1px solid var(--line);border-radius:1rem;background:var(--panel);color:var(--text);text-decoration:none}
.cards a:hover{border-color:var(--cyan)}
.cards span{display:block;color:var(--em);font-size:.78rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.extra{color:var(--muted)}
footer{margin-top:3rem;padding:1.5rem 0 2.5rem;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
footer nav{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin-bottom:1rem}
@media (min-width:48rem){.cols{grid-template-columns:repeat(3,1fr)}.cards{grid-template-columns:repeat(2,1fr)}.steps{grid-template-columns:repeat(3,1fr)}}
`.replace(/\n/g, "");

function extraLinks(text, link) {
  return text.split(" · ").map((part) => {
    const m = part.match(/^(.*?)\s*:\s*carlosandmunoz\.com\/(\S+)$/);
    return m ? `<a href="${esc(link(m[2]))}">${esc(m[1])}</a>` : esc(part);
  }).join(" · ");
}

/* `link(page, extra)` returns a tagged carlosandmunoz.com address; `review` is the free review page for `lang`. */
export function renderLanding(lang, audience, { link, review }) {
  const L = LABELS[lang];
  const seg = audience ? SEGMENTS[audience][lang] : null;
  const canonical = ORIGIN + path(lang, audience);
  const title = seg ? `${seg.kicker} · QA-lab URL Review` : `QA-lab URL Review: ${L.hero.join(" ")}`;
  const description = seg ? seg.sub : SEGMENTS.universities[lang].sub;
  const call = link("book.html", { type: "intro", lang });
  const alternates = Object.keys(LABELS).map((l) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN + path(l, audience)}">`).join("")
    + `<link rel="alternate" hreflang="x-default" href="${ORIGIN + (audience ? "/" + audience : "/")}">`;
  const langs = Object.keys(LABELS).map((l) => `<a href="${path(l, audience)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ""}>${l.toUpperCase()}</a>`).join("");
  const h1 = seg ? esc(seg.headline) : `${esc(L.hero[0])} <em>${esc(L.hero[1])}</em> ${esc(L.hero[2])}`;
  const facts = audience === "colleges"
    ? `<p><strong>${esc(L.labFree)}</strong></p><p>${esc(L.labHonest)}</p><p>${esc(L.free)}</p>`
    : `<p><strong>${esc(L.free)}</strong>. ${esc(L.prices)}.</p><p>${esc(L.reopen)}</p>`;
  const body = seg
    ? `<section class="cols">${seg.cols.map(([h, items]) => `<div class="panel"><h2>${esc(h)}</h2>${list(items)}</div>`).join("")}</section>
<p class="extra">${extraLinks(seg.extra, link)}</p>`
    : `<section><h2>${esc(L.who)}</h2><ul class="cards">${AUDIENCES.map((a) => `<li><a href="${path(lang, a)}"><span>${esc(L.names[a])}</span>${esc(SEGMENTS[a][lang].headline)}</a></li>`).join("")}</ul></section>`;
  const others = audience
    ? `<nav aria-label="${esc(L.others)}"><a href="${path(lang)}">QA-lab URL Review</a>${AUDIENCES.filter((a) => a !== audience).map((a) => `<a href="${path(lang, a)}">${esc(L.names[a])}</a>`).join("")}</nav>`
    : "";

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${alternates}
<meta name="theme-color" content="#071116">
<meta property="og:type" content="website">
<meta property="og:site_name" content="QA-lab URL Review">
<meta property="og:title" content="${esc(seg ? seg.headline : L.hero.join(" "))}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ASSETS}share/qa-review.jpg?v=20261027">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${ASSETS}qa-review-mark.svg?v=20261027a" type="image/svg+xml">
<link rel="icon" href="${ASSETS}qa-review-icon-32.png?v=20261027a" sizes="32x32" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600;700&display=swap">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top">
<a class="brand" href="${path(lang)}"><img src="${ASSETS}qa-review-mark.svg?v=20261027a" width="36" height="36" alt=""><span>QA-lab<small>URL Review</small></span></a>
<nav class="langs" aria-label="${esc(L.language)}">${langs}</nav>
</header>
<main>
<section>
<p class="eyebrow">${esc(seg ? seg.kicker : "QA-lab URL Review")}</p>
<h1>${h1}</h1>
<p class="lede">${esc(description)}</p>
<div class="actions"><a class="btn" href="${esc(review)}">${esc(L.cta)}</a><a href="${esc(call)}">${esc(L.call)}</a></div>
${list(L.areas, "areas")}
</section>
<div class="panel">${facts}</div>
<ol class="steps">${(audience === "colleges" ? L.labSteps : L.steps).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
${body}
<p class="actions"><a class="btn" href="${esc(review)}">${esc(L.cta)}</a></p>
</main>
<footer>
${others}
<p>${esc(L.honest)}</p>
<p>${esc(L.contact)}: Carlos A. Muñoz · <a href="mailto:qa@carlosandmunoz.com">qa@carlosandmunoz.com</a></p>
</footer>
</div>
</body>
</html>
`;
}
