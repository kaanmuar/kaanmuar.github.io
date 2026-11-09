// #2866: a tab's layout (jarvis_settings layout[tab]) is one list of panel ids for the web and the app, so a panel both draw needs one id.
// Reads the web's panel()/listPanel() calls in js/admin-jarvis.js and the app's `id =` arguments in android/.../ui/*.kt.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const core = require("../../js/admin-jarvis-core.js");

const ROOT = path.join(__dirname, "../..");
const UI = path.join(ROOT, "android/app/src/main/java/com/carlosandmunoz/jarvis/ui");
// Panels outside the tabs: Settings, Ask and the refresh error (Main.kt), the briefing sheet.
const NOT_TABS = new Set(["Main.kt", "BriefSheet.kt"]);

// Panels only one side draws, per tab. Each name is the id without its "<tab>-".
const WEB_ONLY = {
  overview: ["feed", "rings", "mix"],
  // The app's product tabs show no goals and no GA4 card; the app keeps goals on Overview.
  inbox: ["goals"],
  cv: ["goals", "ga4"],
  studio: ["goals", "ga4"],
  lab: ["goals", "ga4"],
  review: ["goals", "ga4", "reports"],
  business: ["paypal", "social-visits"],
  marketing: ["camp-seq", "channels", "domain", "email", "funnel", "heat", "links", "mailboxes", "output", "outreach-visits", "response", "results",
    "revenue", "shares", "social-results", "social-visits", "timeline", "top-posts", "weekly", "youtube"],
  traffic: ["daily"],
  systems: ["links", "ops", "ready"],
  github: ["agents-daily", "agents-open", "aging", "ahead", "ci-trend", "deploy-last", "drift", "envs", "oldest", "pr-daily", "subissues", "throughput",
    "wait", "worktrees", "xp"]
};
const APP_ONLY = {
  // "$product-…" ids are drawn on every site product tab (Screens.kt PRODUCTS). The web shows the KPIs above its panels and draws
  // reviews and ratings inside review-trend and inbox-trend.
  product: ["summary", "wait", "reviews", "ratings", "send-reports"],
  overview: ["money"],
  outreach: ["summary", "segments", "results", "link-visits", "link-opens", "link-make", "link-channels"],
  marketing: ["summary", "approvals", "countdowns"],
  engagement: ["summary", "owner-accounts", "owner-comments"],
  business: ["providers", "channels"],
  systems: ["functions"],
  github: ["health", "summary", "workflows"],
  hub: ["studio"],
  console: ["log"],
  // The product list beside the picked product on wide screens; it sits outside the arranged panels.
  products: ["list"]
};

const flat = (groups) => Object.entries(groups).flatMap(([tab, names]) => names.map((n) => (tab === "product" ? "$product-" : tab + "-") + n));

// ------------------------------------------------------------------ web

