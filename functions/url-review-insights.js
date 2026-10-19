"use strict";

const { URL } = require("url");

const AI_BOTS = [
  { token: "OAI-SearchBot", owner: "OpenAI", product: "ChatGPT search", role: "answers" },
  { token: "ChatGPT-User", owner: "OpenAI", product: "ChatGPT, when a person asks it to open a page", role: "answers" },
  { token: "GPTBot", owner: "OpenAI", product: "OpenAI model training", role: "training" },
  { token: "Claude-SearchBot", owner: "Anthropic", product: "Claude search", role: "answers" },
  { token: "Claude-User", owner: "Anthropic", product: "Claude, when a person asks it to open a page", role: "answers" },
  { token: "ClaudeBot", owner: "Anthropic", product: "Anthropic model training", role: "training" },
  { token: "PerplexityBot", owner: "Perplexity", product: "Perplexity answers", role: "answers" },
  { token: "Perplexity-User", owner: "Perplexity", product: "Perplexity, when a person asks it to open a page", role: "answers" },
  { token: "Googlebot", owner: "Google", product: "Google Search and AI Overviews", role: "search" },
  { token: "Google-Extended", owner: "Google", product: "Gemini training and grounding", role: "training" },
  { token: "Bingbot", owner: "Microsoft", product: "Bing and Copilot", role: "search" },
  { token: "Applebot", owner: "Apple", product: "Siri and Spotlight", role: "search" },
  { token: "Applebot-Extended", owner: "Apple", product: "Apple Intelligence training", role: "training" },
  { token: "Amazonbot", owner: "Amazon", product: "Alexa answers", role: "answers" },
  { token: "DuckAssistBot", owner: "DuckDuckGo", product: "DuckAssist answers", role: "answers" },
  { token: "MistralAI-User", owner: "Mistral", product: "Le Chat, when a person asks it to open a page", role: "answers" },
  { token: "Meta-ExternalAgent", owner: "Meta", product: "Meta AI training", role: "training" },
  { token: "CCBot", owner: "Common Crawl", product: "Open dataset used by many models", role: "training" },
  { token: "Bytespider", owner: "ByteDance", product: "ByteDance model training", role: "training" }
];

const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
const AREA_WEIGHT = { SEO: 1, GEO: 1, Analytics: 0.8, Security: 1.2, Accessibility: 1, Performance: 1 };
const SEVERITY_POINTS = { critical: 50, high: 30, medium: 15, low: 6, info: 0 };
const LOW_RISK_CAP = 15;
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const EFFORT_COST = { minutes: 1, hours: 1.25, days: 1.6 };
const VERDICT_ORDER = { fail: 4, risk: 3, person: 2, pass: 1 };

const REQUIRED_PROPS = {
  Organization: ["name", "url"],
  LocalBusiness: ["name", "address"],
  Person: ["name"],
  WebSite: ["name", "url"],
  Article: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "author", "datePublished"],
  Product: ["name", ["offers", "review", "aggregateRating"]],
  BreadcrumbList: ["itemListElement"],
  FAQPage: ["mainEntity"],
  Event: ["name", "startDate", "location"],
  Recipe: ["name", "image"],
  JobPosting: ["title", "datePosted", "hiringOrganization"],
  SoftwareApplication: ["name", ["offers", "aggregateRating"]],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"]
};

const COOKIELESS = ["Plausible", "Fathom", "Cloudflare Web Analytics", "Umami", "Vercel Analytics"];
const NO_SRI_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|google\.com|gstatic\.com|facebook\.net|doubleclick\.net|hotjar\.com|clarity\.ms|licdn\.com|hs-scripts\.com|hs-analytics\.net|stripe\.com|paypal\.com|recaptcha\.net|cloudflareinsights\.com|youtube\.com|twitter\.com|x\.com|tiktok\.com|bing\.com)$/i;
const ANALYTICS_CONNECT = {
  "Google Analytics 4": ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com"],
  "Google Tag Manager": ["https://*.googletagmanager.com", "https://*.google-analytics.com"],
  "Google Ads": ["https://*.doubleclick.net", "https://*.google.com"],
  "Meta Pixel": ["https://www.facebook.com"],
  "LinkedIn Insight": ["https://px.ads.linkedin.com"],
  "Hotjar": ["https://*.hotjar.com", "https://*.hotjar.io", "wss://*.hotjar.com"],
  "Microsoft Clarity": ["https://*.clarity.ms"],
  "Plausible": ["https://plausible.io"],
  "PostHog": ["https://*.posthog.com"],
  "Segment": ["https://api.segment.io"],
  "Mixpanel": ["https://api-js.mixpanel.com"],
  "Cloudflare Web Analytics": ["https://cloudflareinsights.com"]
};

function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch (error) { return ""; }
}

function normal(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    let path = url.pathname.replace(/\/index\.html?$/i, "/");
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return url.protocol + "//" + url.hostname.toLowerCase() + path + url.search;
  } catch (error) {
    return String(value || "");
  }
}

function pathOf(value) {
  try {
    const url = new URL(value);
    return url.pathname + url.search;
  } catch (error) {
    return String(value || "");
  }
}

function plural(count, one, many) {
  return count + " " + (count === 1 ? one : (many || one + "s"));
}

function sample(list, max) {
  const items = (list || []).slice(0, max || 3);
  const rest = (list || []).length - items.length;
  return items.join(", ") + (rest > 0 ? " and " + rest + " more" : "");
}

function parseRobotsFull(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  String(text || "").split(/\r?\n/).forEach((line) => {
    const cleanLine = line.split("#")[0].trim();
    const at = cleanLine.indexOf(":");
    if (at < 1) return;
    const key = cleanLine.slice(0, at).trim().toLowerCase();
    const value = cleanLine.slice(at + 1).trim();
    if (key === "sitemap") {
      if (value && sitemaps.length < 10) sitemaps.push(value);
      return;
    }
    if (key === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      return;
    }
    if (!current) return;
    if (key === "allow" || key === "disallow") current.rules.push({ allow: key === "allow", path: value });
  });
  return { groups, sitemaps };
}

function ruleMatches(path, rule) {
  if (!rule) return false;
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = "^" + body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : "");
  try { return new RegExp(pattern).test(path); } catch (error) { return path.startsWith(body); }
}

function robotsVerdict(token, path, groups) {
  const name = token.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((agent) => agent === name));
  const chosen = specific.length ? specific : groups.filter((group) => group.agents.includes("*"));
  let match = null;
  chosen.forEach((group) => {
    group.rules.forEach((rule) => {
      if (!rule.path) return;
      if (!ruleMatches(path, rule.path)) return;
      const length = rule.path.replace(/\*|\$$/g, "").length;
      if (!match || length > match.length || (length === match.length && rule.allow)) match = { allow: rule.allow, length, path: rule.path };
    });
  });
  return { allowed: !match || match.allow, rule: match ? (match.allow ? "Allow: " : "Disallow: ") + match.path : "", named: specific.length > 0 };
}

function cspDirectives(value) {
  const map = {};
  String(value || "").split(";").forEach((part) => {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (!bits.length) return;
    const name = bits[0].toLowerCase();
    if (!map[name]) map[name] = bits.slice(1);
  });
  return map;
}

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

function hostingHint(technologies, headers) {
  const names = (technologies || []).map((item) => String(item.name || "").toLowerCase());
  const server = String((headers && headers.server) || "").toLowerCase();
  if (names.some((name) => name.includes("netlify"))) return "Netlify";
  if (names.some((name) => name.includes("vercel"))) return "Vercel";
  if (server.includes("github")) return "GitHub Pages";
  if (names.some((name) => name.includes("firebase")) || server.includes("firebase") || server.includes("google frontend")) return "Firebase Hosting";
  if (names.some((name) => name.includes("cloudflare"))) return "Cloudflare";
  if (server.includes("nginx")) return "nginx";
  if (server.includes("apache")) return "Apache";
  return "";
}

