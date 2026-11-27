const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function el(tag) {
	const kids = [];
	const node = {
		tagName: String(tag).toUpperCase(),
		className: '',
		textContent: '',
		style: { setProperty() {} },
		children: kids,
		appendChild(n) {
			kids.push(n);
			return n;
		},
		append(...nodes) {
			nodes.forEach((n) => kids.push(n));
		},
		querySelector() {
			return null;
		},
		querySelectorAll() {
			return [];
		},
		setAttribute() {},
		removeAttribute() {},
		remove() {},
		closest() {
			return heading;
		},
	};
	Object.defineProperty(node, 'innerHTML', {
		set(v) {
			node._html = v;
			if (String(v).includes('<span')) {
				kids.push(el('span'), el('span'));
			}
		},
		get() {
			return node._html || '';
		},
	});
	return node;
}

const heading = {
	textContent: 'Trust & headers',
	classList: { add() {}, remove() {} },
	dataset: {},
};

test('QAReviewStatusCard paints StatusCard chrome on unpaid folds and clears when paid', () => {
	const code = fs.readFileSync(path.join(__dirname, '../../js/qa-review-statuscard.js'), 'utf8');
	const appended = [];
	const panel = {
		querySelectorAll(sel) {
			if (String(sel).includes('finding') || String(sel).includes('severity')) {
				return [
					{
						getAttribute: () => 'high',
						dataset: { severity: 'high' },
						querySelector: () => ({ textContent: 'HSTS missing on apex' }),
					},
					{
						getAttribute: () => 'medium',
						dataset: { severity: 'medium' },
						querySelector: () => ({ textContent: 'CSP report-only' }),
					},
				];
			}
			return [];
		},
		setAttribute() {},
		removeAttribute() {},
	};
	const titleSpan = { appendChild() {}, querySelector() { return null; } };
	const button = {
		querySelectorAll(sel) {
			return appended.filter((n) => String(sel).split(',').some((p) => n.className === p.trim().replace(/^\./, '')));
		},
		querySelector() {
			return titleSpan;
		},
		closest() {
			return heading;
		},
		append(...nodes) {
			appended.push(...nodes);
		},
		setAttribute() {},
	};
	const folds = [{ button, panel, group: 'trust' }];
	const sandbox = {
		document: {
			body: { classList: { toggle() {} } },
			createElement: el,
		},
		window: {},
	};
	sandbox.window = sandbox;
	vm.runInNewContext(code + '\nthis.QAReviewStatusCard = window.QAReviewStatusCard;', sandbox);

	sandbox.QAReviewStatusCard.sync({
		unpaid: true,
		report: { insights: { score: { overall: 74, areas: { Security: 42 } } } },
		folds,
		setFold() {},
	});
	assert.ok(
		appended.some((n) => n.className === 'scard-body'),
		'unpaid paints scard-body'
	);
	assert.ok(appended.some((n) => n.className === 'scard-lines'), 'includes detail lines');

	appended.length = 0;
	sandbox.QAReviewStatusCard.sync({ unpaid: false, folds, report: {} });
	assert.equal(appended.length, 0, 'paid clears StatusCard chrome');
});
