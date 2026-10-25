const { test, expect } = require('@playwright/test');

// The Firebase SDK is swapped for stubs: a signed-in admin with an authenticator, and an in-memory
// Firestore whose writes land in window.__writes.
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.14.1/';
const STUBS = {
  'firebase-app.js': 'export function initializeApp() { return {}; }',
  'firebase-auth.js': `
    const user = { email: 'kaanmuar@gmail.com', emailVerified: true };
    export function getAuth() { return { currentUser: user }; }
    export function onAuthStateChanged(auth, callback) { setTimeout(() => callback(user), 0); return () => {}; }
    export function multiFactor() { return { enrolledFactors: [{ uid: 'totp' }] }; }
    export const TotpMultiFactorGenerator = {};
    export function isSignInWithEmailLink() { return false; }
    const none = () => Promise.resolve();
    export { none as signInWithEmailAndPassword, none as signOut, none as getMultiFactorResolver, none as sendEmailVerification, none as sendSignInLinkToEmail, none as signInWithEmailLink };`,
  'firebase-firestore.js': `
    window.__writes = [];
    const store = window.__store || {};
    const empty = { docs: [], size: 0, empty: true, forEach() {} };
    export function getFirestore() { return {}; }
    export function doc(db, name, id) { return { path: name + '/' + id, id }; }
    export function collection(db, name) { return { path: name }; }
    export function query(ref) { return ref; }
    export function where() { return {}; }
    export function orderBy() { return {}; }
    export function limit() { return {}; }
    export function onSnapshot(ref, callback) { setTimeout(() => callback(empty), 0); return () => {}; }
    export async function getDocs() { return empty; }
    export async function getDoc(ref) { const data = store[ref.path]; return { id: ref.id, exists: () => !!data, data: () => data }; }
    export async function setDoc(ref, data) { store[ref.path] = data; window.__writes.push({ path: ref.path, data }); }
    export async function updateDoc() {}
    export async function deleteDoc() {}
    export async function addDoc() { return { id: 'new' }; }
    export function serverTimestamp() { return { serverTimestamp: true }; }`,
  'firebase-storage.js': 'export function getStorage() { return {}; } export function ref() { return {}; } export async function uploadString() {} export async function getDownloadURL() { return ""; }'
};

const FEED = {
  version: 1, asOf: '2026-10-24', count: 3, posts: [
    { id: 'auto-2099-01-01/01-u-example-com', kind: 'review', date: '2099-01-02', lang: 'en', clipLang: 'es', cat: '', title: 'example.com: 70. The gap: titles.', text: 'Give every page a title.', image: 'x.jpg', thumb: 'favicon.svg', alt: '', youtube: null, report: null },
    { id: 'tips-2026-10/01-img-size', kind: 'tip', date: '2026-10-20', lang: 'en', clipLang: 'en', cat: 'Speed', title: 'Size your images', text: 'Set width and height.', image: 'x.jpg', thumb: 'favicon.svg', alt: '', youtube: '5b4Hr6r-cBk', report: null },
    { id: 'launch-2026-10/de/talking', kind: 'launch', date: '2026-10-19', lang: 'de', clipLang: 'de', cat: '', title: 'Prüfen Sie Ihre Website', text: 'Text', image: 'x.jpg', thumb: 'favicon.svg', alt: '', youtube: null, report: null }
  ]
};
const CAPTIONS = {
  'auto-2099-01-01/01-u-example-com': { linkedin: 'example.com: 70.\n\nGive every page a title.', x: 'example.com: 70' },
  'tips-2026-10/01-img-size': { linkedin: 'Size your images', x: 'Size them' },
  'launch-2026-10/de/talking': { linkedin: 'Prüfen Sie' }
};
const CALENDARS = {
  'auto-2099-01-01': 'Date,Time,Channel,Post,Asset\n2099-01-02,07:30,linkedin,01-u-example-com,feed/a.jpg\n2099-01-02,17:10,facebook,01-u-example-com,feed/a.jpg\n2099-01-02,17:45,youtube,01-u-example-com,clip/a.mp4\n',
  'tips-2026-10': 'Date,Time,Channel,Post,Asset\n2026-10-20,07:50,linkedin,01-img-size,feed/a.jpg\n2026-10-20,17:45,youtube,01-img-size,clip/a.mp4\n2026-10-20,18:30,tiktok,01-img-size,clip/a.mp4\n',
  'launch-2026-10': 'Date,Time,Channel,Post,Asset\n2026-10-19,08:30,linkedin,de/talking,de/a.jpg\n'
};
const LEDGERS = {
  buffer: { version: 1, posts: {
    'auto-2099-01-01/01-u-example-com': [{ channel: 'linkedin', profile: 'linkedin (QA-lab)', id: 'b1', at: '2099-01-02T12:30:00.000Z', result: 'queued' }],
    'tips-2026-10/01-img-size': [
      { channel: 'linkedin', profile: 'linkedin (QA-lab)', id: 'b2', at: '2026-10-20T12:51:00.000Z', result: 'sent' },
      { channel: 'tiktok', profile: 'tiktok (qa)', id: 'b3', at: '2026-10-20T23:30:00.000Z', result: 'failed', error: '<b>Video</b> too short' }
    ]
  } },
  facebook: null
};

