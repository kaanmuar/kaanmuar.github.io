"use strict";
/* Every email address we own and its state (#2338), for Systems > Email addresses on the web and in the app.

   ImprovMX       the forwarding domain's aliases with their forwards (a webhook shows as "webhook", as in
                  mail-health.js), the last day's mail per alias, and the SMTP logins
   Instantly      the sending mailboxes, with Jarvis's own pause reason (jarvis_outreach_pauses)
   Microsoft 365  the mailboxes and their smtp aliases through Graph client credentials (MS_GRAPH_TENANT_ID,
                  MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET); without them, the outreach domain's addresses
                  Instantly knows, unchecked, and a need
   SendGrid       the transactional sender (SENDGRID_FROM)
   plus MX, SPF, DKIM and DMARC on the forwarding and the outreach domain.

   The Graph app is "Jarvis mail inventory (read-only)" in the qalabreview.com tenant (User.Read.All, application;
   its secret expires 2028-11-01). One row per address and system, so carlos@ shows as a Microsoft 365 mailbox and
   as an Instantly sender. issues[] say who fixes what: the hourly pass (jarvis-actions.js) turns warm-up back on and
   restores the required aliases; the rest it pushes to Carlos once per occurrence (jarvis_watch/addresses). Bounces
   are not pushed here: the alert watch already pushes them from the mailbox source. */

const mailHealth = require("./mail-health");
const jarvisOutreach = require("./jarvis-outreach");

const IMPROVMX = "https://api.improvmx.com/v4/";
const INSTANTLY = "https://api.instantly.ai/api/v2/";
const GRAPH = "https://graph.microsoft.com/v1.0/";
const FORWARD_DOMAIN = "carlosandmunoz.com";
const OUTREACH_DOMAIN = "qalabreview.com";
// SendGrid signs as s1/s2, ImprovMX's SMTP as dkimprovmx1/2.
const FORWARD_DKIM = ["s1", "s2", "dkimprovmx1", "dkimprovmx2"];
// Aliases mail depends on: canary@ for the daily round trip (inbox and webhook), postmaster@ and abuse@ (RFC 2142).
const REQUIRED = [{ alias: mailHealth.CANARY, webhook: true }, { alias: "postmaster" }, { alias: "abuse" }];
const LINKS = {
  instantly: "https://app.instantly.ai/app/accounts",
  improvmx: "https://app.improvmx.com/",
  m365: "https://admin.microsoft.com/#/users",
  graph: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
};
const GRAPH_NEED = "Microsoft 365: register a read-only Graph app (User.Read.All, application) and put MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID and MS_GRAPH_CLIENT_SECRET in Secret Manager.";
const SYSTEMS = ["Microsoft 365", "ImprovMX", "Instantly", "SendGrid"];
const SHORT = { ImprovMX: "improvmx", Instantly: "instantly", "Microsoft 365": "m365", SendGrid: "sendgrid" };
const PUSH_ONE_BY_ONE = 3;

const lower = (v) => String(v || "").trim().toLowerCase();
const clip = (value, max) => {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};
// Error text never carries a webhook URL: its key is in it.
const clean = (error) => clip(String((error && error.message) || error || "failed").replace(/https?:\/\/\S+/g, "webhook"), 200);
const domainOf = (address) => lower(address).split("@")[1] || "";
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

function row(fields) {
  return Object.assign({ address: "", domain: domainOf(fields.address), system: "", kind: "", forwards: [], aliasOf: "", state: "ok", detail: "", fix: null, problem: "" }, fields);
}

/** An ImprovMX forward string as destinations, webhook URLs reduced to "webhook". */
function forwardsOf(forward) {
  return String(forward || "").split(",").map((f) => mailHealth.destination({ email: f.trim() })).filter(Boolean);
}

// The mailbox most aliases forward to: where a restored alias forwards too.
function inboxOf(aliases) {
  const n = {};
  (aliases || []).forEach((a) => forwardsOf(a.forward).filter((f) => f !== "webhook").forEach((f) => { n[f] = (n[f] || 0) + 1; }));
  return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b))[0] || "";
}

