const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lineStatus, rowStatus, buildTree, filterTree, flatten, windowRows, summary, matchSegments } = require('../../js/runner-tree-grid.js');

const groups = () => [
	{
		name: 'Playwright',
		label: 'Playwright',
		running: false,
		rows: [
			{ title: 'HOME-01 hero', ok: true },
			{ title: 'NAV-02 menu', ok: false },
		],
		log: ['playwright test', '2 passing', 'Error: locator timeout'],
	},
	{ name: 'Cypress', label: 'Cypress', running: true, rows: [], log: ['cypress run'] },
	{ name: 'WebDriverIO', label: 'WebdriverIO', running: false, rows: [{ title: 'HOME-01 hero', ok: true }], log: [] },
];

test('lineStatus matches the lab log colouring: fail beats pass, the rest is running/info', () => {
	assert.equal(lineStatus('Error: boom'), 'fail');
	assert.equal(lineStatus('exit 1'), 'fail');
	assert.equal(lineStatus('exit 0'), 'run');
	assert.equal(lineStatus('12 passing'), 'pass');
	assert.equal(lineStatus('✓ ok but 1 failed'), 'fail');
	assert.equal(lineStatus('cypress run'), 'run');
	assert.equal(lineStatus(null), 'run');
	assert.equal(rowStatus({ ok: true }), 'pass');
	assert.equal(rowStatus({ ok: false }), 'fail');
	assert.equal(rowStatus({}), 'run');
});

test('buildTree makes one node per framework with case rows then log rows and a folded status', () => {
	const tree = buildTree(groups());
	assert.deepEqual(
		tree.map((n) => [n.name, n.status, n.children.length]),
		[
			['Playwright', 'fail', 5],
			['Cypress', 'run', 1],
			['WebDriverIO', 'pass', 1],
		]
	);
	assert.equal(tree[2].label, 'WebdriverIO');
	assert.deepEqual(tree[0].counts, { fail: 2, pass: 2, run: 1 });
	assert.deepEqual(
		tree[0].children.map((c) => c.kind),
		['case', 'case', 'log', 'log', 'log']
	);
	// ids are unique across the whole tree so a virtualized row can be keyed and re-found
	const ids = tree.flatMap((n) => [n.id, ...n.children.map((c) => c.id)]);
	assert.equal(new Set(ids).size, ids.length);
	assert.deepEqual(buildTree(null), []);
});

test('filterTree by framework, status and text; empty filter keeps everything', () => {
	const tree = buildTree(groups());
	assert.equal(filterTree(tree, {}).length, 3);
	assert.equal(filterTree(tree, undefined)[0].children.length, 5);

	assert.deepEqual(filterTree(tree, { framework: 'Cypress' }).map((n) => n.name), ['Cypress']);
	assert.deepEqual(filterTree(tree, { framework: ['Cypress', 'WebDriverIO'] }).map((n) => n.name), ['Cypress', 'WebDriverIO']);

	const failing = filterTree(tree, { status: 'fail' });
	assert.deepEqual(failing.map((n) => n.name), ['Playwright']);
	assert.deepEqual(failing[0].children.map((c) => c.label), ['NAV-02 menu', 'Error: locator timeout']);
	assert.equal(failing[0].total, 5);

	const hero = filterTree(tree, { text: ' HERO ' });
	assert.deepEqual(hero.map((n) => [n.name, n.children.length]), [['Playwright', 1], ['WebDriverIO', 1]]);

	// framework name match keeps all of that framework's rows that pass the status filter
	const byName = filterTree(tree, { text: 'cypress' });
	assert.deepEqual(byName.map((n) => [n.name, n.children.length]), [['Cypress', 1]]);
	assert.deepEqual(filterTree(tree, { text: 'webdriverio', status: ['pass'] }).map((n) => n.children.length), [1]);

	assert.deepEqual(filterTree(tree, { status: new Set(['pass', 'fail']), framework: 'WebDriverIO' }).map((n) => n.name), ['WebDriverIO']);
	assert.deepEqual(filterTree(tree, { text: 'no such row' }), []);
	assert.deepEqual(filterTree(tree, { framework: 'Nope' }), []);
});

test('filterTree does not mutate the source tree', () => {
	const tree = buildTree(groups());
	filterTree(tree, { status: 'fail' });
	assert.equal(tree[0].children.length, 5);
	assert.equal(tree[0].total, undefined);
});

test('flatten honours collapsed frameworks unless a filter forces them open', () => {
	const tree = buildTree(groups());
	const all = flatten(tree, new Set(), false);
	assert.equal(all.length, 3 + 5 + 1 + 1);
	assert.deepEqual(
		all.slice(0, 3).map((r) => [r.depth, r.node.kind, r.open]),
		[
			[0, 'framework', true],
			[1, 'case', false],
			[1, 'case', false],
		]
	);
	const shut = flatten(tree, new Set(['Playwright']), false);
	assert.equal(shut.length, 3 + 1 + 1);
	assert.equal(shut[0].open, false);
	assert.equal(shut[0].expandable, true);
	assert.equal(flatten(tree, new Set(['Playwright']), true).length, all.length);
	assert.deepEqual(flatten([], null), []);
	// an empty framework is a leaf-less parent: nothing to expand
	assert.equal(flatten(buildTree([{ name: 'k6', rows: [], log: [] }]), null)[0].expandable, false);
});

