import { readFileSync, writeFileSync } from "fs";
import vm from "vm";

const src = readFileSync(new URL("../js/cv-data.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const data = sandbox.window.CVData;
const en = data.translations.en;

const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const companies = {
  "Team International": "https://www.teaminternational.com",
  "RockStar Coders Agency": "https://www.rockstarcoders.com",
  "Globant": "https://www.globant.com",
  "Genius Sports": "https://www.geniussports.com",
  "Zagalabs": "https://zagalabs.com",
  "The Collective Intelligence Group": "https://thecollectiveintelligencegroup.com",
  "Bitgray": "https://bitgray.co",
  "Prodigious LATAM (Razorfish)": "https://www.prodigious.com",
  "Advantech": "https://www.advantech.com",
  "Intel Corporation": "https://www.intel.com",
  "Belcorp": "https://www.belcorp.com",
  "McAfee": "https://www.mcafee.com"
};

const link = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

const companyHtml = (name) => {
  const href = companies[name];
  return href ? link(href, name) : esc(name);
};

const labels = {
  pm: "Delivery",
  qa: "Quality engineering",
  lang: "Languages and test frameworks",
  cloud: "Cloud and delivery",
  analytics: "Observability and security",
  platform: "Platforms",
  system: "Systems",
  db: "Data"
};

const blocks = [];

blocks.push(`
  <header class="mast">
    <h1>Carlos A. Muñoz</h1>
    <p class="role">${esc(en.job_title)}</p>
    <p class="loc">Medellín, Colombia</p>
    <p class="contact">${link("mailto:kaanmuar@gmail.com", "kaanmuar@gmail.com")} · ${link("tel:+573209191010", "+57 320 919 1010")} · ${link("https://www.linkedin.com/in/carlos-andres-m-2a60b8b/", "linkedin.com/in/carlos-andres-m-2a60b8b")} · ${link("https://kaanmuar.github.io/", "kaanmuar.github.io")}</p>
  </header>
`);

blocks.push(`<h2>See the work for yourself</h2>`);
blocks.push(`<p class="live">${link("https://kaanmuar.github.io/qa-lab.html", "QA regression lab")} — Curious how this CV gets checked? Open it and watch the tests move through the page, then see what passed. Free, and nothing to install.</p>`);
blocks.push(`<p class="live">${link("https://kaanmuar.github.io/simulador.html", "SDLC studio")} — Want to sit in on a software project? Open it and follow one feature from the planning board until the team has tested it and it is ready to ship.</p>`);

const jobBlock = (exp, current) => {
  const bullets = (exp.details.en || []).map((line) => `<li>${esc(line)}</li>`).join("");
  const tech = (exp.techUsed || []).join(", ");
  return `
    <article class="job${current ? " current" : ""}">
      <div class="job-row">
        <h3>${current ? `<span class="now">Current</span>` : ""}${esc(exp.title)}</h3>
        <p class="dates">${esc(exp.dates)}</p>
      </div>
      <p class="company">${companyHtml(exp.company)}</p>
      <ul>${bullets}</ul>
      ${tech ? `<p class="stack"><span>Stack</span> ${esc(tech)}</p>` : ""}
    </article>
  `;
};

blocks.push(`<h2>Skills</h2>`);
Object.keys(data.skills).forEach((key) => {
  const names = data.skills[key].map((skill) => skill.name).join(", ");
  blocks.push(`<p class="skill"><strong>${esc(labels[key] || key)}.</strong> ${esc(names)}</p>`);
});

blocks.push(`<h2>Current role</h2>`);
blocks.push(jobBlock(data.experiences[0], true));

blocks.push(`<h2>Certifications</h2>`);
[
  ["English proficiency", "EF SET C2 Proficient"],
  ["Project management", "CSPM"],
  ["Quality assurance", "CASQ, CAST, CSQA, ISTQB"],
  ["Information security", "CISA, CISM, CISSP"]
].forEach(([label, value]) => {
  blocks.push(`<p class="edu"><strong>${esc(label)}</strong> · ${esc(value)}</p>`);
});

blocks.push(`<h2>Languages</h2>`);
blocks.push(`<p>Spanish, native · English, fluent (C2) · Portuguese, fluent · Others, basic</p>`);

blocks.push(`<h2>Experience</h2>`);
data.experiences.slice(1).forEach((exp) => {
  blocks.push(jobBlock(exp, false));
});

blocks.push(`<h2>Education</h2>`);
[
  ["Specialization in Management on IT Projects", "Alexander Von-Humboldt University"],
  ["Computer Systems Engineering", "EAMQ"],
  ["Computer Systems Technician", "EAMQ"]
].forEach(([degree, school]) => {
  blocks.push(`<p class="edu"><strong>${esc(degree)}</strong> · ${esc(school)}</p>`);
});

blocks.push(`<h2>Summary</h2>`);
blocks.push(`<p>${esc(en.summary_text)}</p>`);
blocks.push(`<p>${esc(en.summary_detail_1)}</p>`);
blocks.push(`<p>${esc(en.summary_detail_2)}</p>`);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sample · proposed CV print · full length</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet">
  <style>
    :root { --ink: #12181f; --muted: #4a5560; --line: #d5dce3; --accent: #0d6e76; --paper: #f3f1ec; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--paper); color: var(--ink); font-family: Inter, Arial, sans-serif; }
    .preview-bar { position: sticky; top: 0; z-index: 2; background: #1c242c; color: #f4f7f8; padding: 10px 16px; font-size: 13px; display: flex; justify-content: space-between; gap: 12px; }
    .preview-bar strong { font-weight: 600; }
    #desk { padding: 24px 16px 48px; }
    .sheet { width: 210mm; height: 297mm; margin: 0 auto 18px; background: #fff; position: relative; }
    .sheet-body { position: absolute; top: 14mm; left: 16mm; right: 16mm; bottom: 12mm; overflow: hidden; }
    .sheet-foot { position: absolute; left: 16mm; right: 16mm; bottom: 6mm; border-top: 1px solid var(--line); padding-top: 2mm; display: flex; justify-content: space-between; font-size: 8pt; color: var(--muted); }
    .measure { position: absolute; left: -10000px; top: 0; width: 178mm; }
    h1, h2, h3 { font-family: "Source Serif 4", Georgia, serif; font-weight: 600; color: var(--ink); }
    h1 { font-size: 22pt; line-height: 1.05; margin: 0; letter-spacing: -0.02em; }
    a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
    .role { margin: 4px 0 0; font-size: 11pt; color: var(--accent); font-weight: 600; }
    .loc, .contact { margin: 3px 0 0; font-size: 9pt; color: var(--muted); }
    .contact { line-height: 1.4; }
    h2 { font-size: 12pt; margin: 14px 0 6px; padding-bottom: 2px; border-bottom: 1.5px solid var(--accent); }
    p { margin: 0 0 7px; font-size: 10.5pt; line-height: 1.45; }
    .skill { margin-bottom: 4px; }
    .live { margin-bottom: 4px; }
    .job { margin: 0 0 16px; }
    .job.current { margin-top: 2px; padding-left: 10px; border-left: 3px solid var(--accent); }
    .now { display: inline-block; margin-right: 8px; padding: 1px 6px 2px; border: 1px solid var(--accent); color: var(--accent); font-family: Inter, Arial, sans-serif; font-size: 8pt; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; vertical-align: 2px; }
    .job-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .job h3 { font-size: 11pt; margin: 0; }
    .dates { margin: 0; font-size: 9.5pt; color: var(--muted); white-space: nowrap; }
    .company { margin: 1px 0 4px; font-size: 10pt; font-weight: 600; }
    ul { margin: 0; padding: 0 0 0 16px; }
    li { font-size: 10.5pt; line-height: 1.45; margin: 0 0 3px; }
    .block { display: flow-root; }
    .stack { margin: 3px 0 0; font-size: 8.5pt; line-height: 1.35; color: var(--muted); }
    .stack span { color: var(--accent); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; font-size: 7.5pt; margin-right: 4px; }
    .edu { margin-bottom: 2px; }
  </style>
</head>
<body>
  <div class="preview-bar">
    <span><strong>Sample.</strong> Same content, reordered so skills, the current role, and proof come before the earlier career and the long summary.</span>
    <span id="count"></span>
  </div>
  <div id="measure" class="measure"></div>
  <div id="desk"></div>
  <script>
    const blocks = ${JSON.stringify(blocks)};
    const measure = document.getElementById("measure");
    const desk = document.getElementById("desk");

    function pack() {
      measure.innerHTML = blocks.map((html, i) => '<div class="block" data-i="' + i + '">' + html + "</div>").join("");
      const bodyLimit = measure.parentElement.querySelector(".sheet-body") 
        ? 0 
        : null;
      const probe = document.createElement("div");
      probe.className = "sheet";
      probe.style.visibility = "hidden";
      probe.innerHTML = '<div class="sheet-body"></div>';
      document.body.appendChild(probe);
      const limit = probe.querySelector(".sheet-body").clientHeight;
      probe.remove();

      const nodes = [...measure.children];
      const heights = nodes.map((node) => node.getBoundingClientRect().height);
      const pages = [];
      let page = [];
      let used = 0;
      const slack = 8;
      nodes.forEach((node, index) => {
        const h = heights[index];
        const isHead = node.querySelector(":scope > h2");
        const next = heights[index + 1] || 0;
        const room = limit - used - slack;
        if (used > 0 && h > room) {
          pages.push(page);
          page = [];
          used = 0;
        } else if (used > 0 && isHead && next > 0 && h + next > room) {
          pages.push(page);
          page = [];
          used = 0;
        }
        page.push(node.innerHTML);
        used += h;
      });
      if (page.length) pages.push(page);

      desk.innerHTML = pages.map((parts, index) => \`
        <section class="sheet" id="page-\${index + 1}">
          <div class="sheet-body">\${parts.join("")}</div>
          <footer class="sheet-foot">
            <span>Carlos A. Muñoz · <a href="https://kaanmuar.github.io/">kaanmuar.github.io</a></span>
            <span>\${index + 1} / \${pages.length}</span>
          </footer>
        </section>
      \`).join("");
      document.getElementById("count").textContent = pages.length + " pages · A4";
      measure.remove();
    }

    document.fonts.ready.then(() => requestAnimationFrame(pack));
  </script>
</body>
</html>
`;

writeFileSync(new URL("../preview-cv-print.html", import.meta.url), html);
console.log("wrote preview, blocks", blocks.length);
