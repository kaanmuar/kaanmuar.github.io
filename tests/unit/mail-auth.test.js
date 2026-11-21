'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { classify, label, clauses } = require('../../functions/mail-auth');
const inbound = require('../../functions/mail-inbound');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/mail-auth-results.json'), 'utf8'));

test('improvmx pass: spf, dkim, dmarc and passed domains', () => {
	const r = classify({ headers: FIX.improvmxPass });
	assert.deepEqual(r.spf, { result: 'pass', domain: 'mail.tiktok.com' });
	assert.deepEqual(r.dkim, [{ result: 'pass', domain: 'tiktok.com' }]);
	assert.deepEqual(r.dmarc, { result: 'pass', domain: 'tiktok.com' });
	assert.equal(r.arc, null);
	assert.deepEqual(r.passed.sort(), ['mail.tiktok.com', 'tiktok.com']);
	assert.equal(label(r), 'spf=pass dkim=pass dmarc=pass');
});

test('spf fail with dkim pass', () => {
	const r = classify({ headers: FIX.spfFailDkimPass });
	assert.equal(r.spf.result, 'fail');
	assert.equal(r.dkim[0].result, 'pass');
	assert.deepEqual(r.passed, ['linkedin.com']);
	assert.equal(label(r), 'spf=fail dkim=pass dmarc=fail');
});

test('softfail only', () => {
	const r = classify(FIX.softfailOnly);
	assert.deepEqual(r.spf, { result: 'softfail', domain: 'b.example.org' });
	assert.deepEqual(r.dkim, []);
	assert.equal(label(r), 'spf=softfail');
});

test('ARC-Authentication-Results adds arc=pass without duplicating spf', () => {
	const r = classify({ headers: FIX.arcChain });
	assert.equal(r.spf.result, 'pass');
	assert.equal(r.arc.result, 'pass');
	assert.deepEqual(r.passed, ['accounts.google.com']);
	assert.match(label(r), /arc=pass/);
});

test('raw folded header block', () => {
	const block = [
		'From: noreply@github.com',
		'Authentication-Results: mx1.improvmx.com;',
		'\tspf=pass smtp.mailfrom=noreply@github.com;',
		'\tdkim=pass header.d=github.com',
		'',
		'body ignored',
	].join('\r\n');
	const r = classify(block);
	assert.equal(r.spf.domain, 'github.com');
	assert.equal(r.dkim[0].domain, 'github.com');
	assert.equal(label(r), 'spf=pass dkim=pass');
});

test('empty is blank; noise still finds real methods and skips bad results', () => {
	assert.equal(label(classify(FIX.empty)), '');
	const noise = classify({ headers: FIX.noise });
	assert.deepEqual(noise.spf, { result: 'pass', domain: 'y.z' });
	assert.deepEqual(noise.dkim, []); // dkim=weird is not a result word
	assert.equal(label(noise), 'spf=pass');
});

test('clauses skip unknown methods and keep known ones', () => {
	const got = clauses('mx; spf=pass smtp.mailfrom=a@b.co; foo=pass; dkim=fail header.d=b.co');
	assert.deepEqual(
		got.map((c) => c.method + '=' + c.result),
		['spf=pass', 'dkim=fail']
	);
});

test('mail-inbound.authLabel surfaces the same string; trusted path unchanged', () => {
	assert.equal(inbound.authLabel({ headers: FIX.improvmxPass }), 'spf=pass dkim=pass dmarc=pass');
	assert.equal(inbound.authLabel({ headers: FIX.empty }), '');
	const mail = inbound.read(
		{
			headers: FIX.improvmxPass,
			to: [{ email: 'tiktok@carlosandmunoz.com' }],
			from: { email: 'no-reply@account.tiktok.com' },
			subject: 'Your code',
			text: 'Code: 123987',
			'message-id': '<auth-test@example>',
			timestamp: 1824000000,
		},
		'tiktok'
	);
	const row = inbound.codeOf(mail);
	assert.equal(row.trusted, true);
	assert.equal(row.code, '123987');
});

test('linear time on long Authentication-Results noise', () => {
	const junk = ('x=y; '.repeat(2000) + 'spf=pass smtp.mailfrom=a@b.example;').repeat(2);
	const t0 = Date.now();
	const r = classify({ headers: { 'Authentication-Results': junk } });
	assert.ok(Date.now() - t0 < 500, 'classify took too long');
	assert.equal(r.spf && r.spf.result, 'pass');
});

test('wiring: mailInbound logs and answers with the auth label, and mail-auth stays dependency-free', () => {
	const index = fs.readFileSync(path.join(__dirname, '../../functions/index.js'), 'utf8');
	assert.match(index, /mailInbound\.authLabel\(req\.body\)/);
	assert.match(index, /named \? 'no code, ' \+ named : 'no code'/);
	const src = fs.readFileSync(path.join(__dirname, '../../functions/mail-auth.js'), 'utf8');
	assert.deepEqual(src.match(/require\([^)]*\)/g) || [], []);
});
