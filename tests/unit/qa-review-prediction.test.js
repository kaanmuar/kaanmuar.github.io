// Call-your-shot wager storage + Nailed it matching (#4472).
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');

function loadPrediction() {
	const storage = {};
	function CustomEvent(type, init) {
		this.type = type;
		this.detail = init && init.detail;
	}
	const sandbox = {
		CustomEvent: CustomEvent,
		window: {
			document: {
				readyState: 'complete',
				addEventListener: function () {},
				querySelector: function () { return null; },
				querySelectorAll: function () { return []; },
				getElementById: function () { return null; },
			},
			sessionStorage: {
				getItem: function (k) { return storage[k] || null; },
				setItem: function (k, v) { storage[k] = String(v); },
				removeItem: function (k) { delete storage[k]; },
			},
			dispatchEvent: function () {},
			setTimeout: function (fn) { fn(); },
			addEventListener: function () {},
		},
		document: {
			readyState: 'complete',
			addEventListener: function () {},
			querySelector: function () { return null; },
			querySelectorAll: function () { return []; },
			getElementById: function () { return null; },
		},
		sessionStorage: null,
	};
	sandbox.window.sessionStorage = {
		getItem: function (k) { return storage[k] || null; },
		setItem: function (k, v) { storage[k] = String(v); },
		removeItem: function (k) { delete storage[k]; },
	};
	sandbox.document = sandbox.window.document;
	sandbox.sessionStorage = sandbox.window.sessionStorage;
	vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/qa-review-prediction.js'), 'utf8'), sandbox);
	return sandbox.window.QAReviewPrediction;
}

test('wager round-trips in sessionStorage (#4472)', () => {
	const api = loadPrediction();
	assert.equal(api.readWager(), null);
	api.writeWager('trust-gaps');
	const saved = api.readWager();
	assert.equal(saved.id, 'trust-gaps');
	assert.equal(saved.label, 'Trust Gaps');
	assert.equal(saved.area, 'Security');
	assert.equal(JSON.stringify(saved.focus), JSON.stringify(['security', 'dmarc', 'hsts', 'tls', 'headers']));
	api.clearWager();
	assert.equal(api.readWager(), null);
});

test('evaluate nails top finding, weakest area, or focus tag (#4472)', () => {
	const api = loadPrediction();
	const wager = { id: 'ux-friction', label: 'UX Friction', area: 'Accessibility', focus: api.CHIPS[3].focus };
	const base = {
		findings: [{ rank: 1, area: 'SEO', title: 'Thin titles' }],
		score: { areas: { SEO: { score: 55 }, Accessibility: { score: 72 }, Security: { score: 70 }, Performance: { score: 80 } } },
	};
	assert.equal(api.evaluate(base, {}, wager).nailed, false);
	const top = { findings: [{ rank: 1, area: 'Accessibility' }], score: base.score };
	assert.equal(api.evaluate(top, {}, wager).nailed, true);
	assert.equal(api.evaluate(top, {}, wager).why, 'top');
	const weak = {
		findings: [],
		score: { areas: { SEO: { score: 80 }, Accessibility: { score: 40 }, Security: { score: 70 } } },
	};
	assert.equal(api.evaluate(weak, {}, wager).nailed, true);
	assert.equal(api.evaluate(weak, {}, wager).why, 'weakest');
	const focus = { findings: [{ rank: 1, area: 'SEO' }], score: { areas: { SEO: { score: 50 }, Accessibility: { score: 60 } } } };
	const report = { focus: ['a11y'] };
	assert.equal(api.evaluate(focus, report, wager).nailed, true);
	assert.equal(api.evaluate(focus, report, wager).why, 'focus');
});

test('qa-review.html wires prediction assets (#4472)', () => {
	const html = fs.readFileSync(path.join(ROOT, 'qa-review.html'), 'utf8');
	assert.match(html, /css\/qa-review-prediction\.css/);
	assert.match(html, /js\/qa-review-prediction\.js/);
	const js = fs.readFileSync(path.join(ROOT, 'js/qa-review.js'), 'utf8');
	assert.match(js, /QAReviewPrediction\.onReport/);
});