"use strict";
/* Site-dependency sectors (#3139): businesses whose sales, bookings or trust live on their own website, so what URL
   Review checks (speed, accessibility, SEO and AI search, security headers, broken links, mobile) is money to them.

   Each sector: key (the sweep sector, shared with url-review-prospects.js SEGMENTS where it already existed), label,
   why (what the site carries: WHY keys), reason (one line for copy and for Carlos), priority (0-100, higher is
   searched first and gets a bigger nightly cap), places (the Google Places search term in each site language, or null
   when Maps has no listing for the kind, like creators), search (a web search query per language for those) and peers
   (the scripts/peer-sectors.json keys the sector covers, so peer comparisons and benchmark pages line up).

   The Places night (url-review-prospects.js) takes every sector with places terms, highest priority first, with
   capOf(key) new prospects a night; the weekly companies run (scripts/outreach-weekly.js companies) takes the reviewed
   ones, finds their published contacts and offers the 2-day trial. */

const LANGS = ["en", "es", "pt", "de", "fr", "it"];

// What the site carries, and the review areas (Live Report fix[].area) that hurt it most, in order.
const WHY = {
  bookings: { label: "bookings and reservations", areas: ["Performance", "Accessibility", "Security"] },
  checkout: { label: "online checkout", areas: ["Security", "Performance", "Accessibility"] },
  leads: { label: "quote and contact requests", areas: ["SEO", "GEO", "Analytics"] },
  trust: { label: "trust before money changes hands", areas: ["Security", "Accessibility"] },
  seo: { label: "being found in search and AI answers", areas: ["SEO", "GEO"] },
  "a11y-law": { label: "accessibility law (EAA, ADA, Section 508)", areas: ["Accessibility"] },
  security: { label: "keeping accounts and payments safe", areas: ["Security"] },
  mobile: { label: "visitors on phones", areas: ["Performance", "Accessibility"] }
};

const t = (en, es, pt, de, fr, it) => ({ en, es, pt, de, fr, it });

