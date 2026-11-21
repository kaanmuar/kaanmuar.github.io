const test = require('node:test');
const assert = require('node:assert/strict');
const { announce, fromElement, preview, speak } = require('../../js/landmark-announce.js');

// Tiny tree builder: n('nav', { 'aria-label': 'Main' }, [children]) ; strings become own text.
function n(tag, attrs = {}, kids = []) {
	const children = kids.filter((k) => typeof k !== 'string');
	const text = kids.filter((k) => typeof k === 'string').join(' ');
	return { tag, attrs, text, children };
}

const page = () =>
	n('html', {}, [
		n('body', {}, [
			n('header', {}, [n('h1', {}, ['QA Lab']), n('nav', { 'aria-label': 'Main menu' }, [n('a', { href: '/a' }, ['A']), n('a', { href: '/b' }, ['B']), n('a', {}, ['no href'])])]),
			n('main', {}, [n('h2', {}, ['Run']), n('form', { 'aria-labelledby': 'f' }, [n('h3', { id: 'f' }, ['Review a URL']), n('input', { type: 'url' }), n('input', { type: 'hidden' }), n('button', {}, ['Go'])])]),
			n('footer', {}, [n('a', { href: '/legal' }, ['Legal'])]),
		]),
	]);

test('announces landmarks in document order with counts and the spoken title', () => {
	const r = announce(page());
	assert.deepEqual(
		r.landmarks.map((l) => [l.role, l.name, l.depth]),
		[
			['banner', '', 0],
			['navigation', 'Main menu', 1],
			['main', '', 0],
			['form', 'Review a URL', 1],
			['contentinfo', '', 0],
		],
	);
	assert.deepEqual(r.lines, [
		'banner landmark, 1 heading',
		'Main menu, navigation landmark, 2 links',
		'main landmark, 1 heading',
		'Review a URL, form landmark, 1 heading, 2 form controls',
		'contentinfo landmark, 1 link',
		'heading level 1, QA Lab',
	]);
	assert.equal(r.headline, 'QA Lab');
	assert.deepEqual(r.warnings, []);
});

test('form and section are landmarks only with an accessible name', () => {
	const r = announce(n('body', {}, [n('main', {}, [n('h1', {}, ['T']), n('form', {}, []), n('section', {}, []), n('section', { 'aria-label': 'Pricing' }, []), n('form', { title: 'Search box' }, [])])]));
	assert.deepEqual(r.landmarks.map((l) => l.speech), ['main landmark, 1 heading', 'Pricing, region landmark', 'Search box, form landmark']);
});

test('header and footer inside sectioning content are not banner or contentinfo', () => {
	const r = announce(n('body', {}, [n('main', {}, [n('h1', {}, ['T']), n('article', {}, [n('header', {}, []), n('footer', {}, [])])])]));
	assert.deepEqual(r.landmarks.map((l) => l.role), ['main']);
});

test('explicit role wins over the tag, and non-landmark roles are ignored', () => {
	const r = announce(n('body', {}, [n('div', { role: 'search' }, [n('input', { type: 'search' })]), n('div', { role: 'button' }, []), n('div', { role: 'banner' }, []), n('h1', {}, ['T'])]));
	assert.deepEqual(r.landmarks.map((l) => l.role), ['search', 'banner']);
	assert.equal(r.landmarks[0].summary, '1 form control');
});

test('hidden and aria-hidden branches, and script text, are not announced or counted', () => {
	const r = announce(
		n('body', {}, [
			n('nav', { hidden: '' }, []),
			n('nav', { 'aria-hidden': 'true' }, []),
			n('main', {}, [n('a', { href: '/x', hidden: '' }, ['x']), n('script', {}, ['var a']), n('h1', {}, ['Title', n('span', { 'aria-hidden': 'true' }, ['secret'])])]),
		]),
	);
	assert.deepEqual(r.landmarks.map((l) => l.speech), ['main landmark, 1 heading']);
	assert.equal(r.headline, 'Title');
});

test('aria-labelledby beats aria-label, and a missing target falls back to aria-label', () => {
	const tree = n('body', {}, [n('span', { id: 'x' }, ['From id']), n('nav', { 'aria-labelledby': 'x', 'aria-label': 'Ignored' }, []), n('nav', { 'aria-labelledby': 'nope', 'aria-label': 'Fallback' }, []), n('main', {}, []), n('h1', {}, ['T'])]);
	assert.deepEqual(announce(tree).landmarks.slice(0, 2).map((l) => l.name), ['From id', 'Fallback']);
});

test('warnings: no main, several mains, no h1, unnamed duplicate navigation', () => {
	const none = announce(n('body', {}, [n('nav', {}, []), n('nav', {}, [])]));
	assert.deepEqual(none.warnings.map((w) => w.id), ['no-main', 'no-h1', 'unnamed-duplicate-navigation']);
	const two = announce(n('body', {}, [n('main', {}, []), n('div', { role: 'main' }, []), n('h1', {}, ['T']), n('nav', { 'aria-label': 'A' }, []), n('nav', { 'aria-label': 'B' }, [])]));
	assert.deepEqual(two.warnings.map((w) => w.id), ['multiple-main']);
});

test('heading roles: role=heading uses aria-level, presentation headings are skipped', () => {
	const r = announce(n('body', {}, [n('main', {}, [n('div', { role: 'heading', 'aria-level': '1' }, ['Spoken']), n('h2', { role: 'presentation' }, ['x']), n('h2', {}, ['y'])])]));
	assert.equal(r.headline, 'Spoken');
	assert.equal(r.landmarks[0].summary, '2 headings');
});

test('fromElement and preview read a DOM-like element', () => {
	const text = (v) => ({ nodeType: 3, nodeValue: v });
	const el = (tagName, attrs, kids) => ({ nodeType: 1, tagName, attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })), childNodes: kids });
	const doc = { documentElement: el('HTML', {}, [el('BODY', {}, [el('NAV', { 'ARIA-LABEL': 'Top' }, [el('A', { href: '/' }, [text(' Home ')])]), el('MAIN', {}, [el('H1', {}, [text('  Hi   there ')])])])]) };
	assert.equal(fromElement(doc.documentElement).children[0].children[0].attrs['aria-label'], 'Top');
	assert.deepEqual(preview(doc), ['Top, navigation landmark, 1 link', 'main landmark, 1 heading', 'heading level 1, Hi there']);
});

test('speak returns the lines and sends them to a supplied synthesizer', () => {
	const said = [];
	globalThis.SpeechSynthesisUtterance = function (t) { this.text = t; };
	try {
		const doc = { documentElement: { nodeType: 1, tagName: 'MAIN', attributes: [], childNodes: [] } };
		const lines = speak(doc, { cancel() { said.push('cancel'); }, speak(u) { said.push(u.text); } });
		assert.deepEqual(lines, ['main landmark']);
		assert.deepEqual(said, ['cancel', 'main landmark']);
	} finally {
		delete globalThis.SpeechSynthesisUtterance;
	}
});
