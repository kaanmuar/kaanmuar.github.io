const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fakeDb } = require('./fake-firestore');
const watch = require('../../functions/legal-watch');
const ops = require('../../functions/ops-schedule');

const A = 'https://example.gov/law-a';
const B = 'https://example.gov/law-b';
const C = 'https://example.gov/law-c';
const clauses = [
	{ id: 'one', lastChecked: '2026-10-25', status: 'counsel-approved', cites: [{ name: 'Law A', url: A }] },
	{ id: 'two', lastChecked: '2026-10-26', status: 'draft', cites: [{ name: 'Law A', url: A }, { name: 'Law B', url: B }] },
	{ id: 'three', lastChecked: '2026-10-27', status: 'draft', cites: [] },
];

// A fake fetch over { url: html | Error | status number }; records every call.
function fakeFetch(pages) {
	const calls = [];
	const fn = async (url, options) => {
		calls.push({ url, options });
		const page = pages[url];
		if (page instanceof Error) throw page;
		if (typeof page === 'number') return { ok: false, status: page, text: async () => '' };
		return { ok: true, status: 200, text: async () => page };
	};
	fn.calls = calls;
	return fn;
}

const html = (body) => '<html><head><title>x</title><script>var n=' + Math.random() + '</script></head><body>' + body + '</body></html>';

test('normalize keeps the words and drops markup, scripts, comments and entity spelling', () => {
	assert.equal(
		watch.normalize('<head><style>p{}</style></head><!-- c --><p class="x">Art.&nbsp;1 &amp; <b>2</b></p><script>1</script>\n\n<p>Fin &#233;</p>'),
		'Art. 1 & 2 Fin é'
	);
	assert.equal(watch.hashOf(html('<p>Same words</p>')), watch.hashOf('<div>Same   words</div>'));
	assert.notEqual(watch.hashOf(html('<p>Same words</p>')), watch.hashOf(html('<p>Other words</p>')));
});

test('sources lists each unique cited url once with the clauses that cite it', () => {
	const rows = watch.sources(clauses);
	assert.deepEqual(rows.map((r) => r.url), [A, B]);
	assert.deepEqual(rows[0].clauses.map((c) => c.id), ['one', 'two']);
	assert.deepEqual(rows[1].clauses.map((c) => c.id), ['two']);
	assert.equal(watch.sources([{ id: 'x', cites: [{ name: 'n', url: 'ftp://nope' }, { name: 'm' }] }]).length, 0);
});

test('decide: baseline, unchanged, changed, and a failed fetch is never a change', () => {
	assert.equal(watch.decide(undefined, { ok: true, hash: 'h' }), 'baseline');
	assert.equal(watch.decide({ hash: null }, { ok: true, hash: 'h' }), 'baseline');
	assert.equal(watch.decide({ hash: 'h' }, { ok: true, hash: 'h' }), 'unchanged');
	assert.equal(watch.decide({ hash: 'h' }, { ok: true, hash: 'g' }), 'changed');
	assert.equal(watch.decide({ hash: 'h' }, { ok: false, error: 'HTTP 500' }), 'error');
	assert.equal(watch.decide(undefined, { ok: false, error: 'timeout' }), 'error');
});

test('the first run only records baselines: no finding, no issue', async () => {
	const db = fakeDb({});
	const issues = [];
	const out = await watch.run({
		db,
		fetchImpl: fakeFetch({ [A]: html('<p>A v1</p>'), [B]: html('<p>B v1</p>') }),
		clauses,
		now: '2026-11-23T15:00:00.000Z',
		pause: 0,
		openIssue: async (issue) => issues.push(issue),
	});
	assert.deepEqual(out.tally, { checked: 2, baselines: 2, unchanged: 0, changed: 0, errors: 0, skipped: 0 });
	assert.equal(issues.length, 0);
	const stored = db.docs['legal_watch/' + watch.docId(A)];
	assert.deepEqual(stored, { url: A, hash: watch.hashOf('<p>A v1</p>'), checkedAt: '2026-11-23T15:00:00.000Z', status: 'ok', error: null });
	assert.ok(!Object.keys(db.docs).some((key) => key.startsWith('legal_watch_changes/')));
});

