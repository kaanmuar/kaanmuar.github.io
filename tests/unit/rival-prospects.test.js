const test = require("node:test");
const assert = require("node:assert/strict");
const { candidates, ccOf, toCsv } = require("../../scripts/rival-prospects");

const run = (host, list, extra = {}) => ({ email: "owner@shop.com.co", country: "CO", report: { host, rivals: { list } }, ...extra });
const rival = (host, rank) => ({ host, rank: rank ? { rank } : null });

test("only customer runs count, and each competitor is listed once with the asker it came from", () => {
  const docs = [
    run("www.carulla.com", [rival("exito.com", 29435), rival("www.alkomprar.com", 66256)]),
    run("jumbocolombia.com", [rival("exito.com", 29435)]),
    run("sweep.com.co", [rival("sweepRival.com.co")], { source: "sweep" }),
    run("tested.com.co", [rival("testRival.com.co")], { test: true }),
    run("mine.com", [rival("ownerRival.com.co")], { email: "carlos@carlosandmunoz.com" })
  ];
  const { rows } = candidates(docs, new Set());
  assert.deepEqual(rows.map((r) => [r.host, r.rival_of]), [["exito.com", "carulla.com"], ["alkomprar.com", "carulla.com"]]);
  assert.deepEqual(rows[0], { host: "exito.com", cc: "co", language: "es", segment: "company", rank: 29435, rival_of: "carulla.com" });
});

test("webmail, platforms, public bodies, global sites, askers and known hosts are left out", () => {
  const list = ["gmail.com", "lnkd.in", "chatgpt.com", "ed.gov", "sede.gob.es", "expedia.com", "fincaraiz.com.co", "ciencuadras.com", "metrocuadrado.com"]
    .map((h) => rival(h, h === "expedia.com" ? 2076 : 50000));
  const docs = [run("www.metrocuadrado.com", list), run("fincaraiz.com.co", [])];
  const { rows, left } = candidates(docs, new Set(["ciencuadras.com"]));
  assert.deepEqual(rows, []);
  assert.deepEqual(left, { platform: 3, "public body": 2, "global site": 1, "an asker": 2, "already in outreach": 1 });
});

test("the country comes from a two-letter ending, else the asker's country", () => {
  assert.equal(ccOf("tiendas.com.br", "CO"), "br");
  assert.equal(ccOf("shop.co.uk", "CO"), "gb");
  assert.equal(ccOf("exito.com", "CO"), "co");
  assert.equal(toCsv([{ host: "a.co", cc: "co", language: "es", segment: "company", rank: "", rival_of: "b, c.co" }]).split("\n")[1], 'a.co,co,es,company,,"b, c.co"');
});
