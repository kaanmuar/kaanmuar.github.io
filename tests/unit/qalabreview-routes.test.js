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

test("a peer group's link opens that reader's comparison, tagged outreach-peers (#2363)", async () => {
  const { route } = await load();
  const out = await route(at("/fr/peers/0a1b2c3d4e5f60718293/a1b2c3d4e5f6a1b2c3d4e5f6"));
  assert.ok(out.location.startsWith("https://carlosandmunoz.com/qa-review-fr.html?utm_source=qalabreview&utm_campaign=outreach-peers"));
  assert.equal(params(out.location).get("peers"), "0a1b2c3d4e5f60718293");
  assert.equal(params(out.location).get("t"), "a1b2c3d4e5f6a1b2c3d4e5f6");
  assert.equal(params((await route(at("/peers/nothex!/x"))).location).get("utm_campaign"), "unknown-path");
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

test("/call, robots.txt, sitemap, favicon and unknown paths", async () => {
  const { route, DEFAULT_CALL } = await load();
  assert.equal((await route(at("/call"))).location, DEFAULT_CALL);
  assert.equal((await route(at("/call"), { callUrl: "https://outlook.office.com/book/x" })).location, "https://outlook.office.com/book/x");
  assert.match((await route(at("/robots.txt"))).body, /Sitemap: https:\/\/qalabreview\.com\/sitemap\.xml/);
  const sitemap = (await route(at("/sitemap.xml"))).body;
  assert.equal(sitemap.match(/<loc>/g).length, 30);
  assert.ok(sitemap.includes("<loc>https://qalabreview.com/es/agencies</loc>"));
  assert.equal((await route(at("/favicon.ico"))).location, "https://carlosandmunoz.com/assets/qa-review-favicon.ico");
  assert.equal(params((await route(at("/nope/deeper"))).location).get("utm_campaign"), "unknown-path");
  assert.equal(params((await route(at("/%E0%A4%A"))).location).get("utm_campaign"), "unknown-path");
});

test("browser language picks the page when the link has no language", async () => {
  const { langFrom } = await load();
  assert.equal(langFrom("fr-CA,fr;q=0.8,en;q=0.5"), "fr");
  assert.equal(langFrom("ja,ko"), "en");
});

test("a report reply's link opens the site's Live Report, tagged by network, site and post (#2465)", async () => {
  const { route } = await load();
  const findReport = async (host) => (host === "upb.edu.co" ? { id: "upb" } : null);
  const out = await route(at("/es/r/bsky/www.upb.edu.co/a1b2c3"), { findReport });
  assert.ok(out.location.startsWith("https://carlosandmunoz.com/qa-review-es.html?utm_source=qalabreview&utm_campaign=social-reply-bluesky&utm_term=a1b2c3&utm_content=upb.edu.co&utm_medium=social"));
  const long = await route(at("/es/r/mast/universidad-pontificia-bolivariana.edu.co/a1b2c3"), { findReport });
  assert.equal(params("https://x.test/" + new URL(long.location).search.slice(0, 120)).get("utm_term"), "a1b2c3");
  assert.equal(params(out.location).get("live"), "upb");
  assert.equal(params((await route(at("/r/yt/other.com"), { findReport })).location).get("url"), "other.com");
  assert.equal(params((await route(at("/r/myspace/upb.edu.co/a1b2c3"), { findReport })).location).get("utm_campaign"), "unknown-path");
  assert.equal(params((await route(at("/r/bsky/upb.edu.co/no!"), { findReport })).location).get("utm_campaign"), "unknown-path");
});

test("a profile campaign link carries the site's domain offer to the landing page as its coupon (#2615)", async () => {
  const { route } = await load();
  const findReport = async (host) => (host === "upb.edu.co" ? { id: "upb" } : null);
  const out = await route(at("/de/r/li/upb.edu.co/a1b2c3/HI-ABCD2345"), { findReport });
  assert.equal(params(out.location).get("utm_campaign"), "social-profile-linkedin");
  assert.equal(params(out.location).get("live"), "upb");
  assert.equal(params(out.location).get("coupon"), "HI-ABCD2345");
  assert.equal(params((await route(at("/r/li/upb.edu.co/a1b2c3/free-money"), { findReport })).location).get("utm_campaign"), "unknown-path");
});

test("the landing answers in the path's language, else redirects by the browser's, keeping the query (#1867)", async () => {
  const { route } = await load();
  const home = await route(at("/es"));
  assert.equal(home.status, 200);
  assert.equal(home.type, "text/html");
  assert.match(home.body, /<html lang="es">/);
  assert.match(home.body, /<link rel="canonical" href="https:\/\/qalabreview\.com\/es">/);
  assert.match(home.body, /hreflang="x-default" href="https:\/\/qalabreview\.com\/"/);
  assert.equal((await route(at("/"), { acceptLanguage: "de-DE,de;q=0.9" })).location, "https://qalabreview.com/de");
  assert.equal((await route(at("/startups?utm_source=x"), { acceptLanguage: "ja" })).location, "https://qalabreview.com/en/startups?utm_source=x");
  assert.equal((await route(at("/en"))).status, 200);
});

test("each audience page has its own copy and every link out is tagged for Jarvis (#1867)", async () => {
  const { route, LANGS } = await load();
  const { AUDIENCES } = await import("../../qalabreview/src/landing.js");
  assert.deepEqual(AUDIENCES, ["universities", "colleges", "agencies", "startups"]);
  for (const lang of LANGS) {
    for (const audience of ["", ...AUDIENCES]) {
      const out = await route(at("/" + lang + (audience ? "/" + audience : "")));
      assert.equal(out.status, 200, lang + "/" + audience);
      const hrefs = [...out.body.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      const away = hrefs.filter((h) => /^https?:/.test(h));
      assert.ok(away.length >= 3, lang + "/" + audience);
      for (const h of away) {
        const u = new URL(h);
        assert.equal(u.hostname, "carlosandmunoz.com", h);
        assert.equal(u.searchParams.get("utm_source"), "qalabreview", h);
        assert.equal(u.searchParams.get("utm_campaign"), audience ? "landing-" + audience : "landing", h);
      }
      assert.ok(away.some((h) => h.includes("/book.html?") && h.includes("type=intro") && h.includes("lang=" + lang)));
      assert.ok(hrefs.every((h) => !h.startsWith("/") || /^\/(en|es|pt|de|fr|it)(\/(universities|colleges|agencies|startups))?$/.test(h)), lang + "/" + audience);
    }
  }
  const es = (await route(at("/es/agencies"))).body;
  assert.ok(es.includes("Gane el pitch. Controle el lanzamiento. Demuestre el resultado."));
  assert.ok(es.includes('href="https://carlosandmunoz.com/qa-review-es.html?utm_source=qalabreview&amp;utm_campaign=landing-agencies&amp;utm_medium=web"'));
  assert.doesNotMatch(es, /read-only|zero load|100% private/i);
});

test("audience words never shadow a domain or a channel path", async () => {
  const { route, CHANNELS } = await load();
  const { AUDIENCES } = await import("../../qalabreview/src/landing.js");
  assert.ok(AUDIENCES.every((a) => !CHANNELS[a]));
  assert.equal(params((await route(at("/es/agencies.com"))).location).get("url"), "agencies.com");
  assert.equal(params((await route(at("/es/agencies/more"))).location).get("utm_campaign"), "unknown-path");
});
