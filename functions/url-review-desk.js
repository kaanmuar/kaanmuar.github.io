/**
 * Owner view of URL-review runs. Summaries only: no page HTML.
 */
const offers = require("./url-review-offers");
const publish = require("./url-review-publish");

const HELD_WORDS = {
  "not-complete": "the review did not complete",
  "not-public": "the address is not a public host",
  "own-or-test": "our own or a reserved host",
  "test-run": "a sandbox test run",
  "asker-opted-out": "the asker ticked don't publish",
  unlisted: "the owner asked to be left out",
  "safe-browsing-flagged": "Google's Safe Browsing lists flag the site",
  "no-score": "the review has no score",
  "timed-out": "the review ran out of time",
  "too-few-pages": "fewer than " + publish.MIN_PAGES + " pages were analyzed",
  "start-page-blocked": "the start page was blocked or failed",
  "javascript-shell": "the site is an empty JavaScript shell"
};

function liveState(row, unlisted) {
  if (!row.report || (row.status !== "complete" && row.status !== "stopped")) return null;
  const reason = publish.heldReason(row, unlisted);
  return { listed: !reason, reason, why: HELD_WORDS[reason] || reason };
}

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function hostFrom(value) {
  try { return new URL(String(value || "")).hostname; } catch (error) { return ""; }
}

function whenOf(row) {
  return row.createdAt || row.at || (row.report && row.report.fetchedAt) || "";
}

function addressOf(row) {
  return row.requestedUrl || row.url || (row.report && (row.report.finalUrl || row.report.host)) || "";
}

function kindFor(row) {
  const status = String((row && row.status) || "");
  if (status === "complete") return "report";
  if (status === "stopped") return "stopped";
  if (status === "paid-report") return "paid";
  if (status === "run-credit") return "run-paid";
  if (status === "paid-addon") return "addon-paid";
  if (status === "checkout-open") return "checkout";
  if (status === "blocked") return "blocked";
  if (status === "payment-due") return "payment-due";
  if (status === "capture") return "capture";
  if (status === "run-credit-used") return "credit";
  if (status === "monthly-pass") return "monthly";
  if (status === "follow-stop") return "follow-stop";
  if (status === "running") return "started";
  if (status === "failed") return "failed";
  return "";
}

const TITLES = {
  started: "A review is running",
  report: "A review finished and a report was generated",
  stopped: "A review stopped and a partial report was kept",
  paid: "A report was paid",
  "run-paid": "A later run was paid",
  "addon-paid": "A case export, signals, or a signed-in run was paid",
  checkout: "A checkout was opened",
  blocked: "A review was refused",
  "payment-due": "A review is waiting on payment",
  capture: "A report was copied or printed",
  credit: "A paid run credit was used",
  failed: "A review failed",
  monthly: "A 30-day history pass was opened on this machine. No charge was made.",
  "follow-stop": "Follow-up notes were stopped",
  "payment-unmatched": "PayPal took a payment that matches no open checkout. Nothing was unlocked.",
  "payment-refunded": "A payment was refunded or reversed on PayPal",
  "payment-disputed": "A buyer opened or updated a PayPal dispute"
};

function rowsFor(source) {
  const report = source.report || {};
  const counts = report.counts || {};
  const items = [];
  const add = (label, value) => {
    const text = clip(value, 180);
    if (text) items.push({ label, value: text });
  };
  add("Who", source.name);
  add("Email", source.email);
  add("Address", addressOf(source));
  add("Status", source.status);
  add("Reason", source.reason);
  add("Frameworks", Array.isArray(source.frameworks) ? source.frameworks.join(", ") : "");
  add("Pages", source.pages);
  add("Depth", source.depth);
  add("Cases", counts.cases);
  add("Signals", Array.isArray(report.alerts) ? report.alerts.length : "");
  add("Price", source.priceUsd != null && source.priceUsd !== "" ? String(source.priceUsd) + " USD" : "");
  add("Paid", source.paid === true ? "Yes" : "");
  add("Mode", source.test === true ? "Test, PayPal sandbox. No real money moved." : "");
  add("Purpose", source.purpose);
  add("Capture", source.kind);
  add("PayPal order", source.sessionId);
  add("Recorded by", source.via);
  add("Refunded", source.refundedUsd ? String(source.refundedUsd) + " USD" : "");
  add("Dispute", source.disputeStatus ? [source.disputeStatus, source.disputeOutcome].filter(Boolean).join(", ") : "");
  return items;
}

function alertFrom(kind, source) {
  const key = TITLES[kind] ? kind : (kindFor(source) || "report");
  const title = (source && source.test === true ? "Test · " : "") + (TITLES[key] || "A review event");
  const rows = rowsFor(source || {});
  const at = whenOf(source || {}) || new Date().toISOString();
  return {
    id: String((source && (source.alertId || source.runId || source.id)) || "") ,
    at,
    kind: key,
    title,
    subject: clip("QA-lab · " + title, 140),
    detail: rows.map((row) => row.label + ": " + row.value).join("\n"),
    rows,
    runId: clip((source && (source.runId || source.id || source.reportId)) || "", 40),
    url: clip(addressOf(source || {}), 300),
    name: clip((source && source.name) || "", 120),
    email: clip((source && source.email) || "", 120),
    status: clip((source && source.status) || key, 40),
    priceUsd: source && source.priceUsd != null ? source.priceUsd : null,
    paid: !!(source && source.paid)
  };
}

function alertsFromHistory(records) {
  return (records || []).map((row) => {
    const kind = kindFor(row);
    if (!kind || kind === "started") return null;
    const note = alertFrom(kind, row);
    note.id = clip(row.id || "", 40);
    note.at = whenOf(row);
    return note;
  }).filter(Boolean);
}

