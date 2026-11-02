// The outreach Action's runner (#1980): which addresses a prospect's own site publishes count.
const test = require("node:test");
const assert = require("node:assert/strict");
const { emailsIn, bare } = require("../../scripts/outreach-weekly");

test("outreach weekly (#1980): only the organisation's own published addresses, minus support, news and free mail", () => {
  const html = `<a href="mailto:comunicaciones@upb.edu.co">Escríbanos</a> decano&#64;upb.edu.co
    soporte@upb.edu.co noreply@upb.edu.co newsletter@upb.edu.co someone@gmail.com partner@otherschool.edu.co
    <img src="logo@2x.png"> mercadeo@medellin.upb.edu.co`;
  assert.deepEqual(emailsIn(html, "www.upb.edu.co").sort(), ["comunicaciones@upb.edu.co", "decano@upb.edu.co", "mercadeo@medellin.upb.edu.co"]);
  assert.deepEqual(emailsIn("hola@webhexup.com info@webhexup.co", "webhexup.com"), ["hola@webhexup.com"]);
});

test("outreach weekly (#1980): hosts compare without scheme, path or www", () => {
  assert.equal(bare("https://www.Henry.co/es/contacto"), "henry.co");
  assert.equal(bare("ironhack.com"), "ironhack.com");
});