const hookOf = (aliases) => (aliases || []).map((a) => String(a.forward || "").split(",").map((f) => f.trim()).find((f) => /^https?:/i.test(f))).find(Boolean) || "";

/** The alias to POST to restore a required one, from the live list: the inbox, plus the webhook copied from an alias
    that has one. null when it cannot be built. Carries the webhook key: server side only, never in a row. */
function restorePlan(aliases, alias) {
  const want = REQUIRED.find((r) => r.alias === alias);
  const inbox = inboxOf(aliases);
  const hook = want && want.webhook ? hookOf(aliases) : "";
  if (!want || !inbox || (want.webhook && !hook)) return null;
  return { alias, forward: [inbox].concat(hook ? [hook] : []).join(",") };
}

/** Rows for the forwarding domain: each alias with its forwards and last day, the required aliases that are missing, the SMTP logins. */
function improvmxRows(aliases, credentials, box, domain) {
  const d = domain || FORWARD_DOMAIN;
  const tally = new Map(((box && box.aliases) || []).map((r) => [r.alias, r]));
  const problems = (box && box.problems) || [];
  const have = new Set((aliases || []).map((a) => lower(a.alias)));
  const rows = (aliases || []).filter((a) => a.alias).map((a) => {
    const alias = lower(a.alias);
    const t = tally.get(alias);
    const bad = problems.filter((p) => p.alias === alias);
    const base = { address: alias + "@" + d, system: "ImprovMX", kind: "alias", forwards: forwardsOf(a.forward), recent: t ? { mails: t.mails, forwarded: t.forwarded, bounced: t.bounced, refused: t.refused, last: t.last } : null };
    if (bad.length) {
      const what = bad.every((p) => p.outcome === "refused") ? "refused" : "bounced";
      return row(Object.assign(base, { state: "error", problem: "bounce", detail: plural(bad.length, "mail") + " " + what + " in the last day: " + clip(bad[0].reason || bad[0].code || "no detail", 140), fix: { by: "carlos", action: "Check the forward", link: LINKS.improvmx } }));
    }
    return row(Object.assign(base, { detail: t ? plural(t.mails, "mail") + " in the last day, " + t.forwarded + " forwarded." : "No mail in the last day." }));
  });
  const inbox = inboxOf(aliases);
  const hook = !!hookOf(aliases);
  REQUIRED.filter((r) => !have.has(r.alias)).forEach((r) => {
    const can = !!inbox && (!r.webhook || hook);
    rows.push(row({
      address: r.alias + "@" + d, system: "ImprovMX", kind: "alias", state: "error", problem: "missing", forwards: can ? [inbox].concat(r.webhook ? ["webhook"] : []) : [],
      detail: "Missing from ImprovMX" + (r.alias === mailHealth.CANARY ? ": the daily round trip cannot come back." : "."),
      fix: can ? { by: "jarvis", action: "restore-alias" } : { by: "carlos", action: "Add the alias", link: LINKS.improvmx }
    }));
  });
  (credentials || []).forEach((c) => {
    const user = lower(c.username);
    if (!user) return;
    rows.push(row({ address: user.includes("@") ? user : user + "@" + d, system: "ImprovMX", kind: "smtp login", detail: "Sends through smtp.improvmx.com" + (Number(c.usage) ? ", " + plural(Number(c.usage), "send") + " so far" : "") + "." }));
  });
  return rows;
}

