const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCollapsed(sandbox) {
	const code = fs.readFileSync(path.join(__dirname, '../../js/qa-review-collapsed-report.js'), 'utf8');
	const ctx = Object.assign({ document: { body: { classList: { toggle() {} } } }, window: {} }, sandbox || {});
	vm.runInNewContext(code + '\nthis.QAReviewCollapsedReport = window.QAReviewCollapsedReport;', ctx);
	return ctx.QAReviewCollapsedReport;
}

function mkItem(head, panel) {
	const button = {
		'aria-expanded': 'true',
		setAttribute(name, val) {
			if (name === 'aria-expanded') this['aria-expanded'] = val;
		},
		closest() {
			return head;
		},
	};
	return { button, panel, group: head.dataset.indexGroup || head.id };
}

test('unpaid keep-list keeps health, fix-first, glance, and cases (#4463)', () => {
	const mod = loadCollapsed();
	const q = (flags) => ({
		querySelector(sel) {
			if (flags.health && sel.includes('health')) return {};
			if (flags.fix && sel.includes('fix-first')) return {};
			if (flags.visuals && sel.includes('report-visuals')) return {};
			if (flags.cases && sel.includes('#cases')) return {};
			if (flags.watch && sel.includes('watch-cases')) return {};
			return null;
		},
	});
	assert.equal(mod.shouldKeepOpen(mkItem({ dataset: { face: 'health', indexGroup: 'summary' } }, q({ health: true }))), true);
	assert.equal(mod.shouldKeepOpen(mkItem({ dataset: { face: 'fixfirst', indexGroup: 'summary' } }, q({ fix: true }))), true);
	assert.equal(mod.shouldKeepOpen(mkItem({ dataset: { indexGroup: 'glance' } }, q({ visuals: true }))), true);
	assert.equal(mod.shouldKeepOpen(mkItem({ dataset: { indexGroup: 'cases', face: 'cases' } }, q({ watch: true }))), true);
	assert.equal(mod.shouldKeepOpen(mkItem({ dataset: { face: 'sec', indexGroup: 'checks' } }, q({}))), false);
});

test('sync collapses unpaid folds and tags the body', () => {
	let bodyClass = false;
	const mod = loadCollapsed({
		document: {
			body: {
				classList: {
					toggle(_name, on) {
						bodyClass = on;
					},
				},
			},
		},
	});
	const folds = [
		mkItem({ dataset: { face: 'sec', indexGroup: 'checks' } }, { hidden: false, querySelector: () => null }),
		mkItem({ dataset: { face: 'health', indexGroup: 'summary' } }, { hidden: false, querySelector: (s) => (s.includes('health') ? {} : null) }),
	];
	let paintFoldAll = 0;
	mod.sync({
		unpaid: true,
		folds,
		paintFoldAll() {
			paintFoldAll += 1;
		},
	});
	assert.ok(bodyClass);
	assert.equal(folds[0].panel.hidden, true);
	assert.equal(folds[1].panel.hidden, false);
	assert.equal(paintFoldAll, 1);
	const collapsedSrc = fs.readFileSync(path.join(__dirname, '../../js/qa-review-collapsed-report.js'), 'utf8');
	assert.doesNotMatch(collapsedSrc, /opts\.setFold|setFold\(item/);
});

test('statuscard no longer owns collapse keep-list (#4430 watch-cases)', () => {
	const src = fs.readFileSync(path.join(__dirname, '../../js/qa-review-statuscard.js'), 'utf8');
	assert.doesNotMatch(src, /#watch-cases/);
	const collapsed = fs.readFileSync(path.join(__dirname, '../../js/qa-review-collapsed-report.js'), 'utf8');
	assert.match(collapsed, /#watch-cases/);
	assert.match(collapsed, /group === 'cases'/);
});