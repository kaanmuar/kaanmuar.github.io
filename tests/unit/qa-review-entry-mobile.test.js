const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/qa-review-entry-mobile.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/qa-review-entry-mobile.css'), 'utf8');

function load(matchMobile) {
	const listeners = {};
	const document = {
		readyState: 'complete',
		documentElement: { classList: { add() {} } },
		listeners,
		addEventListener(type, fn) {
			(listeners[type] || (listeners[type] = [])).push(fn);
		},
		querySelector(sel) {
			if (String(sel).includes('section.stage')) {
				return {
					classList: { add() {} },
					querySelector() {
						return {
							querySelector() {
								return { textContent: 'QA-lab URL Review' };
							},
						};
					},
				};
			}
			return null;
		},
		getElementById(id) {
			if (id === 'stage-start') return { id: 'stage-start' };
			if (id === 'gate') return { id: 'gate', hidden: true, hasAttribute() { return true; } };
			return null;
		},
		createElement() {
			return {
				className: '',
				append() {},
				insertBefore() {},
			};
		},
	};
	const matchMedia = () => ({ matches: !!matchMobile });
	const sandbox = {
		matchMedia,
		window: {
			document,
			matchMedia,
			addEventListener() {},
		},
		document,
		module: { exports: {} },
		exports: {},
	};
	sandbox.window.window = sandbox.window;
	vm.runInNewContext(SRC, sandbox, { filename: 'qa-review-entry-mobile.js' });
	return sandbox.window.QAReviewEntryMobile || sandbox.module.exports;
}

describe('qa-review-entry-mobile', () => {
	it('exports MQ and boot', () => {
		const api = load(true);
		assert.equal(api.MQ, '(max-width: 800px)');
		assert.equal(typeof api.boot, 'function');
		assert.equal(typeof api.isMobile, 'function');
		assert.ok(api.isMobile());
	});

	it('boot returns stage handle on mobile', () => {
		const api = load(true);
		const out = api.boot();
		assert.ok(out && out.mq === '(max-width: 800px)');
	});

	it('boot skips desktop', () => {
		const api = load(false);
		assert.equal(api.boot(), null);
	});

	it('is wired into qa-review.html', () => {
		const html = fs.readFileSync(path.join(ROOT, 'qa-review.html'), 'utf8');
		assert.match(html, /qa-review-entry-mobile\.css/);
		assert.match(html, /qa-review-entry-mobile\.js/);
	});

	it('CSS targets soft-gate stage with :has(#stage-start) for first paint', () => {
		assert.match(CSS, /section\.stage:has\(#stage-start\)/);
		assert.match(CSS, /@media \(max-width: 800px\)/);
	});

	it('source stays additive (no stage-start submit / OAuth)', () => {
		assert.doesNotMatch(SRC, /addEventListener\(['"]submit['"]/);
		assert.doesNotMatch(SRC, /ReviewAuth/);
		assert.match(SRC, /Additive/);
	});
});