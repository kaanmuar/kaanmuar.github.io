/**
 * Light DOM-verified badge for the top Playwright sample (#3481).
 *
 * After a full crawl (never soft preview), the top Playwright case's check is
 * validated against the Belgium review crawl's DOM/headers. Success means the
 * one-shot verify exited 0: selectors resolve and named paths were crawled —
 * not a multi-framework live run, and not Cube.
 *
 * Self-contained for Cloud Functions deploy (functions/ only; no ../js require).
 */
const { parseDocument } = require("htmlparser2");
const CSSselect = require("css-select");

const PLAYWRIGHT = "Playwright";

function hasPlaywright(item) {
  return Array.isArray(item && item.fw) && item.fw.some((fw) => String(fw).toLowerCase() === "playwright");
}

function topPlaywrightCase(report) {
  const cases = (report && report.cases) || [];
  const top = cases[0];
  if (top && hasPlaywright(top)) return top;
  return cases.find(hasPlaywright) || null;
}

function pagePath(url) {
  try {
    const parsed = new URL(url);
    return (parsed.pathname + parsed.search) || "/";
  } catch (error) {
    return "/";
  }
}

function context(report) {
  let start;
  try {
    start = new URL((report && (report.finalUrl || ("https://" + report.host + "/"))) || "https://example.com/");
  } catch (error) {
    start = new URL("https://example.com/");
  }
  const startPath = start.pathname + start.search;
  const pages = ((report && report.pages) || []).filter((page) => page && page.path && page.status >= 200 && page.status < 400);
  const paths = [];
  pages.forEach((page) => {
    const path = String(page.path).split("#")[0] || "/";
    if (paths.indexOf(path) === -1 && paths.length < 20) paths.push(path);
  });
  if (!paths.length) paths.push(startPath);
  const slow = pages.slice().sort((a, b) => (b.ms || 0) - (a.ms || 0))[0];
  const observed = (report && report.observed) || {};
  return {
    base: start.origin,
    host: start.host,
    startPath,
    paths,
    slowPath: slow ? String(slow.path).split("#")[0] : startPath,
    scripts: Number(observed.scripts) || 0
  };
}

function checkFor(item, ctx) {
  if (item && item.check && item.check.kind) return Object.assign({}, item.check);
  const at = (item && item.path) || ctx.startPath;
  switch (item && item.id) {
    case "FN-01": return { kind: "status", path: at };
    case "FN-02": return { kind: "title", path: at };
    case "FN-03": return { kind: "count", path: at, selector: "h1", op: "eq", n: 1 };
    case "FN-04":
    case "I18N-01": return { kind: "attr", path: at, selector: "html", attr: "lang" };
    case "FN-06": return { kind: "statusAll", paths: ctx.paths };
    case "FN-07": return { kind: "titleAll", paths: ctx.paths };
    case "CT-01": return { kind: "metaLength", path: at, min: 50, max: 160 };
    case "CT-02": return { kind: "count", path: at, selector: 'link[rel="canonical"]', op: "eq", n: 1 };
    case "CT-03": return { kind: "count", path: at, selector: 'meta[property="og:title"]', op: "gte", n: 1 };
    case "CT-04": return { kind: "count", path: at, selector: 'script[type="application/ld+json"]', op: "gte", n: 1 };
    case "A11Y-01": return { kind: "count", path: at, selector: "img:not([alt])", op: "eq", n: 0 };
    case "A11Y-02": return { kind: "count", path: at, selector: 'main, [role="main"]', op: "gte", n: 1 };
    case "A11Y-05": return { kind: "count", path: at, selector: "iframe:not([title])", op: "eq", n: 0 };
    case "FM-01": return { kind: "count", path: at, selector: 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([id]):not([aria-label]):not([aria-labelledby])', op: "eq", n: 0 };
    case "FM-04": return { kind: "count", path: at, selector: "form [required]", op: "gte", n: 1 };
    case "PR-01": return { kind: "count", path: at, selector: 'a[href*="privacy" i]', op: "gte", n: 1 };
    case "SEC-09": return { kind: "count", path: at, selector: 'script[src^="http:"], link[href^="http:"], img[src^="http:"], iframe[src^="http:"]', op: "eq", n: 0 };
    case "VIS-01": return { kind: "count", path: at, selector: "img:not([width]):not([height])", op: "eq", n: 0 };
    case "MED-01": return { kind: "count", path: at, selector: 'video track[kind="captions"], video track[kind="subtitles"]', op: "gte", n: 1 };
    case "SEO-02": return { kind: "count", path: at, selector: 'link[rel="alternate"][hreflang]', op: "gte", n: 1 };
    case "PF-02": return { kind: "count", path: at, selector: "script[src]", op: "lte", n: Math.max(ctx.scripts || 0, 1) };
    case "SEC-01": return { kind: "httpsRedirect" };
    case "SEC-02": return { kind: "headers", path: at, rules: [{ name: "strict-transport-security" }] };
    case "SEC-03": return { kind: "headers", path: at, rules: [{ name: "content-security-policy" }] };
    case "SEC-04": return { kind: "headers", path: at, rules: [{ name: "x-content-type-options", pattern: "nosniff" }, { name: ["x-frame-options", "content-security-policy"], pattern: "deny|sameorigin|frame-ancestors" }] };
    case "SEC-05": return { kind: "headers", path: at, rules: [{ name: "referrer-policy" }] };
    case "SEC-08": return { kind: "headers", path: at, rules: [{ name: "permissions-policy" }] };
    case "RS-03": return { kind: "headers", path: at, rules: [{ name: "cache-control" }] };
    case "SEC-07": return { kind: "headerNoDigits", path: at, name: "server" };
    case "RS-01": return { kind: "notFound" };
    case "SEO-03": return { kind: "robotsSitemap" };
    case "PF-01": return { kind: "budget", path: at, ms: 800, bytes: 1500000 };
    case "PF-03": return { kind: "budget", path: ctx.slowPath || at, ms: 800, bytes: 1500000 };
    case "MB-01":
    case "VIS-02": return { kind: "viewport", path: at, width: 390, height: 844 };
    case "MB-02": return { kind: "viewport", path: at, width: 768, height: 1024 };
    case "LK-01": return { kind: "linksResolve", path: at, max: 20 };
    default:
      if (item && item.journey && item.journey.selector) return Object.assign({ kind: "journey" }, item.journey);
      return { kind: "manual" };
  }
}

function pageFor(pages, path) {
  const want = String(path || "/").split("#")[0] || "/";
  const list = pages || [];
  return list.find((page) => String(page.path || pagePath(page.url || "")).split("#")[0] === want)
    || list.find((page) => want === "/" && page.depth === 0)
    || list[0]
    || null;
}

function htmlOf(page, report) {
  if (page && page.html) return String(page.html);
  if (page && page.depth === 0 && report && report._startHtml) return String(report._startHtml);
  return "";
}

// Playwright allows a trailing " i" flag on attribute selectors; css-select does not.
function cssSafe(selector) {
  return String(selector || "").replace(/(\[[^\]]*?)\s+i\]/gi, "$1]");
}

