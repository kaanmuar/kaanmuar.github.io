const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const PAGES = ['qa-review.html', 'qa-review-de.html', 'qa-review-es.html', 'qa-review-fr.html', 'qa-review-it.html', 'qa-review-pt.html'];
const face = (id, theme = '') => path.join(root, 'assets/faces/badge', `${id}${theme}.svg`);

test('every report heading names a face that exists in both themes, the same in all six pages', () => {
	const lists = PAGES.map((p) => [...fs.readFileSync(path.join(root, p), 'utf8').matchAll(/<h2 data-face="([a-z0-9-]+)"/g)].map((m) => m[1]));
	assert.ok(lists[0].length >= 20, 'English page tags its report headings');
	for (const [i, list] of lists.entries()) assert.deepEqual(list, lists[0], `${PAGES[i]} tags the same headings`);
	for (const id of new Set(lists[0])) {
		assert.ok(fs.existsSync(face(id)), `${id}.svg`);
		assert.ok(fs.existsSync(face(id, '-light')), `${id}-light.svg`);
	}
});

test('each finding area has a face', () => {
	const js = fs.readFileSync(path.join(root, 'js/qa-review.js'), 'utf8');
	const map = js.match(/const FACE_AREA = (\{[^}]+\})/)[1];
	const ids = [...map.matchAll(/: '([a-z0-9-]+)'/g)].map((m) => m[1]);
	assert.equal(ids.length, 6);
	for (const id of ids) assert.ok(fs.existsSync(face(id)), `${id}.svg`);
});

test('shipped faces are self-contained: no scripts, no outside references, reduced motion stops them', () => {
	const dir = path.join(root, 'assets/faces/badge');
	for (const f of fs.readdirSync(dir)) {
		const svg = fs.readFileSync(path.join(dir, f), 'utf8');
		assert.doesNotMatch(svg, /<script|href="http|url\(http/i, f);
		assert.match(svg, /prefers-reduced-motion:reduce/, f);
	}
});

test('every comparison section that wears a face names one that exists in both themes', () => {
	const js = fs.readFileSync(path.join(root, 'js/qa-review-multi.js'), 'utf8');
	const map = js.match(/const SECTION_FACE = (\{[^}]+\})/)[1];
	const ids = [...map.matchAll(/: "([a-z0-9-]+)"/g)].map((m) => m[1]);
	assert.ok(ids.length >= 15, 'the comparison report tags its sections');
	for (const id of new Set(ids)) {
		assert.ok(fs.existsSync(face(id)), `${id}.svg`);
		assert.ok(fs.existsSync(face(id, '-light')), `${id}-light.svg`);
	}
});
