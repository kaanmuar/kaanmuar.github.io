const test = require('node:test');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const scripts = require('../../js/qa-review-scripts.js');

const kinds = (target) => scripts.rankLocators(target).map((candidate) => candidate.kind);

// Locator ranking (#3832): role and name, then test id, then label, then text, then CSS, then XPath.
test('a fully described element ranks role, test id, label, text, css, xpath', () => {
	assert.deepEqual(
		kinds({
			tag: 'button',
			name: 'Save',
			testId: 'save',
			label: 'Save form',
			text: 'Save',
			css: '#save',
			xpath: '//button',
		}),
		['role', 'testId', 'label', 'text', 'css', 'xpath']
	);
});

test('the role comes from the tag when the page set none, and a role with no name is not a candidate', () => {
	const link = scripts.rankLocators({ tag: 'a', attrs: { href: '/sport' }, text: 'Sport', css: 'a' });
	assert.deepEqual(
		link.map((c) => [c.kind, c.role, c.name]),
		[
			['role', 'link', 'Sport'],
			['text', undefined, undefined],
			['css', undefined, undefined],
		]
	);
	assert.deepEqual(kinds({ tag: 'input', attrs: { type: 'email' }, css: '#mail' }), ['css']);
	assert.deepEqual(kinds({ tag: 'input', attrs: { type: 'email' }, label: 'Email', css: '#mail' }), ['label', 'css']);
	assert.deepEqual(kinds({ tag: 'a', text: 'No href', css: 'a.x' }), ['text', 'css']);
});

test('an explicit name beats the visible text, and a long text is not a text locator', () => {
	const [best] = scripts.rankLocators({ tag: 'a', attrs: { href: '/' }, name: 'Home page', text: 'Home' });
	assert.equal(best.name, 'Home page');
	assert.deepEqual(kinds({ text: 'x'.repeat(81), css: 'p.long' }), ['css']);
});

test('a kind that is not unique drops below every unique kind; a kind that finds nothing is dropped', () => {
	assert.deepEqual(
		kinds({ tag: 'a', attrs: { href: '/a' }, text: 'More', testId: 'more', css: '#more', matches: { role: 3, testId: 1 } }),
		['testId', 'text', 'css', 'role']
	);
	assert.deepEqual(
		kinds({ tag: 'a', attrs: { href: '/a' }, text: 'More', css: '#more', matches: { role: 0, text: 2, css: 1 } }),
		['css', 'text']
	);
});

test('the same input always ranks the same, and the input is not changed', () => {
	const target = { tag: 'button', text: 'Go', testId: 'go', css: '.go', matches: { role: 2 } };
	const before = JSON.stringify(target);
	assert.deepEqual(scripts.rankLocators(target), scripts.rankLocators(target));
	assert.equal(JSON.stringify(target), before);
	assert.deepEqual(
		scripts.rankLocators(target).map((c) => c.rank),
		[0, 1, 2, 3]
	);
	assert.deepEqual(scripts.rankLocators(null), []);
});

test('each kind renders as the Playwright locator a person would write', () => {
	const ranked = scripts.rankLocators({
		tag: 'button',
		text: 'Save',
		testId: 'save-btn',
		label: 'Save form',
		css: 'button.save',
		xpath: '//button[1]',
	});
	assert.deepEqual(ranked.map(scripts.playwrightLocator), [
		'page.getByRole("button", { name: "Save", exact: true })',
		'page.getByTestId("save-btn")',
		'page.getByLabel("Save form", { exact: true })',
		'page.getByText("Save", { exact: true })',
		'page.locator("button.save")',
		'page.locator("xpath=//button[1]")',
	]);
});

const JOURNEY = {
	kind: 'journey',
	path: '/',
	selector: 'nav a[href="/sport"]',
	text: 'Sport',
	target: '/sport',
	h1: 'Sport',
	where: 'navigation',
};

const GOLDEN_PLAYWRIGHT = `// Fallback locators, best first: page.getByText("Sport", { exact: true }), page.locator("nav a[href=\\"/sport\\"]")
const link = page.getByRole("link", { name: "Sport", exact: true }).first();
const label = ((await link.textContent()) || "").replace(/\\s+/g, " ").trim();
expect(label).toContain("Sport");
await link.click();
await page.waitForURL((url) => url.pathname === "/sport");
expect(await page.evaluate(() => ((document.querySelector("h1") || {}).textContent || "").replace(/\\s+/g, " ").trim())).toContain("Sport");`;

function emit(check, framework) {
	const report = { host: 'example.com', finalUrl: 'https://example.com/' };
	const { kind, ...journey } = check;
	const item = {
		id: 'JR-01',
		title: 'Clicking Sport opens /sport',
		why: 'Nav links to Sport. Click it.',
		fw: [framework],
		journey,
	};
	return scripts.snippets(report, item, [framework])[0].code;
}