function summary(row, index, unlisted) {
  const report = row.report || {};
  const counts = report.counts || {};
  const alerts = Array.isArray(report.alerts) ? report.alerts : [];
  const tools = Array.isArray(report.tools) ? report.tools : [];
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const pages = Array.isArray(report.pages) ? report.pages : [];
  const technologies = Array.isArray(report.technologies) ? report.technologies : [];
  const parent = index.get(row.id) || index.get(row.reportId) || null;
  const url = addressOf(row) || (parent ? addressOf(parent) : "");
  return {
    id: clip(row.id || row.reportId || "", 40),
    at: whenOf(row),
    status: clip(row.status || "", 40),
    kind: kindFor(row),
    name: clip(row.name || (parent && parent.name) || "", 120),
    email: clip(row.email || (parent && parent.email) || "", 160),
    reason: clip(row.reason || "", 240),
    reasonCode: clip(row.reasonCode || "", 40),
    url: clip(url, 300),
    host: clip((report.host) || hostFrom(url) || (parent && parent.report && parent.report.host) || "", 120),
    pages: row.pages || (report.limits && report.limits.maxPages) || null,
    depth: row.depth || (report.limits && report.limits.maxDepth) || null,
    pageCount: counts.pages != null ? counts.pages : pages.length,
    caseCount: counts.cases != null ? counts.cases : cases.length,
    layers: counts.byLayer || {},
    signalCount: alerts.length,
    signals: alerts.slice(0, 8).map((item) => ({ id: clip(item.id, 12), level: clip(item.level, 20), title: clip(item.title, 120) })),
    toolCount: tools.length,
    tools: tools.slice(0, 8).map((item) => clip(item.name || item, 40)),
    frameworks: Array.isArray(row.frameworks) ? row.frameworks.slice(0, 8).map((item) => clip(item, 40)) : [],
    technologies: technologies.slice(0, 8).map((item) => clip(item.name || "", 40)).filter(Boolean),
    priceUsd: row.priceUsd != null ? row.priceUsd : null,
    paid: row.paid === true,
    test: row.test === true,
    free: row.free === true,
    provider: clip(row.provider || "", 20),
    signInProvider: clip(row.signInProvider || "", 40),
    purpose: clip(row.purpose || "", 20),
    capture: clip(row.kind || "", 20),
    country: clip(row.country || "", 8),
    city: clip(row.city || "", 80),
    language: offers.languageOf(row.acceptLanguage, row.country),
    followUp: row.followUp === true,
    clientName: clip(row.clientName || "", 120),
    clientEmail: clip(row.clientEmail || "", 160),
    clientUrl: clip(row.clientUrl || "", 300),
    ownership: clip(row.ownership || "", 40),
    userAgent: clip(row.userAgent || "", 180),
    termsVersion: clip(row.termsVersion || "", 20),
    statement: clip(report.statement || "", 280),
    title: clip(report.observed && report.observed.title, 180),
    description: clip(report.observed && report.observed.description, 240),
    forms: report.observed ? report.observed.forms : null,
    images: report.observed ? report.observed.images : null,
    missingAlt: report.observed ? report.observed.missingAlt : null,
    mentions: (Array.isArray(report.mentions) ? report.mentions : []).slice(0, 4).map((item) => ({
      title: clip(item.title, 140),
      tone: clip(item.tone, 20),
      href: clip(item.href, 180)
    })),
    mark: clip(report.signature && report.signature.mark, 40),
    deviceId: clip(row.deviceId || "", 32),
    ip: clip(row.ip || "", 80),
    retainUntil: clip(row.retainUntil || "", 40),
    live: liveState(row, unlisted),
    paidUntil: clip(row.paidUntil || "", 40),
    localPass: row.localPass === true,
    paths: pages.slice(0, 20).map((page) => ({
      path: clip(page.path || page.url || "", 160),
      status: page.status,
      ms: page.ms
    })),
    cases: cases.slice(0, 40).map((item) => ({
      id: clip(item.id, 16),
      layer: clip(item.layer, 40),
      title: clip(item.title, 140)
    })),
    log: (Array.isArray(row.log) ? row.log : (report.log || [])).slice(-20).map((line) => clip(line && line.text ? line.text : line, 220))
  };
}

function snapshot(records, alerts, active, noteRows, unlisted) {
  const list = Array.isArray(records) ? records : [];
  const index = new Map();
  list.forEach((row) => {
    if (row && row.id && row.report) index.set(row.id, row);
  });
  const runs = list.map((row) => summary(row || {}, index, unlisted || [])).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const notes = (Array.isArray(alerts) ? alerts : []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80);
  // A report paid after its run has its own payment row, and a run paid through a credit has its credit row;
  // either way the run counts once, through that row.
  const reportPaid = new Set(list.filter((row) => row && row.status === "paid-report" && row.reportId).map((row) => row.reportId));
  const creditPaid = new Set(list.filter((row) => row && row.report && row.creditId).map((row) => row.id));
  const settled = (row) => !row.free && (row.status === "paid-report" || row.status === "run-credit" || (row.paid && !reportPaid.has(row.id) && !creditPaid.has(row.id)));
  const tally = {
    runs: runs.length,
    running: (active || []).length,
    reports: runs.filter((row) => row.status === "complete" || row.status === "stopped").length,
    paid: runs.filter((row) => !row.test && settled(row)).length,
    test: runs.filter((row) => row.test && settled(row)).length,
    free: runs.filter((row) => row.free).length,
    waiting: runs.filter((row) => row.status === "payment-due").length,
    refused: runs.filter((row) => row.status === "blocked").length,
    checkout: runs.filter((row) => row.status === "checkout-open").length,
    captures: runs.filter((row) => row.status === "capture").length
  };
  return {
    at: new Date().toISOString(),
    tally,
    active: (active || []).map((row) => ({
      runId: clip(row.runId, 40),
      at: row.at || "",
      name: clip(row.name, 120),
      email: clip(row.email, 160),
      url: clip(row.url, 300)
    })),
    alerts: notes.map((note) => ({
      id: clip(note.id, 40),
      at: note.at || "",
      kind: clip(note.kind, 20),
      title: clip(note.title, 140),
      detail: clip(note.detail, 500),
      url: clip(note.url, 300),
      name: clip(note.name, 120),
      status: clip(note.status, 40)
    })),
    offers: offers.catalog(),
    followUps: offers.queue(list.concat(Array.isArray(noteRows) ? noteRows : [])).slice(0, 40),
    runs
  };
}

function rerunRows(docs) {
  return (Array.isArray(docs) ? docs : []).map((row) => ({
    id: clip(row.id, 40),
    at: row.at || "",
    status: clip(row.status, 20),
    url: clip(row.url, 300),
    host: clip(row.host, 120),
    name: clip(row.name, 120),
    email: clip(row.email, 160),
    why: clip(row.trigger && row.trigger.label, 300),
    failures: Array.isArray(row.failureIds) ? row.failureIds.length : 0,
    reportStatus: clip(row.reportStatus, 20),
    error: clip(row.error && row.error.message, 600),
    decidedAt: row.decidedAt || "",
    by: clip(row.by, 160),
    mailError: clip(row.mailError, 200),
    run: row.record ? summary(row.record, new Map()) : null,
    log: (Array.isArray(row.lines) ? row.lines : []).slice(-30).map((line) => clip(line && line.text, 220))
  }));
}

const STYLE = `
    :root { color-scheme: light; --ink:#102027; --muted:#5c6e78; --line:#d5e0e4; --teal:#0d6e76; --paper:#f4f7f8; --card:#fff; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.45 Georgia, "Times New Roman", serif; color: var(--ink); background: var(--paper); }
    header, main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 28px 0 8px; }
    h1 { font-weight: normal; font-size: 32px; margin: 0 0 6px; }
    .lede { margin: 0; color: var(--muted); }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0; }
    .stat { background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; font-family: Arial, sans-serif; font-size: 13px; }
    .stat b { color: var(--teal); font-weight: 700; }
    section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin: 0 0 16px; }
    h2 { font-size: 18px; font-weight: normal; margin: 0 0 10px; }
    .alert, .live { padding: 8px 0; border-top: 1px solid var(--line); }
    .alert:first-of-type, .live:first-of-type { border-top: 0; }
    .alert b, .live b { font-family: Arial, sans-serif; font-size: 14px; }
    .meta { color: var(--muted); font-family: Arial, sans-serif; font-size: 12px; }
    .tools { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    input, select { font: 14px Arial, sans-serif; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); }
    input { min-width: min(320px, 100%); }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; }
    th, td { text-align: left; padding: 8px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    tr { cursor: pointer; }
    tr[aria-selected="true"] { background: #e7f4f5; }
    .detail { margin-top: 14px; }
    .detail dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; margin: 0; }
    .detail dt { color: var(--muted); font-family: Arial, sans-serif; font-size: 13px; }
    .detail dd { margin: 0; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    .empty { color: var(--muted); margin: 0; }
    pre { white-space: pre-wrap; font: 14px/1.45 Georgia, serif; margin: 8px 0 0; }
    button { font: 14px Arial, sans-serif; background: var(--teal); color: #fff; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    .held { color: var(--muted); }
    #desk-gate { display: none; }
    body.desk-locked main > section:not(#desk-gate) { display: none; }
    body.desk-locked .stats, body.desk-locked #desk-out { display: none; }
    body.desk-locked #desk-gate { display: block; }
    #desk-out, button.quiet { margin-top: 12px; background: transparent; color: var(--teal); border: 1px solid var(--line); }
    .gate-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .gate-form[hidden] { display: none; }
    .gate-form button.quiet { margin-top: 0; }
    .lede a, .alert a { color: var(--teal); }
    .detail h2 { margin-top: 18px; }
    .log { font: 12px/1.5 Menlo, Consolas, monospace; max-height: 520px; overflow: auto; background: var(--paper); border-radius: 8px; padding: 10px; }
`;

