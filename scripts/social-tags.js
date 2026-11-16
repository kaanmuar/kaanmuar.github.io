/* Hashtags for the tips and real-run posts. Each post gets the brand tag, its own topic tags, up to two
   of the day's trending tech tags (scripts/trending-tags.js), tags in the clip's language, the network's
   discovery tags, and tags related to its topics, in that order of priority, within the network's limit.
   Related and discovery tags rotate by post and by day, so a batch doesn't repeat one block of tags.
   Limits: Instagram takes at most 5 tags a post, YouTube ignores every tag once there are more than 15,
   X reads more than 2 as spam, and LinkedIn and Facebook reach drops past a handful. */

const fs = require("fs");
const path = require("path");

const BRAND = "#QAlab";
const TRENDING_FILE = process.env.TRENDING_TAGS || path.join(__dirname, "trending-tags.json");
const TRENDING_DAYS = 3;

const LIMITS = { linkedin: 6, x: 2, instagram: 5, facebook: 4, tiktok: 8, youtube: 12 };

// Broad tags people browse on each network; two of them lead, the rest fill what the limit leaves.
const REACH = {
  linkedin: ["QA", "SoftwareEngineering", "TechCommunity", "WebDevelopment"],
  x: [],
  instagram: ["WebDev", "TechTips", "Coding", "Programming", "Developer"],
  facebook: ["TechTips", "WebDevelopment"],
  tiktok: ["TechTok", "LearnOnTikTok", "TechTips", "CodeTok", "WebDev", "Coding"],
  youtube: ["TechTips", "WebDevelopment", "Coding", "Programming", "LearnOnYouTube"]
};

const RELATED = {
  QA: ["SoftwareTesting", "QualityAssurance", "TestAutomation", "Testing", "QAEngineer", "SDET"],
  SEO: ["SEO", "TechnicalSEO", "SEOTips", "DigitalMarketing", "GoogleSearch", "SearchConsole", "ContentMarketing"],
  GEO: ["GEO", "AISearch", "GenerativeEngineOptimization", "AIOverviews", "ChatGPT", "LLM", "AnswerEngineOptimization"],
  A11y: ["Accessibility", "a11y", "WCAG", "InclusiveDesign", "DigitalAccessibility", "UXDesign"],
  Security: ["CyberSecurity", "WebSecurity", "InfoSec", "AppSec", "OWASP", "DevSecOps"],
  Perf: ["WebPerformance", "CoreWebVitals", "PageSpeed", "WebPerf", "Lighthouse", "SiteSpeed"],
  Privacy: ["Privacy", "DataPrivacy", "GDPR", "CookieConsent", "PrivacyByDesign", "DataProtection"],
  Analytics: ["Analytics", "GA4", "GoogleAnalytics", "DataAnalytics", "MarTech", "DigitalAnalytics"],
  WebDev: ["WebDevelopment", "WebDev", "Frontend", "JavaScript", "Programming", "WebDesign"],
  AI: ["AI", "ArtificialIntelligence", "GenAI", "MachineLearning"]
};

// TikTok and YouTube captions are in the clip's language: one tag for the topic, one for the field.
const LOCAL = {
  es: { _: ["DesarrolloWeb", "Programación"], QA: "PruebasDeSoftware", SEO: "PosicionamientoWeb", GEO: "InteligenciaArtificial", A11y: "Accesibilidad",
    Security: "Ciberseguridad", Perf: "VelocidadWeb", Privacy: "ProtecciónDeDatos", Analytics: "AnalíticaWeb", AI: "InteligenciaArtificial" },
  pt: { _: ["DesenvolvimentoWeb", "Programação"], QA: "TesteDeSoftware", SEO: "MarketingDigital", GEO: "InteligênciaArtificial", A11y: "Acessibilidade",
    Security: "CiberSegurança", Perf: "VelocidadeDoSite", Privacy: "LGPD", Analytics: "AnáliseDeDados", AI: "InteligênciaArtificial" },
  de: { _: ["Webentwicklung", "Programmieren"], QA: "Softwaretest", SEO: "Suchmaschinenoptimierung", GEO: "KünstlicheIntelligenz", A11y: "Barrierefreiheit",
    Security: "Cybersicherheit", Perf: "Ladezeit", Privacy: "Datenschutz", Analytics: "Webanalyse", AI: "KünstlicheIntelligenz" },
  fr: { _: ["DéveloppementWeb", "Développeur"], QA: "TestLogiciel", SEO: "Référencement", GEO: "IntelligenceArtificielle", A11y: "Accessibilité",
    Security: "Cybersécurité", Perf: "PerformanceWeb", Privacy: "RGPD", Analytics: "WebAnalytics", AI: "IntelligenceArtificielle" },
  it: { _: ["SviluppoWeb", "Programmazione"], QA: "TestSoftware", SEO: "PosizionamentoSEO", GEO: "IntelligenzaArtificiale", A11y: "Accessibilità",
    Security: "SicurezzaInformatica", Perf: "VelocitàSito", Privacy: "ProtezioneDati", Analytics: "AnalisiDati", AI: "IntelligenzaArtificiale" }
};

