const test = require('node:test');
const assert = require('node:assert/strict');
const fixDiff = require('../../functions/url-review-fix-diff');

test('buildFixPatch emits a unified diff with finding id on the hunk', () => {
	const before = ['server {', '  listen 443;', '  # no HSTS', '}', ''];
	const after = ['server {', '  listen 443;', '  add_header Strict-Transport-Security "max-age=31536000";', '}', ''];
	const patch = fixDiff.buildFixPatch({
		findingId: 'F-sec-hsts',
		path: 'nginx/site.conf',
		before: before.join('\n'),
		after: after.join('\n'),
	});
	assert.match(patch, /^--- a\/nginx\/site\.conf\n\+\+\+ b\/nginx\/site\.conf\n/);
	assert.match(patch, /@@ .* @@ finding F-sec-hsts\n/);
	assert.match(patch, /-  # no HSTS\n/);
	assert.match(patch, /\+  add_header Strict-Transport-Security "max-age=31536000";\n/);
});

test('buildFixPatch is empty aside from headers when before and after match', () => {
	const text = 'same\nlines\n';
	const patch = fixDiff.buildFixPatch({ findingId: 'F-01', path: 'x.txt', before: text, after: text });
	assert.equal(patch, '--- a/x.txt\n+++ b/x.txt\n');
});

test('buildFixPatch treats a nonempty after with empty before as a new file hunk', () => {
	const patch = fixDiff.buildFixPatch({
		findingId: 'F-new',
		path: '/public/_headers',
		before: '',
		after: 'Strict-Transport-Security: max-age=31536000\n',
	});
	assert.match(patch, /^--- a\/public\/_headers\n\+\+\+ b\/public\/_headers\n/);
	assert.match(patch, /\+Strict-Transport-Security: max-age=31536000\n/);
	assert.doesNotMatch(patch, /\n-[^\n]/);
});

test('buildCmsDraftPayload always returns draft and keeps title and bodyHtml', () => {
	const payload = fixDiff.buildCmsDraftPayload({
		title: ' Fix HSTS ',
		bodyHtml: '<p>Add header</p>',
		status: 'publish',
	});
	assert.deepEqual(payload, {
		title: 'Fix HSTS',
		bodyHtml: '<p>Add header</p>',
		status: 'draft',
	});
});

test('buildCmsDraftPayload rejects live status even when omitted', () => {
	const payload = fixDiff.buildCmsDraftPayload({ title: 't', bodyHtml: '' });
	assert.equal(payload.status, 'draft');
});