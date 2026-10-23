/**
 * Ask the report: answers built from one paid report's own evidence, and nothing else.
 * It explains a finding or case, writes its fix for the stack the review saw, writes the
 * Playwright case for a case id, and drafts the GitHub or Jira issue for it.
 */
(function (root) {
  "use strict";

  const Scripts = typeof module === "object" && module.exports ? require("./qa-review-scripts.js") : root.QAReviewScripts;
  const VERDICT = { fail: "Fails now", risk: "At risk", person: "Needs a person with a browser", pass: "Passes", proposed: "Proposed, not checked yet" };
  const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  const JIRA_PRIORITY = { critical: "Highest", high: "High", medium: "Medium", low: "Low", info: "Lowest" };
  const HEADER_OF = { "sec-hsts": "Strict-Transport-Security", "sec-csp": "Content-Security-Policy-Report-Only", "sec-nosniff": "X-Content-Type-Options", "sec-frame": "X-Frame-Options", "sec-referrer": "Referrer-Policy", "sec-permissions": "Permissions-Policy" };
  const HOST_FILE = { Netlify: "netlify", Cloudflare: "netlify", "GitHub Pages": "netlify", Vercel: "vercel", "Firebase Hosting": "firebase", nginx: "nginx", Apache: "apache" };
  const DNS_OF = {
    "sec-spf": (row) => /^v=spf1/.test(row.value),
    "sec-dmarc": (row) => /^_dmarc\./.test(row.name),
    "sec-caa": (row) => row.type === "CAA",
    "sec-tlsrpt": (row) => /^_smtp\._tls\./.test(row.name),
    "sec-mta-sts": (row) => /^_mta-sts\./.test(row.name)
  };
  const KIT_FILE = {
    "geo-llms": ["llmsTxt", "llms.txt"],
    "sec-securitytxt": ["securityTxt", ".well-known/security.txt"],
    "an-privacy": ["privacyNotice", "privacy-notice.md"],
    "an-imprint": ["imprint", "impressum.md"],
    "a11y-statement": ["accessibilityStatement", "accessibility-statement.md"],
    "an-chat-consent": ["chatSnippet", "chat-click-to-load.html"],
    "an-chat-reject": ["chatSnippet", "chat-click-to-load.html"],
    "sec-mta-sts": ["mtaSts", "mta-sts.txt"]
  };
  const INTENTS = [
    ["export", /\b(github|jira|issues?|tickets?|export\w*|esporta\w*)\b/],
    ["playwright", /\b(playwright|scripts?|specs?|tests?|testfall|prueba|teste)\b/],
    ["fix", /\b(fix\w*|repair|solve|stack|hosting|config\w*|arregl\w*|corrig\w*|soluc\w*|correc\w*|correz\w*|beheb\w*|repar\w*|risolv\w*)\b/],
    ["why", /\b(why|explain\w*|reason|high|severity|priority|rank\w*|por ?que|explica\w*|warum|erklar\w*|pourquoi|expliqu\w*|perche|spiega\w*|severidad|gravedad)\b/]
  ];
  const STOP = ["what", "this", "that", "with", "from", "does", "have", "high", "show", "write", "case", "test", "tests", "issue", "github", "jira", "export", "playwright", "stack", "about", "report", "finding", "explain", "there", "which", "would", "could", "should", "please", "rated", "rank", "ranked", "turn", "into", "make", "give", "the", "for", "why", "fix",
    "por", "que", "porque", "para", "como", "una", "los", "las", "del", "esta", "alto", "alta", "und", "der", "die", "das", "ist", "warum", "hoch", "pour", "les", "des", "une", "est", "elevee", "eleve", "perche", "che", "della", "per", "sono"];
  const SCOPE = "I answer only from this report: why a finding or case is rated the way it is, its fix for the stack this review saw, the Playwright case for a case id, and a GitHub or Jira issue for a finding or case.";
  const MAX_BODY = 6000;

  function plain(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function text(value) { return { kind: "text", text: value }; }
  function list(items) { return { kind: "list", items }; }
  function code(value, label) { return { kind: "code", text: value, label }; }

  function plural(count, one, many) {
    return count + " " + (count === 1 ? one : (many || one + "s"));
  }

  function findings(report) {
    return (report.insights && report.insights.findings) || [];
  }

  function intentOf(question) {
    const words = plain(question).replace(/github pages|github\.com/g, " ");
    const found = INTENTS.find(([, pattern]) => pattern.test(words));
    return found ? found[0] : "";
  }

  function idsIn(question) {
    return (String(question || "").toUpperCase().match(/\b[A-Z][A-Z0-9]{0,5}-\d{1,3}\b/g) || []).map((id) => id.replace(/-(\d)$/, "-0$1"));
  }

  function lookup(report, id) {
    const finding = findings(report).find((item) => item.id === id);
    if (finding) return { kind: "finding", item: finding };
    const found = (report.cases || []).find((item) => item.id === id);
    return found ? { kind: "case", item: found } : null;
  }

  function byWords(report, question, prefer) {
    const words = plain(question).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && STOP.indexOf(word) === -1);
    if (!words.length) return null;
    const pool = findings(report).map((item) => ({ kind: "finding", item })).concat((report.cases || []).map((item) => ({ kind: "case", item })));
    pool.sort((a, b) => (a.kind === prefer ? 0 : 1) - (b.kind === prefer ? 0 : 1));
    let best = null;
    let most = 0;
    pool.forEach((entry) => {
      const title = plain(entry.item.title);
      const hits = words.filter((word) => title.indexOf(word) !== -1).length;
      if (hits > most) {
        best = entry;
        most = hits;
      }
    });
    return most >= Math.max(1, Math.ceil(words.length / 2)) ? best : null;
  }

  function target(report, question, prefer) {
    const ids = idsIn(question);
    for (const id of ids) {
      const hit = lookup(report, id);
      if (hit) return hit;
    }
    if (ids.length) return { missing: ids[0] };
    return byWords(report, question, prefer);
  }

  function findingOf(report, item) {
    if (item.finding) {
      const hit = findings(report).find((row) => row.id === item.finding);
      if (hit) return hit;
    }
    return findings(report).find((row) => (row.cases || []).indexOf(item.id) !== -1) || null;
  }

  function openFindings(report) {
    return findings(report).filter((item) => item.verdict === "fail" || item.verdict === "risk");
  }

  function playwrightCases(report) {
    return (report.cases || []).filter((item) => (item.fw || []).indexOf("Playwright") !== -1);
  }

  function suggestions(report) {
    const top = openFindings(report).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];
    const hosting = (report.insights && report.insights.fixkit && report.insights.fixkit.hosting) || "";
    const runnable = playwrightCases(report);
    const firstCase = (top && runnable.find((item) => (top.cases || []).indexOf(item.id) !== -1)) || runnable.find((item) => item.priority === "P1") || runnable[0];
    const asks = [];
    if (top) asks.push("Why is " + top.id + " rated " + top.severity + "?", "Show me the fix for " + top.id + (hosting ? " on " + hosting : " for my stack"));
    if (firstCase) asks.push("Write the Playwright case for " + firstCase.id);
    if (top) asks.push("Export " + top.id + " as a GitHub or Jira issue");
    return asks;
  }

  function priorityWhy(item) {
    const reach = item.count || (item.pages || []).length || 1;
    return "Priority grows with the severity (" + item.severity + "), counts a failure in full and a risk at 60 percent (this one " + (item.verdict === "fail" ? "fails" : "is a risk") + "), grows with reach (" + plural(reach, "page") + "), and shrinks with the effort to fix (" + (item.effort || "not estimated") + ").";
  }

  function pagesPart(item) {
    const pages = item.pages || [];
    if (!pages.length) return null;
    return text("Pages: " + pages.slice(0, 8).join(", ") + (pages.length > 8 ? " and " + (pages.length - 8) + " more." : "."));
  }

  function explainFinding(report, item, question) {
    const parts = [text(VERDICT[item.verdict] + ", rated " + item.severity + " in " + item.area + ".")];
    if (/\bhigh\b/.test(plain(question)) && (SEVERITY_RANK[item.severity] || 0) < 4 && item.rank) {
      parts.push(text("Its severity is " + item.severity + ", not high. Its place near the top comes from the priority below."));
    }
    parts.push(text("What the review saw: " + item.evidence));
    if (item.rank) parts.push(text("It ranks " + item.rank + " of " + openFindings(report).length + " fails and risks, with priority " + item.priority + ". " + priorityWhy(item)));
    else if (item.verdict === "pass") parts.push(text("It passes, so it is not ranked."));
    else if (item.verdict === "person") parts.push(text("A machine read cannot settle it, so it is not ranked. A person checks it in a browser."));
    const pages = pagesPart(item);
    if (pages) parts.push(pages);
    if ((item.cases || []).length) parts.push(text("Test cases: " + item.cases.join(", ") + "."));
    if (item.fix && item.verdict !== "pass") parts.push(text("Fix: " + item.fix));
    return parts;
  }

  function explainCase(report, item) {
    const state = item.verdict ? VERDICT[item.verdict] + (item.severity && item.severity !== "info" ? ", rated " + item.severity : "") : VERDICT.proposed;
    const parts = [text(item.id + " is a " + item.layer + " case. " + state + ".")];
    if (item.priority) {
      parts.push(text("Priority " + item.priority + ", risk " + item.risk + " of 100. Risk grows with the severity of what failed (or the weight of the " + item.layer + " layer when nothing failed), with the verdict, with how many pages the case covers, and with whether a finding or selector backs it. P1 starts at 45, P2 at 22, P3 at 9."));
    }
    parts.push(text("Why it is proposed: " + item.why));
    const pages = pagesPart(item);
    if (pages) parts.push(pages);
    const backing = findingOf(report, item);
    if (backing) parts.push(text("It is backed by " + backing.id + ", " + backing.title + ": " + backing.evidence));
    return parts;
  }

  function stackParts(report) {
    const hosting = (report.insights && report.insights.fixkit && report.insights.fixkit.hosting) || "";
    const tech = (report.technologies || []).map((row) => row.name).filter(Boolean);
    const parts = [text(hosting ? "This review saw the site served from " + hosting + "." : "This review could not tell the host, so the common server files are shown.")];
    if (tech.length) parts.push(text("Technologies seen: " + tech.slice(0, 10).join(", ") + (tech.length > 10 ? " and " + (tech.length - 10) + " more." : ".")));
    return parts;
  }

  function recipes(report, item) {
    const kit = (report.insights && report.insights.fixkit) || {};
    const hosting = kit.hosting || "";
    const parts = [];
    const header = HEADER_OF[item.key] && (kit.headers || []).find((row) => row.name === HEADER_OF[item.key]);
    if (header && Scripts && Scripts.headerFiles) {
      const files = Scripts.headerFiles([header], hosting);
      const want = HOST_FILE[hosting];
      const picked = want ? files.filter((file) => file.path.indexOf(want) !== -1).slice(0, 1) : files.slice(0, 3);
      const proxied = (report.technologies || []).some((row) => /cloudflare/i.test(row.name || ""));
      if (hosting === "GitHub Pages") {
        parts.push(text(proxied
          ? "GitHub Pages cannot send custom headers, but this review also saw Cloudflare in front of the site. Add the header there with a Response Header Transform Rule, using the name and value below. A _headers file only works on Cloudflare Pages or Netlify."
          : "GitHub Pages cannot send custom headers. Put a CDN such as Cloudflare in front and set the header there, or move to a host that sends headers. The _headers file below works on Cloudflare Pages and Netlify."));
      }
      picked.forEach((file) => parts.push(code(file.content, file.path.replace(/^fix-kit\/headers\//, ""))));
    }
    const dns = DNS_OF[item.key] ? (kit.dns || []).filter(DNS_OF[item.key]) : [];
    if (dns.length) parts.push(code(dns.map((row) => row.name + "\t" + row.type + "\t" + row.value).join("\n"), "DNS records"));
    const file = KIT_FILE[item.key];
    if (file && kit[file[0]]) parts.push(code(kit[file[0]], file[1]));
    if ((item.key === "seo-schema" || item.key === "geo-entity") && kit.jsonLd) {
      parts.push(code("<script type=\"application/ld+json\">\n" + JSON.stringify(kit.jsonLd, null, 2) + "\n</script>", "structured-data.html"));
    }
    if (item.key === "sec-libraries" && (kit.libraries || []).length) {
      parts.push(list(kit.libraries.map((row) => row.name + " " + row.version + ": " + (row.ended ? "this release line gets no more fixes, move to a supported major version." : "upgrade to " + row.fixed + " or later."))));
    }
    return parts;
  }

  function fixFor(report, hit) {
    const item = hit.kind === "finding" ? hit.item : findingOf(report, hit.item);
    const parts = stackParts(report);
    if (!item) {
      parts.push(text(hit.item.id + " has no scored finding behind it, so this report holds no fix for it. What the case would check: " + hit.item.why));
      return parts;
    }
    if (hit.kind === "case") parts.push(text(hit.item.id + " is backed by " + item.id + ", " + item.title + "."));
    if (item.verdict === "pass") {
      parts.push(text(item.id + " passes. There is nothing to fix."));
      return parts;
    }
    if (item.fix) parts.push(text("Fix: " + item.fix));
    const files = recipes(report, item);
    if (files.length) return parts.concat(files);
    parts.push(text(item.fix ? "The report has no copy-ready file for this one. The fix above is what it holds." : "The report holds no fix for this one, only the evidence: " + item.evidence));
    return parts;
  }

  function playwrightFor(report, hit) {
    let item = hit.kind === "case" ? hit.item : null;
    const parts = [];
    if (!item) {
      const runnable = playwrightCases(report);
      item = runnable.find((row) => (hit.item.cases || []).indexOf(row.id) !== -1) || null;
      if (!item) return [text(hit.item.id + " has no test case with a Playwright script in this report.")];
      parts.push(text(hit.item.id + " is a finding. Its test case is " + item.id + "."));
    }
    const out = Scripts ? Scripts.snippets(report, item, ["Playwright"]) : [];
    if (!out.length) return parts.concat(text(item.id + " is written for " + ((item.fw || []).join(", ") || "no framework") + ", not Playwright."));
    const ctx = Scripts.context(report);
    const name = item.id.toLowerCase() + ".spec.ts";
    const file = [
      "// " + item.id + " · " + ctx.label,
      "// Proposed from this report's evidence. Review selectors and budgets before a run.",
      "import { test, expect } from \"@playwright/test\";",
      "",
      "const BASE = " + JSON.stringify(ctx.base) + ";",
      "const HOST = " + JSON.stringify(ctx.host) + ";",
      "",
      out[0].code,
      ""
    ].join("\n");
    parts.push(text("Save it as tests/" + name + " and run npx playwright test."));
    if (/test\.fixme\(/.test(out[0].code)) parts.push(text("The report leaves this case to a person, so the test is marked fixme and keeps the case's own wording as comments."));
    parts.push(code(file, name));
    return parts;
  }

  function csvCell(value) {
    return "\"" + String(value == null ? "" : value).replace(/"/g, "\"\"") + "\"";
  }

  function issueFor(report, hit, options) {
    const item = hit.item;
    const backing = hit.kind === "finding" ? item : findingOf(report, item);
    const title = "[" + (report.host || "site") + "] " + item.id + ": " + item.title;
    const lines = hit.kind === "finding"
      ? ["**Finding:** " + item.id + " · " + item.area + " · " + VERDICT[item.verdict] + " · severity " + item.severity + (item.rank ? " · priority " + item.priority + ", rank " + item.rank : "")]
      : ["**Case:** " + item.id + " · " + item.layer + " · " + (item.verdict ? VERDICT[item.verdict] : VERDICT.proposed) + (item.priority ? " · " + item.priority + ", risk " + item.risk : "")];
    lines.push("**Site:** " + (report.finalUrl || "https://" + report.host + "/"));
    if (options.reportUrl) lines.push("**Report:** " + options.reportUrl);
    if (hit.kind === "case") lines.push("", "## Case", "", item.why);
    if (backing) lines.push("", "## What the review saw", "", backing.evidence);
    if (backing && backing.fix && backing.verdict !== "pass") lines.push("", "## Fix", "", backing.fix);
    const pages = item.pages || [];
    if (pages.length) {
      lines.push("", "## Pages", "");
      pages.slice(0, 10).forEach((path) => lines.push("- " + path));
      if (pages.length > 10) lines.push("- and " + (pages.length - 10) + " more");
    }
    if (hit.kind === "finding" && (item.cases || []).length) lines.push("", "## Test cases", "", item.cases.join(", "));
    lines.push("", "_From QA-lab URL Review report " + report.id + (report.fetchedAt ? " of " + String(report.fetchedAt).slice(0, 10) : "") + ". Check the evidence before acting on it._");
    let body = lines.join("\n");
    if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY - 1) + "…";
    const severity = (backing && backing.severity) || item.severity || "info";
    const kind = backing && (backing.verdict === "fail" || backing.verdict === "risk") ? "Bug" : "Task";
    const csv = ["Summary", "Description", "Issue Type", "Priority", "Labels"].map(csvCell).join(",") + "\n" +
      [title, body, kind, JIRA_PRIORITY[severity] || "Medium", "qa-review"].map(csvCell).join(",") + "\n";
    return { title, body, csv };
  }

  function githubIssueUrl(repo, issue) {
    const clean = String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/+$/g, "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean)) return "";
    return "https://github.com/" + clean + "/issues/new?title=" + encodeURIComponent(issue.title) + "&body=" + encodeURIComponent(issue.body);
  }

  function heading(hit) {
    return hit.item.id + " · " + hit.item.title;
  }

  function choose(report, intent) {
    const top = openFindings(report).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 3);
    const cases = playwrightCases(report).filter((item) => item.verdict && item.verdict !== "pass").slice(0, 3);
    const pool = intent === "playwright" ? cases : top;
    const asks = { why: "Why is X rated this way?", fix: "Show me the fix for X", playwright: "Write the Playwright case for X", export: "Export X as a GitHub or Jira issue" };
    return {
      intent,
      title: "Which one?",
      parts: [text("Name the finding or case by its id, such as F-01 or SEC-02." + (pool.length ? " The first ones on this report:" : ""))].concat(pool.length ? [list(pool.map((item) => item.id + " · " + item.title))] : []),
      suggest: pool.map((item) => asks[intent].replace("X", item.id))
    };
  }

  function answer(report, question, options) {
    const opts = options || {};
    const asked = String(question || "").trim().slice(0, 300);
    if (!report || !report.id || report.preview) return { intent: "closed", title: "Not open", parts: [text("Ask the report works on a paid report only.")] };
    const intent = intentOf(asked);
    const hit = asked ? target(report, asked, intent === "playwright" ? "case" : "finding") : null;
    if (hit && hit.missing) {
      const ids = findings(report).map((item) => item.id);
      return {
        intent: intent || "why",
        title: "Not in this report",
        parts: [text("This report has no " + hit.missing + "." + (ids.length ? " Its findings run from " + ids[0] + " to " + ids[ids.length - 1] + "." : "") + ((report.cases || []).length ? " Its cases include " + report.cases.slice(0, 6).map((item) => item.id).join(", ") + "." : ""))],
        suggest: suggestions(report)
      };
    }
    if (!intent && !hit) return { intent: "outside", title: "Outside this report", parts: [text(SCOPE + " This question is outside that, so it stays unanswered here.")], suggest: suggestions(report) };
    const kind = intent || "why";
    if (!hit) return choose(report, kind);
    if (kind === "fix") return { intent: kind, title: "Fix for " + heading(hit), parts: fixFor(report, hit), ref: hit.item.id };
    if (kind === "playwright") return { intent: kind, title: "Playwright case for " + hit.item.id, parts: playwrightFor(report, hit), ref: hit.item.id };
    if (kind === "export") {
      const issue = issueFor(report, hit, opts);
      const link = githubIssueUrl(opts.repo, issue);
      return {
        intent: kind,
        title: "Issue for " + heading(hit),
        parts: [
          text(link ? "The GitHub button opens a new issue in " + String(opts.repo).trim() + ", filled in. Nothing is sent until you submit it there." : "Add the GitHub repository as owner/name below the box to open a filled-in issue there. The Markdown below pastes into GitHub or Jira, and the CSV imports into Jira."),
          code(issue.body, "issue.md")
        ],
        issue,
        ref: hit.item.id
      };
    }
    return { intent: kind, title: heading(hit), parts: hit.kind === "finding" ? explainFinding(report, hit.item, asked) : explainCase(report, hit.item), ref: hit.item.id };
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]);
  }

  function mount() {
    const panel = document.getElementById("ask-panel");
    const opener = document.getElementById("ask-open");
    if (!panel || !opener) return null;
    const el = (id) => document.getElementById(id);
    const log = el("ask-log");
    const chips = el("ask-chips");
    const form = el("ask-form");
    const input = el("ask-input");
    const repo = el("ask-repo");
    const REPO_KEY = "qa-review-ask-repo";
    const allowed = new Map();
    let payload = null;
    try { repo.value = localStorage.getItem(REPO_KEY) || ""; } catch (error) { repo.value = ""; }

    function endpoint() {
      const host = location.hostname;
      if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
      return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
    }

    function reportUrl() {
      return location.origin + location.pathname + "?report=" + encodeURIComponent(payload.report.id);
    }

    function scroll() {
      log.scrollTop = log.scrollHeight;
    }

    function note(message, action) {
      const box = document.createElement("div");
      box.className = "ask-msg ask-system";
      box.innerHTML = "<p>" + esc(message) + "</p>" + (action ? '<div class="ask-actions"><button type="button" data-action="' + esc(action[0]) + '">' + esc(action[1]) + "</button></div>" : "");
      log.appendChild(box);
      scroll();
    }

    function mine(question) {
      const box = document.createElement("div");
      box.className = "ask-msg ask-me";
      box.textContent = question;
      log.appendChild(box);
      return box;
    }

    function reply(result) {
      const box = document.createElement("div");
      box.className = "ask-msg ask-bot";
      const copies = [];
      let html = "<strong>" + esc(result.title) + "</strong>";
      result.parts.forEach((part) => {
        if (part.kind === "code") {
          copies.push(part.text);
          html += '<div class="ask-code"><div class="ask-code-head"><span class="notranslate" translate="no">' + esc(part.label) + '</span><button type="button" data-copy="' + (copies.length - 1) + '">Copy</button></div><pre class="notranslate" translate="no"><code>' + esc(part.text) + "</code></pre></div>";
        } else if (part.kind === "list") {
          html += "<ul>" + part.items.map((item) => "<li>" + esc(item) + "</li>").join("") + "</ul>";
        } else {
          html += "<p>" + esc(part.text) + "</p>";
        }
      });
      const actions = [];
      if (result.issue) {
        copies.push(result.issue.body, result.issue.csv);
        actions.push('<button type="button" data-github>Open a GitHub issue</button>', '<button type="button" data-copy="' + (copies.length - 2) + '">Copy for Jira (Markdown)</button>', '<button type="button" data-copy="' + (copies.length - 1) + '">Copy Jira CSV row</button>');
      }
      (result.suggest || []).forEach((ask) => actions.push('<button type="button" data-ask="' + esc(ask) + '">' + esc(ask) + "</button>"));
      if (actions.length) html += '<div class="ask-actions">' + actions.join("") + "</div>";
      box.innerHTML = html;
      box.copies = copies;
      box.issue = result.issue || null;
      log.appendChild(box);
    }

    function ask(question) {
      if (!payload || allowed.get(payload.report.id) !== true) return;
      const asked = mine(question);
      const result = answer(payload.report, question, { repo: repo.value, reportUrl: reportUrl() });
      reply(result);
      log.scrollTop = asked.offsetTop - log.offsetTop - 4;
      if (root.SiteAnalytics) root.SiteAnalytics.trackEvent("qa_review_ask", "URL Review", result.intent);
    }

    function paintChips() {
      chips.innerHTML = suggestions(payload.report).map((item) => '<button type="button" data-ask="' + esc(item) + '">' + esc(item) + "</button>").join("");
    }

    function ready(on) {
      form.hidden = !on;
      chips.hidden = !on;
      el("ask-repo-row").hidden = !on;
    }

    async function unlock() {
      const id = payload.report.id;
      if (allowed.get(id) === true) return true;
      if (!root.ReviewAuth || !root.ReviewAuth.signedIn()) {
        note("Sign in with the account that ran this report to ask it.", ["sign-in", "Sign in"]);
        return false;
      }
      try {
        const res = await fetch(endpoint() + "/review/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign(root.ReviewAuth.proof(), { id }))
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          allowed.set(id, true);
          return true;
        }
        if (body.signIn && root.ReviewAuth.expire) root.ReviewAuth.expire(body.error);
        note(body.error || "Ask the report did not open. Try again in a moment.", body.signIn ? ["sign-in", "Sign in"] : null);
      } catch (error) {
        note("Ask the report did not open. Try again in a moment.");
      }
      return false;
    }

    function close() {
      panel.hidden = true;
      opener.setAttribute("aria-expanded", "false");
    }

    async function open() {
      if (!payload) return;
      panel.hidden = false;
      opener.setAttribute("aria-expanded", "true");
      if (allowed.get(payload.report.id) === true) {
        input.focus();
        return;
      }
      ready(false);
      log.innerHTML = "";
      panel.setAttribute("aria-busy", "true");
      const ok = await unlock();
      panel.removeAttribute("aria-busy");
      if (!ok || !payload) return;
      ready(true);
      paintChips();
      note("Ask about any finding or case by its id, or tap a question below. " + SCOPE);
      input.focus();
    }

    function show(next) {
      const ok = !!(next && next.paid === true && !next.sample && next.report && next.report.id && !next.report.preview);
      const same = ok && payload && payload.report.id === next.report.id;
      payload = ok ? next : null;
      opener.hidden = !ok;
      if (!ok || !same) {
        close();
        log.innerHTML = "";
        ready(false);
      }
    }

    opener.addEventListener("click", () => (panel.hidden ? open() : close()));
    el("ask-close").addEventListener("click", close);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) return;
      input.value = "";
      ask(question);
    });
    repo.addEventListener("change", () => {
      try { localStorage.setItem(REPO_KEY, repo.value.trim()); } catch (error) { /* kept for this page only */ }
    });
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !panel.contains(button)) return;
      const box = button.closest(".ask-msg");
      if (button.hasAttribute("data-ask")) ask(button.getAttribute("data-ask"));
      else if (button.hasAttribute("data-copy") && box) {
        const value = box.copies[Number(button.getAttribute("data-copy"))] || "";
        const done = () => { button.textContent = "Copied"; };
        if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, () => { button.textContent = "Copy failed"; });
      } else if (button.hasAttribute("data-github") && box && box.issue) {
        const link = githubIssueUrl(repo.value, box.issue);
        if (!link) {
          note("Type the GitHub repository as owner/name first, then press the button again.");
          repo.focus();
          return;
        }
        root.open(link, "_blank", "noopener");
      } else if (button.getAttribute("data-action") === "sign-in") {
        close();
        const closer = document.getElementById("dash-close");
        if (closer) closer.click();
        if (root.ReviewAuth) root.ReviewAuth.focus();
      }
    });
    if (root.ReviewAuth && root.ReviewAuth.onChange) root.ReviewAuth.onChange((on) => { if (!on) allowed.clear(); });
    return { show, close };
  }

  const api = { answer, suggestions, intentOf, idsIn, githubIssueUrl, issueFor: (report, id, options) => { const hit = lookup(report, id); return hit ? issueFor(report, hit, options || {}) : null; } };
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.QAReviewAsk = api;
    const panel = typeof document !== "undefined" ? mount() : null;
    api.show = panel ? panel.show : () => {};
    api.close = panel ? panel.close : () => {};
  }
})(typeof window !== "undefined" ? window : globalThis);
