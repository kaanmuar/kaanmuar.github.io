const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/qa-review-entry-motion.js'), 'utf8');

function load() {
	const store = {};
	const document = {
		readyState: 'loading',
		listeners: {},
		addEventListener(type, fn) {
			(this.listeners[type] || (this.listeners[type] = [])).push(fn);
		},
		querySelector() {
			return null;
		},
		getElementById() {
			return null;
		},
		createElement(tag) {
			return {
				tagName: tag.toUpperCase(),
				className: '',
				style: {},
				children: [],
				setAttribute() {},
				addEventListener() {},
				appendChild(c) {
					this.children.push(c);
				},
			};
		},
	};
	const sandbox = {
		window: { document, setInterval() {}, clearInterval() {}, setTimeout, matchMedia: () => ({ matches: false }) },
		document,
		module: { exports: {} },
		exports: {},
		globalThis: {},
	};
	sandbox.window.window = sandbox.window;
	sandbox.globalThis = sandbox.window;
	vm.runInNewContext(SRC, sandbox, { filename: 'qa-review-entry-motion.js' });
	return sandbox.window.QAReviewEntryMotion || sandbox.module.exports;
}

describe('qa-review-entry-motion', () => {
	it('exports five phrases and 5s interval', () => {
		const api = load();
		assert.equal(api.PHRASES.length, 5);
		assert.equal(api.INTERVAL_MS, 5000);
		assert.equal(api.FADE_MS, 900);
		assert.equal(typeof api.boot, 'function');
	});

	it('each phrase has brand, lines, em index, lede', () => {
		const api = load();
		for (const p of api.PHRASES) {
			assert.ok(p.brand);
			assert.ok(Array.isArray(p.lines) && p.lines.length >= 2);
			assert.ok(p.em >= 0 && p.em < p.lines.length);
			assert.ok(p.lede && p.lede.length > 20);
		}
	});

	it('is wired into qa-review.html', () => {
		const html = fs.readFileSync(path.join(ROOT, 'qa-review.html'), 'utf8');
		assert.match(html, /qa-review-entry-motion\.css/);
		assert.match(html, /qa-review-entry-motion\.js/);
	});

	it('source stays additive (no soft-gate rewrite markers)', () => {
		assert.doesNotMatch(SRC, /getElementById\(['"]stage-start['"]\)/);
		assert.match(SRC, /Additive/);
	});
});