test('windowRows renders only the visible slice plus overscan', () => {
	const w = windowRows({ total: 10000, rowHeight: 24, viewportHeight: 240, scrollTop: 0, overscan: 5 });
	assert.deepEqual(w, { start: 0, end: 16, offsetTop: 0, totalHeight: 240000 });

	const mid = windowRows({ total: 10000, rowHeight: 24, viewportHeight: 240, scrollTop: 2400, overscan: 5 });
	assert.equal(mid.start, 95);
	assert.equal(mid.end, 100 + 11 + 5);
	assert.equal(mid.offsetTop, 95 * 24);
	assert.ok(mid.end - mid.start < 40, 'window stays small whatever the list size');

	// scrolled past the end clamps to the last page
	const end = windowRows({ total: 100, rowHeight: 20, viewportHeight: 200, scrollTop: 99999, overscan: 0 });
	assert.equal(end.end, 100);
	assert.equal(end.start, 90);

	// fewer rows than the viewport, and no rows
	assert.deepEqual(windowRows({ total: 3, rowHeight: 24, viewportHeight: 500, scrollTop: 10 }), { start: 0, end: 3, offsetTop: 0, totalHeight: 72 });
	assert.deepEqual(windowRows({ total: 0, rowHeight: 24, viewportHeight: 500, scrollTop: 0 }), { start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
	// bad numbers fall back to defaults
	assert.equal(windowRows({ total: 50, viewportHeight: 100, scrollTop: -5, rowHeight: 0 }).start, 0);
});

test('100 pages x 20 frameworks: filter then window stays cheap and correct', () => {
	const names = Array.from({ length: 20 }, (_, i) => 'FW' + i);
	const big = names.map((name, f) => ({
		name,
		rows: Array.from({ length: 100 }, (_, p) => ({ title: 'page-' + p, ok: (p + f) % 17 !== 0 })),
		log: Array.from({ length: 200 }, (_, l) => (l % 50 === 0 ? 'Error line ' + l : 'line ' + l)),
	}));
	const tree = buildTree(big);
	assert.equal(summary(tree).rows, 20 * 300);

	const fails = filterTree(tree, { status: 'fail' });
	const s = summary(fails);
	assert.equal(s.run + s.pass, 0);
	assert.equal(s.fail, fails.reduce((n, fw) => n + fw.children.length, 0));
	assert.ok(s.fail > 0 && s.fail < 20 * 300);

	const rows = flatten(fails, new Set(), true);
	assert.equal(rows.length, s.fail + fails.length);
	const w = windowRows({ total: rows.length, rowHeight: 24, viewportHeight: 480, scrollTop: 1000 });
	assert.ok(w.end - w.start <= 20 + 1 + 12);

	const one = filterTree(tree, { framework: 'FW3', text: 'page-42' });
	assert.deepEqual(one.map((n) => [n.name, n.children.length]), [['FW3', 1]]);
});

test('matchSegments splits text into match / non-match parts without regex injection', () => {
	assert.deepEqual(matchSegments('Hello WORLD', ''), [{ text: 'Hello WORLD', match: false }]);
	assert.deepEqual(matchSegments('Hello WORLD', '   '), [{ text: 'Hello WORLD', match: false }]);
	assert.deepEqual(matchSegments(null, 'x'), [{ text: '', match: false }]);
	assert.deepEqual(matchSegments('abc', 'nope'), [{ text: 'abc', match: false }]);

	assert.deepEqual(matchSegments('Error: locator timeout', 'LOCATOR'), [
		{ text: 'Error: ', match: false },
		{ text: 'locator', match: true },
		{ text: ' timeout', match: false },
	]);
	assert.deepEqual(matchSegments('aaa', 'a'), [
		{ text: 'a', match: true },
		{ text: 'a', match: true },
		{ text: 'a', match: true },
	]);
	assert.deepEqual(matchSegments('ababa', 'aba'), [
		{ text: 'aba', match: true },
		{ text: 'ba', match: false },
	]);
	// query characters that look like regex stay literal
	assert.deepEqual(matchSegments('cost is $5.00 (ok)', '$5.00'), [
		{ text: 'cost is ', match: false },
		{ text: '$5.00', match: true },
		{ text: ' (ok)', match: false },
	]);
	assert.deepEqual(matchSegments('a.*b and a.*b', 'a.*b'), [
		{ text: 'a.*b', match: true },
		{ text: ' and ', match: false },
		{ text: 'a.*b', match: true },
	]);
});

test('module is dependency-free and not loaded by any HTML page (opt-in, loaded on demand by qa-lab.js)', () => {
	const root = path.join(__dirname, '..', '..');
	const raw = fs.readFileSync(path.join(root, 'js', 'runner-tree-grid.js'), 'utf8');
	const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
	assert.ok(!/\brequire\(|\bimport\s|monocart/i.test(src), 'no requires or monocart code');
	assert.ok(!/innerHTML/.test(src), 'log text goes in through textContent only');
	for (const f of fs.readdirSync(root).filter((n) => n.endsWith('.html'))) {
		assert.ok(!fs.readFileSync(path.join(root, f), 'utf8').includes('runner-tree-grid'), f + ' must not load it');
	}
	const lab = fs.readFileSync(path.join(root, 'js', 'qa-lab.js'), 'utf8');
	assert.ok(lab.includes('js/runner-tree-grid.js'), 'qa-lab.js loads it on demand');
});
