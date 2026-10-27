const test = require("node:test");
const assert = require("node:assert");
const { kind } = require("../../scripts/sensitive-sites");

const page = (title, description = "", body = "") => "<html><head><title>" + title + '</title><meta name="description" content="' + description + '"></head><body>' + body + "</body></html>";

test("adult sites are caught by their titles, host, rating tags or age gate", () => {
  assert.equal(kind({ host: "megaxh.com", html: page("Free Porn Videos &amp; XXX Movies - Sex Videos Tube") }), "adult");
  assert.equal(kind({ host: "javmyanmar.com", titles: ["JAV Myanmar | XNXX Myanmar HD"] }), "adult");
  assert.equal(kind({ host: "example.com", html: '<meta name="RATING" content="RTA-5042-1996-1400-1577-RTA">' }), "adult");
  assert.equal(kind({ host: "example.com", html: page("Welcome", "", "<p>You must be 18 or older to enter.</p><button>I am 18</button>") }), "adult");
  assert.equal(kind({ host: "pornhub.com" }), "adult");
});

test("gambling, betting and lottery sites are caught", () => {
  assert.equal(kind({ host: "texaswaiter.com", html: page("SITUS POKER SLOT ONLINE TERPERCAYA") }), "gambling");
  assert.equal(kind({ host: "www.powerball.com", html: page("Home | Powerball") }), "gambling");
  assert.equal(kind({ host: "example.co", titles: ["Apuestas deportivas y casino en línea"] }), "gambling");
  assert.equal(kind({ host: "bet365.com" }), "gambling");
});

test("a word inside a longer one, or a passing mention, is not a signal", () => {
  assert.equal(kind({ host: "www.essex.gov.uk", titles: ["Essex County Council"] }), "");
  assert.equal(kind({ host: "javascript.info", titles: ["The Modern JavaScript Tutorial"] }), "");
  assert.equal(kind({ host: "allmylinks.com", html: page("AllMyLinks", "Instagram, TikTok, X, YouTube, OnlyFans, your shop, your site behind a single link") }), "");
  assert.equal(kind({ host: "www.betterhelp.com", titles: ["Book a time slot with a therapist"] }), "");
  assert.equal(kind({ host: "www.sephora.com", titles: ["Nude lipstick shades", "Ford Escort parts"] }), "");
  assert.equal(kind({ host: "abc.xyz", titles: ["Alphabet Investor Relations"] }), "");
});
