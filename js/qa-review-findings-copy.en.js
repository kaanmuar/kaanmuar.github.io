// Generated from js/qa-review-findings-copy.js by scripts/build-findings-copy.js with only the en dictionary; edit the source.
// Finding titles, evidence and advice in the page language. The server sends each line as English text and,
// for findings it can template, as { id, vars } (functions/url-review-findings-en.js holds the English).
// A line whose ids this page language lacks keeps the server's English.
(function () {
  const COPY = {};

  function pick(lines, id, vars) {
    if (vars && typeof vars.n === "number") {
      const form = lines[id + (vars.n === 1 ? "_one" : "_other")];
      if (form != null) return form;
    }
    return lines[id];
  }

  // Same rules as render() in functions/url-review-findings-en.js; null when an id is missing.
  function render(lines, value) {
    if (value == null) return "";
    if (typeof value !== "object") return String(value);
    if (Array.isArray(value.items)) {
      const parts = value.items.map((item) => render(lines, item));
      if (parts.some((part) => part === null)) return null;
      if (value.join) {
        const glue = lines["list." + value.join];
        if (glue == null) return null;
        return parts.length > 1 ? parts.slice(0, -1).join(", ") + glue + parts[parts.length - 1] : parts.join("");
      }
      const joined = parts.join(value.sep == null ? ", " : value.sep);
      if (!(value.more > 0)) return joined;
      return lines["list.more"] == null ? null : joined + lines["list.more"].replace("{n}", value.more);
    }
    const template = pick(lines, value.id, value.vars);
    if (template == null) return null;
    let missing = false;
    const out = String(template).replace(/\{(\w+)\}/g, (match, name) => {
      if (!value.vars || !(name in value.vars)) return match;
      const filled = render(lines, value.vars[name]);
      if (filled === null) missing = true;
      return filled;
    });
    return missing ? null : out;
  }

  // Reports saved before the server sent warningMsgs carry only the English warnings; these read them back.
  const SAID = [
    [/^The site's bot protection refused the plain request; the page was analyzed in headless Chrome\./, () => ({ id: "warn.browserRead" })],
    [/^The site's bot protection refused the plain request and headless Chrome while it carried the review tag; the page was analyzed in headless Chrome without the tag\./, () => ({ id: "warn.untaggedRead" })],
    [/^The plain request for the start page took longer than 8 s; the page was analyzed in headless Chrome\./, () => ({ id: "warn.slowRead" })],
    [/^The start page is larger than 2 MB, so the review analyzed its first 2 MB\./, () => ({ id: "warn.cut" })],
    [/^The start page was still arriving after 8 s, so the review analyzed the part that had arrived\./, () => ({ id: "warn.slowCut" })],
    [/^The start page's HTML lists almost no same-host links, so the review followed the links on the page rendered in headless Chrome\./, () => ({ id: "warn.shell" })],
    [/^The start page answered with an? (.+?) bot check instead of the site, so these scores describe that check page\./,
      (m) => ({ id: "warn.challenge", vars: { check: { id: /^[aeiou]/i.test(m[1]) ? "botCheck.an" : "botCheck.a", vars: { vendor: m[1] } } } })],
    [/^Partial analysis: (\d+) of (\d+) linked pages? answered with a bot check or a block, so the scores rest mostly on the start page\./,
      (m) => ({ id: "warn.partial", vars: { blocked: Number(m[1]), linked: { id: "linkedPagesN", vars: { n: Number(m[2]) } } } })]
  ];

  function readWarnings(english) {
    const list = [];
    let rest = String(english || "").trim();
    while (rest) {
      let hit = null;
      for (const [pattern, make] of SAID) {
        const match = rest.match(pattern);
        if (match) { hit = match; list.push(make(match)); break; }
      }
      if (!hit) return null;
      rest = rest.slice(hit[0].length).trim();
    }
    return list;
  }

  const KEEP_CASE = /^(Google|Consent|Lighthouse|Analytics)(?![\p{L}\p{N}])/u;

  function forLang(lang) {
    const code = String(lang || "en").slice(0, 2).toLowerCase();
    const book = COPY[code] || null;

    // line(item.msg && item.msg.title, item.title): the line in this language, or the server's English.
    function line(message, fallback) {
      if (!book || !message) return fallback;
      const text = render(book, message);
      return text === null ? fallback : text;
    }

    // The health warnings in this language, from the server's messages or the English text; null when a line is missing.
    function warnings(messages, english) {
      if (!book) return null;
      const list = Array.isArray(messages) && messages.length ? messages : readWarnings(english);
      if (!list) return null;
      const lines = list.map((message) => render(book, message));
      return lines.some((text) => text === null) ? null : lines.join(" ");
    }

    // "Fix first: <title>." for the top-ranked finding; the title starts lowercase like the English, except in German,
    // after a slot such as {name}, and on product terms.
    function fixFirst(item) {
      const said = item && item.msg && item.msg.title;
      if (!book || !said || typeof said !== "object") return null;
      let title = render(book, said);
      if (title === null) return null;
      const template = String(pick(book, said.id, said.vars) || "");
      if (code !== "de" && !/^\{/.test(template) && /^\p{Lu}[\p{Ll}’']*(?![\p{L}\p{N}-])/u.test(title) && !KEEP_CASE.test(title)) {
        title = title.charAt(0).toLowerCase() + title.slice(1);
      }
      return render(book, { id: "fixFirst", vars: { title } });
    }

    return { lang: code, translated: !!book, line: line, render: render, warnings: warnings, fixFirst: fixFirst };
  }

  // functions/url-review-findings-copy.js is this file, copied by scripts/build-findings-copy.js.
  if (typeof module === "object" && module.exports) module.exports = { COPY, forLang };
  else window.QAReviewFindingsCopy = forLang(document.documentElement.lang);
})();
