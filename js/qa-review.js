(function () {
  const TERMS_KEY = "qa-review-terms";
  const DEVICE_KEY = "qa-review-device";
  const SHOWN_KEY = "qa-review-shown";
  const SAMPLE_URL = "assets/qa-review-sample.json";
  const TERMS_VERSION = "2026-10-22.2";
  const PAGE_CHOICES = [20, 40, 60, 80, 100];
  const DEPTH_CHOICES = [2, 3, 4, 5];
  const PRICE = 19;
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
      if (!app.inert && !activeRun) reviewBtn.disabled = !on;
    });
  }

  function unlock() {
    gate.hidden = true;
    gate.classList.remove("is-leaving");
    app.inert = false;
    document.querySelectorAll("[data-gated]").forEach((el) => { el.inert = false; });
    fields().forEach((el) => { el.disabled = false; });
    reasonBox.disabled = true;
    syncSection();
    stopBtn.disabled = true;
    reviewBtn.disabled = !signedIn();
    sessionStorage.setItem(TERMS_KEY, TERMS_VERSION);
    if (window.SiteTour && !new URLSearchParams(location.search).get("report")) SiteTour.autoStart(reviewTour());
  }

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
    box.disabled = app.inert || !path;
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
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { unlock(); return; }
    gate.classList.add("is-leaving");
    setTimeout(unlock, 340);
  });
  if (sessionStorage.getItem(TERMS_KEY) === TERMS_VERSION) unlock();

  function syncReasonExtras() {
    const code = reasonCode();
    const other = code === "other";
    reasonBox.disabled = !other || app.inert;
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

  function centsForIndex(index) {
    const off = index <= 1 ? 0 : index <= 3 ? 10 : index <= 5 ? 15 : index <= 7 ? 20 : index <= 9 ? 25 : index <= 11 ? 30 : index <= 13 ? 35 : 40;
    return Math.round(PRICE * 100 * (100 - off) / 100);
  }

  function reviewCents(list, tools) {
    const count = (list || selectedFrameworks()).length + (tools || selectedTools()).length;
    let total = 0;
    for (let index = 1; index <= count; index += 1) total += centsForIndex(index);
    return total;
  }

  function reviewUsd(list, tools) {
    return reviewCents(list, tools) / 100;
  }

  function formatUsd(list) {
    const cents = typeof list === "number" ? Math.round(list * 100) : reviewCents(list);
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
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
    }
    const coupon = window.ReviewDeal ? ReviewDeal.code() : "";
    if (coupon && (purpose === "report" || purpose === "new-run")) params.set("coupon", coupon);
    return "qa-review-pay.html?" + params.toString();
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

  function appendLog(text) {
    const list = document.getElementById("run-log");
    // Like a terminal: keep following new lines unless the reader has scrolled up.
    const following = list.scrollHeight - list.scrollTop - list.clientHeight < 32;
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = new Date().toLocaleTimeString();
    item.appendChild(time);
    item.appendChild(document.createTextNode(text));
    list.appendChild(item);
    if (following) list.scrollTop = list.scrollHeight;
    if (window.ReviewProgress) ReviewProgress.line(text);
  }

  function seenBefore(id) {
    return (sessionStorage.getItem(SHOWN_KEY) || "").split(",").filter(Boolean).indexOf(id) !== -1;
  }

  function remember(id) {
    const ids = (sessionStorage.getItem(SHOWN_KEY) || "").split(",").filter(Boolean);
    if (ids.indexOf(id) === -1) ids.push(id);
    sessionStorage.setItem(SHOWN_KEY, ids.join(","));
  }

  function applyCopyMode(paid) {
    document.body.classList.toggle("preview-copy", !paid);
    document.body.classList.toggle("paid-copy", !!paid);
  }

  function fadeText(text, paid) {
    const raw = String(text || "");
    if (paid) return esc(raw);
    const mark = raw.search(/[.!?](\s|$)/);
    let cut = mark === -1 ? Math.max(28, Math.floor(raw.length * 0.36)) : mark + 1;
    if (cut > raw.length - 12) cut = Math.max(16, Math.floor(raw.length * 0.42));
    const parts = raw.slice(cut).split(/(\s+)/);
    let seen = 0;
    const total = parts.filter((part) => /\S/.test(part)).length || 1;
    const faded = parts.map((part) => {
      if (!/\S/.test(part)) return esc(part);
      seen += 1;
      const blur = (0.35 + (seen / total) * 7.6).toFixed(2);
      return '<span class="case-fade" style="--fade:' + blur + 'px">' + esc(part) + "</span>";
    }).join("");
    return esc(raw.slice(0, cut)) + faded;
  }

  function alertsOpen(id) {
    try {
      const saved = JSON.parse(sessionStorage.getItem("qa-review-alerts") || "null");
      return !!(saved && saved.paid && saved.reportId === id);
    } catch (error) {
      return false;
    }
  }

  function credentialOpen(id) {
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
    list.onchange = () => { toolChoice = new Set(selectedTools()); };
  }

  function paintAlarm(report, open) {
    const box = document.getElementById("alarm");
    const list = document.getElementById("alarm-list");
    const alerts = report.alerts || [];
    if (!box || !list) return;
    box.hidden = alerts.length === 0;
    document.getElementById("alarm-note").textContent = alerts.length
      ? (open
        ? "The full wording is open because this section is paid. These lines are still not proof of a break-in."
        : "The first words of each signal stay visible. The rest stays blurred until this section is paid. These lines are what the public response showed. They are not proof that someone broke in.")
      : "";
    const opener = document.getElementById("alarm-open");
    opener.hidden = open || alerts.length === 0;
    list.innerHTML = alerts.map((item) =>
      "<li><span class=\"alarm-kicker\">" + esc(item.level) + " · " + esc(item.id) + "</span><strong>" + fadeText(item.title, open) + "</strong><p>" + fadeText(item.detail, open) + "</p></li>"
    ).join("");
  }

  function paintMentions(report) {
    const list = document.getElementById("mentions");
    if (!list) return;
    const mentions = report.mentions || [];
    list.innerHTML = mentions.length
      ? mentions.map((item) => "<li><span class=\"mention-tone\">" + esc(item.tone || "Mention") + "</span> <a href=\"" + esc(item.href) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + esc(item.title) + "</a></li>").join("")
      : "<li>No public write-up was retrieved on this pass.</li>";
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

  function previewSentence(text) {
    const raw = String(text || "");
    const mark = raw.search(/[.!?](\s|$)/);
    const cut = mark === -1 ? Math.min(raw.length, 90) : Math.min(raw.length, mark + 1);
    return raw.slice(0, cut).trim() + (cut < raw.length ? " …" : "");
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
    }).join("") || '<p class="muted">No page timing was saved.</p>';
    const checks = [
      ["HTTPS", true],
      ["HSTS", !!headers.hsts],
      ["CSP", !!headers.csp],
      ["nosniff", !!headers.nosniff],
      ["Frame policy", !!headers.frame],
      ["Referrer", !!headers.referrer],
      ["Language", !!obs.lang],
      ["Viewport", !!sig.viewport]
    ];
    const ticks = checks.map(([label, on]) => '<div class="tick ' + (on ? "on" : "off") + '"><b>' + (on ? "Present" : "Missing") + "</b>" + esc(label) + "</div>").join("");
    const groups = {};
    (report.technologies || []).forEach((item) => {
      const name = item.group || "Other";
      groups[name] = (groups[name] || 0) + 1;
    });
    const groupEntries = Object.entries(groups);
    const groupMax = Math.max.apply(null, groupEntries.map((pair) => pair[1]).concat([1]));
    const groupBars = groupEntries.length ? groupEntries.map(([name, count]) =>
      '<div class="meter"><span>' + esc(name) + '</span><div class="track"><i style="width:' + Math.round(count / groupMax * 100) + '%"></i></div><span>' + count + "</span></div>"
    ).join("") : '<p class="muted">No technology group was named.</p>';
    const ranked = ((report.insights && report.insights.findings) || []).filter((item) => item.rank && item.fix).slice(0, 3).map((item) => [item.title, item.fix, true]);
    const advice = ranked.slice();
    if (!ranked.length && !headers.hsts) advice.push(["Send HSTS", "Put Strict-Transport-Security on the host with a max-age of at least six months so the next visit stays on https."]);
    if (!ranked.length && !headers.csp) advice.push(["Add a content security policy", "Name the script sources and frame-ancestors, then tighten the policy from what a real browser reports."]);
    if (!ranked.length && (obs.missingAlt || 0) > 0) advice.push(["Name the images", obs.missingAlt + " images had no alt. Informative images need a description. Decorative images need an empty alt."]);
    if (!ranked.length && !obs.lang) advice.push(["Declare the language", "Set lang on the html element to the language a person reads on the page."]);
    if (!ranked.length && (obs.scripts || 0) > 12) advice.push(["Budget the scripts", obs.scripts + " external scripts were referenced. Defer the ones that are not needed for the first view."]);
    if (!ranked.length && (obs.ms || 0) > 800) advice.push(["Watch the first response", "This document took " + obs.ms + " ms. Keep that path under a budget you can re-check."]);
    if (!advice.length) advice.push(["Keep the proposal separate from a run", "These cases are a plan. Run them later in a browser you control, with accounts the owner issued."]);
    advice.push(["This is a snapshot", "The review does not certify that the site is safe, fast, or compliant."]);
    const adviceHtml = advice.slice(0, 4).map(([title, body, finding]) => "<article><strong>" + esc(title) + "</strong><span>" + (finding ? fadeText(body, paid) : esc(body)) + "</span></article>").join("");
    document.getElementById("report-visuals").innerHTML =
      '<article class="card"><h2>Response time across the pages analyzed</h2><p class="muted">Milliseconds, in the order the pages were opened. One review, not a history of earlier days.</p>' + times + "</article>" +
      '<article class="card"><h2>Public marks on the first response</h2><div class="ticks">' + ticks + "</div></article>" +
      '<article class="card"><h2>Technology groups in this review</h2>' + groupBars + "</article>" +
      '<article class="card"><h2>Practices worth implementing</h2><div class="advice">' + adviceHtml + "</div></article>";
    const when = report.fetchedAt ? new Date(report.fetchedAt).toLocaleString() : "";
    document.getElementById("report-cover").innerHTML =
      '<div><img class="cover-logo" src="assets/qa-review-mark.svg?v=20261013c" alt=""><p class="report-kicker">QA-lab URL Review</p><h2>' + esc(report.host || "Report") + '</h2><p class="muted">' + esc(when) + "</p>" +
      (report.signature ? '<p class="sign-line">' + esc(report.signature.mark) + "</p>" : "") + "</div>" +
      '<div><p class="report-kicker">' + ((report.counts && report.counts.cases) || 0) + ' proposed cases</p><p>' + esc(report.statement || "") + "</p></div>";
    document.getElementById("print-mark").textContent = "";
  }

  const VERDICT_LABEL = { fail: "Fails now", risk: "At risk", pass: "Passes", person: "Needs a browser" };
  const AREA_NOTE = {
    SEO: "Indexing, sitemap, titles, structured data",
    GEO: "How AI answers can read and cite the site",
    Analytics: "Tags, consent, chat widgets, privacy notice, imprint",
    Security: "Headers, TLS, DNS, mail transport, domain, Safe Browsing, libraries",
    Accessibility: "Markup, axe-core, phone layout, chat launcher, accessibility statement",
    Performance: "Speed, weight, paint, layout shift, chat weight"
  };
  let findingFilter = { area: "All", verdict: "open" };

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
    document.querySelectorAll("[data-insight]").forEach((node) => { node.hidden = !on; });
  }

  function paintHealth(ins) {
    const score = ins.score || {};
    const value = score.overall || 0;
    const circumference = 2 * Math.PI * 80;
    const totals = score.totals || {};
    const areas = score.areas || {};
    document.getElementById("health").innerHTML =
      '<article class="card"><div class="health">' +
      '<div class="ring" role="img" aria-label="Health score ' + value + ' out of 100, grade ' + esc(score.grade || gradeOf(value)) + '">' +
      '<svg viewBox="0 0 196 196"><circle class="ring-track" cx="98" cy="98" r="80"></circle><circle class="ring-value" cx="98" cy="98" r="80" stroke="' + scoreColor(value) + '" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + (circumference * (1 - value / 100)).toFixed(1) + '"></circle></svg>' +
      "<b>" + value + "<small>Grade " + esc(score.grade || gradeOf(value)) + "</small></b></div>" +
      '<div><p class="health-summary">' + esc(ins.summary || "") + "</p>" +
      '<div class="verdict-chips">' + ["fail", "risk", "pass", "person"].map((key) =>
        '<span class="vchip v-' + key + '"><b>' + (totals[key] || 0) + "</b>" + esc(VERDICT_LABEL[key]) + "</span>").join("") + "</div>" +
      '<div class="verdict-chips" aria-label="Open problems by severity">' + ["critical", "high", "medium", "low"].map((key) =>
        '<span class="vchip s-' + ((score.severities || {})[key] ? key : "low") + '"><b>' + ((score.severities || {})[key] || 0) + "</b>" + esc(key) + "</span>").join("") + "</div>" +
      '<p class="meta-line">Every check below was measured from the public response, not guessed. Checks marked “Needs a browser” wait for a rendered run.</p></div></div>' +
      '<div class="areas">' + Object.keys(AREA_NOTE).map((name) => {
        const area = areas[name] || { score: 0, grade: "F", fail: 0, risk: 0, pass: 0 };
        const past = current && current.report && current.report.history && current.report.history.areas && current.report.history.areas[name];
        const moved = past ? area.score - past.before : 0;
        return '<button type="button" class="area" data-area="' + esc(name) + '"><div class="area-score"><span><b>' + area.score + "</b> " + esc(name) + (moved ? ' <span class="delta ' + (moved > 0 ? "up" : "down") + '" title="Change since your last review">' + (moved > 0 ? "+" : "") + moved + "</span>" : "") + '</span><span class="grade grade-' + esc(area.grade) + '">' + esc(area.grade) + "</span></div>" +
          '<div class="bar"><i style="width:' + area.score + "%;background:" + scoreColor(area.score) + '"></i></div>' +
          "<small>" + area.fail + " fail · " + area.risk + " at risk · " + area.pass + " pass — " + esc(AREA_NOTE[name]) + "</small></button>";
      }).join("") + "</div></article>";
    document.querySelectorAll("#health .area").forEach((button) => {
      button.addEventListener("click", () => {
        findingFilter = { area: button.getAttribute("data-area"), verdict: "all" };
        paintFindings(current.report.insights, !!current.paid);
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

  function paintExec(report, ins) {
    const host = document.getElementById("exec");
    if (!host) return;
    const score = ins.score || {};
    const ranked = (ins.findings || []).filter((item) => item.rank);
    const risks = ranked.slice(0, 3);
    const quick = ranked.filter((item) => item.effort === "minutes" && risks.indexOf(item) === -1).slice(0, 3);
    const solid = Object.keys(AREA_NOTE).filter((name) => {
      const area = (score.areas || {})[name];
      return area && (area.grade === "A" || area.grade === "B");
    });
    const sev = score.severities || {};
    const read = (report.limits && report.limits.pagesRead) || (report.pages || []).length;
    const list = (rows) => rows.length ? "<ul>" + rows.map((item) => "<li><strong>" + esc(item.title) + '</strong> <span class="meta-line">' + esc(item.area) + "</span></li>").join("") + "</ul>" : '<p class="muted">None found.</p>';
    const value = score.overall || 0;
    const letter = score.grade || gradeOf(value);
    host.innerHTML =
      historyBlock(report.history) +
      '<div class="exec-head"><span class="grade grade-' + esc(letter) + '">' + esc(letter) + "</span><p>" + esc(ins.summary || value + " out of 100.") + "</p></div>" +
      '<p class="meta-line">' + (sev.critical || 0) + " critical · " + (sev.high || 0) + " high · " + (sev.medium || 0) + " medium · " + (sev.low || 0) + " low · " +
      read + " page" + (read === 1 ? "" : "s") + " analyzed" + (report.browser && report.browser.ok ? " · checked in a headless browser" : "") + "</p>" +
      '<div class="exec-cols"><div><h3>Biggest risks</h3>' + list(risks) + "</div><div><h3>Quick wins</h3>" + list(quick) + "</div><div><h3>Already solid</h3>" +
      (solid.length ? "<ul>" + solid.map((name) => "<li><strong>" + esc(name) + '</strong> <span class="meta-line">' + esc(AREA_NOTE[name]) + "</span></li>").join("") + "</ul>" : '<p class="muted">No area scores B or better yet.</p>') + "</div></div>" +
      '<p class="no-print"><button class="btn btn-ghost" id="print-exec" type="button">Print this summary</button></p>';
    document.getElementById("print-exec").addEventListener("click", () => {
      spend("print", () => {
        if (!current.paid) setStatus("The print sheet does not include the report. The attempt is recorded.", false);
        document.body.classList.add("printing-exec");
        window.print();
      });
    });
  }

  function paintFixFirst(ins, paid) {
    const top = (ins.findings || []).filter((item) => item.rank).slice(0, 10);
    document.getElementById("fix-first").innerHTML = top.length
      ? '<p class="muted">Ranked by severity, how many pages it touches, and how long the fix takes.</p><ol class="fix-list">' + top.map((item) =>
        '<li><span class="fix-rank">' + item.rank + "</span><div>" + verdictBadge(item.verdict, item.severity) + '<span class="badge">' + esc(item.area) + "</span>" +
        "<strong>" + esc(item.title) + "</strong>" +
        '<p class="meta-line">' + fadeText(item.evidence, paid) + "</p>" +
        (item.fix ? '<p class="fix-line">' + fadeText(item.fix, paid) + "</p>" : "") +
        '<p class="meta-line">Effort: ' + esc(item.effort) + (item.count > 1 ? " · " + item.count + " places" : "") + "</p></div></li>").join("") + "</ol>"
      : '<p class="muted">Nothing fails or is at risk in the checks this review can measure.</p>';
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
    if (g.titleCut) notes.push("The title is longer than about 60 characters, so Google cuts it.");
    if (!g.description) notes.push("There is no meta description, so Google writes its own snippet from the page.");
    else if (g.descriptionCut) notes.push("The description runs past about 158 characters and is cut.");
    if (!g.icon) notes.push("No favicon is declared, so a blank globe shows instead.");
    const shareNotes = [];
    if (!s.image) shareNotes.push("No https og:image: most apps show a grey box or no card at all.");
    if (s.fallback) shareNotes.push("Some Open Graph tags are missing, so apps fall back to the title and description.");
    if (!s.card) shareNotes.push("No twitter:card tag: X shows a small link instead of a large card.");
    document.getElementById("previews").innerHTML =
      '<div><div class="serp notranslate" translate="no"><div class="serp-site">' + icon + "<div>" + esc(g.site || "") + "<small>https://" + esc(g.url || "") + "</small></div></div>" +
      "<h3>" + esc(cut(g.title || "(no title)", 62)) + "</h3><p>" + esc(cut(g.description || "Google would pick a line of text from the page here.", 160)) + "</p></div>" +
      '<p class="preview-note">' + esc(notes.join(" ") || "Title and description fit the space Google gives them.") + "</p></div>" +
      '<div><div class="share notranslate" translate="no"><div class="share-img">' + (s.image ? '<img src="' + esc(s.image) + '" alt="" referrerpolicy="no-referrer" loading="lazy" data-fallback="image">' : "<span>No og:image</span>") + "</div>" +
      '<div class="share-body"><small>' + esc(s.host || "") + "</small><strong>" + esc(cut(s.title || "(no title)", 90)) + "</strong><p>" + esc(s.description || "") + "</p></div></div>" +
      '<p class="preview-note">' + esc(shareNotes.join(" ") || "LinkedIn, WhatsApp, Slack, and X have what they need for a full card.") + "</p></div>";
    document.querySelectorAll("#previews img[data-fallback]").forEach((img) => {
      img.addEventListener("error", () => {
        const stand = document.createElement("span");
        if (img.getAttribute("data-fallback") === "dot") stand.className = "serp-dot";
        else stand.textContent = "The og:image did not load in this browser.";
        img.replaceWith(stand);
      }, { once: true });
    });
  }

  function gaugeHtml(label, value, good, poor, max, text) {
    const state = value <= good ? "pass" : value <= poor ? "risk" : "fail";
    const at = Math.min(100, (value / max) * 100);
    return '<div class="gauge ' + state + '"><div class="gauge-top"><b>' + esc(label) + "</b><span>" + esc(text) + "</span></div>" +
      '<div class="gauge-bar" role="img" aria-label="' + esc(label + " " + text + ", " + (state === "pass" ? "good" : state === "risk" ? "needs improvement" : "poor")) + '">' +
      '<i style="width:' + (good / max * 100).toFixed(1) + '%"></i><i style="width:' + ((poor - good) / max * 100).toFixed(1) + '%"></i><i></i><u style="left:' + at.toFixed(1) + '%"></u></div></div>';
  }

  function speedBlock(psi) {
    if (!psi || !psi.ok) return "";
    const field = psi.field;
    const lighthouse = "Lighthouse scored performance " + psi.score + "/100 on a simulated mid-range phone over slow 4G.";
    if (!field) return '<p class="meta-line">PageSpeed Insights: Chrome has too few visits to publish real-user numbers for this site. ' + esc(lighthouse) + "</p>";
    const rows = [];
    if (field.lcp) rows.push(gaugeHtml("Largest Contentful Paint", field.lcp.p75, 2500, 4000, 6000, (field.lcp.p75 / 1000).toFixed(1) + " s"));
    if (field.inp) rows.push(gaugeHtml("Interaction to Next Paint", field.inp.p75, 200, 500, 800, field.inp.p75 + " ms"));
    if (field.cls) rows.push(gaugeHtml("Cumulative Layout Shift", field.cls.p75, 0.1, 0.25, 0.5, String(field.cls.p75)));
    return '<h3 class="speed-title">Real visitors</h3><div class="gauges">' + rows.join("") + "</div>" +
      '<p class="meta-line">75th percentile of real Chrome visits over the last 28 days ' + (field.scope === "page" ? "on this page" : "across the whole site, because this page has too little traffic on its own") + ", from the Chrome UX Report through PageSpeed Insights. " + esc(lighthouse) + "</p>";
  }

  function paintBrowser(report) {
    const host = document.getElementById("browser-pass");
    if (!host) return;
    const b = report.browser;
    const speed = speedBlock(report.pagespeed);
    const carbon = carbonLine(report.insights && report.insights.carbon);
    if (!b || !b.ok) {
      host.innerHTML = speed + carbon + '<p class="muted">' + (b && b.error
        ? "The headless browser did not finish on this review (" + esc(b.error) + "), so the checks come from the HTML alone."
        : "This review ran without the headless browser, so the checks come from the HTML alone.") + "</p>";
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
      printers(watch.before).length ? printers(watch.before).length + " fingerprinting script" + (printers(watch.before).length === 1 ? "" : "s") : "",
      recording(watch.before).length ? recording(watch.before).length + " session recorder" + (recording(watch.before).length === 1 ? "" : "s") : "",
      typedTo(watch.before).length || typedTo(watchAfter).length ? "typing sent" : ""
    ].filter(Boolean).join(" · ") || "None seen" : "Not checked";
    const tiles = [
      ["Before a choice", beforeBad ? (consent.banner ? "fail" : "risk") : "pass", beforeBad ? beforeBad + " tracking signal" + (beforeBad === 1 ? "" : "s") : "Nothing tracked"],
      ["After Reject", after ? (afterBad ? "fail" : "pass") : "unknown", after ? (afterBad ? afterBad + " still tracked" : "Tracking stopped") : (consent.banner ? "Reject not found" : "No banner showed")],
      ["Fingerprinting and recording", !watch.before ? "unknown" : spied ? (consent.banner ? "fail" : "risk") : printers(watch.before).length ? "risk" : "pass", watchText],
      ["axe-core", axePages.length ? (rules.size ? "fail" : "pass") : "unknown", axePages.length ? rules.size + " rules fail on " + axePages.length + " page" + (axePages.length === 1 ? "" : "s") : "Did not run"],
      ["Phone width", mobile.width ? (mobile.overflow > 2 ? "fail" : "pass") : "unknown", mobile.width ? (mobile.overflow > 2 ? mobile.overflow + " px too wide" : "Fits " + mobile.width + " px") : "Not checked"],
      ["First paint", vit.fcp ? (vit.fcp > 3000 ? "fail" : vit.fcp > 1800 ? "risk" : "pass") : "unknown", vit.fcp ? (vit.fcp / 1000).toFixed(1) + " s, lab" : "Not measured"],
      ["Tablet width", tablet.width ? (tablet.overflow > 2 ? "fail" : "pass") : "unknown", tablet.width ? (tablet.overflow > 2 ? tablet.overflow + " px too wide" : "Fits " + tablet.width + " px") : "Not checked"],
      ["Text in the HTML", start.renderedWords > 150 ? (start.share < 40 ? "risk" : "pass") : "unknown", (start.share == null ? 100 : start.share) + "% of what people see"],
      ["Load errors", errors || failed ? "risk" : "pass", errors + " script · " + failed + " file"]
    ];
    const cell = (row) => {
      if (!row) return "—";
      const parts = [];
      if (row.hits) parts.push(row.hits + " tracking request" + (row.hits === 1 ? "" : "s"));
      if (row.denied) parts.push(row.denied + " cookieless ping" + (row.denied === 1 ? "" : "s"));
      if (row.loads && !parts.length) parts.push("script loaded, nothing sent");
      return parts.join(" · ") || "—";
    };
    const names = [];
    (before.vendors || []).concat(after ? after.vendors || [] : []).forEach((row) => { if (names.indexOf(row.name) === -1) names.push(row.name); });
    const find = (rows, name) => (rows || []).find((row) => row.name === name);
    const cookieList = (rows) => (rows || []).length ? rows.slice(0, 6).map((row) => row.name + (row.third ? " (" + row.domain + ")" : "")).join(", ") + (rows.length > 6 ? " …" : "") : "None";
    const consentRows = names.map((name) => "<tr><td><strong>" + esc(name) + "</strong></td><td>" + esc(cell(find(before.vendors, name))) + "</td><td>" + (after ? esc(cell(find(after.vendors, name))) : "—") + "</td></tr>").join("") +
      '<tr><td><strong>Tracking cookies</strong></td><td class="notranslate" translate="no">' + esc(cookieList(before.cookies)) + '</td><td class="notranslate" translate="no">' + (after ? esc(cookieList(after.cookies)) + (after.kept ? " · " + after.kept + " kept from before" : "") : "—") + "</td></tr>" +
      (watch.before ? [
        ["Fingerprinting", (row) => printers(row).join(", ") || "None"],
        ["Session recording", (row) => (row.recorders || []).map((rr) => rr.name + (rr.sent ? "" : ", loaded only")).join(" · ") || "None"],
        ["Typed text before submit", (row) => !row.typed ? "No contact field" : row.typed.sent.length ? row.typed.sent.map((s) => s.host).join(", ") : "Sent nowhere"]
      ].map(([label, text]) => "<tr><td><strong>" + label + '</strong></td><td class="notranslate" translate="no">' + esc(text(watch.before)) + '</td><td class="notranslate" translate="no">' + (watchAfter ? esc(text(watchAfter)) : "—") + "</td></tr>").join("") : "");
    const bannerLine = consent.banner
      ? (consent.banner === "A cookie banner" ? "A cookie banner" : esc(consent.banner)) + " was showing." + (after ? " The review pressed “" + esc(consent.rejectLabel) + "” and reloaded the page." : consent.banner === "Sourcepoint" ? " It sits in a frame, so Reject was not pressed." : " No reject button was found on its first layer.")
      : "No cookie banner appeared on the first visit.";
    const order = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    const axeRows = [...rules.values()].sort((x, y) => (order[y.impact] - order[x.impact]) || (y.nodes - x.nodes)).slice(0, 10).map((rule) =>
      "<tr><td>" + esc(rule.help) + ' <a class="notranslate" translate="no" href="' + esc(rule.helpUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(rule.id) + "</a></td><td>" + esc(rule.impact) + "</td><td>" + rule.nodes + "</td><td>" + rule.pages + "</td></tr>").join("");
    const gauge = gaugeHtml;
    const gauges = start.status ? '<div class="gauges">' +
      gauge("Largest Contentful Paint", vit.lcp || 0, 2500, 4000, 6000, ((vit.lcp || 0) / 1000).toFixed(1) + " s") +
      gauge("Cumulative Layout Shift", vit.cls || 0, 0.1, 0.25, 0.5, String(vit.cls || 0)) +
      gauge("Total Blocking Time", vit.tbt || 0, 200, 600, 1200, (vit.tbt || 0) + " ms") +
      '</div><p class="meta-line">Lab numbers from one cold load on the review server, not field data from real visitors. Green, amber, and red follow the Core Web Vitals thresholds.</p>' : "";
    const shots = b.shots || {};
    const shotCount = ["desktop", "tablet", "mobile"].filter((key) => shots[key]).length;
    const chatCard = chatHtml(report.insights && report.insights.chat);
    const textRows = [{ path: start.finalPath || "/", share: start.share, words: start.renderedWords, raw: start.rawWords }].concat((b.pages || []).filter((page) => !page.error).map((page) => ({ path: page.path, share: page.share, words: page.renderedWords, raw: page.rawWords })));
    host.innerHTML =
      '<div class="checks-grid" style="margin-bottom:12px">' + tiles.map(([label, state, text]) => '<div class="check-tile ' + state + '"><b>' + esc(label) + "</b>" + esc(text) + "</div>").join("") + "</div>" + speed + (gauges && report.pagespeed && report.pagespeed.field ? '<h3 class="speed-title">One lab load</h3>' : "") + gauges +
      (shots.desktop || shots.mobile ? '<div class="shots' + (shotCount === 3 ? " shots-3" : "") + '">' +
        (shots.desktop ? '<figure><img src="' + esc(shots.desktop) + '" alt="The start page on a first visit at 1280 px wide" loading="lazy"><figcaption>First visit, 1280 px wide, before any choice.</figcaption></figure>' : "<div></div>") +
        (shots.tablet ? '<figure><img src="' + esc(shots.tablet) + '" alt="The start page at a 768 px tablet width" loading="lazy"><figcaption>Tablet, 768 px.</figcaption></figure>' : "") +
        (shots.mobile ? '<figure><img src="' + esc(shots.mobile) + '" alt="The start page at a 390 px phone width" loading="lazy"><figcaption>Phone, 390 px.</figcaption></figure>' : "") + "</div>" : "") +
      '<div class="split"><article class="card"><h3>Tracking before and after a choice</h3><p class="muted">' + bannerLine + " Cookieless pings are Google tags with Consent Mode denied.</p>" +
      '<table class="mini-table"><thead><tr><th>Tool</th><th>Before a choice</th><th>After Reject</th></tr></thead><tbody>' + consentRows + "</tbody></table></article>" +
      '<article class="card"><h3>Text in the HTML compared with the page people see</h3><p class="muted">Most AI crawlers do not run JavaScript, so they only get the words in the HTML.</p>' +
      '<table class="mini-table"><thead><tr><th>Page</th><th>In the HTML</th><th>Words seen</th></tr></thead><tbody>' + textRows.map((row) => '<tr><td class="notranslate" translate="no">' + esc(row.path) + "</td><td>" + (row.share == null ? "—" : row.share + "%") + "</td><td>" + (row.words || 0) + "</td></tr>").join("") + "</tbody></table></article></div>" + chatCard +
      '<article class="card" style="margin-top:12px"><h3>axe-core on the rendered pages</h3>' + (axePages.length
        ? (axeRows ? '<table class="mini-table"><thead><tr><th>Rule</th><th>Impact</th><th>Elements</th><th>Pages</th></tr></thead><tbody>' + axeRows + "</tbody></table>" : '<p class="muted">No WCAG 2.2 AA rule failed on ' + axePages.length + " page" + (axePages.length === 1 ? "" : "s") + ". Automated rules catch about a third of real issues.</p>") +
          '<p class="meta-line notranslate" translate="no">' + esc(axePages.map((page) => page.path).join(" · ")) + "</p>"
        : '<p class="muted">axe-core did not finish in the time the browser had.</p>') + "</article>" +
      '<p class="meta-line">' + esc(b.engine || "Chromium") + " from an EU address (Belgium) · " + Math.round((b.ms || 0) / 1000) + " s · " + (start.requests || 0) + " requests to " + (start.hosts || 0) + " hosts. " + (after ? "The only click was the banner's reject button." : "Nothing was clicked.") + (watch.before && watch.before.typed ? " A test address was typed into one form field, never submitted, and blocked wherever a script tried to send it." : "") + " Lab numbers come from one unthrottled load.</p>" + carbon;
  }

  function chatHtml(chat) {
    if (!chat) return "";
    const st = chat.states || {};
    const badge = (state) => VERDICT_LABEL[state] ? verdictBadge(state) : '<span class="badge">Not checked</span>';
    const names = (rows) => rows.length ? rows.join(", ") : "None";
    const launcher = chat.launcher;
    const rows = [
      ["Before a choice", st.consent, '<span class="notranslate" translate="no">' + esc(names(chat.cookies)) + "</span>" + (chat.banner ? "" : " · no banner asked first")],
      ["After Reject", chat.rejected ? st.reject : "", chat.rejected ? '<span class="notranslate" translate="no">' + esc(names(chat.rejected.cookies)) + "</span> · " + chat.rejected.requests + " request" + (chat.rejected.requests === 1 ? "" : "s") : (chat.banner ? "Reject was not pressed" : "No banner showed")],
      ["Weight on the start page", st.weight, chat.kb + " KB · " + chat.ms + " ms of script time · " + chat.requests + " request" + (chat.requests === 1 ? "" : "s")],
      ["Launcher on a phone", launcher ? st.cover : "", launcher ? (launcher.covers ? "Covers " + launcher.covers + " button" + (launcher.covers === 1 ? "" : "s") : "Covers no button") : "Not found"],
      ["Launcher name", launcher && launcher.known ? st.name : "", launcher && launcher.known ? (launcher.name ? "Announced as “" + esc(launcher.name) + "”" : "No accessible name") : "Not checked"],
      ["Keyboard in the open chat", chat.opened ? (st.trap === "fail" || st.focus === "risk" ? (st.trap === "fail" ? "fail" : "risk") : st.trap) : "", chat.opened ? (st.trap === "fail" ? "Focus is trapped" : st.focus === "risk" ? "Focus stays on the page" : st.trap === "pass" ? "Focus moves in and out" : "Needs a person") : "The chat did not open"]
    ];
    return '<article class="card" style="margin-top:12px"><h3>Chat widget</h3><p class="muted"><span class="notranslate" translate="no">' + esc(chat.vendors.map((row) => row.name).join(", ")) + "</span>" +
      (chat.vendors.some((row) => row.ai) ? " · AI chatbot" : "") + ". Weight and cookies were measured before anyone opened it. The launcher was checked at 390 px, then opened once.</p>" +
      '<table class="mini-table"><thead><tr><th>Check</th><th>Result</th><th>What the browser saw</th></tr></thead><tbody>' +
      rows.map(([label, state, text]) => "<tr><td><strong>" + esc(label) + "</strong></td><td>" + badge(state) + "</td><td>" + text + "</td></tr>").join("") + "</tbody></table></article>";
  }

  function carbonLine(c) {
    if (!c || !c.grams) return "";
    const size = c.bytes >= 1e6 ? (c.bytes / 1e6).toFixed(1) + " MB" : Math.round(c.bytes / 1e3) + " KB";
    return '<p class="meta-line">Carbon: about ' + c.grams.toFixed(2) + " g CO₂e for a first visit to the start page (rating " + esc(c.rating) + "), from the " + size + " transferred " +
      (c.source === "lighthouse" ? "in the Lighthouse run" : "on the browser's cold load") + ". Sustainable Web Design model v4 at the global average grid. An estimate for information, not scored.</p>";
  }

  function paintGeo(ins) {
    const geo = ins.geo || {};
    const view = geo.aiView || {};
    const roles = [["answers", "Answer engines (cite pages in replies)"], ["search", "Search engines (also feed AI Overviews and Copilot)"], ["training", "Model training (blocking is a policy choice)"]];
    const bots = roles.map(([role, label]) => {
      const list = (geo.crawlers || []).filter((bot) => bot.role === role);
      if (!list.length) return "";
      return '<p class="bot-group">' + esc(label) + "</p>" + list.map((bot) =>
        '<div class="bot' + (bot.allowed ? "" : " no") + '"><i aria-hidden="true">' + (bot.allowed ? "✓" : "✕") + '</i><div><span class="notranslate" translate="no">' + esc(bot.token) + "</span> — " + esc(bot.product) +
        "<small>" + (bot.allowed ? (bot.blockedPages ? bot.blockedPages + " of the pages analyzed are closed to it." : "Allowed.") : "Blocked" + (bot.rule ? " by " + esc(bot.rule) : "") + ".") + "</small></div></div>").join("");
    }).join("");
    const llms = geo.llms || {};
    const entity = geo.entity;
    const facts = [
      ["llms.txt", llms.ok && llms.complete ? "pass" : "risk", llms.ok ? (llms.sections || 0) + " sections" + (llms.complete ? "" : ", incomplete") : "Not published"],
      ["Entity", entity ? "pass" : "risk", entity ? entity.type + (entity.sameAs && entity.sameAs.length ? " · " + entity.sameAs.length + " profiles" : "") : "None"],
      ["Text without JS", view.chars >= 900 ? "pass" : view.chars >= 300 ? "risk" : "fail", (view.chars || 0) + " characters"],
      ["Q&A shape", geo.questionHeadings || (geo.schemaTypes || []).indexOf("FAQPage") !== -1 ? "pass" : "risk", (geo.questionHeadings || 0) + " question headings"]
    ];
    const outlineHtml = (view.outline || []).length ? '<ul class="ai-outline">' + view.outline.map((item) => '<li class="l' + item.level + '">H' + item.level + " · " + esc(item.text) + "</li>").join("") + "</ul>" : '<p class="muted">No h1 to h3 headings in the HTML.</p>';
    document.getElementById("geo").innerHTML =
      '<div class="checks-grid" style="margin-bottom:12px">' + facts.map(([label, state, text]) => '<div class="check-tile ' + state + '"><b>' + esc(label) + "</b>" + esc(text) + "</div>").join("") + "</div>" +
      '<div class="split"><article class="card"><h3>The text an AI crawler receives</h3><p class="muted">Most AI crawlers do not run JavaScript. This is what the raw HTML of the start page hands them' + (view.appShell ? ", and the page is an empty app shell" : "") + ".</p>" +
      '<div class="ai-view notranslate" translate="no">' + esc(view.text || "(no readable text)") + (view.chars > (view.text || "").length ? " …" : "") + "</div>" +
      '<p class="meta-line">' + (view.words || 0) + " words · " + (view.chars || 0) + " characters</p><h3>Headings it can follow</h3>" + outlineHtml + "</article>" +
      '<article class="card"><h3>Who may read the site</h3><p class="muted">' + (geo.robotsFound ? "From the rules in robots.txt, checked for each crawler." : "There is no robots.txt, so every crawler is allowed.") + "</p>" + bots + "</article></div>";
  }

  function paintAnalytics(ins) {
    const a = ins.analytics || {};
    const total = ((ins.seo && ins.seo.indexability) || []).filter((row) => row.status >= 200 && row.status < 300).length || 1;
    const rows = (a.tags || []).map((tag) =>
      "<tr><td><strong>" + esc(tag.name) + "</strong>" + (tag.cookieless ? ' <span class="badge v-pass">cookieless</span>' : "") + '</td><td class="notranslate" translate="no">' + esc((tag.ids || []).join(", ") || "—") + "</td><td>" + tag.pages + " of " + total + "</td></tr>").join("");
    const consent = a.consentTools && a.consentTools.length ? a.consentTools.join(", ") : "None found";
    const mode = a.consentMode ? "analytics_storage " + (a.consentMode.analytics || "unset") + (a.consentMode.v2 ? " · v2 signals present" : " · v2 signals missing") : "No default found";
    const utm = a.utm ? (a.utm.kept ? "Kept through redirects" : "Stripped on " + a.utm.finalPath) : "Not tested";
    document.getElementById("analytics").innerHTML =
      '<div class="checks-grid" style="margin-bottom:12px">' +
      '<div class="check-tile ' + ((a.tags || []).length ? "pass" : "risk") + '"><b>Tools</b>' + (a.tags || []).length + " found</div>" +
      '<div class="check-tile ' + (a.consentTools && a.consentTools.length ? "pass" : ((a.tags || []).some((tag) => !tag.cookieless) ? "risk" : "unknown")) + '"><b>Consent tool</b>' + esc(consent) + "</div>" +
      '<div class="check-tile ' + (a.consentMode ? (a.consentMode.analytics === "denied" && a.consentMode.v2 ? "pass" : "risk") : "unknown") + '"><b>Consent Mode</b>' + esc(mode) + "</div>" +
      '<div class="check-tile ' + (a.utm ? (a.utm.kept ? "pass" : "fail") : "unknown") + '"><b>UTM parameters</b>' + esc(utm) + "</div></div>" +
      '<article class="card">' + (rows ? '<table class="mini-table"><thead><tr><th>Tool</th><th>IDs</th><th>Pages with it</th></tr></thead><tbody>' + rows + "</tbody></table>" : '<p class="muted">No known analytics or advertising tag was in the HTML of the pages analyzed.</p>') +
      ((a.untagged || []).length ? '<p class="meta-line">Pages without a tag: ' + esc(a.untagged.slice(0, 8).join(", ")) + "</p>" : "") + "</article>";
  }

  function paintSeo(ins) {
    const seo = ins.seo || {};
    const rows = seo.indexability || [];
    const map = seo.sitemap || {};
    const blocked = rows.filter((row) => !row.indexable);
    const dup = (seo.duplicates && seo.duplicates.titles) || [];
    document.getElementById("seo").innerHTML =
      '<div class="stat-row"><div class="stat"><b>' + (seo.indexable || 0) + " / " + rows.length + '</b><span>Pages indexable</span></div>' +
      '<div class="stat"><b>' + (map.found ? map.count : "—") + '</b><span>URLs in the sitemap</span></div>' +
      '<div class="stat"><b>' + (map.found ? (map.notListed || []).length : "—") + '</b><span>Indexable, not in sitemap</span></div>' +
      '<div class="stat"><b>' + dup.length + '</b><span>Shared titles</span></div></div>' +
      '<article class="card">' + (blocked.length
        ? '<table class="mini-table"><thead><tr><th>Page not indexable</th><th>Why</th></tr></thead><tbody>' + blocked.slice(0, 30).map((row) => '<tr><td class="notranslate" translate="no">' + esc(row.path) + "</td><td>" + esc(row.reason) + "</td></tr>").join("") + "</tbody></table>"
        : '<p class="muted">Every page that was analyzed can be indexed: status 200, no noindex, canonical to itself, open to Googlebot.</p>') +
      ((map.listedNotIndexable || []).length ? '<p class="meta-line">In the sitemap but not indexable: ' + esc(map.listedNotIndexable.slice(0, 6).join(", ")) + "</p>" : "") +
      ((map.notLinked || []).length ? '<p class="meta-line">In the sitemap but not linked from the pages analyzed: ' + esc(map.notLinked.slice(0, 6).join(", ")) + (map.notLinked.length > 6 ? " …" : "") + "</p>" : "") +
      ((seo.schemaTypes || []).length ? '<p class="meta-line">Structured data types: ' + esc(seo.schemaTypes.join(", ")) + "</p>" : "") + "</article>";
  }

  function paintGraph(ins) {
    const host = document.getElementById("site-graph");
    const graph = ins.graph || { nodes: [], edges: [] };
    const nodes = graph.nodes || [];
    if (nodes.length < 2) {
      host.innerHTML = '<p class="muted">Only one page was analyzed, so there is no link map to draw.</p>';
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
    const svg = '<svg viewBox="0 0 640 640" role="img" aria-label="Link map of ' + nodes.length + ' pages">' +
      extra.map((edge) => line(edge.s, edge.t, 'stroke="var(--line)" stroke-width="0.6" opacity="0.7"')).join("") +
      parent.map((p, index) => p >= 0 ? line(p, index, 'stroke="var(--muted)" stroke-width="1.1" opacity="0.55"') : "").join("") +
      nodes.map((node, index) => {
        const r = index === 0 ? 11 : 4.5 + Math.min(6, (node.inbound || 0) / 2);
        return '<circle tabindex="0" data-i="' + index + '" cx="' + pos[index].x.toFixed(1) + '" cy="' + pos[index].y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + color(node, index) + '"><title>' + esc(node.path) + " · " + esc(node.status || "no answer") + " · " + esc(node.ms) + " ms · " + (node.inbound || 0) + " links in</title></circle>";
      }).join("") +
      (nodes.length <= 40 ? nodes.map((node, index) => {
        if (index === 0) return "";
        const label = String(node.path).replace(/\?.*$/, "").split("/").filter(Boolean).pop() || node.path;
        const anchor = Math.cos(pos[index].a) >= 0 ? "start" : "end";
        const dx = anchor === "start" ? 9 : -9;
        return '<text x="' + (pos[index].x + dx).toFixed(1) + '" y="' + (pos[index].y + 3).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(cut(label, 22)) + "</text>";
      }).join("") : "") + "</svg>";
    host.innerHTML = '<div class="graph-legend"><span style="--c:var(--text)">Start page</span><span style="--c:var(--green)">Answered</span><span style="--c:var(--amber)">Slower than 1.8 s</span><span style="--c:var(--red)">Error or no answer</span><span>Bigger dot = more links point to it</span></div>' +
      '<div class="graph-wrap notranslate" translate="no">' + svg + '</div><p class="graph-detail" id="graph-detail">Select a dot to see the page.</p>';
    const detail = document.getElementById("graph-detail");
    const show = (event) => {
      const circle = event.target.closest("circle");
      if (!circle) return;
      const node = nodes[Number(circle.getAttribute("data-i"))];
      detail.textContent = node.path + " — status " + (node.status || "none") + ", " + node.ms + " ms, " + (node.inbound || 0) + " links in" + (node.from ? ", first found on " + node.from : "") + (node.title ? ". Title: " + node.title : "");
    };
    host.querySelector("svg").addEventListener("click", show);
    host.querySelector("svg").addEventListener("focusin", show);
  }

  function paintSecurity(ins) {
    const sec = ins.security || {};
    const word = { pass: "In place", risk: "Missing or weak", fail: "Failing", unknown: "Not checked" };
    document.getElementById("security").innerHTML = '<div class="checks-grid">' + (sec.headers || []).map((item) =>
      '<div class="check-tile ' + esc(item.state) + '"><b>' + esc(item.person ? "Needs a person" : word[item.state] || item.state) + '</b><span class="notranslate" translate="no">' + esc(item.label) + "</span></div>").join("") + "</div>" +
      (sec.tls ? '<p class="meta-line">TLS certificate valid until ' + esc(sec.tls.validTo) + " (" + sec.tls.daysLeft + " days)" + (sec.tls.issuer ? ", issued by " + esc(sec.tls.issuer) : "") + ".</p>" : "") +
      (sec.domain ? '<p class="meta-line"><span class="notranslate" translate="no">' + esc(sec.domain.domain) + "</span> is registered" + (sec.domain.registrar ? " with " + esc(sec.domain.registrar) : "") + (sec.domain.expires ? " until " + esc(sec.domain.expires) + " (" + sec.domain.daysLeft + " days)" : "") +
        (sec.domain.locked == null ? "" : sec.domain.locked ? ", locked against transfer" : ", with no transfer lock") + ", according to the registry's RDAP record.</p>" : "") +
      (sec.bimi ? '<p class="meta-line">' + (sec.bimi.record ? "BIMI is published, so Gmail, Yahoo and Apple Mail can show the brand logo next to its mail."
        : "No BIMI record. " + (sec.bimi.eligible ? "DMARC already rejects or quarantines spoofed mail, so a BIMI record with a logo would let Gmail, Yahoo and Apple Mail show it next to the brand's mail." : "BIMI shows a brand logo in inboxes once DMARC is at quarantine or reject.")) + " This note is not scored.</p>" : "") +
      securityMatrix(sec.pages || []);
  }

  function securityMatrix(rows) {
    if (rows.length < 2) return "";
    const cols = [["hsts", "HSTS"], ["csp", "CSP"], ["frame", "Framing"], ["nosniff", "nosniff"], ["referrer", "Referrer"], ["permissions", "Permissions"]];
    const mark = (on) => on ? '<td class="ok" aria-label="sent">✓</td>' : '<td class="no" aria-label="missing">✗</td>';
    return '<h3>Headers on every page analyzed</h3><p class="muted">A header set on the start page but missing elsewhere leaves those pages unprotected.</p>' +
      '<div class="table-scroll"><table class="mini-table sec-matrix"><thead><tr><th>Page</th>' + cols.map(([, label]) => "<th>" + esc(label) + "</th>").join("") + "<th>Cookies</th></tr></thead><tbody>" +
      rows.map((row) => '<tr><td class="notranslate" translate="no">' + esc(row.path) + "</td>" + cols.map(([key]) => mark(row[key])).join("") +
        "<td>" + (row.cookies ? row.cookies + (row.looseCookies ? ", " + row.looseCookies + " without Secure" : "") : "—") + "</td></tr>").join("") + "</tbody></table></div>";
  }

  function paintFindings(ins, paid) {
    const all = ins.findings || [];
    const areas = ["All"].concat(Object.keys(AREA_NOTE));
    const verdicts = [["open", "Fails and risks"], ["all", "Everything"], ["fail", "Fails now"], ["risk", "At risk"], ["pass", "Passes"], ["person", "Needs a browser"]];
    const bar = document.getElementById("finding-filters");
    bar.innerHTML = areas.map((name) => '<button type="button" data-area="' + esc(name) + '"' + (findingFilter.area === name ? ' class="on"' : "") + ">" + esc(name) + "</button>").join("") +
      '<span style="width:12px;display:inline-block"></span>' +
      verdicts.map(([key, label]) => '<button type="button" data-verdict="' + key + '"' + (findingFilter.verdict === key ? ' class="on"' : "") + ">" + esc(label) + "</button>").join("");
    bar.onclick = (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.hasAttribute("data-area")) findingFilter.area = button.getAttribute("data-area");
      if (button.hasAttribute("data-verdict")) findingFilter.verdict = button.getAttribute("data-verdict");
      paintFindings(ins, paid);
    };
    const shown = all.filter((item) => (findingFilter.area === "All" || item.area === findingFilter.area) &&
      (findingFilter.verdict === "all" || (findingFilter.verdict === "open" ? (item.verdict === "fail" || item.verdict === "risk") : item.verdict === findingFilter.verdict)));
    document.getElementById("findings").innerHTML = shown.length ? shown.map((item) =>
      '<div class="finding"><div><span class="id">' + esc(item.id) + "</span>" + verdictBadge(item.verdict, item.severity) + '<span class="badge">' + esc(item.area) + "</span></div>" +
      "<strong>" + esc(item.title) + "</strong><p class=\"muted\">" + fadeText(item.evidence, paid) + "</p>" +
      (item.fix ? '<p class="fix-line">' + fadeText(item.fix, paid) + "</p>" : "") +
      ((item.pages || []).length ? '<p class="meta-line notranslate" translate="no">' + esc(item.pages.slice(0, 6).join(" · ")) + (item.pages.length > 6 ? " …" : "") + "</p>" : "") +
      ((item.cases || []).length ? '<p class="meta-line">Test cases: ' + esc(item.cases.join(", ")) + "</p>" : "") + "</div>").join("")
      : '<p class="muted">No check matches this filter.</p>';
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
    const items = [
      ["Security headers", missing.length ? missing.length + " missing headers, written for " + (kit.hosting || "Netlify, Vercel, nginx, Apache, and Firebase") + "." : "All headers are already sent. The files still carry the current set."],
      ["Content-Security-Policy", "A Report-Only policy built from the " + ((kit.csp || "").match(/https:\/\//g) || []).length + " hosts this review saw. Deploy it, watch reports, then enforce."],
      ["Structured data", kit.jsonLd ? "An Organization and WebSite JSON-LD draft with the profiles the page links." : "The site already publishes an entity. No draft needed."],
      ["llms.txt", kit.llmsTxt ? "A draft listing the indexable pages with their descriptions." : "The site already publishes llms.txt."],
      ["security.txt", kit.securityTxt ? "A draft with Contact, Expires, and Canonical. Replace the address with a real inbox." : "The site already publishes security.txt."],
      ["DNS records", (kit.dns || []).length ? (kit.dns || []).length + " records to add (" + kit.dns.map(dnsLabel).join(", ") + ")." : "No SPF, DMARC, CAA, MTA-STS, or TLS-RPT record is missing."],
      ["GitHub Actions", "A workflow that runs the chosen framework scripts on every push and once a day."]
    ];
    if (kit.mtaSts) items.splice(-1, 0, ["MTA-STS policy", "An mta-sts.txt in testing mode listing the mail servers this review saw, with the _mta-sts record to announce it."]);
    if ((kit.libraries || []).length) items.splice(-1, 0, ["Library upgrades", kit.libraries.map((row) => row.name + " " + row.version + (row.ended ? " (no more fixes)" : " → " + row.fixed)).join(", ") + "."]);
    const outlines = [kit.privacyNotice ? "privacy notice" : "", kit.imprint ? "Impressum" : "", kit.accessibilityStatement ? "accessibility statement" : ""].filter(Boolean);
    if (outlines.length) items.splice(-1, 0, ["Legal pages", "Outlines for the " + outlines.join(", ").replace(/, ([^,]*)$/, " and $1") + " the review found no link to. Fill the placeholders and have them checked."]);
    if (kit.chatSnippet) items.splice(-1, 0, ["Click-to-load chat", "A plain chat button that loads the widget on the first click, so nothing is stored before a visitor asks for help."]);
    const peek = "Content-Security-Policy-Report-Only: " + (kit.csp || "");
    document.getElementById("fixkit").innerHTML =
      '<p>The scripts ZIP now carries a <span class="notranslate" translate="no">fix-kit/</span> folder: copy-ready files made from this review.' + (kit.hosting ? " The site looks hosted on <strong>" + esc(kit.hosting) + "</strong>, so that file is listed first." : "") + "</p>" +
      '<div class="fixkit-list">' + items.map(([title, body]) => "<article><strong>" + esc(title) + "</strong><span class=\"muted\">" + esc(body) + "</span></article>").join("") + "</div>" +
      '<div class="code-peek notranslate" translate="no">' + fadeText(peek, paid) + "</div>";
  }

  function paintInsights(report, paid) {
    const ins = report.insights;
    setInsightsVisible(!!ins);
    if (!ins) return;
    paintExec(report, ins);
    paintHealth(ins);
    paintFixFirst(ins, paid);
    paintBrowser(report);
    paintPreviews(ins);
    paintGeo(ins);
    paintAnalytics(ins);
    paintSeo(ins);
    paintGraph(ins);
    paintSecurity(ins);
    paintFindings(ins, paid);
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
    all.textContent = anyOpen ? "Collapse all" : "Expand all";
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

  function render(payload) {
    const report = payload.report;
    if (!report) return;
    const sample = !!payload.sample;
    if (!sample && !payload.paid && !report.preview && seenBefore(report.id) && liveId !== report.id) {
      openPay({ priceUsd: reviewUsd(payload.frameworks || []), frameworks: payload.frameworks || [] });
      return;
    }
    current = payload;
    liveId = report.id;
    if (!sample) remember(report.id);
    applyCopyMode(!!payload.paid);
    if (!sample) shareOpen.disabled = false;
    dash.classList.toggle("is-sample", sample);
    const sampleNote = document.getElementById("sample-note");
    sampleNote.hidden = !sample;
    if (sample) {
      const when = new Date(report.fetchedAt);
      sampleNote.textContent = "Sample report. This is the review of " + report.host + (isNaN(when) ? "" : " from " + when.toISOString().slice(0, 10)) + ", shown the way an unpaid report is: the opening of each case is readable and the rest stays blurred. Close it to read the disclaimers and review your own address.";
    }
    dash.classList.add("open");
    document.body.style.overflow = "hidden";
    const state = report.status === "stopped" ? "Stopped" : "Complete";
    const paid = !!payload.paid;
    paintVisuals(report, paid);
    paintInsights(report, paid);
    document.getElementById("report-statement").textContent = "";
    const counts = report.counts || { pages: 0, technologies: 0, cases: 0, byLayer: {} };
    const score = report.insights && report.insights.score;
    document.getElementById("kpis").innerHTML = (score ? [
      [score.overall + "/100", "Health score"],
      [score.totals.fail, "Fail now"],
      [score.totals.risk, "At risk"],
      [counts.pages, "Pages analyzed"]
    ] : [
      [counts.pages, "Pages analyzed"],
      [counts.technologies, "Technologies"],
      [counts.cases, "Proposed cases"],
      [(report.observed && report.observed.ms) + " ms", "First response"]
    ]).map(([value, label]) => "<div class=\"kpi\"><b>" + esc(value) + "</b><span>" + label + "</span></div>").join("");
    const layers = Object.entries(counts.byLayer || {});
    const max = Math.max.apply(null, layers.map((pair) => pair[1]).concat([1]));
    document.getElementById("layers").innerHTML = layers.length ? layers.map(([name, count]) =>
      '<div class="bar-row"><span>' + esc(name) + '</span><div class="bar"><i style="width:' + Math.round(count / max * 100) + '%"></i></div><span>' + count + "</span></div>"
    ).join("") : '<p class="muted">No layer counts were saved.</p>';
    const tech = document.getElementById("tech");
    const technologies = report.technologies || [];
    tech.innerHTML = technologies.length
      ? technologies.map((item) => '<span class="pill"><b>' + esc(item.name) + "</b> " + esc(item.group) + "</span>").join("")
      : '<span class="muted">No known technology marker was found in the HTML or headers.</span>';
    const obs = report.observed || {};
    const limits = report.limits || {};
    const asked = "pageLang" in limits
      ? (limits.pageLang ? "Requested in " + (PAGE_LANG_LABEL[limits.pageLang] || limits.pageLang) + ". " : "Requested in the site's own language. ") + (limits.section ? "Stayed under " + limits.section + ". " : "")
      : "";
    document.getElementById("observed").innerHTML = "<p><b>" + esc(obs.title || "No title") + "</b></p><p class=\"muted\">" + esc(obs.description || "No meta description.") + "</p><p>Language " + esc(obs.lang || "not set") + " · " + ((obs.h1 || []).length) + " h1 · " + (obs.forms || 0) + " forms · " + (obs.images || 0) + " images, " + (obs.missingAlt || 0) + " without alt · " + (obs.scripts || 0) + " scripts · " + (obs.bytes || 0) + " bytes</p><p class=\"muted\">" + esc(asked) + esc(limits.robotsNote || "") + "</p>" +
      (limits.timedOut ? '<p class="muted">The time budget ended after ' + (limits.pagesRead || (report.pages || []).length) + " of up to " + (limits.maxPages || "?") + ' pages, usually because the site answered slowly. If pages that matter were left out, write to <a href="mailto:qa@carlosandmunoz.com">qa@carlosandmunoz.com</a> with the report link and Carlos will look at a rerun.</p>' : "");
    paintAlarm(report, paid || alertsOpen(report.id));
    paintMentions(report);
    paintCredential(payload);
    const pages = report.pages || [];
    document.getElementById("pages").innerHTML = pages.length ? pages.map((page) =>
      "<tr><td>" + esc(page.path) + "</td><td>" + esc(page.status || page.error || "—") + "</td><td>" + esc(page.ms) + "</td><td>" + esc(page.title) + "</td></tr>"
    ).join("") : '<tr><td colspan="4">No page was saved.</td></tr>';
    const savedLog = report.log || [];
    document.getElementById("report-log").innerHTML = savedLog.length ? savedLog.map((line) =>
      "<li><time>" + esc(line.at || "") + "</time>" + esc(line.text || "") + "</li>"
    ).join("") : '<li>No log line was saved.</li>';
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
      : shown.length + " cases were identified across the tools, languages, and technologies in this review. The first sentence of each case stays visible. The rest stays blurred until the report is paid.") + ranked;
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
      return '<article class="case"><div>' + prio + '<span class="id">' + esc(item.id) + "</span> " + esc(item.layer) + '<span class="tag">' + (item.verdict ? verdictBadge(item.verdict, item.severity) : "Proposed") + "</span></div><strong>" + fadeText(item.title, paid) + '</strong><p class="muted">' + fadeText(item.why, paid) + "</p>" + where + '<p class="muted fw-line">' + tools + "</p></article>";
    }).join("") || '<p class="muted">No proposed case matches this filter.</p>';
    const link = location.origin + location.pathname + "?report=" + encodeURIComponent(report.id);
    document.getElementById("share-link").textContent = link;
    protectNames(dash);
  }

  async function readStream(res) {
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
        if (msg.type === "log") appendLog(msg.text);
        if (msg.type === "error") throw new Error(msg.error || "The review failed.");
        if (msg.type === "done") donePayload = msg;
      });
    }
    return donePayload;
  }

  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (app.inert || activeRun) return;
    if (!signedIn()) {
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_sign_in_needed", "URL Review", "client");
      setStatus("Sign in above to run a review. The review runs on the device where you sign in.", true);
      if (window.ReviewAuth) ReviewAuth.focus();
      return;
    }
    const errors = clientErrors();
    markFields(errors);
    if (errors.length) {
      setStatus(errors[0].message, true);
      return;
    }
    const runId = hexId();
    activeRun = runId;
    reviewBtn.disabled = true;
    stopBtn.disabled = true;
    const runLog = document.getElementById("run-log");
    runLog.innerHTML = "";
    runLog.classList.add("is-live");
    if (window.ReviewProgress) ReviewProgress.start({ host: urlInput.value, pages: selectedPages() });
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
        body: JSON.stringify(Object.assign(ReviewAuth.proof(), {
          termsAccepted: true,
          termsVersion: TERMS_VERSION,
          name: document.getElementById("name").value,
          email: document.getElementById("email").value,
          reasonCode: reasonCode(),
          reason: reasonBox.value,
          clientName: document.getElementById("client-name").value,
          clientEmail: document.getElementById("client-email").value,
          clientUrl: document.getElementById("client-url").value,
          url: urlInput.value,
          frameworks: selectedFrameworks(),
          tools: selectedTools(),
          pages: selectedPages(),
          depth: selectedDepth(),
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
          testKey: testKey()
        }))
      });
      stopBtn.disabled = false;
      const payload = await readStream(res);
      if (!payload || !payload.report) throw new Error("The review ended without a report.");
      layer = "All";
      payload.reasonCode = reasonCode();
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_done", "URL Review", payload.report && payload.report.host);
      render(payload);
      const stopped = payload.report.status === "stopped";
      if (window.ReviewProgress) ReviewProgress.finish(stopped ? "stopped" : "ready");
      setStatus(stopped ? "Stopped. The report uses the pages analyzed before the stop." : "Report ready. Cases are proposed, not run.", false);
      dash.scrollTop = 0;
    } catch (error) {
      if (error.fields) markFields(error.fields);
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
        openRunPay(error.body);
        setStatus("Another review waits on payment.", true);
      } else if (error.paymentRequired) {
        openPay(error.body || {});
        setStatus("Opening this report again waits on payment.", true);
      } else {
        if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_blocked", "URL Review", error.message || "");
        setStatus(error.message || "The review failed.", true);
      }
    } finally {
      runLog.classList.remove("is-live");
      activeRun = "";
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
    try {
      const res = await fetch(endpoint() + "/stop", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign(ReviewAuth.proof(), { runId: activeRun }))
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus(body.error || "The stop was refused.", true);
        stopBtn.disabled = false;
      }
    } catch (error) {
      setStatus("Stop was requested. Waiting for the pages already open.", true);
    }
  });

  function openPay(body) {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_pay_open", "URL Review", "report");
    const list = (body && body.frameworks) || (current && current.frameworks) || selectedFrameworks();
    const tools = body && body.frameworks && body.frameworks.length ? (body.tools || []) : selectedTools();
    const usd = (body && body.priceUsd) || reviewUsd(list, tools);
    const selections = list.length + tools.length;
    document.getElementById("pay-price").innerHTML = formatUsd(usd) + "<span>USD</span>";
    document.getElementById("pay-detail").textContent = "Seeing it again, or downloading, printing, or sharing it again, costs " + formatUsd(usd) + " USD for " + selections + (selections === 1 ? " selection." : " selections.") + " Frameworks come first. Checked tools follow on the same discount. The first selection is 19 USD. A paid copy keeps one line: this report was generated with QA-lab URL Review by Carlos Muñoz (https://carlosandmunoz.com).";
    document.getElementById("pay-btn").href = payQuery("report");
    showDeal("pay-deal", "pay-price", body);
    payBox.hidden = false;
    const note = document.getElementById("pay-note");
    note.textContent = (body && body.error) || ("Reopening this report costs " + formatUsd(usd) + " USD.");
    note.classList.remove("bad");
  }

  function openRunPay(body) {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_pay_open", "URL Review", "new-run");
    const list = (body && body.frameworks && body.frameworks.length) ? body.frameworks : selectedFrameworks();
    const pages = body && body.pages ? body.pages : selectedPages();
    const depth = body && body.depth ? body.depth : selectedDepth();
    const billing = body && body.billing === "scope" ? "scope" : "run";
    const tools = billing === "scope" ? [] : ((body && body.tools) || selectedTools());
    const usd = (body && body.priceUsd) || reviewUsd(list, tools);
    document.getElementById("run-pay-title").textContent = "This review is " + formatUsd(usd) + " USD";
    document.getElementById("run-pay-price").innerHTML = formatUsd(usd) + "<span>USD</span>";
    document.getElementById("run-pay-detail").textContent = billing === "scope"
      ? pages + " pages and " + depth + " links deep. The included first review is 20 pages and 2 links deep. This amount is for the wider review."
      : pages + " pages, " + depth + " links deep, and " + (list.length + tools.length) + " selections. Frameworks come first. Checked tools follow on the same discount. The amount is the schedule plus the size of the review.";
    document.getElementById("go-pay").href = payQuery("new-run", body || {});
    showDeal("run-pay-deal", "run-pay-price", body);
    runPay.hidden = false;
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

  async function openSample() {
    const button = document.getElementById("sample-open");
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

  document.getElementById("sample-open").addEventListener("click", openSample);
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
      openPay({ priceUsd: reviewUsd(current.frameworks || []), frameworks: current.frameworks || [] });
      return;
    }
    fileUses[id][kind] = true;
    action();
  }

  document.getElementById("copy-link").addEventListener("click", () => {
    spend("link", async () => {
      const link = document.getElementById("share-link").textContent;
      try { await navigator.clipboard.writeText(link); setStatus("Link copied. Opening it again asks for payment.", false); }
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
    if (document.body.classList.contains("printing-cases")) {
      registerCapture("case-print");
      return;
    }
    registerCapture("print");
    if (!current || !current.paid) document.body.classList.add("capture-hold");
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
      const source = current.report;
      const report = current.paid ? source : Object.assign({}, source, {
        cases: (source.cases || []).map((item) => Object.assign({}, item, { title: previewSentence(item.title), why: previewSentence(item.why) }))
      });
      const body = current.paid
        ? { attribution: PAID_LINE, report: report }
        : { watermark: MARK, report: report };
      download("url-review-" + current.report.id + ".json", JSON.stringify(body, null, 2), "application/json");
    });
  });
  document.getElementById("download-text").addEventListener("click", () => {
    spend("text", () => {
      const report = current.report;
      const lines = [
        fileBanner(),
        "",
        report.status === "stopped" ? "Stopped" : "Complete",
        report.host,
        report.finalUrl,
        report.statement,
        "",
        "Log"
      ];
      (report.log || []).forEach((line) => lines.push((line.at || "") + " " + (line.text || "")));
      lines.push("", "Pages: " + report.counts.pages, "Technologies: " + (report.technologies || []).map((item) => item.name).join(", "), "", "Proposed cases");
      (report.cases || []).forEach((item) => {
        const title = current.paid ? item.title : previewSentence(item.title);
        const why = current.paid ? item.why : previewSentence(item.why);
        lines.push(item.id + " [" + item.layer + "] " + title + " — " + why);
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
    document.querySelectorAll(".report-toolbar .menu").forEach((menu) => { menu.hidden = true; });
    document.querySelectorAll(".report-toolbar [aria-controls]").forEach((button) => button.setAttribute("aria-expanded", "false"));
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

  function mountLanguage() {
    if (!window.SiteI18n) return;
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
          const option = document.createElement("div");
          option.className = "lang-option";
          option.innerHTML = '<img src="' + SiteI18n.flagUrl(meta.code) + '" alt=""><span>' + meta.native + "</span>";
          option.onclick = () => {
            if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_language_change", "URL Review", meta.code);
            const page = ["es", "pt", "de", "fr", "it"].includes(meta.code) ? "qa-review-" + meta.code + ".html" : "qa-review.html";
            const here = location.pathname.split("/").pop() || "qa-review.html";
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
      search.addEventListener("click", (event) => event.stopPropagation());
      renderMenu("");
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        document.querySelectorAll(".lang-wrap.open").forEach((open) => { if (open !== wrap) open.classList.remove("open"); });
        wrap.classList.toggle("open");
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".lang-wrap.open").forEach((open) => open.classList.remove("open"));
    });
    SiteI18n.resolve().then((lang) => {
      const code = lang || "en";
      syncFlag(code);
      document.documentElement.lang = code;
      SiteI18n.loadWidget();
      SiteI18n.applyMachineTranslate(code);
    });
    SiteI18n.follow((lang) => {
      const code = lang || "en";
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
    steps.push(
      { selector: "#sign-in", title: "Sign in", body: "Sign in with email or an account you already have. The review runs only on the device where you sign in.", demoMs: 1500 },
      { selector: "#name", title: "Who is asking", body: "Your name is stored with the review. Your email comes from the sign-in. Changing the name does not open a second completed review.", demoMs: 1500 },
      { selector: "#reasons", title: "Why this review", body: "Pick a reason. Asking for a QA-lab verification shows how to get in touch. Other opens the box underneath so you can write your own in a sentence.", demoMs: 1600 },
      { selector: "#url-field", title: "The page", body: "Type the host and path. https:// is already in front of the box, so the review always asks for a public secure page.", demoMs: 1500 },
      { selector: "#fw-picker", title: "Frameworks", body: "Pick the tools your team works with. Each proposed case is written for them, and the case export carries a starting script for each one. Nothing is launched against your site.", demoMs: 1600 },
      { selector: "#req-scope", title: "Pages to review", body: "Choose how many pages to open, how many links deep, and the language to request. Stay in this section keeps later pages under the path in the address. The included first review is 20 pages and 2 links deep. A wider or deeper review shows its price before it starts.", demoMs: 1600 },
      { selector: "#review-btn", title: "Start the review", body: "Review checks the fields first. Then it analyzes public pages on that host and writes a line for each step.", demoMs: 1500 },
      { selector: "#run-log", title: "The log", body: "Watch the analysis here: the first page, robots.txt, and each linked page. The same lines are kept with the run.", demoMs: 1600 },
      { selector: "#stop-btn", title: "Stop", body: "Stop ends the analysis. Pages already saved stay in the report, and the record says the review was stopped.", demoMs: 1500 },
      { selector: "#report-once", title: "The log beside the questions", body: "Each line is a step in the analysis. When the analysis finishes, the report dashboard opens with the download, print, and share actions.", demoMs: 1800 },
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
    if (window.SiteTour && gate.hidden && !new URLSearchParams(location.search).get("report")) SiteTour.autoStart(reviewTour());
  }

  bootLanguageAndTour();

  const shared = new URLSearchParams(location.search).get("report");
  if (shared) {
    const openShared = async () => {
      if (app.inert) return;
      setStatus("Opening the saved report…", false);
      try {
        const coupon = window.ReviewDeal ? ReviewDeal.code() : "";
        const res = await fetch(endpoint() + "/review?id=" + encodeURIComponent(shared) + (coupon ? "&coupon=" + encodeURIComponent(coupon) : ""), { credentials: "include" });
        const body = await res.json();
        if (res.status === 402 || body.paymentRequired) {
          if (body.preview) render({ report: body.preview, frameworks: body.frameworks || [], paid: false });
          openPay(body);
          setStatus(body.preview
            ? "Your last report of " + (body.host || "this site") + " is below, under the frost. Unlock it to read it in full."
            : "This report was already shown. Opening it again asks for payment.", true);
          return;
        }
        if (!res.ok) throw new Error(body.error || "That report was not found.");
        render(body);
      } catch (error) {
        setStatus(error.message, true);
      }
    };
    if (!app.inert) openShared();
    else {
      const waiting = document.createElement("p");
      waiting.className = "gate-waiting";
      waiting.setAttribute("role", "status");
      waiting.textContent = "Your report is waiting. Accept below and it opens right here.";
      const title = document.getElementById("gate-title");
      if (title) title.parentNode.insertBefore(waiting, title);
      termsForm.addEventListener("submit", () => {
        waiting.remove();
        setTimeout(openShared, 0);
      }, { once: true });
    }
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
      const pack = QAReviewScripts.bundle(report, pickedCases(report, layers), chosenFrameworks());
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
    try {
      sessionStorage.setItem("qa-review-alerts", JSON.stringify({
        reportId: current.report.id,
        alertCount: alerts.length,
        paid: false,
        report: current.report,
        frameworks: current.frameworks || [],
        reasonCode: current.reasonCode || ""
      }));
    } catch (error) {
      setStatus("This browser could not keep the report for the payment page.", true);
      return;
    }
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_alerts", "URL Review", String(alerts.length));
    location.href = "qa-review-pay.html?purpose=alerts&reportId=" + encodeURIComponent(current.report.id) + "&count=" + alerts.length;
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
    location.href = "qa-review-pay.html?purpose=credentials&reportId=" + encodeURIComponent(current.report.id);
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
    if (current && current.free === true) {
      caseExport.hidden = true;
      openCaseFormats({ report: current.report, layers });
      return;
    }
    try {
      sessionStorage.setItem(EXPORT_KEY, JSON.stringify({
        reportId: current.report.id,
        layers,
        paid: false,
        report: current.report,
        frameworks: current.frameworks || []
      }));
    } catch (storageError) {
      error.textContent = "This browser could not keep the list for the payment page.";
      return;
    }
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_cases", "URL Review", String(layers.length));
    location.href = "qa-review-pay.html?purpose=cases&reportId=" + encodeURIComponent(current.report.id) + "&layers=" + encodeURIComponent(layers.join(","));
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
    if (!app.inert) restore();
    else termsForm.addEventListener("submit", () => setTimeout(restore, 0), { once: true });
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
    if (!app.inert) apply();
    else termsForm.addEventListener("submit", () => setTimeout(apply, 0), { once: true });
  }
  restorePaid("alerts", "qa-review-alerts");
  restorePaid("credentialRun", "qa-review-credential");

  const WIRE_CLIPS = ["assets/wire/scan.mp4", "assets/wire/bars.mp4", "assets/wire/orbit.mp4", "assets/wire/moon.mp4", "assets/wire/pulse.mp4", "assets/wire/drift.mp4", "assets/wire/mesh.mp4", "assets/wire/ring.mp4"];
  let wireItems = [];
  let wireAt = 0;
  function wireMarkup(items, clipStart) {
    return items.map((item, index) =>
      '<a class="wire-item" href="' + esc(item.href) + '" target="_blank" rel="noopener noreferrer"><video class="wire-art" muted loop playsinline autoplay preload="auto" src="' + esc(WIRE_CLIPS[(clipStart + index) % WIRE_CLIPS.length]) + '"></video><span><strong>' + esc(item.title) + "</strong><small>" + esc(item.meta) + "</small></span></a>"
    ).join("");
  }
  let wireKey = "";
  function paintWireRows() {
    const rows = wire.querySelectorAll(".wire-row");
    const waiting = [{ href: "qa-review.html", title: "The wire is waiting for headlines.", meta: "This pass did not retrieve a headline." }];
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
