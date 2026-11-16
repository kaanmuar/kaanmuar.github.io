const test = require('node:test');
const assert = require('node:assert/strict');
const { auditCarouselSlides } = require('../../scripts/tips-studio/audit-carousel');

test('audit carousels build four slides from a scores tip (#3476)', () => {
	const tip = {
		carousel: true,
		host: '808ball16.com',
		title: ['808ball16.com: 53.', '*The gap: button names.*'],
		body: 'Security held. Accessibility crashed.',
		action: 'Add aria-label text to icon-only buttons.',
		fixLines: ['<button class="nav"><svg></svg></button>', '<button aria-label="Search"><svg></svg></button>'],
		visual: {
			type: 'scores',
			overall: 53,
			areas: [
				['SEO', 53],
				['GEO', 67],
				['Analytics', 47],
				['Security', 77],
				['A11y', 14],
				['Speed', 55],
			],
			note: '808ball16.com · 9 pages analyzed',
		},
	};
	const slides = auditCarouselSlides(tip);
	assert.equal(slides.length, 4);
	assert.equal(slides[0].counter, '1 / 4');
	assert.equal(slides[1].visual.type, 'scores');
	assert.match(slides[1].title[1], /A11y at 14/);
	assert.equal(slides[2].visual.type, 'code');
	assert.deepEqual(slides[2].visual.lines[0], tip.fixLines[0]);
	assert.equal(slides[3].visual.type, 'stat');
	assert.equal(slides[3].visual.value, '53');
});

test('rivals and tips without carousel stay null', () => {
	assert.equal(auditCarouselSlides({ visual: { type: 'scores', overall: 80, areas: [] } }), null);
	assert.equal(auditCarouselSlides({ carousel: true, visual: { type: 'matrix' } }), null);
});
