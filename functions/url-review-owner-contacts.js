/* The second look for an owner contact, after the review is saved: the usual contact and legal
   pages the site links to or usually has that the crawl did not reach, the public email of a GitHub account the site links to, and a web
   search for addresses on the domain. What the review already read (pages, schema.org, security.txt,
   llms.txt, RDAP, DMARC, SOA) is in report.contacts, from url-review-core.js ownerContacts.
   Nothing here fills in a form or signs in anywhere. */

const CONTACT_PATHS = ["/contact", "/contacto", "/contact-us", "/contactenos", "/contactanos", "/about", "/about-us", "/nosotros", "/quienes-somos", "/impressum", "/aviso-legal", "/legal"];
const LIMIT_MS = 15000;
// Contact-data brokers list made-up addresses on the domain to show its email format (jane.doe@, jdoe@).
const BROKER_HOSTS = /(^|\.)(rocketreach\.co|zoominfo\.com|leadiq\.com|signalhire\.com|contactout\.com|lusha\.com|apollo\.io|hunter\.io|snov\.io|adapt\.io|clearbit\.com|emailformat\.com|email-format\.com|rocketreach\.com)$/i;
const SAMPLE_LOCALS = /^(j(ane|ohn)?[._-]?(doe|smith)|first(name)?([._-]?last(name)?)?|f(name)?[._-]?l(ast|name)?|name|email|example|your[._-]?(name|email)?|someone|user(name)?)$/i;

function sampleAddress(email, pageUrl) {
  let host = "";
  try { host = new URL(pageUrl).hostname; } catch (error) { host = ""; }
  return BROKER_HOSTS.test(host) || /email[-_ ]?format/i.test(pageUrl) || SAMPLE_LOCALS.test(email.split("@")[0]);
}

// The site's own contact, legal and privacy links first, then the usual paths.
function pathsToTry(report) {
  const read = new Set(((report && report.pages) || []).map((page) => String(page.path || "").replace(/\/$/, "").toLowerCase()));
  const linked = ((report && report.contacts && report.contacts.paths) || []).map((path) => String(path).toLowerCase());
  return [...new Set(linked.concat(CONTACT_PATHS))].filter((path) => path && !read.has(path)).slice(0, 10);
}

// deps: { fetchPage(url) -> { status, html, body, url }, analyze(html, headers, url), github(name) -> user json,
//         search(query) -> [{ title, url, description }], emailsInText(text), registrable(host) }
async function discover(report, deps) {
  const found = [];
  const add = (email, source, url) => { if (email && !found.some((row) => row.email === email && row.source === source)) found.push({ email, source, url: url || "" }); };
  let origin = "";
  try { origin = new URL(report.finalUrl || ("https://" + report.host + "/")).origin; } catch (error) { return found; }
  const domain = deps.registrable(report.host);
  const pages = pathsToTry(report).map(async (path) => {
    const res = await deps.fetchPage(origin + path).catch(() => null);
    if (!res || res.status !== 200 || !res.html) return;
    const seen = deps.analyze(res.body, {}, res.url || origin + path);
    const url = res.url || origin + path;
    ((seen.schema && seen.schema.emails) || []).forEach((email) => add(email, "schema", url));
    (seen.mailtos || []).forEach((email) => add(email, "contact-page", url));
    (seen.textEmails || []).forEach((email) => add(email, "page-text", url));
  });
  const github = (((report.contacts && report.contacts.profiles) || [])).slice(0, 3).map(async (name) => {
    const user = await deps.github(name).catch(() => null);
    if (user && user.email) add(String(user.email).trim().toLowerCase(), "github", "https://github.com/" + name);
  });
  const search = (async () => {
    const results = await deps.search("\"@" + domain + "\"").catch(() => []);
    (Array.isArray(results) ? results : []).forEach((result) => {
      deps.emailsInText(result.title + " " + result.description, 10)
        .filter((email) => deps.registrable(email.split("@")[1]) === domain && !sampleAddress(email, result.url))
        .forEach((email) => add(email, "search", result.url));
    });
  })();
  let timer = null;
  await Promise.race([
    Promise.all(pages.concat(github, [search])),
    new Promise((resolve) => { timer = setTimeout(resolve, LIMIT_MS); })
  ]);
  clearTimeout(timer);
  return found.slice();
}

module.exports = { CONTACT_PATHS, pathsToTry, sampleAddress, discover };
