const test = require('node:test');
const assert = require('node:assert/strict');
const accounts = require('../../functions/url-review-test-accounts.js');

test('test accounts and their aliases are not real users', () => {
  for (const email of [
    'kaanmuar@gmail.com',
    'Kaanmuar@Gmail.com',
    'kaanmuar+qa@gmail.com',
    'k.a.a.n.m.u.a.r@gmail.com',
    'kaanmuar@googlemail.com',
    'ana@gmail.com',
    'a.n.a+review@gmail.com',
    'bob@gmail.com',
    'ana@example.com',
    'playwright@example.com',
    'qa@carlosandmunoz.com',
    'canary@carlosandmunoz.com',
    'carlos@qalabreview.com',
    'qalaburlreview@carlosandmunoz.com',
    'x@mail.qa-lab.co',
  ]) assert.equal(accounts.isTestAccount(email), true, email);
});

test('real users are sent mail', () => {
  for (const email of ['maria@shop.com', 'ana@acme.co', 'carlos.munoz@empresa.com.co', 'someone@gmail.com', 'kaanmuar2@gmail.com']) {
    assert.equal(accounts.isTestAccount(email), false, email);
  }
});

test('an empty address is not a test account; the send is refused elsewhere', () => {
  assert.equal(accounts.isTestAccount(''), false);
  assert.equal(accounts.isTestAccount(undefined), false);
});

test('a sandbox run is a test record even with a real address', () => {
  assert.equal(accounts.isTestRecord({ email: 'maria@shop.com', test: true }), true);
  assert.equal(accounts.isTestRecord({ email: 'maria@shop.com' }), false);
  assert.equal(accounts.isTestRecord({ email: 'ana@gmail.com' }), true);
  assert.equal(accounts.isTestRecord(null), false);
});

test('normal reads one key per mailbox', () => {
  assert.equal(accounts.normal('K.A.A.N.M.U.A.R+x@GoogleMail.com'), 'kaanmuar@gmail.com');
  assert.equal(accounts.normal('ana+x@acme.co'), 'ana@acme.co');
});

test('review mail skips a test address, but the payment receipt and pass renewal still go out (#3799)', () => {
	for (const category of ['url-review-report', 'url-review-promise', 'url-review-owner-notice', 'url-review-rerun-past', 'url-review-csat-remind'])
		assert.equal(accounts.skipsMail('kaanmuar+qa@gmail.com', category), true, category);
	for (const category of accounts.PAYMENT_MAIL) assert.equal(accounts.skipsMail('kaanmuar@gmail.com', category), false, category);
	assert.equal(accounts.skipsMail('maria@shop.com', 'url-review-report'), false);
});
