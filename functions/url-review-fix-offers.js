/**
 * Fix offers for what a report found (#3082): the fixed-price packages, and the requests a client sends
 * from the report when they want us to do the fix. Pure: no Firestore and no mail.
 */

// The one price table. A finding belongs to the first package whose `keys` holds a prefix of its key;
// one no package holds is quoted by hand.
const PACKAGES = [
  {
    id: "security-headers",
    usd: 99,
    days: 3,
    keys: ["sec-hsts", "sec-csp", "sec-frame", "sec-nosniff", "sec-referrer", "sec-permissions", "sec-coop", "sec-isolation", "sec-headers-uneven", "sec-cookies", "sec-mixed", "sec-sri", "sec-version"],
    name: {
      en: "Security headers", es: "Cabeceras de seguridad", pt: "Cabeçalhos de segurança",
      de: "Sicherheits-Header", fr: "En-têtes de sécurité", it: "Header di sicurezza"
    },
    what: {
      en: "HSTS, CSP, framing, nosniff, referrer and permissions policies set on your host or CDN, tested on every page.",
      es: "HSTS, CSP, protección de marcos, nosniff y las políticas de referrer y permisos configuradas en tu hosting o CDN, probadas en cada página.",
      pt: "HSTS, CSP, proteção contra frames, nosniff e as políticas de referrer e permissões configuradas no seu host ou CDN, testadas em cada página.",
      de: "HSTS, CSP, Frame-Schutz, nosniff sowie Referrer- und Permissions-Policy auf Ihrem Host oder CDN gesetzt und auf jeder Seite geprüft.",
      fr: "HSTS, CSP, protection contre l'encadrement, nosniff et politiques referrer et permissions réglés sur votre hébergeur ou CDN, testés sur chaque page.",
      it: "HSTS, CSP, protezione dai frame, nosniff e policy referrer e permessi impostati sul tuo host o CDN, verificati su ogni pagina."
    }
  },
  {
    id: "email-dns",
    usd: 89,
    days: 3,
    keys: ["sec-spf", "sec-dmarc", "sec-caa", "sec-mta-sts", "sec-tlsrpt", "sec-bimi", "sec-securitytxt"],
    name: {
      en: "Email and DNS", es: "Correo y DNS", pt: "E-mail e DNS",
      de: "E-Mail und DNS", fr: "E-mail et DNS", it: "Email e DNS"
    },
    what: {
      en: "SPF, DKIM and DMARC set up and moved to enforcement, plus CAA, MTA-STS, TLS-RPT and security.txt.",
      es: "SPF, DKIM y DMARC configurados y llevados a modo de rechazo, más CAA, MTA-STS, TLS-RPT y security.txt.",
      pt: "SPF, DKIM e DMARC configurados e levados ao modo de bloqueio, mais CAA, MTA-STS, TLS-RPT e security.txt.",
      de: "SPF, DKIM und DMARC eingerichtet und auf Durchsetzung gestellt, dazu CAA, MTA-STS, TLS-RPT und security.txt.",
      fr: "SPF, DKIM et DMARC configurés et passés en application, plus CAA, MTA-STS, TLS-RPT et security.txt.",
      it: "SPF, DKIM e DMARC configurati e portati in applicazione, più CAA, MTA-STS, TLS-RPT e security.txt."
    }
  },
  {
    id: "tls-redirects",
    usd: 69,
    days: 2,
    keys: ["sec-http", "sec-tls", "sec-domain-lock", "seo-redirect-chain", "seo-internal-redirects"],
    name: {
      en: "TLS and redirects", es: "TLS y redirecciones", pt: "TLS e redirecionamentos",
      de: "TLS und Weiterleitungen", fr: "TLS et redirections", it: "TLS e reindirizzamenti"
    },
    what: {
      en: "A valid certificate chain, one clean redirect to https, and internal links that land without a hop.",
      es: "Una cadena de certificados válida, una sola redirección limpia a https y enlaces internos que llegan sin saltos.",
      pt: "Uma cadeia de certificados válida, um único redirecionamento limpo para https e links internos que chegam sem saltos.",
      de: "Eine gültige Zertifikatskette, eine saubere Weiterleitung auf https und interne Links ohne Umweg.",
      fr: "Une chaîne de certificats valide, une seule redirection propre vers https et des liens internes qui arrivent sans détour.",
      it: "Una catena di certificati valida, un solo reindirizzamento pulito a https e link interni che arrivano senza passaggi."
    }
  },
  {
    id: "accessibility",
    usd: 169,
    days: 5,
    keys: ["a11y-", "ax-"],
    name: {
      en: "Accessibility quick fixes", es: "Arreglos rápidos de accesibilidad", pt: "Correções rápidas de acessibilidade",
      de: "Schnelle Barrierefreiheits-Korrekturen", fr: "Corrections rapides d'accessibilité", it: "Correzioni rapide di accessibilità"
    },
    what: {
      en: "Alt text, labels, contrast, headings, language, focus order and tap targets fixed in your templates.",
      es: "Texto alternativo, etiquetas, contraste, encabezados, idioma, orden del foco y áreas táctiles corregidos en tus plantillas.",
      pt: "Texto alternativo, rótulos, contraste, títulos, idioma, ordem de foco e áreas de toque corrigidos nos seus templates.",
      de: "Alternativtexte, Beschriftungen, Kontrast, Überschriften, Sprache, Fokusreihenfolge und Tippflächen in Ihren Vorlagen korrigiert.",
      fr: "Textes alternatifs, libellés, contraste, titres, langue, ordre du focus et zones tactiles corrigés dans vos gabarits.",
      it: "Testi alternativi, etichette, contrasto, titoli, lingua, ordine del focus e aree di tocco corretti nei tuoi template."
    }
  },
  {
    id: "performance",
    usd: 199,
    days: 5,
    keys: ["pf-"],
    name: {
      en: "Performance basics", es: "Rendimiento básico", pt: "Desempenho básico",
      de: "Performance-Grundlagen", fr: "Performance de base", it: "Prestazioni di base"
    },
    what: {
      en: "Render-blocking scripts deferred, images sized, compressed and lazy-loaded, caching set, measured again on mobile.",
      es: "Scripts que bloquean el render diferidos, imágenes con tamaño, comprimidas y con carga diferida, caché configurada y medido de nuevo en móvil.",
      pt: "Scripts que bloqueiam a renderização adiados, imagens dimensionadas, comprimidas e com carregamento tardio, cache configurado e medido de novo no celular.",
      de: "Render-blockierende Skripte verzögert, Bilder mit Maßen, komprimiert und lazy geladen, Caching gesetzt und mobil neu gemessen.",
      fr: "Scripts bloquants différés, images dimensionnées, compressées et chargées à la demande, cache réglé, mesuré à nouveau sur mobile.",
      it: "Script che bloccano il rendering differiti, immagini dimensionate, compresse e caricate in modo lazy, cache impostata e misurato di nuovo su mobile."
    }
  },
  {
    id: "seo-meta",
    usd: 119,
    days: 4,
    keys: ["seo-title", "seo-description", "seo-duplicate", "seo-canonical", "seo-social", "seo-schema", "seo-favicon", "seo-viewport", "seo-hreflang", "seo-sitemap", "geo-entity", "geo-llms", "geo-dated", "geo-trust"],
    name: {
      en: "SEO meta and structured data", es: "Metadatos SEO y datos estructurados", pt: "Metadados de SEO e dados estruturados",
      de: "SEO-Metadaten und strukturierte Daten", fr: "Métadonnées SEO et données structurées", it: "Metadati SEO e dati strutturati"
    },
    what: {
      en: "Titles, descriptions, canonicals, social cards, sitemap and schema.org written for every page the review saw.",
      es: "Títulos, descripciones, canónicas, tarjetas sociales, sitemap y schema.org escritos para cada página que vio la revisión.",
      pt: "Títulos, descrições, canônicas, cartões sociais, sitemap e schema.org escritos para cada página que a revisão viu.",
      de: "Titel, Beschreibungen, Canonicals, Social Cards, Sitemap und schema.org für jede Seite geschrieben, die die Prüfung gesehen hat.",
      fr: "Titres, descriptions, canoniques, cartes sociales, sitemap et schema.org rédigés pour chaque page que la revue a vue.",
      it: "Titoli, descrizioni, canonical, social card, sitemap e schema.org scritti per ogni pagina vista dalla revisione."
    }
  }
];

