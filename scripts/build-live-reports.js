#!/usr/bin/env node
/* Build the public Live Reports from saved review snapshots.

   Reads previews/insights-test/<report>-current.json (never served, never committed) and writes
   trimmed, public-safe copies to assets/live-reports/<id>.json plus an index.json manifest with tags.

     node scripts/build-live-reports.js                 # every id in RUN_FILES whose report exists
     node scripts/build-live-reports.js govuk bbc nasa  # only these ids
     node scripts/build-live-reports.js --check         # exit 1 if a listed report is missing

   Ids and the verified headline copy come from scripts/tips-studio/runs.js, runs-100.js and the
   runs-3/{worldwide,national,regional,local}.js scope files. Only their `const RUNS = [` or
   `module.exports = [` array is read as text and evaluated in a sandbox, so their own report reads
   never run here. Tags come from
   the report itself, plus the small curated map below (sector, organization type, city, country).
   Reports from user reviews (series "auto") are added by scripts/auto-live-reports.js and kept here. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "previews/insights-test");
const OUT = path.join(ROOT, "assets/live-reports");
const RUN_FILES = [
  { file: "scripts/tips-studio/runs.js", series: "runs-2026-10" },
  { file: "scripts/tips-studio/runs-100.js", series: "runs-100" },
  { file: "scripts/tips-studio/runs-3/worldwide.js", series: "runs-3" },
  { file: "scripts/tips-studio/runs-3/national.js", series: "runs-3" },
  { file: "scripts/tips-studio/runs-3/regional.js", series: "runs-3" },
  { file: "scripts/tips-studio/runs-3/local.js", series: "runs-3" }
];
const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];

const SECTORS = {
  government: "Government",
  health: "Public health",
  media: "News & media",
  banking: "Banking & finance",
  fintech: "Fintech",
  transit: "Transit & mobility",
  opensource: "Open source",
  devdocs: "Developer docs",
  science: "Space & science",
  highered: "Higher education",
  education: "Education",
  humanitarian: "Humanitarian",
  international: "International organizations",
  culture: "Museums, libraries & culture",
  knowledge: "Open knowledge",
  retail: "Retail & e-commerce",
  telecom: "Telecom",
  energy: "Energy & utilities",
  travel: "Travel & tourism",
  airline: "Airline",
  insurance: "Insurance & health plans",
  infrastructure: "Internet infrastructure",
  standards: "Web standards",
  sports: "Sports & recreation",
  apps: "Apps & delivery",
  rights: "Human & digital rights",
  environment: "Environment & climate"
};

const ORGS = {
  national: "National government",
  regional: "Regional government",
  city: "City government",
  agency: "Public agency",
  igo: "Intergovernmental",
  nonprofit: "Nonprofit",
  company: "Company",
  stateco: "State-owned company",
  university: "University",
  project: "Open-source project",
  broadcaster: "Public broadcaster"
};

// id: [display name, sector, organization type, city, ISO country]. Empty city and country mean a
// distributed project or an organization whose head office is not stated here.
const META = {
  govuk: ["GOV.UK", "government", "national", "London", "GB"],
  bogota: ["Alcaldía de Bogotá", "government", "city", "Bogotá", "CO"],
  who: ["World Health Organization", "health", "igo", "Geneva", "CH"],
  govco: ["GOV.CO", "government", "national", "Bogotá", "CO"],
  bbc: ["BBC", "media", "broadcaster", "London", "GB"],
  transmilenio: ["TransMilenio", "transit", "agency", "Bogotá", "CO"],
  python: ["Python.org", "opensource", "project", "", ""],
  bancolombia: ["Bancolombia", "banking", "company", "Medellín", "CO"],
  un: ["United Nations", "international", "igo", "New York", "US"],
  nasa: ["NASA", "science", "agency", "Washington, D.C.", "US"],
  wikipedia: ["Wikipedia", "knowledge", "nonprofit", "San Francisco", "US"],
  mozilla: ["Mozilla", "opensource", "nonprofit", "San Francisco", "US"],
  mdn: ["MDN Web Docs", "devdocs", "nonprofit", "San Francisco", "US"],
  w3c: ["W3C", "standards", "nonprofit", "", ""],
  unesco: ["UNESCO", "international", "igo", "Paris", "FR"],
  unicef: ["UNICEF", "humanitarian", "igo", "New York", "US"],
  worldbank: ["World Bank", "banking", "igo", "Washington, D.C.", "US"],
  icrc: ["ICRC", "humanitarian", "nonprofit", "Geneva", "CH"],
  msf: ["Médecins Sans Frontières", "humanitarian", "nonprofit", "Geneva", "CH"],
  amnesty: ["Amnesty International", "rights", "nonprofit", "London", "GB"],
  guardian: ["The Guardian", "media", "company", "London", "GB"],
  aljazeera: ["Al Jazeera", "media", "broadcaster", "Doha", "QA"],
  dw: ["Deutsche Welle", "media", "broadcaster", "Bonn", "DE"],
  elpais: ["El País", "media", "company", "Madrid", "ES"],
  lemonde: ["Le Monde", "media", "company", "Paris", "FR"],
  mit: ["MIT", "highered", "university", "Cambridge, MA", "US"],
  stanford: ["Stanford University", "highered", "university", "Stanford", "US"],
  harvard: ["Harvard University", "highered", "university", "Cambridge, MA", "US"],
  nodejs: ["Node.js", "opensource", "project", "", ""],
  rust: ["Rust", "opensource", "project", "", ""],
  kubernetes: ["Kubernetes", "opensource", "project", "", ""],
  apache: ["Apache Software Foundation", "opensource", "nonprofit", "", ""],
  linuxfoundation: ["Linux Foundation", "opensource", "nonprofit", "San Francisco", "US"],
  react: ["React", "devdocs", "project", "", ""],
  githubdocs: ["GitHub Docs", "devdocs", "company", "San Francisco", "US"],
  stripedocs: ["Stripe Docs", "devdocs", "company", "South San Francisco", "US"],
  cloudflare: ["Cloudflare", "infrastructure", "company", "San Francisco", "US"],
  webdev: ["web.dev", "devdocs", "company", "Mountain View", "US"],
  louvre: ["Musée du Louvre", "culture", "agency", "Paris", "FR"],
  rijksmuseum: ["Rijksmuseum", "culture", "agency", "Amsterdam", "NL"],
  lonelyplanet: ["Lonely Planet", "travel", "company", "", ""],
  ikea: ["IKEA", "retail", "company", "", ""],
  gutenberg: ["Project Gutenberg", "knowledge", "project", "", ""],
  creativecommons: ["Creative Commons", "knowledge", "nonprofit", "", ""],
  eff: ["Electronic Frontier Foundation", "rights", "nonprofit", "San Francisco", "US"],
  wikimedia: ["Wikimedia Foundation", "knowledge", "nonprofit", "San Francisco", "US"],
  fao: ["FAO", "international", "igo", "Rome", "IT"],
  wfp: ["World Food Programme", "humanitarian", "igo", "Rome", "IT"],
  esa: ["European Space Agency", "science", "igo", "Paris", "FR"],
  cern: ["CERN", "science", "igo", "Geneva", "CH"],
  natgeo: ["National Geographic", "media", "company", "Washington, D.C.", "US"],
  coursera: ["Coursera", "education", "company", "Mountain View", "US"],
  php: ["PHP", "opensource", "project", "", ""],
  gnu: ["GNU Project", "opensource", "project", "", ""],
  debian: ["Debian", "opensource", "project", "", ""],
  ubuntu: ["Ubuntu", "opensource", "company", "London", "GB"],
  paho: ["Pan American Health Organization", "health", "igo", "Washington, D.C.", "US"],
  dian: ["DIAN", "government", "agency", "Bogotá", "CO"],
  mineducacion: ["Ministerio de Educación", "education", "national", "Bogotá", "CO"],
  minsalud: ["Ministerio de Salud", "health", "national", "Bogotá", "CO"],
  mintic: ["MinTIC", "government", "national", "Bogotá", "CO"],
  cancilleria: ["Cancillería de Colombia", "government", "national", "Bogotá", "CO"],
  dane: ["DANE", "government", "agency", "Bogotá", "CO"],
  procuraduria: ["Procuraduría General", "government", "agency", "Bogotá", "CO"],
  icetex: ["ICETEX", "education", "agency", "Bogotá", "CO"],
  icfes: ["ICFES", "education", "agency", "Bogotá", "CO"],
  colpensiones: ["Colpensiones", "government", "stateco", "Bogotá", "CO"],
  migracion: ["Migración Colombia", "government", "agency", "Bogotá", "CO"],
  satena: ["SATENA", "airline", "stateco", "Bogotá", "CO"],
  davivienda: ["Davivienda", "banking", "company", "Bogotá", "CO"],
  movistar: ["Movistar Colombia", "telecom", "company", "Bogotá", "CO"],
  claro: ["Claro Colombia", "telecom", "company", "Bogotá", "CO"],
  exito: ["Éxito", "retail", "company", "Envigado", "CO"],
  falabella: ["Falabella Colombia", "retail", "company", "Bogotá", "CO"],
  eltiempo: ["El Tiempo", "media", "company", "Bogotá", "CO"],
  semana: ["Semana", "media", "company", "Bogotá", "CO"],
  elespectador: ["El Espectador", "media", "company", "Bogotá", "CO"],
  uniandes: ["Universidad de los Andes", "highered", "university", "Bogotá", "CO"],
  sura: ["SURA", "insurance", "company", "Medellín", "CO"],
  compensar: ["Compensar", "insurance", "nonprofit", "Bogotá", "CO"],
  ecopetrol: ["Ecopetrol", "energy", "stateco", "Bogotá", "CO"],
  rappi: ["Rappi", "apps", "company", "Bogotá", "CO"],
  rtvc: ["RTVC", "media", "broadcaster", "Bogotá", "CO"],
  bibliotecanacional: ["Biblioteca Nacional de Colombia", "culture", "agency", "Bogotá", "CO"],
  supersalud: ["Supersalud", "health", "agency", "Bogotá", "CO"],
  contraloria: ["Contraloría General", "government", "agency", "Bogotá", "CO"],
  procolombia: ["ProColombia", "travel", "agency", "Bogotá", "CO"],
  nequi: ["Nequi", "fintech", "company", "Medellín", "CO"],
  educacionbogota: ["Secretaría de Educación de Bogotá", "education", "city", "Bogotá", "CO"],
  movilidadbogota: ["Secretaría de Movilidad de Bogotá", "transit", "city", "Bogotá", "CO"],
  saludcapital: ["Secretaría de Salud de Bogotá", "health", "city", "Bogotá", "CO"],
  metrobogota: ["Metro de Bogotá", "transit", "stateco", "Bogotá", "CO"],
  idrd: ["IDRD", "sports", "city", "Bogotá", "CO"],
  idartes: ["Idartes", "culture", "city", "Bogotá", "CO"],
  visitbogota: ["Visit Bogotá", "travel", "city", "Bogotá", "CO"],
  biblored: ["BibloRed", "culture", "city", "Bogotá", "CO"],
  catastro: ["Catastro Bogotá", "government", "city", "Bogotá", "CO"],
  jbb: ["Jardín Botánico de Bogotá", "science", "city", "Bogotá", "CO"],
  planetario: ["Planetario de Bogotá", "science", "city", "Bogotá", "CO"],
  antioquia: ["Gobernación de Antioquia", "government", "regional", "Medellín", "CO"],
  medellin: ["Alcaldía de Medellín", "government", "city", "Medellín", "CO"],
  metromedellin: ["Metro de Medellín", "transit", "stateco", "Medellín", "CO"],
  epm: ["EPM", "energy", "stateco", "Medellín", "CO"],
  udea: ["Universidad de Antioquia", "highered", "university", "Medellín", "CO"],
  eafit: ["Universidad EAFIT", "highered", "university", "Medellín", "CO"],
  cali: ["Alcaldía de Cali", "government", "city", "Cali", "CO"],
  metrocali: ["Metrocali", "transit", "stateco", "Cali", "CO"],
  univalle: ["Universidad del Valle", "highered", "university", "Cali", "CO"],
  transcaribe: ["Transcaribe", "transit", "stateco", "Cartagena", "CO"],
  bucaramanga: ["Alcaldía de Bucaramanga", "government", "city", "Bucaramanga", "CO"],
  metrolinea: ["Metrolínea", "transit", "stateco", "Bucaramanga", "CO"],
  pereira: ["Alcaldía de Pereira", "government", "city", "Pereira", "CO"],
  manizales: ["Alcaldía de Manizales", "government", "city", "Manizales", "CO"],
  santamarta: ["Alcaldía de Santa Marta", "government", "city", "Santa Marta", "CO"],
  acueducto: ["Acueducto de Bogotá", "energy", "stateco", "Bogotá", "CO"],
  archive: ["Internet Archive", "knowledge", "nonprofit", "San Francisco", "US"],
  banrep: ["Banco de la República", "banking", "agency", "Bogotá", "CO"],
  barranquilla: ["Alcaldía de Barranquilla", "government", "city", "Barranquilla", "CO"],
  blaa: ["Biblioteca Luis Ángel Arango", "culture", "agency", "Bogotá", "CO"],
  britishmuseum: ["British Museum", "culture", "agency", "London", "GB"],
  cartagena: ["Alcaldía de Cartagena", "government", "city", "Cartagena", "CO"],
  cepal: ["CEPAL", "international", "igo", "Santiago", "CL"],
  concejobogota: ["Concejo de Bogotá", "government", "city", "Bogotá", "CO"],
  django: ["Django", "opensource", "project", "", ""],
  duolingo: ["Duolingo", "education", "company", "Pittsburgh", "US"],
  fifa: ["FIFA", "sports", "nonprofit", "Zurich", "CH"],
  haciendabogota: ["Secretaría de Hacienda de Bogotá", "government", "city", "Bogotá", "CO"],
  iadb: ["Inter-American Development Bank", "banking", "igo", "Washington, D.C.", "US"],
  idu: ["IDU Bogotá", "government", "city", "Bogotá", "CO"],
  imf: ["IMF", "banking", "igo", "Washington, D.C.", "US"],
  khan: ["Khan Academy", "education", "nonprofit", "Mountain View", "US"],
  moma: ["MoMA", "culture", "nonprofit", "New York", "US"],
  nuevaeps: ["Nueva EPS", "insurance", "company", "Bogotá", "CO"],
  oxford: ["University of Oxford", "highered", "university", "Oxford", "GB"],
  presidencia: ["Presidencia de Colombia", "government", "national", "Bogotá", "CO"],
  registraduria: ["Registraduría Nacional", "government", "agency", "Bogotá", "CO"],
  sena: ["SENA", "education", "agency", "Bogotá", "CO"],
  sic: ["Superintendencia de Industria y Comercio", "government", "agency", "Bogotá", "CO"],
  tigo: ["Tigo Colombia", "telecom", "company", "Medellín", "CO"],
  transmetro: ["Transmetro", "transit", "stateco", "Barranquilla", "CO"],
  uis: ["Universidad Industrial de Santander", "highered", "university", "Bucaramanga", "CO"],
  uninorte: ["Universidad del Norte", "highered", "university", "Barranquilla", "CO"],
  unhcr: ["UNHCR", "humanitarian", "igo", "Geneva", "CH"],
  // Series three (runs-3): worldwide
  ilo: ["International Labour Organization", "international", "igo", "Geneva", "CH"],
  wto: ["World Trade Organization", "international", "igo", "Geneva", "CH"],
  wmo: ["World Meteorological Organization", "environment", "igo", "Geneva", "CH"],
  itu: ["ITU", "telecom", "igo", "Geneva", "CH"],
  ipcc: ["IPCC", "environment", "igo", "Geneva", "CH"],
  unwomen: ["UN Women", "rights", "igo", "New York", "US"],
  ietf: ["IETF", "standards", "nonprofit", "", ""],
  postgresql: ["PostgreSQL", "opensource", "project", "", ""],
  golang: ["Go", "opensource", "project", "", ""],
  typescript: ["TypeScript", "devdocs", "project", "", ""],
  vuejs: ["Vue.js", "devdocs", "project", "", ""],
  unicode: ["Unicode", "standards", "nonprofit", "Mountain View", "US"],
  blender: ["Blender", "opensource", "nonprofit", "Amsterdam", "NL"],
  openstreetmap: ["OpenStreetMap", "knowledge", "project", "", ""],
  gitlab: ["GitLab", "opensource", "company", "San Francisco", "US"],
  shopify: ["Shopify", "retail", "company", "Ottawa", "CA"],
  figma: ["Figma", "apps", "company", "San Francisco", "US"],
  oneworld: ["oneworld", "airline", "company", "New York", "US"],
  worldathletics: ["World Athletics", "sports", "nonprofit", "Monaco", "MC"],
  fiba: ["FIBA", "sports", "nonprofit", "Mies", "CH"],
  wipo: ["WIPO", "international", "igo", "Geneva", "CH"],
  oxfam: ["Oxfam International", "humanitarian", "nonprofit", "Nairobi", "KE"],
  ted: ["TED", "media", "nonprofit", "New York", "US"],
  icann: ["ICANN", "infrastructure", "nonprofit", "Los Angeles", "US"],
  gavi: ["Gavi, the Vaccine Alliance", "health", "nonprofit", "Geneva", "CH"],
  scouts: ["World Organization of the Scout Movement", "education", "nonprofit", "Kuala Lumpur", "MY"],
  globalfund: ["The Global Fund", "health", "nonprofit", "Geneva", "CH"],
  fide: ["FIDE", "sports", "nonprofit", "Lausanne", "CH"],
  isoc: ["Internet Society", "infrastructure", "nonprofit", "Reston", "US"],
  libreoffice: ["LibreOffice", "opensource", "project", "", ""],
  msc: ["Marine Stewardship Council", "environment", "nonprofit", "London", "GB"],
  // Series three: national
  policiaco: ["Policía Nacional de Colombia", "government", "agency", "Bogotá", "CO"],
  gobmx: ["gob.mx", "government", "national", "Mexico City", "MX"],
  fiscaliaco: ["Fiscalía General de la Nación", "government", "agency", "Bogotá", "CO"],
  argentinagob: ["Argentina.gob.ar", "government", "national", "Buenos Aires", "AR"],
  igac: ["IGAC", "government", "agency", "Bogotá", "CO"],
  gobpe: ["gob.pe", "government", "national", "Lima", "PE"],
  ramajudicial: ["Rama Judicial", "government", "agency", "Bogotá", "CO"],
  gobec: ["gob.ec", "government", "national", "Quito", "EC"],
  corteconst: ["Corte Constitucional", "government", "agency", "Bogotá", "CO"],
  gobes: ["Punto de Acceso General", "government", "national", "Madrid", "ES"],
  superfinanciera: ["Superintendencia Financiera", "banking", "agency", "Bogotá", "CO"],
  govbr: ["GOV.BR", "government", "national", "Brasília", "BR"],
  supersociedades: ["Superintendencia de Sociedades", "government", "agency", "Bogotá", "CO"],
  canadaca: ["Canada.ca", "government", "national", "Ottawa", "CA"],
  fnaco: ["Fondo Nacional del Ahorro", "banking", "stateco", "Bogotá", "CO"],
  mygovau: ["myGov", "government", "national", "Canberra", "AU"],
  insco: ["Instituto Nacional de Salud", "health", "agency", "Bogotá", "CO"],
  govtnz: ["Govt.nz", "government", "national", "Wellington", "NZ"],
  invima: ["Invima", "health", "agency", "Bogotá", "CO"],
  eestiee: ["Eesti.ee", "government", "national", "Tallinn", "EE"],
  ideam: ["IDEAM", "environment", "agency", "Bogotá", "CO"],
  govsg: ["gov.sg", "government", "national", "Singapore", "SG"],
  alkosto: ["Alkosto", "retail", "company", "Bogotá", "CO"],
  suomifi: ["Suomi.fi", "government", "national", "Helsinki", "FI"],
  caracoltv: ["Caracol Televisión", "media", "company", "Bogotá", "CO"],
  usagov: ["USAGov", "government", "national", "Washington, D.C.", "US"],
  isaco: ["ISA", "energy", "company", "Medellín", "CO"],
  defensoriaco: ["Defensoría del Pueblo", "rights", "agency", "Bogotá", "CO"],
  mincit: ["MinCIT", "government", "national", "Bogotá", "CO"],
  anico: ["Agencia Nacional de Infraestructura", "transit", "agency", "Bogotá", "CO"],
  // Series three: regional
  valle: ["Gobernación del Valle del Cauca", "government", "regional", "Cali", "CO"],
  cundinamarca: ["Gobernación de Cundinamarca", "government", "regional", "Bogotá", "CO"],
  atlantico: ["Gobernación del Atlántico", "government", "regional", "Barranquilla", "CO"],
  santander: ["Gobernación de Santander", "government", "regional", "Bucaramanga", "CO"],
  bolivar: ["Gobernación de Bolívar", "government", "regional", "Cartagena", "CO"],
  narino: ["Gobernación de Nariño", "government", "regional", "Pasto", "CO"],
  risaralda: ["Gobernación de Risaralda", "government", "regional", "Pereira", "CO"],
  caldas: ["Gobernación de Caldas", "government", "regional", "Manizales", "CO"],
  tolima: ["Gobernación del Tolima", "government", "regional", "Ibagué", "CO"],
  cauca: ["Gobernación del Cauca", "government", "regional", "Popayán", "CO"],
  cvc: ["CVC", "environment", "agency", "Cali", "CO"],
  cornare: ["Cornare", "environment", "agency", "El Santuario", "CO"],
  quindio: ["Gobierno del Quindío", "government", "regional", "Armenia", "CO"],
  uniatlantico: ["Universidad del Atlántico", "highered", "university", "Puerto Colombia", "CO"],
  oas: ["Organization of American States", "international", "igo", "Washington, D.C.", "US"],
  comunidadandina: ["Comunidad Andina", "international", "igo", "Lima", "PE"],
  caricom: ["CARICOM", "international", "igo", "Georgetown", "GY"],
  africanunion: ["African Union", "international", "igo", "Addis Ababa", "ET"],
  bcie: ["BCIE", "banking", "igo", "Tegucigalpa", "HN"],
  caribank: ["Caribbean Development Bank", "banking", "igo", "St. Michael", "BB"],
  gencat: ["Generalitat de Catalunya", "government", "regional", "Barcelona", "ES"],
  bayern: ["Freistaat Bayern", "government", "regional", "Munich", "DE"],
  cagov: ["CA.gov", "government", "regional", "Sacramento", "US"],
  ontario: ["Ontario.ca", "government", "regional", "Toronto", "CA"],
  quebec: ["Québec.ca", "government", "regional", "Québec City", "CA"],
  gba: ["Provincia de Buenos Aires", "government", "regional", "La Plata", "AR"],
  jalisco: ["Gobierno de Jalisco", "government", "regional", "Guadalajara", "MX"],
  victoria: ["Victorian Government", "government", "regional", "Melbourne", "AU"],
  nsw: ["NSW Government", "government", "regional", "Sydney", "AU"],
  // Series three: local
  armenia: ["Alcaldía de Armenia", "government", "city", "Armenia", "CO"],
  ibague: ["Alcaldía de Ibagué", "government", "city", "Ibagué", "CO"],
  neiva: ["Alcaldía de Neiva", "government", "city", "Neiva", "CO"],
  villavicencio: ["Alcaldía de Villavicencio", "government", "city", "Villavicencio", "CO"],
  pasto: ["Alcaldía de Pasto", "government", "city", "Pasto", "CO"],
  popayan: ["Alcaldía de Popayán", "government", "city", "Popayán", "CO"],
  tunja: ["Alcaldía de Tunja", "government", "city", "Tunja", "CO"],
  cucuta: ["Alcaldía de Cúcuta", "government", "city", "Cúcuta", "CO"],
  monteria: ["Alcaldía de Montería", "government", "city", "Montería", "CO"],
  riohacha: ["Alcaldía Distrital de Riohacha", "government", "city", "Riohacha", "CO"],
  soacha: ["Alcaldía de Soacha", "government", "city", "Soacha", "CO"],
  bello: ["Alcaldía de Bello", "government", "city", "Bello", "CO"],
  itagui: ["Alcaldía de Itagüí", "government", "city", "Itagüí", "CO"],
  palmira: ["Alcaldía de Palmira", "government", "city", "Palmira", "CO"],
  sdp: ["Secretaría Distrital de Planeación", "government", "city", "Bogotá", "CO"],
  ambientebogota: ["Secretaría Distrital de Ambiente", "environment", "city", "Bogotá", "CO"],
  uaesp: ["UAESP", "energy", "city", "Bogotá", "CO"],
  canalcapital: ["Canal Capital", "media", "broadcaster", "Bogotá", "CO"],
  metroplus: ["Metroplús", "transit", "stateco", "Medellín", "CO"],
  madrid: ["Ayuntamiento de Madrid", "government", "city", "Madrid", "ES"],
  barcelona: ["Ajuntament de Barcelona", "government", "city", "Barcelona", "ES"],
  buenosaires: ["Buenos Aires Ciudad", "government", "city", "Buenos Aires", "AR"],
  munistgo: ["Ilustre Municipalidad de Santiago", "government", "city", "Santiago", "CL"],
  quito: ["Municipio de Quito", "government", "city", "Quito", "EC"],
  paris: ["Ville de Paris", "government", "city", "Paris", "FR"],
  nyc: ["NYC.gov", "government", "city", "New York", "US"],
  tfl: ["Transport for London", "transit", "agency", "London", "GB"],
  montevideo: ["Intendencia de Montevideo", "government", "city", "Montevideo", "UY"],
  inder: ["Inder Medellín", "sports", "agency", "Medellín", "CO"],
  bibliotecasmedellin: ["Bibliotecas Públicas de Medellín", "culture", "city", "Medellín", "CO"],
  idpc: ["Instituto Distrital de Patrimonio Cultural", "culture", "agency", "Bogotá", "CO"],
  culturabogota: ["Secretaría de Cultura, Recreación y Deporte", "culture", "city", "Bogotá", "CO"],
  berlin: ["Berlin.de", "government", "city", "Berlin", "DE"],
  wien: ["Stadt Wien", "government", "city", "Vienna", "AT"]
};

const REGIONS = {
  CO: "Latin America", CL: "Latin America", MX: "Latin America", AR: "Latin America", PE: "Latin America", EC: "Latin America", BR: "Latin America", UY: "Latin America", HN: "Latin America",
  US: "North America", CA: "North America",
  GB: "Europe", FR: "Europe", DE: "Europe", NL: "Europe", ES: "Europe", IT: "Europe", CH: "Europe", EE: "Europe", FI: "Europe", AT: "Europe", MC: "Europe",
  AU: "Asia-Pacific", NZ: "Asia-Pacific", SG: "Asia-Pacific", MY: "Asia-Pacific",
  KE: "Africa", ET: "Africa",
  GY: "Caribbean", BB: "Caribbean",
  QA: "Middle East"
};

// Headline tags from the run copy, folded into the test types a reader can filter on.
const FOCUS = {
  seo: ["SEO", "MetaDescription", "SERP", "Sitemap", "Canonical", "Titles", "RobotsTxt", "BrokenLinks", "Hreflang"],
  geo: ["GEO", "AISearch", "JavaScriptSEO"],
  schema: ["StructuredData"],
  a11y: ["Accessibility", "A11y", "MobileUX", "Forms", "Headings", "Lang", "Zoom", "Landmarks", "Keyboard", "EAA", "Contrast", "ARIA"],
  security: ["WebSecurity", "HSTS", "HTTPS", "CSP", "HTTPHeaders", "Clickjacking", "Headers", "TLS", "Redirects", "MixedContent", "PermissionsPolicy", "SafeBrowsing", "Domains", "EmailSecurity", "MTASTS", "TLSRPT", "Dependencies"],
  performance: ["WebPerformance", "PageWeight", "CoreWebVitals", "LCP", "INP", "TTFB"],
  analytics: ["Analytics", "GA4", "Measurement", "Privacy"],
  i18n: ["i18n", "Multilingual"]
};
const FOCUS_LABELS = { seo: "SEO", geo: "GEO · AI search", schema: "Structured data", a11y: "Accessibility", security: "Security checks", performance: "Performance · Core Web Vitals", analytics: "Analytics & consent", i18n: "Internationalization" };

const SERVER_NAMES = [
  [/^nginx/i, "nginx"], [/^openresty/i, "OpenResty"], [/^apache\b/i, "Apache"], [/^ats\//i, "Apache Traffic Server"],
  [/litespeed/i, "LiteSpeed"], [/microsoft-iis/i, "IIS"], [/^cloudflare$/i, "Cloudflare"], [/^envoy$/i, "Envoy"],
  [/^vercel$/i, "Vercel"], [/^netlify$/i, "Netlify"], [/^github\.com$/i, "GitHub Pages"], [/^google frontend$/i, "Google Frontend"],
  [/^php\//i, "PHP"], [/asp\.net/i, "ASP.NET"], [/^express$/i, "Express"], [/wordpress vip/i, "WordPress VIP"], [/^wp engine$/i, "WP Engine"]
];
const TECH_GROUPS = new Set(["Analytics", "Fonts", "Edge", "Library", "CDN", "CSS", "CMS", "Bot check", "Monitoring", "Framework", "Marketing", "Commerce", "Payments", "Site builder", "Platform"]);

function loadRuns(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  let start = src.indexOf("const RUNS = [");
  if (start < 0) start = src.indexOf("module.exports = [");
  if (start < 0) return [];
  const open = src.indexOf("[", start);
  let depth = 0;
  let end = -1;
  let quote = "";
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) { end = i; break; }
  }
  if (end < 0) return [];
  return vm.runInNewContext("(" + src.slice(open, end + 1) + ")", Object.create(null), { timeout: 1000 });
}

// Saved snapshots keep the engine copy of the day they ran; pages are analyzed, not read.
function analyzedWording(text) {
  return text
    .replace(/\bPartial read:/g, "Partial analysis:")
    .replace(/\b(pages?|alternate)( that)? (was|were) read\b/g, "$1$2 $3 analyzed")
    .replace(/\bwere read([.;])/g, "were analyzed$1")
    .replace(/\b(pages?) read\b(?! well| without)/g, "$1 analyzed")
    .replace(/\bthis read\b/g, "this review")
    .replace(/\b([aA]|[oO]ne|The) public read\b/g, "$1 public analysis");
}

function scrub(text, max) {
  let value = analyzedWording(String(text || ""))
    .replace(/mailto:/gi, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[address hidden]")
    .replace(/\s+/g, " ")
    .trim();
  if (max && value.length > max) value = value.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return value;
}

function flag(country) {
  if (!/^[A-Z]{2}$/.test(country || "")) return "🌐";
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function band(score) {
  if (score >= 90) return ["top", "Top tier · 90+"];
  if (score >= 80) return ["strong", "Strong · 80–89"];
  if (score >= 70) return ["solid", "Solid · 70–79"];
  if (score >= 60) return ["fair", "Fair · 60–69"];
  return ["work", "Needs work · under 60"];
}

function fill(text, score) {
  return String(text || "").replace(/\{(\w+)\}/g, (all, key) => key === "overall" ? score.overall : score.areas[key] ? score.areas[key].score : all);
}

function technologies(report) {
  const seen = new Set();
  const out = [];
  for (const item of report.technologies || []) {
    let name = String(item.name || "").trim();
    const group = String(item.group || "");
    if (group === "Server" || group === "Runtime") {
      const hit = SERVER_NAMES.find(([re]) => re.test(name));
      if (!hit) continue;
      name = hit[1];
    } else if (!TECH_GROUPS.has(group)) continue;
    if (!name || /^x+$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, group: group === "Runtime" || group === "Server" ? "Server" : group });
  }
  return out;
}

function finding(ins, key, verdict) {
  return (ins.findings || []).find((f) => f.key === key && (!verdict || f.verdict === verdict));
}

function badges(report, ins) {
  const out = [];
  const add = (k, t, tone) => out.push({ g: "badge", k, t, tone });
  const psi = report.pagespeed || {};
  const geo = ins.geo || {};
  const answers = (geo.crawlers || []).filter((c) => c.role === "answers");
  const sigs = (report.observed || {}).signals || {};
  if (finding(ins, "sec-csp", "pass")) add("strict-csp", "Strict CSP", "good");
  const dmarc = finding(ins, "sec-dmarc", "pass");
  if (dmarc && /p=reject/i.test(dmarc.evidence || "")) add("dmarc-reject", "DMARC reject", "good");
  else if (dmarc && /p=quarantine/i.test(dmarc.evidence || "")) add("dmarc-quarantine", "DMARC quarantine", "good");
  const hsts = finding(ins, "sec-hsts", "pass");
  if (hsts && /preload/i.test(hsts.evidence || "")) add("hsts-preload", "HSTS preload", "good");
  if (finding(ins, "pf-field", "pass")) add("cwv-pass", "Core Web Vitals pass", "good");
  if (psi.ok && psi.score >= 90) add("lighthouse-90", "Lighthouse " + psi.score + " mobile", "good");
  const jsOnly = !!finding(ins, "geo-js-only", "fail");
  if (finding(ins, "geo-crawlers", "pass") && !jsOnly && ins.score.areas.GEO.score >= 90) add("ai-ready", "AI-search ready", "good");
  if (finding(ins, "geo-llms", "pass")) add("llms-txt", "llms.txt published", "good");
  if (finding(ins, "sec-securitytxt", "pass")) add("security-txt", "security.txt", "good");
  if (finding(ins, "an-consent-mode", "pass")) add("consent-v2", "Consent Mode v2", "good");
  if (finding(ins, "ax-clean", "pass")) add("axe-clean", "axe-core clean", "good");
  if (ins.score.totals && ins.score.totals.fail === 0) add("zero-fail", "Zero failing checks", "good");
  if (finding(ins, "seo-hreflang", "pass") && sigs.hreflang >= 2) add("hreflang", sigs.hreflang + " language versions", "info");
  if (finding(ins, "geo-training", "pass")) add("ai-training-off", "Opts out of AI training", "info");
  const blocked = answers.filter((c) => c.allowed === false);
  if (finding(ins, "geo-crawlers", "fail") && blocked.length) add("ai-blocked", "Blocks AI answer bots", "warn");
  if (jsOnly) add("js-only", "JS-only HTML", "warn");
  if (finding(ins, "a11y-zoom", "fail")) add("zoom-blocked", "Pinch-zoom blocked", "warn");
  if (finding(ins, "seo-schema-parse", "fail")) add("jsonld-broken", "JSON-LD that does not parse", "warn");
  if (finding(ins, "a11y-lang", "fail")) add("no-lang", "No page language", "warn");
  return out;
}

function focusOf(runTags) {
  const keys = [];
  for (const tag of runTags || []) {
    for (const [key, list] of Object.entries(FOCUS)) {
      if (list.includes(tag) && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

function pickWorks(ins) {
  const passes = (ins.findings || []).filter((f) => f.verdict === "pass");
  const picked = [];
  for (const area of AREAS) {
    const hit = passes.find((f) => f.area === area);
    if (hit) picked.push(hit);
  }
  for (const f of passes) {
    if (picked.length >= 8) break;
    if (!picked.includes(f)) picked.push(f);
  }
  return picked.slice(0, 8).map((f) => ({ area: f.area, title: scrub(f.title, 120) }));
}

function build(run, series) {
  const report = run.data || JSON.parse(fs.readFileSync(path.join(REPORTS, run.report + "-current.json"), "utf8"));
  const ins = report.insights || {};
  const score = ins.score;
  const meta = META[run.id] || run.meta || [report.host, "", "", "", ""];
  const [name, sector, org, city, country] = meta;
  const psi = report.pagespeed || {};
  const geo = ins.geo || {};
  const sec = ins.security || {};
  const an = ins.analytics || {};
  const obs = report.observed || {};
  const sigs = obs.signals || {};
  const tech = technologies(report);
  const hosting = (ins.fixkit && ins.fixkit.hosting) || "";
  const read = String(report.fetchedAt || "").slice(0, 10);
  const pages = (report.limits && report.limits.pagesRead) || (report.pages || []).length;
  const focus = focusOf(run.tags);
  const [bandKey, bandLabel] = band(score.overall);
  const answers = (geo.crawlers || []).filter((c) => c.role === "answers");
  const training = (geo.crawlers || []).filter((c) => c.role === "training");
  const layers = (report.counts && report.counts.byLayer) || {};
  const analyticsTools = [...new Set((an.tags || []).map((t) => t.name))];
  const consentTools = [...new Set(an.consentTools || [])];
  const schema = [...new Set(geo.schemaTypes || (ins.seo || {}).schemaTypes || [])].slice(0, 8);

  const tags = [];
  if (sector) tags.push({ g: "sector", k: sector, t: SECTORS[sector] });
  tags.push({ g: "scope", k: run.scope.toLowerCase(), t: run.scope });
  tags.push({ g: "place", k: country || "global", t: (city ? city + ", " : "") + (country || "Global") });
  if (country && REGIONS[country]) tags.push({ g: "region", k: REGIONS[country], t: REGIONS[country] });
  if (org) tags.push({ g: "org", k: org, t: ORGS[org] });
  tags.push({ g: "grade", k: bandKey, t: "Grade " + score.grade + " · " + score.overall });
  tags.push({ g: "band", k: bandKey, t: bandLabel });
  badges(report, ins).forEach((b) => tags.push(b));
  focus.forEach((k) => tags.push({ g: "focus", k, t: FOCUS_LABELS[k] }));
  if (hosting) tags.push({ g: "hosting", k: hosting, t: hosting });
  tech.filter((t) => t.name !== hosting).forEach((t) => tags.push({ g: "tech", k: t.group, t: t.name }));
  analyticsTools.forEach((t) => tags.push({ g: "analytics", k: t, t }));
  consentTools.forEach((t) => tags.push({ g: "consent", k: t, t }));
  if (obs.lang) tags.push({ g: "lang", k: obs.lang, t: "lang=" + obs.lang });
  tags.push({ g: "pages", k: String(pages), t: pages + (pages === 1 ? " page analyzed" : " pages analyzed") });
  tags.push({ g: "tests", k: "cases", t: ((report.counts && report.counts.cases) || 0) + " proposed cases · " + Object.keys(layers).length + " test types" });

  const fix = (ins.findings || [])
    .filter((f) => f.verdict === "fail" || f.verdict === "risk")
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
    .slice(0, 6)
    .map((f) => ({ area: f.area, verdict: f.verdict, severity: f.severity, title: scrub(f.title, 140), evidence: scrub(f.evidence, 260), fix: scrub(f.fix, 220), effort: f.effort || "" }));

  const card = {
    id: run.id,
    series,
    name,
    host: report.host,
    url: report.finalUrl,
    scope: run.scope,
    sector,
    org,
    city,
    country,
    region: REGIONS[country] || "Global",
    flag: flag(country),
    read,
    pages,
    overall: score.overall,
    grade: score.grade,
    areas: Object.fromEntries(AREAS.map((a) => [a, score.areas[a].score])),
    headline: (run.title || []).map((line) => ({ t: fill(line, score).replace(/\*/g, ""), em: /^\*.*\*$/.test(line) })),
    focus,
    tags
  };

  const detail = Object.assign({}, card, {
    body: scrub(fill(run.body, score)),
    lesson: scrub(fill(run.action, score)),
    summary: scrub(ins.summary, 400),
    score: {
      overall: score.overall,
      grade: score.grade,
      areas: Object.fromEntries(AREAS.map((a) => [a, { score: score.areas[a].score, grade: score.areas[a].grade, fail: score.areas[a].fail, risk: score.areas[a].risk, pass: score.areas[a].pass, person: score.areas[a].person }])),
      totals: score.totals,
      severities: score.severities
    },
    fix,
    works: pickWorks(ins),
    geo: {
      answersAllowed: answers.filter((c) => c.allowed !== false).length,
      answersBlocked: [...new Set(answers.filter((c) => c.allowed === false).map((c) => c.token))].slice(0, 10),
      trainingBlocked: [...new Set(training.filter((c) => c.allowed === false).map((c) => c.token))].slice(0, 10),
      llms: !!(geo.llms && geo.llms.ok),
      jsOnly: !!finding(ins, "geo-js-only", "fail"),
      words: (geo.aiView && geo.aiView.words) || 0,
      schema
    },
    security: (sec.headers || []).map((h) => ({ label: h.label, state: h.state })),
    speed: psi.ok ? {
      lighthouse: psi.score,
      lab: psi.lab ? { lcp: psi.lab.lcp, tbt: psi.lab.tbt, cls: psi.lab.cls } : null,
      field: psi.field ? {
        overall: psi.field.overall || "",
        lcp: psi.field.lcp ? { p75: psi.field.lcp.p75, category: psi.field.lcp.category } : null,
        inp: psi.field.inp ? { p75: psi.field.inp.p75, category: psi.field.inp.category } : null,
        cls: psi.field.cls ? { p75: psi.field.cls.p75, category: psi.field.cls.category } : null
      } : null
    } : null,
    stack: { hosting, tech, analytics: analyticsTools, consent: consentTools },
    coverage: { cases: (report.counts && report.counts.cases) || 0, layers },
    langs: { lang: obs.lang || "", hreflang: sigs.hreflang || 0 }
  });
  return { card, detail };
}

