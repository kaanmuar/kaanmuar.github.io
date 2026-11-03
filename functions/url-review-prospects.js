/* Local-business prospects from Google Maps (#2120). Each night placesProspects (functions/index.js) runs up to
   PER_DAY Places API (New) Text Searches, one per city and segment ("dentista en Bogotá"), and appends the operating
   places that have their own https website to the sweep's outreach list (url_review_sweep/outreach), which the sweep
   reviews before the country lap (functions/url-review-sweep.js). It skips the night while BACKLOG prospects are still
   waiting, so the list stays a night or two ahead of the sweep.

   Only the host, country, segment and place ID are kept (Maps Platform terms: no names, addresses or phones).
   State lives in url_review_sweep/places: { pos, lap, days: { date: { calls, errors, added } }, last }. */
const sweep = require("./url-review-sweep");

const PLACES_API = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = "places.id,places.websiteUri,places.businessStatus";
const PER_DAY = 20;
const BACKLOG = 96;
const KEEP_DAYS = 14;

// Segment -> the search term in each site language; the key is the sweep sector.
const SEGMENTS = {
  dentist: { en: "dentist", es: "dentista", pt: "dentista", de: "Zahnarzt", fr: "dentiste", it: "dentista" },
  plumber: { en: "plumber", es: "plomero", pt: "encanador", de: "Klempner", fr: "plombier", it: "idraulico" },
  electrician: { en: "electrician", es: "electricista", pt: "eletricista", de: "Elektriker", fr: "électricien", it: "elettricista" },
  hvac: { en: "HVAC contractor", es: "aire acondicionado instalación", pt: "ar condicionado instalação", de: "Klimaanlagen Installateur", fr: "climatisation installateur", it: "climatizzatori installatore" },
  clinic: { en: "medical clinic", es: "clínica médica", pt: "clínica médica", de: "Arztpraxis", fr: "clinique médicale", it: "clinica medica" },
  physio: { en: "physiotherapist", es: "fisioterapeuta", pt: "fisioterapeuta", de: "Physiotherapie", fr: "kinésithérapeute", it: "fisioterapista" },
  vet: { en: "veterinarian", es: "veterinaria", pt: "veterinário", de: "Tierarzt", fr: "vétérinaire", it: "veterinario" },
  lawyer: { en: "law firm", es: "abogados", pt: "advogados", de: "Rechtsanwalt", fr: "avocat", it: "avvocato" },
  accountant: { en: "accountant", es: "contador", pt: "contabilidade", de: "Steuerberater", fr: "expert-comptable", it: "commercialista" },
  restaurant: { en: "restaurant", es: "restaurante", pt: "restaurante", de: "Restaurant", fr: "restaurant", it: "ristorante" },
  bakery: { en: "bakery", es: "panadería", pt: "padaria", de: "Bäckerei", fr: "boulangerie", it: "panificio" },
  cafe: { en: "cafe", es: "cafetería", pt: "cafeteria", de: "Café", fr: "café", it: "caffetteria" },
  realestate: { en: "real estate agency", es: "inmobiliaria", pt: "imobiliária", de: "Immobilienmakler", fr: "agence immobilière", it: "agenzia immobiliare" },
  salon: { en: "hair salon", es: "peluquería", pt: "salão de beleza", de: "Friseur", fr: "salon de coiffure", it: "parrucchiere" },
  spa: { en: "day spa", es: "spa", pt: "spa", de: "Day Spa", fr: "spa", it: "centro benessere" },
  gym: { en: "gym", es: "gimnasio", pt: "academia", de: "Fitnessstudio", fr: "salle de sport", it: "palestra" }
};

// The largest cities of the sweep's TIER1 markets, biggest first.
const CITIES = {
  es: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao"],
  mx: ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla", "Querétaro"],
  co: ["Bogotá", "Medellín", "Cali", "Barranquilla"],
  ar: ["Buenos Aires", "Córdoba", "Rosario"],
  cl: ["Santiago", "Valparaíso", "Concepción"],
  pe: ["Lima", "Arequipa", "Trujillo"],
  ec: ["Quito", "Guayaquil", "Cuenca"],
  ve: ["Caracas", "Maracaibo", "Valencia"],
  uy: ["Montevideo", "Punta del Este", "Salto"],
  py: ["Asunción", "Ciudad del Este", "Encarnación"],
  bo: ["La Paz", "Santa Cruz de la Sierra", "Cochabamba"],
  cr: ["San José", "Heredia", "Alajuela"],
  pa: ["Ciudad de Panamá", "David", "Colón"],
  do: ["Santo Domingo", "Santiago de los Caballeros", "Punta Cana"],
  gt: ["Ciudad de Guatemala", "Quetzaltenango", "Antigua Guatemala"],
  hn: ["Tegucigalpa", "San Pedro Sula", "La Ceiba"],
  sv: ["San Salvador", "Santa Ana", "San Miguel"],
  ni: ["Managua", "León", "Granada"],
  pr: ["San Juan", "Bayamón", "Ponce"],
  br: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Brasília", "Curitiba"],
  pt: ["Lisboa", "Porto", "Braga"],
  de: ["Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main"],
  at: ["Wien", "Graz", "Linz"],
  ch: ["Zürich", "Basel", "Bern"],
  fr: ["Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux"],
  be: ["Bruxelles", "Liège", "Charleroi"],
  it: ["Roma", "Milano", "Napoli", "Torino", "Bologna"],
  us: ["New York", "Los Angeles", "Chicago", "Houston", "Miami"],
  gb: ["London", "Manchester", "Birmingham", "Glasgow"],
  ie: ["Dublin", "Cork", "Galway"],
  ca: ["Toronto", "Vancouver", "Calgary", "Ottawa"],
  au: ["Sydney", "Melbourne", "Brisbane", "Perth"]
};