const STATUSES = ["new", "quoted", "accepted", "in-progress", "done", "re-reviewed"];
const COLLECTION = "url_review_fix_requests";
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const DAILY_LIMIT = 5;
const MAX_FINDINGS = 40;
const OPEN = ["fail", "risk"];

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function line(value, max) {
  return clip(String(value == null ? "" : value).replace(/\s+/g, " "), max);
}

function langOf(value) {
  const code = String(value || "").slice(0, 2).toLowerCase();
  return LANGS.indexOf(code) === -1 ? "en" : code;
}

function packageById(id) {
  return PACKAGES.find((item) => item.id === id) || null;
}

function packageFor(key) {
  const text = String(key || "");
  const hit = PACKAGES.find((item) => item.keys.some((prefix) => text.indexOf(prefix) === 0));
  return hit ? hit.id : "";
}

function isOpen(finding) {
  return !!finding && OPEN.indexOf(finding.verdict) !== -1;
}

// The packages a report's open findings call for, in table order, each with the findings it covers.
function offersFor(findings) {
  const open = (findings || []).filter(isOpen);
  return PACKAGES.map((item) => ({ id: item.id, usd: item.usd, days: item.days, findings: open.filter((f) => packageFor(f.key) === item.id).map((f) => f.id) }))
    .filter((offer) => offer.findings.length);
}