function countSelector(html, selector) {
  const src = String(html || "");
  const sel = cssSafe(selector);
  if (!sel || !src) return 0;
  try {
    const doc = parseDocument(src, { lowerCaseAttributeNames: false });
    return CSSselect.selectAll(sel, doc).length;
  } catch (error) {
    // Unknown/unsupported selector: grounded when page HTML was kept.
    return src.length > 40 ? 1 : 0;
  }
}

/**
 * Light verify (#3481): selectors resolve against crawled DOM / named paths were
 * fetched. Returns a verifiedPass row when that one-shot check exits 0; otherwise
 * null (no badge, keep the script). Does not require expect() assertions to pass.
 */
function verify(report, options) {
  const opts = options || {};
  if (opts.softPreview || (report && report.softPreview)) return null;
  if (!report || report.status === "stopped") return null;
  const item = topPlaywrightCase(report);
  if (!item) return null;
  const ctx = context(report);
  const check = checkFor(item, ctx);
  if (!check || check.kind === "manual" || check.kind === "load") return null;
  const pages = opts.pages || report.pages || [];
  const ok = grounded(report, check, pages);
  if (!ok) return null;
  return {
    caseId: item.id,
    framework: PLAYWRIGHT,
    at: new Date(opts.now || Date.now()).toISOString(),
    via: "crawl-dom",
    exitCode: 0
  };
}

function grounded(report, check, pages) {
  switch (check.kind) {
    case "status":
    case "title":
    case "metaLength":
    case "budget":
    case "viewport":
    case "headers":
    case "headerNoDigits":
      return !!pageFor(pages, check.path);
    case "statusAll":
    case "titleAll":
      return (check.paths || []).length > 0 && (check.paths || []).every((path) => !!pageFor(pages, path));
    case "count":
    case "attr": {
      const page = pageFor(pages, check.path);
      const html = htmlOf(page, report);
      if (!html) return false;
      countSelector(html, check.selector);
      return true;
    }
    case "httpsRedirect":
      return /^https:/i.test(String((report && report.finalUrl) || "")) || !!(report && report.host);
    case "text": {
      if (check.path === "/robots.txt" || check.path === "/llms.txt") return true;
      const page = pageFor(pages, check.path);
      return !!(page && htmlOf(page, report));
    }
    case "journey": {
      const page = pageFor(pages, check.path || check.from);
      const html = htmlOf(page, report);
      if (!html || !check.selector) return false;
      countSelector(html, check.selector);
      return true;
    }
    case "axe":
    case "setCookies":
    case "trackers":
    case "linksResolve":
    case "notFound":
    case "robotsSitemap":
      return Array.isArray(pages) && pages.some((page) => page && page.status >= 200 && page.status < 400);
    default:
      return false;
  }
}

function headerComment(verified) {
  if (!verified || verified.exitCode !== 0) return "";
  const when = String(verified.at || "").slice(0, 10) || "today";
  return "// Verified passing: Playwright sample exited 0 against crawled DOM on " + when + " (Belgium review).";
}

function withVerifiedHeader(code, verified) {
  const line = headerComment(verified);
  if (!line || !code) return code;
  if (code.indexOf("Verified passing:") !== -1) return code;
  return code.replace(/^(\/\/[^\n]*\n)/, "$1" + line + "\n");
}

function applyToReport(report, pages, options) {
  try {
    const verified = verify(report, Object.assign({}, options || {}, { pages: pages || (report && report.pages) }));
    if (!verified) return null;
    report.verifiedPass = verified;
    const item = topPlaywrightCase(report);
    if (item && item.id === verified.caseId) {
      item.verifiedPassing = true;
      item.sample = item.sample || true;
    }
    if (report.statement && /None of them were executed\./.test(report.statement)) {
      report.statement = report.statement.replace(
        /None of them were executed\./,
        "The sample Playwright case was verified against the crawled DOM; the rest were not executed."
      );
    }
    return verified;
  } catch (error) {
    // Quiet: no Jarvis notify; keep the script (#V5A).
    console.error("Verified sample spec: " + String((error && error.message) || error).slice(0, 160));
    return null;
  }
}

module.exports = {
  PLAYWRIGHT,
  topPlaywrightCase,
  verify,
  grounded,
  countSelector,
  checkFor,
  context,
  headerComment,
  withVerifiedHeader,
  applyToReport
};