function ranks(items) {
  const sorted = items.slice().sort((a, b) => b.card.overall - a.card.overall);
  const rankOf = (list, value) => 1 + list.filter((x) => x > value).length;
  const overall = sorted.map((x) => x.card.overall);
  const areaMax = Object.fromEntries(AREAS.map((a) => [a, Math.max(...items.map((x) => x.card.areas[a]))]));
  const areaTop = Object.fromEntries(AREAS.map((a) => [a, items.filter((x) => x.card.areas[a] === areaMax[a]).length]));
  for (const item of items) {
    const c = item.card;
    const peers = items.filter((x) => x.card.sector === c.sector).map((x) => x.card.overall);
    const r = { overall: { rank: rankOf(overall, c.overall), of: items.length }, sector: { rank: rankOf(peers, c.overall), of: peers.length } };
    const leads = AREAS.filter((a) => c.areas[a] === areaMax[a] && areaTop[a] <= 3);
    c.rank = r;
    item.detail.rank = r;
    if (r.overall.rank <= 10) c.tags.splice(1, 0, { g: "rank", k: "top10", t: "Top 10 of " + items.length });
    if (c.sector && peers.length >= 3 && r.sector.rank === 1) c.tags.splice(1, 0, { g: "rank", k: "sector-1", t: "#1 in " + SECTORS[c.sector] });
    leads.forEach((a) => c.tags.splice(1, 0, { g: "rank", k: "lead-" + a, t: "Best " + a + " in the series" }));
    item.detail.tags = c.tags;
  }
}

