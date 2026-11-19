const test = require('node:test');
const assert = require('node:assert/strict');
const booking = require('../../functions/booking.js');
const bookingMail = require('../../functions/booking-mail.js');

// Monday 2026-11-02, 08:00 in Bogota.
const NOW = Date.parse('2026-11-02T13:00:00Z');

function made(type, extra) {
	const start = booking.freeSlots([], { type, now: NOW })[0];
	const read = booking.readBooking(
		Object.assign({ type, start, name: 'Ana López', email: 'ana@example.com', lang: 'en' }, extra),
		NOW
	);
	assert.ok(read.ok, JSON.stringify(read));
	return read.value;
}
const MEET = { meet: 'https://meet.google.com/abc-defg-hij', icalUid: 'u1@google.com', id: 'b1' };

test('the call type picks the look of the site it belongs to', () => {
	assert.equal(bookingMail.lookOf('intro'), 'review');
	assert.equal(bookingMail.lookOf('walkthrough'), 'review');
	assert.equal(bookingMail.lookOf('cv'), 'cv');
	assert.equal(bookingMail.lookOf('call'), 'general');
});

test('the three looks are three different mails', () => {
	const review = bookingMail.build('confirm', made('walkthrough'), MEET).html;
	const cv = bookingMail.build('confirm', made('cv'), MEET).html;
	const general = bookingMail.build('confirm', made('call'), MEET).html;
	assert.match(review, /qa-review-logo\.png/, 'URL Review wears the Fusion mark');
	assert.match(review, /QA-lab URL Review/);
	assert.doesNotMatch(cv, /qa-review-logo\.png/);
	assert.match(cv, /#0a5258/, 'CV is the teal band');
	assert.match(general, /#12181f/, 'general is the ink band');
	assert.notEqual(cv, general);
});

test('a review call goes out from the language face, the others from the default sender', () => {
	const review = bookingMail.message('confirm', made('intro', { lang: 'es' }), MEET, 'default@x.com');
	assert.equal(review.from.email, 'qaurlreview@carlosandmunoz.com');
	assert.equal(review.replyTo, 'qaurlreview@carlosandmunoz.com');
	const cv = bookingMail.message('confirm', made('cv'), MEET, 'default@x.com');
	assert.equal(cv.from, 'default@x.com');
	assert.equal(cv.replyTo, 'qa@carlosandmunoz.com');
	assert.deepEqual(cv.to, { email: 'ana@example.com', name: 'Ana López' });
});

test('the confirmation carries the Meet link, calendar buttons, prep and an .ics', () => {
	const msg = bookingMail.message(
		'confirm',
		made('walkthrough', { report: 'abc', host: 'example.com' }),
		MEET,
		'd@x.com'
	);
	assert.match(msg.subject, /^Booked: URL Review report walkthrough, /);
	assert.match(msg.html, /meet\.google\.com\/abc-defg-hij/);
	assert.match(msg.html, /calendar\.google\.com\/calendar\/render/);
	assert.match(msg.html, /outlook\.live\.com\/calendar/);
	assert.match(msg.html, /qa-review\.html\?report=abc/);
	assert.match(msg.text, /Join with Google Meet: https:\/\/meet\.google\.com/);
	assert.equal(msg.attachments.length, 1);
	assert.equal(msg.attachments[0].filename, 'call-with-carlos.ics');
	const file = Buffer.from(msg.attachments[0].content, 'base64').toString('utf8');
	assert.match(file, /^BEGIN:VCALENDAR\r\n/);
	assert.match(file, /UID:u1@google\.com\r\n/, "the event's own UID, so importing it does not duplicate");
	assert.match(file, /METHOD:PUBLISH/);
	assert.match(file, /DTSTART:20261102T170000Z/);
	file.split('\r\n').forEach((line) => assert.ok(Buffer.byteLength(line) <= 75, 'folded: ' + line));
});

test("the visitor reads their own time first, then Carlos's", () => {
	const b = made('cv', { tz: 'Europe/Berlin' });
	const mail = bookingMail.build('confirm', b, MEET);
	assert.match(mail.text, /\(Europe\/Berlin\)/);
	assert.match(mail.text, /Carlos's time \(Colombia\)/);
	assert.equal(bookingMail.safeZone('Not/AZone'), '');
	assert.equal(bookingMail.safeZone('<script>'), '');
	assert.equal(made('cv', { tz: 'nope' }).tz, '');
});

test('reminders have no calendar buttons and no .ics', () => {
	const b = made('cv');
	const msg = bookingMail.message('1h', b, MEET, 'd@x.com');
	assert.match(msg.subject, /^Starting soon: /);
	assert.equal(msg.attachments, undefined);
	assert.doesNotMatch(msg.html, /calendar\.google\.com/);
	assert.match(bookingMail.message('24h', b, MEET, 'd@x.com').subject, /^Coming up: /);
});

test('every language has every key, and the prep for every call type', () => {
	const keys = (o) => Object.keys(o).sort();
	for (const lang of booking.LANGS) {
		assert.deepEqual(keys(bookingMail.COPY[lang]), keys(bookingMail.COPY.en), lang);
		assert.deepEqual(keys(bookingMail.COPY[lang].prep), keys(booking.TYPES), lang + ' prep');
		if (lang !== 'en')
			assert.notEqual(bookingMail.COPY[lang].title, bookingMail.COPY.en.title, lang + ' is translated');
		for (const type of Object.keys(booking.TYPES)) {
			const msg = bookingMail.message('confirm', made(type, { lang }), MEET, 'd@x.com');
			assert.doesNotMatch(msg.html + msg.text, /\{\w+\}|undefined/, lang + ' ' + type + ' has an unfilled field');
		}
	}
});

test('the event description is HTML in the visitor language, with the visitor text escaped', () => {
	const b = made('cv', { lang: 'de', note: 'Hallo <script>x</script>', company: 'A&B' });
	const event = booking.eventBody(b, 'id1');
	assert.match(event.description, /^<b>Gespräch über eine Stelle<\/b>/);
	assert.match(event.description, /Hallo &lt;script&gt;x&lt;\/script&gt;/);
	assert.match(event.description, /A&amp;B/);
	assert.equal(event.description.toLowerCase().includes('<script'), false);
	assert.equal(event.colorId, bookingMail.LOOKS.cv.colorId);
	assert.equal(event.guestsCanSeeOtherGuests, false);
	assert.ok(event.description.length < 7000);
	assert.equal(booking.eventBody(made('walkthrough'), 'i').colorId, bookingMail.LOOKS.review.colorId);
	assert.notEqual(bookingMail.LOOKS.cv.colorId, bookingMail.LOOKS.general.colorId);
});

test('reminders go once: 24 hours ahead for an early booking, and 1 hour ahead', () => {
	const H = 3600000;
	const start = NOW + 30 * H;
	const row = (extra) =>
		Object.assign(
			{
				id: 'r',
				status: 'booked',
				type: 'cv',
				email: 'a@b.co',
				start: new Date(start).toISOString(),
				createdAt: new Date(NOW - 48 * H).toISOString(),
			},
			extra
		);
	const due = (rows, now) => bookingMail.remindersDue(rows, now).map((d) => d.kind);
	assert.deepEqual(due([row()], start - 25 * H), [], 'not yet');
	assert.deepEqual(due([row()], start - 23 * H), ['24h']);
	assert.deepEqual(due([row({ remind24: 'x' })], start - 23 * H), [], 'once');
	assert.deepEqual(due([row({ remind24: 'x' })], start - 0.5 * H), ['1h']);
	assert.deepEqual(due([row({ remind24: 'x', remind1: 'x' })], start - 0.5 * H), []);
	assert.deepEqual(due([row({ status: 'cancelled' })], start - 0.5 * H), []);
	assert.deepEqual(due([row()], start + H), [], 'a past call');
	const late = row({ createdAt: new Date(start - 6 * H).toISOString() });
	assert.deepEqual(due([late], start - 5 * H), [], 'booked for tomorrow gets the 1-hour note alone');
	assert.deepEqual(due([late], start - 0.5 * H), ['1h']);
});

test('the lead never says "with Carlos" twice for the general call', () => {
	for (const lang of booking.LANGS) {
		const msg = bookingMail.build('confirm', made('call', { lang }), MEET);
		assert.doesNotMatch(msg.text, /Carlos\W+(with|con|com|mit|avec)\W+Carlos/i, lang);
	}
});
