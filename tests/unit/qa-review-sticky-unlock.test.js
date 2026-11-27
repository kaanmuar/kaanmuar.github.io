const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const stickyJs = fs.readFileSync(path.join(root, 'js/qa-review-sticky-unlock.js'), 'utf8');
const stickyCss = fs.readFileSync(path.join(root, 'css/qa-review-sticky-unlock.css'), 'utf8');
const reviewJs = fs.readFileSync(path.join(root, 'js/qa-review.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'qa-review.html'), 'utf8');

test('qa-review-sticky-unlock assets load before qa-review.js (#4464)', () => {
	const cssAt = html.indexOf('qa-review-sticky-unlock.css');
	const jsAt = html.indexOf('qa-review-sticky-unlock.js');
	const reviewAt = html.indexOf('js/qa-review.js');
	assert.ok(cssAt > -1 && jsAt > -1 && reviewAt > jsAt);
	const gateAt = html.indexOf('qa-review-unlock-gate.js');
	assert.ok(gateAt > -1 && jsAt > gateAt, 'sticky unlock follows unlock gate');
});

test('qa-review.js mounts sticky unlock after unlock gate (#4464)', () => {
	assert.match(reviewJs, /QAReviewStickyUnlock\.mount/);
	assert.match(reviewJs, /stickyUnlock\.sync/);
	assert.match(reviewJs, /unlockGate && unlockGate\.openSheet/);
});

test('sticky unlock shows only on unpaid mobile frosted reports', () => {
	assert.match(stickyJs, /max-width: 699px/);
	assert.match(stickyJs, /!c\.paid && !c\.free && !c\.sample/);
	assert.match(stickyCss, /@media \(max-width: 699px\)/);
});

test('sticky unlock hides when #pay is open', () => {
	assert.match(stickyJs, /!pay\.hidden/);
	assert.match(stickyJs, /attributeFilter: \['hidden'\]/);
});

test('sticky unlock opens checkout via unlock gate, not a forked pay flow', () => {
	assert.match(stickyJs, /deps\.openSheet\('sticky/);
	assert.doesNotMatch(stickyJs, /qa-review-pay/);
});

test('QAReviewStickyUnlock mount sync toggles visibility', () => {
	const listeners = [];
	const sandbox = {
		window: {
			matchMedia(q) {
				return { matches: q.includes('699'), addEventListener: (e, fn) => listeners.push(fn) };
			},
			QAReviewStickyUnlock: null,
		},
		document: {
			body: { classList: { add() {}, remove() {} }, appendChild() {} },
			createElement(tag) {
				const kids = [];
				return {
					tagName: String(tag).toUpperCase(),
					className: '',
					hidden: true,
					classList: { add() {}, remove() {} },
					setAttribute() {},
					append(...n) {
						n.forEach((x) => kids.push(x));
					},
					appendChild(n) {
						kids.push(n);
						return n;
					},
					querySelector() {
						return { textContent: '' };
					},
					addEventListener() {},
				};
			},
			getElementById() {
				return { hidden: true, classList: { contains: () => true } };
			},
		},
	};
	vm.runInNewContext(stickyJs, sandbox);
	const api = sandbox.window.QAReviewStickyUnlock.mount({
		getCurrent: () => ({ report: { id: 'x' }, paid: false, free: false, sample: false }),
		openSheet() {},
		priceUsd: () => 5,
		formatUsd: (n) => String(n),
	});
	assert.equal(typeof api.sync, 'function');
	api.sync({ unpaid: true });
	assert.equal(api.unpaidPayload(), true);
	api.sync({ unpaid: false });
	assert.equal(api.shouldShow(), false);
});