// Published reports as build() items, rank tags dropped so ranks() can place them again.
function existingItems(keep) {
  let index = { reports: [] };
  try { index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8")); } catch (error) { return []; }
  const items = [];
  for (const card of index.reports || []) {
    if (keep && !keep(card)) continue;
    let detail;
    try { detail = JSON.parse(fs.readFileSync(path.join(OUT, card.id + ".json"), "utf8")); } catch (error) { continue; }
    const tags = (detail.tags || []).filter((t) => t.g !== "rank");
    items.push({ card: Object.assign({}, card, { tags }), detail: Object.assign(detail, { tags }) });
  }
  return items;
}

function writeAll(items) {
  ranks(items);
  fs.mkdirSync(OUT, { recursive: true });
  const keep = new Set(["index.json"].concat(items.map((x) => x.card.id + ".json")));
  for (const name of fs.readdirSync(OUT)) {
    if (name.endsWith(".json") && !keep.has(name)) fs.unlinkSync(path.join(OUT, name));
  }
  for (const item of items) fs.writeFileSync(path.join(OUT, item.card.id + ".json"), JSON.stringify(item.detail) + "\n");

  const avg = (fn) => Math.round(items.reduce((s, x) => s + fn(x.card), 0) / items.length);
  const index = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    count: items.length,
    averages: { overall: avg((c) => c.overall), areas: Object.fromEntries(AREAS.map((a) => [a, avg((c) => c.areas[a])])) },
    sectors: SECTORS,
    focus: FOCUS_LABELS,
    reports: items.map((x) => Object.assign({}, x.card, { tags: cardTags(x.card.tags) }))
  };
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index) + "\n");
}