const PROPOSALS = {
  version: 1, built: '2026-10-24T13:30:00.000Z', sources: { 'web-dev': 1, hn: 1 }, proposals: [
    { id: 'aaaaaaaaaaaa', title: 'Optimize <i>INP</i> on real pages', url: 'https://web.dev/blog/inp', source: 'web.dev', author: 'Barry', date: '2026-10-23', topic: 'Performance', lang: 'en', summary: 'Interaction to Next Paint, field data first.', image: '', why: '300 points on Hacker News; also on Hacker News', score: 5 },
    { id: 'bbbbbbbbbbbb', title: 'WCAG 3 working draft', url: 'https://www.w3.org/news/wcag3', source: 'W3C', author: '', date: '2026-10-22', topic: 'Standards', lang: 'en', summary: '', image: 'https://www.w3.org/a.png', why: '', score: 2 },
    { id: 'cccccccccccc', title: 'Already dismissed', url: 'https://example.com/old', source: 'Moz', author: '', date: '2026-10-21', topic: 'SEO', lang: 'en', summary: '', image: '', why: '', score: 1 }
  ]
};

async function openHub(page, saved) {
  await page.addInitScript((data) => { window.__store = data ? { 'socialHub/live': { json: JSON.stringify(data) } } : {}; }, saved || null);
  for (const [file, body] of Object.entries(STUBS)) {
    await page.route(FIREBASE + file, (route) => route.fulfill({ contentType: 'text/javascript', body }));
  }
  await page.route('**/assets/social/feed.json', (route) => route.fulfill({ json: FEED }));
  await page.route('**/assets/social/captions.json', (route) => route.fulfill({ json: CAPTIONS }));
  await page.route('**/assets/social/edits.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/assets/social/proposals.json', (route) => route.fulfill({ json: PROPOSALS }));
  for (const [name, json] of Object.entries(LEDGERS)) {
    await page.route(`**/assets/social/${name}.json`, (route) => (json ? route.fulfill({ json }) : route.fulfill({ status: 404, body: '' })));
  }
  await page.route('**/media/social-posts/*/calendar.csv', (route) => {
    const batch = new URL(route.request().url()).pathname.split('/')[3];
    return CALENDARS[batch] ? route.fulfill({ contentType: 'text/csv', body: CALENDARS[batch] }) : route.fulfill({ status: 404, body: '' });
  });
  await page.goto('/admin.html');
  await expect(page.locator('#dashboard')).toBeVisible();
  await page.locator('#hub-tab-btn').click();
  await expect(page.locator('#hub-pane')).toBeVisible();
  await expect(page.locator('#hub-admin-list .hub-admin-row')).toHaveCount(3);
}

const row = (page, id) => page.locator(`#hub-admin-list .hub-admin-row[data-id="${id}"]`);
const savedState = async (page) => {
  const writes = await page.evaluate(() => window.__writes);
  const last = writes.filter((write) => write.path === 'socialHub/live').pop();
  return last && JSON.parse(last.data.json);
};

