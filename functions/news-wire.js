const https = require("https");

const CACHE_MS = 3 * 60 * 1000;
const cache = new Map();

const NAMES = {
  CO: "Colombia", US: "United States", GB: "United Kingdom", ES: "Spain", MX: "Mexico",
  AR: "Argentina", CL: "Chile", BR: "Brazil", FR: "France", DE: "Germany", PE: "Peru",
  EC: "Ecuador", CA: "Canada", AU: "Australia"
};

const PAPERS = {
  CO: [
    { name: "El Colombiano", lang: "es", url: "https://www.elcolombiano.com/rss/tecnologia.xml" },
    { name: "El Colombiano", lang: "es", url: "https://www.elcolombiano.com/rss/cultura.xml" },
    { name: "El Tiempo", lang: "es", url: "https://www.eltiempo.com/rss/tecnosfera.xml" }
  ],
  US: [
    { name: "NPR", lang: "en", url: "https://feeds.npr.org/1001/rss.xml" },
    { name: "NPR", lang: "en", url: "https://feeds.npr.org/1019/rss.xml" }
  ],
  GB: [
    { name: "BBC", lang: "en", url: "https://feeds.bbci.co.uk/news/rss.xml" },
    { name: "BBC", lang: "en", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    { name: "The Guardian", lang: "en", url: "https://www.theguardian.com/uk/rss" }
  ],
  ES: [
    { name: "El País", lang: "es", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada" },
    { name: "El País", lang: "es", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada" }
  ],
  MX: [
    { name: "La Jornada", lang: "es", url: "https://www.jornada.com.mx/rss/edicion.xml" }
  ],
  AR: [
    { name: "Clarín", lang: "es", url: "https://www.clarin.com/rss/lo-ultimo/" }
  ],
  CL: [
    { name: "La Tercera", lang: "es", url: "https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml" }
  ],
  FR: [
    { name: "France 24", lang: "fr", url: "https://www.france24.com/fr/rss" },
    { name: "France 24", lang: "es", url: "https://www.france24.com/es/rss" }
  ],
  CA: [
    { name: "CBC", lang: "en", url: "https://rss.cbc.ca/lineup/topstories.xml" }
  ],
  AU: [
    { name: "ABC", lang: "en", url: "https://www.abc.net.au/news/feed/51120/rss.xml" }
  ]
};

function cleanToken(value, max) {
  return String(value || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, max);
}

function pageLang(value) {
  const code = String(value || "en").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 12);
  return code || "en";
}

function hlFor(lang, country) {
  if (lang.startsWith("es")) return country === "ES" ? "es" : "es-419";
  if (lang.startsWith("pt")) return country === "PT" ? "pt-PT" : "pt-BR";
  if (lang.startsWith("zh")) return lang.indexOf("tw") !== -1 || country === "TW" ? "zh-TW" : "zh-CN";
  return lang.slice(0, 2) || "en";
}

function decode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&#(\d+);/g, (entity, dec) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decode(match[1]) : "";
}

function linkOf(block) {
  const text = tag(block, "link");
  if (/^https:\/\//i.test(text)) return text;
  const href = block.match(/<link\b[^>]*href="(https:\/\/[^"]+)"/i);
  return href ? href[1] : "";
}

function itemsFromRss(xml, sourceName) {
  const items = [];
  String(xml || "").split(/<item\b/i).slice(1).forEach((block) => {
    if (items.length >= 8) return;
    let title = tag(block, "title");
    const href = linkOf(block).slice(0, 500);
    if (!title || title.length < 12 || !/^https:\/\//i.test(href)) return;
    let source = sourceName;
    const cut = title.lastIndexOf(" - ");
    if (cut > 20 && sourceName === "Google News") {
      source = title.slice(cut + 3).slice(0, 40);
      title = title.slice(0, cut);
    }
    const pipe = title.lastIndexOf(" | ");
    if (pipe > 24 && source && title.slice(pipe + 3).toLowerCase().indexOf(source.toLowerCase()) === 0) {
      title = title.slice(0, pipe);
    }
    const when = tag(block, "pubDate");
    let meta = source;
    const parsed = when ? new Date(when) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      meta = source + " · " + parsed.toLocaleDateString("en", { day: "numeric", month: "short" });
    }
    items.push({ title: title.slice(0, 180), href, source, meta });
  });
  return items;
}

function getText(url, redirects) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/rss+xml, application/xml, text/xml, */*"
      }
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects < 3) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, url); } catch (error) { reject(error); return; }
        if (next.protocol !== "https:") { reject(new Error("redirect")); return; }
        resolve(getText(next.toString(), redirects + 1));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(String(status)));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > 500000) {
          req.destroy();
          reject(new Error("large"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function googleFeeds(country, lang, place) {
  const hl = hlFor(lang, country);
  const ceid = country + ":" + hl;
  const query = encodeURIComponent(place || NAMES[country] || country);
  const base = "https://news.google.com/rss/search?q=" + query + "&hl=" + encodeURIComponent(hl) + "&gl=" + country + "&ceid=" + encodeURIComponent(ceid);
  const tech = "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=" + encodeURIComponent(hl) + "&gl=" + country + "&ceid=" + encodeURIComponent(ceid);
  return [
    { name: "Google News", lang: lang, url: base },
    { name: "Google News", lang: lang, url: tech }
  ];
}

function feedsFor(country, lang, place) {
  const page = lang.slice(0, 2);
  const matched = (PAPERS[country] || []).filter((feed) => feed.lang.slice(0, 2) === page);
  return matched.concat(googleFeeds(country, lang, place));
}

function interleave(groups) {
  const rows = groups.filter((group) => group.length);
  const items = [];
  const seen = new Set();
  let index = 0;
  while (items.length < 24 && rows.some((group) => group.length > index)) {
    rows.forEach((group) => {
      const item = group[index];
      if (!item || items.length >= 24) return;
      const key = item.title.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    });
    index += 1;
  }
  return items;
}

async function loadNews(options) {
  const country = cleanToken(options && options.country, 2).toUpperCase();
  const safeCountry = /^[A-Z]{2}$/.test(country) ? country : "US";
  const lang = pageLang(options && options.lang);
  const city = cleanToken(options && options.city, 40);
  const place = city || NAMES[safeCountry] || safeCountry;
  const key = safeCountry + "|" + lang + "|" + place.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  const feeds = feedsFor(safeCountry, lang, place);
  const groups = await Promise.all(feeds.map(async (feed) => {
    try {
      return itemsFromRss(await getText(feed.url, 0), feed.name);
    } catch (error) {
      return [];
    }
  }));
  const body = {
    country: safeCountry,
    countryName: NAMES[safeCountry] || safeCountry,
    lang,
    items: interleave(groups)
  };
  cache.set(key, { at: Date.now(), body });
  return body;
}

module.exports = { loadNews };