const GATE = `
    <section id="desk-gate">
      <h2>Operator sign-in</h2>
      <p>Sign in with the operator email and password, or have a sign-in link sent to that email. Any other account stays outside.</p>
      <form id="desk-password" class="gate-form">
        <input id="desk-email" type="email" autocomplete="username" placeholder="Email" aria-label="Email" required>
        <input id="desk-pass" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required>
        <button type="submit">Sign in</button>
        <button id="desk-link" type="button" class="quiet">Email me a sign-in link</button>
      </form>
      <form id="desk-link-form" class="gate-form" hidden>
        <input id="desk-link-email" type="email" autocomplete="username" placeholder="Email the link was sent to" aria-label="Email the link was sent to" required>
        <button type="submit">Finish sign-in</button>
      </form>
      <form id="desk-code-form" class="gate-form" hidden>
        <input id="desk-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code from the authenticator app" aria-label="Authenticator code" required>
        <button type="submit">Confirm</button>
        <button id="desk-code-back" type="button" class="quiet">Back</button>
      </form>
      <p id="desk-gate-note" class="empty"></p>
    </section>`;

// Each page that includes this defines load(), which reads its data through deskFetch().
const SIGN_IN = `
    function deskBase() {
      const path = location.pathname;
      const at = path.indexOf("/desk");
      return at > 0 ? path.slice(0, at) : "";
    }
    async function deskHeaders() {
      const headers = { "content-type": "application/json" };
      const auth = deskApp();
      if (auth && auth.currentUser) headers.authorization = "Bearer " + await auth.currentUser.getIdToken();
      return headers;
    }
    function lockDesk() {
      document.body.classList.add("desk-locked");
    }
    function unlockDesk() {
      document.body.classList.remove("desk-locked");
    }
    async function deskFetch(path) {
      const response = await fetch(deskBase() + path, { cache: "no-store", credentials: "include", headers: await deskHeaders() });
      if (response.status === 401 || response.status === 403) {
        lockDesk();
        if (response.status === 403) {
          const note = document.getElementById("desk-gate-note");
          if (note) note.textContent = "This account cannot open the desk.";
        }
        return null;
      }
      if (!response.ok) return null;
      unlockDesk();
      return response.json();
    }
    function deskApp() {
      if (!window.firebase || !firebase.auth) return null;
      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey: "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w",
          authDomain: "carlosm-interactive-cv.firebaseapp.com",
          projectId: "carlosm-interactive-cv"
        });
      }
      return firebase.auth();
    }
    async function finishDesk(user) {
      const note = document.getElementById("desk-gate-note");
      const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
      if (local) {
        const idToken = await user.getIdToken();
        const res = await fetch(deskBase() + "/desk/session", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: idToken })
        });
        if (!res.ok) {
          note.textContent = "This account cannot open the desk.";
          return;
        }
      }
      note.textContent = "";
      load();
    }
    let deskResolver = null;
    function showCodeStep(show) {
      document.getElementById("desk-password").hidden = show;
      document.getElementById("desk-code-form").hidden = !show;
      document.getElementById("desk-link-form").hidden = true;
      if (show) document.getElementById("desk-code").focus();
    }
    function showLinkStep() {
      document.getElementById("desk-password").hidden = true;
      document.getElementById("desk-code-form").hidden = true;
      document.getElementById("desk-link-form").hidden = false;
      document.getElementById("desk-link-email").focus();
    }
    function askForCode(error) {
      if (!error || error.code !== "auth/multi-factor-auth-required" || !error.resolver) return false;
      deskResolver = error.resolver;
      document.getElementById("desk-gate-note").textContent = "";
      showCodeStep(true);
      return true;
    }
    document.getElementById("desk-password").addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = document.getElementById("desk-gate-note");
      const auth = deskApp();
      if (!auth) {
        note.textContent = "Sign-in did not load.";
        return;
      }
      note.textContent = "Signing in…";
      try {
        const cred = await auth.signInWithEmailAndPassword(document.getElementById("desk-email").value.trim(), document.getElementById("desk-pass").value);
        await finishDesk(cred.user);
      } catch (error) {
        if (askForCode(error)) return;
        console.error("Desk sign-in failed:", error);
        const code = error && error.code;
        note.textContent = code === "auth/too-many-requests"
          ? "Too many attempts. Wait a few minutes and try again."
          : "Sign-in failed. Check the email and password.";
      }
    });
    document.getElementById("desk-code-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = document.getElementById("desk-gate-note");
      const code = String(document.getElementById("desk-code").value || "").replace(/\\D/g, "").slice(0, 6);
      const totp = firebase.auth.TotpMultiFactorGenerator;
      const hint = deskResolver && deskResolver.hints.find((item) => totp && item.factorId === totp.FACTOR_ID);
      if (!hint) {
        note.textContent = "This account's second step is not an authenticator app.";
        return;
      }
      if (code.length !== 6) {
        note.textContent = "Enter the 6-digit code.";
        return;
      }
      try {
        const cred = await deskResolver.resolveSignIn(totp.assertionForSignIn(hint.uid, code));
        deskResolver = null;
        showCodeStep(false);
        await finishDesk(cred.user);
      } catch (error) {
        console.error("Desk code failed:", error);
        note.textContent = "That code did not match. Use the newest code from the app.";
      }
    });
    document.getElementById("desk-code-back").addEventListener("click", () => {
      deskResolver = null;
      document.getElementById("desk-gate-note").textContent = "";
      showCodeStep(false);
    });
    const LINK_EMAIL = "deskLinkEmail";
    document.getElementById("desk-link").addEventListener("click", async () => {
      const note = document.getElementById("desk-gate-note");
      const field = document.getElementById("desk-email");
      if (!field.reportValidity()) return;
      const auth = deskApp();
      if (!auth) {
        note.textContent = "Sign-in did not load.";
        return;
      }
      const email = field.value.trim();
      note.textContent = "Sending the link…";
      try {
        await auth.sendSignInLinkToEmail(email, { url: location.origin + location.pathname, handleCodeInApp: true });
        localStorage.setItem(LINK_EMAIL, email);
        note.textContent = "A sign-in link is on its way to " + email + ". Open it in this browser.";
      } catch (error) {
        console.error("Desk link failed:", error);
        const code = error && error.code;
        note.textContent = code === "auth/too-many-requests"
          ? "Too many attempts. Wait a few minutes and try again."
          : code === "auth/operation-not-allowed"
            ? "Sign-in links are not turned on for this desk yet."
            : "The link could not be sent (" + (code || "no code") + ").";
      }
    });
    async function finishLink(auth, email) {
      const note = document.getElementById("desk-gate-note");
      note.textContent = "Signing in…";
      try {
        const cred = await auth.signInWithEmailLink(email, location.href);
        localStorage.removeItem(LINK_EMAIL);
        history.replaceState(null, "", location.pathname);
        showCodeStep(false);
        await finishDesk(cred.user);
      } catch (error) {
        const code = error && error.code;
        if (code !== "auth/invalid-email") {
          localStorage.removeItem(LINK_EMAIL);
          history.replaceState(null, "", location.pathname);
        }
        if (askForCode(error)) return;
        console.error("Desk link sign-in failed:", error);
        if (code === "auth/invalid-email") {
          note.textContent = "That is not the email the link was sent to.";
          return;
        }
        showCodeStep(false);
        note.textContent = code === "auth/invalid-action-code" || code === "auth/expired-action-code"
          ? "This link was already used or has expired. Send a new one."
          : "The link did not sign you in (" + (code || "no code") + ").";
      }
    }
    document.getElementById("desk-link-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const auth = deskApp();
      if (auth) finishLink(auth, document.getElementById("desk-link-email").value.trim());
    });
    const startingAuth = deskApp();
    if (startingAuth) {
      startingAuth.onAuthStateChanged((user) => {
        if (user) load();
      });
      if (startingAuth.isSignInWithEmailLink(location.href)) {
        const saved = localStorage.getItem(LINK_EMAIL);
        if (saved) finishLink(startingAuth, saved);
        else showLinkStep();
      }
    }
    document.getElementById("desk-out").addEventListener("click", async () => {
      const auth = deskApp();
      if (auth && auth.currentUser) await auth.signOut();
      await fetch(deskBase() + "/desk/logout", { method: "POST", credentials: "include" });
      lockDesk();
    });`;

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Review desk</title>
  <style>${STYLE}  </style>
