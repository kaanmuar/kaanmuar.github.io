const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const esc = (v) =>
	String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const load = () => import('../../js/admin-jarvis-ledger.js');

const full = {
	id: 'pr-3700',
	pr: 3700,
	ticket: 3690,
	title: 'FE: Faster <hero>',
	mergedAt: '2026-11-01',
	metric: 'lcp',
	expect: 'down',
	status: 'worse',
	before: { days: 7, mean: 2.5 },
	after: { days: 7, mean: 3.125 },
	deltaPct: 25,
};

test('ledger panel: a null ledger shows the empty state', async () => {
	const L = await load();
	assert.match(
		L.ledgerHtml(null, esc, () => ''),
		/No ledger run yet/
	);
	assert.match(
		L.ledgerHtml(undefined, esc, () => ''),
		/No ledger run yet/
	);
});

test('ledger panel: a full result links the PR, shows the numbers and escapes text', async () => {
	const L = await load();
	const html = L.ledgerHtml({ at: '2026-11-18T10:00:00Z', results: [full] }, esc, () => 'Nov 18, 05:00 AM');
	assert.match(html, /Built Nov 18, 05:00 AM/);
	assert.match(html, /href="https:\/\/github\.com\/kaanmuar\/kaanmuar\.github\.io\/pull\/3700"/);
	assert.match(html, /FE: Faster &lt;hero&gt;/);
	assert.doesNotMatch(html, /<hero>/);
	assert.match(html, /ticket #3690/);
	assert.match(html, /merged 2026-11-01/);
	assert.match(html, /lcp \(expect down\)/);
	assert.match(html, /2\.5 -&gt; 3\.13 \(\+25%\)/);
	assert.match(html, /is-worse/);
	assert.match(html, />Worse</);
});

test('ledger panel: a manual row has no numbers and shows what to check', async () => {
	const L = await load();
	const row = {
		id: 'x',
		pr: null,
		ticket: null,
		title: 'Copy change',
		mergedAt: '2026-11-02',
		metric: null,
		expect: null,
		status: 'manual',
		check: 'Look at the <b>bounce</b> page',
	};
	const html = L.ledgerHtml({ at: '', results: [row] }, esc, () => '');
	assert.match(html, /Look at the &lt;b&gt;bounce&lt;\/b&gt; page/);
	assert.match(html, />Manual</);
	assert.doesNotMatch(html, /jv-ledger-nums/);
	assert.doesNotMatch(html, /href=/);
});

test('ledger panel: order is the server order; the summary lists worse first', async () => {
	const L = await load();
	const results = [
		{ title: 'a', status: 'better' },
		{ title: 'b', status: 'worse' },
		{ title: 'c', status: 'too early', reason: 'merged 2 days ago' },
		{ title: 'd', status: 'better' },
	];
	const html = L.ledgerHtml({ results }, esc, () => '');
	assert.ok(html.indexOf('>a<') < html.indexOf('>b<') && html.indexOf('>b<') < html.indexOf('>c<'));
	assert.match(html, /merged 2 days ago/);
	assert.equal(L.summary({ results }), '1 worse · 2 better · 1 too early');
	assert.equal(L.statusRank('worse'), 0);
	assert.equal(L.statusLabel('too little data'), 'Too little data');
	assert.equal(L.statusLabel('unknown metric'), 'unknown metric');
});

test('ledger panel: the web Jarvis shows it on Systems and the app has the same card', () => {
	const root = path.join(__dirname, '../..');
	const js = fs.readFileSync(path.join(root, 'js/admin-jarvis.js'), 'utf8');
	assert.match(js, /\$\{ledgerPanel\(\)\}/);
	assert.match(js, /S\.ledger = snap\.ledger \|\| null/);
	assert.ok(fs.existsSync(path.join(root, 'android/app/src/main/java/com/carlosandmunoz/jarvis/ui/Ledger.kt')));
});
