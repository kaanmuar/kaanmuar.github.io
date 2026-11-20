/**
 * Channel-split compare quizzes (#3497).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const split = require('../../scripts/compare-channel-split');

const captions = {
	'01-quiz-a-b': {
		kind: 'quiz',
		answer: '02-a-b',
		title: 'Who wins?',
		linkedin: 'Guess A or B — answer tomorrow.',
		instagram: 'Guess A or B.',
		x: 'Guess?',
		alt: 'quiz',
	},
	'02-a-b': {
		kind: 'compare',
		title: 'A beats B',
		linkedin: 'A scored 82, B 61.',
		instagram: 'A 82 · B 61',
		x: 'A wins.',
		alt: 'reveal',
	},
	'03-tip': { kind: 'tip', title: 'HSTS', linkedin: 'Turn on HSTS.', x: 'HSTS.' },
};

describe('compare channel-split (#3497)', () => {
	it('drops LI/IG/FB quiz-day calendar rows; X slot stays for two-day + shared-slot nets', () => {
		assert.equal(split.keepCalendarRow('x', '01-quiz-a-b', captions), true);
		assert.equal(split.keepCalendarRow('threads', '01-quiz-a-b', captions), true);
		assert.equal(split.keepCalendarRow('telegram', '01-quiz-a-b', captions), true);
		assert.equal(split.keepCalendarRow('linkedin', '01-quiz-a-b', captions), false);
		assert.equal(split.keepCalendarRow('instagram', '01-quiz-a-b', captions), false);
		assert.equal(split.keepCalendarRow('instagram-story', '01-quiz-a-b', captions), false);
		assert.equal(split.keepCalendarRow('facebook', '01-quiz-a-b', captions), false);
	});

	it('skips quiz publish on carousel nets; Threads/Telegram still get the quiz', () => {
		assert.equal(split.skipQuizPublish('mastodon', captions['01-quiz-a-b']), true);
		assert.equal(split.skipQuizPublish('bluesky', captions['01-quiz-a-b']), true);
		assert.equal(split.skipQuizPublish('facebook', captions['01-quiz-a-b']), true);
		assert.equal(split.skipQuizPublish('threads', captions['01-quiz-a-b']), false);
		assert.equal(split.skipQuizPublish('telegram', captions['01-quiz-a-b']), false);
		assert.equal(split.skipQuizPublish('x', captions['01-quiz-a-b']), false);
	});

	it('keeps reveal and non-quiz rows on every channel', () => {
		assert.equal(split.keepCalendarRow('linkedin', '02-a-b', captions), true);
		assert.equal(split.keepCalendarRow('instagram', '02-a-b', captions), true);
		assert.equal(split.keepCalendarRow('linkedin', '03-tip', captions), true);
	});

	it('filters a mixed calendar list', () => {
		const rows = [
			{ channel: 'linkedin', slug: '01-quiz-a-b' },
			{ channel: 'x', slug: '01-quiz-a-b' },
			{ channel: 'linkedin', slug: '02-a-b' },
			{ channel: 'instagram', slug: '01-quiz-a-b' },
		];
		assert.deepEqual(
			split.filterCalendarRows(rows, captions).map((r) => r.channel + ':' + r.slug),
			['x:01-quiz-a-b', 'linkedin:02-a-b']
		);
	});

	it('builds quiz+reveal slide URLs for the reveal slug', () => {
		const pair = split.pairSlides('https://carlosandmunoz.com/media/social-posts/compare-x', '02-a-b', captions);
		assert.equal(pair.length, 2);
		assert.match(pair[0].url, /\/feed\/01-quiz-a-b\.jpg$/);
		assert.match(pair[1].url, /\/feed\/02-a-b\.jpg$/);
		assert.equal(split.usesPairCarousel('linkedin', '02-a-b', captions), true);
		assert.equal(split.usesPairCarousel('facebook', '02-a-b', captions), true);
		assert.equal(split.usesPairCarousel('mastodon', '02-a-b', captions), true);
		assert.equal(split.usesPairCarousel('bluesky', '02-a-b', captions), true);
		assert.equal(split.usesPairCarousel('x', '02-a-b', captions), false);
		assert.equal(split.usesPairCarousel('linkedin', '01-quiz-a-b', captions), false);
	});

	it('merges quiz + reveal copy for LI/IG', () => {
		const text = split.mergedCaption('linkedin', captions['02-a-b'], captions['01-quiz-a-b']);
		assert.match(text, /Guess A or B/);
		assert.match(text, /A scored 82/);
	});
});