test('a changed page files ONE issue naming the url, its clauses and the dates, and stores the finding', async () => {
	const db = fakeDb({});
	const hashA = watch.hashOf('<p>A v1</p>');
	db.docs['legal_watch/' + watch.docId(A)] = { url: A, hash: hashA, checkedAt: '2026-11-16T15:00:00.000Z', status: 'ok' };
	db.docs['legal_watch/' + watch.docId(B)] = { url: B, hash: watch.hashOf('<p>B v1</p>'), checkedAt: '2026-11-16T15:00:00.000Z', status: 'ok' };
	const issues = [];
	const fetchImpl = fakeFetch({ [A]: html('<p>A v2</p>'), [B]: html('<p>B v2</p>') });
	const out = await watch.run({
		db,
		fetchImpl,
		clauses,
		now: '2026-11-23T15:00:00.000Z',
		pause: 0,
		openIssue: async (issue) => (issues.push(issue), { number: 4100, html_url: 'https://github.com/x/issues/4100' }),
	});
	assert.equal(out.tally.changed, 2);
	assert.equal(issues.length, 1, 'one issue per run, not per page');
	assert.match(issues[0].title, /^Legal watch: 2 cited sources changed \(2026-11-23\)$/);
	assert.ok(issues[0].body.includes(A) && issues[0].body.includes(B));
	assert.match(issues[0].body, /`one` \(lastChecked 2026-10-25, counsel-approved\), `two`/);
	assert.match(issues[0].body, /changed between 2026-11-16 and 2026-11-23/);
	assert.match(issues[0].body, /never touches legal\/clauses\.json, legal\/signoff\.json or the legal page/);
	const finding = db.docs['legal_watch_changes/' + watch.docId(A) + '-' + watch.hashOf('<p>A v2</p>').slice(0, 12)];
	assert.equal(finding.url, A);
	assert.equal(finding.previousHash, hashA);
	assert.equal(finding.issue, 4100);
	assert.deepEqual(finding.clauses.map((c) => c.id), ['one', 'two']);
	assert.equal(db.docs['legal_watch/' + watch.docId(A)].hash, watch.hashOf('<p>A v2</p>'), 'the new text is next week\'s baseline');
	assert.match(out.note, /2 changed \(issue #4100\)/);
	// The next run sees no change and files nothing.
	const again = await watch.run({ db, fetchImpl, clauses, now: '2026-11-30T15:00:00.000Z', pause: 0, openIssue: async (issue) => issues.push(issue) });
	assert.equal(again.tally.unchanged, 2);
	assert.equal(issues.length, 1);
});

test('a failing fetch is recorded, keeps the old hash, and is retried next week without a finding', async () => {
	const db = fakeDb({});
	const hashA = watch.hashOf('<p>A v1</p>');
	db.docs['legal_watch/' + watch.docId(A)] = { url: A, hash: hashA, checkedAt: '2026-11-16T15:00:00.000Z', status: 'ok' };
	const issues = [];
	const out = await watch.run({
		db,
		fetchImpl: fakeFetch({ [A]: 503, [B]: new Error('The operation was aborted due to timeout') }),
		clauses,
		now: '2026-11-23T15:00:00.000Z',
		pause: 0,
		openIssue: async (issue) => issues.push(issue),
	});
	assert.equal(out.tally.errors, 2);
	assert.equal(out.tally.changed, 0);
	assert.equal(issues.length, 0);
	assert.equal(out.warn, true);
	const stored = db.docs['legal_watch/' + watch.docId(A)];
	assert.equal(stored.hash, hashA);
	assert.equal(stored.status, 'error');
	assert.equal(stored.error, 'HTTP 503');
	assert.equal(db.docs['legal_watch/' + watch.docId(B)].hash, null);
	// Next week the page loads, equals the old text, and is just unchanged.
	const next = await watch.run({ db, fetchImpl: fakeFetch({ [A]: html('<p>A v1</p>'), [B]: html('<p>B v1</p>') }), clauses, now: '2026-11-30T15:00:00.000Z', pause: 0, openIssue: async (issue) => issues.push(issue) });
	assert.deepEqual([next.tally.unchanged, next.tally.baselines, next.tally.changed], [1, 1, 0]);
	assert.equal(issues.length, 0);
});

test('the per-run cap checks the longest-unchecked pages first and leaves the rest for next week', async () => {
	const db = fakeDb({});
	db.docs['legal_watch/' + watch.docId(A)] = { url: A, hash: watch.hashOf('a'), checkedAt: '2026-11-16T15:00:00.000Z' };
	const fetchImpl = fakeFetch({ [A]: 'a', [B]: 'b', [C]: 'c' });
	const three = clauses.concat({ id: 'four', lastChecked: '2026-10-28', status: 'draft', cites: [{ name: 'Law C', url: C }] });
	const out = await watch.run({ db, fetchImpl, clauses: three, now: '2026-11-23T15:00:00.000Z', pause: 0, cap: 2 });
	assert.deepEqual(fetchImpl.calls.map((c) => c.url), [B, C], 'never-checked pages go before the one checked last week');
	assert.equal(out.tally.skipped, 1);
	assert.match(out.note, /1 left for next week/);
});

test('fetches carry a polite user agent and a timeout signal', async () => {
	const fetchImpl = fakeFetch({ [A]: 'a' });
	await watch.fetchPage(fetchImpl, A);
	const { options } = fetchImpl.calls[0];
	assert.match(options.headers['User-Agent'], /^QA-lab-legal-watch\/1\.0 \(\+https:\/\/carlosandmunoz\.com/);
	assert.ok(options.signal instanceof AbortSignal);
	assert.deepEqual(await watch.fetchPage(fakeFetch({ [A]: '<html><script>x</script></html>' }), A), { ok: false, error: 'empty page' });
});

test('without a GitHub token or when the issue fails, the finding is still stored and the run warns', async () => {
	for (const openIssue of [null, async () => { throw new Error('GitHub 502'); }]) {
		const db = fakeDb({});
		db.docs['legal_watch/' + watch.docId(A)] = { url: A, hash: watch.hashOf('old'), checkedAt: '2026-11-16T15:00:00.000Z' };
		const out = await watch.run({ db, fetchImpl: fakeFetch({ [A]: 'new', [B]: 'b' }), clauses, now: '2026-11-23T15:00:00.000Z', pause: 0, openIssue });
		assert.equal(out.warn, true);
		assert.match(out.note, /changes stored, issue not filed/);
		const finding = db.docs['legal_watch_changes/' + watch.docId(A) + '-' + watch.hashOf('new').slice(0, 12)];
		assert.equal(finding.issue, null);
	}
});

test('loadClauses reads legal/clauses.json from main', async () => {
	const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => ({ clauses }), url });
	assert.equal((await watch.loadClauses(fetchImpl)).length, 3);
	await assert.rejects(watch.loadClauses(async () => ({ ok: false, status: 404 })), /answered 404/);
});

test('the watch is weekly in the ops table, registered in index.js, and never writes the legal files', () => {
	const row = ops.JOBS.find((r) => r.job === 'legalWatch');
	assert.equal(row.cron, '0 10 * * 1');
	assert.equal(row.gap, 7 * 24 + 2);
	const index = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'index.js'), 'utf8');
	assert.match(index, /exports\.legalWatch = require\("firebase-functions\/v2\/scheduler"\)\.onSchedule\(/);
	assert.match(index, /track\("legalWatch"/);
	const source = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'legal-watch.js'), 'utf8');
	assert.ok(!/writeFile|appendFile|\.rename|createWriteStream/.test(source));
});
