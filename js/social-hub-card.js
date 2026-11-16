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

  // Every post has its own page, in the language it is written in.
  function postPath(post) {
    return "social/" + post.id + ".html";
  }

  function permalink(post, lang, absolute) {
    return (absolute ? SITE : "") + postPath(post);
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

  // Paragraphs run on in the clamped card excerpt and stack in the full post.
  function parasHtml(text) {
    return String(text || "").split(/\n\s*\n/).map((para) => para.trim()).filter(Boolean)
      .map((para) => "<span class=\"post-par\">" + textHtml(para) + "</span>").join(" ");
  }

  function topic(post, copy) {
    return (copy.cats && copy.cats[post.cat]) || post.cat;
  }

  const ICON = {
    sound: "<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z\"/></svg>",
    download: "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V3zM5 19h14v2H5z\"/></svg>",
    share: "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z\"/></svg>"
  };

  // Posted ones first, newest first; then the ones still to come, soonest first.
  function arrange(posts, today) {
    const due = posts.filter((post) => post.date <= today).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const later = posts.filter((post) => post.date > today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return due.map((post) => Object.assign({}, post, { upcoming: false })).concat(later.map((post) => Object.assign({}, post, { upcoming: true })));
  }

  const SORTS = ["date", "title", "impressions", "views", "likes", "comments"];
  const METRICS = ["impressions", "views", "likes", "comments"];

  function defaultDir(sort) {
    return sort === "title" ? "asc" : "desc";
  }

  // A post's count of one metric on one network, or summed over its networks; null when no network reported it.
  function metric(post, key, net) {
    const stats = post.stats || {};
    const nets = net && net !== "all" ? [net] : Object.keys(stats);
    let total = null;
    nets.forEach((name) => {
      const n = stats[name] && stats[name][key];
      if (typeof n === "number") total = (total || 0) + n;
    });
    return total;
  }

  // Posts come in arrange() order. Date keeps posted ones ahead of those still to come; title and the counts sort
  // the whole feed, ties keep arrange() order, and posts without the count go last either way.
  function sortPosts(list, sort, dir, net) {
    const sign = dir === "asc" ? 1 : -1;
    const order = new Map(list.map((post, i) => [post, i]));
    if (sort === "title") {
      return list.slice().sort((a, b) => sign * a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) || order.get(a) - order.get(b));
    }
    if (METRICS.includes(sort)) {
      return list.slice().sort((a, b) => {
        const x = metric(a, sort, net);
        const y = metric(b, sort, net);
        if (x === null || y === null) return (x === null) - (y === null) || order.get(a) - order.get(b);
        return sign * (x - y) || order.get(a) - order.get(b);
      });
    }
    if (dir !== "asc") return list.slice();
    const due = list.filter((post) => !post.upcoming).reverse();
    return due.concat(list.filter((post) => post.upcoming));
  }

  function compact(n, lang) {
    try {
      return new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 }).format(n);
    } catch (error) {
      return String(n);
    }
  }

  const STAT_ICON = {
    impressions: "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z\"/></svg>",
    views: "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M8 5v14l11-7z\"/></svg>",
    likes: "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M12 21l-1.5-1.3C5.4 15.1 2 12.1 2 8.4 2 5.4 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.7-3.4 6.7-8.5 11.3z\"/></svg>",
    comments: "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z\"/></svg>"
  };

  // Totals over the post's networks, or the one network the reader filtered to; the tooltip splits them by network.
  function statsHtml(post, copy, lang, net) {
    const items = METRICS.map((key) => [key, metric(post, key, net)]).filter(([, n]) => n);
    if (!items.length) return "";
    const nets = Object.keys(post.stats || {}).filter((name) => !net || net === "all" || name === net);
    const title = nets.map((name) => (copy.nets[name] || name) + ": " + METRICS.filter((key) => post.stats[name][key])
      .map((key) => copy.sorts[key].toLowerCase() + " " + post.stats[name][key]).join(", ")).join(" · ");
    return "<p class=\"post-stats\" title=\"" + esc(title) + "\">" + items.map(([key, n]) =>
      "<span class=\"post-stat\"><span class=\"sr-only\">" + esc(copy.sorts[key]) + ": </span>" + STAT_ICON[key] + esc(compact(n, lang)) + "</span>").join("") + "</p>";
  }

  // A post still to come is Scheduled only when a network has it queued; one held for the hub alone gets no tag.
  function planTag(post, copy) {
    if (!post.upcoming || post.held) return "";
    return post.queued
      ? "<span class=\"post-tag post-scheduled\">" + esc(copy.scheduled) + "</span>"
      : "<span class=\"post-tag post-planned\">" + esc(copy.planned) + "</span>";
  }

  function cardHtml(post, copy, lang, net) {
    const kind = copy.kind[post.kind] || post.kind;
    const voice = (post.clipLang || post.lang).toUpperCase();
    const play = post.youtube
      ? "<button class=\"post-play\" type=\"button\" data-act=\"play\" data-video=\"" + esc(post.youtube) + "\" aria-label=\"" + esc(copy.watch + " (" + copy.sound + ", " + voice + ")") + "\">"
        + "<span class=\"post-play-icon\" aria-hidden=\"true\"></span>"
        + "<span class=\"post-play-label\" aria-hidden=\"true\">" + esc(copy.watch) + "<span class=\"post-play-voice\" translate=\"no\">" + ICON.sound + esc(voice) + "</span></span></button>"
      : "";
    const report = post.report
      ? "<a class=\"post-report\" data-act=\"report\" href=\"qa-review" + suffix(lang) + ".html?live=" + encodeURIComponent(post.report) + "&amp;from=social\">" + esc(copy.report) + " →</a>"
      : "";
    return "<article class=\"post" + (post.youtube ? " post-has-clip" : "") + "\" id=\"" + anchor(post) + "\" data-id=\"" + esc(post.id) + "\" data-kind=\"" + esc(post.kind) + "\" data-lang=\"" + esc(post.lang) + "\">"
      + "<div class=\"post-media\"><img src=\"" + esc(post.thumb) + "\" width=\"540\" height=\"675\" loading=\"lazy\" decoding=\"async\" alt=\"" + esc(post.alt) + "\">" + play + "</div>"
      + "<div class=\"post-body\">"
      + "<p class=\"post-meta\"><span class=\"post-tag post-kind-" + esc(post.kind) + "\">" + esc(kind) + "</span>"
      + (post.cat ? "<span class=\"post-tag\">" + esc(topic(post, copy)) + "</span>" : "")
      + "<span class=\"post-tag post-lang\" translate=\"no\">" + esc(post.lang.toUpperCase()) + "</span>"
      + (post.youtube && post.clipLang && post.clipLang !== post.lang ? "<span class=\"post-tag post-lang\" translate=\"no\" title=\"" + esc(copy.watch) + "\">▶ " + esc(post.clipLang.toUpperCase()) + "</span>" : "")
      + planTag(post, copy)
      + "</p>"
      + "<h2 class=\"post-title\" lang=\"" + esc(post.lang) + "\"><a href=\"" + esc(permalink(post, lang)) + "\" data-act=\"open\">" + esc(post.title) + "</a></h2>"
      + "<p class=\"post-text\" lang=\"" + esc(post.lang) + "\">" + parasHtml(post.text) + "</p>"
      + "<p class=\"post-foot\"><time datetime=\"" + esc(post.date) + "\">" + esc(day(post.date, lang)) + "</time>" + report + "</p>"
      + statsHtml(post, copy, lang, net)
      + "<div class=\"post-actions\">"
      + "<button class=\"post-btn post-btn-primary\" type=\"button\" data-act=\"share\">" + ICON.share + esc(copy.share) + "</button>"
      + "<button class=\"post-btn\" type=\"button\" data-act=\"copy\">" + esc(copy.copy) + "</button>"
      + "<a class=\"post-btn post-btn-icon\" data-act=\"download\" href=\"" + esc(post.image) + "\" download aria-label=\"" + esc(copy.download) + "\" title=\"" + esc(copy.download) + "\">" + ICON.download + "</a>"
      + "</div></div></article>";
  }

  return { SITE, ICON, SORTS, METRICS, esc, pageFor, postPath, permalink, anchor, day, textHtml, parasHtml, topic, arrange, defaultDir, metric, sortPosts, statsHtml, planTag, cardHtml };
});
