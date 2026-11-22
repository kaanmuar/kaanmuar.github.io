const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { pdfHtml, slideSrc } = require('../../scripts/studio-pdf');

test('slide src is an absolute file URL so document/ can load carousel/ (#4243)', () => {
	const carousel = path.join('/tmp', 'batch', 'carousel', 'slug-01.jpg');
	const src = slideSrc(carousel);
	assert.match(src, /^file:\/\//);
	assert.equal(src, pathToFileURL(path.resolve(carousel)).href);
	assert.ok(src.includes('/carousel/'));
	const html = pdfHtml([carousel, path.join('/tmp', 'batch', 'carousel', 'slug-02.jpg')]);
	assert.match(html, /file:\/\//);
	// Old bug: basename-only src="slug-01.jpg" relative to document/ HTML.
	assert.doesNotMatch(html, /src="slug-0/);
	assert.doesNotMatch(html, /src="[^"]*basename/);
});

test('pdfHtml lists every slide as its own img (#4243)', () => {
	const slides = [1, 2, 3, 4].map((n) =>
		path.join('/tmp', 'batch', 'carousel', 'host-' + String(n).padStart(2, '0') + '.jpg')
	);
	const html = pdfHtml(slides);
	assert.equal((html.match(/<img /g) || []).length, 4);
	for (const slide of slides) {
		assert.ok(html.includes(pathToFileURL(path.resolve(slide)).href));
	}
});
