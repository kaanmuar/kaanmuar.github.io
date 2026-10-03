import http from 'k6/http';
import { check, sleep } from 'k6';

// PERF-01..PERF-04. Eight virtual users for 20s on the local static server.
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

const pages = [
  { id: 'PERF-01', path: '/', marker: 'Carlos Muñoz' },
  { id: 'PERF-02', path: '/qa-lab.html', marker: 'The suite I run on this CV' },
  { id: 'PERF-03', path: '/simulador.html', marker: 'Run 4-agent sprint' },
  { id: 'PERF-04', path: '/style.css', marker: 'tailwindcss' },
  { id: 'PERF-04', path: '/js/cv-app.js', marker: 'initializeApp' }
];

export default function () {
  const page = pages[__ITER % pages.length];
  const res = http.get(base + page.path, { tags: { case: page.id } });
  check(res, {
    'status 200': (r) => r.status === 200,
    'expected text': (r) => String(r.body || '').includes(page.marker)
  });
  sleep(0.3);
}