// What the report page needs to show the packages: no matching rules beyond the prefixes.
function publicPackages() {
  return PACKAGES.map((item) => ({ id: item.id, usd: item.usd, days: item.days, keys: item.keys.slice(), name: Object.assign({}, item.name), what: Object.assign({}, item.what) }));
}

function dayOf(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const when = new Date(text + "T00:00:00Z");
  return isNaN(when) || when.toISOString().slice(0, 10) !== text ? "" : text;
}

/**
 * The request as saved, from what the form sent and the report it names; { error } when it cannot be saved.
 * Findings are read from the stored report, so the client cannot name one the report does not hold.
 */
function requestRecord(input, row, email, now) {
  const body = input || {};
  const report = (row && row.report) || {};
  const all = (report.insights && report.insights.findings) || [];
  const asked = Array.isArray(body.findings) ? body.findings.map((id) => String(id || "").trim().toUpperCase()).filter(Boolean) : [];
  const findings = all.filter((f) => asked.indexOf(String(f.id).toUpperCase()) !== -1).slice(0, MAX_FINDINGS);
  if (!findings.length) return { error: "Pick at least one finding from this report." };
  const pack = body.package ? packageById(String(body.package)) : null;
  if (body.package && !pack) return { error: "That package is not offered." };
  const at = new Date(now || Date.now());
  const deadline = dayOf(body.deadline);
  if (body.deadline && !deadline) return { error: "The deadline is not a date." };
  if (deadline && deadline < at.toISOString().slice(0, 10)) return { error: "The deadline has passed." };
  const stamp = at.toISOString();
  return {
    reportId: String(report.id || ""),
    host: line(report.host, 120),
    email: String(email || "").toLowerCase(),
    name: line(body.name, 80),
    lang: langOf(body.lang),
    findings: findings.map((f) => Object.assign({ id: String(f.id), key: String(f.key || ""), area: String(f.area || ""), verdict: String(f.verdict || ""), severity: String(f.severity || ""), title: line(f.title, 160), package: packageFor(f.key) },
      f.msg && f.msg.title ? { titleMsg: f.msg.title } : {})),
    package: pack ? pack.id : "",
    priceUsd: pack ? pack.usd : 0,
    kind: pack ? "package" : "quote",
    access: clip(body.access, 2000),
    deadline,
    budget: line(body.budget, 80),
    status: "new",
    history: [{ status: "new", at: stamp, by: "client" }],
    createdAt: stamp,
    updatedAt: stamp
  };
}

// Requests an address sent in the last day; past DAILY_LIMIT the next is refused.
function overLimit(rows, now) {
  const since = new Date((now || Date.now()) - 864e5).toISOString();
  return (rows || []).filter((row) => String(row.createdAt || "") >= since).length >= DAILY_LIMIT;
}

