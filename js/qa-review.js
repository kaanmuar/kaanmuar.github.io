(function () {
  const TERMS_KEY = "qa-review-terms";
  const DEVICE_KEY = "qa-review-device";
  const SHOWN_KEY = "qa-review-shown";
  const SAMPLE_URL = "assets/qa-review-sample.json";
  const TERMS_VERSION = "2026-10-24";
  const PAGE_CHOICES = [20, 40, 60, 80, 100];
  const DEPTH_CHOICES = [2, 3, 4, 5];
  const PAGE_CENTS = { 20: 0, 40: 500, 60: 900, 80: 1200, 100: 1500 };
  const DEPTH_CENTS = { 2: 0, 3: 400, 4: 700, 5: 1000 };
  const PRICE = 19;
  const EXTRA_PRICE = 5;
  const COMPARE_USD = 9;
  const RUN_PAID_KEY = "qa-review-run-paid";
  const FIXLIST_USD = 5;
  const FIXLIST_KEY = "qa-review-fixlist";
  const openedAt = Date.now();
  const SITE_COUNTRY = { uk: "GB", gb: "GB", eu: "EU", de: "DE", fr: "FR", es: "ES", it: "IT", nl: "NL", pt: "PT", ie: "IE", be: "BE", at: "AT", se: "SE", pl: "PL", co: "CO", mx: "MX", br: "BR", ar: "AR", cl: "CL", pe: "PE", ca: "CA", au: "AU", nz: "NZ", in: "IN", jp: "JP", us: "US", za: "ZA" };
  const MARK = "QA-lab URL Review · Carlos Muñoz · https://carlosandmunoz.com · Preview copy · Not a certification";
  const PAID_LINE = "This report was generated with QA-lab URL Review by Carlos Muñoz (https://carlosandmunoz.com).";
  const FRAMEWORK_GROUPS = [
    ["Browser", ["Playwright", "Cypress", "Robot", "Selenium", "WebdriverIO", "CodeceptJS", "Selenide", "TestNG", "Watir"]],
    ["Behavior-driven", ["Cucumber", "Behave", "Reqnroll"]],
    ["JavaScript runners", ["Jest", "Vitest", "Mocha"]],
    ["Mobile", ["Appium", "Maestro"]],
    ["Load and performance", ["JMeter", "Gatling", "k6"]]
  ];
  const FRAMEWORKS = FRAMEWORK_GROUPS.reduce((all, group) => all.concat(group[1]), []);
  const DEFAULT_FRAMEWORKS = FRAMEWORKS.slice();
  const FRAMEWORK_LOGOS = {
    Playwright: "playwright.svg", Cypress: "cypress.svg", Robot: "robot.svg", Selenium: "selenium.svg", WebdriverIO: "webdriverio.svg",
    CodeceptJS: "codeceptjs.svg", Selenide: "selenide.svg", TestNG: "testng.svg", Watir: "watir.png",
    Cucumber: "cucumber.svg", Behave: "behave.png", Reqnroll: "reqnroll.png",
    Jest: "jest.svg", Vitest: "vitest.svg", Mocha: "mocha.svg",
    Appium: "appium.svg", Maestro: "maestro.png",
    JMeter: "jmeter.svg", Gatling: "gatling.svg", k6: "k6.svg"
  };
  const TOOLS = ["axe-core", "Lighthouse", "BrowserStack", "Applitools", "Percy", "Provar", "Copado"];
  const PRODUCT_NAMES = FRAMEWORKS.concat(TOOLS, ["Robot Framework", "Selenium WebDriver", "Jira", "Xray", "Zephyr", "TestRail", "Azure Test Plans", "Mantis", "PayPal"]);
  const PRODUCT_PATTERN = new RegExp("\\b(?:" + PRODUCT_NAMES.slice().sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "g");
  const REASONS = [
    { id: "own", label: "I own this site and want a test plan" },
    { id: "client", label: "A client asked me to propose coverage before a release" },
    { id: "redesign", label: "I am comparing this page with a redesign" },
    { id: "release", label: "I need a case list before a release" },
    { id: "tech", label: "I want the public technologies named" },
    { id: "a11y", label: "I am preparing an accessibility review" },
    { id: "security", label: "I am preparing a review of the public security headers" },
    { id: "performance", label: "I need a performance and load case list" },
    { id: "teaching", label: "I am teaching or learning how a page could be tested" },
    { id: "allowed", label: "I am checking a page I am allowed to review" },
    { id: "verify", label: "I want QA-lab to run a verification" },
    { id: "credentials", label: "I have a username and password for this site" },
    { id: "other", label: "Other" }
  ];
  const gate = document.getElementById("gate");
  const app = document.getElementById("review-app");
  const termsForm = document.getElementById("terms-form");
  const accept = document.getElementById("accept");
  const reviewForm = document.getElementById("review-form");
  const status = document.getElementById("form-status");
  const reviewBtn = document.getElementById("review-btn");
  const stopBtn = document.getElementById("stop-btn");
  const shareOpen = document.getElementById("share-open");
  const payBox = document.getElementById("pay");
  const runPay = document.getElementById("run-pay");
  const dash = document.getElementById("dash-overlay");
  const reasonBox = document.getElementById("reason");
  const urlInput = document.getElementById("url");
  let current = null;
  let liveId = "";
  let layer = "All";
  let activeRun = "";
  let compareTarget = null;
  // How this browser's next run is billed, from the server's /standing: { billing: "run" | "scope", free, percent, pass, lastPlan,
  // plans }, where pass is the signed-in address's open pass (plan, runsLeft, paidUntil, its limits) or null; null while unknown.
  let standing = null;
  let standingKey = null;
  let pricing = false;
  const COMPARE_KEY = "qa-review-compare";
  const fileUses = {};

  function endpoint() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
    return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
  }

  // reviewUrl delivers a stream only when the run ends; reviewRun sends each log line as it is written.
  function runEndpoint() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8768";
    return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewRun";
  }

  // Set from ?qatest= on the pay page; a matching key keeps the run out of Live Reports.
  function testKey() {
    try { return localStorage.getItem("qa-review-test-key") || ""; } catch (error) { return ""; }
  }

  function deviceId() {
    let id = "";
    try { id = localStorage.getItem(DEVICE_KEY) || ""; } catch (error) { id = ""; }
    if (!/^[a-f0-9]{16}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem(DEVICE_KEY, id); } catch (error) { /* the request still sends this id */ }
    }
    return id;
  }

  function hexId() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function fields() {
    return [...app.querySelectorAll("input, textarea, button")].filter((el) => el.id !== "stop-btn");
  }

  function signedIn() {
    return !!(window.ReviewAuth && ReviewAuth.signedIn());
  }

  if (window.ReviewAuth) {
    ReviewAuth.onChange((on) => {
      if (!activeRun) reviewBtn.disabled = !on;
    });
  }

  let termsOk = false;
  let gateReturn = null;
  let behindGate = [];
  let afterTerms = null;
  try { termsOk = sessionStorage.getItem(TERMS_KEY) === TERMS_VERSION; } catch (error) { termsOk = false; }

  function enableApp() {
    fields().forEach((el) => { el.disabled = false; });
    reasonBox.disabled = true;
    syncSection();
    stopBtn.disabled = true;
    reviewBtn.disabled = !signedIn();
  }

  // The terms are asked for when an address is sent or someone signs in; what asked goes on once they are accepted.
  // hosts: the address about to be reviewed, or every competitor of a comparison.
  function askTerms(then, hosts) {
    afterTerms = then;
    const waiting = document.getElementById("gate-waiting");
    const list = [].concat(hosts || []).filter(Boolean).map((host) => host.replace(/^https?:\/\//i, ""));
    waiting.hidden = !list.length;
    waiting.textContent = list.length > 1 ? rc.t("gateMany", { hosts: list.join(", ") }) : list.length ? waiting.dataset.text.replace("{host}", list[0]) : "";
    gateReturn = document.activeElement;
    behindGate = [...document.body.children].filter((el) => el !== gate && !el.inert && !el.matches("script, .cookie-note"));
    behindGate.forEach((el) => { el.inert = true; });
    gate.hidden = false;
    gate.classList.remove("is-leaving");
    document.body.classList.add("gate-open");
    gate.querySelector(".gate-card").focus();
  }

  function closeGate() {
    gate.hidden = true;
    gate.classList.remove("is-leaving");
    document.body.classList.remove("gate-open");
    behindGate.forEach((el) => { el.inert = false; });
    behindGate = [];
    if (gateReturn && gateReturn.isConnected) gateReturn.focus({ preventScroll: true });
    gateReturn = null;
  }

  function dismissGate() {
    if (gate.hidden) return;
    compareTarget = null;
    afterTerms = null;
    closeGate();
  }

  function acceptTerms() {
    termsOk = true;
    try { sessionStorage.setItem(TERMS_KEY, TERMS_VERSION); } catch (error) { /* this page still knows they were accepted */ }
    const then = afterTerms;
    afterTerms = null;
    closeGate();
    if (then) then();
  }

  window.ReviewTerms = {
    ensure: (then) => { if (termsOk) then(); else askTerms(then, ""); }
  };

  document.getElementById("gate-close").addEventListener("click", dismissGate);
  gate.addEventListener("click", (event) => { if (event.target === gate) dismissGate(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") dismissGate(); });

  function paintFrameworks() {
    const box = document.getElementById("fw-picker");
    box.innerHTML = FRAMEWORK_GROUPS.map((group) =>
      '<div class="fw-group" role="group" aria-label="' + group[0] + '"><span class="fw-group-name">' + group[0] + "</span>" +
      group[1].map((name) =>
        '<label><input type="checkbox" name="fw" value="' + name + '"' + (DEFAULT_FRAMEWORKS.includes(name) ? " checked" : "") + " disabled>" + fwLogo(name) + '<span translate="no">' + name + "</span></label>"
      ).join("") + "</div>"
    ).join("");
  }

  function paintScope() {
    document.getElementById("page-picker").innerHTML = PAGE_CHOICES.map((count) =>
      '<label><input type="radio" name="pages" value="' + count + '"' + (count === 20 ? " checked" : "") + ' disabled> ' + count + "</label>"
    ).join("");
    document.getElementById("depth-picker").innerHTML = DEPTH_CHOICES.map((count) =>
      '<label><input type="radio" name="depth" value="' + count + '"' + (count === 2 ? " checked" : "") + ' disabled> ' + count + "</label>"
    ).join("");
  }

  function selectedPages() {
    const picked = reviewForm.querySelector('input[name="pages"]:checked');
    return picked ? Number(picked.value) : 20;
  }

  function selectedDepth() {
    const picked = reviewForm.querySelector('input[name="depth"]:checked');
    return picked ? Number(picked.value) : 2;
  }

  function selectedPageLang() {
    const picked = reviewForm.querySelector('input[name="pageLang"]:checked');
    return picked ? picked.value : "";
  }

  const PAGE_LANG_LABEL = { en: "English", es: "Spanish", pt: "Portuguese", de: "German", fr: "French", it: "Italian" };
  let sectionTouched = false;

  function urlPath() {
    const raw = urlInput.value.trim().replace(/^https?:\/\//i, "").replace(/^\/+/, "");
    const slash = raw.indexOf("/");
    if (slash === -1) return "";
    return raw.slice(slash).replace(/[?#].*$/, "").replace(/\/+$/, "");
  }

  function syncSection() {
    const box = document.getElementById("stay-section");
    const note = document.getElementById("section-note");
    if (!box) return;
    const path = urlPath();
    if (!path) sectionTouched = false;
    else if (!sectionTouched) box.checked = true;
    box.disabled = !path;
    if (!path) box.checked = false;
    if (note) note.textContent = !path
      ? "Add a path, such as example.com/docs, to keep later pages in that section. A host alone reviews the whole site."
      : box.checked
        ? "Later pages stay under " + path + "."
        : "Later pages can follow links outside " + path + ".";
  }

  function scopeSummary() {
    const lang = selectedPageLang();
    const parts = [selectedPages() + " pages", selectedDepth() + " deep", lang ? PAGE_LANG_LABEL[lang] || lang : "site language"];
    if (document.getElementById("stay-section").checked) parts.push("this section");
    return parts.join(", ");
  }

  function paintReasons() {
    const box = document.getElementById("reasons");
    const legend = box.querySelector("legend");
    box.innerHTML = "";
    box.appendChild(legend);
    REASONS.forEach((item) => {
      const label = document.createElement("label");
      label.innerHTML = '<input type="radio" name="reasonCode" value="' + item.id + '" disabled> ' + item.label;
      box.appendChild(label);
    });
  }

  paintFrameworks();
  paintScope();
  paintReasons();
  protectNames(document.body);
  const termsAll = document.getElementById("terms-all");
  const termBoxes = () => [...termsForm.querySelectorAll('input[type="checkbox"][name^="t"]')];
  function paintTermGroups() {
    termsForm.querySelectorAll(".term-group").forEach((group) => {
      const boxes = [...group.querySelectorAll('input[type="checkbox"][name^="t"]')];
      const done = boxes.filter((box) => box.checked).length;
      group.classList.toggle("done", done === boxes.length);
      group.querySelector(".tg-count").textContent = done + "/" + boxes.length;
    });
    const boxes = termBoxes();
    termsForm.style.setProperty("--progress", boxes.length ? boxes.filter((box) => box.checked).length / boxes.length : 0);
  }
  termsForm.addEventListener("change", (event) => {
    const boxes = termBoxes();
    if (termsAll && event.target === termsAll) boxes.forEach((box) => { box.checked = termsAll.checked; });
    else if (termsAll) termsAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
    accept.disabled = boxes.some((box) => !box.checked);
    paintTermGroups();
  });
  paintTermGroups();
  termsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (accept.disabled) return;
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_terms", "URL Review", "accepted");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { acceptTerms(); return; }
    gate.classList.add("is-leaving");
    setTimeout(acceptTerms, 340);
  });
  enableApp();

  function syncReasonExtras() {
    const code = reasonCode();
    const other = code === "other";
    reasonBox.disabled = !other;
    reasonBox.required = other;
    if (!other) clearField("reason");
    document.getElementById("client-box").hidden = code !== "client";
    document.getElementById("own-note").hidden = code !== "own";
    document.getElementById("verify-note").hidden = code !== "verify";
    document.getElementById("credential-note").hidden = code !== "credentials";
    if (code && window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_reason", "URL Review", code);
  }
  document.getElementById("reasons").addEventListener("change", syncReasonExtras);
  function paintSteps() {
    const code = reasonCode();
    const names = selectedFrameworks();
    const done = {
      you: signedIn() && !!document.getElementById("name").value.trim(),
      why: !!code && (code !== "other" || !!reasonBox.value.trim()),
      page: !!urlInput.value.trim(),
      cases: names.length > 0,
      scope: !!reviewForm.querySelector('input[name="pages"]:checked') && !!reviewForm.querySelector('input[name="depth"]:checked')
    };
    reviewForm.querySelectorAll(".req-group").forEach((group, i) => {
      const ok = !!done[group.dataset.step];
      group.classList.toggle("done", ok);
      group.querySelector(".tg-count").textContent = ok ? "✓" : String(i + 1);
    });
    const meta = reviewForm.querySelector("#req-cases .rg-meta");
    if (meta) meta.textContent = names.slice(0, 3).join(", ") + (names.length > 3 ? " +" + (names.length - 3) : "");
    const scopeMeta = reviewForm.querySelector("#req-scope .rg-meta");
    if (scopeMeta) scopeMeta.textContent = scopeSummary();
  }
  reviewForm.addEventListener("input", paintSteps);
  reviewForm.addEventListener("change", paintSteps);
  reviewForm.addEventListener("invalid", (event) => openStepOf(event.target), true);
  if (window.ReviewAuth) ReviewAuth.onChange(paintSteps);
  paintSteps();
  const followUpBox = document.getElementById("follow-up");
  if (followUpBox) followUpBox.addEventListener("change", () => {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_follow_up", "URL Review", followUpBox.checked ? "on" : "off");
  });
  reviewForm.addEventListener("change", (event) => {
    const target = event.target;
    if (target && target.id === "stay-section") {
      sectionTouched = true;
      syncSection();
    }
    if (!target || !window.SiteAnalytics) return;
    if (target.name === "fw") SiteAnalytics.trackEvent("qa_review_frameworks", "URL Review", String(selectedFrameworks().length));
    if (target.name === "tool") SiteAnalytics.trackEvent("qa_review_tools", "URL Review", target.value);
    if (target.name === "pages" || target.name === "depth" || target.name === "pageLang" || target.name === "section") SiteAnalytics.trackEvent("qa_review_scope", "URL Review", scopeSummary());
  });
  function countryForHost(value) {
    const host = String(value || "").replace(/^\s*https?:\/\//i, "").split("/")[0].split(":")[0].replace(/^www\./, "").toLowerCase();
    const tld = host.split(".").pop();
    return SITE_COUNTRY[tld] || "";
  }
  function syncLegal() {
    const code = countryForHost(urlInput.value);
    const link = document.getElementById("legal-site");
    if (link) link.href = "qa-review-legal.html" + (code ? "?site=" + code : "");
  }
  urlInput.addEventListener("input", () => {
    const next = urlInput.value.replace(/^\s*https?:\/\//i, "").replace(/^\/+/, "");
    if (next !== urlInput.value) urlInput.value = next;
    syncLegal();
    syncSection();
  });

  document.getElementById("theme-toggle").addEventListener("click", () => {
    if (window.SiteTheme && SiteTheme.toggle) SiteTheme.toggle();
  });

  function selectedFrameworks() {
    return [...reviewForm.querySelectorAll('input[name="fw"]:checked')].map((box) => box.value);
  }

  function reviewCents(list, tools) {
    const count = (list || selectedFrameworks()).length + (tools || selectedTools()).length;
    return count ? PRICE * 100 + EXTRA_PRICE * 100 * (count - 1) : 0;
  }

  function reviewUsd(list, tools) {
    return reviewCents(list, tools) / 100;
  }

  function formatUsd(list) {
    const cents = typeof list === "number" ? Math.round(list * 100) : reviewCents(list);
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  }

  function payPage() {
    const lang = ((location.pathname.split("/").pop() || "").match(/^qa-review-(es|pt|de|fr|it)\.html$/) || [])[1];
    return lang ? "qa-review-pay-" + lang + ".html" : "qa-review-pay.html";
  }

  function payQuery(purpose, extra) {
    const params = new URLSearchParams();
    params.set("purpose", purpose);
    if (purpose === "report" && current && current.report) {
      params.set("reportId", current.report.id);
      params.set("frameworks", ((current.frameworks && current.frameworks.length) ? current.frameworks : selectedFrameworks()).join(","));
      params.set("tools", selectedTools().join(","));
    }
    if (purpose === "new-run") {
      extra = extra || {};
      const list = extra.frameworks && extra.frameworks.length ? extra.frameworks : selectedFrameworks();
      const tools = extra.tools || selectedTools();
      params.set("frameworks", list.join(","));
      params.set("tools", tools.join(","));
      params.set("pages", String(extra.pages || selectedPages()));
      params.set("depth", String(extra.depth || selectedDepth()));
      if (extra.billing) params.set("billing", extra.billing);
      if (extra.pass) params.set("pass", extra.pass);
      if (extra.compareWith) params.set("compareWith", extra.compareWith);
      if (extra.compareWith && extra.competitors > 1) params.set("competitors", String(extra.competitors));
    }
    const coupon = window.ReviewDeal ? ReviewDeal.code() : "";
    if (coupon && (purpose === "report" || (purpose === "new-run" && !(extra && extra.pass)))) params.set("coupon", coupon);
    return payPage() + "?" + params.toString();
  }

  function showDeal(hostId, priceId, body) {
    const shown = !!(window.ReviewDeal && ReviewDeal.render(document.getElementById(hostId), body || {}));
    document.getElementById(priceId).hidden = shown;
    if (shown && window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_deal_shown", "URL Review", (body && body.discountSource) || "return");
  }

  function reasonCode() {
    const picked = reviewForm.querySelector('input[name="reasonCode"]:checked');
    return picked ? picked.value : "";
  }

  function setStatus(text, bad) {
    status.textContent = text;
    status.classList.toggle("bad", !!bad);
  }

  function fieldInput(name) {
    return document.getElementById({ clientName: "client-name", clientEmail: "client-email", clientUrl: "client-url" }[name] || name);
  }

  function clearField(name) {
    const error = document.getElementById(name + "-error");
    if (error) error.textContent = "";
    const input = fieldInput(name);
    if (input) input.classList.remove("invalid");
    if (name === "url") document.getElementById("url-field").classList.remove("invalid");
    if (name === "clientUrl") document.getElementById("client-url-field").classList.remove("invalid");
    if (name === "reason") document.getElementById("reasons").classList.remove("invalid");
    if (name === "frameworks") document.getElementById("fw-picker").classList.remove("invalid");
  }

  function markFields(errors) {
    ["name", "email", "reason", "url", "frameworks", "clientName", "clientEmail", "clientUrl"].forEach(clearField);
    (errors || []).forEach((item) => {
      const error = document.getElementById(item.field + "-error");
      if (error && !error.textContent) error.textContent = item.message;
      const input = fieldInput(item.field);
      if (input) input.classList.add("invalid");
      if (item.field === "url") document.getElementById("url-field").classList.add("invalid");
      if (item.field === "clientUrl") document.getElementById("client-url-field").classList.add("invalid");
      if (item.field === "reason") document.getElementById("reasons").classList.add("invalid");
      if (item.field === "frameworks") document.getElementById("fw-picker").classList.add("invalid");
      openStepOf(error);
    });
  }

  function openStepOf(el) {
    const group = el && el.closest(".req-group");
    if (group && !group.open) group.open = true;
  }

  function clientErrors() {
    const errors = [];
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const code = reasonCode();
    const reason = reasonBox.value.trim();
    const host = urlInput.value.trim();
    if (name.length < 2 || !/\p{L}/u.test(name)) errors.push({ field: "name", message: "Enter your name." });
    if (!/^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9.\-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email) || email.includes("..")) errors.push({ field: "email", message: "Enter a valid email." });
    if (!REASONS.some((item) => item.id === code)) errors.push({ field: "reason", message: "Choose a reason." });
    if (code === "other" && reason.length < 8) errors.push({ field: "reason", message: "Write the reason in a sentence." });
    if (code === "client") {
      const clientName = document.getElementById("client-name").value.trim();
      const clientEmail = document.getElementById("client-email").value.trim();
      const clientHost = document.getElementById("client-url").value.trim();
      if (clientName.length < 2 || !/\p{L}/u.test(clientName)) errors.push({ field: "clientName", message: "Enter the client's name." });
      if (!/^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9.\-]*[a-z0-9])?\.[a-z]{2,}$/i.test(clientEmail) || clientEmail.includes("..")) errors.push({ field: "clientEmail", message: "Enter the client's email." });
      if (!clientHost || /\s/.test(clientHost)) errors.push({ field: "clientUrl", message: "Enter the client's website." });
    }
    if (code === "own" && email.indexOf("@") !== -1 && host) {
      const mailHost = email.split("@")[1].replace(/^www\./, "");
      const siteHost = host.replace(/^www\./, "").split("/")[0];
      const mailRoot = mailHost.split(".").slice(-2).join(".");
      const siteRoot = siteHost.split(".").slice(-2).join(".");
      if (mailRoot && siteRoot && mailRoot.toLowerCase() !== siteRoot.toLowerCase()) {
        errors.push({ field: "email", message: "Use an email at the same domain as the site. That shows the mailbox is on that host. It does not prove legal ownership." });
      }
    }
    if (!host || /\s/.test(host)) errors.push({ field: "url", message: "Enter a public page after https://." });
    if (!selectedFrameworks().length) errors.push({ field: "frameworks", message: "Choose at least one framework for the proposed cases." });
    return errors;
  }

  function fwLogo(name) {
    const file = FRAMEWORK_LOGOS[name];
    return file ? '<img class="fw-logo" src="assets/frameworks/' + file + '?v=20261021" alt="" width="16" height="16" decoding="async">' : "";
  }

  function fwName(name) {
    return '<span class="fw-name" translate="no">' + fwLogo(name) + esc(name) + "</span>";
  }

  function protectNames(root) {
    if (!root) return;
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || node.parentElement.closest("script, style, textarea, pre, code, [translate=\"no\"]")) continue;
      PRODUCT_PATTERN.lastIndex = 0;
      if (PRODUCT_PATTERN.test(node.nodeValue)) nodes.push(node);
    }
    nodes.forEach((node) => {
      const text = node.nodeValue;
      const parts = document.createDocumentFragment();
      let last = 0;
      let match;
      PRODUCT_PATTERN.lastIndex = 0;
      while ((match = PRODUCT_PATTERN.exec(text))) {
        parts.append(text.slice(last, match.index));
        const span = document.createElement("span");
        span.setAttribute("translate", "no");
        span.className = "notranslate";
        span.textContent = match[0];
        parts.append(span);
        last = match.index + match[0].length;
      }
      parts.append(text.slice(last));
      node.replaceWith(parts);
    });
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  // host: the competitor a line belongs to when several run at once; their lines skip the single progress bar.
  function appendLog(text, host) {
    const list = document.getElementById("run-log");
    // Like a terminal: keep following new lines unless the reader has scrolled up.
    const following = list.scrollHeight - list.scrollTop - list.clientHeight < 32;
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = new Date().toLocaleTimeString();
    const shown = window.ReviewProgress ? ReviewProgress.translate(text) : text;
    if (shown !== text) {
      item.lang = document.documentElement.lang;
      item.setAttribute("translate", "no");
    }
    item.appendChild(time);
    if (host) {
      const site = document.createElement("b");
      site.className = "log-host";
      site.setAttribute("translate", "no");
      site.textContent = host + " ";
      item.appendChild(site);
    }
    item.appendChild(document.createTextNode(shown));
    list.appendChild(item);
    if (following) list.scrollTop = list.scrollHeight;
    if (window.ReviewProgress && !host) ReviewProgress.line(text);
  }

  function seenBefore(id) {
    return (sessionStorage.getItem(SHOWN_KEY) || "").split(",").filter(Boolean).indexOf(id) !== -1;
  }

  function remember(id) {
    const ids = (sessionStorage.getItem(SHOWN_KEY) || "").split(",").filter(Boolean);
    if (ids.indexOf(id) === -1) ids.push(id);
    sessionStorage.setItem(SHOWN_KEY, ids.join(","));
  }

  // Headings, controls, scores and the notes that explain the blur stay readable on an unpaid report.
  const FADE_CLEAR = "h1, h2, h3, h4, th, button, label, input, select, textarea, script, style, svg, time, .filters, .fade-line, #kpis, #paid-line, #compare-ask, #rivals > p, .rivals-kind, .rivals-pick, .rivals-add, #case-note, #alarm-note, #tool-note, #unlock-offer";
  // A bought fix list opens the scores and findings; the cases, signals and fix kit stay blurred.
  const FIX_OPEN = "#exec, #health, #fix-first, #browser-pass, #previews, #geo, #analytics, #seo, #site-graph, #security, #findings";

  function applyCopyMode(paid) {
    document.body.classList.toggle("preview-copy", !paid);
    document.body.classList.toggle("paid-copy", !!paid);
    const report = document.getElementById("report");
    if (paid) thawSections(report);
    else fadeSections(report);
  }

  // Where the readable opening of a line ends. The page blurs from here and the TXT and JSON files cut here.
  function fadeCut(raw) {
    // A locked preview from the server starts each hidden word with U+2060.
    const hidden = raw.indexOf("\u2060");
    if (hidden !== -1) return hidden;
    if (raw.trim().split(/\s+/).length < 4) return raw.length;
    const mark = raw.search(/[.!?](\s|$)/);
    let cut = mark === -1 ? Math.max(28, Math.floor(raw.length * 0.36)) : mark + 1;
    if (cut > raw.length - 12) cut = Math.max(16, Math.floor(raw.length * 0.42));
    return Math.min(cut, raw.length);
  }

  function clipText(text) {
    const raw = String(text || "");
    const cut = fadeCut(raw);
    return cut >= raw.length ? raw : raw.slice(0, cut).trimEnd() + " …";
  }

  function clipDeep(value) {
    if (typeof value === "string") return clipText(value);
    if (Array.isArray(value)) return value.map(clipDeep);
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((key) => { out[key] = clipDeep(value[key]); });
      return out;
    }
    return value;
  }

  function fadeSections(root, force) {
    if (!root || (!force && !document.body.classList.contains("preview-copy"))) return;
    const nodes = [];
    const fixOpen = document.body.classList.contains("fix-open");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const hidden = node.nodeValue.indexOf("\u2060") !== -1;
      if (!node.parentElement || node.parentElement.closest(hidden ? ".fade-line, script, style, textarea" : FADE_CLEAR)) continue;
      if (fixOpen && node.parentElement.closest(FIX_OPEN)) continue;
      if (fadeCut(node.nodeValue) < node.nodeValue.length) nodes.push(node);
    }
    nodes.forEach((node) => {
      const box = document.createElement("template");
      box.innerHTML = fadeText(node.nodeValue, false);
      node.replaceWith(box.content);
    });
  }

  function thawSections(root) {
    if (!root) return;
    root.querySelectorAll(".fade-line").forEach((line) => line.replaceWith(document.createTextNode(line.textContent)));
    root.normalize();
  }

  function fadeText(text, paid) {
    const raw = String(text || "");
    if (paid) return esc(raw);
    const cut = fadeCut(raw);
    if (cut >= raw.length) return esc(raw);
    const parts = raw.slice(cut).split(/(\s+)/);
    let seen = 0;
    const total = parts.filter((part) => /\S/.test(part)).length || 1;
    const faded = parts.map((part) => {
      if (!/\S/.test(part)) return esc(part);
      seen += 1;
      const blur = (0.35 + (seen / total) * 7.6).toFixed(2);
      return '<span class="case-fade" style="--fade:' + blur + 'px">' + esc(part) + "</span>";
    }).join("");
    return '<span class="fade-line">' + esc(raw.slice(0, cut)) + faded + "</span>";
  }

  function addonPaid(name, id) {
    return !!(current && current.report && current.report.id === id && Array.isArray(current.addons) && current.addons.indexOf(name) !== -1);
  }

  function savedPaid(key, id) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      return !!(saved && saved.paid && saved.reportId === id);
    } catch (error) {
      return false;
    }
  }

  function fixListOpen(id) {
    if (!current || !current.report || current.report.id !== id) return false;
    return current.paid === true || current.free === true || addonPaid("fixlist", id) || savedPaid(FIXLIST_KEY, id);
  }

  function alertsOpen(id) {
    if (addonPaid("alerts", id)) return true;
    try {
      const saved = JSON.parse(sessionStorage.getItem("qa-review-alerts") || "null");
      return !!(saved && saved.paid && saved.reportId === id);
    } catch (error) {
      return false;
    }
  }

  function credentialOpen(id) {
    if (addonPaid("credentials", id)) return true;
    try {
      const saved = JSON.parse(sessionStorage.getItem("qa-review-credential") || "null");
      return !!(saved && saved.paid && saved.reportId === id);
    } catch (error) {
      return false;
    }
  }

  let toolChoice = null;

  function selectedTools() {
    const boxes = document.querySelectorAll('#tools input[name="tool"]');
    if (boxes.length) return [...boxes].filter((box) => box.checked).map((box) => box.value);
    if (toolChoice) return [...toolChoice];
    return ((current && current.report && current.report.tools) || []).map((item) => item.name).filter((name) => TOOLS.includes(name));
  }

  function paintTools(report) {
    const block = document.getElementById("tool-block");
    const list = document.getElementById("tools");
    if (!block || !list) return;
    const tools = (report.tools || []).filter((item) => TOOLS.includes(item.name));
    block.hidden = tools.length === 0;
    list.innerHTML = tools.map((item) => {
      const on = !toolChoice || toolChoice.has(item.name);
      return "<li><label><input type=\"checkbox\" name=\"tool\" value=\"" + esc(item.name) + "\"" + (on ? " checked" : "") + "> <strong>" + esc(item.name) + "</strong></label><p class=\"muted\">" + esc(item.why) + "</p></li>";
    }).join("");
    list.onchange = () => { toolChoice = new Set(selectedTools()); paintTags(); };
    paintTags();
  }

  function paintAlarm(report, open) {
    const box = slot("alarm");
    const list = slot("alarm-list");
    const alerts = report.alerts || [];
    if (!box || !list) return;
    box.hidden = alerts.length === 0;
    slot("alarm-note").textContent = alerts.length
      ? (open
        ? "The full wording is open because this section is paid. These lines are still not proof of a break-in."
        : "The first words of each signal stay visible. The rest stays blurred until the full report is paid. These lines are what the public response showed. They are not proof that someone broke in.")
      : "";
    const opener = slot("alarm-open");
    if (opener) opener.hidden = open || alerts.length === 0;
    list.innerHTML = alerts.map((item) =>
      "<li><span class=\"alarm-kicker\">" + esc(item.level) + " · " + esc(item.id) + "</span><strong>" + fadeText(item.title, open) + "</strong><p>" + fadeText(item.detail, open) + "</p></li>"
    ).join("");
  }

  function paintMentions(report) {
    const list = slot("mentions");
    if (!list) return;
    const mentions = report.mentions || [];
    list.innerHTML = mentions.length
      ? mentions.map((item) => "<li><span class=\"mention-tone\">" + esc(item.tone || "Mention") + "</span> <a href=\"" + esc(item.href) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + esc(item.title) + "</a></li>").join("")
      : "<li class=\"muted\">No public write-up was retrieved on this pass.</li>";
  }

  function paintCredential(payload) {
    const box = document.getElementById("credential-run");
    if (!box) return;
    const report = payload.report || {};
    const asked = payload.reasonCode === "credentials";
    box.hidden = !asked;
    if (!asked) return;
    const free = payload.free === true;
    const open = free || credentialOpen(report.id);
    document.getElementById("credential-run-copy").textContent = free
      ? "The signed-in run is included for this address. This page still does not take the password. Ask for the run at qa@carlosandmunoz.com when you are ready to share the login through a channel QA-lab names."
      : open
      ? "Payment for the signed-in run is confirmed on this browser. This page still does not take the password. Ask for the run at qa@carlosandmunoz.com when you are ready to share the login through a channel QA-lab names."
      : "This page does not take the password. The signed-in run waits until it is paid. The amount is shown then.";
    document.getElementById("credential-open").hidden = open;
  }

  function paintVisuals(report, paid) {
    const pages = report.pages || [];
    const obs = report.observed || {};
    const headers = obs.headers || {};
    const sig = obs.signals || {};
    const maxMs = Math.max.apply(null, pages.map((page) => page.ms || 0).concat([1]));
    const times = pages.slice(0, 10).map((page) => {
      const width = Math.max(4, Math.round(((page.ms || 0) / maxMs) * 100));
      const label = String(page.path || "/").slice(0, 28);
      return '<div class="meter"><span>' + esc(label) + '</span><div class="track"><i style="width:' + width + '%"></i></div><span>' + esc(page.ms || 0) + " ms</span></div>";
    }).join("") || '<p class="muted">' + esc(rc.t("visNoTimes")) + "</p>";
    const checks = [
      ["HTTPS", true],
      ["HSTS", !!headers.hsts],
      ["CSP", !!headers.csp],
      ["nosniff", !!headers.nosniff],
      [rc.t("markFrame"), (!!headers.frame && !/allow-from/i.test(headers.frame)) || /frame-ancestors/i.test(headers.csp || "")],
      [rc.t("markReferrer"), !!headers.referrer],
      [rc.t("markLang"), !!obs.lang],
      ["Viewport", !!sig.viewport]
    ];
    const ticks = checks.map(([label, on]) => '<div class="tick ' + (on ? "on" : "off") + '"><b>' + esc(rc.t(on ? "visPresent" : "visMissing")) + "</b>" + esc(label) + "</div>").join("");
    const groups = {};
    (report.technologies || []).forEach((item) => {
      const name = item.group || "Other";
      groups[name] = (groups[name] || 0) + 1;
    });
    const groupEntries = Object.entries(groups);
    const groupMax = Math.max.apply(null, groupEntries.map((pair) => pair[1]).concat([1]));
    const groupBars = groupEntries.length ? groupEntries.map(([name, count]) =>
      '<div class="meter"><span>' + esc(rc.word("techGroup", name, name)) + '</span><div class="track"><i style="width:' + Math.round(count / groupMax * 100) + '%"></i></div><span>' + count + "</span></div>"
    ).join("") : '<p class="muted">' + esc(rc.t("visNoTech")) + "</p>";
    const ranked = ((report.insights && report.insights.findings) || []).filter((item) => item.rank && item.fix).slice(0, 3).map((item) => [said(item, "title"), said(item, "fix"), true]);
    const advice = ranked.slice();
    const tip = (key, vars) => [rc.t(key), rc.t(key + "Body", vars), false, key];
    if (!ranked.length && !headers.hsts) advice.push(tip("adHsts"));
    if (!ranked.length && !headers.csp) advice.push(tip("adCsp"));
    if (!ranked.length && (obs.missingAlt || 0) > 0) advice.push(tip("adAlt", { n: obs.missingAlt }));
    if (!ranked.length && !obs.lang) advice.push(tip("adLang"));
    if (!ranked.length && (obs.scripts || 0) > 12) advice.push(tip("adScripts", { n: obs.scripts }));
    if (!ranked.length && (obs.ms || 0) > 800) advice.push(tip("adFirst", { ms: obs.ms }));
    if (!advice.length) advice.push(tip("adPlan"));
    advice.push(tip("adSnap"));
    const adviceHtml = advice.slice(0, 4).map(([title, body, finding, key]) => "<article" + (key === "adSnap" ? ' data-advice="snapshot"' : "") + "><strong>" + esc(title) + "</strong><span>" + (finding ? fadeText(body, paid) : esc(body)) + "</span></article>").join("");
    slot("report-visuals").innerHTML =
      '<article class="card" data-card="speed"><h2>' + esc(rc.t("visTimes")) + '</h2><p class="muted">' + esc(rc.t("visTimesNote")) + "</p>" + times + "</article>" +
      '<article class="card" data-card="marks"><h2>' + esc(rc.t("visMarks")) + '</h2><div class="ticks">' + ticks + "</div></article>" +
      '<article class="card" data-card="tech"><h2>' + esc(rc.t("visTech")) + "</h2>" + groupBars + "</article>" +
      '<article class="card" data-card="practices"><h2>' + esc(rc.t("visAdvice")) + '</h2><div class="advice">' + adviceHtml + "</div></article>";
    const when = report.fetchedAt ? new Date(report.fetchedAt).toLocaleString(rc.lang) : "";
    slot("report-cover").innerHTML =
      '<div><img class="cover-logo" src="assets/qa-review-mark.svg?v=20261013c" alt=""><p class="report-kicker">QA-lab URL Review</p><h2>' + esc(report.host || rc.t("dashTitle")) + '</h2><p class="muted">' + esc(when) + "</p>" +
      (report.signature ? '<p class="sign-line">' + esc(report.signature.mark) + "</p>" : "") + "</div>" +
      '<div><p class="report-kicker">' + esc(rc.t("coverCases", { n: (report.counts && report.counts.cases) || 0 })) + "</p><p>" + esc(report.statement || "") + "</p></div>";
    if (!slotRoot) document.getElementById("print-mark").textContent = "";
  }

  const cc = window.QAReviewCompareCopy;
  const rc = window.QAReviewReportCopy;
  const fc = window.QAReviewFindingsCopy || { translated: false, line: (message, fallback) => fallback };
  // Reports saved before axe titles carried an id are read by the finding key.
  const axeTitle = (item) => /^ax-/.test(item.key || "") ? { id: "ax-title." + item.key.slice(3) } : null;
  const said = (item, part) => fc.line((item.msg && item.msg[part]) || (part === "title" ? axeTitle(item) : null), item[part]);
  // A title still in the server's English is marked so the browser can translate it.
  const titleLang = (item) => said(item, "title") === item.title ? ' translate="yes" lang="en"' : "";
  const VERDICT_LABEL = { fail: cc.verdict("fail"), risk: cc.verdict("risk"), pass: cc.verdict("pass"), person: cc.verdict("person") };
  const AREA_NOTE = {};
  ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"].forEach((name) => { AREA_NOTE[name] = cc.areaNote(name); });
  let findingFilter = { area: "All", verdict: "open" };

  // The section painters draw into the report on this page, or, while slotRoot is set, into one column
  // of the many-URL comparison (js/qa-review-multi.js), where each section is a [data-slot] cell.
  let slotRoot = null;

  function slot(id, root) {
    const at = root || slotRoot;
    return at ? at.querySelector('[data-slot="' + id + '"]') : document.getElementById(id);
  }

  function inSlot(root, paint) {
    const before = { root: slotRoot, current };
    slotRoot = root;
    if (root) current = root.payload;
    try {
      paint();
    } finally {
      slotRoot = before.root;
      current = before.current;
    }
  }

  function filterOf() {
    if (!slotRoot) return findingFilter;
    if (!slotRoot.findingFilter) slotRoot.findingFilter = { area: "All", verdict: "open" };
    return slotRoot.findingFilter;
  }

  function foundCount(limits) {
    const count = Number(limits && limits.pagesFound) || 0;
    return count ? count + (limits.pagesFoundPartial ? "+" : "") : "";
  }

  function gradeOf(score) {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 55) return "D";
    return "F";
  }

  function scoreColor(score) {
    if (score >= 80) return "var(--green)";
    if (score >= 55) return "var(--amber)";
    return "var(--red)";
  }

  function verdictBadge(verdict, severity) {
    if (!verdict) return '<span class="badge">Proposed</span>';
    return '<span class="badge v-' + esc(verdict) + '">' + esc(VERDICT_LABEL[verdict] || verdict) + "</span>" +
      (severity && severity !== "info" ? '<span class="badge">' + esc(severity) + "</span>" : "");
  }

  function setInsightsVisible(on) {
    if (slotRoot) return;
    document.querySelectorAll("[data-insight]").forEach((node) => { node.hidden = !on; });
  }

  // The server writes the summary in English; a translated page rebuilds the warnings, the score sentence and "Fix first".
  // A warning without a line here stays English, and "Fix first" is left out when the top finding's title has none.
  function healthSummary(ins) {
    const raw = String(ins.summary || "");
    const score = ins.score;
    const said = raw.match(/^(.*?)(\S+) scores \d+ out of 100 /);
    if (rc.english || !score || !said) return raw;
    const totals = score.totals || {};
    const warned = said[1] && fc.warnings ? fc.warnings(ins.warningMsgs, said[1]) : null;
    const top = / Fix first: /.test(raw) && fc.fixFirst ? fc.fixFirst((ins.findings || []).find((item) => item.rank === 1)) : null;
    return (warned ? warned + " " : said[1]) +
      rc.t("summary", { host: said[2], overall: score.overall || 0, grade: score.grade || gradeOf(score.overall || 0), fail: totals.fail || 0, risk: totals.risk || 0, pass: totals.pass || 0 }) +
      (top ? " " + top : "");
  }

  function paintHealth(ins) {
    const score = ins.score || {};
    const value = score.overall || 0;
    const circumference = 2 * Math.PI * 80;
    const totals = score.totals || {};
    const areas = score.areas || {};
    const column = slotRoot;
    slot("health").innerHTML =
      '<article class="card"><div class="health">' +
      '<div class="ring" role="img" aria-label="' + esc(rc.t("ring", { n: value, g: score.grade || gradeOf(value) })) + '">' +
      '<svg viewBox="0 0 196 196"><circle class="ring-track" cx="98" cy="98" r="80"></circle><circle class="ring-value" cx="98" cy="98" r="80" stroke="' + scoreColor(value) + '" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + (circumference * (1 - value / 100)).toFixed(1) + '"></circle></svg>' +
      "<b>" + value + "<small>" + esc(rc.t("grade", { g: score.grade || gradeOf(value) })) + "</small></b></div>" +
      '<div><p class="health-summary">' + esc(healthSummary(ins)).replace(/\.(?=[^\s.])/g, ".<wbr>") + "</p>" +
      '<div class="verdict-chips">' + ["fail", "risk", "pass", "person"].map((key) =>
        '<span class="vchip v-' + key + '"><b>' + (totals[key] || 0) + "</b>" + esc(VERDICT_LABEL[key]) + "</span>").join("") + "</div>" +
      '<div class="verdict-chips" aria-label="' + esc(rc.t("sevAria")) + '">' + ["critical", "high", "medium", "low"].map((key) =>
        '<span class="vchip s-' + ((score.severities || {})[key] ? key : "low") + '"><b>' + ((score.severities || {})[key] || 0) + "</b>" + esc(cc.severity(key)) + "</span>").join("") + "</div>" +
      '<p class="meta-line">' + esc(rc.t("measured", { person: VERDICT_LABEL.person })) + "</p></div></div>" +
      '<div class="areas">' + Object.keys(AREA_NOTE).map((name) => {
        const area = areas[name] || { score: 0, grade: "F", fail: 0, risk: 0, pass: 0 };
        const past = current && current.report && current.report.history && current.report.history.areas && current.report.history.areas[name];
        const moved = past ? area.score - past.before : 0;
        return '<button type="button" class="area" data-area="' + esc(name) + '"><div class="area-score"><span><b>' + area.score + "</b> " + esc(cc.area(name)) + (moved ? ' <span class="delta ' + (moved > 0 ? "up" : "down") + '" title="' + esc(rc.t("delta")) + '">' + (moved > 0 ? "+" : "") + moved + "</span>" : "") + '</span><span class="grade grade-' + esc(area.grade) + '">' + esc(area.grade) + "</span></div>" +
          '<div class="bar"><i style="width:' + area.score + "%;background:" + scoreColor(area.score) + '"></i></div>' +
          "<small>" + esc(cc.t("areaCounts", { fail: area.fail, risk: area.risk, pass: area.pass })) + " — " + esc(AREA_NOTE[name]) + "</small></button>";
      }).join("") + "</div></article>";
    slot("health").querySelectorAll(".area").forEach((button) => {
      button.addEventListener("click", () => {
        if (column) {
          inSlot(column, () => {
            Object.assign(filterOf(), { area: button.getAttribute("data-area"), verdict: "all" });
            paintFindings(column.payload.report.insights, !!column.payload.paid);
          });
          slot("findings", column).scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        findingFilter = { area: button.getAttribute("data-area"), verdict: "all" };
        paintFindings(current.report.insights, fixListOpen(current.report.id));
        const target = document.getElementById("findings");
        const panel = target.closest(".fold-panel");
        if (panel && panel.hidden) {
          const item = folds.find((one) => one.panel === panel);
          if (item) setFold(item, true);
        }
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function historyBlock(history) {
    if (!history) return "";
    const when = history.previousAt ? new Date(history.previousAt).toLocaleDateString() : "your last review";
    const change = history.now - history.before;
    const list = (rows, more) => rows.length ? "<ul>" + rows.slice(0, 5).map((title) => "<li>" + esc(title) + "</li>").join("") + "</ul>" + (more > 5 ? '<p class="meta-line">and ' + (more - 5) + " more</p>" : "") : '<p class="muted">None.</p>';
    return '<div class="history"><p><strong>Since your review on ' + esc(when) + ":</strong> score " + history.before + " → " + history.now +
      ' <span class="delta ' + (change > 0 ? "up" : change < 0 ? "down" : "") + '">' + (change > 0 ? "+" : "") + change + "</span>. " +
      history.fixedCount + " fixed, " + history.freshCount + " new, " + history.still + " still open.</p>" +
      '<div class="exec-cols history-cols"><div><h3>Fixed since then</h3>' + list(history.fixed, history.fixedCount) + "</div><div><h3>New since then</h3>" + list(history.fresh, history.freshCount) + "</div></div></div>";
  }

  const strong = (text) => "<strong>" + esc(text) + "</strong>";

  function paintCompare(report, sample) {
    const ask = document.getElementById("compare-ask");
    const result = document.getElementById("compare-result");
    if (!ask || !result) return;
    const cmp = report.compare;
    const made = !cmp && !sample && Array.isArray(report.comparisons) ? report.comparisons : [];
    document.getElementById("compare-error").textContent = "";
    ask.hidden = !!cmp || sample;
    result.hidden = !cmp && !sample && !made.length;
    // The card carries its own copy in each language; machine translation would garble it.
    if (!cc.english) {
      result.setAttribute("translate", "no");
      result.setAttribute("lang", cc.lang);
    }
    if (!cmp) {
      result.innerHTML = sample ? '<p class="muted">' + esc(cc.t("sample")) + "</p>" : made.length ? cmpMade(made, report.id) : "";
      const stored = savedCompare();
      fillCompareBoxes(stored && stored.id === report.id ? [stored.url].concat(stored.queue || []) : []);
      return;
    }
    const areas = (cmp.areas || []).map((row) => {
      const lead = row.own == null || row.rival == null ? null : row.own - row.rival;
      return Object.assign({ lead, level: lead != null && Math.abs(lead) < 5 }, row);
    });
    const kpis = cmp.kpis || [];
    const dominance = cmp.dominance || areas.reduce((out, row) => {
      if (row.lead != null) out[row.level ? "tie" : row.lead > 0 ? "own" : "rival"]++;
      return out;
    }, { own: 0, rival: 0, tie: 0 });
    const names = { own: cmp.ownHost, rival: cmp.rivalHost };
    const cell = (score) => score == null ? '<td class="muted">–</td>' : '<td><b style="color:' + scoreColor(score) + '">' + score + "</b></td>";
    const leadCell = (own, rival) => {
      if (own == null || rival == null) return '<td class="muted">–</td>';
      const gap = own - rival;
      return '<td><span class="delta ' + (gap > 0 ? "up" : gap < 0 ? "down" : "") + '">' + (gap > 0 ? "+" : "") + gap + "</span></td>";
    };
    const rows = [{ area: cc.t("overall"), own: cmp.overall.own, rival: cmp.overall.rival }].concat(areas.map((row) => Object.assign({}, row, { area: cc.area(row.area) }))).map((row) =>
      '<tr><th scope="row">' + esc(row.area) + "</th>" + cell(row.own) + cell(row.rival) + leadCell(row.own, row.rival) + "</tr>").join("");
    const list = (items, total) => items.length
      ? "<ul>" + items.map((item) => "<li><strong" + titleLang(item) + ">" + esc(said(item, "title")) + '</strong> <span class="meta-line">' + esc(cc.area(item.area)) + " · " + esc(cc.severity(item.severity)) + "</span></li>").join("") + "</ul>" + (total > items.length ? '<p class="meta-line">' + esc(cc.t("more", { n: total - items.length })) + "</p>" : "")
      : '<p class="muted">' + esc(cc.t("none")) + "</p>";
    const when = cmp.ownAt ? new Date(cmp.ownAt).toLocaleDateString(cc.lang) : "";
    const decided = dominance.own + dominance.rival + dominance.tie;
    const ahead = dominance.own === dominance.rival ? "" : dominance.own > dominance.rival ? "own" : "rival";
    const ownName = cmp.ownId ? '<a href="?report=' + encodeURIComponent(cmp.ownId) + '">' + strong(cmp.ownHost) + "</a>" : strong(cmp.ownHost);
    result.innerHTML = "<p>" + cc.t("intro", { own: ownName, when: when ? esc(cc.t("introWhen", { date: when })) : "", rival: strong(cmp.rivalHost) }) + " " +
      esc(cc.t("shared", { n: cmp.shared })) + "</p>" +
      cmpScoreboard(cmp, names, dominance, decided, ahead) +
      (kpis.length ? '<h3 class="cmp-h">' + esc(cc.t("headToHead")) + '</h3><div class="cmp-kpis">' + kpis.map((kpi) => cmpKpi(kpi, names)).join("") + "</div>" : "") +
      '<h3 class="cmp-h">' + esc(cc.t("sixAreas")) + '</h3><div class="cmp-two">' + cmpRadar(areas, names) + cmpLeads(areas, names) + "</div>" +
      cmpSkyline(areas, names) +
      '<div class="compare-scroll"><table class="compare-table"><thead><tr><th scope="col">' + esc(cc.t("area")) + '</th><th scope="col">' + esc(cmp.ownHost) + '</th><th scope="col">' + esc(cmp.rivalHost) + '</th><th scope="col">' + esc(cc.t("yourLead")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      cmpEdges(cmp, areas, kpis, names) +
      (cmp.verdicts || cmp.severities ? '<h3 class="cmp-h">' + esc(cc.t("problemMix")) + "</h3>" + cmpMix(cmp, names) : "") +
      '<div class="exec-cols history-cols"><div><h3>' + esc(cc.t("onlyHas", { site: cmp.ownHost })) + "</h3>" + list(cmp.ownOnly || [], cmp.ownOnlyCount) + "</div><div><h3>" + esc(cc.t("onlyHas", { site: cmp.rivalHost })) + "</h3>" + list(cmp.rivalOnly || [], cmp.rivalOnlyCount) + "</div></div>" +
      (cmp.market ? cmpMarket(cmp.market, names) : "") +
      cmpTrail(cmp.trail, names) +
      '<p class="meta-line">' + esc(cc.t("passive", { rival: cmp.rivalHost })) +
      (cmp.passive ? " " + esc(cc.t("passiveMore")) : "") + " " + esc(cc.t("verdictNote")) + "</p>";
  }

  const CMP_SIDES = ["own", "rival"];

  // The newest five comparisons from this review, with the review itself first, open as one report.
  function cmpMade(made, baseId) {
    const ids = [baseId].concat(made.slice(0, 5).map((line) => line.id));
    const all = '<p class="cmp-all"><button class="btn" type="button" data-multi-save="' + esc(ids.join(",")) + '">' + esc(cc.t("openAll")) + '</button> <span class="muted multi-save-status" role="status"></span></p>';
    return '<h3 class="cmp-h">' + esc(cc.t("made")) + "</h3>" + all + '<ul class="cmp-made">' + made.map((line) =>
      '<li><a href="?report=' + encodeURIComponent(line.id) + '">' + esc(line.rivalHost) + '</a> <span class="meta-line">' +
      esc([line.ownHost + " " + (line.own == null ? "–" : line.own) + " " + cc.t("vs") + " " + line.rivalHost + " " + (line.rival == null ? "–" : line.rival),
        line.at ? new Date(line.at).toLocaleDateString(cc.lang) : ""].filter(Boolean).join(" · ")) + "</span></li>").join("") + "</ul>";
  }

  function cmpSplit(parts, label) {
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    if (!total) return "";
    return '<div class="cmp-split" role="img" aria-label="' + esc(label) + '">' + parts.filter((part) => part.value).map((part) =>
      '<i class="' + part.cls + '" style="flex:' + part.value + '" title="' + esc(part.title) + '"><span>' + esc(part.text) + "</span></i>").join("") + "</div>";
  }

  function cmpRing(value, cls, host) {
    const circumference = 2 * Math.PI * 44;
    const score = value || 0;
    return '<div class="cmp-ring ' + cls + '"><svg viewBox="0 0 100 100" role="img" aria-label="' + esc(cc.t("ring", { site: host, n: score })) + '"><circle class="ring-track" cx="50" cy="50" r="44"></circle><circle class="ring-value" cx="50" cy="50" r="44" stroke="' + scoreColor(score) + '" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + (circumference * (1 - score / 100)).toFixed(1) + '"></circle></svg>' +
      "<b>" + score + "<small>" + esc(cc.t("grade", { g: gradeOf(score) })) + "</small></b><p>" + esc(host) + "</p></div>";
  }

  function cmpScoreboard(cmp, names, dominance, decided, ahead) {
    const gap = (cmp.overall.own || 0) - (cmp.overall.rival || 0);
    return '<div class="cmp-board">' + cmpRing(cmp.overall.own, "cmp-own", names.own) +
      '<div class="cmp-vs"><span>' + esc(cc.t("vs")) + '</span><b class="delta ' + (gap > 0 ? "up" : gap < 0 ? "down" : "") + '">' + (gap > 0 ? "+" : "") + gap + "</b><small>" + esc(cc.t("leadSmall")) + "</small></div>" +
      cmpRing(cmp.overall.rival, "cmp-rival", names.rival) + "</div>" +
      (decided ? '<p class="cmp-verdict">' + (ahead ? cc.t("wins", { site: strong(names[ahead]), n: dominance[ahead], total: decided }) : esc(cc.t("sameWins"))) +
        ". " + esc(cc.t("tally", { own: names.own, a: dominance.own, rival: names.rival, b: dominance.rival, c: dominance.tie })) + "</p>" +
        cmpSplit([
          { value: dominance.own, cls: "cmp-own", text: dominance.own, title: cc.t("winsTitle", { site: names.own, n: dominance.own }) },
          { value: dominance.tie, cls: "cmp-tie", text: dominance.tie, title: cc.t("levelTitle", { n: dominance.tie }) },
          { value: dominance.rival, cls: "cmp-rival", text: dominance.rival, title: cc.t("winsTitle", { site: names.rival, n: dominance.rival }) }
        ], cc.t("indicators", { own: names.own, a: dominance.own, c: dominance.tie, rival: names.rival, b: dominance.rival })) : "");
  }

  function cmpValue(kpi, value) {
    if (value == null) return "–";
    if (kpi.unit === "ms") return value >= 1000 ? (value / 1000).toFixed(1) + " s" : Math.round(value) + " ms";
    if (kpi.unit === "bytes") return value >= 1048576 ? (value / 1048576).toFixed(1) + " MB" : Math.round(value / 1024) + " KB";
    if (kpi.unit === "%") return value + "%";
    if (kpi.key === "cls") return value.toFixed(2);
    return Number(value).toLocaleString(cc.lang);
  }

  function cmpKpi(kpi, names) {
    const top = Math.max(kpi.own || 0, kpi.rival || 0) || 1;
    const side = (key) => '<div class="cmp-kpi-row' + (kpi.winner === key ? " won" : "") + '"><span>' + esc(names[key]) + "</span><b>" + esc(cmpValue(kpi, kpi[key])) + "</b></div>" +
      '<div class="cmp-bar"><i class="cmp-' + key + '" style="width:' + (kpi[key] == null ? 0 : Math.max(2, kpi[key] / top * 100)).toFixed(1) + '%"></i></div>';
    const verdict = esc(kpi.winner === "tie" ? cc.t("level") : kpi.winner ? cc.t("ahead", { site: names[kpi.winner] }) : cc.t("notBoth"));
    return '<div class="cmp-kpi ' + (kpi.winner ? "w-" + kpi.winner : "") + '"><p class="cmp-kpi-label">' + esc(cc.kpi(kpi)) + "<small>" + esc(cc.t(kpi.better === "low" ? "lower" : "higher")) + "</small></p>" +
      side("own") + side("rival") + '<p class="cmp-kpi-win">' + verdict + "</p></div>";
  }

  function cmpRadar(areas, names) {
    const size = 300, mid = 150, radius = 105;
    const point = (index, value) => {
      const angle = (-90 + index * 360 / areas.length) * Math.PI / 180;
      return [mid + Math.cos(angle) * radius * value / 100, mid + Math.sin(angle) * radius * value / 100];
    };
    const rings = [25, 50, 75, 100].map((level) => '<polygon class="cmp-grid" points="' + areas.map((row, index) => point(index, level).map((n) => n.toFixed(1)).join(",")).join(" ") + '"></polygon>').join("");
    const spokes = areas.map((row, index) => { const [x, y] = point(index, 100); return '<line class="cmp-grid" x1="' + mid + '" y1="' + mid + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"></line>'; }).join("");
    const labels = areas.map((row, index) => {
      const [x, y] = point(index, 122);
      return '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + (Math.abs(x - mid) < 8 ? "middle" : x > mid ? "start" : "end") + '">' + esc(cc.area(row.area)) + "</text>";
    }).join("");
    const shape = (key) => '<polygon class="cmp-shape cmp-' + key + '" points="' + areas.map((row, index) => point(index, row[key] || 0).map((n) => n.toFixed(1)).join(",")).join(" ") + '"></polygon>' +
      areas.map((row, index) => { const [x, y] = point(index, row[key] || 0); return '<circle class="cmp-dot cmp-' + key + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3"></circle>'; }).join("");
    const label = cc.t("radar", { rows: areas.map((row) => cc.area(row.area) + " " + names.own + " " + (row.own == null ? cc.t("noScore") : row.own) + ", " + names.rival + " " + (row.rival == null ? cc.t("noScore") : row.rival)).join("; ") });
    return '<figure class="cmp-fig"><svg class="cmp-radar" viewBox="-70 -12 ' + (size + 140) + " " + (size + 24) + '" role="img" aria-label="' + esc(label) + '">' + rings + spokes + shape("rival") + shape("own") + labels + "</svg>" +
      '<figcaption><span class="cmp-key cmp-own"></span>' + esc(names.own) + ' <span class="cmp-key cmp-rival"></span>' + esc(names.rival) + " · " + esc(cc.t("radarCaption")) + "</figcaption></figure>";
  }

  function cmpLeads(areas, names) {
    const top = Math.max(10, ...areas.map((row) => Math.abs(row.lead || 0)));
    return '<figure class="cmp-fig cmp-leads"><p class="cmp-leads-head"><span>' + esc(cc.t("ahead", { site: names.rival })) + "</span><span>" + esc(cc.t("ahead", { site: names.own })) + "</span></p>" + areas.map((row) => {
      const width = row.lead == null ? 0 : Math.abs(row.lead) / top * 50;
      const tag = row.lead == null ? "–" : row.level ? cc.t("level") : (row.lead > 0 ? "+" : "") + row.lead;
      return '<div class="cmp-lead"><span>' + esc(cc.area(row.area)) + '</span><div class="cmp-lead-track"><i class="' + (row.lead > 0 ? "cmp-own" : "cmp-rival") + (row.level ? " level" : "") + '" style="' + (row.lead > 0 ? "left:50%" : "right:50%") + ";width:" + width.toFixed(1) + '%"></i></div><b class="' + (row.level ? "muted" : row.lead > 0 ? "delta up" : "delta down") + '">' + esc(tag) + "</b></div>";
    }).join("") + "<figcaption>" + esc(cc.t("leadsCaption")) + "</figcaption></figure>";
  }

  function cmpSkyline(areas, names) {
    const bar = 20, gap = 4, group = 34, depth = 9, lift = 6, scale = 1.3, floor = 160, left = 14;
    let x = left, body = "", labels = "";
    const column = (x0, value, key) => {
      const h = (value || 0) * scale;
      const y = floor - h;
      return '<g class="cmp-col cmp-' + key + '"><polygon class="cmp-col-side" points="' + [[x0 + bar, y], [x0 + bar + depth, y - lift], [x0 + bar + depth, floor - lift], [x0 + bar, floor]].map((p) => p.join(",")).join(" ") + '"></polygon>' +
        '<rect class="cmp-col-front" x="' + x0 + '" y="' + y + '" width="' + bar + '" height="' + h + '"></rect>' +
        '<polygon class="cmp-col-top" points="' + [[x0, y], [x0 + depth, y - lift], [x0 + bar + depth, y - lift], [x0 + bar, y]].map((p) => p.join(",")).join(" ") + '"></polygon>' +
        '<text x="' + (x0 + bar / 2 + depth / 2) + '" y="' + (y - lift - 4) + '" text-anchor="middle">' + (value == null ? "–" : value) + "</text></g>";
    };
    areas.forEach((row) => {
      body += column(x, row.own, "own") + column(x + bar + gap, row.rival, "rival");
      labels += '<text class="cmp-col-label" x="' + (x + bar + gap / 2) + '" y="' + (floor + 18) + '" text-anchor="middle">' + esc(cc.area(row.area)) + "</text>";
      x += bar * 2 + gap + group;
    });
    const width = x - group + depth + left;
    const ground = '<polygon class="cmp-floor" points="' + [[left - 6, floor], [left - 6 + depth, floor - lift], [width + 2, floor - lift], [width + 2 - depth, floor]].map((p) => p.join(",")).join(" ") + '"></polygon>';
    return '<figure class="cmp-fig cmp-sky"><div class="compare-scroll"><svg viewBox="0 0 ' + (width + 6) + " " + (floor + 26) + '" role="img" aria-label="' + esc(cc.t("sky", { own: names.own, rival: names.rival })) + '">' + ground + body + labels + "</svg></div>" +
      '<figcaption><span class="cmp-key cmp-own"></span>' + esc(names.own) + ' <span class="cmp-key cmp-rival"></span>' + esc(names.rival) + " · " + esc(cc.t("skyCaption")) + "</figcaption></figure>";
  }

  function cmpEdges(cmp, areas, kpis, names) {
    const line = (row, value) => "<li><strong>" + esc(row.key ? cc.kpi(row) : cc.area(row.area)) + "</strong> " + '<span class="meta-line">' + esc(value(row.own)) + " " + esc(cc.t("vs")) + " " + esc(value(row.rival)) + "</span></li>";
    const areaValue = (score) => score == null ? "–" : String(score);
    const pick = (side) => areas.filter((row) => row.lead != null && !row.level && (row.lead > 0) === (side === "own")).sort((a, b) => Math.abs(b.lead) - Math.abs(a.lead)).map((row) => line(row, areaValue))
      .concat(kpis.filter((row) => row.key !== "overall" && row.winner === side).map((row) => line(row, (value) => cmpValue(row, value))));
    const level = areas.filter((row) => row.level).map((row) => line(row, areaValue))
      .concat(kpis.filter((row) => row.key !== "overall" && row.winner === "tie").map((row) => line(row, (value) => cmpValue(row, value))));
    const shared = (cmp.sharedList || []).map((item) => "<li><span" + titleLang(item) + ">" + esc(said(item, "title")) + '</span> <span class="meta-line">' + esc(cc.t("bothHave")) + " · " + esc(cc.area(item.area)) + " · " + esc(cc.severity(item.severity)) + "</span></li>");
    const box = (title, items, cls) => '<div class="cmp-edge ' + cls + '"><h3>' + esc(title) + "</h3>" + (items.length ? "<ul>" + items.slice(0, 8).join("") + "</ul>" + (items.length > 8 ? '<p class="meta-line">' + esc(cc.t("more", { n: items.length - 8 })) + "</p>" : "") : '<p class="muted">' + esc(cc.t("none")) + "</p>") + "</div>";
    return '<h3 class="cmp-h">' + esc(cc.t("edges")) + '</h3><div class="exec-cols cmp-edges">' +
      box(cc.t("advantages"), pick("own"), "cmp-own") +
      box(cc.t("common"), level.concat(shared), "cmp-tie") +
      box(cc.t("whereAhead", { site: names.rival }), pick("rival"), "cmp-rival") + "</div>";
  }

  function cmpMix(cmp, names) {
    const verdicts = cmp.verdicts ? CMP_SIDES.map((key) => {
      const row = cmp.verdicts[key] || {};
      return '<div class="cmp-mix-row"><span>' + esc(names[key]) + "</span>" + cmpSplit(["fail", "risk", "pass", "person"].map((name) =>
        ({ value: row[name] || 0, cls: "mix-" + name, text: row[name] || 0, title: (row[name] || 0) + " " + cc.verdict(name) })), cc.t("checks", { site: names[key], list: ["fail", "risk", "pass", "person"].map((name) => (row[name] || 0) + " " + cc.verdict(name)).join(", ") })) + "</div>";
    }).join("") : "";
    const top = cmp.severities ? Math.max(1, ...CMP_SIDES.map((key) => ["critical", "high", "medium", "low"].reduce((sum, name) => sum + ((cmp.severities[key] || {})[name] || 0), 0))) : 1;
    const severities = cmp.severities ? CMP_SIDES.map((key) => {
      const row = cmp.severities[key] || {};
      const total = ["critical", "high", "medium", "low"].reduce((sum, name) => sum + (row[name] || 0), 0);
      return '<div class="cmp-mix-row"><span>' + esc(names[key]) + '</span><div class="cmp-sev" style="width:' + Math.max(4, total / top * 100).toFixed(1) + '%">' + cmpSplit(["critical", "high", "medium", "low"].map((name) =>
        ({ value: row[name] || 0, cls: "sev-" + name, text: row[name] || 0, title: (row[name] || 0) + " " + cc.severity(name) })), cc.t("problems", { site: names[key], list: ["critical", "high", "medium", "low"].map((name) => (row[name] || 0) + " " + cc.severity(name)).join(", ") })) + "</div><b>" + total + "</b></div>";
    }).join("") : "";
    const key = (cls, text) => '<span class="cmp-key ' + cls + '"></span>' + esc(text);
    return '<div class="cmp-two">' + (verdicts ? '<figure class="cmp-fig"><figcaption>' + esc(cc.t("byVerdict")) + " " + ["fail", "risk", "pass", "person"].map((name) => key("mix-" + name, cc.legend(name))).join(" ") + "</figcaption>" + verdicts + "</figure>" : "") +
      (severities ? '<figure class="cmp-fig"><figcaption>' + esc(cc.t("bySeverity")) + " " + ["critical", "high", "medium", "low"].map((name) => key("sev-" + name, cc.severity(name))).join(" ") + "</figcaption>" + severities + "</figure>" : "") + "</div>";
  }

  function cmpSpark(ranks, cls) {
    if (!ranks || ranks.length < 2) return "";
    const values = ranks.map((row) => row.rank);
    const best = Math.min(...values), worst = Math.max(...values);
    const span = worst - best || 1;
    const points = values.map((value, index) => (index / (values.length - 1) * 150 + 5).toFixed(1) + "," + (6 + (value - best) / span * 28).toFixed(1)).join(" ");
    return '<svg class="cmp-spark ' + cls + '" viewBox="0 0 160 40" role="img" aria-label="' + esc(cc.t("spark", { n: ranks.length, a: "#" + values[0].toLocaleString(cc.lang), b: "#" + values[values.length - 1].toLocaleString(cc.lang) })) + '"><polyline points="' + points + '"></polyline></svg>';
  }

  function cmpSignal(signal) {
    if (signal.points == null) return cc.t("notRead");
    if (signal.key === "rank") return signal.value ? "#" + Number(signal.value).toLocaleString(cc.lang) : cc.t("outsideTop");
    if (signal.key === "chrome") return cc.t(signal.value ? "yes" : "no");
    if (signal.key === "age") return cc.t("years", { n: signal.value });
    return Number(signal.value).toLocaleString(cc.lang);
  }

  function cmpMarket(market, names) {
    const gauge = (side, key) => {
      const score = side.score == null ? 0 : side.score;
      const places = (n) => esc(cc.t("places", { n: n.toLocaleString(cc.lang) }));
      const trend = side.change == null ? "" : side.change > 0 ? '<span class="delta up">▲ ' + places(side.change) + "</span>" : side.change < 0 ? '<span class="delta down">▼ ' + places(-side.change) + "</span>" : '<span class="delta">' + esc(cc.t("steady")) + "</span>";
      return '<div class="cmp-presence cmp-' + key + '"><svg viewBox="0 0 120 70" role="img" aria-label="' + esc(cc.t("presence", { site: names[key], value: side.score == null ? cc.t("presenceNotRead") : cc.t("outOf", { n: side.score }) })) + '"><path class="ring-track" d="M10 62 A50 50 0 0 1 110 62" pathLength="100"></path><path class="cmp-arc" d="M10 62 A50 50 0 0 1 110 62" pathLength="100" stroke-dasharray="' + score + ' 100"></path><text x="60" y="58" text-anchor="middle">' + (side.score == null ? "–" : side.score) + "</text></svg>" +
        "<p><strong>" + esc(names[key]) + "</strong></p><p class=\"cmp-rank\">" + (side.rank ? "#" + side.rank.toLocaleString(cc.lang) + " <small>" + esc(cc.t("onTranco")) + "</small>" : "<small>" + esc(cc.t("outsideTranco")) + "</small>") + "</p>" + cmpSpark(side.ranks, "cmp-" + key) + "<p>" + trend + "</p></div>";
    };
    const leader = market.share == null || market.share === 50 ? "" : market.share > 50 ? "own" : "rival";
    const rows = (market.own.signals || []).map((signal, index) => {
      const other = (market.rival.signals || [])[index] || {};
      const bar = (value, key) => '<div class="cmp-bar"><i class="cmp-' + key + '" style="width:' + (value || 0) + '%"></i></div>';
      return "<tr><th scope=\"row\">" + esc(cc.signal(signal)) + "<small>" + esc(cc.t("weight", { n: signal.weight })) + "</small></th><td>" + esc(cmpSignal(signal)) + bar(signal.points, "own") + "</td><td>" + esc(cmpSignal(other)) + bar(other.points, "rival") + "</td></tr>";
    }).join("");
    return '<h3 class="cmp-h">' + esc(cc.t("market")) + "</h3>" +
      (leader ? '<p class="cmp-verdict">' + cc.t("holds", { site: strong(names[leader]), n: leader === "own" ? market.share : 100 - market.share }) + "</p>" : "") +
      (market.share == null ? "" : cmpSplit([
        { value: market.share, cls: "cmp-own", text: market.share + "%", title: names.own + " " + market.share + "%" },
        { value: 100 - market.share, cls: "cmp-rival", text: (100 - market.share) + "%", title: names.rival + " " + (100 - market.share) + "%" }
      ], cc.t("share", { own: names.own, a: market.share, rival: names.rival, b: 100 - market.share }))) +
      '<div class="cmp-two">' + gauge(market.own, "own") + gauge(market.rival, "rival") + "</div>" +
      '<div class="compare-scroll"><table class="compare-table cmp-signals"><thead><tr><th scope="col">' + esc(cc.t("signal")) + '</th><th scope="col">' + esc(names.own) + '</th><th scope="col">' + esc(names.rival) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<p class="meta-line">' + esc(cc.t("marketNote")) + "</p>";
  }

  function cmpTrail(trail, names) {
    const own = (trail && trail.own) || [];
    const rival = (trail && trail.rival) || [];
    if (own.length + rival.length < 3) return "";
    const dates = own.concat(rival).map((row) => Date.parse(row.at)).filter((at) => !isNaN(at));
    const first = Math.min(...dates), last = Math.max(...dates);
    const width = 520, height = 170, pad = 30;
    const x = (at) => pad + (last === first ? (width - pad * 2) / 2 : (Date.parse(at) - first) / (last - first) * (width - pad * 2));
    const y = (score) => 12 + (100 - score) / 100 * (height - 40);
    const grid = [0, 50, 100].map((score) => '<line class="cmp-grid" x1="' + pad + '" x2="' + (width - pad) + '" y1="' + y(score) + '" y2="' + y(score) + '"></line><text class="cmp-axis" x="' + (pad - 6) + '" y="' + (y(score) + 4) + '" text-anchor="end">' + score + "</text>").join("");
    const line = (rows, key) => rows.length ? '<g class="cmp-' + key + '"><polyline class="cmp-line" points="' + rows.map((row) => x(row.at).toFixed(1) + "," + y(row.overall).toFixed(1)).join(" ") + '"></polyline>' +
      rows.map((row) => '<circle class="cmp-dot" cx="' + x(row.at).toFixed(1) + '" cy="' + y(row.overall).toFixed(1) + '" r="3.5"><title>' + esc(cc.t("point", { site: names[key], n: row.overall, date: new Date(row.at).toLocaleDateString(cc.lang) })) + "</title></circle>").join("") + "</g>" : "";
    const label = (at, anchor) => '<text class="cmp-axis" x="' + x(new Date(at).toISOString()).toFixed(1) + '" y="' + (height - 6) + '" text-anchor="' + anchor + '">' + esc(new Date(at).toLocaleDateString(cc.lang)) + "</text>";
    const move = (rows) => rows.length > 1 ? rows[rows.length - 1].overall - rows[0].overall : null;
    const note = (rows, key) => {
      const moved = move(rows);
      return esc(names[key]) + ": " + (rows.length ? esc(cc.t("reviews", { n: rows.length })) + (moved == null ? "" : ', <span class="delta ' + (moved > 0 ? "up" : moved < 0 ? "down" : "") + '">' + (moved > 0 ? "+" : "") + moved + "</span> " + esc(cc.t("sinceFirst"))) : esc(cc.t("noEarlier")));
    };
    return '<h3 class="cmp-h">' + esc(cc.t("history")) + '</h3><figure class="cmp-fig cmp-trail"><div class="compare-scroll"><svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + esc(cc.t("historyLabel", { own: names.own, rival: names.rival })) + '">' + grid + line(own, "own") + line(rival, "rival") + (last !== first ? label(first, "start") + label(last, "end") : label(first, "middle")) + "</svg></div>" +
      "<figcaption>" + note(own, "own") + " · " + note(rival, "rival") + "</figcaption></figure>";
  }

  function savedCompare() {
    try { return JSON.parse(sessionStorage.getItem(COMPARE_KEY) || "null"); } catch (error) { return null; }
  }

  // The first competitor box is always shown; the other four open one at a time.
  const COMPARE_IDS = ["compare-url", "compare-url-2", "compare-url-3", "compare-url-4", "compare-url-5"];
  const compareInputs = () => COMPARE_IDS.map((id) => document.getElementById(id));
  const compareMore = () => [...document.querySelectorAll("[data-compare-more]")];
  const typedHost = (value) => String(value || "").trim().replace(/^\s*https?:\/\//i, "").replace(/^\/+/, "");
  const siteKey = (value) => typedHost(value).toLowerCase().split(/[/?#:]/)[0].replace(/\.$/, "").replace(/^www\./, "");

  function syncCompareAdd() {
    const left = compareMore().filter((row) => row.hidden).length;
    document.getElementById("compare-add").hidden = !left;
    document.getElementById("compare-add-left").textContent = rc.t("left", { n: left });
    paintCompareTags();
  }

  function compareUrls() {
    return compareInputs().filter((input) => !input.closest("[data-compare-more][hidden]")).map((input) => input.value.trim()).filter(Boolean);
  }

  function fillCompareBoxes(urls) {
    const list = urls.map(typedHost).slice(0, COMPARE_IDS.length);
    compareInputs().forEach((input, index) => { input.value = list[index] || ""; });
    compareMore().forEach((row, index) => { row.hidden = index + 1 >= list.length; });
    syncCompareAdd();
  }

  // Adds sites after the ones already typed, skipping any already there. Answers how many were added.
  function addCompareHosts(hosts) {
    const typed = compareUrls();
    const seen = new Set(typed.map(siteKey));
    const fresh = hosts.filter((host) => !seen.has(siteKey(host)) && seen.add(siteKey(host)));
    const room = COMPARE_IDS.length - typed.length;
    fillCompareBoxes(typed.concat(fresh.slice(0, room)));
    return { added: Math.min(fresh.length, room), full: fresh.length > room };
  }

  // only: the sites to compare instead of the boxes, as when a natural competitor's Compare is pressed.
  async function startCompare(only) {
    const report = current && current.report;
    const error = document.getElementById("compare-error");
    error.textContent = "";
    if (!report || current.sample) return;
    const own = siteKey(report.host);
    const urls = [];
    for (const url of Array.isArray(only) ? only : compareUrls()) {
      if (/\s/.test(url)) {
        error.textContent = "Check the address " + url + ": it has a space in it.";
        return;
      }
      if (siteKey(url) === own) {
        error.textContent = url + " is the site of this report. Enter a competitor's address.";
        return;
      }
      if (!urls.some((seen) => siteKey(seen) === siteKey(url))) urls.push(url);
    }
    if (!urls.length) {
      error.textContent = "Enter the competitor's address.";
      return;
    }
    if (activeRun) {
      error.textContent = "Wait until the review that is running ends.";
      return;
    }
    if (pricing) return;
    // The request form sits behind the report, so an empty Name takes the account's name, or its email, and a
    // name still missing is said here before the report closes.
    const name = document.getElementById("name");
    if (!name.value.trim() && window.ReviewAuth && ReviewAuth.signedIn()) name.value = ReviewAuth.who().name || ReviewAuth.who().email;
    if (clientErrors().some((item) => item.field === "name")) {
      error.textContent = rc.t("compareName");
      return;
    }
    const stored = savedCompare();
    const kept = stored && stored.id === report.id ? stored : null;
    const limits = report.limits || {};
    compareTarget = {
      id: report.id,
      url: urls[0],
      queue: urls.slice(1),
      total: urls.length,
      report,
      frameworks: kept ? kept.frameworks : ((current.frameworks && current.frameworks.length) ? current.frameworks : selectedFrameworks()),
      tools: kept ? kept.tools : selectedTools(),
      pages: kept ? kept.pages : (limits.maxPages || selectedPages()),
      depth: kept ? kept.depth : (limits.maxDepth || selectedDepth()),
      done: kept && kept.paid ? kept.done || [] : [],
      paid: false
    };
    // Competitors already paid for go straight on; otherwise the server's total is shown before anything starts.
    if (!(kept && kept.paid)) {
      const target = compareTarget;
      const answer = await confirmCompare(target, urls);
      if (answer === false) {
        compareTarget = null;
        return;
      }
      if (answer) target.confirmed = true;
      compareTarget = target;
    }
    try { sessionStorage.setItem(COMPARE_KEY, JSON.stringify(compareTarget)); } catch (storageError) { /* only a payment round trip needs it */ }
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_compare", "URL Review", report.host || "");
    closeDashboard();
    // requestSubmit would stop on the empty required address of a report opened from a link.
    reviewForm.dispatchEvent(new Event("submit", { cancelable: true }));
  }

  function compareDone(compare, tail) {
    const failed = compare.failed || [];
    const host = (compare.report && compare.report.host) || "your site";
    return "The comparisons are done. Your report of " + host + " lists each one under Next to a competitor." +
      (failed.length ? " These did not finish: " + failed.join(", ") + "." : "") + tail;
  }

  // compare.done: the competitor reviews that finished. Two or more open with the report as one
  // comparison, so every competitor is side by side and not only the last one.
  // The base report is drawn again behind the comparison and stays in the address, so closing the comparison
  // goes back to it and not to the competitor that finished last. reasons: why each failed competitor stopped.
  async function openCompared(compare, reasons) {
    const ids = [compare.id].concat(compare.done || []);
    if (ids.length < 3 || !window.QAReviewMulti) return;
    const id = await QAReviewMulti.save(ids, "review", null);
    if (!id) {
      setStatus(compareDone(compare, " Open your report of " + ((compare.report && compare.report.host) || "your site") + " and press Open the full comparison report to see them side by side."), true);
      return;
    }
    history.pushState(null, "", location.pathname + "?report=" + encodeURIComponent(compare.id) + "&comparison=" + encodeURIComponent(id));
    await reopenFixList(compare.id);
    QAReviewMulti.load(id, { failed: (compare.failed || []).map((host) => ({ host, note: (reasons || {})[host] || "" })) });
  }

  function compareStep(compare) {
    const total = compare.total || 1;
    return total > 1 ? " (" + (total - (compare.queue || []).length) + " of " + total + ")" : "";
  }

  // Natural competitors (functions/url-review-rivals.js): the reader picks any or many, and each one with
  // a public review is set next to this report, in full once it is paid and under the frost before.
  // field: the kind of competition picked ("" is the site's own field, "topic" a typed topic).
  const rivals = { id: "", data: null, picked: new Set(), open: false, field: "", topic: "", asked: "" };

  function paintRivals(report, sample) {
    const box = document.getElementById("rivals");
    if (!box) return;
    rivals.id = report && !sample && report.status !== "stopped" && report.insights ? report.id : "";
    rivals.field = "";
    rivals.topic = "";
    box.hidden = !rivals.id;
    if (!rivals.id) return;
    loadRivals(report);
  }

  function loadRivals(report) {
    const box = document.getElementById("rivals");
    const asked = [rivals.id, rivals.field, rivals.topic].join("|");
    rivals.asked = asked;
    rivals.data = null;
    rivals.picked.clear();
    box.innerHTML = rivalsHead(report) + '<p class="meta-line" role="status">' + esc(cc.t("rivalsLooking")) + "</p>";
    wireRivalsKind(report);
    fetch(endpoint() + "/review/rivals", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign(window.ReviewAuth ? ReviewAuth.proof() : {}, { id: rivals.id, field: rivals.field, topic: rivals.field === "topic" ? rivals.topic : "" }))
    })
      .then((res) => res.json().then((body) => { if (!res.ok) throw new Error(body.error || cc.t("rivalsFailed")); return body; }))
      .then((body) => {
        if (rivals.asked !== asked) return;
        rivals.data = body.rivals || { list: [] };
        // A picked field shows all it found; the site's own field shows the ones already reviewed.
        rivals.data.list.filter((row) => rivals.field || row.ready).forEach((row) => rivals.picked.add(row.host));
        drawRivals(report);
      })
      .catch((error) => {
        if (rivals.asked !== asked) return;
        if (!rivals.field) {
          box.hidden = true;
          return;
        }
        rivals.data = { list: [], error: error.message };
        drawRivals(report);
      });
  }

  function rivalsFieldName() {
    return rivals.field === "topic" ? rivals.topic : rivals.field ? cc.kind(rivals.field) : "";
  }

  function rivalsHead(report) {
    const intro = rivals.field ? cc.t("rivalsFieldIntro", { field: strong(rivalsFieldName()), site: strong(report.host) }) : cc.t("rivalsIntro", { site: strong(report.host) });
    const topic = rivals.field === "topic";
    const options = ['<option value="">' + esc(cc.t("kindSame", { site: report.host })) + "</option>"]
      .concat(cc.kinds().map((id) => '<option value="' + id + '"' + (rivals.field === id ? " selected" : "") + ">" + esc(cc.kind(id)) + "</option>"))
      .concat('<option value="topic"' + (topic ? " selected" : "") + ">" + esc(cc.t("kindTopic")) + "</option>");
    return '<h3 class="cmp-h">' + esc(cc.t("rivalsTitle")) + "</h3>" +
      '<div class="rivals-kind no-print"><label for="rivals-kind">' + esc(cc.t("kindLabel")) + '</label><select id="rivals-kind">' + options.join("") + "</select>" +
      '<input id="rivals-topic" type="text" maxlength="60" autocomplete="off" aria-label="' + esc(cc.t("kindTopic")) + '" placeholder="' + esc(cc.t("kindTopicPh")) + '" value="' + esc(rivals.topic) + '"' + (topic ? "" : " hidden") + ">" +
      '<button class="btn btn-ghost" id="rivals-topic-go" type="button"' + (topic ? "" : " hidden") + ">" + esc(cc.t("kindSearch")) + "</button></div>" +
      '<p class="meta-line">' + intro + "</p>";
  }

  function wireRivalsKind(report) {
    const select = document.getElementById("rivals-kind");
    const topic = document.getElementById("rivals-topic");
    const go = document.getElementById("rivals-topic-go");
    const search = () => {
      const value = topic.value.replace(/\s+/g, " ").trim();
      if (value.length < 2) return topic.focus();
      rivals.field = "topic";
      rivals.topic = value;
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_rivals_kind", "URL Review", "topic");
      loadRivals(report);
    };
    select.addEventListener("change", () => {
      if (select.value === "topic") {
        topic.hidden = false;
        go.hidden = false;
        topic.focus();
        return;
      }
      rivals.field = select.value;
      rivals.topic = "";
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_rivals_kind", "URL Review", select.value || "same");
      loadRivals(report);
    });
    go.addEventListener("click", search);
    topic.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      search();
    });
  }

  function drawRivals(report) {
    const box = document.getElementById("rivals");
    const list = (rivals.data && rivals.data.list) || [];
    if (!list.length) {
      const why = rivals.data && rivals.data.error ? rivals.data.error : cc.t(rivals.field ? "rivalsFieldNone" : "rivalsNone");
      box.innerHTML = rivalsHead(report) + '<p class="muted" role="status">' + esc(why) + "</p>";
      wireRivalsKind(report);
      return;
    }
    const picked = list.filter((row) => rivals.picked.has(row.host));
    const options = list.map((row) => {
      const facts = [row.rank ? "#" + row.rank.toLocaleString(cc.lang) : "", row.ready ? "" : cc.t("rivalsNotYet")].filter(Boolean).join(" · ");
      return '<label class="rival-option"><input type="checkbox" value="' + esc(row.host) + '"' + (rivals.picked.has(row.host) ? " checked" : "") + '> <span translate="no">' + esc(row.host) + "</span>" +
        (facts ? "<small>" + esc(facts) + "</small>" : "") + "</label>";
    }).join("");
    box.innerHTML = rivalsHead(report) +
      '<details class="rivals-pick"' + (rivals.open ? " open" : "") + '><summary>' + esc(picked.length ? cc.t("rivalsPick", { n: picked.length }) : cc.t("rivalsChoose")) + "</summary>" +
      '<div class="rivals-options" role="group" aria-label="' + esc(cc.t("rivalsChoose")) + '">' + options + "</div></details>" +
      (report.compare ? "" : '<p class="rivals-add no-print"><button class="btn btn-ghost" id="rivals-add" type="button"' + (picked.length ? "" : " disabled") + ">" + esc(cc.t("rivalsAdd")) + '</button> <span class="meta-line" id="rivals-added" role="status"></span></p>') +
      (picked.length ? rivalsTable(report, picked, !!rivals.data.paid) : '<p class="muted">' + esc(cc.t("rivalsPickOne")) + "</p>");
    wireRivalsKind(report);
    box.querySelector(".rivals-pick").addEventListener("toggle", (event) => { rivals.open = event.target.open; });
    const add = document.getElementById("rivals-add");
    if (add) add.addEventListener("click", () => {
      if (document.getElementById("compare-ask").hidden) paintCompare(report, false);
      const done = addCompareHosts(picked.map((row) => row.host));
      document.getElementById("rivals-added").textContent = [done.added ? cc.t("rivalsAdded", { n: done.added }) : "", done.full ? cc.t("rivalsBoxesFull") : ""].filter(Boolean).join(" ");
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_rivals_add", "URL Review", rivals.field || "same");
    });
    box.querySelectorAll(".rivals-options input").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) rivals.picked.add(input.value);
      else rivals.picked.delete(input.value);
      drawRivals(report);
    }));
    box.querySelectorAll("[data-rival-full]").forEach((button) => button.addEventListener("click", () => {
      const row = list.find((item) => item.host === button.getAttribute("data-rival-full"));
      if (!row || !row.compare) return;
      paintCompare(Object.assign({}, report, { compare: row.compare }), false);
      document.getElementById("compare-result").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    box.querySelectorAll("[data-rival-run]").forEach((button) => button.addEventListener("click", () => startCompare([button.getAttribute("data-rival-run")])));
  }

  // One column per site. On a preview the competitors' cells hold placeholders under the frost:
  // the server sends no competitor score until the report is paid.
  // Each row's leader gets the check the head-to-head uses; open problems lead when fewest.
  function rivalsTable(report, picked, paid) {
    const score = report.insights.score || {};
    const ownArea = (name) => { const area = (score.areas || {})[name]; return area && typeof area.score === "number" ? area.score : null; };
    const kpi = (cmp, key) => (cmp.kpis || []).find((item) => item.key === key) || {};
    const areaOf = (cmp, name) => (cmp.areas || []).find((item) => item.area === name) || {};
    const read = (row, pick) => paid && row.compare ? pick(row.compare) : null;
    const open = score.totals ? (score.totals.fail || 0) + (score.totals.risk || 0) : null;
    const rows = [[cc.t("overall"), score.overall, (row) => read(row, (cmp) => cmp.overall.rival), "high"]]
      .concat(["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"].map((name) =>
        [cc.area(name), ownArea(name), (row) => read(row, (cmp) => areaOf(cmp, name).rival), "high"]))
      .concat([
        [cc.t("rivalsOpen"), open, (row) => read(row, (cmp) => kpi(cmp, "open").rival), "low"],
        [cc.t("rivalsWon"), null, (row) => read(row, (cmp) => cmp.dominance ? cmp.dominance.own + "–" + cmp.dominance.rival : null), ""],
        [cc.t("rivalsRank"), null, (row) => row.rank ? "#" + row.rank.toLocaleString(cc.lang) : null, ""]
      ]);
    const td = (value, best, own, toned) => {
      const cls = [own ? "rival-own" : "", value != null && value === best ? "won" : "", value == null ? "muted" : ""].filter(Boolean).join(" ");
      const body = value == null ? "–" : toned ? '<b style="color:' + scoreColor(value) + '">' + value + "</b>" : "<span>" + esc(String(value)) + "</span>";
      return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + body + "</td>";
    };
    const frost = '<td class="rival-frost" aria-hidden="true">00</td>';
    const body = rows.map(([label, own, pick, lead], index) => {
      const values = picked.map(pick);
      const numbers = [own].concat(values).filter((value) => typeof value === "number");
      const best = paid && lead && numbers.length > 1 ? (lead === "high" ? Math.max : Math.min).apply(null, numbers) : null;
      const toned = index < 7;
      return '<tr><th scope="row">' + esc(label) + "</th>" + td(own, best, true, toned) +
        picked.map((row, i) => !paid && index < rows.length - 1 ? frost : td(values[i], best, false, toned)).join("") + "</tr>";
    }).join("");
    const actions = paid ? '<tr class="rival-actions"><th></th><td class="rival-own"></td>' + picked.map((row) => "<td>" + (row.compare
      ? '<button class="btn btn-ghost" type="button" data-rival-full="' + esc(row.host) + '">' + esc(cc.t("rivalsFull")) + "</button>"
      : '<button class="btn btn-ghost" type="button" data-rival-run="' + esc(row.host) + '">' + esc(cc.t("rivalsRun")) + "</button>") + "</td>").join("") + "</tr>" : "";
    return '<div class="compare-scroll' + (paid ? "" : " rivals-locked") + '"><table class="compare-table rivals-table"><thead><tr><th scope="col">' + esc(cc.t("rivalsMetric")) + '</th><th scope="col" class="rival-own" translate="no">' + esc(report.host) + "</th>" +
      picked.map((row) => '<th scope="col" class="rival-col" translate="no">' + esc(row.host) + "</th>").join("") + "</tr></thead><tbody>" +
      body + actions + "</tbody></table></div>" +
      (paid ? "" : '<p class="meta-line">' + esc(cc.t("rivalsLocked")) + "</p>");
  }

  function showComparing(compare) {
    const own = (compare.report && compare.report.host) || "your site";
    const many = (compare.queue || []).length + 1;
    document.getElementById("compare-run-text").textContent = many > 1
      ? "Comparing " + own + " with " + many + " competitors, up to " + COMPARE_AT_ONCE + " at a time."
      : "Comparing " + own + " with " + compare.url + compareStep(compare) + ".";
    document.getElementById("compare-running-text").textContent = many > 1
      ? "The comparison with " + many + " competitors is running. Stop keeps the pages already checked and does not start the ones still waiting."
      : "The comparison with " + compare.url + compareStep(compare) + " is running. Stop keeps the pages already checked.";
    const run = document.getElementById("compare-run");
    run.hidden = false;
    document.getElementById("compare-running").hidden = false;
    document.getElementById("compare-stop").disabled = true;
    lockCompare(true);
    // The report closes onto the top of the page, so the progress is brought into view and read out.
    run.tabIndex = -1;
    run.scrollIntoView({ block: "center" });
    run.focus({ preventScroll: true });
  }

  function hideComparing() {
    document.getElementById("compare-run").hidden = true;
    document.getElementById("compare-running").hidden = true;
    document.getElementById("compare-run-text").textContent = "";
    document.getElementById("compare-running-text").textContent = "";
    paintCompareRows(null);
    lockCompare(false);
  }

  const COMPARE_AT_ONCE = 3;
  const ROW_STATE = { waiting: "Waiting", running: "Running", done: "Ready", stopped: "Stopped", failed: "Did not finish", payment: "Waits on payment" };
  let comparePool = null;

  function paintCompareRows(pool) {
    let list = document.getElementById("compare-rows");
    if (!list && !pool) return;
    if (!list) {
      list = document.createElement("ol");
      list.id = "compare-rows";
      list.className = "compare-rows";
      list.setAttribute("aria-live", "polite");
      document.getElementById("compare-run").after(list);
    }
    list.hidden = !pool;
    if (!pool) return;
    list.innerHTML = pool.rows.map((row) => '<li data-state="' + row.state + '"><b translate="no">' + esc(row.url) + "</b> <span>" + esc(ROW_STATE[row.state]) + (row.note ? " · " + esc(row.note) : "") + "</span></li>").join("");
    const ready = pool.rows.filter((row) => row.state === "done").length;
    document.getElementById("compare-running-text").textContent = "The comparison is running: " + ready + " of " + pool.rows.length + " competitors ready. Stop keeps the pages already checked and does not start the ones still waiting.";
  }

  // The competitors of one comparison run side by side, up to three at a time, each its own review of the
  // same base report. When all have ended, the finished ones open with the report as one comparison.
  async function runComparePool(compare, confirmed) {
    const rows = [compare.url].concat(compare.queue || []).map((url) => ({ url, state: "waiting", runId: "", note: "", payload: null }));
    const pool = { rows, stopping: false, payment: null, signIn: null };
    comparePool = pool;
    activeRun = "compare";
    showComparing(compare);
    paintCompareRows(pool);
    reviewBtn.disabled = true;
    stopBtn.disabled = false;
    document.getElementById("compare-stop").disabled = false;
    const runLog = document.getElementById("run-log");
    runLog.innerHTML = "";
    runLog.classList.add("is-live");
    if (window.ReviewProgress) ReviewProgress.reset();
    setStatus("Reviewing " + rows.length + " competitors, up to " + COMPARE_AT_ONCE + " at a time.", false);
    let next = 0;
    const worker = async () => {
      while (next < rows.length && !pool.stopping && !pool.payment && !pool.signIn) await runCompareRow(compare, pool, rows[next++]);
    };
    try {
      await Promise.all(Array.from({ length: Math.min(COMPARE_AT_ONCE, rows.length) }, worker));
    } finally {
      runLog.classList.remove("is-live");
      activeRun = "";
      comparePool = null;
      hideComparing();
      reviewBtn.disabled = !signedIn();
      stopBtn.disabled = true;
    }
    endComparePool(compare, pool, confirmed);
  }

  async function runCompareRow(compare, pool, row) {
    row.runId = hexId();
    row.state = "running";
    paintCompareRows(pool);
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_start", "URL Review", "compare");
    fetch(endpoint() + "/place", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: row.runId })
    }).catch(() => {});
    try {
      const res = await fetch(runEndpoint() + "/review", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: reviewBody(compare, row.url, row.runId)
      });
      const payload = await readStream(res, row.url);
      if (!payload || !payload.report) throw new Error("The review ended without a report.");
      payload.reasonCode = "compare";
      row.payload = payload;
      row.state = payload.report.status === "stopped" ? "stopped" : "done";
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_done", "URL Review", payload.report.host);
    } catch (error) {
      if (error.body && error.body.signIn) {
        pool.signIn = pool.signIn || error;
        row.state = "waiting";
      } else if (error.paymentRequired && error.body && error.body.purpose === "new-run") {
        pool.payment = pool.payment || error.body;
        row.state = "payment";
      } else {
        const field = (error.fields || []).find((item) => item.field === "url");
        row.state = "failed";
        row.note = ((field && field.message) || error.message || "The review failed.").replace(/([^.!?])\s*$/, "$1.");
        if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_blocked", "URL Review", row.note);
      }
    }
    paintCompareRows(pool);
  }

  function endComparePool(compare, pool, confirmed) {
    const rows = pool.rows;
    const ran = Object.assign({}, compare, {
      done: (compare.done || []).concat(rows.filter((row) => row.state === "done").map((row) => row.payload.report.id)),
      failed: (compare.failed || []).concat(rows.filter((row) => row.state === "failed").map((row) => row.url))
    });
    const pending = rows.filter((row) => row.state === "waiting" || row.state === "payment").map((row) => row.url);
    const last = rows.filter((row) => row.payload).pop();
    // Two or more finished open as one comparison over the base report; one alone is drawn as its pair.
    if (last && ran.done.length < 2) {
      layer = "All";
      render(last.payload);
      loadStanding();
      dash.scrollTop = 0;
    }
    if (pool.signIn) {
      ReviewAuth.expire(pool.signIn.message);
      ReviewAuth.focus();
      setStatus(pool.signIn.message, true);
      return;
    }
    if (pool.payment && pending.length) {
      // The ones already finished are kept in done and open with the rest once those are paid and run.
      const rest = Object.assign({}, ran, { url: pending[0], queue: pending.slice(1), total: pending.length, paid: false });
      try { sessionStorage.setItem(COMPARE_KEY, JSON.stringify(rest)); } catch (storageError) { /* only a payment round trip needs it */ }
      const due = Object.assign({}, pool.payment, { compareWith: compare.id, competitors: confirmed ? pending.length : 1 });
      if (confirmed) location.href = payQuery("new-run", due);
      else openRunPay(due);
      setStatus("The comparison waits on payment: 9 USD for each competitor still to run.", true);
      return;
    }
    try { sessionStorage.removeItem(COMPARE_KEY); } catch (storageError) { /* nothing was kept */ }
    const notStarted = pool.stopping && pending.length ? " Stopped: " + pending.join(", ") + (pending.length === 1 ? " was" : " were") + " not started." : "";
    if (ran.done.length) {
      setStatus(compareDone(ran, notStarted), !!ran.failed.length);
      openCompared(ran, Object.fromEntries(rows.filter((row) => row.state === "failed").map((row) => [row.url, row.note])));
      return;
    }
    const why = rows.filter((row) => row.note).map((row) => row.url + ": " + row.note).join(" ");
    if (!last && reopenCompare(Object.assign({}, compare, { url: rows[0].url, queue: rows.slice(1).map((row) => row.url) }), "None of the competitor reviews finished. " + why)) {
      setStatus("The comparison did not finish. Your report is open again.", true);
      return;
    }
    setStatus(compareDone(ran, notStarted), true);
  }

  function lockCompare(locked) {
    document.querySelectorAll("#compare-go, #compare-add, .compare-remove").forEach((button) => { button.disabled = locked; });
    compareInputs().forEach((input) => { input.disabled = locked; });
  }

  function backToReport() {
    if (!current) return;
    dash.classList.add("open");
    document.body.style.overflow = "hidden";
    document.getElementById("compare").scrollIntoView({ block: "start" });
  }

  function reopenCompare(compare, message) {
    if (!current || !current.report || current.report.id !== compare.id) return false;
    hideComparing();
    dash.classList.add("open");
    document.body.style.overflow = "hidden";
    fillCompareBoxes([compare.url].concat(compare.queue || []));
    const input = document.getElementById("compare-url");
    document.getElementById("compare-error").textContent = message;
    document.getElementById("compare").scrollIntoView({ block: "start" });
    input.focus({ preventScroll: true });
    input.select();
    return true;
  }

  function paintExec(report, ins) {
    const host = slot("exec");
    if (!host) return;
    const score = ins.score || {};
    const ranked = (ins.findings || []).filter((item) => item.rank);
    const risks = ranked.slice(0, 3);
    const quick = ranked.filter((item) => item.effort === "minutes" && risks.indexOf(item) === -1).slice(0, 3);
    const solid = Object.keys(AREA_NOTE).filter((name) => {
      const area = (score.areas || {})[name];
      return area && (area.grade === "A" || area.grade === "B");
    });
    const launcher = ins.chat && ins.chat.launcher;
    const solidNote = (name) => name === "Accessibility" && !(launcher && !launcher.hidden)
      ? AREA_NOTE[name].split(", ").filter((part) => part !== cc.areaNote("chatItem")).join(", ")
      : AREA_NOTE[name];
    const sev = score.severities || {};
    const read = (report.limits && report.limits.pagesRead) || (report.pages || []).length;
    const found = foundCount(report.limits);
    const list = (rows) => rows.length ? "<ul>" + rows.map((item) => "<li><strong>" + esc(said(item, "title")) + '</strong> <span class="meta-line">' + esc(cc.area(item.area)) + "</span></li>").join("") + "</ul>" : '<p class="muted">' + esc(rc.t("noneFound")) + "</p>";
    const value = score.overall || 0;
    const letter = score.grade || gradeOf(value);
    host.innerHTML =
      historyBlock(report.history) +
      '<div class="exec-head"><span class="grade grade-' + esc(letter) + '">' + esc(letter) + "</span><p>" + esc(healthSummary(ins) || rc.t("outOf", { n: value })).replace(/\.(?=[^\s.])/g, ".<wbr>") + "</p></div>" +
      '<p class="meta-line">' + esc(rc.t("sevLine", { critical: sev.critical || 0, high: sev.high || 0, medium: sev.medium || 0, low: sev.low || 0 })) + " · " +
      esc(rc.t(found ? "readOf" : "read", { n: read, found: found })) + (report.browser && report.browser.ok ? " · " + esc(rc.t("headless")) : "") + "</p>" +
      '<div class="exec-cols"><div><h3>' + esc(rc.t("risks")) + "</h3>" + list(risks) + "</div><div><h3>" + esc(rc.t("quick")) + "</h3>" + list(quick) + "</div><div><h3>" + esc(rc.t("solid")) + "</h3>" +
      (solid.length ? "<ul>" + solid.map((name) => "<li><strong>" + esc(cc.area(name)) + '</strong> <span class="meta-line">' + esc(solidNote(name)) + "</span></li>").join("") + "</ul>" : '<p class="muted">' + esc(rc.t("noSolid")) + "</p>") + "</div></div>" +
      (slotRoot ? "" : '<p class="no-print"><button class="btn btn-ghost" id="print-exec" type="button">' + esc(rc.t("printSummary")) + "</button></p>");
    if (!slotRoot) document.getElementById("print-exec").addEventListener("click", () => {
      const sheet = () => {
        document.body.classList.add("printing-exec");
        window.print();
      };
      if (current && current.report && fixListOpen(current.report.id)) {
        sheet();
        return;
      }
      spend("print", () => {
        if (!current.paid) setStatus("The print sheet does not include the report. The attempt is recorded.", false);
        sheet();
      });
    });
  }

  function paintFixFirst(ins, paid) {
    const top = (ins.findings || []).filter((item) => item.rank).slice(0, 10);
    slot("fix-first").innerHTML = top.length
      ? '<p class="muted">' + esc(rc.t("fixIntro")) + '</p><ol class="fix-list">' + top.map((item) =>
        '<li><span class="fix-rank">' + item.rank + "</span><div>" + verdictBadge(item.verdict, item.severity) + '<span class="badge">' + esc(cc.area(item.area)) + "</span>" +
        "<strong>" + esc(said(item, "title")) + "</strong>" +
        '<p class="meta-line">' + fadeText(said(item, "evidence"), paid) + "</p>" +
        (item.fix ? '<p class="fix-line">' + fadeText(said(item, "fix"), paid) + "</p>" : "") +
        '<p class="meta-line">' + esc(rc.t("effort", { effort: rc.word("effortWord", item.effort) })) + (item.count > 1 ? " · " + esc(rc.t("places", { n: item.count })) : "") + "</p></div></li>").join("") + "</ol>"
      : '<p class="muted">' + esc(rc.t("fixNone")) + "</p>";
  }

  function cut(text, max) {
    const raw = String(text || "");
    return raw.length > max ? raw.slice(0, max - 1).replace(/\s+\S*$/, "") + " …" : raw;
  }

  function paintPreviews(ins) {
    const g = (ins.previews && ins.previews.google) || {};
    const s = (ins.previews && ins.previews.social) || {};
    const icon = g.icon ? '<img src="' + esc(g.icon) + '" alt="" referrerpolicy="no-referrer" loading="lazy" data-fallback="dot">' : '<span class="serp-dot"></span>';
    const notes = [];
    if (g.titleCut) notes.push(rc.t("titleCut"));
    if (!g.description) notes.push(rc.t("noDescription"));
    else if (g.descriptionCut) notes.push(rc.t("descriptionCut"));
    if (!g.icon) notes.push(rc.t("noFavicon"));
    const shareNotes = [];
    if (!s.image) shareNotes.push(rc.t("noOgImage"));
    if (s.fallback) shareNotes.push(rc.t("ogFallback"));
    if (!s.card) shareNotes.push(rc.t("noTwitterCard"));
    slot("previews").innerHTML =
      '<div><div class="serp notranslate" translate="no"><div class="serp-site">' + icon + "<div>" + esc(g.site || "") + "<small>https://" + esc(g.url || "") + "</small></div></div>" +
      "<h3>" + esc(cut(g.title || rc.t("noTitle"), 62)) + "</h3><p>" + esc(cut(g.description || rc.t("googlePicks"), 160)) + "</p></div>" +
      '<p class="preview-note">' + esc(notes.join(" ") || rc.t("serpFits")) + "</p></div>" +
      '<div><div class="share notranslate" translate="no"><div class="share-img">' + (s.image ? '<img src="' + esc(s.image) + '" alt="" referrerpolicy="no-referrer" loading="lazy" data-fallback="image">' : "<span>" + esc(rc.t("noOgImageBox")) + "</span>") + "</div>" +
      '<div class="share-body"><small>' + esc(s.host || "") + "</small><strong>" + esc(cut(s.title || rc.t("noTitle"), 90)) + "</strong><p>" + esc(s.description || "") + "</p></div></div>" +
      '<p class="preview-note">' + esc(shareNotes.join(" ") || rc.t("shareFits")) + "</p></div>";
    slot("previews").querySelectorAll("img[data-fallback]").forEach((img) => {
      img.addEventListener("error", () => {
        const stand = document.createElement("span");
        if (img.getAttribute("data-fallback") === "dot") stand.className = "serp-dot";
        else stand.textContent = rc.t("ogNotLoaded");
        img.replaceWith(stand);
      }, { once: true });
    });
  }

  function gaugeHtml(label, value, good, poor, max, text) {
    const state = value <= good ? "pass" : value <= poor ? "risk" : "fail";
    const at = Math.min(100, (value / max) * 100);
    return '<div class="gauge ' + state + '"><div class="gauge-top"><b>' + esc(label) + "</b><span>" + esc(text) + "</span></div>" +
      '<div class="gauge-bar" role="img" aria-label="' + esc(label + " " + text + ", " + rc.word("gaugeState", state)) + '">' +
      '<i style="width:' + (good / max * 100).toFixed(1) + '%"></i><i style="width:' + ((poor - good) / max * 100).toFixed(1) + '%"></i><i></i><u style="left:' + at.toFixed(1) + '%"></u></div></div>';
  }

  function speedBlock(psi) {
    if (!psi || !psi.ok) return "";
    const field = psi.field;
    const lighthouse = rc.t("lighthouse", { score: psi.score });
    if (!field) return '<p class="meta-line">' + esc(rc.t("psiNoField")) + " " + esc(lighthouse) + "</p>";
    const rows = [];
    if (field.lcp) rows.push(gaugeHtml("Largest Contentful Paint", field.lcp.p75, 2500, 4000, 6000, (field.lcp.p75 / 1000).toFixed(1) + " s"));
    if (field.inp) rows.push(gaugeHtml("Interaction to Next Paint", field.inp.p75, 200, 500, 800, field.inp.p75 + " ms"));
    if (field.cls) rows.push(gaugeHtml("Cumulative Layout Shift", field.cls.p75, 0.1, 0.25, 0.5, String(field.cls.p75)));
    return '<h3 class="speed-title">' + esc(rc.t("realVisitors")) + '</h3><div class="gauges">' + rows.join("") + "</div>" +
      '<p class="meta-line">' + esc(rc.t(field.scope === "page" ? "fieldPage" : "fieldSite")) + " " + esc(lighthouse) + "</p>";
  }

  function paintBrowser(report) {
    const host = slot("browser-pass");
    if (!host) return;
    const b = report.browser;
    const speed = speedBlock(report.pagespeed);
    const carbon = carbonLine(report.insights && report.insights.carbon);
    const talk = report.chatTalk;
    if (!b || !b.ok) {
      host.innerHTML = speed + carbon + '<p class="muted">' + esc(b && b.error ? rc.t("noBrowserError", { error: b.error }) : rc.t("noBrowser")) + "</p>" + talkHtml(talk);
      return;
    }
    const start = b.start || {};
    const vit = start.vitals || {};
    const consent = b.consent || {};
    const before = consent.before || { vendors: [], cookies: [] };
    const after = consent.rejected ? consent.after : null;
    const hits = (rows) => (rows || []).reduce((sum, row) => sum + (row.hits || 0), 0);
    const beforeBad = hits(before.vendors) + (before.cookies || []).length;
    const afterBad = after ? hits(after.vendors) + (after.cookies || []).length : 0;
    const pings = (rows) => (rows || []).reduce((sum, row) => sum + (row.denied || 0), 0);
    const quiet = (rows, none) => pings(rows) ? rc.t("quiet", { n: pings(rows) }) : none;
    const axePages = (b.axe && b.axe.ran && b.axe.pages) || [];
    const rules = new Map();
    axePages.forEach((page) => (page.violations || []).forEach((rule) => {
      const row = rules.get(rule.id) || { id: rule.id, impact: rule.impact, help: rule.help, helpUrl: rule.helpUrl, nodes: 0, pages: 0 };
      row.nodes += rule.nodes;
      row.pages += 1;
      rules.set(rule.id, row);
    }));
    const mobile = b.mobile || {};
    const tablet = b.tablet || {};
    const errors = (b.console && b.console.errors) || 0;
    const failed = (b.failed && b.failed.count) || 0;
    const watch = b.watch || {};
    const watchAfter = consent.rejected ? watch.after : null;
    const printers = (row) => row ? [...new Set([].concat(...["canvas", "fonts", "webgl", "audio"].map((key) => (row.fingerprint || {})[key] || [])))] : [];
    const recording = (row) => row ? (row.recorders || []).filter((rr) => rr.sent).map((rr) => rr.name) : [];
    const typedTo = (row) => row && row.typed ? row.typed.sent.map((s) => s.host) : [];
    const spied = watch.before ? printers(watch.before).filter((h) => (watch.before.guards || []).indexOf(h) === -1).length + recording(watch.before).length + typedTo(watch.before).length + typedTo(watchAfter).length : 0;
    const watchText = watch.before ? [
      printers(watch.before).length ? rc.t("fpScripts", { n: printers(watch.before).length }) : "",
      recording(watch.before).length ? rc.t("recorders", { n: recording(watch.before).length }) : "",
      typedTo(watch.before).length || typedTo(watchAfter).length ? rc.t("typingSent") : ""
    ].filter(Boolean).join(" · ") || rc.t("noneSeen") : rc.t("notChecked");
    const tiles = [
      [rc.t("tileBefore"), beforeBad ? (consent.banner ? "fail" : "risk") : "pass", beforeBad ? rc.t("signals", { n: beforeBad }) : quiet(before.vendors, rc.t("nothingTracked"))],
      [rc.t("tileAfter"), after ? (afterBad ? "fail" : "pass") : "unknown", after ? (afterBad ? rc.t("stillTracked", { n: afterBad }) : quiet(after.vendors, rc.t("trackingStopped"))) : rc.t(consent.banner ? "rejectNotFound" : "noBanner")],
      [rc.t("tileWatch"), !watch.before ? "unknown" : spied ? (consent.banner ? "fail" : "risk") : printers(watch.before).length ? "risk" : "pass", watchText],
      ["axe-core", axePages.length ? (rules.size ? "fail" : "pass") : "unknown", axePages.length ? rc.t("axeFail", { rules: rules.size, n: axePages.length }) : rc.t("didNotRun")],
      [rc.t("tilePhone"), mobile.width ? (mobile.overflow > 2 ? "fail" : "pass") : "unknown", mobile.width ? (mobile.overflow > 2 ? rc.t("tooWide", { n: mobile.overflow }) : rc.t("fits", { n: mobile.width })) : rc.t("notChecked")],
      [rc.t("tileFirstPaint"), vit.fcp ? (vit.fcp > 3000 ? "fail" : vit.fcp > 1800 ? "risk" : "pass") : "unknown", vit.fcp ? rc.t("labSeconds", { s: (vit.fcp / 1000).toFixed(1) }) : rc.t("notMeasured")],
      [rc.t("tileTablet"), tablet.width ? (tablet.overflow > 2 ? "fail" : "pass") : "unknown", tablet.width ? (tablet.overflow > 2 ? rc.t("tooWide", { n: tablet.overflow }) : rc.t("fits", { n: tablet.width })) : rc.t("notChecked")],
      [rc.t("tileText"), start.renderedWords > 150 ? (start.share < 40 ? "risk" : "pass") : "unknown", rc.t("htmlShare", { n: start.share == null ? 100 : start.share })],
      [rc.t("tileErrors"), errors || failed ? "risk" : "pass", rc.t("loadErrors", { scripts: errors, files: failed })]
    ];
    const cell = (row) => {
      if (!row) return "—";
      const parts = [];
      if (row.hits) parts.push(rc.t("requests", { n: row.hits }));
      if (row.denied) parts.push(rc.t("pings", { n: row.denied }));
      if (row.loads && !parts.length) parts.push(rc.t("loadedNothing"));
      return parts.join(" · ") || "—";
    };
    const names = [];
    (before.vendors || []).concat(after ? after.vendors || [] : []).forEach((row) => { if (names.indexOf(row.name) === -1) names.push(row.name); });
    const find = (rows, name) => (rows || []).find((row) => row.name === name);
    const cookieList = (rows) => (rows || []).length ? rows.slice(0, 6).map((row) => row.name + (row.third ? " (" + row.domain + ")" : "")).join(", ") + (rows.length > 6 ? " …" : "") : rc.t("none");
    const consentRows = names.map((name) => "<tr><td><strong>" + esc(name) + "</strong></td><td>" + esc(cell(find(before.vendors, name))) + "</td><td>" + (after ? esc(cell(find(after.vendors, name))) : "—") + "</td></tr>").join("") +
      "<tr><td><strong>" + esc(rc.t("trackingCookies")) + '</strong></td><td class="notranslate" translate="no">' + esc(cookieList(before.cookies)) + '</td><td class="notranslate" translate="no">' + (after ? esc(cookieList(after.cookies)) + (after.kept ? " · " + esc(rc.t("keptBefore", { n: after.kept })) : "") : "—") + "</td></tr>" +
      (watch.before ? [
        [rc.t("fingerprinting"), (row) => printers(row).join(", ") || rc.t("none")],
        [rc.t("sessionRecording"), (row) => (row.recorders || []).map((rr) => rr.sent ? rr.name : rc.t("loadedOnly", { name: rr.name })).join(" · ") || rc.t("none")],
        [rc.t("typedBefore"), (row) => !row.typed ? rc.t("noContactField") : row.typed.sent.length ? row.typed.sent.map((s) => s.host).join(", ") : rc.t("sentNowhere")]
      ].map(([label, text]) => "<tr><td><strong>" + esc(label) + '</strong></td><td class="notranslate" translate="no">' + esc(text(watch.before)) + '</td><td class="notranslate" translate="no">' + (watchAfter ? esc(text(watchAfter)) : "—") + "</td></tr>").join("") : "");
    const bannerLine = consent.banner
      ? esc(consent.banner === "A cookie banner" ? rc.t("bannerGenericShowing") : rc.t("bannerShowing", { banner: consent.banner })) + " " +
        esc(after ? rc.t("bannerRejected", { label: consent.rejectLabel }) : consent.banner === "Sourcepoint" ? rc.t("bannerFrame") : rc.t("bannerNoReject"))
      : esc(rc.t("noBannerFirst"));
    const order = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    const axeRows = [...rules.values()].sort((x, y) => (order[y.impact] - order[x.impact]) || (y.nodes - x.nodes)).slice(0, 10).map((rule) =>
      "<tr><td>" + esc(rule.help) + ' <a class="notranslate" translate="no" href="' + esc(rule.helpUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(rule.id) + "</a></td><td>" + esc(rc.word("impact", rule.impact)) + "</td><td>" + rule.nodes + "</td><td>" + rule.pages + "</td></tr>").join("");
    const gauge = gaugeHtml;
    const gauges = start.status ? '<div class="gauges">' +
      gauge("Largest Contentful Paint", vit.lcp || 0, 2500, 4000, 6000, ((vit.lcp || 0) / 1000).toFixed(1) + " s") +
      gauge("Cumulative Layout Shift", vit.cls || 0, 0.1, 0.25, 0.5, String(vit.cls || 0)) +
      gauge("Total Blocking Time", vit.tbt || 0, 200, 600, 1200, (vit.tbt || 0) + " ms") +
      '</div><p class="meta-line">' + esc(rc.t("labNote")) + "</p>" : "";
    const shots = b.shots || {};
    const shotCount = ["desktop", "tablet", "mobile"].filter((key) => shots[key]).length;
    const chatCard = chatHtml(report.insights && report.insights.chat) + talkHtml(talk);
    const textRows = [{ path: start.finalPath || "/", share: start.share, words: start.renderedWords, raw: start.rawWords }].concat((b.pages || []).filter((page) => !page.error).map((page) => ({ path: page.path, share: page.share, words: page.renderedWords, raw: page.rawWords })));
    host.innerHTML =
      '<div class="checks-grid" style="margin-bottom:12px">' + tiles.map(([label, state, text]) => '<div class="check-tile ' + state + '"><b>' + esc(label) + "</b>" + esc(text) + "</div>").join("") + "</div>" + speed + (gauges && report.pagespeed && report.pagespeed.field ? '<h3 class="speed-title">' + esc(rc.t("oneLab")) + "</h3>" : "") + gauges +
      (shots.desktop || shots.mobile ? '<div class="shots' + (shotCount === 3 ? " shots-3" : "") + '">' +
        (shots.desktop ? '<figure><img src="' + esc(shots.desktop) + '" alt="' + esc(rc.t("altDesktop")) + '" loading="lazy"><figcaption>' + esc(rc.t("capDesktop")) + "</figcaption></figure>" : "<div></div>") +
        (shots.tablet ? '<figure><img src="' + esc(shots.tablet) + '" alt="' + esc(rc.t("altTablet")) + '" loading="lazy"><figcaption>' + esc(rc.t("capTablet")) + "</figcaption></figure>" : "") +
        (shots.mobile ? '<figure><img src="' + esc(shots.mobile) + '" alt="' + esc(rc.t("altPhone")) + '" loading="lazy"><figcaption>' + esc(rc.t("capPhone")) + "</figcaption></figure>" : "") + "</div>" : "") +
      '<div class="split"><article class="card"><h3>' + esc(rc.t("trackingTitle")) + '</h3><p class="muted">' + bannerLine + " " + esc(rc.t("pingsNote")) + "</p>" +
      '<table class="mini-table"><thead><tr><th>' + esc(rc.t("thTool")) + "</th><th>" + esc(rc.t("tileBefore")) + "</th><th>" + esc(rc.t("tileAfter")) + "</th></tr></thead><tbody>" + consentRows + "</tbody></table></article>" +
      '<article class="card"><h3>' + esc(rc.t("textTitle")) + '</h3><p class="muted">' + esc(rc.t("textNote")) + "</p>" +
      '<table class="mini-table"><thead><tr><th>' + esc(rc.t("thPage")) + "</th><th>" + esc(rc.t("thInHtml")) + "</th><th>" + esc(rc.t("thWords")) + "</th></tr></thead><tbody>" + textRows.map((row) => '<tr><td class="notranslate" translate="no">' + esc(row.path) + "</td><td>" + (row.share == null ? "—" : row.share + "%") + "</td><td>" + (row.words || 0) + "</td></tr>").join("") + "</tbody></table></article></div>" + chatCard +
      '<article class="card" style="margin-top:12px"><h3>' + esc(rc.t("axeTitle")) + "</h3>" + (axePages.length
        ? (axeRows ? '<table class="mini-table"><thead><tr><th>' + esc(rc.t("thRule")) + "</th><th>" + esc(rc.t("thImpact")) + "</th><th>" + esc(rc.t("thElements")) + "</th><th>" + esc(rc.t("thPages")) + "</th></tr></thead><tbody>" + axeRows + "</tbody></table>" : '<p class="muted">' + esc(rc.t("axeClean", { n: axePages.length })) + "</p>") +
          '<p class="meta-line notranslate" translate="no">' + esc(axePages.map((page) => page.path).join(" · ")) + "</p>"
        : '<p class="muted">' + esc(rc.t("axeTimeout")) + "</p>") + "</article>" +
      '<p class="meta-line">' + esc([
        rc.t("browserFoot", { engine: b.engine || "Chromium", s: Math.round((b.ms || 0) / 1000), requests: start.requests || 0, hosts: start.hosts || 0 }),
        rc.t(after ? "footClick" : "footNoClick"),
        talk && talk.turns && talk.turns.length ? rc.t("footChat") : "",
        watch.before && watch.before.typed ? rc.t("footTyped") : "",
        rc.t("footLab")
      ].filter(Boolean).join(" ")) + "</p>" + carbon;
  }

  function chatHtml(chat) {
    if (!chat) return "";
    const st = chat.states || {};
    const badge = (state) => VERDICT_LABEL[state] ? verdictBadge(state) : '<span class="badge">' + esc(rc.t("notChecked")) + "</span>";
    const names = (rows) => rows.length ? '<span class="notranslate" translate="no">' + esc(rows.join(", ")) + "</span>" : esc(rc.t("noCookie"));
    const hidden = !!(chat.launcher && chat.launcher.hidden);
    const launcher = hidden ? null : chat.launcher;
    const rows = [
      [rc.t("tileBefore"), st.consent, names(chat.cookies) + (!chat.cookies.length && st.consent === "risk" ? " · " + esc(rc.t("requestsBefore", { n: chat.requests })) : "") + (chat.banner ? "" : " · " + esc(rc.t("noBannerAsked")))],
      [rc.t("tileAfter"), chat.rejected ? st.reject : "", chat.rejected ? names(chat.rejected.cookies) + " · " + esc(rc.t("chatRequests", { n: chat.rejected.requests })) : esc(rc.t(chat.banner ? "rejectNotPressed" : "noBanner"))],
      [rc.t("rowWeight"), st.weight, esc(rc.t("weightLine", { kb: chat.kb, ms: chat.ms, requests: rc.t("chatRequests", { n: chat.requests }) }))],
      [rc.t("rowLauncher"), launcher ? st.cover : "", esc(launcher ? (launcher.covers ? rc.t("covers", { n: launcher.covers }) : rc.t("coversNone")) : rc.t(hidden ? "hiddenPhone" : "notFound"))],
      [rc.t("rowName"), launcher && launcher.known ? st.name : "", esc(launcher && launcher.known ? (launcher.name ? rc.t("announced", { name: launcher.name }) : rc.t("noName")) : rc.t("notChecked"))],
      [rc.t("rowKeyboard"), chat.opened ? (st.trap === "fail" || st.focus === "risk" ? (st.trap === "fail" ? "fail" : "risk") : st.trap) : "", esc(chat.opened ? (st.trap === "fail" ? rc.t("trapped") : st.focus === "risk" ? rc.t("focusStays") : st.trap === "pass" ? rc.t("focusMoves") : VERDICT_LABEL.person) : rc.t("notOpened"))]
    ];
    return '<article class="card" style="margin-top:12px"><h3>' + esc(rc.t("chatTitle")) + '</h3><p class="muted"><span class="notranslate" translate="no">' + esc(chat.vendors.map((row) => row.name).join(", ")) + "</span>" +
      (chat.vendors.some((row) => row.ai) ? " · " + esc(rc.t("aiBot")) : "") + ". " + esc(rc.t("chatNote")) + "</p>" +
      '<table class="mini-table"><thead><tr><th>' + esc(rc.t("thCheck")) + "</th><th>" + esc(rc.t("thResult")) + "</th><th>" + esc(rc.t("thSaw")) + "</th></tr></thead><tbody>" +
      rows.map(([label, state, text]) => "<tr><td><strong>" + esc(label) + "</strong></td><td>" + badge(state) + "</td><td>" + text + "</td></tr>").join("") + "</tbody></table></article>";
  }

  function talkHtml(talk) {
    if (!talk) return "";
    const turns = talk.turns || [];
    const proof = rc.word("talkProof", talk.proof, "");
    const head = '<article class="card talk-card" style="margin-top:12px"><h3>' + esc(rc.t("talkTitle")) + '</h3><p class="muted">' +
      (talk.vendor ? '<span class="notranslate" translate="no">' + esc(talk.vendor) + "</span>" + (talk.ai ? " · " + esc(rc.t("aiBot")) : "") + ". " : "") + esc(talk.note || "") +
      (proof ? " " + esc(proof) : "") +
      (turns.length ? " " + esc(rc.t("talkPrivate")) : "") +
      (talk.status === "needs-proof" ? ' <a href="qa-review-account.html#verify">' + esc(rc.t("verifySite")) + "</a>." : "") + "</p>";
    if (!turns.length) return head + "</article>";
    const rows = (talk.checks || []).map((check) => "<tr><td><strong>" + esc(check.label) + "</strong></td><td>" + verdictBadge(check.verdict) + "</td><td>" + esc(check.evidence) + "</td></tr>").join("");
    const log = turns.map((turn) => "<li><p><strong>" + esc(rc.t("talkReview")) + '</strong> <span class="notranslate" translate="no">' + esc(turn.sent) + "</span></p><p><strong>" + esc(turn.reply ? rc.t("talkChatAfter", { s: (turn.ms / 1000).toFixed(1) }) : rc.t("talkChat")) + "</strong> " +
      (turn.reply ? '<span class="notranslate" translate="no">' + esc(turn.reply) + "</span>" : esc(rc.t("noReply"))) + "</p></li>").join("");
    return head + (rows ? '<table class="mini-table"><thead><tr><th>' + esc(rc.t("thCheck")) + "</th><th>" + esc(rc.t("thResult")) + "</th><th>" + esc(rc.t("thSaid")) + "</th></tr></thead><tbody>" + rows + "</tbody></table>" : "") +
      '<details class="talk-log"><summary>' + esc(rc.t("transcript", { n: turns.length })) + "</summary><ol>" + log + "</ol></details>" +
      '<p class="meta-line">' + esc(rc.t("talkScript")) + "</p></article>";
  }

  function carbonLine(c) {
    if (!c || !c.grams) return "";
    const size = c.bytes >= 1e6 ? (c.bytes / 1e6).toFixed(1) + " MB" : Math.round(c.bytes / 1e3) + " KB";
    return '<p class="meta-line">' + esc(rc.t("carbon", { grams: c.grams.toFixed(2), rating: c.rating, size: size, where: rc.t(c.source === "lighthouse" ? "carbonLighthouse" : "carbonCold") })) + "</p>";
  }

  function paintGeo(ins) {
    const geo = ins.geo || {};
    const view = geo.aiView || {};
    const roles = [["answers", rc.t("roleAnswers")], ["search", rc.t("roleSearch")], ["training", rc.t("roleTraining")]];
    const bots = roles.map(([role, label]) => {
      const list = (geo.crawlers || []).filter((bot) => bot.role === role);
      if (!list.length) return "";
      return '<div class="bot-role" data-role="' + role + '"><p class="bot-group">' + esc(label) + "</p>" + list.map((bot) =>
        '<div class="bot' + (bot.allowed ? "" : " no") + '"><i aria-hidden="true">' + (bot.allowed ? "✓" : "✕") + '</i><div><span class="notranslate" translate="no">' + esc(bot.token) + '</span><span class="bot-product"> — ' + esc(bot.product) + "</span>" +
        "<small>" + esc(bot.allowed ? (bot.blockedPages ? rc.t("botClosed", { n: bot.blockedPages }) : rc.t("botAllowed")) : bot.rule ? rc.t("botBlockedBy", { rule: bot.rule }) : rc.t("botBlocked")) + "</small></div></div>").join("") + "</div>";
    }).join("");
    const llms = geo.llms || {};
    const entity = geo.entity;
    const facts = [
      ["llms.txt", llms.ok && llms.complete ? "pass" : "risk", llms.ok ? rc.t(llms.complete ? "llmsSections" : "llmsIncomplete", { n: llms.sections || 0 }) : rc.t("notPublished")],
      [rc.t("factEntity"), entity ? "pass" : "risk", entity ? (entity.sameAs && entity.sameAs.length ? rc.t("profiles", { type: entity.type, n: entity.sameAs.length }) : entity.type) : rc.t("none")],
      [rc.t("factNoJs"), view.chars >= 900 ? "pass" : view.chars >= 300 ? "risk" : "fail", rc.t("chars", { n: view.chars || 0 })],
      [rc.t("factQa"), geo.questionHeadings || (geo.schemaTypes || []).indexOf("FAQPage") !== -1 ? "pass" : "risk", rc.t("questionHeadings", { n: geo.questionHeadings || 0 })]
    ];
    const outlineHtml = (view.outline || []).length ? '<ul class="ai-outline">' + view.outline.map((item) => '<li class="l' + item.level + '">H' + item.level + " · " + esc(item.text) + "</li>").join("") + "</ul>" : '<p class="muted">' + esc(rc.t("noHeadings")) + "</p>";
    slot("geo").innerHTML =
      '<div class="checks-grid" data-part="facts" style="margin-bottom:12px">' + facts.map(([label, state, text]) => '<div class="check-tile ' + state + '"><b>' + esc(label) + "</b>" + esc(text) + "</div>").join("") + "</div>" +
      '<div class="split"><article class="card"><div data-part="excerpt"><h3>' + esc(rc.t("aiTextTitle")) + '</h3><p class="muted">' + esc(rc.t(view.appShell ? "aiTextShell" : "aiTextNote")) + "</p>" +
      '<div class="ai-view notranslate" translate="no">' + esc(view.text || rc.t("noReadable")) + (view.chars > (view.text || "").length ? " …" : "") + "</div>" +
      '<p class="meta-line">' + esc(rc.t("wordsChars", { words: view.words || 0, chars: view.chars || 0 })) + '</p></div><div data-part="headings"><h3>' + esc(rc.t("headingsTitle")) + "</h3>" + outlineHtml + "</div></article>" +
      '<article class="card" data-part="crawlers"><h3>' + esc(rc.t("whoTitle")) + '</h3><p class="muted">' + esc(rc.t(geo.robotsFound ? "robotsFound" : "robotsNone")) + "</p>" + bots + "</article></div>";
  }

  function paintAnalytics(ins) {
    const a = ins.analytics || {};
    const total = ((ins.seo && ins.seo.indexability) || []).filter((row) => row.status >= 200 && row.status < 300).length || 1;
    const rows = (a.tags || []).map((tag) =>
      "<tr><td><strong>" + esc(tag.name) + "</strong>" + (tag.cookieless ? ' <span class="badge v-pass">' + esc(rc.t("cookieless")) + "</span>" : "") + '</td><td class="notranslate" translate="no">' + esc((tag.ids || []).join(", ") || "—") + "</td><td>" + esc(rc.t("pagesOf", { n: tag.pages, total: total })) + "</td></tr>").join("");
    const consent = a.consentTools && a.consentTools.length ? a.consentTools.join(", ") : rc.t("consentNone");
    const regions = (a.consentMode && a.consentMode.regions) || [];
    const storage = a.consentMode && (a.consentMode.analytics || "unset");
    const mode = a.consentMode ? (regions.length ? rc.t("modeRegions", { n: regions.length, value: storage }) : rc.t("modeValue", { value: storage })) + " · " + rc.t(a.consentMode.v2 ? "v2Present" : "v2Missing") : rc.t("noDefault");
    const utm = a.utm ? (a.utm.kept ? rc.t("utmKept") : rc.t("utmStripped", { path: a.utm.finalPath })) : rc.t("notTested");
    slot("analytics").innerHTML =
      '<div class="checks-grid" style="margin-bottom:12px">' +
      '<div class="check-tile ' + ((a.tags || []).length ? "pass" : "risk") + '"><b>' + esc(rc.t("tileTools")) + "</b>" + esc(rc.t("toolsFound", { n: (a.tags || []).length })) + "</div>" +
      '<div class="check-tile ' + (a.consentTools && a.consentTools.length ? "pass" : ((a.tags || []).some((tag) => !tag.cookieless) ? "risk" : "unknown")) + '"><b>' + esc(rc.t("tileConsentTool")) + "</b>" + esc(consent) + "</div>" +
      '<div class="check-tile ' + (a.consentMode ? ((a.consentMode.analytics === "denied" || regions.length) && a.consentMode.v2 ? "pass" : "risk") : "unknown") + '"><b>Consent Mode</b>' + esc(mode) + "</div>" +
      '<div class="check-tile ' + (a.utm ? (a.utm.kept ? "pass" : "fail") : "unknown") + '"><b>' + esc(rc.t("tileUtm")) + "</b>" + esc(utm) + "</div></div>" +
      '<article class="card">' + (rows ? '<table class="mini-table"><thead><tr><th>' + esc(rc.t("thTool")) + "</th><th>" + esc(rc.t("thIds")) + "</th><th>" + esc(rc.t("thPagesWith")) + "</th></tr></thead><tbody>" + rows + "</tbody></table>" : '<p class="muted">' + esc(rc.t("noTags")) + "</p>") +
      ((a.untagged || []).length ? '<p class="meta-line">' + esc(rc.t("untagged", { list: a.untagged.slice(0, 8).join(", ") })) + "</p>" : "") + "</article>";
  }

  function paintSeo(ins) {
    const seo = ins.seo || {};
    const rows = seo.indexability || [];
    const map = seo.sitemap || {};
    const blocked = rows.filter((row) => !row.indexable);
    const dup = (seo.duplicates && seo.duplicates.titles) || [];
    slot("seo").innerHTML =
      '<div class="stat-row"><div class="stat"><b>' + (seo.indexable || 0) + " / " + rows.length + "</b><span>" + esc(rc.t("statIndexable")) + "</span></div>" +
      '<div class="stat"><b>' + (map.found ? map.count : "—") + "</b><span>" + esc(rc.t("statSitemap")) + "</span></div>" +
      '<div class="stat"><b>' + (map.found ? (map.notListed || []).length : "—") + "</b><span>" + esc(rc.t("statNotListed")) + "</span></div>" +
      '<div class="stat"><b>' + dup.length + "</b><span>" + esc(rc.t("statShared")) + "</span></div></div>" +
      '<article class="card">' + (blocked.length
        ? '<table class="mini-table"><thead><tr><th>' + esc(rc.t("thNotIndexable")) + "</th><th>" + esc(rc.t("thWhy")) + "</th></tr></thead><tbody>" + blocked.slice(0, 30).map((row) => '<tr><td class="notranslate" translate="no">' + esc(row.path) + "</td><td>" + esc(fc.line(row.reasonMsg, row.reason)) + "</td></tr>").join("") + "</tbody></table>"
        : '<p class="muted">' + esc(rc.t("allIndexable")) + "</p>") +
      ((map.listedNotIndexable || []).length ? '<p class="meta-line">' + esc(rc.t("listedNotIndexable", { list: map.listedNotIndexable.slice(0, 6).join(", ") })) + "</p>" : "") +
      ((map.notLinked || []).length ? '<p class="meta-line">' + esc(rc.t("notLinked", { list: map.notLinked.slice(0, 6).join(", ") + (map.notLinked.length > 6 ? " …" : "") })) + "</p>" : "") +
      ((seo.schemaTypes || []).length ? '<p class="meta-line">' + esc(rc.t("schemaTypes", { list: seo.schemaTypes.join(", ") })) + "</p>" : "") + "</article>";
  }

  function paintGraph(ins) {
    const host = slot("site-graph");
    const graph = ins.graph || { nodes: [], edges: [] };
    const nodes = graph.nodes || [];
    if (nodes.length < 2) {
      host.innerHTML = '<p class="muted">' + esc(rc.t("graphOne")) + "</p>";
      return;
    }
    const parent = nodes.map((node, index) => {
      if (index === 0) return -1;
      const found = nodes.findIndex((other) => other.path === node.from);
      return found === -1 || found === index ? 0 : found;
    });
    const children = nodes.map(() => []);
    parent.forEach((p, index) => { if (p >= 0) children[p].push(index); });
    const leaves = nodes.map(() => 0);
    const countLeaves = (index) => {
      leaves[index] = children[index].length ? children[index].reduce((sum, child) => sum + countLeaves(child), 0) : 1;
      return leaves[index];
    };
    countLeaves(0);
    const maxDepth = Math.max.apply(null, nodes.map((node) => node.depth || 0).concat([1]));
    const ring = 270 / maxDepth;
    const pos = nodes.map(() => ({ x: 320, y: 320, a: 0 }));
    const place = (index, start, end) => {
      const mid = (start + end) / 2;
      const r = (nodes[index].depth || 0) * ring;
      pos[index] = { x: 320 + r * Math.cos(mid), y: 320 + r * Math.sin(mid), a: mid };
      let cursor = start;
      children[index].forEach((child) => {
        const span = (end - start) * (leaves[child] / leaves[index]);
        place(child, cursor, cursor + span);
        cursor += span;
      });
    };
    place(0, -Math.PI / 2, Math.PI * 1.5);
    const color = (node, index) => {
      if (index === 0) return "var(--text)";
      if (!node.status || node.status >= 400) return "var(--red)";
      if (node.ms > 1800) return "var(--amber)";
      return "var(--green)";
    };
    const tree = new Set(parent.map((p, index) => p + ">" + index));
    const extra = (graph.edges || []).filter((edge) => !tree.has(edge.s + ">" + edge.t) && !tree.has(edge.t + ">" + edge.s)).slice(0, 400);
    const line = (a, b, cls) => '<line x1="' + pos[a].x.toFixed(1) + '" y1="' + pos[a].y.toFixed(1) + '" x2="' + pos[b].x.toFixed(1) + '" y2="' + pos[b].y.toFixed(1) + '" ' + cls + "></line>";
    const svg = '<svg viewBox="0 0 640 640" role="img" aria-label="' + esc(rc.t("graphAria", { n: nodes.length })) + '">' +
      extra.map((edge) => line(edge.s, edge.t, 'stroke="var(--line)" stroke-width="0.6" opacity="0.7"')).join("") +
      parent.map((p, index) => p >= 0 ? line(p, index, 'stroke="var(--muted)" stroke-width="1.1" opacity="0.55"') : "").join("") +
      nodes.map((node, index) => {
        const r = index === 0 ? 11 : 4.5 + Math.min(6, (node.inbound || 0) / 2);
        return '<circle tabindex="0" data-i="' + index + '" cx="' + pos[index].x.toFixed(1) + '" cy="' + pos[index].y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + color(node, index) + '"><title>' + esc(node.path) + " · " + esc(node.status || rc.t("noAnswer")) + " · " + esc(node.ms) + " ms · " + esc(rc.t("linksIn", { n: node.inbound || 0 })) + "</title></circle>";
      }).join("") +
      (nodes.length <= 40 ? nodes.map((node, index) => {
        if (index === 0) return "";
        const label = String(node.path).replace(/\?.*$/, "").split("/").filter(Boolean).pop() || node.path;
        const anchor = Math.cos(pos[index].a) >= 0 ? "start" : "end";
        const dx = anchor === "start" ? 9 : -9;
        return '<text x="' + (pos[index].x + dx).toFixed(1) + '" y="' + (pos[index].y + 3).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(cut(label, 22)) + "</text>";
      }).join("") : "") + "</svg>";
    host.innerHTML = '<div class="graph-legend"><span style="--c:var(--text)">' + esc(rc.t("legendStart")) + '</span><span style="--c:var(--green)">' + esc(rc.t("legendAnswered")) + '</span><span style="--c:var(--amber)">' + esc(rc.t("legendSlow")) +
      '</span><span style="--c:var(--red)">' + esc(rc.t("legendError")) + "</span><span>" + esc(rc.t("legendSize")) + "</span></div>" +
      '<div class="graph-wrap notranslate" translate="no">' + svg + '</div><p class="graph-detail"' + (slotRoot ? "" : ' id="graph-detail"') + ">" + esc(rc.t("selectDot")) + "</p>";
    const detail = host.querySelector(".graph-detail");
    const show = (event) => {
      const circle = event.target.closest("circle");
      if (!circle) return;
      const node = nodes[Number(circle.getAttribute("data-i"))];
      detail.textContent = rc.t("graphDetail", { path: node.path, status: node.status || rc.t("statusNone"), ms: node.ms, links: rc.t("linksIn", { n: node.inbound || 0 }) }) +
        (node.from ? rc.t("graphFrom", { from: node.from }) : "") + (node.title ? rc.t("graphTitle", { title: node.title }) : "");
    };
    host.querySelector("svg").addEventListener("click", show);
    host.querySelector("svg").addEventListener("focusin", show);
  }

  function paintSecurity(ins) {
    const sec = ins.security || {};
    const domain = sec.domain;
    const domainMark = "\u0000";
    const meta = (sec.tls ? '<p class="meta-line">' + esc(rc.t("tls", { date: sec.tls.validTo, days: rc.t("days", { n: sec.tls.daysLeft }) }) + (sec.tls.issuer ? rc.t("tlsIssuer", { issuer: sec.tls.issuer }) : "")) + ".</p>" : "") +
      (domain ? '<p class="meta-line">' + esc(rc.t("domainLine", {
        domain: domainMark,
        registrar: domain.registrar ? rc.t("domainWith", { registrar: domain.registrar }) : "",
        until: domain.expires ? rc.t("domainUntil", { date: domain.expires, days: rc.t("days", { n: domain.daysLeft }) }) : "",
        lock: domain.locked == null ? "" : rc.t(domain.locked ? "domainLocked" : "domainUnlocked")
      })).replace(domainMark, () => '<span class="notranslate" translate="no">' + esc(domain.domain) + "</span>") + "</p>" : "") +
      (sec.bimi ? '<p class="meta-line">' + esc(rc.t(sec.bimi.record ? "bimiOn" : sec.bimi.eligible ? "bimiOffEligible" : "bimiOff") + " " + rc.t("notScored")) + "</p>" : "");
    if (slotRoot) {
      slot("security").innerHTML = (sec.headers || []).length || (sec.pages || []).length || meta ? securityColumn(sec, meta) : "";
      return;
    }
    slot("security").innerHTML = '<div class="checks-grid">' + (sec.headers || []).map((item) =>
      '<div class="check-tile ' + esc(item.state) + '"><b>' + esc(item.person ? VERDICT_LABEL.person : rc.word("secState", item.state)) + '</b><span class="notranslate" translate="no">' + esc(item.label) + "</span></div>").join("") + "</div>" +
      meta + securityMatrix(sec.pages || []);
  }

  function headerCols() {
    return [["hsts", "HSTS"], ["csp", "CSP"], ["frame", rc.t("colFraming")], ["nosniff", "nosniff"], ["referrer", rc.t("colReferrer")], ["permissions", rc.t("colPermissions")]];
  }

  // The checks in the order the review writes them, so a check one site lacks keeps its row in that column.
  const CHECK_ORDER = ["HTTPS redirect", "HSTS", "Content-Security-Policy", "Frame protection", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy",
    "TLS certificate", "security.txt", "SPF", "DMARC", "CAA", "Safe Browsing", "Domain expiry", "MTA-STS", "TLS-RPT", "Front-end libraries", "Privacy notice", "Imprint", "Accessibility statement"];
  const CHECK_MARK = { pass: "✓", risk: "!", fail: "✗", unknown: "–" };
  const DIFF_SHOWN = 6;

  // A comparison column: how many pages send each header, the pages that drop one the start page sends, then every
  // check, each in the same rows and order for every site so they read across the columns.
  function securityColumn(sec, meta) {
    const rows = sec.pages || [];
    const n = rows.length;
    const start = rows[0] || {};
    const cols = headerCols();
    const unknown = rc.word("secState", "unknown");
    const line = (key, label, state, text, share) => '<li class="' + state + '" data-header="' + key + '"' + (share == null ? "" : ' style="--cov:' + share + '%"') +
      "><span>" + esc(label) + '</span><b title="' + esc(text) + '">' + esc(text) + "</b></li>";
    const cover = cols.map(([key, label]) => {
      if (!n) return line(key, label, "unknown", unknown);
      const k = rows.filter((row) => row[key]).length;
      const [state, text] = k === n ? ["pass", "✓ " + rc.t("covAll", { n })] : !k ? ["fail", "✗ " + rc.t("covNone")]
        : k === 1 && start[key] ? ["risk", "✗ " + rc.t("covStart")] : ["risk", "✗ " + rc.t("covSome", { k, n })];
      return line(key, label, state, text, Math.round(k / n * 100));
    }).join("");
    const loose = rows.reduce((sum, row) => sum + (row.looseCookies || 0), 0);
    const [jarState, jarText] = !n ? ["unknown", unknown] : loose ? ["risk", "✗ " + rc.t("withoutSecure", { n: loose })]
      : rows.some((row) => row.cookies) ? ["pass", "✓ " + rc.t("covSecure")] : ["unknown", rc.t("covNoCookies")];
    const differ = rows.slice(1).map((row) => ({ row, miss: cols.filter(([key]) => start[key] && !row[key]).map(([, label]) => label) }))
      .filter((page) => page.miss.length).sort((a, b) => b.miss.length - a.miss.length);
    const item = ({ row, miss }) => '<li title="' + esc(row.path) + '"><span class="notranslate" translate="no">' + esc(String(row.path).replace(/[?#].*$/, "")) + "</span><small>" + esc(miss.join(" · ")) + "</small></li>";
    const diff = n < 2 ? "<div></div>" : !differ.length ? '<p class="sec-diff">' + esc(rc.t(cols.some(([key]) => start[key]) ? "diffNone" : "diffNoStart")) + "</p>"
      : '<div class="sec-diff"><h4>' + esc(rc.t("diffTitle")) + "</h4><ol>" + differ.slice(0, DIFF_SHOWN).map(item).join("") + "</ol>" +
        (differ.length > DIFF_SHOWN ? '<details class="sec-more"><summary>' + esc(rc.t("covMore", { n: differ.length - DIFF_SHOWN })) + "</summary><ol>" + differ.slice(DIFF_SHOWN).map(item).join("") + "</ol></details>" : "") + "</div>";
    const tiles = new Map((sec.headers || []).map((tile) => [tile.label, tile]));
    const checks = CHECK_ORDER.concat([...tiles.keys()].filter((label) => !CHECK_ORDER.includes(label))).map((label) => {
      const tile = tiles.get(label) || { state: "unknown" };
      const word = tile.person ? VERDICT_LABEL.person : rc.word("secState", tile.state);
      return '<li class="' + esc(tile.state) + '" data-check="' + esc(label.toLowerCase().replace(/[^a-z0-9]+/g, "-")) + '"><span class="notranslate" translate="no" title="' + esc(label) + '">' + esc(label) +
        '</span><b role="img" aria-label="' + esc(word) + '" title="' + esc(word) + '">' + (tile.person ? "?" : CHECK_MARK[tile.state] || "–") + "</b></li>";
    }).join("");
    return '<div class="sec-cover"><h3>' + esc(rc.t("matrixTitle")) + '</h3><p class="muted">' + esc(rc.t("matrixNote")) + '</p><ul class="sec-cov">' + cover +
      line("cookies", rc.t("thCookies"), jarState, jarText) + "</ul></div>" + diff + '<ul class="sec-checks">' + checks + '</ul><div class="sec-meta">' + meta + "</div>";
  }

  function securityMatrix(rows) {
    if (rows.length < 2) return "";
    const cols = headerCols();
    const mark = (on) => on ? '<td class="ok" aria-label="' + esc(rc.t("sent")) + '">✓</td>' : '<td class="no" aria-label="' + esc(rc.t("missing")) + '">✗</td>';
    return "<h3>" + esc(rc.t("matrixTitle")) + '</h3><p class="muted">' + esc(rc.t("matrixNote")) + "</p>" +
      '<div class="table-scroll"><table class="mini-table sec-matrix"><thead><tr><th>' + esc(rc.t("thPage")) + "</th>" + cols.map(([, label]) => "<th>" + esc(label) + "</th>").join("") + "<th>" + esc(rc.t("thCookies")) + "</th></tr></thead><tbody>" +
      rows.map((row) => '<tr><td class="notranslate" translate="no">' + esc(row.path) + "</td>" + cols.map(([key]) => mark(row[key])).join("") +
        "<td>" + (row.cookies ? row.cookies + (row.looseCookies ? ", " + esc(rc.t("withoutSecure", { n: row.looseCookies })) : "") : "—") + "</td></tr>").join("") + "</tbody></table></div>";
  }

  function paintFindings(ins, paid) {
    const all = ins.findings || [];
    const areas = ["All"].concat(Object.keys(AREA_NOTE));
    const verdicts = [["open", rc.t("fOpen")], ["all", rc.t("fAll")], ["fail", VERDICT_LABEL.fail], ["risk", VERDICT_LABEL.risk], ["pass", VERDICT_LABEL.pass], ["person", VERDICT_LABEL.person]];
    const bar = slot("finding-filters");
    const filter = filterOf();
    const column = slotRoot;
    bar.innerHTML = areas.map((name) => '<button type="button" data-area="' + esc(name) + '"' + (filter.area === name ? ' class="on"' : "") + ">" + esc(name === "All" ? rc.t("allAreas") : cc.area(name)) + "</button>").join("") +
      '<span style="width:12px;display:inline-block"></span>' +
      verdicts.map(([key, label]) => '<button type="button" data-verdict="' + key + '"' + (filter.verdict === key ? ' class="on"' : "") + ">" + esc(label) + "</button>").join("");
    bar.onclick = (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.hasAttribute("data-area")) filter.area = button.getAttribute("data-area");
      if (button.hasAttribute("data-verdict")) filter.verdict = button.getAttribute("data-verdict");
      inSlot(column, () => paintFindings(ins, paid));
    };
    const shown = all.filter((item) => (filter.area === "All" || item.area === filter.area) &&
      (filter.verdict === "all" || (filter.verdict === "open" ? (item.verdict === "fail" || item.verdict === "risk") : item.verdict === filter.verdict)));
    slot("findings").innerHTML = shown.length ? shown.map((item) =>
      '<div class="finding"><div><span class="id">' + esc(item.id) + "</span>" + verdictBadge(item.verdict, item.severity) + '<span class="badge">' + esc(cc.area(item.area)) + "</span></div>" +
      "<strong>" + esc(said(item, "title")) + "</strong><p class=\"muted\">" + fadeText(said(item, "evidence"), paid) + "</p>" +
      (item.fix ? '<p class="fix-line">' + fadeText(said(item, "fix"), paid) + "</p>" : "") +
      ((item.pages || []).length ? '<p class="meta-line notranslate" translate="no">' + esc(item.pages.slice(0, 6).join(" · ")) + (item.pages.length > 6 ? " …" : "") + "</p>" : "") +
      ((item.cases || []).length ? '<p class="meta-line">' + esc(rc.t("testCases", { list: item.cases.join(", ") })) + "</p>" : "") +
      (!slotRoot && window.QAReviewAsk && QAReviewAsk.cardLink ? QAReviewAsk.cardLink(item.id) : "") + "</div>").join("")
      : '<p class="muted">' + esc(rc.t("noMatch")) + "</p>";
  }

  function dnsLabel(row) {
    if (row.type === "CAA") return "CAA";
    if (/^_dmarc\./.test(row.name)) return "DMARC";
    if (/^_smtp\._tls\./.test(row.name)) return "TLS-RPT";
    if (/^_mta-sts\./.test(row.name)) return "MTA-STS";
    return "SPF";
  }

  function paintFixKit(ins, paid) {
    const kit = ins.fixkit || {};
    const missing = (kit.headers || []).filter((item) => item.missing);
    const outlines = [kit.privacyNotice ? "privacy" : "", kit.imprint ? "imprint" : "", kit.accessibilityStatement ? "accessibility" : ""].filter(Boolean).map((key) => rc.word("legal", key));
    const listed = outlines.join(", ").replace(/, ([^,]*)$/, (match, last) => " " + rc.t("and") + " " + last);
    // A comparison column keeps a tile for every file, so the tiles of the columns line up. A locked column's
    // kit leaves out the optional files, so it cannot say they are not needed.
    const optional = (kind, title, body, none) => body ? [kind, title, body] : slotRoot ? [kind, title, rc.t(paid ? none : "kitLocked"), true] : null;
    const items = [
      ["headers", rc.t("kitHeaders"), missing.length ? rc.t("kitHeadersMissing", { n: missing.length, hosting: kit.hosting || rc.t("hostingDefault") }) : rc.t("kitHeadersAll")],
      ["csp", "Content-Security-Policy", rc.t("kitCsp", { n: ((kit.csp || "").match(/https:\/\//g) || []).length })],
      ["jsonld", rc.t("kitSchema"), rc.t(kit.jsonLd ? "kitSchemaDraft" : "kitSchemaHas")],
      ["llms", "llms.txt", rc.t(kit.llmsTxt ? "kitLlmsDraft" : "kitLlmsHas")],
      ["securitytxt", "security.txt", rc.t(kit.securityTxt ? "kitSecDraft" : "kitSecHas")],
      ["dns", rc.t("kitDns"), (kit.dns || []).length ? rc.t("kitDnsAdd", { n: kit.dns.length, list: kit.dns.map(dnsLabel).join(", ") }) : rc.t("kitDnsNone")],
      optional("mtasts", rc.t("kitMta"), kit.mtaSts ? rc.t("kitMtaBody") : "", "kitNotNeeded"),
      optional("libs", rc.t("kitLibs"), (kit.libraries || []).length ? kit.libraries.map((row) => row.ended ? rc.t("libEnded", { lib: row.name + " " + row.version }) : row.name + " " + row.version + " → " + row.fixed).join(", ") + "." : "", "kitNoLibs"),
      optional("legal", rc.t("kitLegal"), outlines.length ? rc.t("kitLegalBody", { list: listed }) : "", "kitNotNeeded"),
      optional("chat", rc.t("kitChat"), kit.chatSnippet ? rc.t("kitChatBody") : "", "kitNotNeeded"),
      ["actions", "GitHub Actions", rc.t("kitActionsBody")]
    ].filter(Boolean);
    const peek = "Content-Security-Policy-Report-Only: " + (kit.csp || "");
    const folderMark = "\u0000";
    const hostingMark = "\u0001";
    slot("fixkit").innerHTML =
      "<p>" + esc(rc.t("kitIntro", { folder: folderMark }) + (kit.hosting ? " " + rc.t("kitHosting", { hosting: hostingMark }) : ""))
        .replace(folderMark, () => '<span class="notranslate" translate="no">fix-kit/</span>').replace(hostingMark, () => "<strong>" + esc(kit.hosting) + "</strong>") + "</p>" +
      '<div class="fixkit-list">' + items.map(([kind, title, body, none]) => '<article data-kit="' + kind + '"' + (none ? ' class="is-none"' : "") + "><strong>" + esc(title) + "</strong><span class=\"muted\"" +
        (slotRoot ? ' title="' + esc(body) + '"' : "") + ">" + esc(body) + "</span></article>").join("") + "</div>" +
      '<div class="code-peek notranslate" translate="no">' + fadeText(peek, paid) + "</div>";
  }

  function paintInsights(report, paid, fixed) {
    const ins = report.insights;
    const open = fixed === undefined ? paid : fixed;
    setInsightsVisible(!!ins);
    if (!ins) return;
    paintExec(report, ins);
    paintHealth(ins);
    paintFixFirst(ins, open);
    paintBrowser(report);
    paintPreviews(ins);
    paintGeo(ins);
    paintAnalytics(ins);
    paintSeo(ins);
    paintGraph(ins);
    paintSecurity(ins);
    paintFindings(ins, open);
    paintFixKit(ins, paid);
  }

  const folds = [];

  function fold(heading, nodes) {
    if (!heading || !nodes.length) return;
    const n = folds.length + 1;
    const panel = document.createElement("div");
    panel.className = "fold-panel";
    panel.id = "fold-panel-" + n;
    panel.setAttribute("role", "region");
    nodes[0].parentNode.insertBefore(panel, nodes[0]);
    nodes.forEach((node) => panel.appendChild(node));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fold-toggle";
    button.id = "fold-toggle-" + n;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", panel.id);
    const label = document.createElement("span");
    while (heading.firstChild) label.appendChild(heading.firstChild);
    const icon = document.createElement("span");
    icon.className = "fold-icon";
    icon.setAttribute("aria-hidden", "true");
    button.append(label, icon);
    heading.appendChild(button);
    heading.classList.add("fold-head");
    panel.setAttribute("aria-labelledby", button.id);
    button.addEventListener("click", () => setFold(folds[n - 1], panel.hidden));
    folds.push({ button, panel });
  }

  function setFold(item, open) {
    item.panel.hidden = !open;
    item.button.setAttribute("aria-expanded", String(open));
    paintFoldAll();
  }

  function paintFoldAll() {
    const all = document.getElementById("fold-all");
    if (!all) return;
    const anyOpen = folds.some((item) => !item.panel.hidden);
    all.textContent = rc.t(anyOpen ? "collapseAll" : "expandAll");
    all.setAttribute("aria-expanded", String(anyOpen));
  }

  function followingUntilHeading(start) {
    const nodes = [];
    let node = start.nextElementSibling;
    while (node && node.tagName !== "H2") {
      nodes.push(node);
      node = node.nextElementSibling;
    }
    return nodes;
  }

  function setupFolds() {
    const report = document.getElementById("report");
    const visuals = document.getElementById("report-visuals");
    if (!report || !visuals) return;
    const glance = document.createElement("h2");
    glance.textContent = "At a glance";
    report.insertBefore(glance, visuals);
    const direct = [...report.children].filter((node) => node.tagName === "H2");
    fold(glance, [visuals]);
    report.querySelectorAll(".split > .card > h2").forEach((heading) => fold(heading, followingUntilHeading(heading)));
    ["tool-block", "credential-run", "mentions-block"].forEach((id) => {
      const heading = document.querySelector("#" + id + " > h2");
      if (heading) fold(heading, followingUntilHeading(heading));
    });
    const alarmHead = document.querySelector("#alarm .alarm-head");
    if (alarmHead) {
      const rest = [];
      for (let node = alarmHead.nextElementSibling; node; node = node.nextElementSibling) rest.push(node);
      fold(alarmHead.querySelector("h2"), rest);
    }
    direct.filter((heading) => heading !== glance).forEach((heading) => fold(heading, followingUntilHeading(heading)));
    const bar = document.createElement("div");
    bar.className = "fold-bar no-print";
    const all = document.createElement("button");
    all.type = "button";
    all.id = "fold-all";
    all.className = "btn btn-ghost";
    all.setAttribute("aria-controls", folds.map((item) => item.panel.id).join(" "));
    all.addEventListener("click", () => {
      const open = !folds.some((item) => !item.panel.hidden);
      folds.forEach((item) => setFold(item, open));
    });
    bar.appendChild(all);
    report.insertBefore(bar, report.querySelector("h2[data-insight]") || glance);
    paintFoldAll();
  }

  setupFolds();

  const reportRoot = document.getElementById("report");
  if (reportRoot) new MutationObserver(() => fadeSections(reportRoot)).observe(reportRoot, { childList: true, subtree: true });

  // Older reports were saved without counts, so the figures fall back to the lists themselves.
  function pagesCount(report) {
    return (report.counts && report.counts.pages) || (report.limits && report.limits.pagesRead) || (report.pages || []).length;
  }

  function paintFacts(report) {
    const counts = report.counts || { byLayer: {} };
    const score = report.insights && report.insights.score;
    slot("kpis").innerHTML = (score ? [
      [score.overall + "/100", rc.t("kpiHealth")],
      [score.totals.fail, rc.t("kpiFail")],
      [score.totals.risk, rc.t("kpiRisk")],
      [pagesCount(report), rc.t("kpiPages")]
    ] : [
      [pagesCount(report), rc.t("kpiPages")],
      [counts.technologies || (report.technologies || []).length, rc.t("kpiTech")],
      [counts.cases || (report.cases || []).length, rc.t("kpiCases")],
      [(report.observed && report.observed.ms) + " ms", rc.t("kpiFirst")]
    ]).map(([value, label]) => "<div class=\"kpi\"><b>" + esc(value) + "</b><span>" + esc(label) + "</span></div>").join("");
    const layers = Object.entries(counts.byLayer || {});
    const max = Math.max.apply(null, layers.map((pair) => pair[1]).concat([1]));
    slot("layers").innerHTML = layers.length ? layers.map(([name, count]) =>
      '<div class="bar-row"><span>' + esc(name) + '</span><div class="bar"><i style="width:' + Math.round(count / max * 100) + '%"></i></div><span>' + count + "</span></div>"
    ).join("") : '<p class="muted">No layer counts were saved.</p>';
    const tech = slot("tech");
    const technologies = report.technologies || [];
    tech.innerHTML = technologies.length
      ? technologies.map((item) => '<span class="pill"><b>' + esc(item.name) + "</b> " + esc(rc.word("techGroup", item.group, item.group)) + "</span>").join("")
      : '<span class="muted">No known technology marker was found in the HTML or headers.</span>';
    const obs = report.observed || {};
    const limits = report.limits || {};
    const asked = "pageLang" in limits
      ? (limits.pageLang ? "Requested in " + (PAGE_LANG_LABEL[limits.pageLang] || limits.pageLang) + ". " : "Requested in the site's own language. ") + (limits.section ? "Stayed under " + limits.section + ". " : "")
      : "";
    slot("observed").innerHTML = "<p><b>" + esc(obs.title || "No title") + "</b></p><p class=\"muted\">" + esc(obs.description || "No meta description.") + "</p><p>Language " + esc(obs.lang || "not set") + " · " + ((obs.h1 || []).length) + " h1 · " + (obs.forms || 0) + " forms · " + (obs.images || 0) + " images, " + (obs.missingAlt || 0) + " without alt · " + (obs.scripts || 0) + " scripts · " + (obs.bytes || 0) + " bytes</p><p class=\"muted\">" + esc(asked) + esc(limits.robotsNote || "") + "</p>" +
      (limits.timedOut ? '<p class="muted">The time budget ended after ' + (limits.pagesRead || (report.pages || []).length) + " of up to " + (limits.maxPages || "?") + ' pages, usually because the site answered slowly. If pages that matter were left out, write to <a href="mailto:qa@carlosandmunoz.com">qa@carlosandmunoz.com</a> with the report link and Carlos will look at a rerun.</p>' : "");
    const pages = report.pages || [];
    const found = foundCount(limits);
    const foundNote = slot("pages-found");
    if (foundNote) {
      const read = limits.pagesRead || pages.length;
      foundNote.hidden = !found;
      foundNote.textContent = found
        ? found + " page" + (found === "1" ? " was" : "s were") + " found on " + (report.host || "the site") + " in the links of the pages analyzed and its sitemap. This review analyzed " + read + " of them" +
          (limits.maxPages ? ", up to " + limits.maxPages + " pages and " + (limits.maxDepth || "?") + " links deep" : "") + "."
        : "";
    }
    slot("pages").innerHTML = pages.length ? pages.map((page) =>
      "<tr><td>" + esc(page.path) + "</td><td>" + esc(page.status || page.error || "—") + "</td><td>" + esc(page.ms) + "</td><td>" + esc(page.title) + "</td></tr>"
    ).join("") : '<tr><td colspan="4">No page was saved.</td></tr>';
    const savedLog = report.log || [];
    slot("report-log").innerHTML = savedLog.length ? savedLog.map((line) =>
      "<li><time>" + esc(line.at || "") + "</time>" + esc(line.text || "") + "</li>"
    ).join("") : '<li>No log line was saved.</li>';
    return layers;
  }

  // The layers of the cases of every report, in CASE_LAYERS order and then by name, so every column of a
  // comparison lists the same groups in the same order.
  function caseGroups(reports) {
    const seen = new Set();
    reports.forEach((report) => ((report && report.cases) || []).forEach((item) => { if (item && item.layer) seen.add(item.layer); }));
    return CASE_LAYERS.filter((name) => seen.has(name)).concat([...seen].filter((name) => CASE_LAYERS.indexOf(name) === -1).sort());
  }

  const CASE_RANK = {
    priority: { P1: 0, P2: 1, P3: 2 },
    verdict: { fail: 0, risk: 1, person: 2, pass: 3 },
    severity: { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  };
  function byCaseRank(a, b) {
    for (const key of ["priority", "verdict", "severity"]) {
      const diff = (CASE_RANK[key][a[key]] ?? 9) - (CASE_RANK[key][b[key]] ?? 9);
      if (diff) return diff;
    }
    return (a.n || 0) - (b.n || 0);
  }

  // Selectors and addresses in the evidence: a URL, a token opening with . or #, or one holding > [ or :nth-.
  const CODE_TOKEN = /^(>|https?:\/\/\S+|[.#][A-Za-z_]\S*|\S*[\w)\]](>|\[)\S*|\S*:nth-\S*)$/;
  function codeText(text) {
    return String(text).split(/(\s+)/).map((part) => (CODE_TOKEN.test(part) ? "<code>" + esc(part) + "</code>" : esc(part))).join("");
  }

  function columnCase(item, paid) {
    const prio = item.priority ? '<span class="prio prio-' + esc(item.priority) + '">' + esc(item.priority) + "</span>" : "";
    const why = String(fc.line(item.msg && item.msg.why, item.why) || "");
    return '<li class="case" data-id="' + esc(item.id) + '"><div class="cases-chips">' + prio + '<span class="id">' + esc(item.id) + '</span><span class="tag">' + (item.verdict ? verdictBadge(item.verdict, item.severity) : "Proposed") + "</span></div>" +
      "<strong>" + fadeText(fc.line(item.msg && item.msg.title, item.title), paid) + "</strong>" +
      (why ? '<p class="muted cases-why">' + (paid ? codeText(why) : fadeText(why, false)) + "</p>" +
        (why.length > 110 ? '<button class="cases-more no-print" type="button" aria-expanded="false">' + esc(rc.t("caseMore")) + "</button>" : "") : "") + "</li>";
  }

  // A comparison column: a line of counts, then the cases folded into one group per layer, in the order that
  // every column shares, so a layer a site has no case in still holds its place.
  function paintColumnCases(report, paid, groups) {
    const cases = report.cases || [];
    const box = slot("cases");
    if (!cases.length) {
      box.innerHTML = '<p class="muted">No proposed case was saved.</p>';
      return;
    }
    const count = (key, value) => cases.filter((item) => item[key] === value).length;
    const prios = ["P1", "P2", "P3"].filter((level) => count("priority", level)).map((level) =>
      '<span class="cases-tally"><span class="prio prio-' + level + '">' + level + "</span> " + count("priority", level) + "</span>");
    const verdicts = ["fail", "risk"].filter((verdict) => count("verdict", verdict)).map((verdict) =>
      '<span class="cases-tally"><span class="badge v-' + verdict + '">' + esc(VERDICT_LABEL[verdict]) + "</span>" + count("verdict", verdict) + "</span>");
    box.innerHTML = '<p class="cases-sum"><span class="cases-total"><b>' + cases.length + "</b> " + esc(rc.t("kpiCases")) + "</span>" + prios.concat(verdicts).join("") + "</p>" +
      (groups || caseGroups([report])).map((name) => {
        const items = cases.filter((item) => item.layer === name).sort(byCaseRank);
        return '<section class="cases-group' + (items.length ? "" : " is-none") + '" data-group="' + esc(name) + '"><h3><button class="cases-toggle" type="button" aria-expanded="false"' + (items.length ? "" : " disabled") + '>' +
          '<span class="cases-name">' + esc(name) + '</span><span class="cases-n">' + items.length + "</span></button></h3>" +
          (items.length ? '<ol class="cases-list" hidden>' + items.map((item) => columnCase(item, paid)).join("") + "</ol>" : "") + "</section>";
      }).join("");
  }

  // One column of the many-URL comparison: every section of one report, drawn by the painters above.
  function paintColumn(payload, root) {
    const report = payload.report;
    const paid = !!payload.paid;
    root.payload = payload;
    inSlot(root, () => {
      paintVisuals(report, paid);
      paintInsights(report, paid);
      paintFacts(report);
      paintAlarm(report, paid);
      paintMentions(report);
      paintColumnCases(report, paid, payload.caseGroups);
    });
    (root.cells ? root.cells() : [root]).forEach((cell) => {
      if (!paid) fadeSections(cell, true);
      protectNames(cell);
    });
  }

  window.QAReviewSections = { paint: paintColumn, caseGroups, esc, scoreColor, gradeOf };

  function render(payload) {
    const report = payload.report;
    if (!report) return;
    const sample = !!payload.sample;
    if (!sample && !payload.paid && !report.preview && seenBefore(report.id) && liveId !== report.id) {
      openPay({ id: report.id, priceUsd: reportUsd(payload), frameworks: payload.frameworks || [], addons: payload.addons || [] });
      return;
    }
    current = payload;
    liveId = report.id;
    if (!sample) remember(report.id);
    if (window.QAReviewAsk) QAReviewAsk.show(payload);
    const fixed = !sample && fixListOpen(report.id);
    document.body.classList.toggle("fix-open", fixed && !payload.paid);
    applyCopyMode(!!payload.paid);
    if (!sample) shareOpen.disabled = false;
    dash.classList.toggle("is-sample", sample);
    const sampleNote = document.getElementById("sample-note");
    sampleNote.hidden = !sample;
    if (sample) {
      const when = new Date(report.fetchedAt);
      sampleNote.textContent = "Sample report. This is the review of " + report.host + (isNaN(when) ? "" : " from " + when.toISOString().slice(0, 10)) + ", shown the way an unpaid report is: the opening of each line is readable and the rest stays blurred in every section. Close it to read the disclaimers and review your own address.";
    }
    dash.classList.add("open");
    document.body.style.overflow = "hidden";
    const state = report.status === "stopped" ? "Stopped" : "Complete";
    const paid = !!payload.paid;
    paintVisuals(report, paid);
    paintInsights(report, paid, fixed);
    const offer = document.getElementById("unlock-offer");
    paintOffer(offer, !paid && !sample);
    if (!paid && !sample) loadFullQuote().then((quote) => { if (quote && current === payload) paintOffer(offer, true); });
    paintCompare(report, sample);
    paintRivals(report, sample);
    document.getElementById("report-statement").textContent = "";
    const layers = paintFacts(report);
    paintAlarm(report, paid || alertsOpen(report.id));
    paintMentions(report);
    paintCredential(payload);
    const names = ["All"].concat(layers.map((pair) => pair[0]));
    document.getElementById("layer-filters").innerHTML = names.map((name) =>
      '<button type="button" data-layer="' + esc(name) + '"' + (name === layer ? ' class="on"' : "") + ">" + esc(name) + "</button>"
    ).join("");
    document.getElementById("layer-filters").onclick = (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      layer = button.getAttribute("data-layer");
      render(current);
    };
    const picked = new Set(payload.frameworks || selectedFrameworks());
    const shown = (report.cases || []).filter((item) => (layer === "All" || item.layer === layer) && item.fw.some((fw) => picked.has(fw)));
    const urgent = ["P1", "P2"].map((level) => shown.filter((item) => item.priority === level).length);
    const ranked = shown.some((item) => item.priority)
      ? " Ranked by risk: " + urgent[0] + " P1 and " + urgent[1] + " P2 come first, backed by what the review saw on " + (report.host || "the site") + "."
      : "";
    document.getElementById("case-note").textContent = (paid
      ? shown.length + " cases for the selected frameworks. The full wording is open because this copy is paid."
      : shown.length + " cases were identified across the tools, languages, and technologies in this review. The opening of each line stays visible, here and in every section. The rest stays blurred until the report is paid.") + ranked;
    const extras = [];
    (report.cases || []).forEach((item) => {
      (item.also || []).forEach((name) => {
        if (name && extras.indexOf(name) === -1) extras.push(name);
      });
    });
    const listed = new Set(TOOLS.concat(FRAMEWORKS));
    const specialist = document.getElementById("specialist-tools");
    const otherTools = extras.filter((name) => !listed.has(name));
    if (specialist) {
      specialist.hidden = otherTools.length === 0;
      specialist.textContent = otherTools.length
        ? "Also named where the page matches: " + otherTools.join(", ") + ". They are not launched."
        : "";
    }
    paintTools(report);
    document.getElementById("cases").innerHTML = shown.map((item) => {
      const extra = (item.also || []).filter(Boolean);
      const tools = item.fw.filter((fw) => picked.has(fw)).map(fwName).concat(extra.map(fwName)).join("");
      const prio = item.priority ? '<span class="prio prio-' + esc(item.priority) + '" title="Risk ' + esc(item.risk) + ' of 100">' + esc(item.priority) + "</span>" : "";
      const where = (item.pages || []).length > 1 ? '<p class="muted case-pages">Pages: ' + esc(item.pages.slice(0, 6).join(", ") + (item.pages.length > 6 ? " and " + (item.pages.length - 6) + " more" : "")) + "</p>" : "";
      return '<article class="case"><div>' + prio + '<span class="id">' + esc(item.id) + "</span> " + esc(item.layer) + '<span class="tag">' + (item.verdict ? verdictBadge(item.verdict, item.severity) : "Proposed") + "</span></div><strong>" + fadeText(fc.line(item.msg && item.msg.title, item.title), paid) + '</strong><p class="muted">' + fadeText(fc.line(item.msg && item.msg.why, item.why), paid) + "</p>" + where + '<p class="muted fw-line">' + tools + "</p></article>";
    }).join("") || '<p class="muted">No proposed case matches this filter.</p>';
    const link = location.origin + location.pathname + "?report=" + encodeURIComponent(report.id);
    document.getElementById("share-link").textContent = link;
    protectNames(dash);
  }

  function reviewBody(compare, url, runId) {
    return JSON.stringify(Object.assign(ReviewAuth.proof(), {
      termsAccepted: true,
      termsVersion: TERMS_VERSION,
      name: document.getElementById("name").value,
      email: document.getElementById("email").value,
      reasonCode: compare ? "compare" : reasonCode(),
      reason: reasonBox.value,
      clientName: document.getElementById("client-name").value,
      clientEmail: document.getElementById("client-email").value,
      clientUrl: document.getElementById("client-url").value,
      url,
      compareWith: compare ? compare.id : "",
      frameworks: compare ? compare.frameworks : selectedFrameworks(),
      tools: compare ? compare.tools : selectedTools(),
      pages: compare ? compare.pages : selectedPages(),
      depth: compare ? compare.depth : selectedDepth(),
      pageLang: selectedPageLang(),
      section: document.getElementById("stay-section").checked === true,
      deviceId: deviceId(),
      runId: runId,
      openedAt: openedAt,
      company: (document.getElementById("hp-note") || { value: "" }).value,
      lang: document.documentElement.lang || "en",
      coupon: window.ReviewDeal ? ReviewDeal.code() : "",
      followUp: document.getElementById("follow-up").checked === true,
      unlisted: document.getElementById("no-publish").checked === true,
      landing: window.QaConsent && QaConsent.landing ? QaConsent.landing() : null,
      testKey: testKey()
    }));
  }

  async function readStream(res, host) {
    const type = res.headers.get("content-type") || "";
    if (type.indexOf("application/json") !== -1 || !res.ok) {
      const body = await res.json();
      const error = new Error(body.error || "The review failed.");
      error.fields = body.fields;
      error.paymentRequired = !!body.paymentRequired;
      error.body = body;
      throw error;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let donePayload = null;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop();
      parts.forEach((part) => {
        if (!part.trim()) return;
        const msg = JSON.parse(part);
        if (msg.type === "log") appendLog(msg.text, host);
        if (msg.type === "error") throw new Error(msg.error || "The review failed.");
        if (msg.type === "done") donePayload = msg;
      });
    }
    return donePayload;
  }

  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (activeRun) return;
    if (!termsOk) {
      askTerms(() => reviewForm.dispatchEvent(new Event("submit", { cancelable: true })), compareTarget ? [compareTarget.url].concat(compareTarget.queue || []) : urlInput.value.trim());
      return;
    }
    if (!signedIn()) {
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_sign_in_needed", "URL Review", "client");
      setStatus("Sign in above to run a review. The review runs on the device where you sign in.", true);
      if (window.ReviewAuth) ReviewAuth.focus();
      return;
    }
    const compare = compareTarget;
    compareTarget = null;
    if (!compare) {
      try { sessionStorage.removeItem(COMPARE_KEY); } catch (error) { /* nothing was kept */ }
    }
    const errors = compare ? clientErrors().filter((item) => item.field === "name") : clientErrors();
    markFields(errors);
    if (errors.length) {
      if (compare) compareTarget = compare;
      if (!compare || !reopenCompare(compare, rc.t("compareName"))) setStatus(errors[0].message, true);
      return;
    }
    let confirmed = !!(compare && compare.confirmed);
    if (!compare) {
      if (pricing) return;
      const answer = await confirmRun();
      if (answer === false) {
        setStatus("Nothing was started or charged.", false);
        return;
      }
      confirmed = answer === true;
      if (activeRun) return;
    }
    if (compare && (compare.queue || []).length) {
      await runComparePool(compare, confirmed);
      return;
    }
    const runId = hexId();
    activeRun = runId;
    if (compare) showComparing(compare);
    reviewBtn.disabled = true;
    stopBtn.disabled = true;
    const runLog = document.getElementById("run-log");
    runLog.innerHTML = "";
    runLog.classList.add("is-live");
    if (window.ReviewProgress) ReviewProgress.start({ host: compare ? compare.url : urlInput.value, pages: compare ? compare.pages : selectedPages() });
    setStatus("Checking the email domain, then analyzing the public page…", false);
    appendLog("Checking the fields, the email domain, and that this is a browser.");
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_start", "URL Review", reasonCode());
    // The run record reads country, region, and city from here; only reviewUrl gets those headers.
    fetch(endpoint() + "/place", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: runId })
    }).catch(() => {});
    try {
      const res = await fetch(runEndpoint() + "/review", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: reviewBody(compare, compare ? compare.url : urlInput.value, runId)
      });
      stopBtn.disabled = false;
      document.getElementById("compare-stop").disabled = false;
      const payload = await readStream(res);
      if (!payload || !payload.report) throw new Error("The review ended without a report.");
      layer = "All";
      payload.reasonCode = compare ? "compare" : reasonCode();
      if (compare) {
        try { sessionStorage.removeItem(COMPARE_KEY); } catch (storageError) { /* nothing was kept */ }
      }
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_done", "URL Review", payload.report && payload.report.host);
      if (!compare) {
        try { sessionStorage.removeItem(RUN_PAID_KEY); } catch (storageError) { /* nothing was kept */ }
      }
      render(payload);
      loadStanding();
      const stopped = payload.report.status === "stopped";
      if (window.ReviewProgress) ReviewProgress.finish(stopped ? "stopped" : "ready");
      setStatus(stopped ? "Stopped. The report uses the pages analyzed before the stop." : "Report ready. Cases are proposed, not run.", false);
      dash.scrollTop = 0;
      // The last competitor of a comparison paid for partway: it opens with the ones that finished before.
      if (compare && (compare.done || []).length) {
        const ran = Object.assign({}, compare, { done: compare.done.concat(stopped ? [] : [payload.report.id]) });
        setStatus(compareDone(ran, ""), false);
        openCompared(ran);
      }
    } catch (error) {
      const rivalField = compare && (error.fields || []).find((item) => item.field === "url");
      if (error.fields) markFields(compare ? error.fields.filter((item) => item.field !== "url") : error.fields);
      if (window.ReviewProgress) {
        if (error.paymentRequired || (error.body && error.body.signIn) || error.fields) ReviewProgress.reset();
        else ReviewProgress.fail();
      }
      if (error.body && error.body.signIn) {
        if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_sign_in_needed", "URL Review", "server");
        ReviewAuth.expire(error.message);
        ReviewAuth.focus();
        setStatus(error.message, true);
      } else if (error.paymentRequired && error.body && error.body.purpose === "new-run") {
        // A total already confirmed in the popup goes on to payment; one paid checkout covers every competitor it showed.
        const due = compare ? Object.assign({}, error.body, { compareWith: compare.id, competitors: confirmed ? compare.total || 1 : 1 }) : error.body;
        if (confirmed) location.href = payQuery("new-run", due);
        else openRunPay(due);
        setStatus(compare ? "The comparison waits on payment: 9 USD for each competitor." : "Another review waits on payment.", true);
      } else if (error.paymentRequired) {
        openPay(error.body || {});
        setStatus("Opening this report again waits on payment.", true);
      } else {
        if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_blocked", "URL Review", error.message || "");
        const reason = (rivalField && rivalField.message) || error.message || "The review failed.";
        if (compare && (compare.done || []).length) {
          const ran = Object.assign({}, compare, { failed: (compare.failed || []).concat(compare.url) });
          setStatus(compareDone(ran, ""), true);
          openCompared(ran, { [compare.url]: reason.replace(/([^.!?])\s*$/, "$1.") });
        } else if (compare && reopenCompare(compare, "The review of " + compare.url + " did not finish: " + reason.replace(/([^.!?])\s*$/, "$1.") + " Check the address or enter another competitor.")) {
          setStatus("The comparison with " + compare.url + " did not finish. Your report is open again.", true);
        } else {
          setStatus(reason, true);
        }
      }
    } finally {
      runLog.classList.remove("is-live");
      activeRun = "";
      if (compare) hideComparing();
      reviewBtn.disabled = !signedIn();
      stopBtn.disabled = true;
    }
  });

  stopBtn.addEventListener("click", async () => {
    if (!activeRun) return;
    stopBtn.disabled = true;
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_stop", "URL Review", "stop");
    appendLog("Stop requested.");
    setStatus("Stopping the review…", false);
    if (comparePool) comparePool.stopping = true;
    const runIds = comparePool ? comparePool.rows.filter((row) => row.state === "running").map((row) => row.runId) : [activeRun];
    try {
      const answers = await Promise.all(runIds.map((runId) => fetch(endpoint() + "/stop", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign(ReviewAuth.proof(), { runId }))
      })));
      const res = answers.find((answer) => !answer.ok);
      if (res) {
        const body = await res.json().catch(() => ({}));
        setStatus(body.error || "The stop was refused.", true);
        stopBtn.disabled = false;
        document.getElementById("compare-stop").disabled = false;
      }
    } catch (error) {
      setStatus("Stop was requested. Waiting for the pages already open.", true);
    }
  });

  // Server quotes for the full report, by query; a failed quote is kept as null so a re-render does not ask again.
  const fullQuotes = {};

  function hasFixList(id) {
    return addonPaid("fixlist", id) || savedPaid(FIXLIST_KEY, id);
  }

  function fullQuoteKey() {
    return current && current.report ? payQuery("report").split("?")[1] : "";
  }

  // The full report's price: the server quote once it is in; before that, the list price less a bought fix list.
  function reportUsd(payload) {
    const src = payload || current || {};
    const id = src.report ? src.report.id : src.id;
    const quote = src === current ? fullQuotes[fullQuoteKey()] : null;
    if (quote) return quote.usd;
    const list = src.frameworks && src.frameworks.length ? src.frameworks : selectedFrameworks();
    const credit = id && ((src.addons || []).indexOf("fixlist") !== -1 || hasFixList(id)) ? FIXLIST_USD : 0;
    return reviewUsd(list, src === current ? selectedTools() : []) - credit;
  }

  async function loadFullQuote() {
    const key = fullQuoteKey();
    if (!key) return null;
    if (key in fullQuotes) return fullQuotes[key];
    fullQuotes[key] = null;
    try {
      const res = await fetch(endpoint() + "/checkout/quote?" + key + "&deviceId=" + encodeURIComponent(deviceId()));
      const body = await res.json();
      if (res.ok && body.usd > 0) fullQuotes[key] = body;
    } catch (error) { /* the list price stays on the page */ }
    return fullQuotes[key];
  }

  // The two ways to read the rest of an unpaid report, each with its price.
  function paintOffer(host, show) {
    if (!host) return;
    const report = current && current.report;
    host.hidden = !show || !report;
    if (host.hidden) {
      host.textContent = "";
      return;
    }
    const fixed = hasFixList(report.id);
    if (!rc.english) {
      host.setAttribute("lang", rc.lang);
      host.setAttribute("translate", "no");
    }
    host.innerHTML = (fixed ? '<p class="offer-note">' + esc(rc.t("offerFixOpen")) + "</p>" : "") +
      '<div class="offer-row">' +
      (fixed ? "" : '<a class="offer" data-offer="fixlist" href="' + esc(payPage() + "?purpose=fixlist&reportId=" + encodeURIComponent(report.id)) + '"><b>' + esc(rc.t("offerFix", { usd: FIXLIST_USD })) + "</b><span>" + esc(rc.t("offerFixBody")) + "</span></a>") +
      '<a class="offer offer-full" data-offer="report" href="' + esc(payQuery("report")) + '"><b>' + esc(rc.t("offerFull", { usd: formatUsd(reportUsd(current)) })) + "</b><span>" + esc(rc.t("offerFullBody") + (fixed ? " " + rc.t("offerCredit") : "")) + "</span></a></div>";
  }

  function openPay(body) {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_pay_open", "URL Review", "report");
    const list = (body && body.frameworks) || (current && current.frameworks) || selectedFrameworks();
    const tools = body && body.frameworks && body.frameworks.length ? (body.tools || []) : selectedTools();
    const usd = (body && body.priceUsd) || reviewUsd(list, tools);
    const selections = list.length + tools.length;
    const credit = body && body.creditUsd > 0 ? " The 5 USD fix list bought on this report is already taken off." : "";
    document.getElementById("pay-title").textContent = rc.t("offerTitle");
    document.getElementById("pay-price").innerHTML = formatUsd(usd) + "<span>USD</span>";
    document.getElementById("pay-detail").textContent = "The full report is " + formatUsd(usd) + " USD for " + selections + (selections === 1 ? " selection" : " selections") + ": 19 USD for the first framework or tool, and 5 USD for each one after it." + credit + " It opens every case and layer, the signals, the exports, and the scripts, on the account that ran it. A paid copy keeps one line: this report was generated with QA-lab URL Review by Carlos Muñoz (https://carlosandmunoz.com).";
    document.getElementById("pay-btn").href = payQuery("report");
    showDeal("pay-deal", "pay-price", body);
    paintOffer(document.getElementById("pay-options"), !!(current && current.report && !current.paid));
    payBox.hidden = false;
    const note = document.getElementById("pay-note");
    note.textContent = (body && body.error) || ("The full report of this review is " + formatUsd(usd) + " USD.");
    note.classList.remove("bad");
    if (body && (body.paymentRequired || body.quoted)) return;
    loadFullQuote().then((quote) => {
      if (quote && !payBox.hidden) openPay(Object.assign({}, quote, { priceUsd: quote.usd, quoted: true }));
    });
  }

  function openReportPay() {
    if (!current || !current.report) return;
    openPay({ id: current.report.id, priceUsd: reportUsd(current), frameworks: current.frameworks || [], addons: current.addons || [] });
  }

  document.addEventListener("click", (event) => {
    const offer = event.target.closest && event.target.closest("a[data-offer]");
    if (!offer || !current || !current.report) return;
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_offer", "URL Review", offer.getAttribute("data-offer"));
    if (offer.getAttribute("data-offer") !== "fixlist") return;
    try {
      sessionStorage.setItem(FIXLIST_KEY, JSON.stringify({
        reportId: current.report.id,
        paid: false,
        report: current.report,
        frameworks: current.frameworks || [],
        addons: current.addons || [],
        reasonCode: current.reasonCode || ""
      }));
    } catch (error) { /* the review page reopens the report from the server after payment */ }
  });

  function openRunPay(body) {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_pay_open", "URL Review", "new-run");
    const list = (body && body.frameworks && body.frameworks.length) ? body.frameworks : selectedFrameworks();
    const pages = body && body.pages ? body.pages : selectedPages();
    const depth = body && body.depth ? body.depth : selectedDepth();
    const billing = body && (body.billing === "scope" || body.billing === "compare" || body.billing === "pass") ? body.billing : "run";
    const tools = billing === "scope" ? [] : ((body && body.tools) || selectedTools());
    const usd = (body && body.priceUsd) || (billing === "compare" ? COMPARE_USD : reviewUsd(list, tools));
    document.getElementById("run-pay-title").textContent = "This review is " + formatUsd(usd) + " USD";
    document.getElementById("run-pay-price").innerHTML = formatUsd(usd) + "<span>USD</span>";
    document.getElementById("run-pay-detail").textContent = billing === "pass"
      ? "This run uses one of your pass runs. The amount is only for the options over your plan: 5 USD for each framework or tool past it, and the wider or deeper steps past the plan's."
      : billing === "compare"
      ? "A comparison is " + COMPARE_USD + " USD for each competitor, whatever the frameworks or the size of your review. The competitor gets the public, passive checks only."
      : billing === "scope"
        ? pages + " pages and " + depth + " links deep. The included first review is 20 pages and 2 links deep. This amount is for the wider review."
        : pages + " pages, " + depth + " links deep, and " + (list.length + tools.length) + " selections. The first framework or tool is 19 USD and each one after it is 5 USD. The size of the review is added to that.";
    document.getElementById("go-pay").href = payQuery("new-run", body || {});
    showDeal("run-pay-deal", "run-pay-price", body);
    runPay.hidden = false;
  }

  async function loadStanding() {
    try {
      const res = await fetch(endpoint() + "/standing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign(window.ReviewAuth ? ReviewAuth.proof() : {}, { deviceId: deviceId() }))
      });
      const body = await res.json();
      standing = res.ok && (body.billing === "run" || body.billing === "scope") ? {
        billing: body.billing,
        free: body.free === true,
        percent: Number(body.percent) || 0,
        pass: body.pass && body.pass.plan ? body.pass : null,
        lastPlan: body.lastPlan || "",
        plans: Array.isArray(body.plans) ? body.plans : []
      } : null;
    } catch (error) {
      standing = null;
    }
    paintTags();
  }

  // Asked once on load and again when the sign-in changes, never on a click.
  function refreshStanding() {
    const key = window.ReviewAuth ? ReviewAuth.proof().session || "" : "";
    if (key === standingKey) return;
    standingKey = key;
    loadStanding();
  }

  function money(usd) {
    return "$" + formatUsd(Math.round(Number(usd) * 100) / 100);
  }

  // say: the copy key read out with the tag, as the visible "+$5" means nothing to a screen reader.
  function setTag(host, usd, say) {
    let tag = host ? host.querySelector(":scope > .price-tag") : null;
    if (!host) return null;
    if (!usd) {
      if (tag) tag.remove();
      return null;
    }
    if (!tag) {
      tag = document.createElement("span");
      tag.className = "price-tag";
      if (!rc.english) {
        tag.setAttribute("lang", rc.lang);
        tag.setAttribute("translate", "no");
      }
      host.appendChild(tag);
    }
    tag.innerHTML = '<span aria-hidden="true">+' + money(usd) + '</span><span class="price-say"> ' + esc(rc.t(say || "priceSay", { usd: formatUsd(usd) })) + "</span>";
    return tag;
  }

  // The open pass with a run left, so the next run goes on it; null otherwise.
  function passOn() {
    return standing && !standing.free && standing.pass && standing.pass.runsLeft > 0 ? standing.pass : null;
  }

  // What a run asks for beyond a plan, as the server prices it: 5 USD for each framework or tool past the plan's
  // allowance (a plan with tools counts frameworks only), and the page and depth steps past the plan's.
  function passExtrasCents(plan, ask) {
    const counted = plan.tools ? ask.frameworks.length : ask.frameworks.length + ask.tools.length;
    return Math.max(0, counted - plan.frameworks) * EXTRA_PRICE * 100
      + Math.max(0, (PAGE_CENTS[ask.pages] || 0) - (PAGE_CENTS[plan.pages] || 0))
      + Math.max(0, (DEPTH_CENTS[ask.depth] || 0) - (DEPTH_CENTS[plan.depth] || 0));
  }

  // A ticked option shows what it adds. On a paid run the first ticked framework or tool, in page order, is 19 USD
  // and each one after it 5 USD, so the tags add up to the framework part; a first run pays only for a wider or
  // deeper read, so only those choices are tagged; on a pass only what is past the plan is tagged; a free account
  // and an unknown standing show none.
  function paintTags() {
    const paid = !!standing && !standing.free;
    const pass = passOn();
    const items = [...reviewForm.querySelectorAll('input[name="fw"]')].concat([...document.querySelectorAll('#tools input[name="tool"]')]);
    let n = 0;
    items.forEach((box) => {
      const on = paid && box.checked && (pass ? !(pass.tools && box.name === "tool") : standing.billing === "run");
      if (on) n += 1;
      setTag(box.closest("label"), !on ? 0 : pass ? (n > pass.frameworks ? EXTRA_PRICE : 0) : (n === 1 ? PRICE : EXTRA_PRICE));
    });
    reviewForm.querySelectorAll('input[name="pages"], input[name="depth"]').forEach((box) => {
      const steps = box.name === "pages" ? PAGE_CENTS : DEPTH_CENTS;
      const included = pass ? steps[box.name === "pages" ? pass.pages : pass.depth] || 0 : 0;
      setTag(box.closest("label"), paid && box.checked ? Math.max(0, (steps[box.value] || 0) - included) / 100 : 0);
    });
    paintCompareTags();
  }

  function paintCompareTags() {
    const paid = !!standing && !standing.free && !passOn();
    compareInputs().forEach((input) => {
      const field = input.closest(".compare-field");
      const tag = setTag(field, paid && !field.hidden && input.value.trim() ? COMPARE_USD : 0, "competitorSay");
      if (tag) {
        tag.id = input.id + "-price";
        input.setAttribute("aria-describedby", tag.id);
      } else {
        input.removeAttribute("aria-describedby");
      }
    });
  }

  reviewForm.addEventListener("change", (event) => {
    if (event.target && ["fw", "pages", "depth"].indexOf(event.target.name) !== -1) paintTags();
  });
  compareInputs().forEach((input) => input.addEventListener("input", paintCompareTags));
  if (window.ReviewAuth) ReviewAuth.onChange(refreshStanding);
  else refreshStanding();

  const totalBox = document.getElementById("run-total");
  let totalReturn = null;
  let totalBehind = [];
  let totalAnswer = null;

  function totalLine(label, usd, cls, off) {
    return "<li" + (cls ? ' class="' + cls + '"' : "") + "><span>" + esc(label) + "</span><b>" + (off ? "−" : "") + money(usd) + "</b></li>";
  }

  // The list total, the return or code discount when there is one, and what is paid, all from the server's quote.
  function sumLines(quote) {
    const list = Number(quote.listUsd) || quote.usd;
    const out = [totalLine(rc.t("totalList"), list, "total-list")];
    if (quote.percent && list > quote.usd) {
      out.push(totalLine(rc.t(quote.discountSource === "coupon" ? "totalCoupon" : "totalReturn", { percent: quote.percent, code: quote.coupon || "" }), Math.round((list - quote.usd) * 100) / 100, "total-off", true));
    }
    out.push(totalLine(rc.t("totalDue"), quote.usd, "total-due"));
    return out;
  }

  function closeTotal(go) {
    if (totalBox.hidden) return;
    totalBox.hidden = true;
    totalBehind.forEach((el) => { el.inert = false; });
    totalBehind = [];
    document.body.classList.remove("gate-open");
    if (totalReturn && totalReturn.isConnected) totalReturn.focus({ preventScroll: true });
    totalReturn = null;
    const answer = totalAnswer;
    totalAnswer = null;
    if (answer) answer(go);
  }

  // Answers true for Pay and run, false for Cancel, Escape or a click outside. `offer` is { plan, up } from passOffer.
  function showTotal(title, lines, offer) {
    const card = totalBox.querySelector(".pay-card");
    if (!rc.english) {
      card.setAttribute("lang", rc.lang);
      card.setAttribute("translate", "no");
    }
    document.getElementById("run-total-eyebrow").textContent = rc.t("totalEyebrow");
    document.getElementById("run-total-title").textContent = title;
    document.getElementById("run-total-lines").innerHTML = lines.join("");
    document.getElementById("run-total-saved").textContent = rc.t("totalSaved");
    document.getElementById("run-total-cancel").textContent = rc.t("totalCancel");
    document.getElementById("run-total-pay").textContent = rc.t("totalPay");
    const offerBox = document.getElementById("run-total-offer");
    offerBox.hidden = !offer;
    if (offer) {
      const plan = offer.plan;
      document.getElementById("run-total-offer-text").textContent = rc.t(offer.up ? "passOfferUp" : "passOffer", { runs: plan.runs, usd: formatUsd(plan.usd), plan: plan.name });
      const go = document.getElementById("run-total-offer-go");
      go.textContent = rc.t("passOfferGo", { plan: plan.name });
      go.dataset.plan = plan.id;
    }
    totalReturn = document.activeElement;
    totalBehind = [...document.body.children].filter((el) => el !== totalBox && !el.inert && !el.matches("script, .cookie-note"));
    totalBehind.forEach((el) => { el.inert = true; });
    totalBox.hidden = false;
    document.body.classList.add("gate-open");
    document.getElementById("run-total-pay").focus();
    return new Promise((resolve) => { totalAnswer = resolve; });
  }

  document.getElementById("run-total-cancel").addEventListener("click", () => closeTotal(false));
  // A pass belongs to the signed-in address, so the offer asks for the sign-in before the pay page.
  document.getElementById("run-total-offer-go").addEventListener("click", (event) => {
    const plan = event.currentTarget.dataset.plan || "";
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_pass_offer", "URL Review", plan);
    if (!signedIn()) {
      closeTotal(false);
      if (window.ReviewAuth) ReviewAuth.focus();
      setTimeout(() => setStatus(rc.t("passSignIn"), true), 0);
      return;
    }
    location.href = payPage() + "?purpose=pass&plan=" + encodeURIComponent(plan);
  });
  document.getElementById("run-total-pay").addEventListener("click", () => closeTotal(true));
  totalBox.addEventListener("click", (event) => { if (event.target === totalBox) closeTotal(false); });
  totalBox.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTotal(false);
      return;
    }
    if (event.key !== "Tab") return;
    const offerGo = document.getElementById("run-total-offer");
    const stops = (offerGo.hidden ? [] : [document.getElementById("run-total-offer-go")]).concat([document.getElementById("run-total-cancel"), document.getElementById("run-total-pay")]);
    event.preventDefault();
    stops[(stops.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
  });

  async function quoteFor(ask) {
    const params = new URLSearchParams();
    params.set("frameworks", ask.frameworks.join(","));
    params.set("tools", ask.tools.join(","));
    params.set("pages", String(ask.pages));
    params.set("depth", String(ask.depth));
    params.set("deviceId", deviceId());
    if (ask.billing) params.set("billing", ask.billing);
    if (ask.pass) params.set("pass", ask.pass);
    if (ask.compareWith) {
      params.set("compareWith", ask.compareWith);
      params.set("competitors", String(ask.competitors || 1));
    }
    const coupon = window.ReviewDeal ? ReviewDeal.code() : "";
    if (coupon && !ask.pass) params.set("coupon", coupon);
    pricing = true;
    try {
      const res = await fetch(endpoint() + "/checkout/quote?" + params.toString());
      const body = await res.json();
      return res.ok && body.usd > 0 ? body : null;
    } catch (error) {
      return null;
    } finally {
      pricing = false;
    }
  }

  const sameList = (a, b) => (a || []).slice().sort().join("|") === (b || []).slice().sort().join("|");

  // The pay page leaves this after a run is paid, so the run it bought starts without asking again.
  function paidAhead(ask) {
    let paid = null;
    try { paid = JSON.parse(sessionStorage.getItem(RUN_PAID_KEY) || "null"); } catch (error) { paid = null; }
    return !!paid && paid.paid === true && sameList(paid.frameworks, ask.frameworks) && sameList(paid.tools, ask.tools) && Number(paid.pages) === ask.pages && Number(paid.depth) === ask.depth;
  }

  // true: the total was shown and Pay and run pressed; false: cancelled; null: nothing to show (a free run, an
  // unknown standing, a paid-ahead run, or no quote), so the run goes on and the server decides.
  async function confirmRun() {
    if (!standing || standing.free) return null;
    const pages = selectedPages();
    const depth = selectedDepth();
    const pass = passOn();
    if (pass) return confirmPassRun(pass, pages, depth);
    if (standing.billing === "scope" && !PAGE_CENTS[pages] && !DEPTH_CENTS[depth]) return null;
    const frameworks = selectedFrameworks();
    const tools = standing.billing === "scope" ? [] : selectedTools();
    if (!frameworks.length || paidAhead({ frameworks, tools, pages, depth })) return null;
    const quote = await quoteFor({ frameworks, tools, pages, depth, billing: standing.billing });
    if (!quote) return null;
    const items = quote.billing === "scope"
      ? [totalLine(rc.t("totalIncluded", { n: (quote.frameworks || frameworks).length }), 0)]
      : (quote.discount || []).map((row) => totalLine(row.name, row.usd));
    const scope = [totalLine(rc.t("totalPages", { n: quote.pages || pages }), quote.pageUsd || 0), totalLine(rc.t("totalDepth", { n: quote.depth || depth }), quote.depthUsd || 0)];
    return showTotal(rc.t("totalTitle"), items.concat(scope, sumLines(quote)), passOffer({ frameworks, tools, pages, depth }, quote.usd));
  }

  // A run on a pass shows a total only when it asks for more than the plan, and then charges only that.
  async function confirmPassRun(pass, pages, depth) {
    const ask = { frameworks: selectedFrameworks(), tools: selectedTools(), pages, depth };
    if (!ask.frameworks.length || paidAhead(ask) || !passExtrasCents(pass, ask)) return null;
    const quote = await quoteFor(Object.assign({ pass: pass.plan }, ask));
    if (!quote) return null;
    const items = (quote.discount || []).map((row) => totalLine(row.name, row.usd));
    const scope = [totalLine(rc.t("totalPages", { n: quote.pages || pages }), quote.pageUsd || 0), totalLine(rc.t("totalDepth", { n: quote.depth || depth }), quote.depthUsd || 0)];
    return showTotal(rc.t("totalTitle"), [totalLine(rc.t("totalPassRun", { n: pass.runsLeft - 1 }), 0, "total-pass")].concat(items, scope, sumLines(quote)));
  }

  // The pass offered beside a paid total: the next plan up once a pass is used up or ended; otherwise the cheapest
  // plan that covers this run, when its runs cost less each than this one does.
  function passOffer(ask, dueUsd) {
    const plans = (standing && standing.plans) || [];
    if (!plans.length || passOn()) return null;
    const last = (standing.pass && standing.pass.plan) || standing.lastPlan;
    if (last) {
      const at = plans.findIndex((plan) => plan.id === last);
      return { plan: plans[Math.min(plans.length - 1, at + 1)], up: true };
    }
    const plan = plans.find((row) => !passExtrasCents(row, ask) && row.usd / row.runs < dueUsd);
    return plan ? { plan, up: false } : null;
  }

  // On a pass each competitor run takes one pass run and adds nothing, so the server decides with no total.
  async function confirmCompare(target, urls) {
    if (!standing || standing.free || !signedIn() || passOn()) return null;
    const quote = await quoteFor({ frameworks: target.frameworks || [], tools: target.tools || [], pages: target.pages, depth: target.depth, compareWith: target.id, competitors: urls.length });
    if (!quote) return null;
    const each = Number(quote.eachUsd) || COMPARE_USD;
    const lines = urls.map((url) => totalLine(rc.t("totalCompetitor", { host: typedHost(url) }), each));
    return showTotal(rc.t("totalCompareTitle"), lines.concat(sumLines(quote)));
  }

  function closeDashboard() {
    dash.classList.remove("open");
    document.body.style.overflow = "";
    if (current && current.sample) {
      current = null;
      liveId = "";
      dash.classList.remove("is-sample");
      document.getElementById("sample-note").hidden = true;
    }
  }

  async function openSample(button) {
    if (button) button.disabled = true;
    try {
      const res = await fetch(SAMPLE_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("status " + res.status);
      const body = await res.json();
      render({ report: body.report, frameworks: body.frameworks, paid: false, sample: true });
    } catch (error) {
      if (button) button.textContent = "The sample could not be opened";
    } finally {
      if (button) button.disabled = false;
    }
  }

  document.getElementById("sample-open").addEventListener("click", (event) => { dismissGate(); openSample(event.currentTarget); });
  document.getElementById("stage-sample-open").addEventListener("click", (event) => openSample(event.currentTarget));
  if (new URLSearchParams(location.search).get("sample") === "1") openSample();

  shareOpen.addEventListener("click", () => {
    if (!current) return;
    dash.classList.add("open");
    document.body.style.overflow = "hidden";
  });
  document.getElementById("dash-close").addEventListener("click", closeDashboard);
  dash.addEventListener("click", (event) => {
    if (event.target === dash) closeDashboard();
  });
  document.getElementById("pay-close").addEventListener("click", () => { payBox.hidden = true; });
  document.getElementById("run-pay-close").addEventListener("click", () => { runPay.hidden = true; });

  function spend(kind, action) {
    if (!current || !current.report) return;
    if (current.paid) {
      action();
      return;
    }
    const id = current.report.id;
    fileUses[id] = fileUses[id] || {};
    if (fileUses[id][kind]) {
      openReportPay();
      return;
    }
    fileUses[id][kind] = true;
    action();
  }

  document.getElementById("copy-link").addEventListener("click", () => {
    spend("link", async () => {
      const link = document.getElementById("share-link").textContent;
      try { await navigator.clipboard.writeText(link); setStatus("Link copied. It opens in full only for the account that ran this report, once signed in. Anyone else sees the blurred preview.", false); }
      catch (error) { setStatus("Copy the link from the report window.", true); }
    });
  });
  const captureSeen = {};
  function registerCapture(kind) {
    if (!current || !current.report || !current.report.id) return;
    const now = Date.now();
    if (captureSeen[kind] && now - captureSeen[kind] < 4000) return;
    captureSeen[kind] = now;
    fetch(endpoint() + "/review/capture", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId: current.report.id, kind, deviceId: deviceId() })
    }).catch(() => {});
  }
  document.getElementById("print-report").addEventListener("click", () => {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_print", "URL Review", current && current.paid ? "paid" : "preview");
    spend("print", () => {
      if (!current.paid) setStatus("The print sheet does not include the report. The attempt is recorded.", false);
      window.print();
    });
  });
  window.addEventListener("beforeprint", () => {
    if (document.body.classList.contains("printing-multi")) return;
    if (document.body.classList.contains("printing-cases")) {
      registerCapture("case-print");
      return;
    }
    registerCapture("print");
    const fixSheet = document.body.classList.contains("printing-exec") && current && current.report && fixListOpen(current.report.id);
    if (!current || !(current.paid || fixSheet)) document.body.classList.add("capture-hold");
  });
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("capture-hold");
    document.body.classList.remove("printing-cases");
    document.body.classList.remove("printing-exec");
  });
  document.addEventListener("keyup", (event) => {
    if (!dash.classList.contains("open")) return;
    if (event.key === "PrintScreen") {
      registerCapture("printscreen");
      setStatus("A screenshot key was recorded with this review. The page cannot stop the picture.", false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!dash.classList.contains("open")) return;
    const shot = event.metaKey && event.shiftKey && (event.key === "3" || event.key === "4" || event.key === "5");
    if (shot) {
      registerCapture("printscreen");
      setStatus("A screenshot key was recorded with this review. The page cannot stop the picture.", false);
    }
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "p" && !document.body.classList.contains("printing-cases")) {
      registerCapture("print");
      if (!current || !current.paid) {
        event.preventDefault();
        document.body.classList.add("capture-hold");
        setStatus("The print sheet does not include the report. The attempt is recorded.", false);
      }
    }
  });
  document.addEventListener("copy", () => {
    const sel = document.getSelection();
    const report = document.getElementById("report");
    if (!sel || !sel.anchorNode || !report || !report.contains(sel.anchorNode)) return;
    registerCapture("copy");
  });
  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
  }
  function fileBanner() {
    if (current && current.paid) return PAID_LINE;
    return [MARK, MARK, MARK].join("\n");
  }
  document.getElementById("download-json").addEventListener("click", () => {
    spend("json", () => {
      const report = current.paid ? current.report : clipDeep(current.report);
      const body = current.paid
        ? { attribution: PAID_LINE, report: report }
        : { watermark: MARK, report: report };
      download("url-review-" + current.report.id + ".json", JSON.stringify(body, null, 2), "application/json");
    });
  });
  document.getElementById("download-text").addEventListener("click", () => {
    spend("text", () => {
      const report = current.report;
      const clip = (text) => current.paid ? String(text || "") : clipText(text);
      const lines = [
        fileBanner(),
        "",
        report.status === "stopped" ? "Stopped" : "Complete",
        report.host,
        report.finalUrl,
        clip(report.statement),
        "",
        "Log"
      ];
      (report.log || []).forEach((line) => lines.push((line.at || "") + " " + clip(line.text)));
      lines.push("", "Pages: " + pagesCount(report), "Technologies: " + (report.technologies || []).map((item) => item.name).join(", "), "", "Proposed cases");
      (report.cases || []).forEach((item) => {
        lines.push(item.id + " [" + item.layer + "] " + clip(item.title) + " — " + clip(item.why));
      });
      if (!current.paid) lines.push("", MARK);
      download("url-review-" + report.id + ".txt", lines.join("\n"), "text/plain");
    });
  });

  function shareTarget(net, url) {
    const text = "QA-lab URL Review report";
    const targets = {
      email: "mailto:?subject=" + encodeURIComponent(text) + "&body=" + encodeURIComponent(url),
      linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url),
      x: "https://twitter.com/intent/tweet?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text),
      whatsapp: "https://wa.me/?text=" + encodeURIComponent(text + " " + url),
      telegram: "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text),
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url)
    };
    return targets[net] || targets.email;
  }

  function closeMenus() {
    document.querySelectorAll(".report-toolbar .menu").forEach((menu) => {
      menu.hidden = true;
      document.querySelectorAll('.report-toolbar [aria-controls="' + menu.id + '"]').forEach((button) => button.setAttribute("aria-expanded", "false"));
    });
  }
  function bindMenu(toggleId, menuId) {
    const toggle = document.getElementById(toggleId);
    const menu = document.getElementById(menuId);
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = menu.hidden;
      closeMenus();
      menu.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
  }
  bindMenu("export-toggle", "export-menu");
  bindMenu("share-toggle", "share-menu");
  document.addEventListener("click", closeMenus);
  document.getElementById("share-row").addEventListener("click", (event) => {
    const button = event.target.closest("[data-net]");
    if (!button || !current) return;
    const net = button.getAttribute("data-net");
    spend("share", () => {
      const url = document.getElementById("share-link").textContent || location.href;
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_share", "URL Review", net);
      if (net === "system" && navigator.share) {
        navigator.share({ title: "QA-lab URL Review report", url: url }).catch(() => {});
        return;
      }
      const link = document.createElement("a");
      link.href = shareTarget(net === "system" ? "email" : net, url);
      link.target = "_blank";
      link.rel = "noopener";
      link.click();
    });
  });

  // Machine translation of this English page leaves the charts in English and joins words, so a reader
  // whose browser asks for, or translates into, a language with its own page is offered that page.
  const LANG_OFFER = {
    es: ["Esta página también existe en español, sin traducción automática.", "Abrir en español", "Cerrar"],
    pt: ["Esta página também existe em português, sem tradução automática.", "Abrir em português", "Fechar"],
    de: ["Diese Seite gibt es auch auf Deutsch, ohne maschinelle Übersetzung.", "Auf Deutsch öffnen", "Schließen"],
    fr: ["Cette page existe aussi en français, sans traduction automatique.", "Ouvrir en français", "Fermer"],
    it: ["Questa pagina esiste anche in italiano, senza traduzione automatica.", "Apri in italiano", "Chiudi"]
  };
  const LANG_OFFER_KEY = "qa-review-lang-offer";

  function offerLanguagePage(pageLangs) {
    const root = document.documentElement;
    const wanted = () => {
      const translated = /\btranslated-(ltr|rtl)\b/.test(root.className) ? String(root.lang || "").slice(0, 2).toLowerCase() : "";
      if (pageLangs.includes(translated)) return translated;
      return (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])
        .map((code) => String(code || "").slice(0, 2).toLowerCase()).find((code) => pageLangs.includes(code)) || "";
    };
    const closed = () => { try { return localStorage.getItem(LANG_OFFER_KEY) === "closed"; } catch (error) { return false; } };
    const show = () => {
      const code = wanted();
      const bar = document.getElementById("lang-offer");
      if (!code || closed() || (bar && bar.lang === code)) return;
      if (bar) bar.remove();
      const copy = LANG_OFFER[code];
      const params = new URLSearchParams(location.search);
      params.set("lang", code);
      const offer = document.createElement("div");
      offer.id = "lang-offer";
      offer.className = "lang-offer notranslate no-print";
      offer.lang = code;
      offer.setAttribute("translate", "no");
      offer.setAttribute("role", "region");
      offer.setAttribute("aria-label", copy[1]);
      offer.innerHTML = "<span>" + esc(copy[0]) + '</span> <a class="btn btn-primary" href="qa-review-' + code + ".html?" + esc(params.toString()) + esc(location.hash) + '">' + esc(copy[1]) + '</a> <button class="btn btn-ghost" type="button" aria-label="' + esc(copy[2]) + '">×</button>';
      offer.querySelector("a").addEventListener("click", () => {
        SiteI18n.persist(code);
        if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_lang_offer", "URL Review", code);
      });
      offer.querySelector("button").addEventListener("click", () => {
        try { localStorage.setItem(LANG_OFFER_KEY, "closed"); } catch (error) { /* shown again next visit */ }
        offer.remove();
      });
      const head = document.querySelector(".topbar");
      if (head) head.after(offer);
      else document.body.prepend(offer);
    };
    show();
    new MutationObserver(show).observe(root, { attributes: true, attributeFilter: ["class", "lang"] });
  }

  function mountLanguage() {
    if (!window.SiteI18n) return;
    const PAGE_LANGS = ["es", "pt", "de", "fr", "it"];
    const here = location.pathname.split("/").pop() || "qa-review.html";
    const pageLang = (here.match(/^qa-review-(es|pt|de|fr|it)\.html$/) || [])[1] || "en";
    // A language with its own page is shown as that page's language, never machine-translated over it.
    const shown = (code) => (code === "en" || PAGE_LANGS.includes(code) ? pageLang : code);
    const syncFlag = (code) => {
      ["langFlag", "langFlagGate"].forEach((id) => {
        const flag = document.getElementById(id);
        if (!flag) return;
        flag.src = SiteI18n.flagUrl(code);
        flag.alt = SiteI18n.displayName(code);
      });
    };
    ["", "Gate"].forEach((suffix) => {
      const wrap = document.getElementById("langWrap" + suffix);
      const toggle = document.getElementById("langToggle" + suffix);
      const menu = document.getElementById("langMenu" + suffix);
      if (!wrap || !toggle || !menu) return;
      const renderMenu = (query) => {
        const list = menu.querySelector(".lang-options-list");
        if (!list) return;
        list.innerHTML = "";
        SiteI18n.orderedLanguages().forEach((meta) => {
          if (!SiteI18n.matchesQuery(meta, query)) return;
          const option = document.createElement("button");
          option.type = "button";
          option.className = "lang-option";
          option.lang = meta.code;
          option.innerHTML = '<img src="' + SiteI18n.flagUrl(meta.code) + '" alt=""><span>' + meta.native + "</span>";
          option.onclick = () => {
            if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_language_change", "URL Review", meta.code);
            const page = PAGE_LANGS.includes(meta.code) ? "qa-review-" + meta.code + ".html" : "qa-review.html";
            if (page !== here) {
              SiteI18n.persist(meta.code);
              location.assign(page + "?lang=" + encodeURIComponent(meta.code));
              return;
            }
            SiteI18n.selectLanguage(meta.code);
            document.documentElement.lang = meta.code;
          };
          list.appendChild(option);
        });
      };
      menu.innerHTML = '<input class="lang-search" type="search" placeholder="Search language" aria-label="Search language"><div class="lang-options-list"></div>';
      const search = menu.querySelector(".lang-search");
      search.addEventListener("input", () => renderMenu(search.value));
      renderMenu("");
      SiteI18n.bindMenu(wrap, toggle, menu, (open) => wrap.classList.toggle("open", open));
    });
    SiteI18n.resolve().then((lang) => {
      if (pageLang === "en" && PAGE_LANGS.includes(lang) && !navigator.webdriver) {
        location.replace("qa-review-" + lang + ".html" + location.search + location.hash);
        return;
      }
      if (pageLang === "en") offerLanguagePage(PAGE_LANGS);
      const code = shown(lang || "en");
      syncFlag(code);
      document.documentElement.lang = code;
      SiteI18n.loadWidget();
      SiteI18n.applyMachineTranslate(code);
    });
    SiteI18n.follow((lang) => {
      const code = shown(lang || "en");
      syncFlag(code);
      document.documentElement.lang = code;
      SiteI18n.applyMachineTranslate(code);
    });
  }

  function reviewTour() {
    const steps = [];
    if (!gate.hidden) {
      steps.push({ selector: "#terms-form", title: "The disclaimers", body: "Every control stays off until each box is checked. The disclaimers name the local, national, and international rules. One completed review, a stop, and a single showing of the report are part of that text.", demoMs: 1800 });
    }
    const counts = document.getElementById("reviews-fact");
    if (counts && !counts.hidden) {
      steps.push({ selector: "ul.facts", title: "You are not the first", body: "These two numbers count up live: pages read and reviews run by everyone so far. Only a review that really read a page adds to them.", demoMs: 1500 });
    }
    steps.push(
      { selector: "#sign-in", title: "Sign in", body: "Sign in with email or an account you already have. The review runs only on the device where you sign in.", demoMs: 1500 },
      { selector: "#name", title: "Who is asking", body: "Your name is stored with the review. Your email comes from the sign-in. Changing the name does not open a second completed review.", demoMs: 1500 },
      { selector: "#reasons", title: "Why this review", body: "Pick a reason. Asking for a QA-lab verification shows how to get in touch. Other opens the box underneath so you can write your own in a sentence.", demoMs: 1600 },
      { selector: "#url-field", title: "The page", body: "Start typing and the box helps. It suggests well-known sites, says \"Did you mean…?\" when a host does not exist, and after a / it offers real pages from the site's sitemap. https:// is already in front, so the review always asks for a public secure page.", demoMs: 1800 },
      { selector: "#fw-picker", title: "Frameworks", body: "Pick the tools your team works with. Each proposed case is written for them, and the case export carries a starting script for each one. Nothing is launched against your site.", demoMs: 1600 },
      { selector: "#req-scope", title: "Pages to review", body: "Only care about the docs? Type example.com/docs and Stay in this section keeps later pages under that path. Pick how many pages, how many links deep, and the language to ask the site for. The included first review is 20 pages and 2 links deep. A bigger one shows its price before it starts.", demoMs: 1800 },
      { selector: "#review-btn", title: "Start the review", body: "Review checks the fields first. Then it analyzes public pages on that host and writes a line for each step.", demoMs: 1500 },
      { selector: "#run-log", title: "The log", body: "Grab a coffee and watch. A meter walks through connecting, the pages, the browser pass, the cases, the speed checks, and the score, and each line shows up the moment it happens. A slow site gets a \"Still working\" note instead of silence.", demoMs: 1800 },
      { selector: "#stop-btn", title: "Stop", body: "Changed your mind? Stop ends the analysis, the pages already saved stay in the report, and the record says it was stopped. Only your sign-in on this device can stop your run.", demoMs: 1600 },
      { selector: "#report-once", title: "The log beside the questions", body: "Each line is a step in the analysis. When the analysis finishes, the report dashboard opens with the download, print, and share actions. Its cases come first by risk, and each one names the real page it saw.", demoMs: 1800 },
      { selector: "#report-once", title: "Ask the report", body: "In a paid report, ask \"Why is F-01 rated this way?\" and the answer comes only from this review, with the fix, a Playwright case, or a GitHub or Jira issue ready to paste. It never guesses past what the review saw.", demoMs: 1800 },
      { selector: "#report-once", title: "Next to a competitor", body: "Curious how the shop next door does? Compare in the report runs the same public checks on their site and puts the six scores side by side, with what only one of you has. Each competitor is 9 USD.", demoMs: 1800 },
      { selector: "#report-once", title: "A word with your chatbot", body: "On a site you have shown is yours, the review chats with its chat widget: pricing, asking for a human, a refund, and two tricks a bot should refuse. At most six messages in one minute, with a made-up email and phone.", demoMs: 1800 },
      { selector: ".topbar a[href='qa-review-account.html']", title: "Your reviews", body: "Every run you start waits here. Search them, open several at once, download them, delete them, or verify a site you own with a DNS record or a homepage tag.", demoMs: 1600 },
      { selector: "#langWrap", title: "Language", body: "A language chosen here is the language on the CV, the studio, the lab, and this review. The same choice sticks when you move between them.", demoMs: 1500 },
      { selector: "#tour-start-btn", title: "Open this tour again", body: "This walkthrough stays closed after the first visit. How this review works brings it back whenever you want it.", demoMs: 1500 }
    );
    return { name: "URL review", key: "hasSeenReviewTour", steps: steps };
  }

  function bootLanguageAndTour() {
    mountLanguage();
    const tourButton = document.getElementById("tour-start-btn");
    if (tourButton) tourButton.addEventListener("click", () => {
      if (window.SiteTour) SiteTour.start(reviewTour());
    });
    if (window.SiteTour && !new URLSearchParams(location.search).get("report")) SiteTour.autoStart(reviewTour());
  }

  bootLanguageAndTour();

  const sharedWith = new URLSearchParams(location.search);
  const shared = sharedWith.get("report");
  // From the account page: ?vs= paints the pair of saved reviews the server built, and ?compare= readies a new competitor.
  function showSharedCompare(body) {
    const card = document.getElementById("compare");
    if (!card || !body.report) return;
    const asked = sharedWith.get("compare");
    if (body.versus) paintCompare(Object.assign({}, body.report, { compare: body.versus }), false);
    else if (asked && !body.report.compare) document.getElementById("compare-url").value = asked.replace(/^\s*https?:\/\//i, "");
    else return;
    card.scrollIntoView({ block: "start" });
    if (!body.versus) document.getElementById("compare-go").focus({ preventScroll: true });
  }
  // An unpaid report from the server: the frosted preview, with the findings in full when a fix list was bought.
  function lockedPayload(body) {
    const report = body.insights ? Object.assign({}, body.preview, { insights: body.insights }) : body.preview;
    return { report, frameworks: body.frameworks || [], paid: false, addons: body.addons || [] };
  }

  async function reopenFixList(id) {
    try {
      const res = await fetch(endpoint() + "/review/open", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign(window.ReviewAuth ? ReviewAuth.proof() : {}, { id }))
      });
      const body = await res.json();
      if (res.ok && body.report) render(body);
      else if (body.preview && body.insights) render(lockedPayload(body));
    } catch (error) { /* the saved copy stays on the page */ }
  }

  if (shared) {
    let lockedShared = false;
    const openShared = async () => {
      setStatus("Opening the saved report…", false);
      try {
        const coupon = window.ReviewDeal ? ReviewDeal.code() : "";
        const res = await fetch(endpoint() + "/review/open", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign(window.ReviewAuth ? ReviewAuth.proof() : {}, { id: shared, coupon, vs: sharedWith.get("vs") || "" }))
        });
        const body = await res.json();
        lockedShared = !!body.locked;
        if (body.locked) {
          if (body.preview) render({ report: body.preview, frameworks: body.frameworks || [], paid: false });
          setStatus((body.preview ? "This report of " + (body.host || "this site") + " is below, under the frost. " : "") + (body.error || "Sign in with the account that ran this report to read it in full."), true);
          if (window.ReviewAuth) ReviewAuth.focus();
          return;
        }
        if (res.status === 402 || body.paymentRequired) {
          if (body.preview) render(lockedPayload(body));
          if (body.insights) {
            setStatus("The fix list of " + (body.host || "this site") + " is open below. The cases stay under the frost until the full report is paid.", false);
            return;
          }
          openPay(body);
          setStatus(body.preview
            ? "Your last report of " + (body.host || "this site") + " is below, under the frost. Unlock it to read it in full."
            : "This report was already shown. Opening it again asks for payment.", true);
          return;
        }
        if (!res.ok) throw new Error(body.error || "That report was not found.");
        render(body);
        showSharedCompare(body);
      } catch (error) {
        setStatus(error.message, true);
      }
    };
    if (window.ReviewAuth) ReviewAuth.onChange((on) => { if (on && lockedShared) openShared(); });
    openShared();
  }

  const CASE_LAYERS = ["Functional", "Content", "Links", "Accessibility", "Security", "Privacy", "SEO", "GEO", "Performance", "Load", "Mobile", "Internationalization", "Resilience", "Compatibility", "Media", "Analytics", "Commerce", "Forms", "Visual", "Platform", "API"];
  const EXPORT_KEY = "qa-review-case-export";
  const caseExport = document.getElementById("case-export");
  const caseFormats = document.getElementById("case-formats");

  function layerCounts(report) {
    const counts = {};
    ((report && report.cases) || []).forEach((item) => {
      if (!item || !item.layer) return;
      counts[item.layer] = (counts[item.layer] || 0) + 1;
    });
    return counts;
  }

  function csvCell(value) {
    let text = value == null ? "" : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function toCsv(headers, rows) {
    return "\uFEFF" + [headers].concat(rows).map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  function splitWhy(why) {
    const text = String(why || "");
    const cut = text.indexOf(". ");
    if (cut === -1) return { step: text, expected: "The page still matches this proposed case." };
    return { step: text.slice(0, cut + 1), expected: text.slice(cut + 2) };
  }

  function pickedCases(report, layers) {
    const want = new Set(layers);
    return ((report && report.cases) || []).filter((item) => want.has(item.layer));
  }

  function signOf(report) {
    return (report && report.signature) || { mark: "", sha256: "", issuer: "QA-lab URL Review", origin: "https://carlosandmunoz.com", alg: "SHA-256" };
  }

  function chosenFrameworks() {
    return (current && current.frameworks && current.frameworks.length) ? current.frameworks : null;
  }

  function scriptsFor(report, item) {
    if (!window.QAReviewScripts) return [];
    try {
      return QAReviewScripts.snippets(report, item, chosenFrameworks());
    } catch (error) {
      console.error("Script build failed for " + item.id, error);
      return [];
    }
  }

  function scriptText(scripts) {
    return scripts.map((one) => "[" + one.framework + "]\n" + one.code).join("\n\n");
  }

  function caseRows(report, layers) {
    const sign = signOf(report);
    return pickedCases(report, layers).map((item) => {
      const parts = splitWhy(item.why);
      const fw = item.fw || item.frameworks || [];
      return { item, parts, fw, frameworks: fw.join(", "), scripts: scriptsFor(report, item), sign };
    });
  }

  function exportFile(report, layers, kind) {
    const rows = caseRows(report, layers);
    const sign = signOf(report);
    const id = report.id || "report";
    if (kind === "scripts") {
      if (!window.QAReviewScripts) return;
      const words = rc.english ? null : {
        lang: document.documentElement.lang,
        summary: report.insights ? healthSummary(report.insights) : "",
        line: said
      };
      const pack = QAReviewScripts.bundle(report, pickedCases(report, layers), chosenFrameworks(), words);
      download("qa-lab-scripts-" + id + ".zip", QAReviewScripts.zip(pack.files, "qa-lab-" + id), "application/zip");
      return;
    }
    if (kind === "json") {
      download("qa-lab-cases-" + id + ".json", JSON.stringify({
        signature: sign,
        host: report.host,
        fetchedAt: report.fetchedAt,
        cases: rows.map((row) => ({
          id: row.item.id,
          layer: row.item.layer,
          verdict: row.item.verdict || "proposed",
          severity: row.item.severity || "",
          title: row.item.title,
          step: row.parts.step,
          expected: row.parts.expected,
          frameworks: row.fw,
          scripts: row.scripts.reduce((all, one) => { all[one.framework] = one.code; return all; }, {})
        }))
      }, null, 2), "application/json");
      return;
    }
    if (kind === "text") {
      const body = [
        sign.issuer + " · " + sign.origin,
        sign.mark,
        "SHA-256 " + sign.sha256,
        report.host + " · " + (report.fetchedAt || ""),
        ""
      ].concat(rows.map((row) => [row.item.id + " · " + row.item.layer, row.item.title, row.parts.step, row.parts.expected, row.frameworks].concat(row.scripts.length ? ["", scriptText(row.scripts)] : []).concat([""]).join("\n"))).join("\n");
      download("qa-lab-cases-" + id + ".txt", body, "text/plain");
      return;
    }
    if (kind === "pdf") {
      const host = document.getElementById("case-print");
      host.innerHTML = '<p class="report-kicker">QA-lab URL Review</p><h1>' + esc(report.host || "Test cases") + "</h1><p class=\"sign-line\">" + esc(sign.mark) + "</p><p>SHA-256 " + esc(sign.sha256) + "</p>" +
        rows.map((row) => '<article><p class="case"><span class="id">' + esc(row.item.id) + "</span> " + esc(row.item.layer) + "</p><h2>" + esc(row.item.title) + "</h2><p>" + esc(row.parts.step) + "</p><p>" + esc(row.parts.expected) + "</p>" +
          row.scripts.map((one) => '<p class="script-name" translate="no">' + fwLogo(one.framework) + esc(one.framework) + '</p><pre translate="no">' + esc(one.code) + "</pre>").join("") + "</article>").join("");
      protectNames(host);
      document.body.classList.add("printing-cases");
      registerCapture("case-print");
      window.print();
      return;
    }
    const scriptCols = FRAMEWORKS.filter((fw) => rows.some((row) => row.scripts.some((one) => one.framework === fw)));
    const table = {
      excel: ["ID", "Layer", "Title", "Step", "Expected result", "Frameworks", "QA-lab mark", "SHA-256"].concat(scriptCols.map((fw) => fw + " script")),
      testrail: ["Title", "Section", "Template", "Type", "Priority", "Steps", "Expected Result", "References", "Automation scripts"],
      xray: ["Issue Id", "Issue Type", "Summary", "Description", "Test Type", "Action", "Data", "Expected Result", "Labels", "Automation scripts"],
      zephyr: ["Name", "Status", "Priority", "Objective", "Precondition", "Folder", "Labels", "Test Script (Step-by-Step) - Step", "Test Script (Step-by-Step) - Expected Result", "Automation scripts"],
      jira: ["Issue Type", "Summary", "Description", "Priority", "Labels"],
      azure: ["Work Item Type", "Title", "Test Step", "Step Action", "Step Expected", "Priority", "State", "Tags", "Automation scripts"],
      mantis: ["Summary", "Description", "Category", "Severity"]
    }[kind];
    const rank = (item) => item.priority ? ({ P1: 0, P2: 1 }[item.priority] == null ? 2 : { P1: 0, P2: 1 }[item.priority]) : item.verdict === "fail" ? (item.severity === "critical" || item.severity === "high" ? 0 : 1) : item.verdict === "risk" ? (item.severity === "high" ? 1 : 2) : 2;
    const data = rows.map((row) => {
      const ref = sign.mark + " " + sign.sha256;
      const level = rank(row.item);
      const code = scriptText(row.scripts);
      const withCode = (text) => code ? text + "\n\nAutomation scripts\n" + code : text;
      if (kind === "excel") return [row.item.id, row.item.layer, row.item.title, row.parts.step, row.parts.expected, row.frameworks, sign.mark, sign.sha256].concat(scriptCols.map((fw) => (row.scripts.find((one) => one.framework === fw) || { code: "" }).code));
      if (kind === "testrail") return [row.item.title, row.item.layer, "Test Case (Text)", "Other", ["High", "Medium", "Low"][level], row.parts.step, row.parts.expected, ref, code];
      if (kind === "xray") return [row.item.id, "Test", row.item.title, row.item.layer, "Manual", row.parts.step, "", row.parts.expected, ref, code];
      if (kind === "zephyr") return [row.item.title, "Draft", ["High", "Normal", "Low"][level], row.parts.expected, "Proposed from a public analysis. Not executed.", row.item.layer, ref, row.parts.step, row.parts.expected, code];
      if (kind === "jira") return ["Task", row.item.title, withCode(row.item.id + " · " + row.item.layer + "\n" + row.parts.step + "\n" + row.parts.expected + "\n" + ref), ["High", "Medium", "Low"][level], "QA-lab"];
      if (kind === "azure") return ["Test Case", row.item.title, "1", row.parts.step, row.parts.expected, String(level + 1), "Design", ref, code];
      return [row.item.title, withCode(row.item.id + " · " + row.parts.step + "\n" + row.parts.expected + "\n" + ref), "General", ["major", "minor", "trivial"][level]];
    });
    const ext = kind === "excel" ? "csv" : "csv";
    download("qa-lab-" + kind + "-" + id + "." + ext, toCsv(table, data), "text/csv");
  }

  function paintCaseLayers() {
    const counts = layerCounts(current && current.report);
    const host = document.getElementById("case-layers");
    const names = CASE_LAYERS.filter((name) => counts[name]);
    host.innerHTML = names.map((name) => '<label><span><input type="checkbox" name="case-layer" value="' + esc(name) + '" checked> ' + esc(name) + '</span><small>' + counts[name] + "</small></label>").join("");
    const all = document.getElementById("case-select-all");
    all.checked = names.length > 0;
    all.disabled = !names.length;
    document.getElementById("case-export-error").textContent = names.length ? "" : "This report has no cases to export.";
    paintCaseCount();
  }

  function paintCaseCount() {
    const layers = new Set(chosenLayers());
    const total = ((current && current.report && current.report.cases) || []).filter((item) => layers.has(item.layer)).length;
    const line = document.getElementById("case-export-count");
    line.textContent = total ? total + (total === 1 ? " test case in this selection." : " test cases in this selection.") : "Choose at least one kind.";
  }

  function openCaseExport() {
    if (!current || !current.report) return;
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_cases", "URL Review", "open");
    paintCaseLayers();
    caseExport.hidden = false;
  }

  function chosenLayers() {
    return [...document.querySelectorAll('#case-layers input:checked')].map((box) => box.value);
  }

  document.getElementById("case-select-all").addEventListener("change", () => {
    const on = document.getElementById("case-select-all").checked;
    document.querySelectorAll('#case-layers input').forEach((box) => { box.checked = on; });
    paintCaseCount();
  });
  document.getElementById("case-layers").addEventListener("change", () => {
    const boxes = [...document.querySelectorAll("#case-layers input")];
    document.getElementById("case-select-all").checked = boxes.length > 0 && boxes.every((box) => box.checked);
    paintCaseCount();
  });
  document.getElementById("alarm-open").addEventListener("click", () => {
    if (!current || !current.report) return;
    const alerts = current.report.alerts || [];
    if (!alerts.length) return;
    if (current.paid === true || current.free === true || alertsOpen(current.report.id)) {
      paintAlarm(current.report, true);
      return;
    }
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_alerts", "URL Review", String(alerts.length));
    openReportPay();
  });
  document.getElementById("credential-open").addEventListener("click", () => {
    if (!current || !current.report) return;
    if (current.free === true || credentialOpen(current.report.id)) {
      paintCredential(current);
      return;
    }
    try {
      sessionStorage.setItem("qa-review-credential", JSON.stringify({
        reportId: current.report.id,
        paid: false,
        report: current.report,
        frameworks: current.frameworks || [],
        reasonCode: "credentials"
      }));
    } catch (error) {
      setStatus("This browser could not keep the report for the payment page.", true);
      return;
    }
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_credentials", "URL Review", "open");
    location.href = payPage() + "?purpose=credentials&reportId=" + encodeURIComponent(current.report.id);
  });
  document.getElementById("case-export-open").addEventListener("click", openCaseExport);
  document.getElementById("case-export-close").addEventListener("click", () => { caseExport.hidden = true; });
  document.getElementById("case-export-go").addEventListener("click", () => {
    const layers = chosenLayers();
    const error = document.getElementById("case-export-error");
    if (!layers.length) {
      error.textContent = "Choose at least one kind.";
      return;
    }
    const bought = current && Array.isArray(current.addonLayers) ? current.addonLayers : [];
    if (current && (current.paid === true || current.free === true || layers.every((name) => bought.indexOf(name) !== -1))) {
      caseExport.hidden = true;
      openCaseFormats({ report: current.report, layers });
      return;
    }
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_cases", "URL Review", String(layers.length));
    caseExport.hidden = true;
    openReportPay();
  });

  const FORMAT_CHOICES = [
    ["scripts", "Automation scripts", "A ZIP with one suite per chosen framework, ready to edit and run"],
    ["excel", "Excel", "A CSV workbook Excel can open"],
    ["testrail", "TestRail", "CSV for a text test-case import"],
    ["xray", "Xray", "CSV of Test issues for Jira"],
    ["zephyr", "Zephyr Scale", "CSV with folder, step, and expected result"],
    ["jira", "Jira", "CSV of tasks a project can import"],
    ["azure", "Azure Test Plans", "CSV of test cases"],
    ["mantis", "MantisBT", "CSV of issues"],
    ["json", "JSON", "One object, with the signature"],
    ["text", "Text", "A readable list"],
    ["pdf", "Print or save as PDF", "Opens the browser print dialog"]
  ];

  function openCaseFormats(saved) {
    const sign = signOf(saved.report);
    document.getElementById("case-sign").textContent = sign.mark + "\n" + sign.sha256;
    document.getElementById("case-format-list").innerHTML = FORMAT_CHOICES.map((item) => '<button type="button" data-format="' + item[0] + '"><b>' + item[1] + "</b><span>" + item[2] + "</span></button>").join("");
    caseFormats.hidden = false;
    caseFormats.dataset.layers = (saved.layers || []).join("|");
  }

  document.getElementById("case-format-close").addEventListener("click", () => { caseFormats.hidden = true; });
  document.getElementById("case-format-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-format]");
    if (!button || !current || !current.report) return;
    const layers = (caseFormats.dataset.layers || "").split("|").filter(Boolean);
    exportFile(current.report, layers, button.getAttribute("data-format"));
  });

  const caseFlag = new URLSearchParams(location.search).get("caseExport");
  if (caseFlag === "1") {
    const restore = () => {
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(EXPORT_KEY) || "null"); } catch (error) { saved = null; }
      if (!saved || !saved.paid || !saved.report) return;
      liveId = saved.report.id;
      current = { report: saved.report, frameworks: saved.frameworks || [], paid: false };
      render(current);
      openCaseFormats(saved);
    };
    restore();
  }

  function restorePaid(flag, key, mark) {
    if (new URLSearchParams(location.search).get(flag) !== "1") return;
    const apply = () => {
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(key) || "null"); } catch (error) { saved = null; }
      if (!saved || !saved.paid || !saved.report) return;
      liveId = saved.report.id;
      current = { report: saved.report, frameworks: saved.frameworks || [], paid: false, reasonCode: saved.reasonCode || "" };
      render(current);
      if (mark) mark();
    };
    apply();
  }
  restorePaid("alerts", "qa-review-alerts");
  restorePaid("credentialRun", "qa-review-credential");
  restorePaid("fixlist", FIXLIST_KEY, () => {
    setStatus("The fix list is paid. Scores and findings are open below; the cases stay blurred until the full report is paid.", false);
    // A preview carries frosted findings, so the server sends them again now that the fix list is recorded.
    if (current && current.report && current.report.preview) reopenFixList(current.report.id);
  });
  restorePaid("compareRun", COMPARE_KEY, () => {
    const saved = savedCompare();
    const left = saved ? (saved.queue || []).length : 0;
    if (saved) setStatus("The comparison with " + saved.url + " is paid. Press Compare in the report to run it" + (left ? " and the other " + (left === 1 ? "competitor" : left + " competitors") + " after it" : "") + ".", false);
  });
  document.getElementById("compare-go").addEventListener("click", startCompare);
  document.getElementById("compare-add").addEventListener("click", () => {
    const row = compareMore().find((item) => item.hidden);
    if (!row) return;
    row.hidden = false;
    syncCompareAdd();
    row.querySelector("input").focus();
  });
  compareMore().forEach((row) => row.querySelector(".compare-remove").addEventListener("click", () => {
    const kept = compareInputs().filter((input) => !input.closest("[data-compare-more][hidden]") && !row.contains(input)).map((input) => input.value.trim());
    fillCompareBoxes(kept);
    const open = compareMore().filter((item) => !item.hidden);
    (open.length ? open[open.length - 1].querySelector("input") : document.getElementById("compare-add")).focus();
  }));
  document.getElementById("compare-back").addEventListener("click", backToReport);
  document.getElementById("compare-stop").addEventListener("click", (event) => {
    if (!activeRun || stopBtn.disabled) return;
    event.currentTarget.disabled = true;
    document.getElementById("compare-running-text").textContent = "Stopping. The comparison uses the pages already checked.";
    stopBtn.click();
  });
  compareInputs().forEach((compareInput) => {
    compareInput.addEventListener("input", () => {
      const next = compareInput.value.replace(/^\s*https?:\/\//i, "").replace(/^\/+/, "");
      if (next !== compareInput.value) compareInput.value = next;
    });
    compareInput.addEventListener("keydown", (event) => {
      // Enter on a highlighted suggestion picks it (js/url-suggest.js) instead of starting the run.
      if (event.key !== "Enter" || event.defaultPrevented || compareInput.hasAttribute("aria-activedescendant")) return;
      event.preventDefault();
      startCompare();
    });
  });

  const WIRE_CLIPS = ["assets/wire/scan.mp4", "assets/wire/bars.mp4", "assets/wire/orbit.mp4", "assets/wire/moon.mp4", "assets/wire/pulse.mp4", "assets/wire/drift.mp4", "assets/wire/mesh.mp4", "assets/wire/ring.mp4"];
  let wireItems = [];
  let wireAt = 0;
  function wireMarkup(items, clipStart) {
    return items.map((item, index) =>
      '<a class="wire-item" href="' + esc(item.href) + '"' + (item.lang ? ' lang="' + item.lang + '" translate="no"' : "") + ' target="_blank" rel="noopener noreferrer"><video class="wire-art" muted loop playsinline autoplay preload="auto" src="' + esc(WIRE_CLIPS[(clipStart + index) % WIRE_CLIPS.length]) + '"></video><span><strong>' + esc(item.title) + "</strong><small>" + esc(item.meta) + "</small></span></a>"
    ).join("");
  }
  let wireKey = "";
  function paintWireRows() {
    const rows = wire.querySelectorAll(".wire-row");
    const waiting = [{ href: location.pathname.split("/").pop() || "qa-review.html", title: rc.t("wireWaiting"), meta: rc.t("wireNone"), lang: rc.english ? "" : rc.lang }];
    const source = wireItems.length ? wireItems : waiting;
    const key = source.map((item) => item.href + "|" + item.title).join("\n") + "@" + wire.clientWidth;
    if (key === wireKey) return;
    wireKey = key;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rows.forEach((row, rowIndex) => {
      const track = row.querySelector(".wire-track");
      const slice = source.filter((item, index) => index % rows.length === rowIndex);
      const shown = slice.length ? slice : source.slice(0, 1);
      track.classList.remove("run");
      track.innerHTML = '<div class="wire-set">' + wireMarkup(shown, rowIndex * 3) + "</div>";
      const set = track.firstChild;
      const unit = set.innerHTML;
      for (let i = 0; i < 12 && set.scrollWidth < row.clientWidth; i++) set.insertAdjacentHTML("beforeend", unit);
      if (!reduced) track.appendChild(set.cloneNode(true)).setAttribute("aria-hidden", "true");
      track.querySelectorAll('[aria-hidden="true"] a').forEach((link) => { link.tabIndex = -1; });
      track.querySelectorAll("video").forEach((video) => { video.play().catch(() => {}); });
      if (reduced) return;
      track.style.animationDuration = Math.max(20, set.scrollWidth / 42).toFixed(1) + "s";
      track.getBoundingClientRect();
      track.classList.add("run");
    });
    const lang = window.SiteI18n && SiteI18n.current ? SiteI18n.current() : "en";
    if (lang && lang !== "en" && window.SiteI18n && SiteI18n.refreshTranslation) SiteI18n.refreshTranslation();
  }
  async function connectionPlace() {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => { if (controller) controller.abort(); }, 2200);
    try {
      const response = await fetch("https://ipwho.is/", { signal: controller ? controller.signal : undefined });
      if (!response.ok) return { country: "", city: "" };
      const data = await response.json();
      if (!data || !data.success) return { country: "", city: "" };
      return {
        country: /^[A-Za-z]{2}$/.test(data.country_code || "") ? data.country_code.toUpperCase() : "",
        city: String(data.city || "").slice(0, 40)
      };
    } catch (error) {
      return { country: "", city: "" };
    } finally {
      clearTimeout(timer);
    }
  }
  async function loadWire() {
    const place = await connectionPlace();
    const lang = window.SiteI18n && SiteI18n.current ? SiteI18n.current() : "en";
    const params = new URLSearchParams();
    if (place.country) params.set("country", place.country);
    if (place.city) params.set("city", place.city);
    params.set("lang", lang || "en");
    try {
      const response = await fetch(endpoint() + "/news?" + params.toString());
      if (!response.ok) return;
      const body = await response.json();
      if (!body || !Array.isArray(body.items) || !body.items.length) return;
      wireItems = body.items;
      wireAt = Date.now();
      if (body.countryName) wire.setAttribute("aria-label", "News from " + body.countryName);
      paintWireRows();
    } catch (error) {
      if (!wireItems.length) paintWireRows();
    }
  }
  const wire = document.querySelector(".wire");
  if (wire) {
    wire.addEventListener("click", (event) => {
      const link = event.target.closest && event.target.closest("a");
      if (!link || !window.SiteAnalytics) return;
      let host = "";
      try { host = new URL(link.href).hostname; } catch (error) { host = ""; }
      SiteAnalytics.trackEvent("qa_review_news", "URL Review", host || "headline");
    });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paintWireRows();
    if (!reduced) {
      wire.addEventListener("animationiteration", (event) => {
        if (event.target.classList.contains("wire-track") && Date.now() - wireAt > 3 * 60 * 1000) {
          wireAt = Date.now();
          loadWire();
        }
      });
    }
    let wireResize = 0;
    window.addEventListener("resize", () => {
      clearTimeout(wireResize);
      wireResize = setTimeout(paintWireRows, 250);
    });
    loadWire();
    if (window.SiteI18n && SiteI18n.follow) SiteI18n.follow(() => loadWire());
    if (reduced) window.setInterval(loadWire, 3 * 60 * 1000);
  }

  function liveCount(factId, countId) {
    const fact = document.getElementById(factId);
    const count = document.getElementById(countId);
    if (!fact || !count) return null;
    let shown = 0;
    let frame = 0;
    return function paint(target) {
      if (!target) return;
      fact.hidden = false;
      const lang = window.SiteI18n && SiteI18n.current ? SiteI18n.current() : "en";
      const format = (value) => Math.round(value).toLocaleString(lang || "en");
      cancelAnimationFrame(frame);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target <= shown) {
        shown = target;
        count.textContent = format(target);
        return;
      }
      const from = shown;
      const start = performance.now();
      const duration = from ? 900 : 1600;
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        shown = from + (target - from) * (1 - Math.pow(1 - t, 3));
        count.textContent = format(shown);
        if (t < 1) frame = requestAnimationFrame(step);
        else shown = target;
      };
      frame = requestAnimationFrame(step);
    };
  }
  const paintPages = liveCount("reviewed-fact", "reviewed-count");
  const paintReviews = liveCount("reviews-fact", "reviews-count");
  async function loadReviewed() {
    if (document.hidden) return;
    try {
      const response = await fetch(endpoint() + "/stats");
      if (!response.ok) return;
      const body = await response.json();
      if (paintPages) paintPages(Number(body && body.pages) || 0);
      if (paintReviews) paintReviews(Number(body && body.reviews) || 0);
    } catch (error) {
      return;
    }
  }
  if (paintPages || paintReviews) {
    loadReviewed();
    window.setInterval(loadReviewed, 2 * 60 * 1000);
  }
})();
