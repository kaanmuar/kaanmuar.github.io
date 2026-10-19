/**
 * Turns the proposed cases of a URL review into automation scripts, one suite per framework.
 * Every script is a proposal built from a public read: review selectors and budgets before a run.
 */
(function (root) {
  "use strict";

  const ORDER = ["Playwright", "Cypress", "Robot", "Selenium", "WebdriverIO", "CodeceptJS", "Selenide", "TestNG", "Watir", "Cucumber", "Behave", "Reqnroll", "Jest", "Vitest", "Mocha", "Appium", "Maestro", "JMeter", "Gatling", "k6"];
  const LOAD_TOOLS = ["JMeter", "Gatling", "k6"];
  const MISSING_PATH = "/qa-lab-missing-page-404";
  const PHONE = { width: 390, height: 844 };
  const TABLET = { width: 820, height: 1180 };

  function oneLine(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function q(value) {
    return JSON.stringify(String(value == null ? "" : value));
  }

  function xml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function splitWhy(why) {
    const text = oneLine(why);
    const cut = text.indexOf(". ");
    if (cut === -1) return { step: text, expected: "The page still matches this proposed case." };
    return { step: text.slice(0, cut + 1), expected: text.slice(cut + 2) };
  }

  function context(report) {
    let start;
    try { start = new URL(report.finalUrl || ("https://" + report.host + "/")); } catch (error) { start = new URL("https://example.com/"); }
    const startPath = start.pathname + start.search;
    const pages = (report.pages || []).filter((page) => page && page.path && page.status >= 200 && page.status < 400);
    const paths = [];
    pages.forEach((page) => {
      const path = String(page.path).split("#")[0] || "/";
      if (paths.indexOf(path) === -1 && paths.length < 20) paths.push(path);
    });
    if (!paths.length) paths.push(startPath);
    const slow = pages.slice().sort((a, b) => (b.ms || 0) - (a.ms || 0))[0];
    const observed = report.observed || {};
    return {
      base: start.origin,
      host: start.host,
      startPath,
      paths,
      slowPath: slow ? String(slow.path).split("#")[0] : startPath,
      scripts: Number(observed.scripts) || 0,
      h1: Array.isArray(observed.h1) && observed.h1[0] ? oneLine(observed.h1[0]) : "",
      label: "QA-lab URL Review · " + (report.host || start.host)
    };
  }

  function count(path, selector, op, n) {
    return { kind: "count", path, selector, op, n };
  }

  function checkFor(item, ctx) {
    const at = ctx.startPath;
    switch (item.id) {
      case "FN-01": return { kind: "status", path: at };
      case "FN-02": return { kind: "title", path: at };
      case "FN-03": return count(at, "h1", "eq", 1);
      case "FN-04":
      case "I18N-01": return { kind: "attr", path: at, selector: "html", attr: "lang" };
      case "FN-06": return { kind: "statusAll", paths: ctx.paths };
      case "FN-07": return { kind: "titleAll", paths: ctx.paths };
      case "CT-01": return { kind: "metaLength", path: at, min: 50, max: 160 };
      case "CT-02": return count(at, 'link[rel="canonical"]', "eq", 1);
      case "CT-03": return count(at, 'meta[property="og:title"]', "gte", 1);
      case "CT-04": return count(at, 'script[type="application/ld+json"]', "gte", 1);
      case "A11Y-01": return count(at, "img:not([alt])", "eq", 0);
      case "A11Y-02": return count(at, 'main, [role="main"]', "gte", 1);
      case "A11Y-05": return count(at, "iframe:not([title])", "eq", 0);
      case "FM-01": return count(at, 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([id]):not([aria-label]):not([aria-labelledby])', "eq", 0);
      case "FM-04": return count(at, "form [required]", "gte", 1);
      case "PR-01": return count(at, 'a[href*="privacy" i]', "gte", 1);
      case "SEC-09": return count(at, 'script[src^="http:"], link[href^="http:"], img[src^="http:"], iframe[src^="http:"]', "eq", 0);
      case "VIS-01": return count(at, "img:not([width]):not([height])", "eq", 0);
      case "MED-01": return count(at, 'video track[kind="captions"], video track[kind="subtitles"]', "gte", 1);
      case "SEO-02": return count(at, 'link[rel="alternate"][hreflang]', "gte", 1);
      case "PF-02": return count(at, "script[src]", "lte", Math.max(ctx.scripts, 1));
      case "SEC-01": return { kind: "httpsRedirect" };
      case "SEC-02": return { kind: "headers", path: at, rules: [{ name: "strict-transport-security" }] };
      case "SEC-03": return { kind: "headers", path: at, rules: [{ name: "content-security-policy" }] };
      case "SEC-04": return { kind: "headers", path: at, rules: [{ name: "x-content-type-options", pattern: "nosniff" }, { name: "x-frame-options" }] };
      case "SEC-05": return { kind: "headers", path: at, rules: [{ name: "referrer-policy" }] };
      case "SEC-08": return { kind: "headers", path: at, rules: [{ name: "permissions-policy" }] };
      case "RS-03": return { kind: "headers", path: at, rules: [{ name: "cache-control" }] };
      case "SEC-07": return { kind: "headerNoDigits", path: at, name: "server" };
      case "RS-01": return { kind: "notFound" };
      case "SEO-03": return { kind: "robotsSitemap" };
      case "PF-01": return { kind: "budget", path: at, ms: 800, bytes: 1500000 };
      case "PF-03": return { kind: "budget", path: ctx.slowPath, ms: 800, bytes: 1500000 };
      case "MB-01":
      case "VIS-02": return { kind: "viewport", path: at, width: PHONE.width, height: PHONE.height };
      case "MB-02": return { kind: "viewport", path: at, width: TABLET.width, height: TABLET.height };
      case "LK-01": return { kind: "linksResolve", path: at, max: 20 };
      case "LD-01": return { kind: "load", path: at, profile: "baseline" };
      case "LD-02": return { kind: "load", path: at, profile: "ramp" };
      case "LD-03": return { kind: "load", path: at, profile: "spike" };
      default: return { kind: "manual" };
    }
  }

  const BROWSER_KINDS = ["status", "title", "count", "attr", "statusAll", "titleAll", "metaLength", "headers", "headerNoDigits", "httpsRedirect", "notFound", "robotsSitemap", "budget", "viewport", "linksResolve"];

  function supports(framework, check) {
    if (framework === "Appium" || framework === "Maestro") return check.kind === "viewport";
    if (LOAD_TOOLS.indexOf(framework) !== -1) return check.kind === "budget" || check.kind === "load";
    return BROWSER_KINDS.indexOf(check.kind) !== -1;
  }

  function name(item) {
    return item.id + " · " + oneLine(item.title);
  }

  function indent(lines, pad) {
    return lines.map((line) => (line ? pad + line : line)).join("\n");
  }

  const OPS_JS = { eq: "toBe", gte: "toBeGreaterThanOrEqual", lte: "toBeLessThanOrEqual" };
  const OPS_CHAI = { eq: "equal", gte: "be.at.least", lte: "be.at.most" };
  const OPS_PY = { eq: "==", gte: ">=", lte: "<=" };

  function playwright(item, check, parts) {
    const head = ["// " + parts.step, "// Expected: " + parts.expected];
    if (check.kind === "manual") {
      return "test.fixme(" + q(name(item)) + ", async () => {\n" + indent(head.concat(["// A person runs this case with access the owner provides."]), "  ") + "\n});";
    }
    const body = [];
    const go = (path) => body.push("await page.goto(BASE + " + q(path) + ");");
    switch (check.kind) {
      case "status":
        body.push("const res = await request.get(BASE + " + q(check.path) + ");", "expect(res.status()).toBeLessThan(400);");
        break;
      case "statusAll":
        body.push("for (const path of " + JSON.stringify(check.paths) + ") {", "  const res = await request.get(BASE + path);", "  expect.soft(res.status(), path).toBeLessThan(400);", "}");
        break;
      case "title":
        go(check.path); body.push("await expect(page).toHaveTitle(/\\S/);");
        break;
      case "titleAll":
        body.push("for (const path of " + JSON.stringify(check.paths) + ") {", "  await page.goto(BASE + path);", "  expect.soft((await page.title()).trim(), path).not.toBe(\"\");", "}");
        break;
      case "count":
        go(check.path); body.push("const found = await page.locator(" + q(check.selector) + ").count();", "expect(found)." + OPS_JS[check.op] + "(" + check.n + ");");
        break;
      case "attr":
        go(check.path); body.push("await expect(page.locator(" + q(check.selector) + ")).toHaveAttribute(" + q(check.attr) + ", /\\S/);");
        break;
      case "metaLength":
        go(check.path); body.push("const metas = page.locator('meta[name=\"description\"]');", "const description = (await metas.count()) ? (await metas.first().getAttribute(\"content\")) || \"\" : \"\";", "expect(description.length).toBeGreaterThanOrEqual(" + check.min + ");", "expect(description.length).toBeLessThanOrEqual(" + check.max + ");");
        break;
      case "headers":
        body.push("const res = await request.get(BASE + " + q(check.path) + ");", "const headers = res.headers();");
        check.rules.forEach((rule) => body.push(rule.pattern ? "expect(headers[" + q(rule.name) + "] || \"\").toMatch(/" + rule.pattern + "/i);" : "expect(headers[" + q(rule.name) + "]).toBeTruthy();"));
        break;
      case "headerNoDigits":
        body.push("const res = await request.get(BASE + " + q(check.path) + ");", "expect(res.headers()[" + q(check.name) + "] || \"\").not.toMatch(/\\d/);");
        break;
      case "httpsRedirect":
        body.push("const res = await request.get(\"http://\" + HOST + \"/\", { maxRedirects: 0 });", "expect([301, 302, 307, 308]).toContain(res.status());", "expect(res.headers().location || \"\").toMatch(/^https:\\/\\//);");
        break;
      case "notFound":
        body.push("const res = await request.get(BASE + " + q(MISSING_PATH) + ");", "expect([404, 410]).toContain(res.status());");
        break;
      case "robotsSitemap":
        body.push("const res = await request.get(BASE + \"/robots.txt\");", "expect(await res.text()).toMatch(/^sitemap:/im);");
        break;
      case "budget":
        body.push("const started = Date.now();", "const res = await request.get(BASE + " + q(check.path) + ");", "const body = await res.body();", "expect(res.status()).toBeLessThan(400);", "expect(Date.now() - started).toBeLessThan(" + check.ms + ");", "expect(body.length).toBeLessThan(" + check.bytes + ");");
        break;
      case "viewport":
        body.push("await page.setViewportSize({ width: " + check.width + ", height: " + check.height + " });"); go(check.path);
        body.push("const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);", "expect(overflow).toBeLessThanOrEqual(1);");
        break;
      case "linksResolve":
        go(check.path);
        body.push("const hrefs = await page.$$eval(\"a[href]\", (links) => links.map((link) => (link as HTMLAnchorElement).href.split(\"#\")[0]));", "const same = [...new Set(hrefs.filter((href) => href.startsWith(BASE)))].slice(0, " + check.max + ");", "for (const href of same) {", "  const res = await request.get(href);", "  expect.soft(res.status(), href).toBeLessThan(400);", "}");
        break;
      default:
        break;
    }
    return "test(" + q(name(item)) + ", async ({ page, request }) => {\n" + indent(head.concat(body), "  ") + "\n});";
  }

  function cypress(item, check, parts) {
    const head = ["// " + parts.step, "// Expected: " + parts.expected];
    if (check.kind === "manual") {
      return "it.skip(" + q(name(item)) + ", () => {\n" + indent(head.concat(["// A person runs this case with access the owner provides."]), "  ") + "\n});";
    }
    const body = [];
    const go = (path) => body.push("cy.visit(BASE + " + q(path) + ");");
    switch (check.kind) {
      case "status":
        body.push("cy.request({ url: BASE + " + q(check.path) + ", failOnStatusCode: false }).its(\"status\").should(\"be.lessThan\", 400);");
        break;
      case "statusAll":
        body.push(JSON.stringify(check.paths) + ".forEach((path) => {", "  cy.request({ url: BASE + path, failOnStatusCode: false }).its(\"status\").should(\"be.lessThan\", 400);", "});");
        break;
      case "title":
        go(check.path); body.push("cy.title().should(\"not.be.empty\");");
        break;
      case "titleAll":
        body.push(JSON.stringify(check.paths) + ".forEach((path) => {", "  cy.visit(BASE + path);", "  cy.title().should(\"not.be.empty\");", "});");
        break;
      case "count":
        go(check.path); body.push("cy.document().then((doc) => {", "  expect(doc.querySelectorAll(" + q(check.selector) + ").length).to." + OPS_CHAI[check.op] + "(" + check.n + ");", "});");
        break;
      case "attr":
        go(check.path); body.push("cy.get(" + q(check.selector) + ").should(\"have.attr\", " + q(check.attr) + ").and(\"match\", /\\S/);");
        break;
      case "metaLength":
        go(check.path); body.push("cy.document().then((doc) => {", "  const description = (doc.querySelector('meta[name=\"description\"]') || {}).content || \"\";", "  expect(description.length).to.be.within(" + check.min + ", " + check.max + ");", "});");
        break;
      case "headers":
        body.push("cy.request(BASE + " + q(check.path) + ").then((res) => {");
        check.rules.forEach((rule) => body.push(rule.pattern ? "  expect(String(res.headers[" + q(rule.name) + "] || \"\")).to.match(/" + rule.pattern + "/i);" : "  expect(res.headers).to.have.property(" + q(rule.name) + ");"));
        body.push("});");
        break;
      case "headerNoDigits":
        body.push("cy.request(BASE + " + q(check.path) + ").then((res) => {", "  expect(String(res.headers[" + q(check.name) + "] || \"\")).not.to.match(/\\d/);", "});");
        break;
      case "httpsRedirect":
        body.push("cy.request({ url: \"http://\" + HOST + \"/\", followRedirect: false, failOnStatusCode: false }).then((res) => {", "  expect([301, 302, 307, 308]).to.include(res.status);", "  expect(String(res.headers.location || \"\")).to.match(/^https:\\/\\//);", "});");
        break;
      case "notFound":
        body.push("cy.request({ url: BASE + " + q(MISSING_PATH) + ", failOnStatusCode: false }).its(\"status\").should(\"be.oneOf\", [404, 410]);");
        break;
      case "robotsSitemap":
        body.push("cy.request(BASE + \"/robots.txt\").its(\"body\").should(\"match\", /^sitemap:/im);");
        break;
      case "budget":
        body.push("cy.request(BASE + " + q(check.path) + ").then((res) => {", "  expect(res.status).to.be.lessThan(400);", "  expect(res.duration).to.be.lessThan(" + check.ms + ");", "  expect(String(res.body).length).to.be.lessThan(" + check.bytes + ");", "});");
        break;
      case "viewport":
        body.push("cy.viewport(" + check.width + ", " + check.height + ");"); go(check.path);
        body.push("cy.window().then((win) => {", "  expect(win.document.documentElement.scrollWidth - win.innerWidth).to.be.at.most(1);", "});");
        break;
      case "linksResolve":
        go(check.path);
        body.push("cy.document().then((doc) => {", "  const hrefs = [...doc.querySelectorAll(\"a[href]\")].map((link) => link.href.split(\"#\")[0]);", "  [...new Set(hrefs.filter((href) => href.startsWith(BASE)))].slice(0, " + check.max + ").forEach((href) => {", "    cy.request({ url: href, failOnStatusCode: false }).its(\"status\").should(\"be.lessThan\", 400);", "  });", "});");
        break;
      default:
        break;
    }
    return "it(" + q(name(item)) + ", () => {\n" + indent(head.concat(body), "  ") + "\n});";
  }

  function pyName(item) {
    return "test_" + item.id.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }

  function selenium(item, check, parts) {
    const doc = "    \"\"\"" + name(item).replace(/"""/g, "'''").replace(/\\/g, "/") + "\n\n    " + parts.step.replace(/"""/g, "'''").replace(/\\/g, "/") + "\n    Expected: " + parts.expected.replace(/"""/g, "'''").replace(/\\/g, "/") + "\n    \"\"\"";
    if (check.kind === "manual") {
      return "@pytest.mark.skip(reason=\"A person runs this case with access the owner provides.\")\ndef " + pyName(item) + "():\n" + doc + "\n";
    }
    const browser = ["title", "titleAll", "count", "attr", "metaLength", "viewport", "linksResolve"].indexOf(check.kind) !== -1;
    const body = [];
    const go = (path) => body.push("driver.get(BASE + " + q(path) + ")");
    switch (check.kind) {
      case "status":
        body.push("res = requests.get(BASE + " + q(check.path) + ", timeout=30)", "assert res.status_code < 400");
        break;
      case "statusAll":
        body.push("for path in " + JSON.stringify(check.paths) + ":", "    assert requests.get(BASE + path, timeout=30).status_code < 400, path");
        break;
      case "title":
        go(check.path); body.push("assert driver.title.strip()");
        break;
      case "titleAll":
        body.push("for path in " + JSON.stringify(check.paths) + ":", "    driver.get(BASE + path)", "    assert driver.title.strip(), path");
        break;
      case "count":
        go(check.path); body.push("found = len(driver.find_elements(By.CSS_SELECTOR, " + q(check.selector) + "))", "assert found " + OPS_PY[check.op] + " " + check.n);
        break;
      case "attr":
        go(check.path); body.push("assert (driver.find_element(By.CSS_SELECTOR, " + q(check.selector) + ").get_attribute(" + q(check.attr) + ") or \"\").strip()");
        break;
      case "metaLength":
        go(check.path); body.push("metas = driver.find_elements(By.CSS_SELECTOR, 'meta[name=\"description\"]')", "description = (metas[0].get_attribute(\"content\") if metas else \"\") or \"\"", "assert " + check.min + " <= len(description) <= " + check.max);
        break;
      case "headers":
        body.push("res = requests.get(BASE + " + q(check.path) + ", timeout=30)");
        check.rules.forEach((rule) => body.push(rule.pattern ? "assert re.search(r\"" + rule.pattern + "\", res.headers.get(" + q(rule.name) + ", \"\"), re.I)" : "assert res.headers.get(" + q(rule.name) + ")"));
        break;
      case "headerNoDigits":
        body.push("res = requests.get(BASE + " + q(check.path) + ", timeout=30)", "assert not re.search(r\"\\d\", res.headers.get(" + q(check.name) + ", \"\"))");
        break;
      case "httpsRedirect":
        body.push("res = requests.get(\"http://\" + HOST + \"/\", allow_redirects=False, timeout=30)", "assert res.status_code in (301, 302, 307, 308)", "assert res.headers.get(\"location\", \"\").startswith(\"https://\")");
        break;
      case "notFound":
        body.push("assert requests.get(BASE + " + q(MISSING_PATH) + ", timeout=30).status_code in (404, 410)");
        break;
      case "robotsSitemap":
        body.push("text = requests.get(BASE + \"/robots.txt\", timeout=30).text", "assert re.search(r\"^sitemap:\", text, re.I | re.M)");
        break;
      case "budget":
        body.push("started = time.perf_counter()", "res = requests.get(BASE + " + q(check.path) + ", timeout=30)", "elapsed_ms = (time.perf_counter() - started) * 1000", "assert res.status_code < 400", "assert elapsed_ms < " + check.ms, "assert len(res.content) < " + check.bytes);
        break;
      case "viewport":
        body.push("driver.set_window_size(" + check.width + ", " + check.height + ")"); go(check.path);
        body.push("overflow = driver.execute_script(\"return document.documentElement.scrollWidth - window.innerWidth\")", "assert overflow <= 1");
        break;
      case "linksResolve":
        go(check.path);
        body.push("hrefs = sorted({(a.get_attribute(\"href\") or \"\").split(\"#\")[0] for a in driver.find_elements(By.CSS_SELECTOR, \"a[href]\")})", "for href in [h for h in hrefs if h.startswith(BASE)][:" + check.max + "]:", "    assert requests.get(href, timeout=30).status_code < 400, href");
        break;
      default:
        break;
    }
    return "def " + pyName(item) + "(" + (browser ? "driver" : "") + "):\n" + doc + "\n" + indent(body, "    ") + "\n";
  }

  function robotText(value) {
    return oneLine(value).replace(/\\/g, "/").replace(/\$\{/g, "\\${").replace(/@\{/g, "\\@{").replace(/&\{/g, "\\&{");
  }

  function robot(item, check, parts) {
    const lines = [robotText(name(item)), "    [Documentation]    " + robotText(parts.step) + " Expected: " + robotText(parts.expected)];
    if (check.kind === "manual") {
      lines.push("    [Tags]    manual", "    Skip    A person runs this case with access the owner provides.");
      return lines.join("\n");
    }
    const open = (path) => lines.push("    Open Browser    ${BASE}" + path + "    ${BROWSER}");
    const close = () => lines.push("    [Teardown]    Close Browser");
    const opRobot = { eq: "==", gte: ">=", lte: "<=" };
    switch (check.kind) {
      case "status":
        lines.push("    ${resp}=    GET    ${BASE}" + check.path + "    expected_status=any", "    Should Be True    ${resp.status_code} < 400");
        break;
      case "statusAll":
        lines.push("    FOR    ${path}    IN    " + check.paths.join("    "), "        ${resp}=    GET    ${BASE}${path}    expected_status=any", "        Should Be True    ${resp.status_code} < 400    ${path}", "    END");
        break;
      case "title":
        open(check.path); lines.push("    ${title}=    Get Title", "    Should Not Be Empty    ${title}"); close();
        break;
      case "titleAll":
        open(check.paths[0]); lines.push("    FOR    ${path}    IN    " + check.paths.join("    "), "        Go To    ${BASE}${path}", "        ${title}=    Get Title", "        Should Not Be Empty    ${title}    ${path}", "    END"); close();
        break;
      case "count":
        open(check.path); lines.push("    ${found}=    Get Element Count    css:" + check.selector, "    Should Be True    ${found} " + opRobot[check.op] + " " + check.n); close();
        break;
      case "attr":
        open(check.path); lines.push("    ${value}=    Get Element Attribute    css:" + check.selector + "    " + check.attr, "    Should Not Be Empty    ${value}"); close();
        break;
      case "metaLength":
        open(check.path); lines.push("    ${description}=    Execute Javascript    return (document.querySelector('meta[name=\"description\"]') || {}).content || ''", "    ${length}=    Get Length    ${description}", "    Should Be True    " + check.min + " <= ${length} <= " + check.max); close();
        break;
      case "headers":
        lines.push("    ${resp}=    GET    ${BASE}" + check.path);
        check.rules.forEach((rule) => lines.push(rule.pattern ? "    Should Match Regexp    ${resp.headers}[" + rule.name + "]    (?i)" + rule.pattern : "    Dictionary Should Contain Key    ${resp.headers}    " + rule.name));
        break;
      case "headerNoDigits":
        lines.push("    ${resp}=    GET    ${BASE}" + check.path, "    ${value}=    Evaluate    $resp.headers.get('" + check.name + "', '')", "    Should Not Match Regexp    ${value}    \\\\d");
        break;
      case "httpsRedirect":
        lines.push("    ${resp}=    GET    http://${HOST}/    allow_redirects=${False}    expected_status=any", "    Should Be True    ${resp.status_code} in (301, 302, 307, 308)", "    Should Start With    ${resp.headers}[location]    https://");
        break;
      case "notFound":
        lines.push("    ${resp}=    GET    ${BASE}" + MISSING_PATH + "    expected_status=any", "    Should Be True    ${resp.status_code} in (404, 410)");
        break;
      case "robotsSitemap":
        lines.push("    ${resp}=    GET    ${BASE}/robots.txt", "    Should Match Regexp    ${resp.text}    (?im)^sitemap:");
        break;
      case "budget":
        lines.push("    ${resp}=    GET    ${BASE}" + check.path, "    Should Be True    ${resp.status_code} < 400", "    Should Be True    ${resp.elapsed.total_seconds()} < " + (check.ms / 1000), "    ${size}=    Get Length    ${resp.content}", "    Should Be True    ${size} < " + check.bytes);
        break;
      case "viewport":
        open(check.path); lines.push("    Set Window Size    " + check.width + "    " + check.height, "    Reload Page", "    ${overflow}=    Execute Javascript    return document.documentElement.scrollWidth - window.innerWidth", "    Should Be True    ${overflow} <= 1"); close();
        break;
      case "linksResolve":
        open(check.path); lines.push("    ${hrefs}=    Execute Javascript    return [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href.split('#')[0]).filter(h => h.startsWith('${BASE}')))].slice(0, " + check.max + ")", "    FOR    ${href}    IN    @{hrefs}", "        ${resp}=    GET    ${href}    expected_status=any", "        Should Be True    ${resp.status_code} < 400    ${href}", "    END"); close();
        break;
      default:
        break;
    }
    return lines.join("\n");
  }

  function webdriverio(item, check, parts) {
    const head = ["// " + parts.step, "// Expected: " + parts.expected];
    if (check.kind === "manual") {
      return "it.skip(" + q(name(item)) + ", async () => {\n" + indent(head.concat(["// A person runs this case with access the owner provides."]), "  ") + "\n});";
    }
    const body = [];
    const go = (path) => body.push("await browser.url(BASE + " + q(path) + ");");
    switch (check.kind) {
      case "status":
        body.push("const res = await fetch(BASE + " + q(check.path) + ");", "expect(res.status).toBeLessThan(400);");
        break;
      case "statusAll":
        body.push("for (const path of " + JSON.stringify(check.paths) + ") {", "  const res = await fetch(BASE + path);", "  expect(res.status).toBeLessThan(400);", "}");
        break;
      case "title":
        go(check.path); body.push("expect((await browser.getTitle()).trim()).not.toBe(\"\");");
        break;
      case "titleAll":
        body.push("for (const path of " + JSON.stringify(check.paths) + ") {", "  await browser.url(BASE + path);", "  expect((await browser.getTitle()).trim()).not.toBe(\"\");", "}");
        break;
      case "count":
        go(check.path); body.push("const found = await browser.execute((selector) => document.querySelectorAll(selector).length, " + q(check.selector) + ");", "expect(found)." + OPS_JS[check.op] + "(" + check.n + ");");
        break;
      case "attr":
        go(check.path); body.push("const value = await $(" + q(check.selector) + ").getAttribute(" + q(check.attr) + ");", "expect((value || \"\").trim()).not.toBe(\"\");");
        break;
      case "metaLength":
        go(check.path); body.push("const description = await browser.execute(() => (document.querySelector('meta[name=\"description\"]') || {}).content || \"\");", "expect(description.length).toBeGreaterThanOrEqual(" + check.min + ");", "expect(description.length).toBeLessThanOrEqual(" + check.max + ");");
        break;
      case "headers":
        body.push("const res = await fetch(BASE + " + q(check.path) + ");");
        check.rules.forEach((rule) => body.push(rule.pattern ? "expect(res.headers.get(" + q(rule.name) + ") || \"\").toMatch(/" + rule.pattern + "/i);" : "expect(res.headers.get(" + q(rule.name) + ")).toBeTruthy();"));
        break;
      case "headerNoDigits":
        body.push("const res = await fetch(BASE + " + q(check.path) + ");", "expect(res.headers.get(" + q(check.name) + ") || \"\").not.toMatch(/\\d/);");
        break;
      case "httpsRedirect":
        body.push("const res = await fetch(\"http://\" + HOST + \"/\", { redirect: \"manual\" });", "expect([301, 302, 307, 308]).toContain(res.status);", "expect(res.headers.get(\"location\") || \"\").toMatch(/^https:\\/\\//);");
        break;
      case "notFound":
        body.push("const res = await fetch(BASE + " + q(MISSING_PATH) + ");", "expect([404, 410]).toContain(res.status);");
        break;
      case "robotsSitemap":
        body.push("const res = await fetch(BASE + \"/robots.txt\");", "expect(await res.text()).toMatch(/^sitemap:/im);");
        break;
      case "budget":
        body.push("const started = Date.now();", "const res = await fetch(BASE + " + q(check.path) + ");", "const body = await res.arrayBuffer();", "expect(res.status).toBeLessThan(400);", "expect(Date.now() - started).toBeLessThan(" + check.ms + ");", "expect(body.byteLength).toBeLessThan(" + check.bytes + ");");
        break;
      case "viewport":
        body.push("await browser.setWindowSize(" + check.width + ", " + check.height + ");"); go(check.path);
        body.push("const overflow = await browser.execute(() => document.documentElement.scrollWidth - window.innerWidth);", "expect(overflow).toBeLessThanOrEqual(1);");
        break;
      case "linksResolve":
        go(check.path);
        body.push("const hrefs = await browser.execute((base, max) => [...new Set([...document.querySelectorAll(\"a[href]\")].map((link) => link.href.split(\"#\")[0]).filter((href) => href.startsWith(base)))].slice(0, max), BASE, " + check.max + ");", "for (const href of hrefs) {", "  const res = await fetch(href);", "  expect(res.status).toBeLessThan(400);", "}");
        break;
      default:
        break;
    }
    return "it(" + q(name(item)) + ", async () => {\n" + indent(head.concat(body), "  ") + "\n});";
  }

  function appium(item, check, parts) {
    const head = ["// " + parts.step, "// Expected: " + parts.expected];
    if (check.kind !== "viewport") {
      return "it.skip(" + q(name(item)) + ", async () => {\n" + indent(head.concat(["// This case belongs to a browser suite or to a person, not to a device run."]), "  ") + "\n});";
    }
    const device = check.width >= TABLET.width ? "a tablet emulator or device" : "a phone emulator or device";
    const body = [
      "// Run on " + device + " (about " + check.width + " x " + check.height + " CSS pixels).",
      "await browser.url(BASE + " + q(check.path) + ");",
      "const overflow = await browser.execute(() => document.documentElement.scrollWidth - window.innerWidth);",
      "expect(overflow).toBeLessThanOrEqual(1);",
      "const heading = await $(\"h1\");",
      "if (await heading.isExisting()) await expect(heading).toBeDisplayed();"
    ];
    return "it(" + q(name(item)) + ", async () => {\n" + indent(head.concat(body), "  ") + "\n});";
  }

  const PERSON = "A person runs this case with access the owner provides.";
  const META_JS = "() => (document.querySelector('meta[name=\"description\"]') || {}).content || \"\"";
  const OVERFLOW_JS = "() => document.documentElement.scrollWidth - window.innerWidth";
  const LINKS_JS = "({ base, max }) => [...new Set([...document.querySelectorAll(\"a[href]\")].map((link) => link.href.split(\"#\")[0]).filter((href) => href.startsWith(base)))].slice(0, max)";
  const META_SCRIPT = "return (document.querySelector('meta[name=\"description\"]') || {}).content || '';";
  const OVERFLOW_SCRIPT = "return document.documentElement.scrollWidth - window.innerWidth;";

  function linksScript(max) {
    return "return [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('#')[0]).filter((h) => h.startsWith(arguments[0])))].slice(0, " + max + ");";
  }

  const EXPECT = {
    lt: (a, b) => "expect(" + a + ").toBeLessThan(" + b + ");",
    eq: (a, b) => "expect(" + a + ").toBe(" + b + ");",
    gte: (a, b) => "expect(" + a + ").toBeGreaterThanOrEqual(" + b + ");",
    lte: (a, b) => "expect(" + a + ").toBeLessThanOrEqual(" + b + ");",
    match: (a, re) => "expect(" + a + ").toMatch(" + re + ");",
    noMatch: (a, re) => "expect(" + a + ").not.toMatch(" + re + ");",
    oneOf: (list, a) => "expect(" + list + ").toContain(" + a + ");",
    truthy: (a) => "expect(" + a + ").toBeTruthy();",
    filled: (a) => "expect(" + a + ").not.toBe(\"\");"
  };

  const ASSERT = {
    lt: (a, b, why) => "assert.ok(" + a + " < " + b + (why ? ", " + why : "") + ");",
    eq: (a, b, why) => "assert.equal(" + a + ", " + b + (why ? ", " + why : "") + ");",
    gte: (a, b, why) => "assert.ok(" + a + " >= " + b + (why ? ", " + why : "") + ");",
    lte: (a, b, why) => "assert.ok(" + a + " <= " + b + (why ? ", " + why : "") + ");",
    match: (a, re) => "assert.match(" + a + ", " + re + ");",
    noMatch: (a, re) => "assert.doesNotMatch(" + a + ", " + re + ");",
    oneOf: (list, a) => "assert.ok(" + list + ".includes(" + a + "), String(" + a + "));",
    truthy: (a, why) => "assert.ok(" + a + (why ? ", " + why : "") + ");",
    filled: (a, why) => "assert.notEqual(" + a + ", \"\"" + (why ? ", " + why : "") + ");"
  };

  const PAGE_DOM = {
    go: (url) => "await page.goto(BASE + " + url + ");",
    count: (selector) => "await page.locator(" + q(selector) + ").count()",
    title: "(await page.title()).trim()",
    attr: (selector, attr) => "((await page.locator(" + q(selector) + ").first().getAttribute(" + q(attr) + ")) || \"\").trim()",
    run: (fn, arg) => "await page.evaluate(" + fn + (arg ? ", " + arg : "") + ")",
    size: (width, height) => "await page.setViewportSize({ width: " + width + ", height: " + height + " });"
  };

  const CODECEPT_DOM = {
    go: (url) => "await I.amOnPage(BASE + " + url + ");",
    count: (selector) => "await I.executeScript((selector) => document.querySelectorAll(selector).length, " + q(selector) + ")",
    title: "(await I.grabTitle()).trim()",
    attr: (selector, attr) => "((await I.grabAttributeFrom(" + q(selector) + ", " + q(attr) + ")) || \"\").trim()",
    run: (fn, arg) => "await I.executeScript(" + fn + (arg ? ", " + arg : "") + ")",
    size: (width, height) => "await I.resizeWindow(" + width + ", " + height + ");"
  };

  function jsBody(check, A, D) {
    const body = [];
    const go = (path) => body.push(D.go(q(path)));
    switch (check.kind) {
      case "status":
        body.push("const res = await fetch(BASE + " + q(check.path) + ");", A.lt("res.status", 400));
        break;
      case "statusAll":
        body.push("for (const path of " + JSON.stringify(check.paths) + ") {", "  const res = await fetch(BASE + path);", "  " + A.lt("res.status", 400, "path"), "}");
        break;
      case "title":
        go(check.path); body.push("const title = " + D.title + ";", A.filled("title"));
        break;
      case "titleAll":
        body.push("for (const path of " + JSON.stringify(check.paths) + ") {", "  " + D.go("path"), "  " + A.filled(D.title, "path"), "}");
        break;
      case "count":
        go(check.path); body.push("const found = " + D.count(check.selector) + ";", A[check.op]("found", check.n));
        break;
      case "attr":
        go(check.path); body.push("const value = " + D.attr(check.selector, check.attr) + ";", A.filled("value"));
        break;
      case "metaLength":
        go(check.path); body.push("const description = " + D.run(META_JS) + ";", A.gte("description.length", check.min), A.lte("description.length", check.max));
        break;
      case "headers":
        body.push("const res = await fetch(BASE + " + q(check.path) + ");");
        check.rules.forEach((rule) => body.push(rule.pattern ? A.match("res.headers.get(" + q(rule.name) + ") || \"\"", "/" + rule.pattern + "/i") : A.truthy("res.headers.get(" + q(rule.name) + ")", q(rule.name))));
        break;
      case "headerNoDigits":
        body.push("const res = await fetch(BASE + " + q(check.path) + ");", A.noMatch("res.headers.get(" + q(check.name) + ") || \"\"", "/\\d/"));
        break;
      case "httpsRedirect":
        body.push("const res = await fetch(\"http://\" + HOST + \"/\", { redirect: \"manual\" });", A.oneOf("[301, 302, 307, 308]", "res.status"), A.match("res.headers.get(\"location\") || \"\"", "/^https:\\/\\//"));
        break;
      case "notFound":
        body.push("const res = await fetch(BASE + " + q(MISSING_PATH) + ");", A.oneOf("[404, 410]", "res.status"));
        break;
      case "robotsSitemap":
        body.push("const res = await fetch(BASE + \"/robots.txt\");", A.match("await res.text()", "/^sitemap:/im"));
        break;
      case "budget":
        body.push("const started = Date.now();", "const res = await fetch(BASE + " + q(check.path) + ");", "const body = await res.arrayBuffer();", A.lt("res.status", 400), A.lt("Date.now() - started", check.ms), A.lt("body.byteLength", check.bytes));
        break;
      case "viewport":
        body.push(D.size(check.width, check.height)); go(check.path);
        body.push("const overflow = " + D.run(OVERFLOW_JS) + ";", A.lte("overflow", 1));
        break;
      case "linksResolve":
        go(check.path);
        body.push("const hrefs = " + D.run(LINKS_JS, "{ base: BASE, max: " + check.max + " }") + ";", "for (const href of hrefs) {", "  const res = await fetch(href);", "  " + A.lt("res.status", 400, "href"), "}");
        break;
      default:
        break;
    }
    return body;
  }

  const RUNNERS = {
    Jest: { test: "test", skip: "test.skip", args: "", A: EXPECT, D: PAGE_DOM },
    Vitest: { test: "test", skip: "test.skip", args: "", A: EXPECT, D: PAGE_DOM },
    Mocha: { test: "it", skip: "it.skip", args: "", A: ASSERT, D: PAGE_DOM },
    CodeceptJS: { test: "Scenario", skip: "xScenario", args: "{ I }", A: ASSERT, D: CODECEPT_DOM }
  };

  function jsRunner(framework, item, check, parts) {
    const runner = RUNNERS[framework];
    const head = ["// " + parts.step, "// Expected: " + parts.expected];
    if (check.kind === "manual") {
      return runner.skip + "(" + q(name(item)) + ", () => {\n" + indent(head.concat(["// " + PERSON]), "  ") + "\n});";
    }
    return runner.test + "(" + q(name(item)) + ", async (" + runner.args + ") => {\n" + indent(head.concat(jsBody(check, runner.A, runner.D)), "  ") + "\n});";
  }

  const SELENIDE_DOM = {
    go: (url) => "open(BASE + " + url + ");",
    count: (selector) => "$$(" + q(selector) + ").size()",
    title: "Objects.toString(title(), \"\").trim()",
    attr: (selector, attr) => "Objects.toString($(" + q(selector) + ").getAttribute(" + q(attr) + "), \"\").trim()",
    run: (script, arg) => "executeJavaScript(" + q(script) + (arg ? ", " + arg : "") + ")",
    size: (width, height) => "WebDriverRunner.getWebDriver().manage().window().setSize(new Dimension(" + width + ", " + height + "));",
    reload: "refresh();"
  };

  const WEBDRIVER_DOM = {
    go: (url) => "driver.get(BASE + " + url + ");",
    count: (selector) => "driver.findElements(By.cssSelector(" + q(selector) + ")).size()",
    title: "Objects.toString(driver.getTitle(), \"\").trim()",
    attr: (selector, attr) => "Objects.toString(driver.findElement(By.cssSelector(" + q(selector) + ")).getAttribute(" + q(attr) + "), \"\").trim()",
    run: (script, arg) => "((JavascriptExecutor) driver).executeScript(" + q(script) + (arg ? ", " + arg : "") + ")",
    size: (width, height) => "driver.manage().window().setSize(new Dimension(" + width + ", " + height + "));",
    reload: "driver.navigate().refresh();"
  };

  function javaBody(check, D) {
    const body = [];
    const go = (path) => body.push(D.go(q(path)));
    const ok = (condition, why) => "assertTrue(" + condition + ", " + why + ");";
    const header = (rule) => "res.headers().firstValue(" + q(rule) + ").orElse(\"\")";
    switch (check.kind) {
      case "status":
        body.push("HttpResponse<byte[]> res = get(BASE + " + q(check.path) + ");", ok("res.statusCode() < 400", "\"status \" + res.statusCode()"));
        break;
      case "statusAll":
        body.push("for (String path : List.of(" + check.paths.map(q).join(", ") + ")) {", "  " + ok("get(BASE + path).statusCode() < 400", "path"), "}");
        break;
      case "title":
        go(check.path); body.push(ok("!" + D.title + ".isEmpty()", "\"title\""));
        break;
      case "titleAll":
        body.push("for (String path : List.of(" + check.paths.map(q).join(", ") + ")) {", "  " + D.go("path"), "  " + ok("!" + D.title + ".isEmpty()", "path"), "}");
        break;
      case "count":
        go(check.path); body.push("int found = " + D.count(check.selector) + ";", ok("found " + OPS_PY[check.op] + " " + check.n, "\"found \" + found"));
        break;
      case "attr":
        go(check.path); body.push(ok("!" + D.attr(check.selector, check.attr) + ".isEmpty()", q(check.selector + " " + check.attr)));
        break;
      case "metaLength":
        go(check.path);
        body.push("String description = Objects.toString(" + D.run(META_SCRIPT) + ", \"\");", ok("description.length() >= " + check.min + " && description.length() <= " + check.max, "\"length \" + description.length()"));
        break;
      case "headers":
        body.push("HttpResponse<byte[]> res = get(BASE + " + q(check.path) + ");");
        check.rules.forEach((rule) => body.push(rule.pattern
          ? ok("Pattern.compile(" + q(rule.pattern) + ", Pattern.CASE_INSENSITIVE).matcher(" + header(rule.name) + ").find()", q(rule.name))
          : ok("res.headers().firstValue(" + q(rule.name) + ").isPresent()", q(rule.name))));
        break;
      case "headerNoDigits":
        body.push("HttpResponse<byte[]> res = get(BASE + " + q(check.path) + ");", ok("!Pattern.compile(\"\\\\d\").matcher(" + header(check.name) + ").find()", q(check.name)));
        break;
      case "httpsRedirect":
        body.push("HttpResponse<byte[]> res = RAW.send(request(\"http://\" + HOST + \"/\"), HttpResponse.BodyHandlers.ofByteArray());", ok("List.of(301, 302, 307, 308).contains(res.statusCode())", "\"status \" + res.statusCode()"), ok(header("location") + ".startsWith(\"https://\")", "\"location\""));
        break;
      case "notFound":
        body.push("int status = get(BASE + " + q(MISSING_PATH) + ").statusCode();", ok("status == 404 || status == 410", "\"status \" + status"));
        break;
      case "robotsSitemap":
        body.push("String robots = new String(get(BASE + \"/robots.txt\").body(), StandardCharsets.UTF_8);", ok("Pattern.compile(\"^sitemap:\", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE).matcher(robots).find()", "\"sitemap\""));
        break;
      case "budget":
        body.push("long started = System.nanoTime();", "HttpResponse<byte[]> res = get(BASE + " + q(check.path) + ");", "long elapsedMs = (System.nanoTime() - started) / 1_000_000;", ok("res.statusCode() < 400", "\"status \" + res.statusCode()"), ok("elapsedMs < " + check.ms, "elapsedMs + \" ms\""), ok("res.body().length < " + check.bytes, "res.body().length + \" bytes\""));
        break;
      case "viewport":
        go(check.path); body.push(D.size(check.width, check.height), D.reload);
        body.push("long overflow = ((Number) " + D.run(OVERFLOW_SCRIPT) + ").longValue();", ok("overflow <= 1", "overflow + \" px\""));
        break;
      case "linksResolve":
        go(check.path);
        body.push("List<?> hrefs = (List<?>) " + D.run(linksScript(check.max), "BASE") + ";", "for (Object href : hrefs) {", "  " + ok("get(String.valueOf(href)).statusCode() < 400", "String.valueOf(href)"), "}");
        break;
      default:
        break;
    }
    return body;
  }

  function javaMethod(item) {
    return item.id.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function javaComments(parts) {
    return ["// " + javaDoc(parts.step), "// Expected: " + javaDoc(parts.expected)];
  }

  function selenide(item, check, parts) {
    const head = javaComments(parts);
    if (check.kind === "manual") {
      return ["@Test", "@Disabled(" + q(PERSON) + ")", "@DisplayName(" + q(name(item)) + ")", "void " + javaMethod(item) + "() {", indent(head, "  "), "}"].join("\n");
    }
    return ["@Test", "@DisplayName(" + q(name(item)) + ")", "void " + javaMethod(item) + "() throws Exception {", indent(head.concat(javaBody(check, SELENIDE_DOM)), "  "), "}"].join("\n");
  }

  function testng(item, check, parts) {
    const head = javaComments(parts);
    if (check.kind === "manual") {
      return ["@Test(enabled = false, description = " + q(name(item)) + ")", "public void " + javaMethod(item) + "() {", indent(head.concat(["// " + PERSON]), "  "), "}"].join("\n");
    }
    return ["@Test(description = " + q(name(item)) + ")", "public void " + javaMethod(item) + "() throws Exception {", indent(head.concat(javaBody(check, WEBDRIVER_DOM)), "  "), "}"].join("\n");
  }

  function rb(value) {
    return q(value).replace(/#/g, "\\#");
  }

  function watir(item, check, parts) {
    const head = ["# " + parts.step, "# Expected: " + parts.expected];
    if (check.kind === "manual") {
      return "it " + rb(name(item)) + ", skip: " + rb(PERSON) + " do\n" + indent(head, "  ") + "\nend";
    }
    const body = [];
    const go = (url) => body.push("@browser.goto(BASE + " + url + ")");
    const opRuby = { eq: "eq(", gte: "be >= ", lte: "be <= " };
    switch (check.kind) {
      case "status":
        body.push("expect(http_get(BASE + " + rb(check.path) + ").code.to_i).to be < 400");
        break;
      case "statusAll":
        body.push("[" + check.paths.map(rb).join(", ") + "].each do |path|", "  expect(http_get(BASE + path).code.to_i).to be < 400", "end");
        break;
      case "title":
        go(rb(check.path)); body.push("expect(@browser.title.strip).not_to be_empty");
        break;
      case "titleAll":
        body.push("[" + check.paths.map(rb).join(", ") + "].each do |path|", "  @browser.goto(BASE + path)", "  expect(@browser.title.strip).not_to be_empty", "end");
        break;
      case "count":
        go(rb(check.path)); body.push("found = @browser.elements(css: " + rb(check.selector) + ").count", "expect(found).to " + opRuby[check.op] + check.n + (check.op === "eq" ? ")" : ""));
        break;
      case "attr":
        go(rb(check.path)); body.push("expect(@browser.element(css: " + rb(check.selector) + ").attribute_value(" + rb(check.attr) + ").to_s.strip).not_to be_empty");
        break;
      case "metaLength":
        go(rb(check.path)); body.push("description = @browser.execute_script(" + rb(META_SCRIPT) + ").to_s", "expect(description.length).to be_between(" + check.min + ", " + check.max + ")");
        break;
      case "headers":
        body.push("res = http_get(BASE + " + rb(check.path) + ")");
        check.rules.forEach((rule) => body.push(rule.pattern ? "expect(res[" + rb(rule.name) + "].to_s).to match(/" + rule.pattern + "/i)" : "expect(res[" + rb(rule.name) + "]).not_to be_nil"));
        break;
      case "headerNoDigits":
        body.push("res = http_get(BASE + " + rb(check.path) + ")", "expect(res[" + rb(check.name) + "].to_s).not_to match(/\\d/)");
        break;
      case "httpsRedirect":
        body.push("res = http_get_raw(\"http://\" + HOST + \"/\")", "expect([301, 302, 307, 308]).to include(res.code.to_i)", "expect(res[\"location\"].to_s).to start_with(\"https://\")");
        break;
      case "notFound":
        body.push("expect([404, 410]).to include(http_get(BASE + " + rb(MISSING_PATH) + ").code.to_i)");
        break;
      case "robotsSitemap":
        body.push("expect(http_get(BASE + \"/robots.txt\").body.to_s).to match(/^sitemap:/i)");
        break;
      case "budget":
        body.push("started = Process.clock_gettime(Process::CLOCK_MONOTONIC)", "res = http_get(BASE + " + rb(check.path) + ")", "elapsed_ms = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000", "expect(res.code.to_i).to be < 400", "expect(elapsed_ms).to be < " + check.ms, "expect(res.body.to_s.bytesize).to be < " + check.bytes);
        break;
      case "viewport":
        body.push("@browser.window.resize_to(" + check.width + ", " + check.height + ")"); go(rb(check.path));
        body.push("overflow = @browser.execute_script(" + rb(OVERFLOW_SCRIPT) + ")", "expect(overflow).to be <= 1");
        break;
      case "linksResolve":
        go(rb(check.path));
        body.push("hrefs = @browser.execute_script(" + rb(linksScript(check.max)) + ", BASE)", "hrefs.each do |href|", "  expect(http_get(href).code.to_i).to be < 400", "end");
        break;
      default:
        break;
    }
    return "it " + rb(name(item)) + " do\n" + indent(head.concat(body), "  ") + "\nend";
  }

  const OPS_WORD = { eq: "exactly", gte: "at least", lte: "at most" };
  const GHERKIN_FW = ["Cucumber", "Behave", "Reqnroll"];

  function gq(value) {
    return "\"" + oneLine(value).replace(/"/g, "'") + "\"";
  }

  function gCell(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  }

  function scenario(item, tags, steps, notes) {
    let last = "";
    const lines = steps.map((step) => {
      if (step.charAt(0) === "|") return "    " + step;
      const word = step.split(" ")[0];
      const text = word === last ? "And" + step.slice(word.length) : step;
      last = word;
      return "  " + text;
    });
    return notes.map((note) => "# " + note).concat([["@" + item.id].concat(tags).join(" "), "Scenario: " + name(item)], lines).join("\n");
  }

  function gherkin(item, check, parts) {
    const notes = [parts.step, "Expected: " + parts.expected];
    const steps = [];
    const open = (path) => steps.push("Given the page " + gq(path) + " is open");
    const table = (paths) => ["| path |"].concat(paths.map((path) => "| " + gCell(path) + " |"));
    switch (check.kind) {
      case "status":
        steps.push("Then " + gq(check.path) + " answers with a status below 400");
        break;
      case "statusAll":
        steps.push("Then each of these paths answers with a status below 400:", ...table(check.paths));
        break;
      case "title":
        open(check.path); steps.push("Then the page title is not empty");
        break;
      case "titleAll":
        steps.push("Then each of these paths has a page title:", ...table(check.paths));
        break;
      case "count":
        open(check.path); steps.push("Then the count of " + gq(check.selector) + " elements is " + OPS_WORD[check.op] + " " + check.n);
        break;
      case "attr":
        open(check.path); steps.push("Then the " + gq(check.selector) + " element has a " + gq(check.attr) + " attribute");
        break;
      case "metaLength":
        open(check.path); steps.push("Then the meta description is between " + check.min + " and " + check.max + " characters long");
        break;
      case "headers":
        check.rules.forEach((rule) => steps.push(rule.pattern
          ? "Then the " + gq(rule.name) + " header of " + gq(check.path) + " matches " + gq(rule.pattern)
          : "Then " + gq(check.path) + " sends the " + gq(rule.name) + " header"));
        break;
      case "headerNoDigits":
        steps.push("Then the " + gq(check.name) + " header of " + gq(check.path) + " shows no version number");
        break;
      case "httpsRedirect":
        steps.push("Then plain http redirects to https");
        break;
      case "notFound":
        steps.push("Then an unknown path answers with 404 or 410");
        break;
      case "robotsSitemap":
        steps.push("Then robots.txt advertises a sitemap");
        break;
      case "budget":
        steps.push("Then " + gq(check.path) + " answers within " + check.ms + " ms and under " + check.bytes + " bytes");
        break;
      case "viewport":
        steps.push("Given the viewport is " + check.width + " by " + check.height + " pixels"); open(check.path); steps.push("Then the page does not scroll sideways");
        break;
      case "linksResolve":
        open(check.path); steps.push("Then the first " + check.max + " same-host links on the page resolve");
        break;
      default:
        return scenario(item, ["@manual", "@ignore"], ["Given this case is run by a person with access the owner provides"], notes);
    }
    return scenario(item, [], steps, notes);
  }

  function regexText(value) {
    return oneLine(value).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function maestroFile(item) {
    return "maestro/" + item.id.toLowerCase() + ".yaml";
  }

  function maestro(item, check, ctx, parts, sign) {
    const mark = oneLine(sign && sign.mark);
    const tablet = check.width >= TABLET.width;
    const shot = item.id.toLowerCase() + "-" + (tablet ? "tablet" : "phone");
    const heading = ctx.h1 ? regexText(ctx.h1) + ".*" : "";
    const lines = [
      "# " + ctx.label + (mark ? " · " + mark : ""),
      "# " + name(item),
      "# " + parts.step,
      "# Expected: " + parts.expected,
      "# Run on " + (tablet ? "a tablet" : "a phone") + " emulator or device with Chrome (about " + check.width + " x " + check.height + " CSS pixels).",
      "# Maestro drives the device, not the page script: a sideways swipe that leaves the heading in place and the screenshots stand in for the overflow measurement.",
      "appId: com.android.chrome",
      "name: " + q(name(item)),
      "tags:",
      "  - " + (tablet ? "tablet" : "phone"),
      "  - " + item.id,
      "---",
      "- launchApp:",
      "    clearState: true",
      "- runFlow:",
      "    when:",
      "      visible: \"(Use without an account|Accept & continue)\"",
      "    commands:",
      "      - tapOn: \"(Use without an account|Accept & continue)\"",
      "- runFlow:",
      "    when:",
      "      visible: \"No thanks\"",
      "    commands:",
      "      - tapOn: \"No thanks\"",
      "- openLink:",
      "    link: " + q(ctx.base + check.path),
      "    browser: true",
      "- extendedWaitUntil:",
      "    visible:",
      "      id: \"com.android.chrome:id/url_bar\"",
      "      text: " + q(".*" + regexText(ctx.host) + ".*"),
      "    timeout: 30000"
    ];
    if (heading) lines.push("- extendedWaitUntil:", "    visible: " + q(heading), "    timeout: 30000");
    lines.push("- takeScreenshot: " + shot + "-start", "- swipe:", "    direction: LEFT", "    duration: 400");
    if (heading) lines.push("- assertVisible: " + q(heading));
    lines.push("- takeScreenshot: " + shot + "-after-swipe");
    return lines.join("\n") + "\n";
  }

  function fill(template, ctx, line) {
    return template
      .replace(/__LINE__/g, () => line)
      .replace(/__BASE__/g, () => q(ctx.base))
      .replace(/__HOST__/g, () => q(ctx.host))
      .replace(/__MISSING__/g, () => q(MISSING_PATH));
  }

  const CUCUMBER_STEPS = String.raw`// __LINE__
// Step definitions for qa-lab.feature. Runs with @cucumber/cucumber and the Playwright library on Node 18 or later.
const { Given, Then, BeforeAll, AfterAll, Before, After, setDefaultTimeout } = require("@cucumber/cucumber");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE = __BASE__;
const HOST = __HOST__;
const MISSING = __MISSING__;

setDefaultTimeout(60 * 1000);
let browser;
BeforeAll(async () => { browser = await chromium.launch(); });
AfterAll(async () => { await browser.close(); });
Before(async function () { this.page = await browser.newPage(); });
After(async function () { await this.page.close(); });

Given(/^this case is run by a person with access the owner provides$/, function () {
  return "skipped";
});

Given(/^the viewport is (\d+) by (\d+) pixels$/, async function (width, height) {
  await this.page.setViewportSize({ width: Number(width), height: Number(height) });
});

Given(/^the page "([^"]*)" is open$/, async function (path) {
  await this.page.goto(BASE + path);
});

Then(/^the page title is not empty$/, async function () {
  assert.notEqual((await this.page.title()).trim(), "");
});

Then(/^the count of "([^"]*)" elements is (exactly|at least|at most) (\d+)$/, async function (selector, op, n) {
  const found = await this.page.locator(selector).count();
  const want = Number(n);
  assert.ok(op === "exactly" ? found === want : op === "at least" ? found >= want : found <= want, selector + ": " + found);
});

Then(/^the "([^"]*)" element has a "([^"]*)" attribute$/, async function (selector, attr) {
  const value = await this.page.locator(selector).first().getAttribute(attr);
  assert.notEqual((value || "").trim(), "", selector + " " + attr);
});

Then(/^the meta description is between (\d+) and (\d+) characters long$/, async function (min, max) {
  const description = await this.page.evaluate(() => (document.querySelector('meta[name="description"]') || {}).content || "");
  assert.ok(description.length >= Number(min) && description.length <= Number(max), "length " + description.length);
});

Then(/^the page does not scroll sideways$/, async function () {
  const overflow = await this.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, overflow + " px");
});

Then(/^the first (\d+) same-host links on the page resolve$/, async function (max) {
  const hrefs = await this.page.evaluate(({ base, limit }) => [...new Set([...document.querySelectorAll("a[href]")].map((link) => link.href.split("#")[0]).filter((href) => href.startsWith(base)))].slice(0, limit), { base: BASE, limit: Number(max) });
  for (const href of hrefs) assert.ok((await fetch(href)).status < 400, href);
});

Then(/^"([^"]*)" answers with a status below 400$/, async function (path) {
  assert.ok((await fetch(BASE + path)).status < 400, path);
});

Then(/^each of these paths answers with a status below 400:$/, async function (table) {
  for (const row of table.hashes()) assert.ok((await fetch(BASE + row.path)).status < 400, row.path);
});

Then(/^each of these paths has a page title:$/, async function (table) {
  for (const row of table.hashes()) {
    await this.page.goto(BASE + row.path);
    assert.notEqual((await this.page.title()).trim(), "", row.path);
  }
});

Then(/^"([^"]*)" sends the "([^"]*)" header$/, async function (path, header) {
  assert.ok((await fetch(BASE + path)).headers.get(header), header);
});

Then(/^the "([^"]*)" header of "([^"]*)" matches "([^"]*)"$/, async function (header, path, pattern) {
  const res = await fetch(BASE + path);
  assert.match(res.headers.get(header) || "", new RegExp(pattern, "i"));
});

Then(/^the "([^"]*)" header of "([^"]*)" shows no version number$/, async function (header, path) {
  const res = await fetch(BASE + path);
  assert.doesNotMatch(res.headers.get(header) || "", /\d/);
});

Then(/^plain http redirects to https$/, async function () {
  const res = await fetch("http://" + HOST + "/", { redirect: "manual" });
  assert.ok([301, 302, 307, 308].includes(res.status), String(res.status));
  assert.match(res.headers.get("location") || "", /^https:\/\//);
});

Then(/^an unknown path answers with 404 or 410$/, async function () {
  const res = await fetch(BASE + MISSING);
  assert.ok([404, 410].includes(res.status), String(res.status));
});

Then(/^robots\.txt advertises a sitemap$/, async function () {
  const res = await fetch(BASE + "/robots.txt");
  assert.match(await res.text(), /^sitemap:/im);
});

Then(/^"([^"]*)" answers within (\d+) ms and under (\d+) bytes$/, async function (path, ms, bytes) {
  const started = Date.now();
  const res = await fetch(BASE + path);
  const body = await res.arrayBuffer();
  assert.ok(res.status < 400, String(res.status));
  assert.ok(Date.now() - started < Number(ms), "slower than " + ms + " ms");
  assert.ok(body.byteLength < Number(bytes), body.byteLength + " bytes");
});
`;

  const BEHAVE_STEPS = String.raw`# __LINE__
# Step definitions for qa_lab.feature. Runs with behave, Selenium, and requests.
import re
import time

import requests
from behave import step, use_step_matcher
from selenium import webdriver
from selenium.webdriver.common.by import By

use_step_matcher("re")

BASE = __BASE__
HOST = __HOST__
MISSING = __MISSING__


def driver(context):
    if "driver" not in context.holder:
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        context.holder["driver"] = webdriver.Chrome(options=options)
    return context.holder["driver"]


@step(r"this case is run by a person with access the owner provides")
def manual(context):
    context.scenario.skip(reason="A person runs this case with access the owner provides.")


@step(r"the viewport is (?P<width>\d+) by (?P<height>\d+) pixels")
def viewport(context, width, height):
    driver(context).set_window_size(int(width), int(height))


@step(r'the page "(?P<path>[^"]*)" is open')
def open_page(context, path):
    driver(context).get(BASE + path)


@step(r"the page title is not empty")
def title_not_empty(context):
    assert driver(context).title.strip()


@step(r'the count of "(?P<selector>[^"]*)" elements is (?P<op>exactly|at least|at most) (?P<n>\d+)')
def element_count(context, selector, op, n):
    found = len(driver(context).find_elements(By.CSS_SELECTOR, selector))
    want = int(n)
    passed = found == want if op == "exactly" else found >= want if op == "at least" else found <= want
    assert passed, f"{selector}: {found}"


@step(r'the "(?P<selector>[^"]*)" element has a "(?P<attr>[^"]*)" attribute')
def has_attribute(context, selector, attr):
    value = driver(context).find_element(By.CSS_SELECTOR, selector).get_attribute(attr) or ""
    assert value.strip(), f"{selector} {attr}"


@step(r"the meta description is between (?P<low>\d+) and (?P<high>\d+) characters long")
def meta_length(context, low, high):
    description = driver(context).execute_script("return (document.querySelector('meta[name=\"description\"]') || {}).content || '';") or ""
    assert int(low) <= len(description) <= int(high), f"length {len(description)}"


@step(r"the page does not scroll sideways")
def no_sideways(context):
    overflow = driver(context).execute_script("return document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 1, f"{overflow} px"


@step(r"the first (?P<limit>\d+) same-host links on the page resolve")
def links_resolve(context, limit):
    hrefs = driver(context).execute_script("return [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('#')[0]).filter((h) => h.startsWith(arguments[0])))].slice(0, arguments[1]);", BASE, int(limit))
    for href in hrefs:
        assert requests.get(href, timeout=30).status_code < 400, href


@step(r'"(?P<path>[^"]*)" answers with a status below 400')
def status(context, path):
    assert requests.get(BASE + path, timeout=30).status_code < 400, path


@step(r"each of these paths answers with a status below 400:")
def status_all(context):
    for row in context.table:
        assert requests.get(BASE + row["path"], timeout=30).status_code < 400, row["path"]


@step(r"each of these paths has a page title:")
def title_all(context):
    for row in context.table:
        driver(context).get(BASE + row["path"])
        assert driver(context).title.strip(), row["path"]


@step(r'"(?P<path>[^"]*)" sends the "(?P<header>[^"]*)" header')
def sends_header(context, path, header):
    assert requests.get(BASE + path, timeout=30).headers.get(header), header


@step(r'the "(?P<header>[^"]*)" header of "(?P<path>[^"]*)" matches "(?P<pattern>[^"]*)"')
def header_matches(context, header, path, pattern):
    value = requests.get(BASE + path, timeout=30).headers.get(header, "")
    assert re.search(pattern, value, re.I), header


@step(r'the "(?P<header>[^"]*)" header of "(?P<path>[^"]*)" shows no version number')
def header_no_digits(context, header, path):
    value = requests.get(BASE + path, timeout=30).headers.get(header, "")
    assert not re.search(r"\d", value), header


@step(r"plain http redirects to https")
def https_redirect(context):
    res = requests.get("http://" + HOST + "/", allow_redirects=False, timeout=30)
    assert res.status_code in (301, 302, 307, 308), res.status_code
    assert res.headers.get("location", "").startswith("https://")


@step(r"an unknown path answers with 404 or 410")
def not_found(context):
    assert requests.get(BASE + MISSING, timeout=30).status_code in (404, 410)


@step(r"robots\.txt advertises a sitemap")
def robots_sitemap(context):
    text = requests.get(BASE + "/robots.txt", timeout=30).text
    assert re.search(r"^sitemap:", text, re.I | re.M)


@step(r'"(?P<path>[^"]*)" answers within (?P<ms>\d+) ms and under (?P<size>\d+) bytes')
def budget(context, path, ms, size):
    started = time.perf_counter()
    res = requests.get(BASE + path, timeout=30)
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert res.status_code < 400, res.status_code
    assert elapsed_ms < int(ms), f"{elapsed_ms:.0f} ms"
    assert len(res.content) < int(size), f"{len(res.content)} bytes"
`;

  const BEHAVE_ENVIRONMENT = String.raw`# __LINE__
# Keeps one browser for the whole behave run and closes it at the end.


def before_all(context):
    context.holder = {}


def after_all(context):
    if context.holder.get("driver"):
        context.holder["driver"].quit()
`;

  const REQNROLL_STEPS = String.raw`// __LINE__
// Step definitions for QaLab.feature. Reqnroll 3 with NUnit 4, Selenium WebDriver, and HttpClient.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net.Http;
using System.Text.RegularExpressions;
using NUnit.Framework;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using Reqnroll;

namespace QaLab
{
    [Binding]
    public class QaLabSteps
    {
        const string BaseUrl = __BASE__;
        const string Host = __HOST__;
        const string Missing = __MISSING__;
        static readonly HttpClient Http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true }) { Timeout = TimeSpan.FromSeconds(30) };
        static readonly HttpClient Raw = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) };
        static IWebDriver driver;

        static IWebDriver Driver
        {
            get
            {
                if (driver == null)
                {
                    var options = new ChromeOptions();
                    options.AddArgument("--headless=new");
                    driver = new ChromeDriver(options);
                }
                return driver;
            }
        }

        static object Run(string script, params object[] args) => ((IJavaScriptExecutor)Driver).ExecuteScript(script, args);

        static HttpResponseMessage Get(string url) => Http.GetAsync(url).GetAwaiter().GetResult();

        static string Header(HttpResponseMessage res, string name)
        {
            if (res.Headers.TryGetValues(name, out var values)) return string.Join(", ", values);
            if (res.Content.Headers.TryGetValues(name, out var content)) return string.Join(", ", content);
            return "";
        }

        [AfterTestRun]
        public static void Quit() => driver?.Quit();

        [StepDefinition(@"^this case is run by a person with access the owner provides$")]
        public void Manual() => Assert.Ignore("A person runs this case with access the owner provides.");

        [StepDefinition(@"^the viewport is (\d+) by (\d+) pixels$")]
        public void Viewport(int width, int height) => Driver.Manage().Window.Size = new System.Drawing.Size(width, height);

        [StepDefinition(@"^the page ""([^""]*)"" is open$")]
        public void OpenPage(string path) => Driver.Navigate().GoToUrl(BaseUrl + path);

        [StepDefinition(@"^the page title is not empty$")]
        public void TitleNotEmpty() => Assert.That(Driver.Title.Trim(), Is.Not.Empty);

        [StepDefinition(@"^the count of ""([^""]*)"" elements is (exactly|at least|at most) (\d+)$")]
        public void ElementCount(string selector, string op, int n)
        {
            var found = Driver.FindElements(By.CssSelector(selector)).Count;
            var passed = op == "exactly" ? found == n : op == "at least" ? found >= n : found <= n;
            Assert.That(passed, Is.True, selector + ": " + found);
        }

        [StepDefinition(@"^the ""([^""]*)"" element has a ""([^""]*)"" attribute$")]
        public void HasAttribute(string selector, string attr)
        {
            var value = Driver.FindElement(By.CssSelector(selector)).GetDomAttribute(attr) ?? "";
            Assert.That(value.Trim(), Is.Not.Empty, selector + " " + attr);
        }

        [StepDefinition(@"^the meta description is between (\d+) and (\d+) characters long$")]
        public void MetaLength(int min, int max)
        {
            var description = Convert.ToString(Run("return (document.querySelector('meta[name=\"description\"]') || {}).content || '';")) ?? "";
            Assert.That(description.Length, Is.InRange(min, max));
        }

        [StepDefinition(@"^the page does not scroll sideways$")]
        public void NoSideways() => Assert.That(Convert.ToInt64(Run("return document.documentElement.scrollWidth - window.innerWidth;")), Is.LessThanOrEqualTo(1));

        [StepDefinition(@"^the first (\d+) same-host links on the page resolve$")]
        public void LinksResolve(int max)
        {
            var hrefs = (IReadOnlyCollection<object>)Run("return [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('#')[0]).filter((h) => h.startsWith(arguments[0])))].slice(0, arguments[1]);", BaseUrl, max);
            foreach (var href in hrefs) Assert.That((int)Get(href.ToString()).StatusCode, Is.LessThan(400), href.ToString());
        }

        [StepDefinition(@"^""([^""]*)"" answers with a status below 400$")]
        public void Status(string path) => Assert.That((int)Get(BaseUrl + path).StatusCode, Is.LessThan(400), path);

        [StepDefinition(@"^each of these paths answers with a status below 400:$")]
        public void StatusAll(DataTable table)
        {
            foreach (var row in table.Rows) Assert.That((int)Get(BaseUrl + row["path"]).StatusCode, Is.LessThan(400), row["path"]);
        }

        [StepDefinition(@"^each of these paths has a page title:$")]
        public void TitleAll(DataTable table)
        {
            foreach (var row in table.Rows)
            {
                Driver.Navigate().GoToUrl(BaseUrl + row["path"]);
                Assert.That(Driver.Title.Trim(), Is.Not.Empty, row["path"]);
            }
        }

        [StepDefinition(@"^""([^""]*)"" sends the ""([^""]*)"" header$")]
        public void SendsHeader(string path, string header) => Assert.That(Header(Get(BaseUrl + path), header), Is.Not.Empty, header);

        [StepDefinition(@"^the ""([^""]*)"" header of ""([^""]*)"" matches ""([^""]*)""$")]
        public void HeaderMatches(string header, string path, string pattern) => Assert.That(Regex.IsMatch(Header(Get(BaseUrl + path), header), pattern, RegexOptions.IgnoreCase), Is.True, header);

        [StepDefinition(@"^the ""([^""]*)"" header of ""([^""]*)"" shows no version number$")]
        public void HeaderNoDigits(string header, string path) => Assert.That(Regex.IsMatch(Header(Get(BaseUrl + path), header), @"\d"), Is.False, header);

        [StepDefinition(@"^plain http redirects to https$")]
        public void HttpsRedirect()
        {
            var res = Raw.GetAsync("http://" + Host + "/").GetAwaiter().GetResult();
            Assert.That(new[] { 301, 302, 307, 308 }, Does.Contain((int)res.StatusCode));
            Assert.That(res.Headers.Location?.ToString() ?? "", Does.StartWith("https://"));
        }

        [StepDefinition(@"^an unknown path answers with 404 or 410$")]
        public void NotFound() => Assert.That(new[] { 404, 410 }, Does.Contain((int)Get(BaseUrl + Missing).StatusCode));

        [StepDefinition(@"^robots\.txt advertises a sitemap$")]
        public void RobotsSitemap()
        {
            var text = Get(BaseUrl + "/robots.txt").Content.ReadAsStringAsync().GetAwaiter().GetResult();
            Assert.That(Regex.IsMatch(text, "^sitemap:", RegexOptions.IgnoreCase | RegexOptions.Multiline), Is.True);
        }

        [StepDefinition(@"^""([^""]*)"" answers within (\d+) ms and under (\d+) bytes$")]
        public void Budget(string path, int ms, int bytes)
        {
            var watch = Stopwatch.StartNew();
            var res = Get(BaseUrl + path);
            var body = res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
            watch.Stop();
            Assert.That((int)res.StatusCode, Is.LessThan(400));
            Assert.That(watch.ElapsedMilliseconds, Is.LessThan(ms));
            Assert.That(body.Length, Is.LessThan(bytes));
        }
    }
}
`;

  const REQNROLL_PROJECT = String.raw`<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <IsPackable>false</IsPackable>
    <Nullable>disable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.11.0" />
    <PackageReference Include="NUnit" Version="4.6.1" />
    <PackageReference Include="NUnit3TestAdapter" Version="6.3.1" />
    <PackageReference Include="Reqnroll.NUnit" Version="3.3.4" />
    <PackageReference Include="Selenium.WebDriver" Version="4.51.0" />
  </ItemGroup>
</Project>
`;

  const LOAD = {
    baseline: { threads: 1, ramp: 1, seconds: 180, perThreadPerMinute: 60, note: "One request per second for three minutes." },
    ramp: { threads: 5, ramp: 120, seconds: 300, perThreadPerMinute: 60, note: "Ramp to five users over two minutes, then hold." },
    spike: { threads: 20, ramp: 5, seconds: 30, perThreadPerMinute: 60, note: "Twenty users inside five seconds, for thirty seconds." }
  };

  function jmeterGroup(item, check, ctx, parts) {
    const isLoad = check.kind === "load";
    const plan = isLoad ? LOAD[check.profile] : { threads: 1, ramp: 1, seconds: 0 };
    const comment = (isLoad ? "Disabled until the site owner gives written permission and a window. " + plan.note + " " : "") + parts.step + " Expected: " + parts.expected;
    const out = [
      "<ThreadGroup guiclass=\"ThreadGroupGui\" testclass=\"ThreadGroup\" testname=\"" + xml(name(item)) + "\" enabled=\"" + (isLoad ? "false" : "true") + "\">",
      "  <stringProp name=\"TestPlan.comments\">" + xml(comment) + "</stringProp>",
      "  <stringProp name=\"ThreadGroup.on_sample_error\">continue</stringProp>",
      "  <elementProp name=\"ThreadGroup.main_controller\" elementType=\"LoopController\" guiclass=\"LoopControlPanel\" testclass=\"LoopController\" testname=\"Loop Controller\" enabled=\"true\">",
      "    <boolProp name=\"LoopController.continue_forever\">false</boolProp>",
      "    <stringProp name=\"LoopController.loops\">" + (isLoad ? "-1" : "1") + "</stringProp>",
      "  </elementProp>",
      "  <stringProp name=\"ThreadGroup.num_threads\">" + plan.threads + "</stringProp>",
      "  <stringProp name=\"ThreadGroup.ramp_time\">" + plan.ramp + "</stringProp>",
      "  <boolProp name=\"ThreadGroup.scheduler\">" + (isLoad ? "true" : "false") + "</boolProp>",
      "  <stringProp name=\"ThreadGroup.duration\">" + (isLoad ? plan.seconds : "") + "</stringProp>",
      "  <stringProp name=\"ThreadGroup.delay\"></stringProp>",
      "</ThreadGroup>",
      "<hashTree>",
      "  <HTTPSamplerProxy guiclass=\"HttpTestSampleGui\" testclass=\"HTTPSamplerProxy\" testname=\"GET " + xml(check.path) + "\" enabled=\"true\">",
      "    <elementProp name=\"HTTPsampler.Arguments\" elementType=\"Arguments\" guiclass=\"HTTPArgumentsPanel\" testclass=\"Arguments\" enabled=\"true\">",
      "      <collectionProp name=\"Arguments.arguments\"/>",
      "    </elementProp>",
      "    <stringProp name=\"HTTPSampler.domain\">" + xml(ctx.host) + "</stringProp>",
      "    <stringProp name=\"HTTPSampler.port\">443</stringProp>",
      "    <stringProp name=\"HTTPSampler.protocol\">https</stringProp>",
      "    <stringProp name=\"HTTPSampler.path\">" + xml(check.path) + "</stringProp>",
      "    <stringProp name=\"HTTPSampler.method\">GET</stringProp>",
      "    <boolProp name=\"HTTPSampler.follow_redirects\">true</boolProp>",
      "    <boolProp name=\"HTTPSampler.use_keepalive\">true</boolProp>",
      "  </HTTPSamplerProxy>",
      "  <hashTree>",
      "    <DurationAssertion guiclass=\"DurationAssertionGui\" testclass=\"DurationAssertion\" testname=\"Under " + (isLoad ? 1500 : check.ms) + " ms\" enabled=\"true\">",
      "      <stringProp name=\"DurationAssertion.duration\">" + (isLoad ? 1500 : check.ms) + "</stringProp>",
      "    </DurationAssertion>",
      "    <hashTree/>",
      "  </hashTree>"
    ];
    if (isLoad) {
      out.push(
        "  <ConstantThroughputTimer guiclass=\"TestBeanGUI\" testclass=\"ConstantThroughputTimer\" testname=\"One request per second per user\" enabled=\"true\">",
        "    <intProp name=\"calcMode\">0</intProp>",
        "    <doubleProp>",
        "      <name>throughput</name>",
        "      <value>" + plan.perThreadPerMinute + ".0</value>",
        "      <savedValue>0.0</savedValue>",
        "    </doubleProp>",
        "  </ConstantThroughputTimer>",
        "  <hashTree/>"
      );
    }
    out.push("</hashTree>");
    return out.join("\n");
  }

  function jmeterPlan(groups, ctx) {
    return [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<jmeterTestPlan version=\"1.2\" properties=\"5.0\" jmeter=\"5.6.3\">",
      "  <hashTree>",
      "    <TestPlan guiclass=\"TestPlanGui\" testclass=\"TestPlan\" testname=\"" + xml(ctx.label) + "\" enabled=\"true\">",
      "      <stringProp name=\"TestPlan.comments\">Proposed from a public read by QA-lab URL Review. Load groups stay disabled until the site owner gives written permission.</stringProp>",
      "      <boolProp name=\"TestPlan.functional_mode\">false</boolProp>",
      "      <boolProp name=\"TestPlan.serialize_threadgroups\">true</boolProp>",
      "      <elementProp name=\"TestPlan.user_defined_variables\" elementType=\"Arguments\" guiclass=\"ArgumentsPanel\" testclass=\"Arguments\" testname=\"User Defined Variables\" enabled=\"true\">",
      "        <collectionProp name=\"Arguments.arguments\"/>",
      "      </elementProp>",
      "    </TestPlan>",
      "    <hashTree>",
      indent(groups.join("\n").split("\n"), "      "),
      "    </hashTree>",
      "  </hashTree>",
      "</jmeterTestPlan>",
      ""
    ].join("\n");
  }

  function gatlingClass(item) {
    return "QaLab" + item.id.split(/[^A-Za-z0-9]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join("") + "Simulation";
  }

  function javaDoc(text) {
    return String(text).replace(/\*\//g, "* /").replace(/\\u/g, "\\ u");
  }

  function gatling(item, check, ctx, parts) {
    const isLoad = check.kind === "load";
    const cls = gatlingClass(item);
    const injection = !isLoad
      ? "scn.injectOpen(atOnceUsers(1))"
      : check.profile === "baseline"
        ? "scn.injectOpen(constantUsersPerSec(1).during(Duration.ofMinutes(3)))"
        : check.profile === "ramp"
          ? "scn.injectOpen(rampUsersPerSec(1).to(5).during(Duration.ofMinutes(2)), constantUsersPerSec(5).during(Duration.ofMinutes(3)))"
          : "scn.injectOpen(nothingFor(Duration.ofSeconds(5)), atOnceUsers(20))";
    const assertions = isLoad
      ? "global().failedRequests().percent().lt(1.0), global().responseTime().mean().lt(1500)"
      : "global().failedRequests().count().is(0L), global().responseTime().max().lt(" + check.ms + ")";
    const lines = [
      "import static io.gatling.javaapi.core.CoreDsl.*;",
      "import static io.gatling.javaapi.http.HttpDsl.*;",
      "",
      "import io.gatling.javaapi.core.*;",
      "import io.gatling.javaapi.http.*;",
      "import java.time.Duration;",
      "",
      "/**",
      " * " + javaDoc(name(item)),
      " * " + javaDoc(parts.step),
      " * Expected: " + javaDoc(parts.expected),
      isLoad ? " * " + LOAD[check.profile].note + " Run only with the site owner's written permission: -DownerApproved=yes" : " * One request, measured against the budget.",
      " */",
      "public class " + cls + " extends Simulation {",
      "",
      "  HttpProtocolBuilder httpProtocol = http.baseUrl(" + q(ctx.base) + ");",
      "",
      "  ScenarioBuilder scn = scenario(" + q(name(item)) + ")",
      "      .exec(http(" + q("GET " + check.path) + ").get(" + q(check.path) + ").check(status().lt(400)));",
      ""
    ];
    if (isLoad) {
      lines.push(
        "  {",
        "    if (!\"yes\".equals(System.getProperty(\"ownerApproved\"))) {",
        "      throw new IllegalStateException(" + q(item.id + " needs the site owner's written permission and an agreed window. Add -DownerApproved=yes only then.") + ");",
        "    }",
        "  }",
        ""
      );
    }
    lines.push(
      "  {",
      "    setUp(" + injection + ")",
      "        .protocols(httpProtocol)",
      "        .assertions(" + assertions + ");",
      "  }",
      "}",
      ""
    );
    return { cls, code: lines.join("\n") };
  }

  function k6Key(item) {
    return item.id.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }

  function k6Case(item, check, parts) {
    const key = k6Key(item);
    const isLoad = check.kind === "load";
    let scenario;
    let thresholds;
    if (!isLoad) {
      scenario = "{ executor: \"shared-iterations\", vus: 1, iterations: 1, exec: " + q(key) + " }";
      thresholds = [["http_req_duration{scenario:" + key + "}", ["max<" + check.ms]], ["http_req_failed{scenario:" + key + "}", ["rate==0"]], ["checks{scenario:" + key + "}", ["rate==1"]]];
    } else {
      if (check.profile === "baseline") scenario = "{ executor: \"constant-arrival-rate\", rate: 1, timeUnit: \"1s\", duration: \"3m\", preAllocatedVUs: 2, maxVUs: 5, exec: " + q(key) + " }";
      else if (check.profile === "ramp") scenario = "{ executor: \"ramping-arrival-rate\", startRate: 1, timeUnit: \"1s\", stages: [{ target: 5, duration: \"2m\" }, { target: 5, duration: \"3m\" }], preAllocatedVUs: 5, maxVUs: 10, exec: " + q(key) + " }";
      else scenario = "{ executor: \"ramping-arrival-rate\", startRate: 0, timeUnit: \"1s\", stages: [{ target: 20, duration: \"5s\" }, { target: 20, duration: \"30s\" }], preAllocatedVUs: 20, maxVUs: 40, exec: " + q(key) + " }";
      thresholds = [["http_req_failed{scenario:" + key + "}", ["rate<0.01"]], ["http_req_duration{scenario:" + key + "}", ["avg<1500"]]];
    }
    const fn = [
      "// " + name(item),
      "// " + parts.step,
      "// Expected: " + parts.expected
    ];
    if (isLoad) fn.push("// " + LOAD[check.profile].note + " Starts only with OWNER_APPROVED=yes.");
    fn.push("export function " + key + "() {");
    if (isLoad) {
      fn.push("  const res = http.get(BASE + " + q(check.path) + ");", "  check(res, { \"status below 400\": (r) => r.status < 400 });");
    } else {
      fn.push(
        "  const res = http.get(BASE + " + q(check.path) + ", { responseType: \"binary\" });",
        "  check(res, {",
        "    \"status below 400\": (r) => r.status < 400,",
        "    " + q("under " + check.ms + " ms") + ": (r) => r.timings.duration < " + check.ms + ",",
        "    " + q("under " + check.bytes + " bytes") + ": (r) => r.body.byteLength < " + check.bytes + ",",
        "  });"
      );
    }
    fn.push("}");
    return { key, isLoad, scenario, thresholds, fn: fn.join("\n") };
  }

  function k6Script(entries, ctx, sign) {
    const mark = oneLine(sign && sign.mark);
    const line = ctx.label + (mark ? " · " + mark : "");
    const register = (entry) => ["scenarios." + entry.key + " = " + entry.scenario + ";"].concat(entry.thresholds.map((pair) => "thresholds[" + q(pair[0]) + "] = " + JSON.stringify(pair[1]) + ";"));
    const budgets = entries.filter((entry) => !entry.isLoad);
    const loads = entries.filter((entry) => entry.isLoad);
    const lines = [
      "// " + line,
      "// Proposed from a public read. Runs with k6: k6 run qa-lab.js. Budget checks run once.",
      "// Load scenarios start only with the site owner's written permission and an agreed window: k6 run -e OWNER_APPROVED=yes qa-lab.js",
      "import http from \"k6/http\";",
      "import { check } from \"k6\";",
      "",
      "const BASE = " + q(ctx.base) + ";",
      "const APPROVED = __ENV.OWNER_APPROVED === \"yes\";",
      "",
      "const scenarios = {};",
      "const thresholds = {};"
    ];
    budgets.forEach((entry) => lines.push(...register(entry)));
    if (loads.length) {
      lines.push("if (APPROVED) {");
      loads.forEach((entry) => lines.push(indent(register(entry), "  ")));
      lines.push("}");
    }
    lines.push(
      "",
      "export const options = { scenarios, thresholds };",
      "",
      "// Runs only when no scenario is enabled, so the script never starts load by accident.",
      "export default function () {",
      "  console.warn(\"No scenario enabled. Load scenarios need OWNER_APPROVED=yes and the owner's written permission.\");",
      "}",
      ""
    );
    entries.forEach((entry) => lines.push(entry.fn, ""));
    return lines.join("\n");
  }

  function frameworksFor(item, chosen) {
    const own = Array.isArray(item.fw) ? item.fw : (Array.isArray(item.frameworks) ? item.frameworks : []);
    const picked = Array.isArray(chosen) && chosen.length ? own.filter((fw) => chosen.indexOf(fw) !== -1) : own;
    return ORDER.filter((fw) => picked.indexOf(fw) !== -1);
  }

  function snippetFor(framework, item, check, ctx, parts) {
    if (framework === "Playwright") return playwright(item, check, parts);
    if (framework === "Cypress") return cypress(item, check, parts);
    if (framework === "Robot") return robot(item, check, parts);
    if (framework === "Selenium") return selenium(item, check, parts);
    if (framework === "WebdriverIO") return webdriverio(item, check, parts);
    if (framework === "Appium") return appium(item, check, parts);
    if (framework === "JMeter") return jmeterGroup(item, check, ctx, parts);
    if (framework === "Gatling") return gatling(item, check, ctx, parts).code;
    if (framework === "k6") return k6Script([k6Case(item, check, parts)], ctx, null);
    if (RUNNERS[framework]) return jsRunner(framework, item, check, parts);
    if (framework === "Selenide") return selenide(item, check, parts);
    if (framework === "TestNG") return testng(item, check, parts);
    if (framework === "Watir") return watir(item, check, parts);
    if (framework === "Maestro") return maestro(item, check, ctx, parts, null);
    if (GHERKIN_FW.indexOf(framework) !== -1) return gherkin(item, check, parts);
    return "";
  }

  function snippets(report, item, chosen) {
    const ctx = context(report);
    const check = checkFor(item, ctx);
    const parts = splitWhy(item.why);
    return frameworksFor(item, chosen)
      .filter((framework) => (LOAD_TOOLS.indexOf(framework) === -1 && framework !== "Maestro") || supports(framework, check))
      .map((framework) => ({ framework, code: snippetFor(framework, item, check, ctx, parts) }));
  }

  function header(framework, ctx, sign) {
    const mark = oneLine(sign && sign.mark);
    const line = ctx.label + (mark ? " · " + mark : "");
    if (framework === "Playwright") {
      return ["// " + line, "// Proposed from a public read. Review selectors and budgets before a run.", "import { test, expect } from \"@playwright/test\";", "", "const BASE = " + q(ctx.base) + ";", "const HOST = " + q(ctx.host) + ";", "", "test.describe(" + q(ctx.label) + ", () => {"].join("\n");
    }
    if (framework === "Cypress") {
      return ["// " + line, "// Proposed from a public read. Review selectors and budgets before a run.", "const BASE = " + q(ctx.base) + ";", "const HOST = " + q(ctx.host) + ";", "", "describe(" + q(ctx.label) + ", () => {"].join("\n");
    }
    if (framework === "WebdriverIO") {
      return ["// " + line, "// Proposed from a public read. Runs with the WebdriverIO Mocha runner on Node 18 or later.", "const BASE = " + q(ctx.base) + ";", "const HOST = " + q(ctx.host) + ";", "", "describe(" + q(ctx.label) + ", () => {"].join("\n");
    }
    if (framework === "Appium") {
      return [
        "// " + line,
        "// Runs with WebdriverIO and Appium 2 (UiAutomator2 driver) against Chrome on an Android emulator or device.",
        "// capabilities: [{ platformName: \"Android\", browserName: \"Chrome\", \"appium:automationName\": \"UiAutomator2\", \"appium:deviceName\": \"Android Emulator\" }]",
        "const BASE = " + q(ctx.base) + ";",
        "",
        "describe(" + q(ctx.label + " · mobile") + ", () => {"
      ].join("\n");
    }
    if (framework === "Selenium") {
      return [
        "# " + line,
        "# Proposed from a public read. Review selectors and budgets before a run.",
        "import re",
        "import time",
        "",
        "import pytest",
        "import requests",
        "from selenium import webdriver",
        "from selenium.webdriver.common.by import By",
        "",
        "BASE = " + q(ctx.base),
        "HOST = " + q(ctx.host),
        "",
        "",
        "@pytest.fixture",
        "def driver():",
        "    options = webdriver.ChromeOptions()",
        "    options.add_argument(\"--headless=new\")",
        "    browser = webdriver.Chrome(options=options)",
        "    yield browser",
        "    browser.quit()",
        "",
        ""
      ].join("\n");
    }
    if (framework === "Robot") {
      return [
        "*** Settings ***",
        "Documentation     " + robotText(line) + ". Proposed from a public read. Review selectors and budgets before a run.",
        "Library           SeleniumLibrary",
        "Library           RequestsLibrary",
        "Library           Collections",
        "Suite Teardown    Close All Browsers",
        "",
        "*** Variables ***",
        "${BASE}       " + ctx.base,
        "${HOST}       " + ctx.host,
        "${BROWSER}    headlesschrome",
        "",
        "*** Test Cases ***"
      ].join("\n");
    }
    const consts = ["const BASE = " + q(ctx.base) + ";", "const HOST = " + q(ctx.host) + ";", ""];
    const pageHooks = [
      "let browser;",
      "let page;",
      "beforeAll(async () => { browser = await chromium.launch(); });",
      "afterAll(async () => { await browser.close(); });",
      "beforeEach(async () => { page = await browser.newPage(); });",
      "afterEach(async () => { await page.close(); });",
      ""
    ];
    if (framework === "Jest") {
      return ["// " + line, "// Proposed from a public read. Runs with Jest and the Playwright library on Node 18 or later.", "const { chromium } = require(\"playwright\");", ""]
        .concat(consts, ["jest.setTimeout(60000);"], pageHooks, ["describe(" + q(ctx.label) + ", () => {"]).join("\n");
    }
    if (framework === "Vitest") {
      return ["// " + line, "// Proposed from a public read. Runs with Vitest and the Playwright library on Node 18 or later.", "import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from \"vitest\";", "import { chromium } from \"playwright\";", ""]
        .concat(consts, ["vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });"], pageHooks, ["describe(" + q(ctx.label) + ", () => {"]).join("\n");
    }
    if (framework === "Mocha") {
      return ["// " + line, "// Proposed from a public read. Runs with Mocha, node:assert, and the Playwright library on Node 18 or later.", "const assert = require(\"node:assert/strict\");", "const { chromium } = require(\"playwright\");", ""]
        .concat(consts, pageHooks.map((hook) => hook.replace(/^beforeAll\(/, "before(").replace(/^afterAll\(/, "after(")), ["describe(" + q(ctx.label) + ", () => {"]).join("\n");
    }
    if (framework === "CodeceptJS") {
      return ["// " + line, "// Proposed from a public read. Runs with CodeceptJS 3 and its Playwright helper on Node 18 or later.", "const assert = require(\"node:assert/strict\");", ""]
        .concat(consts, ["Feature(" + q(ctx.label) + ");", ""]).join("\n");
    }
    const javaHttp = [
      "  static final String BASE = " + q(ctx.base) + ";",
      "  static final String HOST = " + q(ctx.host) + ";",
      "  static final HttpClient HTTP = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build();",
      "  static final HttpClient RAW = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();",
      "",
      "  static HttpRequest request(String url) {",
      "    return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30)).build();",
      "  }",
      "",
      "  static HttpResponse<byte[]> get(String url) throws Exception {",
      "    return HTTP.send(request(url), HttpResponse.BodyHandlers.ofByteArray());",
      "  }",
      ""
    ];
    const javaImports = [
      "import java.net.URI;",
      "import java.net.http.HttpClient;",
      "import java.net.http.HttpRequest;",
      "import java.net.http.HttpResponse;",
      "import java.nio.charset.StandardCharsets;",
      "import java.time.Duration;",
      "import java.util.List;",
      "import java.util.Objects;",
      "import java.util.regex.Pattern;"
    ];
    if (framework === "Selenide") {
      return ["// " + javaDoc(line), "// Proposed from a public read. Runs with Selenide 7 and JUnit 5 on Java 17 or later.", "import static com.codeborne.selenide.Selenide.*;", "import static org.junit.jupiter.api.Assertions.assertTrue;", "", "import com.codeborne.selenide.Configuration;", "import com.codeborne.selenide.WebDriverRunner;"]
        .concat(javaImports, ["import org.junit.jupiter.api.BeforeAll;", "import org.junit.jupiter.api.Disabled;", "import org.junit.jupiter.api.DisplayName;", "import org.junit.jupiter.api.Test;", "import org.openqa.selenium.Dimension;", "", "class QaLabSelenideTest {", ""], javaHttp, ["  @BeforeAll", "  static void setUp() {", "    Configuration.headless = true;", "  }", ""]).join("\n");
    }
    if (framework === "TestNG") {
      return ["// " + javaDoc(line), "// Proposed from a public read. Runs with TestNG 7 and Selenium WebDriver 4 on Java 17 or later.", "import static org.testng.Assert.assertTrue;", ""]
        .concat(javaImports, ["import org.openqa.selenium.By;", "import org.openqa.selenium.Dimension;", "import org.openqa.selenium.JavascriptExecutor;", "import org.openqa.selenium.WebDriver;", "import org.openqa.selenium.chrome.ChromeDriver;", "import org.openqa.selenium.chrome.ChromeOptions;", "import org.testng.annotations.AfterClass;", "import org.testng.annotations.BeforeClass;", "import org.testng.annotations.Test;", "", "public class QaLabTestNgTest {", ""], javaHttp, [
          "  WebDriver driver;",
          "",
          "  @BeforeClass",
          "  public void start() {",
          "    ChromeOptions options = new ChromeOptions();",
          "    options.addArguments(\"--headless=new\");",
          "    driver = new ChromeDriver(options);",
          "  }",
          "",
          "  @AfterClass(alwaysRun = true)",
          "  public void stop() {",
          "    if (driver != null) driver.quit();",
          "  }",
          ""
        ]).join("\n");
    }
    if (framework === "Watir") {
      return [
        "# " + line,
        "# Proposed from a public read. Runs with Watir 7 and RSpec on Ruby 3 or later.",
        "require \"net/http\"",
        "require \"uri\"",
        "require \"watir\"",
        "",
        "BASE = " + rb(ctx.base),
        "HOST = " + rb(ctx.host),
        "",
        "def http_get_raw(url)",
        "  uri = URI(url)",
        "  Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == \"https\", open_timeout: 30, read_timeout: 30) do |http|",
        "    http.request(Net::HTTP::Get.new(uri))",
        "  end",
        "end",
        "",
        "def http_get(url, hops = 5)",
        "  res = http_get_raw(url)",
        "  return res unless res.is_a?(Net::HTTPRedirection) && hops.positive?",
        "  http_get(URI.join(url, res[\"location\"]).to_s, hops - 1)",
        "end",
        "",
        "RSpec.describe " + rb(ctx.label) + " do",
        "  before(:all) { @browser = Watir::Browser.new(:chrome, headless: true) }",
        "  after(:all) { @browser&.close }",
        ""
      ].join("\n");
    }
    if (GHERKIN_FW.indexOf(framework) !== -1) {
      return ["# " + line, "# Proposed from a public read. Review selectors and budgets before a run.", "Feature: " + ctx.label, ""].join("\n");
    }
    return "";
  }

  function suite(framework, blocks, ctx, sign) {
    if (["Playwright", "Cypress", "WebdriverIO", "Appium", "Jest", "Vitest", "Mocha"].indexOf(framework) !== -1) {
      return header(framework, ctx, sign) + "\n" + indent(blocks.join("\n\n").split("\n"), "  ") + "\n});\n";
    }
    if (framework === "Selenium") return header(framework, ctx, sign) + blocks.join("\n\n");
    if (framework === "Robot") return header(framework, ctx, sign) + "\n" + blocks.join("\n\n") + "\n";
    if (framework === "CodeceptJS") return header(framework, ctx, sign) + "\n" + blocks.join("\n\n") + "\n";
    if (framework === "Selenide" || framework === "TestNG") return header(framework, ctx, sign) + "\n" + indent(blocks.join("\n\n").split("\n"), "  ") + "\n}\n";
    if (framework === "Watir") return header(framework, ctx, sign) + "\n" + indent(blocks.join("\n\n").split("\n"), "  ") + "\nend\n";
    if (GHERKIN_FW.indexOf(framework) !== -1) return header(framework, ctx, sign) + "\n" + indent(blocks.join("\n\n").split("\n"), "  ") + "\n";
    return "";
  }

  function companions(framework, ctx, sign) {
    const mark = oneLine(sign && sign.mark);
    const line = ctx.label + (mark ? " · " + mark : "");
    if (framework === "Cucumber") return [{ path: "cucumber/features/step_definitions/qa_lab.steps.js", content: fill(CUCUMBER_STEPS, ctx, line) }];
    if (framework === "Behave") return [{ path: "behave/features/steps/qa_lab_steps.py", content: fill(BEHAVE_STEPS, ctx, line) }, { path: "behave/features/environment.py", content: fill(BEHAVE_ENVIRONMENT, ctx, line) }];
    if (framework === "Reqnroll") return [{ path: "reqnroll/Steps/QaLabSteps.cs", content: fill(REQNROLL_STEPS, ctx, line) }, { path: "reqnroll/QaLab.Specs.csproj", content: REQNROLL_PROJECT }];
    return [];
  }

  const FILES = {
    Playwright: "playwright/qa-lab.spec.ts",
    Cypress: "cypress/e2e/qa-lab.cy.js",
    Robot: "robot/qa_lab.robot",
    Selenium: "selenium/test_qa_lab.py",
    WebdriverIO: "webdriverio/test/specs/qa-lab.e2e.js",
    CodeceptJS: "codeceptjs/qa_lab_test.js",
    Selenide: "selenide/src/test/java/QaLabSelenideTest.java",
    TestNG: "testng/src/test/java/QaLabTestNgTest.java",
    Watir: "watir/spec/qa_lab_spec.rb",
    Cucumber: "cucumber/features/qa-lab.feature",
    Behave: "behave/features/qa_lab.feature",
    Reqnroll: "reqnroll/Features/QaLab.feature",
    Jest: "jest/qa-lab.test.js",
    Vitest: "vitest/qa-lab.test.js",
    Mocha: "mocha/test/qa-lab.spec.js",
    Appium: "appium/test/specs/qa-lab.mobile.e2e.js",
    JMeter: "jmeter/qa-lab.jmx",
    k6: "k6/qa-lab.js"
  };

  function readme(ctx, sign, used, counts) {
    const lines = [
      "# " + ctx.label,
      "",
      "Automation scripts proposed from a public read of " + ctx.base + ".",
      sign && sign.mark ? "Signature: " + sign.mark + (sign.sha256 ? " · SHA-256 " + sign.sha256 : "") : "",
      "",
      "These scripts were written from what the public page showed. They were not run by QA-lab. Review each selector, budget, and path before you trust a result. Skipped tests are cases that need a person, or an account the owner issues.",
      "",
      "## What is inside",
      ""
    ];
    used.forEach((fw) => lines.push("- " + fw + ": " + counts[fw] + " case(s)"));
    lines.push("", "## How to run", "");
    const how = {
      Playwright: ["npm init -y && npm i -D @playwright/test", "npx playwright install chromium", "npx playwright test playwright/qa-lab.spec.ts"],
      Cypress: ["npm init -y && npm i -D cypress", "npx cypress run --spec cypress/e2e/qa-lab.cy.js"],
      Robot: ["pip install robotframework robotframework-seleniumlibrary robotframework-requests", "robot robot/qa_lab.robot"],
      Selenium: ["pip install selenium pytest requests", "pytest selenium/test_qa_lab.py"],
      WebdriverIO: ["cd webdriverio && npm init wdio@latest . (Mocha framework, local Chrome)", "npx wdio run wdio.conf.js --spec test/specs/qa-lab.e2e.js"],
      CodeceptJS: ["cd codeceptjs && npm init -y && npm i -D codeceptjs playwright", "npx codeceptjs init (Playwright helper, tests ./*_test.js)", "npx codeceptjs run"],
      Selenide: ["Copy selenide/src into a Maven or Gradle project with com.codeborne:selenide 7 and org.junit.jupiter:junit-jupiter 5, on Java 17 or later.", "mvn test -Dtest=QaLabSelenideTest"],
      TestNG: ["Copy testng/src into a Maven or Gradle project with org.testng:testng 7 and org.seleniumhq.selenium:selenium-java 4, on Java 17 or later.", "mvn test -Dtest=QaLabTestNgTest"],
      Watir: ["gem install watir rspec", "rspec watir/spec/qa_lab_spec.rb"],
      Cucumber: ["cd cucumber && npm init -y && npm i -D @cucumber/cucumber playwright", "npx playwright install chromium", "npx cucumber-js"],
      Behave: ["pip install behave selenium requests", "cd behave && behave"],
      Reqnroll: ["Install the .NET 8 SDK or later, then:", "cd reqnroll && dotnet test"],
      Jest: ["cd jest && npm init -y && npm i -D jest playwright", "npx playwright install chromium", "npx jest"],
      Vitest: ["cd vitest && npm init -y && npm i -D vitest playwright", "npx playwright install chromium", "npx vitest run"],
      Mocha: ["cd mocha && npm init -y && npm i -D mocha playwright", "npx playwright install chromium", "npx mocha --timeout 60000"],
      Maestro: ["Install Maestro 2 (Java 17 or later): curl -fsSL \"https://get.maestro.mobile.dev\" | bash", "Start an Android emulator or plug in a device with Chrome, then:", "maestro test maestro/"],
      k6: ["Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/", "cd k6 && k6 run qa-lab.js", "Load scenarios start only with -e OWNER_APPROVED=yes. Add it only with the owner's written permission and an agreed window."],
      Appium: ["npm i -g appium && appium driver install uiautomator2", "Start an Android emulator with Chrome, then: cd appium && npm init wdio@latest . (Appium service, capabilities in the file header)", "npx wdio run wdio.conf.js --spec test/specs/qa-lab.mobile.e2e.js"],
      JMeter: ["Open jmeter/qa-lab.jmx in JMeter 5.6 or later. Load groups are disabled until the owner gives written permission.", "jmeter -n -t jmeter/qa-lab.jmx -l results.jtl"],
      Gatling: ["Copy gatling/*.java into src/test/java of a Gatling Maven project (Gatling 3.10 or later).", "mvn gatling:test -Dgatling.simulationClass=<ClassName>", "Load simulations refuse to start without -DownerApproved=yes. Add it only with the owner's written permission and an agreed window."]
    };
    used.forEach((fw) => {
      lines.push("### " + fw, "");
      (how[fw] || []).forEach((step) => lines.push("    " + step));
      lines.push("");
    });
    return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n");
  }

  function bundle(report, cases, chosen) {
    const ctx = context(report);
    const sign = report.signature || {};
    const blocks = {};
    const counts = {};
    const gatlingFiles = [];
    const jmeterGroups = [];
    const k6Entries = [];
    const maestroFiles = [];
    (cases || []).forEach((item) => {
      const check = checkFor(item, ctx);
      const parts = splitWhy(item.why);
      frameworksFor(item, chosen).forEach((framework) => {
        if (framework === "k6") {
          if (!supports("k6", check)) return;
          k6Entries.push(k6Case(item, check, parts));
        } else if (framework === "JMeter") {
          if (!supports("JMeter", check)) return;
          jmeterGroups.push(jmeterGroup(item, check, ctx, parts));
        } else if (framework === "Maestro") {
          if (!supports("Maestro", check)) return;
          maestroFiles.push({ path: maestroFile(item), content: maestro(item, check, ctx, parts, sign) });
        } else if (framework === "Gatling") {
          if (!supports("Gatling", check)) return;
          const file = gatling(item, check, ctx, parts);
          gatlingFiles.push({ path: "gatling/" + file.cls + ".java", content: file.code });
        } else {
          if (!blocks[framework]) blocks[framework] = [];
          blocks[framework].push(snippetFor(framework, item, check, ctx, parts));
        }
        counts[framework] = (counts[framework] || 0) + 1;
      });
    });
    const files = [];
    ORDER.forEach((framework) => {
      if (!blocks[framework] || !blocks[framework].length) return;
      files.push({ path: FILES[framework], content: suite(framework, blocks[framework], ctx, sign) });
      companions(framework, ctx, sign).forEach((file) => files.push(file));
    });
    maestroFiles.forEach((file) => files.push(file));
    if (jmeterGroups.length) files.push({ path: FILES.JMeter, content: jmeterPlan(jmeterGroups, ctx) });
    gatlingFiles.forEach((file) => files.push(file));
    if (k6Entries.length) files.push({ path: FILES.k6, content: k6Script(k6Entries, ctx, sign) });
    const used = ORDER.filter((fw) => counts[fw]);
    files.unshift({ path: "README.md", content: readme(ctx, sign, used, counts) });
    return { files, frameworks: used };
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(files, folder) {
    const encoder = new TextEncoder();
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const locals = [];
    const centrals = [];
    let offset = 0;
    let centralSize = 0;
    files.forEach((file) => {
      const nameBytes = encoder.encode((folder ? folder + "/" : "") + file.path);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      locals.push(local.buffer, nameBytes, data);
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, time, true);
      central.setUint16(14, date, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint16(30, 0, true);
      central.setUint16(32, 0, true);
      central.setUint16(34, 0, true);
      central.setUint16(36, 0, true);
      central.setUint32(38, 0, true);
      central.setUint32(42, offset, true);
      centrals.push(central.buffer, nameBytes);
      offset += 30 + nameBytes.length + data.length;
      centralSize += 46 + nameBytes.length;
    });
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);
    return new Blob(locals.concat(centrals, [end.buffer]), { type: "application/zip" });
  }

  const api = { snippets, bundle, zip, checkFor, context };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QAReviewScripts = api;
})(typeof window !== "undefined" ? window : globalThis);