const SECTORS = [
  { key: "ecommerce", label: "Online stores", priority: 96, why: ["checkout", "seo", "mobile"], reason: "Every sale goes through the site: a slow or broken checkout is lost revenue.",
    places: t("online store", "tienda online", "loja online", "Onlineshop", "boutique en ligne", "negozio online"), peers: ["online-store", "ecommerce-platform"] },
  { key: "hotel", label: "Hotels", priority: 95, why: ["bookings", "seo", "mobile"], reason: "Direct bookings on the hotel's own site skip the 15-25% portal commission.",
    places: t("hotel", "hotel", "hotel", "Hotel", "hôtel", "hotel"), peers: ["hotel", "hotel-chain", "hostel", "resort"] },
  { key: "saas", label: "SaaS and software products", priority: 92, why: ["leads", "seo", "trust"], reason: "The site is the storefront, the sign-up and the first proof of product quality.",
    places: t("software company", "empresa de software", "empresa de software", "Softwarefirma", "éditeur de logiciels", "azienda software"), peers: ["saas", "cloud-provider", "web-hosting"] },
  { key: "car-rental", label: "Car rentals", priority: 90, why: ["bookings", "checkout", "mobile"], reason: "Travellers book cars on a phone; a form that fails sends them to the aggregators.",
    places: t("car rental", "alquiler de autos", "aluguel de carros", "Autovermietung", "location de voitures", "noleggio auto"), peers: ["car-rental"] },
  { key: "vacation-rental", label: "Vacation rentals", priority: 90, why: ["bookings", "trust", "seo"], reason: "Owners who take direct bookings compete with Airbnb on trust and speed.",
    places: t("vacation rental", "alquiler vacacional", "aluguel de temporada", "Ferienwohnung", "location de vacances", "casa vacanze"), peers: ["resort", "hostel", "property-management"] },
  { key: "tour-operator", label: "Tourism: tours and travel agencies", priority: 89, why: ["bookings", "seo", "mobile"], reason: "Tours are found in search and booked online, often from abroad and on mobile.",
    places: t("tour operator", "agencia de viajes", "agência de viagens", "Reisebüro", "agence de voyages", "agenzia di viaggi"), peers: ["travel-agency", "tour-operator", "online-travel", "cruise-line"] },
  { key: "software-dev", label: "Software development companies", priority: 88, why: ["leads", "trust", "seo"], reason: "Their own site is their portfolio: QA gaps on it undercut the work they sell.",
    places: t("software development company", "empresa de desarrollo de software", "empresa de desenvolvimento de software", "Softwareentwicklung", "société de développement logiciel", "sviluppo software"),
    peers: ["software-development", "app-development", "it-services", "cybersecurity", "game-studio"] },
  { key: "agency", label: "Marketing and web agencies", priority: 87, why: ["leads", "seo", "trust"], reason: "Clients judge an agency by its own site's SEO and speed, and agencies resell audits.",
    places: t("digital marketing agency", "agencia de marketing digital", "agência de marketing digital", "Online-Marketing-Agentur", "agence de marketing digital", "agenzia di marketing digitale"),
    peers: ["marketing-agency", "web-agency", "pr-agency"] },
  { key: "lender", label: "Lenders", priority: 86, why: ["trust", "a11y-law", "leads"], reason: "Loan applications happen online; missing security headers look like a phishing risk.",
    places: t("loan company", "préstamos personales", "empréstimo pessoal", "Kreditvermittler", "organisme de crédit", "finanziaria prestiti"), peers: ["microfinance", "credit-union"] },
  { key: "fintech", label: "Fintech", priority: 86, why: ["trust", "leads", "a11y-law"], reason: "Sign-ups depend on looking secure; regulators expect accessible financial services.",
    places: t("fintech company", "fintech", "fintech", "Fintech", "fintech", "fintech"), peers: ["payments", "digital-bank", "stock-broker", "asset-manager"] },
  { key: "realestate", label: "Real estate", priority: 85, why: ["leads", "seo", "mobile"], reason: "Listings and viewing requests come through the site, mostly from phones.",
    places: t("real estate agency", "inmobiliaria", "imobiliária", "Immobilienmakler", "agence immobilière", "agenzia immobiliare"), peers: ["real-estate", "property-portal", "property-management"] },
  { key: "marketplace", label: "Marketplaces", priority: 85, why: ["checkout", "seo", "trust"], reason: "Two-sided traffic lives on search pages and listings; broken links and slow pages cost both sides.",
    places: null, search: t("online marketplace", "marketplace online", "marketplace online", "Online-Marktplatz", "place de marché en ligne", "marketplace online"),
    peers: ["marketplace", "used-car-marketplace", "property-portal"] },
  { key: "bank", label: "Banks", priority: 84, why: ["trust", "a11y-law", "security"], reason: "The European Accessibility Act covers banking since June 2025; trust is the product.",
    places: t("bank", "banco", "banco", "Bank", "banque", "banca"), peers: ["bank", "digital-bank", "credit-union"] },
  { key: "dentist", label: "Dentists", priority: 84, why: ["bookings", "seo", "mobile"], reason: "Patients pick a dentist from local search and book from the site.",
    places: t("dentist", "dentista", "dentista", "Zahnarzt", "dentiste", "dentista"), peers: ["dental-clinic"] },
  { key: "insurance", label: "Insurance", priority: 83, why: ["leads", "trust", "a11y-law"], reason: "Quotes start online, and insurers fall under accessibility and consumer law.",
    places: t("insurance agency", "aseguradora", "seguradora", "Versicherungsagentur", "agence d'assurance", "agenzia assicurativa"), peers: ["insurance", "health-insurance"] },
  { key: "clinic", label: "Clinics", priority: 82, why: ["bookings", "a11y-law", "trust"], reason: "Appointments are booked online, and health sites are held to accessibility law.",
    places: t("medical clinic", "clínica médica", "clínica médica", "Arztpraxis", "clinique médicale", "clinica medica"),
    peers: ["clinic", "hospital", "telemedicine", "diagnostic-lab", "eye-clinic", "fertility-clinic", "cosmetic-surgery", "mental-health"] },
  { key: "electronics", label: "Electronics stores", priority: 82, why: ["checkout", "seo", "mobile"], reason: "Shoppers compare specs and prices online before they buy, in store or on the site.",
    places: t("electronics store", "tienda de electrónica", "loja de eletrônicos", "Elektronikgeschäft", "magasin d'électronique", "negozio di elettronica"),
    peers: ["electronics-retailer", "electronics-maker", "appliance-maker", "computer-maker"] },
  { key: "airline", label: "Airlines", priority: 80, why: ["bookings", "a11y-law", "checkout"], reason: "Ticket sales run on the site; airline sites have their own accessibility rules (US DOT, EAA).",
    places: t("airline office", "aerolínea", "companhia aérea", "Fluggesellschaft", "compagnie aérienne", "compagnia aerea"), peers: ["airline", "airport"] },
  { key: "restaurant", label: "Restaurants", priority: 80, why: ["bookings", "mobile", "seo"], reason: "Menus, reservations and delivery orders are opened on phones from map search.",
    places: t("restaurant", "restaurante", "restaurante", "Restaurant", "restaurant", "ristorante"), peers: ["restaurant-chain", "fast-food", "coffee-chain", "food-delivery"] },
  { key: "retail", label: "Stores of all kinds", priority: 80, why: ["checkout", "seo", "mobile"], reason: "Shoppers check stock, hours and prices on the site before they visit or order.",
    places: t("boutique", "tienda de ropa", "loja de roupas", "Boutique", "boutique de vêtements", "negozio di abbigliamento"),
    peers: ["fashion-retailer", "department-store", "bookstore", "toy-store", "sporting-goods-store", "jewelry-store", "optician", "florist", "pet-store", "bicycle-shop", "convenience-store", "supermarket", "apparel-brand", "footwear-brand"] },
  { key: "education", label: "Education providers", priority: 80, why: ["leads", "a11y-law", "seo"], reason: "Enrolments start on the site, and schools are among the first held to accessibility law.",
    places: t("language school", "academia de idiomas", "escola de idiomas", "Sprachschule", "école de langues", "scuola di lingue"),
    peers: ["private-school", "international-school", "language-school", "coding-bootcamp", "online-learning", "driving-school", "music-school"] },
  { key: "event-venue", label: "Event venues", priority: 80, why: ["bookings", "leads", "mobile"], reason: "Weddings and corporate events are shortlisted from photos and forms on the site.",
    places: t("event venue", "salón de eventos", "espaço para eventos", "Eventlocation", "salle de réception", "location per eventi"), peers: ["event-venue", "wedding-venue", "coworking"] },
  { key: "crypto", label: "Crypto", priority: 78, why: ["trust", "security", "leads"], reason: "One missing security header reads as risk to people about to deposit money.",
    places: t("crypto exchange", "exchange de criptomonedas", "corretora de criptomoedas", "Kryptobörse", "plateforme crypto", "exchange criptovalute"), peers: ["crypto-exchange"] },
  { key: "lawyer", label: "Law firms", priority: 78, why: ["leads", "trust", "seo"], reason: "Clients find lawyers in local search and judge them by the site before they call.",
    places: t("law firm", "abogados", "advogados", "Rechtsanwalt", "avocat", "avvocato"), peers: ["law-firm", "notary", "accounting-firm"] },
  { key: "equipment-rental", label: "Equipment and tool rentals", priority: 78, why: ["bookings", "leads", "seo"], reason: "Contractors check availability and request quotes online.",
    places: t("equipment rental", "alquiler de maquinaria", "locação de equipamentos", "Maschinenverleih", "location de matériel", "noleggio attrezzature"), peers: ["construction-equipment", "agri-machinery"] },
  { key: "ticketing", label: "Ticketing and attractions", priority: 77, why: ["checkout", "mobile", "a11y-law"], reason: "Ticket sales spike on phones; an inaccessible checkout is both lost sales and legal risk.",
    places: null, search: t("event tickets online", "venta de boletos para eventos", "venda de ingressos online", "Tickets online kaufen", "billetterie en ligne", "biglietteria online"),
    peers: ["ticketing", "cinema-chain", "theme-park", "museum", "zoo-aquarium"] },
  { key: "car-dealer", label: "Car dealers", priority: 76, why: ["leads", "seo", "mobile"], reason: "Buyers browse stock and book test drives online.",
    places: t("car dealership", "concesionario de autos", "concessionária de veículos", "Autohaus", "concessionnaire automobile", "concessionaria auto"), peers: ["car-dealer", "motorcycle-dealer", "truck-dealer"] },
  { key: "media", label: "Media and publishers", priority: 76, why: ["seo", "a11y-law", "mobile"], reason: "Ad and subscription revenue follow search and AI-answer traffic, page speed and accessibility.",
    places: t("news publisher", "periódico", "jornal", "Zeitungsverlag", "journal", "giornale"),
    peers: ["newspaper", "magazine", "tv-station", "radio-station", "podcast-network", "book-publisher", "streaming-service"] },
  { key: "transport", label: "Passenger transportation", priority: 75, why: ["bookings", "mobile", "a11y-law"], reason: "Tickets and schedules are checked on phones; transport is covered by the EAA.",
    places: t("bus company", "empresa de transporte de pasajeros", "empresa de ônibus", "Busunternehmen", "compagnie de transport", "compagnia di trasporti"),
    peers: ["bus-operator", "rail-operator", "ride-hailing", "public-transit", "bike-scooter-sharing", "moving-company"] },
  { key: "gadgets", label: "Gadgets and accessories", priority: 75, why: ["checkout", "seo", "mobile"], reason: "Small-ticket impulse buys: every extra second and broken link costs conversions.",
    places: t("phone accessories store", "tienda de accesorios para celulares", "loja de acessórios para celular", "Handyzubehör", "accessoires téléphone", "accessori cellulari"),
    peers: ["phone-maker", "electronics-maker"] },
  { key: "pharmacy", label: "Pharmacies", priority: 74, why: ["checkout", "a11y-law", "trust"], reason: "Online orders and refill requests, from a public that relies on accessibility.",
    places: t("pharmacy", "farmacia", "farmácia", "Apotheke", "pharmacie", "farmacia"), peers: ["pharmacy-chain"] },
  { key: "gym", label: "Gyms", priority: 74, why: ["bookings", "mobile", "seo"], reason: "Memberships and class bookings are bought on phones from local search.",
    places: t("gym", "gimnasio", "academia", "Fitnessstudio", "salle de sport", "palestra"), peers: ["gym", "sports-club"] },
  { key: "home-store", label: "Furniture and home stores", priority: 74, why: ["checkout", "seo", "mobile"], reason: "Big-ticket items are researched online for weeks before the purchase.",
    places: t("furniture store", "tienda de muebles", "loja de móveis", "Möbelhaus", "magasin de meubles", "negozio di mobili"),
    peers: ["furniture-store", "home-improvement", "mattress-store", "furniture-maker"] },
  { key: "logistics", label: "Logistics and couriers", priority: 72, why: ["leads", "trust", "seo"], reason: "Quote forms and shipment tracking are the site's job; B2B buyers judge reliability by it.",
    places: t("logistics company", "empresa de logística", "transportadora", "Spedition", "entreprise de logistique", "azienda di logistica"),
    peers: ["courier", "freight-forwarder", "trucking", "shipping-line", "warehousing", "postal-service"] },
  { key: "construction", label: "Construction companies", priority: 72, why: ["leads", "trust", "seo"], reason: "Projects start with a search and a quote request; the site is the portfolio.",
    places: t("construction company", "constructora", "construtora", "Bauunternehmen", "entreprise de construction", "impresa edile"),
    peers: ["construction-company", "real-estate-developer", "civil-engineering", "architecture-firm"] },
  { key: "salon", label: "Beauty salons", priority: 72, why: ["bookings", "mobile", "seo"], reason: "Appointments are booked on phones straight from map search.",
    places: t("hair salon", "peluquería", "salão de beleza", "Friseur", "salon de coiffure", "parrucchiere"), peers: ["beauty-salon"] },
  { key: "drinks", label: "Drinks: breweries, wineries, distilleries", priority: 70, why: ["checkout", "seo", "mobile"], reason: "Direct-to-consumer shops and tasting bookings run on the brand's own site.",
    places: t("brewery", "cervecería artesanal", "cervejaria artesanal", "Brauerei", "brasserie artisanale", "birrificio artigianale"), peers: ["beverage-maker", "brewery", "winery", "distillery"] },
  { key: "food-brand", label: "Food brands and producers", priority: 70, why: ["checkout", "seo", "trust"], reason: "Webshops, stockist pages and wholesale enquiries depend on the site.",
    places: t("food producer", "productos gourmet", "produtos artesanais", "Feinkost", "épicerie fine", "prodotti tipici"), peers: ["food-maker", "confectionery", "dairy", "coffee-roaster", "meat-processor"] },
  { key: "creator", label: "Influencers and creators with their own shop", priority: 70, why: ["checkout", "mobile", "seo"], reason: "Followers land from a link in bio on a phone; a slow shop loses the moment.",
    places: null, search: t("content creator official store", "creador de contenido tienda oficial", "criador de conteúdo loja oficial", "Influencer offizieller Shop", "créateur de contenu boutique officielle", "influencer shop ufficiale"),
    peers: [] },
  { key: "supplier", label: "Suppliers and wholesalers", priority: 70, why: ["leads", "seo", "trust"], reason: "B2B buyers shortlist suppliers from search and catalogue pages.",
    places: t("wholesale distributor", "distribuidor mayorista", "distribuidora atacadista", "Großhändler", "grossiste", "grossista"),
    peers: ["plastics-packaging", "industrial-machinery", "chemicals", "paper", "textile"] },
  { key: "spa", label: "Spas", priority: 70, why: ["bookings", "mobile", "seo"], reason: "Treatments and gift cards are booked and bought online.",
    places: t("day spa", "spa", "spa", "Day Spa", "spa", "centro benessere"), peers: ["spa-wellness"] },
  { key: "gov-supplier", label: "Government suppliers", priority: 68, why: ["a11y-law", "trust", "security"], reason: "Public tenders ask for accessible, secure sites (Section 508, EN 301 549).",
    places: null, search: t("government contractor", "proveedor del estado", "fornecedor do governo", "Lieferant öffentliche Hand", "fournisseur marchés publics", "fornitore pubblica amministrazione"),
    peers: ["it-services", "consulting", "security-services", "cleaning-services", "engineering-consultancy"] },
  { key: "physio", label: "Physiotherapists", priority: 66, why: ["bookings", "seo", "mobile"], reason: "Patients book sessions from local search.",
    places: t("physiotherapist", "fisioterapeuta", "fisioterapeuta", "Physiotherapie", "kinésithérapeute", "fisioterapista"), peers: ["physiotherapy"] },
  { key: "vet", label: "Veterinarians", priority: 66, why: ["bookings", "seo", "mobile"], reason: "Pet owners search, call and book from the phone, often in a hurry.",
    places: t("veterinarian", "veterinaria", "veterinário", "Tierarzt", "vétérinaire", "veterinario"), peers: ["veterinary"] },
  { key: "nonprofit", label: "Nonprofits", priority: 65, why: ["checkout", "a11y-law", "seo"], reason: "Donations and volunteer sign-ups happen on the site, which must be usable by everyone.",
    places: t("nonprofit organization", "fundación", "ONG", "gemeinnütziger Verein", "association", "associazione no profit"), peers: ["ngo", "foundation", "chamber-of-commerce", "trade-association"] }
];

