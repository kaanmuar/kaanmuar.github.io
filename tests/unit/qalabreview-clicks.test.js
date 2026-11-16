// The qalabreview.com Worker's click data points (#3281): which answers are clicks, their kind, and bots set apart.
const test = require("node:test");
const assert = require("node:assert/strict");

const load = async () => Object.assign({}, await import("../../qalabreview/src/routes.js"), await import("../../qalabreview/src/clicks.js"));
const at = (path) => new URL("https://qalabreview.com" + path);

test("an outreach link is an outreach click with its campaign, prospect host and language", async () => {
  const { route, clickOf, pointOf } = await load();
  const url = at("/es/www.UPB.edu.co");
  const out = await route(url, { findReport: async () => ({ id: "upb" }) });
  const click = clickOf(url, out);
  assert.deepEqual(click, { kind: "outreach", campaign: "outreach", host: "upb.edu.co", lang: "es" });
  assert.deepEqual(pointOf(click, "CO", false), { blobs: ["outreach", "CO", "outreach", "upb.edu.co", "es", ""], doubles: [1], indexes: ["CO"] });
  const fresh = clickOf(at("/acme.io"), await route(at("/acme.io"), { acceptLanguage: "pt-BR" }), { acceptLanguage: "pt-BR" });
  assert.deepEqual(fresh, { kind: "outreach", campaign: "outreach-new", host: "acme.io", lang: "pt" });
});

test("social replies, channels, calls, the landing and unknown paths each get their kind", async () => {
  const { route, clickOf } = await load();
  const kind = async (path, opts) => { const url = at(path); return clickOf(url, await route(url, opts || {})); };
  assert.equal((await kind("/en/r/bsky/acme.io/abc123")).kind, "social");
  assert.equal((await kind("/en/r/bsky/acme.io/abc123")).campaign, "social-reply-bluesky");
  assert.deepEqual(await kind("/fr/yt"), { kind: "channel", campaign: "youtube", host: "", lang: "fr" });
  assert.equal((await kind("/de/call/acme.io")).kind, "call");
  assert.equal((await kind("/call", { callUrl: "https://bookings.example.com/x" })).kind, "call");
  assert.deepEqual(await kind("/it/agencies"), { kind: "landing", campaign: "landing-agencies", host: "", lang: "it" });
  assert.equal((await kind("/en/peers/0a1b2c3d4e5f60718293/a1b2c3d4e5f6a1b2c3d4e5f6")).kind, "outreach");
  assert.equal((await kind("/en/no/such/path")).kind, "unknown");
});

test("robots, the sitemap, the favicon and the landing's language redirect are not clicks", async () => {
  const { route, clickOf } = await load();
  for (const path of ["/robots.txt", "/sitemap.xml", "/favicon.ico", "/", "/agencies"]) {
    const url = at(path);
    assert.equal(clickOf(url, await route(url, { acceptLanguage: "es" }), { acceptLanguage: "es" }), null, path);
  }
});

test("crawlers, link previews, scripts and HEAD requests are bots; browsers are not; odd countries read XX", async () => {
  const { isBot, pointOf } = await load();
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  assert.equal(isBot("GET", chrome), false);
  assert.equal(isBot("HEAD", chrome), true);
  for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "WhatsApp/2.23", "curl/8.4.0", "python-requests/2.31", ""]) assert.equal(isBot("GET", ua), true, ua);
  assert.equal(pointOf({ kind: "channel", campaign: "qr", host: "", lang: "en" }, "", true).blobs[1], "XX");
  assert.equal(pointOf({ kind: "channel", campaign: "qr", host: "", lang: "en" }, "T1", true).blobs[5], "bot");
});

test("the Worker writes one data point per click and none without the binding", async () => {
  const worker = (await import("../../qalabreview/src/index.js")).default;
  const points = [];
  const env = { CLICKS: { writeDataPoint: (p) => points.push(p) } };
  const req = (path, ua) => new Request("https://qalabreview.com" + path, { headers: { "user-agent": ua || "Mozilla/5.0 Chrome/130.0" } });
  const res = await worker.fetch(Object.assign(req("/en/yt"), { cf: { country: "MX" } }), env);
  assert.equal(res.status, 302);
  await worker.fetch(req("/robots.txt"), env);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].blobs.slice(0, 3), ["channel", "MX", "youtube"]);
  assert.equal((await worker.fetch(req("/en/yt"), {})).status, 302);
  await worker.fetch(req("/en/yt", "Googlebot/2.1"), env);
  assert.equal(points[1].blobs[5], "bot");
});
