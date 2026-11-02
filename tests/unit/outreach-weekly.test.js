// The outreach Action's runner (#1980): which addresses a prospect's own site publishes count.
const test = require("node:test");
const assert = require("node:assert/strict");
const { emailsIn, bare, slotsFor, foundOn } = require("../../scripts/outreach-weekly");

test("outreach weekly (#1980): only the organisation's own published addresses, minus support, news and free mail", () => {
  const html = `<a href="mailto:comunicaciones@upb.edu.co">Escríbanos</a> decano&#64;upb.edu.co
    soporte@upb.edu.co noreply@upb.edu.co newsletter@upb.edu.co someone@gmail.com partner@otherschool.edu.co
    <img src="logo@2x.png"> mercadeo@medellin.upb.edu.co`;
  assert.deepEqual(emailsIn(html, "www.upb.edu.co").sort(), ["comunicaciones@upb.edu.co", "decano@upb.edu.co", "mercadeo@medellin.upb.edu.co"]);
  assert.deepEqual(emailsIn("hola@webhexup.com info@webhexup.co", "webhexup.com"), ["hola@webhexup.com"]);
  assert.deepEqual(emailsIn("soporteweb@uai.edu.ar support.ti@uai.edu.ar hrodriguez@uai.edu.ar", "uai.edu.ar"), ["hrodriguez@uai.edu.ar"]);
});

test("outreach weekly (#1980): hosts compare without scheme, path or www", () => {
  assert.equal(bare("https://www.Henry.co/es/contacto"), "henry.co");
  assert.equal(bare("ironhack.com"), "ironhack.com");
});

test("outreach weekly (#2014): a segment's gap takes the day's countries in turn, and a re-run tops up only today's rows", () => {
  const day = ["co", "co", "co", "mx", "pe", "cl", "ar", "br", "es", "pt"];
  assert.deepEqual(slotsFor(day, 3), ["co", "co", "co"]);
  assert.equal(slotsFor(day, 30).length, 30);
  assert.equal(slotsFor(day, 30)[10], "co");
  const rows = [{ notes: "prospects run 2026-11-02" }, { notes: "prospects run 2026-11-02" }, { notes: "prospects run 2026-11-03" }, { notes: "Only published address is news@" }];
  assert.equal(foundOn(rows, "2026-11-02"), 2);
  assert.equal(foundOn(rows, "2026-11-04"), 0);
});