function analyze(input) {
  const pages = input.pages || [];
  const home = pages[0] || {};
  const face = home.inspect || {};
  const extras = input.extras || {};
  const limits = input.limits || {};
  const origin = (() => { try { return new URL(home.url).origin; } catch (error) { return ""; } })();
  const host = hostOf(home.url);
  const findings = [];
  const add = (area, verdict, severity, key, title, evidence, fix, opts) => {
    const extra = opts || {};
    findings.push({
      key,
      area,
      verdict,
      severity: verdict === "pass" ? "info" : severity,
      title,
      evidence,
      fix: fix || "",
      effort: extra.effort || "hours",
      pages: (extra.pages || []).slice(0, 12),
      count: extra.count == null ? (extra.pages || []).length : extra.count,
      cases: extra.cases || []
    });
  };

  const read = pages.filter((page) => page.inspect && page.status >= 200 && page.status < 300);
  const byUrl = new Map();
  pages.forEach((page) => {
    byUrl.set(normal(page.url), page);
    if (page.requested) byUrl.set(normal(page.requested), page);
  });
  const robots = parseRobotsFull(input.robotsText || "");

  // Indexability for every page that was opened.
  const indexability = pages.map((page) => {
    const f = page.inspect;
    const path = page.path || pathOf(page.url);
    if (!f) return { path, status: page.status || 0, indexable: false, reason: page.error || "Not read" };
    const directives = [f.seo && f.seo.robots, f.seo && f.seo.googlebot, f.seo && f.seo.xRobots].filter(Boolean).join(", ").toLowerCase();
    const noindex = /\bnoindex\b|(^|[\s,])none([\s,]|$)/.test(directives);
    const canonical = f.seo && f.seo.canonicalAbs ? normal(f.seo.canonicalAbs) : "";
    const canonicalElsewhere = !!canonical && canonical !== normal(page.url);
    const googleBlocked = robots.groups.length ? !robotsVerdict("googlebot", pathOf(page.url), robots.groups).allowed : false;
    let reason = "Indexable";
    if (page.status < 200 || page.status >= 300) reason = "Status " + page.status;
    else if (noindex) reason = "noindex";
    else if (googleBlocked) reason = "Blocked for Googlebot in robots.txt";
    else if (canonicalElsewhere) reason = "Canonical points to " + pathOf(canonical);
    return {
      path,
      status: page.status,
      indexable: reason === "Indexable",
      reason,
      canonical: canonical ? pathOf(canonical) : "",
      robots: directives,
      redirected: !!page.hops,
      depth: page.depth || 0
    };
  });
  const indexable = indexability.filter((row) => row.indexable);
  const indexablePaths = new Set(indexable.map((row) => row.path));

  // Link graph among the pages that were opened.
  const nodes = pages.map((page) => ({
    path: page.path || pathOf(page.url),
    status: page.status || 0,
    ms: page.ms || 0,
    depth: page.depth || 0,
    title: page.title || "",
    from: page.from || "",
    inbound: 0,
    issues: 0
  }));
  const nodeIndex = new Map(nodes.map((node, index) => [node.path, index]));
  const edges = [];
  const sources = new Map();
  pages.forEach((page, index) => {
    const links = (page.inspect && page.inspect.links) || [];
    links.forEach((link) => {
      const target = byUrl.get(normal(link));
      if (!target) return;
      const to = nodeIndex.get(target.path || pathOf(target.url));
      if (to == null || to === index) return;
      if (edges.length < 1200) edges.push({ s: index, t: to });
      nodes[to].inbound += 1;
      if (!sources.has(to)) sources.set(to, []);
      const list = sources.get(to);
      if (list.length < 6 && list.indexOf(nodes[index].path) === -1) list.push(nodes[index].path);
    });
  });

  // SEO
  const broken = pages.map((page, index) => ({ page, index })).filter(({ page }) => page.depth > 0 && (!page.status || page.status >= 400));
  if (broken.length) {
    add("SEO", "fail", "high", "seo-broken-links", plural(broken.length, "internal link leads", "internal links lead") + " to an error",
      broken.slice(0, 5).map(({ page, index }) => (page.path || page.url) + " answered " + (page.status || page.error || "nothing") + (sources.get(index) ? ", linked from " + sample(sources.get(index), 2) : "")).join(". ") + ".",
      "Fix or remove each link, or redirect the old address with a 301 to the closest live page.",
      { pages: broken.map(({ page }) => page.path || page.url), effort: "hours", cases: ["FN-06", "LK-01"] });
  } else if (pages.length > 1) {
    add("SEO", "pass", "info", "seo-broken-links", "Every internal link that was opened answered", plural(pages.length - 1, "linked page") + " answered without an error.", "", { cases: ["FN-06", "LK-01"] });
  }

  const redirected = pages.filter((page) => page.depth > 0 && page.hops > 0);
  if (redirected.length) {
    add("SEO", "risk", "low", "seo-internal-redirects", plural(redirected.length, "internal link goes", "internal links go") + " through a redirect",
      redirected.slice(0, 4).map((page) => pathOf(page.requested || "") + " → " + page.path).join(", ") + ". Each hop costs crawl budget and a little speed.",
      "Point the links straight at the final address.", { pages: redirected.map((page) => page.path), effort: "minutes" });
  }

  if ((home.hops || 0) >= 2) {
    add("SEO", "risk", "low", "seo-redirect-chain", "The start address takes " + home.hops + " redirects to answer",
      "The address you entered redirected " + home.hops + " times before " + home.path + " answered.",
      "Redirect the old address in one hop to the final https URL.", { effort: "minutes" });
  }

  const noindexRows = indexability.filter((row) => row.reason === "noindex");
  if (noindexRows.length) {
    const homeBlocked = noindexRows.some((row) => row.path === home.path);
    add("SEO", homeBlocked ? "fail" : "risk", homeBlocked ? "critical" : "medium", "seo-noindex", homeBlocked ? "The start page tells search engines not to index it" : plural(noindexRows.length, "page asks", "pages ask") + " search engines not to index it",
      sample(noindexRows.map((row) => row.path + " (" + row.robots + ")"), 4) + ".",
      "Remove noindex from pages that should be found, and keep it only on private or duplicate pages.", { pages: noindexRows.map((row) => row.path), effort: "minutes", cases: ["SEO-04"] });
  }

  const canonicalAway = indexability.filter((row) => /^Canonical points/.test(row.reason) && row.path.indexOf("?") === -1);
  if (canonicalAway.length) {
    add("SEO", "risk", "medium", "seo-canonical-away", plural(canonicalAway.length, "page names", "pages name") + " another URL as canonical",
      sample(canonicalAway.map((row) => row.path + " → " + row.canonical), 4) + ". Search engines will usually index the other URL instead.",
      "Make each page's canonical point at itself unless it is a real duplicate.", { pages: canonicalAway.map((row) => row.path), effort: "minutes", cases: ["CT-02"] });
  }
  const noCanonical = read.filter((page) => !(page.inspect.seo && page.inspect.seo.canonicalAbs));
  if (noCanonical.length && read.length) {
    add("SEO", "risk", "low", "seo-canonical-missing", plural(noCanonical.length, "page has", "pages have") + " no canonical link",
      sample(noCanonical.map((page) => page.path), 4) + ". Without it, tracking parameters and trailing slashes can split ranking signals.",
      "Add <link rel=\"canonical\" href=\"…\"> with the page's own https URL.", { pages: noCanonical.map((page) => page.path), effort: "minutes", cases: ["CT-02"] });
  }

  const untitled = read.filter((page) => !page.inspect.title);
  if (untitled.length) {
    add("SEO", "fail", "high", "seo-title-missing", plural(untitled.length, "page has", "pages have") + " no title", sample(untitled.map((page) => page.path), 4) + ".",
      "Give every page a unique title of about 30 to 60 characters.", { pages: untitled.map((page) => page.path), effort: "minutes", cases: ["FN-02", "FN-07"] });
  }
  else if (read.length) add("SEO", "pass", "info", "seo-title-missing", "Every page has a title", plural(read.length, "page") + " checked.", "", { cases: ["FN-02", "FN-07"] });
  const groupBy = (getter) => {
    const map = new Map();
    read.forEach((page) => {
      if (!indexablePaths.has(page.path)) return;
      const value = getter(page);
      if (!value) return;
      if (!map.has(value)) map.set(value, { paths: [], urls: new Set() });
      const entry = map.get(value);
      entry.paths.push(page.path);
      entry.urls.add(normal(page.url));
    });
    return [...map.entries()].filter((pair) => pair[1].urls.size > 1).map(([value, entry]) => ({ value, paths: entry.paths }));
  };
  const dupTitles = groupBy((page) => page.inspect.title);
  const dupDescriptions = groupBy((page) => page.inspect.description);
  if (dupTitles.length) {
    add("SEO", "risk", "medium", "seo-duplicate-titles", plural(dupTitles.length, "title is", "titles are") + " shared by more than one page",
      dupTitles.slice(0, 3).map((item) => "\"" + item.value.slice(0, 70) + "\" on " + sample(item.paths, 3)).join(". ") + ".",
      "Write a title that names what is different about each page.", { pages: [].concat.apply([], dupTitles.map((item) => item.paths)), effort: "hours", cases: ["FN-08"] });
  }
  const noDescription = read.filter((page) => !page.inspect.description);
  if (noDescription.length) {
    add("SEO", "risk", "medium", "seo-description-missing", plural(noDescription.length, "page has", "pages have") + " no meta description",
      sample(noDescription.map((page) => page.path), 4) + ". Google and AI answers then write their own snippet from whatever text they find.",
      "Write a 50 to 160 character description for each page that says what a reader gets.", { pages: noDescription.map((page) => page.path), effort: "hours", cases: ["CT-01"] });
  }
  else if (read.length) add("SEO", "pass", "info", "seo-description-missing", "Every page has a meta description", plural(read.length, "page") + " checked.", "", { cases: ["CT-01"] });
  if (dupDescriptions.length) {
    add("SEO", "risk", "low", "seo-duplicate-descriptions", plural(dupDescriptions.length, "description is", "descriptions are") + " shared by more than one page",
      dupDescriptions.slice(0, 2).map((item) => "\"" + item.value.slice(0, 70) + "…\" on " + sample(item.paths, 3)).join(". ") + ".",
      "Describe each page on its own.", { pages: [].concat.apply([], dupDescriptions.map((item) => item.paths)), effort: "hours", cases: ["CT-01"] });
  }
  const longTitles = read.filter((page) => (page.inspect.title || "").length > 65);
  if (longTitles.length) {
    add("SEO", "risk", "low", "seo-title-length", plural(longTitles.length, "title runs", "titles run") + " past about 60 characters",
      sample(longTitles.map((page) => page.path + " (" + page.inspect.title.length + ")"), 4) + ". Google cuts them with an ellipsis.",
      "Lead with the words that matter and keep titles near 60 characters.", { pages: longTitles.map((page) => page.path), effort: "minutes" });
  }
  const thin = read.filter((page) => page.depth > 0 && indexablePaths.has(page.path) && (page.inspect.words || 0) < 150);
  if (thin.length) {
    add("SEO", "risk", "low", "seo-thin", plural(thin.length, "indexable page carries", "indexable pages carry") + " fewer than 150 words in the HTML",
      sample(thin.map((page) => page.path + " (" + (page.inspect.words || 0) + " words)"), 4) + ".",
      "Add useful copy, merge thin pages, or mark them noindex.", { pages: thin.map((page) => page.path), effort: "days" });
  }

  // Sitemap compared with the crawl.
  const sitemap = extras.sitemap || {};
  const sitemapSet = new Set((sitemap.urls || []).map(normal));
  const sitemapReport = { found: !!(sitemap.urls && sitemap.urls.length), source: sitemap.source || "", count: (sitemap.urls || []).length, status: sitemap.status || 0, notListed: [], listedNotIndexable: [], notLinked: [], offHost: 0 };
  if (sitemapReport.found) {
    sitemapReport.offHost = (sitemap.urls || []).filter((url) => hostOf(url) !== host).length;
    sitemapReport.notListed = indexable.filter((row) => !sitemapSet.has(normal(origin + row.path))).map((row) => row.path).slice(0, 40);
    sitemapReport.listedNotIndexable = indexability.filter((row) => !row.indexable && sitemapSet.has(normal(origin + row.path))).map((row) => row.path + " (" + row.reason + ")").slice(0, 40);
    const linked = new Set();
    pages.forEach((page) => ((page.inspect && page.inspect.links) || []).forEach((link) => linked.add(normal(link))));
    linked.add(normal(home.url));
    sitemapReport.notLinked = (sitemap.urls || []).filter((url) => hostOf(url) === host && !linked.has(normal(url))).map(pathOf).slice(0, 40);
    if (sitemapReport.listedNotIndexable.length) {
      add("SEO", "risk", "medium", "seo-sitemap-dirty", "The sitemap lists " + plural(sitemapReport.listedNotIndexable.length, "page") + " search engines should not index",
        sample(sitemapReport.listedNotIndexable, 4) + ".", "List only live, canonical, indexable URLs in the sitemap.", { pages: sitemapReport.listedNotIndexable, effort: "minutes", cases: ["SEO-03"] });
    }
    if (sitemapReport.notListed.length) {
      add("SEO", "risk", "low", "seo-sitemap-missing-pages", plural(sitemapReport.notListed.length, "indexable page is", "indexable pages are") + " missing from the sitemap",
        sample(sitemapReport.notListed, 4) + ".", "Add them to the sitemap or regenerate it on each deploy.", { pages: sitemapReport.notListed, effort: "minutes", cases: ["SEO-03"] });
    }
    if (sitemapReport.offHost) {
      add("SEO", "risk", "medium", "seo-sitemap-offhost", plural(sitemapReport.offHost, "sitemap URL points", "sitemap URLs point") + " at another host or scheme",
        "The sitemap should list only URLs on https://" + host + ".", "Regenerate the sitemap with the production https host.", { count: sitemapReport.offHost, effort: "minutes", cases: ["SEO-03"] });
    }
    if (!sitemapReport.listedNotIndexable.length && !sitemapReport.notListed.length && !sitemapReport.offHost) {
      add("SEO", "pass", "info", "seo-sitemap", "The sitemap matches the pages that were read", plural(sitemapReport.count, "URL") + " in " + pathOf(sitemapReport.source) + ".", "", { cases: ["SEO-03"] });
    }
  } else {
    add("SEO", "risk", "medium", "seo-sitemap", "No sitemap was found",
      (robots.sitemaps.length ? "robots.txt names " + robots.sitemaps[0] + " but it did not return URLs." : "robots.txt names no sitemap and /sitemap.xml returned " + (sitemap.status || "nothing") + "."),
      "Publish /sitemap.xml and add a Sitemap: line to robots.txt.", { effort: "hours", cases: ["SEO-03"] });
  }

  // Language alternates.
  const hreflangIssues = [];
  read.forEach((page) => {
    const alts = (page.inspect.seo && page.inspect.seo.hreflang) || [];
    if (!alts.length || !indexablePaths.has(page.path)) return;
    const selfRef = alts.some((alt) => normal(alt.href) === normal(page.url));
    if (!selfRef) hreflangIssues.push(page.path + " has no self reference");
    alts.forEach((alt) => {
      if (!/^(x-default|[a-z]{2,3}(-[a-z0-9]{2,4})?)$/i.test(alt.lang)) hreflangIssues.push(page.path + " uses an invalid code \"" + alt.lang + "\"");
      const target = byUrl.get(normal(alt.href));
      if (!target || !target.inspect || target === page || !indexablePaths.has(target.path)) return;
      const back = ((target.inspect.seo && target.inspect.seo.hreflang) || []).some((other) => normal(other.href) === normal(page.url));
      if (!back) hreflangIssues.push(target.path + " does not link back to " + page.path);
    });
  });
  if (hreflangIssues.length) {
    add("SEO", "risk", "medium", "seo-hreflang", plural(hreflangIssues.length, "language alternate problem"), sample(hreflangIssues, 3) + ".",
      "Each language version must list every version, itself included, and each must link back.", { count: hreflangIssues.length, effort: "hours", cases: ["SEO-02"] });
  } else if (read.some((page) => ((page.inspect.seo && page.inspect.seo.hreflang) || []).length)) {
    add("SEO", "pass", "info", "seo-hreflang", "Language alternates point at each other", "Every alternate that was read links back.", "", { cases: ["SEO-02"] });
  }

  // Structured data.
  const schemaErrors = read.reduce((sum, page) => sum + ((page.inspect.schema && page.inspect.schema.errors) || 0), 0);
  const schemaGaps = [];
  const schemaTypes = new Set();
  read.forEach((page) => {
    ((page.inspect.schema && page.inspect.schema.items) || []).forEach((item) => {
      (item.types || []).forEach((type) => schemaTypes.add(type));
      (item.types || []).forEach((type) => {
        const need = REQUIRED_PROPS[type];
        if (!need) return;
        const missing = need.filter((prop) => Array.isArray(prop) ? !prop.some((one) => item.props.indexOf(one) !== -1) : item.props.indexOf(prop) === -1)
          .map((prop) => Array.isArray(prop) ? prop.join(" or ") : prop);
        if (missing.length) schemaGaps.push(page.path + " " + type + " lacks " + missing.join(", "));
      });
    });
  });
  if (schemaErrors) {
    add("SEO", "fail", "medium", "seo-schema-parse", plural(schemaErrors, "JSON-LD block does", "JSON-LD blocks do") + " not parse",
      "A block that is not valid JSON is ignored by Google and by AI crawlers.", "Validate each block with the Schema Markup Validator and fix the JSON.", { count: schemaErrors, effort: "minutes", cases: ["CT-04"] });
  }
  if (schemaGaps.length) {
    add("SEO", "risk", "medium", "seo-schema-props", plural(schemaGaps.length, "structured data item misses", "structured data items miss") + " a property Google expects",
      sample(schemaGaps, 3) + ".", "Fill the missing properties so the item qualifies for rich results.", { count: schemaGaps.length, effort: "hours", cases: ["CT-04"] });
  }
  if (!schemaTypes.size) {
    add("SEO", "risk", "low", "seo-schema", "No structured data was found", "No JSON-LD block was found on the pages that were read.",
      "Add Organization or Person, WebSite, and BreadcrumbList JSON-LD. The fix kit has a draft.", { effort: "hours", cases: ["CT-04"] });
  } else if (!schemaErrors && !schemaGaps.length) {
    add("SEO", "pass", "info", "seo-schema", "Structured data parses and carries the expected properties", "Types: " + sample([...schemaTypes], 6) + ".", "", { cases: ["CT-04"] });
  }

  // Social previews.
  const social = face.social || {};
  const socialMissing = [];
  if (!social.ogTitle) socialMissing.push("og:title");
  if (!social.ogDescription) socialMissing.push("og:description");
  if (!social.ogImage) socialMissing.push("og:image");
  if (!social.ogUrl) socialMissing.push("og:url");
  if (!social.twitterCard) socialMissing.push("twitter:card");
  if (social.ogImage && !/^https:\/\//i.test(social.ogImage)) socialMissing.push("an https og:image");
  if (socialMissing.length) {
    add("SEO", "risk", socialMissing.indexOf("og:image") !== -1 ? "medium" : "low", "seo-social", "Share cards are missing " + sample(socialMissing, 5),
      "LinkedIn, WhatsApp, Slack, and X build the preview from these tags. The preview in this report shows what they would show today.",
      "Add the missing Open Graph and Twitter tags to every page template.", { effort: "minutes", cases: ["CT-03"] });
  } else {
    add("SEO", "pass", "info", "seo-social", "Share cards have a title, description, image, and URL", "og:title, og:description, og:image, og:url, and twitter:card are present.", "", { cases: ["CT-03"] });
  }
  if (!face.icon) add("SEO", "risk", "low", "seo-favicon", "No favicon is declared", "Google shows a favicon next to each mobile result.", "Add <link rel=\"icon\" href=\"/favicon.svg\"> with a square icon.", { effort: "minutes" });

  const soft = extras.soft404 || {};
  if (soft.status === 200) {
    add("SEO", "risk", "medium", "seo-soft-404", "A missing page answers 200 instead of 404",
      "A made-up path answered 200" + (soft.title ? " with the title \"" + soft.title + "\"" : "") + ". Search engines call this a soft 404 and may index empty pages.",
      "Return status 404 (or 410) for unknown paths, with a helpful page.", { effort: "hours", cases: ["RS-01"] });
  } else if (soft.status === 404 || soft.status === 410) {
    add("SEO", "pass", "info", "seo-soft-404", "Unknown paths answer " + soft.status, "A made-up path answered " + soft.status + ".", "", { cases: ["RS-01"] });
  }

  if (!(face.signals && face.signals.viewport)) {
    add("SEO", "fail", "high", "seo-viewport", "The start page has no viewport tag", "Without it, phones render the desktop layout zoomed out. Google indexes the mobile version first.",
      "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.", { effort: "minutes", cases: ["MB-01", "VIS-02"] });
  } else {
    add("SEO", "pass", "info", "seo-viewport", "The start page sets a mobile viewport", "A viewport meta tag is present.", "", { cases: ["MB-01", "VIS-02"] });
  }

  // GEO
  const crawlers = AI_BOTS.map((bot) => {
    const verdict = robots.groups.length ? robotsVerdict(bot.token, "/", robots.groups) : { allowed: true, rule: "", named: false };
    const blockedPages = robots.groups.length ? read.filter((page) => !robotsVerdict(bot.token, pathOf(page.url), robots.groups).allowed).length : 0;
    return Object.assign({}, bot, { allowed: verdict.allowed, rule: verdict.rule, named: verdict.named, blockedPages });
  });
  const answerBlocked = crawlers.filter((bot) => bot.role !== "training" && !bot.allowed);
  const trainingBlocked = crawlers.filter((bot) => bot.role === "training" && !bot.allowed);
  const partly = crawlers.filter((bot) => bot.role !== "training" && bot.allowed && bot.blockedPages > 0);
  if (answerBlocked.length) {
    add("GEO", "fail", "high", "geo-crawlers", plural(answerBlocked.length, "AI answer or search crawler is", "AI answer or search crawlers are") + " blocked",
      answerBlocked.map((bot) => bot.token + " (" + bot.product + ")" + (bot.rule ? " by " + bot.rule : "")).slice(0, 5).join(", ") + ". These bots fetch pages to cite them in answers. Blocked means the site is not quoted there.",
      "Allow the answer bots in robots.txt. Training bots can stay blocked if that is the policy.", { count: answerBlocked.length, effort: "minutes" });
  } else {
    add("GEO", "pass", "info", "geo-crawlers", "AI answer and search crawlers may read the start page",
      robots.groups.length ? "robots.txt does not block ChatGPT search, Claude, Perplexity, Google, or Bing at the root." : "No robots.txt rules were found, so every crawler is allowed by default.", "");
  }
  if (partly.length) {
    add("GEO", "risk", "medium", "geo-crawlers-partial", "Some pages are closed to AI answer crawlers",
      partly.slice(0, 4).map((bot) => bot.token + " cannot read " + plural(bot.blockedPages, "page")).join(", ") + ".",
      "Check that the closed paths are meant to stay out of AI answers.", { count: partly.length, effort: "minutes" });
  }
  if (trainingBlocked.length) {
    add("GEO", "pass", "info", "geo-training", "Model-training crawlers are blocked by choice",
      trainingBlocked.map((bot) => bot.token).join(", ") + " are disallowed. That does not stop answer bots from citing the site.", "");
  }
  const homeText = input.homeText || { text: "", chars: 0, outline: [] };
  const appShell = !!(face.signals && face.signals.appShell);
  if ((homeText.chars || 0) < 300) {
    add("GEO", "fail", "high", "geo-js-only", "AI crawlers see an almost empty start page",
      "The HTML carries " + (homeText.chars || 0) + " characters of readable text" + (appShell ? " and an empty app root, so the content is drawn by JavaScript" : "") + ". Most AI crawlers do not run JavaScript.",
      "Render the main content on the server or pre-render it at build time.", { effort: "days" });
  } else if ((homeText.chars || 0) < 900) {
    add("GEO", "risk", "medium", "geo-js-only", "AI crawlers see little text on the start page",
      "The HTML carries " + homeText.chars + " characters of readable text. AI answers quote what they can read without scripts.",
      "Put the key facts (what, who, where, price, contact) in plain HTML text.", { effort: "hours" });
  } else {
    add("GEO", "pass", "info", "geo-js-only", "The start page reads well without JavaScript", homeText.chars + " characters of text are in the HTML.", "");
  }
  const llms = extras.llms || {};
  const llmsReport = { status: llms.status || 0, ok: false, title: "", summary: "", sections: 0, links: 0, full: !!(extras.llmsFull && extras.llmsFull.status === 200 && !extras.llmsFull.html) };
  if (llms.status === 200 && !llms.html && /^\s*#\s+\S/.test(llms.body || "")) {
    const body = llms.body || "";
    llmsReport.ok = true;
    llmsReport.title = ((body.match(/^\s*#\s+(.+)$/m) || [])[1] || "").slice(0, 120);
    llmsReport.summary = ((body.match(/^\s*>\s*(.+)$/m) || [])[1] || "").slice(0, 240);
    llmsReport.sections = (body.match(/^##\s+/gm) || []).length;
    llmsReport.links = (body.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    llmsReport.bareLinks = (body.match(/(^|\s)https?:\/\/\S+/gm) || []).length;
    const gaps = [];
    if (!llmsReport.summary) gaps.push("a > summary line");
    if (!llmsReport.links && !llmsReport.bareLinks) gaps.push("links to key pages");
    else if (!llmsReport.links) gaps.push("Markdown [title](url) links");
    llmsReport.complete = !gaps.length;
    add("GEO", gaps.length ? "risk" : "pass", "low", "geo-llms", gaps.length ? "llms.txt exists but lacks " + gaps.join(" and ") : "llms.txt is published",
      "/llms.txt has " + plural(llmsReport.sections, "section") + " and " + plural(llmsReport.links || llmsReport.bareLinks || 0, "link") + (llmsReport.full ? ", and /llms-full.txt is present." : "."),
      gaps.length ? "Follow the llmstxt.org layout: # name, > summary, then ## sections of [title](url): note." : "", { effort: "minutes" });
  } else if (llms.status === 200 && llms.html) {
    add("GEO", "risk", "low", "geo-llms", "/llms.txt answers with an HTML page", "The address returns a web page, which usually means a catch-all route.",
      "Serve a plain-text /llms.txt. The fix kit has a draft built from this read.", { effort: "minutes" });
  } else {
    add("GEO", "risk", "low", "geo-llms", "No llms.txt was found", "/llms.txt returned " + (llms.status || "nothing") + ". It is a proposed convention that some AI tools read to find the pages that matter.",
      "Publish /llms.txt. The fix kit has a draft built from this read.", { effort: "minutes" });
  }
  const homeSchema = (face.schema && face.schema.items) || [];
  const allItems = [].concat.apply([], read.map((page) => (page.inspect.schema && page.inspect.schema.items) || []));
  const entity = homeSchema.find((item) => (item.types || []).some((type) => /^(Organization|Corporation|LocalBusiness|Person|NGO|EducationalOrganization|Store|Restaurant|ProfessionalService)$/.test(type)))
    || allItems.find((item) => (item.types || []).some((type) => /^(Organization|LocalBusiness|Person)$/.test(type)));
  const socialLinks = face.socialLinks || [];
  if (entity) {
    const missing = ["name", "url", ["logo", "image"], "sameAs"].filter((prop) => Array.isArray(prop) ? !prop.some((one) => entity.props.indexOf(one) !== -1) : entity.props.indexOf(prop) === -1)
      .map((prop) => Array.isArray(prop) ? prop.join(" or ") : prop);
    const unlisted = socialLinks.filter((link) => (entity.sameAs || []).map(normal).indexOf(normal(link)) === -1);
    if (missing.length || unlisted.length) {
      add("GEO", "risk", "low", "geo-entity", "The " + entity.types[0] + " entity is incomplete",
        (missing.length ? "It lacks " + missing.join(", ") + ". " : "") + (unlisted.length ? plural(unlisted.length, "profile linked on the page is", "profiles linked on the page are") + " not in sameAs (" + sample(unlisted.map(hostOf), 3) + ")." : ""),
        "Complete the entity so AI answers connect the brand to its profiles. The fix kit has a draft.", { effort: "minutes" });
    } else {
      add("GEO", "pass", "info", "geo-entity", "The " + entity.types[0] + " entity is complete", "name, url, image, and sameAs are present.", "");
    }
  } else {
    add("GEO", "risk", "medium", "geo-entity", "No Organization or Person entity describes who is behind the site",
      "AI answers lean on this to name the brand, its logo, and its profiles." + (socialLinks.length ? " The page links " + plural(socialLinks.length, "profile") + " that could go in sameAs." : ""),
      "Add Organization (or Person) JSON-LD with name, url, logo, and sameAs. The fix kit has a draft.", { effort: "minutes" });
  }
  const questionHeads = read.reduce((sum, page) => sum + (page.inspect.questionHeadings || 0), 0);
  const faq = schemaTypes.has("FAQPage") || schemaTypes.has("QAPage") || schemaTypes.has("HowTo");
  if (questionHeads || faq) {
    add("GEO", "pass", "info", "geo-answers", "Some content is shaped as questions and answers",
      (faq ? "FAQ or HowTo structured data is present. " : "") + (questionHeads ? plural(questionHeads, "heading is", "headings are") + " phrased as a question." : ""), "");
  } else {
    add("GEO", "risk", "low", "geo-answers", "No content is shaped as questions and answers",
      "No heading on the pages read is a question and no FAQ data was found. AI answers favour short, direct answers under a question.",
      "Add an FAQ block with the questions customers ask, answered in two or three sentences each.", { effort: "hours" });
  }
  const dated = read.some((page) => page.inspect.dated) || allItems.some((item) => item.props.indexOf("dateModified") !== -1 || item.props.indexOf("datePublished") !== -1);
  const authored = read.some((page) => page.inspect.author) || allItems.some((item) => item.props.indexOf("author") !== -1);
  if (!dated || !authored) {
    add("GEO", "risk", "low", "geo-trust", "Pages do not say " + [!authored ? "who wrote them" : "", !dated ? "when they were updated" : ""].filter(Boolean).join(" or "),
      "Author and date signals help search engines and AI answers judge whether a page is current and credible.",
      "Show an author and a last-updated date on content pages, and add them to the JSON-LD.", { effort: "hours" });
  } else {
    add("GEO", "pass", "info", "geo-trust", "Pages carry author and date signals", "An author and a published or modified date were found.", "");
  }
  const noai = read.filter((page) => /noai|noimageai/i.test([page.inspect.seo && page.inspect.seo.robots, page.inspect.seo && page.inspect.seo.xRobots].join(",")));
  if (noai.length) {
    add("GEO", "pass", "info", "geo-noai", plural(noai.length, "page opts", "pages opt") + " out of AI use with noai", sample(noai.map((page) => page.path), 3) + ". Few crawlers honour this tag; robots.txt is the rule they follow.", "");
  }

  // Analytics
  const tagPages = {};
  const tagIds = {};
  read.forEach((page) => {
    ((page.inspect.analytics && page.inspect.analytics.tags) || []).forEach((tag) => {
      if (!tagPages[tag.name]) tagPages[tag.name] = [];
      if (tagPages[tag.name].indexOf(page.path) === -1) tagPages[tag.name].push(page.path);
      if (!tagIds[tag.name]) tagIds[tag.name] = [];
      (tag.ids || []).forEach((id) => { if (tagIds[tag.name].indexOf(id) === -1 && tagIds[tag.name].length < 6) tagIds[tag.name].push(id); });
    });
  });
  const tags = Object.keys(tagPages).map((name) => ({ name, ids: tagIds[name] || [], pages: tagPages[name].length, cookieless: COOKIELESS.indexOf(name) !== -1 }));
  const consentTools = [];
  let consentMode = null;
  read.forEach((page) => {
    const a = page.inspect.analytics || {};
    (a.consent || []).forEach((name) => { if (consentTools.indexOf(name) === -1) consentTools.push(name); });
    if (a.consentMode && !consentMode) consentMode = a.consentMode;
  });
  const tracking = tags.filter((tag) => !tag.cookieless);
  const googleTags = tags.filter((tag) => /^Google/.test(tag.name));
  const homeTags = new Set(((face.analytics && face.analytics.tags) || []).map((tag) => tag.name));
  const untagged = homeTags.size ? read.filter((page) => !((page.inspect.analytics && page.inspect.analytics.tags) || []).length && !(page.inspect.analytics && page.inspect.analytics.loader)).map((page) => page.path) : [];
  if (!tags.length && consentTools.length) {
    add("Analytics", "person", "info", "an-none", "Tags are probably loaded by a script", consentTools.join(", ") + " manages consent, but none of 26 known analytics tools is written in the HTML. The browser run lists what loads after the page starts.", "", { cases: ["AN-01"] });
  } else if (!tags.length) {
    add("Analytics", "risk", "low", "an-none", "No known analytics tag is in the HTML", "None of 26 known analytics tools appeared in the HTML of the pages read. A tag injected later by a script would not show here.",
      "If visits matter, add a measurement tool. A cookieless one such as Plausible or Cloudflare Web Analytics avoids a consent banner.", { effort: "hours", cases: ["AN-01"] });
  } else {
    add("Analytics", "pass", "info", "an-inventory", plural(tags.length, "measurement tool was", "measurement tools were") + " found", tags.map((tag) => tag.name + (tag.ids.length ? " (" + tag.ids.join(", ") + ")" : "")).join(", ") + ".", "");
  }
  if (untagged.length) {
    add("Analytics", "risk", "medium", "an-gaps", plural(untagged.length, "page has", "pages have") + " no measurement tag while the start page does",
      sample(untagged, 4) + ". Visits to those pages are invisible in the reports.", "Load the same tag from the shared layout on every page.", { pages: untagged, effort: "minutes" });
  }
  const multiGa = read.filter((page) => ((page.inspect.analytics && page.inspect.analytics.ga4) || []).length > 1);
  const doubleLoad = read.filter((page) => (page.inspect.analytics && page.inspect.analytics.gtagLoads) > 1);
  if (multiGa.length || doubleLoad.length) {
    add("Analytics", "risk", "medium", "an-duplicate", "Analytics may count some visits twice",
      (multiGa.length ? plural(multiGa.length, "page sends", "pages send") + " to more than one GA4 property. " : "") + (doubleLoad.length ? plural(doubleLoad.length, "page loads", "pages load") + " gtag.js more than once." : ""),
      "Keep one GA4 property per site and load gtag.js once, or manage it only inside Tag Manager.", { pages: multiGa.concat(doubleLoad).map((page) => page.path), effort: "minutes" });
  }
  if (tagPages["Google Tag Manager"] && tagPages["Google Analytics 4"]) {
    add("Analytics", "risk", "low", "an-gtm-and-gtag", "GA4 is loaded directly and Tag Manager is also present",
      "If the Tag Manager container also fires a GA4 tag, page views are sent twice.", "Check the container in Tag Manager preview and keep GA4 in one place.", { effort: "minutes" });
  }
  if (tagPages["Universal Analytics"]) {
    add("Analytics", "risk", "low", "an-ua", "Universal Analytics code is still on the page", "Google stopped processing Universal Analytics data in July 2024. The code adds weight and collects nothing.",
      "Remove the UA- tag and keep GA4.", { pages: tagPages["Universal Analytics"], effort: "minutes" });
  }
  if (tracking.length && !consentTools.length && !consentMode) {
    add("Analytics", "risk", "high", "an-consent", "Tracking tags load with no consent tool in the page",
      tracking.map((tag) => tag.name).join(", ") + (tracking.length === 1 ? " appears" : " appear") + " in the HTML and no consent platform or Google Consent Mode default was found. In the EU, the UK, Brazil, and Colombia this is a legal exposure.",
      "Add a consent platform and set Google Consent Mode v2 defaults to denied before any tag loads.", { effort: "hours", cases: ["PR-03", "AN-01"] });
  } else if (googleTags.length && consentTools.length && !consentMode) {
    add("Analytics", "risk", "medium", "an-consent-mode", consentTools.join(", ") + " is present but Google Consent Mode defaults were not found",
      "Without Consent Mode v2 defaults, Google tags can fire before the visitor chooses, and Google Ads loses modelled conversions.",
      "Call gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'}) before the tags.", { effort: "minutes", cases: ["PR-03", "AN-01"] });
  } else if (consentMode) {
    const v2 = consentMode.v2;
    const denied = consentMode.analytics === "denied";
    add("Analytics", denied && v2 ? "pass" : "risk", denied ? "low" : "medium", "an-consent-mode",
      denied ? (v2 ? "Consent Mode v2 starts in denied" : "Consent Mode starts in denied, without the v2 signals") : "Consent Mode default grants analytics before a choice",
      "gtag consent default sets analytics_storage to " + (consentMode.analytics || "unset") + (v2 ? " and includes ad_user_data and ad_personalization." : "."),
      denied && v2 ? "" : "Default every storage type to denied and add ad_user_data and ad_personalization.", { effort: "minutes", cases: ["PR-03", "AN-01"] });
  } else if (consentTools.length) {
    add("Analytics", "pass", "info", "an-consent", "A consent tool is present", consentTools.join(", ") + " was found in the HTML.", "", { cases: ["PR-03"] });
  }
  if (tracking.length) {
    add("Analytics", "person", "info", "an-firing", "Whether tags fire before a choice needs a browser run",
      "A raw HTML read can see the tags but not the requests they send. The browser run records every hit before and after consent.", "", { cases: ["AN-01"] });
  }
  const utm = extras.utm || null;
  if (utm && utm.status) {
    if (utm.kept) add("Analytics", "pass", "info", "an-utm", "Campaign parameters survive the redirects", "A visit with utm_source, utm_medium, and utm_campaign kept them on " + pathOf(utm.finalUrl) + ".", "");
    else add("Analytics", "fail", "medium", "an-utm", "Redirects strip campaign parameters",
      "A visit with ?utm_source=… ended on " + pathOf(utm.finalUrl) + " without them. Paid and email campaigns will show up as direct traffic.",
      "Keep the query string when redirecting (for example $request_uri in nginx, or :splat with query in Netlify).", { effort: "minutes" });
  }
  const pii = read.filter((page) => (page.inspect.piiLinks || 0) > 0);
  if (pii.length) {
    add("Analytics", "fail", "high", "an-pii", "Links carry email addresses in the URL",
      plural(pii.reduce((sum, page) => sum + page.inspect.piiLinks, 0), "link") + " on " + sample(pii.map((page) => page.path), 3) + " put an email address in the query string. Analytics tools record full URLs, and Google's terms forbid sending personal data.",
      "Move the email out of the URL (POST it, or use an opaque token).", { pages: pii.map((page) => page.path), effort: "hours" });
  }

  // Security
  const hdr = face.headers || {};
  const rawHeaders = face.rawHeaders || {};
  const httpCheck = extras.httpRedirect || null;
  if (httpCheck) {
    if (httpCheck.error) add("Security", "pass", "info", "sec-http", "Plain http does not serve the site", "Port 80 did not answer, so nothing is served without encryption.", "", { cases: ["SEC-01"] });
    else if ([301, 308].indexOf(httpCheck.status) !== -1 && /^https:/i.test(httpCheck.location || "")) add("Security", "pass", "info", "sec-http", "Plain http redirects permanently to https", "http:// answered " + httpCheck.status + " to " + httpCheck.location + ".", "", { cases: ["SEC-01"] });
    else if ([302, 303, 307].indexOf(httpCheck.status) !== -1 && /^https:/i.test(httpCheck.location || "")) add("Security", "risk", "low", "sec-http", "Plain http redirects to https with a temporary code", "http:// answered " + httpCheck.status + ". A 301 or 308 tells browsers and search engines the move is permanent.", "Use a 301 redirect from http to https.", { effort: "minutes", cases: ["SEC-01"] });
    else add("Security", "fail", "high", "sec-http", "Plain http serves the site without redirecting", "http:// answered " + httpCheck.status + (httpCheck.location ? " to " + httpCheck.location : "") + ". Visitors who type the address stay unencrypted.", "Redirect every http request to https with a 301, then add HSTS.", { effort: "minutes", cases: ["SEC-01"] });
  }
  if (!hdr.hsts) add("Security", "fail", "medium", "sec-hsts", "HSTS is not sent", "strict-transport-security was absent on the start page. A first visit over http can be intercepted.", "Send Strict-Transport-Security: max-age=31536000; includeSubDomains.", { effort: "minutes", cases: ["SEC-02"] });
  else {
    const age = Number((String(hdr.hsts).match(/max-age\s*=\s*(\d+)/i) || [])[1] || 0);
    if (age < 15552000) add("Security", "risk", "low", "sec-hsts", "HSTS max-age is shorter than six months", "max-age=" + age + ".", "Raise max-age to at least 15552000 (one year is 31536000).", { effort: "minutes", cases: ["SEC-02"] });
    else add("Security", "pass", "info", "sec-hsts", "HSTS is sent with a long max-age", hdr.hsts + ".", "", { cases: ["SEC-02"] });
  }
  const csp = cspDirectives(hdr.csp);
  if (!hdr.csp) {
    add("Security", "risk", "medium", "sec-csp", "No content security policy", "content-security-policy was absent. Injected scripts are not limited by the browser.",
      "Start with the Report-Only policy in the fix kit, watch the reports for a week, then enforce it.", { effort: "hours", cases: ["SEC-03"] });
  } else {
    const scriptSrc = csp["script-src"] || csp["default-src"] || [];
    const issues = [];
    if (!csp["default-src"] && !csp["script-src"]) issues.push("no default-src or script-src");
    if (scriptSrc.indexOf("'unsafe-inline'") !== -1 && !scriptSrc.some((token) => /^'(nonce|sha256|sha384|sha512)-/.test(token) || token === "'strict-dynamic'")) issues.push("script-src allows 'unsafe-inline'");
    if (scriptSrc.indexOf("'unsafe-eval'") !== -1) issues.push("script-src allows 'unsafe-eval'");
    if (scriptSrc.indexOf("*") !== -1 || scriptSrc.indexOf("https:") !== -1) issues.push("script-src allows any host");
    if (!csp["object-src"] && !(csp["default-src"] || []).some((token) => token === "'none'")) issues.push("object-src is not 'none'");
    if (!csp["base-uri"]) issues.push("base-uri is not set");
    if (issues.length) add("Security", "risk", issues.some((issue) => /any host|unsafe-inline/.test(issue)) ? "medium" : "low", "sec-csp", "The content security policy has gaps", sample(issues, 5) + ".",
      "Replace 'unsafe-inline' with nonces or hashes, limit hosts, and add object-src 'none' and base-uri 'self'.", { count: issues.length, effort: "hours", cases: ["SEC-03"] });
    else add("Security", "pass", "info", "sec-csp", "The content security policy is strict", "No unsafe-inline, unsafe-eval, or wildcard was found in script-src.", "", { cases: ["SEC-03"] });
  }
  if (!hdr.frame && !csp["frame-ancestors"]) add("Security", "risk", "medium", "sec-frame", "Other sites can frame the page", "Neither X-Frame-Options nor CSP frame-ancestors was sent, so the page can be framed for clickjacking.", "Send Content-Security-Policy: frame-ancestors 'self' (and X-Frame-Options: SAMEORIGIN for old browsers).", { effort: "minutes", cases: ["SEC-04"] });
  else add("Security", "pass", "info", "sec-frame", "Framing is limited", (hdr.frame ? "X-Frame-Options: " + hdr.frame : "frame-ancestors " + csp["frame-ancestors"].join(" ")) + ".", "", { cases: ["SEC-04"] });
  if (!hdr.nosniff) add("Security", "risk", "low", "sec-nosniff", "X-Content-Type-Options is not sent", "Browsers may guess a file's type and run it as script.", "Send X-Content-Type-Options: nosniff.", { effort: "minutes", cases: ["SEC-04"] });
  if (!hdr.referrer) add("Security", "risk", "low", "sec-referrer", "Referrer-Policy is not sent", "Browsers fall back to their default. An explicit policy keeps full URLs from leaking to other sites.", "Send Referrer-Policy: strict-origin-when-cross-origin.", { effort: "minutes", cases: ["SEC-05"] });
  if (!rawHeaders.permissions) add("Security", "risk", "low", "sec-permissions", "Permissions-Policy is not sent", "Embedded content can ask for the camera, microphone, or location.", "Send Permissions-Policy: camera=(), microphone=(), geolocation=().", { effort: "minutes", cases: ["SEC-08"] });
  const cookieNames = (list) => [...new Set(list.map((cookie) => cookie.name))];
  const insecure = cookieNames((face.cookies || []).filter((cookie) => !cookie.secure));
  const exposedSession = cookieNames((face.cookies || []).filter((cookie) => !cookie.httpOnly && /sess|sid$|^sid|auth|token|login|jwt|csrf/i.test(cookie.name)));
  if (insecure.length || exposedSession.length) {
    add("Security", "risk", exposedSession.length ? "high" : "medium", "sec-cookies",
      [insecure.length ? plural(insecure.length, "cookie is", "cookies are") + " sent without Secure" : "", exposedSession.length ? plural(exposedSession.length, "session cookie is", "session cookies are") + " readable by scripts" : ""].filter(Boolean).join(", and "),
      (insecure.length ? "Without Secure: " + sample(insecure, 4) + ". " : "") + (exposedSession.length ? "Without HttpOnly: " + sample(exposedSession, 4) + ". A script injected into the page could steal the session." : ""),
      "Set Secure on every cookie, and HttpOnly plus SameSite=Lax on session cookies.", { count: insecure.length + exposedSession.length, effort: "minutes", cases: ["SEC-06"] });
  } else if ((face.cookies || []).length) {
    add("Security", "pass", "info", "sec-cookies", "Cookies are Secure, and session cookies are HttpOnly", plural(cookieNames(face.cookies).length, "cookie") + " checked.", "", { cases: ["SEC-06"] });
  }
  const version = [hdr.server, rawHeaders.poweredBy].filter((value) => /\d+\.\d+/.test(value || ""));
  if (version.length) add("Security", "risk", "low", "sec-version", "Headers reveal a software version", version.join(", ") + ". Version numbers make it easier to match known flaws.", "Hide version numbers (server_tokens off, expose_php = Off).", { effort: "minutes", cases: ["SEC-07"] });
  const noSri = [];
  read.forEach((page) => ((page.inspect.sri && page.inspect.sri.missing) || []).forEach((h) => { if (!NO_SRI_HOSTS.test(h) && noSri.indexOf(h) === -1) noSri.push(h); }));
  if (noSri.length) add("Security", "risk", "low", "sec-sri", plural(noSri.length, "script host is", "script hosts are") + " loaded without integrity checks", sample(noSri, 4) + ". If that CDN is compromised, its code runs on the site.", "Add integrity=\"sha384-…\" and crossorigin=\"anonymous\" to fixed-version CDN scripts.", { count: noSri.length, effort: "minutes" });
  const mixed = read.filter((page) => (page.inspect.signals && page.inspect.signals.mixed) > 0);
  if (mixed.length) add("Security", "risk", "medium", "sec-mixed", plural(mixed.length, "page references", "pages reference") + " plain http resources", sample(mixed.map((page) => page.path + " (" + page.inspect.signals.mixed + ")"), 3) + ".", "Change the references to https or protocol-relative paths.", { pages: mixed.map((page) => page.path), effort: "minutes", cases: ["SEC-09"] });
  const tls = extras.tls || null;
  if (tls && tls.validTo) {
    const days = tls.daysLeft;
    if (days < 0) add("Security", "fail", "critical", "sec-tls", "The TLS certificate has expired", "It expired on " + tls.validTo + ".", "Renew the certificate now and turn on automatic renewal.", { effort: "minutes" });
    else if (days < 14) add("Security", "fail", "high", "sec-tls", "The TLS certificate expires in " + plural(days, "day"), "Valid until " + tls.validTo + (tls.issuer ? ", issued by " + tls.issuer : "") + ".", "Renew now and check that automatic renewal works.", { effort: "minutes" });
    else if (days < 30) add("Security", "risk", "medium", "sec-tls", "The TLS certificate expires in " + plural(days, "day"), "Valid until " + tls.validTo + (tls.issuer ? ", issued by " + tls.issuer : "") + ".", "Confirm that automatic renewal is scheduled.", { effort: "minutes" });
    else add("Security", "pass", "info", "sec-tls", "The TLS certificate is valid for " + plural(days, "more day"), "Valid until " + tls.validTo + (tls.issuer ? ", issued by " + tls.issuer : "") + ".", "");
  }
  const sec = extras.securityTxt || null;
  if (sec) {
    if (sec.status === 200 && !sec.html && /contact\s*:/i.test(sec.body || "")) {
      const expires = ((sec.body || "").match(/^\s*expires\s*:\s*(.+)$/im) || [])[1];
      const past = expires && !isNaN(Date.parse(expires)) && Date.parse(expires) < Date.now();
      if (past) add("Security", "risk", "medium", "sec-securitytxt", "security.txt has expired", "Expires: " + expires.trim() + ". Researchers may ignore an expired file.", "Update the Expires field.", { effort: "minutes" });
      else add("Security", "pass", "info", "sec-securitytxt", "security.txt tells researchers how to report a flaw", "/.well-known/security.txt has a Contact line.", "");
    } else {
      add("Security", "risk", "low", "sec-securitytxt", "No security.txt", "/.well-known/security.txt " + (sec.status === 200 && sec.html ? "answered with a web page instead of a text file" : "returned " + (sec.status || "nothing")) + ". Researchers who find a flaw have no published way to report it.", "Publish /.well-known/security.txt with Contact and Expires. The fix kit has a draft.", { effort: "minutes" });
    }
  }
  const dnsInfo = extras.dns || null;
  if (dnsInfo && dnsInfo.domain) {
    const sendsMail = (dnsInfo.mx || []).length > 0;
    if (sendsMail && !dnsInfo.spf) add("Security", "risk", "medium", "sec-spf", "The domain receives mail but publishes no SPF record", dnsInfo.domain + " has MX records and no v=spf1 TXT record. Anyone can send mail that claims to be from it.", "Publish an SPF record that lists the services that send your mail.", { effort: "minutes" });
    if (!sendsMail && !dnsInfo.spf) add("Security", "risk", "low", "sec-spf", "The domain does not say it sends no mail", dnsInfo.domain + " has no MX and no SPF record.", "Publish TXT \"v=spf1 -all\" so mail claiming to come from it is rejected.", { effort: "minutes" });
    if (!dnsInfo.dmarc) add("Security", "risk", sendsMail ? "medium" : "low", "sec-dmarc", "No DMARC policy", "_dmarc." + dnsInfo.domain + " has no v=DMARC1 record. Spoofed mail from this domain is not rejected, and Gmail and Yahoo now expect DMARC from bulk senders.", "Start with p=none and a rua address, then move to quarantine or reject.", { effort: "minutes" });
    else if (/p\s*=\s*none/i.test(dnsInfo.dmarc)) add("Security", "risk", "low", "sec-dmarc", "DMARC only monitors", "The policy is p=none, so spoofed mail is still delivered.", "Move to p=quarantine, then p=reject, once reports look clean.", { effort: "hours" });
    else add("Security", "pass", "info", "sec-dmarc", "DMARC rejects or quarantines spoofed mail", dnsInfo.dmarc.slice(0, 120) + ".", "");
    if (dnsInfo.spf && sendsMail) add("Security", "pass", "info", "sec-spf", "SPF is published", dnsInfo.spf.slice(0, 120) + ".", "");
    if (!(dnsInfo.caa || []).length) add("Security", "risk", "low", "sec-caa", "No CAA record limits who may issue certificates", dnsInfo.domain + " has no CAA record, so any certificate authority may issue for it.", "Add a CAA record for the authority you use, for example 0 issue \"letsencrypt.org\".", { effort: "minutes" });
  }
  (input.alerts || []).filter((alert) => alert.level === "Leak").forEach((alert, index) => {
    add("Security", "fail", "critical", "sec-leak-" + index, alert.title, alert.detail, "Remove it from the page and rotate the secret.", { effort: "hours" });
  });

  // Accessibility
  const altPages = read.filter((page) => (page.inspect.missingAlt || 0) > 0);
  const altCount = altPages.reduce((sum, page) => sum + page.inspect.missingAlt, 0);
  if (altCount) add("Accessibility", "risk", "medium", "a11y-alt", plural(altCount, "image has", "images have") + " no alt attribute", "On " + sample(altPages.map((page) => page.path), 4) + ".", "Describe informative images. Give decorative ones alt=\"\".", { pages: altPages.map((page) => page.path), count: altCount, effort: "hours", cases: ["A11Y-01"] });
  else if (read.some((page) => page.inspect.images)) add("Accessibility", "pass", "info", "a11y-alt", "Every image has an alt attribute", "No image without alt was found.", "", { cases: ["A11Y-01"] });
  const unlabeledPages = read.filter((page) => (page.inspect.unlabeled || 0) > 0);
  if (unlabeledPages.length) add("Accessibility", "fail", "medium", "a11y-labels", plural(unlabeledPages.reduce((sum, page) => sum + page.inspect.unlabeled, 0), "form control has", "form controls have") + " no label", "On " + sample(unlabeledPages.map((page) => page.path), 4) + ". Screen readers announce them as an unnamed field.", "Pair each control with <label for>, wrap it in a label, or add aria-label.", { pages: unlabeledPages.map((page) => page.path), effort: "minutes", cases: ["FM-01"] });
  if (!face.lang) add("Accessibility", "fail", "medium", "a11y-lang", "The start page does not declare its language", "Screen readers pick the wrong voice and browsers offer the wrong translation.", "Set <html lang=\"…\">.", { effort: "minutes", cases: ["FN-04", "I18N-01"] });
  else add("Accessibility", "pass", "info", "a11y-lang", "The start page declares its language", "lang=\"" + face.lang + "\".", "", { cases: ["FN-04", "I18N-01"] });
  if (face.signals && face.signals.zoomBlocked) add("Accessibility", "fail", "medium", "a11y-zoom", "The viewport stops people from zooming", "The viewport tag sets user-scalable=no or maximum-scale=1.", "Remove user-scalable=no and maximum-scale from the viewport tag.", { effort: "minutes" });
  const noMain = read.filter((page) => !(page.inspect.signals && page.inspect.signals.main));
  if (noMain.length) add("Accessibility", "risk", "low", "a11y-main", plural(noMain.length, "page has", "pages have") + " no main landmark", sample(noMain.map((page) => page.path), 4) + ".", "Wrap the primary content in <main>.", { pages: noMain.map((page) => page.path), effort: "minutes", cases: ["A11Y-02"] });
  const h1Off = read.filter((page) => (page.inspect.h1 || []).length !== 1);
  if (h1Off.length) add("Accessibility", "risk", "low", "a11y-h1", plural(h1Off.length, "page does", "pages do") + " not have exactly one h1", sample(h1Off.map((page) => page.path + " (" + (page.inspect.h1 || []).length + ")"), 4) + ".", "Give each page one h1 that names it.", { pages: h1Off.map((page) => page.path), effort: "minutes", cases: ["FN-03"] });
  const frames = read.filter((page) => (page.inspect.signals && page.inspect.signals.untitledFrames) > 0);
  if (frames.length) add("Accessibility", "risk", "low", "a11y-frames", "Embedded frames have no title", "On " + sample(frames.map((page) => page.path), 3) + ".", "Add title=\"…\" to each iframe.", { pages: frames.map((page) => page.path), effort: "minutes", cases: ["A11Y-05"] });
  const tabs = read.filter((page) => (page.inspect.signals && page.inspect.signals.positiveTabindex) > 0);
  if (tabs.length) add("Accessibility", "risk", "low", "a11y-tabindex", "Positive tabindex reorders the keyboard path", "On " + sample(tabs.map((page) => page.path), 3) + ".", "Use tabindex=\"0\" or the natural order.", { pages: tabs.map((page) => page.path), effort: "minutes" });
  add("Accessibility", "person", "info", "a11y-render", "Contrast, focus order, and screen-reader output need a rendered page", "These are measured in the browser run with axe-core and a keyboard pass.", "", { cases: ["A11Y-04"] });

  // Performance
  const homeMs = home.ms || 0;
  if (homeMs > 1800) add("Performance", "fail", "medium", "pf-home", "The start page took " + homeMs + " ms to arrive", "That is the HTML alone, before images and scripts.", "Cache the HTML at the edge, or speed up the server render.", { effort: "days", cases: ["PF-01"] });
  else if (homeMs > 800) add("Performance", "risk", "low", "pf-home", "The start page took " + homeMs + " ms to arrive", "Good sites deliver the HTML in under 800 ms.", "Cache the HTML at the edge.", { effort: "hours", cases: ["PF-01"] });
  else add("Performance", "pass", "info", "pf-home", "The start page arrived in " + homeMs + " ms", "Under the 800 ms budget for the HTML.", "", { cases: ["PF-01"] });
  const slow = read.filter((page) => page.depth > 0 && page.ms > 1800);
  if (slow.length) add("Performance", "risk", "medium", "pf-slow", plural(slow.length, "page took", "pages took") + " longer than 1.8 s", sample(slow.map((page) => page.path + " (" + page.ms + " ms)"), 4) + ".", "Profile those templates; they are slower than the rest of the site.", { pages: slow.map((page) => page.path), effort: "days", cases: ["PF-03"] });
  const heavy = read.filter((page) => (page.inspect.bytes || 0) > 500000);
  if (heavy.length) add("Performance", "risk", "low", "pf-weight", plural(heavy.length, "HTML document is", "HTML documents are") + " heavier than 500 KB", sample(heavy.map((page) => page.path + " (" + Math.round(page.inspect.bytes / 1024) + " KB)"), 3) + ".", "Move inline data and SVG out of the HTML.", { pages: heavy.map((page) => page.path), effort: "hours" });
  const blocking = face.signals ? face.signals.blockingScripts || 0 : 0;
  if (blocking > 2) add("Performance", "risk", "low", "pf-blocking", plural(blocking, "script blocks", "scripts block") + " the first paint", "They sit in <head> without async or defer.", "Add defer to scripts that do not need to run before the page shows.", { count: blocking, effort: "minutes", cases: ["PF-02"] });
  const noSize = face.signals ? face.signals.imgNoSize || 0 : 0;
  if (noSize > 3) add("Performance", "risk", "low", "pf-cls", plural(noSize, "image has", "images have") + " no width or height", "The layout jumps when they load, which hurts Cumulative Layout Shift.", "Set width and height (or aspect-ratio) on images.", { count: noSize, effort: "hours", cases: ["VIS-01"] });
  if (face.signals && !face.signals.cacheControl) add("Performance", "risk", "low", "pf-cache", "The start page sends no cache-control", "Browsers and CDNs guess how long to keep it.", "Send cache-control on HTML (for example max-age=0, must-revalidate) and long max-age on hashed assets.", { effort: "minutes", cases: ["RS-03"] });
  const thirdHosts = face.signals ? (face.signals.thirdParty || []).length : 0;
  if (thirdHosts > 8) add("Performance", "risk", "low", "pf-third", plural(thirdHosts, "other host serves", "other hosts serve") + " scripts on the start page", "Each host adds a DNS lookup and a connection.", "Remove tags nobody reads and self-host the rest.", { count: thirdHosts, effort: "hours" });
  add("Performance", "person", "info", "pf-cwv", "Core Web Vitals need a rendered page", "Largest Contentful Paint, Interaction to Next Paint, and layout shift are measured by PageSpeed Insights or the browser run.", "");
  if (limits.timedOut) add("Performance", "person", "info", "coverage", "The time budget ended before every page was read", plural(limits.pagesRead || pages.length, "page") + " of " + (limits.maxPages || "?") + " were read. Slow responses use up the budget.", "");

  // Rank and score.
  const actionable = findings.filter((item) => item.verdict === "fail" || item.verdict === "risk");
  actionable.forEach((item) => {
    const reach = 1 + Math.log2((item.count || item.pages.length || 1) + 1) * 0.3;
    item.priority = Math.round((SEVERITY_RANK[item.severity] * 10 * (item.verdict === "fail" ? 1 : 0.6) * reach) / (EFFORT_COST[item.effort] || 1.6) * 10) / 10;
  });
  actionable.sort((a, b) => b.priority - a.priority || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  actionable.forEach((item, index) => { item.rank = index + 1; });
  const ordered = actionable.concat(findings.filter((item) => item.verdict === "person"), findings.filter((item) => item.verdict === "pass"));
  ordered.forEach((item, index) => { item.id = "F-" + String(index + 1).padStart(2, "0"); });

  const areas = {};
  AREAS.forEach((area) => {
    const mine = findings.filter((item) => item.area === area);
    let score = 100;
    let lowRisk = 0;
    mine.forEach((item) => {
      if (item.verdict === "fail") score -= SEVERITY_POINTS[item.severity] || 0;
      if (item.verdict === "risk" && item.severity === "low") lowRisk += Math.round(SEVERITY_POINTS.low / 2);
      else if (item.verdict === "risk") score -= Math.round((SEVERITY_POINTS[item.severity] || 0) / 2);
    });
    score -= Math.min(LOW_RISK_CAP, lowRisk);
    score = Math.max(0, Math.min(100, score));
    areas[area] = {
      score,
      grade: grade(score),
      fail: mine.filter((item) => item.verdict === "fail").length,
      risk: mine.filter((item) => item.verdict === "risk").length,
      pass: mine.filter((item) => item.verdict === "pass").length,
      person: mine.filter((item) => item.verdict === "person").length
    };
  });
  const weightSum = AREAS.reduce((sum, area) => sum + AREA_WEIGHT[area], 0);
  const overall = Math.round(AREAS.reduce((sum, area) => sum + areas[area].score * AREA_WEIGHT[area], 0) / weightSum);
  const totals = { fail: 0, risk: 0, pass: 0, person: 0 };
  findings.forEach((item) => { totals[item.verdict] += 1; });
  const severities = { critical: 0, high: 0, medium: 0, low: 0 };
  actionable.forEach((item) => { if (severities[item.severity] != null) severities[item.severity] += 1; });
  const top = actionable[0];
  const summary = host + " scores " + overall + " out of 100 (" + grade(overall) + "). " +
    plural(totals.fail, "check fails", "checks fail") + " now, " + plural(totals.risk, "is", "are") + " at risk, and " + totals.pass + " pass." +
    (top ? " Fix first: " + (/^[A-Z][a-z]/.test(top.title) ? top.title.charAt(0).toLowerCase() + top.title.slice(1) : top.title) + "." : "");

  const caseVerdicts = {};
  findings.forEach((item) => {
    item.cases.forEach((id) => {
      const prior = caseVerdicts[id];
      if (!prior || VERDICT_ORDER[item.verdict] > VERDICT_ORDER[prior.verdict] || (item.verdict === prior.verdict && SEVERITY_RANK[item.severity] > SEVERITY_RANK[prior.severity])) {
        caseVerdicts[id] = { verdict: item.verdict, severity: item.severity, finding: item.id };
      }
    });
  });

  const titleText = face.title || "";
  const description = face.description || "";
  const previews = {
    google: {
      title: titleText,
      titleCut: titleText.length > 60,
      url: host + (home.path && home.path !== "/" ? " › " + home.path.replace(/^\//, "").split(/[/?]/).filter(Boolean).join(" › ") : ""),
      site: social.ogSiteName || host,
      description,
      descriptionCut: description.length > 158,
      icon: face.icon || ""
    },
    social: {
      title: social.ogTitle || titleText,
      description: social.ogDescription || description,
      image: /^https:\/\//i.test(social.ogImage || "") ? social.ogImage : "",
      site: social.ogSiteName || host,
      host,
      card: social.twitterCard || "",
      fallback: !social.ogTitle || !social.ogImage
    }
  };

  const analytics = { tags, consentTools, consentMode, utm: utm && utm.status ? { kept: !!utm.kept, finalPath: pathOf(utm.finalUrl) } : null, untagged: untagged.slice(0, 20) };
  const geo = {
    crawlers: crawlers.map((bot) => ({ token: bot.token, owner: bot.owner, product: bot.product, role: bot.role, allowed: bot.allowed, rule: bot.rule, blockedPages: bot.blockedPages })),
    robotsFound: robots.groups.length > 0 || !!input.robotsText,
    llms: llmsReport,
    aiView: { text: (homeText.text || "").slice(0, 1600), chars: homeText.chars || 0, words: homeText.words || 0, outline: (homeText.outline || []).slice(0, 24), appShell },
    entity: entity ? { type: entity.types[0], props: entity.props.slice(0, 20), sameAs: (entity.sameAs || []).slice(0, 10) } : null,
    schemaTypes: [...schemaTypes].slice(0, 20),
    questionHeadings: questionHeads
  };
  const seo = {
    indexability: indexability.slice(0, 100),
    indexable: indexable.length,
    sitemap: sitemapReport,
    duplicates: { titles: dupTitles.slice(0, 10), descriptions: dupDescriptions.slice(0, 10) },
    schemaTypes: [...schemaTypes].slice(0, 20)
  };
  const security = {
    headers: [
      { label: "HTTPS redirect", state: httpCheck ? (httpCheck.error || [301, 308].indexOf(httpCheck.status) !== -1 ? "pass" : [302, 303, 307].indexOf(httpCheck.status) !== -1 ? "risk" : "fail") : "unknown" },
      { label: "HSTS", state: hdr.hsts ? "pass" : "fail" },
      { label: "Content-Security-Policy", state: hdr.csp ? (findings.some((item) => item.key === "sec-csp" && item.verdict === "risk") ? "risk" : "pass") : "risk" },
      { label: "Frame protection", state: hdr.frame || csp["frame-ancestors"] ? "pass" : "risk" },
      { label: "X-Content-Type-Options", state: hdr.nosniff ? "pass" : "risk" },
      { label: "Referrer-Policy", state: hdr.referrer ? "pass" : "risk" },
      { label: "Permissions-Policy", state: rawHeaders.permissions ? "pass" : "risk" },
      { label: "TLS certificate", state: tls && tls.validTo ? (tls.daysLeft < 14 ? "fail" : tls.daysLeft < 30 ? "risk" : "pass") : "unknown" },
      { label: "security.txt", state: sec ? (findings.some((item) => item.key === "sec-securitytxt" && item.verdict === "pass") ? "pass" : "risk") : "unknown" },
      { label: "SPF", state: dnsInfo && dnsInfo.domain ? (dnsInfo.spf ? "pass" : "risk") : "unknown" },
      { label: "DMARC", state: dnsInfo && dnsInfo.domain ? (dnsInfo.dmarc && !/p\s*=\s*none/i.test(dnsInfo.dmarc) ? "pass" : "risk") : "unknown" },
      { label: "CAA", state: dnsInfo && dnsInfo.domain ? ((dnsInfo.caa || []).length ? "pass" : "risk") : "unknown" }
    ],
    tls: tls && tls.validTo ? { validTo: tls.validTo, daysLeft: tls.daysLeft, issuer: tls.issuer || "" } : null
  };

  return {
    version: 1,
    score: { overall, grade: grade(overall), areas, totals, severities },
    summary,
    findings: ordered,
    caseVerdicts,
    previews,
    seo,
    geo,
    analytics,
    security,
    graph: { nodes: nodes.slice(0, 120), edges: edges.filter((edge) => edge.s < 120 && edge.t < 120) },
    fixkit: fixKit({ home, face, read, indexable, origin, host, input, extras, tags, dnsInfo, entity, socialLinks })
  };
}

function fixKit(ctx) {
  const face = ctx.face || {};
  const sig = face.signals || {};
  const res = face.resources || {};
  const hosts = (list) => [...new Set((list || []).filter(Boolean))].slice(0, 30).map((h) => "https://" + h);
  const script = ["'self'"].concat(hosts(res.scripts));
  const style = ["'self'"].concat(hosts(res.styles));
  const font = ["'self'"];
  const img = ["'self'", "data:"].concat(hosts(res.images));
  const frame = hosts(res.frames);
  const connect = ["'self'"];
  (ctx.tags || []).forEach((tag) => (ANALYTICS_CONNECT[tag.name] || []).forEach((h) => { if (connect.indexOf(h) === -1) connect.push(h); }));
  if ((res.styles || []).some((h) => /fonts\.googleapis\.com/.test(h))) font.push("https://fonts.gstatic.com");
  if ((res.styles || []).some((h) => /use\.typekit\.net/.test(h))) font.push("https://use.typekit.net");
  if ((ctx.tags || []).some((tag) => /^Google/.test(tag.name))) {
    ["https://*.googletagmanager.com"].forEach((h) => { if (script.indexOf(h) === -1) script.push(h); });
    ["https://*.google-analytics.com", "https://*.googletagmanager.com"].forEach((h) => { if (img.indexOf(h) === -1) img.push(h); });
  }
  if (sig.inlineScripts) script.push("'unsafe-inline'");
  if (sig.inlineStyles) style.push("'unsafe-inline'");
  const directives = [
    "default-src 'self'",
    "script-src " + script.join(" "),
    "style-src " + style.join(" "),
    "img-src " + img.join(" "),
    "font-src " + font.join(" "),
    "connect-src " + connect.join(" "),
    frame.length ? "frame-src " + frame.join(" ") : "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'" + (res.forms && res.forms.length ? " " + hosts(res.forms).join(" ") : ""),
    "frame-ancestors 'self'",
    "upgrade-insecure-requests"
  ];
  const csp = directives.join("; ");
  const hdr = face.headers || {};
  const raw = face.rawHeaders || {};
  const headers = [
    { name: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains", missing: !hdr.hsts },
    { name: "Content-Security-Policy-Report-Only", value: csp, missing: !hdr.csp },
    { name: "X-Content-Type-Options", value: "nosniff", missing: !hdr.nosniff },
    { name: "X-Frame-Options", value: "SAMEORIGIN", missing: !hdr.frame },
    { name: "Referrer-Policy", value: "strict-origin-when-cross-origin", missing: !hdr.referrer },
    { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()", missing: !raw.permissions }
  ];
  const social = face.social || {};
  const name = social.ogSiteName || String(face.title || ctx.host).split(/\s+[|–—·-]\s+/)[0].trim() || ctx.host;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      Object.assign({
        "@type": "Organization",
        "@id": ctx.origin + "/#organization",
        name,
        url: ctx.origin + "/"
      }, face.icon || social.ogImage ? { logo: social.ogImage && /^https:/.test(social.ogImage) ? social.ogImage : face.icon } : {},
      face.description ? { description: face.description } : {},
      (ctx.socialLinks || []).length ? { sameAs: ctx.socialLinks } : {}),
      {
        "@type": "WebSite",
        "@id": ctx.origin + "/#website",
        name,
        url: ctx.origin + "/",
        publisher: { "@id": ctx.origin + "/#organization" }
      }
    ]
  };
  const pagesForLlms = (ctx.read || []).filter((page) => ctx.indexable.some((row) => row.path === page.path)).slice(0, 40);
  const llmsTxt = ["# " + name, "", "> " + (face.description || "Describe in one or two sentences what this site offers and who it is for."), "", "## Pages", ""]
    .concat(pagesForLlms.map((page) => "- [" + (page.inspect.title || page.path).replace(/[[\]]/g, "") + "](" + page.url + ")" + (page.inspect.description ? ": " + page.inspect.description : "")))
    .concat(["", "## Contact", "", "- [Home](" + ctx.origin + "/)"]).join("\n") + "\n";
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const securityTxt = ["Contact: mailto:security@" + ((ctx.dnsInfo && ctx.dnsInfo.domain) || ctx.host), "Expires: " + expires, "Preferred-Languages: " + (face.lang ? face.lang.split("-")[0] : "en"), "Canonical: " + ctx.origin + "/.well-known/security.txt", ""].join("\n");
  const domain = (ctx.dnsInfo && ctx.dnsInfo.domain) || ctx.host;
  const dnsRecords = [];
  if (ctx.dnsInfo && ctx.dnsInfo.domain) {
    const mail = (ctx.dnsInfo.mx || []).length > 0;
    if (!ctx.dnsInfo.spf) dnsRecords.push({ name: domain, type: "TXT", value: mail ? "v=spf1 include:<your mail provider> ~all" : "v=spf1 -all" });
    if (!ctx.dnsInfo.dmarc) dnsRecords.push({ name: "_dmarc." + domain, type: "TXT", value: "v=DMARC1; p=none; rua=mailto:dmarc@" + domain });
    if (!(ctx.dnsInfo.caa || []).length) dnsRecords.push({ name: domain, type: "CAA", value: "0 issue \"letsencrypt.org\"" });
  }
  return {
    hosting: hostingHint(ctx.input && ctx.input.technologies, hdr),
    csp,
    headers,
    jsonLd: ctx.entity ? null : jsonLd,
    llmsTxt: (ctx.extras.llms && ctx.extras.llms.status === 200 && !ctx.extras.llms.html) ? "" : llmsTxt,
    securityTxt: (ctx.extras.securityTxt && ctx.extras.securityTxt.status === 200 && !ctx.extras.securityTxt.html) ? "" : securityTxt,
    dns: dnsRecords
  };
}

module.exports = { analyze, parseRobotsFull, robotsVerdict, AI_BOTS, AREAS };
