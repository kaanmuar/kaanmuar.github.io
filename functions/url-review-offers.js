/**
 * Return discounts, 30-day passes, and follow-up notes.
 * A note is prepared only. Sending stays off until the asker checks the box.
 */
const core = require("./url-review-core");
const reviewCompare = require("./url-review-compare");

const RETURN_TABLE = [
  { n: 1, percent: 10, label: "First return within 30 days" },
  { n: 2, percent: 15, label: "Second return within 30 days" },
  { n: 3, percent: 20, label: "Third return and each one after, within 30 days" }
];

// What the same runs cost one by one: each run's full report plus its wider or deeper read.
function anchorCents(runs, frameworks, pages, depth) {
  return runs * (core.unitCents(frameworks) + core.priceForScope(pages, depth).cents);
}

function plan(id, usd, runs, pages, depth, frameworks, tools) {
  const anchorUsd = anchorCents(runs, frameworks, pages, depth) / 100;
  const scope = pages === core.INCLUDED_PAGES && depth === core.INCLUDED_DEPTH ? "" : ", " + pages + " pages and " + depth + " links deep,";
  return {
    id,
    usd,
    days: 30,
    runs,
    pages,
    depth,
    frameworks,
    history: true,
    tools,
    anchorUsd,
    anchor: runs + " runs with " + frameworks + " frameworks" + scope + " are " + anchorUsd.toLocaleString("en-US") + " USD one by one."
  };
}

const MONTHLY_PLANS = [
  plan("freelancer", 29, 10, 20, 2, 3, false),
  plan("team", 79, 25, 100, 5, 8, false),
  plan("pro", 189, 60, 100, 5, core.FRAMEWORKS.length, true)
];

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const COUNTRY_LANG = {
  CO: "es", MX: "es", AR: "es", CL: "es", ES: "es", PE: "es", EC: "es",
  BR: "pt", PT: "pt", DE: "de", AT: "de", FR: "fr", IT: "it", US: "en", GB: "en", CA: "en", AU: "en"
};

function returnPercent(n) {
  const count = Math.max(0, Math.round(Number(n) || 0));
  if (count <= 0) return 0;
  if (count === 1) return 10;
  if (count === 2) return 15;
  return 20;
}

function applyReturn(cents, count, n) {
  const percent = returnPercent(n);
  const schedule = Math.max(0, Math.round(Number(cents) || 0));
  const floor = core.floorCents(schedule);
  const cut = Math.round(schedule * (100 - percent) / 100);
  const next = percent ? Math.max(floor, cut) : schedule;
  return { percent, cents: next, usd: next / 100, floorUsd: floor / 100 };
}

// The better of the return ladder and a coupon; they never stack, and the price never falls below half the list.
// A comparison is a second review, so it stands at least on the first return step.
function discountFor(cents, count, options) {
  const opts = options || {};
  const list = Math.max(0, Math.round(Number(cents) || 0));
  const ladder = returnPercent(opts.compare ? Math.max(1, Math.round(Number(opts.returns) || 0)) : opts.returns);
  const offered = opts.coupon ? Math.max(0, Math.min(50, Math.round(Number(opts.coupon.percent) || 0))) : 0;
  const percent = Math.max(ladder, offered);
  const floor = core.floorCents(list);
  const next = percent ? Math.max(floor, Math.round(list * (100 - percent) / 100)) : list;
  const shown = list && next < list ? Math.round((list - next) * 100 / list) : 0;
  return {
    listUsd: list / 100,
    usd: next / 100,
    cents: next,
    percent: shown,
    source: !shown ? "" : offered >= ladder ? "coupon" : "return",
    code: shown && offered >= ladder && opts.coupon ? String(opts.coupon.code || "") : ""
  };
}

function cleanCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9-]{4,24}$/.test(code) ? code : "";
}

// `usedByEmail` is how many times the payer's address already redeemed this code; null when the address is unknown.
function couponOpen(coupon, purpose, reportId, now, usedByEmail) {
  if (!coupon || !(Number(coupon.percent) > 0)) return false;
  const at = now ? new Date(now).getTime() : Date.now();
  if (coupon.validUntil && Date.parse(coupon.validUntil) <= at) return false;
  if (coupon.validFrom && Date.parse(coupon.validFrom) > at) return false;
  if (Number(coupon.maxUses) > 0 && Number(coupon.uses || 0) >= Number(coupon.maxUses)) return false;
  if (Number(coupon.perEmail) > 0 && (usedByEmail == null || Number(usedByEmail) >= Number(coupon.perEmail))) return false;
  if (Array.isArray(coupon.purposes) && coupon.purposes.length && coupon.purposes.indexOf(purpose) === -1) return false;
  if (purpose === "report" && coupon.reportId && coupon.reportId !== reportId) return false;
  return true;
}

function returnsBefore(rows, before) {
  const end = before ? Date.parse(before) : Date.now();
  const month = 30 * 24 * 60 * 60 * 1000;
  return (rows || []).filter((row) => {
    if (!row || row.status !== "complete") return false;
    const at = Date.parse(row.createdAt || "");
    return at && at < end && end - at < month;
  }).length;
}

