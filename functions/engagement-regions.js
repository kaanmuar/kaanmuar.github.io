"use strict";
/*
 * Regional discovery packs for meta-scout (#3613): languages, extra queries, Mastodon hints and student seeds.
 * When settings.discoveryPack is "auto" (default), the active pack rotates by half-hour slot so one run is not
 * stuck on Western English.
 */
const eng = () => require("./engagement");

const PACK_IDS = ["global", "western", "apac", "europe", "cis", "mena", "latam"];

/** Slot order when discoveryPack is auto. */
const ROTATE_PACKS = ["global", "apac", "europe", "western", "latam", "cis", "mena"];

const PACKS = {
  global: {
    name: "Global",
    langs: ["en", "es", "pt", "de", "fr", "it", "nl", "pl", "ru", "uk", "ja", "ko", "zh", "id", "vi", "tr", "ar", "hi"],
    queries: [],
    mastodon: "",
    studentLangs: ["en", "es", "pt", "de", "fr", "it"]
  },
  western: {
    name: "Western",
    langs: ["en", "de", "fr", "it", "nl", "es", "pt"],
    queries: ["core web vitals", "wcag 2.2", "playwright e2e", "technical seo audit", "cookie consent gdpr"],
    mastodon: "https://mastodon.social",
    studentLangs: ["en", "de", "fr", "it", "es", "pt"]
  },
  apac: {
    name: "APAC",
    langs: ["ja", "ko", "zh", "id", "vi", "hi", "en"],
    queries: ["playwright", "ウェブアクセシビリティ", "소프트웨어 테스트", "软件测试", "pengujian otomatis", "core web vitals"],
    mastodon: "https://mstdn.jp",
    studentLangs: ["ja", "ko", "zh", "id", "en"]
  },
  europe: {
    name: "Europe",
    langs: ["de", "fr", "it", "nl", "pl", "es", "pt", "en", "ru", "uk"],
    queries: ["digitale barrierefreiheit", "rgpd cookies", "suchmaschinenoptimierung", "web performance", "testautomatisierung"],
    mastodon: "https://mastodon.social",
    studentLangs: ["de", "fr", "it", "pl", "es", "en"]
  },
  cis: {
    name: "CIS",
    langs: ["ru", "uk", "en"],
    queries: ["автотесты", "тестирование playwright", "веб-доступность", "поисковая оптимизация"],
    mastodon: "",
    studentLangs: ["ru", "uk", "en"]
  },
  mena: {
    name: "MENA",
    langs: ["ar", "tr", "en", "fr"],
    queries: ["اختبار البرمجيات", "web erişilebilirlik", "accessibility testing", "technical seo"],
    mastodon: "",
    studentLangs: ["ar", "tr", "en"]
  },
  latam: {
    name: "LatAm",
    langs: ["es", "pt", "en"],
    queries: ["automatización de pruebas", "accesibilidad web", "seo técnico", "testes automatizados", "rgpd", "core web vitals"],
    mastodon: "",
    studentLangs: ["es", "pt", "en"]
  }
};

function normPack(id) {
  const k = String(id || "auto").toLowerCase();
  return PACK_IDS.includes(k) ? k : "auto";
}

/** Active pack for this slot; settings.discoveryPack overrides rotation when not "auto". */
function packForRun(now, settings) {
  const want = normPack(settings && settings.discoveryPack);
  const slot = Math.floor((now || Date.now()) / eng().DISCOVERY_SLOT);
  const primary = want === "auto" ? ROTATE_PACKS[slot % ROTATE_PACKS.length] : want;
  return { primary, slot, rotate: want === "auto", pack: PACKS[primary] || PACKS.global, want };
}

function poolForPack(pack) {
  const langs = new Set((pack && pack.langs) || PACKS.global.langs);
  const fromIntl = eng().DISCOVERY.filter((d) => langs.has(d.lang));
  const extra = (pack && pack.queries || []).map((q) => ({ q: String(q), lang: "en", topic: "Regional", pack: true }));
  return fromIntl.length ? fromIntl.concat(extra) : eng().DISCOVERY.concat(extra);
}

/** Topic searches for Mac / Mastodon this run, filtered by regional pack (#3613). */
function discoveryForRun(now, budget, settings) {
  const run = packForRun(now, settings);
  const pool = poolForPack(run.pack);
  const b = budget == null ? eng().DISCOVERY_BUDGET : Math.max(0, Math.min(Number(budget) || 0, pool.length));
  if (!b) return [];
  const slot = run.slot;
  return Array.from({ length: b }, (_, i) => Object.assign({}, pool[(slot * b + i) % pool.length], { pack: run.primary }));
}

/** Student search rows for this pack's languages (student-communities.json seeds). */
function studentLangsForRun(now, settings) {
  const run = packForRun(now, settings);
  return (run.pack.studentLangs || ["en"]).slice();
}

module.exports = { PACK_IDS, ROTATE_PACKS, PACKS, normPack, packForRun, poolForPack, discoveryForRun, studentLangsForRun };