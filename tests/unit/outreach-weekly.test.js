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

test("outreach weekly (#2927): replies are copied by sequence letter; C, D, F, Peers H and unknown campaigns are not", () => {
  const { sequenceOf, forwardTarget } = require("../../scripts/outreach-weekly");
  assert.equal(sequenceOf("W1 A-es Europe"), "A");
  assert.equal(sequenceOf("Peers H-en US"), "H");
  assert.equal(sequenceOf(""), "");
  for (const c of ["W1 A-es Europe", "W2 B-pt Brazil", "W3 G-en US"]) assert.equal(forwardTarget(c), "students@qalabreview.com");
  for (const c of ["W1 E-en UK-IE-PT", "W4 P-es Americas"]) assert.equal(forwardTarget(c), "partners@qalabreview.com");
  for (const c of ["W1 C-en US", "W1 D-pt Brazil", "W1 F-es Americas", "Peers H-fr Europe", "Holiday promo", undefined]) assert.equal(forwardTarget(c), "");
});

test("outreach weekly (#2927): only sorted replies that are not auto-replies, bounces or opt-outs, and never twice", () => {
  const { forwardQueue } = require("../../scripts/outreach-weekly");
  const r = (id, campaign, to = "carlos@qalabreview.com") => ({ id, campaign, to, from: id + "@uni.edu", subject: "Re: hi" });
  const items = [r("a", "W1 A-es Europe"), r("e", "W1 E-en US"), r("c", "W1 C-en US"), r("ooo", "W1 B-es Americas"),
    r("out", "W1 A-en US"), r("new", "W1 A-en US"), r("done", "W1 E-es Europe"), r("noacct", "W1 A-en US", "")];
  const drafts = [{ id: "a", category: "interested" }, { id: "e", category: "question" }, { id: "c", category: "interested" },
    { id: "ooo", category: "out_of_office" }, { id: "out", category: "opt_out" }, { id: "done", category: "not_now" }, { id: "noacct", category: "question" }];
  const queue = forwardQueue(items, drafts, { done: { to: "partners@qalabreview.com" } });
  assert.deepEqual(queue.map((f) => [f.id, f.to, f.eaccount]), [
    ["a", "students@qalabreview.com", "carlos@qalabreview.com"], ["e", "partners@qalabreview.com", "carlos@qalabreview.com"]]);
  assert.deepEqual(forwardQueue(items, drafts, { a: {}, e: {}, done: {} }), []);
});
