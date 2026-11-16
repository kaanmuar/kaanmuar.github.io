"use strict";

// The Google Business Profile check (#2067). A site that describes itself as a local business is looked up with
// Places API (New) Text Search, and the profile that links to the site, or lists its phone, is compared with it.
// The Maps Platform terms allow keeping a place ID and nothing else from Places, so the result holds that ID and
// what the comparison found: never the profile's own name, address, phone, hours or website link.

const PLACES_API = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = ["id", "displayName", "formattedAddress", "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri", "businessStatus", "regularOpeningHours"].map((field) => "places." + field).join(",");

// schema.org LocalBusiness and the subtypes sites use most; the suffixes catch the many Store and Restaurant kinds.
const LOCAL_TYPES = new Set([
  "LocalBusiness", "ProfessionalService", "LegalService", "Attorney", "Notary", "AccountingService", "FinancialService", "BankOrCreditUnion",
  "InsuranceAgency", "RealEstateAgent", "Dentist", "Physician", "MedicalClinic", "Hospital", "Pharmacy", "Optician", "VeterinaryCare",
  "FoodEstablishment", "Bakery", "BarOrPub", "Brewery", "CafeOrCoffeeShop", "Distillery", "Winery", "LodgingBusiness", "Hotel", "Motel",
  "Hostel", "BedAndBreakfast", "Resort", "Campground", "ExerciseGym", "HealthClub", "SportsActivityLocation", "SportsClub", "GolfCourse",
  "BowlingAlley", "AutoRepair", "AutoDealer", "AutoRental", "AutoWash", "GasStation", "MotorcycleDealer", "MotorcycleRepair", "DaySpa",
  "TattooParlor", "Plumber", "Electrician", "HVACBusiness", "Locksmith", "MovingCompany", "HousePainter", "ChildCare", "DryCleaningOrLaundry",
  "NightClub", "AmusementPark", "ArtGallery", "Casino", "ComedyClub", "MovieTheater", "TouristInformationCenter", "SelfStorage",
  "ShoppingCenter", "AnimalShelter", "Florist", "EmergencyService"
]);
const LOCAL_SUFFIX = /(Store|Shop|Restaurant|Salon|Clinic|Business|Agency|Contractor)$/;
const DAYS = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const TIME = "\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?m\\.?)?";
const HOURS_RULE = new RegExp("([A-Za-z]{2,9}(?:\\s*[-–,]\\s*[A-Za-z]{2,9})*)[\\s,:]+(" + TIME + ")\\s*[-–]\\s*(" + TIME + ")", "gi");
const NAME_NOISE = new Set(["the", "and", "de", "del", "la", "el", "los", "las", "y", "e", "da", "do", "der", "die", "und", "le", "les", "et", "di", "il",
  "sas", "s.a.s", "sa", "s.a", "ltda", "llc", "inc", "ltd", "gmbh", "srl", "sl", "spa", "co", "corp", "company"]);

const cut = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
const first = (value) => Array.isArray(value) ? value[0] : value;
const plain = (value, max) => typeof value === "string" || typeof value === "number" ? cut(value, max) : "";
const digits = (value) => String(value || "").replace(/\D/g, "");
const bare = (host) => String(host || "").toLowerCase().replace(/^www\./, "");

function isLocalType(type) {
  const name = String(type || "").replace(/^https?:\/\/schema\.org\//, "");
  return !/^Online/.test(name) && (LOCAL_TYPES.has(name) || LOCAL_SUFFIX.test(name));
}

// "09:00", "09:00:00", "8:00am", "5pm" as "HHMM"; a bare "9" is too vague to read.
function clock(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(?:([ap])\.?m\.?)?$/i);
  if (!match || (match[2] == null && !match[3])) return "";
  let hour = Number(match[1]) % (match[3] ? 12 : 24);
  if (match[3] && match[3].toLowerCase() === "p") hour += 12;
  const hhmm = String(hour).padStart(2, "0") + (match[2] || "00");
  return hhmm === "2359" ? "2400" : hhmm;
}

function span(opens, closes) {
  if (!opens || !closes) return "";
  if (opens === "0000" && closes === "0000") return "";
  return opens + "-" + (closes <= opens ? "2400" : closes);
}

function dayRange(spec) {
  const out = [];
  spec.split(/\s*,\s*/).forEach((part) => {
    const [from, to] = part.split(/\s*[-–]\s*/).map((day) => DAYS[day.toLowerCase()]);
    if (from == null) return;
    if (to == null) { out.push(from); return; }
    for (let day = from, guard = 0; guard < 7; day = (day + 1) % 7, guard += 1) {
      out.push(day);
      if (day === to) break;
    }
  });
  return out;
}

