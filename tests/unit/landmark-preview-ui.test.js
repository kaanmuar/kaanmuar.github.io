const test = require('node:test');
const assert = require('node:assert/strict');
const LandmarkAnnounce = require('../../js/landmark-announce.js');
const { isEnabled, flagFromSearch, STORAGE_KEY, PANEL_ID, render } = require('../../js/landmark-preview-ui.js');

function memStorage(seed) {
	const map = new Map(Object.entries(seed || {}));
	return {
		getItem: (k) => (map.has(k) ? map.get(k) : null),
		setItem: (k, v) => map.set(k, String(v)),
		removeItem: (k) => map.delete(k),
		_map: map,
	};
}

// Minimal DOM so render() can mount the panel without a browser.
function fakeDom() {
	const bodyKids = [];
	const headKids = [];
	function el(tag) {
		const attrs = {};
		const kids = [];
		const node = {
			tagName: String(tag).toUpperCase(),
			nodeType: 1,
			attributes: {
				[Symbol.iterator]: function* () {
					for (const [name, value] of Object.entries(attrs)) yield { name, value };
				},
			},
			childNodes: kids,
			style: {},
			className: '',
			id: '',
			textContent: '',
			setAttribute(name, value) {
				attrs[String(name).toLowerCase()] = String(value);
			},
			getAttribute(name) {
				return attrs[String(name).toLowerCase()] || null;
			},
			appendChild(child) {
				kids.push(child);
				child.parentNode = node;
				return child;
			},
			remove() {
				const list = node.parentNode && node.parentNode.childNodes;
				if (!list) return;
				const i = list.indexOf(node);
				if (i >= 0) list.splice(i, 1);
			},
			addEventListener() {},
			querySelector() {
				return null;
			},
		};
		return node;
	}
	const body = el('body');
	body.childNodes = bodyKids;
	body.appendChild = (child) => {
		bodyKids.push(child);
		child.parentNode = body;
		return child;
	};
	const head = el('head');
	head.childNodes = headKids;
	const documentElement = el('html');
	const main = el('main');
	const h1 = el('h1');
	h1.childNodes = [{ nodeType: 3, nodeValue: 'QA Lab' }];
	main.appendChild(h1);
	documentElement.appendChild(main);
	const doc = {
		documentElement,
		body,
		head,
		getElementById(id) {
			return bodyKids.find((n) => n.id === id) || null;
		},
		createElement: el,
		querySelector() {
			return null;
		},
		readyState: 'complete',
		addEventListener() {},
	};
	return doc;
}

test('flagFromSearch accepts 1/true/on and 0/false/off', () => {
	assert.equal(flagFromSearch('?landmarks=1'), 'on');
	assert.equal(flagFromSearch('?landmarks=true'), 'on');
	assert.equal(flagFromSearch('?landmarks=on'), 'on');
	assert.equal(flagFromSearch('?landmarks=0'), 'off');
	assert.equal(flagFromSearch('?landmarks=off'), 'off');
	assert.equal(flagFromSearch(''), '');
	assert.equal(flagFromSearch('?other=1'), '');
});

test('isEnabled turns on from query and persists to storage', () => {
	const storage = memStorage();
	assert.equal(isEnabled({ search: '?landmarks=1', storage }), true);
	assert.equal(storage.getItem(STORAGE_KEY), '1');
});

test('isEnabled turns off from query and clears storage', () => {
	const storage = memStorage({ [STORAGE_KEY]: '1' });
	assert.equal(isEnabled({ search: '?landmarks=0', storage }), false);
	assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('isEnabled falls back to localStorage when query is absent', () => {
	assert.equal(isEnabled({ search: '', storage: memStorage({ [STORAGE_KEY]: '1' }) }), true);
	assert.equal(isEnabled({ search: '', storage: memStorage() }), false);
	assert.equal(isEnabled({ search: '', storage: null }), false);
});

test('render mounts a hidden panel with spoken lines from LandmarkAnnounce', () => {
	const prevDoc = globalThis.document;
	const doc = fakeDom();
	globalThis.document = doc;
	try {
		const panel = render(LandmarkAnnounce);
		assert.ok(panel);
		assert.equal(panel.id, PANEL_ID);
		assert.equal(panel.getAttribute('aria-hidden'), 'true');
		assert.equal(doc.body.childNodes.includes(panel), true);
		const text = JSON.stringify(panel.childNodes.map((n) => n.className || n.tagName));
		assert.match(text, /landmark-preview__lines|landmark-preview__empty/);
		const lines = panel.childNodes.find((n) => n.className === 'landmark-preview__lines');
		assert.ok(lines);
		assert.ok(lines.childNodes.some((li) => String(li.textContent).includes('main landmark')));
		assert.ok(lines.childNodes.some((li) => String(li.textContent).includes('heading level 1, QA Lab')));
	} finally {
		globalThis.document = prevDoc;
	}
});