function languageOf(header, country) {
  const tag = String(header || "").split(",")[0].trim().slice(0, 2).toLowerCase();
  if (LANGS.indexOf(tag) !== -1) return tag;
  return COUNTRY_LANG[String(country || "").toUpperCase()] || "en";
}

function catalog() {
  const one = core.unitCents(1);
  const four = core.unitCents(4);
  const eight = core.unitCents(8);
  return {
    floor: "A return price or a code never takes a price below half its list price.",
    cadence: "At most three notes in seven days, and never twice inside 48 hours.",
    returnTable: RETURN_TABLE.map((row) => ({
      n: row.n,
      percent: row.percent,
      label: row.label,
      oneUsd: applyReturn(one, 1, row.n).usd,
      fourUsd: applyReturn(four, 4, row.n).usd,
      eightUsd: applyReturn(eight, 8, row.n).usd
    })),
    plans: MONTHLY_PLANS.map((plan) => Object.assign({}, plan, {
      share: plan.anchorUsd ? Math.round((plan.usd / plan.anchorUsd) * 100) : 100
    }))
  };
}

function planById(id) {
  return MONTHLY_PLANS.find((plan) => plan.id === id) || MONTHLY_PLANS[0];
}

const COPY = require("./url-review-note-copy");

function fill(text, vars) {
  return String(text || "").replace(/\{(\w+)\}/g, (all, key) => (vars[key] == null ? all : String(vars[key])));
}

function messageFor(kind, lang, vars, turn) {
  const pack = COPY[LANGS.indexOf(lang) === -1 ? "en" : lang] || COPY.en;
  const scenes = pack[kind] || pack.return;
  const scene = Math.max(0, Math.round(Number(turn) || 0)) % scenes.length;
  const row = scenes[scene];
  const body = fill(row[1], vars);
  return {
    lang: LANGS.indexOf(lang) === -1 ? "en" : lang,
    kind,
    scene,
    subject: fill(row[2], vars),
    title: fill(row[0], vars),
    body,
    text: body + "\n\nQA-lab URL Review\nhttps://carlosandmunoz.com/qa-review.html"
  };
}

function completed(row) {
  return row && (row.status === "complete" || row.status === "stopped") && row.report;
}

function queue(records, now) {
  const at = now ? new Date(now).getTime() : Date.now();
  const month = 30 * 24 * 60 * 60 * 1000;
  const week = 7 * 24 * 60 * 60 * 1000;
  const gap = 48 * 60 * 60 * 1000;
  const byEmail = new Map();
  (records || []).forEach((row) => {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") === -1) return;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(row);
  });
  const stopped = new Set();
  (records || []).forEach((row) => {
    if (row && row.status === "follow-stop" && row.email) stopped.add(String(row.email).toLowerCase());
  });
  const passes = (records || []).filter((row) => row && row.status === "monthly-pass" && row.email && Date.parse(row.paidUntil || "") > at);
  return Array.from(byEmail.entries()).map(([email, rows]) => {
    const runs = rows.filter(completed).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const latest = runs[runs.length - 1] || rows[rows.length - 1];
    const lastRunAt = runs.length ? Date.parse(runs[runs.length - 1].createdAt || "") : 0;
    const inMonth = runs.filter((row) => at - Date.parse(row.createdAt || "") < month);
    const prior = Math.max(0, inMonth.length - 1);
    const percent = returnPercent(prior + 1);
    const paidOnce = rows.some((row) => row.paid === true || row.status === "paid-report" || row.status === "run-credit");
    const pass = passes.find((row) => String(row.email).toLowerCase() === email);
    const asked = rows.some((row) => row.followUp === true);
    const lang = latest && LANGS.indexOf(latest.lang) !== -1 ? latest.lang : languageOf(latest && latest.acceptLanguage, latest && latest.country);
    const sent = rows.filter((row) => row.status === "follow-note").map((row) => Date.parse(row.createdAt || "")).filter((time) => time && at - time < week).sort((a, b) => b - a);
    const quiet = !lastRunAt || at - lastRunAt > week;
    let kind = "return";
    if (paidOnce && !pass) kind = "paid";
    else if (!quiet) kind = "offer";
    const host = (latest && latest.report && latest.report.host) || "";
    const turn = rows.filter((row) => row.status === "follow-note").length;
    const note = messageFor(kind, lang, { host: host || "the page" }, turn);
    let held = "";
    if (stopped.has(email)) held = "This address asked to stop.";
    else if (pass) held = "A 30-day pass is open. Notes wait.";
    else if (!asked) held = "This address did not ask for notes.";
    else if (!lastRunAt) held = "No finished report yet.";
    else if (at - lastRunAt > month) held = "The 30-day return window closed.";
    else if (sent.length >= 3) held = "Three notes already went out in seven days.";
    else if (sent[0] && at - sent[0] < gap) held = "The last note was inside 48 hours.";
    return {
      email,
      name: (latest && latest.name) || "",
      lang,
      kind,
      host,
      reportId: (runs.length && runs[runs.length - 1].id) || "",
      percent: percent || 10,
      returns: prior,
      paidOnce,
      asked,
      held,
      due: !held,
      lastRun: lastRunAt ? new Date(lastRunAt).toISOString() : "",
      scene: note.scene,
      subject: note.subject,
      title: note.title,
      body: note.body,
      text: note.text
    };
  }).sort((a, b) => Number(b.due) - Number(a.due) || String(a.email).localeCompare(String(b.email)));
}