// One sorted list of "HHMM-HHMM" per day, Sunday first, from openingHoursSpecification or openingHours. A span past
// midnight ends at 2400 on the day it opens; special-hours rows with validFrom or validThrough are left out.
function weekHours(spec, text) {
  const week = [[], [], [], [], [], [], []];
  let seen = false;
  (Array.isArray(spec) ? spec : spec ? [spec] : []).forEach((row) => {
    if (!row || typeof row !== "object" || row.validFrom || row.validThrough) return;
    const range = span(clock(row.opens), clock(row.closes));
    (Array.isArray(row.dayOfWeek) ? row.dayOfWeek : [row.dayOfWeek]).forEach((raw) => {
      const day = DAYS[String(raw || "").replace(/^https?:\/\/schema\.org\//, "").toLowerCase()];
      if (day == null) return;
      seen = true;
      if (range) week[day].push(range);
    });
  });
  if (!seen) {
    (Array.isArray(text) ? text : [text]).filter((line) => typeof line === "string").forEach((line) => {
      const rule = new RegExp(HOURS_RULE.source, "gi");
      let match;
      while ((match = rule.exec(line))) {
        const range = span(clock(match[2]), clock(match[3]));
        if (range) dayRange(match[1]).forEach((day) => { seen = true; week[day].push(range); });
      }
    });
  }
  return seen ? week.map((day) => [...new Set(day)].sort()) : null;
}

function placeHours(hours) {
  const periods = hours && Array.isArray(hours.periods) ? hours.periods : null;
  if (!periods || !periods.length) return null;
  const week = [[], [], [], [], [], [], []];
  periods.forEach((period) => {
    const open = period && period.open;
    if (!open || open.day == null) return;
    if (!period.close) { week.forEach((day) => day.push("0000-2400")); return; }
    const at = (point) => String(point.hour || 0).padStart(2, "0") + String(point.minute || 0).padStart(2, "0");
    const opens = at(open);
    const closes = period.close.day === open.day ? at(period.close) : "2400";
    const range = span(opens, closes);
    if (range) week[open.day].push(range);
  });
  return week.map((day) => [...new Set(day)].sort());
}

// What a LocalBusiness JSON-LD item says about the business, read by schemaScan.
function facts(node) {
  const raw = first(node.address);
  const address = raw && typeof raw === "object"
    ? { street: plain(raw.streetAddress, 160), locality: plain(raw.addressLocality, 80), region: plain(raw.addressRegion, 80), postal: plain(raw.postalCode, 20),
      country: plain(raw.addressCountry && typeof raw.addressCountry === "object" ? raw.addressCountry.name : raw.addressCountry, 60) }
    : raw ? { text: plain(raw, 200) } : null;
  return { name: plain(first(node.name), 120), phone: plain(first(node.telephone), 40), address, hours: weekHours(node.openingHoursSpecification, node.openingHours) };
}

// The local business the start page describes, or null. A LocalBusiness item is enough; without one, a Google Maps
// link or embed next to a tel: link is.
function signals(inspect) {
  const page = inspect || {};
  const item = ((page.schema && page.schema.items) || []).find((one) => one.local);
  const hints = page.local || {};
  const phones = [...new Set([item && item.local.phone].concat(hints.phones || []).filter((phone) => digits(phone).length >= 7))].slice(0, 5);
  if (!item && !(hints.maps && phones.length)) return null;
  const titleName = cut(String(page.title || "").split(/\s[|–—·-]\s/)[0], 120);
  const name = (item && item.local.name) || (page.social && page.social.ogSiteName) || titleName;
  if (!name) return null;
  return { name, phones, address: item ? item.local.address : null, hours: item ? item.local.hours : null, fromSchema: !!item, lang: String(page.lang || "").slice(0, 2).toLowerCase() };
}

function query(sig) {
  const where = sig.address ? sig.address.text || [sig.address.street, sig.address.locality, sig.address.region, sig.address.country].filter(Boolean).join(", ") : "";
  return cut([sig.name, where].filter(Boolean).join(", "), 200);
}

function sameSite(uri, host) {
  try {
    const site = bare(host);
    const linked = bare(new URL(uri).hostname);
    return linked === site || linked.endsWith("." + site) || site.endsWith("." + linked);
  } catch (error) {
    return false;
  }
}

const samePhone = (a, b) => { const x = digits(a); const y = digits(b); return x.length >= 7 && y.length >= 7 && x.slice(-7) === y.slice(-7); };
const placePhones = (place) => [place.nationalPhoneNumber, place.internationalPhoneNumber].filter(Boolean);

function pick(places, host, phones) {
  const byWebsite = places.find((place) => place.websiteUri && sameSite(place.websiteUri, host));
  if (byWebsite) return { place: byWebsite, by: "website" };
  const byPhone = places.find((place) => placePhones(place).some((one) => phones.some((phone) => samePhone(one, phone))));
  return byPhone ? { place: byPhone, by: "phone" } : null;
}

function nameWords(name) {
  return String(name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9.]+/)
    .map((word) => word.replace(/\.+$/, "")).filter((word) => word && !NAME_NOISE.has(word));
}

function namesDiffer(site, profile) {
  const a = nameWords(site);
  const b = new Set(nameWords(profile));
  if (!a.length || !b.size) return false;
  const shared = a.filter((word) => b.has(word)).length;
  return shared / Math.min(a.length, b.size) < 0.5;
}

function streetDiffers(address, formatted) {
  const numbers = (text) => String(text || "").match(/\d+/g) || [];
  const street = numbers(address && address.street);
  if (!street.length || !formatted) return false;
  const profile = new Set(numbers(formatted));
  return street.some((number) => !profile.has(number));
}

// What differs between the site and the profile, in the site's own words and day numbers (0 is Sunday).
function compare(place, sig, by) {
  const mismatch = {};
  if (namesDiffer(sig.name, place.displayName && place.displayName.text)) mismatch.name = sig.name;
  const listed = placePhones(place);
  if (by !== "phone" && listed.length && sig.phones.length && !sig.phones.some((phone) => listed.some((one) => samePhone(one, phone)))) mismatch.phone = sig.phones.slice(0, 2);
  if (streetDiffers(sig.address, place.formattedAddress)) mismatch.address = sig.address.street;
  const profileHours = placeHours(place.regularOpeningHours);
  if (sig.hours && profileHours) {
    const days = [1, 2, 3, 4, 5, 6, 0].filter((day) => sig.hours[day].join(" ") !== profileHours[day].join(" "));
    if (days.length) mismatch.hours = days;
  }
  return mismatch;
}

async function placesSearch(request, key) {
  if (!key) return null;
  const body = { textQuery: request.textQuery, pageSize: 5 };
  if (request.languageCode) body.languageCode = request.languageCode;
  const res = await fetch(PLACES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return { ok: false, error: "status " + res.status };
  const data = await res.json();
  return { ok: true, places: Array.isArray(data && data.places) ? data.places.slice(0, 5) : [] };
}

// lookups.places(request) answers like placesSearch; lookups.reach(url) reads the profile's website link the way
// the review reads a page ({ status, url, hops } or a thrown error). null means the site does not look local.
async function lookup(inspect, host, lookups) {
  const sig = signals(inspect);
  if (!sig || !lookups || typeof lookups.places !== "function") return null;
  const textQuery = query(sig);
  const found = await lookups.places({ textQuery, languageCode: sig.lang });
  if (!found || !found.ok) return { ok: false, query: textQuery, error: cut((found && found.error) || "no answer", 120) };
  const match = pick(found.places, host, sig.phones);
  if (!match) return { ok: true, query: textQuery, placeId: "", candidates: found.places.length, fromSchema: sig.fromSchema };
  const { place, by } = match;
  const uri = place.websiteUri || "";
  const website = { present: !!uri, http: /^http:/i.test(uri), utm: /[?&]utm_[a-z]+=/i.test(uri), sameSite: !!uri && sameSite(uri, host) };
  if (uri && typeof lookups.reach === "function") {
    try {
      const res = await lookups.reach(uri.replace(/^http:/i, "https:"));
      website.reach = { status: res.status, hops: res.hops || 0, sameSite: sameSite(res.url, host) };
    } catch (error) {
      website.reach = { error: cut((error && error.message) || "no answer", 120) };
    }
  }
  return {
    ok: true,
    query: textQuery,
    placeId: cut(place.id, 200),
    by,
    status: cut(place.businessStatus || "", 40),
    website,
    mismatch: compare(place, sig, by),
    fromSchema: sig.fromSchema
  };
}

const mapsLink = (placeId) => "https://www.google.com/maps/place/?q=place_id:" + encodeURIComponent(placeId);

module.exports = { isLocalType, facts, weekHours, placeHours, signals, query, pick, compare, placesSearch, lookup, mapsLink };