/** Instantly's sending mailboxes (jarvis-outreach accountRows) with Jarvis's pause reason when it paused one. */
function instantlyRows(accounts, pauses) {
  const paused = new Map((pauses || []).map((p) => [lower(p.email), p]));
  return (accounts || []).filter((a) => a.email).map((a) => {
    const email = lower(a.email);
    const p = paused.get(email);
    const score = a.score === undefined ? null : a.score;
    const warm = "warm-up " + a.warmup + (score === null ? "" : ", score " + score);
    const base = { address: email, system: "Instantly", kind: "sending mailbox", status: a.status, warmup: a.warmup, score };
    if (a.status === "error") return row(Object.assign(base, { state: "error", problem: "reconnect", detail: clip(a.error || "Instantly cannot reach the mailbox.", 200), fix: { by: "carlos", action: "Reconnect", link: LINKS.instantly } }));
    const heal = a.warmup === "off" ? { by: "jarvis", action: "enable-warmup" } : null;
    if (a.status === "paused") return row(Object.assign(base, { state: "paused", problem: heal ? "warmup" : "", detail: (p ? "Paused by Jarvis: " + clip(p.reason, 140) : "Paused in Instantly") + "; " + warm + ".", fix: heal }));
    if (a.status !== "active") return row(Object.assign(base, { state: "warn", detail: "Instantly says " + a.status + "; " + warm + ".", fix: { by: "carlos", action: "Check it", link: LINKS.instantly } }));
    return row(Object.assign(base, { state: heal ? "warn" : "ok", problem: heal ? "warmup" : "", detail: warm + ".", fix: heal }));
  });
}

/** Microsoft 365 users from Graph: each mailbox (sign-in blocked or no licence is an error) and its smtp aliases. */
function graphRows(users) {
  const rows = [];
  (users || []).forEach((u) => {
    const proxies = u.proxyAddresses || [];
    const primary = lower(u.mail || (proxies.find((p) => p.slice(0, 5) === "SMTP:") || "").slice(5));
    if (!primary) return;
    const off = u.accountEnabled === false;
    const bare = !(u.assignedLicenses || []).length;
    const fix = off || bare ? { by: "carlos", action: off ? "Allow sign-in" : "Assign a licence", link: LINKS.m365 } : null;
    rows.push(row({
      address: primary, system: "Microsoft 365", kind: "mailbox", state: fix ? "error" : "ok", problem: off ? "disabled" : bare ? "unlicensed" : "", fix,
      detail: (u.displayName ? u.displayName + ": " : "") + (off ? "sign-in is blocked." : bare ? "no licence, so no mailbox." : "licensed, sign-in allowed.")
    }));
    proxies.filter((p) => p.slice(0, 5) === "smtp:").map((p) => lower(p.slice(5))).filter((a) => a && a !== primary).forEach((alias) => rows.push(row({
      address: alias, system: "Microsoft 365", kind: "mailbox alias", aliasOf: primary, state: fix ? "error" : "ok",
      detail: "Delivers to " + primary + (fix ? ", which " + (off ? "is blocked." : "has no licence.") : ".")
    })));
  });
  return rows;
}

/** Without Graph: the outreach domain's addresses Instantly sends from, listed as Microsoft 365 mailboxes not checked. */
function uncheckedRows(sending, domain) {
  const seen = new Set();
  return (sending || []).filter((r) => r.domain === domain && !seen.has(r.address) && seen.add(r.address)).map((r) => row({
    address: r.address, system: "Microsoft 365", kind: "mailbox", state: "warn", problem: "unchecked",
    detail: "Known from Instantly; Jarvis reads Microsoft 365 once the Graph app is connected.", fix: { by: "carlos", action: "Connect Graph", link: LINKS.graph }
  }));
}

/** SendGrid's sender; on the forwarding domain it needs an alias, else replies bounce. aliasRows null: ImprovMX did not answer. */
function senderRows(from, aliasRows, domain) {
  const address = lower(from);
  if (!address.includes("@")) return [];
  const d = domain || FORWARD_DOMAIN;
  const mine = domainOf(address) === d;
  const forwarded = !mine || !aliasRows || aliasRows.some((r) => r.kind === "alias" && r.address === address && r.problem !== "missing");
  return [row({
    address, system: "SendGrid", kind: "sender", state: forwarded ? "ok" : "warn", problem: forwarded ? "" : "no-reply-alias",
    detail: "Site and review mail goes out from this address" + (!mine ? "." : !aliasRows ? "; ImprovMX did not answer, so its alias is not checked." : forwarded ? "; replies reach its ImprovMX alias." : ", but ImprovMX has no alias for it, so replies bounce."),
    fix: forwarded ? null : { by: "carlos", action: "Add the alias", link: LINKS.improvmx }
  })];
}

