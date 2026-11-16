import http from 'k6/http';
import { check, sleep } from 'k6';

// PERF-01..PERF-08. Eight virtual users for 20s on the local static server.
// Pass when checks succeed, failed requests stay under 1%, and p95 stays under 2500 ms.
const base = __ENV.BASE_URL || 'http://127.0.0.1:8767';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(base)) {
  throw new Error('This load test only runs against the local static server');
}

export const options = {
  scenarios: {
    pages: {
      executor: 'constant-vus',
      vus: 8,
      duration: '20s'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2500'],
    checks: ['rate>0.99']
  }
};

const wanted = String(__ENV.CATALOG_IDS || '').split(',').map((item) => item.trim()).filter(Boolean);
const pages = [
  { id: 'PERF-01', path: '/', marker: 'Carlos Muñoz' },
  { id: 'PERF-02', path: '/qa-lab.html', marker: 'The suite I run on this CV' },
  { id: 'PERF-03', path: '/simulador.html', marker: 'Run 4-agent sprint' },
  { id: 'PERF-04', path: '/style.css', marker: 'tailwindcss' },
  { id: 'PERF-04', path: '/js/cv-app.js', marker: 'initializeApp' },
  { id: 'PERF-05', path: '/favicon.svg', marker: 'Carlos Muñoz CV' },
  { id: 'PERF-06', path: '/css/cv.css', marker: '.trademark' },
  { id: 'PERF-06', path: '/css/site-look.css', marker: 'html[data-look]' },
  { id: 'PERF-07', path: '/robots.txt', marker: 'User-agent' },
  { id: 'PERF-07', path: '/sitemap.xml', marker: 'carlosandmunoz.com' },
  { id: 'PERF-08', path: '/js/qa-lab.js', marker: 'Run with' },
  { id: 'PERF-08', path: '/js/site-look.js', marker: 'Golden Gate' }
].filter((page) => !wanted.length || wanted.includes(page.id));

export default function () {
  const page = pages[__ITER % pages.length];
  const res = http.get(base + page.path, { tags: { case: page.id } });
  check(res, {
    'status 200': (r) => r.status === 200,
    'expected text': (r) => String(r.body || '').includes(page.marker)
  });
  sleep(0.3);
}
