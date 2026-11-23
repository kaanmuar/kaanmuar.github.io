const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	sentLinkedInDocuments,
	clearSentLinkedIn,
	onNetwork,
	hasDocumentPdf,
} = require('../../scripts/buffer-queue');
const ledger = require('../../scripts/social-ledger');

test('sentLinkedInDocuments lists only sent LinkedIn rows with a local document PDF (#4246)', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buf-sent-doc-'));
	const batch = 'auto-1';
	const doc = path.join(root, 'media/social-posts', batch, 'document');
	fs.mkdirSync(doc, { recursive: true });
	fs.writeFileSync(path.join(doc, '01-a.pdf'), 'x');
	fs.writeFileSync(path.join(doc, '02-b.pdf'), 'x');
	// 03-c has a sent LinkedIn row but no PDF → excluded
	const book = {
		posts: {
			'auto-1/01-a': [
				{
					channel: 'linkedin',
					profile: 'linkedin (qalab)',
					id: 'li1',
					at: '2026-11-17T12:00:00.000Z',
					result: 'sent',
					url: 'https://www.linkedin.com/feed/update/urn:li:1',
				},
				{ channel: 'facebook', profile: 'facebook (x)', id: 'fb1', at: '2026-11-17T12:00:00.000Z', result: 'sent' },
			],
			'auto-1/02-b': [
				{
					channel: 'linkedin',
					profile: 'linkedin (qalab)',
					id: 'li2',
					at: '2026-11-17T11:00:00.000Z',
					result: 'queued',
				},
			],
			'auto-1/03-c': [
				{
					channel: 'linkedin',
					profile: 'linkedin (qalab)',
					id: 'li3',
					at: '2026-11-17T10:00:00.000Z',
					result: 'sent',
				},
			],
		},
	};
	assert.ok(hasDocumentPdf(batch, '01-a', root));
	assert.ok(!hasDocumentPdf(batch, '03-c', root));
	const rows = sentLinkedInDocuments(book, batch, { root, site: 'https://example.test' });
	assert.deepStrictEqual(
		rows.map((r) => [r.post, r.pdfUrl]),
		[['auto-1/01-a', 'https://example.test/media/social-posts/auto-1/document/01-a.pdf']]
	);
	assert.strictEqual(rows[0].url, 'https://www.linkedin.com/feed/update/urn:li:1');
	fs.rmSync(root, { recursive: true, force: true });
});

test('clearSentLinkedIn removes sent LinkedIn rows so onNetwork can queue again (#4246)', () => {
	const book = {
		posts: {
			'auto-1/01-a': [
				{
					channel: 'linkedin',
					profile: 'linkedin (qalab)',
					id: 'li1',
					at: '2026-11-17T12:00:00.000Z',
					result: 'sent',
				},
				{ channel: 'facebook', profile: 'facebook (x)', id: 'fb1', at: '2026-11-17T12:00:00.000Z', result: 'sent' },
			],
			'auto-1/only-li': [
				{
					channel: 'linkedin',
					profile: 'linkedin (qalab)',
					id: 'li2',
					at: '2026-11-17T12:00:00.000Z',
					result: 'sent',
				},
			],
		},
	};
	assert.ok(onNetwork(book, 'auto-1/01-a', 'linkedin'));
	const counts = clearSentLinkedIn(book, ['auto-1/01-a', 'auto-1/only-li', 'auto-1/missing']);
	assert.strictEqual(counts.cleared, 2);
	assert.deepStrictEqual(counts.skip, [['auto-1/missing', 'not in ledger']]);
	assert.ok(!onNetwork(book, 'auto-1/01-a', 'linkedin'));
	assert.ok(onNetwork(book, 'auto-1/01-a', 'facebook'));
	assert.ok(!book.posts['auto-1/only-li']);
});

test('recording queued on the same Buffer id does not replace sent (must clear, not record) (#4246)', () => {
	const book = { version: 1, posts: {} };
	const entry = {
		channel: 'linkedin',
		profile: 'linkedin (qalab)',
		id: 'same-id',
		at: '2026-11-17T12:00:00.000Z',
		result: 'sent',
	};
	ledger.record(book, 'auto-1/01-a', entry);
	ledger.record(book, 'auto-1/01-a', Object.assign({}, entry, { result: 'queued', at: '2026-11-18T12:00:00.000Z' }));
	const rows = book.posts['auto-1/01-a'];
	assert.ok(rows.some((e) => e.result === 'sent'));
	assert.ok(onNetwork(book, 'auto-1/01-a', 'linkedin'));
});