const ISSUE_TEXT = {
  reconnect: (r) => "Reconnect " + r.address + " in Instantly: " + clip(r.detail, 140),
  warmup: (r) => "Warm-up is off on " + r.address + " in Instantly; Jarvis turns it on.",
  missing: (r) => r.address + " is missing from ImprovMX; " + (r.fix && r.fix.by === "jarvis" ? "Jarvis restores it." : "add it in ImprovMX."),
  bounce: (r) => "Mail to " + r.address + ": " + r.detail,
  disabled: (r) => r.address + " cannot sign in to Microsoft 365 (blocked).",
  unlicensed: (r) => r.address + " has no Microsoft 365 licence, so it has no mailbox.",
  "no-reply-alias": (r) => "SendGrid sends as " + r.address + ", but ImprovMX has no alias for it: replies bounce."
};

/** What is wrong, one line per problem with who fixes it. Unchecked Microsoft 365 rows are the Graph need, not issues. */
function issuesOf(rows, domains) {
  const out = (rows || []).filter((r) => r.problem && ISSUE_TEXT[r.problem]).map((r) => ({
    key: SHORT[r.system] + ":" + r.problem + ":" + r.address, level: r.state === "error" ? "alert" : "warn", by: r.fix ? r.fix.by : "carlos",
    action: r.fix ? r.fix.action : "", link: (r.fix && r.fix.link) || "", address: r.address, system: r.system, problem: r.problem,
    text: ISSUE_TEXT[r.problem](r), push: r.problem !== "bounce"
  }));
  (domains || []).forEach((d) => (d.checks || []).filter((c) => !c.ok).forEach((c) => out.push({
    key: "dns:" + d.domain + ":" + c.name, level: "warn", by: "carlos", action: "Fix the record", link: "", address: d.domain, system: "DNS", problem: "dns", check: c.name,
    text: d.domain + " " + c.name + ": " + c.detail, push: true
  })));
  return out;
}

function sortRows(rows) {
  const sys = (s) => (SYSTEMS.indexOf(s) + 1) || 9;
  return rows.slice().sort((a, b) => a.domain.localeCompare(b.domain) || sys(a.system) - sys(b.system) || a.address.localeCompare(b.address));
}

function countRows(rows) {
  const out = { addresses: new Set(rows.map((r) => r.address)).size, ok: 0, warn: 0, error: 0, paused: 0 };
  rows.forEach((r) => { out[r.state] = (out[r.state] || 0) + 1; });
  return out;
}

async function improvmx(ctx, path, init) {
  const res = await ctx.fetch(IMPROVMX + path, Object.assign({ signal: AbortSignal.timeout(10000) }, init || {}, {
    headers: Object.assign({ Authorization: "Basic " + Buffer.from("api:" + ctx.env.IMPROVMX_API_KEY).toString("base64") }, init && init.body ? { "Content-Type": "application/json" } : {})
  }));
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("ImprovMX refused the API key (IMPROVMX_API_KEY).");
  if (!res.ok || data.success === false) throw new Error("ImprovMX " + res.status + ": " + clean(typeof data.error === "string" ? data.error : JSON.stringify(data.errors || "")));
  return data;
}

async function improvmxRead(ctx) {
  const [aliases, creds, box] = await Promise.all([
    improvmx(ctx, "domains/" + FORWARD_DOMAIN + "/aliases?limit=100"),
    improvmx(ctx, "domains/" + FORWARD_DOMAIN + "/credentials").catch(() => ({ credentials: [] })),
    mailHealth.mailbox(Object.assign({}, ctx, { days: 1 })).catch(() => null)
  ]);
  return { aliases: aliases.aliases || [], credentials: creds.credentials || [], box: box && box.ok ? box : null };
}

