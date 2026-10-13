(function () {
  const TERMS_KEY = "qa-review-terms";
  const DEVICE_KEY = "qa-review-device";
  const SHOWN_KEY = "qa-review-shown";
  const TERMS_VERSION = "2026-10-20";
  const PAGE_CHOICES = [20, 40, 60, 80, 100];
  const DEPTH_CHOICES = [2, 3, 4, 5];
  const PRICE = 19;
  const openedAt = Date.now();
  const SITE_COUNTRY = { uk: "GB", gb: "GB", eu: "EU", de: "DE", fr: "FR", es: "ES", it: "IT", nl: "NL", pt: "PT", ie: "IE", be: "BE", at: "AT", se: "SE", pl: "PL", co: "CO", mx: "MX", br: "BR", ar: "AR", cl: "CL", pe: "PE", ca: "CA", au: "AU", nz: "NZ", in: "IN", jp: "JP", us: "US", za: "ZA" };
  const MARK = "QA-lab URL Review · Carlos Muñoz · https://carlosandmunoz.com · Preview copy · Not a certification";
  const PAID_LINE = "This report was generated with QA-lab URL Review by Carlos Muñoz (https://carlosandmunoz.com).";
  const FRAMEWORKS = ["Playwright", "Cypress", "Robot", "Selenium", "WebdriverIO", "Appium", "JMeter", "Gatling"];
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

  function unlock() {
    gate.hidden = true;
    app.inert = false;
    fields().forEach((el) => { el.disabled = false; });
    reasonBox.disabled = true;
    stopBtn.disabled = true;
    sessionStorage.setItem(TERMS_KEY, TERMS_VERSION);
    if (window.SiteTour) SiteTour.autoStart(reviewTour());
  }

  function paintFrameworks() {
    const box = document.getElementById("fw-picker");
    box.innerHTML = FRAMEWORKS.map((name) =>
      '<label><input type="checkbox" name="fw" value="' + name + '" checked disabled> ' + name + "</label>"
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
  const termsAll = document.getElementById("terms-all");
  const termBoxes = () => [...termsForm.querySelectorAll('input[type="checkbox"][name^="t"]')];
  termsForm.addEventListener("change", (event) => {
    const boxes = termBoxes();
    if (termsAll && event.target === termsAll) boxes.forEach((box) => { box.checked = termsAll.checked; });
    else if (termsAll) termsAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
    accept.disabled = boxes.some((box) => !box.checked);
  });
  termsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (accept.disabled) return;
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_terms", "URL Review", "accepted");
    unlock();
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
  const followUpBox = document.getElementById("follow-up");
  if (followUpBox) followUpBox.addEventListener("change", () => {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_follow_up", "URL Review", followUpBox.checked ? "on" : "off");
  });
  reviewForm.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || !window.SiteAnalytics) return;
    if (target.name === "fw") SiteAnalytics.trackEvent("qa_review_frameworks", "URL Review", String(selectedFrameworks().length));
    if (target.name === "tool") SiteAnalytics.trackEvent("qa_review_tools", "URL Review", target.value);
    if (target.name === "pages" || target.name === "depth") SiteAnalytics.trackEvent("qa_review_scope", "URL Review", selectedPages() + "x" + selectedDepth());
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
    return "qa-review-pay.html?" + params.toString();
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
    });
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

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function appendLog(text) {
    const list = document.getElementById("run-log");
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = new Date().toLocaleTimeString();
    item.appendChild(time);
    item.appendChild(document.createTextNode(text));
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
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
    return ((current && current.report && current.report.tools) || []).map((item) => item.name);
  }

  function paintTools(report) {
    const block = document.getElementById("tool-block");
    const list = document.getElementById("tools");
    if (!block || !list) return;
    const tools = report.tools || [];
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
    const open = credentialOpen(report.id);
    document.getElementById("credential-run-copy").textContent = open
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
    const advice = [];
    if (!headers.hsts) advice.push(["Send HSTS", "Put Strict-Transport-Security on the host with a max-age of at least six months so the next visit stays on https."]);
    if (!headers.csp) advice.push(["Add a content security policy", "Name the script sources and frame-ancestors, then tighten the policy from what a real browser reports."]);
    if ((obs.missingAlt || 0) > 0) advice.push(["Name the images", obs.missingAlt + " images had no alt. Informative images need a description. Decorative images need an empty alt."]);
    if (!obs.lang) advice.push(["Declare the language", "Set lang on the html element to the language a person reads on the page."]);
    if ((obs.scripts || 0) > 12) advice.push(["Budget the scripts", obs.scripts + " external scripts were referenced. Defer the ones that are not needed for the first view."]);
    if ((obs.ms || 0) > 800) advice.push(["Watch the first response", "This document took " + obs.ms + " ms. Keep that path under a budget you can re-check."]);
    if (!advice.length) advice.push(["Keep the proposal separate from a run", "These cases are a plan. Run them later in a browser you control, with accounts the owner issued."]);
    advice.push(["This is a snapshot", "The read does not certify that the site is safe, fast, or compliant."]);
    const adviceHtml = advice.slice(0, 4).map(([title, body]) => "<article><strong>" + title + "</strong><span>" + esc(body) + "</span></article>").join("");
    document.getElementById("report-visuals").innerHTML =
      '<article class="card"><h2>Response time across the pages read</h2><p class="muted">Milliseconds, in the order the pages were opened. One read, not a history of earlier days.</p>' + times + "</article>" +
      '<article class="card"><h2>Public marks on the first response</h2><div class="ticks">' + ticks + "</div></article>" +
      '<article class="card"><h2>Technology groups in this read</h2>' + groupBars + "</article>" +
      '<article class="card"><h2>Practices worth implementing</h2><div class="advice">' + adviceHtml + "</div></article>";
    const when = report.fetchedAt ? new Date(report.fetchedAt).toLocaleString() : "";
    document.getElementById("report-cover").innerHTML =
      '<div><img class="cover-logo" src="assets/qa-review-mark.svg?v=20261013c" alt=""><p class="report-kicker">QA-lab URL Review</p><h2>' + esc(report.host || "Report") + '</h2><p class="muted">' + esc(when) + "</p>" +
      (report.signature ? '<p class="sign-line">' + esc(report.signature.mark) + "</p>" : "") + "</div>" +
      '<div><p class="report-kicker">' + ((report.counts && report.counts.cases) || 0) + ' proposed cases</p><p>' + esc(report.statement || "") + "</p></div>";
    document.getElementById("print-mark").textContent = "";
  }

  function render(payload) {
    const report = payload.report;
    if (!report) return;
    if (!payload.paid && seenBefore(report.id) && liveId !== report.id) {
      openPay({ priceUsd: reviewUsd(payload.frameworks || []), frameworks: payload.frameworks || [] });
      return;
    }
    current = payload;
    liveId = report.id;
    remember(report.id);
    applyCopyMode(!!payload.paid);
    shareOpen.disabled = false;
    dash.classList.add("open");
    document.body.style.overflow = "hidden";
    const state = report.status === "stopped" ? "Stopped" : "Complete";
    const paid = !!payload.paid;
    paintVisuals(report, paid);
    document.getElementById("report-statement").textContent = "";
    const counts = report.counts || { pages: 0, technologies: 0, cases: 0, byLayer: {} };
    document.getElementById("kpis").innerHTML = [
      [counts.pages, "Pages read"],
      [counts.technologies, "Technologies"],
      [counts.cases, "Proposed cases"],
      [(report.observed && report.observed.ms) + " ms", "First response"]
    ].map(([value, label]) => "<div class=\"kpi\"><b>" + esc(value) + "</b><span>" + label + "</span></div>").join("");
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
    document.getElementById("observed").innerHTML = "<p><b>" + esc(obs.title || "No title") + "</b></p><p class=\"muted\">" + esc(obs.description || "No meta description.") + "</p><p>Language " + esc(obs.lang || "not set") + " · " + ((obs.h1 || []).length) + " h1 · " + (obs.forms || 0) + " forms · " + (obs.images || 0) + " images, " + (obs.missingAlt || 0) + " without alt · " + (obs.scripts || 0) + " scripts · " + (obs.bytes || 0) + " bytes</p><p class=\"muted\">" + esc(limits.robotsNote || "") + "</p>";
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
    document.getElementById("case-note").textContent = paid
      ? shown.length + " cases for the selected frameworks. The full wording is open because this copy is paid."
      : shown.length + " cases were identified across the tools, languages, and technologies in this read. The first sentence of each case stays visible. The rest stays blurred until the report is paid.";
    const extras = [];
    (report.cases || []).forEach((item) => {
      (item.also || []).forEach((name) => {
        if (name && extras.indexOf(name) === -1) extras.push(name);
      });
    });
    const listed = new Set(["axe-core", "Lighthouse", "k6", "BrowserStack", "Applitools", "Percy", "Provar", "Copado"]);
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
      const tools = esc(item.fw.filter((fw) => picked.has(fw)).join(" · ")) + (extra.length ? " · " + esc(extra.join(" · ")) : "");
      return '<article class="case"><div><span class="id">' + esc(item.id) + "</span> " + esc(item.layer) + '<span class="tag">Proposed</span></div><strong>' + fadeText(item.title, paid) + '</strong><p class="muted">' + fadeText(item.why, paid) + '</p><p class="muted">' + tools + "</p></article>";
    }).join("") || '<p class="muted">No proposed case matches this filter.</p>';
    const link = location.origin + location.pathname + "?report=" + encodeURIComponent(report.id);
    document.getElementById("share-link").textContent = link;
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
    document.getElementById("run-log").innerHTML = "";
    setStatus("Checking the email domain, then reading the public page…", false);
    appendLog("Checking the fields, the email domain, and that this is a browser.");
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_start", "URL Review", reasonCode());
    try {
      const res = await fetch(endpoint() + "/review", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
          deviceId: deviceId(),
          runId: runId,
          openedAt: openedAt,
          company: document.getElementById("company").value,
          followUp: document.getElementById("follow-up").checked === true
        })
      });
      stopBtn.disabled = false;
      const payload = await readStream(res);
      if (!payload || !payload.report) throw new Error("The review ended without a report.");
      layer = "All";
      payload.reasonCode = reasonCode();
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_done", "URL Review", payload.report && payload.report.host);
      render(payload);
      const stopped = payload.report.status === "stopped";
      setStatus(stopped ? "Stopped. The report uses the pages read before the stop." : "Report ready. Cases are proposed, not run.", false);
      dash.scrollTop = 0;
    } catch (error) {
      if (error.fields) markFields(error.fields);
      if (error.paymentRequired && error.body && error.body.purpose === "new-run") {
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
      activeRun = "";
      reviewBtn.disabled = false;
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
      await fetch(endpoint() + "/stop", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: activeRun })
      });
    } catch (error) {
      setStatus("Stop was requested. Waiting for the pages already open.", true);
    }
  });

  function openPay(body) {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_pay_open", "URL Review", "report");
    const list = (body && body.frameworks) || (current && current.frameworks) || selectedFrameworks();
    const tools = selectedTools();
    const usd = (body && body.priceUsd) || reviewUsd(list, tools);
    const selections = list.length + tools.length;
    document.getElementById("pay-price").innerHTML = formatUsd(usd) + "<span>USD</span>";
    document.getElementById("pay-detail").textContent = "Seeing it again, or downloading, printing, or sharing it again, costs " + formatUsd(usd) + " USD for " + selections + (selections === 1 ? " selection." : " selections.") + " Frameworks come first. Checked tools follow on the same discount. The first selection is 19 USD. A paid copy keeps one line: this report was generated with QA-lab URL Review by Carlos Muñoz (https://carlosandmunoz.com).";
    document.getElementById("pay-btn").href = payQuery("report");
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
    document.getElementById("run-pay-title").textContent = "This read is " + formatUsd(usd) + " USD";
    document.getElementById("run-pay-price").innerHTML = formatUsd(usd) + "<span>USD</span>";
    document.getElementById("run-pay-detail").textContent = billing === "scope"
      ? pages + " pages and " + depth + " links deep. The included first review is 20 pages and 2 links deep. This amount is for the wider read."
      : pages + " pages, " + depth + " links deep, and " + (list.length + tools.length) + " selections. Frameworks come first. Checked tools follow on the same discount. The amount is the schedule plus the size of the read.";
    document.getElementById("go-pay").href = payQuery("new-run", body || {});
    runPay.hidden = false;
  }

  function closeDashboard() {
    dash.classList.remove("open");
    document.body.style.overflow = "";
  }

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
            const page = meta.code === "es" ? "qa-review-es.html" : meta.code === "pt" ? "qa-review-pt.html" : "qa-review.html";
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
      { selector: "#name", title: "Who is asking", body: "Name and email are required, and they are stored with the review. Changing them does not open a second completed review.", demoMs: 1500 },
      { selector: "#reasons", title: "Why this review", body: "Pick a reason. Asking for a QA-lab verification shows how to get in touch. Other opens the box underneath so you can write your own in a sentence.", demoMs: 1600 },
      { selector: "#url-field", title: "The page", body: "Type the host and path. https:// is already in front of the box, so the review always asks for a public secure page.", demoMs: 1500 },
      { selector: "#fw-picker", title: "Frameworks", body: "These names only filter the proposed cases. Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, and Gatling are not launched.", demoMs: 1600 },
      { selector: "#review-btn", title: "Start the read", body: "Review checks the fields first. Then it reads public pages on that host and writes a line for each step.", demoMs: 1500 },
      { selector: "#run-log", title: "The log", body: "Watch the read here: the first page, robots.txt, and each linked page. The same lines are kept with the run.", demoMs: 1600 },
      { selector: "#stop-btn", title: "Stop", body: "Stop ends the read. Pages already saved stay in the report, and the record says the review was stopped.", demoMs: 1500 },
      { selector: "#report-once", title: "The log beside the questions", body: "Each line is a step in the read. When the read finishes, the report dashboard opens with the download, print, and share actions.", demoMs: 1800 },
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
    if (window.SiteTour && gate.hidden) SiteTour.autoStart(reviewTour());
  }

  bootLanguageAndTour();

  const shared = new URLSearchParams(location.search).get("report");
  if (shared) {
    const openShared = async () => {
      if (app.inert) return;
      setStatus("Opening the saved report…", false);
      try {
        const res = await fetch(endpoint() + "/review?id=" + encodeURIComponent(shared), { credentials: "include" });
        const body = await res.json();
        if (res.status === 402 || body.paymentRequired) {
          openPay(body);
          setStatus("This report was already shown. Opening it again asks for payment.", true);
          return;
        }
        if (!res.ok) throw new Error(body.error || "That report was not found.");
        render(body);
      } catch (error) {
        setStatus(error.message, true);
      }
    };
    if (!app.inert) openShared();
    else termsForm.addEventListener("submit", () => setTimeout(openShared, 0), { once: true });
  }

  const CASE_LAYERS = ["Functional", "Content", "Links", "Accessibility", "Security", "Privacy", "SEO", "Performance", "Load", "Mobile", "Internationalization", "Resilience", "Compatibility", "Media", "Analytics", "Commerce", "Forms", "Visual", "Platform", "API"];
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

  function caseRows(report, layers) {
    const sign = signOf(report);
    return pickedCases(report, layers).map((item) => {
      const parts = splitWhy(item.why);
      return { item, parts, frameworks: (item.frameworks || []).join(", "), sign };
    });
  }

  function exportFile(report, layers, kind) {
    const rows = caseRows(report, layers);
    const sign = signOf(report);
    const id = report.id || "report";
    if (kind === "json") {
      download("qa-lab-cases-" + id + ".json", JSON.stringify({
        signature: sign,
        host: report.host,
        fetchedAt: report.fetchedAt,
        cases: rows.map((row) => ({
          id: row.item.id,
          layer: row.item.layer,
          title: row.item.title,
          step: row.parts.step,
          expected: row.parts.expected,
          frameworks: row.item.frameworks || []
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
      ].concat(rows.map((row) => [row.item.id + " · " + row.item.layer, row.item.title, row.parts.step, row.parts.expected, row.frameworks, ""].join("\n"))).join("\n");
      download("qa-lab-cases-" + id + ".txt", body, "text/plain");
      return;
    }
    if (kind === "pdf") {
      const host = document.getElementById("case-print");
      host.innerHTML = '<p class="report-kicker">QA-lab URL Review</p><h1>' + esc(report.host || "Test cases") + "</h1><p class=\"sign-line\">" + esc(sign.mark) + "</p><p>SHA-256 " + esc(sign.sha256) + "</p>" +
        rows.map((row) => '<article><p class="case"><span class="id">' + esc(row.item.id) + "</span> " + esc(row.item.layer) + "</p><h2>" + esc(row.item.title) + "</h2><p>" + esc(row.parts.step) + "</p><p>" + esc(row.parts.expected) + "</p></article>").join("");
      document.body.classList.add("printing-cases");
      registerCapture("case-print");
      window.print();
      return;
    }
    const table = {
      excel: ["ID", "Layer", "Title", "Step", "Expected result", "Frameworks", "QA-lab mark", "SHA-256"],
      testrail: ["Title", "Section", "Template", "Type", "Priority", "Steps", "Expected Result", "References"],
      xray: ["Issue Id", "Issue Type", "Summary", "Description", "Test Type", "Action", "Data", "Expected Result", "Labels"],
      zephyr: ["Name", "Status", "Priority", "Objective", "Precondition", "Folder", "Labels", "Test Script (Step-by-Step) - Step", "Test Script (Step-by-Step) - Expected Result"],
      jira: ["Issue Type", "Summary", "Description", "Priority", "Labels"],
      azure: ["Work Item Type", "Title", "Test Step", "Step Action", "Step Expected", "Priority", "State", "Tags"],
      mantis: ["Summary", "Description", "Category", "Severity"]
    }[kind];
    const data = rows.map((row) => {
      const ref = sign.mark + " " + sign.sha256;
      if (kind === "excel") return [row.item.id, row.item.layer, row.item.title, row.parts.step, row.parts.expected, row.frameworks, sign.mark, sign.sha256];
      if (kind === "testrail") return [row.item.title, row.item.layer, "Test Case (Text)", "Other", "Medium", row.parts.step, row.parts.expected, ref];
      if (kind === "xray") return [row.item.id, "Test", row.item.title, row.item.layer, "Manual", row.parts.step, "", row.parts.expected, ref];
      if (kind === "zephyr") return [row.item.title, "Draft", "Normal", row.parts.expected, "Proposed from a public read. Not executed.", row.item.layer, ref, row.parts.step, row.parts.expected];
      if (kind === "jira") return ["Task", row.item.title, row.item.id + " · " + row.item.layer + "\n" + row.parts.step + "\n" + row.parts.expected + "\n" + ref, "Medium", "QA-lab"];
      if (kind === "azure") return ["Test Case", row.item.title, "1", row.parts.step, row.parts.expected, "2", "Design", ref];
      return [row.item.title, row.item.id + " · " + row.parts.step + "\n" + row.parts.expected + "\n" + ref, "General", "minor"];
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
  function paintWireRows() {
    const rows = wire.querySelectorAll(".wire-row");
    const waiting = [{ href: "qa-review.html", title: "The wire is waiting for headlines.", meta: "This pass did not retrieve a headline." }];
    const source = wireItems.length ? wireItems : waiting;
    rows.forEach((row, rowIndex) => {
      const track = row.querySelector(".wire-track");
      const slice = source.filter((item, index) => index % rows.length === rowIndex);
      const shown = slice.length ? slice : source.slice(0, 1);
      track.classList.remove("run");
      track.innerHTML = wireMarkup(shown, rowIndex * 3);
      track.querySelectorAll("video").forEach((video) => { video.play().catch(() => {}); });
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      track.style.animationDuration = Math.max(28, shown.length * 7) + "s";
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
    wire.querySelectorAll(".wire-row").forEach((row) => {
      if (reduced) return;
      row.addEventListener("animationend", (event) => {
        const track = row.querySelector(".wire-track");
        if (event.target !== track) return;
        if (Date.now() - wireAt > 3 * 60 * 1000) {
          loadWire();
          return;
        }
        track.classList.remove("run");
        track.getBoundingClientRect();
        track.classList.add("run");
      });
    });
    loadWire();
    if (window.SiteI18n && SiteI18n.follow) SiteI18n.follow(() => loadWire());
    if (reduced) window.setInterval(loadWire, 3 * 60 * 1000);
  }
})();
