/* Where scripts/field-sweep.js looks for standout items from our field. One failing source never fails the sweep.

   type    feed (RSS or Atom), hn (Hacker News through Algolia), devto (DEV top posts of a tag), github (new repos of a topic, by stars)
   topic   what the source covers; an item that names no topic keyword keeps this one
   weight  how much its items count in the ranking (1 = an ordinary source)
   strict  general sources: an item only counts when its title names one of TOPICS' keywords
   prefix  put before titles that do not name the project (release feeds title items "v1.56.0") */
const SOURCES = [
  { id: "google-search-central", name: "Google Search Central", type: "feed", url: "https://developers.google.com/search/blog/feed.xml", topic: "SEO", weight: 1.4 },
  { id: "search-engine-journal", name: "Search Engine Journal", type: "feed", url: "https://www.searchenginejournal.com/category/seo/feed/", topic: "SEO", weight: 0.9 },
  { id: "moz", name: "Moz", type: "feed", url: "https://moz.com/posts/rss/blog", topic: "SEO", weight: 1 },
  { id: "ahrefs", name: "Ahrefs", type: "feed", url: "https://ahrefs.com/blog/feed/", topic: "SEO", weight: 1, strict: true },
  { id: "ipullrank", name: "iPullRank", type: "feed", url: "https://ipullrank.com/feed", topic: "GEO", weight: 1 },
  { id: "w3c", name: "W3C", type: "feed", url: "https://www.w3.org/news/feed/", topic: "Standards", weight: 1.2 },
  { id: "whatwg", name: "WHATWG", type: "feed", url: "https://blog.whatwg.org/feed", topic: "Standards", weight: 1.2 },
  { id: "w3c-wai", name: "W3C WAI", type: "feed", url: "https://www.w3.org/WAI/feed.xml", topic: "Accessibility", weight: 1.3 },
  { id: "webaim", name: "WebAIM", type: "feed", url: "https://webaim.org/blog/feed", topic: "Accessibility", weight: 1.1 },
  { id: "deque", name: "Deque", type: "feed", url: "https://www.deque.com/feed/", topic: "Accessibility", weight: 1 },
  { id: "tpgi", name: "TPGi", type: "feed", url: "https://www.tpgi.com/feed/", topic: "Accessibility", weight: 1 },
  { id: "a11y-project", name: "The A11Y Project", type: "feed", url: "https://www.a11yproject.com/feed/feed.xml", topic: "Accessibility", weight: 1 },
  { id: "web-dev", name: "web.dev", type: "feed", url: "https://web.dev/static/blog/feed.xml", topic: "Performance", weight: 1.3 },
  { id: "chrome-developers", name: "Chrome for Developers", type: "feed", url: "https://developer.chrome.com/static/blog/feed.xml", topic: "Performance", weight: 1.1, strict: true },
  { id: "debugbear", name: "DebugBear", type: "feed", url: "https://www.debugbear.com/blog/rss.xml", topic: "Performance", weight: 1 },
  { id: "perfplanet", name: "Web Performance Calendar", type: "feed", url: "https://calendar.perfplanet.com/feed/", topic: "Performance", weight: 1 },
  { id: "simo-ahava", name: "Simo Ahava", type: "feed", url: "https://www.simoahava.com/index.xml", topic: "Analytics", weight: 1.1 },
  { id: "playwright-releases", name: "Playwright releases", type: "feed", url: "https://github.com/microsoft/playwright/releases.atom", topic: "Testing", weight: 1.1, prefix: "Playwright" },
  { id: "cypress", name: "Cypress", type: "feed", url: "https://www.cypress.io/blog/rss.xml", topic: "Testing", weight: 1 },
  { id: "martin-fowler", name: "Martin Fowler", type: "feed", url: "https://martinfowler.com/feed.atom", topic: "Testing", weight: 1, strict: true },
  { id: "hn", name: "Hacker News", type: "hn", queries: ["testing", "playwright", "accessibility", "SEO", "web performance", "Core Web Vitals", "Google Search", "analytics"], topic: "Testing", weight: 1, strict: true },
  { id: "devto", name: "DEV", type: "devto", tags: ["testing", "playwright", "a11y", "seo", "webperf"], topic: "Testing", weight: 0.8, strict: true },
  { id: "github", name: "GitHub", type: "github", topics: ["testing", "playwright", "accessibility", "seo", "web-performance"], topic: "Testing", weight: 0.9, strict: true }
];

// Keywords per topic, matched as whole words in any case, plural too. A title hit counts double a summary hit.
const TOPICS = {
  Testing: ["test automation", "automated testing", "software testing", "unit testing", "integration testing", "e2e testing", "api testing", "load testing", "visual testing", "accessibility testing", "testing library", "tester", "qa", "quality assurance", "playwright", "cypress", "selenium", "webdriver", "e2e", "end-to-end test", "flaky test", "test runner", "unit test", "test suite"],
  SEO: ["seo", "search console", "googlebot", "crawl", "indexing", "structured data", "schema.org", "core update", "search ranking", "sitemap", "canonical"],
  GEO: ["geo", "generative engine", "ai overviews", "ai mode", "llms.txt", "ai search", "answer engine", "chatgpt search", "perplexity"],
  Accessibility: ["accessibility", "a11y", "wcag", "aria", "screen reader", "accessible", "inclusive design", "color contrast", "keyboard navigation"],
  Performance: ["web performance", "core web vitals", "inp", "lcp", "cls", "page speed", "pagespeed", "lighthouse", "load time", "performance budget", "speculation rules"],
  Analytics: ["analytics", "ga4", "google tag manager", "tag manager", "server-side tagging", "consent mode", "measurement", "attribution"],
  Standards: ["w3c", "whatwg", "html spec", "specification", "candidate recommendation", "working draft", "interop", "baseline"]
};

// Never proposed, whatever the source: GitHub topic tags and DEV tags are open to anyone.
const BLOCK = /\b(view[- ]?bots?|view inflation|casinos?|betting|cracked|keygen|buy followers|backlink generators?|spam bots?)\b/i;

module.exports = { SOURCES, TOPICS, BLOCK };