test.describe('admin social hub', () => {
  test('lists hub posts with each channel from the Buffer and Page ledgers, the calendar only as Scheduled, and filters them', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openHub(page);
    await expect(page.locator('#hub-admin-status')).toContainText('3 posts on the hub, as of 2026-10-24');
    const review = row(page, 'auto-2099-01-01/01-u-example-com');
    await expect(review).toContainText('Scheduled on the hub');
    await expect(review.locator('.hub-admin-channels .is-queued')).toHaveCount(1);
    await expect(review.locator('li.is-queued', { hasText: 'LinkedIn' })).toContainText('Queued Jan 2, 07:30');
    await expect(review.locator('li.is-scheduled', { hasText: 'YouTube' })).toContainText('Scheduled Jan 2, 17:45');
    await expect(review.locator('li.is-planned', { hasText: 'Facebook' })).toContainText('Planned Jan 2, 17:10');
    const tip = row(page, 'tips-2026-10/01-img-size');
    await expect(tip.locator('li', { hasText: 'YouTube' })).toHaveClass('is-live');
    await expect(tip.locator('li.is-sent', { hasText: 'LinkedIn' })).toContainText('Sent Oct 20');
    const tiktok = tip.locator('li.is-failed', { hasText: 'TikTok' });
    await expect(tiktok).toContainText('Failed Oct 20');
    await expect(tiktok).toHaveAttribute('title', 'Buffer: <b>Video</b> too short');
    await expect(row(page, 'launch-2026-10/de/talking').locator('li.is-scheduled', { hasText: 'LinkedIn' })).toContainText('Scheduled Oct 19, 08:30');
    await expect(page.locator('#hub-admin-list')).not.toContainText('Out ');
    await page.locator('#hub-admin-state').selectOption('failed');
    await expect(page.locator('#hub-admin-list .hub-admin-row')).toHaveCount(1);
    await expect(row(page, 'tips-2026-10/01-img-size')).toBeVisible();
    await page.locator('#hub-admin-state').selectOption('queued');
    await expect(page.locator('#hub-admin-list .hub-admin-row')).toHaveCount(1);
    await expect(row(page, 'auto-2099-01-01/01-u-example-com')).toBeVisible();
    await page.locator('#hub-admin-state').selectOption('all');
    await page.locator('#hub-admin-q').fill('images');
    await expect(page.locator('#hub-admin-list .hub-admin-row')).toHaveCount(1);
    await expect(page.locator('#hub-admin-count')).toHaveText('1 of 3 shown');
    expect(errors).toEqual([]);
  });

  test('saves a caption, a date and a hidden post to socialHub/live', async ({ page }) => {
    await openHub(page);
    const review = row(page, 'auto-2099-01-01/01-u-example-com');
    await review.locator('[data-act="edit"]').click();
    const form = review.locator('form.hub-admin-edit');
    await expect(form.locator('textarea[name="cap-x"]')).toHaveValue('example.com: 70');
    await form.locator('textarea[name="cap-x"]').fill('<img src=x onerror=alert(1)> new X copy');
    await form.locator('input[name="date"]').fill('2099-02-03');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#hub-admin-message')).toContainText('Saved.');
    expect(await savedState(page)).toEqual({ version: 1, edits: { 'auto-2099-01-01/01-u-example-com': { captions: { x: '<img src=x onerror=alert(1)> new X copy' }, date: '2099-02-03' } }, items: [] });
    await expect(review).toContainText('Waiting for the hub build');
    await expect(review.locator('time')).toHaveText('2099-02-03');
    await expect(form.locator('textarea[name="cap-x"]')).toHaveValue('<img src=x onerror=alert(1)> new X copy');
    await expect(page.locator('#hub-pane img[src="x"]')).toHaveCount(0);

    const tip = row(page, 'tips-2026-10/01-img-size');
    await tip.locator('[data-act="edit"]').click();
    await tip.locator('input[name="hidden"]').check();
    await tip.locator('button[type="submit"]').click();
    await expect(tip).toContainText('Hidden');
    expect((await savedState(page)).edits['tips-2026-10/01-img-size']).toEqual({ hidden: true });
  });

  test('adds an item by hand and escapes its title', async ({ page }) => {
    await openHub(page);
    await page.locator('#hub-admin-add-open').click();
    const form = page.locator('#hub-admin-add');
    await form.locator('[name="title"]').fill('<b>Web Almanac</b>');
    await form.locator('[name="url"]').fill('https://almanac.httparchive.org/');
    await form.locator('[name="image"]').fill('javascript:alert(1)');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#hub-admin-message')).toContainText('An item needs a title, a date and an image');
    await form.locator('[name="image"]').fill('https://carlosandmunoz.com/favicon.svg');
    await form.locator('[name="youtube"]').fill('https://youtu.be/5b4Hr6r-cBk');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#hub-admin-message')).toContainText('Added.');
    await expect(form).toBeHidden();
    const item = row(page, 'pick/b-web-almanac-b');
    await expect(item.locator('h3')).toHaveText('<b>Web Almanac</b>');
    await expect(item.locator('h3 b')).toHaveCount(0);
    await expect(item).toContainText('Waiting for the hub build');
    const state = await savedState(page);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ id: 'pick/b-web-almanac-b', url: 'https://almanac.httparchive.org/', youtube: '5b4Hr6r-cBk', lang: 'en' });
  });

  test('lists field sweep proposals; approving adds a credited item, dismissing records the decision', async ({ page }) => {
    await openHub(page, { version: 1, edits: {}, items: [], decisions: { cccccccccccc: 'dismissed' } });
    const proposals = page.locator('#hub-proposals-list .hub-proposal');
    await expect(proposals).toHaveCount(2);
    await expect(page.locator('#hub-proposals-count')).toHaveText('2 waiting for a decision, best first. Last sweep: 2026-10-24.');
    const inp = proposals.filter({ hasText: 'INP' });
    await expect(inp.locator('h3 a')).toHaveText('Optimize <i>INP</i> on real pages');
    await expect(inp.locator('h3 i')).toHaveCount(0);
    await expect(inp).toContainText('by Barry · 300 points on Hacker News');

    await inp.locator('[data-act="approve"]').click();
    const form = page.locator('#hub-admin-add');
    await expect(form).toBeVisible();
    await expect(form.locator('[name="url"]')).toHaveValue('https://web.dev/blog/inp');
    await expect(form.locator('[name="image"]')).toHaveValue('assets/share/qa-review-social.jpg');
    await expect(form.locator('[name="cat"]')).toHaveValue('Performance');
    await expect(form.locator('[name="text"]')).toHaveValue('Interaction to Next Paint, field data first.\n\nVia web.dev, by Barry, 2026-10-23.');
    await form.locator('[name="title"]').fill('Optimize INP on real pages');
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#hub-admin-message')).toContainText('Approved and added.');
    let state = await savedState(page);
    expect(state.decisions).toEqual({ aaaaaaaaaaaa: 'approved', cccccccccccc: 'dismissed' });
    expect(state.items[0]).toMatchObject({ id: 'pick/optimize-inp-on-real-pages', url: 'https://web.dev/blog/inp', cat: 'Performance' });
    await expect(row(page, 'pick/optimize-inp-on-real-pages')).toContainText('Waiting for the hub build');
    await expect(proposals).toHaveCount(1);

    await proposals.first().locator('[data-act="dismiss"]').click();
    await expect(page.locator('#hub-admin-message')).toHaveText('Dismissed. The sweep will not propose it again.');
    state = await savedState(page);
    expect(state.decisions.bbbbbbbbbbbb).toBe('dismissed');
    expect(state.items).toHaveLength(1);
    await expect(proposals).toHaveCount(0);
    await expect(page.locator('#hub-proposals-count')).toHaveText('Nothing waiting. Last sweep: 2026-10-24.');

    await page.locator('#hub-admin-add-open').click();
    await page.locator('#hub-admin-add [name="title"]').fill('By hand');
    await page.locator('#hub-admin-add [name="image"]').fill('https://carlosandmunoz.com/favicon.svg');
    await page.locator('#hub-admin-add button[type="submit"]').click();
    await expect(page.locator('#hub-admin-message')).toContainText('Added.');
    expect(Object.keys((await savedState(page)).decisions)).toHaveLength(3);
  });

  test('shows edits already saved in Firestore and lets them be dropped', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await openHub(page, { version: 1, edits: { 'launch-2026-10/de/talking': { captions: { linkedin: 'Neu' } } }, items: [] });
    const launch = row(page, 'launch-2026-10/de/talking');
    await expect(launch).toContainText('Edited');
    await expect(page.locator('#hub-admin-status')).toContainText('1 wait for the next hub build');
    await launch.locator('[data-act="edit"]').click();
    await expect(launch.locator('textarea[name="cap-linkedin"]')).toHaveValue('Neu');
    await launch.locator('[data-act="reset"]').click();
    await expect(page.locator('#hub-admin-message')).toContainText('Edits dropped.');
    expect((await savedState(page)).edits).toEqual({});
    await expect(page.locator('#hub-admin-status')).toContainText('Every saved edit is on the hub.');
  });
});
