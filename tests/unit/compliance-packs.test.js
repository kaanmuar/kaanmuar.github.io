/**
 * Jurisdiction compliance pack metadata shape (#3837).
 *
 *   node --test tests/unit/compliance-packs.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const packs = require('../../js/compliance-packs.js');

const EXPECTED_IDS = ['eu-eaa', 'eu-gdpr', 'eu-ai-act', 'br-lgpd', 'jp-appi'];

test('lists the five EU / BR / JP packs in stable order', () => {
	assert.deepEqual(
		packs.list().map((p) => p.id),
		EXPECTED_IDS
	);
	assert.equal(packs.PACKS.length, 5);
});

test('every pack passes the shape guard', () => {
	const counts = packs.assertAll();
	assert.equal(counts.packs, 5);
	assert.ok(counts.obligations >= 20, counts.obligations + ' obligations');
	packs.list().forEach((p) => assert.equal(packs.assertPackShape(p), true));
});

test('get and forJurisdiction resolve packs', () => {
	assert.equal(packs.get('eu-eaa').short, 'EAA');
	assert.equal(packs.get('missing'), null);
	assert.deepEqual(
		packs.forJurisdiction('eu').map((p) => p.id),
		['eu-eaa', 'eu-gdpr', 'eu-ai-act']
	);
	assert.deepEqual(
		packs.forJurisdiction('BR').map((p) => p.id),
		['br-lgpd']
	);
	assert.deepEqual(
		packs.forJurisdiction('JP').map((p) => p.id),
		['jp-appi']
	);
});

test('obligation ids are unique dotted checklist ids', () => {
	const ids = packs.obligationIds();
	assert.equal(new Set(ids).size, ids.length);
	ids.forEach((id) => assert.match(id, /^(eu|br|jp)\.[a-z0-9.-]+$/i));
	assert.ok(packs.obligationIds('br-lgpd').every((id) => id.startsWith('br.lgpd.')));
});

test('disclaimer and source note stay short and non-advice', () => {
	assert.match(packs.DISCLAIMER, /not legal advice/i);
	assert.match(packs.SOURCE_NOTE, /Playwright-Law-Suite/);
	assert.match(packs.SOURCE_NOTE, /Clean-room/i);
	assert.ok(packs.DISCLAIMER.split(/\s+/).length < 60);
});

test('mount paints packs into a host element', () => {
	const kids = [];
	const host = {
		replaceChildren() {
			kids.length = 0;
		},
		appendChild(node) {
			kids.push(node);
			return node;
		},
	};
	const created = [];
	const doc = {
		createElement(tag) {
			const node = {
				tagName: String(tag).toUpperCase(),
				attrs: {},
				children: [],
				textContent: '',
				setAttribute(name, value) {
					this.attrs[name] = String(value);
				},
				appendChild(child) {
					this.children.push(child);
					return child;
				},
			};
			created.push(node);
			return node;
		},
		createTextNode(text) {
			return { nodeType: 3, textContent: String(text) };
		},
		getElementById() {
			return null;
		},
	};
	const prev = global.document;
	global.document = doc;
	try {
		const out = packs.mount(host);
		assert.equal(out, host);
		assert.ok(kids.length >= 3, 'disclaimer, source, list');
		assert.ok(created.some((n) => n.attrs['data-pack-id'] === 'eu-gdpr'));
		assert.ok(created.some((n) => n.attrs['data-pack-id'] === 'jp-appi'));
	} finally {
		global.document = prev;
	}
});
