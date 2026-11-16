const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const booking = require("../../functions/booking.js");
const customerMail = require("../../functions/url-review-customer-mail.js");
const ownerMail = require("../../functions/url-review-owner-mail.js");

// Monday 2026-11-02, 08:00 in Bogota.
const MONDAY_8AM = Date.parse("2026-11-02T13:00:00Z");

test("free slots are weekdays inside the Bogota day, past the notice", () => {
  const slots = booking.freeSlots([], { type: "intro", now: MONDAY_8AM });
  assert.ok(slots.length > 100);
  assert.equal(slots[0], "2026-11-02T17:00:00.000Z", "four hours of notice from 08:00 Bogota");
  for (const iso of slots) {
    const local = new Date(Date.parse(iso) - 5 * 3600 * 1000);
    assert.ok(local.getUTCDay() >= 1 && local.getUTCDay() <= 5, iso + " is a weekday");
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    assert.ok(minutes >= booking.DAY_START_MIN && minutes + 15 <= booking.DAY_END_MIN, iso + " is inside the day");
  }
});

test("busy time and its buffer block a slot", () => {
  const busy = [{ start: "2026-11-02T20:00:00Z", end: "2026-11-02T21:00:00Z" }];
  const slots = booking.freeSlots(busy, { type: "walkthrough", now: MONDAY_8AM });
  assert.ok(!slots.includes("2026-11-02T19:30:00.000Z"), "ends inside the buffer");
  assert.ok(!slots.includes("2026-11-02T20:30:00.000Z"));
  assert.ok(!slots.includes("2026-11-02T21:00:00.000Z"), "starts inside the buffer");
  assert.ok(slots.includes("2026-11-02T19:15:00.000Z"));
  assert.ok(slots.includes("2026-11-02T21:15:00.000Z"));
});

test("a booking is checked and cleaned", () => {
  const start = booking.freeSlots([], { type: "cv", now: MONDAY_8AM })[0];
  const ok = booking.readBooking({ type: "cv", start, name: " Ana ", email: "Ana@Example.COM", lang: "es-CO", host: "Shop.example.com/<x>", report: "r1!" }, MONDAY_8AM);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.email, "ana@example.com");
  assert.equal(ok.value.lang, "es");
  assert.equal(ok.value.host, "shop.example.comx");
  assert.equal(ok.value.report, "r1");
  assert.equal(Date.parse(ok.value.end) - Date.parse(ok.value.start), 30 * 60 * 1000);
  assert.equal(booking.readBooking({ type: "cv", start: "2026-11-07T15:00:00Z", name: "Ana", email: "a@b.co" }, MONDAY_8AM).code, "taken");
  assert.equal(booking.readBooking({ type: "nope", start, name: "Ana", email: "a@b.co" }, MONDAY_8AM).ok, false);
  assert.equal(booking.readBooking({ type: "cv", start, name: "Ana", email: "not-mail" }, MONDAY_8AM).ok, false);
});

test("the event asks Google for a Meet link and invites the visitor", () => {
  const start = booking.freeSlots([], { type: "walkthrough", now: MONDAY_8AM })[0];
  const b = booking.readBooking({ type: "walkthrough", start, name: "Ana", email: "ana@example.com", lang: "fr", host: "example.com", report: "abc", note: "Hi" }, MONDAY_8AM).value;
  const event = booking.eventBody(b, "id1");
  assert.equal(event.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.deepEqual(event.attendees, [{ email: "ana@example.com", displayName: "Ana" }]);
  assert.match(event.summary, /^Visite de votre rapport URL Review: Ana/);
  assert.match(event.description, /qa-review-fr\.html\?report=abc/);
  assert.equal(event.start.timeZone, booking.TZ);
});

test("the connect link asks for offline access to the calendar", () => {
  const url = new URL(booking.authUrl("cid", "https://x/callback", "s1"));
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.match(url.searchParams.get("scope"), /calendar\.events/);
  assert.match(url.searchParams.get("scope"), /calendar\.freebusy/);
});

test("book links carry the type, language and a real host only", () => {
  const url = new URL(booking.bookUrl("walkthrough", "de", { host: "example.com", report: "r1", from: "report" }));
  assert.equal(url.pathname, "/book.html");
  assert.equal(url.searchParams.get("lang"), "de");
  assert.equal(url.searchParams.get("host"), "example.com");
  assert.equal(url.searchParams.get("review"), "r1");
  assert.equal(url.searchParams.get("report"), null, "a report= link would read as an access link");
  assert.equal(url.searchParams.get("utm_campaign"), "report");
  assert.equal(new URL(booking.bookUrl("x", "xx", { host: "your site" })).searchParams.get("host"), null);
  assert.equal(new URL(booking.bookUrl("x", "xx")).searchParams.get("type"), "call");
});

test("every client mail carries the call link in its own language", () => {
  for (const lang of customerMail.LANGS) {
    const report = customerMail.reportMail({ id: "r1", host: "example.com", lang }, {});
    assert.match(report.html, /book\.html\?type=walkthrough&amp;lang=/, lang + " report html");
    assert.match(report.text, new RegExp("book\\.html\\?type=walkthrough&lang=" + lang), lang + " report text");
    const receipt = customerMail.receiptMail({ lang, purpose: "report", host: "example.com", reportId: "r1", priceUsd: 9, reference: "R1", paidAt: "2026-11-01T00:00:00Z" });
    assert.match(receipt.text, /utm_campaign=receipt/, lang + " receipt");
    const notice = ownerMail.noticeMail({ lang, host: "example.com", domain: "example.com", source: "dmarc", email: "a@example.com" }, { read: "2026-11-01" }, { claim: "https://c", unlist: "https://u", stop: "https://s", live: "https://l" }, null);
    assert.match(notice.text, /book\.html\?type=intro/, lang + " owner notice");
  }
});

test("the CV reply templates get the button after the reply, never between table cells", () => {
  const sendgrid = require("../../scripts/sendgrid-booking-button.js");
  const inP = sendgrid.withButton("<td><p>Hi</p><p>{{{admin_response}}}</p><p>Bye</p></td>").html;
  assert.equal(inP, "<td><p>Hi</p><p>{{{admin_response}}}</p>" + sendgrid.BUTTON + "<p>Bye</p></td>");
  const inTd = sendgrid.withButton("<tr><td>{{admin_response}}</td><td>x</td></tr>").html;
  assert.equal(inTd, "<tr><td>{{admin_response}}" + sendgrid.BUTTON + "</td><td>x</td></tr>");
  assert.match(sendgrid.withPlain("Hi\n{{admin_response}}\nBye"), /\{\{admin_response\}\}\n\n\{\{#if booking_url\}\}/);
});

test("book.html copy has every key in all six languages", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../js/book.js"), "utf8");
  const body = src.slice(src.indexOf("const COPY = {"), src.indexOf("const params"));
  const COPY = new Function(body + "; return COPY;")();
  const keys = (o) => Object.keys(o).sort();
  for (const lang of booking.LANGS) {
    assert.deepEqual(keys(COPY[lang]), keys(COPY.en), lang);
    assert.deepEqual(keys(COPY[lang].types), keys(booking.TYPES), lang + " types");
    if (lang !== "en") assert.notEqual(COPY[lang].submit, COPY.en.submit, lang + " is translated");
  }
});
