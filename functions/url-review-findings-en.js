"use strict";

// English templates for finding titles, evidence and advice. The page translates the same ids in
// js/qa-review-findings-copy.js and falls back to the English text the server wrote.
// A key with _one and _other forms is picked by vars.n. A var can be a plain value, another message
// ({ id, vars }), or a list ({ items, more } joined with ", ", { items, sep }, or { items, join: "and" | "or" }).
const EN = {
  "list.more": " and {n} more",
  "list.and": " and ",
  "list.or": " or ",
  pathNote: "{path} ({note})",
  pathArrow: "{from} → {to}",
  pathError: "{path}: {error}",
  pathPercent: "{path} ({share}%)",
  urlFrom: "{url}{from}",
  linkedFrom: ", linked from {list}",
  listDot: "{list}.",
  nothing: "nothing",
  noAnswer: "no answer",
  pagesChecked_one: "{n} page checked.",
  pagesChecked_other: "{n} pages checked.",
  pagesN_one: "{n} page",
  pagesN_other: "{n} pages",
  wordsN_one: "{n} word",
  wordsN_other: "{n} words",
  "botCheck.a": "a {vendor} bot check",
  "botCheck.an": "an {vendor} bot check",
  "blocked.429": "429, rate limited",
  "blocked.503": "503 with Retry-After",
  "blocked.refused": "{status}, refused",
  "fix.serverRender": "Render the main content on the server or pre-render it at build time.",

  "reason.indexable": "Indexable",
  "reason.status": "Status {status}",
  "reason.botCheck": "{vendor} bot check",
  "reason.googlebot": "Blocked for Googlebot in robots.txt",
  "reason.canonical": "Canonical points to {url}",
  "reason.notRead": "Not read",

  "seo-unanswered-links.title_one": "{n} internal link did not answer in time",
  "seo-unanswered-links.title_other": "{n} internal links did not answer in time",
  "seo-unanswered-links.evidence": "{list}. A slow answer in one analysis is not proof the page is broken.",
  "seo-unanswered-links.fix": "Open each address again. If it stays slow, look at the server or cache for that path.",
  "seo-blocked-links.title_one": "{n} internal link was blocked for this reader",
  "seo-blocked-links.title_other": "{n} internal links were blocked for this reader",
  "seo-blocked-links.evidence": "{list}. A block aimed at automated readers is not proof the page is broken, and those pages were not scored.",
  "seo-blocked-links.fix": "Open each address in a browser. If people get through, only automated readers are stopped; allow verified crawlers if search and AI answers should reach those pages.",
  "seo-broken-links.title_one": "{n} internal link leads to an error",
  "seo-broken-links.title_other": "{n} internal links lead to an error",
  "seo-broken-links.row": "{path} answered {status}{from}",
  "seo-broken-links.fix": "Fix or remove each link, or redirect the old address with a 301 to the closest live page.",
  "seo-broken-links.pass.title": "Every internal link that was opened answered",
  "seo-broken-links.pass.evidence_one": "{n} linked page answered without an error.",
  "seo-broken-links.pass.evidence_other": "{n} linked pages answered without an error.",

  "seo-external.checked_one": " {n} external address was checked{of}.",
  "seo-external.checked_other": " {n} external addresses were checked{of}.",
  "seo-external.of": " of {found} found",
  "seo-external.gave": "{url} gave {error}{from}",
  "seo-external.answered": "{url} answered {status}{from}",
  "seo-external-links.title_one": "{n} external link leads to an error",
  "seo-external-links.title_other": "{n} external links lead to an error",
  "seo-external-links.evidence": "{list}.{checked}",
  "seo-external-links.fix": "Update each link to the page's new address, link to an archived copy on web.archive.org, or remove it.",
  "seo-external-links.pass.title": "Every external link that was checked answered",
  "seo-external-links.pass.evidence_one": "{n} external address answered without an error.{checked}",
  "seo-external-links.pass.evidence_other": "{n} external addresses answered without an error.{checked}",
  "seo-external-moved.title_one": "{n} external link redirects to another site or a home page",
  "seo-external-moved.title_other": "{n} external links redirect to another site or a home page",
  "seo-external-moved.row": "{url} lands on {final}{from}",
  "seo-external-moved.http": "an http:// address",
  "seo-external-moved.evidence": "{list}. The page it pointed to has probably moved or gone.",
  "seo-external-moved.fix": "Point each link at the address it now lands on, or replace it if the page is gone.",
  "seo-external-blocked.title_one": "{n} external link was blocked for this reader",
  "seo-external-blocked.title_other": "{n} external links were blocked for this reader",
  "seo-external-blocked.evidence": "{list}. A block aimed at automated readers is not proof the link is broken, and those links were not scored.",
  "seo-external-blocked.fix": "Open each link in a browser to confirm it still works.",
  "seo-external-http.title_one": "{n} external link uses plain http",
  "seo-external-http.title_other": "{n} external links use plain http",
  "seo-external-http.evidence": "{list}. Visitors leave the encrypted connection, and browsers may warn. These links were not requested.",
  "seo-external-http.fix": "Change each link to https when the other site supports it.",

  "seo-internal-redirects.title_one": "{n} internal link goes through a redirect",
  "seo-internal-redirects.title_other": "{n} internal links go through a redirect",
  "seo-internal-redirects.evidence": "{list}. Each hop costs crawl budget and a little speed.",
  "seo-internal-redirects.fix": "Point the links straight at the final address.",
  "seo-redirect-chain.title": "The start address takes {hops} redirects to answer",
  "seo-redirect-chain.evidence": "The address you entered redirected {hops} times before {path} answered.",
  "seo-redirect-chain.fix": "Redirect the old address in one hop to the final https URL.",

  "seo-noindex.home.title": "The start page tells search engines not to index it",
  "seo-noindex.title_one": "{n} page asks search engines not to index it",
  "seo-noindex.title_other": "{n} pages ask search engines not to index them",
  "seo-noindex.fix": "Remove noindex from pages that should be found, and keep it only on private or duplicate pages.",
  "seo-noindex.pass.title_one": "{n} page is kept out of search on purpose",
  "seo-noindex.pass.title_other": "{n} pages are kept out of search on purpose",
  "seo-noindex.pass.evidence": "{list}. Each says noindex, names no canonical, and is left out of the sitemap, so the three signals agree.",
  "seo-canonical-away.title_one": "{n} page names another URL as canonical",
  "seo-canonical-away.title_other": "{n} pages name another URL as canonical",
  "seo-canonical-away.evidence": "{list}. Search engines will usually index the other URL instead.",
  "seo-canonical-away.fix": "Make each page's canonical point at itself unless it is a real duplicate.",
  "seo-canonical-missing.title_one": "{n} page has no canonical link",
  "seo-canonical-missing.title_other": "{n} pages have no canonical link",
  "seo-canonical-missing.evidence": "{list}. Without it, tracking parameters and trailing slashes can split ranking signals.",
  "seo-canonical-missing.fix": "Add <link rel=\"canonical\" href=\"…\"> with the page's own https URL.",

  "seo-title-missing.title_one": "{n} page has no title",
  "seo-title-missing.title_other": "{n} pages have no title",
  "seo-title-missing.fix": "Give every page a unique title of about 30 to 60 characters.",
  "seo-title-missing.pass.title": "Every page has a title",
  "seo-duplicate.row": "\"{value}\" on {pages}",
  "seo-duplicate.rowCut": "\"{value}…\" on {pages}",
  "seo-duplicate-titles.title_one": "{n} title is shared by more than one page",
  "seo-duplicate-titles.title_other": "{n} titles are shared by more than one page",
  "seo-duplicate-titles.fix": "Write a title that names what is different about each page.",
  "seo-description-missing.title_one": "{n} page has no meta description",
  "seo-description-missing.title_other": "{n} pages have no meta description",
  "seo-description-missing.evidence": "{list}. Google and AI answers then write their own snippet from whatever text they find.",
  "seo-description-missing.fix": "Write a 50 to 160 character description for each page that says what a reader gets.",
  "seo-description-missing.pass.title": "Every page has a meta description",
  "seo-duplicate-descriptions.title_one": "{n} description is shared by more than one page",
  "seo-duplicate-descriptions.title_other": "{n} descriptions are shared by more than one page",
  "seo-duplicate-descriptions.fix": "Describe each page on its own.",
  "seo-title-length.title_one": "{n} title runs past about 60 characters",
  "seo-title-length.title_other": "{n} titles run past about 60 characters",
  "seo-title-length.evidence": "{list}. Google cuts them with an ellipsis.",
  "seo-title-length.fix": "Lead with the words that matter and keep titles near 60 characters.",
  "seo-thin.title_one": "{n} indexable page carries fewer than 150 words in the HTML",
  "seo-thin.title_other": "{n} indexable pages carry fewer than 150 words in the HTML",
  "seo-thin.fix": "Add useful copy, merge thin pages, or mark them noindex.",

  "seo-sitemap-dirty.title_one": "The sitemap lists {n} page search engines should not index",
  "seo-sitemap-dirty.title_other": "The sitemap lists {n} pages search engines should not index",
  "seo-sitemap-dirty.fix": "List only live, canonical, indexable URLs in the sitemap.",
  "seo-sitemap-missing-pages.title_one": "{n} indexable page is missing from the sitemap",
  "seo-sitemap-missing-pages.title_other": "{n} indexable pages are missing from the sitemap",
  "seo-sitemap-missing-pages.fix": "Add them to the sitemap or regenerate it on each deploy.",
  "seo-sitemap-offhost.title_one": "{n} sitemap URL points at another host or scheme",
  "seo-sitemap-offhost.title_other": "{n} sitemap URLs point at another host or scheme",
  "seo-sitemap-offhost.unreadable": "an unreadable URL",
  "seo-sitemap-offhost.evidence": "In {source}: {list}. The sitemap should list only URLs on https://{host}.",
  "seo-sitemap-offhost.fix": "Regenerate the sitemap with the production https host.",
  "seo-sitemap.partial.title": "A sitemap answers with valid URLs",
  "seo-sitemap.partial.evidence_one": "The first {n} URL from {source} were analyzed; the sitemap is larger than one review analyzes.",
  "seo-sitemap.partial.evidence_other": "The first {n} URLs from {source} were analyzed; the sitemap is larger than one review analyzes.",
  "seo-sitemap.pass.title": "The sitemap matches the pages that were analyzed",
  "seo-sitemap.pass.evidence_one": "{n} URL in {source}.",
  "seo-sitemap.pass.evidence_other": "{n} URLs in {source}.",
  "seo-sitemap.title": "No sitemap was found",
  "seo-sitemap.named": "robots.txt names {url} but it did not return URLs.",
  "seo-sitemap.none": "robots.txt names no sitemap, and /sitemap.xml, /sitemap_index.xml and /sitemap-index.xml returned no URLs.",
  "seo-sitemap.fix": "Publish /sitemap.xml and add a Sitemap: line to robots.txt.",

  "seo-hreflang.noSelf": "{path} has no self reference",
  "seo-hreflang.badCode": "{path} uses an invalid code \"{code}\"",
  "seo-hreflang.noBack": "{target} does not link back to {path}",
  "seo-hreflang.title_one": "{n} language alternate problem",
  "seo-hreflang.title_other": "{n} language alternate problems",
  "seo-hreflang.fix": "Each language version must list every version, itself included, and each must link back.",
  "seo-hreflang.pass.title": "Language alternates point at each other",
  "seo-hreflang.pass.evidence": "Every alternate that was analyzed links back.",

  "seo-schema.gap": "{path} {type} lacks {props}",
  "seo-schema-parse.title_one": "{n} JSON-LD block does not parse",
  "seo-schema-parse.title_other": "{n} JSON-LD blocks do not parse",
  "seo-schema-parse.evidence": "On {list}. A block that is not valid JSON is ignored by Google and by AI crawlers.",
  "seo-schema-parse.fix": "Validate each block with the Schema Markup Validator and fix the JSON.",
  "seo-schema-props.title_one": "{n} structured data item misses a property Google expects",
  "seo-schema-props.title_other": "{n} structured data items miss a property Google expects",
  "seo-schema-props.fix": "Fill the missing properties so the item qualifies for rich results.",
  "seo-schema.title": "No structured data was found",
  "seo-schema.evidence": "No JSON-LD block was found on the pages that were analyzed.",
  "seo-schema.fix": "Add Organization or Person, WebSite, and BreadcrumbList JSON-LD. The fix kit has a draft.",
  "seo-schema.pass.title": "Structured data parses and carries the expected properties",
  "seo-schema.pass.evidence": "Types: {list}.",

  "seo-social.httpsImage": "an https og:image",
  "seo-social.title": "Share cards are missing {list}",
  "seo-social.evidence": "LinkedIn, WhatsApp, Slack, and X build the preview from these tags. The preview in this report shows what they would show today.",
  "seo-social.fix": "Add the missing Open Graph and Twitter tags to every page template.",
  "seo-social.pass.title": "Share cards have a title, description, image, and URL",
  "seo-social.pass.evidence": "og:title, og:description, og:image, og:url, and twitter:card are present.",
  "seo-favicon.title": "No favicon is declared",
  "seo-favicon.evidence": "Google shows a favicon next to each mobile result.",
  "seo-favicon.fix": "Add <link rel=\"icon\" href=\"/favicon.svg\"> with a square icon.",
  "seo-soft-404.title": "A missing page answers 200 instead of 404",
  "seo-soft-404.titled": " with the title \"{title}\"",
  "seo-soft-404.evidence": "A made-up path answered 200{titled}. Search engines call this a soft 404 and may index empty pages.",
  "seo-soft-404.fix": "Return status 404 (or 410) for unknown paths, with a helpful page.",
  "seo-soft-404.pass.title": "Unknown paths answer {status}",
  "seo-soft-404.pass.evidence": "A made-up path answered {status}.",
  "seo-viewport.title": "The start page has no viewport tag",
  "seo-viewport.evidence": "Without it, phones render the desktop layout zoomed out. Google indexes the mobile version first.",
  "seo-viewport.fix": "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
  "seo-viewport.pass.title": "The start page sets a mobile viewport",
  "seo-viewport.pass.evidence": "A viewport meta tag is present.",

  "seo-links-js.title": "Most links appear only after JavaScript runs",
  "seo-links-js.links_one": "{n} same-host link",
  "seo-links-js.links_other": "{n} same-host links",
  "seo-links-js.evidence": "The HTML lists {links}; the rendered page lists {rendered}. Crawlers that skip JavaScript cannot find the other pages{tail}",
  "seo-links-js.followed": "; this review followed the rendered links instead.",
  "seo-links-js.notFollowed": ", and this review's crawl could not follow them either.",
  "seo-links-js.fix": "Render navigation as plain <a href> links in the server HTML, and keep the sitemap complete.",

  "geo-rendered.title": "AI crawlers see only part of the text people see",
  "geo-rendered.evidence": "{list}. The share is words in the HTML compared with words on the rendered page. Most AI crawlers do not run JavaScript.",
  "geo-rendered.pass.title": "The HTML carries the text people see",
  "geo-rendered.pass.evidence": "The start page HTML holds {share}% of the words on the rendered page.",
  "geo-h1-rendered.title": "The main heading appears only after JavaScript",
  "geo-h1-rendered.evidence": "\"{h1}\" is on the rendered page but not in the HTML.",
  "geo-h1-rendered.fix": "Put the h1 in the server HTML.",
  "geo-crawlers.title_one": "{n} AI answer or search crawler is blocked",
  "geo-crawlers.title_other": "{n} AI answer or search crawlers are blocked",
  "geo-crawlers.row": "{token} ({product}){rule}",
  "geo-crawlers.by": " by {rule}",
  "geo-crawlers.evidence": "{list}. These bots fetch pages to cite them in answers. Blocked means the site is not quoted there.",
  "geo-crawlers.fix": "Allow the answer bots in robots.txt. Training bots can stay blocked if that is the policy.",
  "geo-crawlers.pass.title": "AI answer and search crawlers may read the start page",
  "geo-crawlers.pass.rules": "robots.txt does not block ChatGPT search, Claude, Perplexity, Google, or Bing at the root.",
  "geo-crawlers.pass.noRules": "No robots.txt rules were found, so every crawler is allowed by default.",
  "geo-crawlers-partial.title": "Some pages are closed to AI answer crawlers",
  "geo-crawlers-partial.row": "{token} cannot read {pages}",
  "geo-crawlers-partial.fix": "Check that the closed paths are meant to stay out of AI answers.",
  "geo-training.title": "Model-training crawlers are blocked by choice",
  "geo-training.evidence": "{list} are disallowed. That does not stop answer bots from citing the site.",
  "geo-js-only.title": "AI crawlers see an almost empty start page",
  "geo-js-only.shell": " and an empty app root, so the content is drawn by JavaScript",
  "geo-js-only.evidence": "The HTML carries {chars} characters of readable text{shell}. Most AI crawlers do not run JavaScript.",
  "geo-js-only.risk.title": "AI crawlers see little text on the start page",
  "geo-js-only.risk.evidence": "The HTML carries {chars} characters of readable text. AI answers quote what they can read without scripts.",
  "geo-js-only.risk.fix": "Put the key facts (what, who, where, price, contact) in plain HTML text.",
  "geo-js-only.pass.title": "The start page reads well without JavaScript",
  "geo-js-only.pass.evidence": "{chars} characters of text are in the HTML.",
  "geo-llms.gapSummary": "a > summary line",
  "geo-llms.gapLinks": "links to key pages",
  "geo-llms.gapMarkdown": "Markdown [title](url) links",
  "geo-llms.lacks.title": "llms.txt exists but lacks {gaps}",
  "geo-llms.pass.title": "llms.txt is published",
  "geo-llms.sections_one": "{n} section",
  "geo-llms.sections_other": "{n} sections",
  "geo-llms.links_one": "{n} link",
  "geo-llms.links_other": "{n} links",
  "geo-llms.full": ", and /llms-full.txt is present.",
  "geo-llms.evidence": "/llms.txt has {sections} and {links}{full}",
  "geo-llms.lacks.fix": "Follow the llmstxt.org layout: # name, > summary, then ## sections of [title](url): note.",
  "geo-llms.html.title": "/llms.txt answers with an HTML page",
  "geo-llms.html.evidence": "The address returns a web page, which usually means a catch-all route.",
  "geo-llms.html.fix": "Serve a plain-text /llms.txt. The fix kit has a draft built from this review.",
  "geo-llms.title": "No llms.txt was found",
  "geo-llms.none.evidence": "/llms.txt returned {status}. It is a proposed convention that some AI tools read to find the pages that matter.",
  "geo-llms.fix": "Publish /llms.txt. The fix kit has a draft built from this review.",
  "geo-entity-present.title": "A {type} entity names who is behind the site",
  "geo-entity-present.evidence": "It is published on {path}.",
  "geo-entity.title": "The {type} entity is incomplete",
  "geo-entity.lacks": "It lacks {props}. ",
  "geo-entity.unlisted_one": "{n} profile linked on the page is not in sameAs ({hosts}).",
  "geo-entity.unlisted_other": "{n} profiles linked on the page are not in sameAs ({hosts}).",
  "geo-entity.evidence": "{lacks}{unlisted}",
  "geo-entity.fix": "Complete the entity so AI answers connect the brand to its profiles. The fix kit has a draft.",
  "geo-entity.pass.title": "The {type} entity is complete",
  "geo-entity.pass.evidence": "name, url, image, and sameAs are present.",
  "geo-entity.none.title": "No Organization or Person entity describes who is behind the site",
  "geo-entity.profiles_one": " The page links {n} profile that could go in sameAs.",
  "geo-entity.profiles_other": " The page links {n} profiles that could go in sameAs.",
  "geo-entity.none.evidence": "AI answers lean on this to name the brand, its logo, and its profiles.{profiles}",
  "geo-entity.none.fix": "Add Organization (or Person) JSON-LD with name, url, logo, and sameAs. The fix kit has a draft.",
  "geo-answers.pass.title": "Some content is shaped as questions and answers",
  "geo-answers.faq": "FAQ or HowTo structured data is present. ",
  "geo-answers.heads_one": "{n} heading is phrased as a question.",
  "geo-answers.heads_other": "{n} headings are phrased as a question.",
  "geo-answers.pass.evidence": "{faq}{heads}",
  "geo-answers.title": "No content is shaped as questions and answers",
  "geo-answers.evidence": "No heading on the pages analyzed is a question and no FAQ data was found. AI answers favour short, direct answers under a question.",
  "geo-answers.fix": "Add an FAQ block with the questions customers ask, answered in two or three sentences each.",
  "geo-dated.title": "Pages show when they were published or changed",
  "geo-dated.evidence": "A date was found on {path}.",
  "geo-trust.who": "who wrote them",
  "geo-trust.when": "when they were updated",
  "geo-trust.title": "Pages do not say {what}",
  "geo-trust.evidence": "Author and date signals help search engines and AI answers judge whether a page is current and credible.",
  "geo-trust.fix": "Show an author and a last-updated date on content pages, and add them to the JSON-LD.",
  "geo-trust.pass.title": "Pages carry author and date signals",
  "geo-trust.pass.evidence": "An author and a published or modified date were found.",
  "geo-noai.title_one": "{n} page opts out of AI use with noai",
  "geo-noai.title_other": "{n} pages opt out of AI use with noai",
  "geo-noai.evidence": "{list}. Few crawlers honour this tag; robots.txt is the rule they follow."
};