// The manifest keeps what a card and the filters show; the full tag list lives in <id>.json.
function cardTags(tags) {
  const tone = { good: 0, info: 1, warn: 2 };
  const badgeList = tags.filter((t) => t.g === "badge").sort((a, b) => tone[a.tone] - tone[b.tone]).slice(0, 4);
  return tags.filter((t) => ["sector", "scope", "place", "rank", "focus", "hosting"].includes(t.g)).concat(badgeList);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const wanted = args.filter((a) => !a.startsWith("--"));
  const runs = [];
  for (const { file, series } of RUN_FILES) {
    let list = [];
    try { list = loadRuns(file); } catch (error) { console.warn("skip", file, "-", error.message); }
    for (const run of list) {
      if (!run || !run.id || !run.report || runs.some((r) => r.run.id === run.id)) continue;
      runs.push({ run, series });
    }
  }
  const chosen = wanted.length ? wanted.map((id) => runs.find((r) => r.run.id === id) || { run: { id, report: id, scope: "Worldwide", tags: [] }, series: "manual" }) : runs;
  const missing = [];
  const items = [];
  for (const { run, series } of chosen) {
    if (!fs.existsSync(path.join(REPORTS, run.report + "-current.json"))) { missing.push(run.id); continue; }
    try { items.push(build(run, series)); } catch (error) { console.warn("skip", run.id, "-", error.message); missing.push(run.id); }
  }
  if (check) {
    console.log(items.length + " ready, " + missing.length + " missing" + (missing.length ? ": " + missing.join(", ") : ""));
    process.exit(missing.length ? 1 : 0);
  }
  if (!items.length) throw new Error("No reports found under " + REPORTS);
  // User reviews come from the daily job (scripts/auto-live-reports.js), never from local snapshots.
  const built = new Set(items.map((x) => x.card.host));
  items.push(...existingItems((card) => card.series === "auto" && !built.has(card.host)));
  writeAll(items);
  console.log("wrote " + items.length + " live reports to " + path.relative(ROOT, OUT) + (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));
}

if (require.main === module) main();

module.exports = { AREAS, REGIONS, build, existingItems, writeAll, scrub };
