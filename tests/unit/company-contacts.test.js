const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const CC = require("../../functions/company-contacts");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const HOME = { url: "https://www.hotelcasabrava.com.co/", html: fixture("company-hotel-home.html") };
const CONTACT = { url: "https://www.hotelcasabrava.com.co/contacto", html: fixture("company-hotel-contact.html") };
const HOST = "www.hotelcasabrava.com.co";

test("only addresses the company publishes on its own domain are kept, role inboxes first", () => {
  const c = CC.contactsOf([HOME, CONTACT], HOST, { cc: "co" });
  assert.deepEqual(c.emails.map((e) => [e.email, e.kind]), [
    ["info@hotelcasabrava.com.co", "role"], ["reservas@hotelcasabrava.com.co", "role"], ["eventos@hotelcasabrava.com.co", "role"], ["laura.gomez@hotelcasabrava.com.co", "named"]
  ]);
  assert.equal(c.emails[0].url, HOME.url);
  assert.equal(c.emails[2].url, CONTACT.url, "the [at] [dot] address comes from the contact page");
  const all = c.emails.map((e) => e.email).join(" ");
  for (const no of ["jobs@", "privacidad@", "newsletter@", "gmail.com", "agenciaejemplo.com", "logo@2x.png"]) assert.ok(!all.includes(no), no);
});

test("phones, profiles, language, country and name come from tel links, links, sameAs and the page", () => {
  const c = CC.contactsOf([HOME, CONTACT], HOST, { cc: "mx", lang: "en" });
  assert.deepEqual(c.phones, ["+576056601234", "+573001112233"]);
  assert.deepEqual(c.socials.map((s) => [s.network, s.handle]), [["x", "@casabrava"], ["linkedin", "hotel-casa-brava"], ["facebook", "HotelCasaBrava"], ["instagram", "@hotelcasabrava"], ["tiktok", "@casabrava.ctg"]]);
  assert.equal(c.lang, "es");
  assert.equal(c.country, "co", "schema.org addressCountry beats the hint");
  assert.equal(c.name, "Hotel Casa Brava");
  assert.deepEqual(c.pages, [HOME.url, CONTACT.url]);
});

test("a bare page falls back to the ccTLD, then the hint, and finds nothing it was not given", () => {
  const c = CC.contactsOf([{ url: "https://shop.example.de/", html: "<html><body>Hallo</body></html>" }], "shop.example.de", { cc: "at", lang: "de" });
  assert.deepEqual([c.emails, c.phones, c.socials, c.lang, c.country], [[], [], [], "de", "de"]);
  assert.equal(CC.contactsOf([{ url: "https://x.com/", html: "<p>hi</p>" }], "acme.com", { cc: "us" }).country, "us");
});

test("contact, about and legal-notice links on the same host are read, at most three", () => {
  assert.deepEqual(CC.contactLinks(HOME.html, HOME.url), ["https://www.hotelcasabrava.com.co/contacto", "https://www.hotelcasabrava.com.co/aviso-legal"]);
  const many = ["/contact", "/about", "/impressum", "/team", "/kontakt"].map((h) => `<a href="${h}">x</a>`).join("");
  assert.equal(CC.contactLinks(many, "https://a.de/").length, CC.CONTACT_PAGES);
});

test("emailOf and phoneOf reject what is not a published business contact", () => {
  assert.equal(CC.emailOf("mailto:Ventas@Acme.com.mx?subject=x", "www.acme.com.mx").email, "ventas@acme.com.mx");
  assert.equal(CC.emailOf("dpo@acme.com", "acme.com"), null);
  assert.equal(CC.emailOf("someone@hotmail.com", "acme.com"), null);
  assert.equal(CC.emailOf("info@other.com", "acme.com"), null);
  assert.equal(CC.phoneOf("tel:123"), "");
  assert.equal(CC.phoneOf("0049 30 1234567"), "+49301234567");
  assert.equal(CC.countryOf("España"), "es");
  assert.equal(CC.countryOf("UK"), "gb");
});

test("discover reads the homepage and its contact pages through fetch", async () => {
  const pages = { "https://www.hotelcasabrava.com.co/": HOME.html, "https://www.hotelcasabrava.com.co/contacto": CONTACT.html };
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    const html = pages[url];
    return { ok: !!html, url, headers: { get: () => "text/html; charset=utf-8" }, text: async () => html || "" };
  };
  const c = await CC.discover(fetchFn, HOST, { cc: "co" });
  assert.deepEqual(asked, ["https://www.hotelcasabrava.com.co/", "https://www.hotelcasabrava.com.co/contacto", "https://www.hotelcasabrava.com.co/aviso-legal"]);
  assert.equal(c.emails.length, 4);
  assert.equal(await CC.discover(async () => ({ ok: false, headers: { get: () => "" } }), "gone.example", {}), null);
});