// Firestore refuses undefined, so a missing value is sent as an empty string.
function say(id, vars) {
  const clean = {};
  Object.keys(vars || {}).forEach((name) => { clean[name] = vars[name] == null ? "" : vars[name]; });
  return { id, vars: clean };
}

// sample() as a message: the first max items, then "and N more".
function some(list, max) {
  const items = (list || []).slice(0, max || 3);
  return { items, more: (list || []).length - items.length };
}

function pick(book, id, vars) {
  if (vars && typeof vars.n === "number") {
    const form = book[id + (vars.n === 1 ? "_one" : "_other")];
    if (form != null) return form;
  }
  return book[id];
}

// Returns null when the book lacks any id the message uses, so the caller can fall back whole.
function render(book, value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value.items)) {
    const parts = value.items.map((item) => render(book, item));
    if (parts.some((part) => part === null)) return null;
    if (value.join) {
      const glue = book["list." + value.join];
      if (glue == null) return null;
      return parts.length > 1 ? parts.slice(0, -1).join(", ") + glue + parts[parts.length - 1] : parts.join("");
    }
    const joined = parts.join(value.sep == null ? ", " : value.sep);
    if (!(value.more > 0)) return joined;
    return book["list.more"] == null ? null : joined + book["list.more"].replace("{n}", value.more);
  }
  const template = pick(book, value.id, value.vars);
  if (template == null) return null;
  let missing = false;
  const out = String(template).replace(/\{(\w+)\}/g, (match, name) => {
    if (!value.vars || !(name in value.vars)) return match;
    const filled = render(book, value.vars[name]);
    if (filled === null) missing = true;
    return filled;
  });
  return missing ? null : out;
}

function english(message) {
  const text = render(EN, message);
  if (text === null) throw new Error("No English template for " + JSON.stringify(message).slice(0, 120));
  return text;
}

module.exports = { EN, say, some, render, english };
