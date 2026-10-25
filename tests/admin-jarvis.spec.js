const { test, expect } = require('@playwright/test');

// Firestore is an in-memory stub seeded from window.__data (collection name → rows), and the
// owner-only /jarvis function is answered by page.route, so the whole Statistics tab runs offline.
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.14.1/';
const STUBS = {
  'firebase-app.js': 'export function initializeApp() { return {}; }',
  'firebase-auth.js': `
    const user = { email: 'kaanmuar@gmail.com', emailVerified: true, getIdToken: async () => 'owner-token' };
    export function getAuth() { return { currentUser: user }; }
    export function onAuthStateChanged(auth, callback) { setTimeout(() => callback(user), 0); return () => {}; }
    export function multiFactor() { return { enrolledFactors: [{ uid: 'totp' }] }; }
    export const TotpMultiFactorGenerator = {};
    export function isSignInWithEmailLink() { return false; }
    const none = () => Promise.resolve();
    export { none as signInWithEmailAndPassword, none as signOut, none as getMultiFactorResolver, none as sendEmailVerification, none as sendSignInLinkToEmail, none as signInWithEmailLink };`,
  'firebase-firestore.js': `
    const data = window.__data || {};
    const snap = (rows) => ({ docs: rows.map((row, i) => ({ id: row.id || String(i), data: () => row })), size: rows.length, empty: !rows.length, forEach(fn) { this.docs.forEach(fn); } });
    export function getFirestore() { return {}; }
    export function doc(db, name, id) { return { path: name + '/' + id, id }; }
    export function collection(db, name) { return { name }; }
    export function query(ref) { return ref; }
    export function where() { return {}; }
    export function orderBy() { return {}; }
    export function limit() { return {}; }
    export function onSnapshot(ref, callback) { setTimeout(() => callback(snap([])), 0); return () => {}; }
    export async function getDocs(ref) { return snap(data[ref.name] || []); }
    export async function getCountFromServer(ref) { return { data: () => ({ count: (data[ref.name] || []).length }) }; }
    export async function getDoc(ref) { const row = data[ref.path]; return { id: ref.id, exists: () => !!row, data: () => row }; }
    export async function setDoc() {}
    export async function updateDoc() {}
    export async function deleteDoc() {}
    export async function addDoc() { return { id: 'new' }; }
    export function serverTimestamp() { return { serverTimestamp: true }; }`,
  'firebase-storage.js': 'export function getStorage() { return {}; } export function ref() { return {}; } export async function uploadString() {} export async function getDownloadURL() { return ""; }'
};

const EXTERNAL = {
  health: { ok: true, jobs: [{ job: 'sweepReviews', ok: false, error: 'quota', endedAt: '2026-10-25T10:00:00Z' }], failures: { total: 2, causes: [{ label: 'timeout', value: 2 }], hosts: [], latest: [] }, reruns: { total: 0, status: [], held: 0 }, alerts: { total: 0, kinds: [], latest: [] }, notices: { total: 0, status: [] }, rivals: { total: 0 }, coupons: { total: 0, uses: 0 }, captures: { total: 0, kinds: [] } },
  jobs: { ok: true, jobs: [{ name: 'sweepReviews', schedule: '*/5 * * * *', timeZone: 'UTC', state: 'ENABLED', lastAttempt: '2026-10-25T10:00:00Z', nextRun: '2026-10-25T10:05:00Z', ok: true, error: '' }] },
  github: { ok: true, ci: [{ name: 'E2E and Visual Tests', conclusion: 'success', url: 'https://github.com/x' }], openBugs: 3, bugAreas: [{ label: 'be', value: 2 }], merged: { total: 5, items: [] }, recent: [] },
  uptime: { ok: true, pages: [{ product: 'cv', name: 'CV', url: 'https://carlosandmunoz.com/', status: 200, ms: 320, bytes: 1000, ok: true }], tlsDaysLeft: 60 },
  ga4: { ok: true, groups: [{ group: 'cv', sessions: 40, users: 30, views: 90, engagement: 55, duration: 70, priorSessions: 20, priorUsers: 15 }], countries: [{ label: 'Colombia', value: 25, prior: 10 }], sources: [], daily: [] },
  cloudflare: { ok: false, error: 'The Cloudflare token needs Zone > Analytics > Read.' },
  speed: { ok: true, pages: [{ product: 'cv', name: 'CV', url: 'https://carlosandmunoz.com/', ok: true, score: 93, lab: {}, field: {} }], crux: null }
};

function seed() {
  const now = Date.now();
  const at = (hoursAgo) => ({ seconds: Math.floor((now - hoursAgo * 3600000) / 1000), nanoseconds: 0 });
  const iso = (hoursAgo) => new Date(now - hoursAgo * 3600000).toISOString();
  return {
    site_events: [
      { id: 'e1', site: 'cv', kind: 'visit', createdAt: at(2), query: '?utm_source=linkedin', lang: 'es', page: '/' },
      { id: 'e2', site: 'cv', kind: 'visit', createdAt: at(30), referrerHost: 'www.google.com', page: '/' },
      { id: 'e3', site: 'cv', kind: 'export', name: 'pdf', createdAt: at(3) },
      { id: 'e4', site: 'studio', kind: 'visit', createdAt: at(4) },
      { id: 'e5', site: 'studio', kind: 'run', createdAt: at(4) },
      { id: 'e6', site: 'lab', kind: 'visit', createdAt: at(5) },
      { id: 'e7', site: 'review', kind: 'click', name: 'qa_review_share', createdAt: at(6) }
    ],
    url_review_opens: [{ id: 'o1', createdAt: at(1), query: '?utm_source=x' }, { id: 'o2', createdAt: at(8) }, { id: 'o3', createdAt: at(9) }],
    url_reviews: [{ id: 'r1', createdAt: iso(1), status: 'complete', paid: true, priceUsd: 9, score: 81, requestedUrl: 'https://shop.example/' }],
    url_review_alerts: [],
    url_review_reports: [],
    'socialHubStats/latest': { updatedAt: new Date().toISOString(), totals: { hubViews: 12, postViews: 7 } }
  };
}

