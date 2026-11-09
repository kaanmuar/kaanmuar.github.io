const { test, expect } = require('@playwright/test');
const core = require('../js/admin-jarvis-core.js');
const calendarSource = require('../functions/jarvis-calendar.js');

// Country dates (#2989) counted from today, so the panel always has days ahead: a weekday holiday in Brazil and Mexico.
const GEO = require('./fixtures/jarvis-geo.json');
const CALENDAR = (() => {
  const today = core.zoneParts(new Date()).day;
  const plus = (n) => new Date(Date.parse(today + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  let n = 5;
  while ([0, 6].includes(new Date(plus(n) + 'T12:00:00Z').getUTCDay())) n++;
  const holidays = { BR: [{ date: plus(n), name: 'Republic Day', local: 'Proclamação da República' }], MX: [{ date: plus(n), name: 'Revolution Day', local: 'Día de la Revolución' }] };
  const targets = GEO.countries.filter((r) => r.target).map((r) => r.cc);
  return Object.assign({ ok: true, needs: [], notes: ['Nager.Date has no public holidays for 1 target markets: BF.'] }, calendarSource.build({ today, targets, holidays, missing: ['BF'] }));
})();
const GEO_DATED = Object.assign({}, GEO, { countries: GEO.countries.map((r) => {
  const next = (CALENDAR.byCountry[r.cc] || [])[0];
  return Object.assign({}, r, next ? { nextDate: { date: next.date, name: next.name, kind: next.kind }, daysToDate: next.daysAway } : { nextDate: null, daysToDate: null });
}) });

// Firestore is an in-memory stub seeded from window.__data (collection name → rows) that logs every read in window.__reads, and the
// owner-only /jarvis function is answered by page.route (its snapshot op built from the same seed), so the whole Statistics tab runs offline.
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
    const read = (name) => { window.__reads = (window.__reads || []).concat([name]); };
    export async function getDocs(ref) { read(ref.name); return snap(data[ref.name] || []); }
    export async function getCountFromServer(ref) { return { data: () => ({ count: (data[ref.name] || []).length }) }; }
    export async function getDoc(ref) { read(ref.path); const row = data[ref.path]; return { id: ref.id, exists: () => !!row, data: () => row }; }
    export async function setDoc() {}
    export async function updateDoc() {}
    export async function deleteDoc() {}
    export async function addDoc() { return { id: 'new' }; }
    export function serverTimestamp() { return { serverTimestamp: true }; }`,
  'firebase-storage.js': 'export function getStorage() { return {}; } export function ref() { return {}; } export async function uploadString() {} export async function uploadBytes(r, file) { window.__uploads = (window.__uploads || []).concat([file.name]); } export async function getDownloadURL() { return ""; }'
};

const EXTERNAL = {
  health: { ok: true, jobs: [{ job: 'sweepReviews', ok: false, error: 'quota', endedAt: '2026-10-25T10:00:00Z' }], failures: { total: 2, causes: [{ label: 'timeout', value: 2 }], hosts: [], latest: [] }, reruns: { total: 0, status: [], held: 0 }, alerts: { total: 0, kinds: [], latest: [] }, notices: { total: 0, status: [] }, rivals: { total: 0 }, coupons: { total: 0, uses: 0 }, captures: { total: 0, kinds: [] } },
  jobs: { ok: true, jobs: [{ name: 'sweepReviews', schedule: '*/5 * * * *', timeZone: 'UTC', state: 'ENABLED', lastAttempt: '2026-10-25T10:00:00Z', nextRun: '2026-10-25T10:05:00Z', ok: true, error: '' }] },
  github: { ok: true, ci: [{ name: 'E2E and Visual Tests', conclusion: 'success', url: 'https://github.com/x' }], openBugs: 3, bugAreas: [{ label: 'be', value: 2 }], merged: { total: 5, items: [] }, recent: [] },
  uptime: { ok: true, pages: [{ product: 'cv', name: 'CV', url: 'https://carlosandmunoz.com/', status: 200, ms: 320, bytes: 1000, ok: true }], tlsDaysLeft: 60 },
  ga4: { ok: true, groups: [{ group: 'cv', sessions: 40, users: 30, views: 90, engagement: 55, duration: 70, priorSessions: 20, priorUsers: 15 }], countries: [{ label: 'Colombia', value: 25, prior: 10 }], sources: [], daily: [] },
  cloudflare: { ok: false, error: 'The Cloudflare token needs Zone > Analytics > Read.' },
  settings: { ok: true, goals: [{ product: 'cv', metric: 'visits', period: 'week', target: 300 }], thresholds: {}, mail: { daily: true, gemini: true, watch: true, weekly: true }, updatedAt: '2026-10-24T12:00:00Z' },
  actions: { ok: true, settings: { auto: true, caps: { 'rerun-held': 10, 'resend-notices': 10, 'publish-hub': 2 }, countdownHours: 2 }, used: { 'rerun-held': 3, 'resend-notices': 0, 'publish-hub': 2 }, pending: { held: 4, clean: 1, notices: 2 }, noticeHours: false, noticesLive: true,
    countdowns: {
      pending: [{ id: 'aaaa1111bbbb2222cccc3333', action: 'rerun-ci', label: 'Re-run failed CI jobs', target: 'Buffer batch #41', kind: 'post', kindLabel: 'public post', status: 'waiting', by: 'jarvis', confidence: null, why: 'Re-running the failed jobs on main.', runsAt: '2026-10-26T13:00:00.000Z', hold: '' },
        { id: 'dddd4444eeee5555ffff6666', action: 'ai-fix', label: 'Run a fix the AI picked', target: 'run-job sendOwnerNotices', kind: 'email', kindLabel: 'third-party email', status: 'waiting', by: 'gemini', confidence: 0.92, why: 'Its last run failed.', runsAt: '2026-10-26T15:00:00.000Z', hold: '' }],
      recent: [{ id: '999988887777666655554444', action: 'merge-pr', label: 'Merge PageSpeed fixes #2210', target: '#2210', kind: 'code', status: 'done', result: 'Merging #2210; Jarvis pushes the result.' }]
    },
    actions: [{ action: 'rerun-held', mode: 'auto', status: 'done', target: 'shop.example', detail: 'Sent to the asker.', at: '2026-10-25T15:05:00Z' }, { action: 'publish-hub', mode: 'auto', status: 'waiting', count: 1, target: '', detail: "Over today's cap of 2.", at: '2026-10-25T16:05:00Z' }, { action: 'run-job', mode: 'click', status: 'done', target: 'sweepReviews', detail: 'Started.', at: '2026-10-25T17:00:00Z' }] },
  countdown: { ok: true, message: 'Cancelled: run a fix the AI picked.' },
  proposals: { ok: true, gemini: true, at: '2026-10-25T12:00:00Z', hidden: 1, proposals: [
    { rank: 1, key: 'job', title: 'Fix the failing job', impact: 5, level: 'alert', effort: 'hours', why: 'The sweep feeds the hub.', evidence: ['Job sweepReviews failed: quota.'], source: 'gemini+rules', action: null, jobs: ['sweepReviews'], tab: 'systems', link: null },
    { rank: 2, key: 'review:held', title: 'Re-run the held reviews', impact: 3, level: 'warn', evidence: ['4 re-runs are held on the desk.'], source: 'gemini+rules', action: 'rerun-held', tab: 'systems', link: null },
    { rank: 3, key: 'ai:price-test', title: 'Test a lower first-review price', impact: 4, level: 'info', evidence: ['3 opens, 1 paid review'], source: 'gemini', action: null, tab: null, link: null }
  ] },
  goals: { ok: true, goals: [{ key: 'cv.visits.week', product: 'cv', metric: 'visits', period: 'week', target: 300, label: 'CV visits this week', value: 120, pct: 40, expected: 107, projected: 336, elapsed: 36, status: 'on-track' }] },
  speed: { ok: true, pages: [{ product: 'cv', name: 'CV', url: 'https://carlosandmunoz.com/', ok: true, score: 93, lab: {}, field: {} }], crux: null },
  money: { ok: true, days: 30, revenue: { usd: 27, count: 3, avgUsd: 9, paidRuns: 5 }, prior: { usd: 9, count: 1, paidRuns: 2 }, refundsUsd: 0, byProvider: [{ label: 'paypal', value: 27 }], byPurpose: [{ label: 'review', value: 27 }], daily: [{ date: '2026-10-24', usd: 9 }], paypal: { ok: true, disputesOpen: 0, transactions: null, needs: [] }, stripe: { mode: 'test' }, needs: ['PayPal: turn on Transaction Search for the live app.'] },
  email: { ok: true, days: 30, totals: { processed: 38, delivered: 34, bounces: 0, blocks: 4, spam_reports: 0, unique_opens: 10, unique_clicks: 2 }, rates: { delivered: 89.5, bad: 10.5, opened: 29.4, clicked: 5.9 }, daily: [], suppressions: { bounces: [], blocks: [{ domain: 'example.org', reason: 'blocked', at: '2026-10-24T10:00:00Z' }], spam: [] }, needs: [] },
  search: { ok: true, brave: { ok: true, queries: [{ query: 'carlosandmunoz', position: 3, url: 'https://carlosandmunoz.com/', leader: 'carlosandmunoz.com' }, { query: 'free website qa review', position: null, url: '', leader: 'rival.example' }] }, console: { ok: false, error: 'No access.', need: 'Search Console: add the service account.' }, needs: ['Search Console: add the service account.'] },
  social: { ok: true, queue: [{ channel: 'tiktok', name: 'TikTok', scheduled: 4, sent: 12, failed: 0, next: [{ at: '2026-10-27T15:00:00Z', post: '2026-10-tips/ssl-expiry' }], last: null }, { channel: 'instagram', name: 'Instagram', scheduled: 0, sent: 9, failed: 2, next: [], last: null }], days: 30, sent: 30, failed: 0, channels: [{ label: 'tiktok', value: 12 }], results: [], daily: [], latest: [], youtube: { videos: [{ id: 'T1vH4T0yZRQ', title: 'The release is close', published: '2026-10-22T02:46:26Z', views: 28, likes: 0, comments: 0 }], views: 39 }, needs: [] },
  safety: { ok: true, score: 88, needs: [], checks: [{ name: 'Web Risk', key: 'webrisk', level: 'good', ok: true, detail: 'Not listed.' }, { name: 'DMARC', key: 'dmarc', level: 'warn', ok: false, detail: 'p=quarantine at 25%.' }] },
  platform: { ok: true, needs: ['Costs: turn on the billing export.'], functions: { executions: 3000, notOk: 2800, failures: 4, failureRate: 0.13, byFunction: [{ label: 'reviewUrl', value: 4 }], kinds: [{ label: 'timeout', value: 4 }], latest: [], capped: false }, gemini: { days: 7, requests: 92, ok: 10, errorRate: 89.1, byClass: [], failedMethods: [{ label: 'ListModels', value: 82 }] }, firestore: { reads: 20000, writes: 900, deletes: 10, readsFreePct: 40, writesFreePct: 4.5, deletesFreePct: 0.05 }, users: { total: 9, newInRange: 2, activeInRange: 4 } },
  'social-proposals': { ok: true, built: '2026-10-25T06:00:00Z', proposals: [{ id: 'fid-gone', title: 'Google drops FID from Core Web Vitals', source: 'web.dev', lang: 'en', score: 9, summary: 'INP replaced FID.', url: 'https://web.dev/' }] },
  'social-runs': { ok: true, runs: [{ name: 'Buffer', status: 'completed', conclusion: 'success', at: '2026-10-25T06:00:00Z', event: 'schedule', url: 'https://github.com/' }, { name: 'Facebook Page', status: 'completed', conclusion: 'failure', at: '2026-10-25T07:00:00Z', event: 'schedule', url: 'https://github.com/' }] },
  mailbox: { ok: true, days: 30, partial: false, aliasCount: 19, plan: { name: 'Premium - Monthly', retentionDays: 180 }, smtp: { month: 2, monthLimit: 12000, today: 2, dayLimit: 400 },
    totals: { mails: 372, forwarded: 369, bounced: 0, refused: 0, unknown: 3, queued: 0 }, aliases: [{ alias: 'qa', mails: 364, forwarded: 364, bounced: 0, refused: 0, queued: 0, last: '2026-10-27T20:06:07Z' }], problems: [],
    canary: { state: 'ok', sentAt: '2026-10-27T14:10:00Z', receivedAt: '2026-10-27T14:10:38Z', seconds: 38, history: [] }, needs: [] },
  'mail-codes': { ok: true, codes: [{ service: 'tiktok', label: 'TikTok', code: '739201', link: '', alias: 'tiktok', from: 'TikTok <no-reply@account.tiktok.com>', subject: 'Your TikTok verification code', trusted: true, at: '2026-10-27T17:00:00Z' }] },
  'share-list': { ok: true, items: [{ id: 'old1', kind: 'image', caption: 'Launch day', title: 'Launch day photo', status: 'posted', at: '2026-10-24T15:00:00Z', url: 'https://github.com/' }] },
  'share-draft': { ok: true, id: 'new1', kind: 'image', draft: { lang: 'en', kind: 'tip', title: 'Check SSL', alt: 'A card', linkedin: 'LinkedIn draft', x: 'X draft', facebook: 'Facebook draft', instagram: 'Instagram draft' }, note: '' },
  'share-queue': { ok: true, id: 'new1', note: 'Queued. The hub page goes live first.' },
  'social-post-now': { ok: true, started: ['Buffer', 'Facebook Page'], note: 'Started Buffer and Facebook Page.' },
  targets: { ok: true, start: '2026-10-20', end: '2027-01-17', day: 6, length: 90, needs: [], targets: [{ key: 'unlocks', label: 'Paid unlocks', target: 30, actual: 3, status: 'on-pace', expected: 2, perWeek: 2.3, auto: true,
    how: 'Paid, non-refunded purchases since the plan started.', lastAt: '2026-10-21T10:00:00Z', done: null, fix: null, next: [{ label: 'Copy one-pager link', copy: 'https://qalabreview.com/pdf' }],
    items: [{ at: '2026-10-21T10:00:00Z', text: 'Report unlock · acme.io · 9 USD', url: '', id: '', source: 'auto', n: 1 }] }] },
  outreach: { ok: true, needs: ['Instantly: put the API key in Secret Manager as INSTANTLY_API_KEY.'],
    pipeline: { ok: true, queued: 40, swept: 12, left: 28, bySegment: [{ label: 'tvet', value: 10 }, { label: 'university', value: 10 }], reviews: 12, thisWeek: 12, results: [{ label: 'reviewed', value: 11 }], segments: [], avgScore: 64, withLiveReport: 6, reviewedWithLiveReport: 5, daily: [{ date: '2026-10-24', reviews: 12 }] },
    instantly: { ok: false, error: 'INSTANTLY_API_KEY is not set.' },
    plan: { start: '2026-10-20', end: '2027-01-17', day: 6, length: 90, phases: [{ name: 'Set up', start: '2026-10-20', end: '2026-11-02' }, { name: 'First waves', start: '2026-11-03', end: '2026-12-06' }, { name: 'Scale', start: '2026-12-07', end: '2027-01-17' }], phase: { name: 'Set up', end: '2026-11-02', daysLeft: 8 }, next: { date: '2026-10-30', label: 'First wave out', daysLeft: 5 }, milestones: [{ date: '2026-10-30', label: 'First wave out', past: false }], deadlines: [{ date: '2026-10-31', label: 'Instantly trial ends', daysLeft: 6 }], weekly: { prospects: 40, liveReportPct: 100 }, targets: [{ key: 'unlocks', label: 'Paid unlocks', target: 30, actual: 3 }] },
    links: { ok: true, live: false, workerStatus: 301, base: 'https://qalabreview.com', visits: 5, reviews: 2, paid: 1, usd: 12, reviewRate: 40, payRate: 50, byCampaign: [{ label: 'outreach', value: 4 }, { label: 'qr', value: 1 }], prospects: [{ host: 'upb.edu.co', visits: 3, reviews: 1, paid: 1, usd: 12, last: '2026-10-24T14:00:00.000Z' }], channels: [{ label: 'QR code', url: 'https://qalabreview.com/qr' }], funnel: [{ label: 'Landing in six languages', url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/1867' }] },
    mail: { domain: 'qalabreview.com', ok: false, checks: [{ name: 'SPF', ok: true, detail: 'v=spf1 include:spf.protection.outlook.com -all' }, { name: 'DMARC', ok: false, detail: 'p=none (monitor only)' }] } },
  marketing: { ok: true, needs: [],
    campaigns: { ok: true, firstStart: '2099-11-10', leads: 0, steps: 6,
      rows: [{ id: '11111111-2222-3333-4444-555555555555', name: 'W1 B-es Americas', week: 'W1', sequence: 'B', lang: 'es', region: 'Americas', status: 'draft', start: '2099-11-10', window: 'Tue-Thu 08:00-10:30 America/Bogota', dailyLimit: 10, steps: 4, leads: 0, contacted: 0, sent: 0, opened: 0, replies: 0, bounced: 0 },
        { id: '66666666-7777-8888-9999-000000000000', name: 'W1 E-pt Brazil', week: 'W1', sequence: 'E', lang: 'pt', region: 'Brazil', status: 'active', start: '2099-11-10', window: 'Tue-Thu 08:00-10:30 America/Sao_Paulo', dailyLimit: 10, steps: 2, leads: 5, contacted: 0, sent: 0, opened: 0, replies: 0, bounced: 0 }],
      byStatus: [{ label: 'draft', value: 1 }, { label: 'active', value: 1 }], byLang: [{ label: 'es', value: 1 }, { label: 'pt', value: 1 }], byRegion: [{ label: 'Americas', value: 1 }, { label: 'Brazil', value: 1 }], bySequence: [{ label: 'B', value: 1 }, { label: 'E', value: 1 }], byWeek: [{ label: 'W1', value: 2 }] },
    prospects: { ok: true, total: 40, byCountry: [{ label: 'CO', value: 22 }, { label: 'MX', value: 18 }], bySegment: [{ label: 'university', value: 20 }, { label: 'tvet', value: 20 }], updated: '2026-10-25T00:00:00Z' },
    notes: { ok: true, sent: 9, stopped: 1, people: 7, byKind: [{ label: 'return', value: 9 }], byScene: [{ label: 'paid-once', value: 9 }], daily: [{ date: '2026-10-24', sent: 9, stopped: 1 }] } },
  'marketing-campaign': { ok: true, id: '11111111-2222-3333-4444-555555555555', name: 'W1 B-es Americas', status: 'active' },
  'marketing-queue': { ok: true, added: 2, already: 0, skipped: [] },
  'marketing-block': { ok: true, blocked: 'no@example.edu' },
  'marketing-sync': { ok: true, needs: [], at: new Date().toISOString(), age: 60000, stale: false, running: false,
    leads: { weeks: [{ week: 'W1', total: 3, complete: 2, missing: 1, approved: 1, uploaded: 0, ready: 1 }],
      rows: [{ week: 'W1', email: 'ana@uni.edu.co', first_name: 'Ana', last_name: 'Pérez', title: 'CIO', org: 'Uni Norte', host: 'uni.edu.co', cc: 'co', campaign: 'W1 B-es Americas', score: '71', top_finding_en: 'No alt text', missing: '', approved: false, uploaded: '', live_report_url: 'https://qa-lab.co/r/uni' },
        { week: 'W1', email: 'leo@uni2.edu.co', first_name: 'Leo', org: 'Uni Sur', host: 'uni2.edu.co', cc: 'co', campaign: 'W1 B-es Americas', missing: 'report (not published yet)', approved: false, uploaded: '' },
        { week: 'W1', email: 'eva@uni3.edu.co', first_name: 'Eva', org: 'Uni Este', host: 'uni3.edu.co', cc: 'co', campaign: 'W1 B-es Americas', missing: '', approved: true, uploaded: '' },
        { week: 'W1', email: 'sol@uni4.edu.co', first_name: 'Sol', org: 'Uni Oeste', host: 'uni4.edu.co', cc: 'co', campaign: 'W1 B-es Americas', missing: '', approved: true, uploaded: '2026-10-20' }] },
    replies: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', at: '2026-10-25T12:00:00Z', from: 'dean@uni.edu.co', to: 'carlos@mail.qa-lab.co', subject: 'Re: Su sitio', campaign: 'W1 B-es Americas', text: 'Nos interesa', category: 'interested', summary: 'Wants the walkthrough', lang: 'es', draft: 'Hola, gracias', sent: '' }],
    linkedin: { date: '2026-10-26', items: [{ name: 'Ana Pérez', title: 'CIO', org: 'Uni Norte (UN)', cc: 'CO', sent: false, profile: 'https://www.linkedin.com/in/ana', lines: ['Profile: https://www.linkedin.com/in/ana', 'Check first: confirm the role.', 'Note: Hola Ana, vi el sitio de Uni Norte.'] },
      { name: 'Bea Gómez', title: 'CEO', org: 'Agencia Sur', cc: 'AR', sent: true, profile: 'https://www.linkedin.com/in/bea', lines: [] }] },
    dnc: [], jobs: [{ mode: 'leads', at: '2026-10-26T12:00:00Z', notify: 'W1 leads ready: 2 complete', failed: false, tail: ['done'] }], paused: [], kpis: [{ week_start: '2026-10-26', notes: 'setup week' }],
    commands: { pending: 0, items: [] } },
  'marketing-command': { ok: true, queued: 'c1', action: 'approve', label: 'Approve ana@uni.edu.co (W1)' },
  engagement: require('./fixtures/jarvis-engagement.json'),
  geo: GEO_DATED,
  calendar: CALENDAR,
  'geo-target': { ok: true, cc: 'PT', on: false, targets: 74 },
  'engagement-decide': { ok: true, message: 'Edited and approved.' },
  'owner-tags-run': { ok: true, note: 'owner tags: 6 posts, 4 comments, 1 owner replies; 2 sites read, 5 owner accounts, 1 suggestion runs, 1 pushed', posts: 6, comments: 4 },
  'owner-tags-settings': { ok: true, message: 'Owner tags are paused.' },
  'owner-tags-account': { ok: true, message: '@metrodebogota on X is approved.' },
  local: { ok: true, since: '2026-11-02', more: 0,
    totals: { reviews: 9, local: 2, profiles: 1, noProfile: 1, withIssues: 2, failing: 0, outreach: 1, calls: 4, errors: 1, callsToday: 2 },
    issues: [{ key: 'local-hours', count: 1, fail: 0 }, { key: 'local-profile', count: 1, fail: 0 }],
    lastError: { at: '2026-11-01T12:00:00.000Z', error: 'status 429' },
    sites: [
      { id: 'a', host: 'speed-plumbing.com', at: '2026-11-01T15:00:00.000Z', source: 'sweep', outreach: true, profile: true, worst: 'risk', issues: [{ key: 'local-hours', verdict: 'risk', severity: 'medium' }] },
      { id: 'b', host: 'bakery.example', at: '2026-11-01T14:00:00.000Z', source: '', outreach: false, profile: false, worst: 'risk', issues: [{ key: 'local-profile', verdict: 'risk', severity: 'low' }] }
    ] },
  people: { ok: true, since: '2026-11-01', more: 0,
    totals: { people: 2, active: 2, new: 1, returning: 1, visits: 3, activeMs: 1260000, avgVisitMs: 420000, runs: 2 },
    testTotals: { people: 1, active: 1, new: 1, returning: 0, visits: 1, activeMs: 5000, avgVisitMs: 5000, runs: 0 },
    allTotals: { people: 3, active: 3, new: 2, returning: 1, visits: 4, activeMs: 1265000, avgVisitMs: 316250, runs: 2 },
    people: [
      { email: 'ana@ruiz.co', name: 'Ana Ruiz', picture: '', providers: ['google.com'], test: false, firstAt: '2026-10-21T15:00:00.000Z', lastSignInAt: '2026-11-01T14:00:00.000Z', lastSeenAt: '2026-11-01T15:20:00.000Z',
        visits: 3, returns: 2, days: 3, views: 7, activeMs: 1200000, avgVisitMs: 400000, runs: 2, paid: 1,
        urls: [{ url: 'https://ana-shop.co/', at: '2026-11-01T15:05:00.000Z', status: 'done', paid: true }, { url: 'https://ana-shop.co/blog', at: '2026-10-25T10:00:00.000Z', status: 'done', paid: false }],
        recent: [{ startedAt: '2026-11-01T15:00:00.000Z', lastAt: '2026-11-01T15:20:00.000Z', activeMs: 840000, views: 4, pages: ['qa-review.html', 'qa-review-account.html'] }, { startedAt: '2026-10-28T12:00:00.000Z', lastAt: '2026-10-28T12:05:00.000Z', activeMs: 300000, views: 2, pages: ['qa-review-es.html'] }] },
      { email: 'leo@uni.edu', name: '', picture: '', providers: ['email'], test: false, firstAt: '2026-10-30T09:00:00.000Z', lastSignInAt: '2026-10-30T09:00:00.000Z', lastSeenAt: '2026-10-30T09:10:00.000Z',
        visits: 1, returns: 0, days: 1, views: 1, activeMs: 60000, avgVisitMs: 60000, runs: 0, paid: 0, urls: [], recent: [{ startedAt: '2026-10-30T09:00:00.000Z', lastAt: '2026-10-30T09:10:00.000Z', activeMs: 60000, views: 1, pages: ['qa-review.html'] }] },
      { email: 'playwright@example.com', name: '', picture: '', providers: ['email'], test: true, firstAt: '2026-10-31T09:00:00.000Z', lastSignInAt: '2026-10-31T09:00:00.000Z', lastSeenAt: '2026-10-31T09:00:00.000Z',
        visits: 1, returns: 0, days: 1, views: 1, activeMs: 5000, avgVisitMs: 5000, runs: 0, paid: 0, urls: [], recent: [] }
    ] },
  'engagement-connect': { ok: true, network: 'bluesky', account: 'qalaburlreview.bsky.social', message: 'Bluesky is connected as @qalaburlreview.bsky.social.' },
  notices: { ok: true, auto: true, tries: 3, notices: [
    { domain: 'acme.co', host: 'acme.co', email: 'info@acme.co', state: 'ready', critical: true, lang: 'es', tries: 0, createdAt: '2026-10-25T09:00:00Z', lastError: '', report: 'https://qalabreview.com/es?report=r1',
      candidates: [{ email: 'info@acme.co', sources: ['footer'], url: '', onDomain: true, stopped: false }, { email: 'ventas@acme.co', sources: ['contact page'], url: '', onDomain: true, stopped: false }, { email: 'old@acme.co', sources: ['rdap'], url: '', onDomain: false, stopped: true }] },
    { domain: 'gone.org', host: 'gone.org', email: 'web@gone.org', state: 'unlisted', critical: false, lang: 'en', tries: 0, createdAt: '2026-10-25T11:00:00Z', lastError: '', report: '',
      candidates: [{ email: 'web@gone.org', sources: ['schema'], url: '', onDomain: true, stopped: false }] },
    { domain: 'later.edu', host: 'later.edu', email: 'web@later.edu', state: 'waiting', critical: false, lang: 'pt', tries: 2, createdAt: '2026-10-25T12:00:00Z', lastError: 'later.edu is not on Live Reports yet. Send it after the daily publish lands.', report: '',
      candidates: [{ email: 'web@later.edu', sources: ['footer'], url: '', onDomain: true, stopped: false }, { email: 'reitoria@later.edu', sources: ['web search'], url: '', onDomain: false, stopped: false }] }
  ] },
  'notice-decide': { ok: true, status: 'sent', email: 'info@acme.co', emails: ['info@acme.co', 'ventas@acme.co'], failed: [] },
  'github-work': { ok: true, at: '2026-11-03T20:00:00Z', days: 30,
    needs: ['Give the qa-lab-agents app Dependabot alerts: read', 'Give the qa-lab-agents app Code scanning alerts: read'],
    access: { repos: ['kaanmuar/kaanmuar.github.io', 'kaanmuar/qa-lab-outreach'], missing: [{ repo: 'kaanmuar/jarvis-android', why: 'not in the installation' }], wanted: ['dependabot_alerts', 'security_events'], shown: ['kaanmuar/kaanmuar.github.io', 'kaanmuar/qa-lab-outreach', 'kaanmuar/cursor-quota', 'kaanmuar/cursor-quota-releases'] },
    score: { overall: { value: 81, grade: 'B' }, areas: {
      ci: { value: 72, grade: 'C', why: '2 workflows red on main' }, prs: { value: 85, grade: 'B', why: '1 PR has conflicts' }, board: { value: 64, grade: 'D', why: 'WIP 18 over the limit of 15' },
      issues: { value: 88, grade: 'B', why: '9 open bugs' }, branches: { value: 70, grade: 'C', why: '6 merged branches not deleted' }, deploys: { value: 95, grade: 'A', why: '3 deploys a day' },
      security: { value: 90, grade: 'A', why: 'No secrets open' }, budget: { value: 92, grade: 'A', why: '78% of GraphQL left' }, agents: { value: 58, grade: 'F', why: 'On-demand spend at 85%' } } },
    dora: { deployFreq: { perDay: 3.2, level: 'elite' }, leadTimeH: { median: 20.5, level: 'elite' }, changeFail: { pct: 12, level: 'high' }, mttrH: { median: 6, level: 'high' }, level: 'high' },
    streaks: { greenMainDays: 4, mergeDays: 9, xp: 1460, level: 6, nextAt: 1800, badges: ['100 PRs merged', 'Green week'] },
    ci: { ok: true, passRate: 91, runs: 2480, failed: 223, minutes: 9100, queueMedS: 14, durMedS: 312, flaky: { pct: 4, workflows: [{ name: 'Cypress', pct: 9, runs: 140 }] },
      workflows: [{ name: 'E2E and Visual Tests', path: '.github/workflows/e2e.yml', runs: 410, passRate: 82, durMedS: 640, mainRed: true, last: { conclusion: 'failure', at: '2026-11-03T19:10:00Z', url: 'https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/901' } },
        { name: 'Unit tests', path: '.github/workflows/unit.yml', runs: 600, passRate: 99, durMedS: 75, mainRed: false, last: { conclusion: 'success', at: '2026-11-03T19:40:00Z', url: 'https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/905' } }],
      failing: [{ id: 901, name: 'E2E and Visual Tests', branch: 'main', url: 'https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/901', at: '2026-11-03T19:10:00Z', attempt: 2, pr: null, sha: 'abc1234def', event: 'push',
        diag: { cause: 'The admin snapshot moved after the tab bar grew.', category: 'test', fix: 'Update the admin visual baseline.', confidence: 0.86, action: 'gh-agent', prompt: 'Update the admin visual baseline on main after the GitHub tab was added (#2526), then push.' } },
        { id: 902, name: 'Unit tests', branch: 'fix/2510-null-mx', url: 'https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/902', at: '2026-11-03T18:00:00Z', attempt: 1, pr: 2511, sha: 'fff0000aaa', event: 'pull_request', diag: null }],
      daily: [{ day: '2026-11-02', runs: 2400, failed: 210, minutes: 8800 }, { day: '2026-11-03', runs: 2480, failed: 223, minutes: 9100 }] },
    prs: { ok: true, open: 3, draft: 1, mergeReady: 1, conflicts: 1, behind: 1, red: 1, stale: 0, orphan: 1, leadMedH: 20.5, leadP90H: 70, merged: 42,
      items: [{ number: 2520, title: 'Jarvis: GitHub tab', url: 'https://github.com/kaanmuar/kaanmuar.github.io/pull/2520', author: 'kaanmuar', branch: 'feat/2526-jarvis-github', ageH: 5, updatedH: 1, state: 'clean', checks: 'pass', ticket: 2526, additions: 900, deletions: 40, labels: ['jarvis-merge'] },
        { number: 2511, title: 'BE: read a null MX record as no mail', url: 'https://github.com/kaanmuar/kaanmuar.github.io/pull/2511', author: 'kaanmuar', branch: 'fix/2510-null-mx', ageH: 30, updatedH: 20, state: 'dirty', checks: 'fail', ticket: 2510, additions: 30, deletions: 4, labels: [] },
        { number: 2505, title: 'Tidy the review footer', url: 'https://github.com/kaanmuar/kaanmuar.github.io/pull/2505', author: 'kaanmuar', branch: 'chore/footer', ageH: 80, updatedH: 76, state: 'behind', checks: 'pass', ticket: null, additions: 12, deletions: 12, labels: [] }],
      sizes: [{ label: 'XS', value: 10 }, { label: 'S', value: 20 }, { label: 'M', value: 9 }, { label: 'L', value: 3 }], daily: [{ day: '2026-11-02', opened: 5, merged: 6 }, { day: '2026-11-03', opened: 4, merged: 3 }] },
    board: { ok: true, wip: 18, wipLimit: 15, cycleMedD: 2.5,
      columns: [{ name: 'Backlog', count: 40, ageMedD: 20, items: [{ number: 1200, title: 'Old idea', days: 80, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/1200', labels: ['kind:request'] }] }, { name: 'Next', count: 6, ageMedD: 4, items: [] }, { name: 'Design', count: 2, ageMedD: 3, items: [] },
        { name: 'Dev', count: 9, ageMedD: 5, items: [{ number: 2490, title: 'Merged but still in Dev', days: 11, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2490', labels: ['area:jarvis'] }, { number: 2510, title: 'BE: a null MX record read as no mail setup', days: 4, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2510', labels: ['bug', 'area:be'] }] },
        { name: 'QA', count: 5, ageMedD: 2, items: [{ number: 2400, title: 'Stuck in QA', days: 12, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2400', labels: [] }] }, { name: 'Stg', count: 4, ageMedD: 1, items: [] }, { name: 'Prod', count: 3, ageMedD: 1, items: [] }, { name: 'Done', count: 400, ageMedD: 30, items: [] }],
      throughput: [{ week: '2026-W43', done: 30 }, { week: '2026-W44', done: 41 }],
      aging: [{ number: 2400, title: 'Stuck in QA', column: 'QA', days: 12, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2400' }],
      drift: [{ number: 2490, title: 'Merged but still in Dev', column: 'Dev', should: 'Done', why: 'PR #2491 merged 2 days ago', url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2490' }] },
    issues: { ok: true, open: 61, openBugs: 9, bugsByArea: [{ label: 'be', value: 5, items: [{ number: 2510, title: 'BE: a null MX record read as no mail setup', days: 4, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2510' }] }, { label: 'jarvis', value: 4, items: [{ number: 2530, title: 'Jarvis: the trend chart has no legend', days: 2, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2530' }] }], since: '2026-10-04', byKind: [{ label: 'kind:bug', value: 9 }, { label: 'kind:request', value: 30 }], opened: 70, closed: 64,
      daily: [{ day: '2026-11-02', opened: 3, closed: 4 }, { day: '2026-11-03', opened: 5, closed: 2 }], subIssues: { parents: 12, done: 30, total: 40, items: [{ number: 2546, title: 'Jarvis GitHub tab round 2', days: 3, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2546', done: 2, total: 8 }] },
      lists: { open: [{ number: 2530, title: 'Jarvis: the trend chart has no legend', days: 2, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2530' }], openBugs: [{ number: 2510, title: 'BE: a null MX record read as no mail setup', days: 4, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2510' }],
        opened: [{ number: 2530, title: 'Jarvis: the trend chart has no legend', days: 2, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2530' }], closed: [{ number: 2501, title: 'Done thing', days: 1, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2501' }] }, oldest: [{ number: 1200, title: 'Old idea', days: 80, url: 'https://github.com/kaanmuar/kaanmuar.github.io/issues/1200' }] },
    branches: { ok: true, total: 30, stale: 4, merged: [{ name: 'fix/2480-old', pr: 2481, days: 6 }, { name: 'feat/2470-thing', pr: 2471, days: 9 }], ahead: [{ name: 'fix/2510-null-mx', ahead: 3, behind: 12, days: 1, pr: 2511 }],
      worktrees: [{ path: '/Users/Apple/Documents/GitHub/kaanmuar.github.io/.worktrees/fix-2480-old', branch: 'fix/2480-old', ticket: 2480, chat: 'c1', alive: false, pr: 2481, prState: 'merged', dirty: false },
        { path: '/Users/Apple/Documents/GitHub/kaanmuar.github.io/.worktrees/feat-2526-jarvis-github', branch: 'feat/2526-jarvis-github', ticket: 2526, chat: 'c2', alive: true, pr: 2520, prState: 'open', dirty: true }] },
    deploys: { ok: true, last: [{ name: 'Deploy to Firebase', at: '2026-11-03T17:00:00Z', conclusion: 'success', url: 'https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/880', sha: 'abc1234' }],
      daily: [{ day: '2026-11-02', ok: 3, failed: 0 }, { day: '2026-11-03', ok: 2, failed: 1 }], environments: [{ name: 'github-pages', at: '2026-11-03T17:00:00Z', state: 'success' }] },
    security: { dependabot: { ok: false, error: 'Resource not accessible by integration', need: 'Dependabot alerts: read' }, codeScanning: { ok: false, error: 'Resource not accessible by integration', need: 'Code scanning alerts: read' }, secrets: { ok: true, open: 0, items: [] } },
    budget: { kaanmuar: { graphql: { used: 1100, limit: 5000, resetAt: '2026-11-03T21:00:00Z' }, core: { used: 300, limit: 5000, resetAt: '2026-11-03T21:00:00Z' }, at: '2026-11-03T20:00:00Z' }, app: { core: { used: 900, limit: 5000, resetAt: '2026-11-03T21:00:00Z' } },
      hourly: [{ hour: '2026-11-03T18:00:00Z', graphql: 900 }, { hour: '2026-11-03T19:00:00Z', graphql: 1100 }] },
    agents: { tickets: [{ ticket: 2526, title: 'Jarvis GitHub tab', hours: 3.5, chats: 5, costUsd: 12 }], open: [{ ticket: 2526, title: 'Jarvis GitHub tab', since: '2026-11-03T18:00:00Z' }], daily: [{ day: '2026-11-03', hours: 3.5, tickets: 1 }], cost: { cycleStart: '2026-10-20', onDemandUsd: 170, limitUsd: 200 } },
    android: { ok: true, releases: [{ tag: 'v1.8.0', at: '2026-11-01T12:00:00Z', url: 'https://github.com/kaanmuar/kaanmuar.github.io/releases/tag/v1.8.0' }], last: { conclusion: 'success', at: '2026-11-03T10:00:00Z', url: 'https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/870' }, builds: 12, failed: 1 },
    repos: [{ name: 'kaanmuar/kaanmuar.github.io', private: false, pushedAt: '2026-11-03T19:00:00Z', openIssues: 61, openPrs: 3, defaultBranch: 'main', ci: { conclusion: 'failure', at: '2026-11-03T19:10:00Z', url: 'https://github.com/kaanmuar/kaanmuar.github.io/actions' }, security: null, language: 'JavaScript' },
      { name: 'kaanmuar/qa-lab-outreach', private: true, pushedAt: '2026-11-02T10:00:00Z', openIssues: 2, openPrs: 0, defaultBranch: 'main', ci: { conclusion: 'success', at: '2026-11-02T10:00:00Z', url: 'https://github.com/kaanmuar/qa-lab-outreach/actions' }, security: null, language: 'Python' }],
    local: { at: '2026-11-03T19:58:00Z', ageMin: 2 },
    history: [{ day: '2026-11-02', passRate: 91, runs: 2400, failed: 210, merged: 6, opened: 3, closed: 4, openPrs: 4, openBugs: 8, wip: 17, score: 80 }, { day: '2026-11-03', passRate: 91, runs: 2480, failed: 223, merged: 3, opened: 5, closed: 2, openPrs: 3, openBugs: 9, wip: 18, score: 81 }],
    ai: { diagnoses: [{ run: 901, workflow: 'E2E and Visual Tests', cause: 'The admin snapshot moved after the tab bar grew.', category: 'test', fix: 'Update the admin visual baseline.', confidence: 0.86, action: 'gh-agent', prompt: '', at: '2026-11-03T19:20:00Z' }], retro: { week: '2026-W44', text: 'CI held at 91%. Board WIP crept over the limit.', at: '2026-11-02T12:00:00Z' } },
    flow: [{ from: 'Next', to: 'Dev', count: 14 }, { from: 'Dev', to: 'QA', count: 12 }, { from: 'QA', to: 'Dev', count: 3 }, { from: 'QA', to: 'Done', count: 6 }, { from: 'Stg', to: 'Prod', count: 8 }] },
  'github-agent': { ok: true, url: 'https://cursor.com/agents/bc-123', id: 'bc-123' },
  'github-act': { ok: true, message: 'Merged #2511.' }
};

// github-work with readable security alerts, a flaky workflow's newest failure and diagnoses that Fix can run (#2808).
function actionsWork() {
  const base = EXTERNAL['github-work'];
  const GH = 'https://github.com/kaanmuar/kaanmuar.github.io';
  const failing = [base.ci.failing[0], Object.assign({}, base.ci.failing[1], { diag: { cause: 'The runner lost its network.', category: 'infra', fix: 'Re-run it.', confidence: 0.8, action: 'rerun-ci', prompt: '' } })];
  const sev = (critical, high, medium, low) => ({ critical, high, medium, low });
  return Object.assign({}, base, {
    score: Object.assign({}, base.score, { areas: Object.assign({}, base.score.areas, { security: { value: 25, grade: 'F', why: '1 critical, 1 high, 2 medium or low', parts: [{ label: 'Dependabot critical', count: 1, each: 40, penalty: 40 }, { label: 'Dependabot high', count: 1, each: 20, penalty: 20 }, { label: 'Dependabot low', count: 1, each: 5, penalty: 5 }, { label: 'Code scanning medium', count: 1, each: 5, penalty: 5 }] } }) }),
    ci: Object.assign({}, base.ci, { failing, flaky: { pct: 4, workflows: [{ name: 'Cypress', path: '.github/workflows/cypress.yml', pct: 9, runs: 140, failures: 13, url: GH + '/actions/workflows/cypress.yml?query=is%3Afailure', links: [GH + '/actions/runs/950'],
      newest: { id: 950, url: GH + '/actions/runs/950', at: '2026-11-03T15:00:00Z', branch: 'main', pr: null, attempt: 1, failed: true, diag: null } }] } }),
    ai: Object.assign({}, base.ai, { diagnoses: base.ai.diagnoses.concat([{ run: 903, workflow: 'Unit tests', repo: 'kaanmuar/kaanmuar.github.io', branch: 'chore/footer', pr: 2505, url: GH + '/actions/runs/903', cause: 'The branch is behind a fixed test on main.', category: 'code', fix: 'Merge main.', confidence: 0.9, action: 'gh-update-pr', prompt: '', at: '2026-11-03T19:30:00Z' }]) }),
    security: {
      dependabot: { ok: true, open: 3, critical: 1, high: 1, bySeverity: sev(1, 1, 0, 1), byRepo: [{ label: 'kaanmuar/kaanmuar.github.io', value: 3 }], oldestD: 20, medianD: 7.5, byEcosystem: [{ label: 'npm', value: 3 }], byPackage: [{ label: 'axios', value: 1 }, { label: 'lodash', value: 1 }, { label: 'left-pad', value: 1 }],
        items: [{ repo: 'kaanmuar/kaanmuar.github.io', number: 1, severity: 'critical', package: 'axios', ecosystem: 'npm', manifest: 'package-lock.json', patched: '1.7.4', summary: 'SSRF in axios', url: GH + '/security/dependabot/1', created: '2026-10-14T00:00:00Z', pr: { number: 2520, url: GH + '/pull/2520', title: 'Bump axios' } },
          { repo: 'kaanmuar/kaanmuar.github.io', number: 2, severity: 'high', package: 'lodash', ecosystem: 'npm', manifest: 'functions/package.json', patched: '4.17.21', summary: 'Prototype pollution', url: GH + '/security/dependabot/2', created: '2026-10-30T00:00:00Z' },
          { repo: 'kaanmuar/kaanmuar.github.io', number: 3, severity: 'low', package: 'left-pad', ecosystem: 'npm', manifest: 'package.json', patched: '1.3.0', summary: 'Slow padding', url: GH + '/security/dependabot/3', created: '2026-11-01T00:00:00Z' }] },
      codeScanning: { ok: true, open: 1, critical: 0, high: 0, bySeverity: sev(0, 0, 1, 0), byRepo: [{ label: 'kaanmuar/kaanmuar.github.io', value: 1 }], oldestD: 5, medianD: 5,
        items: [{ repo: 'kaanmuar/kaanmuar.github.io', number: 7, severity: 'medium', rule: 'js/xss', tool: 'CodeQL', path: 'js/app.js', url: GH + '/security/code-scanning/7', created: '2026-10-29T00:00:00Z' }] },
      secrets: { ok: true, open: 1, critical: 1, high: 0, bySeverity: sev(1, 0, 0, 0), byRepo: [{ label: 'kaanmuar/qa-lab-outreach', value: 1 }], oldestD: 2, medianD: 2,
        items: [{ repo: 'kaanmuar/qa-lab-outreach', number: 4, severity: 'critical', type: 'Google API Key', url: 'https://github.com/kaanmuar/qa-lab-outreach/security/secret-scanning/4', created: '2026-11-01T00:00:00Z' }] },
      weeks: [{ week: '2026-W43', opened: 1, fixed: 0, dismissed: 0 }, { week: '2026-W44', opened: 2, fixed: 1, dismissed: 1 }, { week: '2026-W45', opened: 2, fixed: 0, dismissed: 0 }]
    }
  });
}

// The external sources jarvisSnapshot (functions/index.js) carries.
const SNAPSHOT_OPS = ['health', 'jobs', 'github', 'uptime', 'speed', 'pagespeed', 'local', 'ga4', 'cloudflare', 'money', 'email', 'mailbox', 'social', 'safety', 'platform', 'search', 'outreach', 'targets', 'addresses', 'marketing', 'marketing-sync', 'calls', 'engagement', 'people', 'github-work', 'geo', 'calendar'];
// The collections the web Jarvis used to read itself (#2102); the snapshot op reads them on the server now.
const JARVIS_ROWS = ['site_events', 'url_review_opens', 'url_reviews', 'url_review_alerts', 'url_review_reports', 'socialHubStats/latest'];

// What jarvisSnapshot answers for the seed: the same core summaries over the range and the one before it.
function snapshotOf(data, days, extra) {
  const answer = (op) => (extra || {})[op] || EXTERNAL[op];
  const w = core.windowFor(String(days || 30), new Date());
  const when = (row) => core.toDate(row.createdAt);
  const inside = (row) => when(row) >= w.start;
  const before = (row) => when(row) < w.start && when(row) >= w.prior.start;
  const events = data.site_events.filter(inside), was = data.site_events.filter(before);
  const opens = data.url_review_opens.filter(inside), reviews = data.url_reviews.filter(inside);
  return {
    ok: true, op: 'snapshot', cachedAt: new Date().toISOString(), window: w,
    products: {
      cv: core.summarizeSite('cv', events, was, w), studio: core.summarizeSite('studio', events, was, w), lab: core.summarizeSite('lab', events, was, w),
      review: core.summarizeReview({ opens, reviews, events, prior: { opens: data.url_review_opens.filter(before).length, reviews: data.url_reviews.filter(before).length } }, w),
      hub: core.summarizeHub(data['socialHubStats/latest'], events, w, was)
    },
    external: Object.fromEntries(SNAPSHOT_OPS.map((op) => [op, Object.assign({ ok: true }, answer(op) || {})])),
    outreachVisits: core.outreachVisits(events), feed: core.feed({ events, opens, reviews }), socialHeat: core.socialHeat(events), reports: data.url_review_reports,
    settings: answer('settings'), goals: answer('goals').goals, mailCodes: (answer('mail-codes') || {}).codes || [], devices: []
  };
}

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

async function openStats(page, hash, extra) {
  const calls = [];
  const layout = {};
  const data = seed();
  await page.addInitScript((rows) => { window.__data = rows; }, data);
  for (const [file, body] of Object.entries(STUBS)) {
    await page.route(FIREBASE + file, (route) => route.fulfill({ contentType: 'text/javascript', body }));
  }
  await page.route(/cloudfunctions\.net\/jarvis$/, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    const body = JSON.parse(request.postData() || '{}');
    calls.push({ op: body.op, auth: request.headers().authorization, body });
    if (body.op === 'brief-mark') return route.fulfill({ json: { op: body.op, ok: true, key: body.key, status: body.status, until: new Date(Date.now() + 864e5).toISOString() }, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (body.op === 'settings-save' && body.layout) {
      Object.entries(body.layout).forEach(([tab, l]) => { if (l) layout[tab] = l; else delete layout[tab]; });
      return route.fulfill({ json: { op: body.op, ok: true, layout }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (body.op === 'settings-save') return route.fulfill({ json: Object.assign({ op: body.op, ok: true, updatedAt: new Date().toISOString() }, body.settings), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (body.op === 'snapshot') {
      const snap = snapshotOf(data, body.days, extra);
      const full = Object.assign(snap, { settings: Object.assign({}, snap.settings, { layout }) });
      return route.fulfill({ json: extra && extra.snapshotAnswer ? await extra.snapshotAnswer(body, full) : full, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const answer = (extra || {})[body.op] || EXTERNAL[body.op] || (body.op === 'brief' || body.op === 'ask' ? { ok: true, text: 'Jarvis says the CV is up. Next: answer the inbox.' } : { ok: true, ran: body.job });
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
    await expect(tabs).toHaveCount(16);
    await expect(tabs).toContainText(['Overview', 'Inbox', 'CV', 'QA Studio', 'QA Lab', 'URL Review', 'Social hub', 'Business', 'Outreach', 'Marketing', 'Map', 'Engagement', 'Traffic', 'Systems', 'GitHub', 'Console']);
    await expect(page.locator('#jv-hello')).toContainText('Carlos');
    await expect(page.locator('[data-view="overview"] .jv-briefing')).toContainText('sweepReviews');
    await expect(page.locator('#jv-ready')).not.toHaveText('—');
    await expect(page.locator('link[rel="icon"][data-jv-icon]')).toHaveAttribute('href', /^data:image\/png;base64,/);
    await expect(page).toHaveTitle(/^\(\d+\) \d+% · CV Admin Panel/);
    // #2102: one snapshot, the app's cached answer, instead of the range's raw rows and a call per source.
    await expect.poll(() => new Set(calls.map((c) => c.op))).toEqual(new Set(['snapshot', 'actions', 'notices', 'social-proposals', 'social-runs', 'studio', 'share-list', 'proposals', 'brief-marks']));
    expect(calls.filter((c) => c.op === 'snapshot')).toHaveLength(1);
    expect((await page.evaluate(() => window.__reads || [])).filter((name) => JARVIS_ROWS.includes(name))).toEqual([]);
    expect(calls.every((c) => c.auth === 'Bearer owner-token')).toBe(true);
    expect(calls.every((c) => c.body.device?.kind === 'desktop' && c.body.device.app === 'web')).toBe(true);

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
    await expect(outreach.locator('.jv-targets')).toContainText('On pace');
    await expect(outreach.locator('.jv-targets')).toContainText('3 / 30');
    page.once('dialog', (dialog) => dialog.accept('Acme agency'));
    await outreach.locator('[data-tg-act="log"][data-key="unlocks"]').click();
    await expect.poll(() => (calls.find((c) => c.op === 'outreach-target') || {}).body).toMatchObject({ action: 'log', key: 'unlocks', note: 'Acme agency' });
    await expect(outreach).toContainText('INSTANTLY_API_KEY');
    await expect(outreach).toContainText('p=none');
    await expect(outreach.locator('.jv-briefing')).toContainText('Instantly trial ends in 6 days');
    await expect(outreach).toContainText('Worker not live');
    await expect(outreach).toContainText('upb.edu.co');
    await expect(outreach).toContainText('qalabreview.com/qr');
    await expect(outreach.locator('.jv-briefing')).toContainText('short links are not live');

    await tabs.filter({ hasText: 'Traffic' }).click();
    await expect(page.locator('[data-view="traffic"]')).toContainText('Zone > Analytics > Read');

    await tabs.filter({ hasText: 'Systems' }).click();
    const systems = page.locator('[data-view="systems"]');
    await expect(systems).toContainText('Connections');
    await expect(systems.locator('[data-panel-id="systems-codes"]')).toContainText('TikTok');
    await expect(systems.locator('[data-copy-code="739201"]')).toBeVisible();
    await expect(systems.locator('[data-panel-id="systems-mailbox"]')).toContainText('came back in 38 s');
    await expect(systems.locator('[data-panel-id="systems-mailbox"]')).toContainText('2 / 12,000');
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

  for (const [width, folded] of [[360, true], [720, false]]) {
    test(`every tab's sections move, hide, come back and reset, saved per tab and kept after a reload, ${folded ? 'folded' : 'unfolded'} at ${width}px (#2809)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const calls = await openStats(page, '#stats/review/30');
      const view = page.locator('[data-view="review"]');
      const shown = () => view.evaluate((v) => Array.from(v.querySelectorAll('.jv-grid > .jv-panel[data-panel-id]')).filter((p) => !p.hidden).map((p) => p.dataset.panelId));
      await expect(view.locator('.jv-panel[data-panel-id="review-funnel"]')).toBeVisible();
      await expect(view.locator('.jv-lay-tools')).toHaveCount(0);
      const before = await shown();
      expect(before.length).toBeGreaterThan(4);

      await view.locator('[data-lay="edit"]').click();
      await expect(view.locator('[data-lay="done"]')).toBeFocused();
      const funnel = before.indexOf('review-funnel');
      await view.locator('[data-lay="up"][data-id="review-funnel"]').click();
      await expect.poll(shown).toEqual([...before.slice(0, funnel - 1), 'review-funnel', before[funnel - 1], ...before.slice(funnel + 1)]);
      await expect(view.locator('[data-lay="up"][data-id="review-funnel"]')).toBeFocused();
      await view.locator('[data-lay="drag"][data-id="review-funnel"]').press('ArrowDown');
      await expect.poll(shown).toEqual(before);
      await expect(view.locator('[data-lay="drag"][data-id="review-funnel"]')).toBeFocused();
      const trend = before.indexOf('review-trend');
      const ahead = before[trend - 1];
      await view.locator(`.jv-panel[data-panel-id="${ahead}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const from = await view.locator('[data-lay="drag"][data-id="review-trend"]').boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      const target = await view.locator(`.jv-panel[data-panel-id="${ahead}"]`).boundingBox();
      await page.mouse.move(target.x + 8, target.y + 8, { steps: 6 });
      await page.mouse.up();
      await expect.poll(shown).toEqual([...before.slice(0, trend - 1), 'review-trend', ahead, ...before.slice(trend + 1)]);
      await view.locator('[data-lay="hide"][data-id="review-heat"]').click();
      await expect(view.locator('.jv-panel[data-panel-id="review-heat"]')).toBeHidden();
      await expect(view.locator('.jv-lay-tray')).toContainText('When they open it');
      await view.locator('.jv-lay-bar').evaluate((el) => el.scrollIntoView());
      await testInfo.attach('edit', { body: await page.screenshot(), contentType: 'image/png' });
      if (process.env.LAYOUT_SHOTS) await page.screenshot({ path: `${process.env.LAYOUT_SHOTS}/2809-web-${width}-edit.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const edited = await shown();
      await view.locator('[data-lay="done"]').click();
      await expect(view.locator('.jv-lay-tools')).toHaveCount(0);
      await expect.poll(() => calls.filter((c) => c.op === 'settings-save').map((c) => c.body)).toHaveLength(1);
      const saved = calls.find((c) => c.op === 'settings-save').body.layout.review;
      expect(saved.order.indexOf('review-trend')).toBe(saved.order.indexOf(ahead) - 1);
      expect(saved.hidden).toEqual(['review-heat']);
      expect(calls.find((c) => c.op === 'settings-save').body.settings).toBeUndefined();

      await page.reload();
      await expect(view.locator('.jv-panel[data-panel-id="review-funnel"]')).toBeVisible();
      await expect.poll(shown).toEqual(edited);
      await expect(view.locator('.jv-panel[data-panel-id="review-heat"]')).toBeHidden();
      await expect(view.locator('.jv-lay-bar')).toContainText('1 hidden');

      await view.locator('[data-lay="edit"]').click();
      await view.locator('[data-lay="show"][data-id="review-heat"]').click();
      await expect(view.locator('.jv-panel[data-panel-id="review-heat"]')).toBeVisible();
      await view.locator('[data-lay="reset"]').click();
      await expect.poll(shown).toEqual(before);
      await view.locator('[data-lay="done"]').click();
      await expect.poll(() => calls.filter((c) => c.op === 'settings-save').length).toBe(2);
      expect(calls.filter((c) => c.op === 'settings-save')[1].body.layout).toEqual({ review: null });
      await page.reload();
      await expect(view.locator('.jv-panel[data-panel-id="review-funnel"]')).toBeVisible();
      await expect.poll(shown).toEqual(before);
      expect(errors).toEqual([]);
    });
  }

  test('a layout that does not save comes back as it was, with a note (#2809)', async ({ page }) => {
    await openStats(page, '#stats/systems/30');
    await page.route(/cloudfunctions\.net\/jarvis$/, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.op === 'settings-save') return route.fulfill({ status: 500, json: { ok: false, error: 'offline' }, headers: { 'Access-Control-Allow-Origin': '*' } });
      return route.fallback();
    });
    const view = page.locator('[data-view="systems"]');
    const shown = () => view.evaluate((v) => Array.from(v.querySelectorAll('.jv-grid > .jv-panel[data-panel-id]')).filter((p) => !p.hidden).map((p) => p.dataset.panelId));
    await expect(view.locator('.jv-panel[data-panel-id="systems-matrix"]')).toBeVisible();
    const before = await shown();
    await view.locator('[data-lay="edit"]').click();
    await view.locator('[data-lay="hide"][data-id="systems-matrix"]').click();
    await view.locator('[data-lay="done"]').click();
    await expect(page.locator('.jv-toast')).toContainText('The layout did not save: offline');
    await expect.poll(shown).toEqual(before);
  });

  test('every section folds and unfolds, Collapse all and Expand all work, and the folds survive a reload (#1973)', async ({ page }) => {
    await openStats(page, '#stats/hub/30');
    const share = page.locator('[data-view="hub"] .jv-panel[data-panel-id="hub-share"]');
    const fold = share.locator('.jv-fold');
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await fold.click();
    await expect(share).toHaveClass(/is-folded/);
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(share.locator('[data-share-caption]')).toBeHidden();
    await page.reload();
    await expect(page.locator('[data-view="hub"] .jv-panel[data-panel-id="hub-share"]')).toHaveClass(/is-folded/);
    await page.locator('[data-view="hub"] .jv-panel[data-panel-id="hub-share"] .jv-fold').click();
    await expect(page.locator('[data-view="hub"] .jv-panel[data-panel-id="hub-share"]')).not.toHaveClass(/is-folded/);
    const view = page.locator('[data-view="hub"]');
    await view.locator('[data-fold-all="1"]').click();
    await expect(view.locator('.jv-panel[data-panel-id]:not(.is-folded)')).toHaveCount(0);    await view.locator('[data-fold-all="0"]').click();
    await expect(view.locator('.jv-panel.is-folded')).toHaveCount(0);
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

  test('a post proposal shows its card image, and a card that fails to load becomes a note (#2248)', async ({ page }, testInfo) => {
    const card = require('fs').readFileSync(require('path').join(__dirname, '../assets/social/sweep-roundup/2026-11-02.jpg'));
    await page.route('https://cards.test/**', (route) => (route.request().url().endsWith('/roundup.jpg') ? route.fulfill({ contentType: 'image/jpeg', body: card }) : route.fulfill({ status: 404, body: 'gone' })));
    await openStats(page, '#stats/hub/30', { 'social-proposals': { ok: true, built: '2026-11-08T06:00:00Z', proposals: [
      { id: '675190976b59', title: 'QA Lab field sweep: the week of November 2', source: 'QA Lab', lang: 'en', score: 9, summary: 'This week across the sweep.', url: 'https://carlosandmunoz.com/', image: 'https://cards.test/roundup.jpg' },
      { id: 'c48a95c5d4f8', title: 'SEO Pulse: November', source: 'Search Engine Journal', lang: 'en', score: 7, url: 'https://www.searchenginejournal.com/', image: 'https://cards.test/gone.jpg' },
      { id: 'b19c686b84f7', title: 'No card here', source: 'DEV', lang: 'en', score: 5, url: 'https://dev.to/', image: '' }
    ] } });
    const panel = page.locator('[data-view="hub"] [data-panel-id="hub-proposals"]');
    const items = panel.locator('.jv-prop');
    await expect(items).toHaveCount(3);
    const shown = items.nth(0).locator('img.jv-prop-card');
    await expect(shown).toHaveAttribute('alt', 'Card image: QA Lab field sweep: the week of November 2');
    await expect.poll(() => shown.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await expect(items.nth(1).locator('img')).toHaveCount(0);
    await expect(items.nth(1)).toContainText('The card image did not load.');
    await expect(items.nth(2).locator('img, .jv-prop-nocard')).toHaveCount(0);
    await shown.evaluate((img) => img.decode());
    await panel.screenshot({ path: testInfo.outputPath('hub-proposals.png') });
  });

  test('Social hub shows the queue per channel, the posting runs and the proposals, and Approve and Post now go through the function (#1420)', async ({ page }) => {
    const calls = await openStats(page, '#stats/hub/30');
    const hub = page.locator('[data-view="hub"]');
    await expect(hub).toContainText('TikTok');
    await expect(hub).toContainText('ssl-expiry');
    await expect(hub.getByRole('row', { name: 'Instagram 0 nothing scheduled 9 2' })).toBeVisible();
    await expect(hub).toContainText('Facebook Page');
    await expect(hub).toContainText('failure');
    await expect(hub).toContainText('Google drops FID from Core Web Vitals');

    await hub.locator('[data-social-decide="approved"][data-key="fid-gone"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'social-decide').map((c) => [c.body.id, c.body.decision])).toEqual([['fid-gone', 'approved']]);
    await expect(hub).not.toContainText('Google drops FID from Core Web Vitals');

    const post = hub.locator('[data-act="social-post-now"]');
    page.once('dialog', (dialog) => dialog.dismiss());
    await post.click();
    expect(calls.some((c) => c.op === 'social-post-now')).toBe(false);
    page.once('dialog', (dialog) => dialog.accept());
    await post.click();
    await expect.poll(() => calls.filter((c) => c.op === 'social-post-now').length).toBe(1);
    await expect(page.locator('.jv-toast')).toContainText('Started Buffer and Facebook Page');
  });

  test('Share a post uploads the media, shows the Gemini drafts to edit, and queues the edited posts (#1420)', async ({ page }) => {
    const calls = await openStats(page, '#stats/hub/30');
    const share = page.locator('.jv-panel[data-panel-id="hub-share"]').first();
    await expect(share).toContainText('Launch day photo');
    await expect(share.locator('[data-act="share-draft"]')).toBeDisabled();
    await share.locator('[data-share-file]').setInputFiles({ name: 'launch.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
    await share.locator('[data-share-caption]').fill('Our new SSL check is live.');
    await share.locator('[data-act="share-draft"]').click();
    await expect.poll(() => page.evaluate(() => window.__uploads || [])).toEqual(['launch.jpg']);
    const draft = calls.find((c) => c.op === 'share-draft');
    expect(draft.body.caption).toBe('Our new SSL check is live.');
    expect(draft.body.path).toMatch(/^social-inbox\/[\w-]+\.jpg$/);

    const x = share.locator('[data-share-field="x"]');
    await expect(x).toHaveValue('X draft');
    await expect(share.locator('[data-share-field="tiktok"]')).toHaveCount(0);
    await x.fill('Edited X post');
    await share.locator('[data-act="share-queue"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'share-queue').map((c) => [c.body.id, c.body.draft.x])).toEqual([['new1', 'Edited X post']]);
    await expect(page.locator('.jv-toast')).toContainText('Queued.');
    await expect(share.locator('[data-share-caption]')).toHaveValue('');
  });

  test('URL Review shows the Google Maps Local check across reviews and its Places calls (#2118)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 1000 });
    await openStats(page, '#stats/review/30');
    const local = page.locator('[data-view="review"] [data-panel-id="review-local"]');
    await expect(local).toContainText('Google Maps: local businesses · 2');
    await expect(local.locator('.jv-stats')).toContainText('Places errors');
    await expect(local).toContainText('speed-plumbing.com');
    await expect(local).toContainText('Opening hours');
    await expect(local).toContainText('No profile found');
    await expect(local).toContainText('status 429');
    expect(errors).toEqual([]);
  });

  test('URL Review lists the signed-in people, their runs, returns and time, and the switch keeps tests apart (#1976)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 1000 });
    await openStats(page, '#stats/review/30');
    const people = page.locator('[data-view="review"] [data-panel-id="review-people"]');
    await expect(people).toContainText('Signed-in people · 2');
    await expect(people.locator('.jv-stats')).toContainText('21 min');
    await expect(people).not.toContainText('playwright@example.com');
    const ana = people.locator('[data-person="ana@ruiz.co"]');
    await expect(ana).toContainText('back 2×');
    await ana.locator('summary').click();
    await expect(ana).toContainText('ana-shop.co/blog');
    await expect(ana).toContainText('qa-review-account.html');
    await people.scrollIntoViewIfNeeded();
    await people.screenshot({ path: 'test-results/jarvis-signed-in-people.png' });
    await page.locator('.jv-seg [data-mail="test"]').click();
    await expect(people).toContainText('playwright@example.com');
    await expect(people).not.toContainText('Ana Ruiz');
    await page.locator('.jv-seg [data-mail="real"]').click();
    await expect(people.locator('[data-person="ana@ruiz.co"]')).toHaveAttribute('open', '');
    expect(errors).toEqual([]);
  });

  test('Engagement shows the reply drafts, the scout, the networks and the accounts, and Approve, Dismiss, Pause, Go live and Connect Bluesky go through the function (#1988, #1990)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/engagement/7');
    const eg = page.locator('[data-view="engagement"]');
    const waiting = eg.locator('[data-panel-id="engagement-waiting"]');
    await expect(waiting).toContainText('Playwright and WCAG accessibility testing in CI');
    await expect(waiting.locator('[data-eg-draft]')).toHaveValue('Corremos axe en el mismo job de Playwright.');
    await expect(waiting.locator('.jv-eg-english')).toHaveText('In English: We run axe in the same Playwright job.');
    if (process.env.WAITING_SHOT) await waiting.screenshot({ path: process.env.WAITING_SHOT });
    await expect(eg.locator('[data-panel-id="engagement-networks"]')).toContainText('Mac browser');
    await expect(eg.locator('[data-panel-id="engagement-networks"]')).toContainText('API as qalaburlreview');
    const joins = eg.locator('[data-panel-id="engagement-joins"]');
    await expect(joins).toContainText('r/QualityAssurance');
    await expect(joins).toContainText('would join (dry run)');
    await expect(joins).toContainText('ru');
    await expect(joins).toContainText('Reddit: 1 of 1 today, 11 found to join');
    await expect(eg.locator('[name="cap-join"]')).toHaveValue('2');
    if (process.env.JOINS_SHOT) await joins.screenshot({ path: process.env.JOINS_SHOT });
    await expect(eg).toContainText('paste an app password');
    const accounts = eg.locator('[data-panel-id="engagement-accounts"]');
    await expect(accounts).toContainText('connected as qalaburlreview');
    await expect(accounts).toContainText('bot flag on');
    await expect(accounts).toContainText('connected as QA-lab URL Review');
    await expect(accounts.locator('[data-eg-connect="youtube"]')).toHaveText('Reconnect');
    await expect(eg.locator('[data-panel-id="engagement-status"]')).toContainText('dry run');
    await expect(eg.locator('[data-panel-id="engagement-approved"]')).toContainText('posted');
    await expect(eg.locator('[data-panel-id="engagement-approved"] a', { hasText: 'Our reply' })).toHaveAttribute('href', /mastodon\.social\/@qalaburlreview\//);

    await accounts.locator('[data-eg-bluesky] [name="password"]').fill('abcd-efgh-ijkl-mnop');
    await accounts.locator('[data-eg-bluesky] button[type="submit"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'engagement-connect').map((c) => [c.body.network, c.body.handle, c.body.password]))
      .toEqual([['bluesky', 'qalaburlreview.bsky.social', 'abcd-efgh-ijkl-mnop']]);
    await expect(page.locator('.jv-toast')).toContainText('Bluesky is connected');

    page.once('dialog', (dialog) => dialog.dismiss());
    await waiting.locator('[data-eg-decide="dismiss"]').click();
    expect(calls.some((c) => c.op === 'engagement-decide')).toBe(false);

    await waiting.locator('[data-eg-draft]').fill('We run axe-core in the same Playwright job, on every pull request.');
    await waiting.locator('[data-eg-decide="approve"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'engagement-decide').map((c) => [c.body.decision, c.body.text]))
      .toEqual([['edit', 'We run axe-core in the same Playwright job, on every pull request.']]);
    await expect(page.locator('.jv-toast')).toContainText('Edited and approved.');

    page.once('dialog', (dialog) => dialog.accept());
    await eg.locator('[data-eg-pause="on"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'engagement-settings').map((c) => c.body.settings)).toEqual([{ paused: true }]);
    page.once('dialog', (dialog) => dialog.accept());
    await eg.locator('[data-eg-live="on"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'engagement-settings').map((c) => c.body.settings)).toEqual([{ paused: true }, { live: true }]);
    expect(errors).toEqual([]);
  });

  test('Owner tags show their state, accounts by status and recent comments; Approve, Block, Add account, Pause and Run now go through the function (#2660)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/engagement/7');
    const ot = page.locator('[data-view="engagement"] [data-panel-id="engagement-owner-tags"]');
    await expect(ot).toContainText('Owner tags · live');
    await expect(ot).toContainText('Suggestions waiting');
    await expect(ot).toContainText('Posted in the last 7 days: Bluesky 1');
    await expect(ot.locator('details[open] summary')).toHaveText('Suggested · 3');
    await expect(ot.locator('details[open]')).toContainText('city transit agency');
    await expect(ot.locator('details[open] a', { hasText: '@movilidad.bsky.social' })).toHaveAttribute('href', 'https://bsky.app/profile/movilidad.bsky.social');
    await expect(ot).toContainText('422 rate limited');
    await expect(ot.locator('a', { hasText: 'Our comment' })).toHaveAttribute('href', /bsky\.app\/profile\/qalaburlreview\.bsky\.social\/post\/3xyz/);
    if (process.env.OWNER_TAGS_SHOT) await ot.screenshot({ path: process.env.OWNER_TAGS_SHOT });

    await ot.locator('[data-ot-acct="approved"][data-handle="metrodebogota"][data-network="x"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'owner-tags-account').map((c) => [c.body.network, c.body.handle, c.body.status])).toEqual([['x', 'metrodebogota', 'approved']]);
    page.once('dialog', (dialog) => dialog.dismiss());
    await ot.locator('[data-ot-acct="blocked"][data-handle="BogotaET"]').click();
    expect(calls.filter((c) => c.op === 'owner-tags-account').length).toBe(1);

    await ot.locator('[data-ot-add] [name="who"]').fill('@Movilidad_Bog');
    await ot.locator('[data-ot-add] [name="network"]').selectOption('x');
    await ot.locator('[data-ot-add] [name="scopeKind"]').selectOption('city');
    await ot.locator('[data-ot-add] [name="scopeValue"]').fill('Bogotá');
    await ot.locator('[data-ot-add] button[type="submit"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'owner-tags-account').map((c) => c.body).pop()).toMatchObject({ network: 'x', handle: 'Movilidad_Bog', scope: 'city:bogota', kind: 'related', status: 'approved' });

    page.once('dialog', (dialog) => dialog.accept());
    await ot.locator('[data-ot-pause="on"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'owner-tags-settings').map((c) => c.body.settings)).toEqual([{ paused: true }]);
    page.once('dialog', (dialog) => dialog.accept());
    await ot.locator('[data-ot-run]').click();
    await expect(page.locator('.jv-toast')).toContainText('Owner tags ran: owner tags: 6 posts');
    expect(errors).toEqual([]);
  });

  test('Map shows the world shaded by the chosen metric, the missing zones and a country sheet whose buttons go through the function (#2976)', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/geo/30', { 'action-run': { ok: true, done: 1, action: 'calendar-pause', note: 'W1 E-pt Brazil will pause on the holiday.' } });
    const geo = page.locator('[data-view="geo"]');
    await expect(geo.locator('.jv-geo-map path').first()).toBeVisible();
    expect(await geo.locator('.jv-geo-map path').count()).toBeGreaterThan(150);
    await expect(geo.locator('[data-panel-id="geo-map"] header')).toContainText('Light');
    await expect(geo.locator('.jv-geo-lights')).toContainText('Blazing · 6');
    await expect(geo.locator('.jv-geo-lights')).toContainText('Spark · 4');
    for (const name of ['USA', 'Brazil', 'Mexico', 'India', 'Chile']) await expect(geo.locator('.jv-geo-l', { hasText: name })).toBeVisible();
    await expect(geo.locator('[data-geo-label="AO"]')).toHaveCount(0);
    await expect(geo.locator('path[data-geo-cc="MX"]')).toHaveAttribute('filter', 'url(#jv-geo-glow5)');
    const boxes = await geo.locator('.jv-geo-l').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => [b.left, b.top, b.right, b.bottom]));
    const clash = boxes.some((a, i) => boxes.some((b, j) => j > i && a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1));
    expect(clash).toBe(false);
    if (process.env.GEO_SHOTS) await geo.locator('[data-panel-id="geo-map"]').screenshot({ path: `${process.env.GEO_SHOTS}/2988-map-light.png` });
    await geo.locator('path[data-geo-cc="BR"]').hover();
    const card = geo.locator('.jv-geo-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('🇧🇷 Brazil');
    await expect(card).toContainText('Bright');
    await expect(card).toContainText('Sent180');
    await expect(card).toContainText('Bouncing');
    if (process.env.GEO_SHOTS) await geo.locator('[data-panel-id="geo-map"]').screenshot({ path: `${process.env.GEO_SHOTS}/2988-hover.png` });
    await page.mouse.move(0, 0);
    await expect(card).toBeHidden();
    await expect(geo.locator('.jv-kpi').first()).toContainText('Countries we act in');
    await expect(geo.locator('[data-panel-id="geo-gaps"]')).toContainText('Out of prospects');
    await expect(geo.locator('path[data-geo-cc="CO"]')).not.toHaveAttribute('fill', '#14222c');
    await geo.locator('[data-geo-channel="email"]').click();
    await geo.locator('[data-geo-metric]').selectOption('replyRate');
    await expect(geo.locator('[data-panel-id="geo-map"] header')).toContainText('Reply rate');
    await geo.locator('[data-geo-metric]').selectOption('gaps');
    await expect(geo.locator('.jv-geo-legend')).toContainText('Low replies');
    if (process.env.GEO_SHOTS) await geo.screenshot({ path: `${process.env.GEO_SHOTS}/2976-map-gaps.png` });
    // #2989: the Dates ahead metric, the Upcoming dates panel, and the holiday pause in the country sheet.
    const holiday = CALENDAR.days.find((d) => d.kind === 'holiday' && d.ccs.includes('BR'));
    await geo.locator('[data-geo-channel="all"]').click();
    await geo.locator('[data-geo-metric]').selectOption('dates');
    await expect(geo.locator('[data-panel-id="geo-map"] header')).toContainText('Dates ahead');
    await expect(geo.locator('.jv-geo-scale')).toContainText('today');
    await expect(geo.locator('path[data-geo-cc="BR"]')).toHaveAttribute('fill', /^rgba/);
    await expect(geo.locator('path[data-geo-cc="BR"]')).toHaveAttribute('aria-label', /Proclamação da República in \d+ days/);
    await expect(geo.locator('[data-panel-id="geo-ranking"]')).toContainText(/Brazil.*in \d+ days/);
    const dates = geo.locator('[data-panel-id="geo-dates"]');
    await expect(dates).toContainText('Upcoming dates');
    await expect(dates).toContainText('Republic Day');
    await expect(dates).toContainText('Mexico (Día de la Revolución)');
    await expect(dates).toContainText('Nager.Date has no public holidays for 1 target markets: BF.');
    if (process.env.GEO_SHOTS) {
      await geo.locator('[data-panel-id="geo-map"]').screenshot({ path: `${process.env.GEO_SHOTS}/2989-map-dates.png` });
      await dates.screenshot({ path: `${process.env.GEO_SHOTS}/2989-dates-panel.png` });
    }
    await geo.locator('path[data-geo-cc="BR"]').click();
    const sheet = geo.locator('[data-panel-id="geo-country"]');
    await expect(sheet).toContainText('Brazil');
    await expect(sheet).toContainText('W1 E-pt Brazil');
    await expect(sheet.locator('.jv-funnel')).toBeVisible();
    await expect(sheet).toContainText('Proclamação da República');
    if (process.env.GEO_SHOTS) await sheet.screenshot({ path: `${process.env.GEO_SHOTS}/2976-country.png` });
    if (process.env.GEO_SHOTS) await sheet.locator('.jv-dates-country').screenshot({ path: `${process.env.GEO_SHOTS}/2989-country-dates.png` });
    page.once('dialog', (d) => d.accept());
    await sheet.locator('[data-cal-act="pause"]').click();
    await expect.poll(() => calls.find((c) => c.op === 'action-run')).toBeTruthy();
    expect(calls.find((c) => c.op === 'action-run').body).toMatchObject({ action: 'calendar-pause', proposal: `calendar:pause:BR:${holiday.date}` });
    page.once('dialog', (d) => d.accept());
    await sheet.locator('[data-geo-target]').click();
    await expect.poll(() => calls.find((c) => c.op === 'geo-target')).toBeTruthy();
    expect(calls.find((c) => c.op === 'geo-target').body).toMatchObject({ cc: 'BR', on: false });
    await testInfo.attach('map', { body: await geo.screenshot(), contentType: 'image/png' });
    if (process.env.GEO_SHOTS) {
      await page.setViewportSize({ width: 390, height: 844 });
      await geo.locator('[data-geo-channel="all"]').click();
      await geo.locator('[data-geo-metric]').selectOption('light');
      await geo.locator('[data-panel-id="geo-map"]').screenshot({ path: `${process.env.GEO_SHOTS}/2988-map-phone.png` });
    }
    expect(errors).toEqual([]);
  });

  test('Marketing shows every marketing number with pies, the plan timeline and countdowns, and its buttons go through the function after confirming (#1722)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/marketing/30');
    const mk = page.locator('[data-view="marketing"]');
    await expect(mk).toContainText('First cold emails go out');
    await expect(mk).toContainText('Instantly trial ends');
    await expect(mk.locator('.jv-count')).not.toHaveCount(0);
    await expect(mk).toContainText('Marketing visits');
    await expect(mk.locator('.jv-tl-phase, .jv-tl-pin').first()).toBeVisible();
    await expect(mk).toContainText('W1 B-es Americas');
    await expect(mk.locator('[data-panel-id="marketing-camp-lang"] .jv-pie li')).toHaveCount(2);
    await expect(mk.locator('[data-panel-id="marketing-countries"]')).toContainText('CO');
    await expect(mk.locator('[data-panel-id="marketing-notes"]')).toContainText('paid-once');
    await expect(mk.locator('[data-panel-id="marketing-domain"]')).toContainText('p=none');
    await expect(mk.locator('.jv-briefing')).toHaveCount(0);

    const activate = mk.locator('[data-mk-campaign="activate"]');
    await expect(mk.locator('[data-mk-campaign="pause"]')).toHaveCount(1);
    page.once('dialog', (dialog) => dialog.dismiss());
    await activate.click();
    expect(calls.some((c) => c.op === 'marketing-campaign')).toBe(false);
    page.once('dialog', (dialog) => { expect(dialog.message()).toContain('no leads yet'); dialog.accept(); });
    await activate.click();
    await expect.poll(() => calls.filter((c) => c.op === 'marketing-campaign').map((c) => [c.body.id, c.body.action])).toEqual([['11111111-2222-3333-4444-555555555555', 'activate']]);

    await mk.locator('[data-mk-queue] textarea').fill('uni.example.edu.co, co, university\nmx.example.mx');
    await mk.locator('[data-mk-queue] input[name="cc"]').fill('mx');
    page.once('dialog', (dialog) => dialog.accept());
    await mk.locator('[data-mk-queue] button[type="submit"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'marketing-queue').map((c) => [c.body.cc, c.body.sector, c.body.hosts.split('\n').length])).toEqual([['mx', 'university', 2]]);

    await mk.locator('[data-mk-block] input').fill('no@example.edu');
    const before = calls.filter((c) => c.op === 'notices').length;
    await mk.locator('[data-act="mk-reload"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'notices').length).toBeGreaterThan(before);
    await expect(mk.locator('[data-mk-block] input')).toHaveValue('no@example.edu');
    page.once('dialog', (dialog) => dialog.accept());
    await mk.locator('[data-mk-block] button').click();
    await expect.poll(() => calls.filter((c) => c.op === 'marketing-block').map((c) => c.body.value)).toEqual(['no@example.edu']);
    expect(errors).toEqual([]);
  });

  test('GitHub shows the grades, the process map, failing runs with their diagnosis, PRs and the human steps, and its fixes ask first (#2526)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/github/30', { 'github-diagnose': { ok: true, diag: { cause: 'A null MX record threw in the mail check.', category: 'code', fix: 'Guard the empty MX answer.', confidence: 0.7 } } });
    const gh = page.locator('[data-view="github"]');
    await expect(gh.locator('.jv-grade')).toHaveCount(10);
    await expect(gh.locator('.jv-grade').first()).toHaveAttribute('data-grade', 'B');
    await expect(gh.locator('.jv-grade[data-grade="F"]')).toHaveAttribute('title', /On-demand spend at 85%/);
    await expect(page.locator('[data-tab-kpi="github"]')).toHaveText('B');
    await expect(gh.locator('.jv-pm-node')).toHaveCount(8);
    await expect(gh.locator('.jv-pm-node.is-over')).toHaveCount(3);
    await expect(gh.locator('.jv-pm-node[data-col="Dev"]')).toHaveClass(/is-over/);
    await expect(gh.locator('.jv-pm-flow.is-back')).toHaveCount(1);
    const needs = gh.locator('[data-panel-id="github-needs"]');
    await expect(needs).toContainText('Give the qa-lab-agents app Dependabot alerts: read');
    await expect(needs).toContainText('kaanmuar/jarvis-android');
    await expect(gh.locator('[data-panel-id="github-dora"]')).toContainText('elite');
    await expect(gh.locator('.jv-nodata')).toContainText('Dependabot');
    await expect(gh.locator('.jv-nodata')).toContainText('Code scanning');

    const failing = gh.locator('[data-panel-id="github-failing"]');
    await expect(failing).toContainText('The admin snapshot moved after the tab bar grew.');
    await expect(failing).toContainText('confidence 86%');
    await expect(failing).toContainText('Not diagnosed yet.');
    const prs = gh.locator('[data-panel-id="github-prs"]');
    await expect(prs.locator('tbody tr')).toHaveCount(3);
    await expect(prs.locator('.jv-chip.c-slow', { hasText: 'dirty' })).toHaveCount(1);
    await expect(gh.locator('[data-panel-id="github-worktrees"] [data-gh-act="gh-remove-worktree"]')).toHaveCount(1);
    const agent = failing.locator('button', { hasText: 'Fix with an agent' }).first();
    page.once('dialog', (dialog) => dialog.dismiss());
    await agent.click();
    expect(calls.some((c) => c.op === 'github-agent')).toBe(false);
    let asked = '';
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await agent.click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-agent').map((c) => [c.body.branch, c.body.prompt])).toEqual([['main', 'Update the admin visual baseline on main after the GitHub tab was added (#2526), then push.']]);
    expect(asked).toContain('start its own worker on main');
    expect(asked).toContain('Update the admin visual baseline on main');
    expect(calls.find((c) => c.op === 'github-agent').body.engine).toBe('worker');

    await failing.locator('[data-gh-diagnose="902"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-diagnose').map((c) => c.body.run)).toEqual([902]);
    await expect(failing).toContainText('A null MX record threw in the mail check.');

    page.once('dialog', (dialog) => dialog.dismiss());
    await prs.locator('[data-gh-act="gh-merge-pr"]').click();
    expect(calls.some((c) => c.op === 'github-act')).toBe(false);
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await prs.locator('[data-gh-act="gh-merge-pr"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-act').map((c) => [c.body.action, c.body.pr])).toEqual([['gh-merge-pr', 2520]]);
    expect(asked).toContain('merge PR #2520 into main now');
    page.once('dialog', (dialog) => dialog.accept());
    await gh.locator('[data-panel-id="github-drift"] [data-gh-act="gh-board-sync"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-act').map((c) => c.body.action)).toEqual(['gh-merge-pr', 'gh-board-sync']);
    expect(calls.filter((c) => c.op === 'github-act')[1].body.items).toEqual([{ number: 2490, should: 'Done' }]);
    page.once('dialog', (dialog) => dialog.accept());
    await failing.locator('[data-gh-rerun="901"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-act').map((c) => [c.body.action, c.body.run])).toEqual([['gh-merge-pr', undefined], ['gh-board-sync', undefined], ['rerun-ci', 901]]);

    await gh.locator('[data-gh-ask="Why is CI red?"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'ask').map((c) => c.body.question)).toEqual(['Why is CI red?']);
    expect(calls.find((c) => c.op === 'ask').body.snapshot.external.github.ci.passRate).toBe(91);
    expect(errors).toEqual([]);
  });

  test('GitHub drill-downs open inline one at a time per panel, and every chart has a title, axis titles, a legend and a tap value (#2807)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/github/30');
    const GH = 'https://github.com/kaanmuar/kaanmuar.github.io';
    const gh = page.locator('[data-view="github"]');

    const flow = gh.locator('[data-panel-id="github-flow"]');
    const dev = flow.locator('[data-drill="github-flow|Dev"]');
    await expect(dev).toBeHidden();
    await flow.locator('.jv-pm-node[data-col="Dev"]').click();
    await expect(dev).toBeVisible();
    await expect(dev).toContainText('Dev · 9 cards');
    await expect(dev.locator('.jv-drill-list li')).toHaveCount(2);
    await expect(dev).toContainText('11 d in Dev');
    await expect(dev.locator('a', { hasText: 'Open Dev on the board' })).toHaveAttribute('href', 'https://github.com/orgs/carlosandmunoz-hq/projects/1/views/1?filterQuery=status%3A%22Dev%22');
    await expect(dev.locator('a', { hasText: 'All issues' })).toHaveAttribute('href', GH + '/issues');
    await expect(flow.locator('.jv-pm-node[data-col="Dev"]')).toHaveAttribute('aria-expanded', 'true');
    await flow.locator('.jv-pm-node[data-col="QA"]').click();
    await expect(dev).toBeHidden();
    const qa = flow.locator('[data-drill="github-flow|QA"]');
    await expect(qa).toContainText('Stuck in QA');
    await qa.locator('.jv-drill-close').click();
    await expect(qa).toBeHidden();

    const iss = gh.locator('[data-panel-id="github-issues"]');
    await iss.locator('.jv-stat-btn', { hasText: 'Open bugs' }).click();
    const bugs = iss.locator('[data-drill="github-issues|bugs"]');
    await expect(bugs).toContainText('null MX record');
    await expect(bugs.locator('a', { hasText: 'Open bugs on GitHub' })).toHaveAttribute('href', GH + '/issues?q=is%3Aissue+is%3Aopen+label%3Abug');
    await iss.locator('.jv-stat-btn', { hasText: 'Sub-issues done' }).click();
    await expect(bugs).toBeHidden();
    await expect(iss.locator('[data-drill="github-issues|sub"]')).toContainText('2 of 8 sub-issues done');

    const areas = gh.locator('[data-panel-id="github-bug-areas"]');
    await areas.locator('.jv-bars [data-drill-open="github-bug-areas|be"]').click();
    const be = areas.locator('[data-drill="github-bug-areas|be"]');
    await expect(be).toContainText('area:be · 5 open bugs');
    await expect(be.locator('.jv-drill-list li')).toHaveCount(1);
    await expect(be.locator('a', { hasText: 'area:be bugs on GitHub' })).toHaveAttribute('href', GH + '/issues?q=is%3Aissue+is%3Aopen+label%3Aarea%3Abe+label%3Abug');
    await expect(iss.locator('[data-drill="github-issues|sub"]')).toBeVisible();

    const br = gh.locator('[data-panel-id="github-branches"]');
    await br.locator('.jv-stat-btn', { hasText: 'Ahead of main' }).click();
    const ahead = br.locator('[data-drill="github-branches|ahead"]');
    await expect(ahead.locator('a', { hasText: 'fix/2510-null-mx' })).toHaveAttribute('href', GH + '/tree/fix/2510-null-mx');
    await expect(ahead.locator('a', { hasText: 'compare' })).toHaveAttribute('href', GH + '/compare/main...fix/2510-null-mx');

    for (const id of ['github-ci-trend', 'github-pr-daily', 'github-issues', 'github-deploys', 'github-agents-daily']) {
      const chart = gh.locator(`[data-panel-id="${id}"] .jv-chart`);
      await expect(chart.locator('.jv-chart-title')).not.toHaveText('');
      await expect(chart.locator('.jv-axis-title')).toHaveCount(2);
      await expect(chart.locator('.jv-legend i')).toHaveCount(2);
    }
    const ci = gh.locator('[data-panel-id="github-ci-trend"]');
    await expect(ci.locator('.jv-axis-title').first()).toHaveText('runs per day');
    await expect(ci.locator('.jv-legend')).toContainText('4,880 runs in range');
    await ci.locator('.jv-hit').last().click();
    await expect(ci.locator('.jv-tip')).toHaveText('2026-11-03: Runs 2,480 runs · Failed 223 runs');
    await expect(gh.locator('[data-panel-id="github-trend"] .jv-spark-axis').first()).toContainText('11-02');
    await expect(gh.locator('[data-panel-id="github-board"] .jv-bars-head')).toContainText('cards');
    await expect(gh.locator('[data-panel-id="github-board"] .jv-legend')).toContainText('Cards on the board');
    await expect(gh.locator('[data-panel-id="github-agents"] .jv-legend')).toContainText('Agent hours');

    const repos = gh.locator('[data-panel-id="github-repos"]');
    await expect(repos).toContainText('kaanmuar/cursor-quota-releases');
    await repos.locator('[data-settings-at="s-repos"]').click();
    const field = page.locator('[name="s-repos"]');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('kaanmuar/kaanmuar.github.io\nkaanmuar/qa-lab-outreach\nkaanmuar/cursor-quota\nkaanmuar/cursor-quota-releases');
    await field.fill('kaanmuar/qa-lab-outreach\nhttps://github.com/kaanmuar/cursor-quota\nnot a repo');
    await page.locator('.jv-settings button[type="submit"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'settings-save').map((c) => c.body.settings.github)).toEqual([{ repos: ['kaanmuar/qa-lab-outreach', 'kaanmuar/cursor-quota'] }]);
    await expect.poll(() => calls.filter((c) => c.op === 'github-work').length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('GitHub diagnoses get Fix and Fix with an agent, and a re-run shows its state at once, then the fresh numbers and the run result (#2808)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const GH = 'https://github.com/kaanmuar/kaanmuar.github.io';
    const work = actionsWork();
    const after = Object.assign({}, work, { ci: Object.assign({}, work.ci, { failing: [work.ci.failing[0]] }) });
    const calls = await openStats(page, '#stats/github/30', { 'github-work': work, 'github-act': { ok: true, message: 'Done on GitHub.', url: GH + '/pull/2505' },
      'github-run': { ok: true, run: 902, status: 'completed', conclusion: 'success', done: true, attempt: 2, url: GH + '/actions/runs/902' } });
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(/cloudfunctions\.net\/jarvis$/, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.op === 'github-act' && body.action === 'rerun-ci') await held;
      if (body.op === 'github-work' && body.fresh) {
        calls.push({ op: body.op, body });
        return route.fulfill({ json: Object.assign({ op: body.op }, after), headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return route.fallback();
    });
    const gh = page.locator('[data-view="github"]');
    const failing = gh.locator('[data-panel-id="github-failing"]');
    const ai = gh.locator('[data-panel-id="github-ai"]');

    await expect(failing.locator('[data-gh-fix="901"]')).toHaveCount(0);
    await expect(ai.locator('[data-gh-fix="901"]')).toHaveCount(0);
    await expect(failing.locator('[data-gh-fix="902"]')).toHaveText('Fix: re-run');
    await expect(ai.locator('[data-gh-fix="903"]')).toHaveText('Fix: update with main');

    page.once('dialog', (dialog) => dialog.accept());
    await failing.locator('[data-gh-fix="902"]').click();
    const row = failing.locator('[data-gh-result="run:902"]');
    await expect(row).toContainText('Re-running…');
    await expect(row.locator('.jv-chip')).toHaveText('queued');
    expect(calls.some((c) => c.op === 'github-work' && c.body.fresh)).toBe(false);
    release();
    await expect.poll(() => calls.filter((c) => c.op === 'github-act').map((c) => [c.body.action, c.body.run, c.body.branch])).toEqual([['rerun-ci', 902, 'fix/2510-null-mx']]);
    await expect.poll(() => calls.filter((c) => c.op === 'github-run').map((c) => c.body.run)).toEqual([902]);
    await expect(row).toContainText('Passed on attempt 2.');
    await expect(row.locator('a')).toHaveAttribute('href', GH + '/actions/runs/902');
    expect(calls.filter((c) => c.op === 'github-work' && c.body.fresh).length).toBeGreaterThanOrEqual(1);
    await expect(failing.locator('tbody tr')).toHaveCount(2);

    page.once('dialog', (dialog) => dialog.accept());
    await ai.locator('[data-gh-fix="903"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-act').map((c) => [c.body.action, c.body.pr])).toEqual([['rerun-ci', undefined], ['gh-update-pr', 2505]]);
    await expect(ai.locator('[data-gh-result="run:903"]')).toContainText('Done on GitHub.');

    const agent = ai.locator('[data-gh-agent="901"]');
    page.once('dialog', (dialog) => dialog.dismiss());
    await agent.click();
    expect(calls.some((c) => c.op === 'github-agent')).toBe(false);
    let asked = '';
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await agent.click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-agent').map((c) => [c.body.run, c.body.branch])).toEqual([[901, 'main']]);
    expect(asked).toContain('Update the admin visual baseline on main');
    const launched = ai.locator('[data-gh-result="run:901"]');
    await expect(launched).toContainText('Agent launched');
    await expect(launched.locator('a')).toHaveAttribute('href', 'https://cursor.com/agents/bc-123');
    expect(errors).toEqual([]);
  });

  test('GitHub flaky rows re-run, diagnose, quarantine and draft an agent; security alerts chart by severity and dismiss only from the form (#2808)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const GH = 'https://github.com/kaanmuar/kaanmuar.github.io';
    const calls = await openStats(page, '#stats/github/30', { 'github-work': actionsWork(), 'github-act': { ok: true, message: 'Done on GitHub.' },
      'github-run': { ok: true, run: 950, status: 'in_progress', conclusion: '', done: false, attempt: 2, url: GH + '/actions/runs/950' },
      'github-diagnose': { ok: true, diag: { cause: 'A Cypress wait timed out on a slow runner.', category: 'flaky', confidence: 0.7, action: 'rerun-ci' } },
      'github-draft': { ok: true, prompt: 'Make the Cypress login wait for the network instead of a fixed timeout, then run it 20 times.', branch: 'main', run: 950 } });
    const gh = page.locator('[data-view="github"]');
    const acts = () => calls.filter((c) => c.op === 'github-act').map((c) => c.body);

    const flaky = gh.locator('[data-panel-id="github-flaky"]');
    await expect(flaky).toContainText('.github/workflows/cypress.yml');
    await expect(flaky.locator('a', { hasText: 'Open runs' })).toHaveAttribute('href', GH + '/actions/workflows/cypress.yml?query=is%3Afailure');
    page.once('dialog', (dialog) => dialog.accept());
    await flaky.locator('[data-gh-rerun="950"]').click();
    await expect.poll(() => acts().map((b) => [b.action, b.run])).toEqual([['rerun-ci', 950]]);
    await expect(flaky.locator('[data-gh-result="run:950"]')).toContainText('Attempt 2: in progress…');
    await flaky.locator('[data-gh-diagnose="950"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-diagnose').map((c) => c.body.run)).toEqual([950]);
    await expect(flaky.locator('[data-gh-result="run:950"]')).toContainText('A Cypress wait timed out on a slow runner.');
    let asked = '';
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await flaky.locator('[data-gh-act="gh-quarantine"]').click();
    await expect.poll(() => acts().map((b) => b.action)).toEqual(['rerun-ci', 'gh-quarantine']);
    expect(asked).toContain('CI: Cypress is flaky (9% of 140 runs)');
    expect(acts()[1]).toMatchObject({ workflow: 'Cypress', pct: 9, runs: 140, path: '.github/workflows/cypress.yml', links: [GH + '/actions/runs/950'] });
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await flaky.locator('[data-gh-flaky-agent="Cypress"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-agent').map((c) => [c.body.branch, c.body.prompt])).toEqual([['main', 'Make the Cypress login wait for the network instead of a fixed timeout, then run it 20 times.']]);
    expect(calls.find((c) => c.op === 'github-draft').body).toMatchObject({ run: 950, workflow: 'Cypress', pct: 9, runs: 140 });
    expect(asked).toContain('Make the Cypress login wait for the network');
    await expect(flaky.locator('[data-gh-result="flaky:Cypress"]')).toContainText('Agent launched');

    const sec = gh.locator('[data-panel-id="github-security"]');
    await expect(sec.locator('.jv-bar-stack')).toHaveCount(3);
    await expect(sec.locator('.jv-bars li').first()).toHaveAttribute('title', 'Dependabot: Critical 1, High 1, Low 1');
    await expect(sec.locator('.jv-legend').first()).toContainText('Critical');
    await expect(sec).toContainText('Alerts opened, fixed and dismissed each week');
    await expect(sec.locator('.jv-gh-parts li')).toHaveCount(4);
    await expect(sec).toContainText('Security score 25 (F)');

    const dbot = gh.locator('[data-panel-id="github-dependabot"]');
    await expect(dbot).toContainText('Open alerts by ecosystem');
    const form = dbot.locator('[data-drill="github-sec-dependabot|dependabot:kaanmuar/kaanmuar.github.io#2"]');
    await expect(form).toBeHidden();
    await dbot.locator('[data-drill-open="github-sec-dependabot|dependabot:kaanmuar/kaanmuar.github.io#2"]').first().click();
    await expect(form).toBeVisible();
    await expect(form.locator('select[name="reason"] option')).toHaveCount(5);
    await form.locator('select[name="reason"]').selectOption('not_used');
    await form.locator('input[name="comment"]').fill('Only a dev script uses it.');
    await form.locator('button[type="submit"]').click();
    await expect.poll(() => acts().filter((b) => b.action === 'gh-dismiss-alert').length).toBe(1);
    expect(acts().find((b) => b.action === 'gh-dismiss-alert')).toMatchObject({ action: 'gh-dismiss-alert', kind: 'dependabot', repo: 'kaanmuar/kaanmuar.github.io', number: 2, reason: 'not_used', comment: 'Only a dev script uses it.', target: 'lodash #2' });
    await expect(dbot.locator('[data-gh-result="dependabot:kaanmuar/kaanmuar.github.io#2"]')).toContainText('Done on GitHub.');

    await expect(dbot.locator('a', { hasText: 'Dependabot PR #2520' })).toHaveAttribute('href', GH + '/pull/2520');
    await expect(dbot.locator('[data-gh-act="gh-merge-pr"]')).toHaveCount(1);
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await dbot.locator('[data-gh-sec-agent="dependabot:kaanmuar/kaanmuar.github.io#3"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'github-agent').length).toBe(2);
    expect(asked).toContain('Upgrade left-pad to 1.3.0 or later in package.json');
    expect(calls.filter((c) => c.op === 'github-agent')[1].body).toMatchObject({ repo: 'kaanmuar/kaanmuar.github.io', branch: 'main' });

    const cscan = gh.locator('[data-panel-id="github-code-scanning"]');
    await cscan.locator('[data-drill-open="github-sec-codeScanning|codeScanning:kaanmuar/kaanmuar.github.io#7"]').first().click();
    const cform = cscan.locator('form[data-gh-dismiss]');
    await cform.locator('select[name="reason"]').selectOption("won't fix");
    await cform.locator('button[type="submit"]').click();
    await expect.poll(() => acts().filter((b) => b.action === 'gh-dismiss-alert').map((b) => [b.kind, b.number, b.reason, b.comment])).toEqual([['dependabot', 2, 'not_used', 'Only a dev script uses it.'], ['codeScanning', 7, "won't fix", '']]);

    const secrets = gh.locator('[data-panel-id="github-secrets"]');
    await expect(secrets.locator('[data-drill-open]')).toHaveCount(0);
    await expect(secrets).toContainText('Revoke and rotate');
    page.once('dialog', (dialog) => dialog.accept());
    await secrets.locator('[data-gh-act="gh-security-ticket"]').click();
    await expect.poll(() => acts().filter((b) => b.action === 'gh-security-ticket').map((b) => [b.kind, b.repo, b.number, b.type])).toEqual([['secrets', 'kaanmuar/qa-lab-outreach', 4, 'Google API Key']]);

    const low = sec.locator('[data-gh-act="gh-dismiss-low"]');
    page.once('dialog', (dialog) => dialog.dismiss());
    await low.click();
    expect(acts().some((b) => b.action === 'gh-dismiss-low')).toBe(false);
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await low.click();
    await expect.poll(() => acts().filter((b) => b.action === 'gh-dismiss-low').map((b) => b.alerts)).toEqual([[{ kind: 'dependabot', repo: 'kaanmuar/kaanmuar.github.io', number: 3 }]]);
    expect(asked).toContain('dismiss 1 low security alert');
    expect(errors).toEqual([]);
  });

  for (const [width, height, folded] of [[360, 780, true], [720, 860, false]]) {
    test(`GitHub fits a foldable ${folded ? 'folded' : 'unfolded'} at ${width}px: no sideways scroll, the map and the tables reflow (#2526)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openStats(page, '#stats/github/30', { 'github-work': actionsWork() });
      const gh = page.locator('[data-view="github"]');
      await expect(gh.locator('.jv-grade')).toHaveCount(10);
      for (const id of ['github-needs', 'github-flow', 'github-failing', 'github-prs', 'github-worktrees']) await expect(gh.locator(`[data-panel-id="${id}"]`)).toBeVisible();
      await expect(gh.locator('.jv-grid > .jv-panel').first()).toHaveAttribute('data-panel-id', 'github-needs');
      const layout = await page.evaluate(() => {
        const view = document.querySelector('[data-view="github"]');
        const box = (el) => el.getBoundingClientRect();
        const kpis = Array.from(view.querySelectorAll('.jv-gh-head + .jv-kpis .jv-kpi')).map((k) => Math.round(box(k).top));
        const pm = view.querySelector('.jv-pm');
        return {
          scrollingTables: Array.from(view.querySelectorAll('.jv-table-wrap')).filter((t) => t.scrollWidth > t.clientWidth + 1).map((t) => t.closest('.jv-panel').dataset.panelId),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          outside: Array.from(view.querySelectorAll('.jv-grade, .jv-kpi, .jv-panel, .jv-btn')).filter((el) => box(el).width && box(el).right > window.innerWidth + 1).length,
          columns: getComputedStyle(view.querySelector('.jv-grid')).gridTemplateColumns.split(' ').length,
          kpisInFirstRow: kpis.filter((top) => top === kpis[0]).length,
          map: getComputedStyle(pm.querySelector('svg')).display !== 'none',
          list: getComputedStyle(pm.querySelector('.jv-pm-list')).display !== 'none',
          mapScrolls: pm.scrollWidth > pm.clientWidth + 1,
          cards: getComputedStyle(view.querySelector('[data-panel-id="github-prs"] td')).display === 'block',
          shortestButton: Math.min(...Array.from(view.querySelectorAll('.jv-panel .jv-btn')).filter((b) => box(b).width).map((b) => box(b).height))
        };
      });
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(layout).toMatchObject({ outside: 0, mapScrolls: false, scrollingTables: [], cards: true });
      expect(layout.shortestButton).toBeGreaterThanOrEqual(44);
      if (folded) expect(layout).toMatchObject({ columns: 1, kpisInFirstRow: 2, map: false, list: true });
      else expect(layout).toMatchObject({ columns: 2, map: true, list: false });
      await page.screenshot({ path: `/tmp/2526/web-fold-${width}.png`, fullPage: true });

      const flow = gh.locator('[data-panel-id="github-flow"]');
      await flow.locator(folded ? '.jv-pm-step[data-col="Dev"]' : '.jv-pm-node[data-col="Dev"]').click();
      await expect(flow.locator('[data-drill="github-flow|Dev"]')).toBeVisible();
      await gh.locator('[data-panel-id="github-bug-areas"] .jv-bars [data-drill-open="github-bug-areas|be"]').click();
      await expect(gh.locator('[data-drill="github-bug-areas|be"]')).toBeVisible();
      const drills = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        smallest: Math.min(...Array.from(document.querySelectorAll('[data-view="github"] .jv-drill:not([hidden]) a, [data-view="github"] .jv-drill:not([hidden]) button, [data-view="github"] .jv-stat-btn, [data-view="github"] .jv-bars li.is-drill')).map((el) => el.getBoundingClientRect().height))
      }));
      expect(drills.overflow).toBeLessThanOrEqual(1);
      expect(drills.smallest).toBeGreaterThanOrEqual(44);
      if (process.env.GH_SHOTS) {
        await flow.screenshot({ path: `${process.env.GH_SHOTS}/2807-web-${width}-board-drill.png` });
        await gh.locator('[data-panel-id="github-bug-areas"]').screenshot({ path: `${process.env.GH_SHOTS}/2807-web-${width}-bug-area.png` });
        const ci = gh.locator('[data-panel-id="github-ci-trend"]');
        await ci.locator('.jv-hit').last().click();
        await ci.screenshot({ path: `${process.env.GH_SHOTS}/2807-web-${width}-ci-chart.png` });
        const iss = gh.locator('[data-panel-id="github-issues"]');
        await iss.locator('.jv-stat-btn', { hasText: 'Open bugs' }).click();
        await iss.screenshot({ path: `${process.env.GH_SHOTS}/2807-web-${width}-issues.png` });
        await gh.locator('[data-panel-id="github-trend"]').screenshot({ path: `${process.env.GH_SHOTS}/2807-web-${width}-trend.png` });
      }
    });
  }

  // #2810: the log op's lines, newest first; a second call with since adds one line.
  const LOG_AT = Date.now() - 60000;
  const logLine = (id, ms, source, level, text, url) => Object.assign({ id, at: new Date(LOG_AT + ms).toISOString(), addedAt: new Date(LOG_AT + ms).toISOString(), source, level, text }, url ? { url } : {});
  const LOG = [
    logLine('l4', 4000, 'actions', 'error', 'kaanmuar.github.io: E2E and Visual Tests #881 failure in 7m02s on main (push)', 'https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/881'),
    logLine('l3', 3000, 'gemini', 'info', 'Gemini ok in 2140 ms, 812 chars: Write the briefing for these numbers'),
    logLine('l2', 2000, 'board', 'info', 'kaanmuar.github.io: #2810 moved Next → Dev: Jarvis: live log console (qa-lab-agents)', 'https://github.com/kaanmuar/kaanmuar.github.io/issues/2810'),
    logLine('l1', 1000, 'function', 'warn', 'jarvisWatch: mail retry failed: SendGrid answered 429')
  ];
  const logOp = () => {
    let n = 0;
    return () => (++n > 1 ? { ok: true, entries: [logLine('l5', 5000, 'push', 'info', 'alerts push to 2 devices: Jarvis alert')], cursor: new Date(LOG_AT + 5000).toISOString() } : { ok: true, entries: LOG, cursor: LOG[0].addedAt });
  };

  for (const [width, height] of [[360, 780], [720, 860]]) {
    test(`Console lists the back's log lines, filters, searches, pauses and fits ${width}px (#2810)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const answer = logOp();
      const calls = await openStats(page, '#stats/console/30', { get log() { return answer(); } });
      const con = page.locator('[data-view="console"] .jv-con');
      await expect(con).toBeVisible();
      const lines = con.locator('.jv-con-lines li');
      await expect(lines).toHaveCount(4);
      await expect(lines.first()).toContainText('mail retry failed');
      await expect(lines.last()).toContainText('E2E and Visual Tests #881 failure');
      await expect(lines.last()).toHaveClass(/lv-error/);
      await expect(lines.first().locator('time')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
      expect(calls.filter((c) => c.op === 'log')[0].body).toMatchObject({ limit: 300 });
      await expect(page.locator('.jv-con-fab')).toBeHidden();

      await con.locator('[data-con-src="board"]').click();
      await expect(lines).toHaveCount(1);
      await expect(lines).toContainText('moved Next → Dev');
      await con.locator('[data-con-src=""]').click();
      await con.locator('[data-con-level]').selectOption('warn');
      await expect(lines).toHaveCount(2);
      await con.locator('[data-con-level]').selectOption('debug');
      await con.locator('[data-con-q]').fill('gemini briefing');
      await expect(lines).toHaveCount(1);
      await con.locator('[data-con-q]').fill('');
      await expect(lines).toHaveCount(4);

      await con.locator('[data-con-pause]').click();
      await expect.poll(() => calls.filter((c) => c.op === 'log').length, { timeout: 20000 }).toBeGreaterThan(1);
      expect(calls.filter((c) => c.op === 'log')[1].body.since).toBe(LOG[0].addedAt);
      await expect(con.locator('[data-con-foot]')).toContainText('paused, 1 new');
      await expect(lines).toHaveCount(4);
      await con.locator('[data-con-pause]').click();
      await expect(lines).toHaveCount(5);
      await expect(lines.last()).toContainText('alerts push to 2 devices');

      const popup = page.waitForEvent('popup');
      await lines.filter({ hasText: '#881' }).click();
      expect((await popup).url()).toContain('/actions/runs/881');

      const layout = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const con = document.querySelector('[data-view="console"] .jv-con');
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, right: box(con).right - window.innerWidth, mono: /mono|Menlo|Consolas/i.test(getComputedStyle(con).fontFamily),
          textBelow: (() => { const li = con.querySelector('.jv-con-lines li'); return box(li.querySelector('span')).top > box(li.querySelector('time')).top + 2; })() };
      });
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(layout.right).toBeLessThanOrEqual(1);
      expect(layout.mono).toBe(true);
      expect(layout.textBelow).toBe(width < 460);
      await page.screenshot({ path: `/tmp/2546/2810-web-${width}.png` });

      await page.locator('.jv-tabs [data-go="github"]').click();
      const fab = page.locator('.jv-con-fab');
      await expect(fab).toBeVisible();
      await fab.click();
      const dock = page.locator('.jv-con-dock');
      await expect(dock.locator('.jv-con-lines li')).toHaveCount(5);
      await page.screenshot({ path: `/tmp/2546/2810-web-${width}-dock.png` });
      await page.keyboard.press('Escape');
      await expect(dock).toBeHidden();
      expect(errors).toEqual([]);
    });
  }

  test('Marketing approves leads, uploads, ticks LinkedIn and answers replies through the Mac sync after confirming (#1730)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/marketing/30');
    const mk = page.locator('[data-view="marketing"]');
    const leads = mk.locator('[data-panel-id="marketing-leads"]');
    await expect(leads).toContainText('Uni Norte');
    await expect(leads.locator('[data-mk-cmd="approve"]')).toHaveCount(2);
    await expect(leads).toContainText('Jarvis is on it.');
    await expect(leads.locator('[data-mk-rereview="uni2.edu.co"]')).toHaveCount(1);
    await expect(leads.locator('[data-mk-cmd="lead-drop"][data-email="leo@uni2.edu.co"]')).toHaveCount(1);
    await expect(leads).toContainText('Uni Este');
    await expect(leads).not.toContainText('Uni Oeste');
    await leads.locator('[data-mk-done="on"]').click();
    await expect(leads).toContainText('Uni Oeste');
    await leads.locator('[data-mk-done="off"]').click();
    await expect(leads).not.toContainText('Uni Oeste');
    await expect(mk.locator('[data-panel-id="marketing-jobs"]')).toContainText('W1 leads ready');
    await expect(mk.locator('[data-panel-id="marketing-kpis"]')).toContainText('setup week');
    const cmds = () => calls.filter((c) => c.op === 'marketing-command').map(({ body: { op, days, device, ...rest } }) => rest);

    page.once('dialog', (dialog) => dialog.dismiss());
    await leads.locator('[data-mk-cmd="approve"][data-email="ana@uni.edu.co"]').click();
    expect(cmds()).toEqual([]);
    page.once('dialog', (dialog) => dialog.accept());
    await leads.locator('[data-mk-cmd="approve"][data-email="ana@uni.edu.co"]').click();
    await expect.poll(cmds).toEqual([{ action: 'approve', week: 'W1', email: 'ana@uni.edu.co', on: true }]);
    page.once('dialog', (dialog) => { expect(dialog.message()).toContain('upload W1'); dialog.accept(); });
    await leads.locator('[data-mk-cmd="upload"]').click();
    await expect.poll(() => cmds().map((c) => c.action)).toEqual(['approve', 'upload']);

    const li = mk.locator('[data-panel-id="marketing-linkedin"]');
    await expect(li.locator('[data-li-todo]')).toContainText('Ana Pérez');
    await expect(li.locator('[data-li-todo]')).not.toContainText('Bea Gómez');
    await expect(li.locator('details.jv-li-sent summary')).toHaveText('Sent · 1');
    await expect(li.locator('details.jv-li-sent')).not.toHaveAttribute('open', '');
    await expect(li.locator('[data-li-todo]')).toContainText('Note: Hola Ana, vi el sitio de Uni Norte.');
    await expect(li.locator('[data-li-todo]')).toContainText('Check first: confirm the role.');
    await page.evaluate(() => {
        window.open = (url) => { window.__opened = url; return null; };
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.__copied = text; } } });
    });
    await li.locator('[data-li-todo] [data-li-send]').click();
    await expect.poll(() => cmds().slice(-1)).toEqual([{ action: 'linkedin', date: '2026-10-26', name: 'Ana Pérez', sent: true }]);
    expect(await page.evaluate(() => [window.__opened, window.__copied])).toEqual(['https://www.linkedin.com/in/ana', 'Hola Ana, vi el sitio de Uni Norte.']);

    const draft = mk.locator('[data-mk-draft="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]');
    await expect(draft).toHaveValue('Hola, gracias');
    await draft.fill('Hola Dean, ¿le sirve el martes?');
    await mk.locator('[data-act="mk-reload"]').click();
    await expect(draft).toHaveValue('Hola Dean, ¿le sirve el martes?');
    page.once('dialog', (dialog) => { expect(dialog.message()).toContain('dean@uni.edu.co'); dialog.accept(); });
    await mk.locator('[data-mk-reply]').click();
    await expect.poll(() => cmds().slice(-1)).toEqual([{ action: 'reply', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', text: 'Hola Dean, ¿le sirve el martes?' }]);

    await mk.locator('[data-mk-dnc] input[name="addr"]').fill('stop@uni.edu.co');
    page.once('dialog', (dialog) => dialog.accept());
    await mk.locator('[data-mk-dnc] button').click();
    await expect.poll(() => cmds().slice(-1).map((c) => [c.action, c.value])).toEqual([['dnc', 'stop@uni.edu.co']]);
    expect(errors).toEqual([]);
  });

  test('Approvals list ready notices first with a badge for each kind, and one Send goes to every address picked (#1975)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/outreach/30');
    const list = page.locator('[data-panel-id="outreach-approvals"] .jv-approval');
    await expect(list.locator('.jv-prop-title strong')).toHaveText(['acme.co', 'gone.org', 'later.edu']);
    const [acme, gone, later] = [list.nth(0), list.nth(1), list.nth(2)];
    for (const text of ['ready to send', 'critical security', 'ES']) await expect(acme.locator('.jv-approval-badges')).toContainText(text);
    await expect(gone.locator('.jv-approval-badges')).toContainText('off Live Reports');
    await expect(later.locator('.jv-approval-badges')).toContainText('waiting for Live Report');
    await expect(later.locator('.jv-approval-badges')).toContainText('last try failed · 2/3 auto tries');
    await expect(gone.locator('[data-notice-send]')).toBeDisabled();
    await expect(later.locator('[data-notice-send]')).toBeDisabled();
    await expect(later).toContainText('Send opens once its Live Report is public.');

    await expect(acme.locator('input[value="info@acme.co"]')).toBeChecked();
    await expect(acme.locator('input[value="ventas@acme.co"]')).not.toBeChecked();
    await expect(acme.locator('input[value="old@acme.co"]')).toBeDisabled();
    await acme.locator('[data-notice-all]').check();
    await expect(acme.locator('input[value="ventas@acme.co"]')).toBeChecked();
    await expect(acme.locator('[data-notice-send]')).toHaveText('Send to 2');
    let asked = '';
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await acme.locator('[data-notice-send]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'notice-decide').map((c) => [c.body.domain, c.body.send, c.body.email])).toEqual([['acme.co', true, ['info@acme.co', 'ventas@acme.co']]]);
    expect(asked).toContain('Each address gets its own email.');
    await expect(list).toHaveCount(2);
    expect(errors).toEqual([]);
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
    await box.locator('[name="m-messages"]').check();
    await box.locator('[name="a-cap-rerun-held"]').fill('4');
    await box.locator('[name="s-queries"]').fill('qa review\n\nqa review\n  carlos qa  ');
    await box.locator('button[type="submit"]').click();
    await expect(page.locator('.jv-settings')).toBeHidden();
    const save = calls.find((c) => c.op === 'settings-save');
    expect(save.body.settings.goals).toEqual([{ product: 'cv', metric: 'visits', period: 'week', target: 300 }, { product: 'review', metric: 'paid', period: 'month', target: 12 }]);
    expect(save.body.settings.thresholds.pendingRatings).toBe(25);
    expect(save.body.settings.mail).toMatchObject({ daily: true, gemini: false, watch: true, weekly: true, messages: true, ratings: false, ownerReplies: false });
    expect(save.body.settings.actions).toEqual({ auto: true, caps: { 'rerun-held': 4, 'resend-notices': 10, 'publish-hub': 2, 'rerun-job': 3, 'rerun-ci': 5, 'refresh-stale': 6, 'rerun-reviews': 2, 'ai-fix': 5, 'retry-social': 3, 'resume-outreach': 1, 'merge-pr': 3, 'enable-warmup': 2, 'restore-alias': 2, 'launch-campaign': 10, 'gh-board-sync': 10, 'gh-orphan-ticket': 5, 'gh-update-pr': 5, 'gh-merge-pr': 3, 'gh-revert': 1, 'gh-delete-branch': 2, 'gh-close-issue': 5, 'gh-remove-worktree': 5, 'owner-tags-approve-verified': 20, 'owner-tags-block': 10 }, confidence: 0.8, countdownHours: 2 });
    expect(save.body.settings.searchQueries).toEqual(['qa review', 'qa review', 'carlos qa']);
    await expect.poll(() => calls.filter((c) => c.op === 'goals').length).toBeGreaterThan(0);

    await page.keyboard.press('g');
    await expect(page.locator('.jv-settings')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.jv-settings-box [data-act="daily-now"]').click();
    await expect.poll(() => calls.some((c) => c.op === 'daily-now')).toBe(true);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.jv-settings-box [data-act="weekly-now"]').click();
    await expect.poll(() => calls.some((c) => c.op === 'weekly-now')).toBe(true);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.jv-settings-box [data-act="digest-now"]').click();
    await expect.poll(() => calls.some((c) => c.op === 'digest-now')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.jv-settings')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('Overview ranks proposals with evidence and each kind\'s buttons: Run goes through action-run, Done hides one (#1977)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page);
    const panel = page.locator('[data-view="overview"] [data-panel-id="overview-proposals"]');
    await expect(panel).toContainText('Ranked by Gemini');
    await expect(panel.locator('.jv-prop')).toHaveCount(3);
    await expect(panel.locator('.jv-prop').first()).toContainText('Fix the failing job');
    await expect(panel.locator('.jv-prop').first()).toContainText('impact 5/5');
    await expect(panel.locator('.jv-prop').first()).toContainText('Job sweepReviews failed: quota.');
    await expect(panel.locator('.jv-prop').nth(1)).toContainText('Jarvis runs this on its own');
    const buttons = (i) => panel.locator('.jv-prop').nth(i).locator('.jv-prop-acts button, .jv-prop-acts a');
    await expect(buttons(0)).toHaveText(['Run sweepReviews again', 'Open Systems →', 'Dismiss']);
    await expect(buttons(1)).toHaveText(['Send held re-runs', 'Open Systems →', 'Dismiss']);
    await expect(buttons(2)).toHaveText(['Done', 'Dismiss']);
    await expect(panel.locator('.jv-prop').nth(2)).toContainText('from Gemini');
    await expect(panel).toContainText('1 hidden as done or dismissed');
    const ask = calls.find((c) => c.op === 'proposals');
    expect(ask.body.candidates.some((p) => p.key === 'job' && p.evidence.length)).toBe(true);
    expect(ask.body.snapshot.products).toBeTruthy();
    page.once('dialog', (dialog) => dialog.accept());
    await panel.locator('[data-prop-run="job"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'action-run').map((c) => [c.body.action, c.body.jobs, c.body.proposal])).toEqual([['run-job', ['sweepReviews'], 'job']]);

    await panel.locator('[data-proposal="done"][data-key="ai:price-test"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'proposal-mark').map((c) => [c.body.key, c.body.status])).toEqual([['ai:price-test', 'done']]);
    await expect(panel.locator('.jv-prop')).toHaveCount(2);
    await expect(panel).toContainText('2 hidden as done or dismissed');
    expect(errors).toEqual([]);
  });

  test('Systems logs what Jarvis did, and Run now asks first and goes through action-run', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/systems/30');
    const panel = page.locator('[data-panel-id="systems-actions"]');
    await expect(panel).toContainText('send held re-runs: 3 of 10 today');
    await expect(panel).toContainText('publish the hub: 2 of 2 today');
    await expect(panel).toContainText('4 (1 clean');
    await expect(panel).toContainText('outside Monday-Saturday 08:00-19:00');
    await expect(panel.locator('tbody tr')).toHaveCount(3);
    await expect(panel.locator('tbody tr').first()).toContainText('on its own');
    await expect(panel.locator('tbody tr').nth(2)).toContainText('clicked');

    let asked = '';
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.dismiss(); });
    await panel.locator('[data-run-action="rerun-held"]').click();
    await expect.poll(() => asked).toContain('send 4 held re-runs to the askers by email (3 not clean)');
    expect(calls.some((c) => c.op === 'action-run')).toBe(false);

    page.once('dialog', (dialog) => dialog.accept());
    await panel.locator('[data-run-action="publish-hub"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'action-run').map((c) => c.body.action)).toEqual(['publish-hub']);
    expect(errors).toEqual([]);
  });

  test('Systems shows every page worst first and the PageSpeed PRs; Merge asks first and goes through action-run (#1978)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const fixture = require('./fixtures/jarvis-pagespeed.json');
    const calls = await openStats(page, '#stats/systems/30', { pagespeed: fixture, 'action-run': { ok: true, done: 1, ran: '#2042', note: 'Merging #2042; Jarvis pushes the result.' } });
    const health = page.locator('[data-panel-id="systems-pages"]');
    await expect(health).toContainText('Page health: every page (45)');
    await expect(health.locator('tbody tr').first()).toContainText('/qa-review.html');
    await expect(health.locator('details summary')).toHaveText('Show the other 5 pages');
    await health.scrollIntoViewIfNeeded();
    await health.screenshot({ path: 'test-results/jarvis-page-health.png' });
    const routine = page.locator('[data-panel-id="systems-pagespeed"]');
    await expect(routine).toContainText('merges on a countdown');
    await expect(routine).toContainText('waits in Proposals');
    await expect(routine).toContainText('Short cache lifetimes');
    await routine.screenshot({ path: 'test-results/jarvis-pagespeed-routine.png' });

    let asked = '';
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.accept(); });
    await routine.locator('[data-ps-act="pagespeed-merge"][data-pr="2042"]').click();
    await expect.poll(() => asked).toContain('merge PageSpeed fixes #2042 into main now');
    await expect.poll(() => calls.filter((c) => c.op === 'action-run').map((c) => [c.body.action, c.body.pr])).toEqual([['pagespeed-merge', 2042]]);

    await page.locator('[data-go="overview"]').first().click();
    const line = page.locator('[data-view="overview"] .jv-brief li[data-brief="pagespeed:pr:2042"]');
    await line.click();
    const sheet = page.locator('.jv-sheet-box');
    await expect(sheet.locator('[data-sheet="action"][data-action="pagespeed-close"]')).toHaveAttribute('data-pr', '2042');
    expect(errors).toEqual([]);
  });

  test('Systems lists every email address by domain with its state, the mail records and who fixes what (#2338)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const row = (address, system, kind, state, detail, extra) => Object.assign({ address, domain: address.split('@')[1], system, kind, forwards: [], aliasOf: '', state, detail, fix: null }, extra);
    const gmail = ['kaanmuar@gmail.com'];
    const addresses = {
      ok: true, graph: false, errors: [],
      needs: ['Microsoft 365: register a read-only Graph app (User.Read.All, application) and put MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID and MS_GRAPH_CLIENT_SECRET in Secret Manager.'],
      counts: { addresses: 7, ok: 4, warn: 2, error: 2, paused: 0 },
      domains: [
        { domain: 'carlosandmunoz.com', systems: ['ImprovMX', 'SendGrid'], ok: true, checks: [{ name: 'MX', ok: true, detail: '10 mx1.improvmx.com.' }, { name: 'SPF', ok: true, detail: 'v=spf1 ...' }, { name: 'DKIM', ok: true, detail: 's1, s2, dkimprovmx1 and dkimprovmx2 are published.' }, { name: 'DMARC', ok: true, detail: 'p=quarantine' }] },
        { domain: 'qalabreview.com', systems: ['Microsoft 365', 'Instantly'], ok: true, checks: [{ name: 'MX', ok: true, detail: '' }, { name: 'SPF', ok: true, detail: '' }, { name: 'DKIM', ok: true, detail: '' }, { name: 'DMARC', ok: true, detail: 'p=quarantine' }] }
      ],
      rows: [
        row('canary@carlosandmunoz.com', 'ImprovMX', 'alias', 'error', 'Missing from ImprovMX: the daily round trip cannot come back.', { forwards: gmail.concat('webhook'), fix: { by: 'jarvis', action: 'restore-alias' } }),
        row('hello@carlosandmunoz.com', 'ImprovMX', 'alias', 'ok', '2 mails in the last day, 2 forwarded.', { forwards: gmail }),
        row('qa@carlosandmunoz.com', 'ImprovMX', 'alias', 'ok', 'No mail in the last day.', { forwards: gmail.concat('webhook') }),
        row('notices@carlosandmunoz.com', 'ImprovMX', 'smtp login', 'ok', 'Sends through smtp.improvmx.com.'),
        row('qa@carlosandmunoz.com', 'SendGrid', 'sender', 'ok', 'Site and review mail goes out from this address; replies reach its ImprovMX alias.'),
        row('carlos@qalabreview.com', 'Microsoft 365', 'mailbox', 'warn', 'Known from Instantly; Jarvis reads Microsoft 365 once the Graph app is connected.', { fix: { by: 'carlos', action: 'Connect Graph', link: 'https://entra.microsoft.com/' } }),
        row('hello@qalabreview.com', 'Microsoft 365', 'mailbox', 'warn', 'Known from Instantly; Jarvis reads Microsoft 365 once the Graph app is connected.', { fix: { by: 'carlos', action: 'Connect Graph', link: 'https://entra.microsoft.com/' } }),
        row('carlos@qalabreview.com', 'Instantly', 'sending mailbox', 'ok', 'warm-up on, score 100.'),
        row('hello@qalabreview.com', 'Instantly', 'sending mailbox', 'error', 'Permanent OAuth failure: AADSTS50076 Due to a configuration change made by your administrator, you must use multi-factor authentication.', { fix: { by: 'carlos', action: 'Reconnect', link: 'https://app.instantly.ai/app/accounts' } })
      ],
      issues: [
        { key: 'improvmx:missing:canary@carlosandmunoz.com', level: 'alert', by: 'jarvis', action: 'restore-alias', system: 'ImprovMX', address: 'canary@carlosandmunoz.com', problem: 'missing', text: 'canary@carlosandmunoz.com is missing from ImprovMX; Jarvis restores it.', push: true },
        { key: 'instantly:reconnect:hello@qalabreview.com', level: 'alert', by: 'carlos', action: 'Reconnect', link: 'https://app.instantly.ai/app/accounts', system: 'Instantly', address: 'hello@qalabreview.com', problem: 'reconnect', text: 'Reconnect hello@qalabreview.com in Instantly: Permanent OAuth failure: AADSTS50076', push: true }
      ]
    };
    await page.setViewportSize({ width: 1400, height: 1000 });
    await openStats(page, '#stats/systems/30', { addresses });
    const panel = page.locator('[data-panel-id="systems-addresses"]');
    await expect(panel).toContainText('Email addresses (7)');
    await expect(panel.locator('.jv-addr-domain')).toHaveText(['carlosandmunoz.com', 'qalabreview.com']);
    await expect(panel).toContainText('Jarvis fixes it');
    await expect(panel.locator('a[href="https://app.instantly.ai/app/accounts"]')).toHaveText('Reconnect →');
    await expect(panel.locator('.jv-needs')).toContainText('MS_GRAPH_TENANT_ID');
    await expect(panel).toContainText('kaanmuar@gmail.com, webhook');
    await expect(panel.locator('[data-panel-export="csv"]')).toHaveCount(1);
    await expect(page.locator('#stats-pane')).toContainText('canary@carlosandmunoz.com is missing from ImprovMX; Jarvis restores it.');
    await panel.screenshot({ path: 'test-results/jarvis-addresses.png' });
    expect(errors).toEqual([]);
  });

  test('Systems lists the countdowns: Do it now asks first, Cancel goes straight through the countdown op (#1977)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page, '#stats/systems/30');
    const panel = page.locator('[data-panel-id="systems-actions"]');
    await expect(panel).toContainText('On the countdown (2 h)');
    const rows = panel.locator('.jv-countdown');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Re-run failed CI jobs: Buffer batch #41');
    await expect(rows.first()).toContainText('public post');
    await expect(rows.nth(1)).toContainText('Gemini 0.92');
    await expect(panel).toContainText('Ended in the last day (1)');
    await expect(panel.locator('.jv-note').last()).toContainText('Refunds and deletes always wait for your click');
    await rows.first().screenshot({ path: 'test-results/jarvis-countdown.png' });

    let asked = '';
    page.once('dialog', (dialog) => { asked = dialog.message(); dialog.dismiss(); });
    await rows.first().locator('[data-countdown-act="now"]').click();
    await expect.poll(() => asked).toContain('do it now: re-run failed CI jobs (Buffer batch #41)');
    expect(calls.some((c) => c.op === 'countdown')).toBe(false);

    await rows.nth(1).locator('[data-countdown-act="cancel"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'countdown').map((c) => [c.body.id, c.body.act])).toEqual([['dddd4444eeee5555ffff6666', 'cancel']]);
    await expect(page.locator('.jv-toast')).toContainText('Cancelled: run a fix the AI picked.');

    page.once('dialog', (dialog) => dialog.accept());
    await rows.first().locator('[data-countdown-act="now"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'countdown').map((c) => c.body.act)).toEqual(['cancel', 'now']);
    expect(errors).toEqual([]);
  });

  test('a briefing line opens its sheet: the numbers, Run again after confirming, Gemini, and Snooze through the function (#1695)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const calls = await openStats(page);
    const line = page.locator('[data-view="overview"] .jv-brief li[data-brief="job:sweepReviews"]');
    await line.click();
    const sheet = page.locator('.jv-sheet-box');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('h3')).toContainText('Fix the failing job');
    await expect(sheet.locator('.jv-sheet-facts')).toContainText('quota');
    await page.screenshot({ path: 'test-results/jarvis-brief-sheet.png' });

    page.once('dialog', (dialog) => dialog.accept());
    await sheet.locator('[data-sheet="action"][data-action="run-job"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'action-run').map((c) => [c.body.action, c.body.job, c.body.proposal])).toEqual([['run-job', 'sweepReviews', 'job:sweepReviews']]);

    await sheet.locator('[data-sheet="explain"]').click();
    await expect(sheet.locator('.jv-ai-text')).toContainText('Jarvis says');
    expect(calls.find((c) => c.op === 'ask').body.question).toContain('sweepReviews');

    await sheet.locator('[data-sheet="mark"][data-status="snoozed"]').click();
    await expect.poll(() => calls.filter((c) => c.op === 'brief-mark').map((c) => [c.body.key, c.body.status])).toEqual([['job:sweepReviews', 'snoozed']]);
    await expect(page.locator('.jv-sheet')).toBeHidden();
    await expect(line).toHaveCount(0);
    const more = page.locator('[data-view="overview"] .jv-brief-more');
    await expect(more).toContainText('1 snoozed or dismissed');
    await more.locator('[data-brief-hidden]').click();
    await expect(line).toHaveClass(/is-hidden/);
    expect(errors).toEqual([]);
  });

  test('live mode asks for a newer snapshot once the server has one, and still reads no rows (#2102)', async ({ page }) => {
    await page.clock.install();
    const calls = await openStats(page);
    const snapshots = () => calls.filter((c) => c.op === 'snapshot').length;
    await expect.poll(snapshots).toBe(1);
    await expect(page.locator('[data-view="overview"] [data-panel-id="overview-feed"]')).toContainText('URL Review: paid review of shop.example/ (complete)');
    await page.clock.fastForward('03:00');
    expect(snapshots()).toBe(1);
    await page.clock.fastForward('03:00');
    await expect.poll(snapshots).toBe(2);
    expect(calls.some((c) => c.op === 'rows' || c.op === 'health')).toBe(false);
    expect((await page.evaluate(() => window.__reads || [])).filter((name) => JARVIS_ROWS.includes(name))).toEqual([]);
  });

  test('opens on the kept snapshot, sends its versions as since and applies only the sections that changed (#2510)', async ({ page }) => {
    await page.clock.install();
    const at = new Date().toISOString();
    const versions = { products: { v: 'p1', at }, processes: { v: 'j1', at }, mail: { v: 'm1', at } };
    let answer = (body, full) => Object.assign(full, { versions });
    const calls = await openStats(page, undefined, { snapshotAnswer: (body, full) => answer(body, full) });
    const feed = page.locator('[data-view="overview"] [data-panel-id="overview-feed"]');
    await expect(feed).toContainText('URL Review: paid review of shop.example/ (complete)');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('jv-snapshot-30')).snap);
    expect(kept.products).toBeTruthy();
    expect(kept.mailCodes).toBeUndefined();
    expect(Object.keys(kept.versions).sort()).toEqual(['processes', 'products']);

    answer = (body, full) => ({ ok: true, op: 'snapshot', delta: true, days: body.days, cachedAt: new Date().toISOString(), checked: {},
      versions: { products: { v: 'p2', at }, processes: { v: 'j1', at }, mail: { v: 'm1', at } },
      sections: { products: { window: full.window, products: full.products, outreachVisits: full.outreachVisits, socialHeat: full.socialHeat, feed: [{ at: new Date().toISOString(), text: 'QA Studio: a new run' }].concat(full.feed) } } });
    await page.clock.fastForward('06:00');
    const snapshots = () => calls.filter((c) => c.op === 'snapshot');
    await expect.poll(() => snapshots().length).toBe(2);
    expect(snapshots()[1].body.since).toEqual({ products: 'p1', processes: 'j1', mail: 'm1' });
    await expect(feed).toContainText('QA Studio: a new run');
    await expect(feed).toContainText('URL Review: paid review of shop.example/ (complete)');

    let release;
    const held = new Promise((done) => { release = done; });
    answer = async (body) => { await held; return { ok: true, op: 'snapshot', delta: true, days: body.days, cachedAt: new Date().toISOString(), versions: { products: { v: 'p2', at }, processes: { v: 'j1', at }, mail: { v: 'm1', at } }, sections: {} }; };
    await page.reload();
    await expect(page.locator('#stats-pane .jv')).toBeVisible();
    await expect(feed).toContainText('QA Studio: a new run');
    await expect.poll(() => snapshots().length).toBe(3);
    expect(snapshots()[2].body.since).toEqual({ products: 'p2', processes: 'j1' });
    release();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jv-snapshot-30')).snap.versions.products.v)).toBe('p2');
  });
});