const TOPIC_WORDS = {
  SEO: "seo technicalseo canonical sitemap structureddata metadescription robotstxt titles titletags pagetitles serp redirects opengraph brokenlinks soft404 hreflang indexing jsonld javascriptseo multilingual i18n lang content socialsharing",
  GEO: "geo aisearch chatbots llmstxt",
  A11y: "a11y accessibility wcag aria landmarks keyboard zoom contrast alttext formlabels forms headings eaa",
  Security: "security websecurity hsts https csp clickjacking httpheaders headers tls emailsecurity dns securitytxt safebrowsing malware mtasts tlsrpt spf dmarc appsec permissionspolicy mixedcontent dependencies libraries domains",
  Perf: "perf speed performance webperformance webperf corewebvitals cls lcp inp ttfb pageweight renderblocking caching",
  Privacy: "privacy cookies gdpr consent consentmode impressum legal",
  Analytics: "analytics ga4 measurement utm googletag dataquality cro marketing",
  QA: "qa softwaretesting testautomation playwright releasemanagement devops",
  WebDev: "webdev field javascript html typescript vuejs spa mobilefirst mobileux responsivedesign ux design development opensource serverrendering"
};
const TOPIC_OF = {};
Object.keys(TOPIC_WORDS).forEach((topic) => TOPIC_WORDS[topic].split(" ").forEach((word) => { TOPIC_OF[word] = topic; }));

let trendingCache;
function trending() {
  if (trendingCache !== undefined) return trendingCache;
  trendingCache = [];
  try {
    const data = JSON.parse(fs.readFileSync(TRENDING_FILE, "utf8"));
    const age = (Date.now() - Date.parse(data.date + "T00:00:00Z")) / 86400000;
    if (age < TRENDING_DAYS) trendingCache = data.tags || [];
  } catch (e) { /* no file yet: evergreen tags only */ }
  return trendingCache;
}

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function rotate(list, by) {
  if (!list.length) return [];
  const k = by % list.length;
  return list.slice(k).concat(list.slice(0, k));
}

function topicsOf(post) {
  const out = [];
  [post.cat].concat(post.tags || []).forEach((word) => {
    const topic = TOPIC_OF[String(word || "").toLowerCase()];
    if (topic && !out.includes(topic)) out.push(topic);
  });
  if (!out.includes("QA")) out.push("QA");
  return out;
}

function trendingFor(topics, seed, n) {
  const all = trending();
  const near = all.filter((t) => topics.includes(t.topic));
  const wide = all.filter((t) => !topics.includes(t.topic) && ["WebDev", "AI", "QA"].includes(t.topic));
  const pool = near.slice(0, 4).concat(wide.slice(0, 4));
  return rotate(pool.slice(0, Math.max(n * 2, 3)), seed).slice(0, n).map((t) => t.tag);
}

// Ordered by priority; the brand tag always fits and is written last.
function tagsFor(post, network, lang) {
  const limit = LIMITS[network] || 5;
  const day = Math.floor(Date.now() / 86400000);
  const seed = hash((post.id || "") + network) + day;
  const topics = topicsOf(post);
  const own = (post.tags || []).slice(0, 3);
  const local = LOCAL[lang] || null;
  const related = [];
  for (let i = 0; i < 7; i += 1) topics.forEach((topic) => { const list = rotate(RELATED[topic] || [], seed); if (list[i]) related.push(list[i]); });
  const reach = rotate(REACH[network] || [], seed);
  const order = [own[0]]
    .concat(trendingFor(topics, seed, limit <= 5 ? 1 : 2))
    .concat(network === "x" ? [] : ["QA"], own.slice(1))
    .concat(local ? topics.map((topic) => local[topic]).filter(Boolean).slice(0, 1).concat(local._.slice(0, 1)) : [])
    .concat(reach.slice(0, 2), related, reach.slice(2));
  const seen = new Set([BRAND.slice(1).toLowerCase()]);
  const out = [];
  for (const tag of order) {
    if (!tag || out.length >= limit - 1) continue;
    const key = tag.replace(/^#/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push("#" + tag.replace(/^#/, ""));
  }
  return out.concat(BRAND);
}

function tagLine(post, network, lang) { return tagsFor(post, network, lang || post.lang).join(" "); }

module.exports = { BRAND, LIMITS, RELATED, REACH, LOCAL, TRENDING_FILE, tagsFor, tagLine, topicsOf };