</head>
<body class="desk-locked">
  <header>
    <h1>Review desk</h1>
    <p class="lede">Runs for this review. This page asks again every few seconds. Customer sign-in is separate from this desk. <a href="desk/failures">Failed reviews</a></p>
    <button id="desk-out" type="button">Sign out</button>
    <div class="stats" id="stats"></div>
  </header>
  <main>${GATE}
    <section>
      <h2>Alerts</h2>
      <div id="alerts"></div>
    </section>
    <section id="running-block">
      <h2>Running now</h2>
      <div id="running"></div>
    </section>
    <section>
      <h2>Re-runs</h2>
      <p class="empty">A failed review runs again when its cause clears or a fix ships. The asker is not emailed until you send it. The mail says the earlier review failed on its date and ran again after the cause cleared, and the report, its findings and the PDF arrive open, without payment.</p>
      <div id="reruns"></div>
    </section>
    <section>
      <h2>Owner notices</h2>
      <p class="empty">One email per domain every six months, telling the owner a Live Report of the site exists, with its health score and links to claim the blurred report or remove the card. Pick the address: every one found on the site, its schema.org and llms.txt, security.txt, RDAP, DNS, a linked GitHub profile, or web search, best first. It never names the asker, and sends only once the card is live. .de and .at sites are skipped.</p>
      <div id="owner-notices"></div>
    </section>
    <section>
      <h2>Free runs</h2>
      <p class="empty">An address on this list runs as many reviews as it likes, at any size, with the full report open. Nothing is charged.</p>
      <div class="tools">
        <input id="free-email" type="email" placeholder="Email address" aria-label="Email for free runs">
        <input id="free-note" type="text" placeholder="Who this is (optional)" aria-label="Note">
        <button id="free-add" type="button">Add</button>
      </div>
      <div id="free-list"></div>
    </section>
    <section>
      <h2>Owner proofs</h2>
      <p class="empty">Mark a site as verified for an account after a signed-in run with the owner's credentials worked. That account's reviews of the host then hold a short scripted conversation with the site's chatbot. Only who marked it, when, the host and the account email are kept, for a year. Never paste a password here. Sites the owner verified with a DNS record or a homepage tag are listed too, for 30 days.</p>
      <div class="tools">
        <input id="proof-email" type="email" placeholder="Account email" aria-label="Account email for the owner proof">
        <input id="proof-host" type="text" placeholder="Host, such as shop.example.com" aria-label="Host for the owner proof">
        <button id="proof-add" type="button">Mark verified</button>
      </div>
      <div id="proof-list"></div>
    </section>
    <section>
      <h2>Return prices and 30-day passes</h2>
      <div id="offers"></div>
    </section>
    <section>
      <h2>Follow-up notes</h2>
      <p class="empty">A note stays here until the person checks the box. Nothing in this list is mailed.</p>
      <div id="notes"></div>
    </section>
    <section>
      <h2>Runs</h2>
      <div class="tools">
        <input id="q" type="search" placeholder="Name, email, or address" aria-label="Filter runs">
        <select id="status" aria-label="Status">
          <option value="">Every status</option>
          <option value="complete">Report generated</option>
          <option value="stopped">Stopped</option>
          <option value="paid-report">Report paid</option>
          <option value="paid-addon">Add-on paid</option>
          <option value="run-credit">Run paid</option>
          <option value="checkout-open">Checkout opened</option>
          <option value="payment-due">Waiting on payment</option>
          <option value="blocked">Refused</option>
          <option value="capture">Copied or printed</option>
          <option value="run-credit-used">Credit used</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>Status</th><th>Who</th><th>Address</th><th>Lang</th><th>Pages</th><th>Cases</th><th>Signals</th><th>Price</th><th>Paid</th><th>Notes</th></tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="detail" id="detail" hidden></div>
    </section>
  </main>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script>
    const statsEl = document.getElementById("stats");
    const alertsEl = document.getElementById("alerts");
    const runningEl = document.getElementById("running");
    const runningBlock = document.getElementById("running-block");
    const rowsEl = document.getElementById("rows");
    const detailEl = document.getElementById("detail");
    const offersEl = document.getElementById("offers");
    const notesEl = document.getElementById("notes");
    const freeListEl = document.getElementById("free-list");
    const proofListEl = document.getElementById("proof-list");
    const rerunsEl = document.getElementById("reruns");
    const noticesEl = document.getElementById("owner-notices");
    const freeEmailEl = document.getElementById("free-email");
    const freeNoteEl = document.getElementById("free-note");
    const qEl = document.getElementById("q");
    const statusEl = document.getElementById("status");
    let data = { tally: {}, active: [], alerts: [], runs: [] };
    let selected = "";

    function text(value) { return value == null || value === "" ? "—" : String(value); }
    function when(value) {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString();
    }
    function node(tag, content) {
      const el = document.createElement(tag);
      el.textContent = content == null ? "" : String(content);
      return el;
    }
    function line(parent, label, value) {
      parent.appendChild(node("dt", label));
      parent.appendChild(node("dd", text(value)));
    }

    function render() {
      const tally = data.tally || {};
      const chips = [
        ["Running", tally.running || 0],
        ["Reports", tally.reports || 0],
        ["Paid", tally.paid || 0],
        ["Test payments", tally.test || 0],
        ["Free", tally.free || 0],
        ["Waiting", tally.waiting || 0],
        ["Refused", tally.refused || 0],
        ["Checkouts", tally.checkout || 0],
        ["Captures", tally.captures || 0]
      ];
      statsEl.replaceChildren();
      chips.forEach((chip) => {
        const el = document.createElement("span");
        el.className = "stat";
        el.appendChild(node("b", chip[1] + " "));
        el.appendChild(document.createTextNode(chip[0]));
        statsEl.appendChild(el);
      });
      document.title = (tally.running ? tally.running + " running · " : "") + "Review desk";
      renderOffers();
      renderNotes();
      renderFree();
      renderProofs();
      renderReruns();
      renderNotices();

      alertsEl.replaceChildren();
      (data.alerts || []).slice(0, 12).forEach((alert) => {
        const block = document.createElement("div");
        block.className = "alert";
        block.appendChild(node("b", alert.title || "Alert"));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = [when(alert.at), alert.name, alert.url].filter(Boolean).join(" · ");
        block.appendChild(meta);
        alertsEl.appendChild(block);
      });
      if (!(data.alerts || []).length) alertsEl.appendChild(Object.assign(node("p", "No alert yet."), { className: "empty" }));

      const active = data.active || [];
      runningBlock.hidden = !active.length;
      runningEl.replaceChildren();
      active.forEach((run) => {
        const block = document.createElement("div");
        block.className = "live";
        block.appendChild(node("b", "A review is running"));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = [when(run.at), run.name, run.email, run.url].filter(Boolean).join(" · ");
        block.appendChild(meta);
        runningEl.appendChild(block);
      });

      const needle = qEl.value.trim().toLowerCase();
      const status = statusEl.value;
      const shown = (data.runs || []).filter((run) => {
        if (status && run.status !== status) return false;
        if (!needle) return true;
        return [run.name, run.email, run.url, run.host, run.reason].join(" ").toLowerCase().indexOf(needle) !== -1;
      });
      rowsEl.replaceChildren();
      shown.forEach((run) => {
        const tr = document.createElement("tr");
        tr.setAttribute("aria-selected", run.id === selected ? "true" : "false");
        [when(run.at), run.status, run.name || run.email, run.host || run.url, run.language, run.pageCount, run.caseCount, run.signalCount, run.priceUsd == null ? "—" : run.priceUsd + " USD", run.free ? "Free" : run.test ? "Test" : run.paid ? "Yes" : "No", run.followUp ? "Asked" : "—"].forEach((value) => {
          tr.appendChild(node("td", text(value)));
        });
        tr.addEventListener("click", () => { selected = run.id; render(); });
        rowsEl.appendChild(tr);
      });
      if (!shown.length) {
        const tr = document.createElement("tr");
        const td = node("td", "No run matches.");
        td.colSpan = 11;
        tr.appendChild(td);
        rowsEl.appendChild(tr);
      }
      const picked = (data.runs || []).find((run) => run.id === selected);
      if (!picked) { detailEl.hidden = true; detailEl.replaceChildren(); return; }
      detailEl.hidden = false;
      detailEl.replaceChildren();
      const dl = document.createElement("dl");
      line(dl, "When", when(picked.at));
      line(dl, "Status", picked.status);
      line(dl, "Who", picked.name);
      line(dl, "Email", picked.email);
      line(dl, "Signed in with", picked.signInProvider);
      line(dl, "Language", picked.language);
      line(dl, "Follow-up", picked.followUp ? "Asked" : "Not asked");
      line(dl, "Reason", picked.reason);
      line(dl, "Client", [picked.clientName, picked.clientEmail, picked.clientUrl].filter(Boolean).join(" · "));
      line(dl, "Address", picked.url);
      line(dl, "Page title", picked.title);
      line(dl, "Description", picked.description);
      line(dl, "Statement", picked.statement);
      line(dl, "Frameworks", (picked.frameworks || []).join(", "));
      line(dl, "Tools", (picked.tools || []).join(", "));
      line(dl, "Technologies", (picked.technologies || []).join(", "));
      line(dl, "Pages analyzed", picked.pageCount + " of " + text(picked.pages) + ", depth " + text(picked.depth));
      line(dl, "Forms", picked.forms);
      line(dl, "Images", text(picked.images) + ", missing alt " + text(picked.missingAlt));
      line(dl, "Cases", picked.caseCount);
      line(dl, "Signals", picked.signalCount);
      line(dl, "Price", picked.priceUsd == null ? "—" : picked.priceUsd + " USD");
      line(dl, "Paid", picked.free ? "Free run" : picked.test ? "Test (sandbox)" : picked.paid ? "Yes" : "No");
      line(dl, "Signature", picked.mark);
      line(dl, "Browser", picked.userAgent);
      line(dl, "Network", [picked.ip, picked.city, picked.country].filter(Boolean).join(" · "));
      line(dl, "Device", picked.deviceId);
      line(dl, "Terms", picked.termsVersion);
      line(dl, "Kept until", picked.retainUntil);
      line(dl, "Live Reports", picked.live ? (picked.live.listed ? "Public: added in the next daily batch, or already listed" : "Held: " + picked.live.why) : "—");
      detailEl.appendChild(dl);
      if (picked.live && picked.host && picked.live.reason !== "unlisted") {
        const unlist = document.createElement("button");
        unlist.type = "button";
        unlist.textContent = "Unlist " + picked.host + " from Live Reports";
        unlist.addEventListener("click", () => unlistHost(picked.host, unlist));
        detailEl.appendChild(unlist);
      }
      if (picked.email && (picked.status === "complete" || picked.status === "stopped")) {
        const pass = document.createElement("button");
        pass.type = "button";
        pass.textContent = "Open a 30-day history pass for this address. No charge.";
        pass.addEventListener("click", () => openPass(picked.email));
        detailEl.appendChild(pass);
      }
      if ((picked.signals || []).length) {
        const list = document.createElement("ul");
        picked.signals.forEach((item) => list.appendChild(node("li", item.id + " " + item.level + " — " + item.title)));
        detailEl.appendChild(list);
      }
      if ((picked.mentions || []).length) {
        const list = document.createElement("ul");
        picked.mentions.forEach((item) => list.appendChild(node("li", item.tone + " — " + item.title)));
        detailEl.appendChild(list);
      }
      if ((picked.paths || []).length) {
        const list = document.createElement("ul");
        picked.paths.forEach((item) => list.appendChild(node("li", (item.status == null ? "" : item.status + " ") + (item.ms == null ? "" : item.ms + " ms ") + item.path)));
        detailEl.appendChild(list);
      }
      if ((picked.cases || []).length) {
        const list = document.createElement("ul");
        picked.cases.forEach((item) => list.appendChild(node("li", (item.id ? item.id + " " : "") + (item.layer ? item.layer + " — " : "") + item.title)));
        detailEl.appendChild(list);
      }
      if ((picked.log || []).length) {
        detailEl.appendChild(node("pre", picked.log.join("\\n")));
      }
    }

    function renderOffers() {
      const book = data.offers || { returnTable: [], plans: [] };
      offersEl.replaceChildren();
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>Return</th><th>Off the schedule</th><th>1 selection</th><th>4 selections</th><th>8 selections</th></tr></thead>";
      const body = document.createElement("tbody");
      (book.returnTable || []).forEach((row) => {
        const tr = document.createElement("tr");
        [row.label, row.percent + "%", row.oneUsd + " USD", row.fourUsd + " USD", row.eightUsd + " USD"].forEach((value) => tr.appendChild(node("td", value)));
        body.appendChild(tr);
      });
      table.appendChild(body);
      offersEl.appendChild(table);
      const plans = document.createElement("table");
      plans.innerHTML = "<thead><tr><th>30-day pass</th><th>Fee</th><th>Runs</th><th>Cap</th><th>Against the schedule</th></tr></thead>";
      const planBody = document.createElement("tbody");
      (book.plans || []).forEach((plan) => {
        const tr = document.createElement("tr");
        const cap = plan.runs ? plan.runs + " runs, " + plan.frameworks + " frameworks, " + plan.pages + " pages, " + plan.depth + " deep" : "History only";
        [plan.id, plan.usd + " USD", plan.runs, cap, plan.usd + " is " + plan.share + "% of " + plan.anchorUsd + " USD"].forEach((value) => tr.appendChild(node("td", value)));
        planBody.appendChild(tr);
      });
      plans.appendChild(planBody);
      offersEl.appendChild(plans);
      offersEl.appendChild(node("p", book.floor || ""));
      offersEl.appendChild(node("p", book.cadence || ""));
    }

    function renderNotes() {
      notesEl.replaceChildren();
      (data.followUps || []).forEach((note) => {
        const block = document.createElement("div");
        block.className = "alert";
        block.appendChild(node("b", (note.due ? "Ready · " : "Held · ") + note.title));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = [note.lang, note.kind, note.email, note.host, note.held].filter(Boolean).join(" · ");
        block.appendChild(meta);
        block.appendChild(node("pre", note.text || ""));
        notesEl.appendChild(block);
      });
      if (!(data.followUps || []).length) notesEl.appendChild(node("p", "No address is stored yet."));
    }

    function renderFree() {
      freeListEl.replaceChildren();
      (data.freeRuns || []).forEach((item) => {
        const block = document.createElement("div");
        block.className = "alert";
        block.appendChild(node("b", item.email));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = [item.note, item.at ? "added " + when(item.at) : ""].filter(Boolean).join(" · ");
        block.appendChild(meta);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => setFree(item.email, false));
        block.appendChild(remove);
        freeListEl.appendChild(block);
      });
      if (!(data.freeRuns || []).length) freeListEl.appendChild(Object.assign(node("p", "No address has free runs."), { className: "empty" }));
    }
    function renderReruns() {
      rerunsEl.replaceChildren();
      const labels = { held: "Held for you", sent: "Sent", dropped: "Dropped", failed: "Failed again" };
      (data.reruns || []).forEach((item) => {
        const block = document.createElement("div");
        block.className = "alert";
        block.appendChild(node("b", (labels[item.status] || item.status) + " · " + (item.host || item.url)));
        const meta = document.createElement("div");
        meta.className = "meta";
        const run = item.run;
        meta.textContent = [
          when(item.at),
          item.name || item.email,
          item.email,
          item.failures > 1 ? item.failures + " failures" : "",
          run ? run.pageCount + " pages, " + run.caseCount + " cases, " + run.signalCount + " signals" : "",
          item.reportStatus === "stopped" ? "stopped before the last page" : "",
          item.decidedAt ? item.status + " " + when(item.decidedAt) + (item.by ? " by " + item.by : "") : "",
          item.mailError ? "mail failed: " + item.mailError : ""
        ].filter(Boolean).join(" · ");
        block.appendChild(meta);
        block.appendChild(node("p", item.why));
        if (item.error) block.appendChild(node("p", "Error: " + item.error));
        if (item.log && item.log.length) {
          const more = document.createElement("details");
          more.appendChild(node("summary", "Log"));
          more.appendChild(node("pre", item.log.join("\\n")));
          block.appendChild(more);
        }
        if (item.status === "held") {
          const send = document.createElement("button");
          send.type = "button";
          send.textContent = "Send to " + (item.email || "the asker");
          send.disabled = !item.email;
          send.addEventListener("click", () => decideRerun(item.id, true, send));
          const drop = document.createElement("button");
          drop.type = "button";
          drop.textContent = "Drop";
          drop.addEventListener("click", () => decideRerun(item.id, false, drop));
          block.appendChild(send);
          block.appendChild(drop);
        }
        rerunsEl.appendChild(block);
      });
      if (!(data.reruns || []).length) rerunsEl.appendChild(Object.assign(node("p", "No failed review has run again yet."), { className: "empty" }));
    }
    function renderNotices() {
      noticesEl.replaceChildren();
      const sources = { "contact-page": "contact page link", schema: "schema.org", "security.txt": "security.txt", page: "page link", "page-text": "page text", llms: "llms.txt", rdap: "RDAP registration", github: "GitHub profile", search: "web search", dmarc: "DMARC record", soa: "DNS SOA" };
      (data.ownerNotices || []).forEach((item) => {
        const block = document.createElement("div");
        block.className = "alert";
        block.appendChild(node("b", item.host));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = [
          when(item.createdAt),
          "reviewed " + String(item.reviewedAt || "").slice(0, 10),
          item.lang,
          item.critical ? "critical security finding" : "",
          item.lastError ? "last try: " + item.lastError : ""
        ].filter(Boolean).join(" · ");
        block.appendChild(meta);
        const pick = document.createElement("select");
        pick.setAttribute("aria-label", "Address for " + item.host);
        (item.candidates && item.candidates.length ? item.candidates : [{ email: item.email, sources: [item.source], url: item.sourceUrl }]).forEach((row) => {
          const option = document.createElement("option");
          option.value = row.email;
          option.textContent = row.email + " · " + (row.sources || []).map((source) => sources[source] || source).join(", ") + (row.onDomain === false ? " · other domain" : "");
          pick.appendChild(option);
        });
        block.appendChild(pick);
        const send = document.createElement("button");
        send.type = "button";
        send.textContent = "Send";
        send.addEventListener("click", () => decideNotice(item.domain, true, send, block, pick.value));
        const drop = document.createElement("button");
        drop.type = "button";
        drop.textContent = "Drop";
        drop.addEventListener("click", () => decideNotice(item.domain, false, drop, block, ""));
        block.appendChild(send);
        block.appendChild(drop);
        noticesEl.appendChild(block);
      });
      if (!(data.ownerNotices || []).length) noticesEl.appendChild(Object.assign(node("p", "No notice is waiting."), { className: "empty" }));
    }
    async function decideNotice(domain, send, button, block, email) {
      button.disabled = true;
      const response = await fetch(deskBase() + "/desk/notice", {
        method: "POST",
        credentials: "include",
        headers: await deskHeaders(),
        body: JSON.stringify({ domain: domain, send: send, email: email })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        block.appendChild(node("p", body.error || "The notice did not go out."));
        button.disabled = false;
        return;
      }
      load();
    }
    async function decideRerun(id, send, button) {
      button.disabled = true;
      await fetch(deskBase() + "/desk/rerun", {
        method: "POST",
        credentials: "include",
        headers: await deskHeaders(),
        body: JSON.stringify({ id: id, send: send })
      });
      load();
    }
    function renderProofs() {
      proofListEl.replaceChildren();
      (data.ownerProofs || []).forEach((item) => {
        const block = document.createElement("div");
        block.className = "alert";
        block.appendChild(node("b", item.host + " · " + item.email));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = [
          item.kind === "operator" ? "credentials run, marked by " + item.by : "owner's " + (item.how === "meta" ? "homepage tag" : "DNS record"),
          item.at ? "on " + when(item.at) : "",
          item.until ? "until " + when(item.until) : ""
        ].filter(Boolean).join(" · ");
        block.appendChild(meta);
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.textContent = "Revoke";
        revoke.addEventListener("click", () => setProof({ id: item.id, on: false }));
        block.appendChild(revoke);
        proofListEl.appendChild(block);
      });
      if (!(data.ownerProofs || []).length) proofListEl.appendChild(Object.assign(node("p", "No site is verified for any account."), { className: "empty" }));
    }
    async function setProof(body) {
      const res = await fetch(deskBase() + "/desk/proof", {
        method: "POST",
        credentials: "include",
        headers: await deskHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) alert((await res.json().catch(() => ({}))).error || "The proof did not save.");
      load();
    }
    async function setFree(email, on, note) {
      await fetch(deskBase() + "/desk/free", {
        method: "POST",
        credentials: "include",
        headers: await deskHeaders(),
        body: JSON.stringify({ email: email, on: on, note: note || "" })
      });
      load();
    }

    async function unlistHost(host, button) {
      if (!confirm("Keep " + host + " out of Live Reports? The next daily batch removes its card and posts nothing more about it.")) return;
      button.disabled = true;
      await fetch(deskBase() + "/desk/unlist", {
        method: "POST",
        credentials: "include",
        headers: await deskHeaders(),
        body: JSON.stringify({ host: host })
      });
      load();
    }

    async function openPass(email) {
      await fetch(deskBase() + "/desk/pass", {
        method: "POST",
        credentials: "include",
        headers: await deskHeaders(),
        body: JSON.stringify({ email: email, plan: "glance" })
      });
      load();
    }

    async function load() {
      const body = await deskFetch("/desk/data");
      if (!body) return;
      data = body;
      render();
    }
${SIGN_IN}
    document.getElementById("free-add").addEventListener("click", async () => {
      const email = freeEmailEl.value.trim().toLowerCase();
      if (!email || email.indexOf("@") === -1) return;
      await setFree(email, true, freeNoteEl.value.trim());
      freeEmailEl.value = "";
      freeNoteEl.value = "";
    });
    document.getElementById("proof-add").addEventListener("click", async () => {
      const email = document.getElementById("proof-email").value.trim().toLowerCase();
      const host = document.getElementById("proof-host").value.trim().toLowerCase();
      if (!email || email.indexOf("@") === -1 || !host) return;
      await setProof({ email: email, host: host });
      document.getElementById("proof-email").value = "";
      document.getElementById("proof-host").value = "";
    });
    qEl.addEventListener("input", render);
    statusEl.addEventListener("change", render);
    load();
    setInterval(load, 4000);
  </script>
</body>
</html>`;

const FAILURES_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Failed reviews · Review desk</title>
  <style>${STYLE}  </style>
</head>
<body class="desk-locked">
  <header>
    <h1>Failed reviews</h1>
    <p class="lede">Every failed or stopped review of the last 90 days, with its saved log, the daily probe of the site, and its re-run. <a href="../desk">Back to the desk</a></p>
    <button id="desk-out" type="button">Sign out</button>
    <div class="stats" id="stats"></div>
  </header>
  <main>${GATE}
    <section>
      <h2>Cause classes</h2>
      <p class="empty">Each new cause class opens one GitHub bug. A PR that fixes a class adds a row to the fixes, and the failures it covers run again.</p>
      <div id="bugs"></div>
      <details>
        <summary>Fixes shipped</summary>
        <div id="fixes"></div>
      </details>
    </section>
    <section>
      <h2>Runs</h2>
      <div class="tools">
        <input id="q" type="search" placeholder="Site, name, or email" aria-label="Filter failures">
        <select id="cause" aria-label="Cause"><option value="">Every cause</option></select>
        <select id="kind" aria-label="Kind">
          <option value="">Failed and stopped</option>
          <option value="failed">Failed</option>
          <option value="stopped">Stopped by the asker</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>Kind</th><th>Site</th><th>Who</th><th>Cause</th><th>Now</th><th>Re-run</th><th>Log</th></tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="detail" id="detail" hidden></div>
    </section>
  </main>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script>
    const statsEl = document.getElementById("stats");
    const bugsEl = document.getElementById("bugs");
    const fixesEl = document.getElementById("fixes");
    const rowsEl = document.getElementById("rows");
    const detailEl = document.getElementById("detail");
    const qEl = document.getElementById("q");
    const causeEl = document.getElementById("cause");
    const kindEl = document.getElementById("kind");
    let data = { failures: [], bugs: [], fixes: [] };
    let selected = "";

    function text(value) { return value == null || value === "" ? "—" : String(value); }
    function when(value) {
      if (!value) return "—";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }
    function node(tag, content) {
      const el = document.createElement(tag);
      el.textContent = content == null ? "" : String(content);
      return el;
    }
    function line(parent, label, value) {
      parent.appendChild(node("dt", label));
      parent.appendChild(node("dd", text(value)));
    }
    function count(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
    function seconds(ms) { return (Math.round((Number(ms) || 0) / 100) / 10).toFixed(1) + " s"; }
    function logText(lines) {
      return lines.map((row) => ("+" + seconds(row.t)).padStart(10) + "  " + row.text).join("\\n");
    }

    function render() {
      const rows = data.failures || [];
      const failed = rows.filter((row) => row.kind === "failed");
      const open = (data.bugs || []).filter((bug) => !bug.closedAt);
      const chips = [
        ["Failed", failed.length],
        ["Stopped", rows.length - failed.length],
        ["Cleared since", failed.filter((row) => row.cleared).length],
        ["Still failing", failed.filter((row) => row.diagnosedAt && !row.cleared).length],
        ["Not probed yet", failed.filter((row) => !row.diagnosedAt).length],
        ["Open bugs", open.length]
      ];
      statsEl.replaceChildren();
      chips.forEach((chip) => {
        const el = document.createElement("span");
        el.className = "stat";
        el.appendChild(node("b", chip[1] + " "));
        el.appendChild(document.createTextNode(chip[0]));
        statsEl.appendChild(el);
      });

      bugsEl.replaceChildren();
      (data.bugs || []).forEach((bug) => {
        const block = document.createElement("div");
        block.className = "alert";
        const title = document.createElement("b");
        const link = node("a", "#" + bug.issue);
        link.href = bug.url;
        link.target = "_blank";
        link.rel = "noopener";
        title.appendChild(link);
        title.appendChild(document.createTextNode(" " + bug.title));
        block.appendChild(title);
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = [bug.closedAt ? "closed " + when(bug.closedAt) : "open", bug.cause, count(bug.runs, "run"), (bug.hosts || []).join(", "), "last " + when(bug.lastAt)].join(" · ");
        block.appendChild(meta);
        bugsEl.appendChild(block);
      });
      if (!(data.bugs || []).length) bugsEl.appendChild(Object.assign(node("p", "No cause class has a bug yet."), { className: "empty" }));
      fixesEl.replaceChildren();
      (data.fixes || []).forEach((fix) => fixesEl.appendChild(Object.assign(node("p", fix.ref + " · " + fix.cause + " · " + when(fix.at) + " · " + fix.label), { className: "meta" })));

      const causes = Array.from(new Set(rows.map((row) => row.cause).filter(Boolean))).sort();
      const chosen = causeEl.value;
      causeEl.replaceChildren(Object.assign(node("option", "Every cause"), { value: "" }));
      causes.forEach((cause) => causeEl.appendChild(Object.assign(node("option", cause), { value: cause })));
      causeEl.value = causes.includes(chosen) ? chosen : "";

      const q = qEl.value.trim().toLowerCase();
      rowsEl.replaceChildren();
      rows.filter((row) => (!causeEl.value || row.cause === causeEl.value)
        && (!kindEl.value || row.kind === kindEl.value)
        && (!q || [row.host, row.url, row.name, row.email].join(" ").toLowerCase().includes(q)))
        .forEach((row) => {
          const tr = document.createElement("tr");
          tr.setAttribute("aria-selected", String(row.id === selected));
          [when(row.at), row.kind, row.host, row.name || row.email, row.cause, row.kind === "stopped" ? "" : row.diagnosedAt ? (row.cleared ? "Cleared" : "Still failing") : "Not probed yet", row.rerun, count(row.lineCount, "line")]
            .forEach((value) => tr.appendChild(node("td", text(value))));
          tr.addEventListener("click", () => openDetail(row.id));
          rowsEl.appendChild(tr);
        });
      if (!rowsEl.children.length) {
        const tr = document.createElement("tr");
        const td = Object.assign(node("td", rows.length ? "No failure matches." : "No review has failed in the last 90 days."), { colSpan: 8, className: "empty" });
        tr.appendChild(td);
        rowsEl.appendChild(tr);
      }
    }

    async function openDetail(id) {
      selected = id;
      render();
      const item = await deskFetch("/desk/failures/data?id=" + encodeURIComponent(id));
      if (!item || selected !== id) return;
      detailEl.hidden = false;
      detailEl.replaceChildren();
      detailEl.appendChild(node("h2", (item.kind === "stopped" ? "Stopped: " : "Failed: ") + item.host));
      const facts = document.createElement("dl");
      line(facts, "When", when(item.at));
      line(facts, "Address", item.url);
      line(facts, "Who", [item.name, item.email].filter(Boolean).join(" · "));
      line(facts, "Error", item.message);
      line(facts, "Cause", item.cause ? item.cause + " · " + item.causeLabel : "");
      line(facts, "Now", item.now ? item.now + " (probed " + count(item.checks, "time") + ", last " + when(item.diagnosedAt) + ")" : "");
      line(facts, "Re-run", item.rerun);
      const timings = item.timings || {};
      line(facts, "Took", seconds(timings.ms) + ", last log line at " + seconds(timings.lastLineMs));
      const options = item.options || {};
      line(facts, "Asked for", [options.pages ? options.pages + " pages" : "", options.depth ? "depth " + options.depth : "", (options.frameworks || []).join(", ")].filter(Boolean).join(" · "));
      line(facts, "Reason", (item.intake || {}).reason);
      if (item.fromAlert) line(facts, "Log", "Taken from the alert; this run saved no log.");
      detailEl.appendChild(facts);
      if (item.error && (item.error.stack || []).length) {
        const stack = document.createElement("details");
        stack.appendChild(node("summary", "Stack"));
        stack.appendChild(Object.assign(node("pre", item.error.stack.join("\\n")), { className: "log" }));
        detailEl.appendChild(stack);
      }
      if (item.probe) {
        detailEl.appendChild(node("h2", "Probe"));
        const list = document.createElement("ul");
        (item.probeLines || []).forEach((row) => list.appendChild(node("li", row)));
        detailEl.appendChild(list);
        const raw = document.createElement("details");
        raw.appendChild(node("summary", "Everything the probe saw"));
        raw.appendChild(Object.assign(node("pre", JSON.stringify(item.probe, null, 2)), { className: "log" }));
        detailEl.appendChild(raw);
      }
      if ((item.lines || []).length) {
        detailEl.appendChild(node("h2", "Log, " + count(item.lineCount, "line") + (item.linesCut ? " (" + item.linesCut + " from the middle were not kept)" : "")));
        detailEl.appendChild(Object.assign(node("pre", logText(item.lines)), { className: "log" }));
      }
      const again = item.rerunDoc;
      if (again) {
        detailEl.appendChild(node("h2", "Re-run " + again.status + ", " + when(again.at)));
        const rerunFacts = document.createElement("dl");
        line(rerunFacts, "Why it ran", again.why);
        line(rerunFacts, again.reportId ? "Report" : "Error", again.reportId || again.error);
        detailEl.appendChild(rerunFacts);
        if ((again.lines || []).length) detailEl.appendChild(Object.assign(node("pre", logText(again.lines)), { className: "log" }));
      }
      detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function load() {
      const body = await deskFetch("/desk/failures/data");
      if (!body) return;
      data = body;
      render();
    }
${SIGN_IN}
    qEl.addEventListener("input", render);
    causeEl.addEventListener("change", render);
    kindEl.addEventListener("change", render);
    load();
    setInterval(load, 60000);
  </script>
</body>
</html>`;

const DESK_FIREBASE_KEY = "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w";

function operatorEmail() {
  return (process.env.DESK_GOOGLE_EMAIL || "kaanmuar@gmail.com").trim().toLowerCase();
}

// Email-link sign-in issues "password" tokens too. Google is off the desk for now.
const DESK_SIGN_IN = ["password", "emailLink"];

function tokenClaims(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
}

async function verifyOperator(idToken) {
  const token = String(idToken || "").trim();
  if (token.length < 20 || token.length > 4000) return null;
  const claims = tokenClaims(token);
  const method = String((claims && claims.firebase && claims.firebase.sign_in_provider) || "");
  if (!DESK_SIGN_IN.includes(method)) return null;
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + DESK_FIREBASE_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: token })
  });
  const body = await response.json().catch(() => ({}));
  const user = body && Array.isArray(body.users) ? body.users[0] : null;
  if (!user || user.emailVerified !== true || user.localId !== claims.sub) return null;
  const known = (user.providerUserInfo || []).some((item) => item && item.providerId === "password");
  const email = String(user.email || "").trim().toLowerCase();
  if (!known || email !== operatorEmail()) return null;
  return email;
}

module.exports = {
  kindFor,
  liveState,
  alertFrom,
  alertsFromHistory,
  snapshot,
  rerunRows,
  verifyOperator,
  PAGE,
  FAILURES_PAGE
};