test('the Playwright journey script clicks the ranked locator (golden)', () => {
	const code = emit(JOURNEY, 'Playwright');
	assert.ok(code.includes(GOLDEN_PLAYWRIGHT.split('\n').join('\n  ')), code);
});

test('a test id and an aria-label from the page win the right slots', () => {
	const code = emit(Object.assign({}, JOURNEY, { testId: 'nav-sport', ariaLabel: 'Sport news' }), 'Playwright');
	assert.match(code, /const link = page\.getByRole\("link", \{ name: "Sport news", exact: true \}\)\.first\(\);/);
	assert.match(code, /Fallback locators, best first: page\.getByTestId\("nav-sport"\), page\.getByText\("Sport", /);
	assert.match(code, /expect\(label\)\.toContain\("Sport"\);/);
});

test('Jest, Vitest and Mocha use the same ranked locator; frameworks without a page keep CSS', () => {
	['Jest', 'Vitest', 'Mocha'].forEach((framework) => {
		const code = emit(JOURNEY, framework);
		assert.match(code, /const link = page\.getByRole\("link", \{ name: "Sport", exact: true \}\)\.first\(\);/, framework);
		assert.match(code, /await link\.click\(\);/, framework);
		assert.doesNotMatch(code, /page\.locator\("nav a\[href=[^)]*\)\.first\(\)\.click/, framework);
	});
	assert.match(emit(JOURNEY, 'Cypress'), /cy\.get\("nav a\[href=\\"\/sport\\"\]"\)/);
	assert.match(emit(JOURNEY, 'Selenium'), /By\.CSS_SELECTOR/);
});

test('the ranked Playwright journey is valid TypeScript that parses', () => {
	const code = emit(JOURNEY, 'Playwright');
	const source = stripTypeScriptTypes('async function run(page, expect) {\n' + code + '\n}', { mode: 'strip' });
	assert.doesNotThrow(() => new vm.Script(source));
});


test('a landmark or heading level ranks without a name; a named control still needs one', () => {
	assert.deepEqual(kinds({ tag: 'h1', css: 'h1' }), ['role', 'css']);
	assert.equal(scripts.rankLocators({ tag: 'h1', css: 'h1' })[0].level, 1);
	assert.deepEqual(kinds({ role: 'main', css: 'main, [role="main"]' }), ['role', 'css']);
	assert.deepEqual(kinds({ tag: 'nav', css: 'nav' }), ['role', 'css']);
	assert.deepEqual(kinds({ tag: 'input', attrs: { type: 'email' }, css: '#mail' }), ['css']);
});

test('checkTarget maps structural CSS used by count/attr checks', () => {
	const h1 = scripts.checkTarget({ selector: 'h1' });
	assert.equal(h1.tag, 'h1');
	assert.equal(h1.css, 'h1');
	assert.equal(scripts.checkTarget({ selector: 'main, [role="main"]' }).role, 'main');
	assert.equal(scripts.checkTarget({ selector: 'html', attr: 'lang' }).css, 'html');
	assert.equal(scripts.checkTarget({ selector: 'h2', role: 'heading', level: 2, testId: 't' }).testId, 't');
});

test('playwrightLocator omits name for landmarks and adds heading level', () => {
	assert.equal(
		scripts.playwrightLocator({ kind: 'role', role: 'main' }),
		'page.getByRole("main")'
	);
	assert.equal(
		scripts.playwrightLocator({ kind: 'role', role: 'heading', level: 1 }),
		'page.getByRole("heading", { level: 1 })'
	);
	assert.equal(
		scripts.playwrightLocator({ kind: 'role', role: 'heading', name: 'Title', level: 2 }),
		'page.getByRole("heading", { name: "Title", exact: true, level: 2 })'
	);
});

function emitCheck(check, framework) {
	const report = { host: 'example.com', finalUrl: 'https://example.com/' };
	const item = {
		id: 'FN-03',
		title: 'One h1',
		why: 'Pages need one h1.',
		fw: [framework],
		check,
	};
	return scripts.snippets(report, item, [framework])[0].code;
}

test('Playwright count/attr prefer role locators; plain CSS stays when nothing ranks higher', () => {
	const h1 = emitCheck({ kind: 'count', path: '/', selector: 'h1', op: 'eq', n: 1 }, 'Playwright');
	assert.match(h1, /const found = await page\.getByRole\("heading", \{ level: 1 \}\)\.count\(\);/);
	assert.match(h1, /Fallback locators, best first: page\.locator\("h1"\)/);
	const main = emitCheck(
		{ kind: 'count', path: '/', selector: 'main, [role="main"]', op: 'gte', n: 1 },
		'Playwright'
	);
	assert.match(main, /page\.getByRole\("main"\)\.count\(\)/);
	const lang = emitCheck({ kind: 'attr', path: '/', selector: 'html', attr: 'lang' }, 'Playwright');
	assert.match(lang, /await expect\(page\.locator\("html"\)\)\.toHaveAttribute\("lang"/);
	const testId = emitCheck(
		{ kind: 'count', path: '/', selector: '.cards', op: 'gte', n: 1, testId: 'card-list' },
		'Playwright'
	);
	assert.match(testId, /page\.getByTestId\("card-list"\)\.count\(\)/);
});

test('Jest and Vitest count checks use the same ranked locator', () => {
	['Jest', 'Vitest', 'Mocha'].forEach((framework) => {
		const code = emitCheck({ kind: 'count', path: '/', selector: 'h1', op: 'eq', n: 1 }, framework);
		assert.match(code, /page\.getByRole\("heading", \{ level: 1 \}\)\.count\(\)/, framework);
	});
});

// Match-count capture (#3832): count how many elements each locator kind would hit on a live / jsdom-like document.
// No XPath evaluation (unsafe under CSP). Minimal stub — no new DOM deps.
function stubEl(tag, attrs, text) {
	const store = Object.assign({}, attrs || {});
	return {
		tagName: String(tag || '').toUpperCase(),
		textContent: text || '',
		innerText: text || '',
		getAttribute(name) {
			return store[name] != null ? String(store[name]) : null;
		},
		_css: store._css || [],
	};
}

function stubDoc(nodes) {
	const all = nodes.slice();
	return {
		getElementById(id) {
			return all.find((el) => el.getAttribute('id') === id) || null;
		},
		querySelectorAll(selector) {
			if (selector === '*') return all.slice();
			const testId = /^\[data-testid="((?:\\.|[^"\\])*)"\]$/.exec(selector);
			if (testId) {
				const want = testId[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
				return all.filter((el) => el.getAttribute('data-testid') === want);
			}
			return all.filter((el) => (el._css || []).indexOf(selector) !== -1 || String(el.tagName).toLowerCase() === selector);
		},
	};
}

test('countLocatorMatches counts css, testId, role, text, and label; omits xpath', () => {
	const unique = stubEl('a', { href: '/more', 'data-testid': 'more', _css: ['#more'] }, 'More');
	const twin = stubEl('a', { href: '/other' }, 'More');
	const labelled = stubEl('button', { 'aria-label': 'Save form' }, 'Save');
	const doc = stubDoc([unique, twin, labelled]);
	const counts = scripts.countLocatorMatches(doc, {
		tag: 'a',
		attrs: { href: '/more' },
		text: 'More',
		testId: 'more',
		css: '#more',
		xpath: '//a',
		label: 'Save form',
	});
	assert.equal(counts.css, 1);
	assert.equal(counts.testId, 1);
	assert.equal(counts.role, 2);
	assert.equal(counts.text, 2);
	assert.equal(counts.label, 1);
	assert.equal(counts.xpath, undefined);
});

test('withMatchCounts and rankedLocator demote ambiguous role; drop zero-match kinds', () => {
	const keep = stubEl('a', { href: '/a', 'data-testid': 'more', _css: ['#more'] }, 'More');
	const other = stubEl('a', { href: '/b' }, 'More');
	const ghost = stubEl('span', { _css: ['.gone'] }, 'Gone');
	const doc = stubDoc([keep, other, ghost]);

	const target = {
		tag: 'a',
		attrs: { href: '/a' },
		text: 'More',
		testId: 'more',
		css: '#more',
	};
	const counted = scripts.withMatchCounts(doc, target);
	assert.deepEqual(counted.matches, { css: 1, testId: 1, role: 2, text: 2 });
	assert.deepEqual(
		scripts.rankLocators(counted).map((c) => c.kind),
		['testId', 'css', 'role', 'text']
	);

	const zeroed = scripts.rankedLocator(
		{ kind: 'count', path: '/', selector: '.gone', text: 'Nope', op: 'eq', n: 0 },
		doc
	);
	assert.match(zeroed.locator, /page\.locator\("\.gone"\)/);
	assert.equal(zeroed.fallbacks, '');
});

test('snippets(..., doc) prefer unique testId over ambiguous role for Playwright count', () => {
	const keep = stubEl('a', { href: '/a', 'data-testid': 'more', _css: ['#more', 'a'] }, 'More');
	const other = stubEl('a', { href: '/b' }, 'More');
	const doc = stubDoc([keep, other]);
	const report = { host: 'example.com', finalUrl: 'https://example.com/' };
	const item = {
		id: 'FN-03',
		title: 'More link',
		why: 'One More link.',
		fw: ['Playwright'],
		check: {
			kind: 'count',
			path: '/',
			selector: '#more',
			op: 'eq',
			n: 1,
			testId: 'more',
			text: 'More',
			tag: 'a',
			attrs: { href: '/a' },
		},
	};
	const without = scripts.snippets(report, item, ['Playwright'])[0].code;
	assert.match(without, /page\.getByRole\("link", \{ name: "More", exact: true \}\)\.count\(\)/);

	const withDoc = scripts.snippets(report, item, ['Playwright'], doc)[0].code;
	assert.match(withDoc, /page\.getByTestId\("more"\)\.count\(\)/);
	assert.match(withDoc, /Fallback locators, best first: page\.locator\("#more"\)/);
});

test('cssLocator maps role/testId/label; text and xpath stay empty', () => {
	assert.equal(
		scripts.cssLocator({ kind: 'role', role: 'heading', level: 1 }),
		'h1, [role="heading"][aria-level="1"]'
	);
	assert.equal(scripts.cssLocator({ kind: 'role', role: 'main' }), 'main, [role="main"]');
	assert.equal(scripts.cssLocator({ kind: 'testId', value: 'card-list' }), '[data-testid="card-list"]');
	assert.equal(scripts.cssLocator({ kind: 'label', value: 'Email' }), '[aria-label="Email"]');
	assert.equal(scripts.cssLocator({ kind: 'text', value: 'Hello' }), '');
	assert.equal(scripts.cssLocator({ kind: 'xpath', value: '//h1' }), '');
	assert.equal(scripts.cssLocator({ kind: 'css', value: '.cards' }), '.cards');
});

test('Cypress and Selenium count/attr prefer role/testId/label CSS when available', () => {
	const cyH1 = emitCheck({ kind: 'count', path: '/', selector: 'h1', op: 'eq', n: 1 }, 'Cypress');
	assert.match(cyH1, /querySelectorAll\("h1, \[role=\\"heading\\"\]\[aria-level=\\"1\\"\]"\)/);
	assert.match(cyH1, /Fallback locators, best first: h1/);
	const cyMain = emitCheck(
		{ kind: 'count', path: '/', selector: 'main, [role="main"]', op: 'gte', n: 1 },
		'Cypress'
	);
	assert.match(cyMain, /querySelectorAll\("main, \[role=\\"main\\"\]"\)/);
	const cyTestId = emitCheck(
		{ kind: 'count', path: '/', selector: '.cards', op: 'gte', n: 1, testId: 'card-list' },
		'Cypress'
	);
	assert.match(cyTestId, /querySelectorAll\("\[data-testid=\\"card-list\\"\]"\)/);
	const cyLabel = emitCheck(
		{ kind: 'attr', path: '/', selector: '#mail', attr: 'type', label: 'Email' },
		'Cypress'
	);
	assert.match(cyLabel, /cy\.get\("\[aria-label=\\"Email\\"\]"\)/);

	const seH1 = emitCheck({ kind: 'count', path: '/', selector: 'h1', op: 'eq', n: 1 }, 'Selenium');
	assert.match(seH1, /By\.CSS_SELECTOR, "h1, \[role=\\"heading\\"\]\[aria-level=\\"1\\"\]"/);
	assert.match(seH1, /# Fallback locators, best first: h1/);
	const seTestId = emitCheck(
		{ kind: 'count', path: '/', selector: '.cards', op: 'gte', n: 1, testId: 'card-list' },
		'Selenium'
	);
	assert.match(seTestId, /By\.CSS_SELECTOR, "\[data-testid=\\"card-list\\"\]"/);
	const seLabel = emitCheck(
		{ kind: 'attr', path: '/', selector: '#mail', attr: 'type', label: 'Email' },
		'Selenium'
	);
	assert.match(seLabel, /By\.CSS_SELECTOR, "\[aria-label=\\"Email\\"\]"/);
});

test('WebdriverIO and CodeceptJS count checks use the same ranked CSS', () => {
	const wdio = emitCheck({ kind: 'count', path: '/', selector: 'h1', op: 'eq', n: 1 }, 'WebdriverIO');
	assert.match(wdio, /querySelectorAll\(selector\)\.length, "h1, \[role=\\"heading\\"\]\[aria-level=\\"1\\"\]"/);
	const codecept = emitCheck({ kind: 'count', path: '/', selector: 'h1', op: 'eq', n: 1 }, 'CodeceptJS');
	assert.match(codecept, /querySelectorAll\(selector\)\.length, "h1, \[role=\\"heading\\"\]\[aria-level=\\"1\\"\]"/);
});
