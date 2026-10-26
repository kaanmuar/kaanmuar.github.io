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
  settings: { ok: true, goals: [{ product: 'cv', metric: 'visits', period: 'week', target: 300 }], thresholds: {}, mail: { daily: true, gemini: true, watch: true, weekly: true }, updatedAt: '2026-10-24T12:00:00Z' },
  proposals: { ok: true, gemini: true, at: '2026-10-25T12:00:00Z', hidden: 1, proposals: [
    { rank: 1, key: 'job', title: 'Fix the failing job', impact: 5, level: 'alert', effort: 'hours', why: 'The sweep feeds the hub.', evidence: ['Job sweepReviews failed: quota.'], source: 'gemini+rules', action: null, tab: 'systems', link: null },
    { rank: 2, key: 'review:held', title: 'Re-run the held reviews', impact: 3, level: 'warn', evidence: ['4 re-runs are held on the desk.'], source: 'gemini+rules', action: 'rerun-held', tab: 'systems', link: null },
    { rank: 3, key: 'ai:price-test', title: 'Test a lower first-review price', impact: 4, level: 'info', evidence: ['3 opens, 1 paid review'], source: 'gemini', action: null, tab: null, link: null }
  ] },
  goals: { ok: true, goals: [{ key: 'cv.visits.week', product: 'cv', metric: 'visits', period: 'week', target: 300, label: 'CV visits this week', value: 120, pct: 40, expected: 107, projected: 336, elapsed: 36, status: 'on-track' }] },
  speed: { ok: true, pages: [{ product: 'cv', name: 'CV', url: 'https://carlosandmunoz.com/', ok: true, score: 93, lab: {}, field: {} }], crux: null },
  money: { ok: true, days: 30, revenue: { usd: 27, count: 3, avgUsd: 9, paidRuns: 5 }, prior: { usd: 9, count: 1, paidRuns: 2 }, refundsUsd: 0, byProvider: [{ label: 'paypal', value: 27 }], byPurpose: [{ label: 'review', value: 27 }], daily: [{ date: '2026-10-24', usd: 9 }], paypal: { ok: true, disputesOpen: 0, transactions: null, needs: [] }, stripe: { mode: 'test' }, needs: ['PayPal: turn on Transaction Search for the live app.'] },
  email: { ok: true, days: 30, totals: { processed: 38, delivered: 34, bounces: 0, blocks: 4, spam_reports: 0, unique_opens: 10, unique_clicks: 2 }, rates: { delivered: 89.5, bad: 10.5, opened: 29.4, clicked: 5.9 }, daily: [], suppressions: { bounces: [], blocks: [{ domain: 'example.org', reason: 'blocked', at: '2026-10-24T10:00:00Z' }], spam: [] }, needs: [] },
  search: { ok: true, brave: { ok: true, queries: [{ query: 'carlosandmunoz', position: 3, url: 'https://carlosandmunoz.com/', leader: 'carlosandmunoz.com' }, { query: 'free website qa review', position: null, url: '', leader: 'rival.example' }] }, console: { ok: false, error: 'No access.', need: 'Search Console: add the service account.' }, needs: ['Search Console: add the service account.'] },
  social: { ok: true, days: 30, sent: 30, failed: 0, channels: [{ label: 'tiktok', value: 12 }], results: [], daily: [], latest: [], youtube: { videos: [{ id: 'T1vH4T0yZRQ', title: 'The release is close', published: '2026-10-22T02:46:26Z', views: 28, likes: 0, comments: 0 }], views: 39 }, needs: [] },
  safety: { ok: true, score: 88, needs: [], checks: [{ name: 'Web Risk', key: 'webrisk', level: 'good', ok: true, detail: 'Not listed.' }, { name: 'DMARC', key: 'dmarc', level: 'warn', ok: false, detail: 'p=quarantine at 25%.' }] },
  platform: { ok: true, needs: ['Costs: turn on the billing export.'], functions: { executions: 3000, notOk: 2800, failures: 4, failureRate: 0.13, byFunction: [{ label: 'reviewUrl', value: 4 }], kinds: [{ label: 'timeout', value: 4 }], latest: [], capped: false }, gemini: { days: 7, requests: 92, ok: 10, errorRate: 89.1, byClass: [], failedMethods: [{ label: 'ListModels', value: 82 }] }, firestore: { reads: 20000, writes: 900, deletes: 10, readsFreePct: 40, writesFreePct: 4.5, deletesFreePct: 0.05 }, users: { total: 9, newInRange: 2, activeInRange: 4 } },
  outreach: { ok: true, needs: ['Instantly: put the API key in functions/.env as INSTANTLY_API_KEY.'],
    pipeline: { ok: true, queued: 40, swept: 12, left: 28, bySegment: [{ label: 'tvet', value: 10 }, { label: 'university', value: 10 }], reviews: 12, thisWeek: 12, results: [{ label: 'reviewed', value: 11 }], segments: [], avgScore: 64, withLiveReport: 6, reviewedWithLiveReport: 5, daily: [{ date: '2026-10-24', reviews: 12 }] },
    instantly: { ok: false, error: 'INSTANTLY_API_KEY is not set.' },
    plan: { start: '2026-10-20', end: '2027-01-17', day: 6, length: 90, phase: { name: 'Set up', end: '2026-11-02', daysLeft: 8 }, next: { date: '2026-10-30', label: 'First wave out', daysLeft: 5 }, milestones: [{ date: '2026-10-30', label: 'First wave out', past: false }], deadlines: [{ date: '2026-10-31', label: 'Instantly trial ends', daysLeft: 6 }], weekly: { prospects: 40, liveReportPct: 100 }, targets: [{ key: 'unlocks', label: 'Paid unlocks', target: 30, actual: 3 }] },
    mail: { domain: 'qalabreview.com', ok: false, checks: [{ name: 'SPF', ok: true, detail: 'v=spf1 include:spf.protection.outlook.com -all' }, { name: 'DMARC', ok: false, detail: 'p=none (monitor only)' }] } }
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
    if (body.op === 'settings-save') return route.fulfill({ json: Object.assign({ op: body.op, ok: true, updatedAt: new Date().toISOString() }, body.settings), headers: { 'Access-Control-Allow-Origin': '*' } });
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
    await expect(tabs).toHaveCount(11);
    await expect(tabs).toContainText(['Overview', 'Inbox', 'CV', 'QA Studio', 'QA Lab', 'URL Review', 'Social hub', 'Business', 'Outreach', 'Traffic', 'Systems']);
    await expect(page.locator('#jv-hello')).toContainText('Carlos');
    await expect(page.locator('[data-view="overview"] .jv-briefing')).toContainText('sweepReviews');
    await expect(page.locator('#jv-ready')).not.toHaveText('—');
    await expect.poll(() => new Set(calls.map((c) => c.op))).toEqual(new Set(['health', 'jobs', 'github', 'uptime', 'ga4', 'cloudflare', 'speed', 'settings', 'goals', 'money', 'email', 'search', 'social', 'safety', 'platform', 'outreach', 'proposals']));
    expect(calls.every((c) => c.auth === 'Bearer owner-token')).toBe(true);

    await expect(page.locator('[data-view="overview"]')).toContainText('CV visits this week');
    await tabs.filter({ hasText: 'CV' }).first().click();
    await expect(page).toHaveURL(/#stats\/cv\//);
    const cv = page.locator('[data-view="cv"]');
    await expect(cv).toBeVisible();
    await expect(cv).toContainText('linkedin (tagged link)');
    await expect(page.locator('[data-view="overview"]')).toBeHidden();

    await tabs.filter({ hasText: 'URL Review' }).click();
    await expect(page.locator('[data-view="review"]')).toContainText('shop.example');

    await tabs.filter({ hasText: 'Business' }).click();
    const business = page.locator('[data-view="business"]');
    await expect(business).toContainText('Revenue (USD)27');
    await expect(business).toContainText('Transaction Search');
    await expect(business).toContainText('rival.example');
    await expect(business).toContainText('The release is close');

    await tabs.filter({ hasText: 'Outreach' }).click();
    const outreach = page.locator('[data-view="outreach"]');
    await expect(outreach).toContainText('Day 6 of 90');
    await expect(outreach).toContainText('First wave out');
    await expect(outreach).toContainText('Instantly trial ends');
    await expect(outreach).toContainText('Paid unlocks');
    await expect(outreach).toContainText('INSTANTLY_API_KEY');
    await expect(outreach).toContainText('p=none');
    await expect(outreach.locator('.jv-briefing')).toContainText('Instantly trial ends in 6 days');

    await tabs.filter({ hasText: 'Traffic' }).click();
    await expect(page.locator('[data-view="traffic"]')).toContainText('Zone > Analytics > Read');

    await tabs.filter({ hasText: 'Systems' }).click();
    const systems = page.locator('[data-view="systems"]');
    await expect(systems).toContainText('Connections');
    await expect(systems).toContainText('DMARC');
    await expect(systems).toContainText('reviewUrl');
    await expect(systems).toContainText('billing export');
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
    await page.evaluate(() => { location.hash = '#stats/systems/30'; });
    await expect(page.locator('[data-view="systems"]')).toBeVisible();
    await page.evaluate(() => { location.hash = '#stats/overview/30'; });
    await expect(page.locator('[data-view="overview"]')).toBeVisible();
    await expect(page.locator('[data-view="systems"]')).toBeHidden();
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

  test('settings save goals, thresholds and mail switches through the function', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page);
    await expect(page.locator('[data-view="overview"] .jv-goal')).toContainText('120 / 300');
    await page.locator('[data-act="settings"]').first().click();
    const box = page.locator('.jv-settings-box');
    await expect(page.locator('.jv-settings')).toBeVisible();
    await expect(box.locator('[data-goal]')).toHaveCount(1);
    await box.locator('[data-goal-add]').click();
    const row = box.locator('[data-goal]').nth(1);
    await row.locator('[name="g-product"]').selectOption('review');
    await row.locator('[name="g-metric"]').selectOption('paid');
    await row.locator('[name="g-period"]').selectOption('month');
    await row.locator('[name="g-target"]').fill('12');
    await box.locator('[name="t-pendingRatings"]').fill('25');
    await box.locator('[name="m-gemini"]').uncheck();
    await box.locator('[name="s-queries"]').fill('qa review\n\nqa review\n  carlos qa  ');
    await box.locator('button[type="submit"]').click();
    await expect(page.locator('.jv-settings')).toBeHidden();
    const save = calls.find((c) => c.op === 'settings-save');
    expect(save.body.settings.goals).toEqual([{ product: 'cv', metric: 'visits', period: 'week', target: 300 }, { product: 'review', metric: 'paid', period: 'month', target: 12 }]);
    expect(save.body.settings.thresholds.pendingRatings).toBe(25);
    expect(save.body.settings.mail).toEqual({ daily: true, gemini: false, watch: true, weekly: true });
    expect(save.body.settings.searchQueries).toEqual(['qa review', 'qa review', 'carlos qa']);
    await expect.poll(() => calls.filter((c) => c.op === 'goals').length).toBeGreaterThan(1);

    await page.keyboard.press('g');
    await expect(page.locator('.jv-settings')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.jv-settings-box [data-act="daily-now"]').click();
    await expect.poll(() => calls.some((c) => c.op === 'daily-now')).toBe(true);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.jv-settings-box [data-act="weekly-now"]').click();
    await expect.poll(() => calls.some((c) => c.op === 'weekly-now')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.jv-settings')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('Overview ranks proposals with evidence, and Done hides one through the function', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page);
    const panel = page.locator('[data-view="overview"] [data-panel-id="overview-proposals"]');
    await expect(panel).toContainText('Ranked by Gemini');
    await expect(panel.locator('.jv-prop')).toHaveCount(3);
    await expect(panel.locator('.jv-prop').first()).toContainText('Fix the failing job');
    await expect(panel.locator('.jv-prop').first()).toContainText('impact 5/5');
    await expect(panel.locator('.jv-prop').first()).toContainText('Job sweepReviews failed: quota.');
    await expect(panel.locator('.jv-prop').nth(1)).toContainText('Safe action: re-run held reviews');
    await expect(panel.locator('.jv-prop').nth(2)).toContainText('from Gemini');
    await expect(panel).toContainText('1 hidden as done or dismissed');
    const ask = calls.find((c) => c.op === 'proposals');
    expect(ask.body.candidates.some((p) => p.key === 'job' && p.evidence.length)).toBe(true);
    expect(ask.body.snapshot.products).toBeTruthy();

    await panel.locator('[data-proposal="done"][data-key="review:held"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'proposal-mark').map((c) => [c.body.key, c.body.status])).toEqual([['review:held', 'done']]);
    await expect(panel.locator('.jv-prop')).toHaveCount(2);
    await expect(panel).toContainText('2 hidden as done or dismissed');
    expect(errors).toEqual([]);
  });
});