async function openStats(page, hash) {
  const calls = [];
  await page.addInitScript((data) => { window.__data = data; }, seed());
  for (const [file, body] of Object.entries(STUBS)) {
    await page.route(FIREBASE + file, (route) => route.fulfill({ contentType: 'text/javascript', body }));
  }
  await page.route(/cloudfunctions\.net\/jarvis$/, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    const body = JSON.parse(request.postData() || '{}');
    calls.push({ op: body.op, auth: request.headers().authorization, body });
    const answer = EXTERNAL[body.op] || (body.op === 'brief' || body.op === 'ask' ? { ok: true, text: 'Jarvis says the CV is up. Next: answer the inbox.' } : { ok: true, ran: body.job });
    return route.fulfill({ json: Object.assign({ op: body.op }, answer), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/admin.html' + (hash || ''));
  await expect(page.locator('#dashboard')).toBeVisible();
  if (!hash) await page.locator('#stats-tab-btn').click();
  await expect(page.locator('#stats-pane .jv')).toBeVisible();
  return calls;
}

test.describe('admin statistics (Jarvis)', () => {
  test('splits every product into its own tab and reads the owner-only function with a token', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page);
    const tabs = page.locator('.jv-tabs [role="tab"]');
    await expect(tabs).toHaveCount(9);
    await expect(tabs).toContainText(['Overview', 'Inbox', 'CV', 'QA Studio', 'QA Lab', 'URL Review', 'Social hub', 'Traffic', 'Systems']);
    await expect(page.locator('#jv-hello')).toContainText('Carlos');
    await expect(page.locator('[data-view="overview"] .jv-briefing')).toContainText('sweepReviews');
    await expect(page.locator('#jv-ready')).not.toHaveText('—');
    expect(new Set(calls.map((c) => c.op))).toEqual(new Set(['health', 'jobs', 'github', 'uptime', 'ga4', 'cloudflare', 'speed']));
    expect(calls.every((c) => c.auth === 'Bearer owner-token')).toBe(true);

    await tabs.filter({ hasText: 'CV' }).first().click();
    await expect(page).toHaveURL(/#stats\/cv\//);
    const cv = page.locator('[data-view="cv"]');
    await expect(cv).toBeVisible();
    await expect(cv).toContainText('linkedin (tagged link)');
    await expect(page.locator('[data-view="overview"]')).toBeHidden();

    await tabs.filter({ hasText: 'URL Review' }).click();
    await expect(page.locator('[data-view="review"]')).toContainText('shop.example');

    await tabs.filter({ hasText: 'Traffic' }).click();
    await expect(page.locator('[data-view="traffic"]')).toContainText('Zone > Analytics > Read');
    expect(errors).toEqual([]);
  });

  test('opens straight to a product and range from the link, and the command bar moves around', async ({ page }) => {
    await openStats(page, '#stats/studio/7');
    await expect(page.locator('#stats-pane')).toBeVisible();
    await expect(page.locator('[data-view="studio"]')).toBeVisible();
    await expect(page.locator('#jv-range')).toHaveValue('7');
    await page.keyboard.press('Control+k');
    await expect(page.locator('.jv-palette')).toBeVisible();
    await page.locator('#jv-cmd').fill('show url review');
    await page.keyboard.press('Enter');
    await expect(page.locator('.jv-palette')).toBeHidden();
    await expect(page).toHaveURL(/#stats\/review\/7$/);
    await page.locator('#jv-range').selectOption('30');
    await expect(page).toHaveURL(/#stats\/review\/30$/);
  });

  test('exports JSON and CSV, and the Gemini briefing comes back from the function', async ({ page }) => {
    const calls = await openStats(page);
    await page.locator('[data-menu="export"]').click();
    const [json] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="export-json"]').click()]);
    expect(json.suggestedFilename()).toMatch(/^jarvis-30-.*\.json$/);
    const parsed = JSON.parse(require('fs').readFileSync(await json.path(), 'utf8'));
    expect(Object.keys(parsed.products)).toEqual(expect.arrayContaining(['cv', 'studio', 'lab', 'review', 'inbox']));

    await page.locator('.jv-tabs [data-go="cv"]').click();
    const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('[data-view="cv"] [data-panel-export="csv"]').first().click()]);
    expect(csv.suggestedFilename()).toMatch(/^jarvis-.*\.csv$/);

    await page.locator('.jv-tabs [data-go="overview"]').click();
    await page.locator('[data-view="overview"] [data-act="ai-brief"]').click();
    await expect(page.locator('[data-view="overview"]')).toContainText('Jarvis says the CV is up');
    const brief = calls.find((c) => c.op === 'brief');
    expect(brief.body.snapshot.products.cv).toBeTruthy();
  });

  test('a job only runs after confirming', async ({ page }) => {
    const calls = await openStats(page, '#stats/systems/30');
    const run = page.locator('[data-view="systems"] [data-run="sweepReviews"]').first();
    await expect(run).toBeVisible();
    page.once('dialog', (dialog) => dialog.dismiss());
    await run.click();
    expect(calls.some((c) => c.op === 'run-job')).toBe(false);
    page.once('dialog', (dialog) => dialog.accept());
    await run.click();
    await expect.poll(() => calls.filter((c) => c.op === 'run-job').map((c) => c.body.job)).toEqual(['sweepReviews']);
  });
});