const BY_KEY = Object.fromEntries(SECTORS.map((s) => [s.key, s]));

/** The sector for a key, or null. */
const sectorOf = (key) => BY_KEY[String(key || "")] || null;

/** Every sector, highest priority first (stable for ties). */
const ranked = () => SECTORS.slice().sort((a, b) => b.priority - a.priority);

/** New prospects a sector may add in one night: 10 from priority 85, 8 from 75, 6 from 70, else 4. */
function capOf(key) {
  const p = (sectorOf(key) || {}).priority || 0;
  return p >= 85 ? 10 : p >= 75 ? 8 : p >= 70 ? 6 : 4;
}

/** The Places search terms of every sector Maps lists, highest priority first: { key: { en, es, ... } }. */
function placesTerms() {
  return Object.fromEntries(ranked().filter((s) => s.places).map((s) => [s.key, s.places]));
}

/** The web search query for a sector in a language and, when given, a city. */
function searchOf(key, lang, city) {
  const s = sectorOf(key);
  if (!s) return "";
  const terms = s.search || s.places;
  const q = terms[lang] || terms.en;
  return city ? q + " " + city : q;
}

/** peer-sectors.json key -> the site-dependency sector that covers it. */
const PEER_TO_SECTOR = (() => {
  const out = {};
  ranked().forEach((s) => s.peers.forEach((p) => { if (!out[p]) out[p] = s.key; }));
  return out;
})();

/** The site-dependency sector for a sweep sector or a peer-sectors key, or "". */
function matchSector(key) {
  const k = String(key || "").toLowerCase();
  if (BY_KEY[k]) return k;
  return PEER_TO_SECTOR[k] || "";
}

/** The review areas that matter most to a sector, in order, without repeats. */
function areasOf(key) {
  const s = sectorOf(key);
  const out = [];
  ((s && s.why) || []).forEach((w) => ((WHY[w] || {}).areas || []).forEach((a) => { if (!out.includes(a)) out.push(a); }));
  return out;
}

module.exports = { LANGS, WHY, SECTORS, sectorOf, ranked, capOf, placesTerms, searchOf, matchSector, areasOf, PEER_TO_SECTOR };
