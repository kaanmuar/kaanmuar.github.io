const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const local = require("../../functions/url-review-local");

const HOST = "sonrisa.example.co";
const URL_ = "https://" + HOST + "/";
const WEEKDAYS = ["0900-1800"];
const SITE_WEEK = [[], WEEKDAYS, WEEKDAYS, WEEKDAYS, WEEKDAYS, WEEKDAYS, ["0900-1300"]];

function page(ld, body) {
  const script = ld ? "<script type=\"application/ld+json\">" + JSON.stringify(ld) + "</script>" : "";
  return core.analyzeHtml("<!doctype html><html lang=\"es-CO\"><head><title>Clínica Dental Sonrisa | Bogotá</title>" + script + "</head><body><h1>Sonrisa</h1>" + (body || "") + "</body></html>", {}, URL_);
}

const DENTIST = {
  "@context": "https://schema.org",
  "@type": "Dentist",
  name: "Clínica Dental Sonrisa",
  telephone: "+57 601 555 1234",
  address: { "@type": "PostalAddress", streetAddress: "Cra. 7 #71-21", addressLocality: "Bogotá", addressCountry: "CO" },
  openingHoursSpecification: [
    { dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "18:00" },
    { dayOfWeek: "https://schema.org/Saturday", opens: "09:00", closes: "13:00" }
  ]
};

const PERIODS = [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 18, minute: 0 } }))
  .concat({ open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 13, minute: 0 } });

function place(extra) {
  return Object.assign({
    id: "ChIJsonrisa123",
    displayName: { text: "Sonrisa Clínica Dental" },
    formattedAddress: "Cra. 7 #71-21, Bogotá, Colombia",
    nationalPhoneNumber: "(601) 5551234",
    websiteUri: "https://" + HOST + "/?utm_source=google",
    businessStatus: "OPERATIONAL",
    regularOpeningHours: { periods: PERIODS }
  }, extra);
}

const found = (...places) => async () => ({ ok: true, places });
const landed = async (url) => ({ status: 200, url, hops: 0 });

test("LocalBusiness and its subtypes count as local, online and generic types do not (#2067)", () => {
  for (const type of ["LocalBusiness", "Dentist", "HairSalon", "ClothingStore", "ItalianRestaurant", "ProfessionalService", "https://schema.org/Plumber"]) assert.ok(local.isLocalType(type), type);
  for (const type of ["Organization", "WebSite", "OnlineStore", "OnlineBusiness", "Service", "Person", "Product"]) assert.ok(!local.isLocalType(type), type);
});

test("site hours read the same from openingHoursSpecification and openingHours, and match Places periods (#2067)", () => {
  assert.deepEqual(local.weekHours(DENTIST.openingHoursSpecification), SITE_WEEK);
  assert.deepEqual(local.weekHours(null, "Mo-Fr 09:00-18:00 Sa 09:00-13:00"), SITE_WEEK);
  assert.deepEqual(local.weekHours(null, ["Mo,Tu,We,Th,Fr 09:00-18:00", "Sa 9:00-13:00"]), SITE_WEEK);
  assert.deepEqual(local.placeHours({ periods: PERIODS }), SITE_WEEK);
  assert.deepEqual(local.weekHours(null, "Fr-Sa 22:00-02:00")[5], ["2200-2400"]);
  assert.deepEqual(local.weekHours([{ dayOfWeek: "Sunday", opens: "00:00", closes: "23:59" }])[0], ["0000-2400"]);
  assert.deepEqual(local.placeHours({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] }), Array(7).fill(["0000-2400"]));
  assert.equal(local.weekHours([{ dayOfWeek: "Monday", opens: "10:00", closes: "12:00", validFrom: "2026-12-24" }]), null);
  assert.equal(local.weekHours(null, null), null);
});

test("the start page is local with LocalBusiness data, or with a Maps link next to a phone link (#2067)", () => {
  const sig = local.signals(page(DENTIST, "<a href=\"tel:+576015551234\">Llámanos</a>"));
  assert.equal(sig.name, "Clínica Dental Sonrisa");
  assert.deepEqual(sig.phones, ["+57 601 555 1234", "+576015551234"]);
  assert.equal(sig.lang, "es");
  assert.equal(local.query(sig), "Clínica Dental Sonrisa, Cra. 7 #71-21, Bogotá, CO");
  assert.deepEqual(sig.hours, SITE_WEEK);

  assert.deepEqual(page(null, "<a href=\"tel:+57%20601%20555%201234\">Llámanos</a>").local.phones, ["+57 601 555 1234"]);
  assert.equal(local.signals(page(null, "<a href=\"tel:+576015551234\">Llámanos</a>")), null, "a phone alone is not enough");
  assert.equal(local.signals(page({ "@type": "Organization", name: "Big Corp", address: "Somewhere 1" })), null);
  const hinted = local.signals(page(null, "<a href=\"tel:+576015551234\">Llámanos</a><iframe src=\"https://www.google.com/maps/embed?pb=xyz\" title=\"Mapa\"></iframe>"));
  assert.equal(hinted.name, "Clínica Dental Sonrisa");
  assert.equal(hinted.fromSchema, false);
});

