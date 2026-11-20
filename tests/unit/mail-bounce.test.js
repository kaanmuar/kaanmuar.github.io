const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, label } = require('../../functions/mail-bounce');
const inbound = require('../../functions/mail-inbound');

// Fixtures are made up (example.* addresses, documentation IPs); no real mail.
const dsn = (fields, extraHeaders) =>
	[
		'From: MAILER-DAEMON@mx.example.net',
		'To: qa@example.org',
		'Subject: Undelivered Mail Returned to Sender',
		'Auto-Submitted: auto-replied',
		'Content-Type: multipart/report; report-type=delivery-status; boundary="b1"',
		extraHeaders || '',
		'',
		'--b1',
		'Content-Type: text/plain',
		'',
		'This is the mail system. Your message could not be delivered.',
		'--b1',
		'Content-Type: message/delivery-status',
		'',
		'Reporting-MTA: dns; mx.example.net',
		'',
		fields.join('\n'),
		'--b1--',
		'',
	].join('\r\n');

test('hard bounce: 5.1.1 unknown user, with the failed recipient', () => {
	const r = classify(
		dsn([
			'Final-Recipient: rfc822; Gone.Person@Example.com',
			'Action: failed',
			'Status: 5.1.1',
			'Diagnostic-Code: smtp; 550 5.1.1 <gone.person@example.com> User unknown',
		])
	);
	assert.deepEqual(r, { kind: 'hard', status: '5.1.1', recipient: 'gone.person@example.com' });
	assert.equal(label(r), 'hard 5.1.1');
});

test('soft bounce: delayed, 4.x.x, and mailbox full 5.2.2', () => {
	assert.deepEqual(
		classify(dsn(['Final-Recipient: rfc822; a@example.com', 'Action: delayed', 'Status: 4.4.1'])),
		{ kind: 'soft', status: '4.4.1', recipient: 'a@example.com' }
	);
	assert.deepEqual(
		classify(dsn(['Final-Recipient: rfc822; b@example.com', 'Action: failed', 'Status: 5.2.2'])),
		{ kind: 'soft', status: '5.2.2', recipient: 'b@example.com' }
	);
});

test('status from the diagnostic text when the Status field is missing', () => {
	const r = classify(
		dsn(['Final-Recipient: rfc822; c@example.com', 'Action: failed', 'Diagnostic-Code: smtp; 554 5.7.1 Rejected'])
	);
	assert.equal(r.kind, 'hard');
	assert.equal(r.status, '5.7.1');
	const plain = classify(dsn(['Final-Recipient: rfc822; d@example.com', 'Action: failed', 'Diagnostic-Code: smtp; 452 mailbox busy']));
	assert.deepEqual([plain.kind, plain.status], ['soft', '4.0.0']);
});

test('a dotted IP address is not a status code', () => {
	const r = classify(
		dsn(['Final-Recipient: rfc822; e@example.com', 'Action: failed', 'Diagnostic-Code: smtp; 550 host 5.1.1.1 refused'])
	);
	assert.equal(r.status, '5.0.0');
});

test('successful DSN is none', () => {
	assert.equal(classify(dsn(['Final-Recipient: rfc822; f@example.com', 'Action: delivered', 'Status: 2.0.0'])).kind, 'none');
});

test('parsed message shape (headers object, array values) and X-Failed-Recipients', () => {
	const r = classify({
		from: { name: 'Mail Delivery Subsystem', email: 'mailer-daemon@googlemail.com' },
		subject: 'Delivery Status Notification (Failure)',
		headers: { 'X-Failed-Recipients': ['Nobody@Example.com'], 'Auto-Submitted': ['auto-replied'] },
		text: '** Address not found **\r\n550 5.1.1 The email account that you tried to reach does not exist.',
	});
	assert.deepEqual(r, { kind: 'hard', status: '5.1.1', recipient: 'nobody@example.com' });
});

test('bounce subject with no codes at all is soft (not proof of a permanent failure)', () => {
	const r = classify({ from: 'postmaster@example.net', subject: 'Undeliverable: hello', text: 'Could not deliver.' });
	assert.deepEqual(r, { kind: 'soft', status: '', recipient: '' });
});

test('complaint: ARF feedback report', () => {
	const arf = [
		'From: complaints@isp.example.net',
		'Subject: FW: abuse report',
		'Content-Type: multipart/report; report-type=feedback-report; boundary="x"',
		'',
		'--x',
		'Content-Type: message/feedback-report',
		'',
		'Feedback-Type: abuse',
		'User-Agent: Example/1.0',
		'Original-Rcpt-To: <Reader@Example.com>',
		'--x--',
	].join('\n');
	assert.deepEqual(classify(arf), { kind: 'complaint', status: '', recipient: 'reader@example.com' });
});

test('auto-reply: headers and subjects, but not a normal reply', () => {
	assert.equal(classify({ from: 'owner@example.com', subject: 'Re: hi', headers: { 'Auto-Submitted': 'auto-replied' } }).kind, 'auto-reply');
	assert.equal(classify({ from: 'owner@example.com', subject: 'Re: hi', headers: { Precedence: 'auto_reply' } }).kind, 'auto-reply');
	assert.equal(classify({ from: 'owner@example.com', subject: 'Out of office until Monday', text: 'Back soon' }).kind, 'auto-reply');
	assert.equal(classify({ from: 'owner@example.com', subject: 'Respuesta automática: hola' }).kind, 'auto-reply');
	assert.equal(classify({ from: 'owner@example.com', subject: 'Re: hi', headers: { 'Auto-Submitted': 'no' }, text: 'Thanks!' }).kind, 'none');
	assert.equal(label(classify({ from: 'owner@example.com', subject: 'Out of office' })), 'auto-reply');
});

test('ordinary mail and empty input are none; the result has no text', () => {
	assert.deepEqual(classify({ from: 'a@example.com', subject: 'Interested', text: 'How much is it?' }), { kind: 'none', status: '', recipient: '' });
	assert.deepEqual(classify(''), { kind: 'none', status: '', recipient: '' });
	assert.deepEqual(classify(null), { kind: 'none', status: '', recipient: '' });
	assert.equal(label(classify(null)), '');
	const r = classify(dsn(['Final-Recipient: rfc822; g@example.com', 'Action: failed', 'Status: 5.1.1']));
	assert.deepEqual(Object.keys(r).sort(), ['kind', 'recipient', 'status']);
});

test('large input stays fast (no catastrophic regex)', () => {
	const big = 'Final-Recipient: ' + 'a'.repeat(150000) + '\n' + ' '.repeat(40000) + '5.' + '1.'.repeat(5000);
	const t = Date.now();
	classify(big);
	assert.ok(Date.now() - t < 1000);
});

test('inbound.bounceLabel: webhook payload gives a label without text or address', () => {
	const payload = {
		from: { name: null, email: 'MAILER-DAEMON@mx.example.net' },
		subject: 'Mail delivery failed: returning message to sender',
		headers: { 'Auto-Submitted': ['auto-replied'] },
		text: 'Final-Recipient: rfc822; x@example.com\nAction: failed\nStatus: 5.1.1',
		html: '',
	};
	const out = inbound.bounceLabel(payload);
	assert.equal(out, 'hard 5.1.1');
	assert.ok(!out.includes('@'));
	assert.equal(inbound.bounceLabel({ from: { email: 'x@example.com' }, subject: 'Your code', text: '123456' }), '');
	assert.equal(inbound.bounceLabel(null), '');
});