const IN = { en: "in", es: "en", pt: "em", de: "in", fr: "à", it: "a" };

// Social profiles, link pages, booking and delivery platforms: a listing there is not the business's own site.
const PLATFORMS = /(^|\.)(facebook|instagram|linktr|wa|whatsapp|google|goo|youtube|tiktok|twitter|x|linkedin|yelp|tripadvisor|doctoralia|doctolib|jameda|booksy|fresha|treatwell|planity|ubereats|rappi|ifood|deliveroo|justeat|glovoapp|opentable|thefork|resy|zocdoc|healthgrades|houzz|angi|homeadvisor|thumbtack|idealista|fotocasa|zillow|realtor|rightmove|immobilienscout24|seloger|immobiliare|wixsite|business\.site|square|squareup|toasttab|beacons|carrd|bio)\.[a-z.]+$/i;

// Every (country, city, segment) once, ordered so a lap starts with every country's biggest city in every segment.
function slots() {
  const out = [];
  const segments = Object.keys(SEGMENTS);
  const depth = Math.max(...Object.values(CITIES).map((c) => c.length));
  for (let rank = 0; rank < depth; rank += 1) {
    for (const sector of segments) {
      for (const cc of sweep.TIER1) {
        const city = (CITIES[cc] || [])[rank];
        if (city) out.push({ cc, city, sector });
      }
    }
  }
  return out;
}

function request(slot) {
  const lang = sweep.langOf(slot.cc);
  const term = SEGMENTS[slot.sector][lang] || SEGMENTS[slot.sector].en;
  return { textQuery: term + " " + (IN[lang] || "in") + " " + slot.city, languageCode: lang, regionCode: slot.cc.toUpperCase(), pageSize: 20 };
}

async function placesSearch(body, key) {
  if (!key) return null;
  const res = await fetch(PLACES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) return { ok: false, error: "status " + res.status };
  const data = await res.json();
  return { ok: true, places: Array.isArray(data && data.places) ? data.places : [] };
}

// A place as an outreach row, or null: operating, with its own https site that is not a platform or blocked.
function prospectOf(place, slot) {
  if (!place || (place.businessStatus && place.businessStatus !== "OPERATIONAL")) return null;
  const uri = String(place.websiteUri || "").trim();
  if (!uri) return null;
  const host = sweep.hostOf(uri.replace(/^http:/i, "https:"));
  if (!host || PLATFORMS.test(host) || sweep.BLOCKED.test(host) || sweep.RESERVED.test(host)) return null;
  return { host, cc: slot.cc, sector: slot.sector, source: "places", placeId: String(place.id || "").slice(0, 200) };
}

const bare = (host) => String(host || "").replace(/^www\./, "");

// One night: up to PER_DAY searches from state.pos on. `known` holds the hosts already on the list.
// search(body) answers like placesSearch. Returns the rows to append and the moved-on state.
async function night({ state, known, waiting, day, search }) {
  const prev = Object.assign({ pos: 0, lap: 0, days: {} }, state || {});
  if (waiting >= BACKLOG) return { rows: [], state: Object.assign({}, prev, { last: { day, skipped: "backlog", waiting } }), calls: 0, errors: 0 };
  const list = slots();
  const seen = new Set([...known].map(bare));
  const rows = [];
  let { pos, lap } = prev;
  let calls = 0;
  let errors = 0;
  let lastError = "";
  while (calls < PER_DAY) {
    if (pos >= list.length) { pos = 0; lap += 1; }
    const slot = list[pos];
    pos += 1;
    calls += 1;
    const found = await search(request(slot)).catch((error) => ({ ok: false, error: String((error && error.message) || error).slice(0, 120) }));
    if (!found || !found.ok) { errors += 1; lastError = (found && found.error) || "no answer"; if (errors >= 3) break; continue; }
    for (const place of found.places) {
      const row = prospectOf(place, slot);
      if (row && !seen.has(bare(row.host))) { seen.add(bare(row.host)); rows.push(row); }
    }
  }
  const days = Object.assign({}, prev.days, { [day]: { calls, errors, added: rows.length } });
  Object.keys(days).sort().slice(0, -KEEP_DAYS).forEach((d) => { delete days[d]; });
  const last = Object.assign({ day, calls, errors, added: rows.length }, lastError ? { error: lastError } : {});
  return { rows, state: { pos, lap, days, last }, calls, errors };
}

module.exports = { PER_DAY, BACKLOG, SEGMENTS, CITIES, slots, request, placesSearch, prospectOf, night };
