/* One social hub post as HTML. scripts/build-social-hub.js prerenders the first cards of each page with it,
   and js/social-hub.js renders the rest, so both write the same markup. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SocialHubCard = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const SITE = "https://carlosandmunoz.com/";

  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
  }

  function suffix(lang) {
    return lang && lang !== "en" ? "-" + lang : "";
  }

  function pageFor(lang) {
    return "qa-review-social" + suffix(lang) + ".html";
  }

  function permalink(post, lang, absolute) {
    return (absolute ? SITE : "") + pageFor(lang) + "?p=" + encodeURIComponent(post.id);
  }

  function anchor(post) {
    return "post-" + post.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  }

  function day(date, lang) {
    try {
      return new Intl.DateTimeFormat(lang, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
    } catch (error) {
      return date;
    }
  }

  // Captions carry tagged links; the card shows them as short links and keeps the full address in href.
  function textHtml(text) {
    return esc(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => {
      const href = url.replace(/&amp;/g, "&");
      let label = href;
      try {
        const parsed = new URL(href);
        label = parsed.hostname.replace(/^www\./, "") + (parsed.pathname.length > 1 ? parsed.pathname : "");
      } catch (error) { /* keep the address */ }
      return "<a href=\"" + esc(href) + "\" rel=\"noopener\">" + esc(label) + "</a>";
    }).replace(/\n/g, "<br>");
  }

  // Posted ones first, newest first; then the ones still queued on the networks, soonest first.
  function arrange(posts, today) {
    const due = posts.filter((post) => post.date <= today).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const later = posts.filter((post) => post.date > today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return due.map((post) => Object.assign({}, post, { upcoming: false })).concat(later.map((post) => Object.assign({}, post, { upcoming: true })));
  }

  function cardHtml(post, copy, lang) {
    const kind = copy.kind[post.kind] || post.kind;
    const play = post.youtube
      ? "<button class=\"post-play\" type=\"button\" data-act=\"play\" data-video=\"" + esc(post.youtube) + "\" aria-label=\"" + esc(copy.watch) + "\"><span aria-hidden=\"true\"></span></button>"
      : "";
    const report = post.report
      ? "<a class=\"post-btn\" data-act=\"report\" href=\"qa-review" + suffix(lang) + ".html?live=" + encodeURIComponent(post.report) + "\">" + esc(copy.report) + "</a>"
      : "";
    return "<article class=\"post\" id=\"" + anchor(post) + "\" data-id=\"" + esc(post.id) + "\" data-kind=\"" + esc(post.kind) + "\" data-lang=\"" + esc(post.lang) + "\">"
      + "<div class=\"post-media\"><img src=\"" + esc(post.thumb) + "\" width=\"540\" height=\"675\" loading=\"lazy\" decoding=\"async\" alt=\"" + esc(post.alt) + "\">" + play + "</div>"
      + "<div class=\"post-body\">"
      + "<p class=\"post-meta\"><span class=\"post-tag post-kind-" + esc(post.kind) + "\">" + esc(kind) + "</span>"
      + (post.cat ? "<span class=\"post-tag\">" + esc(post.cat) + "</span>" : "")
      + "<span class=\"post-tag post-lang\" translate=\"no\">" + esc(post.lang.toUpperCase()) + "</span>"
      + (post.youtube && post.clipLang && post.clipLang !== post.lang ? "<span class=\"post-tag post-lang\" translate=\"no\" title=\"" + esc(copy.watch) + "\">▶ " + esc(post.clipLang.toUpperCase()) + "</span>" : "")
      + (post.upcoming ? "<span class=\"post-tag post-scheduled\">" + esc(copy.scheduled) + "</span>" : "")
      + "<time datetime=\"" + esc(post.date) + "\">" + esc(day(post.date, lang)) + "</time></p>"
      + "<h2 class=\"post-title\" lang=\"" + esc(post.lang) + "\"><a href=\"" + esc(permalink(post, lang)) + "\" data-act=\"open\">" + esc(post.title) + "</a></h2>"
      + "<p class=\"post-text\" lang=\"" + esc(post.lang) + "\">" + textHtml(post.text) + "</p>"
      + "<div class=\"post-actions\">"
      + "<button class=\"post-btn\" type=\"button\" data-act=\"copy\">" + esc(copy.copy) + "</button>"
      + "<button class=\"post-btn\" type=\"button\" data-act=\"share\">" + esc(copy.share) + "</button>"
      + "<a class=\"post-btn\" data-act=\"download\" href=\"" + esc(post.image) + "\" download>" + esc(copy.download) + "</a>"
      + report
      + "</div></div></article>";
  }

  return { SITE, esc, pageFor, permalink, anchor, day, textHtml, arrange, cardHtml };
});