async function instantlyRead(ctx) {
  const [accounts, pauses] = await Promise.all([
    jarvisOutreach.instantlyGet(ctx, "accounts?limit=50"),
    ctx.db ? ctx.db.collection("jarvis_outreach_pauses").get().then((s) => s.docs.map((d) => d.data())).catch(() => []) : []
  ]);
  return { accounts: jarvisOutreach.accountRows(accounts.items), pauses };
}

const graphSet = (env) => !!(env.MS_GRAPH_TENANT_ID && env.MS_GRAPH_CLIENT_ID && env.MS_GRAPH_CLIENT_SECRET);

async function graphUsers(ctx) {
  const env = ctx.env;
  const tok = await ctx.fetch("https://login.microsoftonline.com/" + encodeURIComponent(env.MS_GRAPH_TENANT_ID) + "/oauth2/v2.0/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: env.MS_GRAPH_CLIENT_ID, client_secret: env.MS_GRAPH_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString()
  });
  const t = await tok.json().catch(() => ({}));
  if (!tok.ok || !t.access_token) throw new Error("Microsoft refused the Graph app (" + tok.status + "): " + clip(t.error_description || t.error || "", 140));
  const res = await ctx.fetch(GRAPH + "users?$select=displayName,userPrincipalName,mail,proxyAddresses,accountEnabled,assignedLicenses&$top=100", { headers: { Authorization: "Bearer " + t.access_token }, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Graph users " + res.status + ": " + clip((data.error && data.error.message) || "", 140));
  return data.value || [];
}

/** The Jarvis source: ctx = {fetch, env, db, now}. */
async function source(ctx) {
  const env = ctx.env || {};
  const needs = [];
  const errors = [];
  const part = async (name, run) => { try { return await run(); } catch (error) { errors.push(name + ": " + clean(error)); return null; } };
  if (!env.IMPROVMX_API_KEY) needs.push("ImprovMX: put the API key in Secret Manager as IMPROVMX_API_KEY.");
  if (!env.INSTANTLY_API_KEY) needs.push("Instantly: put the API key (Settings > Integrations > API keys) in Secret Manager as INSTANTLY_API_KEY.");
  if (!graphSet(env)) needs.push(GRAPH_NEED);
  const plan = ctx.db ? await ctx.db.collection("jarvis_settings").doc("outreach").get().then((s) => (s.exists ? s.data() : null)).catch(() => null) : null;
  const outreachDomain = (plan && plan.mailDomain) || OUTREACH_DOMAIN;
  const [mx, sending, users, domains] = await Promise.all([
    env.IMPROVMX_API_KEY ? part("ImprovMX", () => improvmxRead(ctx)) : null,
    env.INSTANTLY_API_KEY ? part("Instantly", () => instantlyRead(ctx)) : null,
    graphSet(env) ? part("Microsoft 365", () => graphUsers(ctx)) : null,
    part("DNS", () => Promise.all([
      jarvisOutreach.mailHealth(ctx, FORWARD_DOMAIN, FORWARD_DKIM).then((d) => Object.assign(d, { systems: ["ImprovMX", "SendGrid"], site: true })),
      jarvisOutreach.mailHealth(ctx, outreachDomain).then((d) => Object.assign(d, { systems: ["Microsoft 365", "Instantly"], site: false }))
    ]))
  ]);
  const aliasRows = mx ? improvmxRows(mx.aliases, mx.credentials, mx.box, FORWARD_DOMAIN) : null;
  const sendRows = sending ? instantlyRows(sending.accounts, sending.pauses) : [];
  const m365 = users ? graphRows(users) : uncheckedRows(sendRows, outreachDomain);
  const rows = sortRows((aliasRows || []).concat(m365, sendRows, senderRows(env.SENDGRID_FROM, aliasRows, FORWARD_DOMAIN)));
  if (!rows.length && errors.length) return { ok: false, error: errors.join("; "), needs };
  return { ok: true, domains: domains || [], rows, issues: issuesOf(rows, domains || []), needs, errors, counts: countRows(rows), graph: !!users };
}

/** Turns Instantly warm-up on (accounts:update scope). */
async function enableWarmup(ctx, emails) {
  const res = await ctx.fetch(INSTANTLY + "accounts/warmup/enable", {
    method: "POST", headers: { Authorization: "Bearer " + ctx.env.INSTANTLY_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ emails }), signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Instantly " + res.status + ": " + clip(data.message || data.error || "", 120));
  return { detail: "Warm-up turned on for " + emails.join(", ") + "." };
}

/** Adds a required alias back, its forward rebuilt from the live alias list. */
async function restoreAlias(ctx, alias) {
  const list = await improvmx(ctx, "domains/" + FORWARD_DOMAIN + "/aliases?limit=100");
  if ((list.aliases || []).some((a) => lower(a.alias) === alias)) return { detail: alias + "@" + FORWARD_DOMAIN + " is already there." };
  const plan = restorePlan(list.aliases, alias);
  if (!plan) throw new Error("No alias to copy the forward from, so Jarvis cannot rebuild " + alias + "@" + FORWARD_DOMAIN + ".");
  await improvmx(ctx, "domains/" + FORWARD_DOMAIN + "/aliases", { method: "POST", body: JSON.stringify(plan) });
  return { detail: "Restored " + alias + "@" + FORWARD_DOMAIN + " → " + forwardsOf(plan.forward).join(", ") + "." };
}

/** The open problems after this pass, { key: { since, pushedAt } }, from the saved list. One that cleared drops out,
    so it pushes again if it comes back. */
function openProblems(issues, saved, now) {
  const prev = new Map((saved || []).map((p) => [p.key, p]));
  return (issues || []).reduce((m, i) => {
    const p = prev.get(i.key);
    m[i.key] = { since: (p && p.since) || new Date(now).toISOString(), pushedAt: (p && p.pushedAt) || "" };
    return m;
  }, {});
}

const openList = (open) => Object.keys(open).sort().map((key) => Object.assign({ key }, open[key]));

/** Carlos's problems not pushed in this occurrence. */
function toPush(issues, open) {
  return (issues || []).filter((i) => i.by === "carlos" && i.push !== false && open[i.key] && !open[i.key].pushedAt);
}

/** A Jarvis fix that failed becomes Carlos's, with the error. */
function failedFix(issue, error) {
  const what = issue.action === "enable-warmup" ? "turn warm-up on for " : "restore ";
  return Object.assign({}, issue, { by: "carlos", text: "Jarvis could not " + what + issue.address + ": " + clip(error, 140), link: issue.system === "Instantly" ? LINKS.instantly : LINKS.improvmx, action: "Open" });
}

/** One push per problem up to PUSH_ONE_BY_ONE, else one for all. */
function pushMessages(list) {
  if (!list.length) return [];
  if (list.length > PUSH_ONE_BY_ONE) {
    return [{ kind: "alerts", title: "Email: " + list.length + " problems to fix", body: clip(list[0].text, 180) + " (+" + (list.length - 1) + " more)", lines: list.slice(0, 6).map((i) => clip(i.text, 120)), tab: "systems", tag: "jarvis-addresses" }];
  }
  return list.map((i) => Object.assign({
    kind: "alerts", title: "Email: " + (i.system === "DNS" ? i.address + " " + i.check : i.address), body: clip(i.text, 180), lines: [clip(i.text, 120)], tab: "systems", tag: "jarvis-address-" + i.key.slice(0, 80)
  }, i.link ? { url: i.link, actions: [{ act: "open", label: i.action || "Open", url: i.link }] } : {}));
}

module.exports = {
  FORWARD_DOMAIN, OUTREACH_DOMAIN, FORWARD_DKIM, REQUIRED, LINKS, GRAPH_NEED,
  source, forwardsOf, inboxOf, restorePlan, improvmxRows, instantlyRows, graphRows, uncheckedRows, senderRows, issuesOf, sortRows, countRows,
  enableWarmup, restoreAlias, openProblems, openList, toPush, failedFix, pushMessages
};
