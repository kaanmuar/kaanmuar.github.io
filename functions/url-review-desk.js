/**
 * Owner view of URL-review runs. Summaries only: no page HTML.
 */
const offers = require("./url-review-offers");

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
  checkout: "A checkout was opened",
  blocked: "A review was refused",
  "payment-due": "A review is waiting on payment",
  capture: "A report was copied or printed",
  credit: "A paid run credit was used",
  failed: "A review failed",
  monthly: "A 30-day history pass was opened on this machine. No charge was made.",
  "follow-stop": "Follow-up notes were stopped"
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
  add("Purpose", source.purpose);
  add("Capture", source.kind);
  return items;
}

function alertFrom(kind, source) {
  const key = TITLES[kind] ? kind : (kindFor(source) || "report");
  const title = TITLES[key] || "A review event";
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

function summary(row, index) {
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
    provider: clip(row.provider || "", 20),
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

function snapshot(records, alerts, active) {
  const list = Array.isArray(records) ? records : [];
  const index = new Map();
  list.forEach((row) => {
    if (row && row.id && row.report) index.set(row.id, row);
  });
  const runs = list.map((row) => summary(row || {}, index)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const notes = (Array.isArray(alerts) ? alerts : []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80);
  const tally = {
    runs: runs.length,
    running: (active || []).length,
    reports: runs.filter((row) => row.status === "complete" || row.status === "stopped").length,
    paid: runs.filter((row) => row.paid || row.status === "paid-report" || row.status === "run-credit").length,
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
    followUps: offers.queue(list).slice(0, 40),
    runs
  };
}

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Review desk</title>
  <style>
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
    #desk-out { margin-top: 12px; background: transparent; color: var(--teal); border: 1px solid var(--line); }
  </style>
</head>
<body class="desk-locked">
  <header>
    <h1>Review desk</h1>
    <p class="lede">Runs for this review. This page asks again every few seconds. Customer sign-in is separate from this desk.</p>
    <button id="desk-out" type="button">Sign out</button>
    <div class="stats" id="stats"></div>
  </header>
  <main>
    <section id="desk-gate">
      <h2>Operator sign-in</h2>
      <p>Continue with the operator Google account. Any other Google account stays outside.</p>
      <button id="desk-google" type="button">Continue with Google</button>
      <p id="desk-gate-note" class="empty"></p>
    </section>
    <section>
      <h2>Alerts</h2>
      <div id="alerts"></div>
    </section>
    <section id="running-block">
      <h2>Running now</h2>
      <div id="running"></div>
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
        [when(run.at), run.status, run.name || run.email, run.host || run.url, run.language, run.pageCount, run.caseCount, run.signalCount, run.priceUsd == null ? "—" : run.priceUsd + " USD", run.paid ? "Yes" : "No", run.followUp ? "Asked" : "—"].forEach((value) => {
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
      line(dl, "Pages read", picked.pageCount + " of " + text(picked.pages) + ", depth " + text(picked.depth));
      line(dl, "Forms", picked.forms);
      line(dl, "Images", text(picked.images) + ", missing alt " + text(picked.missingAlt));
      line(dl, "Cases", picked.caseCount);
      line(dl, "Signals", picked.signalCount);
      line(dl, "Price", picked.priceUsd == null ? "—" : picked.priceUsd + " USD");
      line(dl, "Paid", picked.paid ? "Yes" : "No");
      line(dl, "Signature", picked.mark);
      line(dl, "Browser", picked.userAgent);
      line(dl, "Network", [picked.ip, picked.city, picked.country].filter(Boolean).join(" · "));
      line(dl, "Device", picked.deviceId);
      line(dl, "Terms", picked.termsVersion);
      line(dl, "Kept until", picked.retainUntil);
      detailEl.appendChild(dl);
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
      (data.codes || []).forEach((item) => {
        const block = document.createElement("div");
        block.className = "alert";
        block.appendChild(node("b", "Sign-in code on this machine"));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = item.email + " · " + item.code + " · until " + when(item.expires);
        block.appendChild(meta);
        notesEl.appendChild(block);
      });
    }

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
    async function openPass(email) {
      await fetch(deskBase() + "/desk/pass", {
        method: "POST",
        credentials: "include",
        headers: await deskHeaders(),
        body: JSON.stringify({ email: email, plan: "glance" })
      });
      load();
    }

    function lockDesk() {
      document.body.classList.add("desk-locked");
    }
    function unlockDesk() {
      document.body.classList.remove("desk-locked");
    }
    async function load() {
      const headers = await deskHeaders();
      const response = await fetch(deskBase() + "/desk/data", { cache: "no-store", credentials: "include", headers: headers });
      if (response.status === 401 || response.status === 403) {
        lockDesk();
        if (response.status === 403) {
          const note = document.getElementById("desk-gate-note");
          if (note) note.textContent = "This Google account cannot open the desk.";
        }
        return;
      }
      if (!response.ok) return;
      unlockDesk();
      data = await response.json();
      render();
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
          note.textContent = "This Google account cannot open the desk.";
          return;
        }
      }
      note.textContent = "";
      load();
    }
    document.getElementById("desk-google").addEventListener("click", async () => {
      const note = document.getElementById("desk-gate-note");
      note.textContent = "Opening Google…";
      const auth = deskApp();
      if (!auth) {
        note.textContent = "Google sign-in did not load.";
        return;
      }
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        const cred = await auth.signInWithPopup(provider);
        await finishDesk(cred.user);
      } catch (error) {
        const code = error && error.code;
        if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
          note.textContent = "Continuing in this window…";
          auth.signInWithRedirect(provider);
          return;
        }
        if (code === "auth/unauthorized-domain") {
          note.textContent = "Google did not accept this desk address.";
          return;
        }
        note.textContent = "Google did not complete the sign-in.";
      }
    });
    const startingAuth = deskApp();
    if (startingAuth) {
      startingAuth.onAuthStateChanged((user) => {
        if (user) load();
      });
      startingAuth.getRedirectResult().then((result) => {
        if (result && result.user) finishDesk(result.user);
      }).catch(() => {});
    }
    document.getElementById("desk-out").addEventListener("click", async () => {
      const auth = deskApp();
      if (auth && auth.currentUser) await auth.signOut();
      await fetch(deskBase() + "/desk/logout", { method: "POST", credentials: "include" });
      lockDesk();
    });
    qEl.addEventListener("input", render);
    statusEl.addEventListener("change", render);
    load();
    setInterval(load, 4000);
  </script>
</body>
</html>`;

const DESK_FIREBASE_KEY = "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w";

function operatorEmail() {
  return (process.env.DESK_GOOGLE_EMAIL || "kaanmuar@gmail.com").trim().toLowerCase();
}

async function verifyOperator(idToken) {
  const token = String(idToken || "").trim();
  if (token.length < 20 || token.length > 4000) return null;
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + DESK_FIREBASE_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: token })
  });
  const body = await response.json().catch(() => ({}));
  const user = body && Array.isArray(body.users) ? body.users[0] : null;
  if (!user || user.emailVerified !== true) return null;
  const google = (user.providerUserInfo || []).some((item) => item && item.providerId === "google.com");
  const email = String(user.email || "").trim().toLowerCase();
  if (!google || email !== operatorEmail()) return null;
  return email;
}

module.exports = {
  kindFor,
  alertFrom,
  alertsFromHistory,
  snapshot,
  verifyOperator,
  PAGE
};