function webPanels() {
  const src = fs.readFileSync(path.join(ROOT, "js/admin-jarvis.js"), "utf8");
  const fns = [];
  const head = /^ {4}(?:async )?function (\w+)\(([^)]*)\)/gm;
  let m;
  while ((m = head.exec(src))) fns.push({ name: m[1], params: m[2].split(",").map((p) => p.trim().split(/\s*=/)[0]).filter(Boolean), start: m.index });
  fns.forEach((f, i) => { f.end = i + 1 < fns.length ? fns[i + 1].start : src.length; f.body = src.slice(f.start, f.end); });
  const at = (index) => fns.find((f) => index >= f.start && index < f.end);

  // The values a function's parameter takes at its call sites: literals, a caller's own parameter, or a forEach over a literal list.
  function values(fn, param, seen = new Set()) {
    if (seen.has(fn.name + "/" + param)) return [];
    seen.add(fn.name + "/" + param);
    const k = fn.params.indexOf(param);
    const out = [];
    const call = new RegExp(`(?<!function )\\b${fn.name}\\(([^()]*)\\)`, "g");
    let c;
    while ((c = call.exec(src))) {
      const arg = (c[1].split(",")[k] || "").trim();
      const lit = arg.match(/^'([^']*)'$/);
      if (lit) { out.push(lit[1]); continue; }
      if (!arg) { out.push(undefined); continue; }
      const caller = at(c.index);
      if (!caller || !/^\w+$/.test(arg)) continue;
      if (caller.params.includes(arg)) { out.push(...values(caller, arg, seen)); continue; }
      const each = caller.body.match(new RegExp(`\\[([^\\]]*)\\]\\.forEach\\(\\(${arg}\\)`));
      if (each) out.push(...[...each[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
    }
    return out;
  }

  const out = [];
  const add = (id, kind, index) => out.push({ id, kind, line: src.slice(0, index).split("\n").length });
  for (const p of src.matchAll(/\bpanel\(\s*([^,]+?)\s*,/g)) {
    const arg = p[1];
    const lits = arg.match(/^'([^']+)'$/) || arg.match(/^\w+ \? '([^']+)' : '([^']+)'$/);
    if (lits) { lits.slice(1).forEach((id) => add(id, "panel", p.index)); continue; }
    const tpl = arg.match(/^\(?(\w+)(?: \|\| '([^']+)')?\)? \+ '([^']+)'$/);
    if (!tpl) continue;
    const fn = at(p.index);
    values(fn, tpl[1]).forEach((v) => { if (v !== undefined || tpl[2]) add((v === undefined ? tpl[2] : v) + tpl[3], "panel", p.index); });
  }
  for (const l of src.matchAll(/\blistPanel\(\s*(?:'([^']+)'|(\w+))\s*,\s*'([^']+)'/g)) {
    const tabs = l[1] ? [l[1]] : values(at(l.index), l[2]);
    tabs.forEach((t) => add(t + "-" + l[3], "list", l.index));
  }
  if (src.includes('data-panel-id="briefing"')) add("briefing", "panel", src.indexOf('data-panel-id="briefing"'));
  return out;
}

// ------------------------------------------------------------------ app

// Index just past the string, char, or bracketed block that starts at i.
function skip(s, i) {
  const c = s[i];
  if (c === '"') {
    if (s.startsWith('"""', i)) return s.indexOf('"""', i + 3) + 3;
    for (i++; i < s.length; i++) {
      if (s[i] === "\\") i++;
      else if (s[i] === '"') return i + 1;
      else if (s[i] === "$" && s[i + 1] === "{") i = skip(s, i + 1) - 1;
    }
  }
  if (c === "'") { let j = i + 1 + (s[i + 1] === "\\" ? 2 : 1); while (s[j] !== "'") j++; return j + 1; }
  let depth = 0;
  for (; i < s.length; i++) {
    const d = s[i];
    if (d === '"' || d === "'") { i = skip(s, i) - 1; continue; }
    if ("({[".includes(d)) depth++;
    else if (")}]".includes(d) && --depth === 0) return i + 1;
  }
  throw new Error("unbalanced at " + i);
}

// The top-level arguments of the call whose "(" is at open.
function args(s, open) {
  const end = skip(s, open) - 1;
  const out = [];
  let from = open + 1;
  for (let i = from; i < end; i++) {
    if ("\"'({[".includes(s[i])) { i = skip(s, i) - 1; continue; }
    if (s[i] === ",") { out.push(s.slice(from, i).trim()); from = i + 1; }
  }
  out.push(s.slice(from, end).trim());
  return out.filter(Boolean);
}

// The ids an `id =` expression can give: its string literals, less the `when` subjects before "->".
const strings = (expr) => {
  const out = [];
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "'") { i = skip(expr, i) - 1; continue; }
    if (expr[i] !== '"') continue;
    const j = skip(expr, i);
    if (!/^\s*->/.test(expr.slice(j))) out.push(expr.slice(i + 1, j - 1));
    i = j - 1;
  }
  return out;
};

function appPanels() {
  const files = fs.readdirSync(UI).filter((f) => f.endsWith(".kt")).map((f) => ({ f, src: fs.readFileSync(path.join(UI, f), "utf8") }));
  // Panel, and each composable that hands its id parameter on to a panel (TopList, Heatmap, Approvals…).
  const takesId = new Set(["Panel"]);
  for (const { src } of files) {
    for (const d of src.matchAll(/\bfun ([A-Z]\w*)\(/g)) {
      const open = d.index + d[0].length - 1;
      if (!args(src, open).some((a) => /^id: String\b/.test(a))) continue;
      const brace = src.indexOf("{", skip(src, open));
      if (/\bid = id\b/.test(src.slice(brace, skip(src, brace)))) takesId.add(d[1]);
    }
  }
  const calls = new RegExp(`(?<!fun )\\b(${[...takesId].join("|")})\\(`, "g");
  const out = [];
  const missing = [];
  for (const { f, src } of files) {
    if (NOT_TABS.has(f)) continue;
    for (const c of src.matchAll(calls)) {
      const a = args(src, c.index + c[0].length - 1);
      const line = src.slice(0, c.index).split("\n").length;
      const id = a.find((x) => /^id\s*=/.test(x));
      if (!id) { missing.push(`${f}:${line} ${c[1]}(${a[0] || ""})`); continue; }
      const expr = id.replace(/^id\s*=\s*/, "");
      if (expr === "id") continue;
      strings(expr).forEach((v) => out.push({ id: v, where: `${f}:${line}` }));
    }
  }
  return { out, missing };
}

const screens = fs.readFileSync(path.join(UI, "Screens.kt"), "utf8");
const PRODUCTS = [...screens.match(/val PRODUCTS = listOf\(([^\n]*)\)/)[1].matchAll(/"(\w+)" to/g)].map((m) => m[1]);
const LIST = "$product-${kebab(key)}";

function compare() {
  const web = webPanels();
  const { out: app, missing } = appPanels();
  const webIds = new Set(web.map((p) => p.id));
  const covered = new Set();
  const appOnly = new Set();
  const unknown = [];
  for (const { id, where } of app) {
    if (id === LIST) {
      web.filter((p) => p.kind === "list" && PRODUCTS.some((t) => p.id.startsWith(t + "-"))).forEach((p) => covered.add(p.id));
      continue;
    }
    if (id.includes("$")) {
      const tpl = id.match(/^\$product(-[a-z0-9-]+)$/);
      if (!tpl) { unknown.push(`${where} ${id}`); continue; }
      const hits = PRODUCTS.map((t) => t + tpl[1]).filter((x) => webIds.has(x));
      hits.forEach((x) => covered.add(x));
      if (!hits.length) appOnly.add(id);
      continue;
    }
    if (webIds.has(id)) covered.add(id);
    else appOnly.add(id);
  }
  const webOnly = new Set([...webIds].filter((id) => !covered.has(id)));
  return { web, app, missing, unknown, webOnly, appOnly };
}

const r = compare();

test("every app panel on a tab passes its id", () => {
  assert.deepEqual(r.missing, [], "Pass `id =` (the web panel's id, or a new one listed in APP_ONLY):\n" + r.missing.join("\n"));
  assert.deepEqual(r.unknown, [], "Ids may use $product only, as \"$product-<name>\":\n" + r.unknown.join("\n"));
});

test("the extractors find the panels", () => {
  assert.ok(r.web.length > 150, `web panels: ${r.web.length}`);
  assert.ok(r.app.length > 120, `app panels: ${r.app.length}`);
  for (const id of ["review-funnel", "overview-goals", "cv-heat", "review-review-sources", "overview-proposals", "github-proposals", "systems-processes", "briefing"]) assert.ok(r.web.some((p) => p.id === id), id);
});

test("a web list panel never shares its id with another web panel", () => {
  const panels = new Set(r.web.filter((p) => p.kind === "panel").map((p) => p.id));
  assert.deepEqual(r.web.filter((p) => p.kind === "list" && panels.has(p.id)).map((p) => `${p.id} (js/admin-jarvis.js:${p.line})`), []);
});

test("a panel both sides draw has one id", () => {
  const sorted = (xs) => [...xs].sort();
  assert.deepEqual(sorted(r.webOnly), sorted(flat(WEB_ONLY)), "Web panels with no app panel of that id: give the app panel the web id, or list it in WEB_ONLY.");
  assert.deepEqual(sorted(r.appOnly), sorted(flat(APP_ONLY)), "App panels with no web panel of that id: use the web id, or list it in APP_ONLY.");
});

test("every id belongs to a layout tab", () => {
  const tabs = new Set(core.LAYOUT_TABS);
  const bad = [...r.web.map((p) => p.id), ...r.app.map((p) => p.id)]
    .filter((id) => id !== "briefing" && !id.startsWith("$product-") && !flat({ products: APP_ONLY.products }).includes(id))
    .filter((id) => !tabs.has(id.split("-")[0]));
  assert.deepEqual([...new Set(bad)], []);
});
