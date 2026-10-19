/**
 * Turns the proposed cases of a URL review into automation scripts, one suite per framework.
 * Every script is a proposal built from a public read: review selectors and budgets before a run.
 */
(function (root) {
  "use strict";

  const ORDER = ["Playwright", "Cypress", "Robot", "Selenium", "WebdriverIO", "Appium", "JMeter", "Gatling"];
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
    if (framework === "Appium") return check.kind === "viewport";
    if (framework === "JMeter" || framework === "Gatling") return check.kind === "budget" || check.kind === "load";
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
    return "";
  }

  function snippets(report, item, chosen) {
    const ctx = context(report);
    const check = checkFor(item, ctx);
    const parts = splitWhy(item.why);
    return frameworksFor(item, chosen)
      .filter((framework) => (framework !== "JMeter" && framework !== "Gatling") || supports(framework, check))
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
    return "";
  }

  function suite(framework, blocks, ctx, sign) {
    if (framework === "Playwright" || framework === "Cypress" || framework === "WebdriverIO" || framework === "Appium") {
      return header(framework, ctx, sign) + "\n" + indent(blocks.join("\n\n").split("\n"), "  ") + "\n});\n";
    }
    if (framework === "Selenium") return header(framework, ctx, sign) + blocks.join("\n\n");
    if (framework === "Robot") return header(framework, ctx, sign) + "\n" + blocks.join("\n\n") + "\n";
    return "";
  }

  const FILES = {
    Playwright: "playwright/qa-lab.spec.ts",
    Cypress: "cypress/e2e/qa-lab.cy.js",
    Robot: "robot/qa_lab.robot",
    Selenium: "selenium/test_qa_lab.py",
    WebdriverIO: "webdriverio/test/specs/qa-lab.e2e.js",
    Appium: "appium/test/specs/qa-lab.mobile.e2e.js",
    JMeter: "jmeter/qa-lab.jmx"
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
    (cases || []).forEach((item) => {
      const check = checkFor(item, ctx);
      const parts = splitWhy(item.why);
      frameworksFor(item, chosen).forEach((framework) => {
        if (framework === "JMeter") {
          if (!supports("JMeter", check)) return;
          jmeterGroups.push(jmeterGroup(item, check, ctx, parts));
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
      if (blocks[framework] && blocks[framework].length) files.push({ path: FILES[framework], content: suite(framework, blocks[framework], ctx, sign) });
    });
    if (jmeterGroups.length) files.push({ path: FILES.JMeter, content: jmeterPlan(jmeterGroups, ctx) });
    gatlingFiles.forEach((file) => files.push(file));
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