/** The desk's change to a request: a new status, the quoted price, the pay link; { error } when it is not valid. */
function statusPatch(record, input, by, now) {
  const body = input || {};
  const status = String(body.status || (record && record.status) || "");
  if (STATUSES.indexOf(status) === -1) return { error: "That status is not one of " + STATUSES.join(", ") + "." };
  const patch = { status, updatedAt: new Date(now || Date.now()).toISOString() };
  if (body.quoteUsd != null && body.quoteUsd !== "") {
    const usd = Math.round(Number(body.quoteUsd) * 100) / 100;
    if (!isFinite(usd) || usd <= 0 || usd > 100000) return { error: "The quote is not a price in US$." };
    patch.quoteUsd = usd;
  }
  if (body.payUrl != null && body.payUrl !== "") {
    const link = String(body.payUrl).trim();
    if (!/^https:\/\/[^\s"'<>]+$/.test(link) || link.length > 500) return { error: "The pay link must be an https address." };
    patch.payUrl = link;
  }
  if (body.note != null) patch.deskNote = clip(body.note, 1000);
  if (status !== (record && record.status)) patch.history = ((record && record.history) || []).concat([{ status, at: patch.updatedAt, by: line(by, 120) }]).slice(-20);
  return patch;
}

// The quote mail goes once a price or a pay link is set on a quoted request, and again only when either changes.
function quoteMailDue(before, after) {
  if (!after || after.status !== "quoted" || !(after.quoteUsd || after.payUrl || after.priceUsd)) return false;
  if (!before || before.status !== "quoted" || !before.quoteMailedAt) return true;
  return before.quoteUsd !== after.quoteUsd || before.payUrl !== after.payUrl;
}

function priceOf(record) {
  return Number((record && (record.quoteUsd || record.priceUsd)) || 0);
}

function deskRereview(run) {
  if (!run) return null;
  const result = run.result || {};
  return {
    status: run.status || "",
    at: run.at || "",
    error: run.error || "",
    reportId: run.reportId || "",
    fixed: result.fixed || 0,
    total: (result.items || []).length,
    scoreBefore: result.scoreBefore || 0,
    scoreAfter: result.scoreAfter || 0,
    newCount: result.newCount || 0
  };
}

function deskRow(id, data) {
  const row = data || {};
  return {
    id,
    reportId: row.reportId || "",
    host: row.host || "",
    email: row.email || "",
    name: row.name || "",
    lang: row.lang || "en",
    findings: (row.findings || []).map((f) => ({ id: f.id, title: f.title, severity: f.severity, package: f.package || "" })),
    package: row.package || "",
    packageName: row.package && packageById(row.package) ? packageById(row.package).name.en : "",
    priceUsd: row.priceUsd || 0,
    quoteUsd: row.quoteUsd || 0,
    payUrl: row.payUrl || "",
    kind: row.kind || "quote",
    access: row.access || "",
    deadline: row.deadline || "",
    budget: row.budget || "",
    status: row.status || "new",
    history: row.history || [],
    deskNote: row.deskNote || "",
    quoteMailedAt: row.quoteMailedAt || "",
    paidAt: row.paidAt || "",
    paidUsd: (row.paid && row.paid.priceUsd) || 0,
    paidTest: !!(row.paid && row.paid.test),
    rereview: deskRereview(row.rereview),
    mailError: row.mailError || "",
    createdAt: row.createdAt || "",
    updatedAt: row.updatedAt || ""
  };
}

// Open requests first, newest first within each status.
function deskOrder(rows) {
  const rank = (row) => (row.status === "done" || row.status === "re-reviewed" ? 1 : 0);
  return (rows || []).slice().sort((a, b) => rank(a) - rank(b) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function reportUrl(record) {
  return record && record.reportId ? "https://carlosandmunoz.com/qa-review.html?report=" + encodeURIComponent(record.reportId) : "";
}

/** The owner mail for a new request, in owner-mail.js rows. */
function ownerNotice(record, deskUrl) {
  const pack = packageById(record.package);
  return {
    subject: "Fix request: " + (record.host || "a report") + (pack ? " · " + pack.name.en + " US$" + pack.usd : " · quote"),
    intro: (record.name || record.email) + " asks us to fix " + record.findings.length + (record.findings.length === 1 ? " finding" : " findings") + " on " + (record.host || "their site"),
    rows: [
      { heading: "Request" },
      { label: "From", value: record.name ? record.name + " (" + record.email + ")" : record.email },
      { label: "Site", value: record.host },
      { label: "Report", value: reportUrl(record) },
      { label: "Package", value: pack ? pack.name.en + ", US$" + pack.usd + ", about " + pack.days + " working days" : "None, wants a quote" },
      { label: "Deadline", value: record.deadline },
      { label: "Budget", value: record.budget },
      { label: "Language", value: record.lang },
      { heading: "Findings" },
      ...record.findings.map((f) => ({ label: f.id + " · " + f.severity, value: f.title }))
    ],
    body: record.access ? "Access notes:\n" + record.access : "",
    respondUrl: deskUrl,
    buttonLabel: "Open the review desk"
  };
}

module.exports = {
  PACKAGES,
  STATUSES,
  COLLECTION,
  DAILY_LIMIT,
  packageById,
  packageFor,
  offersFor,
  publicPackages,
  requestRecord,
  overLimit,
  statusPatch,
  quoteMailDue,
  priceOf,
  deskRow,
  deskOrder,
  reportUrl,
  ownerNotice
};
