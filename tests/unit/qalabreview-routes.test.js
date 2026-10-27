const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../qalabreview/src/routes.js");
const at = (path) => new URL("https://qalabreview.com" + path);
const params = (location) => new URL(location).searchParams;

test("a prospect's domain opens its Live Report in the link's language, tags first", async () => {
  const { route } = await load();
  const out = await route(at("/es/www.UPB.edu.co"), { findReport: async (host) => (host === "upb.edu.co" ? { id: "upb" } : null) });
  assert.equal(out.status, 302);
  assert.ok(out.location.startsWith("https://carlosandmunoz.com/qa-review-es.html?utm_source=qalabreview&utm_campaign=outreach&utm_content=upb.edu.co"));
  assert.equal(params(out.location).get("live"), "upb");
});

test("a domain with no Live Report yet opens the free review with the site typed in", async () => {
  const { route } = await load();
  const out = await route(at("/acme.io"), { acceptLanguage: "pt-BR,pt;q=0.9" });
  assert.ok(out.location.startsWith("https://carlosandmunoz.com/qa-review-pt.html?"));
  assert.equal(params(out.location).get("url"), "acme.io");
  assert.equal(params(out.location).get("utm_campaign"), "outreach-new");
});

test("a lookup that fails still sends the prospect somewhere useful", async () => {
  const { route } = await load();
  const out = await route(at("/acme.io"), { findReport: async () => { throw new Error("index down"); } });
  assert.equal(params(out.location).get("url"), "acme.io");
});

test("channel paths tag the campaign so Jarvis can tell clips, QR codes and slides apart", async () => {
  const { route } = await load();
  const out = await route(at("/de/qr"));
  assert.ok(out.location.startsWith("https://carlosandmunoz.com/qa-review-de.html?utm_source=qalabreview&utm_campaign=qr&utm_medium=qr"));
  assert.equal(params((await route(at("/yt"))).location).get("utm_campaign"), "youtube");
});

test("home, /call, robots.txt and unknown paths", async () => {
  const { route, DEFAULT_CALL } = await load();
  assert.equal(params((await route(at("/"))).location).get("utm_campaign"), "home");
  assert.equal((await route(at("/call"))).location, DEFAULT_CALL);
  assert.equal((await route(at("/call"), { callUrl: "https://outlook.office.com/book/x" })).location, "https://outlook.office.com/book/x");
  assert.equal((await route(at("/robots.txt"))).status, 200);
  assert.equal(params((await route(at("/nope/deeper"))).location).get("utm_campaign"), "unknown-path");
  assert.equal(params((await route(at("/%E0%A4%A"))).location).get("utm_campaign"), "unknown-path");
});

test("browser language picks the page when the link has no language", async () => {
  const { langFrom } = await load();
  assert.equal(langFrom("fr-CA,fr;q=0.8,en;q=0.5"), "fr");
  assert.equal(langFrom("ja,ko"), "en");
});