test("a profile that links to the site and agrees with it passes, and keeps nothing of the profile but its ID (#2067)", async () => {
  const asked = [];
  const reached = [];
  const res = await local.lookup(page(DENTIST), HOST, {
    places: async (request) => { asked.push(request); return { ok: true, places: [place({ websiteUri: "https://other.example/" }), place()] }; },
    reach: async (url) => { reached.push(url); return { status: 200, url, hops: 1 }; }
  });
  assert.deepEqual(asked, [{ textQuery: "Clínica Dental Sonrisa, Cra. 7 #71-21, Bogotá, CO", languageCode: "es" }]);
  assert.deepEqual(reached, ["https://" + HOST + "/?utm_source=google"]);
  assert.deepEqual(res, {
    ok: true, query: asked[0].textQuery, placeId: "ChIJsonrisa123", by: "website", status: "OPERATIONAL",
    website: { present: true, http: false, utm: true, sameSite: true, reach: { status: 200, hops: 1, sameSite: true } },
    mismatch: {}, fromSchema: true
  });
  const kept = JSON.stringify(res);
  for (const text of ["Sonrisa Clínica Dental", "Colombia", "5551234", "utm_source"]) assert.ok(!kept.includes(text), "kept " + text);
});

test("phone, street, name and hours that differ are reported in the site's words (#2067)", async () => {
  const res = await local.lookup(page(DENTIST), HOST, {
    places: found(place({
      displayName: { text: "Odontología Pérez" },
      formattedAddress: "Cl. 100 #15-20, Bogotá, Colombia",
      nationalPhoneNumber: "(601) 7654321",
      regularOpeningHours: { periods: PERIODS.slice(0, 4) }
    })),
    reach: landed
  });
  assert.deepEqual(res.mismatch, { name: "Clínica Dental Sonrisa", phone: ["+57 601 555 1234"], address: "Cra. 7 #71-21", hours: [5, 6] });
});

test("a profile found by phone with no website, a broken link, and no match at all (#2067)", async () => {
  const byPhone = await local.lookup(page(DENTIST), HOST, { places: found(place({ websiteUri: undefined })), reach: landed });
  assert.equal(byPhone.by, "phone");
  assert.deepEqual(byPhone.website, { present: false, http: false, utm: false, sameSite: false });
  assert.equal(byPhone.mismatch.phone, undefined, "the phone it was found by is not a mismatch");

  const broken = await local.lookup(page(DENTIST), HOST, { places: found(place({ websiteUri: "http://" + HOST + "/old" })), reach: async () => { throw new Error("status 404"); } });
  assert.equal(broken.website.http, true);
  assert.deepEqual(broken.website.reach, { error: "status 404" });

  const none = await local.lookup(page(DENTIST), HOST, { places: found(place({ websiteUri: "https://other.example/", nationalPhoneNumber: "(601) 0000000" })) });
  assert.deepEqual(none, { ok: true, query: "Clínica Dental Sonrisa, Cra. 7 #71-21, Bogotá, CO", placeId: "", candidates: 1, fromSchema: true });

  assert.deepEqual(await local.lookup(page(DENTIST), HOST, { places: async () => ({ ok: false, error: "status 403" }) }), { ok: false, query: none.query, error: "status 403" });
  let called = false;
  assert.equal(await local.lookup(page(null), HOST, { places: async () => { called = true; return { ok: true, places: [] }; } }), null);
  assert.equal(called, false, "a site that is not local costs no Places call");
});

test("the Places search sends the key and field mask, and is off without a key (#2067)", async (t) => {
  const sent = [];
  t.mock.method(global, "fetch", async (url, init) => {
    sent.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ places: [place()] }) };
  });
  assert.equal(await local.placesSearch({ textQuery: "x" }, ""), null);
  assert.equal(sent.length, 0);
  const res = await local.placesSearch({ textQuery: "Sonrisa, Bogotá", languageCode: "es" }, "k1");
  assert.equal(sent[0].url, "https://places.googleapis.com/v1/places:searchText");
  assert.equal(sent[0].init.headers["X-Goog-Api-Key"], "k1");
  assert.match(sent[0].init.headers["X-Goog-FieldMask"], /^places\.id,.*places\.websiteUri.*places\.regularOpeningHours$/);
  assert.deepEqual(JSON.parse(sent[0].init.body), { textQuery: "Sonrisa, Bogotá", pageSize: 5, languageCode: "es" });
  assert.equal(res.places[0].id, "ChIJsonrisa123");
  t.mock.method(global, "fetch", async () => ({ ok: false, status: 403 }));
  assert.deepEqual(await local.placesSearch({ textQuery: "x" }, "k1"), { ok: false, error: "status 403" });
});
