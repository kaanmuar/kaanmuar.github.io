const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const PAGES = [
  { id: 'PERF-01', path: '/', marker: 'Carlos Muñoz', title: 'CV page' },
  { id: 'PERF-02', path: '/qa-lab.html', marker: 'The suite I run on this CV', title: 'QA lab page' },
  { id: 'PERF-03', path: '/simulador.html', marker: 'Run 4-agent sprint', title: 'Studio page' },
  { id: 'PERF-04', path: '/style.css', marker: 'tailwindcss', title: 'Stylesheet and CV script' },
  { id: 'PERF-04', path: '/js/cv-app.js', marker: 'initializeApp', title: 'Stylesheet and CV script' },
  { id: 'PERF-05', path: '/favicon.svg', marker: 'Carlos Muñoz CV', title: 'Favicon' },
  { id: 'PERF-06', path: '/css/cv.css', marker: '.trademark', title: 'CV layout and shared look' },
  { id: 'PERF-06', path: '/css/site-look.css', marker: 'html[data-look]', title: 'CV layout and shared look' },
  { id: 'PERF-07', path: '/robots.txt', marker: 'User-agent', title: 'robots.txt and sitemap' },
  { id: 'PERF-07', path: '/sitemap.xml', marker: 'carlosandmunoz.com', title: 'robots.txt and sitemap' },
  { id: 'PERF-08', path: '/js/qa-lab.js', marker: 'Run with', title: 'Lab script and look script' },
  { id: 'PERF-08', path: '/js/site-look.js', marker: 'Golden Gate', title: 'Lab script and look script' }
];

function selectedPages() {
  const ids = String(process.env.CATALOG_IDS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!ids.length) return PAGES.slice();
  return PAGES.filter((page) => ids.includes(page.id));
}

function p95(values) {
  const sorted = values.filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function casesFromSamples(samples) {
  const titles = {};
  PAGES.forEach((page) => { titles[page.id] = page.title; });
  const ids = [];
  samples.forEach((sample) => { if (!ids.includes(sample.id)) ids.push(sample.id); });
  return ids.map((id) => {
    const rows = samples.filter((sample) => sample.id === id);
    const elapsed = rows.map((sample) => sample.ms);
    const failed = rows.filter((sample) => !sample.ok).length;
    const ms = p95(elapsed);
    const rate = rows.length ? failed / rows.length : 1;
    const ok = rows.length > 0 && rate < 0.01 && ms <= 2500;
    return {
      title: id + ' ' + (titles[id] || id),
      ok,
      ms,
      error: ok ? '' : (rows.length + ' samples, ' + failed + ' failed, p95 ' + ms + ' ms')
    };
  });
}

function writeSummary(framework, cases) {
  const dir = path.join(root, 'runner-results');
  fs.mkdirSync(dir, { recursive: true });
  const data = { framework, cases: cases || [] };
  fs.writeFileSync(path.join(dir, framework + '.json'), JSON.stringify(data, null, 2));
  return data;
}

module.exports = { PAGES, selectedPages, casesFromSamples, writeSummary, root };