function customerRun(row, open) {
  const report = row.report || {};
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const pages = Array.isArray(report.pages) ? report.pages : [];
  const blur = (value) => {
    const text = String(value || "");
    if (open || text.length < 8) return text;
    const keep = Math.max(4, Math.ceil(text.length / 2));
    return text.slice(0, keep);
  };
  return {
    id: row.id || "",
    at: row.createdAt || "",
    status: row.status || "",
    host: (report.host) || "",
    url: open ? (row.requestedUrl || "") : blur(row.requestedUrl || ""),
    pages: row.pages || null,
    depth: row.depth || null,
    pageCount: report.counts ? report.counts.pages : pages.length,
    caseCount: report.counts ? report.counts.cases : cases.length,
    signalCount: Array.isArray(report.alerts) ? report.alerts.length : 0,
    frameworks: row.frameworks || [],
    open,
    statement: open ? (report.statement || "") : blur(report.statement || ""),
    paths: pages.slice(0, 20).map((page) => open ? (page.path || "") : blur(page.path || "")),
    cases: cases.slice(0, 24).map((item) => ({
      id: item.id || "",
      layer: item.layer || "",
      title: open ? (item.title || "") : blur(item.title || "")
    })),
    log: open ? (report.log || []).slice(-12).map((line) => line && line.text ? line.text : "") : [],
    compare: reviewCompare.compareLine(row)
  };
}

// The payment row for a report paid after its run: who paid, for which run, and how much; never the report.
function reportPayment(run, payment) {
  const row = Object.assign({
    status: "paid-report",
    paid: true,
    purpose: "report",
    email: String((run && run.email) || "").trim().toLowerCase(),
    frameworks: (run && run.frameworks) || []
  }, payment || {});
  Object.keys(row).forEach((key) => { if (row[key] === undefined) delete row[key]; });
  return row;
}

// Bought on a report that already exists; none of them pays for a run.
const ADDONS = ["fixlist", "cases", "alerts", "credentials"];

function paidPurpose(value) {
  const purpose = String(value || "");
  return purpose === "report" || ADDONS.indexOf(purpose) !== -1 ? purpose : "new-run";
}

// The payment row for a fix list, case export, signals, or a signed-in run bought on a report; never a run credit.
function addonPayment(run, payment) {
  const row = Object.assign({
    status: "paid-addon",
    paid: true,
    email: String((run && run.email) || "").trim().toLowerCase(),
    frameworks: (run && run.frameworks) || []
  }, payment || {});
  Object.keys(row).forEach((key) => { if (row[key] === undefined) delete row[key]; });
  return row;
}

function returnCoupon(note, now) {
  const at = now || Date.now();
  return {
    percent: Math.max(10, Number(note && note.percent) || 10),
    purposes: ["report", "new-run"],
    reportId: (note && note.reportId) || "",
    email: note && note.email,
    maxUses: 1,
    uses: 0,
    source: "return-note",
    validUntil: new Date(at + 14 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(at).toISOString(),
    expireAt: new Date(at + core.RETAIN_MS)
  };
}

// `freeAccount` is true for a free-run address (FREE_RUN_EMAILS or url_review_free_runs); every run it owns opens.
function accountFile(records, email, now, options) {
  const address = String(email || "").trim().toLowerCase();
  const at = now == null ? Date.now() : Number(now);
  const freeAccount = !!(options && options.freeAccount);
  const rows = (records || []).filter((row) => row && String(row.email || "").trim().toLowerCase() === address);
  const passes = rows.filter((row) => row.status === "monthly-pass").sort((a, b) => String(b.paidUntil || "").localeCompare(String(a.paidUntil || "")));
  const pass = passes[0] || null;
  const passOpen = !!pass && Date.parse(pass.paidUntil || "") > at;
  const open = freeAccount || passOpen;
  return {
    email: address,
    open,
    free: freeAccount,
    pass: passOpen,
    charged: pass ? pass.paid === true : false,
    localPass: pass ? pass.localPass === true : false,
    paidUntil: pass ? pass.paidUntil || "" : "",
    plans: catalog().plans,
    runs: rows.filter((row) => row.report)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .map((row) => customerRun(row, open || row.paid === true || row.free === true))
  };
}

module.exports = {
  reportPayment,
  ADDONS,
  paidPurpose,
  addonPayment,
  returnCoupon,
  RETURN_TABLE,
  MONTHLY_PLANS,
  returnPercent,
  applyReturn,
  discountFor,
  cleanCode,
  couponOpen,
  returnsBefore,
  languageOf,
  catalog,
  planById,
  messageFor,
  queue,
  customerRun,
  accountFile
};
